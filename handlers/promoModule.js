const { Markup } = require('telegraf');
const db = require('../database');

async function showPromoMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) return ctx.answerCbQuery("Xatolik.");

    const promos = await db.getBotPromocodes(botId);

    let msg = `🎁 **@${bot.bot_username} Promokodlar Moduli**\n\n` +
        `Promokod yaratib, unga sovg'a yoki maxsus kontent biriktirishingiz mumkin.\n\n` +
        `Jami promokodlar: **${promos.length}** ta\n\n`;

    if (promos.length === 0) {
        msg += `Hali promokodlar yaratilmagan.`;
    } else {
        promos.forEach((p, index) => {
            msg += `${index + 1}. Kod: \`${p.code}\` | Ishlatildi: **${p.current_uses}/${p.max_uses}**\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Promokod Yaratish', `add_promo_start_${botId}`)],
    ];

    if (promos.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Promokodni O\'chirish', `del_promo_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

async function startAddPromo(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_PROMO_CODE', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `🎁 **Promokodni kiriting:**\n\n` +
        `Misol: \`BONUS2026\` yoki \`SKIDKA50\``,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

async function processPromoCode(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_PROMO_CODE') return;

    const { bot_id } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showPromoMenu(ctx, bot_id);
    }

    await db.setUserState(userId, 'ADD_PROMO_REWARD', {
        bot_id,
        code: text.toUpperCase()
    });

    await ctx.reply(
        `🎁 **"${text.toUpperCase()}" promokodi uchun SOVG'A / JAVOB matnini kiriting:**\n\n` +
        `(Rasm yoki Video bilan ham yuborishingiz mumkin)`,
        { parse_mode: 'Markdown' }
    );
}

async function processPromoReward(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_PROMO_REWARD') return;

    const { bot_id, code } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showPromoMenu(ctx, bot_id);
    }

    let rewardText = ctx.message.text || ctx.message.caption || '';
    let responseType = 'text';
    let fileId = null;

    if (ctx.message.photo) {
        responseType = 'photo';
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
        responseType = 'video';
        fileId = ctx.message.video.file_id;
    }

    await db.addPromocode(bot_id, code, rewardText, responseType, fileId, 100);
    await db.clearUserState(userId);

    await ctx.reply(`✅ **\`${code}\`** promokodi muvaffaqiyatli saqlandi!`, { parse_mode: 'Markdown' });
    await showPromoMenu(ctx, bot_id);
}

async function startDeletePromo(ctx, botId) {
    const promos = await db.getBotPromocodes(botId);
    if (promos.length === 0) return ctx.answerCbQuery("Promokod yo'q.");

    const inlineRows = promos.map(p => [
        Markup.button.callback(`🗑 Kod: ${p.code}`, `confirm_del_promo_${p.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_promocodes_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan promokodni tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

module.exports = {
    showPromoMenu,
    startAddPromo,
    processPromoCode,
    processPromoReward,
    startDeletePromo
};
