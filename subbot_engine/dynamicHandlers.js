const { Markup } = require('telegraf');
const db = require('../database');
const globalMusic = require('./globalMusic');
const globalCinema = require('./globalCinema');

/**
 * Sub-bot uchun dinamik handlerlarni sozlaydi.
 * @param {Telegraf} botInstance 
 * @param {Object} botData 
 */
function setupSubBotHandlers(botInstance, botData) {
    const botId = botData.id;

    // 1. Bloklanganlar va Obunachini ro'yxatga olish Middleware
    botInstance.use(async (ctx, next) => {
        if (ctx.from && ctx.from.id) {
            const userId = ctx.from.id;

            // Ban tekshiruvi
            const banned = await db.isUserBanned(botId, userId);
            if (banned) {
                if (ctx.callbackQuery) {
                    return ctx.answerCbQuery("⛔️ Siz ushbu botdan bloklangansiz!", { show_alert: true });
                }
                return ctx.reply("⛔️ **Siz ushbu botdan bloklangansiz!**", { parse_mode: 'Markdown' });
            }

            // Referal parametrini tekshirish (/start ref_12345)
            let referrerId = null;
            if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start ref_')) {
                const parts = ctx.message.text.split(' ');
                if (parts[1] && parts[1].startsWith('ref_')) {
                    const refVal = parseInt(parts[1].replace('ref_', ''));
                    if (refVal && refVal !== userId) {
                        referrerId = refVal;
                    }
                }
            }

            try {
                await db.addSubbotUser(botId, userId, referrerId);
            } catch (err) {
                // Ignore
            }
        }
        return next();
    });

    // 2. Telegram INLINE MODE QIDIRUV (`@botusername qo'shiq_nomi`)
    botInstance.on('inline_query', async (ctx) => {
        const query = ctx.inlineQuery.query.trim();
        if (!query) return ctx.answerInlineQuery([]);

        try {
            const results = await globalMusic.searchGlobalMusic(query);
            const inlineResults = results.slice(0, 10).map(song => ({
                type: 'audio',
                id: song.id,
                audio_url: song.preview,
                title: song.title,
                performer: song.artist,
                audio_duration: song.duration,
                caption: `🎵 **${song.title}** - ${song.artist}\n🤖 Bot: @${botData.bot_username}`
            }));

            await ctx.answerInlineQuery(inlineResults, { cache_time: 300 });
        } catch (err) {
            console.error("Inline query error:", err.message);
        }
    });

    // Majburiy Obunani tekshiruvchi yordamchi funksiya
    async function checkMandatorySubscription(ctx) {
        const channels = await db.getBotChannels(botId);
        if (!channels || channels.length === 0) return true;

        const userId = ctx.from.id;
        const unsubscribed = [];

        for (const ch of channels) {
            try {
                const member = await ctx.telegram.getChatMember(ch.channel_username, userId);
                if (['left', 'kicked'].includes(member.status)) {
                    unsubscribed.push(ch);
                }
            } catch (err) {
                // Bot kanalda admin emas bo'lsa ham o'tkazib yuboramiz
            }
        }

        if (unsubscribed.length > 0) {
            const inlineRows = unsubscribed.map(ch => [
                Markup.button.url(`📢 ${ch.channel_title || ch.channel_username}`, `https://t.me/${ch.channel_username.replace('@', '')}`)
            ]);
            inlineRows.push([Markup.button.callback('✅ Obunani Tekshirish', 'check_sub_status')]);

            const subMsg = 
                `🔒 **BOTDAN FOYDALANISH UCHUN MAJBURIY OBUNA**\n` +
                `═════════════════════════════════\n\n` +
                `Quyidagi kanallarga obuna bo'ling va **"✅ Obunani Tekshirish"** tugmasini bosing:`;

            if (ctx.callbackQuery) {
                await ctx.answerCbQuery("⚠️ Iltimos, barcha kanallarga obuna bo'ling!", { show_alert: true });
                await ctx.reply(subMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineRows) });
            } else {
                await ctx.reply(subMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineRows) });
            }
            return false;
        }

        return true;
    }

    // Obunani tekshirish inline button callback
    botInstance.action('check_sub_status', async (ctx) => {
        const isOk = await checkMandatorySubscription(ctx);
        if (isOk) {
            await ctx.answerCbQuery("✅ Rahmat! Obunangiz tasdiqlandi.", { show_alert: true });
            await ctx.reply("🎉 Obuna muvaffaqiyatli tekshirildi! Botdan erkin foydalanishingiz mumkin. /start yuboring.");
        }
    });

    // /start buyrug'i
    botInstance.start(async (ctx) => {
        try {
            const isSubOk = await checkMandatorySubscription(ctx);
            if (!isSubOk) return;

            const buttons = await db.getBotButtons(botId, null);
            const replyButtons = buttons.filter(b => b.button_type === 'reply');

            let keyboardRows = [];
            if (replyButtons.length > 0) {
                for (let i = 0; i < replyButtons.length; i += 2) {
                    const row = replyButtons.slice(i, i + 2).map(b => b.button_text);
                    keyboardRows.push(row);
                }
            }

            if (botData.bot_type === 'music') {
                keyboardRows.push(['🎵 Musika Qidirish', '🔥 Hafta Xitlari']);
                keyboardRows.push(['🎶 TOP O\'zbek Qo\'shiqlari', '🌍 Xorijiy Xitlar']);
                keyboardRows.push(['👥 Referal Havolam', '👤 Profilim']);
            } else if (botData.bot_type === 'cinema') {
                keyboardRows.push(['🎬 Kinolar Katalogi', '👥 Referal Havolam']);
                keyboardRows.push(['👤 Profilim']);
            } else {
                keyboardRows.push(['🎵 Musika Qidirish', '🔥 Hafta Xitlari']);
                keyboardRows.push(['👥 Referal Havolam', '👤 Profilim']);
            }

            const keyboardMarkup = Markup.keyboard(keyboardRows).resize();

            // Welcome xabari (Moslashtirilgan yoki Sukut bo'yicha)
            let welcomeMsg = botData.welcome_text || `👋 Assalomu alaykum! **${botData.bot_name}** botiga xush kelibsiz!`;
            if (botData.bot_type === 'cinema' && !botData.welcome_text) {
                welcomeMsg += `\n\n🎬 **Kino kodi (masalan: 101, 102) yoki kino nomini yuboring va kinoni tomosha qiling!**`;
            } else if (botData.bot_type === 'music' && !botData.welcome_text) {
                welcomeMsg += `\n\n🎵 **Dunyodagi har qanday qo'shiq nomi yoki ijrochi ismini yuboring!**\n⚡️ *Inline Mode:* Har qanday chatda \`@${botData.bot_username} qo'shiq_nomi\` yozib do'stlaringizga yuborishingiz mumkin!`;
            }

            const extraOpts = { parse_mode: 'Markdown', ...keyboardMarkup };

            if (botData.welcome_media_id) {
                if (botData.welcome_media_type === 'photo') {
                    await ctx.replyWithPhoto(botData.welcome_media_id, { caption: welcomeMsg, ...extraOpts });
                } else if (botData.welcome_media_type === 'video') {
                    await ctx.replyWithVideo(botData.welcome_media_id, { caption: welcomeMsg, ...extraOpts });
                } else {
                    await ctx.reply(welcomeMsg, extraOpts);
                }
            } else {
                await ctx.reply(welcomeMsg, extraOpts);
            }
        } catch (err) {
            console.error(`Sub-bot ${botId} start error:`, err);
        }
    });

    // Inline button bosilganda
    botInstance.action(/^btn_(\d+)$/, async (ctx) => {
        try {
            const isSubOk = await checkMandatorySubscription(ctx);
            if (!isSubOk) return;

            const buttonId = parseInt(ctx.match[1]);
            const btn = await db.getButtonById(buttonId);
            if (!btn) {
                return ctx.answerCbQuery("Tugma topilmadi.");
            }

            await ctx.answerCbQuery();
            await sendButtonResponse(ctx, btn);
        } catch (err) {
            console.error(`Inline button action error:`, err);
        }
    });

    // Barcha matnli xabarlar uchun handler
    botInstance.on('text', async (ctx) => {
        const isSubOk = await checkMandatorySubscription(ctx);
        if (!isSubOk) return;

        const text = ctx.message.text.trim();

        // 1. Referal buyrug'i (/ref yoki "👥 Referal Havolam")
        if (text === '/ref' || text === '👥 Referal Havolam' || text === '👥 Referallarim') {
            const userId = ctx.from.id;
            const refCount = await db.getReferralCount(botId, userId);
            const refLink = `https://t.me/${botData.bot_username}?start=ref_${userId}`;
            const refMsg = 
                `👥 **SIZNING TAKLIFNOMA (REFERAL) HAVOLANGIZ**\n` +
                `═════════════════════════════════\n\n` +
                `Do'stlaringizga yuboring va taklif qiling:\n` +
                `🔗 \`${refLink}\`\n\n` +
                `📊 Siz taklif qilgan do'stlar soni: **${refCount}** ta`;
            return await ctx.reply(refMsg, { parse_mode: 'Markdown' });
        }

        // 2. Foydalanuvchi Profili ("👤 Profilim")
        if (text === '👤 Profilim') {
            const userId = ctx.from.id;
            const refCount = await db.getReferralCount(botId, userId);
            const profileMsg = 
                `👤 **FOYDALANUVCHI PROFILI**\n` +
                `═════════════════════════════════\n\n` +
                `🆔 **Telegram ID:** \`${userId}\`\n` +
                `👤 **Ismingiz:** ${ctx.from.first_name || 'Foydalanuvchi'}\n` +
                `🌐 **Username:** @${ctx.from.username || 'yo\'q'}\n` +
                `👥 **Taklif qilgan do'stlaringiz:** ${refCount} ta\n` +
                `👑 **Maqomingiz:** Faol Foydalanuvchi`;
            return await ctx.reply(profileMsg, { parse_mode: 'Markdown' });
        }

        // 3. Kinolar Katalogi ("🎬 Kinolar Katalogi")
        if (text === '🎬 Kinolar Katalogi') {
            await ctx.reply("🎬 **TOP KINOLAR KATALOGI:**\n\n101 - Qasoskorlar: Intiho\n102 - Avatar 2: Suv Yo'li\n103 - Oppenxaymer\n104 - Forsaj 10\n105 - O'rgimchak Odam: Uyga Yo'l Yo'q\n106 - Interstellar\n\nKinoni ko'rish uchun mos kodni (masalan: 101) yuboring!", { parse_mode: 'Markdown' });
            return;
        }

        // 4. Hafta Xitlari ("🔥 Hafta Xitlari")
        if (text === '🔥 Hafta Xitlari') {
            await ctx.reply("⏳ **Dunyodagi eng mashhur Hafta Xitlari yuklanmoqda...**", { parse_mode: 'Markdown' });
            const topTracks = await globalMusic.getTopTrendingMusic();
            if (topTracks.length > 0) {
                await ctx.reply(`🔥 **DUNYO BO'YICHA TOP 10 HAFTA XITLARI:**`, { parse_mode: 'Markdown' });
                for (const song of topTracks) {
                    const captionMsg = `🔥 **${song.title}** - ${song.artist}\n🤖 Bot: @${botData.bot_username}`;
                    if (song.cover && song.preview) {
                        await ctx.replyWithPhoto(song.cover, {
                            caption: captionMsg,
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([[Markup.button.url('🎧 MP3 Eshitish', song.preview)]])
                        });
                    } else if (song.preview) {
                        await ctx.replyWithAudio(song.preview, {
                            caption: captionMsg,
                            parse_mode: 'Markdown'
                        });
                    }
                    await new Promise(res => setTimeout(res, 100));
                }
                return;
            }
            return await ctx.reply("😔 Hozircha hafta xitlari topilmadi. Keyinroq qayta urinib ko'ring.", { parse_mode: 'Markdown' });
        }

        // Musika Qidirish tugmasi
        if (text === '🎵 Musika Qidirish') {
            return await ctx.reply(
                `🎵 **MUSIKA QIDIRUV TIZIMI**\n` +
                `═════════════════════════\n\n` +
                `🔍 Istalgan qo'shiq nomini yoki ijrochi ismini yozing!\n\n` +
                `✨ Misol: \`Benom guruhi\`, \`Ushbu dunyo\`, \`Shaxriyor\`\n\n` +
                `🌍 O'zbek, Rus, Ingliz va boshqa tillardagi qo'shiqlarni qidirish mumkin!`,
                { parse_mode: 'Markdown' }
            );
        }

        // TOP O'zbek Qo'shiqlari
        if (text === "🎶 TOP O'zbek Qo'shiqlari") {
            await ctx.reply("⏳ **O'zbek musiqalari yuklanmoqda...**", { parse_mode: 'Markdown' });
            const uzbekMusic = await globalMusic.searchGlobalMusic('uzbek music top');
            if (uzbekMusic && uzbekMusic.length > 0) {
                await ctx.reply(`🎶 **O'ZBEK MUSIQALARI TOP:**`, { parse_mode: 'Markdown' });
                for (const song of uzbekMusic.slice(0, 5)) {
                    const captionMsg = `🎶 **${song.title}** - ${song.artist}\n🤖 Bot: @${botData.bot_username}`;
                    if (song.cover && song.preview) {
                        await ctx.replyWithPhoto(song.cover, {
                            caption: captionMsg,
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([[Markup.button.url('🎧 MP3 Eshitish', song.preview)]])
                        });
                    } else if (song.preview) {
                        await ctx.replyWithAudio(song.preview, { caption: captionMsg, parse_mode: 'Markdown' });
                    }
                    await new Promise(res => setTimeout(res, 100));
                }
                return;
            }
            return await ctx.reply("😔 Hozircha natija topilmadi.", { parse_mode: 'Markdown' });
        }

        // Xorijiy Xitlar
        if (text === '🌍 Xorijiy Xitlar') {
            await ctx.reply("⏳ **Xorijiy xitlar yuklanmoqda...**", { parse_mode: 'Markdown' });
            const foreignMusic = await globalMusic.getTopTrendingMusic();
            if (foreignMusic && foreignMusic.length > 0) {
                await ctx.reply(`🌍 **XORIJIY TOP XITLAR:**`, { parse_mode: 'Markdown' });
                for (const song of foreignMusic.slice(0, 5)) {
                    const captionMsg = `🌍 **${song.title}** - ${song.artist}\n🤖 Bot: @${botData.bot_username}`;
                    if (song.cover && song.preview) {
                        await ctx.replyWithPhoto(song.cover, {
                            caption: captionMsg,
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([[Markup.button.url('🎧 MP3 Eshitish', song.preview)]])
                        });
                    } else if (song.preview) {
                        await ctx.replyWithAudio(song.preview, { caption: captionMsg, parse_mode: 'Markdown' });
                    }
                    await new Promise(res => setTimeout(res, 100));
                }
                return;
            }
            return await ctx.reply("😔 Hozircha natija topilmadi.", { parse_mode: 'Markdown' });
        }

        // 5. Promokodlar tekshiruvi (/promo CODE yoki to'g'ridan to'g'ri kod)
        let promoCodeInput = text;
        if (text.startsWith('/promo ')) {
            promoCodeInput = text.replace('/promo ', '').trim();
        }

        const promoRes = await db.usePromocode(botId, promoCodeInput, ctx.from.id);
        if (promoRes.status === 'SUCCESS') {
            const p = promoRes.promo;
            const rewardMsg = `🎉 **Promokod qabul qilindi!**\n\n${p.reward_text}`;
            if (p.response_type === 'photo' && p.file_id) {
                return await ctx.replyWithPhoto(p.file_id, { caption: rewardMsg, parse_mode: 'Markdown' });
            } else if (p.response_type === 'video' && p.file_id) {
                return await ctx.replyWithVideo(p.file_id, { caption: rewardMsg, parse_mode: 'Markdown' });
            } else {
                return await ctx.reply(rewardMsg, { parse_mode: 'Markdown' });
            }
        } else if (promoRes.status === 'ALREADY_USED') {
            return await ctx.reply("⚠️ Siz ushbu promokoddan allaqachon foydalangansiz!");
        } else if (promoRes.status === 'EXPIRED') {
            return await ctx.reply("⚠️ Ushbu promokodning ishlatilish limiti tugagan!");
        }

        // 6. Kalit so'zlar (Keywords) tekshiruvi
        const keywords = await db.getBotKeywords(botId);
        const matchedKw = keywords.find(k => k.keyword.toLowerCase() === text.toLowerCase());
        if (matchedKw) {
            if (matchedKw.response_type === 'photo' && matchedKw.file_id) {
                return await ctx.replyWithPhoto(matchedKw.file_id, { caption: matchedKw.response_text, parse_mode: 'Markdown' });
            } else if (matchedKw.response_type === 'video' && matchedKw.file_id) {
                return await ctx.replyWithVideo(matchedKw.file_id, { caption: matchedKw.response_text, parse_mode: 'Markdown' });
            } else {
                return await ctx.reply(matchedKw.response_text, { parse_mode: 'Markdown' });
            }
        }

        // 7. Knopka tekshiruvi
        const buttons = await db.getBotButtons(botId);
        const matchedBtn = buttons.find(b => b.button_text.toLowerCase() === text.toLowerCase());
        if (matchedBtn) {
            return await sendButtonResponse(ctx, matchedBtn);
        }

        // 8. Kino Bot moduli tekshiruvi (Kino kodi yoki nomi bo'yicha)
        if (botData.bot_type === 'cinema' || botData.bot_type === 'custom') {
            // A. Avval lokal bazani tekshiramiz
            const localMovie = await db.searchMovie(botId, text);
            if (localMovie) {
                const captionText = localMovie.caption || `🎬 **${localMovie.title}**\nKod: \`${localMovie.code}\``;
                return await ctx.replyWithVideo(localMovie.file_id, {
                    caption: captionText,
                    parse_mode: 'Markdown'
                });
            }

            // B. Agar lokal bazada bo'lmasa -> GLOBAL KINO ENGINE orqali qidiramiz
            const globalMovie = await globalCinema.searchGlobalCinema(text);
            if (globalMovie) {
                const movieCaption = 
                    `🎬 **${globalMovie.title}** (${globalMovie.year})\n` +
                    `🎭 Janri: ${globalMovie.genre}\n` +
                    `⭐️ Reyting: ${globalMovie.rating}\n\n` +
                    `📝 ${globalMovie.description}\n\n` +
                    `🤖 Bot: @${botData.bot_username}`;

                if (globalMovie.poster) {
                    return await ctx.replyWithPhoto(globalMovie.poster, {
                        caption: movieCaption,
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[Markup.button.url('🍿 Kinoni Tomosha Qilish (HD)', globalMovie.video_url)]])
                    });
                } else {
                    return await ctx.replyWithVideo(globalMovie.video_url, {
                        caption: movieCaption,
                        parse_mode: 'Markdown'
                    });
                }
            }
        }

        // 9. Musika Bot moduli tekshiruvi (Lokal va GLOBAL Dunyo Qidiruvi)
        if (botData.bot_type === 'music' || botData.bot_type === 'custom') {
            const localMusic = await db.searchMusic(botId, text);
            if (localMusic && localMusic.length > 0) {
                await ctx.reply(`🎵 **${localMusic.length}** ta musika lokal bazadan topildi:`, { parse_mode: 'Markdown' });
                for (const song of localMusic) {
                    await ctx.replyWithAudio(song.file_id, {
                        caption: `🎵 **${song.title}** ${song.artist ? `- ${song.artist}` : ''}`,
                        parse_mode: 'Markdown',
                        ...(song.cover_file_id ? { thumbnail: song.cover_file_id } : {})
                    });
                }
                return;
            }

            await ctx.reply(`🌍 **"${text}" bo'yicha dunyo bo'yicha musika qidirilmoqda...**`, { parse_mode: 'Markdown' });
            const globalResults = await globalMusic.searchGlobalMusic(text);

            if (globalResults && globalResults.length > 0) {
                await ctx.reply(`🎉 **Dunyo bo'yicha ${globalResults.length} ta musika topildi:**`, { parse_mode: 'Markdown' });
                for (const song of globalResults.slice(0, 5)) {
                    const captionMsg = `🎵 **${song.title}** - ${song.artist}\n💿 Albom: ${song.album || 'Single'}\n🤖 Bot: @${botData.bot_username}`;
                    if (song.cover) {
                        await ctx.replyWithPhoto(song.cover, {
                            caption: captionMsg,
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([[Markup.button.url('🎧 MP3 Eshitish', song.preview)]])
                        });
                    } else {
                        await ctx.replyWithAudio(song.preview, {
                            caption: captionMsg,
                            parse_mode: 'Markdown'
                        });
                    }
                    await new Promise(res => setTimeout(res, 100));
                }
                return;
            }
        }

        // Agar hech qaysisi mos kelmasa
        if (botData.bot_type === 'cinema') {
            return await ctx.reply(`🎬 **"${text}"** kodli yoki nomli kino topilmadi. Iltimos, to'g'ri kod kiritganingizni tekshiring.`, { parse_mode: 'Markdown' });
        }
        if (botData.bot_type === 'music') {
            return await ctx.reply(`🎵 **"${text}"** bo'yicha hech qanday musika topilmadi. Qayta urinib ko'ring!`, { parse_mode: 'Markdown' });
        }
    });
}

async function sendButtonResponse(ctx, button) {
    const childButtons = await db.getBotButtons(button.bot_id, button.id);
    const inlineButtons = childButtons.filter(b => b.button_type === 'inline');

    let extraOptions = {};
    if (inlineButtons.length > 0) {
        const inlineRows = inlineButtons.map(b => {
            if (b.response_type === 'url' && b.url) {
                return [Markup.button.url(b.button_text, b.url)];
            } else {
                return [Markup.button.callback(b.button_text, `btn_${b.id}`)];
            }
        });
        extraOptions = Markup.inlineKeyboard(inlineRows);
    }

    const type = button.response_type;
    const content = button.response_content;
    const caption = button.caption || '';

    switch (type) {
        case 'photo':
            await ctx.replyWithPhoto(content, { caption, parse_mode: 'Markdown', ...extraOptions });
            break;
        case 'video':
            await ctx.replyWithVideo(content, { caption, parse_mode: 'Markdown', ...extraOptions });
            break;
        case 'audio':
            await ctx.replyWithAudio(content, { caption, parse_mode: 'Markdown', ...extraOptions });
            break;
        case 'document':
            await ctx.replyWithDocument(content, { caption, parse_mode: 'Markdown', ...extraOptions });
            break;
        case 'url':
            await ctx.reply(content, { parse_mode: 'Markdown', ...extraOptions });
            break;
        case 'text':
        default:
            await ctx.reply(content, { parse_mode: 'Markdown', ...extraOptions });
            break;
    }
}

module.exports = { setupSubBotHandlers };
