const https = require('https');
const config = require('../config');

// Mashhur Online Kinolar Kutubxonasi va Online Search Engine
const globalMoviesCatalog = [
    {
        code: '101',
        title: 'Qasoskorlar: Intiho (Avengers: Endgame)',
        year: '2019',
        genre: 'Fantastika, Jangari',
        rating: '⭐️ 8.4/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        description: 'Koinotni saqlab qolish uchun Qasoskorlarning so\'nggi va eng buyuk jangi!'
    },
    {
        code: '102',
        title: 'Avatar 2: Suv Yo\'li (Avatar: The Way of Water)',
        year: '2022',
        genre: 'Fantastika, Sarguzasht',
        rating: '⭐️ 7.6/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BYjhiNjBlODctMS07Nm00NWU3LTg1ZWUtMTJiYzU1BDI0ZGE4XkEyXkFqcGc@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        description: 'Pandora okeanlarining sirlari va Jeyk Salli oilasining yangi sarguzashtlari.'
    },
    {
        code: '103',
        title: 'Oppenxaymer (Oppenheimer)',
        year: '2023',
        genre: 'Biografiya, Drama',
        rating: '⭐️ 8.9/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BMDBmYTZjNjUtN2M1MS00MTQ2LTk2ODgtNzc2M2QyZGE5NTVjXkEyXkFqcGc@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        description: 'Atom bombasi otasi J. Robert Oppenxaymerning hayoti va kashfiyoti.'
    },
    {
        code: '104',
        title: 'Forsaj 10 (Fast X)',
        year: '2023',
        genre: 'Jangari, Poyga',
        rating: '⭐️ 5.8/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BNzZmOTU1ZTEtYzVhNi00NzA2LWI5ZTAtYzJhMzc5Nzc5YDA2XkEyXkFqcGc@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        description: 'Dom Toretto va uning oilasi eng xavfli dushman Dante bilan to\'qnashadi.'
    },
    {
        code: '105',
        title: 'O\'rgimchak Odam: Uyga Yo\'l Yo\'q (Spider-Man: No Way Home)',
        year: '2021',
        genre: 'Jangari, Fantastika',
        rating: '⭐️ 8.2/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BZWMyYzFjYTYtNTRjYi00OGExLWE2YzgtOGRmYjAxZTU3NzBiXkEyXkFqcGc@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        description: 'Multikoinot eshiklari ochilishi va barcha dushmanlarning qaytishi.'
    },
    {
        code: '106',
        title: 'Interstellar (Yulduzlararo)',
        year: '2014',
        genre: 'Ilmiy-Fantastika',
        rating: '⭐️ 8.7/10',
        poster: 'https://m.media-amazon.com/images/M/MV5BYzdjMDAyMTEtTUTY4Ni00OTIxLTgwMGYtMDA3N2IxNWEwZmFiXkEyXkFqcGc@._V1_SX300.jpg',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        description: 'Insoniyatni saqlab qolish uchun fazolararo qurt teshigi orqali sayohat.'
    }
];

function searchCinemaCatalog(query = '', year = '', genre = '') {
    const cleanQuery = String(query).trim().toLowerCase();
    const cleanYear = String(year).trim();
    const cleanGenre = String(genre).trim().toLowerCase();
    return globalMoviesCatalog.filter(movie => {
        const textMatch = !cleanQuery || [movie.code, movie.title, movie.description].some(value => String(value).toLowerCase().includes(cleanQuery));
        const yearMatch = !cleanYear || String(movie.year) === cleanYear;
        const genreMatch = !cleanGenre || String(movie.genre).toLowerCase().includes(cleanGenre);
        return textMatch && yearMatch && genreMatch;
    });
}

/**
 * Global Kino Qidiruv Engine (Kod yoki Nomi bo'yicha)
 */
async function searchGlobalCinema(query) {
    if (!query) return null;
    const cleanQuery = String(query).trim().toLowerCase();

    // 1. Kod yoki nomi bo'yicha lokal bazani tekshirish
    const found = globalMoviesCatalog.find(m => 
        m.code.toLowerCase() === cleanQuery || 
        m.title.toLowerCase().includes(cleanQuery)
    );

    if (found) return found;

    // 2. Online OMDB / Movie Search API orqali qidiruv
    try {
        const url = `https://www.omdbapi.com/?s=${encodeURIComponent(cleanQuery)}&apikey=trilogy`;
        const data = await fetchJson(url);
        if (data && data.Search && data.Search.length > 0) {
            const movie = data.Search[0];
            return {
                code: movie.imdbID,
                title: movie.Title,
                year: movie.Year,
                genre: movie.Type,
                rating: '⭐️ 8.0/10',
                poster: movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450?text=Kino+Poster',
                video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                description: `${movie.Title} (${movie.Year}) kinoyining HD formati.`
            };
        }
    } catch (err) {
        console.error("OMDB movie search error:", err.message);
    }

    return null;
}

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
        req.setTimeout(6000, () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });
    });
}

module.exports = {
    searchGlobalCinema,
    searchCinemaCatalog,
    globalMoviesCatalog
};
