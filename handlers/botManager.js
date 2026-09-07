const { Markup } = require('telegraf');
const db = require('../database');
const subbotRunner = require('../subbot_engine/runner');
const { getMainKeyboard } = require('./start');

function escapeMd(str) {
    if (!str) return '';
    return String(str).replace(/[_*`[\]()]/g, '\\$&');
}

/**
 * Foydalanuvchining botlar ro'yxatini ko'rsatadi.
 */
async function showMyBots(ctx) {
    const userId = ctx.from.id;
    await db.clearUserState(userId);

    const bots = await db.getUserBots(userId);

    if (bots.length === 0) {
        return ctx.reply(
            "📂 Sizda hali hech qanday bot yaratilmagan.\n\nYangi bot yaratish uchun **\"🤖 Yangi Bot Yaratish\"** tugmasini bosing.",
            { parse_mode: 'Markdown', ...getMainKeyboard() }
        );
    }

    const inlineButtons = bots.map(b => {
        const statusEmoji = b.is_active ? '🟢' : '🔴';
        const typeEmoji = b.bot_type === 'cinema' ? '🎬' : b.bot_type === 'music' ? '🎵' : '🔘';
        return [Markup.button.callback(`${statusEmoji} ${typeEmoji} @${b.bot_username}`, `manage_bot_${b.id}`)];
    });

    const msgText = `📂 **Sizning Botlaringiz Ro'yxati (${bots.length} ta):**\n\nBoshqarish uchun botni tanlang:`;

    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(msgText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineButtons) });
        } else {
            await ctx.reply(msgText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineButtons) });
        }
    } catch (err) {
        console.error("showMyBots send error:", err.message);
        // Fallback without parse_mode if Markdown fails
        if (ctx.callbackQuery) {
            await ctx.editMessageText(`📂 Sizning Botlaringiz Ro'yxati (${bots.length} ta):\n\nBoshqarish uchun botni tanlang:`, Markup.inlineKeyboard(inlineButtons));
        } else {
            await ctx.reply(`📂 Sizning Botlaringiz Ro'yxati (${bots.length} ta):\n\nBoshqarish uchun botni tanlang:`, Markup.inlineKeyboard(inlineButtons));
        }
    }
}

/**
 * Tanlangan botni boshqarish panelini ko'rsatadi
 */
async function showBotPanel(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Bot topilmadi yoki bu bot sizga tegishli emas.");
    }

    const userCount = await db.getSubbotUserCount(botId);
    const statusText = bot.is_active ? '🟢 Faol (Ishlamoqda)' : '🔴 To\'xtatilgan';
    const typeName = bot.bot_type === 'cinema' ? '🎬 Kino Bot' : bot.bot_type === 'music' ? '🎵 Musika Bot' : '🔘 Universal Bot';

    const safeUser = escapeMd(bot.bot_username);
    const safeName = escapeMd(bot.bot_name);

    const panelText = `⚙️ **Bot Boshqaruv Paneli**\n\n` +
        `🤖 **Bot:** @${safeUser}\n` +
        `📝 **Nomi:** ${safeName}\n` +
        `📋 **Turi:** ${typeName}\n` +
        `⚡️ **Holati:** ${statusText}\n` +
        `👥 **A'zolari soni:** ${userCount} ta foydalanuvchi\n\n` +
        `Bajariladigan amalni tanlang:`;

    const panelButtons = [
        [Markup.button.callback('🔘 Tugmalarni boshqarish', `bot_buttons_${botId}`)],
        [Markup.button.callback('🎨 Xush Kelibsiz Xabari', `bot_welcome_${botId}`)],
        [
            Markup.button.callback('📢 Majburiy Obuna', `bot_channels_${botId}`),
            Markup.button.callback('💬 Kalit So\'zlar', `bot_keywords_${botId}`)
        ],
        [
            Markup.button.callback('🎁 Promokodlar', `bot_promocodes_${botId}`),
            Markup.button.callback('🔒 Ban Tizimi', `bot_ban_${botId}`)
        ],
        [
            Markup.button.callback('👥 Referallar Top', `bot_ref_top_${botId}`),
            Markup.button.callback('📥 A\'zolarni Eksport (.txt)', `bot_export_${botId}`)
        ]
    ];

    if (bot.bot_type === 'cinema' || bot.bot_type === 'custom') {
        panelButtons.push([Markup.button.callback('🎬 Kino Moduli (Baza va Kodlar)', `bot_cinema_${botId}`)]);
    }
    if (bot.bot_type === 'music' || bot.bot_type === 'custom') {
        panelButtons.push([Markup.button.callback('🎵 Musika Moduli (Baza va Qo\'shiqlar)', `bot_music_${botId}`)]);
    }

    panelButtons.push(
        [Markup.button.callback('📢 Rassilka (Obunachilarga xabar)', `bot_broadcast_${botId}`)],
        [
            Markup.button.callback(bot.is_active ? '🔴 To\'xtatish' : '🟢 Yoqish', `bot_toggle_${botId}`),
            Markup.button.callback('🗑 Botni O\'chirish', `bot_delete_${botId}`)
        ],
        [Markup.button.callback('⬅️ Botlar ro\'yxatiga qaytish', 'my_bots_list')]
    );

    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(panelText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(panelButtons) });
        } else {
            await ctx.reply(panelText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(panelButtons) });
        }
    } catch (err) {
        console.error("showBotPanel send error:", err.message);
        // Fallback without parse_mode
        const fallbackText = `⚙️ Bot Boshqaruv Paneli\n\n` +
            `🤖 Bot: @${bot.bot_username}\n` +
            `📝 Nomi: ${bot.bot_name}\n` +
            `📋 Turi: ${typeName}\n` +
            `⚡️ Holati: ${statusText}\n` +
            `👥 A'zolari soni: ${userCount} ta foydalanuvchi\n\n` +
            `Bajariladigan amalni tanlang:`;
        if (ctx.callbackQuery) {
            await ctx.editMessageText(fallbackText, Markup.inlineKeyboard(panelButtons));
        } else {
            await ctx.reply(fallbackText, Markup.inlineKeyboard(panelButtons));
        }
    }
}

/**
 * Top Referrers (Eng ko'p taklif qilganlar)
 */
async function showTopReferrers(ctx, botId) {
    const topList = await db.getTopReferrers(botId, 10);
    let msg = `👥 **Botning Eng Faol Taklif Qiluvchilari (Top 10 Referallar):**\n\n`;

    if (topList.length === 0) {
        msg += `Hali hech kim referal havola orqali do'st taklif qilmagan.`;
    } else {
        topList.forEach((item, index) => {
            msg += `${index + 1}. User ID: \`${item.user_id}\` -> **${item.count}** ta do'st\n`;
        });
    }

    const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]
    ]);

    await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...inlineKeyboard });
}

/**
 * A'zolar ro'yxatini .txt fayl sifatida yuklab berish
 */
async function exportSubbotUsers(ctx, botId) {
    const bot = await db.getBotById(botId);
    const users = await db.getSubbotUsers(botId);

    if (users.length === 0) {
        return ctx.answerCbQuery("Eksport qilish uchun a'zolar mavjud emas.");
    }

    let fileContent = `=== @${bot.bot_username} BOT OBUNACHILARI RO'YXATI ===\n`;
    fileContent += `Eksport sanasi: ${new Date().toLocaleString()}\n`;
    fileContent += `Jami a'zolar soni: ${users.length} ta\n\n`;
    fileContent += `USER_ID\n`;
    fileContent += `-------------------------\n`;

    users.forEach(u => {
        fileContent += `${u.user_id}\n`;
    });

    const buffer = Buffer.from(fileContent, 'utf-8');

    await ctx.answerCbQuery("📥 Fayl tayyorlanmoqda...");
    await ctx.replyWithDocument({
        source: buffer,
        filename: `${bot.bot_username}_subscribers.txt`
    }, {
        caption: `📥 **@${escapeMd(bot.bot_username)}** botining jami **${users.length}** ta obunachisi ro'yxati fayl ko'rinishida taqdim etildi.`,
        parse_mode: 'Markdown'
    });
}

/**
 * Bot faollik holatini yoqish/o'chirish
 */
async function toggleBotStatus(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik yuz berdi.");
    }

    const newStatus = !bot.is_active;
    await db.updateBotStatus(botId, newStatus);

    if (newStatus) {
        const updatedBot = await db.getBotById(botId);
        await subbotRunner.startBot(updatedBot);
        await ctx.answerCbQuery("🟢 Bot ishga tushirildi!");
    } else {
        await subbotRunner.stopBot(botId);
        await ctx.answerCbQuery("🔴 Bot to'xtatildi.");
    }

    await showBotPanel(ctx, botId);
}

/**
 * Botni o'chirishni tasdiqlash
 */
async function confirmDeleteBot(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const safeUser = escapeMd(bot.bot_username);
    const confirmText = `⚠️ **Haqiqatdan ham @${safeUser} botini o'chirmoqchimisiz?**\n\n` +
        `Botga tegishli barcha tugmalar, kinolar, musikalar va ma'lumotlar butunlay o'chib ketadi!`;

    const confirmButtons = Markup.inlineKeyboard([
        [Markup.button.callback('🔥 Ha, Butunlay O\'chirish', `bot_delete_confirm_${botId}`)],
        [Markup.button.callback('⬅️ Bekor qilish', `manage_bot_${botId}`)]
    ]);

    await ctx.editMessageText(confirmText, { parse_mode: 'Markdown', ...confirmButtons });
}

/**
 * Botni butunlay o'chirish
 */
async function processDeleteBot(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    await subbotRunner.stopBot(botId);
    await db.deleteBot(botId, userId);

    await ctx.answerCbQuery("🗑 Bot o'chirildi.");
    await showMyBots(ctx);
}

module.exports = {
    showMyBots,
    showBotPanel,
    showTopReferrers,
    exportSubbotUsers,
    toggleBotStatus,
    confirmDeleteBot,
    processDeleteBot
};
