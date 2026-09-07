# 🤖 Telegram Bot Konstruktor (Node.js & Telegraf)

Ushbu platforma foydalanuvchilarga **hech qanday dasturlash kodini yozmasdan (No-Code)** Telegram'da shaxsiy botlarini yaratish, boshqarish, tugmalar yasash, kino va musika botlarini ishga tushirish hamda a'zolarga rassilka yuborish imkonini beruvchi mukammal **Node.js** bot loyihasidir.

---

## ✨ Asosiy Imkoniyatlar

1. **🤖 Bot Yaratish va Ishga Tushirish**:
   - Telegram'dagi [@BotFather](https://t.me/BotFather) orqali olingan **API Token** yordamida bir necha soniyada yangi sub-bot ro'yxatdan o'tkaziladi.
   - Har bir yaratilgan bot alohida va bir vaqtning o'zida (Multi-bot engine) ishlaydi.

2. **🔘 Knopka va Menyular Yasash (Button Builder)**:
   - **Reply Keyboards (Klaviatura)** va **Inline Keyboards (Xabar ostidagi tugmalar)**.
   - Har bir tugmaga javob biriktirish:
     - 📝 **Matnli xabar**
     - 🖼 **Rasm (Photo)** + Izoh
     - 📹 **Video** + Izoh
     - 🎧 **Audio / Musika**
     - 📁 **Fayl / Hujjat**
     - 🔗 **Web Havola (URL)**

3. **🎬 Kino Bot Moduli**:
   - Kinolarga maxsus kodlar biriktirish (masalan: `101`, `avatar`).
   - Foydalanuvchi botga kod yuborganda bot avtomatik ravishda mos kino video faylini va tavsifini yuboradi.

4. **🎵 Musika Bot Moduli**:
   - Qo'shiqlar va MP3 fayllar bazasini shakllantirish.
   - Qo'shiq nomi yoki ijrochi ismi bo'yicha qidiruv tizimi.

5. **📢 Rassilka (Broadcast) va Statistika**:
   - Yaratilgan sub-bot obunachilariga bitta bosish orqali xabar, rasm yoki video tarqatish.
   - Sub-bot a'zolari soni va statistikasini ko'rish.

---

## 🚀 O'rnatish va Ishga Tushirish

### 1-qadam: Bog'liqliklarni o'rnatish
Terminalda loyiha papkasiga o'ting va quyidagi buyruqni bosing:
```bash
npm install
```

### 2-qadam: Sozlamalar (`.env` fayli)
`.env` faylini oching va Asosiy Konstruktor Botingiz tokenini joylashtiring:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
```
*(Tokenni Telegram'da [@BotFather](https://t.me/BotFather) botiga kirib `/newbot` buyrug'i orqali olasiz)*

### 3-qadam: Botni ishga tushirish
```bash
npm start
```
yoki:
```bash
node index.js
```

---

## 📂 Fayllar Tuzilishi

- `index.js` — Asosiy ishga tushirish va yo'naltirish fayli.
- `config.js` — `.env` muhit o'zgaruvchilarini yuklovchi fayl.
- `database.js` — Pure JS asinxron ma'lumotlar bazasi va CRUD mantiqi.
- `database.json` — Ma'lumotlar bazasi fayli (Avtomatik yaratiladi).
- `handlers/` — Asosiy Konstruktor botining buyruq va dialog mantiqlari:
  - `start.js` — `/start` va asosiy menyular.
  - `botCreator.js` — Token qabul qilish va bot yaratish wizardi.
  - `botManager.js` — Botlar ro'yxati va boshqaruv paneli.
  - `buttonBuilder.js` — Knopka yasash paneli.
  - `movieModule.js` — Kino kodi va videolarini boshqarish.
  - `musicModule.js` — Musika va mp3 fayllarni boshqarish.
  - `broadcast.js` — Obunachilarga xabar tarqatish.
- `subbot_engine/` — Yaratilgan botlarni dinamik boshqaruvchi dvigatel:
  - `runner.js` — Multi-bot ishga tushirish menejeri.
  - `dynamicHandlers.js` — Sub-botlar foydalanuvchilarining so'rovlariga javob berish mantiqi.

---

## 👥 Muallif va Litsenziya
Ushbu loyiha Node.js va Telegraf 4.x asosida ishlab chiqilgan.
