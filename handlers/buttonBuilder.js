const { Markup } = require('telegraf');
const db = require('../database');
const subbotRunner = require('../subbot_engine/runner');
const { showBotPanel } = require('./botManager');

/**
 * Bot tugmalarini ko'rsatadi va boshqarish menyusini chiqaradi.
 */
async function showButtonMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const buttons = await db.getBotButtons(botId, null);

    let msg = `🔘 **@${bot.bot_username} Botining Tugmalari Menyusi**\n\n` +
        `Jami yaratilgan asosiy tugmalar: **${buttons.length}** ta\n\n`;

    if (buttons.length === 0) {
        msg += `Hali hech qanday tugma yaratilmagan. Yangi tugma qo'shish uchun pastdagi tugmani bosing:`;
    } else {
        msg += `Mavjud tugmalar ro'yxati:\n`;
        buttons.forEach((b, index) => {
            const bType = b.button_type === 'reply' ? '⌨️ Reply' : '🔗 Inline';
            msg += `${index + 1}. [${bType}] **"${b.button_text}"** -> (${b.response_type})\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Tugma Qo\'shish', `add_btn_start_${botId}`)],
    ];

    if (buttons.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Tugmani O\'chirish', `del_btn_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

/**
 * Yangi tugma yaratish wizardini boshlaydi (Tugma turini tanlash)
 */
async function startAddButton(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_BTN_TYPE', { bot_id: botId });

    const msg = `🔘 **Tugma Turini Tanlang:**\n\n` +
        `1️⃣ **Reply Keyboard (Klaviatura)**: Pastdagi klaviaturada chiquvchi tugma.\n` +
        `2️⃣ **Inline Keyboard**: Xabar ostida chiquvchi tugma.`;

    const typeKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⌨️ Reply Keyboard (Klaviatura)', `btn_type_reply_${botId}`)],
        [Markup.button.callback('🔗 Inline Keyboard (Xabar ostida)', `btn_type_inline_${botId}`)],
        [Markup.button.callback('⬅️ Bekor qilish', `bot_buttons_${botId}`)]
    ]);

    await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...typeKeyboard });
}

/**
 * Tugma turini saqlab, nomini so'raydi
 */
async function processButtonType(ctx, botId, buttonType) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_BTN_TEXT', { bot_id: botId, button_type: buttonType });

    await ctx.answerCbQuery();
    await ctx.reply(
        `✍️ **Tugma matnini (sarlavhasini) kiriting:**\n\n` +
        `Misol: \`📞 Bog'lanish\` yoki \`ℹ️ Biz haqimizda\``,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

/**
 * Tugma matnini qabul qilib, javob kontent turini so'raydi
 */
async function processButtonText(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    if (text === '⬅️ Bekor qilish') {
        const userState = await db.getUserState(userId);
        const botId = userState?.data?.bot_id;
        await db.clearUserState(userId);
        return await showButtonMenu(ctx, botId);
    }

    const userState = await db.getUserState(userId);
    const { bot_id, button_type } = userState.data;

    await db.setUserState(userId, 'ADD_BTN_RESPONSE_TYPE', {
        bot_id,
        button_type,
        button_text: text
    });

    const msg = `📥 **"${text}" tugmasi bosilganda bot qanday javob qaytarsin?**\n\nJavob turini tanlang:`;

    const responseTypeKeyboard = [
        [Markup.button.callback('📝 Matnli xabar', `resp_type_text_${bot_id}`)],
        [Markup.button.callback('🖼 Rasm (Photo)', `resp_type_photo_${bot_id}`)],
        [Markup.button.callback('📹 Video', `resp_type_video_${bot_id}`)],
        [Markup.button.callback('🎧 Audio / Musika', `resp_type_audio_${bot_id}`)],
        [Markup.button.callback('📁 Fayl / Hujjat', `resp_type_document_${bot_id}`)]
    ];

    if (button_type === 'inline') {
        responseTypeKeyboard.push([Markup.button.callback('🔗 Web Havola (URL)', `resp_type_url_${bot_id}`)]);
    }

    responseTypeKeyboard.push([Markup.button.callback('⬅️ Bekor qilish', `bot_buttons_${bot_id}`)]);

    await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(responseTypeKeyboard) });
}

/**
 * Javob turini saqlash va kontent so'rash
 */
async function processResponseType(ctx, botId, responseType) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_BTN_RESPONSE_TYPE') {
        return ctx.answerCbQuery("Sessiya eskirgan.");
    }

    const { button_type, button_text } = userState.data;

    await db.setUserState(userId, 'ADD_BTN_CONTENT', {
        bot_id: botId,
        button_type,
        button_text,
        response_type: responseType
    });

    await ctx.answerCbQuery();

    let promptMsg = '';
    switch (responseType) {
        case 'text':
            promptMsg = `✍️ **Tugma bosilganda yuboriladigan MATNNI kiriting:**`;
            break;
        case 'photo':
            promptMsg = `🖼 **RASMNI yuboring** (Xohlasangiz rasm ostiga izoh/caption ham yozishingiz mumkin):`;
            break;
        case 'video':
            promptMsg = `📹 **VIDEONI yuboring** (Xohlasangiz izoh/caption ham yozishingiz mumkin):`;
            break;
        case 'audio':
            promptMsg = `🎧 **AUDIO/MUSIKANI yuboring**:`;
            break;
        case 'document':
            promptMsg = `📁 **FAYL/HUJJATNI yuboring**:`;
            break;
        case 'url':
            promptMsg = `🔗 **Tugmaga biriktiriladigan WEB HAVOLANI (URL) kiriting:**\nMisol: \`https://t.me/mychannel\``;
            break;
    }

    await ctx.reply(promptMsg, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
    });
}

/**
 * Javob kontentini qabul qilish va tugmani bazaga saqlash
 */
async function processButtonContent(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_BTN_CONTENT') return;

    const { bot_id, button_type, button_text, response_type } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showButtonMenu(ctx, bot_id);
    }

    let responseContent = '';
    let caption = ctx.message.caption || '';
    let url = null;

    if (response_type === 'text') {
        responseContent = ctx.message.text;
    } else if (response_type === 'url') {
        url = ctx.message.text.trim();
        responseContent = url;
    } else if (response_type === 'photo' && ctx.message.photo) {
        responseContent = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (response_type === 'video' && ctx.message.video) {
        responseContent = ctx.message.video.file_id;
    } else if (response_type === 'audio' && ctx.message.audio) {
        responseContent = ctx.message.audio.file_id;
    } else if (response_type === 'document' && ctx.message.document) {
        responseContent = ctx.message.document.file_id;
    } else {
        return ctx.reply("⚠️ Noto'g'ri fayl yoki format yuborildi! Iltimos, so'ralgan formatda yuboring.");
    }

    await db.addButton(bot_id, button_text, button_type, response_type, responseContent, caption, url);
    await db.clearUserState(userId);

    // Sub-botni yangi tugmalar bilan dinamik qayta ishga tushirish
    const botData = await db.getBotById(bot_id);
    await subbotRunner.restartBot(botData);

    await ctx.reply(`✅ **"${button_text}" tugmasi muvaffaqiyatli saqlandi!**`, { parse_mode: 'Markdown' });
    await showButtonMenu(ctx, bot_id);
}

/**
 * O'chirish uchun tugmalar ro'yxatini ko'rsatish
 */
async function startDeleteButton(ctx, botId) {
    const buttons = await db.getBotButtons(botId, null);

    if (buttons.length === 0) {
        return ctx.answerCbQuery("O'chirish uchun tugma yo'q.");
    }

    const inlineRows = buttons.map(b => [
        Markup.button.callback(`🗑 "${b.button_text}"`, `confirm_del_btn_${b.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_buttons_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan tugmangizni tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

/**
 * Tugmani o'chirish
 */
async function processDeleteButton(ctx, buttonId) {
    const btn = await db.getButtonById(buttonId);
    if (!btn) {
        return ctx.answerCbQuery("Tugma topilmadi.");
    }

    const botId = btn.bot_id;
    await db.deleteButton(buttonId);

    // Sub-botni qayta ishga tushirish
    const botData = await db.getBotById(botId);
    await subbotRunner.restartBot(botData);

    await ctx.answerCbQuery("🗑 Tugma o'chirildi.");
    await showButtonMenu(ctx, botId);
}

module.exports = {
    showButtonMenu,
    startAddButton,
    processButtonType,
    processButtonText,
    processResponseType,
    processButtonContent,
    startDeleteButton,
    processDeleteButton
};
