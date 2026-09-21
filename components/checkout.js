// Checkout: the daily checkout wizard, opened from the toolbar's clipboard
// icon (or a weekday cell in the month bar). One page per step:
//   1. Prospects contacted, broken down by how they were reached
//      (phoned, emailed, messaged, other); the total is worked out.
//   2-6. Meetings (with a joint-call flag), FNAs, Quotes, Cases submitted
//      and Wills leads — each item assigned to a client. Clients are picked
//      from the DB; if the person isn't there yet, "+ Add ... as new client"
//      creates them on the spot (they land in Prospects).
//   7. A status update for every client in the Business tab, every day,
//      even when nothing changed ("Same as last" copies the previous one).
// Next validates the page you're on; Submit writes the items and statuses
// onto the clients' cards, dated for the checkout day, and marks that day
// as checked out.
// Depends on client-card.js (client store), client-cases.js (CASE_TYPES)
// and month-bar.js (date helpers, markDateCheckedOut).

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
    .co-add-btn {
      margin-left: auto;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid var(--gold);
      color: #8a6d0a;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
    }
    .co-add-btn:hover { background: rgba(212, 175, 55, 0.12); }
    .co-empty { font-size: 13px; color: var(--ink-dim); padding: 18px 0; }

    .co-channels {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      max-width: 460px;
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
      max-width: 460px;
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
    .co-textarea { resize: vertical; min-height: 54px; }

    .co-rows { display: flex; flex-direction: column; gap: 8px; }
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
    .co-status-last { font-size: 12px; color: var(--ink-dim); margin-bottom: 6px; }
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

// How the day's prospects were reached. The total is the sum.
const CHECKOUT_CHANNELS = [
  { key: 'phoned', label: 'Phoned' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'messaged', label: 'Messaged (WhatsApp / SMS)' },
  { key: 'other', label: 'Other' },
];

// The item pages, in wizard order. Each item is assigned to a client.
const CHECKOUT_SECTIONS = [
  { key: 'meetings', title: 'Meetings', noun: 'meeting', extra: 'joint', hint: 'Every meeting you held, and whether it was a joint call.' },
  { key: 'fnas', title: 'FNAs', noun: 'FNA', hint: 'The clients you completed an FNA with.' },
  { key: 'quotes', title: 'Quotes', noun: 'quote', hint: 'The clients you submitted a quote to.' },
  { key: 'cases', title: 'Cases', noun: 'case', extra: 'caseType', hint: 'Cases you submitted, and the product for each.' },
  { key: 'willsLeads', title: 'Wills leads', noun: 'wills lead', hint: 'The clients you got a wills lead from.' },
];

// Every wizard page: prospects first, the item pages, statuses last.
const CHECKOUT_STEPS = [
  { key: 'prospects', title: 'Prospects' },
  ...CHECKOUT_SECTIONS,
  { key: 'status', title: 'Status updates' },
];

// Every submitted checkout by ISO date, for other components to read later.
const CHECKOUT_LOG = {};

function _checkoutIso(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Newest first; same-date items keep the order they're inserted in, so a
// fresh one lands on top of its day.
function _checkoutAddItem(list, item) {
  return [item, ...(list || [])].sort((a, b) => b.date.localeCompare(a.date));
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
    this.date = date ? new Date(date) : new Date();
    this.date.setHours(0, 0, 0, 0);
    this.channels = {};
    CHECKOUT_CHANNELS.forEach(c => { this.channels[c.key] = ''; });
    this.rows = {};
    CHECKOUT_SECTIONS.forEach(sec => { this.rows[sec.key] = []; });
    this.newClients = [];
    this.statuses = {};
    this.nextId = 1;
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
      const count = this.rows[st.key]?.length;
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

  _sectionHTML(sec) {
    const rows = this.rows[sec.key];
    const list = rows.length
      ? `<div class="co-rows">${rows.map(r => this._rowHTML(sec, r)).join('')}</div>`
      : `<div class="co-empty">No ${sec.title.toLowerCase()} logged. Add one, or continue if there were none.</div>`;
    return `
      <div data-section="${sec.key}">
        <div class="co-page-head">
          <div>
            <div class="co-page-title">${sec.title}</div>
            <div class="co-page-hint">${sec.hint}</div>
          </div>
          <button class="co-add-btn" type="button" data-action="add-row">+ Add ${sec.noun}</button>
        </div>
        ${list}
      </div>
    `;
  }

  _rowHTML(sec, row) {
    const missingClient = this.showErrors && !row.client;
    let picker;
    if (row.client) {
      const isNew = row.client.kind === 'new';
      picker = `
        <div class="co-chip">
          <span>${_escHtml(this._clientName(row.client))}</span>
          ${isNew ? '<span class="co-chip-new">New</span>' : ''}
          <button class="co-chip-x" type="button" data-action="clear-client" aria-label="Change client">&times;</button>
        </div>
      `;
    } else {
      picker = `
        <div class="co-picker">
          <input class="co-input co-picker-input${missingClient ? ' error' : ''}" type="text" autocomplete="off" placeholder="Search or add a client&hellip;">
          <div class="co-dropdown"></div>
        </div>
      `;
    }

    let extra = '';
    if (sec.extra === 'joint') {
      extra = `<label class="co-check"><input type="checkbox" data-field="joint"${row.joint ? ' checked' : ''}> Joint call</label>`;
    } else if (sec.extra === 'caseType') {
      const opts = CASE_TYPES.map(t => `<option value="${_escHtml(t)}"${t === row.caseType ? ' selected' : ''}>${_escHtml(t)}</option>`).join('');
      const missingType = this.showErrors && !row.caseType;
      extra = `<select class="co-select${missingType ? ' error' : ''}" data-field="caseType"><option value="">Select type&hellip;</option>${opts}</select>`;
    }

    return `
      <div class="co-row" data-row="${row.id}">
        ${picker}
        ${extra}
        <button class="co-row-remove" type="button" data-action="remove-row" aria-label="Remove">&times;</button>
      </div>
    `;
  }

  _businessClients() {
    return getClientRecords().filter(c => c.tab === 'business');
  }

  _recapHTML() {
    const chips = [`<span><b>${this._prospectsTotal()}</b> prospects</span>`]
      .concat(CHECKOUT_SECTIONS.map(sec => `<span><b>${this.rows[sec.key].length}</b> ${sec.title.toLowerCase()}</span>`));
    return `<div class="co-recap">${chips.join('')}</div>`;
  }

  _statusesHTML() {
    const clients = this._businessClients();
    const blocks = clients.length ? clients.map(c => {
      const last = (getClientData(c.id).statuses || [])[0];
      const missing = this.showErrors && !(this.statuses[c.id] || '').trim();
      return `
        <div class="co-status">
          <div class="co-status-head">
            <span class="co-status-name">${_escHtml(c.name)}</span>
            <button class="co-link" type="button" data-action="same-status" data-client="${c.id}"${last ? '' : ' disabled'}>Same as last</button>
          </div>
          ${last ? `<div class="co-status-last">Last update, ${_formatStatusDate(last.date)}: ${_escHtml(last.text)}</div>` : ''}
          <textarea class="co-textarea co-status-input${missing ? ' error' : ''}" data-client="${c.id}" rows="2" placeholder="Today's status&hellip;">${_escHtml(this.statuses[c.id] || '')}</textarea>
        </div>
      `;
    }).join('') : '<div class="co-empty">No clients in Business.</div>';

    return `
      <div class="co-page-head">
        <div>
          <div class="co-page-title">Status updates</div>
          <div class="co-page-hint">Every client in Business needs a new status today, even if nothing has changed.</div>
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
    const rowEl = el.closest('.co-row');
    const secEl = el.closest('[data-section]');
    if (!rowEl || !secEl) return null;
    return this.rows[secEl.dataset.section].find(r => r.id === Number(rowEl.dataset.row)) || null;
  }

  _focusPicker(sectionKey, rowId) {
    this.body.querySelector(`[data-row="${rowId}"] .co-picker-input`)?.focus();
  }

  _selectOption(optEl) {
    const row = this._rowFor(optEl);
    if (!row) return;
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
    this._render();
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

    if (action === 'add-row') {
      const key = btn.closest('[data-section]').dataset.section;
      const row = { id: this.nextId++, client: null, joint: false, caseType: '' };
      this.rows[key].push(row);
      this._render();
      this._focusPicker(key, row.id);
      return;
    }
    if (action === 'remove-row') {
      const row = this._rowFor(btn);
      const key = btn.closest('[data-section]').dataset.section;
      this.rows[key] = this.rows[key].filter(r => r !== row);
      this._render();
      return;
    }
    if (action === 'clear-client') {
      const row = this._rowFor(btn);
      if (!row) return;
      row.client = null;
      this._render();
      this._focusPicker(btn.closest('[data-section]').dataset.section, row.id);
      return;
    }
    if (action === 'same-status') {
      const id = btn.dataset.client;
      const last = (getClientData(id).statuses || [])[0];
      if (last) this.statuses[id] = last.text;
      this._render();
    }
  }

  _onInput(e) {
    const t = e.target;
    if (t.matches('[data-channel]')) {
      this.channels[t.dataset.channel] = t.value;
      this.body.querySelector('.co-total-value').textContent = this._prospectsTotal();
    } else if (t.matches('.co-status-input')) {
      this.statuses[t.dataset.client] = t.value;
      t.classList.remove('error');
    } else if (t.matches('.co-picker-input')) {
      t.classList.remove('error');
      this._fillDropdown(t);
    }
  }

  _onChange(e) {
    const t = e.target;
    const row = this._rowFor(t);
    if (!row) return;
    if (t.matches('[data-field="joint"]')) row.joint = t.checked;
    if (t.matches('[data-field="caseType"]')) {
      row.caseType = t.value;
      t.classList.remove('error');
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

  // A page is valid when every row on it has a client (and a case type,
  // for cases), or, for the status page, every Business client has a status.
  _validateStep(i) {
    const step = CHECKOUT_STEPS[i];
    if (step.key === 'prospects') return true;
    if (step.key === 'status') {
      return this._businessClients().every(c => (this.statuses[c.id] || '').trim());
    }
    return this.rows[step.key].every(row => row.client && (step.extra !== 'caseType' || row.caseType));
  }

  _showStepErrors() {
    this.showErrors = true;
    this.errorMsg.textContent = 'Please fill in the highlighted fields.';
    this._render();
    this.body.querySelector('.error')?.scrollIntoView({ block: 'center' });
  }

  // ---------- submit ----------

  _submit() {
    // Going back can invalidate an earlier page, so check them all.
    const bad = CHECKOUT_STEPS.findIndex((_, i) => !this._validateStep(i));
    if (bad !== -1) {
      this._goTo(bad);
      this._showStepErrors();
      return;
    }

    const iso = _checkoutIso(this.date);

    // New clients first, so every item can point at a real id.
    const idFor = {};
    this.newClients.forEach(n => {
      const slug = `${n.firstName}-${n.lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `${slug}-${Date.now().toString(36)}${n.tempId.replace('new-', '')}`;
      idFor[n.tempId] = id;
      appendClientCard('prospects-cards', {
        id,
        firstName: n.firstName,
        lastName: n.lastName,
        email: '',
        phone: '',
        referrals: 0,
        meetings: [],
        fnas: [],
        quotes: [],
        details: { fullName: `${n.firstName} ${n.lastName}`.trim() },
        casesInProgress: [],
        acceptedCases: [],
        statuses: [],
      });
    });

    // Collect everything per client, then write each client once.
    const byClient = {};
    const slot = id => byClient[id] || (byClient[id] = { meetings: [], fnas: [], quotes: [], cases: [], willsLeads: [] });
    CHECKOUT_SECTIONS.forEach(sec => {
      this.rows[sec.key].forEach(row => {
        const id = row.client.kind === 'new' ? idFor[row.client.id] : row.client.id;
        slot(id)[sec.key].push(row);
      });
    });
    this._businessClients().forEach(c => { slot(c.id); });

    Object.entries(byClient).forEach(([id, items]) => {
      updateClient(id, d => {
        items.meetings.forEach(r => {
          d.meetings = _checkoutAddItem(d.meetings, { date: iso, text: r.joint ? 'Meeting · joint call' : 'Meeting' });
        });
        items.fnas.forEach(() => { d.fnas = _checkoutAddItem(d.fnas, { date: iso, text: 'FNA completed' }); });
        items.quotes.forEach(() => { d.quotes = _checkoutAddItem(d.quotes, { date: iso, text: 'Quote submitted' }); });
        items.cases.forEach(r => {
          d.casesInProgress = _checkoutAddItem(d.casesInProgress, { date: iso, type: r.caseType });
        });
        items.willsLeads.forEach(() => { d.willsLeads = _checkoutAddItem(d.willsLeads, { date: iso, text: 'Wills lead' }); });
        const status = (this.statuses[id] || '').trim();
        if (status) {
          // One status per day: a second checkout the same day replaces it.
          d.statuses = _checkoutAddItem((d.statuses || []).filter(st => st.date !== iso), { date: iso, text: status });
        }
      });
    });

    const prospectChannels = {};
    CHECKOUT_CHANNELS.forEach(c => { prospectChannels[c.key] = Number(this.channels[c.key]) || 0; });
    const counts = {};
    CHECKOUT_SECTIONS.forEach(sec => { counts[sec.key] = this.rows[sec.key].length; });
    const summary = { date: iso, prospects: this._prospectsTotal(), prospectChannels, ...counts };
    CHECKOUT_LOG[iso] = summary;
    document.dispatchEvent(new CustomEvent('checkout:submitted', { detail: summary }));

    markDateCheckedOut(this.date);
    _syncCheckoutTrigger();
    this.close();
  }
}

let _checkoutInstance = null;
let _checkoutTriggerId = null;

function _syncCheckoutTrigger() {
  const trigger = _checkoutTriggerId && document.getElementById(_checkoutTriggerId);
  if (!trigger) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  trigger.classList.toggle('checked-out', isCheckedOut(today));
  trigger.title = isCheckedOut(today) ? "Today's checkout is done" : 'Daily Checkout';
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
