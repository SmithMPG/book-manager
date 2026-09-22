// Client card: one consistent card, used in every tab (Prospects,
// Business, Clients, Not Moved Forward). Collapsed row is the client's name,
// the client's latest status, then read-only counts (Referrals, a divider,
// then the funnel: Meetings, FNAs, Quotes, Cases) — no contact details,
// action button or chevron. Clicking the row uncollapses it into the
// client's full status history (one dated entry per daily checkout, newest
// first); clicking a funnel count shows that metric's dated list instead.

function _injectClientCardCSS() {
  if (document.getElementById('client-card-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-card-styles';
  s.textContent = `
    .card-wrapper {
      cursor: grab;
      transition: opacity 0.15s ease;
    }
    .card-wrapper.dragging { opacity: 0.4; }

    .list-row {
      background: #f2f2f0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 24px;
      cursor: pointer;
      color: var(--ink-dim);
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    .list-row .name { min-width: 180px; font-size: 15px; }
    .list-row .name b { color: var(--ink); }
    .list-row .name span { color: var(--ink-dim); margin-left: 4px; }
    .list-row .spacer { flex: 1; }

    /* The row currently expanded — highlighted navy, matching the app's
       dark accent, while every other (collapsed) row stays plain/off-white. */
    .list-row.active {
      background: var(--navy);
      border-color: var(--navy);
      color: var(--text-dim);
    }
    .list-row.active .name b { color: var(--text); }
    .list-row.active .name span { color: var(--text-dim); }

    .row-detail {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      margin: -10px 0 10px 0;
      padding: 18px 20px;
      display: none;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .row-detail.open { display: block; }

    .card-last-status {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-metrics {
      display: flex;
      align-items: center;
      gap: 28px;
    }
    .card-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 62px;
      line-height: 1.2;
    }
    .card-metric-value {
      font-size: 17px;
      font-weight: 700;
      color: var(--ink);
    }
    .card-metric-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ink-dim);
    }
    /* Separates Referrals from the sales funnel (Meetings > FNAs > Quotes > Cases). */
    .card-metrics-divider {
      width: 1px;
      height: 30px;
      background: rgba(0, 0, 0, 0.18);
    }
    .list-row.active .card-metrics-divider { background: rgba(255, 255, 255, 0.25); }

    /* Quick-add: logs one item against this client without opening the
       full checkout. Sits at the end of the row, after Cases. */
    .qa-btn {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      border-radius: 50%;
      border: 1px dashed rgba(0, 0, 0, 0.25);
      background: transparent;
      color: var(--ink-dim);
      font-size: 15px;
      line-height: 1;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qa-btn:hover { border-color: var(--gold); border-style: solid; color: #8a6d0a; background: rgba(212, 175, 55, 0.1); }
    .list-row.active .qa-btn { border-color: rgba(255, 255, 255, 0.35); color: var(--text-dim); }
    .list-row.active .qa-btn:hover { border-color: var(--gold); border-style: solid; color: var(--gold-soft); background: rgba(255, 255, 255, 0.1); }

    .qa-popover {
      position: fixed;
      z-index: 250;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 6px;
      width: 210px;
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .qa-item, .qa-back {
      background: transparent;
      border: none;
      text-align: left;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      border-radius: 6px;
      cursor: pointer;
    }
    .qa-item:hover, .qa-back:hover { background: #f2f2f0; }
    .qa-back { color: var(--ink-dim); font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .qa-divider { height: 1px; background: rgba(0, 0, 0, 0.08); margin: 4px 2px; }
    .card-metric[data-view] {
      cursor: pointer;
      padding: 4px 6px;
      margin: -4px -6px;
      border-radius: 6px;
      transition: background 0.12s ease;
    }
    .card-metric[data-view]:hover { background: rgba(0, 0, 0, 0.06); }
    .list-row.active .card-metric[data-view]:hover { background: rgba(255, 255, 255, 0.1); }
    .list-row.active .card-metric.selected { background: rgba(255, 255, 255, 0.14); }
    .list-row.active .card-metric.selected .card-metric-label { color: var(--gold-soft); }
    .list-row.active .card-metric-value { color: var(--gold-soft); }
    .list-row.active .card-metric-label { color: var(--text-dim); }

    .detail-view { display: none; }
    .detail-view.active { display: block; }

    .detail-list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 360px;
      overflow-y: auto;
    }
    .detail-item {
      display: flex;
      gap: 20px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .detail-item:first-child { padding-top: 0; }
    .detail-item:last-child { border-bottom: none; padding-bottom: 0; }
    .detail-date {
      width: 96px;
      flex-shrink: 0;
      font-weight: 600;
      color: var(--ink);
    }
    .detail-text { color: var(--ink-dim); line-height: 1.45; }
    .detail-empty { color: var(--ink-dim); }

    .case-detail-item { align-items: center; }
    .case-detail-item .detail-text { flex: 1; }
    /* Segmented left/right switch between In Progress and Accepted — the
       whole point is the two states read as opposite sides of one control,
       not an independent tick. */
    .case-status-toggle {
      display: inline-flex;
      flex-shrink: 0;
      background: #ececea;
      border-radius: 999px;
      padding: 3px;
      gap: 2px;
    }
    .case-status-btn {
      border: none;
      background: transparent;
      padding: 5px 12px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-dim);
      border-radius: 999px;
      cursor: pointer;
      white-space: nowrap;
    }
    .case-status-btn:hover:not(.active) { color: var(--ink); }
    .case-status-btn.active {
      background: #ffffff;
      color: #8a6d0a;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }
  `;
  document.head.appendChild(s);
}
_injectClientCardCSS();

function _escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const _STATUS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _formatStatusDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${_STATUS_MONTHS[m - 1]} ${y}`;
}

// One dated list, used for status updates and for each funnel metric.
// Items are {date, text}, newest first.
function _detailListHTML(items, emptyText) {
  if (!items || !items.length) return `<div class="detail-empty">${emptyText}</div>`;
  const rows = items.map(it => `
    <li class="detail-item">
      <span class="detail-date">${_formatStatusDate(it.date)}</span>
      <span class="detail-text">${_escHtml(it.text)}</span>
    </li>
  `).join('');
  return `<ul class="detail-list">${rows}</ul>`;
}

function _todayIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Newest first; same-date items keep the order they're inserted in, so a
// fresh one lands on top of its day. Shared with the checkout wizard.
function _addDatedItem(list, item) {
  return [item, ...(list || [])].sort((a, b) => b.date.localeCompare(a.date));
}

function _formatRand(n) {
  return `R${Number(n).toLocaleString('en-ZA')}`;
}

// Lump sum / monthly payment / advice fee, when a case was logged with any
// of them (the checkout wizard's cases page; quick-add doesn't collect
// these), plus the upfront commission (constants.js) they work out
// to, when it's non-zero.
function _caseAmountsSuffix(c) {
  const parts = [];
  if (c.lumpSum) parts.push(`${_formatRand(c.lumpSum)} lump sum`);
  if (c.monthly) parts.push(`${_formatRand(c.monthly)} pm`);
  if (c.adviceFeePercent) parts.push(`${c.adviceFeePercent}% advice fee`);
  const commission = caseUpfrontCommission(c);
  if (commission) parts.push(`${_formatRand(commission)} commission`);
  return parts.length ? ` · ${parts.join(' / ')}` : '';
}

// Cases come from the in-progress and accepted lists, merged newest first.
// Used just for the row's Cases count — the detail view below has its own
// renderer, since in-progress cases carry an Accept toggle.
function _caseItems(data) {
  const inProgress = (data.casesInProgress || []).map(c => ({ date: c.date, text: `${c.type} · in progress${_caseAmountsSuffix(c)}` }));
  const accepted = (data.acceptedCases || []).map(c => ({ date: c.date, text: `${c.type} · accepted${_caseAmountsSuffix(c)}` }));
  return inProgress.concat(accepted).sort((a, b) => b.date.localeCompare(a.date));
}

// The Cases detail view: same dated list as everywhere else, except every
// case gets a segmented In Progress / Accepted switch — a real two-way
// toggle, not a one-time action: flipping it to Accepted moves that case
// into acceptedCases, flipping it back moves it into casesInProgress.
// Either way its date resets to today (the date of whichever state it's
// now in), since that's what "accepted this month" is measured against.
function _caseStatusToggleHTML(clientId, idx, kind) {
  const btn = (target, label) => `
    <button type="button" class="case-status-btn${kind === target ? ' active' : ''}"
      data-action="set-case-status" data-client="${clientId}" data-idx="${idx}" data-kind="${kind}" data-target="${target}">${label}</button>
  `;
  return `<div class="case-status-toggle">${btn('in-progress', 'In Progress')}${btn('accepted', 'Accepted')}</div>`;
}

function _caseDetailHTML(data) {
  const inProgress = data.casesInProgress || [];
  const accepted = data.acceptedCases || [];
  if (!inProgress.length && !accepted.length) return '<div class="detail-empty">No cases yet.</div>';

  const rows = [
    ...inProgress.map((c, idx) => ({ ...c, idx, kind: 'in-progress' })),
    ...accepted.map((c, idx) => ({ ...c, idx, kind: 'accepted' })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const items = rows.map(c => {
    const label = c.kind === 'in-progress' ? 'in progress' : 'accepted';
    return `
      <li class="detail-item case-detail-item">
        <span class="detail-date">${_formatStatusDate(c.date)}</span>
        <span class="detail-text">${_escHtml(c.type)} · ${label}${_caseAmountsSuffix(c)}</span>
        ${_caseStatusToggleHTML(data.id, c.idx, c.kind)}
      </li>
    `;
  }).join('');
  return `<ul class="detail-list">${items}</ul>`;
}

// Latest status (statuses are newest first), shown on the collapsed row.
// Always rendered so it soaks up the free space between name and metrics,
// even for a client with no updates yet.
function _cardLastStatusHTML(statuses) {
  const last = statuses && statuses[0];
  if (!last) return '<div class="card-last-status"></div>';
  return `
    <div class="card-last-status" title="${_escHtml(last.text)}">${_escHtml(last.text)}</div>
  `;
}

// Funnel metrics pass a `view` so clicking them opens their dated list;
// Referrals has none and isn't clickable.
function _cardMetric(label, value, view) {
  const attrs = view ? ` data-view="${view}" title="Show ${label}"` : '';
  return `
    <div class="card-metric"${attrs}>
      <span class="card-metric-value">${value}</span>
      <span class="card-metric-label">${label}</span>
    </div>
  `;
}

// Each metric count is the length of its list, so the two can't disagree.
function clientCardHTML(data) {
  const meetings = data.meetings || [];
  const fnas = data.fnas || [];
  const quotes = data.quotes || [];
  const cases = _caseItems(data);

  return `
    <div class="card-wrapper" draggable="true">
      <div class="list-row" data-card-id="${data.id}" data-view="statuses">
        <div class="name"><b>${_escHtml(data.firstName)}</b><span>${_escHtml(data.lastName)}</span></div>
        ${_cardLastStatusHTML(data.statuses)}
        <div class="card-metrics">
          ${_cardMetric('Referrals', data.referrals || 0)}
          <span class="card-metrics-divider"></span>
          ${_cardMetric('Meetings', meetings.length, 'meetings')}
          ${_cardMetric('FNAs', fnas.length, 'fnas')}
          ${_cardMetric('Quotes', quotes.length, 'quotes')}
          ${_cardMetric('Cases', cases.length, 'cases')}
          <button class="qa-btn" type="button" data-action="quick-add" title="Add for ${_escHtml(data.firstName)}">+</button>
        </div>
      </div>
      <div class="row-detail" id="row-${data.id}">
        <div class="detail-view active" data-view="statuses">${_detailListHTML(data.statuses, 'No status updates yet.')}</div>
        <div class="detail-view" data-view="meetings">${_detailListHTML(meetings, 'No meetings yet.')}</div>
        <div class="detail-view" data-view="fnas">${_detailListHTML(fnas, 'No FNAs yet.')}</div>
        <div class="detail-view" data-view="quotes">${_detailListHTML(quotes, 'No quotes yet.')}</div>
        <div class="detail-view" data-view="cases">${_caseDetailHTML(data)}</div>
      </div>
    </div>
  `;
}

// Client store: every rendered card's data, keyed by id, so other components
// (the checkout) can look clients up and update them. Which tab a client is
// in comes from the DOM, not the store, because cards get dragged between tabs.
const CLIENT_STORE = new Map();
const CLIENT_TAB_LABELS = {
  prospects: 'Prospects',
  business: 'Business',
  clients: 'Clients',
  'not-moved': 'Not Moved Forward',
};

function _notifyClientsChanged() {
  document.dispatchEvent(new CustomEvent('clients:changed'));
}

function renderClientCards(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) return;
  cards.forEach(card => CLIENT_STORE.set(card.id, card));
  container.innerHTML = cards.map(clientCardHTML).join('');
  _notifyClientsChanged();
}

function appendClientCard(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  CLIENT_STORE.set(data.id, data);
  container.insertAdjacentHTML('beforeend', clientCardHTML(data));
  _notifyClientsChanged();
}

function getClientData(id) {
  return CLIENT_STORE.get(id) || null;
}

// Every client with the tab they currently sit in.
function getClientRecords() {
  return Array.from(CLIENT_STORE.values()).map(data => {
    const tabContent = document.getElementById(`row-${data.id}`)?.closest('.tab-content');
    const tab = tabContent ? tabContent.id.replace('tab-', '') : '';
    return {
      id: data.id,
      name: `${data.firstName} ${data.lastName}`.trim(),
      tab,
      tabLabel: CLIENT_TAB_LABELS[tab] || '',
    };
  });
}

// Apply `mutate` to a client's data and re-render just that card in place,
// keeping it open on the same view if it was.
function updateClient(id, mutate) {
  const data = CLIENT_STORE.get(id);
  if (!data) return;
  mutate(data);
  _notifyClientsChanged();
  const row = document.querySelector(`.list-row[data-card-id="${id}"]`);
  if (!row) return;
  const wrapper = row.parentElement;
  const wasOpen = wrapper.querySelector('.row-detail').classList.contains('open');
  const view = row.dataset.view;
  const tmp = document.createElement('div');
  tmp.innerHTML = clientCardHTML(data).trim();
  const fresh = tmp.firstElementChild;
  wrapper.replaceWith(fresh);
  if (wasOpen) {
    const freshRow = fresh.querySelector('.list-row');
    const freshDetail = fresh.querySelector('.row-detail');
    _setCardView(freshRow, freshDetail, view);
    freshDetail.classList.add('open');
    freshRow.classList.add('active');
  }
}

// Quick add: a small menu opened from a client's "+". A referral is simple
// enough to apply immediately; everything else (meeting, FNA, quote, case)
// has its own fields to fill in (meeting type, risk/investment, case type
// and amounts…) that only the checkout wizard collects, so those instead
// open the wizard itself, jumped straight to that page with this client
// already selected in an open row — no separate, smaller version of the
// same form to keep in sync.

function _closeQuickAdd() {
  document.getElementById('quick-add-popover')?.remove();
  document.removeEventListener('click', _outsideQuickAddClick, true);
}

function _outsideQuickAddClick(e) {
  if (e.target.closest('.qa-popover') || e.target.closest('.qa-btn')) return;
  _closeQuickAdd();
}

function _quickAddMenuHTML() {
  return `
    <button class="qa-item" type="button" data-qa="referral">+1 Referral</button>
    <div class="qa-divider"></div>
    <button class="qa-item" type="button" data-qa="meetings">Meeting&hellip;</button>
    <button class="qa-item" type="button" data-qa="fnas">FNA&hellip;</button>
    <button class="qa-item" type="button" data-qa="quotes">Quote&hellip;</button>
    <button class="qa-item" type="button" data-qa="cases">Case&hellip;</button>
  `;
}

function _openQuickAdd(anchorEl, clientId) {
  _closeQuickAdd();

  const popover = document.createElement('div');
  popover.className = 'qa-popover';
  popover.id = 'quick-add-popover';
  popover.innerHTML = _quickAddMenuHTML();
  document.body.appendChild(popover);

  const rect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  let left = rect.right - popRect.width;
  left = Math.max(12, Math.min(left, window.innerWidth - popRect.width - 12));
  let top = rect.bottom + 6;
  if (top + popRect.height > window.innerHeight - 12) top = rect.top - popRect.height - 6;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  popover.addEventListener('click', e => {
    const btn = e.target.closest('[data-qa]');
    if (!btn) return;
    const qa = btn.dataset.qa;
    _closeQuickAdd();
    if (qa === 'referral') {
      updateClient(clientId, d => { d.referrals = (d.referrals || 0) + 1; });
    } else {
      openCheckoutForClient(clientId, qa);
    }
  });

  // Deferred so the click that opened the popover doesn't immediately close it.
  setTimeout(() => document.addEventListener('click', _outsideQuickAddClick, true), 0);
}

function _setCardView(row, detail, view) {
  row.dataset.view = view;
  detail.querySelectorAll('.detail-view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  row.querySelectorAll('.card-metric[data-view]').forEach(m => m.classList.toggle('selected', m.dataset.view === view));
}

// Clicking the row opens the client's status history; clicking a funnel
// metric opens that metric's list instead. Clicking the same thing again
// closes the card. Only one card is open at a time.
function initClientCards(root) {
  root.addEventListener('click', e => {
    // The In Progress / Accepted switch: clicking the side that isn't
    // already active moves the case into that array, dated today.
    const statusBtn = e.target.closest('[data-action="set-case-status"]');
    if (statusBtn) {
      e.stopPropagation();
      const target = statusBtn.dataset.target;
      if (target === statusBtn.dataset.kind) return;
      const clientId = statusBtn.dataset.client;
      const idx = Number(statusBtn.dataset.idx);
      const from = target === 'accepted' ? 'casesInProgress' : 'acceptedCases';
      const to = target === 'accepted' ? 'acceptedCases' : 'casesInProgress';
      updateClient(clientId, d => {
        const [item] = (d[from] || []).splice(idx, 1);
        if (item) d[to] = _addDatedItem(d[to] || [], { ...item, date: _todayIso() });
      });
      return;
    }

    const quickAddBtn = e.target.closest('.qa-btn');
    if (quickAddBtn) {
      e.stopPropagation();
      const row = quickAddBtn.closest('.list-row');
      _openQuickAdd(quickAddBtn, row.dataset.cardId);
      return;
    }

    const row = e.target.closest('.list-row');
    if (!row) return;
    const detail = row.parentElement.querySelector('.row-detail');
    if (!detail) return;
    const metric = e.target.closest('.card-metric[data-view]');
    const view = metric ? metric.dataset.view : 'statuses';
    const isOpen = detail.classList.contains('open');
    const sameView = row.dataset.view === view;
    document.querySelectorAll('.row-detail').forEach(r => {
      r.classList.remove('open');
      r.previousElementSibling?.classList.remove('active');
    });
    if (isOpen && sameView) return;
    _setCardView(row, detail, view);
    detail.classList.add('open');
    row.classList.add('active');
  });
}
