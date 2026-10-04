// ===== СЕРВЕР (Middleware: Telegram WebApp ↔ iCafeCloud) =====

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== КОНФИГ =====

const CONFIG = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  icafeApiUrl: process.env.ICAFE_API_URL || "https://cp.icafecloud.com/api",
  icafeApiKey: process.env.ICAFE_API_KEY,
  icafeClubId: process.env.ICAFE_CLUB_ID,
  frontendUrl: process.env.FRONTEND_URL,
  devMode: process.env.DEV_MODE === "true"
};

// ===== MIDDLEWARE =====

app.use(cors({
  origin: CONFIG.frontendUrl || "*",
  credentials: true
}));
app.use(express.json());

// Статические файлы (фронтенд)
app.use(express.static("../"));

// ===== ЛОГИРОВАНИЕ =====

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== iCafeCloud API =====

async function icafeRequest(path, options = {}) {
  const url = `${CONFIG.icafeApiUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${CONFIG.icafeApiKey}`,
    ...options.headers
  };

  const resp = await fetch(url, {
    ...options,
    headers
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `iCafe API error: ${resp.status}`);
  }

  return resp.json();
}

// ===== ВАЛИДАЦИЯ TELEGRAM =====

function validateTelegramInitData(initData) {
  if (CONFIG.devMode) return { valid: true, user: null };

  if (!initData || !CONFIG.telegramBotToken) {
    return { valid: false, user: null };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    // Сортируем параметры
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join("\n");

    // Вычисляем HMAC
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(CONFIG.telegramBotToken)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) {
      return { valid: false, user: null };
    }

    // Проверяем время (не старше 24 часов)
    const authDate = parseInt(urlParams.get("auth_date") || "0");
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, user: null };
    }

    // Извлекаем пользователя
    const userStr = urlParams.get("user");
    const user = userStr ? JSON.parse(userStr) : null;

    return { valid: true, user };
  } catch (e) {
    console.error("Telegram validation error:", e);
    return { valid: false, user: null };
  }
}

// ===== АУТЕНТИФИКАЦИЯ =====

function authenticate(req) {
  // 1. Telegram initData
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("tma ")) {
    const initData = authHeader.slice(4);
    const result = validateTelegramInitData(initData);
    if (result.valid) return { type: "telegram", user: result.user };
  }

  // 2. Telegram user header (fallback)
  const tgUserHeader = req.headers["x-telegram-user"];
  if (tgUserHeader) {
    try {
      const user = JSON.parse(tgUserHeader);
      return { type: "telegram", user };
    } catch {}
  }

  // 3. Local session (iCafe login)
  const localSession = req.headers["x-local-session"];
  if (localSession) {
    return { type: "local", token: localSession };
  }

  // 4. DEV MODE — разрешаем без авторизации
  if (CONFIG.devMode) {
    return {
      type: "dev",
      user: { id: 0, first_name: "Dev", last_name: "User", username: "dev" }
    };
  }

  return null;
}

// ===== ХРАНИЛИЩЕ СЕССИЙ (в памяти, для продакшена — Redis/DB) =====

const sessions = new Map();

function getSessionKey(auth) {
  if (auth.type === "telegram" && auth.user) return `tg:${auth.user.id}`;
  if (auth.type === "local") return `local:${auth.token}`;
  return null;
}

// ===== ЭНДПОИНТЫ =====

// --- Bootstrap (загрузка всех данных) ---
app.get("/api/v1/bootstrap", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    // Получаем данные из iCafeCloud
    // Примечание: реальные эндпоинты зависят от API iCafeCloud
    // Здесь — заглушки, которые нужно заменить на реальные вызовы

    const [computers, stats] = await Promise.all([
      getComputers(),
      getStats()
    ]);

    const profile = await getProfile(auth);
    const bookings = auth.user ? await getBookings(auth) : [];
    const loyalty = auth.user ? await getLoyalty(auth) : null;

    res.json({
      computers,
      stats,
      profile,
      bookings,
      user: auth.user || null,
      mode: CONFIG.devMode ? "mock" : "live",
      admin: { isTelegramAdmin: false }
    });
  } catch (e) {
    console.error("Bootstrap error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Авторизация через iCafe ---
app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ message: "Логин и пароль обязательны" });
    }

    // Запрос к iCafeCloud API для авторизации
    // Замените на реальный эндпоинт iCafeCloud
    const result = await icafeRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password, clubId: CONFIG.icafeClubId })
    });

    res.json({ token: result.token || result.sessionId });
  } catch (e) {
    console.error("Login error:", e);
    res.status(401).json({ message: e.message || "Неверный логин или пароль" });
  }
});

// --- Выход ---
app.post("/api/v1/auth/logout", (req, res) => {
  res.json({ ok: true });
});

// --- Доступность ПК для бронирования ---
app.get("/api/v1/bookings/availability", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    // Запрос к iCafeCloud
    // Замените на реальный эндпоинт
    const availability = await icafeRequest("/bookings/availability", {
      method: "GET"
    });

    res.json(availability);
  } catch (e) {
    console.error("Availability error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Мои бронирования ---
app.get("/api/v1/me/bookings", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const bookings = await getBookings(auth);
    res.json({ bookings });
  } catch (e) {
    console.error("Bookings error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Расчёт стоимости ---
app.post("/api/v1/bookings/quote", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const { pcName, startAt } = req.body;
    if (!pcName || !startAt) {
      return res.status(400).json({ message: "pcName и startAt обязательны" });
    }

    // Запрос к iCafeCloud
    const quote = await icafeRequest("/bookings/quote", {
      method: "POST",
      body: JSON.stringify({ pcName, startAt })
    });

    res.json(quote);
  } catch (e) {
    console.error("Quote error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Создать бронь ---
app.post("/api/v1/bookings", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const { pcName, startAt } = req.body;
    if (!pcName || !startAt) {
      return res.status(400).json({ message: "pcName и startAt обязательны" });
    }

    // Запрос к iCafeCloud
    const booking = await icafeRequest("/bookings", {
      method: "POST",
      body: JSON.stringify({ pcName, startAt })
    });

    res.json(booking);
  } catch (e) {
    console.error("Create booking error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Запустить сессию («Я пришёл») ---
app.post("/api/v1/bookings/:id/start", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const { id } = req.params;

    // Запрос к iCafeCloud
    const result = await icafeRequest(`/bookings/${encodeURIComponent(id)}/start`, {
      method: "POST",
      body: JSON.stringify({})
    });

    res.json(result);
  } catch (e) {
    console.error("Start session error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Лояльность ---
app.get("/api/v1/me/loyalty", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const loyalty = await getLoyalty(auth);
    res.json({ loyalty });
  } catch (e) {
    console.error("Loyalty error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Баланс ---
app.get("/api/v1/me/balance-history", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    // Запрос к iCafeCloud
    const history = await icafeRequest("/me/balance-history", {
      method: "GET"
    });

    res.json(history);
  } catch (e) {
    console.error("Balance history error:", e);
    res.status(500).json({ message: e.message });
  }
});

// --- Оплата ---
app.post("/api/v1/payments/invoices", async (req, res) => {
  try {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ message: "Не авторизован" });

    const { amount, provider } = req.body;
    if (!amount || !provider) {
      return res.status(400).json({ message: "amount и provider обязательны" });
    }

    if (amount < 1000 || amount > 5000000) {
      return res.status(400).json({ message: "Сумма должна быть от 1 000 до 5 000 000 сум" });
    }

    const invoiceId = crypto.randomUUID();
    const numericId = Math.floor(Math.random() * 900000) + 100000;

    let paymentUrl;
    if (provider === "payme") {
      paymentUrl = createPaymeUrl(amount, invoiceId, auth.user);
    } else if (provider === "click") {
      paymentUrl = createClickUrl(amount, invoiceId, auth.user);
    } else {
      return res.status(400).json({ message: "Неподдерживаемый провайдер" });
    }

    res.json({
      invoice: { id: invoiceId, numericId, amount, provider },
      paymentUrl
    });
  } catch (e) {
    console.error("Create invoice error:", e);
    res.status(500).json({ message: e.message });
  }
});

function createPaymeUrl(amount, invoiceId, user) {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const callbackUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/api/v1/payments/webhook/payme`;

  const params = {
    m: merchantId,
    ac: { invoice_id: invoiceId, user_id: user?.id?.toString() || "" },
    a: amount * 100,
    c: callbackUrl
  };

  const encoded = Buffer.from(JSON.stringify(params)).toString("base64");
  return `https://checkout.payme.uz/${encoded}`;
}

function createClickUrl(amount, invoiceId, user) {
  const serviceId = process.env.CLICK_SERVICE_ID;
  const merchantId = process.env.CLICK_MERCHANT_ID;
  const returnUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${invoiceId}&return_url=${encodeURIComponent(returnUrl)}`;
}

app.post("/api/v1/payments/webhook/payme", async (req, res) => {
  try {
    const { method, params } = req.body;

    if (method === "cards.get_verify_code") {
      return res.json({ result: { sent: true } });
    }

    if (method === "cards.verify") {
      return res.json({ result: { verified: true } });
    }

    if (method === "receipts.pay") {
      const invoiceId = params?.account?.invoice_id;
      const userId = params?.account?.user_id;
      const amountInTiyin = params?.amount;
      const amountInSum = amountInTiyin / 100;

      if (invoiceId && amountInSum) {
        try {
          await topupBalance(userId, amountInSum, `Payme: ${invoiceId}`);
          console.log(`Payme: зачислено ${amountInSum} сум, пользователь ${userId}, инвойс ${invoiceId}`);
        } catch (e) {
          console.error("Payme topup error:", e);
        }
      }

      return res.json({ result: { success: true } });
    }

    res.json({ result: { success: true } });
  } catch (e) {
    console.error("Payme webhook error:", e);
    res.status(500).json({ error: { code: -32400, message: e.message } });
  }
});

app.post("/api/v1/payments/webhook/click", async (req, res) => {
  try {
    const { click_trans_id, amount, action, merchant_trans_id } = req.body;

    if (action === 1) {
      return res.json({
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: merchant_trans_id,
        error: 0,
        error_note: "Success"
      });
    }

    if (action === 2) {
      try {
        await topupBalance(null, amount, `Click: ${merchant_trans_id}`);
        console.log(`Click: зачислено ${amount} сум, инвойс ${merchant_trans_id}`);
      } catch (e) {
        console.error("Click topup error:", e);
      }

      return res.json({
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: merchant_trans_id,
        error: 0,
        error_note: "Success"
      });
    }

    res.json({ error: 0, error_note: "Success" });
  } catch (e) {
    console.error("Click webhook error:", e);
    res.status(500).json({ error: -1, error_note: e.message });
  }
});

// ===== TOPUP BALANCE =====

async function topupBalance(userId, amount, comment) {
  // Зачисление на баланс через iCafeCloud API
  // Замени эндпоинт на реальный из документации iCafeCloud

  try {
    await icafeRequest("/payments/topup", {
      method: "POST",
      body: JSON.stringify({
        amount: amount,
        comment: comment || "Пополнение через приложение"
      })
    });
  } catch (e) {
    if (userId) {
      await icafeRequest(`/members/${encodeURIComponent(userId)}/balance`, {
        method: "POST",
        body: JSON.stringify({
          amount: amount,
          type: "topup",
          comment: comment || "Пополнение через приложение"
        })
      });
    } else {
      throw e;
    }
  }
}

// ===== ЗАГЛУШКИ (заменить на реальные вызовы iCafeCloud API) =====

async function getComputers() {
  // TODO: Заменить на реальный запрос к iCafeCloud
  // Пример: return icafeRequest("/computers");
  return [
    { id: "1", name: "PC-01", zone: "VIP", status: "free", gameTitle: null },
    { id: "2", name: "PC-02", zone: "VIP", status: "occupied", gameTitle: "CS2" },
    { id: "3", name: "PC-03", zone: "Standard", status: "free", gameTitle: null },
    { id: "4", name: "PC-04", zone: "Standard", status: "free", gameTitle: null },
    { id: "5", name: "PC-05", zone: "Standard", status: "occupied", gameTitle: "Dota 2" },
    { id: "6", name: "PC-06", zone: "Standard", status: "free", gameTitle: null }
  ];
}

async function getStats() {
  // TODO: Заменить на реальный запрос
  const computers = await getComputers();
  const zones = {};

  for (const pc of computers) {
    if (!zones[pc.zone]) zones[pc.zone] = { name: pc.zone, total: 0, free: 0 };
    zones[pc.zone].total++;
    if (pc.status === "free") zones[pc.zone].free++;
  }

  return {
    total: computers.length,
    free: computers.filter(c => c.status === "free").length,
    occupied: computers.filter(c => c.status === "occupied").length,
    zones: Object.values(zones)
  };
}

async function getProfile(auth) {
  // TODO: Заменить на реальный запрос к iCafeCloud
  if (auth.type === "telegram" && auth.user) {
    return {
      status: "Гонзольер",
      member: {
        id: "member-001",
        nickname: auth.user.first_name || "User",
        balance: 50000
      }
    };
  }
  return null;
}

async function getBookings(auth) {
  // TODO: Заменить на реальный запрос
  return [];
}

async function getLoyalty(auth) {
  // TODO: Заменить на реальный запрос
  return {
    lifetimeTopup: 500000,
    currentTier: { label: "Гонзольер" },
    tiers: [
      { label: "Новичок", threshold: 0, reached: true, active: false },
      { label: "Лохмач", threshold: 100000, reached: true, active: false },
      { label: "Гонзольер", threshold: 300000, reached: true, active: true },
      { label: "Гонзавр", threshold: 1000000, reached: false, active: false }
    ]
  };
}

// ===== ЗАПУСК =====

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   PC Club WebApp Server                      ║
  ║   http://localhost:${PORT}                      ║
  ║                                              ║
  ║   Frontend: http://localhost:${PORT}/index.html  ║
  ║   API:      http://localhost:${PORT}/api         ║
  ╚══════════════════════════════════════════════╝
  `);

  if (CONFIG.devMode) {
    console.log("  ⚠  DEV MODE: Telegram validation disabled");
  }

  if (!CONFIG.telegramBotToken) {
    console.log("  ⚠  TELEGRAM_BOT_TOKEN not set");
  }

  if (!CONFIG.icafeApiKey) {
    console.log("  ⚠  ICAFE_API_KEY not set (using mock data)");
  }
});
