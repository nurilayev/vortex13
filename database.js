const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

const DB_FILE = path.join(config.DATA_DIR, 'database.json');
const LEGACY_DB_FILE = path.join(__dirname, 'database.json');
let saveQueue = Promise.resolve();

const initialData = {
    users: [],
    bots: [],
    buttons: [],
    movies: [],
    music: [],
    subbot_users: [],
    user_states: [],
    channels: [],
    keywords: [],
    promocodes: [],
    banned_users: [],
    analytics: [],
    playlists: [],
    premium_users: [],
    auto_increment: {
        bots: 1,
        buttons: 1,
        movies: 1,
        music: 1,
        subbot_users: 1,
        channels: 1,
        keywords: 1,
        promocodes: 1
    }
};

let dbData = null;

async function loadDb() {
    if (dbData) return dbData;
    try {
        const fileContent = await fs.readFile(DB_FILE, 'utf8');
        dbData = JSON.parse(fileContent);

        // Yangi massiv va obyektlarni initsializatsiya qilish
        if (!dbData.channels) dbData.channels = [];
        if (!dbData.keywords) dbData.keywords = [];
        if (!dbData.promocodes) dbData.promocodes = [];
        if (!dbData.banned_users) dbData.banned_users = [];
        if (!dbData.analytics) dbData.analytics = [];
        if (!dbData.playlists) dbData.playlists = [];
        if (!dbData.premium_users) dbData.premium_users = [];
        if (!dbData.auto_increment.channels) dbData.auto_increment.channels = 1;
        if (!dbData.auto_increment.keywords) dbData.auto_increment.keywords = 1;
        if (!dbData.auto_increment.promocodes) dbData.auto_increment.promocodes = 1;

    } catch (err) {
        try {
            if (DB_FILE !== LEGACY_DB_FILE) {
                const legacyContent = await fs.readFile(LEGACY_DB_FILE, 'utf8');
                dbData = JSON.parse(legacyContent);
            } else {
                throw err;
            }
        } catch (legacyError) {
            dbData = JSON.parse(JSON.stringify(initialData));
        }
        await saveDb();
    }

    if (!dbData.channels) dbData.channels = [];
    if (!dbData.keywords) dbData.keywords = [];
    if (!dbData.promocodes) dbData.promocodes = [];
    if (!dbData.banned_users) dbData.banned_users = [];
    if (!dbData.analytics) dbData.analytics = [];
    if (!dbData.playlists) dbData.playlists = [];
    if (!dbData.premium_users) dbData.premium_users = [];
    if (!dbData.auto_increment) dbData.auto_increment = { ...initialData.auto_increment };
    if (!dbData.auto_increment.channels) dbData.auto_increment.channels = 1;
    if (!dbData.auto_increment.keywords) dbData.auto_increment.keywords = 1;
    if (!dbData.auto_increment.promocodes) dbData.auto_increment.promocodes = 1;
    return dbData;
}

async function saveDb() {
    if (!dbData) return;
    const snapshot = JSON.stringify(dbData, null, 2);
    saveQueue = saveQueue.then(async () => {
        try {
            await fs.mkdir(config.DATA_DIR, { recursive: true });
            const tempFile = `${DB_FILE}.tmp`;
            await fs.writeFile(tempFile, snapshot, 'utf8');
            await fs.rename(tempFile, DB_FILE);
        } catch (err) {
            console.error("Ma'lumotlar bazasini saqlashda xatolik:", err.message);
        }
    });
    return saveQueue;
}

async function initDb() {
    await loadDb();
    console.log("✅ Ma'lumotlar bazasi (7 ta yangi modullar bilan) muvaffaqiyatli ishga tushirildi.");
}

async function getSafeBackup() {
    const db = await loadDb();
    const backup = JSON.parse(JSON.stringify(db));
    backup.bots = backup.bots.map(bot => ({ ...bot, bot_token: '[HIDDEN]' }));
    return backup;
}

async function saveBackupFile(filePath) {
    const backup = await getSafeBackup();
    await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
}

async function trackEvent(botId, userId, event, value = '') {
    const db = await loadDb();
    db.analytics.push({ bot_id: botId, user_id: userId, event, value, created_at: new Date().toISOString() });
    if (db.analytics.length > 50000) db.analytics.splice(0, db.analytics.length - 50000);
    await saveDb();
}

async function getAnalytics(botId, days = 7) {
    const db = await loadDb();
    const since = Date.now() - days * 86400000;
    return db.analytics.filter(item => item.bot_id === botId && new Date(item.created_at).getTime() >= since);
}

async function addPlaylistItem(botId, userId, song) {
    const db = await loadDb();
    const exists = db.playlists.some(item => item.bot_id === botId && item.user_id === userId && item.song_id === song.id);
    if (!exists) db.playlists.push({ bot_id: botId, user_id: userId, ...song, added_at: new Date().toISOString() });
    await saveDb();
}

async function getPlaylist(botId, userId) {
    const db = await loadDb();
    return db.playlists.filter(item => item.bot_id === botId && item.user_id === userId);
}

async function setPremiumUser(botId, userId, active = true, expiresAt = null) {
    const db = await loadDb();
    const index = db.premium_users.findIndex(item => item.bot_id === botId && item.user_id === userId);
    const record = { bot_id: botId, user_id: userId, active, expires_at: expiresAt };
    if (index >= 0) db.premium_users[index] = record;
    else db.premium_users.push(record);
    await saveDb();
}

async function extendPremiumUser(botId, userId, days) {
    const db = await loadDb();
    const index = db.premium_users.findIndex(item => item.bot_id === botId && item.user_id === userId);
    const current = index >= 0 && db.premium_users[index].expires_at ? new Date(db.premium_users[index].expires_at).getTime() : 0;
    const start = Math.max(Date.now(), current);
    const expiresAt = new Date(start + Number(days) * 86400000).toISOString();
    const record = { bot_id: botId, user_id: userId, active: true, expires_at: expiresAt };
    if (index >= 0) db.premium_users[index] = record;
    else db.premium_users.push(record);
    await saveDb();
    return expiresAt;
}

async function isPremiumUser(botId, userId) {
    const db = await loadDb();
    const item = db.premium_users.find(record => record.bot_id === botId && record.user_id === userId && record.active);
    return Boolean(item && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now()));
}

async function getBotTheme(botId) {
    const db = await loadDb();
    const bot = db.bots.find(item => item.id === botId);
    return bot?.theme || { accent: '#2563eb', welcome_style: 'default' };
}

// --- USER CRUD ---
async function saveUser(userId, username, firstName) {
    const db = await loadDb();
    const index = db.users.findIndex(u => u.user_id === userId);
    if (index >= 0) {
        db.users[index].username = username;
        db.users[index].first_name = firstName;
    } else {
        db.users.push({
            user_id: userId,
            username,
            first_name: firstName,
            registered_at: new Date().toISOString()
        });
    }
    await saveDb();
}

// --- USER STATE CRUD ---
async function setUserState(userId, step, data = {}) {
    const db = await loadDb();
    const index = db.user_states.findIndex(s => s.user_id === userId);
    if (index >= 0) {
        db.user_states[index].step = step;
        db.user_states[index].data = data;
    } else {
        db.user_states.push({ user_id: userId, step, data });
    }
    await saveDb();
}

async function getUserState(userId) {
    const db = await loadDb();
    const state = db.user_states.find(s => s.user_id === userId);
    return state ? { step: state.step, data: state.data || {} } : null;
}

async function clearUserState(userId) {
    const db = await loadDb();
    db.user_states = db.user_states.filter(s => s.user_id !== userId);
    await saveDb();
}

// --- BOTS CRUD ---
async function createBot(ownerId, botToken, botUsername, botName, botType = 'custom') {
    const db = await loadDb();
    const newId = db.auto_increment.bots++;
    const botObj = {
        id: newId,
        owner_id: ownerId,
        bot_token: botToken,
        bot_username: botUsername,
        bot_name: botName,
        bot_type: botType,
        is_active: 1,
        welcome_text: null,
        welcome_media_id: null,
        welcome_media_type: null,
        created_at: new Date().toISOString()
    };
    db.bots.push(botObj);
    await saveDb();
    return newId;
}

async function updateWelcomeMsg(botId, welcomeText, mediaId = null, mediaType = null) {
    const db = await loadDb();
    const bot = db.bots.find(b => b.id === botId);
    if (bot) {
        bot.welcome_text = welcomeText;
        bot.welcome_media_id = mediaId;
        bot.welcome_media_type = mediaType;
        await saveDb();
    }
}

async function updateBotSettings(botId, ownerId, settings = {}) {
    const db = await loadDb();
    const bot = db.bots.find(item => item.id === botId && item.owner_id === ownerId);
    if (!bot) return null;

    if (typeof settings.welcome_text === 'string') bot.welcome_text = settings.welcome_text.trim() || null;
    if (settings.bot_type && ['custom', 'service', 'cinema', 'music'].includes(settings.bot_type)) bot.bot_type = settings.bot_type;
    if (settings.theme && typeof settings.theme === 'object') bot.theme = { ...bot.theme, ...settings.theme };
    await saveDb();
    return bot;
}

async function getUserBots(ownerId) {
    const db = await loadDb();
    return db.bots.filter(b => b.owner_id === ownerId).sort((a, b) => b.id - a.id);
}

async function getBotById(botId) {
    const db = await loadDb();
    return db.bots.find(b => b.id === botId) || null;
}

async function getBotByToken(botToken) {
    const db = await loadDb();
    return db.bots.find(b => b.bot_token === botToken) || null;
}

async function getAllActiveBots() {
    const db = await loadDb();
    return db.bots.filter(b => b.is_active === 1);
}

async function updateBotStatus(botId, isActive) {
    const db = await loadDb();
    const bot = db.bots.find(b => b.id === botId);
    if (bot) {
        bot.is_active = isActive ? 1 : 0;
        await saveDb();
    }
}

async function deleteBot(botId, ownerId) {
    const db = await loadDb();
    db.bots = db.bots.filter(b => !(b.id === botId && b.owner_id === ownerId));
    db.buttons = db.buttons.filter(b => b.bot_id !== botId);
    db.movies = db.movies.filter(m => m.bot_id !== botId);
    db.music = db.music.filter(m => m.bot_id !== botId);
    db.subbot_users = db.subbot_users.filter(su => su.bot_id !== botId);
    db.channels = db.channels.filter(c => c.bot_id !== botId);
    db.keywords = db.keywords.filter(k => k.bot_id !== botId);
    db.promocodes = db.promocodes.filter(p => p.bot_id !== botId);
    db.banned_users = db.banned_users.filter(bu => bu.bot_id !== botId);
    await saveDb();
}

// --- BUTTONS CRUD ---
async function addButton(botId, buttonText, buttonType, responseType, responseContent, caption = null, url = null, parentId = null) {
    const db = await loadDb();
    const newId = db.auto_increment.buttons++;
    const btnObj = {
        id: newId,
        bot_id: botId,
        button_text: buttonText,
        button_type: buttonType,
        response_type: responseType,
        response_content: responseContent,
        caption,
        url,
        parent_id: parentId
    };
    db.buttons.push(btnObj);
    await saveDb();
    return newId;
}

async function getBotButtons(botId, parentId = null) {
    const db = await loadDb();
    if (parentId === null) {
        return db.buttons.filter(b => b.bot_id === botId && (b.parent_id === null || b.parent_id === undefined));
    }
    return db.buttons.filter(b => b.bot_id === botId && b.parent_id === parentId);
}

async function getButtonById(buttonId) {
    const db = await loadDb();
    return db.buttons.find(b => b.id === buttonId) || null;
}

async function deleteButton(buttonId) {
    const db = await loadDb();
    db.buttons = db.buttons.filter(b => b.id !== buttonId && b.parent_id !== buttonId);
    await saveDb();
}

// --- MOVIES CRUD ---
async function addMovie(botId, code, title, fileId, caption = '') {
    const db = await loadDb();
    const newId = db.auto_increment.movies++;
    const movieObj = {
        id: newId,
        bot_id: botId,
        code,
        title,
        file_id: fileId,
        caption
    };
    db.movies.push(movieObj);
    await saveDb();
    return newId;
}

async function getMoviesByBot(botId) {
    const db = await loadDb();
    return db.movies.filter(m => m.bot_id === botId).sort((a, b) => b.id - a.id);
}

async function getMovieById(movieId) {
    const db = await loadDb();
    return db.movies.find(movie => movie.id === movieId) || null;
}

async function getMovieByCode(botId, code) {
    const db = await loadDb();
    const searchCode = String(code).trim().toLowerCase();
    return db.movies.find(m => String(m.bot_id) === String(botId) && String(m.code).trim().toLowerCase() === searchCode) || null;
}

async function searchMovie(botId, query) {
    const db = await loadDb();
    const searchQuery = String(query).trim().toLowerCase();
    if (!searchQuery) return null;

    return db.movies.find(movie => {
        const code = String(movie.code).trim().toLowerCase();
        const title = String(movie.title).trim().toLowerCase();
        return String(movie.bot_id) === String(botId) && (code === searchQuery || title.includes(searchQuery));
    }) || null;
}

async function deleteMovie(movieId) {
    const db = await loadDb();
    db.movies = db.movies.filter(m => m.id !== movieId);
    await saveDb();
}

// --- MUSIC CRUD ---
async function addMusic(botId, title, artist, fileId, coverFileId = null) {
    const db = await loadDb();
    const newId = db.auto_increment.music++;
    const musicObj = {
        id: newId,
        bot_id: botId,
        title,
        artist,
        file_id: fileId,
        cover_file_id: coverFileId
    };
    db.music.push(musicObj);
    await saveDb();
    return newId;
}

async function getMusicByBot(botId) {
    const db = await loadDb();
    return db.music.filter(m => m.bot_id === botId).sort((a, b) => b.id - a.id);
}

async function getMusicById(musicId) {
    const db = await loadDb();
    return db.music.find(music => music.id === musicId) || null;
}

async function searchMusic(botId, query) {
    const db = await loadDb();
    const searchPattern = query.trim().toLowerCase();
    return db.music.filter(m => {
        if (m.bot_id !== botId) return false;
        const titleMatch = m.title && m.title.toLowerCase().includes(searchPattern);
        const artistMatch = m.artist && m.artist.toLowerCase().includes(searchPattern);
        return titleMatch || artistMatch;
    }).slice(0, 20);
}

async function deleteMusic(musicId) {
    const db = await loadDb();
    db.music = db.music.filter(m => m.id !== musicId);
    await saveDb();
}

// --- SUBBOT USERS & REFERRALS ---
async function addSubbotUser(botId, userId, referrerId = null) {
    const db = await loadDb();
    const exists = db.subbot_users.some(su => su.bot_id === botId && su.user_id === userId);
    if (!exists) {
        const newId = db.auto_increment.subbot_users++;
        db.subbot_users.push({
            id: newId,
            bot_id: botId,
            user_id: userId,
            referrer_id: referrerId ? parseInt(referrerId) : null,
            joined_at: new Date().toISOString()
        });
        await saveDb();
    }
}

async function getSubbotUserCount(botId) {
    const db = await loadDb();
    return db.subbot_users.filter(su => su.bot_id === botId).length;
}

async function getSubbotUsers(botId) {
    const db = await loadDb();
    return db.subbot_users.filter(su => su.bot_id === botId).map(su => ({ user_id: su.user_id }));
}

async function getAllUsers() {
    const db = await loadDb();
    return db.users.slice().sort((first, second) => String(second.registered_at || '').localeCompare(String(first.registered_at || '')));
}

async function getReferralCount(botId, userId) {
    const db = await loadDb();
    return db.subbot_users.filter(su => su.bot_id === botId && su.referrer_id === userId).length;
}

async function getTopReferrers(botId, limit = 10) {
    const db = await loadDb();
    const counts = {};
    db.subbot_users.filter(su => su.bot_id === botId && su.referrer_id).forEach(su => {
        counts[su.referrer_id] = (counts[su.referrer_id] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
    return sorted.map(([userId, count]) => ({ user_id: parseInt(userId), count }));
}

// --- 1. MAJBURIY OBUNA (CHANNELS) CRUD ---
async function addChannel(botId, channelUsername, channelTitle = '') {
    const db = await loadDb();
    let cleanUsername = channelUsername.trim();
    if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername;

    const exists = db.channels.some(c => c.bot_id === botId && c.channel_username.toLowerCase() === cleanUsername.toLowerCase());
    if (exists) return null;

    const newId = db.auto_increment.channels++;
    const chanObj = {
        id: newId,
        bot_id: botId,
        channel_username: cleanUsername,
        channel_title: channelTitle || cleanUsername
    };
    db.channels.push(chanObj);
    await saveDb();
    return newId;
}

async function getBotChannels(botId) {
    const db = await loadDb();
    return db.channels.filter(c => c.bot_id === botId);
}

async function getChannelById(channelId) {
    const db = await loadDb();
    return db.channels.find(channel => channel.id === channelId) || null;
}

async function deleteChannel(channelId) {
    const db = await loadDb();
    db.channels = db.channels.filter(c => c.id === channelId);
    await saveDb();
}

// --- 2. KALIT SO'ZLAR (KEYWORDS) CRUD ---
async function addKeyword(botId, keyword, responseText, responseType = 'text', fileId = null) {
    const db = await loadDb();
    const newId = db.auto_increment.keywords++;
    const kwObj = {
        id: newId,
        bot_id: botId,
        keyword: keyword.trim().toLowerCase(),
        response_text: responseText,
        response_type: responseType,
        file_id: fileId
    };
    db.keywords.push(kwObj);
    await saveDb();
    return newId;
}

async function getBotKeywords(botId) {
    const db = await loadDb();
    return db.keywords.filter(k => k.bot_id === botId);
}

async function getKeywordById(keywordId) {
    const db = await loadDb();
    return db.keywords.find(keyword => keyword.id === keywordId) || null;
}

async function deleteKeyword(keywordId) {
    const db = await loadDb();
    db.keywords = db.keywords.filter(k => k.id !== keywordId);
    await saveDb();
}

// --- 3. PROMOKODLAR CRUD ---
async function addPromocode(botId, code, rewardText, responseType = 'text', fileId = null, maxUses = 100) {
    const db = await loadDb();
    const newId = db.auto_increment.promocodes++;
    const promoObj = {
        id: newId,
        bot_id: botId,
        code: code.trim().toUpperCase(),
        reward_text: rewardText,
        response_type: responseType,
        file_id: fileId,
        max_uses: maxUses,
        current_uses: 0,
        used_users: []
    };
    db.promocodes.push(promoObj);
    await saveDb();
    return newId;
}

async function getBotPromocodes(botId) {
    const db = await loadDb();
    return db.promocodes.filter(p => p.bot_id === botId);
}

async function getPromocodeById(promoId) {
    const db = await loadDb();
    return db.promocodes.find(promo => promo.id === promoId) || null;
}

async function usePromocode(botId, code, userId) {
    const db = await loadDb();
    const cleanCode = code.trim().toUpperCase();
    const promo = db.promocodes.find(p => p.bot_id === botId && p.code === cleanCode);
    if (!promo) return { status: 'NOT_FOUND' };

    if (!promo.used_users) promo.used_users = [];
    if (promo.used_users.includes(userId)) return { status: 'ALREADY_USED' };
    if (promo.current_uses >= promo.max_uses) return { status: 'EXPIRED' };

    promo.current_uses++;
    promo.used_users.push(userId);
    await saveDb();

    return { status: 'SUCCESS', promo };
}

async function deletePromocode(promoId) {
    const db = await loadDb();
    db.promocodes = db.promocodes.filter(p => p.id !== promoId);
    await saveDb();
}

// --- 4. FOYDALANUVCHILARNI BLOKLASH (BAN) CRUD ---
async function banUser(botId, userId, reason = '') {
    const db = await loadDb();
    const uId = parseInt(userId);
    const exists = db.banned_users.some(bu => bu.bot_id === botId && bu.user_id === uId);
    if (!exists) {
        db.banned_users.push({
            bot_id: botId,
            user_id: uId,
            reason,
            banned_at: new Date().toISOString()
        });
        await saveDb();
    }
}

async function unbanUser(botId, userId) {
    const db = await loadDb();
    const uId = parseInt(userId);
    db.banned_users = db.banned_users.filter(bu => !(bu.bot_id === botId && bu.user_id === uId));
    await saveDb();
}

async function isUserBanned(botId, userId) {
    const db = await loadDb();
    return db.banned_users.some(bu => bu.bot_id === botId && bu.user_id === parseInt(userId));
}

async function getBannedUsers(botId) {
    const db = await loadDb();
    return db.banned_users.filter(bu => bu.bot_id === botId);
}

module.exports = {
    initDb,
    getSafeBackup,
    saveUser,
    setUserState,
    getUserState,
    clearUserState,
    createBot,
    updateWelcomeMsg,
    updateBotSettings,
    saveBackupFile,
    trackEvent,
    getAnalytics,
    addPlaylistItem,
    getPlaylist,
    setPremiumUser,
    extendPremiumUser,
    isPremiumUser,
    getBotTheme,
    getUserBots,
    getBotById,
    getBotByToken,
    getAllActiveBots,
    updateBotStatus,
    deleteBot,
    addButton,
    getBotButtons,
    getButtonById,
    deleteButton,
    addMovie,
    getMoviesByBot,
    getMovieById,
    getMovieByCode,
    searchMovie,
    deleteMovie,
    addMusic,
    getMusicByBot,
    getMusicById,
    searchMusic,
    deleteMusic,
    addSubbotUser,
    getSubbotUserCount,
    getSubbotUsers,
    getAllUsers,
    getReferralCount,
    getTopReferrers,
    addChannel,
    getBotChannels,
    getChannelById,
    deleteChannel,
    addKeyword,
    getBotKeywords,
    getKeywordById,
    deleteKeyword,
    addPromocode,
    getBotPromocodes,
    getPromocodeById,
    usePromocode,
    deletePromocode,
    banUser,
    unbanUser,
    isUserBanned,
    getBannedUsers
};
