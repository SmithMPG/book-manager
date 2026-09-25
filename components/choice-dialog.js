// Choice dialog: a small centred popup with a message and a row of
// buttons, for the few moments the app needs a decision before it
// carries on (moving a client between tabs, mainly).
//
//   const choice = await showChoiceDialog({
//     title: 'Move to Business?',
//     message: 'Saving this case will move the client to the Business tab.',
//     choices: [{ label: 'Cancel', value: null }, { label: 'Move', value: 'move', primary: true }],
//     dismissable: true,   // Esc / clicking outside resolves null; default true
//   });

function _injectChoiceDialogCSS() {
  if (document.getElementById('choice-dialog-styles')) return;
  const s = document.createElement('style');
  s.id = 'choice-dialog-styles';
  s.textContent = `
    .cd-overlay {
      position: fixed;
      inset: 0;
      z-index: 400;
      background: rgba(15, 23, 41, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cd-modal {
      width: 400px;
      max-width: calc(100vw - 32px);
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
      padding: 24px;
      color: var(--ink);
    }
    .cd-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
    .cd-message { margin: 0 0 22px; font-size: 14px; line-height: 1.5; color: var(--ink-dim); }
    .cd-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
    .cd-btn {
      background: #f2f2f0;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .cd-btn:hover { background: #e8e8e5; }
    .cd-btn.plain { background: none; border-color: transparent; color: var(--ink-dim); font-weight: 400; }
    .cd-btn.plain:hover { color: var(--ink); }
    .cd-btn.primary { background: var(--gold); border-color: var(--gold); color: var(--navy); }
    .cd-btn.primary:hover { opacity: 0.9; }
  `;
  document.head.appendChild(s);
}
_injectChoiceDialogCSS();

function showChoiceDialog({ title, message, choices, dismissable = true }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.innerHTML = `
      <div class="cd-modal" role="dialog" aria-modal="true">
        ${title ? `<h3 class="cd-title">${_escHtml(title)}</h3>` : ''}
        <p class="cd-message">${_escHtml(message)}</p>
        <div class="cd-actions">
          ${choices.map((c, i) => {
            const cls = c.primary ? ' primary' : c.value === null ? ' plain' : '';
            return `<button type="button" class="cd-btn${cls}" data-choice="${i}">${_escHtml(c.label)}</button>`;
          }).join('')}
        </div>
      </div>
    `;

    const finish = value => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (dismissable) finish(null);
    };

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-choice]');
      if (btn) finish(choices[Number(btn.dataset.choice)].value);
      else if (e.target === overlay && dismissable) finish(null);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('.cd-btn.primary, .cd-btn')?.focus();
  });
}
