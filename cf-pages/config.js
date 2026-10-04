// ===== КОНФИГУРАЦИЯ =====
// Замените URL на ваш Worker URL

const CONFIG = {
  // Название клуба (отображается в шапке)
  CLUB_NAME: "Ваш Клуб",

  // URL бэкенда (Cloudflare Worker)
  // Замените на ваш Worker URL после деплоя
  API_BASE_URL: "https://YOUR_WORKER_URL.workers.dev/api",

  // Интервал автообновления данных (мс)
  POLL_INTERVAL: 15000,

  // Время удержания брони (минуты)
  HOLD_MINUTES: 30,

  // Валюта
  CURRENCY: "сум",

  // Часовой пояс
  TIMEZONE: "Asia/Tashkent"
};
