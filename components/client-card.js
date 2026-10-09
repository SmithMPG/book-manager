// Client card: one consistent card, used in every tab (Prospects,
// Business, Clients, Not Moved Forward). Collapsed row: the client's
// name, their latest timeline entry, a chip per group of cases they
// have — "2 open", "1 submitted", "3 closed" — and a "+" at the end.
// Clicking the row opens the client view (open case cards, then the
// timeline); clicking a chip opens the case view on those cases; "+"
// picks something
// to add (Contact, Note, Meeting, FNA, Quote, Case) and opens the card
// ready to fill it in.
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
    .list-row.active .case-chip { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.25); color: var(--text); }
    .list-row.active .case-chip.active { background: var(--gold); border-color: var(--gold); color: var(--navy); }

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
      z-index: 420; /* above the Review (300) */
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 6px;
      width: 190px;
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
    /* A section: its list opens to the side on hover (or tap), to the
       left when there's no room on the right (.flip). */
    .add-menu .am-section { position: relative; }
    .add-menu .am-section > button { width: 100%; display: flex; justify-content: space-between; align-items: center; }
    .add-menu .am-section > button::after { content: '›'; color: var(--ink-dim); font-size: 15px; }
    .add-menu .am-section:hover > button,
    .add-menu .am-section.open > button { background: #f2f2f0; }
    .add-menu .am-sub {
      display: none;
      position: absolute;
      top: -6px;
      left: calc(100% + 6px);
      min-width: 190px;
      max-height: 340px;
      overflow-y: auto;
      flex-direction: column;
      gap: 1px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 6px;
    }
    .add-menu.flip .am-sub { left: auto; right: calc(100% + 6px); }
    .add-menu .am-section:hover > .am-sub,
    .add-menu .am-section.open > .am-sub { display: flex; }
    /* A bridge over the gap, so moving across to the list doesn't close it. */
    .add-menu .am-section::after { content: ''; position: absolute; top: 0; bottom: 0; left: 100%; width: 8px; }
    .add-menu.flip .am-section::after { left: auto; right: 100%; }

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

// The latest timeline entry, shown on the collapsed row. Always rendered
// so it soaks up the free space between name and metrics, even for a
// client with nothing on their timeline yet.
function _cardLastStatusHTML(data) {
  const last = latestTimelineSummary(data);
  return `<div class="card-last-status" title="${_escHtml(last)}">${_escHtml(last)}</div>`;
}

// A chip per group of cases the client has (CASE_GROUPS, card-items.js):
// "2 open", "1 submitted", "3 closed". Each opens the case view on it.
function _caseChipsHTML(data) {
  const chips = CASE_GROUPS.map(g => {
    const n = (data.cases || []).filter(g.has).length;
    const active = caseViewOf(data.id) === g.key ? ' active' : '';
    return n ? `<button type="button" class="case-chip${active}" data-case-chip="${g.key}" title="See ${_escHtml(data.firstName)}'s ${g.word} cases">${n} ${g.word}</button>` : '';
  }).join('');
  return chips ? `<div class="case-chips">${chips}</div>` : '';
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
  business: 'Open Cases', // the "business" tab, shown as Open Cases
  clients: 'Clients',
  'not-moved': 'Not Moved Forward',
};

function _notifyClientsChanged() {
  document.dispatchEvent(new CustomEvent('clients:changed'));
}

// Every tab lists its clients alphabetically — first name, then surname —
// and a card added or moved into a tab goes straight to its place.
function _cardSortKey(data) {
  return `${data.firstName} ${data.lastName}`.toLowerCase();
}

function placeCardSorted(list, wrapper) {
  const id = wrapper.querySelector('.list-row')?.dataset.cardId;
  const key = _cardSortKey(CLIENT_STORE.get(id) || { firstName: '', lastName: '' });
  const next = [...list.children].find(w => {
    if (w === wrapper) return false;
    const other = CLIENT_STORE.get(w.querySelector('.list-row')?.dataset.cardId);
    return other && _cardSortKey(other).localeCompare(key) > 0;
  });
  list.insertBefore(wrapper, next || null);
}

function renderClientCards(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) return;
  cards.forEach(card => CLIENT_STORE.set(card.id, card));
  const sorted = [...cards].sort((a, b) => _cardSortKey(a).localeCompare(_cardSortKey(b)));
  container.innerHTML = sorted.map(clientCardHTML).join('');
  _notifyClientsChanged();
}

function appendClientCard(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  CLIENT_STORE.set(data.id, data);
  const tmp = document.createElement('div');
  tmp.innerHTML = clientCardHTML(data).trim();
  placeCardSorted(container, tmp.firstElementChild);
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
  placeCardSorted(list, wrapper);
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

// Apply `mutate` to a client's data and re-render their card in place —
// every copy of it (it can be in its tab and in the Review at once),
// keeping each open if it was.
function updateClient(id, mutate) {
  const data = CLIENT_STORE.get(id);
  if (!data) return;
  mutate(data);
  document.querySelectorAll(`.list-row[data-card-id="${id}"]`).forEach(row => {
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
  });
  _notifyClientsChanged();
}

// Opens a card (closing any other). Returns its detail element.
function _openCard(row) {
  const detail = row.parentElement.querySelector('.row-detail');
  document.querySelectorAll('.row-detail.open').forEach(r => {
    if (r !== detail) _closeCard(r.previousElementSibling);
  });
  detail.classList.add('open');
  row.classList.add('active');
  return detail;
}

// A closed card opens on the client view next time.
function _closeCard(row) {
  const detail = row.parentElement.querySelector('.row-detail');
  detail.classList.remove('open');
  row.classList.remove('active');
  if (resetCaseView(row.dataset.cardId)) detail.innerHTML = clientDetailHTML(CLIENT_STORE.get(row.dataset.cardId));
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

// The "+" menu (addMenu, card-items.js): Activity ▸, Contact ▸,
// Meeting ▸, Note ▸, Open a case ▸ — a section's list opens to the side on
// hover (or tap); picking an entry opens the card's add form with that
// choice made.
function _openAddMenu(anchor, row) {
  _closeAddMenu();
  const items = addMenu();
  const menu = document.createElement('div');
  menu.className = 'add-menu';
  menu.id = 'add-menu';
  const entry = (it, ref) => `<button type="button" data-entry="${ref}">${_escHtml(it.label)}</button>`;
  menu.innerHTML = items.map((it, i) => (it.options
    ? `<div class="am-section">
        <button type="button" data-section>${_escHtml(it.label)}</button>
        <div class="am-sub">${it.options.length
          ? it.options.map((o, j) => entry(o, `${i}.${j}`)).join('')
          : '<button type="button" disabled>Nothing to pick yet</button>'}</div>
      </div>`
    : entry(it, `${i}`))).join('');
  document.body.appendChild(menu);
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let top = a.bottom + 6;
  if (top + m.height > window.innerHeight - 12) top = Math.max(12, a.top - m.height - 6);
  const left = Math.max(12, Math.min(a.right - m.width, window.innerWidth - m.width - 12));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  // Lists open to the right unless that runs off the screen.
  menu.classList.toggle('flip', left + m.width + 6 + 200 > window.innerWidth - 12);
  menu.addEventListener('click', e => {
    const section = e.target.closest('[data-section]');
    if (section) {
      // Tap (no hover): open this section's list, close the others.
      const sec = section.parentElement;
      menu.querySelectorAll('.am-section.open').forEach(s => { if (s !== sec) s.classList.remove('open'); });
      sec.classList.toggle('open');
      return;
    }
    const btn = e.target.closest('[data-entry]');
    if (!btn) return;
    const [i, j] = btn.dataset.entry.split('.').map(Number);
    const it = Number.isNaN(j) || j === undefined ? items[i] : items[i].options[j];
    _closeAddMenu();
    openAddEntry(_openCard(row), it.kind, it.preset || {}, it.formLabel || (it.options ? '' : it.label));
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
    // A chip shows that group of cases; the one already showing (or the
    // row, while cases are showing) goes back to the client view.
    const clientId = row.dataset.cardId;
    const chip = e.target.closest('[data-case-chip]');
    if (chip) {
      const group = chip.dataset.caseChip;
      showCaseView(_openCard(row), clientId, caseViewOf(clientId) === group ? null : group);
      return;
    }
    const detail = row.parentElement.querySelector('.row-detail');
    if (detail.classList.contains('open') && caseViewOf(clientId)) showCaseView(detail, clientId, null);
    else if (detail.classList.contains('open')) _closeCard(row);
    else _openCard(row);
  });
}
