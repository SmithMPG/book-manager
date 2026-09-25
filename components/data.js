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

async function _loadLeaderboard(period) {
  return _dbOk(await supabaseClient.rpc('leaderboard', { p_start: isoDate(period.start), p_end: isoDate(period.end) }));
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
    prospects: row.prospects,
    referrals: row.referrals,
    willsLeads: row.willsLeads,
    meetings: (m.factFinder || 0) + (m.closing || 0) + (m.relational || 0),
    meetingsBreakdown: { factFinder: m.factFinder || 0, closing: m.closing || 0, relational: m.relational || 0 },
    fnas: row.fnas,
    quotes: row.quotes,
    cases: sum(() => true, c => c.submitted),
    casesBreakdown: { risk: sum(isRisk, c => c.submitted), investments: sum(notRisk, c => c.submitted) },
    pcr: Math.round(sum(() => true, pcrOf)),
    pcrBreakdown: { risk: Math.round(sum(isRisk, pcrOf)), investments: Math.round(sum(notRisk, pcrOf)) },
  };
}

// Funnel, PCR meter, monthly stats, leaderboard and the month bar's
// checked-out days — everything on the dashboard that isn't a card.
async function refreshDashboard() {
  if (!currentUser) return;
  const period = _currentPeriod();
  const [board, checkoutDates] = await Promise.all([_loadLeaderboard(period), _loadMyCheckoutDates()]);
  const reps = board.map(_repFromLeaderboardRow);
  const me = reps.find(r => r.id === currentUser.id) || _repFromLeaderboardRow({ id: currentUser.id, name: '' });

  _widgets.leaderboard?.setReps(reps);
  _widgets.funnel?.update({
    prospectsContacted: me.prospects,
    meetings: me.meetingsBreakdown,
    fnas: me.fnas,
    quotes: me.quotes,
    casesSubmitted: me.cases,
  });
  _widgets.pcrMeter?.update({ currentCount: me.pcr, validationTarget: currentUser.pcr_target || null });
  _widgets.monthlyStats?.update({ willsLeadsMonthly: me.willsLeads, referralsMonthly: me.referrals });
  setCheckedOutDates(checkoutDates);
  _syncCheckoutTrigger();
}

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
