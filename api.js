// ===== API СЛОЙ =====
// Все запросы к бэкенду (middleware)

class API {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // Получить заголовки авторизации
  _headers() {
    const headers = { "Content-Type": "application/json" };
    const tg = window.Telegram?.WebApp;

    if (tg?.initData) {
      headers["Authorization"] = `tma ${tg.initData}`;
    } else {
      const user = tg?.initDataUnsafe?.user;
      if (user) {
        headers["x-telegram-user"] = JSON.stringify({
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          photo_url: user.photo_url
        });
      }
    }

    // Локальная сессия (для входа через iCafe)
    const localSession = localStorage.getItem("local-session");
    if (localSession) {
      headers["x-local-session"] = localSession;
    }

    return headers;
  }

  // Базовый запрос (таймаут по умолчанию 8 сек)
  async _request(path, options = {}) {
    const timeoutMs = options.timeoutMs || 8000;
    const { timeoutMs: _, ...fetchOpts } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        ...fetchOpts,
        headers: { ...this._headers(), ...fetchOpts.headers },
        signal: controller.signal
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const msg = body.message || this._statusError(resp.status);
        throw new Error(msg);
      }

      return resp.json();
    } catch (e) {
      throw new Error(this._formatError(e));
    } finally {
      clearTimeout(timer);
    }
  }

  _statusError(status) {
    if (status === 404) return "API недоступен. Проверьте адрес сервера.";
    if (status >= 500) return "Сервер временно не отвечает.";
    return "Не удалось выполнить запрос.";
  }

  _formatError(e) {
    if (e.name === "AbortError") return "Сервер не успел ответил. Попробуйте ещё раз.";
    if (e instanceof TypeError && /failed to fetch|networkerror/i.test(e.message)) {
      return "Не удалось связаться с сервером. Проверьте интернет.";
    }
    return e.message || "Не удалось связаться с сервером.";
  }

  // ===== ЭНДПОИНТЫ =====

  // Загрузка всех данных при старте
  async bootstrap() {
    return this._request("/v1/bootstrap");
  }

  // Авторизация через iCafe (логин/пароль)
  async login(login, password) {
    return this._request("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password })
    });
  }

  // Выход
  async logout() {
    return this._request("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  // Мои бронирования
  async getMyBookings() {
    return this._request("/v1/me/bookings");
  }

  // Доступность ПК для бронирования
  async getAvailability() {
    return this._request("/v1/bookings/availability");
  }

  // Расчёт стоимости брони
  async getQuote(pcName, startAt) {
    return this._request("/v1/bookings/quote", {
      method: "POST",
      timeoutMs: 25000,
      body: JSON.stringify({ pcName, startAt })
    });
  }

  // Создать бронь
  async createBooking(pcName, startAt) {
    return this._request("/v1/bookings", {
      method: "POST",
      timeoutMs: 45000,
      body: JSON.stringify({ pcName, startAt })
    });
  }

  // Запустить сессию («Я пришёл»)
  async startSession(bookingId) {
    return this._request(`/v1/bookings/${encodeURIComponent(bookingId)}/start`, {
      method: "POST",
      timeoutMs: 45000,
      body: JSON.stringify({})
    });
  }

  // Лояльность
  async getLoyalty() {
    return this._request("/v1/me/loyalty");
  }

  // Баланс
  async getBalanceHistory() {
    return this._request("/v1/me/balance-history");
  }

  // Создать инвойс для оплаты
  async createInvoice(amount, provider) {
    return this._request("/v1/payments/invoices", {
      method: "POST",
      body: JSON.stringify({ amount, provider })
    });
  }
}
