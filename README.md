# Telegram Mini App для ПК-клуба

Telegram Mini App для управления ПК-клубом: карта компьютеров, бронирование, профиль пользователя, баланс и программа лояльности.

Проект состоит из фронтенда на чистом HTML/CSS/JS, бэкенда на **Express**, отдельного Telegram-бота на **Telegraf** и дополнительных сборок для деплоя через **Cloudflare Pages/Workers**.

## Что умеет приложение

- показывает карту ПК и помогает выбирать свободные машины;
- позволяет бронировать ПК и запускать сессию;
- отображает профиль, баланс, бонусы и историю операций;
- поддерживает авторизацию через Telegram WebApp и через iCafe;
- отправляет пользователям кнопку открытия Mini App из Telegram-бота.

## Стек

- HTML, CSS, JavaScript
- Node.js, Express, Telegraf
- Cloudflare Pages / Cloudflare Workers
- iCafeCloud API

## Структура

```
telegram_web_app/
├── index.html           # фронтенд Mini App
├── style.css            # стили
├── config.js            # настройки фронтенда
├── api.js               # запросы к бэкенду
├── app.js               # логика приложения
├── server/              # бэкенд (middleware)
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── bot/                 # Telegram-бот
│   ├── index.js
│   └── package.json
├── cf-pages/            # фронтенд для Cloudflare Pages
└── cf-worker/           # бэкенд для Cloudflare Workers
```

## Быстрый старт

### 1. Настройте бэкенд

```bash
cd server
npm install
cp .env.example .env
```

В `.env` нужно заполнить:

- `TELEGRAM_BOT_TOKEN`
- `ICAFE_API_KEY`
- `ICAFE_CLUB_ID`
- остальные переменные по необходимости

### 2. Настройте фронтенд

В `config.js` укажите:

- `API_BASE_URL` — адрес бэкенда
- `CLUB_NAME` — название клуба

### 3. Запустите сервер

```bash
cd server
npm start
```

### 4. Запустите бота

```bash
cd bot
npm install
npm start
```

### 5. Настройте Telegram-бота

Через `@BotFather`:

- создайте бота командой `/newbot`
- установите WebApp через `/setmenubutton`

## Деплой

Проект также подготовлен для Cloudflare:

- `cf-pages` — фронтенд на Cloudflare Pages
- `cf-worker` — бэкенд на Cloudflare Workers
- инструкции по деплою описаны в `DEPLOY.md`

## Важно

- секреты и токены не хранятся в коде;
- для настройки проекта используются `.env` / переменные окружения;
- реальные данные iCafeCloud подключаются вместо заглушек при деплое.
