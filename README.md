# Telegram Mini App — PC Club Booking System

A Telegram Mini App for managing a PC gaming club: real-time PC map, booking system, user profiles, balance management, and a loyalty program. Built with vanilla HTML/CSS/JS frontend and a Node.js/Express backend.

## Features

- **PC Map** — real-time grid of PCs by zone, filter by availability, click to book
- **Booking** — select time slot, get a price quote, confirm reservation
- **User Profile** — balance, loyalty tier, transaction history
- **Payments** — Payme and Click payment integration
- **Telegram Bot** — Telegraf bot with `/start` and `/book` commands that opens the Mini App
- **Auth** — Telegram WebApp authentication + iCafeCloud login/password fallback
- **Admin-ready** — iCafeCloud API integration for PC data, sessions, and user management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Node.js, Express |
| Bot | Telegraf (Telegram Bot API) |
| Hosting | Cloudflare Pages + Cloudflare Workers |
| External API | iCafeCloud (PC club management platform) |
| Payments | Payme, Click |

## Project Structure

```
├── index.html, style.css     # Frontend (Telegram Mini App)
├── config.js                 # Frontend configuration
├── api.js                    # API client layer
├── app.js                    # Application logic and UI rendering
├── server/                   # Express backend (middleware)
│   ├── server.js             # API server with auth, booking, payments
│   ├── .env.example          # Environment variable template
│   └── package.json
├── bot/                      # Telegram bot (Telegraf)
│   ├── index.js              # Bot with /start, /book, web_app_data handler
│   └── package.json
├── cf-pages/                 # Cloudflare Pages deployment variant
└── cf-worker/                # Cloudflare Workers deployment variant
```

## Getting Started

### 1. Backend setup

```bash
cd server
npm install
cp .env.example .env
# Fill in TELEGRAM_BOT_TOKEN, ICAFE_API_KEY, ICAFE_CLUB_ID
npm start
```

### 2. Frontend setup

Edit `config.js`:
```javascript
API_BASE_URL: "http://localhost:3000/api",  // your backend URL
CLUB_NAME: "Your Club Name",
```

Open `index.html` in a browser or serve it.

### 3. Telegram bot

```bash
cd bot
npm install
# Set BOT_TOKEN and WEBAPP_URL environment variables
npm start
```

### 4. Cloudflare deployment

See `DEPLOY.md` for Cloudflare Pages + Workers deployment instructions.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Get from @BotFather |
| `ICAFE_API_KEY` | iCafeCloud API key |
| `ICAFE_CLUB_ID` | iCafeCloud club identifier |
| `PAYME_MERCHANT_ID` | Payme merchant ID |
| `CLICK_SERVICE_ID` | Click service ID |
| `CLICK_MERCHANT_ID` | Click merchant ID |
| `DEV_MODE` | `true` to skip Telegram validation (dev only) |

## What I Learned

- Building a Telegram Mini App with WebApp API integration
- Server-side Telegram initData validation using HMAC-SHA256
- Express middleware for auth, CORS, and API proxying
- Deploying to Cloudflare Workers (serverless backend) and Pages (static frontend)
- Integrating with third-party payment providers (Payme, Click)
- Telegraf bot framework for Telegram Bot API