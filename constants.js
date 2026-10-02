// Close-off dates define what constitutes a "month" in Cadence.
// A production month runs from the day after the previous close-off date
// up to and including its own close-off date (see month_periods in SPEC.md).
// `weeks` is the length of that production month (4 or 5 weeks).
const CLOSE_OFF_DATES = [
  { month: 'December',  year: 2025, closeOffDate: '2026-01-09', weeks: 5 },
  { month: 'January',   year: 2026, closeOffDate: '2026-02-06', weeks: 4 },
  { month: 'February',  year: 2026, closeOffDate: '2026-03-06', weeks: 4 },
  { month: 'March',     year: 2026, closeOffDate: '2026-04-10', weeks: 5 },
  { month: 'April',     year: 2026, closeOffDate: '2026-05-08', weeks: 4 },
  { month: 'May',       year: 2026, closeOffDate: '2026-06-05', weeks: 4 },
  { month: 'June',      year: 2026, closeOffDate: '2026-07-03', weeks: 4 },
  { month: 'July',      year: 2026, closeOffDate: '2026-08-07', weeks: 5 },
  { month: 'August',    year: 2026, closeOffDate: '2026-09-04', weeks: 4 },
  { month: 'September', year: 2026, closeOffDate: '2026-10-02', weeks: 4 },
  { month: 'October',   year: 2026, closeOffDate: '2026-11-06', weeks: 5 },
  { month: 'November',  year: 2026, closeOffDate: '2026-12-04', weeks: 4 },
  { month: 'December',  year: 2026, closeOffDate: '2027-01-08', weeks: 5 },
  { month: 'January',   year: 2027, closeOffDate: '2027-02-05', weeks: 4 },
];

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

// Case stages: opened → submitted → accepted, or not taken up (from
// opened or submitted). A case is open while opened or submitted. See
// open_case / set_case_stage in supabase/schema.sql.
const CASE_STAGE_LABELS = {
  opened: 'Opened',
  submitted: 'Submitted',
  accepted: 'Accepted',
  'not-taken-up': 'Not taken up',
};

function isOpenCase(c) {
  return c.stage === 'opened' || c.stage === 'submitted';
}

// The standard case pack: what every product starts with (dbAddProduct
// in data.js). A case's own case pack comes from its product, or for a
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
const CONTACT_METHODS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'message', label: 'WhatsApp / SMS' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'inPerson', label: 'In person' },
];
const CONTACT_OUTCOMES = ['Spoke to client', 'No answer', 'Left message', 'Sent'];

// Team PCR target (admin view's PCR meter): a fixed Validation target for
// the whole team. High Flyer is still 3x this, as for an individual
// (pcr-meter.js).
const TEAM_PCR_TARGET = 10000000;
