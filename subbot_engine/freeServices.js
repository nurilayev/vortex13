const https = require('https');
const config = require('../config');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { agent: config.httpsAgent }, response => {
            let data = '';
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                return fetchJson(response.headers.location).then(resolve, reject);
            }
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`API ${response.statusCode}`));
                try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
            });
        });
        request.setTimeout(8000, () => request.destroy(new Error('API timeout')));
        request.on('error', reject);
    });
}

async function getWeather(city) {
    const places = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uz&format=json`);
    const place = places.results?.[0];
    if (!place) return null;
    const weather = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`);
    return { city: `${place.name}, ${place.country_code}`, ...weather.current };
}

async function getCurrency(base, target, amount = 1) {
    try {
        const data = await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
        const rate = data.rates?.[target];
        if (rate) return { base, target, amount, rate: Number((rate * amount).toFixed(2)) };
    } catch (error) {
        console.error('Primary currency API error:', error.message);
    }
    const fallback = await fetchJson(`https://api.frankfurter.app/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(base)}&to=${encodeURIComponent(target)}`);
    return { base, target, amount, rate: fallback.rates?.[target] };
}

async function getQuiz() {
    const data = await fetchJson('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986');
    const item = data.results?.[0];
    if (!item) return null;
    return {
        question: decodeURIComponent(item.question),
        answers: [item.correct_answer, ...item.incorrect_answers].map(decodeURIComponent).sort(() => Math.random() - 0.5),
        correct: decodeURIComponent(item.correct_answer)
    };
}

module.exports = { getWeather, getCurrency, getQuiz };
