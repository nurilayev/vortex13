const https = require('https');

function downloadMedia(url, maxBytes = 50 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { rejectUnauthorized: false }, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                return downloadMedia(response.headers.location, maxBytes).then(resolve, reject);
            }
            if (response.statusCode !== 200) {
                response.resume();
                return reject(new Error(`Media server returned ${response.statusCode}`));
            }

            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) {
                    request.destroy(new Error('Media file is too large'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });
        request.setTimeout(15000, () => request.destroy(new Error('Media download timeout')));
        request.on('error', reject);
    });
}

module.exports = { downloadMedia };
