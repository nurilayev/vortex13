const { Markup } = require('telegraf');
const db = require('../database');
const { showBotPanel } = require('./botManager');

/**
 * Musika bot moduli menyusini ko'rsatadi.
 */
async function showMusicMenu(ctx, botId) {
    const userId = ctx.from.id;
    const bot = await db.getBotById(botId);

    if (!bot || bot.owner_id !== userId) {
        return ctx.answerCbQuery("Xatolik.");
    }

    const musicList = await db.getMusicByBot(botId);

    let msg = `🎵 **@${bot.bot_username} Musika Bot Moduli**\n\n` +
        `Bazadagi musikalar soni: **${musicList.length}** ta\n\n`;

    if (musicList.length === 0) {
        msg += `Hali hech qanday musika qo'shilmagan. Yangi MP3/Audio qo'shish uchun pastdagi tugmani bosing:`;
    } else {
        msg += `Mavjud musikalar ro'yxati (so'nggi 10 ta):\n`;
        musicList.slice(0, 10).forEach(m => {
            msg += `• **${m.title}** ${m.artist ? `- ${m.artist}` : ''}\n`;
        });
    }

    const inlineKeyboard = [
        [Markup.button.callback('➕ Yangi Musika Qo\'shish', `add_music_start_${botId}`)],
    ];

    if (musicList.length > 0) {
        inlineKeyboard.push([Markup.button.callback('🗑 Musikani O\'chirish', `del_music_start_${botId}`)]);
    }

    inlineKeyboard.push([Markup.button.callback('⬅️ Bot paneliga qaytish', `manage_bot_${botId}`)]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) });
    }
}

/**
 * Yangi musika qo'shish wizardini boshlaydi (Audio yuborish)
 */
async function startAddMusic(ctx, botId) {
    const userId = ctx.from.id;
    await db.setUserState(userId, 'ADD_MUSIC_FILE', { bot_id: botId });

    await ctx.answerCbQuery();
    await ctx.reply(
        `🎧 **MP3 yoki Audio Faylni yuboring:**\n\n` +
        `Telegram'dagi har qanday audio faylni yuborishingiz mumkin.`,
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['⬅️ Bekor qilish']]).resize()
        }
    );
}

/**
 * Audio faylini qabul qilib sarlavha va ijrochini aniqlash
 */
async function processMusicFile(ctx) {
    const userId = ctx.from.id;
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_MUSIC_FILE') return;

    const { bot_id } = userState.data;

    if (ctx.message.text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showMusicMenu(ctx, bot_id);
    }

    let fileId = null;
    let title = '';
    let artist = '';

    if (ctx.message.audio) {
        const audio = ctx.message.audio;
        fileId = audio.file_id;
        title = audio.title || audio.file_name || 'Noma\'lum Qo\'shiq';
        artist = audio.performer || 'Noma\'lum Ijrochi';
    } else if (ctx.message.document && ctx.message.document.mime_type?.startsWith('audio/')) {
        fileId = ctx.message.document.file_id;
        title = ctx.message.document.file_name || 'Noma\'lum Qo\'shiq';
        artist = '';
    } else {
        return ctx.reply("⚠️ Iltimos, MP3 yoki Audio fayl yuboring!");
    }

    await db.setUserState(userId, 'ADD_MUSIC_TITLE', {
        bot_id,
        file_id: fileId,
        default_title: title,
        default_artist: artist
    });

    await ctx.reply(
        `📝 **Qo'shiq nomini kiriting** (yoki o'zgartirmaslik uchun \`OK\` deb yuboring):\n\n` +
        `Joriy nom: **${title}**`,
        { parse_mode: 'Markdown' }
    );
}

/**
 * Qo'shiq nomini qabul qilish va ijrochini so'rash
 */
async function processMusicTitle(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_MUSIC_TITLE') return;

    const { bot_id, file_id, default_title, default_artist } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showMusicMenu(ctx, bot_id);
    }

    const title = (text.toUpperCase() === 'OK') ? default_title : text;

    await db.setUserState(userId, 'ADD_MUSIC_ARTIST', {
        bot_id,
        file_id,
        title,
        default_artist
    });

    await ctx.reply(
        `👤 **Ijrochi ismini kiriting** (yoki o'zgartirmaslik uchun \`OK\` deb yuboring):\n\n` +
        `Joriy ijrochi: **${default_artist || 'Mavjud emas'}**`,
        { parse_mode: 'Markdown' }
    );
}

/**
 * Ijrochini qabul qilib bazaga saqlash
 */
async function processMusicArtist(ctx) {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const userState = await db.getUserState(userId);

    if (!userState || userState.step !== 'ADD_MUSIC_ARTIST') return;

    const { bot_id, file_id, title, default_artist } = userState.data;

    if (text === '⬅️ Bekor qilish') {
        await db.clearUserState(userId);
        return await showMusicMenu(ctx, bot_id);
    }

    const artist = (text.toUpperCase() === 'OK') ? default_artist : text;

    await db.addMusic(bot_id, title, artist, file_id);
    await db.clearUserState(userId);

    await ctx.reply(`✅ **${title}** ${artist ? `(${artist})` : ''} qo'shig'i bazaga saqlandi!`, { parse_mode: 'Markdown' });
    await showMusicMenu(ctx, bot_id);
}

/**
 * Musikani o'chirish ro'yxati
 */
async function startDeleteMusic(ctx, botId) {
    const musicList = await db.getMusicByBot(botId);

    if (musicList.length === 0) {
        return ctx.answerCbQuery("O'chirish uchun musika yo'q.");
    }

    const inlineRows = musicList.slice(0, 15).map(m => [
        Markup.button.callback(`🗑 ${m.title.substring(0, 20)}`, `confirm_del_mus_${m.id}`)
    ]);
    inlineRows.push([Markup.button.callback('⬅️ Orqaga', `bot_music_${botId}`)]);

    await ctx.editMessageText("🗑 **O'chirmoqchi bo'lgan musikani tanlang:**", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineRows)
    });
}

async function processDeleteMusic(ctx, musicId) {
    const music = await db.getMusicById(musicId);
    if (!music) return ctx.answerCbQuery('Musika topilmadi.', { show_alert: true });

    const bot = await db.getBotById(music.bot_id);
    if (!bot || bot.owner_id !== ctx.from.id) {
        return ctx.answerCbQuery('Ruxsat yo\'q.', { show_alert: true });
    }

    await db.deleteMusic(musicId);
    await ctx.answerCbQuery("🗑 Musika o'chirildi.");
    return showMusicMenu(ctx, music.bot_id);
}

module.exports = {
    showMusicMenu,
    startAddMusic,
    processMusicFile,
    processMusicTitle,
    processMusicArtist,
    startDeleteMusic,
    processDeleteMusic
};
