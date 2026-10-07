// Data: the one place the app reads and writes Supabase. Components call
// the db* functions to save, and loadAppData()/refreshDashboard() to pull
// the signed-in FA's real clients and numbers back into the UI.
//
// Cards, checkouts and new rows belong to the book being worked on: the
// signed-in person's own (fa_id = currentUser.id), or — in test mode —
// the shared Test Book (a users row in 'Test group', left out of the
// leaderboard). The admin view reads the whole team (see below).
//
// Card data shape (what client-card.js renders), from three tables:
//   clients    one row per card
//   timeline   the client's activities — contacts, notes, meetings,
//              FNAs, quotes, wills leads, referrals and case events —
//              newest first (by date, then when it was logged)
//   cases      the client's cases: stage, amounts, checklist
// Every item keeps its database id so it can be updated or deleted.

const _MEETING_TYPE_LABELS = { factFinder: 'Fact Finder', relational: 'Relational', closing: 'Closing' };

// "Fact Finder · Joint call · 2 referrals · Wills lead"
function meetingText(details) {
  const parts = [_MEETING_TYPE_LABELS[details.meetingType] || 'Meeting'];
  if (details.joint) parts.push('Joint call');
  const n = Number(details.referrals) || 0;
  if (n) parts.push(`${n} referral${n === 1 ? '' : 's'}`);
  if (details.willsLead) parts.push('Wills lead');
  return parts.join(' · ');
}

function quoteText(details) {
  return details.risk && details.investment ? 'Risk & Investment' : details.risk ? 'Risk' : 'Investment';
}

const _CONTACT_METHOD_LABELS = Object.fromEntries(CONTACT_METHODS.map(m => [m.key, m.label]));

function contactText(details) {
  return [_CONTACT_METHOD_LABELS[details.method] || 'Contact', details.outcome].filter(Boolean).join(' · ');
}

// One timeline entry. Case entries' wording needs the case itself, so the
// card words those (card-items.js timelineEntryText).
function activityItem(a) {
  const text = a.type === 'contact' ? contactText(a.details)
    : a.type === 'note' ? (a.details.text || '')
    : a.type === 'meeting' ? meetingText(a.details)
    : a.type === 'quote' ? quoteText(a.details)
    : '';
  return {
    id: a.id,
    type: a.type,
    date: a.date,
    createdAt: a.created_at,
    caseId: a.case_id,
    details: a.details || {},
    text,
  };
}

// Newest first: by the day it happened, then by when it was logged.
function byTimelineOrder(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '');
}

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

// The Test Book's users row, once loaded (test mode only).
let _testBook = null;

async function _loadTestBook() {
  const rows = _dbOk(await supabaseClient.from('users').select('id, name, surname, pcr_target')
    .eq('branch', 'Test group').eq('is_active', true).limit(1));
  _testBook = rows[0] || null;
  return _testBook;
}

// The book being worked on: the Test Book in test mode, else your own.
function _actingFa() {
  if (!currentUser) throw new Error('Not signed in.');
  if (getAppMode() !== 'test') return currentUser;
  if (!_testBook) throw new Error('The Test Book isn\'t loaded.');
  return _testBook;
}

function _faId() {
  return _actingFa().id;
}

// ---------- the Calendar ----------
//
// Every month row (months table), oldest first: {month (ISO first of the
// month), label ("October 2026"), closeOffDate, weeklyTarget}. The ones
// with a close-off date become CLOSE_OFF_DATES (constants.js), which the
// month bar and every "this month" figure read. Loaded with everything
// else; the Calendar page (calendar.js) shows and edits them.

const _MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
let _months = [];

function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${_MONTH_NAMES[m - 1]} ${y}`;
}

async function loadMonths() {
  const rows = _dbOk(await supabaseClient.from('months')
    .select('month, close_off_date, weekly_target').order('month'));
  _months = rows.map(r => ({
    month: r.month,
    label: monthLabel(r.month),
    closeOffDate: r.close_off_date,
    weeklyTarget: r.weekly_target == null ? null : Number(r.weekly_target),
  }));
  CLOSE_OFF_DATES = _months.filter(m => m.closeOffDate).map(m => {
    const [y, mo] = m.month.split('-').map(Number);
    return { month: _MONTH_NAMES[mo - 1], year: y, monthStart: m.month, closeOffDate: m.closeOffDate, weeklyTarget: m.weeklyTarget };
  });
  reloadMonthBar();                                        // month-bar.js
  _syncNoMonthStrip();
  document.dispatchEvent(new CustomEvent('months:changed'));
}

function getMonths() {
  return _months;
}

// Saves one month's close-off date and weekly target (either can be
// blank), then reloads. The database refuses a close-off date out of
// order with its neighbours.
async function dbSaveMonth(month, { closeOffDate, weeklyTarget }) {
  _dbOk(await supabaseClient.from('months').upsert({
    month,
    close_off_date: closeOffDate || null,
    weekly_target: weeklyTarget ?? null,
  }, { onConflict: 'month' }));
  await loadMonths();
  await refreshDashboard();
}

// Admins: a strip under the top bar when today's month has no close-off
// date yet (the app shows the last month it has meanwhile).
function _syncNoMonthStrip() {
  const strip = document.getElementById('no-month-strip');
  if (!strip) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const covered = buildMonthPeriods().some(p => today >= p.start && today <= p.end);
  strip.hidden = covered || !currentUser?.is_admin;
}

// ---------- products ----------
//
// The New Case dropdown, each product with its checklist (products,
// product_checklist_items). Loaded with everything else; the Products
// tab (products.js) shows them.

let _products = [];

function _byName(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

// Checklists are alphabetical.
function _alphabetical(items) {
  return [...items].sort((a, b) => _byName(a.label, b.label));
}

async function loadProducts() {
  const [products, items] = await Promise.all([
    supabaseClient.from('products').select('id, name, type'),
    supabaseClient.from('product_checklist_items').select('id, product_id, key, label'),
  ].map(async q => _dbOk(await q)));
  products.sort((a, b) => _byName(a.name, b.name));
  _products = products.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    checklist: _alphabetical(items.filter(r => r.product_id === p.id).map(r => ({ id: r.id, key: r.key, label: r.label }))),
  }));
  document.dispatchEvent(new CustomEvent('products:changed'));
}

// Writes (admins only — RLS). Each reloads the products afterwards, so
// every dropdown and the Products tab redraw ('products:changed').

function _productError(err, name) {
  if (err?.code === '23505') return new Error(`There's already a product called ${name}.`);
  return err;
}

// A new product starts with the standard checklist (CASE_CHECKLIST).
async function dbAddProduct({ name, type }) {
  const { data: p, error } = await supabaseClient.from('products').insert({ name, type }).select().single();
  if (error) throw _productError(error, name);
  _dbOk(await supabaseClient.from('product_checklist_items').insert(
    CASE_CHECKLIST.map(item => ({ product_id: p.id, key: item.key, label: item.label }))));
  await loadProducts();
}

async function dbUpdateProduct(id, { name, type }) {
  const { error } = await supabaseClient.from('products').update({ name, type }).eq('id', id);
  if (error) throw _productError(error, name);
  await loadProducts();
}

// Refused by the database while the product has open cases.
async function dbDeleteProduct(id) {
  _dbOk(await supabaseClient.from('products').delete().eq('id', id));
  await loadProducts();
}

async function dbCountOpenCases(productId) {
  const { count, error } = await supabaseClient.from('cases').select('id', { count: 'exact', head: true })
    .eq('product_id', productId).in('stage', ['opened', 'submitted']);
  if (error) throw error;
  return count || 0;
}

// A product's checklist items. Each new one gets a key of its own, which
// ticks on cases are stored under.
async function dbAddChecklistItem(productId, label) {
  _dbOk(await supabaseClient.from('product_checklist_items')
    .insert({ product_id: productId, label, key: `c${crypto.randomUUID().slice(0, 8)}` }));
  await loadProducts();
}

async function dbRenameChecklistItem(id, label) {
  _dbOk(await supabaseClient.from('product_checklist_items').update({ label }).eq('id', id));
  await loadProducts();
}

async function dbRemoveChecklistItem(id) {
  _dbOk(await supabaseClient.from('product_checklist_items').delete().eq('id', id));
  await loadProducts();
}

// Alphabetical, like every list in the app — the dropdown's order too.
function getProducts() {
  return _products;
}

function getProduct(id) {
  return _products.find(p => p.id === id) || null;
}

// A case's checklist: its product's as it is now. (Only open cases show
// one — a closed case keeps just its product, premiums and PCRs.)
// [{key, label}]
function caseChecklistItems(c) {
  return getProduct(c.productId)?.checklist || _alphabetical(CASE_CHECKLIST);
}

function caseChecklistDone(c) {
  return caseChecklistItems(c).filter(item => c.checklist?.[item.key]).length;
}

// ---------- reads ----------

function caseItem(c) {
  return {
    id: c.id,
    type: c.case_type,          // the product's name
    productId: c.product_id,
    productType: c.product_type,
    finalPcr: c.final_pcr == null ? null : Number(c.final_pcr), // set when accepted
    stage: c.stage,
    openedAt: c.opened_at,
    submittedAt: c.submitted_at,
    acceptedAt: c.accepted_at,
    lumpSum: c.lump_sum,
    monthly: c.monthly,
    adviceFeePercent: c.advice_fee_percent,
    checklist: c.checklist || {},
  };
}

function _cardFromRows(client, activities, cases) {
  return {
    id: client.id,
    tab: client.tab,
    firstName: client.first_name,
    lastName: client.last_name,
    createdAt: client.created_at,
    timeline: activities.map(activityItem).sort(byTimelineOrder),
    cases: cases.map(caseItem).sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
  };
}

async function _loadMyCards() {
  const faId = _faId();
  const [clients, activities, cases] = await Promise.all([
    _fetchAll(() => supabaseClient.from('clients').select('*').eq('fa_id', faId).order('created_at')),
    _fetchAll(() => supabaseClient.from('activities').select('id, client_id, case_id, type, date, details, created_at')
      .eq('fa_id', faId).not('client_id', 'is', null).order('date')),
    _fetchAll(() => supabaseClient.from('cases').select('*').eq('fa_id', faId).order('opened_at')),
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
// In test mode the Test Book's own figures are asked for too (they're
// left out otherwise) — they feed the hero, not the leaderboard.
async function _loadLeaderboard(days, checkoutDay) {
  return _dbOk(await supabaseClient.rpc('leaderboard', {
    p_dates: [...days],
    p_checkout_date: checkoutDay,
    p_include: getAppMode() === 'test' ? _testBook?.id || null : null,
  }));
}

// Admin view only: every FA's cases (RLS's is_admin() allows it), with
// their client's name and tab, and every active FA's target.
async function _loadTeamCases() {
  const rows = await _fetchAll(() => supabaseClient.from('cases')
    .select('*, clients(first_name, last_name, tab)')
    .order('opened_at'));
  return rows.map(c => ({
    ...caseItem(c),
    faId: c.fa_id,
    clientName: c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : '',
    tab: c.clients?.tab || '',
  }));
}

async function _loadTeamTargets() {
  return _dbOk(await supabaseClient.from('users').select('id, pcr_target').eq('is_active', true));
}

// ---------- writes ----------

// tab: where they start — 'prospects' (the default) or 'clients'.
async function dbCreateClient({ firstName, lastName, email, phone, tab }) {
  const row = _dbOk(await supabaseClient.from('clients').insert({
    fa_id: _faId(),
    first_name: firstName,
    last_name: lastName,
    email: email || null,
    phone: phone || null,
    tab: tab || 'prospects',
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

// Opens a case: the case and its "opened" timeline entry, together.
// fields: {productId, lumpSum, monthly, adviceFeePercent}; any amount left
// blank counts as 0. Returns {case, activity} as card items.
async function dbOpenCase(clientId, fields, date) {
  const amount = x => (x === '' || x == null || !isFinite(Number(x)) ? 0 : Number(x));
  const r = _dbOk(await supabaseClient.rpc('open_case', {
    p_client_id: clientId,
    p_product_id: fields.productId,
    p_lump_sum: amount(fields.lumpSum),
    p_monthly: amount(fields.monthly),
    p_advice_fee_percent: amount(fields.adviceFeePercent),
    p_date: date,
  }));
  return { case: caseItem(r.case), activity: activityItem(r.activity) };
}

// Moves a case to its next stage ('submitted', 'accepted' or
// 'not-taken-up') and adds that to the timeline. finalPcr: accepting
// only — the PCR it was accepted at. Returns {case, activity}.
async function dbSetCaseStage(caseId, stage, date, finalPcr = null) {
  const r = _dbOk(await supabaseClient.rpc('set_case_stage', {
    p_case_id: caseId, p_stage: stage, p_date: date, p_final_pcr: finalPcr,
  }));
  return { case: caseItem(r.case), activity: activityItem(r.activity) };
}

// Changes an open case's amounts and adds the "Amended" timeline entry
// (before → after), together. Refused by the database once it's closed.
// Returns {case, activity} as card items.
async function dbAmendCase(caseId, { lumpSum, monthly, adviceFeePercent }, date) {
  const r = _dbOk(await supabaseClient.rpc('amend_case', {
    p_case_id: caseId,
    p_lump_sum: lumpSum,
    p_monthly: monthly,
    p_advice_fee_percent: adviceFeePercent,
    p_date: date,
  }));
  return { case: caseItem(r.case), activity: activityItem(r.activity) };
}

async function dbSetCaseChecklist(caseId, checklist) {
  _dbOk(await supabaseClient.from('cases').update({ checklist }).eq('id', caseId));
}

// Deleting a case also deletes its timeline entries (they cascade).
async function dbDeleteCase(id) {
  _dbOk(await supabaseClient.from('cases').delete().eq('id', id));
}

// ---------- FA list (admins: team.js) ----------

// Everyone (admins read every users row): the FA list filters to the
// admin's own (manager_id), the Open and Submitted tabs show the team.
async function dbLoadFas() {
  return _dbOk(await supabaseClient.from('users')
    .select('id, name, surname, email, branch, pcr_target, is_active, password_set, manager_id, is_admin'));
}

// Those FAs' open cases, with the client's name.
async function dbLoadOpenCasesFor(faIds) {
  if (!faIds.length) return [];
  const rows = await _fetchAll(() => supabaseClient.from('cases')
    .select('*, clients(first_name, last_name)')
    .in('fa_id', faIds).in('stage', ['opened', 'submitted'])
    .order('opened_at'));
  return rows.map(c => ({
    ...caseItem(c),
    faId: c.fa_id,
    clientId: c.client_id,
    clientName: c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : '',
  }));
}

// fields: {name, surname, pcrTarget (number or null), active}.
async function dbUpdateFa(faId, { name, surname, pcrTarget, active }) {
  return _dbOk(await supabaseClient.rpc('update_fa', {
    p_fa: faId, p_name: name, p_surname: surname, p_pcr_target: pcrTarget, p_active: active,
  }));
}

// A new FA on the signed-in admin's list, with a login (the add-fa Edge
// Function). fields: {name, surname, email, phone, pcrTarget}. Returns
// {user, tempPassword}.
async function dbAddFa(fields) {
  const { data, error } = await supabaseClient.functions.invoke('add-fa', { body: fields });
  if (error) {
    // The function's own message ("There's already a login…") is in the
    // response body.
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || error.message);
  }
  return data;
}

// rows: [{client_id, type, date, details}] — fa_id filled in here.
async function dbInsertActivities(rows) {
  if (!rows.length) return;
  const faId = _faId();
  _dbOk(await supabaseClient.from('activities').insert(rows.map(r => ({ ...r, fa_id: faId }))));
}

// Marks a day reviewed (stored as a `checkout` activity — at most one per
// FA per day). noActivity: nothing at all was logged that day. Doing the
// Review again for the same day updates it.
async function dbMarkReviewed(date, noActivity) {
  const details = { noActivity: !!noActivity };
  const { error } = await supabaseClient.from('activities').insert({ fa_id: _faId(), type: 'checkout', date, details });
  if (!error) return;
  if (error.code !== '23505') throw error;
  _dbOk(await supabaseClient.from('activities').update({ details })
    .eq('fa_id', _faId()).eq('type', 'checkout').eq('date', date));
}

// Prospects contacted on a day: {channel: count} (PROSPECT_CHANNELS).
async function dbLoadProspectCounts(date) {
  const rows = _dbOk(await supabaseClient.from('activities').select('details')
    .eq('fa_id', _faId()).eq('type', 'prospect_contact').eq('date', date));
  const counts = {};
  rows.forEach(r => { counts[r.details.channel] = (counts[r.details.channel] || 0) + (Number(r.details.count) || 0); });
  return counts;
}

// Replaces a day's prospect counts with these: one row per channel > 0.
async function dbReplaceProspectCounts(date, counts) {
  _dbOk(await supabaseClient.from('activities').delete()
    .eq('fa_id', _faId()).eq('type', 'prospect_contact').eq('date', date));
  await dbInsertActivities(Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([channel, count]) => ({ client_id: null, type: 'prospect_contact', date, details: { channel, count } })));
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

// Every day of a business month up to today: "month to date". None if
// there's no month (the Calendar has none set up).
function _periodDays(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = new Set();
  if (!period) return days;
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
  // Accepted PCR: final PCRs as set on accepting, plus the PCR worked out
  // from the premiums of cases accepted before there was one.
  const pcrOf = c => (Number(c.acceptedFinalPcr) || 0)
    + casePcr({ productType: c.productType, lumpSum: c.acceptedLumpSum, monthly: c.acceptedMonthly });
  const submittedPcrOf = c => casePcr({ productType: c.productType, lumpSum: c.submittedLumpSum, monthly: c.submittedMonthly });
  const isRisk = c => caseIsRisk(c.productType);
  const notRisk = c => !caseIsRisk(c.productType);
  const isYou = currentUser && row.id === currentUser.id;
  return {
    id: row.id,
    name: isYou ? `${row.name} (you)` : row.name,
    plainName: row.name,
    checkedOut: row.checkedOut,
    noActivity: !!row.noActivity,
    prospects: row.prospects || 0,
    referrals: row.referrals || 0,
    willsLeads: row.willsLeads || 0,
    meetings: (m.factFinder || 0) + (m.closing || 0) + (m.relational || 0),
    meetingsBreakdown: { factFinder: m.factFinder || 0, closing: m.closing || 0, relational: m.relational || 0 },
    fnas: row.fnas || 0,
    quotes: row.quotes || 0,
    cases: sum(() => true, c => c.submitted),
    casesBreakdown: { risk: sum(isRisk, c => c.submitted), investments: sum(notRisk, c => c.submitted) },
    submittedPcr: Math.round(sum(() => true, submittedPcrOf)),
    submittedPcrBreakdown: { risk: Math.round(sum(isRisk, submittedPcrOf)), investments: Math.round(sum(notRisk, submittedPcrOf)) },
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
    fnas: add('fnas'), quotes: add('quotes'), cases: add('cases'), submittedPcr: add('submittedPcr'), pcr: add('pcr'),
  };
}

// The signed-in FA's own cases, in the shape caseStats() takes.
function _myCases() {
  return getClientRecords().flatMap(r => {
    const d = getClientData(r.id);
    return (d.cases || []).map(c => ({ ...c, tab: r.tab }));
  });
}

// ---------- admin view ----------
//
// Home, with the whole team's figures: the funnel and monthly stats add
// up every FA's, and in place of the PCR meter, the week rings
// (week-rings.js) — the PCR submitted each week of the month on the
// month bar against its weekly submission target (the Calendar). Month
// to date by default; days picked on the month bar narrow the dated
// figures to just those days (not the rings — always the whole month). Clicking a name on the leaderboard opens
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
  const open = (_dash?.teamCases || []).filter(c => c.faId === rep.id && isOpenCase(c) && c.tab === 'business');
  if (!open.length) return '<div class="lb-detail-empty">No open cases.</div>';
  return `
    <div class="lb-detail-title">Open Cases tab · ${open.length} open case${open.length === 1 ? '' : 's'}</div>
    ${open.map(c => `
      <div class="lb-detail-row">
        <span class="lb-detail-client">${_escHtml(c.clientName)}</span>
        <span class="lb-detail-type">${_escHtml(c.type)}</span>
        <span class="lb-detail-status">${CASE_STAGE_LABELS[c.stage]} · checklist ${caseChecklistDone(c)}/${caseChecklistItems(c).length}</span>
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
    const me = _actingFa();
    rep = d.reps.find(r => r.id === me.id) || _repFromLeaderboardRow({ id: me.id, name: '' });
    cases = _myCases();
    target = me.pcr_target || null;
  } else if (_adminFocusId) {
    rep = d.reps.find(r => r.id === _adminFocusId) || _teamRep([]);
    cases = d.teamCases.filter(c => c.faId === _adminFocusId);
    target = d.targets.find(t => t.id === _adminFocusId)?.pcr_target || null;
  } else {
    rep = _teamRep(d.reps);
    cases = d.teamCases;
    target = null; // the team's is the week rings
  }

  _widgets.funnel?.update({
    prospectsContacted: rep.prospects,
    meetings: rep.meetingsBreakdown,
    fnas: rep.fnas,
    quotes: rep.quotes,
    casesSubmitted: rep.cases,
  });
  // An FA's meter (their own, or one picked on the leaderboard): accepted
  // PCR against Validation and High Flyer (3x). The team: the week rings
  // instead.
  const teamView = d.admin && !_adminFocusId;
  const period = getMonthBarPeriod() || _currentPeriod();
  if (_widgets.pcrMeter) _widgets.pcrMeter.container.hidden = teamView;
  _widgets.weekRings?.show(teamView);
  if (teamView) {
    _widgets.weekRings?.update(_weekRingsFor(period, cases));
  } else {
    _widgets.pcrMeter?.update({ currentCount: rep.pcr, validationTarget: target, highFlyerTarget: target ? target * 3 : null, stageNote: null, showValue: false });
    _widgets.pcrMeter?.setPeriodLabel(dashboardLabel(period));
  }
  _widgets.monthlyStats?.update({
    ...caseStats(cases, d.days),
    willsLeads: rep.willsLeads,
    referrals: rep.referrals,
    admin: d.admin,
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
    // The Test Book's row only came back for the hero — never rank it.
    _widgets.leaderboard?.setReps(d.reps.filter(r => !_testBook || r.id !== _testBook.id));
  }
}

// The week rings for a month (week-rings.js): each week so far — every
// week of a past month, none of a future one — with the PCR submitted in
// it across these cases, against the month's weekly target.
function _weekRingsFor(period, cases) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = period?.weeklyTarget || null;
  const weeks = periodWeeks(period).filter(w => w.start <= today).map(w => {
    const from = isoDate(w.start);
    const to = isoDate(w.end);
    const pcr = Math.round(cases
      .filter(c => c.submittedAt && c.submittedAt >= from && c.submittedAt <= to)
      .reduce((t, c) => t + casePcr(c), 0));
    const current = today >= w.start && today <= w.end;
    const state = !target ? 'none' : pcr >= target ? 'met' : current ? 'current' : 'missed';
    return { week: w.week, pcr, state, current };
  });
  const thisWeek = weeks.find(w => w.current);
  let centre;
  if (thisWeek) {
    centre = {
      value: formatNumber(thisWeek.pcr),
      of: target ? `of ${formatNumber(target)}` : 'No target set',
      note: `Week ${thisWeek.week} · submitted`,
    };
  } else if (weeks.length) {
    const total = weeks.reduce((t, w) => t + w.pcr, 0);
    centre = {
      value: formatNumber(total),
      of: target ? `of ${formatNumber(target * weeks.length)}` : 'No target set',
      note: 'submitted in the month',
    };
  } else {
    centre = { value: '0', of: target ? `${formatNumber(target)} a week` : 'No target set', note: 'Not started yet' };
  }
  return { weeks, target, centre, periodLabel: period?.label || '' };
}

// Funnel, PCR meter, monthly stats, leaderboard and the month bar's
// checked-out days — everything on the dashboard that isn't a card.
async function refreshDashboard() {
  if (!currentUser) return;
  const run = ++_refreshRun;
  const admin = _isAdminView();
  const days = admin && _adminDays.size ? new Set(_adminDays)
    : _periodDays(admin ? (getMonthBarPeriod() || _currentPeriod()) : _currentPeriod());
  // The ✓ / ✗ on the leaderboard is always the previous weekday's
  // checkout, whatever days are picked.
  const checkoutDay = admin ? _lastWeekday() : null;

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
  syncReviewTrigger();
}

// ---------- required Review ----------
//
// An FA can't use the app until the last weekday is reviewed: if it
// isn't, its Review opens and can't be closed until it's done
// (review.js). Checked on sign-in, on switching back to My book, and
// whenever the app is used again after midnight — never in Admin or Test
// mode, and never for a day before the person was added to the app.
function enforceReview() {
  if (!currentUser || getAppMode() !== 'fa') return;
  const day = reviewDay();
  const joined = (currentUser.created_at || '').slice(0, 10);
  if (joined && day < joined) return;
  if (COMPLETED_CHECKOUT_DATES.has(day)) return;
  if (isReviewOpen()) return;
  openReview(day, { required: true });
}

// The day under review: the last weekday before today.
function reviewDay() {
  return _lastWeekday();
}

// "From 00:00, the next time the app is used": coming back to the tab or
// window, or a minute ticking past midnight while it's open.
let _watchedDay = _todayIso();
function _onAppUsed() {
  if (!currentUser) return;
  const today = _todayIso();
  if (today === _watchedDay) return enforceReview();
  _watchedDay = today;
  refreshDashboard().then(enforceReview).catch(showSaveError);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) _onAppUsed(); });
window.addEventListener('focus', _onAppUsed);
setInterval(_onAppUsed, 60 * 1000);

// Switching mode: start the admin view fresh (month to date, the whole
// team), turn the month bar's day-picking on or off, and reload — the
// cards too when the book changes (into or out of the Test Book).
document.addEventListener('appmodechange', async e => {
  const mode = e.detail.mode;
  if (mode === _lastMode) return;
  // A real flip of the toggle, not the first mode set on sign-in — then,
  // the cards aren't loaded yet and the sign-in handler loads them and
  // enforces the checkout.
  const switched = _lastMode !== null;
  const bookChanged = (_lastMode === 'test') !== (mode === 'test');
  _lastMode = mode;
  _adminDays.clear();
  _adminFocusId = null;
  setMonthBarSelection(mode === 'admin' ? _adminSelection : null);
  // Each mode has its own tabs (Admin: Home, Open and Submitted cases, and a menu), so start
  // on Home.
  showTab('dashboard');
  if (!currentUser || !switched) return;
  try {
    if (bookChanged) {
      if (mode === 'test' && !await _ensureTestBook()) return;
      await loadAppData();
    } else {
      await refreshDashboard();
    }
    enforceReview();
  } catch (err) {
    showSaveError(err);
  }
});

// Test mode needs the Test Book; without one (not set up yet — see
// supabase/test-mode.sql), fall back to My book.
async function _ensureTestBook() {
  if (_testBook || await _loadTestBook()) return true;
  alert("There's no Test Book set up yet. Ask for supabase/test-mode.sql to be run — switching back to My book.");
  setAppMode('fa');
  return false;
}

// The cards in every tab, then the dashboard. Called on sign-in and after
// anything that writes more than one card's worth (e.g. a checkout).
async function loadAppData() {
  if (getAppMode() === 'test' && !await _ensureTestBook()) return;
  await Promise.all([loadMonths(), loadProducts()]);
  const cards = await _loadMyCards();
  CLIENT_STORE.clear();
  Object.keys(CLIENT_TAB_LABELS).forEach(tab => {
    renderClientCards(`${tab}-cards`, cards.filter(c => c.tab === tab));
  });
  await refreshDashboard();
}

function clearAppData() {
  _dash = null;
  _months = [];
  CLOSE_OFF_DATES = [];
  reloadMonthBar();
  _syncNoMonthStrip();
  _products = [];
  document.dispatchEvent(new CustomEvent('products:changed'));
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
    enforceReview();
  } catch (err) {
    console.error(err);
    alert(`Couldn't load your clients — ${err.message || err}. Try refreshing the page.`);
  }
});
