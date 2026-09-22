// Client cases: the In Progress and Accepted lists inside a card's Cases
// tab. Both use the
// same single-line-item layout (case type + a date, "Date Initiated" for
// in-progress or "Date Accepted" for accepted) — no separate Edit mode,
// rows are directly editable, and the "+" button appends a blank row.

function _injectClientCasesCSS() {
  if (document.getElementById('client-cases-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-cases-styles';
  s.textContent = `
    .cases-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ink);
      margin-top: 4px;
    }

    .cases-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .case-rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .case-row {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .case-row select {
      flex: 1;
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #fff;
      padding: 7px 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      border-radius: 5px;
    }

    .case-date-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
      width: 170px;
      flex-shrink: 0;
    }
    .case-date-label input {
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #fff;
      padding: 6px 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      border-radius: 5px;
    }

    .case-add-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: var(--gold);
      color: var(--navy);
      font-size: 18px;
      line-height: 1;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .case-add-btn:hover { opacity: 0.9; }
  `;
  document.head.appendChild(s);
}
_injectClientCasesCSS();

const CASE_TYPES = [
  'Annuity Life', 'Ad hoc Investment', 'Annuity Living', 'Classic Investment',
  'Educator', 'Endowment', 'Evolve', 'IB', 'INN8', 'INN8 RA', 'Investment',
  'Investment Builder', 'Other', 'Preservation', 'RA Builder', 'RA Liberty',
  'Risk', 'Sec 14 External', 'Sec 14 Internal', 'Stanlib IP', 'TFSA', 'UT',
];

function _caseRow(dateLabel, item) {
  item = item || {};
  const typeOpts = CASE_TYPES.map(o => `<option value="${o}"${o === item.type ? ' selected' : ''}>${o}</option>`).join('');
  return `
    <div class="case-row">
      <select data-field="caseType"><option value="">Select type&hellip;</option>${typeOpts}</select>
      <label class="case-date-label">${dateLabel}
        <input type="date" data-field="caseDate" value="${item.date || ''}">
      </label>
    </div>
  `;
}

function clientCasesHTML(items, dateLabel) {
  const rows = (items || []).map(i => _caseRow(dateLabel, i)).join('');
  return `
    <div class="cases-panel" data-date-label="${dateLabel}">
      <div class="case-rows">${rows}</div>
      <div class="panel-actions">
        <button class="case-add-btn" type="button" title="Add case">+</button>
      </div>
    </div>
  `;
}

function initClientCaseLists(root) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('.case-add-btn');
    if (!btn) return;
    const panel = btn.closest('.cases-panel');
    if (!panel) return;
    panel.querySelector('.case-rows').insertAdjacentHTML('beforeend', _caseRow(panel.dataset.dateLabel, {}));
  });
}
