// Commission Calculator: a modal from the toolbar's $ icon. Three tabs,
// one per kind of case, each worked out with exactly the rules a case of
// that product type uses (constants.js: casePcr, caseUpfrontCommission,
// caseRiskYear2Commission), so what it shows is what the case will:
//   Risk                monthly premium → PCR, Year 1 and Year 2 commission
//   Retirement annuity  Builder | Liberty; lump sum, upfront advice fee %,
//                       monthly premium, term (Builder's own, PCR counting
//                       up to 15; Liberty's always 5, greyed out) → PCR,
//                       upfront commission
//   Investment          lump sum, upfront advice fee % → PCR, commission
// Nothing persists — every field resets when the modal is opened.

function _injectCommissionCalculatorCSS() {
  if (document.getElementById('commission-calculator-styles')) return;
  const s = document.createElement('style');
  s.id = 'commission-calculator-styles';
  s.textContent = `
    .cc-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--gold-soft);
      cursor: pointer;
      flex-shrink: 0;
    }
    .cc-trigger:hover { border-color: var(--gold); }

    .cc-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 300;
    }
    .cc-overlay.open { display: flex; }

    .cc-modal {
      background: #ffffff;
      border-radius: 12px;
      width: 460px;
      max-width: 92vw;
      max-height: 88vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .cc-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .cc-modal-title { font-size: 17px; font-weight: 700; color: var(--ink); }
    .cc-close-btn {
      background: transparent;
      border: none;
      color: var(--ink-dim);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 4px;
    }
    .cc-close-btn:hover { color: var(--ink); }

    .cc-tab-bar,
    .cc-switch {
      display: flex;
      background: #e2e3e2;
      padding: 5px 6px;
      border-radius: 8px;
      gap: 2px;
      margin-bottom: 18px;
    }
    .cc-switch { display: inline-flex; padding: 3px; margin-bottom: 16px; }
    .cc-tab-bar button,
    .cc-switch button {
      flex: 1;
      background: transparent;
      border: none;
      padding: 9px 8px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      color: #555c6a;
      cursor: pointer;
      white-space: nowrap;
      border-radius: 6px;
    }
    .cc-switch button { padding: 6px 16px; }
    .cc-tab-bar button.active,
    .cc-switch button.active {
      background: #ffffff;
      color: var(--navy);
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
    }

    .cc-fields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
    .cc-field { display: flex; flex-direction: column; gap: 4px; }
    .cc-row { display: flex; gap: 12px; }
    .cc-row .cc-field { flex: 1; min-width: 0; }
    .cc-field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
    }
    .cc-field input {
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
    }
    .cc-field input:focus { border-color: var(--gold); outline: none; }
    .cc-field input:disabled { background: #f2f2f0; color: var(--ink-dim); }
    .cc-field small { font-size: 11px; color: var(--ink-dim); }

    .cc-results { display: flex; flex-direction: column; gap: 10px; padding-top: 16px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
    .cc-result-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--ink-dim); }
    .cc-result-row b { font-size: 16px; color: var(--ink); }
    .cc-result-row.cc-result-highlight b { color: var(--gold); }
  `;
  document.head.appendChild(s);
}
_injectCommissionCalculatorCSS();

const CC_TABS = [
  { key: 'risk', label: 'Risk' },
  { key: 'ra', label: 'Retirement annuity' },
  { key: 'investment', label: 'Investment' },
];
const CC_RA_KINDS = [
  { key: 'ra-builder', label: 'Builder' },
  { key: 'liberty-ra', label: 'Liberty' },
];

// The product type a tab works out with.
function _ccProductType(tab, raKind) {
  if (tab === 'risk') return 'risk';
  if (tab === 'ra') return raKind;
  return 'investment';
}

function _ccField(key, label, value, { money = false, percent = false, disabled = false, note = '' } = {}) {
  const attrs = money
    ? MONEY_INPUT_ATTRS
    : `type="number" min="0" step="${percent ? '0.1' : '1'}"`;
  return `
    <div class="cc-field">
      <label>${label}</label>
      <input ${attrs} data-field="${key}" value="${_escHtml(money ? moneyInputValue(value) : value ?? '')}" placeholder="0"${disabled ? ' disabled' : ''}>
      ${note ? `<small>${note}</small>` : ''}
    </div>
  `;
}

// Lump sum and advice fee share a line; on a retirement annuity, so do
// the monthly premium and term. Investment has no monthly premium.
function _ccFieldsHTML(type, v) {
  const line = (...fields) => `<div class="cc-row">${fields.join('')}</div>`;
  const monthly = _ccField('monthly', 'Monthly premium (R)', v.monthly, { money: true });
  if (type === 'risk') return monthly;
  const lumpAndFee = line(
    _ccField('lumpSum', 'Lump sum (R)', v.lumpSum, { money: true }),
    _ccField('adviceFeePercent', 'Upfront advice fee (%)', v.adviceFeePercent, { percent: true }),
  );
  if (type === 'ra-builder') {
    return lumpAndFee + line(monthly, _ccField('term', 'Term (years)', v.term, { note: `PCR counts up to ${BUILDER_MAX_TERM}` }));
  }
  if (type === 'liberty-ra') {
    return lumpAndFee + line(monthly, _ccField('term', 'Term (years)', LIBERTY_TERM, { disabled: true, note: 'Always 5 for Liberty' }));
  }
  return lumpAndFee; // Investment: its PCR and commission go by the lump sum alone
}

function _ccResultsHTML(type, v) {
  const item = {
    productType: type,
    lumpSum: v.lumpSum,
    monthly: v.monthly,
    adviceFeePercent: v.adviceFeePercent,
    term: v.term,
  };
  const row = (label, value, highlight) =>
    `<div class="cc-result-row${highlight ? ' cc-result-highlight' : ''}"><span>${label}</span><b>${value}</b></div>`;
  const pcr = row('PCR', formatNumber(casePcr(item)));
  if (type === 'risk') {
    return pcr
      + row('Year 1 commission', formatRand(caseUpfrontCommission(item)), true)
      + row('Year 2 commission', formatRand(caseRiskYear2Commission(item)), true);
  }
  return pcr + row(type === 'investment' ? 'Commission' : 'Upfront commission', formatRand(caseUpfrontCommission(item)), true);
}

class CommissionCalculator {
  constructor() {
    this._reset();
    this._buildShell();
  }

  _reset() {
    this.tab = CC_TABS[0].key;
    this.raKind = CC_RA_KINDS[0].key;
    this.values = { lumpSum: null, adviceFeePercent: '', monthly: null, term: '' };
  }

  _buildShell() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'cc-overlay';
    this.overlay.innerHTML = `
      <div class="cc-modal">
        <div class="cc-modal-header">
          <span class="cc-modal-title">Commission Calculator</span>
          <button class="cc-close-btn" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="cc-tab-bar"></div>
        <div class="cc-ra"></div>
        <div class="cc-fields"></div>
        <div class="cc-results"></div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) { this.close(); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; this._render(); return; }
      const ra = e.target.closest('[data-ra]');
      if (ra) { this.raKind = ra.dataset.ra; this._render(); }
    });
    this.overlay.querySelector('.cc-close-btn').addEventListener('click', () => this.close());
    // The same figures carry across tabs (a premium typed on Risk is
    // still there on Investment); only the results redraw as you type.
    this.overlay.querySelector('.cc-fields').addEventListener('input', e => {
      const input = e.target.closest('[data-field]');
      if (!input || input.disabled) return;
      this.values[input.dataset.field] = input.matches('[data-money]') ? parseMoney(input.value) : input.value;
      this._renderResults();
    });
  }

  open() {
    this._reset();
    this._render();
    this.overlay.classList.add('open');
  }

  close() {
    this.overlay.classList.remove('open');
  }

  _type() {
    return _ccProductType(this.tab, this.raKind);
  }

  _render() {
    const segmented = (items, current, attr) => items.map(i =>
      `<button type="button" class="${i.key === current ? 'active' : ''}" data-${attr}="${i.key}">${i.label}</button>`).join('');
    this.overlay.querySelector('.cc-tab-bar').innerHTML = segmented(CC_TABS, this.tab, 'tab');
    this.overlay.querySelector('.cc-ra').innerHTML = this.tab === 'ra'
      ? `<div class="cc-switch">${segmented(CC_RA_KINDS, this.raKind, 'ra')}</div>`
      : '';
    this.overlay.querySelector('.cc-fields').innerHTML = _ccFieldsHTML(this._type(), this.values);
    this._renderResults();
  }

  _renderResults() {
    this.overlay.querySelector('.cc-results').innerHTML = _ccResultsHTML(this._type(), this.values);
  }
}

let _commissionCalculatorInstance = null;

function initCommissionCalculator(triggerId) {
  const trigger = document.getElementById(triggerId);
  if (!trigger) return null;
  _commissionCalculatorInstance = new CommissionCalculator();
  trigger.addEventListener('click', () => _commissionCalculatorInstance.open());
  return _commissionCalculatorInstance;
}
