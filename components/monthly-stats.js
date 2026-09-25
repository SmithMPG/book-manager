// Monthly stats: commission in the pipeline, the expected payout, wills
// leads and referrals — the monthly-cadence counterpart to the client
// funnel and PCR meter it sits alongside in the hero bar.
//
// Shows whatever data.js hands it (refreshDashboard): the FA's own
// figures, the whole team's, or one FA's in the admin view. The figures
// themselves come from caseStats() below, over a list of cases:
//
// Commission in the Pot: upfront commission (see constants.js) for every
// case still in progress on a client in the Business tab — the pipeline
// that hasn't landed yet. A snapshot of what's open now, so it doesn't
// follow the dates picked on the month bar.
//
// PCR's in the Pot: PCR (casePcr in constants.js) for those same cases.
//
// Expected Commission: upfront commission for cases accepted on the days
// being looked at — this business month to date by default (close-off
// to close-off, see CLOSE_OFF_DATES in constants.js), or the days picked
// on the month bar in the admin view.
//
// Wills leads / referrals: counted over those same days (leaderboard()).

// cases: [{status, tab, type, lumpSum, monthly, adviceFeePercent,
// acceptedAt}]; days: Set of ISO dates.
function caseStats(cases, days) {
  const open = cases.filter(c => c.status === 'in-progress' && c.tab === 'business');
  const accepted = cases.filter(c => c.status === 'accepted' && days.has(c.acceptedAt));
  const sum = (list, fn) => list.reduce((t, c) => t + fn(c), 0);
  return {
    commissionInPot: sum(open, caseUpfrontCommission),
    pcrInPot: sum(open, casePcr),
    expectedCommission: sum(accepted, caseUpfrontCommission),
  };
}

class MonthlyStats {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({
      commissionInPot: 0,
      pcrInPot: 0,
      expectedCommission: 0,
      willsLeads: 0,
      referrals: 0,
      periodWord: 'This Month', // "Selected Days" when the admin picks days
    }, config);
    this.render();
  }

  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  // Rand for commission; PCR is a score, not rand, so no currency prefix
  // (formatRand / formatNumber, money.js).
  render() {
    const c = this.config;
    this.container.innerHTML = `
      <div class="stat-list">
        <div class="stat-cell">Commission in the Pot: <b>${formatRand(c.commissionInPot)}</b></div>
        <div class="stat-cell">PCR&#8217;s in the Pot: <b>${formatNumber(c.pcrInPot)}</b></div>
        <div class="stat-cell">Expected Commission ${c.periodWord}: <b>${formatRand(c.expectedCommission)}</b></div>
        <div class="stat-cell">Wills Leads Submitted ${c.periodWord}: <b>${c.willsLeads}</b></div>
        <div class="stat-cell">Referrals ${c.periodWord}: <b>${c.referrals}</b></div>
      </div>
    `;
  }
}

function initMonthlyStats(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new MonthlyStats(container, config);
}
