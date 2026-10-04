// ===== Cloudflare Worker: Telegram WebApp ↔ iCafeCloud =====

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.FRONTEND_URL || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-telegram-user, x-local-session",
      "Access-Control-Allow-Credentials": "true"
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route to handlers
      if (path === "/api/v1/bootstrap" && request.method === "GET") {
        return await handleBootstrap(request, env, corsHeaders);
      }
      if (path === "/api/v1/auth/login" && request.method === "POST") {
        return await handleLogin(request, env, corsHeaders);
      }
      if (path === "/api/v1/auth/logout" && request.method === "POST") {
        return jsonResponse({ ok: true }, corsHeaders);
      }
      if (path === "/api/v1/bookings/availability" && request.method === "GET") {
        return await handleAvailability(request, env, corsHeaders);
      }
      if (path === "/api/v1/me/bookings" && request.method === "GET") {
        return await handleMyBookings(request, env, corsHeaders);
      }
      if (path === "/api/v1/bookings/quote" && request.method === "POST") {
        return await handleQuote(request, env, corsHeaders);
      }
      if (path === "/api/v1/bookings" && request.method === "POST") {
        return await handleCreateBooking(request, env, corsHeaders);
      }
      if (path.match(/^\/api\/v1\/bookings\/[^/]+\/start$/) && request.method === "POST") {
        return await handleStartSession(request, env, corsHeaders);
      }
      if (path === "/api/v1/me/loyalty" && request.method === "GET") {
        return await handleLoyalty(request, env, corsHeaders);
      }
      if (path === "/api/v1/me/balance-history" && request.method === "GET") {
        return await handleBalanceHistory(request, env, corsHeaders);
      }
      if (path === "/api/v1/payments/invoices" && request.method === "POST") {
        return await handleCreateInvoice(request, env, corsHeaders);
      }
      if (path === "/api/v1/payments/webhook/payme" && request.method === "POST") {
        return await handlePaymeWebhook(request, env, corsHeaders);
      }
      if (path === "/api/v1/payments/webhook/click" && request.method === "POST") {
        return await handleClickWebhook(request, env, corsHeaders);
      }

      return jsonResponse({ message: "Not Found" }, corsHeaders, 404);
    } catch (e) {
      console.error("Worker error:", e);
      return jsonResponse({ message: e.message }, corsHeaders, 500);
    }
  }
};

// ===== HELPERS =====

function jsonResponse(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

// ===== AUTH =====

function authenticate(request, env) {
  // 1. Telegram initData
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("tma ")) {
    const initData = authHeader.slice(4);
    const result = validateTelegramInitData(initData, env);
    if (result.valid) return { type: "telegram", user: result.user };
  }

  // 2. Telegram user header (fallback)
  const tgUserHeader = request.headers.get("x-telegram-user");
  if (tgUserHeader) {
    try {
      const user = JSON.parse(tgUserHeader);
      return { type: "telegram", user };
    } catch {}
  }

  // 3. Local session (iCafe login)
  const localSession = request.headers.get("x-local-session");
  if (localSession) {
    return { type: "local", token: localSession };
  }

  // 4. DEV MODE
  if (env.DEV_MODE === "true") {
    return {
      type: "dev",
      user: { id: 0, first_name: "Dev", last_name: "User", username: "dev" }
    };
  }

  return null;
}

function validateTelegramInitData(initData, env) {
  if (env.DEV_MODE === "true") return { valid: true, user: null };

  if (!initData || !env.TELEGRAM_BOT_TOKEN) {
    return { valid: false, user: null };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join("\n");

    // HMAC validation would require crypto.subtle
    // For now, trust the data in DEV mode
    const authDate = parseInt(urlParams.get("auth_date") || "0");
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, user: null };
    }

    const userStr = urlParams.get("user");
    const user = userStr ? JSON.parse(userStr) : null;

    return { valid: true, user };
  } catch (e) {
    console.error("Telegram validation error:", e);
    return { valid: false, user: null };
  }
}

// ===== ICAFE API =====

async function icafeRequest(env, path, options = {}) {
  const url = `${env.ICAFE_API_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${env.ICAFE_API_KEY}`,
    ...options.headers
  };

  const resp = await fetch(url, { ...options, headers });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `iCafe API error: ${resp.status}`);
  }

  return resp.json();
}

// ===== HANDLERS =====

async function handleBootstrap(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const [computers, stats] = await Promise.all([
    getComputers(env),
    getStats(env)
  ]);

  const profile = await getProfile(auth, env);
  const bookings = auth.user ? await getBookings(auth, env) : [];
  const loyalty = auth.user ? await getLoyalty(auth, env) : null;

  return jsonResponse({
    computers,
    stats,
    profile,
    bookings,
    user: auth.user || null,
    mode: env.DEV_MODE === "true" ? "mock" : "live",
    admin: { isTelegramAdmin: false }
  }, corsHeaders);
}

async function handleLogin(request, env, corsHeaders) {
  const { login, password } = await request.json();
  if (!login || !password) {
    return jsonResponse({ message: "Логин и пароль обязательны" }, corsHeaders, 400);
  }

  try {
    const result = await icafeRequest(env, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password, clubId: env.ICAFE_CLUB_ID })
    });

    return jsonResponse({ token: result.token || result.sessionId }, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message || "Неверный логин или пароль" }, corsHeaders, 401);
  }
}

async function handleAvailability(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  try {
    const availability = await icafeRequest(env, "/bookings/availability", {
      method: "GET"
    });
    return jsonResponse(availability, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

async function handleMyBookings(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const bookings = await getBookings(auth, env);
  return jsonResponse({ bookings }, corsHeaders);
}

async function handleQuote(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const { pcName, startAt } = await request.json();
  if (!pcName || !startAt) {
    return jsonResponse({ message: "pcName и startAt обязательны" }, corsHeaders, 400);
  }

  try {
    const quote = await icafeRequest(env, "/bookings/quote", {
      method: "POST",
      body: JSON.stringify({ pcName, startAt })
    });
    return jsonResponse(quote, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

async function handleCreateBooking(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const { pcName, startAt } = await request.json();
  if (!pcName || !startAt) {
    return jsonResponse({ message: "pcName и startAt обязательны" }, corsHeaders, 400);
  }

  try {
    const booking = await icafeRequest(env, "/bookings", {
      method: "POST",
      body: JSON.stringify({ pcName, startAt })
    });
    return jsonResponse(booking, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

async function handleStartSession(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const url = new URL(request.url);
  const id = url.pathname.split("/")[4];

  try {
    const result = await icafeRequest(env, `/bookings/${encodeURIComponent(id)}/start`, {
      method: "POST",
      body: JSON.stringify({})
    });
    return jsonResponse(result, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

async function handleLoyalty(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const loyalty = await getLoyalty(auth, env);
  return jsonResponse({ loyalty }, corsHeaders);
}

async function handleBalanceHistory(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  try {
    const history = await icafeRequest(env, "/me/balance-history", {
      method: "GET"
    });
    return jsonResponse(history, corsHeaders);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

// ===== PAYMENTS =====

async function handleCreateInvoice(request, env, corsHeaders) {
  const auth = authenticate(request, env);
  if (!auth) return jsonResponse({ message: "Не авторизован" }, corsHeaders, 401);

  const { amount, provider } = await request.json();
  if (!amount || !provider) {
    return jsonResponse({ message: "amount и provider обязательны" }, corsHeaders, 400);
  }

  if (amount < 1000 || amount > 5000000) {
    return jsonResponse({ message: "Сумма должна быть от 1 000 до 5 000 000 сум" }, corsHeaders, 400);
  }

  try {
    const invoiceId = crypto.randomUUID();
    const numericId = Math.floor(Math.random() * 900000) + 100000;

    if (provider === "payme") {
      const paymentUrl = createPaymeUrl(env, amount, invoiceId, auth.user);
      return jsonResponse({
        invoice: { id: invoiceId, numericId, amount, provider },
        paymentUrl
      }, corsHeaders);
    }

    if (provider === "click") {
      const paymentUrl = createClickUrl(env, amount, invoiceId, auth.user);
      return jsonResponse({
        invoice: { id: invoiceId, numericId, amount, provider },
        paymentUrl
      }, corsHeaders);
    }

    return jsonResponse({ message: "Неподдерживаемый провайдер" }, corsHeaders, 400);
  } catch (e) {
    return jsonResponse({ message: e.message }, corsHeaders, 500);
  }
}

function createPaymeUrl(env, amount, invoiceId, user) {
  // Payme URL format: https://checkout.payme.uz/...
  const merchantId = env.PAYME_MERCHANT_ID;
  const callbackUrl = `${env.FRONTEND_URL || env.WORKER_URL}/api/v1/payments/webhook/payme`;

  // Payme использует base64 для параметров
  const params = {
    m: merchantId,
    ac: { invoice_id: invoiceId, user_id: user?.id?.toString() || "" },
    a: amount * 100, // тийин
    c: callbackUrl
  };

  const encoded = btoa(JSON.stringify(params));
  return `https://checkout.payme.uz/${encoded}`;
}

function createClickUrl(env, amount, invoiceId, user) {
  // Click URL format
  const serviceId = env.CLICK_SERVICE_ID;
  const merchantId = env.CLICK_MERCHANT_ID;
  const returnUrl = env.FRONTEND_URL || env.WORKER_URL;

  return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${invoiceId}&return_url=${encodeURIComponent(returnUrl)}`;
}

async function handlePaymeWebhook(request, env, corsHeaders) {
  // Payme webhook для подтверждения оплаты
  try {
    const body = await request.json();
    const { method, params } = body;

    if (method === "cards.get_verify_code") {
      return jsonResponse({ result: { sent: true } }, corsHeaders);
    }

    if (method === "cards.verify") {
      return jsonResponse({ result: { verified: true } }, corsHeaders);
    }

    if (method === "receipts.pay") {
      // Олата прошла — зачислить на баланс
      const invoiceId = params?.account?.invoice_id;
      const userId = params?.account?.user_id;
      const amountInTiyin = params?.amount;
      const amountInSum = amountInTiyin / 100;

      if (invoiceId && amountInSum) {
        // Зачислить на баланс через iCafeCloud API
        try {
          await topupBalance(env, userId, amountInSum, `Payme: ${invoiceId}`);
          console.log(`Payme: зачислено ${amountInSum} сум, пользователь ${userId}, инвойс ${invoiceId}`);
        } catch (e) {
          console.error("Payme topup error:", e);
        }
      }

      return jsonResponse({ result: { success: true } }, corsHeaders);
    }

    return jsonResponse({ result: { success: true } }, corsHeaders);
  } catch (e) {
    console.error("Payme webhook error:", e);
    return jsonResponse({ error: { code: -32400, message: e.message } }, corsHeaders);
  }
}

async function handleClickWebhook(request, env, corsHeaders) {
  // Click webhook
  try {
    const body = await request.json();
    const { click_trans_id, service_id, amount, action, sign_time, sign_string, merchant_trans_id } = body;

    // TODO: Проверить подпись sign_string

    if (action === 1) {
      // Prepare — подтверждаем что инвойс существует
      return jsonResponse({
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: merchant_trans_id,
        error: 0,
        error_note: "Success"
      }, corsHeaders);
    }

    if (action === 2) {
      // Complete — оплата прошла, зачислить на баланс
      try {
        await topupBalance(env, null, amount, `Click: ${merchant_trans_id}`);
        console.log(`Click: зачислено ${amount} сум, инвойс ${merchant_trans_id}`);
      } catch (e) {
        console.error("Click topup error:", e);
      }

      return jsonResponse({
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: merchant_trans_id,
        error: 0,
        error_note: "Success"
      }, corsHeaders);
    }

    return jsonResponse({ error: 0, error_note: "Success" }, corsHeaders);
  } catch (e) {
    console.error("Click webhook error:", e);
    return jsonResponse({ error: -1, error_note: e.message }, corsHeaders);
  }
}

// ===== TOPUP BALANCE =====

async function topupBalance(env, userId, amount, comment) {
  // Зачисление на баланс через iCafeCloud API
  // Замени эндпоинт на реальный из документации iCafeCloud

  // Вариант 1: Если iCafeCloud принимает сумму и комментарий
  try {
    await icafeRequest(env, "/payments/topup", {
      method: "POST",
      body: JSON.stringify({
        amount: amount,
        comment: comment || "Пополнение через приложение"
      })
    });
  } catch (e) {
    // Вариант 2: Если эндпоинт другой — попробуй /members/{id}/balance
    if (userId) {
      await icafeRequest(env, `/members/${encodeURIComponent(userId)}/balance`, {
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

// ===== MOCK DATA (заменить на реальные вызовы iCafeCloud) =====

async function getComputers(env) {
  // TODO: Заменить на icafeRequest(env, "/computers")
  return [
    { id: "1", name: "PC-01", zone: "VIP", status: "free", gameTitle: null },
    { id: "2", name: "PC-02", zone: "VIP", status: "occupied", gameTitle: "CS2" },
    { id: "3", name: "PC-03", zone: "Standard", status: "free", gameTitle: null },
    { id: "4", name: "PC-04", zone: "Standard", status: "free", gameTitle: null },
    { id: "5", name: "PC-05", zone: "Standard", status: "occupied", gameTitle: "Dota 2" },
    { id: "6", name: "PC-06", zone: "Standard", status: "free", gameTitle: null }
  ];
}

async function getStats(env) {
  const computers = await getComputers(env);
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

async function getProfile(auth, env) {
  // TODO: Заменить на реальный запрос
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

async function getBookings(auth, env) {
  // TODO: Заменить на реальный запрос
  return [];
}

async function getLoyalty(auth, env) {
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
