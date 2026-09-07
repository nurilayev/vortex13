const { Markup } = require('telegraf');
const db = require('../database');
const subbotRunner = require('../subbot_engine/runner');
const { showBotPanel } = require('./botManager');

/**
 * Rassilka (Broadcast) wizardini boshlaydi.
 */
async function startBroadcast(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const userCount = await db.getSubbotUserCount(botId);

    if (userCount === 0) {
        return ctx.answerCbQuery("Hali sub-botingizda a'zolar yo'q. Obunachilar paydo bo'lgach rassilka yuborishingiz mumkin.");
    }

    await db.setUserState(userId, 'WAITING_BROADCAST_MSG', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `📢 **@${bot.bot_username} Obunachilariga Xabar Yuborish (Rassilka)**\n\n` +
        `Jami qabul qiluvchilar: **${userCount}** ta a'zo.\n\n` +
        `Yubormoqchi bo'lgan xabaringizni (Matn, Rasm, Video, Fayl yoki Audio) yuboring:`,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

/**
 * Xabarni qabul qilib barcha obunachilarga tarqatadi.
 */
async function processBroadcast(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'WAITING_BROADCAST_MSG') return;

    const { bot_id } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showBotPanel(ctx, bot_id);
    }

    const botInstance = subbotRunner.getBotInstance(bot_id);
    if (!botInstance) {
        await db.clearUserState(userId);
        return ctx.reply("❌ Sub-bot hozirda faol emas. Oldin botni yoqing!");
    }

    const subscribers = await db.getSubbotUsers(bot_id);
    await db.clearUserState(userId);

    await ctx.reply(`🚀 **Rassilka boshlandi...** (${subscribers.length} ta a'zoga yuborilmoqda)`, { parse_mode: 'Markdown' });

    let successCount = 0;
    let failCount = 0;

    for (const sub of subscribers) {
        try {
            await ctx.telegram.copyMessage(sub.user_id, ctx.chat.id, ctx.message.message_id);
            successCount++;
        } catch (err) {
            failCount++;
        }
        // Telegram API limitini buzmaslik uchun qisqa pauza (50ms)
        await new Promise(res => setTimeout(res, 50));
    }

    const reportMsg = `📊 **Rassilka Yakunlandi!**\n\n` +
        `✅ Muvaffaqiyatli yetkazildi: **${successCount}** ta\n` +
        `❌ Etib bormadi (Botni bloklagan): **${failCount}** ta`;

    await ctx.reply(reportMsg, { parse_mode: 'Markdown' });
    await showBotPanel(ctx, bot_id);
}

module.exports = {
    startBroadcast,
    processBroadcast
};
