/* =============================================================================
 *  ЦПСО EdPalm — Юридическая поддержка «Базовый без ГИА»
 *  app.js — логика приложения (роутер экранов + имитация backend)
 *
 *  ВНИМАНИЕ: это ПРОТОТИП. Реальные интеграции backend помечены [MOCK]:
 *    - SMS-код                                           → mockSendSms()
 *    - DMS (проверка кода + доступа к пакету)            → mockVerifyCode()
 *    - Omnidesk (передача вопроса юристу)                → mockSendToOmnidesk()
 *    - SaleBot (Telegram / MAX / VK)                     → точка входа = открытие приложения
 *  В бою эти функции заменяются реальными вызовами вашего backend.
 * ========================================================================== */

(function () {
  'use strict';

  /* ----------------------------- DOM-узлы ------------------------------- */
  const el = {
    content: document.getElementById('content'),
    appbar: document.getElementById('appbar'),
    appbarTitle: document.getElementById('appbarTitle'),
    backBtn: document.getElementById('backBtn'),
    tabbar: document.getElementById('tabbar'),
    toast: document.getElementById('toast'),
    profileBtn: document.getElementById('profileBtn'),
    profilePop: document.getElementById('profilePop'),
    cabinetDot: document.getElementById('cabinetDot'),
    authModal: document.getElementById('authModal'),
    authModalBody: document.getElementById('authModalBody'),
    authModalClose: document.getElementById('authModalClose'),
  };

  /* ----------------------------- Состояние ------------------------------ */
  const state = {
    session: { phone: null, verified: false },
    pendingPhone: null,  // номер, ожидающий подтверждения кодом
    stack: [],           // история экранов для кнопки «Назад»
    profiles: [],        // профили учеников: { phone, name, tickets: [] }
    active: -1,          // индекс активного профиля
  };

  // Демо-ФИО для профилей (в бою приходят из DMS по номеру).
  const DEMO_NAMES = [
    'Смирнова Анна Петровна',
    'Иванов Иван Сергеевич',
    'Кузнецова Мария Алексеевна',
    'Петров Дмитрий Игоревич',
    'Соколова Екатерина Андреевна',
  ];

  /* ----------------------------- Профили -------------------------------- */
  function currentProfile() { return state.profiles[state.active] || null; }

  // Вход по номеру: переключаемся на существующий профиль или создаём новый.
  function loginPhone(phone) {
    let idx = state.profiles.findIndex((p) => p.phone === phone);
    if (idx === -1) {
      state.profiles.push({
        phone,
        name: DEMO_NAMES[state.profiles.length % DEMO_NAMES.length],
        tickets: [],
      });
      idx = state.profiles.length - 1;
    }
    state.active = idx;
    state.session.phone = phone;
    state.session.verified = true;
  }

  function initials(name) {
    const parts = (name || '').split(' ').filter(Boolean);
    return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
  }

  /* ----------------------------- Обращения ------------------------------ */
  let ticketSeq = 100000;
  function addTicket(question, working) {
    const p = currentProfile();
    const t = {
      id: 'OD-' + (++ticketSeq),
      question,
      date: mskNow(),
      working,
      answered: false,
      answer: null,
      read: true,
    };
    p.tickets.unshift(t);
    scheduleDemoAnswer(p, t); // [MOCK] имитация ответа юриста
    return t;
  }

  // [MOCK] Через несколько секунд «юрист» отвечает → загорается красный кружок.
  function scheduleDemoAnswer(profile, ticket) {
    setTimeout(() => {
      ticket.answered = true;
      ticket.read = false;
      ticket.answer =
        'Здравствуйте! Благодарим за обращение в юридическую службу ЦПСО EdPalm. ' +
        'Мы изучили ваш вопрос. По вашей ситуации действует общий порядок для семейной ' +
        'формы обучения; чтобы дать точную рекомендацию, при необходимости приложите ' +
        'документы (заявление, ответ школы). Готовы сопровождать вас на каждом шаге. ' +
        'С уважением, юрист ЦПСО EdPalm.';
      updateBadges();
      // если открыт кабинет активного профиля — обновим экран
      if (state.profiles[state.active] === profile && currentScreen() === 'cabinet') {
        render('cabinet', {});
      } else {
        toast('💬 Пришёл ответ юриста — смотрите в Личном кабинете');
      }
    }, 9000);
  }

  function unreadCount() {
    const p = currentProfile();
    return p ? p.tickets.filter((t) => t.answered && !t.read).length : 0;
  }
  function updateBadges() {
    const n = unreadCount();
    el.cabinetDot.hidden = n === 0;
    el.cabinetDot.textContent = n > 0 ? String(n) : '';
  }

  /* =========================================================================
   *  [MOCK] Имитация backend
   * ====================================================================== */

  // [MOCK] Отправка SMS-кода. В бою backend генерирует код и шлёт SMS.
  // В демо код вводится вручную (111111 / 000000) — здесь только имитация задержки.
  function mockSendSms(phone) {
    return new Promise((resolve) => setTimeout(resolve, 700));
  }

  // [MOCK] Проверка кода и доступа. В бою: backend сверяет код и доступ через DMS.
  // В демо: 111111 → доступ есть, 000000 → доступа нет, иначе → неверный код.
  function mockVerifyCode(phone, code) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (code === APP_CONFIG.demoCodes.grant) resolve('granted');
        else if (code === APP_CONFIG.demoCodes.deny) resolve('denied');
        else resolve('wrong');
      }, 500);
    });
  }

  // [MOCK] Передача обращения юристу через Omnidesk
  function mockSendToOmnidesk(payload) {
    return new Promise((resolve) => {
      console.log('[MOCK Omnidesk] Новое обращение:', payload);
      setTimeout(() => resolve({ ticketId: 'OD-' + Math.floor(100000 + Math.random() * 899999) }), 900);
    });
  }

  /* =========================================================================
   *  Рабочее время юриста (Пн–Пт 10:00–18:00 МСК)
   * ====================================================================== */
  function mskNow() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcMs + APP_CONFIG.lawyerSchedule.tzOffset * 3600000);
  }
  function isWorkingHours() {
    const s = APP_CONFIG.lawyerSchedule;
    const d = mskNow();
    return s.days.includes(d.getDay()) && d.getHours() >= s.from && d.getHours() < s.to;
  }

  /* =========================================================================
   *  Вспомогательное: toast, экранирование
   * ====================================================================== */
  let toastTimer = null;
  function toast(msg, ms = 3200) {
    el.toast.hidden = false;
    el.toast.textContent = msg;
    requestAnimationFrame(() => el.toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
    }, ms);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* =========================================================================
   *  Роутер экранов
   * ====================================================================== */
  // screen: ключ из screens; params: данные; opts.replace — не добавлять в историю
  function go(screen, params = {}, opts = {}) {
    if (!opts.replace && !opts.back) {
      state.stack.push({ screen, params });
    }
    render(screen, params);
  }
  function back() {
    if (state.stack.length > 1) {
      state.stack.pop();
      const prev = state.stack[state.stack.length - 1];
      render(prev.screen, prev.params, { back: true });
    }
  }
  function resetTo(screen, params = {}) {
    state.stack = [{ screen, params }];
    render(screen, params);
  }
  function currentScreen() {
    return state.stack.length ? state.stack[state.stack.length - 1].screen : null;
  }

  function render(screen, params) {
    const def = screens[screen];
    if (!def) return;

    closeProfilePop(); // закрываем меню профилей при любой навигации

    // Шапка
    const showBar = !!def.appbar;
    el.appbar.hidden = !showBar;
    el.profileBtn.hidden = !showBar; // кнопка профиля — только на экранах с шапкой
    if (showBar) {
      el.appbarTitle.textContent = typeof def.title === 'function' ? def.title(params) : (def.title || '');
      // Кнопка «Назад» — на всех экранах, кроме корневых (login, home)
      el.backBtn.hidden = !def.back || state.stack.length <= 1;
    }
    updateBadges();

    // Нижнее меню
    el.tabbar.hidden = !def.tabbar;
    el.content.classList.toggle('no-tabbar', !def.tabbar);
    updateTabbar(screen);

    // Контент
    el.content.innerHTML = def.html(params);
    el.content.scrollTop = 0;
    el.content.classList.remove('fade-in');
    void el.content.offsetWidth; // reflow для перезапуска анимации
    el.content.classList.add('fade-in');

    if (def.mount) def.mount(params);
  }

  function updateTabbar(screen) {
    const map = { home: 'home', cabinet: 'cabinet', ask: 'ask', sent: 'ask' };
    const active = map[screen];
    el.tabbar.querySelectorAll('.tabbar__btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === active);
    });
  }

  /* =========================================================================
   *  Экраны
   * ====================================================================== */
  // Персонаж: грузим PNG (настоящий рендер), при отсутствии — запасной SVG.
  function charImg(name, cls, alt) {
    return `<img class="${cls}" src="assets/${name}.png" alt="${esc(alt)}"
      onerror="this.onerror=null;this.src='assets/${name}.svg'" />`;
  }

  // Эврика — гид приложения (используется на главной)
  const characters = `
    <div class="hero__chars">
      ${charImg('eureka', 'eureka', 'Эврика')}
    </div>`;

  // Премиальные линейные иконки тем (цвет наследуется от карточки — currentColor)
  const ICONS = {
    // Классическое здание с колоннами — прикрепление к школе
    'attach-school':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 10 L12 4 L21 10"/><path d="M4.5 10 H19.5"/><path d="M5.5 10 V19"/><path d="M18.5 10 V19"/>' +
      '<path d="M9.5 10 V19"/><path d="M14.5 10 V19"/><path d="M3.5 19.5 H20.5"/></svg>',
    // Лист с печатью-зачётом — прохождение ОГЭ/ЕГЭ
    'pass-exam':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 3 H14 L18 7 V21 H6 Z"/><path d="M14 3 V7 H18"/><path d="M9 12.5 l2 2 l3.5-3.5"/><path d="M9 18 H15"/></svg>',
    // Наградная розетка/медаль — получение аттестата
    'certificate':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="9" r="6"/><path d="M12 6 l1.3 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.6-1.4 -2.6 1.4 .6-2.8 -2.1-1.9 2.8-.3 z"/>' +
      '<path d="M9 14.5 L7.5 21.5 L12 19 L16.5 21.5 L15 14.5"/></svg>',
    // Весы правосудия — вопрос юристу
    'ask-lawyer':
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 4 V20"/><path d="M8 20 H16"/><path d="M6 8 H18"/><circle cx="12" cy="6" r="1.4"/>' +
      '<path d="M6 8 L3.5 13"/><path d="M6 8 L8.5 13"/><path d="M3 13 a3 2 0 0 0 6 0 Z"/>' +
      '<path d="M18 8 L15.5 13"/><path d="M18 8 L20.5 13"/><path d="M15 13 a3 2 0 0 0 6 0 Z"/></svg>',
  };
  const icon = (id) => ICONS[id] || '';

  const screens = {

    /* --------------------------- Авторизация --------------------------- */
    login: {
      appbar: false,
      tabbar: false,
      back: false,
      html() {
        return `
          <div class="auth">
            <div class="hero">
              <div class="brandmark">
                <img src="assets/emblem.svg" alt="" />
                <div class="bm-text">
                  <div class="bm-name">ЦПСО EdPalm</div>
                  <div class="bm-sub">Юридическая поддержка выпускников</div>
                </div>
              </div>
              <div class="grad-badge">🎓 Выпуск 2026/27</div>
            </div>

            <div class="auth__card">
              <button class="btn btn--gold install-btn" data-action="install">⬇️ Установить приложение на устройство</button>
              <h2>Вход в поддержку</h2>
              <p class="hint">Поддержка доступна клиентам пакета «Базовый без&nbsp;ГИА». Укажите телефон — мы проверим доступ и пришлём SMS-код.</p>

              <form id="loginForm" novalidate>
                <div class="field">
                  <label for="country">Страна</label>
                  <select id="country" class="select">
                    ${COUNTRIES.map((c, i) =>
                      `<option value="${c.key}"${i === 0 ? ' selected' : ''}>${c.flag} ${esc(c.name)} (${c.dial})</option>`
                    ).join('')}
                  </select>
                </div>

                <div class="field" id="phoneField">
                  <label for="phone">Номер телефона</label>
                  <div class="phone-input">
                    <span class="dial" id="dial">+7</span>
                    <input id="phone" name="phone" type="tel" inputmode="numeric"
                           autocomplete="tel" maxlength="20" />
                  </div>
                  <div class="field-hint" id="phoneHint">Выберите страну и введите номер без кода страны</div>
                  <div class="err">Введите номер полностью</div>
                </div>

                <button class="btn btn--primary" type="submit" id="loginBtn" disabled>Получить SMS-код</button>
              </form>

              <div class="demo-hint">
                <b>Демо-режим.</b> Введите любой номер. На экране кода:<br />
                код <b>111111</b> → доступ открывается,<br />
                код <b>000000</b> → «доступ не найден».
              </div>
            </div>
          </div>`;
      },
      mount() {
        const form = document.getElementById('loginForm');
        const field = document.getElementById('phoneField');
        const input = document.getElementById('phone');
        const btn = document.getElementById('loginBtn');
        const countrySel = document.getElementById('country');
        const dialEl = document.getElementById('dial');
        const hintEl = document.getElementById('phoneHint');

        const current = () => COUNTRIES.find((c) => c.key === countrySel.value);

        // Форматирование национального номера по группам страны
        function format(digits, groups) {
          const out = []; let i = 0;
          for (const g of groups) { if (i >= digits.length) break; out.push(digits.slice(i, i + g)); i += g; }
          if (i < digits.length) out.push(digits.slice(i));
          return out.join(' ');
        }

        // Перерисовать поле: не даём ввести больше len цифр, активируем кнопку при полном номере
        function reformat() {
          const c = current();
          const digits = input.value.replace(/\D/g, '').slice(0, c.len);
          input.value = format(digits, c.groups);
          btn.disabled = digits.length !== c.len;
          field.classList.remove('invalid');
          return digits;
        }

        function applyCountry() {
          const c = current();
          dialEl.textContent = c.dial;
          input.placeholder = format('0'.repeat(c.len).replace(/0/g, '_'), c.groups);
          hintEl.innerHTML = `Код страны <b>${c.dial}</b> подставляется автоматически. Введите ${c.len} цифр номера.`;
          reformat();
        }

        countrySel.addEventListener('change', () => { applyCountry(); input.focus(); });
        input.addEventListener('input', reformat);
        applyCountry();
        input.focus();

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const c = current();
          const digits = input.value.replace(/\D/g, '');
          if (digits.length !== c.len) { field.classList.add('invalid'); return; }

          const phone = c.dial + digits; // полный номер в формате +<код><номер>

          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Отправляем код…';

          await mockSendSms(phone); // [MOCK] SMS — backend пришлёт код
          state.pendingPhone = phone;
          go('otp', { phone });
          toast('Демо: введите 111111 (доступ) или 000000 (без доступа)', 6000);
        });
      },
    },

    /* --------------------------- SMS-код ------------------------------- */
    otp: {
      appbar: false,
      tabbar: false,
      back: false,
      html(p) {
        return `
          <div class="auth">
            <div class="hero" style="padding-top:24px">
              <div class="brandmark"><img src="assets/logo.svg" alt="" /><span>Подтверждение</span></div>
            </div>
            <div class="auth__card">
              <h2>Введите код из SMS</h2>
              <p class="hint">Мы отправили 6-значный код на номер <b>${esc(formatPhone(p.phone))}</b>.</p>

              <form id="otpForm" novalidate>
                <div class="field" id="otpField">
                  <div class="otp">
                    <input type="text" inputmode="numeric" maxlength="1" data-i="0" />
                    <input type="text" inputmode="numeric" maxlength="1" data-i="1" />
                    <input type="text" inputmode="numeric" maxlength="1" data-i="2" />
                    <input type="text" inputmode="numeric" maxlength="1" data-i="3" />
                    <input type="text" inputmode="numeric" maxlength="1" data-i="4" />
                    <input type="text" inputmode="numeric" maxlength="1" data-i="5" />
                  </div>
                  <div class="err">Неверный код. Проверьте SMS и попробуйте снова.</div>
                </div>
                <button class="btn btn--primary" type="submit" id="otpBtn" disabled>Подтвердить</button>
              </form>

              <div class="demo-hint" style="text-align:center">
                Демо: <b>111111</b> — доступ есть · <b>000000</b> — доступа нет
              </div>
            </div>
          </div>`;
      },
      mount(p) {
        const form = document.getElementById('otpForm');
        const field = document.getElementById('otpField');
        const btn = document.getElementById('otpBtn');
        const inputs = [...document.querySelectorAll('.otp input')];
        inputs[0].focus();

        const last = inputs.length - 1;
        const value = () => inputs.map((i) => i.value).join('');
        const sync = () => { btn.disabled = value().length !== inputs.length; };

        inputs.forEach((inp, idx) => {
          inp.addEventListener('input', () => {
            inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
            field.classList.remove('invalid');
            if (inp.value && idx < last) inputs[idx + 1].focus();
            sync();
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
          });
          inp.addEventListener('paste', (e) => {
            const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, inputs.length);
            if (t) {
              e.preventDefault();
              t.split('').forEach((ch, i) => { if (inputs[i]) inputs[i].value = ch; });
              inputs[Math.min(t.length, last)].focus();
              sync();
            }
          });
        });

        const clearInputs = () => { inputs.forEach((i) => (i.value = '')); inputs[0].focus(); sync(); };

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (value().length !== inputs.length) return;

          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Проверяем…';

          const result = await mockVerifyCode(state.pendingPhone, value()); // [MOCK] код + DMS

          if (result === 'granted') {
            loginPhone(state.pendingPhone);
            resetTo('home');
            toast('Доступ подтверждён. Добро пожаловать!');
          } else if (result === 'denied') {
            go('denied', { phone: state.pendingPhone });
          } else {
            btn.innerHTML = 'Подтвердить';
            field.classList.add('invalid');
            clearInputs();
          }
        });
      },
    },

    /* --------------------------- Доступ не найден ---------------------- */
    denied: {
      appbar: false,
      tabbar: false,
      back: false,
      html(p) {
        return `
          <div class="auth">
            <div class="auth__card" style="margin-top:40px">
              <div class="state" style="padding-top:6px">
                <img src="assets/denied.svg" alt="" style="width:108px;height:108px" />
                <div class="state__title">Доступ не найден</div>
                <div class="state__text">
                  По номеру <b>${esc(formatPhone(p.phone))}</b> доступ к юридической поддержке
                  пакета «Базовый без&nbsp;ГИА» не найден.<br /><br />
                  Проверьте, правильно ли указан номер, или обратитесь к вашему менеджеру.
                </div>
                <button class="btn btn--dark" id="retryBtn">Проверить другой номер</button>
                <button class="btn btn--dark-outline" id="managerBtn" style="margin-top:10px">Связаться с менеджером</button>
              </div>
            </div>
          </div>`;
      },
      mount() {
        document.getElementById('retryBtn').addEventListener('click', () => resetTo('login'));
        document.getElementById('managerBtn').addEventListener('click', () =>
          toast('В рабочей версии — переход к менеджеру (SaleBot / чат).'));
      },
    },

    /* --------------------------- Главная ------------------------------- */
    home: {
      appbar: true,
      tabbar: true,
      back: false,
      title: 'ЦПСО EdPalm',
      html() {
        const topicCards = TOPICS.map((t) => `
          <button class="topic-card topic-card--green" data-topic="${t.id}">
            <div class="topic-card__icon">${icon(t.id)}</div>
            <div class="topic-card__body">
              <div class="topic-card__title">${esc(t.title)}</div>
              <div class="topic-card__sub">${t.questions.length} вопрос(ов)</div>
            </div>
            <div class="topic-card__chev">›</div>
          </button>`).join('');

        return `
          <div class="hero">
            <div class="comic">
              ${charImg('eureka', 'comic__char', 'Эврика')}
              <div class="bubble bubble--left-tail">Выберите тему — я подготовила ответы юриста ЦПСО. Нужен личный ответ — нажмите «Задать вопрос юристу».</div>
            </div>
            <div class="grad-badge">🎓 Юридический навигатор выпускника</div>
          </div>
          <button class="btn btn--dark install-btn" data-action="install" style="margin:4px 0 6px">⬇️ Установить приложение на устройство</button>
          <div class="section-title">Юридические темы</div>
          ${topicCards}
          <button class="topic-card topic-card--gold" data-topic="${ASK_LAWYER.id}">
            <div class="topic-card__icon">${icon(ASK_LAWYER.id)}</div>
            <div class="topic-card__body">
              <div class="topic-card__title">${esc(ASK_LAWYER.title)}</div>
              <div class="topic-card__sub">Индивидуальный ответ юриста</div>
            </div>
            <div class="topic-card__chev">›</div>
          </button>`;
      },
      mount() {
        el.content.querySelectorAll('[data-topic]').forEach((card) => {
          card.addEventListener('click', () => {
            const id = card.dataset.topic;
            if (id === ASK_LAWYER.id) go('ask');
            else go('topic', { id });
          });
        });
      },
    },

    /* --------------------------- Тема (вопросы) ------------------------ */
    topic: {
      appbar: true,
      tabbar: true,
      back: true,
      title(p) { return findTopic(p.id).short; },
      html(p) {
        const topic = findTopic(p.id);
        const items = topic.questions.map((q, i) => `
          <button class="q-item" data-q="${i}">
            <div class="q-item__num">${i + 1}</div>
            <div class="q-item__text">${esc(q.q)}</div>
            <div class="q-item__chev">›</div>
          </button>`).join('');

        return `
          <div class="section-title">${esc(topic.title)}</div>
          ${items}
          <button class="topic-card topic-card--gold" id="askFromTopic" style="margin-top:6px">
            <div class="topic-card__icon">${icon('ask-lawyer')}</div>
            <div class="topic-card__body">
              <div class="topic-card__title">Задать вопрос юристу</div>
              <div class="topic-card__sub">Если вашего вопроса нет в списке</div>
            </div>
            <div class="topic-card__chev">›</div>
          </button>`;
      },
      mount(p) {
        el.content.querySelectorAll('[data-q]').forEach((item) => {
          item.addEventListener('click', () =>
            go('answer', { id: p.id, q: Number(item.dataset.q) }));
        });
        document.getElementById('askFromTopic').addEventListener('click', () =>
          go('ask', { from: p.id }));
      },
    },

    /* --------------------------- Ответ -------------------------------- */
    answer: {
      appbar: true,
      tabbar: true,
      back: true,
      title(p) { return findTopic(p.id).short; },
      html(p) {
        const topic = findTopic(p.id);
        const item = topic.questions[p.q];
        return `
          <div class="answer">
            <div class="answer__inner">
              <img class="answer__seal" src="assets/emblem.svg" alt="" />
              <div class="answer__q">${esc(item.q)}</div>
              <div class="answer__divider"></div>
              <div class="answer__text">${esc(item.a)}</div>
              <div class="answer__note">${esc(APP_CONFIG.answerDisclaimer)}</div>
              <div class="answer__sign">
                ${charImg('owl', '', 'Сова — юрист-наставник')}
                Юридическая служба ЦПСО&nbsp;EdPalm
              </div>
            </div>
          </div>

          <div class="followup">
            <p>Не нашли ответа или нужна помощь по вашей ситуации?</p>
            <button class="btn btn--primary" id="askFromAnswer">⚖️ Задать вопрос юристу</button>
          </div>`;
      },
      mount(p) {
        document.getElementById('askFromAnswer').addEventListener('click', () =>
          go('ask', { from: p.id }));
      },
    },

    /* --------------------------- Форма вопроса ------------------------- */
    ask: {
      appbar: true,
      tabbar: true,
      back: true,
      title: 'Вопрос юристу',
      html() {
        const working = isWorkingHours();
        const note = working
          ? `<span class="dot on"></span><div>Юрист на связи. Обычно отвечает в рабочее время:<br/>Пн–Пт, 10:00–18:00 (МСК).</div>`
          : `<span class="dot off"></span><div>Сейчас вне рабочего времени юриста (Пн–Пт, 10:00–18:00&nbsp;МСК). Вопрос можно отправить — ответ придёт, как только юрист будет на связи.</div>`;
        return `
          <div class="ask-card">
            <div class="ask-head">
              ${charImg('owl', '', 'Сова — юрист-наставник')}
              <div>
                <h2>Задать вопрос юристу</h2>
                <p class="lead">Опишите ситуацию подробнее — передам вопрос юристу-наставнику.</p>
              </div>
            </div>

            <div class="schedule-note">${note}</div>

            <form id="askForm">
              <div class="field">
                <textarea id="question" maxlength="1500" placeholder="Например: Школа отказала в прикреплении для сдачи ОГЭ, ссылаясь на отсутствие мест. Что делать?"></textarea>
                <div class="char-count"><span id="charNow">0</span> / 1500</div>
              </div>
              <button class="btn btn--primary" type="submit" id="sendBtn" disabled>Отправить юристу</button>
            </form>
          </div>`;
      },
      mount() {
        const form = document.getElementById('askForm');
        const ta = document.getElementById('question');
        const btn = document.getElementById('sendBtn');
        const count = document.getElementById('charNow');
        ta.focus();
        ta.addEventListener('input', () => {
          count.textContent = ta.value.length;
          btn.disabled = ta.value.trim().length < 5;
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const text = ta.value.trim();
          if (text.length < 5) return;

          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Отправляем…';

          const working = isWorkingHours();
          await mockSendToOmnidesk({ // [MOCK] Omnidesk
            phone: state.session.phone,
            package: APP_CONFIG.package,
            question: text,
            sentAt: mskNow().toISOString(),
            withinWorkingHours: working,
          });

          const ticket = addTicket(text, working); // сохраняем в Личный кабинет
          go('sent', { working, ticketId: ticket.id });
        });
      },
    },

    /* --------------------------- Вопрос отправлен --------------------- */
    sent: {
      appbar: true,
      tabbar: true,
      back: true,
      title: 'Вопрос отправлен',
      html(p) {
        const msg = p.working
          ? 'Ваш вопрос передан юристу. Ответ придёт в это приложение в рабочее время (Пн–Пт, 10:00–18:00&nbsp;МСК).'
          : APP_CONFIG.offHoursMessage;
        return `
          <div class="auth">
            <div class="auth__card" style="margin-top:34px">
              <div class="state" style="padding-top:6px">
                <div class="success__check">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="state__title">Вопрос передан юристу</div>
                <div class="state__text">${msg}</div>
                <div class="demo-hint" style="text-align:left">
                  <b>Демо:</b> обращение ушло бы в Omnidesk.<br/>Номер обращения: <b>${esc(p.ticketId)}</b>
                </div>
                <button class="btn btn--gold" id="toCabinet" style="margin-top:16px">📂 Мои обращения</button>
                <button class="btn btn--dark-outline" id="toHome" style="margin-top:10px">На главную</button>
              </div>
            </div>
          </div>`;
      },
      mount() {
        document.getElementById('toCabinet').addEventListener('click', () => resetTo('cabinet'));
        document.getElementById('toHome').addEventListener('click', () => resetTo('home'));
      },
    },

    /* --------------------------- Личный кабинет ----------------------- */
    cabinet: {
      appbar: true,
      tabbar: true,
      back: false,
      title: 'Личный кабинет',
      html() {
        const p = currentProfile();
        const tickets = p ? p.tickets : [];

        if (!tickets.length) {
          return `
            <div class="cabinet-head">
              <div class="ch-title">Личный кабинет</div>
              <div class="ch-sub">${esc(p ? p.name : '')}</div>
            </div>
            <div class="cabinet-empty">
              ${charImg('owl', '', 'Сова')}
              <div class="ce-title">Здесь будут ваши обращения</div>
              <div>Задайте вопрос юристу — обращение и ответ появятся в этом разделе.</div>
              <button class="btn btn--gold" id="cabAsk" style="margin:16px auto 0;max-width:260px">⚖️ Задать вопрос юристу</button>
            </div>`;
        }

        const items = tickets.map((t) => {
          const status = t.answered
            ? '<span class="ticket__status is-answered">Получен ответ</span>'
            : '<span class="ticket__status is-pending">Ожидает ответа</span>';
          const newBadge = (t.answered && !t.read) ? '<span class="ticket__new">Новый</span>' : '';
          const body = t.answered
            ? `<div class="ticket__a">
                 <div class="ticket__a-label">${charImg('owl', '', 'Юрист')} Ответ юриста</div>
                 <div class="ticket__a-text">${esc(t.answer)}</div>
               </div>`
            : `<div class="ticket__wait">⏳ Юрист готовит ответ…</div>`;
          return `
            <div class="ticket ${t.answered && !t.read ? 'ticket--unread' : ''}">
              <div class="ticket__head"><div>${status}${newBadge}</div><span class="ticket__date">${formatDate(t.date)}</span></div>
              <div class="ticket__q">${esc(t.question)}</div>
              ${body}
            </div>`;
        }).join('');

        return `
          <div class="cabinet-head">
            <div class="ch-title">Личный кабинет</div>
            <div class="ch-sub">${esc(p.name)} · обращений: ${tickets.length}</div>
          </div>
          ${items}`;
      },
      mount() {
        // Открыли кабинет → отмечаем ответы прочитанными (красный кружок гаснет)
        const p = currentProfile();
        if (p) p.tickets.forEach((t) => { if (t.answered) t.read = true; });
        updateBadges();
        const cabAsk = document.getElementById('cabAsk');
        if (cabAsk) cabAsk.addEventListener('click', () => go('ask'));
      },
    },
  };

  /* =========================================================================
   *  Хелперы контента
   * ====================================================================== */
  function findTopic(id) { return TOPICS.find((t) => t.id === id); }

  function formatDate(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}, ${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function formatPhone(p) {
    if (!p) return p;
    const c = COUNTRIES.find((c) => p.startsWith(c.dial) && p.length === c.dial.length + c.len);
    if (!c) return p;
    const nat = p.slice(c.dial.length);
    const out = []; let i = 0;
    for (const g of c.groups) { if (i >= nat.length) break; out.push(nat.slice(i, i + g)); i += g; }
    if (i < nat.length) out.push(nat.slice(i));
    return c.dial + ' ' + out.join(' ');
  }

  /* =========================================================================
   *  Глобальные обработчики (Назад, табы)
   * ====================================================================== */
  el.backBtn.addEventListener('click', back);

  el.tabbar.querySelectorAll('.tabbar__btn').forEach((b) => {
    b.addEventListener('click', () => {
      const nav = b.dataset.nav;
      if (nav === 'home') resetTo('home');
      else if (nav === 'cabinet') resetTo('cabinet');
      else if (nav === 'ask') { resetTo('home'); go('ask'); }
    });
  });

  /* =========================================================================
   *  Профиль: кнопка в шапке + меню профилей
   * ====================================================================== */
  function closeProfilePop() { el.profilePop.hidden = true; }

  function renderProfilePop() {
    const cur = currentProfile();
    if (!cur) { el.profilePop.innerHTML = ''; return; }
    const others = state.profiles
      .map((p, i) => ({ p, i }))
      .filter((x) => x.i !== state.active);

    el.profilePop.innerHTML = `
      <div class="pp__cur">
        <div class="pp__avatar">${esc(initials(cur.name))}</div>
        <div>
          <div class="pp__name">${esc(cur.name)}</div>
          <div class="pp__phone">${esc(formatPhone(cur.phone))}</div>
        </div>
      </div>
      ${others.length ? '<div class="pp__label">Другие профили</div>' : ''}
      ${others.map((x) => `
        <button class="pp__item" data-switch="${x.i}">
          <div class="pp__avatar sm">${esc(initials(x.p.name))}</div>
          <div class="pp__name sm">${esc(x.p.name)}</div>
        </button>`).join('')}
      <button class="pp__add" id="ppAdd"><span class="pp__plus">+</span> Войти в другой профиль</button>
      <button class="pp__logout" id="ppLogout">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/></svg>
        Выйти из профиля
      </button>`;

    el.profilePop.querySelectorAll('[data-switch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.active = Number(btn.dataset.switch);
        state.session.phone = currentProfile().phone;
        closeProfilePop();
        resetTo('home');
        toast('Профиль переключён: ' + currentProfile().name);
      });
    });
    document.getElementById('ppAdd').addEventListener('click', () => {
      closeProfilePop();
      openAuthModal();
    });
    document.getElementById('ppLogout').addEventListener('click', logoutCurrent);
  }

  // Выход из текущего профиля. Есть другие — переключаемся, иначе — на вход.
  function logoutCurrent() {
    const name = currentProfile() ? currentProfile().name : '';
    state.profiles.splice(state.active, 1);
    closeProfilePop();
    if (state.profiles.length) {
      state.active = 0;
      state.session.phone = currentProfile().phone;
      resetTo('home');
      toast('Вы вышли из «' + name + '». Активен: ' + currentProfile().name);
    } else {
      state.active = -1;
      state.session = { phone: null, verified: false };
      resetTo('login');
      toast('Вы вышли из профиля');
    }
  }

  el.profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.profilePop.hidden) { renderProfilePop(); el.profilePop.hidden = false; }
    else closeProfilePop();
  });
  // Клик вне меню — закрыть
  document.addEventListener('click', (e) => {
    if (!el.profilePop.hidden && !el.profilePop.contains(e.target) && e.target !== el.profileBtn) {
      closeProfilePop();
    }
  });

  /* =========================================================================
   *  Модалка «Войти в другой профиль» (с крестиком закрытия)
   * ====================================================================== */
  const authM = { phone: null };

  function openAuthModal() {
    renderAuthPhoneStep();
    el.authModal.classList.add('show');
  }
  function closeAuthModal() {
    el.authModal.classList.remove('show');
    el.authModalBody.innerHTML = '';
  }
  el.authModalClose.addEventListener('click', closeAuthModal);
  el.authModal.addEventListener('click', (e) => { if (e.target === el.authModal) closeAuthModal(); });

  // Шаг 1 — телефон
  function renderAuthPhoneStep() {
    el.authModalBody.innerHTML = `
      <h2>Войти в другой профиль</h2>
      <p class="hint">Укажите телефон ещё одного ученика — добавим его профиль в кабинет.</p>
      <form id="amForm" novalidate>
        <div class="field">
          <label>Страна</label>
          <select id="amCountry" class="select">
            ${COUNTRIES.map((c, i) => `<option value="${c.key}"${i === 0 ? ' selected' : ''}>${c.flag} ${esc(c.name)} (${c.dial})</option>`).join('')}
          </select>
        </div>
        <div class="field" id="amPhoneField">
          <label>Номер телефона</label>
          <div class="phone-input"><span class="dial" id="amDial">+7</span>
            <input id="amPhone" type="tel" inputmode="numeric" maxlength="20" /></div>
          <div class="field-hint" id="amHint"></div>
          <div class="err">Введите номер полностью</div>
        </div>
        <button class="btn btn--primary" type="submit" id="amBtn" disabled>Получить SMS-код</button>
      </form>`;

    const sel = document.getElementById('amCountry');
    const dial = document.getElementById('amDial');
    const input = document.getElementById('amPhone');
    const hint = document.getElementById('amHint');
    const field = document.getElementById('amPhoneField');
    const btn = document.getElementById('amBtn');
    const cur = () => COUNTRIES.find((c) => c.key === sel.value);

    const fmt = (digits, groups) => {
      const out = []; let i = 0;
      for (const g of groups) { if (i >= digits.length) break; out.push(digits.slice(i, i + g)); i += g; }
      if (i < digits.length) out.push(digits.slice(i));
      return out.join(' ');
    };
    const reformat = () => {
      const c = cur();
      const d = input.value.replace(/\D/g, '').slice(0, c.len);
      input.value = fmt(d, c.groups);
      btn.disabled = d.length !== c.len;
      field.classList.remove('invalid');
    };
    const apply = () => {
      const c = cur();
      dial.textContent = c.dial;
      hint.innerHTML = `Код страны <b>${c.dial}</b> подставится автоматически. Введите ${c.len} цифр.`;
      reformat();
    };
    sel.addEventListener('change', () => { apply(); input.focus(); });
    input.addEventListener('input', reformat);
    apply(); input.focus();

    document.getElementById('amForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = cur();
      const d = input.value.replace(/\D/g, '');
      if (d.length !== c.len) { field.classList.add('invalid'); return; }
      authM.phone = c.dial + d;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Отправляем код…';
      await mockSendSms(authM.phone);
      renderAuthCodeStep();
      toast('Демо: введите 111111 (доступ) или 000000 (без доступа)', 6000);
    });
  }

  // Шаг 2 — код
  function renderAuthCodeStep() {
    el.authModalBody.innerHTML = `
      <h2>Введите код из SMS</h2>
      <p class="hint">Код отправлен на номер <b>${esc(formatPhone(authM.phone))}</b>.</p>
      <form id="amCodeForm" novalidate>
        <div class="field" id="amCodeField">
          <div class="otp">
            ${[0,1,2,3,4,5].map(() => '<input type="text" inputmode="numeric" maxlength="1" />').join('')}
          </div>
          <div class="err">Неверный код. Попробуйте снова.</div>
        </div>
        <button class="btn btn--primary" type="submit" id="amCodeBtn" disabled>Подтвердить</button>
        <div class="demo-hint" style="text-align:center;margin-top:12px">Демо: <b>111111</b> — доступ · <b>000000</b> — нет доступа</div>
      </form>`;

    const form = document.getElementById('amCodeForm');
    const field = document.getElementById('amCodeField');
    const btn = document.getElementById('amCodeBtn');
    const inputs = [...el.authModalBody.querySelectorAll('.otp input')];
    const last = inputs.length - 1;
    inputs[0].focus();
    const val = () => inputs.map((i) => i.value).join('');
    const sync = () => { btn.disabled = val().length !== inputs.length; };

    inputs.forEach((inp, idx) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        field.classList.remove('invalid');
        if (inp.value && idx < last) inputs[idx + 1].focus();
        sync();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (val().length !== inputs.length) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Проверяем…';
      const result = await mockVerifyCode(authM.phone, val());
      if (result === 'granted') {
        loginPhone(authM.phone); // добавит/переключит профиль
        closeAuthModal();
        resetTo('home');
        toast('Профиль добавлен: ' + currentProfile().name);
      } else if (result === 'denied') {
        el.authModalBody.innerHTML =
          `<h2>Доступ не найден</h2>
           <p class="hint">По номеру <b>${esc(formatPhone(authM.phone))}</b> доступ к пакету
           «Базовый без ГИА» не найден. Проверьте номер или обратитесь к менеджеру.</p>
           <button class="btn btn--dark" id="amRetry">Указать другой номер</button>`;
        document.getElementById('amRetry').addEventListener('click', renderAuthPhoneStep);
      } else {
        btn.innerHTML = 'Подтвердить';
        field.classList.add('invalid');
        inputs.forEach((i) => (i.value = '')); inputs[0].focus(); sync();
      }
    });
  }

  /* =========================================================================
   *  PWA: установка приложения на рабочий стол (телефон и компьютер)
   * ====================================================================== */
  const pwa = { deferred: null };

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  // Регистрируем service worker (нужен для установки и офлайна).
  // Работает только по http(s)/localhost — на file:// установки не будет.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Chrome/Edge/Android: ловим событие установки и показываем кнопку
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwa.deferred = e;
    if (!isStandalone()) document.body.classList.add('can-install');
  });

  window.addEventListener('appinstalled', () => {
    document.body.classList.remove('can-install', 'ios-install');
    pwa.deferred = null;
    toast('Готово! Приложение установлено — ищите иконку на рабочем столе.');
  });

  // iOS Safari не поддерживает авто-установку — показываем кнопку с инструкцией
  if (isIOS() && !isStandalone()) document.body.classList.add('ios-install');

  // [ДЕМО] Показываем кнопку «Установить» всегда (чтобы показать клиенту, как
  // скачивается). Если браузер не прислал beforeinstallprompt — клик покажет
  // инструкцию/подсказку. Убрать эту строку, чтобы вернуть штатное поведение.
  if (!isStandalone()) document.body.classList.add('can-install');

  // Клик по любой кнопке «Установить» (кнопки рендерятся внутри экранов)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="install"]');
    if (!btn) return;
    if (pwa.deferred) {
      pwa.deferred.prompt();
      const { outcome } = await pwa.deferred.userChoice;
      if (outcome === 'accepted') document.body.classList.remove('can-install');
      pwa.deferred = null;
    } else if (isIOS()) {
      document.getElementById('iosModal').classList.add('show');
    } else {
      toast('В меню браузера выберите «Установить приложение».');
    }
  });

  // Закрытие модалки-инструкции (iOS)
  const iosModal = document.getElementById('iosModal');
  iosModal.addEventListener('click', (e) => {
    if (e.target === iosModal || e.target.id === 'iosModalClose') iosModal.classList.remove('show');
  });

  /* =========================================================================
   *  Старт приложения  ([MOCK] точка входа из SaleBot-бота)
   * ====================================================================== */
  resetTo('login');

})();
