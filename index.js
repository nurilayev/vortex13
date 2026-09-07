const { Telegraf } = require('telegraf');
const config = require('./config');
const db = require('./database');
const subbotRunner = require('./subbot_engine/runner');
const webServer = require('./web/server');

const startHandler = require('./handlers/start');
const botCreator = require('./handlers/botCreator');
const botManager = require('./handlers/botManager');
const buttonBuilder = require('./handlers/buttonBuilder');
const movieModule = require('./handlers/movieModule');
const musicModule = require('./handlers/musicModule');
const broadcast = require('./handlers/broadcast');

// 7 ta yangi modullar
const channelModule = require('./handlers/channelModule');
const keywordModule = require('./handlers/keywordModule');
const promoModule = require('./handlers/promoModule');
const welcomeModule = require('./handlers/welcomeModule');
const banModule = require('./handlers/banModule');

// Process darajasida xatoliklarni ushlab qolish (Bot xatolikda ham o'chib qolmaydi)
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception caught:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection caught:', reason ? (reason.message || reason) : reason);
});

async function launchMainBot(mainBot) {
    let connected = false;
    while (!connected) {
        try {
            await mainBot.launch({ dropPendingUpdates: true });
            connected = true;
            console.log("🟢 Polling muvaffaqiyatli ulindi.");
        } catch (err) {
            console.error("⚠️ Launch ulanish xatosi (qayta urinilmoqda 3s):", err.message);
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

async function main() {
    console.log("🚀 Telegram Bot Konstruktor & Web App Platformasi ishga tushmoqda...");

    // 1. Ma'lumotlar bazasini yuklash
    await db.initDb();

    // 2. Web App Serverini ishga tushirish
    webServer.startWebServer();

    // Token mavjudligini tekshirish
    if (!config.BOT_TOKEN || config.BOT_TOKEN === 'YOUR_MAIN_BOT_TOKEN_HERE') {
        console.error("\n❌ XATOLIK: .env faylida BOT_TOKEN ko'rsatilmadi!");
        console.error("Iltimos, .env faylini ochib, BotFather'dan olingan tokeningizni joylashtiring:\nBOT_TOKEN=123456789:ABCdef...\n");
        process.exit(1);
    }

    // 3. Asosiy Konstruktor Botini yaratish
    const mainBot = new Telegraf(config.BOT_TOKEN, {
        telegram: { agent: config.httpsAgent }
    });

    // Global bot catch
    mainBot.catch((err, ctx) => {
        console.error(`⚠️ Asosiy bot xatolik ushlandi:`, err.message);
    });

    // 4. Bazadagi barcha faol sub-botlarni ishga tushirish
    await subbotRunner.loadAndStartAllBots();

    // --- MAIN BOT HANDLERS ---
    mainBot.start((ctx) => startHandler.handleStart(ctx));

    // Case-insensitive Regex va Emoji bilan klaviatura tugmalarini qamrab olish
    mainBot.hears(/Yangi [bB]ot [yY]aratish/i, async (ctx) => {
        try {
            await botCreator.startBotCreation(ctx);
        } catch (e) {
            console.error("botCreator error:", e.message);
        }
    });

    mainBot.hears(/Mening [bB]otlarim/i, async (ctx) => {
        try {
            await botManager.showMyBots(ctx);
        } catch (e) {
            console.error("showMyBots error:", e.message);
        }
    });

    mainBot.hears(/Yordam/i, async (ctx) => {
        try {
            await startHandler.handleHelp(ctx);
        } catch (e) {
            console.error("handleHelp error:", e.message);
        }
    });

    mainBot.hears(/Bekor qilish/i, async (ctx) => {
        await db.clearUserState(ctx.from.id);
        await ctx.reply("❌ Amal bekor qilindi.", startHandler.getMainKeyboard());
    });

    // --- CALLBACK QUERIES (INLINE BUTTONS) ---
    mainBot.on('callback_query', async (ctx, next) => {
        const data = ctx.callbackQuery.data;

        if (data === 'my_bots_list') {
            return await botManager.showMyBots(ctx);
        }
        if (data.startsWith('manage_bot_')) {
            const botId = parseInt(data.replace('manage_bot_', ''));
            return await botManager.showBotPanel(ctx, botId);
        }
        if (data.startsWith('bot_toggle_')) {
            const botId = parseInt(data.replace('bot_toggle_', ''));
            return await botManager.toggleBotStatus(ctx, botId);
        }
        if (data.startsWith('bot_delete_confirm_')) {
            const botId = parseInt(data.replace('bot_delete_confirm_', ''));
            return await botManager.processDeleteBot(ctx, botId);
        }
        if (data.startsWith('bot_delete_')) {
            const botId = parseInt(data.replace('bot_delete_', ''));
            return await botManager.confirmDeleteBot(ctx, botId);
        }
        if (data.startsWith('set_type_')) {
            return await botCreator.handleBotTypeSelection(ctx);
        }

        // 1. Majburiy Obuna Moduli Callbacks
        if (data.startsWith('bot_channels_')) {
            const botId = parseInt(data.replace('bot_channels_', ''));
            return await channelModule.showChannelMenu(ctx, botId);
        }
        if (data.startsWith('add_chan_start_')) {
            const botId = parseInt(data.replace('add_chan_start_', ''));
            return await channelModule.startAddChannel(ctx, botId);
        }
        if (data.startsWith('del_chan_start_')) {
            const botId = parseInt(data.replace('del_chan_start_', ''));
            return await channelModule.startDeleteChannel(ctx, botId);
        }
        if (data.startsWith('confirm_del_chan_')) {
            const chanId = parseInt(data.replace('confirm_del_chan_', ''));
            return await channelModule.processDeleteChannel(ctx, chanId);
        }

        // 2. Kalit So'zlar Moduli Callbacks
        if (data.startsWith('bot_keywords_')) {
            const botId = parseInt(data.replace('bot_keywords_', ''));
            return await keywordModule.showKeywordMenu(ctx, botId);
        }
        if (data.startsWith('add_kw_start_')) {
            const botId = parseInt(data.replace('add_kw_start_', ''));
            return await keywordModule.startAddKeyword(ctx, botId);
        }
        if (data.startsWith('del_kw_start_')) {
            const botId = parseInt(data.replace('del_kw_start_', ''));
            return await keywordModule.startDeleteKeyword(ctx, botId);
        }

        // 3. Promokodlar Moduli Callbacks
        if (data.startsWith('bot_promocodes_')) {
            const botId = parseInt(data.replace('bot_promocodes_', ''));
            return await promoModule.showPromoMenu(ctx, botId);
        }
        if (data.startsWith('add_promo_start_')) {
            const botId = parseInt(data.replace('add_promo_start_', ''));
            return await promoModule.startAddPromo(ctx, botId);
        }
        if (data.startsWith('del_promo_start_')) {
            const botId = parseInt(data.replace('del_promo_start_', ''));
            return await promoModule.startDeletePromo(ctx, botId);
        }

        // 4. Xush Kelibsiz Xabari Callbacks
        if (data.startsWith('bot_welcome_')) {
            const botId = parseInt(data.replace('bot_welcome_', ''));
            return await welcomeModule.showWelcomeMenu(ctx, botId);
        }
        if (data.startsWith('edit_welcome_start_')) {
            const botId = parseInt(data.replace('edit_welcome_start_', ''));
            return await welcomeModule.startEditWelcome(ctx, botId);
        }

        // 5. Ban Tizimi Callbacks
        if (data.startsWith('bot_ban_')) {
            const botId = parseInt(data.replace('bot_ban_', ''));
            return await banModule.showBanMenu(ctx, botId);
        }
        if (data.startsWith('ban_user_start_')) {
            const botId = parseInt(data.replace('ban_user_start_', ''));
            return await banModule.startBanUser(ctx, botId);
        }
        if (data.startsWith('unban_user_start_')) {
            const botId = parseInt(data.replace('unban_user_start_', ''));
            return await banModule.startUnbanUser(ctx, botId);
        }
        if (data.startsWith('confirm_unban_')) {
            const parts = data.split('_');
            const botId = parseInt(parts[2]);
            const targetUserId = parseInt(parts[3]);
            return await banModule.processUnbanUser(ctx, botId, targetUserId);
        }

        // 6. Referallar & 7. Eksport Callbacks
        if (data.startsWith('bot_ref_top_')) {
            const botId = parseInt(data.replace('bot_ref_top_', ''));
            return await botManager.showTopReferrers(ctx, botId);
        }
        if (data.startsWith('bot_export_')) {
            const botId = parseInt(data.replace('bot_export_', ''));
            return await botManager.exportSubbotUsers(ctx, botId);
        }

        // Tugmalar moduli callbacklari
        if (data.startsWith('bot_buttons_')) {
            const botId = parseInt(data.replace('bot_buttons_', ''));
            return await buttonBuilder.showButtonMenu(ctx, botId);
        }
        if (data.startsWith('add_btn_start_')) {
            const botId = parseInt(data.replace('add_btn_start_', ''));
            return await buttonBuilder.startAddButton(ctx, botId);
        }
        if (data.startsWith('btn_type_reply_')) {
            const botId = parseInt(data.replace('btn_type_reply_', ''));
            return await buttonBuilder.processButtonType(ctx, botId, 'reply');
        }
        if (data.startsWith('btn_type_inline_')) {
            const botId = parseInt(data.replace('btn_type_inline_', ''));
            return await buttonBuilder.processButtonType(ctx, botId, 'inline');
        }
        if (data.startsWith('resp_type_')) {
            const parts = data.split('_');
            const respType = parts[2];
            const botId = parseInt(parts[3]);
            return await buttonBuilder.processResponseType(ctx, botId, respType);
        }
        if (data.startsWith('del_btn_start_')) {
            const botId = parseInt(data.replace('del_btn_start_', ''));
            return await buttonBuilder.startDeleteButton(ctx, botId);
        }
        if (data.startsWith('confirm_del_btn_')) {
            const btnId = parseInt(data.replace('confirm_del_btn_', ''));
            return await buttonBuilder.processDeleteButton(ctx, btnId);
        }

        // Kino moduli callbacklari
        if (data.startsWith('bot_cinema_')) {
            const botId = parseInt(data.replace('bot_cinema_', ''));
            return await movieModule.showCinemaMenu(ctx, botId);
        }
        if (data.startsWith('add_movie_start_')) {
            const botId = parseInt(data.replace('add_movie_start_', ''));
            return await movieModule.startAddMovie(ctx, botId);
        }
        if (data.startsWith('del_movie_start_')) {
            const botId = parseInt(data.replace('del_movie_start_', ''));
            return await movieModule.startDeleteMovie(ctx, botId);
        }

        // Musika moduli callbacklari
        if (data.startsWith('bot_music_')) {
            const botId = parseInt(data.replace('bot_music_', ''));
            return await musicModule.showMusicMenu(ctx, botId);
        }
        if (data.startsWith('add_music_start_')) {
            const botId = parseInt(data.replace('add_music_start_', ''));
            return await musicModule.startAddMusic(ctx, botId);
        }
        if (data.startsWith('del_music_start_')) {
            const botId = parseInt(data.replace('del_music_start_', ''));
            return await musicModule.startDeleteMusic(ctx, botId);
        }

        // Rassilka callbacklari
        if (data.startsWith('bot_broadcast_')) {
            const botId = parseInt(data.replace('bot_broadcast_', ''));
            return await broadcast.startBroadcast(ctx, botId);
        }

        return next();
    });

    // --- DIALOG WIZARD STATE MIDDLEWARE ---
    mainBot.on(['text', 'photo', 'video', 'audio', 'document'], async (ctx, next) => {
        const userId = ctx.from.id;
        const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

        // Asosiy menyu tugmalarini har qanday holatda ushlab qolish
        if (/Yangi [bB]ot [yY]aratish/i.test(text)) {
            await db.clearUserState(userId);
            return await botCreator.startBotCreation(ctx);
        }
        if (/Mening [bB]otlarim/i.test(text)) {
            await db.clearUserState(userId);
            return await botManager.showMyBots(ctx);
        }
        if (/Yordam/i.test(text)) {
            await db.clearUserState(userId);
            return await startHandler.handleHelp(ctx);
        }
        if (/Bekor qilish/i.test(text)) {
            await db.clearUserState(userId);
            return ctx.reply("❌ Amal bekor qilindi.", startHandler.getMainKeyboard());
        }

        const userState = await db.getUserState(userId);
        if (!userState) return next();

        switch (userState.step) {
            case 'WAITING_BOT_TOKEN':
                return await botCreator.processBotToken(ctx);
            case 'ADD_BTN_TEXT':
                return await buttonBuilder.processButtonText(ctx);
            case 'ADD_BTN_CONTENT':
                return await buttonBuilder.processButtonContent(ctx);
            case 'ADD_MOVIE_CODE':
                return await movieModule.processMovieCode(ctx);
            case 'ADD_MOVIE_TITLE':
                return await movieModule.processMovieTitle(ctx);
            case 'ADD_MOVIE_FILE':
                return await movieModule.processMovieFile(ctx);
            case 'ADD_MUSIC_FILE':
                return await musicModule.processMusicFile(ctx);
            case 'ADD_MUSIC_TITLE':
                return await musicModule.processMusicTitle(ctx);
            case 'ADD_MUSIC_ARTIST':
                return await musicModule.processMusicArtist(ctx);
            case 'WAITING_BROADCAST_MSG':
                return await broadcast.processBroadcast(ctx);

            // 7 ta yangi modullar dialog adimlar
            case 'ADD_CHAN_USERNAME':
                return await channelModule.processChannelUsername(ctx);
            case 'ADD_KW_TEXT':
                return await keywordModule.processKeywordText(ctx);
            case 'ADD_KW_RESPONSE':
                return await keywordModule.processKeywordResponse(ctx);
            case 'ADD_PROMO_CODE':
                return await promoModule.processPromoCode(ctx);
            case 'ADD_PROMO_REWARD':
                return await promoModule.processPromoReward(ctx);
            case 'EDIT_WELCOME_MSG':
                return await welcomeModule.processWelcomeMsg(ctx);
            case 'BAN_USER_ID':
                return await banModule.processBanUserId(ctx);

            default:
                return next();
        }
    });

    const me = await mainBot.telegram.getMe();
    console.log(`🤖 Asosiy Konstruktor Bot ishga tushmoqda: @${me.username}`);

    await launchMainBot(mainBot);

    process.once('SIGINT', () => mainBot.stop('SIGINT'));
    process.once('SIGTERM', () => mainBot.stop('SIGTERM'));
}

main().catch(err => {
    console.error("❌ Ishga tushirishda kutilmagan xatolik:", err);
});
