# Деплой на Cloudflare

## Структура

```
cf-worker/     # Cloudflare Worker (бэкенд)
cf-pages/      # Cloudflare Pages (фронтенд)
```

---

## 1. Деплой бэкенда (Cloudflare Worker)

### Установка

```bash
cd cf-worker
npm install
```

### Настройка

Откройте `wrangler.toml` и заполните переменные:

```toml
[vars]
TELEGRAM_BOT_TOKEN = "ваш_токен_бота"
ICAFE_API_KEY = "ваш_ключ_icafe"
ICAFE_CLUB_ID = "ваш_club_id"
FRONTEND_URL = "https://ваш-домен.pages.dev"
DEV_MODE = "false"
```

Или используйте Cloudflare Dashboard:
1. Перейдите в Workers & Pages
2. Выберите ваш Worker
3. Settings → Variables
4. Добавьте переменные

### Деплой

```bash
npx wrangler deploy
```

После деплоя вы получите URL вида:
```
https://pc-club-worker.username.workers.dev
```

---

## 2. Деплой фронтенда (Cloudflare Pages)

### Вариант A: Через Dashboard

1. Перейдите в Cloudflare Dashboard
2. Workers & Pages → Create → Pages
3. Загрузите папку `cf-pages`
4. Нажмите Deploy

### Вариант B: Через Wrangler

```bash
cd cf-pages
npx wrangler pages deploy . --project-name=pc-club-webapp
```

### Настройка

После деплоя:
1. Скопируйте URL Worker'а
2. Откройте `cf-pages/config.js`
3. Замените `API_BASE_URL` на URL Worker'а:
   ```javascript
   API_BASE_URL: "https://pc-club-worker.username.workers.dev/api"
   ```
4. Передеплойте фронтенд

---

## 3. Настройка Telegram бота

1. Откройте @BotFather
2. `/newbot` — создайте бота
3. `/setmenubutton` — установите WebApp URL:
   ```
   https://ваш-домен.pages.dev
   ```

---

## 4. Кастомный домен (опционально)

### Для Pages:
1. Cloudflare Dashboard → Pages → ваш проект
2. Custom domains → Add custom domain
3. Следуйте инструкциям

### Для Worker:
1. Cloudflare Dashboard → Workers → ваш Worker
2. Triggers → Custom Domains
3. Добавьте домен

---

## 5. Замена заглушек на реальные данные

В `cf-worker/src/index.js` найдите функции-заглушки и замените на реальные вызовы:

- `getComputers()` — `icafeRequest(env, "/computers")`
- `getStats()` — статистика из списка ПК
- `getProfile(auth)` — `icafeRequest(env, "/profile")`
- `getBookings(auth)` — `icafeRequest(env, "/bookings")`
- `getLoyalty(auth)` — `icafeRequest(env, "/loyalty")`

Документация API: https://dev.icafecloud.com/docs/

---

## Переменные окружения

| Переменная | Где взять |
|------------|-----------|
| `TELEGRAM_BOT_TOKEN` | @BotFather → /newbot |
| `ICAFE_API_KEY` | Панель iCafeCloud → API |
| `ICAFE_CLUB_ID` | Панель iCafeCloud → ваш клуб |
| `FRONTEND_URL` | URL вашего Pages проекта |

---

## Локальная разработка

### Worker:
```bash
cd cf-worker
npm run dev
```

### Pages:
Откройте `cf-pages/index.html` в браузере или используйте:
```bash
cd cf-pages
npx wrangler pages dev .
```
