// ===== ГЛАВНЫЙ МОДУЛЬ ПРИЛОЖЕНИЯ =====

const api = new API(CONFIG.API_BASE_URL);

// ===== УТИЛИТЫ =====

const fmt = new Intl.NumberFormat("ru-RU");
const fmtDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: CONFIG.TIMEZONE,
  day: "2-digit", month: "2-digit",
  hour: "2-digit", minute: "2-digit"
});
const fmtTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: CONFIG.TIMEZONE,
  hour: "2-digit", minute: "2-digit"
});

function formatCost(n) { return `${fmt.format(n)} ${CONFIG.CURRENCY}`; }

function formatDate(iso) {
  if (!iso) return "";
  return fmtDate.format(new Date(iso));
}

function formatTime(iso) {
  if (!iso) return "";
  return fmtTime.format(new Date(iso));
}

function formatRange(start, end) {
  if (!start || !end) return "";
  return `${formatDate(start)} – ${formatTime(end)}`;
}

function formatDuration(min) {
  if (min === 60) return "1 час";
  if (min === 120) return "2 часа";
  if (min % 60 === 0) return `${min / 60} ч`;
  return `${min} мин`;
}

function statusLabel(s) {
  return { free: "Свободен", occupied: "Занят" }[s] ?? s;
}

function parseError(e, fallback) {
  return e.message || fallback;
}

// Уровни лояльности (доступ к бронированию)
function getTier(status) {
  if (status === "Гонзавр") return { label: "Гонзавр", windowMin: 60, durationMin: 60 };
  if (status === "Гонзольер") return { label: "Гонзольер", windowMin: 15, durationMin: 120 };
  return null;
}

function isTelegram() {
  const tg = window.Telegram?.WebApp;
  return !!(tg?.initData || tg?.initDataUnsafe?.user);
}

function getLocalSession() {
  return localStorage.getItem("local-session") ?? "";
}
function setLocalSession(v) { localStorage.setItem("local-session", v); }
function clearLocalSession() { localStorage.removeItem("local-session"); }

// ===== СОСТОЯНИЕ ПРИЛОЖЕНИЯ =====

const state = {
  data: null,         // bootstrap data
  tab: "map",         // текущий таб: map | profile
  filter: "all",      // фильтр ПК: all | free
  zone: "all",        // выбранная зона
  selectedPc: null,   // выбранный ПК для бронирования
  selectedSlot: "",   // выбранный слот времени
  availability: null, // данные доступности
  loading: true,
  error: null,
  toast: null,
  loggedIn: false,
  paymentAmount: 0,   // сумма пополнения
  paymentProvider: ""  // payme | click
};

// ===== ДЕМО-ДАННЫЕ (для тестирования без сервера) =====

function getMockData() {
  return {
    computers: [
      { id: "1", name: "PC-01", zone: "VIP", status: "free", gameTitle: null },
      { id: "2", name: "PC-02", zone: "VIP", status: "occupied", gameTitle: "CS2" },
      { id: "3", name: "PC-03", zone: "VIP", status: "free", gameTitle: null },
      { id: "4", name: "PC-04", zone: "Standard", status: "free", gameTitle: null },
      { id: "5", name: "PC-05", zone: "Standard", status: "occupied", gameTitle: "Dota 2" },
      { id: "6", name: "PC-06", zone: "Standard", status: "free", gameTitle: null },
      { id: "7", name: "PC-07", zone: "Standard", status: "occupied", gameTitle: "Valorant" },
      { id: "8", name: "PC-08", zone: "Standard", status: "free", gameTitle: null }
    ],
    stats: {
      total: 8,
      free: 5,
      occupied: 3,
      zones: [
        { name: "VIP", total: 3, free: 2 },
        { name: "Standard", total: 5, free: 3 }
      ]
    },
    profile: {
      status: "Гонзольер",
      member: {
        id: "demo-user",
        nickname: "Demo Player",
        balance: 75000
      }
    },
    bookings: [],
    user: { firstName: "Demo", lastName: "User", telegramUsername: "demo" },
    loyalty: {
      lifetimeTopup: 500000,
      currentTier: { label: "Гонзольер" },
      tiers: [
        { label: "Новичок", threshold: 0, reached: true, active: false },
        { label: "Лохмач", threshold: 100000, reached: true, active: false },
        { label: "Гонзольер", threshold: 300000, reached: true, active: true },
        { label: "Гонзавр", threshold: 1000000, reached: false, active: false }
      ]
    },
    mode: "mock"
  };
}

// ===== ИНИЦИАЛИЗАЦИЯ =====

document.addEventListener("DOMContentLoaded", () => {
  initTelegram();
  loadData().catch(() => {});
});

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.warn("Telegram init error:", e);
  }

  try {
    tg.setHeaderColor("#212121");
    tg.setBackgroundColor("#07080b");
    tg.setBottomBarColor("#07080b");
  } catch (e) {
    // Старая версия Telegram — игнорируем
  }

  try {
    tg.MainButton.setParams({ text: "ЗАКРЫТЬ", is_visible: false });
  } catch (e) {}
}

// ===== ЗАГРУЗКА ДАННЫХ =====

async function loadData(quiet = false) {
  state.error = null;
  if (!quiet) state.loading = true;
  render();

  try {
    state.data = await api.bootstrap();
    state.loggedIn = true;
  } catch (e) {
    state.error = parseError(e, "Не удалось загрузить данные");
    // Показываем экран с ошибкой, а не логин
    state.loading = false;
    render();
    return;
  } finally {
    state.loading = false;
  }

  render();
  if (state.data) startPolling();
}

// Демо-режим (без сервера)
function enterDemoMode() {
  state.data = getMockData();
  state.loggedIn = true;
  state.loading = false;
  state.error = null;
  render();
}

// Автообновление
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => loadData(true), CONFIG.POLL_INTERVAL);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

// ===== РЕНДЕР =====

function render() {
  const root = document.getElementById("root");

  // Экран загрузки
  if (state.loading && !state.data) {
    root.innerHTML = renderLoading();
    return;
  }

  // Экран ошибки (сервер недоступен)
  if (state.error && !state.data) {
    root.innerHTML = renderError(state.error);
    bindErrorEvents();
    return;
  }

  // Логин (нет данных)
  if (!state.loggedIn && !state.data) {
    root.innerHTML = renderLogin();
    bindLoginEvents();
    return;
  }

  // Основной интерфейс
  root.innerHTML = `
    <main class="app-shell">
      ${renderHeader()}
      ${renderToast()}
      ${renderTabs()}
      ${renderContent()}
    </main>
  `;

  bindEvents();
  // Запускаем опрос только если данные с сервера (не демо)
  if (state.data?.mode !== "mock") startPolling();
}

// ===== КОМПОНЕНТЫ РЕНДЕРА =====

function renderLoading() {
  return `
    <main class="loading-screen">
      <h1>${CONFIG.CLUB_NAME}</h1>
      <div class="spinner"></div>
      <span>Загрузка клуба</span>
    </main>
  `;
}

function renderError(errorMsg) {
  return `
    <main class="loading-screen">
      <h1>${CONFIG.CLUB_NAME}</h1>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
           stroke="#fb7185" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <p style="color:#fb7185;max-width:300px;text-align:center;margin:0;font-size:14px">${errorMsg}</p>
      <div style="display:flex;gap:10px;flex-direction:column;width:100%;max-width:280px">
        <button class="primary-action" id="btnRetry">Повторить</button>
        <button class="primary-action" id="btnDemo" style="background:#1f202b;border:1px solid #ffffff33">
          Демо-режим
        </button>
      </div>
    </main>
  `;
}

function renderLogin() {
  return `
    <main class="login-screen">
      <h1>${CONFIG.CLUB_NAME}</h1>
      <form class="login-card" id="loginForm">
        <div>
          <p class="eyebrow">${CONFIG.CLUB_NAME}</p>
          <h2>Вход</h2>
        </div>
        <label class="login-field">
          <span>Логин</span>
          <input id="loginInput" autocomplete="username" maxlength="64"
                 placeholder="логин из iCafe" required>
        </label>
        <label class="login-field">
          <span>Пароль</span>
          <input id="passwordInput" type="password" autocomplete="current-password"
                 minlength="1" maxlength="72" placeholder="пароль" required>
        </label>
        <p class="login-error" id="loginError" style="display:none"></p>
        <button class="primary-action login-submit" type="submit" id="loginBtn">
          Войти
        </button>
        <button type="button" class="primary-action" id="btnDemoLogin"
                style="background:#1f202b;border:1px solid #ffffff33;margin-top:-4px">
          Демо-режим
        </button>
      </form>
    </main>
  `;
}

function renderHeader() {
  const d = state.data;
  return `
    <header class="topbar">
      <div class="brand-lockup">
        <div>
          <p class="eyebrow">${CONFIG.CLUB_NAME}</p>
          <h1>Клубный хаб</h1>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" id="btnRefresh" aria-label="Обновить">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>
    </header>
  `;
}

function renderToast() {
  if (!state.toast) return "";
  const cls = state.toast.kind === "error" ? "notice error" : "notice";
  return `<div class="${cls}"><span>${state.toast.text}</span></div>`;
}

function renderTabs() {
  const tabs = [
    { id: "map", label: "Карта", icon: "monitor" },
    { id: "profile", label: "Профиль", icon: "user" }
  ];

  return `
    <nav class="tabs" aria-label="Разделы">
      ${tabs.map(t => `
        <button class="tab ${state.tab === t.id ? "active" : ""}" data-tab="${t.id}">
          ${tabIcon(t.icon)}
          <span>${t.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function tabIcon(name) {
  if (name === "monitor") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <rect width="20" height="14" x="2" y="3" rx="2"/>
              <line x1="8" x2="16" y1="21" y2="21"/>
              <line x1="12" x2="12" y1="17" y2="21"/>
            </svg>`;
  }
  if (name === "user") {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 0 0-16 0"/>
            </svg>`;
  }
  return "";
}

function renderContent() {
  if (state.tab === "map") return renderMapView();
  if (state.tab === "profile") return renderProfileView();
  return "";
}

// ===== КАРТА ПК =====

function renderMapView() {
  const d = state.data;
  if (!d) return "";

  const zones = d.stats?.zones ?? [];
  const computers = d.computers ?? [];

  const tier = getTier(d.profile?.status);
  const canBook = !!tier;

  // Фильтрация
  const filtered = computers.filter(pc => {
    const statusOk = state.filter === "all" || pc.status === "free";
    const zoneOk = state.zone === "all" || pc.zone === state.zone;
    return statusOk && zoneOk;
  });

  // ПК доступные для бронирования
  const availableNames = new Set();
  if (state.availability?.slots) {
    for (const slot of state.availability.slots) {
      for (const pc of slot.computers) {
        availableNames.add(pc.name);
      }
    }
  }

  return `
    <section class="view-stack">
      <!-- Статистика -->
      <div class="stats-strip">
        <div class="metric"><span>Всего</span><strong>${d.stats?.total ?? 0}</strong></div>
        <div class="metric good"><span>Свободно</span><strong>${d.stats?.free ?? 0}</strong></div>
        <div class="metric warn"><span>Занято</span><strong>${d.stats?.occupied ?? 0}</strong></div>
      </div>

      <!-- Фильтр: все / свободные -->
      <div class="toolbar single">
        <div class="segmented">
          <button class="${state.filter === "all" ? "selected" : ""}" data-filter="all">Все</button>
          <button class="${state.filter === "free" ? "selected" : ""}" data-filter="free">Свободные</button>
        </div>
      </div>

      <!-- Фильтр по зонам -->
      <div class="zone-filter-row">
        <button class="zone-chip ${state.zone === "all" ? "active" : ""}" data-zone="all">Все зоны</button>
        ${zones.map(z => `
          <button class="zone-chip ${state.zone === z.name ? "active" : ""}" data-zone="${z.name}">
            <span>${z.name}</span><strong>${z.free}/${z.total}</strong>
          </button>
        `).join("")}
      </div>

      <!-- Зоны и ПК -->
      ${zones.filter(z => state.zone === "all" || state.zone === z.name).map(z => {
        const zonePcs = filtered.filter(pc => pc.zone === z.name);
        if (zonePcs.length === 0) return "";

        const showBookingPanel = zonePcs.some(pc => pc.name === state.selectedPc);

        return `
          <div class="zone-section">
            <div class="zone-section-header">
              <div><p>Зона</p><h2>${z.name}</h2></div>
              <strong>${z.free}/${z.total}</strong>
            </div>
            <div class="pc-grid">
              ${zonePcs.map(pc => {
                const bookable = canBook && pc.status === "free" && availableNames.has(pc.name);
                const selected = state.selectedPc === pc.name;
                const cls = ["pc-tile", pc.status, bookable ? "bookable" : "", selected ? "selected" : ""]
                  .filter(Boolean).join(" ");

                return `
                  <button class="${cls}" ${!bookable ? "disabled" : ""} data-pc="${pc.name}" data-status="${pc.status}">
                    <div class="pc-head">
                      <span class="status-dot"></span>
                      <strong>${pc.name}</strong>
                    </div>
                    <span class="pc-zone">${pc.zone}</span>
                    <div class="pc-state">
                      <span>${statusLabel(pc.status)}</span>
                      ${pc.gameTitle ? `<small>${pc.gameTitle}</small>` : ""}
                    </div>
                  </button>
                  ${selected && showBookingPanel ? `<div class="pc-inline-booking">${renderBookingPanel()}</div>` : ""}
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </section>
  `;
}

// ===== ПАНЕЛЬ БРОНИРОВАНИЯ =====

function renderBookingPanel() {
  const d = state.data;
  const tier = getTier(d.profile?.status);

  if (!tier) {
    return `
      <div class="booking-panel locked">
        <div class="booking-head">
          <div class="panel-title"><span>Бронь</span></div>
          <strong>Нет доступа</strong>
        </div>
        <div class="booking-locked-body">
          <div>
            <p>Бронирование доступно с определённого уровня лояльности.</p>
          </div>
        </div>
      </div>
    `;
  }

  const av = state.availability;
  const slots = av?.slots ?? [];
  const pcSlots = state.selectedPc
    ? slots.filter(s => s.computers.some(c => c.name === state.selectedPc))
    : [];
  const selectedSlotData = pcSlots.find(s => s.startAt === state.selectedSlot);
  const canCalc = selectedSlotData?.computers.some(c => c.name === state.selectedPc);

  const durationMin = av?.durationMinutes ?? tier.durationMin;
  const windowMin = av?.bookingWindowMinutes ?? tier.windowMin;

  return `
    <div class="booking-panel">
      <div class="booking-head">
        <div class="panel-title"><span>Бронь</span></div>
        <button class="booking-refresh" id="btnRefreshBooking" aria-label="Обновить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      <div class="booking-rules">
        <span>Пакет ${formatDuration(durationMin)}</span>
        <span>Старт через ${formatDuration(windowMin)}</span>
        <span>Держим ${CONFIG.HOLD_MINUTES} мин</span>
      </div>

      <p class="booking-tier-note">
        ${tier.label}: расчёт показывает стоимость пакета на ${formatDuration(durationMin)}.
        После подтверждения ПК сразу закрывается. Сессия начнётся по кнопке «Я пришёл» в Telegram
        или автоматически через ${formatDuration(windowMin)}.
      </p>

      <!-- Выбор времени -->
      <div class="booking-choice-grid">
        <div class="booking-choice-card ${selectedSlotData ? "selected" : ""}">
          <span class="booking-choice-label">Время</span>
          ${state.selectedPc
            ? pcSlots.length > 0
              ? `<div class="booking-time-options">
                   ${pcSlots.map(s => `
                     <button class="${s.startAt === state.selectedSlot ? "selected" : ""}"
                             data-slot="${s.startAt}">
                       <strong>${s.label}</strong>
                       <span>${formatDate(s.startAt)}</span>
                     </button>
                   `).join("")}
                 </div>`
              : `<p class="booking-empty">Для этого ПК нет доступного времени.</p>`
            : `<small>Время появится после выбора зелёного ПК на карте.</small>`
          }
        </div>
      </div>

      <!-- Кнопка расчёта -->
      <button class="primary-action booking-action" id="btnQuote"
              ${!canCalc ? "disabled" : ""}>
        <span>${canCalc ? "Рассчитать" : "Выберите ПК и время"}</span>
      </button>

      <!-- Карточка расчёта -->
      <div id="quoteCard" style="display:none"></div>

      <!-- Уведомления -->
      <p class="form-success" id="bookingSuccess" style="display:none"></p>
      <p class="form-error" id="bookingError" style="display:none"></p>

      <!-- Мои брони -->
      <div class="booking-list" id="myBookings">
        <span class="booking-section-label">Мои брони</span>
        ${(d.bookings ?? []).slice(0, 3).map(b => `
          <article class="booking-card">
            <div><strong>${b.pcName}</strong><span>${b.zone}</span></div>
            <div>
              <span>${formatRange(b.startAt, b.endAt)}</span>
              <small>${formatCost(b.cost)}</small>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

// ===== ПРОФИЛЬ =====

function renderProfileView() {
  const d = state.data;
  if (!d) return "";

  const profile = d.profile;
  const member = profile?.member;
  const user = d.user;

  if (!member) {
    return `
      <section class="view-stack">
        <div class="panel">
          <div class="panel-title"><span>Профиль</span></div>
          <p class="muted">Войдите в аккаунт, чтобы видеть баланс.</p>
          <button class="primary-action" id="btnLinkProfile">Привязать аккаунт</button>
        </div>
      </section>
    `;
  }

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim()
    || (user?.telegramUsername ? `@${user.telegramUsername}` : member.nickname);

  return `
    <section class="view-stack">
      <!-- Шапка профиля -->
      <div class="profile-hero">
        <div class="avatar">
          ${user?.telegramPhotoUrl
            ? `<img src="${user.telegramPhotoUrl}" alt="${name}">`
            : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2">
                 <circle cx="12" cy="8" r="5"/>
                 <path d="M20 21a8 8 0 0 0-16 0"/>
               </svg>`
          }
        </div>
        <div class="profile-meta">
          <p>${user?.telegramUsername ? `@${user.telegramUsername}` : "Telegram"} · ${profile.status}</p>
          <h2>${name}</h2>
          <span>iCafe: ${member.nickname}</span>
        </div>
      </div>

      <!-- Баланс -->
      <div class="balance-grid">
        <div class="balance-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M2 10h20"/>
          </svg>
          <span>Баланс</span>
          <strong>${formatCost(member.balance)}</strong>
        </div>
      </div>

      <!-- Пополнение баланса -->
      ${renderPaymentPanel(member)}

      <!-- Привязка -->
      <div class="panel">
        <div class="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span>Привязка активна</span>
        </div>
        <p class="muted">iCafe ID: ${member.id}</p>
      </div>

      <!-- Лояльность -->
      ${renderLoyalty(d.loyalty)}

      <!-- История баланса -->
      ${renderBalanceHistory(member.id)}
    </section>
  `;
}

function renderPaymentPanel(member) {
  return `
    <div class="payment-panel">
      <div class="payment-head">
        <div class="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M2 10h20"/>
          </svg>
          <span>Пополнить баланс</span>
        </div>
        <span>${member.nickname || member.id}</span>
      </div>

      <div class="quick-amounts">
        <button class="${state.paymentAmount === 10000 ? "selected" : ""}" data-amount="10000">${fmt.format(10000)}</button>
        <button class="${state.paymentAmount === 25000 ? "selected" : ""}" data-amount="25000">${fmt.format(25000)}</button>
        <button class="${state.paymentAmount === 50000 ? "selected" : ""}" data-amount="50000">${fmt.format(50000)}</button>
        <button class="${state.paymentAmount === 100000 ? "selected" : ""}" data-amount="100000">${fmt.format(100000)}</button>
      </div>

      <label class="amount-field">
        <span>Другая сумма</span>
        <input type="number" id="paymentAmountInput" value="${state.paymentAmount || ""}" min="1000" max="5000000" step="1000" inputmode="numeric" placeholder="от 1 000 до 5 000 000">
      </label>

      <div class="provider-grid">
        <button class="provider-button ${state.paymentProvider === "payme" ? "selected" : ""}" data-provider="payme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
          <span>Payme</span>
        </button>
        <button class="provider-button ${state.paymentProvider === "click" ? "selected" : ""}" data-provider="click">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          <span>Click</span>
        </button>
      </div>

      <button class="primary-action" id="btnPay" ${!state.paymentAmount || !state.paymentProvider ? "disabled" : ""}>
        Пополнить через ${state.paymentProvider === "payme" ? "Payme" : state.paymentProvider === "click" ? "Click" : "..."}
      </button>

      <p class="payment-message" id="paymentMessage" style="display:none"></p>
      <p class="payment-message error" id="paymentError" style="display:none"></p>
    </div>
  `;
}

function renderLoyalty(loyalty) {
  if (!loyalty) return "";

  return `
    <div class="loyalty-panel">
      <div class="loyalty-head">
        <div class="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
          <span>Лояльность</span>
        </div>
        <strong>${loyalty.currentTier?.label ?? ""}</strong>
      </div>
      <div class="loyalty-total">
        <span>Пополнено за все время</span>
        <strong>${formatCost(loyalty.lifetimeTopup)}</strong>
      </div>
      ${loyalty.tiers ? `
        <div class="loyalty-tiers">
          ${loyalty.tiers.map(t => `
            <div class="loyalty-tier ${t.active ? "active" : ""} ${t.reached ? "reached" : ""}">
              <span>${t.label}</span>
              <small>${formatCost(t.threshold)}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderBalanceHistory(memberId) {
  return `
    <div class="balance-history-panel" id="balanceHistoryPanel" data-member="${memberId}">
      <div class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>История баланса</span>
      </div>
      <button class="primary-action" id="btnLoadHistory">Загрузить историю</button>
      <div id="balanceHistoryList"></div>
    </div>
  `;
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

function bindEvents() {
  // Табы
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      state.selectedPc = null;
      state.selectedSlot = "";
      state.availability = null;
      render();
      if (state.tab === "map") loadAvailability();
    });
  });

  // Обновление
  document.getElementById("btnRefresh")?.addEventListener("click", () => loadData(true));

  // Фильтры
  document.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      render();
    });
  });

  document.querySelectorAll("[data-zone]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.zone = btn.dataset.zone;
      render();
    });
  });

  // Клик по ПК
  document.querySelectorAll("[data-pc]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.status !== "free") return;
      const name = btn.dataset.pc;
      state.selectedPc = state.selectedPc === name ? null : name;
      state.selectedSlot = "";
      render();
      if (state.selectedPc) loadAvailability();
    });
  });

  // Выбор слота
  document.querySelectorAll("[data-slot]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedSlot = btn.dataset.slot;
      render();
    });
  });

  // Расчёт стоимости
  document.getElementById("btnQuote")?.addEventListener("click", () => handleQuote());

  // Подтверждение брони
  document.getElementById("btnConfirmBooking")?.addEventListener("click", () => handleBooking());

  // Обновление бронирования
  document.getElementById("btnRefreshBooking")?.addEventListener("click", () => loadAvailability());

  // Загрузка истории баланса
  document.getElementById("btnLoadHistory")?.addEventListener("click", () => loadBalanceHistory());

  // Привязка профиля
  document.getElementById("btnLinkProfile")?.addEventListener("click", () => {
    state.tab = "profile";
    render();
  });

  // Пополнение баланса — выбор суммы
  document.querySelectorAll("[data-amount]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.paymentAmount = parseInt(btn.dataset.amount);
      render();
    });
  });

  // Пополнение баланса — ввод суммы (без render чтобы клавиатура не закрывалась)
  document.getElementById("paymentAmountInput")?.addEventListener("input", (e) => {
    state.paymentAmount = parseInt(e.target.value) || 0;
    // Обновляем кнопку без перерендера
    const btn = document.getElementById("btnPay");
    if (btn) {
      btn.disabled = !state.paymentAmount || !state.paymentProvider;
      const providerName = state.paymentProvider === "payme" ? "Payme" : state.paymentProvider === "click" ? "Click" : "...";
      btn.textContent = `Пополнить через ${providerName}`;
    }
    // Снимаем выделение с быстрых кнопок
    document.querySelectorAll("[data-amount]").forEach(b => b.classList.remove("selected"));
  });

  // Пополнение баланса — выбор провайдера
  document.querySelectorAll("[data-provider]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.paymentProvider = btn.dataset.provider;
      render();
    });
  });

  // Пополнение баланса — кнопка оплаты
  document.getElementById("btnPay")?.addEventListener("click", () => handlePayment());
}

function bindErrorEvents() {
  document.getElementById("btnRetry")?.addEventListener("click", () => {
    state.error = null;
    state.loading = true;
    render();
    loadData().catch(() => {});
  });

  document.getElementById("btnDemo")?.addEventListener("click", () => {
    enterDemoMode();
  });
}

function bindLoginEvents() {
  document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login = document.getElementById("loginInput").value;
    const password = document.getElementById("passwordInput").value;
    const errorEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");

    btn.disabled = true;
    btn.textContent = "Вход...";
    errorEl.style.display = "none";

    try {
      const resp = await api.login(login, password);
      setLocalSession(resp.token);
      state.loggedIn = true;
      loadData();
    } catch (err) {
      errorEl.textContent = parseError(err, "Не удалось войти");
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Войти";
    }
  });

  document.getElementById("btnDemoLogin")?.addEventListener("click", () => {
    enterDemoMode();
  });
}

// ===== ЗАГРУЗКА ДОСТУПНОСТИ =====

async function loadAvailability() {
  const tier = getTier(state.data?.profile?.status);
  if (!tier) return;

  try {
    state.availability = await api.getAvailability();
    // Автовыбор слота
    if (state.selectedPc && state.availability?.slots) {
      const pcSlots = state.availability.slots.filter(s =>
        s.computers.some(c => c.name === state.selectedPc)
      );
      if (pcSlots.length > 0 && !pcSlots.find(s => s.startAt === state.selectedSlot)) {
        state.selectedSlot = pcSlots[0].startAt;
      }
    }
    render();
  } catch (e) {
    // Тихо игнорируем
  }
}

// ===== РАСЧЁТ СТОИМОСТИ =====

async function handleQuote() {
  if (!state.selectedPc || !state.selectedSlot) return;

  const btn = document.getElementById("btnQuote");
  const errEl = document.getElementById("bookingError");
  if (btn) { btn.disabled = true; btn.textContent = "Рассчёт..."; }
  if (errEl) errEl.style.display = "none";

  try {
    const quote = await api.getQuote(state.selectedPc, state.selectedSlot);
    showQuoteCard(quote);
  } catch (e) {
    if (errEl) { errEl.textContent = parseError(e, "Не удалось рассчитать"); errEl.style.display = "block"; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Рассчитать"; }
  }
}

function showQuoteCard(quote) {
  const card = document.getElementById("quoteCard");
  if (!card) return;

  card.style.display = "block";
  card.innerHTML = `
    <div class="booking-quote">
      <div>
        <span>К списанию при старте</span>
        <strong>${formatCost(quote.cost)}</strong>
      </div>
      <p>
        ПК ${quote.pcName}, ${quote.zone}. ${formatRange(quote.startAt, quote.endAt)}.
        Подтверждение сразу закроет вход на ПК. Оплата спишется, когда вы нажмёте «Я пришёл»
        в Telegram или когда сессия запустится автоматически.
        После старта ПК держится за вами ещё ${CONFIG.HOLD_MINUTES} минут.
      </p>
      <button class="primary-action booking-action" id="btnConfirmBooking">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span>Забронировать</span>
      </button>
    </div>
  `;

  document.getElementById("btnConfirmBooking")?.addEventListener("click", () => handleBooking());
}

// ===== СОЗДАНИЕ БРОНИ =====

async function handleBooking() {
  if (!state.selectedPc || !state.selectedSlot) return;

  const errEl = document.getElementById("bookingError");
  const successEl = document.getElementById("bookingSuccess");
  if (errEl) errEl.style.display = "none";
  if (successEl) successEl.style.display = "none";

  try {
    const resp = await api.createBooking(state.selectedPc, state.selectedSlot);
    if (successEl) {
      successEl.textContent = `Бронь подтверждена: ПК ${resp.booking.pcName}, ${formatRange(resp.booking.startAt, resp.booking.endAt)}. Кнопка «Я пришёл» отправлена в Telegram.`;
      successEl.style.display = "block";
    }

    // Обновить данные
    state.selectedPc = null;
    state.selectedSlot = "";
    await loadData(true);
  } catch (e) {
    if (errEl) { errEl.textContent = parseError(e, "Не удалось создать бронь"); errEl.style.display = "block"; }
  }
}

// ===== ОПЛАТА =====

async function handlePayment() {
  if (!state.paymentAmount || !state.paymentProvider) return;

  const errEl = document.getElementById("paymentError");
  const msgEl = document.getElementById("paymentMessage");
  const btn = document.getElementById("btnPay");
  if (errEl) errEl.style.display = "none";
  if (msgEl) msgEl.style.display = "none";

  if (state.paymentAmount < 1000 || state.paymentAmount > 5000000) {
    if (errEl) { errEl.textContent = "Сумма должна быть от 1 000 до 5 000 000 сум"; errEl.style.display = "block"; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Создаём инвойс..."; }

  try {
    const resp = await api.createInvoice(state.paymentAmount, state.paymentProvider);

    if (msgEl) {
      msgEl.textContent = `Инвойс #${resp.invoice.numericId}: после оплаты обновите профиль`;
      msgEl.style.display = "block";
    }

    // Открыть страницу оплаты
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(resp.paymentUrl, { try_instant_view: false });
    } else {
      window.open(resp.paymentUrl, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    if (errEl) { errEl.textContent = parseError(e, "Не удалось создать инвойс"); errEl.style.display = "block"; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = `Пополнить через ${state.paymentProvider === "payme" ? "Payme" : "Click"}`; }
  }
}

// ===== ИСТОРИЯ БАЛАНСА =====

async function loadBalanceHistory() {
  const list = document.getElementById("balanceHistoryList");
  if (!list) return;

  list.innerHTML = `<div class="inline-loading"><div class="spinner small"></div><span>Загружаем...</span></div>`;

  try {
    const resp = await api.getBalanceHistory();
    const history = (resp.history ?? []).slice(0, 6);

    if (history.length === 0) {
      list.innerHTML = `<p class="empty-copy">Пока нет движений по балансу.</p>`;
      return;
    }

    list.innerHTML = history.map(r => {
      const positive = r.amount >= 0;
      return `
        <article class="balance-history-item">
          <div class="balance-history-icon">
            ${positive
              ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>`
            }
          </div>
          <div class="balance-history-main">
            <strong>${r.comment || "Операция"}</strong>
            <span>${formatDate(r.createdAt)}</span>
          </div>
          <div class="balance-history-amounts">
            <strong class="${positive ? "positive" : "negative"}">
              ${positive ? "+" : ""}${formatCost(r.amount)}
            </strong>
          </div>
        </article>
      `;
    }).join("");
  } catch (e) {
    list.innerHTML = `<p class="panel-error">${parseError(e, "Не удалось загрузить историю")}</p>`;
  }
}
