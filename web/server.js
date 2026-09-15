const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');
const config = require('../config');
const db = require('../database');
const subbotRunner = require('../subbot_engine/runner');
const globalMusic = require('../subbot_engine/globalMusic');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
const ADMIN_ID = String(config.ADMIN_ID || '').trim();
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin712';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '712';
const adminSessions = new Map();

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json'
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 1024 * 1024) req.destroy(new Error('Request too large'));
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function getCookie(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    const item = cookies.find(cookie => cookie.trim().startsWith(`${name}=`));
    return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : '';
}

function createAdminSession(res) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    adminSessions.set(sessionId, { id: Number(ADMIN_ID), first_name: 'Admin' });
    res.setHeader('Set-Cookie', `vortex_admin=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
    return adminSessions.get(sessionId);
}

function secureEqualText(first, second) {
    const firstBuffer = Buffer.from(first);
    const secondBuffer = Buffer.from(second);
    return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function getTelegramUser(initData) {
    if (!initData || !config.BOT_TOKEN) return null;

    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const expected = Buffer.from(calculatedHash, 'hex');
    const received = Buffer.from(receivedHash, 'hex');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

    try {
        const user = JSON.parse(params.get('user') || '{}');
        return user.id ? user : null;
    } catch (error) {
        return null;
    }
}

function authenticateAdmin(req) {
    const sessionId = getCookie(req, 'vortex_admin');
    const sessionUser = sessionId ? adminSessions.get(sessionId) : null;
    if (sessionUser) return sessionUser;

    const initData = req.headers['x-telegram-init-data'];
    const user = getTelegramUser(initData);
    if (!user || String(user.id) !== ADMIN_ID) return null;
    return user;
}

async function handleApi(req, res, requestUrl) {
    if (requestUrl.pathname === '/api/login' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const login = String(body.login || '');
        const password = String(body.password || '');
        const validLogin = secureEqualText(login, ADMIN_LOGIN);
        const validPassword = secureEqualText(password, ADMIN_PASSWORD);
        if (!validLogin || !validPassword) {
            return sendJson(res, 401, { ok: false, error: 'Login yoki parol noto\'g\'ri.' });
        }
        const user = createAdminSession(res);
        return sendJson(res, 200, { ok: true, user });
    }

    if (requestUrl.pathname === '/api/logout' && req.method === 'POST') {
        const sessionId = getCookie(req, 'vortex_admin');
        if (sessionId) adminSessions.delete(sessionId);
        res.setHeader('Set-Cookie', 'vortex_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return sendJson(res, 200, { ok: true });
    }

    if (requestUrl.pathname === '/api/session' && req.method === 'GET') {
        const user = authenticateAdmin(req);
        if (!user) return sendJson(res, 403, { ok: false, error: 'Admin ruxsati yo\'q.' });
        const bots = await db.getUserBots(user.id);
        return sendJson(res, 200, { ok: true, user, bots });
    }

    const user = authenticateAdmin(req);
    if (!user) return sendJson(res, 403, { ok: false, error: 'Admin ruxsati yo\'q.' });

    if (requestUrl.pathname === '/api/admin/overview' && req.method === 'GET') {
        const bots = await db.getUserBots(user.id);
        const users = await db.getAllUsers();
        const botStats = await Promise.all(bots.map(async bot => ({
            bot_id: bot.id,
            members: await db.getSubbotUserCount(bot.id),
            banned: (await db.getBannedUsers(bot.id)).length
        })));
        return sendJson(res, 200, { ok: true, bots, users, botStats });
    }

    const botMatch = requestUrl.pathname.match(/^\/api\/admin\/bots\/(\d+)$/);
    if (botMatch && req.method === 'DELETE') {
        const botId = Number(botMatch[1]);
        const bot = await db.getBotById(botId);
        if (!bot || bot.owner_id !== user.id) return sendJson(res, 404, { ok: false, error: 'Bot topilmadi.' });
        await subbotRunner.stopBot(botId);
        await db.deleteBot(botId, user.id);
        return sendJson(res, 200, { ok: true });
    }

    const restartMatch = requestUrl.pathname.match(/^\/api\/admin\/bots\/(\d+)\/restart$/);
    if (restartMatch && req.method === 'POST') {
        const botId = Number(restartMatch[1]);
        const bot = await db.getBotById(botId);
        if (!bot || bot.owner_id !== user.id) return sendJson(res, 404, { ok: false, error: 'Bot topilmadi.' });
        await subbotRunner.restartBot(bot);
        return sendJson(res, 200, { ok: true });
    }

    const banMatch = requestUrl.pathname.match(/^\/api\/admin\/bots\/(\d+)\/users\/(\d+)\/ban$/);
    if (banMatch && (req.method === 'POST' || req.method === 'DELETE')) {
        const botId = Number(banMatch[1]);
        const targetUserId = Number(banMatch[2]);
        const bot = await db.getBotById(botId);
        if (!bot || bot.owner_id !== user.id || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
            return sendJson(res, 404, { ok: false, error: 'Bot yoki foydalanuvchi topilmadi.' });
        }
        if (req.method === 'POST') await db.banUser(botId, targetUserId, 'Banned from Web App admin panel');
        else await db.unbanUser(botId, targetUserId);
        return sendJson(res, 200, { ok: true, banned: req.method === 'POST' });
    }

    const botUsersMatch = requestUrl.pathname.match(/^\/api\/admin\/bots\/(\d+)\/users$/);
    if (botUsersMatch && req.method === 'GET') {
        const botId = Number(botUsersMatch[1]);
        const bot = await db.getBotById(botId);
        if (!bot || bot.owner_id !== user.id) return sendJson(res, 404, { ok: false, error: 'Bot topilmadi.' });
        const members = await db.getSubbotUsers(botId);
        const banned = new Set((await db.getBannedUsers(botId)).map(item => item.user_id));
        return sendJson(res, 200, { ok: true, users: members.map(member => ({ ...member, banned: banned.has(member.user_id) })) });
    }

    if (requestUrl.pathname === '/api/music/search' && req.method === 'GET') {
        const query = requestUrl.searchParams.get('q') || '';
        const results = await globalMusic.searchGlobalMusic(query);
        return sendJson(res, 200, { ok: true, results: results.slice(0, 10) });
    }

    const toggleMatch = requestUrl.pathname.match(/^\/api\/bots\/(\d+)\/toggle$/);
    if (toggleMatch && req.method === 'POST') {
        const botId = Number(toggleMatch[1]);
        const bot = await db.getBotById(botId);
        if (!bot || bot.owner_id !== user.id) return sendJson(res, 404, { ok: false, error: 'Bot topilmadi.' });
        const isActive = !Boolean(bot.is_active);
        await db.updateBotStatus(botId, isActive);
        if (isActive) await subbotRunner.startBot({ ...bot, is_active: 1 });
        else await subbotRunner.stopBot(botId);
        return sendJson(res, 200, { ok: true, is_active: isActive });
    }

    if (requestUrl.pathname === '/api/bots' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const token = String(body.token || '').trim();
        const botType = ['custom', 'cinema', 'music'].includes(body.botType) ? body.botType : 'custom';
        if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
            return sendJson(res, 400, { ok: false, error: 'Bot token formati noto\'g\'ri.' });
        }
        if (await db.getBotByToken(token)) return sendJson(res, 409, { ok: false, error: 'Bu bot allaqachon qo\'shilgan.' });

        const telegramBot = new Telegraf(token, { telegram: { agent: config.httpsAgent } });
        const botInfo = await telegramBot.telegram.getMe();
        const botId = await db.createBot(user.id, token, botInfo.username, botInfo.first_name, botType);
        const bot = await db.getBotById(botId);
        await subbotRunner.startBot(bot);
        return sendJson(res, 201, { ok: true, bot: { ...bot, bot_token: undefined } });
    }

    return sendJson(res, 404, { ok: false, error: 'API endpoint topilmadi.' });
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname.startsWith('/api/')) {
        return handleApi(req, res, requestUrl).catch(error => {
            console.error('Web API error:', error.message);
            sendJson(res, 500, { ok: false, error: 'Server xatosi.' });
        });
    }

    // Health check endpoint (Render uchun)
    if (req.url === '/health' || req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('OK - Bot 24/7 faol!');
    }

    let filePath = path.join(PUBLIC_DIR, requestUrl.pathname === '/' || requestUrl.pathname === '/webapp' ? 'index.html' : requestUrl.pathname);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (error, htmlContent) => {
                    if (error) {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Vortex Bot 24/7 ishlayapti!');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(htmlContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

/**
 * ANTI-SLEEP TIZIMI: Render bepul rejimida botni uxlatib qo'ymasligi uchun
 * har 5 daqiqada o'ziga o'zi ping yuboradi — bot HECH QACHON uxlamaydi!
 */
function startAntiSleep() {
    if (!RENDER_URL) {
        console.log("ℹ️ Anti-Sleep: RENDER_EXTERNAL_URL topilmadi (lokal rejim).");
        return;
    }

    console.log(`⚡️ Anti-Sleep tizimi yoqildi! Har 5 daqiqada ping: ${RENDER_URL}/health`);

    // Darhol birinchi ping
    pingServer();

    // Har 5 daqiqada takroriy ping
    setInterval(pingServer, 5 * 60 * 1000);

    function pingServer() {
        const pingUrl = `${RENDER_URL}/health`;
        https.get(pingUrl, (res) => {
            console.log(`⚡️ Anti-Sleep ping OK! Status: ${res.statusCode}`);
        }).on('error', (err) => {
            http.get(pingUrl.replace('https://', 'http://'), (res) => {
                console.log(`⚡️ Anti-Sleep ping (HTTP) OK! Status: ${res.statusCode}`);
            }).on('error', (err2) => {
                console.log(`⚠️ Anti-Sleep ping xatosi:`, err2.message);
            });
        });
    }
}

function startWebServer() {
    server.listen(PORT, () => {
        console.log(`🌐 Web Server ishga tushdi: port ${PORT}`);
        // Anti-Sleep tizimini yoqish
        startAntiSleep();
    });
}

function getWebAppUrl() {
    if (RENDER_URL) return RENDER_URL;
    return `http://localhost:${PORT}`;
}

module.exports = { startWebServer, getWebAppUrl, PORT };
