const { Markup } = require('telegraf');
const db = require('../database');

async function showBanMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) return ctx.answerCbQuery("Xatolik.");

    const bannedList = await db.getBannedUsers(botId);

    let msg = `🔒 **@${bot.bot_username} Bloklangan Foydalanuvchilar (Blacklist)**\n\n` +
        `Bloklangan foydalanuvchilar sub-botdan foydalana olmaydilar.\n\n` +
        `Jami bloklanganlar: **${bannedList.length}** ta\n\n`;

    if (bannedList.length === 0) {
        msg += `Hozircha hech kim bloklanmagan.`;
    } else {
        bannedList.slice(0, 10).forEach((bu, index) => {
            msg += `${index + 1}. User ID: \`${bu.user_id}\` | Sana: ${bu.banned_at.substring(0, 10)}\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('🚫 Foydalanuvchini Bloklash (Ban)', `ban_user_start_${botId}`)],
    ];

    if (bannedList.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🔓 Blokdan Chiqarish (Unban)', `unban_user_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

async function startBanUser(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'BAN_USER_ID', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `🚫 **Bloklamoqchi bo'lgan foydalanuvchining Telegram ID numarasini yuboring:**\n\n` +
        `Misol: \`123456789\``,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

async function processBanUserId(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'BAN_USER_ID') return;

    const { bot_id } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showBanMenu(ctx, bot_id);
    }

    const targetUserId = parseInt(text);
    if (!targetUserId || isNaN(targetUserId)) {
        return ctx.reply("⚠️ Iltimos, faqat raqamlardan iborat Telegram User ID yuboring!");
    }

    await db.banUser(bot_id, targetUserId, 'Banned by owner');
    await db.clearUserState(userId);

    await ctx.reply(`🚫 **User ID ${targetUserId}** botdan muvaffaqiyatli bloklandi!`, { parse_mode: 'Markdown' });
    await showBanMenu(ctx, bot_id);
}

async function startUnbanUser(ctx, botId) {
    const bannedList = await db.getBannedUsers(botId);
    if (bannedList.length === 0) return ctx.answerCbQuery("Bloklanganlar yo'q.");

    const inlineRows = bannedList.slice(0, 15).map(bu => [
        Markup.button.callback(`🔓 ID: ${bu.user_id}`, `confirm_unban_${botId}_${bu.user_id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_ban_${botId}`)]);

    await ctx.editMessageText("🔓 **Blokdan chiqarmoqchi bo'lgan foydalanuvchini tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

async function processUnbanUser(ctx, botId, targetUserId) {
    await db.unbanUser(botId, targetUserId);
    await ctx.answerCbQuery("🔓 Foydalanuvchi blokdan chiqarildi.");
    await showBanMenu(ctx, botId);
}

module.exports = {
    showBanMenu,
    startBanUser,
    processBanUserId,
    startUnbanUser,
    processUnbanUser
};
