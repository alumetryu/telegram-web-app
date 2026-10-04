// ===== КОНФИГУРАЦИЯ =====
// Вставьте свои данные перед запуском

const CONFIG = {
  // Название клуба (отображается в шапке)
  CLUB_NAME: "Ваш Клуб",

  // URL бэкенда (middleware между WebApp и iCafeCloud)
  // Пример: "https://your-server.com/api" или "http://localhost:3000/api"
  API_BASE_URL: "https://YOUR_SERVER/api",

  // Telegram WebApp — токен бота не нужен здесь,
  // он используется только на бэкенде для валидации initData

  // iCafeCloud — данные подключения (используются на бэкенде)
  ICAFE_API_URL: "https://cp.icafecloud.com/api",
  ICAFE_API_KEY: "YOUR_ICAFE_API_KEY",

  // Интервал автообновления данных (мс)
  POLL_INTERVAL: 15000,

  // Время удержания брони (минуты)
  HOLD_MINUTES: 30,

  // Валюта
  CURRENCY: "сум",

  // Часовой пояс
  TIMEZONE: "Asia/Tashkent"
};
