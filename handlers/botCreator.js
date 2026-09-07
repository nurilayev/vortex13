const { Telegraf, Markup } = require('telegraf');
const db = require('../database');
const config = require('../config');
const subbotRunner = require('../subbot_engine/runner');
const { getMainKeyboard } = require('./start');

function cleanText(str) {
    if (!str) return '';
    return String(str).replace(/[*_`[\]()]/g, '');
}

/**
 * Yangi bot yaratish bosqichini boshlaydi.
 */
async function startBotCreation(ctx) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'WAITING_BOT_TOKEN');

    const msg = `🔑 **BotFather'dan olingan API Tokenni yuboring.**\n\n` +
        `Misol: \`123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ\`\n\n` +
        `Tokenni olishni bilmasangiz "ℹ️ Yordam / Qo'llanma" knopkasini bosing.`;

    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
    });
}

/**
 * Yuborilgan tokenni tekshiradi va saqlaydi.
 */
async function processBotToken(ctx) {
    const userId = ctx.from.id;
    const token = ctx.message.text ? ctx.message.text.trim() : '';

    if (token === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return ctx.reply("❌ Amal bekor qilindi.", getMainKeyboard());
    }

    // Token formatini tekshirish
    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
        return ctx.reply("⚠️ Xato API Token kiritildi! Token formatini tekshirib, qayta yuboring.\nMisol: `123456789:ABCdef...`", { parse_mode: 'Markdown' });
    }

    // Token allaqachon mavjudligini tekshirish
    const existing = await db.getBotByToken(token);
    if (existing) {
        return ctx.reply("⚠️ Ushbu bot allaqachon konstruktorda ro'yxatdan o'tkazilgan!");
    }

    await ctx.reply("⏳ Bot Token Telegram serverlarida tekshirilmoqda...");

    try {
        const testBot = new Telegraf(token, {
            telegram: { agent: config.httpsAgent }
        });
        const me = await testBot.telegram.getMe();

        // Vaqtinchalik token va bot ma'lumotlarini state'ga saqlash
        await db.setUserState(userId, 'SELECT_BOT_TYPE', {
            bot_token: token,
            bot_username: me.username,
            bot_name: me.first_name
        });

        const safeName = cleanText(me.first_name);
        const safeUser = cleanText(me.username);

        const successMsg = `✅ **Bot Muvaffaqiyatli Topildi!**\n\n` +
            `🤖 **Bot Nomi:** ${safeName}\n` +
            `👤 **Username:** @${safeUser}\n\n` +
            `Botingiz qaysi yo'nalishda bo'lishini tanlang:`;

        const typeKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔘 Universal (Tugmali bot)', 'set_type_custom')],
            [Markup.button.callback('🎬 Kino Bot (Kod bo\'yicha kino)', 'set_type_cinema')],
            [Markup.button.callback('🎵 Musika Bot (Qo\'shiqlar bazasi)', 'set_type_music')]
        ]);

        await ctx.reply(successMsg, { parse_mode: 'Markdown', ...typeKeyboard });

    } catch (err) {
        console.error("Token verification error:", err.message);
        await ctx.reply("❌ Token yaroqsiz yoki Telegram API bilan bog'lanishda xatolik yuz berdi. BotFather'dan yangi token olib qayta urinib ko'ring.");
    }
}

/**
 * Bot turini tanlash tugmasi bosilganda
 */
async function handleBotTypeSelection(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'SELECT_BOT_TYPE') {
        return ctx.answerCbQuery("Sessiya muddati tugagan. Qaytadan urinib ko'ring.");
    }

    const callbackData = ctx.callbackQuery.data;
    let botType = 'custom';
    if (callbackData === 'set_type_cinema') botType = 'cinema';
    if (callbackData === 'set_type_music') botType = 'music';

    const { bot_token, bot_username, bot_name } = userState.data;

    try {
        const botId = await db.createBot(userId, bot_token, bot_username, bot_name, botType);
        await db.clearUserState(userId);

        const botData = await db.getBotById(botId);
        
        // Sub-botni darhol ishga tushiramiz
        await subbotRunner.startBot(botData);

        const safeUser = cleanText(bot_username);

        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `🎉 **Tebriklaymiz! Botingiz muvaffaqiyatli yaratildi va ishga tushirildi!**\n\n` +
            `🤖 **Bot:** @${safeUser}\n` +
            `📋 **Turi:** ${botType === 'cinema' ? '🎬 Kino Bot' : botType === 'music' ? '🎵 Musika Bot' : '🔘 Universal Bot'}\n\n` +
            `Endi botingizni sozlash uchun **"📂 Mening botlarim"** menyusiga o'ting!`,
            { parse_mode: 'Markdown' }
        );

        await ctx.reply("Asosiy menyu:", getMainKeyboard());

    } catch (err) {
        console.error("Bot create error:", err);
        await ctx.reply("❌ Botni ma'lumotlar bazasiga saqlashda xatolik yuz berdi.");
    }
}

module.exports = {
    startBotCreation,
    processBotToken,
    handleBotTypeSelection
};
