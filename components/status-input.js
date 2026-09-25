// Status input: one text box for a case status, used on the case card
// and in the checkout. Typing your own words is the default; the arrow
// on the right opens the standard statuses:
//   Same as last   copies the case's current status
//   Accepted       } close the case (CASE_ENDING_STATUSES, constants.js)
//   Not taken up   }
// Picking one fills the box (it isn't saved yet) and fires an 'input'
// event, so whatever's listening to the box sees the change.
//
// The menu is attached to <body> with fixed positioning, not inside the
// box, so a scrolling container around it (a long case list, the
// checkout's body) can't clip it.

function _injectStatusInputCSS() {
  if (document.getElementById('status-input-styles')) return;
  const s = document.createElement('style');
  s.id = 'status-input-styles';
  s.textContent = `
    .status-input {
      position: relative;
      flex: 1;
      min-width: 220px;
      display: flex;
    }
    .status-input input {
      box-sizing: border-box;
      width: 100%;
      height: 38px;
      padding: 0 40px 0 12px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .status-input input:focus { outline: none; border-color: var(--gold); }
    .status-input input.error,
    .status-input input.field-error { border-color: var(--red); }
    .status-input-arrow {
      position: absolute;
      top: 1px;
      right: 1px;
      bottom: 1px;
      width: 34px;
      border: none;
      border-left: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 0 7px 7px 0;
      background: transparent;
      color: var(--ink-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-input-arrow:hover { background: #f2f2f0; color: var(--ink); }
    .status-input-menu {
      position: fixed;
      z-index: 450;
      min-width: 180px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .status-input-menu button {
      background: none;
      border: none;
      text-align: left;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .status-input-menu button:hover:not(:disabled) { background: #f2f2f0; }
    .status-input-menu button:disabled { color: var(--ink-dim); opacity: 0.5; cursor: default; }
    .status-input-menu hr { border: none; height: 1px; background: rgba(0, 0, 0, 0.08); margin: 4px 2px; }
  `;
  document.head.appendChild(s);
}
_injectStatusInputCSS();

const _STATUS_ARROW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

// attrs: extra attributes for the <input> (e.g. data-case="…"); last: the
// case's current status text, for "Same as last".
function statusInputHTML({ value = '', last = '', attrs = '', className = '' } = {}) {
  return `
    <div class="status-input" data-last="${_escHtml(last)}">
      <input type="text" class="${className}" ${attrs} value="${_escHtml(value)}" placeholder="Type a status&hellip;" autocomplete="off">
      <button type="button" class="status-input-arrow" title="Standard statuses" tabindex="-1">${_STATUS_ARROW_SVG}</button>
    </div>
  `;
}

// The box whose menu is open.
let _statusMenuWrap = null;

function _closeStatusMenus() {
  document.querySelectorAll('.status-input-menu').forEach(m => m.remove());
  _statusMenuWrap = null;
}

function _openStatusMenu(wrap) {
  _closeStatusMenus();
  const last = wrap.dataset.last;
  const menu = document.createElement('div');
  menu.className = 'status-input-menu';
  menu.innerHTML = `
    <button type="button" data-status="${_escHtml(last)}"${last ? '' : ' disabled'}>Same as last</button>
    <hr>
    ${Object.keys(CASE_ENDING_STATUSES).map(t => `<button type="button" data-status="${_escHtml(t)}">${_escHtml(t)}</button>`).join('')}
  `;
  document.body.appendChild(menu);
  _statusMenuWrap = wrap;

  // Below the box, right-aligned to it; above it if there's no room.
  const box = wrap.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const top = box.bottom + 4 + m.height > window.innerHeight - 8 ? box.top - 4 - m.height : box.bottom + 4;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, box.right - m.width)}px`;
}

document.addEventListener('click', e => {
  const arrow = e.target.closest('.status-input-arrow');
  const pick = e.target.closest('.status-input-menu [data-status]');
  if (arrow) {
    e.stopPropagation();
    const wrap = arrow.closest('.status-input');
    if (_statusMenuWrap === wrap) _closeStatusMenus();
    else _openStatusMenu(wrap);
    return;
  }
  if (pick) {
    e.stopPropagation();
    const input = _statusMenuWrap?.querySelector('input');
    if (!input) return _closeStatusMenus();
    input.value = pick.dataset.status;
    _closeStatusMenus();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (!e.target.closest('.status-input-menu')) _closeStatusMenus();
}, true);

// A fixed menu would drift away from its box on scroll, so close it.
window.addEventListener('scroll', () => { if (_statusMenuWrap) _closeStatusMenus(); }, true);
window.addEventListener('resize', () => { if (_statusMenuWrap) _closeStatusMenus(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.status-input-menu')) {
    e.stopPropagation();
    _closeStatusMenus();
  }
}, true);
