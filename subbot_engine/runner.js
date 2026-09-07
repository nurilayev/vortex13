const { Telegraf } = require('telegraf');
const db = require('../database');
const config = require('../config');
const { setupSubBotHandlers } = require('./dynamicHandlers');

class SubBotRunner {
    constructor() {
        this.activeBots = new Map(); // botId -> { instance, data, username }
        this.monitorInterval = null;
    }

    /**
     * Bitta sub-botni 24/7 rejimda ishga tushiradi.
     */
    async startBot(botData) {
        if (!botData || !botData.bot_token) return false;

        if (this.activeBots.has(botData.id)) {
            await this.stopBot(botData.id);
        }

        try {
            const botInstance = new Telegraf(botData.bot_token, {
                telegram: { agent: config.httpsAgent }
            });

            // Global error catch for sub-bot (prevents network drops / parse crashes)
            botInstance.catch((err, ctx) => {
                console.error(`⚠️ Sub-bot @${botData.bot_username || botData.id} error caught:`, err.message);
            });
            
            const me = await botInstance.telegram.getMe();
            console.log(`🤖 Sub-bot 24/7 Avto-Host rejimida ishga tushmoqda: @${me.username} (ID: ${botData.id})`);

            // Dynamic Handlerlarni ulash
            setupSubBotHandlers(botInstance, botData);

            // Botni polling rejimida ishga tushirish
            botInstance.launch({
                dropPendingUpdates: true
            }).catch(err => {
                console.error(`❌ Sub-bot @${me.username} launch xatosi:`, err.message);
            });

            this.activeBots.set(botData.id, {
                instance: botInstance,
                data: botData,
                username: me.username
            });

            return true;
        } catch (err) {
            console.error(`❌ Sub-bot (ID: ${botData.id}) 24/7 ishga tushirishda xatolik:`, err.message);
            return false;
        }
    }

    /**
     * Sub-botni to'xtatadi.
     */
    async stopBot(botId) {
        if (this.activeBots.has(botId)) {
            const botObj = this.activeBots.get(botId);
            try {
                botObj.instance.stop('Bot stopped');
                console.log(`🛑 Sub-bot to'xtatildi: ID ${botId}`);
            } catch (err) {
                console.error(`Sub-bot stop error:`, err.message);
            }
            this.activeBots.delete(botId);
        }
    }

    /**
     * Sub-botni qayta ishga tushiradi.
     */
    async restartBot(botData) {
        await this.stopBot(botData.id);
        return await this.startBot(botData);
    }

    /**
     * Barcha faol sub-botlarni bazadan yuklab 24/7 ishga tushiradi.
     */
    async loadAndStartAllBots() {
        console.log("🔄 Bazadagi barcha foydalanuvchilar sub-botlari 24/7 Avto-Host rejimida ishga tushirilmoqda...");
        const bots = await db.getAllActiveBots();
        let count = 0;
        for (const botData of bots) {
            const success = await this.startBot(botData);
            if (success) count++;
        }
        console.log(`✅ Jami ${count} ta sub-bot 100% 24/7 Avto-Host rejimida faol.`);

        // 24/7 Auto-Host Monitoring Loop'ni yoqish (har 30s)
        this.startAutoHostMonitor();
    }

    /**
     * 100% 24/7 Uzluksiz Avto-Host Monitoring (Har 30 soniyada tekshiradi va tiklaydi)
     */
    startAutoHostMonitor() {
        if (this.monitorInterval) return;

        this.monitorInterval = setInterval(async () => {
            try {
                const bots = await db.getAllActiveBots();
                for (const botData of bots) {
                    if (!this.activeBots.has(botData.id)) {
                        console.log(`⚡️ Avto-Host: Sub-bot (ID: ${botData.id}) qayta tiklanmoqda...`);
                        await this.startBot(botData);
                    }
                }
            } catch (err) {
                console.error("AutoHost monitor error:", err.message);
            }
        }, 30000);
    }

    /**
     * Bot instance o'zgaruvchisini olish (Rassilka uchun).
     */
    getBotInstance(botId) {
        const botObj = this.activeBots.get(botId);
        return botObj ? botObj.instance : null;
    }
}

module.exports = new SubBotRunner();
