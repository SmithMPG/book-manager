// Client search: the top bar's "Search clients…" box. Typing lists the
// FA's clients whose name matches, from every tab, each with the tab
// it's in. Picking one (click, or ↑ ↓ and Enter) switches to that tab
// and opens the client's card. Every word typed has to match the start
// of the first name or surname, in any order ("smi ge" finds Gert Smith).

function _injectClientSearchCSS() {
  if (document.getElementById('client-search-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-search-styles';
  s.textContent = `
    .search-results {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      z-index: 260;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
      padding: 6px;
      display: none;
      max-height: 360px;
      overflow-y: auto;
    }
    .search-results.open { display: block; }
    .search-result {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      width: 100%;
      background: none;
      border: none;
      border-radius: 6px;
      padding: 9px 10px;
      text-align: left;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .search-result.active,
    .search-result:hover { background: #f2f2f0; }
    .search-result-tab { font-size: 12px; color: var(--ink-dim); white-space: nowrap; }
    .search-empty { padding: 9px 10px; font-size: 13px; color: var(--ink-dim); }
  `;
  document.head.appendChild(s);
}
_injectClientSearchCSS();

const _SEARCH_MAX_RESULTS = 8;

function _searchClients(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return getClientRecords()
    .filter(c => {
      const names = c.name.toLowerCase().split(/\s+/);
      return words.every(w => names.some(n => n.startsWith(w)));
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, _SEARCH_MAX_RESULTS);
}

function initClientSearch(inputSelector) {
  const input = document.querySelector(inputSelector);
  if (!input) return;
  const results = document.createElement('div');
  results.className = 'search-results';
  input.parentElement.appendChild(results);

  let matches = [];
  let active = 0;

  const close = () => results.classList.remove('open');

  const render = () => {
    matches = _searchClients(input.value);
    active = 0;
    if (!input.value.trim()) { close(); return; }
    results.innerHTML = matches.length
      ? matches.map((c, i) => `
          <button type="button" class="search-result${i === active ? ' active' : ''}" data-index="${i}">
            <span>${_escHtml(c.name)}</span>
            <span class="search-result-tab">${_escHtml(c.tabLabel)}</span>
          </button>
        `).join('')
      : '<div class="search-empty">No clients match.</div>';
    results.classList.add('open');
  };

  const pick = i => {
    const c = matches[i];
    if (!c) return;
    close();
    input.value = '';
    input.blur();
    showTab(c.tab);
    openClientCard(c.id);
  };

  const setActive = i => {
    if (!matches.length) return;
    active = (i + matches.length) % matches.length;
    results.querySelectorAll('.search-result').forEach((b, j) => b.classList.toggle('active', j === active));
    results.querySelectorAll('.search-result')[active]?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
  // mousedown, not click, so it lands before the input's blur closes the list.
  results.addEventListener('mousedown', e => {
    const btn = e.target.closest('.search-result');
    if (!btn) return;
    e.preventDefault();
    pick(Number(btn.dataset.index));
  });
  input.addEventListener('blur', close);
}
