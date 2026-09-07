const http = require('http');
const fs = require('fs');
const path = require('path');
const localtunnel = require('localtunnel');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');

let webAppUrl = 'https://cdn.jsdelivr.net/gh/antigravity-apps/vortex-webapp@main/index.html';

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    // CORS & Bypass Tunnel headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Bypass-Tunnel-Reminder', 'true');

    let filePath = path.join(PUBLIC_DIR, req.url === '/' || req.url === '/webapp' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (error, htmlContent) => {
                    res.writeHead(200, { 'Content-Type': 'text/html', 'Bypass-Tunnel-Reminder': 'true' });
                    res.end(htmlContent, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType, 'Bypass-Tunnel-Reminder': 'true' });
            res.end(content, 'utf-8');
        }
    });
});

async function startWebServer() {
    server.listen(PORT, async () => {
        console.log(`🌐 Telegram Web App Server running locally on http://localhost:${PORT}`);
        try {
            const tunnel = await localtunnel({ port: PORT });
            webAppUrl = tunnel.url;
            console.log(`🚀 Direct HTTPS Web App Tunnel URL: ${webAppUrl}`);
            
            tunnel.on('close', () => {
                console.log("Tunnel closed");
            });
        } catch (err) {
            console.error("Localtunnel error:", err.message);
        }
    });
}

function getWebAppUrl() {
    return webAppUrl;
}

module.exports = { startWebServer, getWebAppUrl, PORT };
