// Monthly stats: the left of Home's hero — the pipeline, stacked, the same for FAs and admins (an FA's own; the team's, or the FA
// an admin picked on the leaderboard):
//   Open cases       every case not yet submitted, from any month
//   Submitted cases  every case waiting to be accepted, from any month
// each its PCR, large, then cases and commission. Admin: then the PCR
// split into brought forward (opened / submitted before the month on the
// month bar began) and this month — and they open the Cases tab. On the page itself, no cards. The PCR meter in the middle
// covers Accepted; wills leads and referrals are in the funnel.
//
// caseStats() works the figures out, over a list of cases.

// cases: [{stage, tab, productType, lumpSum, monthly, adviceFeePercent,
// term, finalPcr, openedAt, submittedAt, acceptedAt}]; days: Set of ISO
// dates; monthStart: the month's first day (ISO). Each group: {count,
// pcr, commission}; opened and submitted also broughtForward (the PCR of
// those opened / submitted before monthStart) and thisMonth (the rest).
function caseStats(cases, days, monthStart = '') {
  const group = (list, pcrOf, dateOf) => {
    const pcr = list.reduce((t, c) => t + pcrOf(c), 0);
    const broughtForward = dateOf
      ? list.filter(c => dateOf(c) && dateOf(c) < monthStart).reduce((t, c) => t + pcrOf(c), 0) : 0;
    return {
      count: list.length,
      pcr,
      commission: list.reduce((t, c) => t + caseUpfrontCommission(c), 0),
      broughtForward,
      thisMonth: pcr - broughtForward,
    };
  };
  return {
    opened: group(cases.filter(c => c.stage === 'opened'), casePcr, c => c.openedAt),
    submitted: group(cases.filter(c => c.stage === 'submitted'), casePcr, c => c.submittedAt),
    accepted: group(cases.filter(c => c.stage === 'accepted' && days.has(c.acceptedAt)), caseAcceptedPcr),
  };
}

function _injectMonthlyStatsCSS() {
  if (document.getElementById('monthly-stats-styles')) return;
  const s = document.createElement('style');
  s.id = 'monthly-stats-styles';
  s.textContent = `
    /* On the page itself, like the leaderboard: no cards, a thin line
       between the two. */
    .ms { display: flex; flex-direction: column; gap: 18px; width: 100%; }
    .ms-card {
      background: none;
      border: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: left;
      font-family: inherit;
      color: var(--ink);
    }
    .ms-card + .ms-card { padding-top: 18px; border-top: 1px solid rgba(0, 0, 0, 0.1); }
    button.ms-card { cursor: pointer; }
    button.ms-card:hover .ms-pcr { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; }
    .ms-name { font-size: 13px; font-weight: 600; color: var(--ink-dim); }
    .ms-pcr { font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
    .ms-pcr small { font-size: 14px; font-weight: 500; color: var(--ink-dim); margin-left: 6px; letter-spacing: 0; }
    .ms-sub { font-size: 13px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
    .ms-sub b { color: var(--ink); }
    .ms-split { font-size: 12px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
    .ms-split b { color: var(--ink); font-weight: 600; }
  `;
  document.head.appendChild(s);
}
_injectMonthlyStatsCSS();

class MonthlyStats {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({
      opened: { count: 0, pcr: 0, commission: 0 },
      submitted: { count: 0, pcr: 0, commission: 0 },
      admin: false,             // the cards open the Cases tab
      periodWord: 'This month', // "Selected days" when the admin picks days
    }, config);
    this.render();
    this.container.addEventListener('click', e => {
      if (e.target.closest('[data-show-tab]')) showTab('cases'); // index.html
    });
  }

  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  render() {
    const c = this.config;
    const cases = n => `<b>${n}</b> case${n === 1 ? '' : 's'}`;
    const card = (name, note, x) => {
      const tag = c.admin ? 'button type="button" data-show-tab' : 'div';
      return `
        <${tag} class="ms-card" title="${note}">
          <span class="ms-name">${name}</span>
          <span class="ms-pcr">${formatNumber(x.pcr)}<small>PCR</small></span>
          <span class="ms-sub">${cases(x.count)} · <b>${formatRand(x.commission)}</b> commission</span>
          ${c.admin ? `<span class="ms-split"><b>${formatNumber(x.broughtForward || 0)}</b> brought forward · <b>${formatNumber(x.thisMonth || 0)}</b> this month</span>` : ''}
        </${c.admin ? 'button' : 'div'}>
      `;
    };
    this.container.innerHTML = `
      <div class="ms">
        ${card('Open cases', 'Not yet submitted, from any month', c.opened)}
        ${card('Submitted cases', 'Waiting to be accepted, from any month', c.submitted)}
      </div>
    `;
  }
}

function initMonthlyStats(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new MonthlyStats(container, config);
}
