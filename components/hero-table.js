// Hero table: the left of Home's hero, a small table with the meter(s)
// on its right (an FA's Accepted meter, pcr-meter.js; the admin team's
// week meters). Rows Open · Submitted · Accepted, in one of two shapes:
//
//   FA (their own Home)       PCR        Commission
//     Open                    691 297    R15 650      every case not yet submitted, any month
//     Submitted               1 600 000  R0           every case waiting to be accepted, any month
//     Accepted                250 000    R8 000       accepted this month (expected commission)
//
//   Admin (the team, or the   Brought forward  This month  Total
//   FA picked)
//     Open                    opened before this month · opened in it
//     Submitted               submitted before this month · submitted in it
//     Accepted                accepted this month: submitted before it ·
//                             submitted in it
// "This month" is the month on the month bar. No commission for admins.
//
// caseStats() works the FA's figures out, over a list of cases.

// cases: [{stage, tab, productType, lumpSum, monthly, adviceFeePercent,
// term, finalPcr, openedAt, submittedAt, acceptedAt}]; days: Set of ISO
// dates. Each group: {count, pcr, commission}.
function caseStats(cases, days) {
  const group = (list, pcrOf) => ({
    count: list.length,
    pcr: list.reduce((t, c) => t + pcrOf(c), 0),
    commission: list.reduce((t, c) => t + caseUpfrontCommission(c), 0),
  });
  return {
    opened: group(cases.filter(c => c.stage === 'opened'), casePcr),
    submitted: group(cases.filter(c => c.stage === 'submitted'), casePcr),
    accepted: group(cases.filter(c => c.stage === 'accepted' && days.has(c.acceptedAt)), caseAcceptedPcr),
  };
}

// The admin's figures: for each row, its PCR brought forward (from
// before the month began), this month, and the total. period: {start,
// end} (Dates).
function caseSplit(cases, period) {
  const start = period?.start ? isoDate(period.start) : '';
  const end = period?.end ? isoDate(period.end) : '9999-12-31';
  const split = (list, dateOf, pcrOf) => {
    const total = list.reduce((t, c) => t + pcrOf(c), 0);
    const broughtForward = list.filter(c => (dateOf(c) || '') < start).reduce((t, c) => t + pcrOf(c), 0);
    return { broughtForward, thisMonth: total - broughtForward, total };
  };
  return {
    opened: split(cases.filter(c => c.stage === 'opened'), c => c.openedAt, casePcr),
    submitted: split(cases.filter(c => c.stage === 'submitted'), c => c.submittedAt, casePcr),
    // Accepted in the month — brought forward if it was submitted before.
    accepted: split(
      cases.filter(c => c.stage === 'accepted' && c.acceptedAt >= start && c.acceptedAt <= end),
      c => c.submittedAt || c.openedAt, caseAcceptedPcr),
  };
}

function _injectHeroTableCSS() {
  if (document.getElementById('hero-table-styles')) return;
  const s = document.createElement('style');
  s.id = 'hero-table-styles';
  s.textContent = `
    /* The label takes what's left; the figures sit in fixed columns at
       the right, so they don't drift apart on a wide screen. */
    .ht { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .ht th:not(:first-child), .ht td:not(:first-child) { width: 150px; }
    .ht th {
      text-align: right;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ink-dim);
      padding: 0 0 10px 24px;
      white-space: nowrap;
    }
    .ht td { text-align: right; padding: 14px 0 14px 24px; font-size: 22px; font-weight: 700; color: var(--ink); white-space: nowrap; border-top: 1px solid rgba(0, 0, 0, 0.06); }
    .ht th:first-child, .ht td:first-child { text-align: left; padding-left: 0; }
    .ht td:first-child { font-size: 14px; font-weight: 600; color: var(--ink-dim); }
    .ht tr:first-child td { border-top: none; }
  `;
  document.head.appendChild(s);
}
_injectHeroTableCSS();

class HeroTable {
  constructor(container) {
    this.container = container;
    this.config = { mode: 'fa', rows: null };
    this.render();
  }

  // FA: {mode: 'fa', opened, submitted, accepted} — each {pcr,
  // commission}. Admin: {mode: 'admin', opened, submitted, accepted} —
  // each {broughtForward, thisMonth, total}.
  update(config) {
    this.config = config;
    this.render();
  }

  render() {
    const c = this.config;
    if (!c.opened) { this.container.innerHTML = ''; return; }
    const n = x => formatNumber(Math.round(x || 0));
    // An FA's Accepted is this month's (Open and Submitted are any month's).
    const rows = [['Open', c.opened], ['Submitted', c.submitted], [c.mode === 'admin' ? 'Accepted' : 'Accepted this month', c.accepted]];
    const [head, cells] = c.mode === 'admin'
      ? [['Brought forward', 'This month', 'Total'], x => [n(x.broughtForward), n(x.thisMonth), n(x.total)]]
      : [['PCR', 'Commission'], x => [n(x.pcr), formatRand(x.commission || 0)]];
    this.container.innerHTML = `
      <table class="ht">
        <tr><th></th>${head.map(h => `<th>${h}</th>`).join('')}</tr>
        ${rows.map(([name, x]) => `<tr><td>${name}</td>${cells(x).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}
      </table>
    `;
  }
}

function initHeroTable(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new HeroTable(container);
}
