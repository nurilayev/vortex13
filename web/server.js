const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    // Health check endpoint (Render uchun)
    if (req.url === '/health' || req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('OK - Bot 24/7 faol!');
    }

    let filePath = path.join(PUBLIC_DIR, req.url === '/' || req.url === '/webapp' ? 'index.html' : req.url);
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
 * har 14 daqiqada o'ziga o'zi ping yuboradi.
 */
function startAntiSleep() {
    if (!RENDER_URL) {
        console.log("ℹ️ Anti-Sleep: RENDER_EXTERNAL_URL topilmadi (lokal rejim).");
        return;
    }

    console.log(`⚡️ Anti-Sleep tizimi yoqildi! Har 14 daqiqada ping: ${RENDER_URL}/health`);

    setInterval(() => {
        const pingUrl = `${RENDER_URL}/health`;
        https.get(pingUrl, (res) => {
            console.log(`⚡️ Anti-Sleep ping muvaffaqiyatli! Status: ${res.statusCode}`);
        }).on('error', (err) => {
            // HTTP bilan sinab ko'rish
            http.get(pingUrl.replace('https://', 'http://'), (res) => {
                console.log(`⚡️ Anti-Sleep ping (HTTP) muvaffaqiyatli! Status: ${res.statusCode}`);
            }).on('error', (err2) => {
                console.log(`⚠️ Anti-Sleep ping xatosi:`, err2.message);
            });
        });
    }, 14 * 60 * 1000); // Har 14 daqiqada
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
