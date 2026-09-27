// Client card: one consistent card, used in every tab (Prospects,
// Business, Clients, Not Moved Forward). Collapsed row: the client's
// name, their latest timeline entry, a chip per open case (its type),
// and a "+" at the end. Clicking the row opens the
// client's timeline; clicking a case chip opens it with that case's
// checklist at the top; "+" picks something to add (Contact, Note,
// Meeting, FNA, Quote, Case) and opens the card ready to fill it in.
// What's inside the open card lives in card-items.js.

function _injectClientCardCSS() {
  if (document.getElementById('client-card-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-card-styles';
  s.textContent = `
    .card-wrapper { transition: opacity 0.15s ease; }
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

    .case-chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 55%; }
    .case-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
      font-family: inherit;
      color: var(--ink);
      white-space: nowrap;
      cursor: pointer;
    }
    .case-chip:hover { border-color: var(--gold); }
    .case-chip.focused { background: var(--gold); border-color: var(--gold); color: var(--navy); }
    .list-row.active .case-chip:not(.focused) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.25); color: var(--text); }

    .row-add {
      width: 26px;
      height: 26px;
      flex-shrink: 0;
      border-radius: 50%;
      border: 1px dashed rgba(0, 0, 0, 0.25);
      background: transparent;
      color: var(--ink-dim);
      font-size: 16px;
      line-height: 1;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .row-add:hover { border-style: solid; border-color: var(--gold); color: #8a6d0a; background: rgba(212, 175, 55, 0.1); }
    .list-row.active .row-add { border-color: rgba(255, 255, 255, 0.35); color: var(--text-dim); }
    .list-row.active .row-add:hover { border-color: var(--gold); color: var(--gold-soft); background: rgba(255, 255, 255, 0.1); }

    .add-menu {
      position: fixed;
      z-index: 250;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 6px;
      width: 170px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .add-menu button {
      background: none;
      border: none;
      text-align: left;
      padding: 8px 10px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      border-radius: 6px;
      cursor: pointer;
    }
    .add-menu button:hover { background: #f2f2f0; }

    /* The date on an add-entry form (card-items.js). */
    .detail-date {
      width: 96px;
      flex-shrink: 0;
      font-weight: 600;
      color: var(--ink);
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

// Lump sum / monthly payment / advice fee, when a case was logged with any
// of them, plus the upfront commission (constants.js) they work out to,
// when it's non-zero. Used by the checkout's already-logged lines.
function _caseAmountsSuffix(c) {
  const parts = [];
  if (c.lumpSum) parts.push(`${formatRand(c.lumpSum)} lump sum`);
  if (c.monthly) parts.push(`${formatRand(c.monthly)} pm`);
  if (c.adviceFeePercent) parts.push(`${c.adviceFeePercent}% upfront advice fee`);
  const commission = caseUpfrontCommission(c);
  if (commission) parts.push(`${formatRand(commission)} commission`);
  return parts.length ? ` · ${parts.join(' / ')}` : '';
}

// The latest timeline entry, shown on the collapsed row. Always rendered
// so it soaks up the free space between name and metrics, even for a
// client with nothing on their timeline yet.
function _cardLastStatusHTML(data) {
  const last = latestTimelineSummary(data);
  return `<div class="card-last-status" title="${_escHtml(last)}">${_escHtml(last)}</div>`;
}

// One chip per open case, showing its type.
function _caseChipsHTML(data) {
  const open = (data.cases || []).filter(isOpenCase);
  if (!open.length) return '';
  return `<div class="case-chips">${open.map(c => `
    <button type="button" class="case-chip${caseIsFocused(data.id, c.id) ? ' focused' : ''}" data-case-chip="${c.id}" title="Show this case's checklist">
      ${_escHtml(c.type)}
    </button>
  `).join('')}</div>`;
}

// Only the row itself is draggable, so text in the open card's inputs can
// still be selected.
function clientCardHTML(data) {
  return `
    <div class="card-wrapper">
      <div class="list-row" data-card-id="${data.id}" draggable="true">
        <div class="name"><b>${_escHtml(data.firstName)}</b><span>${_escHtml(data.lastName)}</span></div>
        ${_cardLastStatusHTML(data)}
        ${_caseChipsHTML(data)}
        <button type="button" class="row-add" data-row-add title="Add to ${_escHtml(data.firstName)}'s timeline">+</button>
      </div>
      <div class="row-detail" id="row-${data.id}">${clientDetailHTML(data)}</div>
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

// The tab a client's card currently sits in ('prospects', 'business', …).
function clientTab(id) {
  const tabContent = document.getElementById(`row-${id}`)?.closest('.tab-content');
  return tabContent ? tabContent.id.replace('tab-', '') : '';
}

// Moves a rendered card into another tab's list, open or not. DOM only —
// data.js moveClientToTab saves the move too.
function moveClientCard(id, tab) {
  const wrapper = document.querySelector(`.list-row[data-card-id="${id}"]`)?.parentElement;
  const list = document.getElementById(`${tab}-cards`);
  if (!wrapper || !list) return;
  list.appendChild(wrapper);
  _notifyClientsChanged();
}

// Every client with the tab they currently sit in.
function getClientRecords() {
  return Array.from(CLIENT_STORE.values()).map(data => {
    const tab = clientTab(data.id);
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
  const tmp = document.createElement('div');
  tmp.innerHTML = clientCardHTML(data).trim();
  const fresh = tmp.firstElementChild;
  wrapper.replaceWith(fresh);
  if (wasOpen) {
    fresh.querySelector('.row-detail').classList.add('open');
    fresh.querySelector('.list-row').classList.add('active');
  }
}

// Opens a card (closing any other). Returns its detail element.
function _openCard(row) {
  const detail = row.parentElement.querySelector('.row-detail');
  document.querySelectorAll('.row-detail').forEach(r => {
    if (r === detail) return;
    r.classList.remove('open');
    r.previousElementSibling?.classList.remove('active');
  });
  detail.classList.add('open');
  row.classList.add('active');
  return detail;
}

function _closeCard(row) {
  row.parentElement.querySelector('.row-detail').classList.remove('open');
  row.classList.remove('active');
}

// Opens one client's card (closing any other) and scrolls
// to it, with a brief highlight — used by search.
function openClientCard(id) {
  const row = document.querySelector(`.list-row[data-card-id="${id}"]`);
  const detail = row?.parentElement.querySelector('.row-detail');
  if (!row || !detail) return;
  _openCard(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// "+" on a row: the kinds of entry that can be added (card-items.js).
function _closeAddMenu() {
  document.getElementById('add-menu')?.remove();
  document.removeEventListener('click', _outsideAddMenuClick, true);
}

function _outsideAddMenuClick(e) {
  if (e.target.closest('.add-menu') || e.target.closest('[data-row-add]')) return;
  _closeAddMenu();
}

function _openAddMenu(anchor, row) {
  _closeAddMenu();
  const menu = document.createElement('div');
  menu.className = 'add-menu';
  menu.id = 'add-menu';
  menu.innerHTML = ADD_KINDS.map(k => `<button type="button" data-kind="${k}">${TIMELINE_KINDS[k].label}</button>`).join('');
  document.body.appendChild(menu);
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let top = a.bottom + 6;
  if (top + m.height > window.innerHeight - 12) top = a.top - m.height - 6;
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(12, Math.min(a.right - m.width, window.innerWidth - m.width - 12))}px`;
  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-kind]');
    if (!btn) return;
    _closeAddMenu();
    openAddEntry(_openCard(row), btn.dataset.kind);
  });
  // Deferred so the click that opened it doesn't close it straight away.
  setTimeout(() => document.addEventListener('click', _outsideAddMenuClick, true), 0);
}

// Row: open / close the client. Case chip: open the client showing that
// case's checklist (again to hide it). "+": the add menu.
function initClientCards(root) {
  root.addEventListener('click', e => {
    const row = e.target.closest('.list-row');
    if (!row) return;
    const addBtn = e.target.closest('[data-row-add]');
    if (addBtn) {
      e.stopPropagation();
      _openAddMenu(addBtn, row);
      return;
    }
    const chip = e.target.closest('[data-case-chip]');
    if (chip) {
      const clientId = row.dataset.cardId;
      const caseId = chip.dataset.caseChip;
      const detail = _openCard(row);
      focusCase(detail, clientId, caseIsFocused(clientId, caseId) ? null : caseId);
      return;
    }
    if (row.parentElement.querySelector('.row-detail').classList.contains('open')) _closeCard(row);
    else _openCard(row);
  });
}
