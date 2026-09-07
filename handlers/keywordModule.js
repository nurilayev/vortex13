const { Markup } = require('telegraf');
const db = require('../database');

async function showKeywordMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) return ctx.answerCbQuery("Xatolik.");

    const keywords = await db.getBotKeywords(botId);

    let msg = `💬 **@${bot.bot_username} Kalit So'zlar va Avto-Javoblar**\n\n` +
        `Foydalanuvchi botga ushbu kalit so'zni yuborganda avtomatik javob beriladi.\n\n` +
        `Jami kalit so'zlar: **${keywords.length}** ta\n\n`;

    if (keywords.length === 0) {
        msg += `Hali kalit so'zlar qo'shilmagan.`;
    } else {
        keywords.forEach((k, index) => {
            msg += `${index + 1}. **"${k.keyword}"** -> \`${k.response_text.substring(0, 30)}\`\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Kalit So\'z Qo\'shish', `add_kw_start_${botId}`)],
    ];

    if (keywords.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Kalit So\'zni O\'chirish', `del_kw_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

async function startAddKeyword(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_KW_TEXT', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `💬 **Kalit so'zni kiriting:**\n\n` +
        `Misol: \`salom\`, \`narxlar\`, \`admin\`, \`aloqa\``,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

async function processKeywordText(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_KW_TEXT') return;

    const { bot_id } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showKeywordMenu(ctx, bot_id);
    }

    await db.setUserState(userId, 'ADD_KW_RESPONSE', {
        bot_id,
        keyword: text
    });

    await ctx.reply(
        `✍️ **"${text}" kalit so'zi uchun JAVOBNI kiriting:**\n\n` +
        `(Matn yoki Rasm/Video bilan birga yuborishingiz mumkin)`,
        { parse_mode: 'Markdown' }
    );
}

async function processKeywordResponse(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_KW_RESPONSE') return;

    const { bot_id, keyword } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showKeywordMenu(ctx, bot_id);
    }

    let respText = ctx.message.text || ctx.message.caption || '';
    let respType = 'text';
    let fileId = null;

    if (ctx.message.photo) {
        respType = 'photo';
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
        respType = 'video';
        fileId = ctx.message.video.file_id;
    }

    await db.addKeyword(bot_id, keyword, respText, respType, fileId);
    await db.clearUserState(userId);

    await ctx.reply(`✅ **"${keyword}"** kalit so'zi va javobi saqlandi!`, { parse_mode: 'Markdown' });
    await showKeywordMenu(ctx, bot_id);
}

async function startDeleteKeyword(ctx, botId) {
    const keywords = await db.getBotKeywords(botId);
    if (keywords.length === 0) return ctx.answerCbQuery("Kalit so'z yo'q.");

    const inlineRows = keywords.map(k => [
        Markup.button.callback(`🗑 "${k.keyword}"`, `confirm_del_kw_${k.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_keywords_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan kalit so'zni tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

module.exports = {
    showKeywordMenu,
    startAddKeyword,
    processKeywordText,
    processKeywordResponse,
    startDeleteKeyword
};
