const { Markup } = require('telegraf');
const db = require('../database');
const webServer = require('../web/server');

/**
 * Asosiy konstruktor botning /start menyusi va klaviatura tuzilishi.
 */
function getMainKeyboard() {
    const webAppUrl = webServer.getWebAppUrl();
    const keyboard = [
        ['🤖 Yangi Bot Yaratish', '📂 Mening Botlarim'],
        ["ℹ️ Yordam / Qo'llanma"]
    ];
    // Faqat HTTPS URL bo'lganda Web App tugmasini qo'shamiz
    if (webAppUrl && webAppUrl.startsWith('https://')) {
        keyboard.unshift([Markup.button.webApp('🚀 Web App Boshqaruv Paneli', webAppUrl)]);
    }
    return Markup.keyboard(keyboard).resize();
}

async function handleStart(ctx) {
    const userId = ctx.from.id;
    const username = ctx.from.username || '';
    const firstName = ctx.from.first_name || '';

    await db.saveUser(userId, username, firstName);
    await db.clearUserState(userId);

    const welcomeMsg = 
        `👑 **TELEGRAM BOT KONSTRUKTOR PLATFORMASI**\n` +
        `═════════════════════════\n\n` +
        `👋 **Assalomu alaykum, ${firstName}!**\n\n` +
        `Ushbu platforma orqali o'z Telegram botlaringizni 1 soniyada yaratishingiz mumkin!\n\n` +
        `✨ **Mavjud Imkoniyatlar va Modullar:**\n` +
        `• 🎬 **Global Kino Bot** (Online kinolar va kodlar bazasi)\n` +
        `• 🎵 **Global Musika Bot** (Deezer/iTunes dunyo bo'yicha qidiruv)\n` +
        `• 🔘 **Tugmali Botlar** (Reply / Inline Buttons)\n` +
        `• 📢 **Majburiy Obuna Moduli** (Kanallarni ulash)\n` +
        `• 🔗 **Referal Tizimi** (Do'stlarni taklif qilish)\n` +
        `• 💬 **Kalit So'zlar** (Avto-javob sozlash)\n` +
        `• 🎁 **Promokodlar** (Sovg'ali promokodlar)\n` +
        `• 🎨 **Xush Kelibsiz Xabari** (Media bilan)\n` +
        `• 🔒 **Ban Tizimi** (Spamerlarni bloklash)\n` +
        `• 📥 **Obunachilarni Eksport Qilish**\n\n` +
        `👇 **Boshlash uchun pastdagi knopkalardan birini tanlang:**`;

    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown', ...getMainKeyboard() });
}

async function handleHelp(ctx) {
    const helpMsg = 
        `ℹ️ **BOT YARATISH BO'YICHA QADAMMA-QADAM QO'LLANMA**\n` +
        `═════════════════════════════════\n\n` +
        `1️⃣ Telegram'da [@BotFather](https://t.me/BotFather) botiga kiring.\n` +
        `2️⃣ \`/newbot\` buyrug'ini yuboring.\n` +
        `3️⃣ Botingiz sarlavhasi (name) va username'ini kiriting.\n` +
        `4️⃣ BotFather sizga bergan **API Token**ni nusxalab oling.\n` +
        `5️⃣ Konstruktor botga qaytib **"🤖 Yangi Bot Yaratish"** tugmasini bosing va tokeningizni yuboring!\n\n` +
        `⚡️ *Botingiz tayyor bo'lgach, barcha modullarni erkin sozlay olasiz!*`;

    await ctx.reply(helpMsg, { parse_mode: 'Markdown', ...getMainKeyboard() });
}

module.exports = {
    getMainKeyboard,
    handleStart,
    handleHelp
};
