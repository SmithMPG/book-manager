// Commission Calculator: a modal reachable from the toolbar's $ icon.
// Four product categories, each with its own commission/PCR formula. The
// Risk/Builder RA/Liberty RA rate multipliers live in constants.js
// (shared with the checkout's own, simpler case-commission tracker, so the
// two can't drift apart) — Builder RA's PCR multiplier is the one exception,
// since it's a slider the FA sets per case (commissionTerm), not a fixed rate:
//   - Risk: commission = CC_RISK_YEAR1_RATE x monthly premium in year 1,
//     CC_RISK_YEAR2_RATE x that in year 2; PCR = annual premium x CC_RISK_PCR_MULTIPLIER
//   - Builder RA: commission = CC_BUILDER_RA_COMMISSION_MULTIPLIER x monthly
//     premium; PCR = annual premium x commissionTerm (FA-set, default 15)
//   - Investments: PCR = investment amount (1:1); an upfront commission %
//     of the amount, plus an ongoing commission % applied to the
//     projected balance after compounding at the given return rate for
//     the chosen number of years.
//   - Liberty RA: no upfront commission, only an ongoing advice fee % —
//     applied to the projected value of the premiums compounded as a
//     growing annuity over the chosen years. PCR = annual premium x CC_LIBERTY_RA_PCR_MULTIPLIER.
// Liberty RA and Investments are the two "grows over time" categories,
// so they get the extra return-rate field and years slider; Risk and
// Builder RA are simple once-off calculations.
// Nothing persists — every field resets when the modal is closed.

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
      width: 480px;
      max-width: 92vw;
      height: 640px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .cc-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .cc-modal-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--ink);
    }
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

    .cc-tab-bar {
      display: flex;
      background: #e2e3e2;
      padding: 5px 6px;
      border-radius: 8px;
      gap: 2px;
      margin-bottom: 20px;
    }
    .cc-tab {
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
      transition: color 0.15s ease;
    }
    .cc-tab:hover:not(.active) { color: #2a3040; }
    .cc-tab.active {
      background: #ffffff;
      color: var(--navy);
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
    }

    .cc-fields {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 20px;
    }
    .cc-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cc-field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
    }
    .cc-field input[type="number"],
    .cc-field input[data-money] {
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
    }
    .cc-field input[type="number"]:focus,
    .cc-field input[data-money]:focus { border-color: var(--gold); outline: none; }

    .cc-field-row {
      display: flex;
      gap: 12px;
    }
    .cc-field-row .cc-field { flex: 1; min-width: 0; }

    .cc-slider-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cc-slider-row input[type="range"] { flex: 1; }
    .cc-slider-value {
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
      width: 52px;
      text-align: right;
      flex-shrink: 0;
    }

    .cc-results {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }
    .cc-result-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .cc-result-row b {
      font-size: 16px;
      color: var(--ink);
    }
    .cc-result-row.cc-result-highlight b { color: var(--gold); }

    .cc-year-table {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      background: #f7f7f6;
      border-radius: 8px;
    }
    .cc-year-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--ink-dim);
    }
    .cc-year-row b { color: var(--ink); font-weight: 700; }
    .cc-year-premium { color: var(--ink-dim); font-weight: 400; }
  `;
  document.head.appendChild(s);
}
_injectCommissionCalculatorCSS();

const CC_CATEGORIES = [
  { key: 'risk', label: 'Risk' },
  { key: 'liberty-ra', label: 'Liberty RA' },
  { key: 'builder-ra', label: 'Builder RA' },
  { key: 'investments', label: 'Investments' },
];

function _ccDefaultState() {
  return {
    'liberty-ra': { lumpSum: '', upfrontPct: '', monthlyPremium: '', escalationPct: '', ongoingPct: '', returnPct: '', feesPct: '', years: 5 },
    'risk': { monthlyPremium: '', escalationPct: '' },
    'builder-ra': { lumpSum: '', upfrontPct: '', monthlyPremium: '', escalationPct: '', ongoingPct: '', commissionTerm: 15, returnPct: '', feesPct: '', years: 5 },
    'investments': { amount: '', monthlyPremium: '', upfrontPct: '', ongoingPct: '', returnPct: '', feesPct: '', years: 5 },
  };
}

// Risk commission per premium "tranche" (the original premium, plus each
// year's escalation increase — each increase is its own tranche): 10x its
// own value in its first year, then 1/3 of its value in its second year,
// then NOTHING — a tranche only ever pays out twice. So a later
// escalation's first-year 10x can land in the same calendar year as an
// older tranche's one-time second-year 1/3, and they add together;
// anything older than 2 years contributes nothing.
// (CC_RISK_YEAR1_RATE / CC_RISK_YEAR2_RATE / CC_RISK_PROJECTION_YEARS come
// from constants.js, shared with the checkout's case tracker.)

function _ccRiskProjection(monthlyPremium, escalationPct) {
  const e = escalationPct / 100;
  const premiums = [];
  for (let y = 0; y < CC_RISK_PROJECTION_YEARS; y++) {
    premiums.push(monthlyPremium * Math.pow(1 + e, y));
  }
  const tranches = premiums.map((p, i) => (i === 0 ? p : p - premiums[i - 1]));

  // For each year, keep the individual tranche contributions (not just the
  // total) so the UI can show the breakdown — e.g. Year 2 as "4 000 + 1 000".
  const yearlyBreakdown = [];
  for (let y = 1; y <= CC_RISK_PROJECTION_YEARS; y++) {
    const parts = [];
    for (let t = 1; t <= y; t++) {
      const trancheAge = y - t + 1;
      if (trancheAge === 1) parts.push(tranches[t - 1] * CC_RISK_YEAR1_RATE);
      else if (trancheAge === 2) parts.push(tranches[t - 1] * CC_RISK_YEAR2_RATE);
      // trancheAge >= 3: that tranche has already paid out both its years.
    }
    yearlyBreakdown.push(parts);
  }
  const yearlyCommission = yearlyBreakdown.map(parts => parts.reduce((a, b) => a + b, 0));
  return { yearlyCommission, yearlyBreakdown, premiums };
}

// Rand and PCR are shown with formatRand / formatNumber (money.js) — PCR
// is a scoring total, not a Rand payout, so it drops the currency prefix.

// Money fields hold formatted text ("2 500 000", money.js); percentages
// and years are plain numbers.
function _ccNum(v) {
  const n = parseFloat(String(v ?? '').replace(/\s/g, ''));
  return isFinite(n) ? n : 0;
}

// Future value of a payment that itself grows each year (premium escalation)
// while compounding at the net investment rate.
function _ccGrowingAnnuityFV(payment, growthRate, rate, years) {
  if (years <= 0) return 0;
  if (Math.abs(rate - growthRate) < 1e-9) return payment * years * Math.pow(1 + rate, years - 1);
  return payment * (Math.pow(1 + rate, years) - Math.pow(1 + growthRate, years)) / (rate - growthRate);
}

function _ccCalc(category, v) {
  if (category === 'risk') {
    const monthly = _ccNum(v.monthlyPremium);
    const annual = monthly * 12;
    const { yearlyCommission, yearlyBreakdown, premiums } = _ccRiskProjection(monthly, _ccNum(v.escalationPct));
    return { annual, pcr: annual * CC_RISK_PCR_MULTIPLIER, yearlyCommission, yearlyBreakdown, premiums };
  }
  if (category === 'builder-ra') {
    const monthly = _ccNum(v.monthlyPremium);
    const annual = monthly * 12;
    const lumpSum = _ccNum(v.lumpSum);
    const years = _ccNum(v.years);
    const r = (_ccNum(v.returnPct) - _ccNum(v.feesPct)) / 100;
    const g = _ccNum(v.escalationPct) / 100;
    const futureValue = _ccGrowingAnnuityFV(annual, g, r, years);
    const ongoingAnnual = futureValue * (_ccNum(v.ongoingPct) / 100);
    const commissionTerm = _ccNum(v.commissionTerm);
    const upfrontCommission = lumpSum * (_ccNum(v.upfrontPct) / 100);
    return {
      annual, commission: monthly * CC_BUILDER_RA_COMMISSION_MULTIPLIER, upfrontCommission,
      pcr: monthly * 12 * commissionTerm, futureValue, ongoingAnnual, ongoingMonthly: ongoingAnnual / 12,
    };
  }
  if (category === 'investments') {
    const amount = _ccNum(v.amount);
    const monthly = _ccNum(v.monthlyPremium);
    const annual = monthly * 12;
    const years = _ccNum(v.years);
    const r = (_ccNum(v.returnPct) - _ccNum(v.feesPct)) / 100;
    // Lump sum compounds directly; the ongoing monthly premium is its own growing annuity.
    const lumpFutureValue = amount * Math.pow(1 + r, years);
    const premiumFutureValue = r !== 0 ? annual * ((Math.pow(1 + r, years) - 1) / r) : annual * years;
    const futureValue = lumpFutureValue + premiumFutureValue;
    const upfrontCommission = amount * (_ccNum(v.upfrontPct) / 100);
    const ongoingAnnual = futureValue * (_ccNum(v.ongoingPct) / 100);
    return { annual, pcr: amount, upfrontCommission, futureValue, ongoingAnnual, ongoingMonthly: ongoingAnnual / 12 };
  }
  if (category === 'liberty-ra') {
    const lumpSum = _ccNum(v.lumpSum);
    const monthly = _ccNum(v.monthlyPremium);
    const annual = monthly * 12;
    const years = _ccNum(v.years);
    const r = (_ccNum(v.returnPct) - _ccNum(v.feesPct)) / 100;
    const g = _ccNum(v.escalationPct) / 100;
    // Growing annuity: each year's (escalating) premium compounds for the years remaining,
    // plus the lump sum compounding on its own.
    const lumpFutureValue = lumpSum * Math.pow(1 + r, years);
    const premiumFutureValue = _ccGrowingAnnuityFV(annual, g, r, years);
    const futureValue = lumpFutureValue + premiumFutureValue;
    const upfrontCommission = lumpSum * (_ccNum(v.upfrontPct) / 100);
    const ongoingAnnual = futureValue * (_ccNum(v.ongoingPct) / 100);
    return { annual, pcr: annual * CC_LIBERTY_RA_PCR_MULTIPLIER, upfrontCommission, futureValue, ongoingAnnual, ongoingMonthly: ongoingAnnual / 12 };
  }
  return {};
}

function _ccFieldsHTML(category, v) {
  if (category === 'risk') {
    return `
      <div class="cc-field">
        <label>Monthly Premium</label>
        <input ${MONEY_INPUT_ATTRS} data-field="monthlyPremium" value="${v.monthlyPremium}" placeholder="0">
      </div>
      <div class="cc-field">
        <label>Annual Escalation %</label>
        <input type="number" min="0" step="0.1" data-field="escalationPct" value="${v.escalationPct}" placeholder="0">
      </div>
    `;
  }
  if (category === 'builder-ra') {
    return `
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Lump Sum</label>
          <input ${MONEY_INPUT_ATTRS} data-field="lumpSum" value="${v.lumpSum}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Upfront Advice Fee %</label>
          <input type="number" min="0" step="0.1" data-field="upfrontPct" value="${v.upfrontPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Monthly Premium</label>
          <input ${MONEY_INPUT_ATTRS} data-field="monthlyPremium" value="${v.monthlyPremium}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Annual Escalation %</label>
          <input type="number" min="0" step="0.1" data-field="escalationPct" value="${v.escalationPct}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Ongoing Advice Fee %</label>
          <input type="number" min="0" step="0.1" data-field="ongoingPct" value="${v.ongoingPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Commission Term</label>
        <input type="number" min="0" step="0.1" data-field="commissionTerm" value="${v.commissionTerm}" placeholder="15">
      </div>
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Expected Annual Return %</label>
          <input type="number" min="0" step="0.1" data-field="returnPct" value="${v.returnPct}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Expected Fees %</label>
          <input type="number" min="0" step="0.1" data-field="feesPct" value="${v.feesPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Years</label>
        <div class="cc-slider-row">
          <input type="range" min="1" max="30" data-field="years" value="${v.years}">
          <span class="cc-slider-value" data-years-display>${v.years} yrs</span>
        </div>
      </div>
    `;
  }
  if (category === 'investments') {
    return `
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Investment Amount</label>
          <input ${MONEY_INPUT_ATTRS} data-field="amount" value="${v.amount}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Monthly Premium</label>
          <input ${MONEY_INPUT_ATTRS} data-field="monthlyPremium" value="${v.monthlyPremium}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Upfront Commission %</label>
        <input type="number" min="0" step="0.1" data-field="upfrontPct" value="${v.upfrontPct}" placeholder="0">
      </div>
      <div class="cc-field">
        <label>Ongoing Advice Fee %</label>
        <input type="number" min="0" step="0.1" data-field="ongoingPct" value="${v.ongoingPct}" placeholder="0">
      </div>
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Expected Annual Return %</label>
          <input type="number" min="0" step="0.1" data-field="returnPct" value="${v.returnPct}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Expected Fees %</label>
          <input type="number" min="0" step="0.1" data-field="feesPct" value="${v.feesPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Years</label>
        <div class="cc-slider-row">
          <input type="range" min="1" max="30" data-field="years" value="${v.years}">
          <span class="cc-slider-value" data-years-display>${v.years} yrs</span>
        </div>
      </div>
    `;
  }
  if (category === 'liberty-ra') {
    return `
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Lump Sum</label>
          <input ${MONEY_INPUT_ATTRS} data-field="lumpSum" value="${v.lumpSum}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Upfront Advice Fee %</label>
          <input type="number" min="0" step="0.1" data-field="upfrontPct" value="${v.upfrontPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Monthly Premium</label>
          <input ${MONEY_INPUT_ATTRS} data-field="monthlyPremium" value="${v.monthlyPremium}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Annual Escalation %</label>
          <input type="number" min="0" step="0.1" data-field="escalationPct" value="${v.escalationPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Ongoing Advice Fee %</label>
        <input type="number" min="0" step="0.1" data-field="ongoingPct" value="${v.ongoingPct}" placeholder="0">
      </div>
      <div class="cc-field-row">
        <div class="cc-field">
          <label>Expected Annual Return %</label>
          <input type="number" min="0" step="0.1" data-field="returnPct" value="${v.returnPct}" placeholder="0">
        </div>
        <div class="cc-field">
          <label>Expected Fees %</label>
          <input type="number" min="0" step="0.1" data-field="feesPct" value="${v.feesPct}" placeholder="0">
        </div>
      </div>
      <div class="cc-field">
        <label>Years</label>
        <div class="cc-slider-row">
          <input type="range" min="1" max="30" data-field="years" value="${v.years}">
          <span class="cc-slider-value" data-years-display>${v.years} yrs</span>
        </div>
      </div>
    `;
  }
  return '';
}

function _ccResultsHTML(category, v) {
  const r = _ccCalc(category, v);
  if (category === 'risk') {
    // No escalation means every future year is identical to Year 2, so
    // there's nothing new to show past it — only escalation earns the
    // full 5-year projection.
    const hasEscalation = _ccNum(v.escalationPct) > 0;
    const shownYears = hasEscalation ? r.yearlyCommission : r.yearlyCommission.slice(0, 2);
    const yearRows = shownYears.map((amt, i) => {
      const parts = r.yearlyBreakdown[i];
      const breakdown = parts.length > 1 ? parts.map(p => formatNumber(p)).join(' + ') + ' = ' : '';
      return `<div class="cc-year-row"><span>Year ${i + 1} <span class="cc-year-premium">(${formatRand(r.premiums[i])} premium)</span></span><b>${breakdown}${formatRand(amt)}</b></div>`;
    }).join('');
    const total = shownYears.reduce((a, b) => a + b, 0);
    const totalLabel = hasEscalation ? `${CC_RISK_PROJECTION_YEARS}-Year Total` : '2-Year Total';
    return `
      <div class="cc-result-row"><span>Annual Premium</span><b>${formatRand(r.annual)}</b></div>
      <div class="cc-result-row"><span>PCR</span><b>${formatNumber(r.pcr)}</b></div>
      <div class="cc-year-table">${yearRows}</div>
      <div class="cc-result-row cc-result-highlight"><span>${totalLabel}</span><b>${formatRand(total)}</b></div>
    `;
  }
  if (category === 'builder-ra') {
    return `
      <div class="cc-result-row"><span>Annual Premium</span><b>${formatRand(r.annual)}</b></div>
      <div class="cc-result-row"><span>PCR</span><b>${formatNumber(r.pcr)}</b></div>
      <div class="cc-result-row cc-result-highlight"><span>Commission</span><b>${formatRand(r.commission)}</b></div>
      <div class="cc-result-row"><span>Projected Value (Yr ${v.years})</span><b>${formatRand(r.futureValue)}</b></div>
      <div class="cc-result-row"><span>Ongoing Advice Fee / mo</span><b>${formatRand(r.ongoingMonthly)}</b></div>
      <div class="cc-result-row cc-result-highlight"><span>Upfront Commission</span><b>${formatRand(r.upfrontCommission)}</b></div>
    `;
  }
  if (category === 'investments') {
    return `
      <div class="cc-result-row"><span>Annual Premium</span><b>${formatRand(r.annual)}</b></div>
      <div class="cc-result-row"><span>PCR</span><b>${formatNumber(r.pcr)}</b></div>
      <div class="cc-result-row cc-result-highlight"><span>Upfront Commission</span><b>${formatRand(r.upfrontCommission)}</b></div>
      <div class="cc-result-row"><span>Projected Value (Yr ${v.years})</span><b>${formatRand(r.futureValue)}</b></div>
      <div class="cc-result-row cc-result-highlight"><span>Ongoing Advice Fee / mo</span><b>${formatRand(r.ongoingMonthly)}</b></div>
    `;
  }
  if (category === 'liberty-ra') {
    return `
      <div class="cc-result-row"><span>Annual Premium</span><b>${formatRand(r.annual)}</b></div>
      <div class="cc-result-row"><span>PCR</span><b>${formatNumber(r.pcr)}</b></div>
      <div class="cc-result-row"><span>Projected Value (Yr ${v.years})</span><b>${formatRand(r.futureValue)}</b></div>
      <div class="cc-result-row"><span>Ongoing Advice Fee / mo</span><b>${formatRand(r.ongoingMonthly)}</b></div>
      <div class="cc-result-row cc-result-highlight"><span>Upfront Commission</span><b>${formatRand(r.upfrontCommission)}</b></div>
    `;
  }
  return '';
}

class CommissionCalculator {
  constructor() {
    this.category = CC_CATEGORIES[0].key;
    this.state = _ccDefaultState();
    this._buildShell();
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
        <div class="cc-fields"></div>
        <div class="cc-results"></div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.querySelector('.cc-close-btn').addEventListener('click', () => this.close());
  }

  open() {
    this.category = CC_CATEGORIES[0].key;
    this.state = _ccDefaultState();
    this._render();
    this.overlay.classList.add('open');
  }

  close() {
    this.overlay.classList.remove('open');
  }

  _render() {
    const tabBar = this.overlay.querySelector('.cc-tab-bar');
    tabBar.innerHTML = CC_CATEGORIES.map(c =>
      `<button class="cc-tab${c.key === this.category ? ' active' : ''}" data-category="${c.key}">${c.label}</button>`
    ).join('');
    tabBar.querySelectorAll('.cc-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.category = btn.dataset.category;
        this._render();
      });
    });

    const fieldsEl = this.overlay.querySelector('.cc-fields');
    fieldsEl.innerHTML = _ccFieldsHTML(this.category, this.state[this.category]);
    fieldsEl.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('input', () => {
        this.state[this.category][input.dataset.field] = input.value;
        const yearsDisplay = fieldsEl.querySelector('[data-years-display]');
        if (yearsDisplay && input.dataset.field === 'years') yearsDisplay.textContent = `${input.value} yrs`;
        this._updateResults();
      });
    });

    this._updateResults();
  }

  _updateResults() {
    this.overlay.querySelector('.cc-results').innerHTML = _ccResultsHTML(this.category, this.state[this.category]);
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
