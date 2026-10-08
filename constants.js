// Close-off dates define what constitutes a "month" in Cadence.
// A production month runs from the day after the previous close-off date
// up to and including its own close-off date (see month_periods in SPEC.md).
// Admins set them on the Calendar (☰ → Calendar, calendar.js); they load
// from the months table on sign-in (data.js loadMonths), oldest first —
// only months with a close-off date:
//   {month: 'October', year: 2026, monthStart: '2026-10-01',
//    closeOffDate: '2026-11-06', weeklyTarget: 2000000 | null}
// The first only marks where the next month starts.
let CLOSE_OFF_DATES = [];

// ---------------------------------------------------------------------------

// Commission rate constants — the Commission Calculator (upfront + PCR, run
// at proposal stage, before a case exists) and the checkout's case tracker
// (upfront only, run once a case has actually been logged) both read the
// SAME multipliers from here, so a rate can never drift between the two.

// Risk: year-1 commission is this many times the (tranche of) monthly
// premium; year-2 commission on that same tranche is this fraction of it.
// The calculator projects this many years out for its yearly breakdown.
// PCR = annual premium x CC_RISK_PCR_MULTIPLIER.
const CC_RISK_YEAR1_RATE = 10;
const CC_RISK_YEAR2_RATE = 1 / 3;
const CC_RISK_PROJECTION_YEARS = 10;
const CC_RISK_PCR_MULTIPLIER = 26.15;

// RA Builder: once-off commission is this many times the monthly premium.
const CC_BUILDER_RA_COMMISSION_MULTIPLIER = 4;

// Liberty RA (Commission Calculator only): upfront commission is an
// advice fee % of the lump sum, plus an ongoing advice fee on the growing
// annuity value. PCR = annual premium x CC_LIBERTY_RA_PCR_MULTIPLIER. A
// logged RA Liberty case is an Investment (PRODUCT_TYPES below).
const CC_LIBERTY_RA_PCR_MULTIPLIER = 5;

// Product types: the hard-coded part of a product (products.type in
// supabase/schema.sql). Admins add and rename products on the Products
// tab; each one is one of these three, which decides what its cases
// record and how their commission and PCR are worked out:
//   risk         monthly premium only; commission CC_RISK_YEAR1_RATE x
//                monthly; PCR annual premium x CC_RISK_PCR_MULTIPLIER
//   ra-builder   lump sum, monthly, advice fee; commission
//                CC_BUILDER_RA_COMMISSION_MULTIPLIER x monthly; PCR annual
//                premium x CASE_PCR_BUILDER_RA_TERM (the calculator's
//                default commission term)
//   investment   lump sum, monthly, advice fee; commission advice fee % x
//                lump sum (the FA sets the fee when logging the case);
//                PCR the lump sum, 1:1
// PCR is ASSUMED, not yet confirmed. The dashboard counts it on cases
// accepted this business month.
const PRODUCT_TYPES = [
  { key: 'risk', label: 'Risk' },
  { key: 'ra-builder', label: 'RA Builder' },
  { key: 'investment', label: 'Investment' },
];
const PRODUCT_TYPE_LABELS = Object.fromEntries(PRODUCT_TYPES.map(t => [t.key, t.label]));
const CASE_PCR_BUILDER_RA_TERM = 15;

// Risk cases record the monthly premium only — no lump sum or advice fee.
function productIsPremiumOnly(productType) {
  return productType === 'risk';
}

// Upfront commission in rand for one case item: {productType, lumpSum,
// monthly, adviceFeePercent}.
function caseUpfrontCommission(item) {
  const monthly = Number(item.monthly) || 0;
  switch (item.productType) {
    case 'risk': return monthly * CC_RISK_YEAR1_RATE;
    case 'ra-builder': return monthly * CC_BUILDER_RA_COMMISSION_MULTIPLIER;
    default: return (Number(item.lumpSum) || 0) * ((Number(item.adviceFeePercent) || 0) / 100);
  }
}

// PCR for one case (or a sum of same-type cases): {productType, lumpSum,
// monthly}. Linear in lumpSum/monthly, so it works on the leaderboard's
// per-type sums too.
function casePcr(item) {
  const annual = (Number(item.monthly) || 0) * 12;
  switch (item.productType) {
    case 'risk': return annual * CC_RISK_PCR_MULTIPLIER;
    case 'ra-builder': return annual * CASE_PCR_BUILDER_RA_TERM;
    default: return Number(item.lumpSum) || 0;
  }
}

// The PCR a case counts once accepted: the final PCR the manager set on
// accepting it, or (accepted before there was one) the PCR worked out
// from its premiums.
function caseAcceptedPcr(c) {
  return c.finalPcr != null ? Number(c.finalPcr) : casePcr(c);
}

// Leaderboard/PCR split: Risk products vs everything else.
function caseIsRisk(productType) {
  return productType === 'risk';
}

// Meeting types, as on the leaderboard's meetings breakdown.
const MEETING_TYPES = [
  { key: 'factFinder', label: 'Fact Finder' },
  { key: 'relational', label: 'Relational' },
  { key: 'closing', label: 'Closing' },
];

// How prospects (people not yet in the app) were reached — the Review's
// "Prospects contacted" counts. The total is the sum.
const PROSPECT_CHANNELS = [
  { key: 'phoned', label: 'Phoned' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'messaged', label: 'WhatsApp / SMS' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'other', label: 'Other' },
];

// Case stages — the same for every case and product: opened → submitted
// → accepted, or not taken up (from opened or submitted). Accepted is the
// FA's manager's alone (the Submitted tab); not taken up the FA's. A case
// is open while opened or submitted. See open_case / set_case_stage in
// supabase/schema.sql.
const CASE_STAGE_LABELS = {
  opened: 'Opened',
  submitted: 'Submitted',
  accepted: 'Accepted',
  'not-taken-up': 'Not taken up',
};

function isOpenCase(c) {
  return c.stage === 'opened' || c.stage === 'submitted';
}

// The standard checklist: what every product starts with (dbAddProduct
// in data.js). A case's own checklist comes from its product, or for a
// closed case, from what was saved when it closed — see
// caseChecklistItems in data.js. Ticks are stored on the case as
// {key: true}.
const CASE_CHECKLIST = [
  { key: 'id', label: 'ID' },
  { key: 'residenceProof', label: 'Proof of residence' },
  { key: 'bankProof', label: 'Proof of bank account' },
  { key: 'faisLetter', label: 'Signed FAIS intro letter' },
  { key: 'applicationForm', label: 'Signed application form' },
  { key: 'quote', label: 'Signed quote' },
  { key: 'riskProfile', label: 'Signed risk profile analyser' },
];

// Timeline contact entries: how the client was contacted (a fixed list)
// and what came of it — one of the standard outcomes, or the FA's own
// words.
// offered: in the "+" menu's Contact list. The others only label older
// entries.
const CONTACT_METHODS = [
  { key: 'phone', label: 'Phone call', offered: true },
  { key: 'email', label: 'Email', offered: true },
  { key: 'message', label: 'Text', offered: true },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'inPerson', label: 'In person' },
];
const CONTACT_OUTCOMES = ['Spoke to client', 'No answer', 'Left message', 'Sent'];

