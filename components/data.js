// Data: the one place the app reads and writes Supabase. Components call
// the db* functions to save, and loadAppData()/refreshDashboard() to pull
// the signed-in FA's real clients and numbers back into the UI.
//
// Everything here is scoped to the signed-in person's own rows
// (fa_id = currentUser.id) — in admin mode too, for now: RLS would hand
// an admin every FA's clients, but there's no admin view to show them in
// yet (see app-mode.js).
//
// Card data shape (what client-card.js renders) is built from three
// tables: clients (one row per card), activities (meetings, FNAs,
// quotes, wills leads, referrals — each a dated line on the card), and
// cases (in progress / accepted / not taken up, each with its own
// status history). Every item keeps its database id so it can be
// updated or deleted later.

const _MEETING_TYPE_LABELS = { factFinder: 'Fact Finder', relational: 'Relational', closing: 'Closing' };

function meetingText(details) {
  const label = _MEETING_TYPE_LABELS[details.meetingType] || 'Meeting';
  return `${label}${details.joint ? ' · Joint call' : ''}`;
}

function quoteText(details) {
  return details.risk && details.investment ? 'Risk & Investment' : details.risk ? 'Risk' : 'Investment';
}

// The card list line for one activity row. FNAs (and referrals, which
// the card only counts) are just their date, so no text.
function activityItem(a) {
  const text = a.type === 'meeting' ? meetingText(a.details)
    : a.type === 'quote' ? quoteText(a.details)
    : a.type === 'wills_lead' ? 'Wills lead'
    : '';
  return { id: a.id, date: a.date, text };
}

// Which card list each activity type lives in.
const ACTIVITY_TYPE_FOR_VIEW = { meetings: 'meeting', fnas: 'fna', quotes: 'quote' };

function _dbOk({ data, error }) {
  if (error) throw error;
  return data;
}

// PostgREST caps a single read at 1000 rows; an FA's activity history
// passes that within a couple of months (a status per Business client
// per day), so read in pages until one comes back short.
async function _fetchAll(buildQuery) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = _dbOk(await buildQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function _faId() {
  if (!currentUser) throw new Error('Not signed in.');
  return currentUser.id;
}

// ---------- reads ----------

// statuses: [{at, text, ending}], newest first — statuses[0] is current.
function caseItem(c) {
  return {
    id: c.id,
    status: c.status,
    statuses: c.case_statuses || [],
    type: c.case_type,
    date: c.status === 'accepted' ? c.accepted_at : c.initiated_date,
    initiatedDate: c.initiated_date,
    acceptedAt: c.accepted_at,
    lumpSum: c.lump_sum,
    monthly: c.monthly,
    adviceFeePercent: c.advice_fee_percent,
  };
}

function _cardFromRows(client, activities, cases) {
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const of = type => activities.filter(a => a.type === type).map(activityItem).sort(byDate);
  return {
    id: client.id,
    tab: client.tab,
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email || '',
    phone: client.phone || '',
    details: { fullName: `${client.first_name} ${client.last_name}`.trim() },
    referrals: of('referral'),
    meetings: of('meeting'),
    fnas: of('fna'),
    quotes: of('quote'),
    willsLeads: of('wills_lead'),
    casesInProgress: cases.filter(c => c.status === 'in-progress').map(caseItem).sort(byDate),
    acceptedCases: cases.filter(c => c.status === 'accepted').map(caseItem).sort(byDate),
    notTakenUpCases: cases.filter(c => c.status === 'not-taken-up').map(caseItem).sort(byDate),
  };
}

async function _loadMyCards() {
  const faId = _faId();
  const [clients, activities, cases] = await Promise.all([
    _fetchAll(() => supabaseClient.from('clients').select('*').eq('fa_id', faId).order('created_at')),
    _fetchAll(() => supabaseClient.from('activities').select('id, client_id, type, date, details')
      .eq('fa_id', faId).not('client_id', 'is', null).order('date')),
    _fetchAll(() => supabaseClient.from('cases').select('*').eq('fa_id', faId).order('initiated_date')),
  ]);
  const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
  const actsBy = group(activities, 'client_id');
  const casesBy = group(cases, 'client_id');
  return clients.map(c => _cardFromRows(c, actsBy[c.id] || [], casesBy[c.id] || []));
}

async function _loadMyCheckoutDates() {
  const rows = await _fetchAll(() => supabaseClient.from('activities').select('date')
    .eq('fa_id', _faId()).eq('type', 'checkout'));
  return rows.map(r => r.date);
}

// days: Set of ISO dates; checkoutDay: ISO date to report check-outs
// for (admin view), or null.
async function _loadLeaderboard(days, checkoutDay) {
  return _dbOk(await supabaseClient.rpc('leaderboard', { p_dates: [...days], p_checkout_date: checkoutDay }));
}

// Admin view only: every FA's cases (RLS's is_admin() allows it), with
// their client's name and tab, and every active FA's target.
async function _loadTeamCases() {
  const rows = await _fetchAll(() => supabaseClient.from('cases')
    .select('id, fa_id, case_type, status, lump_sum, monthly, advice_fee_percent, accepted_at, case_statuses, clients(first_name, last_name, tab)')
    .order('initiated_date'));
  return rows.map(c => ({
    faId: c.fa_id,
    clientName: c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : '',
    tab: c.clients?.tab || '',
    status: c.status,
    type: c.case_type,
    lumpSum: c.lump_sum,
    monthly: c.monthly,
    adviceFeePercent: c.advice_fee_percent,
    acceptedAt: c.accepted_at,
    latest: (c.case_statuses || [])[0]?.text || '',
  }));
}

async function _loadTeamTargets() {
  return _dbOk(await supabaseClient.from('users').select('id, pcr_target').eq('is_active', true));
}

// ---------- writes ----------

async function dbCreateClient({ firstName, lastName, email, phone }) {
  const row = _dbOk(await supabaseClient.from('clients').insert({
    fa_id: _faId(),
    first_name: firstName,
    last_name: lastName,
    email: email || null,
    phone: phone || null,
  }).select().single());
  return _cardFromRows(row, [], []);
}

async function dbSetClientTab(clientId, tab) {
  _dbOk(await supabaseClient.from('clients').update({ tab }).eq('id', clientId));
}

// Saves the move and moves the card on screen.
async function moveClientToTab(clientId, tab) {
  await dbSetClientTab(clientId, tab);
  moveClientCard(clientId, tab);
  await refreshDashboard();
}

// One activity from a card's inline add; returns the saved row.
async function dbAddActivity(clientId, type, date, details) {
  return _dbOk(await supabaseClient.from('activities')
    .insert({ fa_id: _faId(), client_id: clientId, type, date, details: details || {} })
    .select().single());
}

async function dbDeleteActivity(id) {
  _dbOk(await supabaseClient.from('activities').delete().eq('id', id));
}

// One case from a card's inline add; returns the saved row.
async function dbAddCase(row) {
  return _dbOk(await supabaseClient.from('cases').insert(_newCaseRow(row, _faId())).select().single());
}

async function dbDeleteCase(id) {
  _dbOk(await supabaseClient.from('cases').delete().eq('id', id));
}

// rows: [{client_id, type, date, details}] — fa_id filled in here.
async function dbInsertActivities(rows) {
  if (!rows.length) return;
  const faId = _faId();
  _dbOk(await supabaseClient.from('activities').insert(rows.map(r => ({ ...r, fa_id: faId }))));
}

// Every new case starts its log with "Case opened", timestamped now.
function _newCaseRow(r, faId) {
  return {
    ...r,
    fa_id: faId,
    status: 'in-progress',
    case_statuses: [{ at: new Date().toISOString(), text: CASE_FIRST_STATUS, ending: null }],
  };
}

// rows: [{client_id, case_type, initiated_date, lump_sum, monthly, advice_fee_percent}]
async function dbInsertCases(rows) {
  if (!rows.length) return;
  const faId = _faId();
  _dbOk(await supabaseClient.from('cases').insert(rows.map(r => _newCaseRow(r, faId))));
}

// Adds a status to a case; "Accepted" / "Not taken up" close it, any
// other status reopens a closed one. Returns the updated case row.
async function dbAddCaseStatus(caseId, text) {
  return _dbOk(await supabaseClient.rpc('add_case_status', {
    p_case_id: caseId,
    p_text: text,
    p_ending: caseEndingFor(text),
    p_date: _todayIso(),
  }));
}

// At most one per FA per day (unique index); a repeat checkout of the
// same day is already marked, so a duplicate is fine to ignore.
async function dbMarkCheckedOut(date) {
  const { error } = await supabaseClient.from('activities').insert({ fa_id: _faId(), type: 'checkout', date, details: {} });
  if (error && error.code !== '23505') throw error;
}

// ---------- loading into the UI ----------

let _widgets = {};

// index.html hands over the dashboard widgets once, so refreshes can
// update them in place.
function registerDashboardWidgets(widgets) {
  _widgets = widgets;
}

function _currentPeriod() {
  const periods = buildMonthPeriods();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return periods.find(p => today >= p.start && today <= p.end) || periods[periods.length - 1];
}

// Every day of a business month up to today: "month to date".
function _periodDays(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = new Set();
  for (const d = new Date(period.start); d <= period.end && d <= today; d.setDate(d.getDate() + 1)) {
    days.add(isoDate(d));
  }
  return days;
}

// The last weekday before today — the day FAs should have checked out.
function _lastWeekday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  do d.setDate(d.getDate() - 1); while (isWeekend(d));
  return isoDate(d);
}

function _repFromLeaderboardRow(row) {
  const m = row.meetings || {};
  const cases = row.cases || [];
  const sum = (pred, fn) => cases.filter(pred).reduce((t, c) => t + fn(c), 0);
  const pcrOf = c => casePcr({ type: c.type, lumpSum: c.acceptedLumpSum, monthly: c.acceptedMonthly });
  const isRisk = c => caseIsRisk(c.type);
  const notRisk = c => !caseIsRisk(c.type);
  const isYou = currentUser && row.id === currentUser.id;
  return {
    id: row.id,
    name: isYou ? `${row.name} (you)` : row.name,
    plainName: row.name,
    checkedOut: row.checkedOut,
    prospects: row.prospects || 0,
    referrals: row.referrals || 0,
    willsLeads: row.willsLeads || 0,
    meetings: (m.factFinder || 0) + (m.closing || 0) + (m.relational || 0),
    meetingsBreakdown: { factFinder: m.factFinder || 0, closing: m.closing || 0, relational: m.relational || 0 },
    fnas: row.fnas || 0,
    quotes: row.quotes || 0,
    cases: sum(() => true, c => c.submitted),
    casesBreakdown: { risk: sum(isRisk, c => c.submitted), investments: sum(notRisk, c => c.submitted) },
    pcr: Math.round(sum(() => true, pcrOf)),
    pcrBreakdown: { risk: Math.round(sum(isRisk, pcrOf)), investments: Math.round(sum(notRisk, pcrOf)) },
  };
}

// The whole team as one rep: every figure added up.
function _teamRep(reps) {
  const add = key => reps.reduce((t, r) => t + (r[key] || 0), 0);
  const addIn = (key, sub) => reps.reduce((t, r) => t + (r[key]?.[sub] || 0), 0);
  return {
    prospects: add('prospects'), referrals: add('referrals'), willsLeads: add('willsLeads'),
    meetings: add('meetings'),
    meetingsBreakdown: { factFinder: addIn('meetingsBreakdown', 'factFinder'), closing: addIn('meetingsBreakdown', 'closing'), relational: addIn('meetingsBreakdown', 'relational') },
    fnas: add('fnas'), quotes: add('quotes'), cases: add('cases'), pcr: add('pcr'),
  };
}

// The signed-in FA's own cases, in the shape caseStats() takes.
function _myCases() {
  return getClientRecords().flatMap(r => {
    const d = getClientData(r.id);
    return [...(d.casesInProgress || []), ...(d.acceptedCases || []), ...(d.notTakenUpCases || [])]
      .map(c => ({ ...c, tab: r.tab }));
  });
}

// ---------- admin view ----------
//
// Home only (no tabs), with the whole team's figures: the funnel and
// monthly stats add up every FA's, and the PCR meter measures the team
// against teamPcrTarget() (constants.js). Month to date by default; days
// picked on the month bar narrow everything to just those days, and the
// PCR meter's label names them. Clicking a name on the leaderboard opens
// that FA's Business-tab cases under their row and switches the hero to
// their figures; clicking it again goes back to the team.

const _adminDays = new Set();   // days picked on the month bar; empty = month to date
let _adminFocusId = null;       // the FA whose row is open, or null for the team
let _dash = null;               // the last load, re-rendered on focus changes
let _refreshRun = 0;            // only the latest refresh gets to render
let _lastMode = null;

const _adminSelection = {
  dates: _adminDays,
  onToggle(iso) {
    if (_adminDays.has(iso)) _adminDays.delete(iso); else _adminDays.add(iso);
    setMonthBarSelection(_adminSelection);
    refreshDashboard().catch(showSaveError);
  },
  onReset() {
    _adminDays.clear();
    setMonthBarSelection(_adminSelection);
    refreshDashboard().catch(showSaveError);
  },
};

function _isAdminView() {
  return getAppMode() === 'admin';
}

// The PCR meter's label: whose figures (admin, one FA) and which days.
function dashboardLabel(period) {
  if (!_isAdminView()) return period?.label || '';
  const days = _adminDays.size ? formatDaySelection(_adminDays) : period?.label || '';
  const focus = _adminFocusId && _dash?.reps.find(r => r.id === _adminFocusId);
  return focus ? `${focus.plainName} · ${days}` : days;
}

// Called by the month bar's ‹ › buttons: a new month starts unpicked.
function onDashboardPeriodChange() {
  if (!_isAdminView()) return;
  _adminDays.clear();
  setMonthBarSelection(_adminSelection);
  refreshDashboard().catch(showSaveError);
}

function _businessCasesHTML(rep) {
  const open = (_dash?.teamCases || []).filter(c => c.faId === rep.id && c.status === 'in-progress' && c.tab === 'business');
  if (!open.length) return '<div class="lb-detail-empty">No open cases in Business.</div>';
  return `
    <div class="lb-detail-title">Business tab · ${open.length} open case${open.length === 1 ? '' : 's'}</div>
    ${open.map(c => `
      <div class="lb-detail-row">
        <span class="lb-detail-client">${_escHtml(c.clientName)}</span>
        <span class="lb-detail-type">${_escHtml(c.type)}</span>
        <span class="lb-detail-status" title="${_escHtml(c.latest)}">${_escHtml(c.latest)}</span>
        <span class="lb-detail-pcr">PCR ${formatNumber(casePcr(c))}</span>
      </div>
    `).join('')}
  `;
}

// Draws the hero and leaderboard from the last load (_dash), so focusing
// an FA needs no new request.
function _renderDashboard() {
  const d = _dash;
  if (!d) return;
  let rep, cases, target;
  if (!d.admin) {
    rep = d.reps.find(r => r.id === currentUser.id) || _repFromLeaderboardRow({ id: currentUser.id, name: '' });
    cases = _myCases();
    target = currentUser.pcr_target || null;
  } else if (_adminFocusId) {
    rep = d.reps.find(r => r.id === _adminFocusId) || _teamRep([]);
    cases = d.teamCases.filter(c => c.faId === _adminFocusId);
    target = d.targets.find(t => t.id === _adminFocusId)?.pcr_target || null;
  } else {
    rep = _teamRep(d.reps);
    cases = d.teamCases;
    target = teamPcrTarget(d.targets.map(t => t.pcr_target)) || null;
  }

  _widgets.funnel?.update({
    prospectsContacted: rep.prospects,
    meetings: rep.meetingsBreakdown,
    fnas: rep.fnas,
    quotes: rep.quotes,
    casesSubmitted: rep.cases,
  });
  _widgets.pcrMeter?.update({ currentCount: rep.pcr, validationTarget: target });
  _widgets.pcrMeter?.setPeriodLabel(dashboardLabel(getMonthBarPeriod() || _currentPeriod()));
  _widgets.monthlyStats?.update({
    ...caseStats(cases, d.days),
    willsLeads: rep.willsLeads,
    referrals: rep.referrals,
    periodWord: d.admin && _adminDays.size ? 'Selected Days' : 'This Month',
  });

  if (d.admin) {
    const when = _adminDays.size ? formatDaySelection(_adminDays) : 'MTD';
    _widgets.leaderboard?.setReps(d.reps, {
      title: `Team Leaderboard — ${when}`,
      selectedId: _adminFocusId,
      checkoutDayLabel: formatDaySelection([d.checkoutDay]),
      detailHTML: _businessCasesHTML,
      onSelect: id => { _adminFocusId = id; _renderDashboard(); },
    });
  } else {
    _widgets.leaderboard?.setReps(d.reps);
  }
}

// Funnel, PCR meter, monthly stats, leaderboard and the month bar's
// checked-out days — everything on the dashboard that isn't a card.
async function refreshDashboard() {
  if (!currentUser) return;
  const run = ++_refreshRun;
  const admin = _isAdminView();
  const days = admin && _adminDays.size ? new Set(_adminDays)
    : _periodDays(admin ? (getMonthBarPeriod() || _currentPeriod()) : _currentPeriod());
  const checkoutDay = admin ? (_adminDays.size === 1 ? [..._adminDays][0] : _lastWeekday()) : null;

  const [board, checkoutDates, teamCases, targets] = await Promise.all([
    _loadLeaderboard(days, checkoutDay),
    _loadMyCheckoutDates(),
    admin ? _loadTeamCases() : null,
    admin ? _loadTeamTargets() : null,
  ]);
  if (run !== _refreshRun) return; // a newer refresh has started

  _dash = { admin, days, checkoutDay, reps: board.map(_repFromLeaderboardRow), teamCases, targets };
  if (admin && _adminFocusId && !_dash.reps.some(r => r.id === _adminFocusId)) _adminFocusId = null;
  _renderDashboard();
  setCheckedOutDates(checkoutDates);
  _syncCheckoutTrigger();
}

// Switching FA ↔ Admin: start the admin view fresh (month to date, the
// whole team), turn the month bar's day-picking on or off, and reload.
document.addEventListener('appmodechange', e => {
  const mode = e.detail.mode;
  if (mode === _lastMode) return;
  _lastMode = mode;
  _adminDays.clear();
  _adminFocusId = null;
  setMonthBarSelection(mode === 'admin' ? _adminSelection : null);
  if (mode === 'admin') showTab('dashboard');
  if (currentUser) refreshDashboard().catch(showSaveError);
});

// The cards in every tab, then the dashboard. Called on sign-in and after
// anything that writes more than one card's worth (e.g. a checkout).
async function loadAppData() {
  const cards = await _loadMyCards();
  CLIENT_STORE.clear();
  Object.keys(CLIENT_TAB_LABELS).forEach(tab => {
    renderClientCards(`${tab}-cards`, cards.filter(c => c.tab === tab));
  });
  await refreshDashboard();
}

function clearAppData() {
  _dash = null;
  CLIENT_STORE.clear();
  Object.keys(CLIENT_TAB_LABELS).forEach(tab => renderClientCards(`${tab}-cards`, []));
  _widgets.leaderboard?.setReps([]);
  setCheckedOutDates([]);
}

// Shown when a save fails, so nobody thinks something was recorded when
// it wasn't.
function showSaveError(err) {
  console.error(err);
  alert(`Couldn't save that — ${err.message || err}. Please check your connection and try again.`);
}

document.addEventListener('currentuser:changed', async () => {
  if (!currentUser) { clearAppData(); return; }
  try {
    await loadAppData();
  } catch (err) {
    console.error(err);
    alert(`Couldn't load your clients — ${err.message || err}. Try refreshing the page.`);
  }
});
