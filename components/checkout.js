// Checkout: the daily checkout wizard, opened from the toolbar's clipboard
// icon (or a weekday cell in the month bar). It always checks out
// yesterday by default — the day just finished is what gets logged and
// locked in, not the day still in progress — though a specific date can
// still be passed in (e.g. from the month bar).
//
// One page per step:
//   1. Prospects contacted, broken down by how they were reached (phoned,
//      emailed, messaged, LinkedIn, other); the total is worked out.
//   2. Meetings — client, meeting type (Fact Finder / Relational / Closing)
//      and whether it was a joint call.
//   3. FNAs — client only.
//   4. Quotes — client, and whether it was for Risk, Investment, or both.
//   5. Cases — client, case type, and the lump sum / monthly payment.
//   6. Wills leads — client only.
//   7. A status update for every open case, every day, even when nothing
//      changed — type one, or pick "Same as last", "Accepted" or "Not
//      taken up" (the last two close the case) from the box's arrow
//      (status-input.js). It's added to that case's log.
//
// Each item page (2-6) always ends in one empty, ready-to-fill row; picking
// a client for it turns it into a real entry and a fresh empty row takes
// its place automatically — there's no separate "add" button. Anything
// already logged for the day (added on the client's card, or in an
// earlier checkout for the same date) shows above those rows as a
// locked, read-only line, so it's never double-entered.
//
// Clients are picked from the DB; if the person isn't there yet, "+ Add
// ... as new client" creates them on the spot (they land in Prospects).
// Next validates the page you're on; Submit saves the new clients, items
// and case statuses to the database (data.js), dated for the checkout
// day, marks that day as checked out, then reloads the cards and
// dashboard — and moves any client whose cases now say they belong in
// another tab (card-items.js syncTabAfterCaseChange).
// Depends on client-card.js (client store, _caseAmountsSuffix),
// client-cases.js (CASE_TYPES), month-bar.js (date helpers) and data.js
// (saving, reloading).

function _injectCheckoutCSS() {
  if (document.getElementById('checkout-styles')) return;
  const s = document.createElement('style');
  s.id = 'checkout-styles';
  s.textContent = `
    .cc-trigger.checked-out { color: var(--green); border-color: var(--green); }

    .co-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 300;
    }
    .co-overlay.open { display: flex; }

    .co-modal {
      background: #ffffff;
      border-radius: 12px;
      width: 720px;
      max-width: 94vw;
      height: 640px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      color: var(--ink);
    }

    .co-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 12px;
    }
    .co-title { font-size: 17px; font-weight: 700; }
    .co-close-btn {
      background: transparent;
      border: none;
      color: var(--ink-dim);
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      padding: 4px;
    }
    .co-close-btn:hover { color: var(--ink); }

    .co-steps {
      display: flex;
      gap: 6px;
      padding: 0 24px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .co-step {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 3px solid #e2e3e2;
      padding: 8px 2px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-dim);
      white-space: nowrap;
      cursor: default;
    }
    .co-step.visited { color: var(--ink); border-bottom-color: rgba(212, 175, 55, 0.5); cursor: pointer; }
    .co-step.active { color: var(--ink); border-bottom-color: var(--gold); }
    .co-step-count {
      display: inline-block;
      margin-left: 4px;
      font-size: 10px;
      background: #ececea;
      border-radius: 8px;
      padding: 0 6px;
    }

    .co-body {
      flex: 1;
      overflow-y: auto;
      padding: 22px 24px;
    }
    .co-page-head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }
    .co-page-title { font-size: 16px; font-weight: 700; }
    .co-page-hint { font-size: 13px; color: var(--ink-dim); margin-top: 3px; }
    .co-empty { font-size: 13px; color: var(--ink-dim); padding: 18px 0; }

    /* Already-logged items for the day: read-only, above the open rows. */
    .co-locked { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .co-locked-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
    }
    .co-locked-row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .co-locked-row svg { flex-shrink: 0; color: var(--ink-dim); }
    .co-locked-name { font-weight: 600; color: var(--ink); flex-shrink: 0; }

    /* Prospects page: one field per row, stacked. */
    .co-channels {
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 320px;
    }
    .co-field { display: flex; flex-direction: column; gap: 4px; }
    .co-field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
    }
    .co-total {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      max-width: 320px;
      font-size: 14px;
      color: var(--ink-dim);
    }
    .co-total b { font-size: 22px; color: var(--ink); margin-left: 8px; }

    .co-input, .co-select, .co-textarea {
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
      background: #fff;
      width: 100%;
    }
    .co-input:focus, .co-select:focus, .co-textarea:focus { border-color: var(--gold); outline: none; }
    .co-input.error, .co-select.error, .co-textarea.error { border-color: var(--red); }
    .co-input:disabled {
      background: #f2f2f0;
      border-color: rgba(0, 0, 0, 0.08);
      color: var(--ink-dim);
      cursor: not-allowed;
    }
    .co-textarea { resize: vertical; min-height: 54px; }

    .co-rows { display: flex; flex-direction: column; gap: 10px; }

    /* Simple rows (meetings, fnas, quotes, wills leads): one line. */
    .co-row { display: flex; align-items: center; gap: 12px; }
    .co-row .co-picker, .co-row .co-chip { flex: 1; min-width: 0; }
    .co-row .co-select { width: 190px; flex-shrink: 0; }
    .co-check {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      white-space: nowrap;
      cursor: pointer;
      flex-shrink: 0;
    }
    .co-checkbox-group {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid transparent;
    }
    .co-checkbox-group.error { border-color: var(--red); }
    .co-row-remove {
      background: transparent;
      border: none;
      color: var(--ink-dim);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 4px 6px;
      flex-shrink: 0;
    }
    .co-row-remove:hover { color: var(--red); }

    /* Case rows: their own card — client + type on top, amounts below. */
    .co-case-card {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 14px 40px 14px 14px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
    }
    .co-case-card .co-picker { grid-column: 1 / 2; }
    .co-case-card .co-chip { grid-column: 1 / 2; }
    .co-case-card .co-row-remove {
      position: absolute;
      top: 8px;
      right: 8px;
    }
    .co-case-estimate {
      border: 1px solid rgba(0, 0, 0, 0.08);
      background: #f7f7f5;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
    }

    .co-picker { position: relative; }
    .co-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
      max-height: 240px;
      overflow-y: auto;
      z-index: 5;
      padding: 4px;
    }
    .co-dropdown.open { display: block; }
    .co-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
    }
    .co-option:hover, .co-option.active { background: #f2f2f0; }
    .co-option-meta { font-size: 11px; color: var(--ink-dim); flex-shrink: 0; }
    .co-option-create { color: #8a6d0a; font-weight: 600; }
    .co-option-empty { padding: 8px 10px; font-size: 13px; color: var(--ink-dim); }

    .co-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f2f2f0;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 14px;
    }
    .co-chip-new {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--gold);
      color: var(--navy);
      border-radius: 4px;
      padding: 1px 6px;
    }
    .co-chip-x {
      margin-left: auto;
      background: transparent;
      border: none;
      color: var(--ink-dim);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    .co-chip-x:hover { color: var(--ink); }

    .co-recap { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .co-recap span {
      background: #f2f2f0;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--ink-dim);
    }
    .co-recap b { color: var(--ink); }

    .co-status { padding: 12px 0; border-top: 1px solid rgba(0, 0, 0, 0.06); }
    .co-recap + .co-status { border-top: none; padding-top: 0; }
    .co-status-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .co-status-name { font-size: 14px; font-weight: 600; }
    .co-status-last { font-size: 12px; color: var(--ink-dim); margin-bottom: 8px; }
    .co-link {
      background: transparent;
      border: none;
      color: #8a6d0a;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      padding: 2px 0;
    }
    .co-link:hover { text-decoration: underline; }
    .co-link:disabled { color: var(--ink-dim); opacity: 0.5; cursor: default; text-decoration: none; }

    .co-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 24px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }
    .co-error-msg { margin-right: auto; font-size: 13px; color: var(--red); }
    .co-back-btn {
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0.15);
      color: var(--ink-dim);
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
    }
    .co-back-btn:hover { color: var(--ink); }
    .co-next-btn {
      background: var(--gold);
      color: var(--navy);
      border: none;
      padding: 8px 22px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
    }
    .co-next-btn:hover { opacity: 0.9; }
  `;
  document.head.appendChild(s);
}
_injectCheckoutCSS();

const _CO_LOCK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

// How the day's prospects were reached. The total is the sum.
const CHECKOUT_CHANNELS = [
  { key: 'phoned', label: 'Phoned' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'messaged', label: 'Messaged (WhatsApp / SMS)' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'other', label: 'Other' },
];

// Meeting types, matching the labels used in the leaderboard's own
// meetings breakdown (factFinder / closing / relational).
const CHECKOUT_MEETING_TYPES = [
  { key: 'factFinder', label: 'Fact Finder' },
  { key: 'relational', label: 'Relational' },
  { key: 'closing', label: 'Closing' },
];

// The item pages, in wizard order. Each item is assigned to a client. Every
// page keeps one open, empty row at the end — picking a client for it
// replaces it with a fresh empty one, so there's no separate "add" step.
const CHECKOUT_SECTIONS = [
  { key: 'meetings', title: 'Meetings', hint: 'Every meeting you held: who with, what kind, and whether it was a joint call.' },
  { key: 'fnas', title: 'FNAs', hint: 'The clients you completed an FNA with.' },
  { key: 'quotes', title: 'Quotes', hint: 'The clients you submitted a quote to, for Risk, Investment or both.' },
  { key: 'cases', title: 'Cases', hint: 'Cases you submitted: the product, and the lump sum or monthly payment.' },
  { key: 'willsLeads', title: 'Wills leads', hint: 'The clients you got a wills lead from.' },
];

// These products are premium-only — no lump sum, so that field is greyed
// out for them.
const CHECKOUT_MONTHLY_ONLY_CASE_TYPES = ['Risk', 'Educator'];

// Every wizard page: prospects first, the item pages, statuses last.
const CHECKOUT_STEPS = [
  { key: 'prospects', title: 'Prospects' },
  ...CHECKOUT_SECTIONS,
  { key: 'status', title: 'Status updates' },
];

function _checkoutIso(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The day a checkout defaults to when no date is given: yesterday, since
// checkout always logs the day that just finished, not the one in
// progress.
function _checkoutDefaultDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

// A fresh row for a given section, with that section's own fields.
function _newCheckoutRow(key, id) {
  const row = { id, client: null };
  if (key === 'meetings') { row.meetingType = ''; row.joint = false; }
  if (key === 'quotes') { row.risk = false; row.investment = false; }
  if (key === 'cases') { row.caseType = ''; row.lumpSum = ''; row.monthly = ''; row.adviceFeePercent = ''; }
  return row;
}

// A field's value as the row stores it: money boxes (money.js) as a
// plain number, everything else as typed.
function _checkoutFieldValue(el) {
  return el.matches('[data-money]') ? (parseMoney(el.value) ?? '') : el.value;
}

// A case row's fields (caseType) don't line up 1:1 with the stored case
// item shape (type) that constants.js expects — bridge the two.
function _caseRowCommission(row) {
  return caseUpfrontCommission({ type: row.caseType, lumpSum: row.lumpSum, monthly: row.monthly, adviceFeePercent: row.adviceFeePercent });
}

class Checkout {
  constructor() {
    this._buildShell();
  }

  _buildShell() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'co-overlay';
    this.overlay.innerHTML = `
      <div class="co-modal" role="dialog" aria-modal="true">
        <div class="co-header">
          <div class="co-title"></div>
          <button class="co-close-btn" type="button" data-action="close" aria-label="Close">&times;</button>
        </div>
        <div class="co-steps"></div>
        <div class="co-body"></div>
        <div class="co-footer">
          <span class="co-error-msg"></span>
          <button class="co-back-btn" type="button" data-action="back">Back</button>
          <button class="co-next-btn" type="button" data-action="next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this.stepsEl = this.overlay.querySelector('.co-steps');
    this.body = this.overlay.querySelector('.co-body');
    this.errorMsg = this.overlay.querySelector('.co-error-msg');
    this.backBtn = this.overlay.querySelector('.co-back-btn');
    this.nextBtn = this.overlay.querySelector('.co-next-btn');

    this.overlay.addEventListener('click', e => this._onClick(e));
    this.overlay.addEventListener('input', e => this._onInput(e));
    this.overlay.addEventListener('change', e => this._onChange(e));
    this.overlay.addEventListener('focusin', e => this._onFocusIn(e));
    this.overlay.addEventListener('focusout', e => this._onFocusOut(e));
    this.overlay.addEventListener('mousedown', e => this._onMouseDown(e));
    this.overlay.addEventListener('keydown', e => this._onKeyDown(e));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) this.close();
    });
  }

  open(date) {
    this.date = date ? new Date(date) : _checkoutDefaultDate();
    this.date.setHours(0, 0, 0, 0);
    this.channels = {};
    CHECKOUT_CHANNELS.forEach(c => { this.channels[c.key] = ''; });
    this.rows = {};
    this.nextId = 1;
    CHECKOUT_SECTIONS.forEach(sec => { this.rows[sec.key] = []; this._normalizeRows(sec.key); });
    this.locked = this._computeLocked();
    this.newClients = [];
    this.createdIds = {};
    this.activitiesSaved = false;
    this.casesSaved = false;
    this.statusesSaved = new Set();
    this.statuses = {};
    this.step = 0;
    this.maxStep = 0;
    this.showErrors = false;

    const isToday = isSameDay(this.date, new Date());
    this.overlay.querySelector('.co-title').textContent =
      isToday ? "Today's Checkout" : `Checkout — ${formatDayMonth(this.date)}`;
    this._render();
    this.overlay.classList.add('open');
  }

  close() {
    this.overlay.classList.remove('open');
  }

  // Anything already recorded against a client for this checkout's date —
  // added on the client's card, or in an earlier checkout for the same
  // day — shown read-only so it's never logged twice.
  _computeLocked() {
    const iso = _checkoutIso(this.date);
    const locked = {};
    CHECKOUT_SECTIONS.forEach(sec => { locked[sec.key] = []; });
    getClientRecords().forEach(c => {
      const data = getClientData(c.id);
      (data.meetings || []).filter(x => x.date === iso).forEach(x => locked.meetings.push({ name: c.name, text: x.text }));
      (data.fnas || []).filter(x => x.date === iso).forEach(x => locked.fnas.push({ name: c.name, text: x.text }));
      (data.quotes || []).filter(x => x.date === iso).forEach(x => locked.quotes.push({ name: c.name, text: x.text }));
      (data.casesInProgress || []).filter(x => x.date === iso).forEach(x => locked.cases.push({ name: c.name, text: `${x.type}${_caseAmountsSuffix(x)}` }));
      (data.willsLeads || []).filter(x => x.date === iso).forEach(x => locked.willsLeads.push({ name: c.name, text: x.text }));
    });
    return locked;
  }

  // Drops any row that never got a client (nothing worth keeping) and adds
  // exactly one fresh, empty row at the end — the one always waiting to be
  // filled in next.
  _normalizeRows(key) {
    this.rows[key] = this.rows[key].filter(r => r.client);
    this.rows[key].push(_newCheckoutRow(key, this.nextId++));
  }

  // ---------- navigation ----------

  _goTo(step) {
    this.step = step;
    this.maxStep = Math.max(this.maxStep, step);
    this.showErrors = false;
    this.errorMsg.textContent = '';
    this._render();
    this.body.scrollTop = 0;
  }

  _next() {
    if (!this._validateStep(this.step)) {
      this._showStepErrors();
      return;
    }
    if (this.step < CHECKOUT_STEPS.length - 1) this._goTo(this.step + 1);
    else this._submit();
  }

  // ---------- rendering ----------

  _render() {
    const top = this.body.scrollTop;
    const step = CHECKOUT_STEPS[this.step];
    this.stepsEl.innerHTML = CHECKOUT_STEPS.map((st, i) => {
      const cls = `co-step${i === this.step ? ' active' : ''}${i <= this.maxStep ? ' visited' : ''}`;
      const count = (this.locked[st.key]?.length || 0) + (this.rows[st.key]?.filter(r => r.client).length || 0);
      const badge = count ? `<span class="co-step-count">${count}</span>` : '';
      return `<button class="${cls}" type="button" data-action="goto" data-step="${i}">${st.title}${badge}</button>`;
    }).join('');

    if (step.key === 'prospects') this.body.innerHTML = this._prospectsHTML();
    else if (step.key === 'status') this.body.innerHTML = this._statusesHTML();
    else this.body.innerHTML = this._sectionHTML(step);
    this.body.scrollTop = top;

    const last = this.step === CHECKOUT_STEPS.length - 1;
    this.backBtn.style.visibility = this.step === 0 ? 'hidden' : 'visible';
    this.nextBtn.textContent = last ? 'Submit checkout' : 'Next';
  }

  _prospectsTotal() {
    return CHECKOUT_CHANNELS.reduce((sum, c) => sum + (Number(this.channels[c.key]) || 0), 0);
  }

  _prospectsHTML() {
    const fields = CHECKOUT_CHANNELS.map(c => `
      <div class="co-field">
        <label for="co-ch-${c.key}">${c.label}</label>
        <input class="co-input" id="co-ch-${c.key}" type="number" min="0" data-channel="${c.key}" value="${_escHtml(this.channels[c.key])}">
      </div>
    `).join('');
    return `
      <div class="co-page-head">
        <div>
          <div class="co-page-title">Prospects contacted</div>
          <div class="co-page-hint">How many prospects did you reach today, and how?</div>
        </div>
      </div>
      <div class="co-channels">${fields}</div>
      <div class="co-total">Total prospects contacted <b class="co-total-value">${this._prospectsTotal()}</b></div>
    `;
  }

  _lockedHTML(sec) {
    const items = this.locked[sec.key];
    if (!items.length) return '';
    const rows = items.map(it => `
      <div class="co-locked-row">
        ${_CO_LOCK_ICON}
        <span class="co-locked-name">${_escHtml(it.name)}</span>
        <span>${_escHtml(it.text)}</span>
      </div>
    `).join('');
    return `<div class="co-locked"><div class="co-locked-title">Already logged for this day</div>${rows}</div>`;
  }

  _sectionHTML(sec) {
    const rows = this.rows[sec.key];
    return `
      <div data-section="${sec.key}">
        <div class="co-page-head">
          <div>
            <div class="co-page-title">${sec.title}</div>
            <div class="co-page-hint">${sec.hint}</div>
          </div>
        </div>
        ${this._lockedHTML(sec)}
        <div class="co-rows">${rows.map(r => this._rowHTML(sec, r)).join('')}</div>
      </div>
    `;
  }

  _pickerHTML(row) {
    if (row.client) {
      const isNew = row.client.kind === 'new';
      return `
        <div class="co-chip">
          <span>${_escHtml(this._clientName(row.client))}</span>
          ${isNew ? '<span class="co-chip-new">New</span>' : ''}
          <button class="co-chip-x" type="button" data-action="clear-client" aria-label="Change client">&times;</button>
        </div>
      `;
    }
    return `
      <div class="co-picker">
        <input class="co-input co-picker-input" type="text" autocomplete="off" placeholder="Search or add a client&hellip;">
        <div class="co-dropdown"></div>
      </div>
    `;
  }

  _rowHTML(sec, row) {
    if (sec.key === 'cases') return this._caseRowHTML(row);
    if (sec.key === 'meetings') return this._meetingRowHTML(row);
    if (sec.key === 'quotes') return this._quoteRowHTML(row);
    // FNAs and wills leads: just a client. A filled row can still be
    // removed outright; the always-empty trailing row can't be (there's
    // nothing to remove), so it has no remove button.
    return `
      <div class="co-row" data-row="${row.id}">
        ${this._pickerHTML(row)}
        ${row.client ? '<button class="co-row-remove" type="button" data-action="remove-row" aria-label="Remove">&times;</button>' : ''}
      </div>
    `;
  }

  _meetingRowHTML(row) {
    const opts = CHECKOUT_MEETING_TYPES.map(t =>
      `<option value="${t.key}"${t.key === row.meetingType ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    const missingType = this.showErrors && row.client && !row.meetingType;
    return `
      <div class="co-row" data-row="${row.id}">
        ${this._pickerHTML(row)}
        <select class="co-select${missingType ? ' error' : ''}" data-field="meetingType"><option value="">Select type&hellip;</option>${opts}</select>
        <label class="co-check"><input type="checkbox" data-field="joint"${row.joint ? ' checked' : ''}> Joint call</label>
        ${row.client ? '<button class="co-row-remove" type="button" data-action="remove-row" aria-label="Remove">&times;</button>' : ''}
      </div>
    `;
  }

  _quoteRowHTML(row) {
    const missingCover = this.showErrors && row.client && !row.risk && !row.investment;
    return `
      <div class="co-row" data-row="${row.id}">
        ${this._pickerHTML(row)}
        <div class="co-checkbox-group${missingCover ? ' error' : ''}">
          <label class="co-check"><input type="checkbox" data-field="risk"${row.risk ? ' checked' : ''}> Risk</label>
          <label class="co-check"><input type="checkbox" data-field="investment"${row.investment ? ' checked' : ''}> Investment</label>
        </div>
        ${row.client ? '<button class="co-row-remove" type="button" data-action="remove-row" aria-label="Remove">&times;</button>' : ''}
      </div>
    `;
  }

  _caseRowHTML(row) {
    const missingType = this.showErrors && row.client && !row.caseType;
    const opts = CASE_TYPES.map(t => `<option value="${_escHtml(t)}"${t === row.caseType ? ' selected' : ''}>${_escHtml(t)}</option>`).join('');
    const monthlyOnly = CHECKOUT_MONTHLY_ONLY_CASE_TYPES.includes(row.caseType);
    const usesAdviceFee = caseUsesAdviceFee(row.caseType);
    const estimate = formatRand(_caseRowCommission(row));
    return `
      <div class="co-case-card" data-row="${row.id}">
        ${this._pickerHTML(row)}
        <select class="co-select${missingType ? ' error' : ''}" data-field="caseType"><option value="">Select type&hellip;</option>${opts}</select>
        <div class="co-field">
          <label>Lump sum</label>
          <input class="co-input" ${MONEY_INPUT_ATTRS} placeholder="R 0" data-field="lumpSum" value="${moneyInputValue(row.lumpSum)}"${monthlyOnly ? ' disabled' : ''}>
        </div>
        <div class="co-field">
          <label>Monthly payment</label>
          <input class="co-input" ${MONEY_INPUT_ATTRS} placeholder="R 0" data-field="monthly" value="${moneyInputValue(row.monthly)}">
        </div>
        <div class="co-field">
          <label>Upfront advice fee %</label>
          <input class="co-input" type="number" min="0" step="0.01" placeholder="0.00" data-field="adviceFeePercent" value="${_escHtml(row.adviceFeePercent)}"${usesAdviceFee ? '' : ' disabled'}>
        </div>
        <div class="co-field">
          <label>Est. upfront commission</label>
          <div class="co-case-estimate">${estimate}</div>
        </div>
        ${row.client ? '<button class="co-row-remove" type="button" data-action="remove-row" aria-label="Remove">&times;</button>' : ''}
      </div>
    `;
  }

  // Every open case across the FA's clients, with its client's name and
  // current status. statuses below is keyed by case id.
  _openCases() {
    return getClientRecords().flatMap(c => (getClientData(c.id).casesInProgress || []).map(k => ({
      id: k.id,
      clientId: c.id,
      label: `${c.name} · ${k.type}`,
      last: (k.statuses || [])[0] || null,
    })));
  }

  _recapHTML() {
    const chips = [`<span><b>${this._prospectsTotal()}</b> prospects</span>`]
      .concat(CHECKOUT_SECTIONS.map(sec => {
        const count = this.locked[sec.key].length + this.rows[sec.key].filter(r => r.client).length;
        return `<span><b>${count}</b> ${sec.title.toLowerCase()}</span>`;
      }));
    return `<div class="co-recap">${chips.join('')}</div>`;
  }

  _statusesHTML() {
    const cases = this._openCases();
    const blocks = cases.length ? cases.map(k => {
      const missing = this.showErrors && !(this.statuses[k.id] || '').trim();
      return `
        <div class="co-status">
          <div class="co-status-head">
            <span class="co-status-name">${_escHtml(k.label)}</span>
          </div>
          ${k.last ? `<div class="co-status-last">Current status, ${_formatStatusTime(k.last.at)}: ${_escHtml(k.last.text)}</div>` : ''}
          ${statusInputHTML({
            value: this.statuses[k.id] || '',
            last: k.last?.text || '',
            attrs: `data-case="${k.id}"`,
            className: `co-status-input${missing ? ' error' : ''}`,
          })}
        </div>
      `;
    }).join('') : '<div class="co-empty">No open cases.</div>';

    return `
      <div class="co-page-head">
        <div>
          <div class="co-page-title">Status updates</div>
          <div class="co-page-hint">Every open case needs a new status today, even if nothing has changed.</div>
        </div>
      </div>
      ${this._recapHTML()}
      ${blocks}
    `;
  }


  // ---------- clients ----------

  _clientName(ref) {
    if (ref.kind === 'new') {
      const n = this.newClients.find(c => c.tempId === ref.id);
      return n ? `${n.firstName} ${n.lastName}`.trim() : '';
    }
    const d = getClientData(ref.id);
    return d ? `${d.firstName} ${d.lastName}`.trim() : '';
  }

  _options(query) {
    const q = query.trim().toLowerCase();
    const all = [
      ...getClientRecords().map(c => ({ kind: 'existing', id: c.id, name: c.name, meta: c.tabLabel })),
      ...this.newClients.map(n => ({ kind: 'new', id: n.tempId, name: `${n.firstName} ${n.lastName}`.trim(), meta: 'New client' })),
    ];
    const matches = all.filter(o => !q || o.name.toLowerCase().includes(q)).slice(0, 8);
    if (q && !all.some(o => o.name.toLowerCase() === q)) {
      matches.push({ kind: 'create', name: query.trim() });
    }
    return matches;
  }

  _fillDropdown(input) {
    const dropdown = input.parentElement.querySelector('.co-dropdown');
    const opts = this._options(input.value);
    dropdown.innerHTML = opts.length ? opts.map((o, i) => {
      const cls = `co-option${o.kind === 'create' ? ' co-option-create' : ''}${i === 0 ? ' active' : ''}`;
      const label = o.kind === 'create' ? `+ Add &ldquo;${_escHtml(o.name)}&rdquo; as new client` : _escHtml(o.name);
      const meta = o.meta ? `<span class="co-option-meta">${_escHtml(o.meta)}</span>` : '';
      return `<div class="${cls}" data-kind="${o.kind}" data-id="${o.id || ''}" data-name="${_escHtml(o.name)}"><span>${label}</span>${meta}</div>`;
    }).join('') : '<div class="co-option-empty">No clients yet. Type a name to add one.</div>';
    dropdown.classList.add('open');
  }

  _rowFor(el) {
    const rowEl = el.closest('[data-row]');
    const secEl = el.closest('[data-section]');
    if (!rowEl || !secEl) return null;
    return this.rows[secEl.dataset.section].find(r => r.id === Number(rowEl.dataset.row)) || null;
  }

  _focusPicker(sectionKey, rowId) {
    this.body.querySelector(`[data-row="${rowId}"] .co-picker-input`)?.focus();
  }

  // A row just got its client — replace it with a fresh empty one so
  // there's always exactly one open row waiting at the end, then focus it.
  _selectOption(optEl) {
    const row = this._rowFor(optEl);
    const key = optEl.closest('[data-section]')?.dataset.section;
    if (!row || !key) return;
    const { kind, id, name } = optEl.dataset;
    if (kind === 'create') {
      const parts = name.trim().split(/\s+/);
      const firstName = parts.shift();
      const lastName = parts.join(' ');
      const tempId = `new-${this.nextId++}`;
      this.newClients.push({ tempId, firstName, lastName });
      row.client = { kind: 'new', id: tempId };
    } else {
      row.client = { kind, id };
    }
    this._normalizeRows(key);
    this._render();
    this._focusPicker(key, this.rows[key][this.rows[key].length - 1].id);
  }

  // ---------- events ----------

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close') return this.close();
    if (action === 'next') return this._next();
    if (action === 'back') return this._goTo(this.step - 1);
    if (action === 'goto') {
      const target = Number(btn.dataset.step);
      if (target <= this.maxStep && target !== this.step) this._goTo(target);
      return;
    }

    if (action === 'remove-row') {
      const row = this._rowFor(btn);
      const key = btn.closest('[data-section]').dataset.section;
      this.rows[key] = this.rows[key].filter(r => r !== row);
      this._normalizeRows(key);
      this._render();
      return;
    }
    if (action === 'clear-client') {
      const row = this._rowFor(btn);
      const key = btn.closest('[data-section]')?.dataset.section;
      if (!row || !key) return;
      row.client = null;
      this._normalizeRows(key);
      this._render();
      this._focusPicker(key, this.rows[key][this.rows[key].length - 1].id);
      return;
    }
  }

  _onInput(e) {
    const t = e.target;
    if (t.matches('[data-channel]')) {
      this.channels[t.dataset.channel] = t.value;
      this.body.querySelector('.co-total-value').textContent = this._prospectsTotal();
    } else if (t.matches('.co-status-input')) {
      this.statuses[t.dataset.case] = t.value;
      t.classList.remove('error');
    } else if (t.matches('.co-picker-input')) {
      this._fillDropdown(t);
    } else if (t.matches('[data-field]')) {
      const row = this._rowFor(t);
      if (!row) return;
      row[t.dataset.field] = _checkoutFieldValue(t);
      t.classList.remove('error');
      // Cases: update the live commission estimate without a full
      // re-render, so typing doesn't lose the field's cursor position.
      const card = t.closest('.co-case-card');
      if (card) card.querySelector(".co-case-estimate").textContent = formatRand(_caseRowCommission(row));
    }
  }

  _onChange(e) {
    const t = e.target;
    const row = this._rowFor(t);
    if (!row || !t.dataset.field) return;
    if (t.type === 'checkbox') {
      row[t.dataset.field] = t.checked;
      t.closest('.co-checkbox-group')?.classList.remove('error');
    } else {
      row[t.dataset.field] = _checkoutFieldValue(t);
      t.classList.remove('error');
    }
    // Risk and Educator are premium-only (no lump sum); everything except
    // the advice-fee bucket has no fee field either — drop whichever
    // doesn't apply to the newly chosen product and re-render so the
    // fields grey in/out and the estimate reflects the new formula.
    if (t.dataset.field === 'caseType') {
      if (CHECKOUT_MONTHLY_ONLY_CASE_TYPES.includes(row.caseType)) row.lumpSum = '';
      if (!caseUsesAdviceFee(row.caseType)) row.adviceFeePercent = '';
      this._render();
    }
  }

  _onFocusIn(e) {
    if (e.target.matches('.co-picker-input')) this._fillDropdown(e.target);
  }

  _onFocusOut(e) {
    if (e.target.matches('.co-picker-input')) {
      e.target.parentElement.querySelector('.co-dropdown')?.classList.remove('open');
    }
  }

  // Options select on mousedown (with default prevented) so the input keeps
  // focus and its dropdown isn't torn down before the click lands.
  _onMouseDown(e) {
    const opt = e.target.closest('.co-option');
    if (!opt) return;
    e.preventDefault();
    this._selectOption(opt);
  }

  _onKeyDown(e) {
    const input = e.target.closest?.('.co-picker-input');
    if (!input) return;
    const dropdown = input.parentElement.querySelector('.co-dropdown');
    const options = Array.from(dropdown.querySelectorAll('.co-option'));
    const idx = options.findIndex(o => o.classList.contains('active'));

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!dropdown.classList.contains('open')) return this._fillDropdown(input);
      if (!options.length) return;
      const next = (idx + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle('active', i === next));
      options[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = options[idx] || options[0];
      if (target) this._selectOption(target);
    } else if (e.key === 'Escape' && dropdown.classList.contains('open')) {
      e.stopPropagation();
      dropdown.classList.remove('open');
    }
  }

  // ---------- validation ----------

  // A page is valid when every row that's actually been started (has a
  // client) also has that section's own required fields — the ever-present
  // empty trailing row is skipped entirely, since it's not been touched.
  // The status page instead needs every open case filled in.
  _validateStep(i) {
    const step = CHECKOUT_STEPS[i];
    if (step.key === 'prospects') return true;
    if (step.key === 'status') {
      return this._openCases().every(k => (this.statuses[k.id] || '').trim());
    }
    return this.rows[step.key].filter(row => row.client).every(row => {
      if (step.key === 'meetings') return !!row.meetingType;
      if (step.key === 'quotes') return row.risk || row.investment;
      if (step.key === 'cases') return !!row.caseType;
      return true;
    });
  }

  _showStepErrors() {
    this.showErrors = true;
    this.errorMsg.textContent = 'Please fill in the highlighted fields.';
    this._render();
    this.body.querySelector('.error')?.scrollIntoView({ block: 'center' });
  }

  // ---------- submit ----------

  async _submit() {
    // Going back can invalidate an earlier page, so check them all.
    const bad = CHECKOUT_STEPS.findIndex((_, i) => !this._validateStep(i));
    if (bad !== -1) {
      this._goTo(bad);
      this._showStepErrors();
      return;
    }
    if (this.saving) return;
    this.saving = true;
    this.nextBtn.disabled = true;
    this.nextBtn.textContent = 'Saving…';
    this.errorMsg.textContent = '';

    try {
      await this._save();
      // Everything's in the database: reload so the cards and dashboard
      // show exactly what was saved.
      await loadAppData();
      this.close();
      for (const clientId of this.clientsToSync) {
        await syncTabAfterCaseChange(clientId).catch(showSaveError);
      }
    } catch (err) {
      console.error(err);
      this.errorMsg.textContent = `Couldn't save — ${err.message || err}. Nothing was lost; try Submit again.`;
    } finally {
      this.saving = false;
      this.nextBtn.disabled = false;
      this.nextBtn.textContent = 'Submit checkout';
    }
  }

  // Writes the whole checkout. New clients go first, so every item can
  // point at a real id. If a later step fails, Submit can safely be
  // retried: clients created on the first attempt are remembered
  // (this.createdIds) rather than created twice.
  async _save() {
    const iso = _checkoutIso(this.date);

    this.createdIds = this.createdIds || {};
    for (const n of this.newClients) {
      if (this.createdIds[n.tempId]) continue;
      const card = await dbCreateClient({ firstName: n.firstName, lastName: n.lastName });
      this.createdIds[n.tempId] = card.id;
    }
    const idOf = row => (row.client.kind === 'new' ? this.createdIds[row.client.id] : row.client.id);
    const filled = key => this.rows[key].filter(row => row.client);

    const activities = [];
    filled('meetings').forEach(r => activities.push({
      client_id: idOf(r), type: 'meeting', date: iso, details: { meetingType: r.meetingType, joint: !!r.joint },
    }));
    filled('fnas').forEach(r => activities.push({ client_id: idOf(r), type: 'fna', date: iso, details: {} }));
    filled('quotes').forEach(r => activities.push({
      client_id: idOf(r), type: 'quote', date: iso, details: { risk: !!r.risk, investment: !!r.investment },
    }));
    filled('willsLeads').forEach(r => activities.push({ client_id: idOf(r), type: 'wills_lead', date: iso, details: {} }));
    CHECKOUT_CHANNELS.forEach(c => {
      const count = Number(this.channels[c.key]) || 0;
      if (count > 0) activities.push({ client_id: null, type: 'prospect_contact', date: iso, details: { channel: c.key, count } });
    });

    const cases = filled('cases').map(r => ({
      client_id: idOf(r),
      case_type: r.caseType,
      initiated_date: iso,
      lump_sum: r.lumpSum ? Number(r.lumpSum) : null,
      monthly: r.monthly ? Number(r.monthly) : null,
      advice_fee_percent: r.adviceFeePercent ? Number(r.adviceFeePercent) : null,
    }));

    const statuses = this._openCases()
      .map(k => ({ caseId: k.id, clientId: k.clientId, text: (this.statuses[k.id] || '').trim() }))
      .filter(st => st.text);
    // Clients whose tab may need to change once this is saved: anyone
    // with a new case, or whose case this closes.
    this.clientsToSync = new Set([
      ...cases.map(c => c.client_id),
      ...statuses.filter(st => caseEndingFor(st.text)).map(st => st.clientId),
    ]);

    // Items and cases in one insert each, so neither is ever half-written;
    // the flags stop a retry from saving either twice.
    if (!this.activitiesSaved) {
      await dbInsertActivities(activities);
      this.activitiesSaved = true;
    }
    if (!this.casesSaved) {
      await dbInsertCases(cases);
      this.casesSaved = true;
    }
    for (const st of statuses) {
      if (this.statusesSaved.has(st.caseId)) continue;
      await dbAddCaseStatus(st.caseId, st.text);
      this.statusesSaved.add(st.caseId);
    }
    await dbMarkCheckedOut(iso);
  }
}

let _checkoutInstance = null;
let _checkoutTriggerId = null;

function _syncCheckoutTrigger() {
  const trigger = _checkoutTriggerId && document.getElementById(_checkoutTriggerId);
  if (!trigger) return;
  const pending = isCheckedOut(_checkoutDefaultDate());
  trigger.classList.toggle('checked-out', pending);
  trigger.title = pending ? "Yesterday's checkout is done" : 'Daily Checkout';
}

function openCheckout(date) {
  _checkoutInstance?.open(date);
}

function initCheckout(triggerId) {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return null;
  _checkoutInstance = new Checkout();
  _checkoutTriggerId = triggerId;
  trigger.addEventListener('click', () => _checkoutInstance.open());
  _syncCheckoutTrigger();
  return _checkoutInstance;
}
