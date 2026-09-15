const https = require('https');
const config = require('../config');

/**
 * Global Musika Qidiruv Dvigateli (Deezer & iTunes Public APIs)
 */
async function searchGlobalMusic(query) {
    if (!query || query.trim().length === 0) return [];
    
    const cleanQuery = encodeURIComponent(query.trim());
    const results = [];

    // 1. Deezer API orqali qidiruv
    try {
        const deezerUrl = `https://api.deezer.com/search?q=${cleanQuery}&limit=10`;
        const deezerData = await fetchJson(deezerUrl);
        if (deezerData && deezerData.data && deezerData.data.length > 0) {
            deezerData.data.forEach(item => {
                results.push({
                    id: `dz_${item.id}`,
                    title: item.title_short || item.title,
                    artist: item.artist ? item.artist.name : 'Noma\'lum Ijrochi',
                    album: item.album ? item.album.title : '',
                    cover: item.album ? item.album.cover_medium : (item.artist ? item.artist.picture_medium : null),
                    preview: item.preview, // 30s MP3 High Quality Preview Stream
                    duration: item.duration || 30,
                    source: 'Deezer'
                });
            });
        }
    } catch (err) {
        console.error("Deezer search error:", err.message);
    }

    // 2. iTunes API orqali qidiruv (Zaxira / Qo'shimcha natijalar)
    if (results.length < 5) {
        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${cleanQuery}&media=music&limit=10`;
            const itunesData = await fetchJson(itunesUrl);
            if (itunesData && itunesData.results && itunesData.results.length > 0) {
                itunesData.results.forEach(item => {
                    const exists = results.some(r => r.title.toLowerCase() === item.trackName?.toLowerCase() && r.artist.toLowerCase() === item.artistName?.toLowerCase());
                    if (!exists) {
                        results.push({
                            id: `it_${item.trackId}`,
                            title: item.trackName || 'Qo\'shiq',
                            artist: item.artistName || 'Ijrochi',
                            album: item.collectionName || '',
                            cover: item.artworkUrl100 || null,
                            preview: item.previewUrl,
                            duration: Math.round((item.trackTimeMillis || 30000) / 1000),
                            source: 'iTunes'
                        });
                    }
                });
            }
        } catch (err) {
            console.error("iTunes search error:", err.message);
        }
    }

    return results;
}

/**
 * Top Trend Qo'shiqlar (Deezer Top Charts API)
 */
async function getTopTrendingMusic() {
    try {
        const topUrl = `https://api.deezer.com/chart/0/tracks?limit=10`;
        const data = await fetchJson(topUrl);
        if (data && data.data && data.data.length > 0) {
            return data.data.map(item => ({
                id: `dz_${item.id}`,
                title: item.title_short || item.title,
                artist: item.artist ? item.artist.name : 'Ijrochi',
                cover: item.album ? item.album.cover_medium : null,
                preview: item.preview,
                duration: item.duration || 30
            }));
        }
    } catch (err) {
        console.error("Top trending search error:", err.message);
    }

    // Chart API ishlamasa, qidiruv API orqali zaxira top natijalarini qaytaramiz.
    return (await searchGlobalMusic('global top music')).slice(0, 10);
}

/**
 * HTTP/HTTPS JSON Fetch helper
 */
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { agent: config.httpsAgent }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', err => reject(err));
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });
    });
}

module.exports = {
    searchGlobalMusic,
    getTopTrendingMusic
};
