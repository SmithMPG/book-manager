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

// Cases come from the in-progress and accepted lists, merged newest first.
function _caseItems(data) {
  const inProgress = (data.casesInProgress || []).map(c => ({ date: c.date, text: `${c.type} · initiated` }));
  const accepted = (data.acceptedCases || []).map(c => ({ date: c.date, text: `${c.type} · accepted` }));
  return inProgress.concat(accepted).sort((a, b) => b.date.localeCompare(a.date));
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
        </div>
      </div>
      <div class="row-detail" id="row-${data.id}">
        <div class="detail-view active" data-view="statuses">${_detailListHTML(data.statuses, 'No status updates yet.')}</div>
        <div class="detail-view" data-view="meetings">${_detailListHTML(meetings, 'No meetings yet.')}</div>
        <div class="detail-view" data-view="fnas">${_detailListHTML(fnas, 'No FNAs yet.')}</div>
        <div class="detail-view" data-view="quotes">${_detailListHTML(quotes, 'No quotes yet.')}</div>
        <div class="detail-view" data-view="cases">${_detailListHTML(cases, 'No cases yet.')}</div>
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
