const { Markup } = require('telegraf');
const db = require('../database');
const subbotRunner = require('../subbot_engine/runner');

async function showWelcomeMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) return ctx.answerCbQuery("Xatolik.");

    const currentMsg = bot.welcome_text || "👋 Assalomu alaykum! Botga xush kelibsiz!";
    const hasMedia = bot.welcome_media_id ? `\n🖼 Media biriktirilgan (${bot.welcome_media_type})` : '';

    const text = `🎨 **@${bot.bot_username} Xush Kelibsiz Xabarini Sozlash**\n\n` +
        `Sub-botingizga yangi kirgan foydalanuvchiga \`/start\` tugmasini bosganda ushbu xabar ko'rsatiladi.\n\n` +
        `📝 **Joriy Xush Kelibsiz Matni:**\n${currentMsg}${hasMedia}\n\n` +
        `O'zgartirish uchun pastdagi tugmani bosing:`;

    const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✍️ Xabarni Tahrirlash', `edit_welcome_start_${botId}`)],
        [Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]
    ]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...inlineKeyboard });
    } else {
        await ctx.reply(text, { parse_mode: 'Markdown', ...inlineKeyboard });
    }
}

async function startEditWelcome(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'EDIT_WELCOME_MSG', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `✍️ **Yangi Xush Kelibsiz Xabari va Mediasini yuboring:**\n\n` +
        `Faqat matn yuborishingiz yoki Rasm/Video ostida xabar matnini yozib yuborishingiz mumkin.`,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

async function processWelcomeMsg(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'EDIT_WELCOME_MSG') return;

    const { bot_id } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showWelcomeMenu(ctx, bot_id);
    }

    let welcomeText = ctx.message.text || ctx.message.caption || '';
    let mediaId = null;
    let mediaType = null;

    if (ctx.message.photo) {
        mediaType = 'photo';
        mediaId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
        mediaType = 'video';
        mediaId = ctx.message.video.file_id;
    }

    await db.updateWelcomeMsg(bot_id, welcomeText, mediaId, mediaType);
    await db.clearUserState(userId);

    // Dynamic restart
    const botData = await db.getBotById(bot_id);
    await subbotRunner.restartBot(botData);

    await ctx.reply(`✅ **Xush Kelibsiz Xabari Muvaffaqiyatli Yangilandi!**`, { parse_mode: 'Markdown' });
    await showWelcomeMenu(ctx, bot_id);
}

module.exports = {
    showWelcomeMenu,
    startEditWelcome,
    processWelcomeMsg
};
