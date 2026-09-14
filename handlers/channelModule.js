const { Markup } = require('telegraf');
const db = require('../database');

async function showChannelMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const channels = await db.getBotChannels(botId);

    let msg = `📢 **@${bot.bot_username} Majburiy Obuna Kanallari**\n\n` +
        `Sub-bot foydalanuvchilari botdan foydalanishidan oldin ushbu kanallarga obuna bo'lishi shart qilinadi.\n` +
        `*(Eslatma: Bot ushbu kanallarda administrator bo'lishi lozim!)*\n\n` +
        `Jami kanallar: **${channels.length}** ta\n\n`;

    if (channels.length === 0) {
        msg += `Hali majburiy obuna kanallari qo'shilmagan.`;
    } else {
        channels.forEach((c, index) => {
            msg += `${index + 1}. **${c.channel_title || c.channel_username}** (${c.channel_username})\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Kanal Qo\'shish', `add_chan_start_${botId}`)],
    ];

    if (channels.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Kanalni O\'chirish', `del_chan_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

async function startAddChannel(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_CHAN_USERNAME', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `📢 **Kanal Username'ini yuboring:**\n\n` +
        `Misol: \`@mychannel\` yoki \`mychannel\`\n\n` +
        `⚠️ **Muhim:** Bot ushbu kanalda administrator bo'lishi shart!`,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

async function processChannelUsername(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_CHAN_USERNAME') return;

    const { bot_id } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showChannelMenu(ctx, bot_id);
    }

    let username = text;
    if (!username.startsWith('@')) username = '@' + username;

    const res = await db.addChannel(bot_id, username);
    await db.clearUserState(userId);

    if (!res) {
        await ctx.reply(`⚠️ **${username}** kanali allaqachon ro'yxatda bor!`);
    } else {
        await ctx.reply(`✅ **${username}** majburiy obuna kanallariga muvaffaqiyatli qo'shildi!`);
    }

    await showChannelMenu(ctx, bot_id);
}

async function startDeleteChannel(ctx, botId) {
    const channels = await db.getBotChannels(botId);
    if (channels.length === 0) return ctx.answerCbQuery("Kanal yo'q.");

    const inlineRows = channels.map(c => [
        Markup.button.callback(`🗑 ${c.channel_username}`, `confirm_del_chan_${c.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_channels_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan kanalni tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

async function processDeleteChannel(ctx, channelId) {
    const dbData = require('../database');
    const channel = await dbData.getChannelById(channelId);
    if (!channel) {
        return ctx.answerCbQuery('Kanal topilmadi.', { show_alert: true });
    }

    await dbData.deleteChannel(channelId);
    await ctx.answerCbQuery("🗑 Kanal o'chirildi.");
    return showChannelMenu(ctx, channel.bot_id);
}

module.exports = {
    showChannelMenu,
    startAddChannel,
    processChannelUsername,
    startDeleteChannel,
    processDeleteChannel
};
