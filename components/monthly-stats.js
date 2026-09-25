// Monthly stats: commission in the pipeline, this cycle's expected payout,
// wills leads, and referrals — the monthly-cadence counterpart to the
// client funnel and PCR meter it sits alongside in the hero bar.
//
// Commission in the Pot: upfront commission (see constants.js) for
// every case still in progress (not yet accepted) across every client in
// the Business tab — the pipeline that hasn't landed yet.
//
// Expected Commission This Month: upfront commission for cases that have
// been accepted (see the Accept toggle on a client's Cases list) and
// landed in the Clients tab, filtered to acceptances dated within the
// current business month — close-off date to close-off date (see
// CLOSE_OFF_DATES in constants.js and buildMonthPeriods() in
// components/month-bar.js). Both figures recompute whenever client data
// changes (the 'clients:changed' event, dispatched on every render/update).

function _commissionCurrentMonthPeriod() {
  const periods = buildMonthPeriods();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return periods.find(p => today >= p.start && today <= p.end) || periods[periods.length - 1];
}

function _commissionInThePot() {
  let total = 0;
  getClientRecords().filter(c => c.tab === 'business').forEach(c => {
    (getClientData(c.id).casesInProgress || []).forEach(item => {
      total += caseUpfrontCommission(item);
    });
  });
  return total;
}

function _expectedCommissionThisMonth() {
  const period = _commissionCurrentMonthPeriod();
  let total = 0;
  getClientRecords().filter(c => c.tab === 'clients').forEach(c => {
    (getClientData(c.id).acceptedCases || []).forEach(item => {
      const accepted = new Date(item.date + 'T00:00:00');
      if (accepted >= period.start && accepted <= period.end) total += caseUpfrontCommission(item);
    });
  });
  return total;
}

function _formatCommissionRand(n) {
  return `R${Math.round(n).toLocaleString('en-ZA')}`;
}

class MonthlyStats {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({
      willsLeadsMonthly: 0,
      referralsMonthly: 0,
    }, config);
    this._onClientsChanged = () => this.render();
    document.addEventListener('clients:changed', this._onClientsChanged);
    this.render();
  }

  // Wills leads / referrals this month (data.js refreshDashboard); the
  // commission figures come straight from the client cards.
  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  render() {
    const c = this.config;
    this.container.innerHTML = `
      <div class="stat-list">
        <div class="stat-cell">Commission in the Pot: <b>${_formatCommissionRand(_commissionInThePot())}</b></div>
        <div class="stat-cell">Expected Commission This Month: <b>${_formatCommissionRand(_expectedCommissionThisMonth())}</b></div>
        <div class="stat-cell">Wills Leads Submitted MTD: <b>${c.willsLeadsMonthly}</b></div>
        <div class="stat-cell">Referrals This Month: <b>${c.referralsMonthly}</b></div>
      </div>
    `;
  }
}

function initMonthlyStats(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new MonthlyStats(container, config);
}
