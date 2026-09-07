const { Markup } = require('telegraf');
const db = require('../database');
const { showBotPanel } = require('./botManager');

/**
 * Kino bot moduli menyusini ko'rsatadi.
 */
async function showCinemaMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const movies = await db.getMoviesByBot(botId);

    let msg = `🎬 **@${bot.bot_username} Kino Bot Moduli**\n\n` +
        `Bazadagi kinolar soni: **${movies.length}** ta\n\n`;

    if (movies.length === 0) {
        msg += `Hali hech qanday kino qo'shilmagan. Yangi kino kodi va videosini qo'shish uchun pastdagi tugmani bosing:`;
    } else {
        msg += `Mavjud kinolar ro'yxati (so'nggi 10 ta):\n`;
        movies.slice(0, 10).forEach(m => {
            msg += `• Kod: \`${m.code}\` | **${m.title}**\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Kino Qo\'shish', `add_movie_start_${botId}`)],
    ];

    if (movies.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Kinoni O\'chirish', `del_movie_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

/**
 * Yangi kino qo'shish wizardini boshlaydi (Kino kodini so'rash)
 */
async function startAddMovie(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_MOVIE_CODE', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `🎬 **Kino Kodini Kiriting:**\n\n` +
        `Foydalanuvchi botga ushbu kodni yuborganda kino oladi.\n` +
        `Misol: \`101\`, \`205\`, yoki \`avatar\``,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

/**
 * Kino kodini saqlash va Kino sarlavhasini so'rash
 */
async function processMovieCode(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    if (text === '⬅️ Bekor qilish') {
        const userState = await db.getUserState(userId);
        const botId = userState?.data?.bot_id;
        await db.clearUserState(userId);
        return await showCinemaMenu(ctx, botId);
    }

    const userState = await db.getUserState(userId);
    const botId = userState.data.bot_id;

    // Kod takrorlanmasligini tekshirish
    const existing = await db.getMovieByCode(botId, text);
    if (existing) {
        return ctx.reply(`⚠️ Bazada \`${text}\` kodli kino allaqachon mavjud! Iltimos, boshqa kod kiriting.`, { parse_mode: 'Markdown' });
    }

    await db.setUserState(userId, 'ADD_MOVIE_TITLE', {
        bot_id: botId,
        code: text
    });

    await ctx.reply(
        `📝 **Kino Nomi / Sarlavhasini kiriting:**\n\n` +
        `Misol: \`Qasoskorlar: Intiho (2019)\``,
        { parse_mode: 'Markdown' }
    );
}

/**
 * Kino sarlavhasini saqlash va Video faylini so'rash
 */
async function processMovieTitle(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    if (text === '⬅️ Bekor qilish') {
        const userState = await db.getUserState(userId);
        const botId = userState?.data?.bot_id;
        await db.clearUserState(userId);
        return await showCinemaMenu(ctx, botId);
    }

    const userState = await db.getUserState(userId);
    const { bot_id, code } = userState.data;

    await db.setUserState(userId, 'ADD_MOVIE_FILE', {
        bot_id,
        code,
        title: text
    });

    await ctx.reply(
        `📹 **Endi KINO VIDEOSINI yuboring:**\n\n` +
        `(Video ostiga izoh/caption ham kiritishingiz mumkin)`,
        { parse_mode: 'Markdown' }
    );
}

/**
 * Video faylini qabul qilib bazaga saqlash
 */
async function processMovieFile(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_MOVIE_FILE') return;

    const { bot_id, code, title } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showCinemaMenu(ctx, bot_id);
    }

    let fileId = null;
    let caption = ctx.message.caption || `🎬 **${title}**\nKod: \`${code}\``;

    if (ctx.message.video) {
        fileId = ctx.message.video.file_id;
    } else if (ctx.message.document) {
        fileId = ctx.message.document.file_id;
    } else {
        return ctx.reply("⚠️ Iltimos, kino video faylini yuboring!");
    }

    await db.addMovie(bot_id, code, title, fileId, caption);
    await db.clearUserState(userId);

    await ctx.reply(`✅ **${title}** kinoyi \`${code}\` kodi bilan saqlandi!`, { parse_mode: 'Markdown' });
    await showCinemaMenu(ctx, bot_id);
}

/**
 * Kinoni o'chirish ro'yxati
 */
async function startDeleteMovie(ctx, botId) {
    const movies = await db.getMoviesByBot(botId);

    if (movies.length === 0) {
        return ctx.answerCbQuery("O'chirish uchun kino yo'q.");
    }

    const inlineRows = movies.slice(0, 15).map(m => [
        Markup.button.callback(`🗑 Kod: ${m.code} | ${m.title.substring(0, 20)}`, `confirm_del_mov_${m.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_cinema_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan kinoni tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

/**
 * Kinoni o'chirish
 */
async function processDeleteMovie(ctx, movieId) {
    const dbData = require('../database');
    const movies = await dbData.getMoviesByBot(movieId); // search
    await dbData.deleteMovie(movieId);
    await ctx.answerCbQuery("🗑 Kino o'chirildi.");
    // showMenu
}

module.exports = {
    showCinemaMenu,
    startAddMovie,
    processMovieCode,
    processMovieTitle,
    processMovieFile,
    startDeleteMovie,
    processDeleteMovie
};
