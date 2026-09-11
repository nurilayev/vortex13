require('dotenv').config();
const https = require('https');

// Local SSL proxy cert inspection workaround
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_ID: process.env.ADMIN_ID || '5882864189',
    DB_FILE: './database.sqlite',
    httpsAgent
};
