const { Telegraf } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://pc-club-webapp.pages.dev";

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
  ctx.reply(
    "Добро пожаловать в ПК-клуб! 🎮\n\nЧтобы забронировать ПК, перейдите в наше приложение:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть приложение",
              web_app: { url: WEBAPP_URL }
            }
          ]
        ]
      }
    }
  );
});

// Команда /help
bot.help((ctx) => {
  ctx.reply(
    "Доступные команды:\n\n" +
    "/start - Запустить бота\n" +
    "/book - Забронировать ПК\n" +
    "/help - Помощь"
  );
});

// Команда /book — сразу открыть WebApp
bot.command("book", (ctx) => {
  ctx.reply("Нажмите кнопку, чтобы забронировать ПК:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Забронировать ПК",
            web_app: { url: WEBAPP_URL }
          }
        ]
      ]
    }
  });
});

// Обработка данных из WebApp
bot.on("web_app_data", (ctx) => {
  const data = ctx.message.web_app_data.data;
  ctx.reply(`Получены данные из приложения: ${data}`);
});

// Запуск
bot.launch();
console.log("Бот запущен!");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
