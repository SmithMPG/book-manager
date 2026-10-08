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

// Product types and their rates — the one set of rules for cases and
// the Commission Calculator (commission-calculator.js), so the
// calculator always shows what a case will. Every case type (products —
// admins' Case types page) is one of these:
//
//   risk        records the monthly premium.
//               PCR = annual premium x RISK_PCR_MULTIPLIER
//               commission: year 1 = RISK_YEAR1_RATE x monthly,
//               year 2 = RISK_YEAR2_SHARE of year 1 (calculator)
//   ra-builder  records lump sum, monthly premium, advice fee %, term.
//               PCR = annual premium x term (capped at BUILDER_MAX_TERM;
//               no term = the cap) + the lump sum
//               commission = BUILDER_COMMISSION_RATE x monthly + advice
//               fee % of the lump sum
//   liberty-ra  records lump sum, monthly premium, advice fee %; the term
//               is always LIBERTY_TERM.
//               PCR = annual premium x LIBERTY_TERM + the lump sum
//               commission = advice fee % of the lump sum
//   investment  records lump sum, monthly premium, advice fee %.
//               PCR = the lump sum
//               commission = advice fee % of the lump sum
// PCR is ASSUMED, not yet confirmed. The dashboard counts it on cases
// accepted this business month (at their final PCR, caseAcceptedPcr).
const RISK_YEAR1_RATE = 10;
const RISK_YEAR2_SHARE = 1 / 3;
const RISK_PCR_MULTIPLIER = 26.15;
const BUILDER_COMMISSION_RATE = 4;
const BUILDER_MAX_TERM = 15;
const LIBERTY_TERM = 5;

const PRODUCT_TYPES = [
  { key: 'risk', label: 'Risk' },
  { key: 'ra-builder', label: 'RA Builder' },
  { key: 'liberty-ra', label: 'Liberty RA' },
  { key: 'investment', label: 'Investment' },
];
const PRODUCT_TYPE_LABELS = Object.fromEntries(PRODUCT_TYPES.map(t => [t.key, t.label]));

// Risk cases record the monthly premium only — no lump sum or advice fee.
function productIsPremiumOnly(productType) {
  return productType === 'risk';
}

// RA Builder cases also record a term (years).
function productHasTerm(productType) {
  return productType === 'ra-builder';
}

// The term a case's PCR goes by: RA Builder's own, capped (none: the
// cap); Liberty RA's is fixed.
function caseTerm(item) {
  if (item.productType === 'liberty-ra') return LIBERTY_TERM;
  const term = Number(item.term) || BUILDER_MAX_TERM;
  return Math.min(Math.max(term, 0), BUILDER_MAX_TERM);
}

function _adviceFee(item) {
  return (Number(item.lumpSum) || 0) * ((Number(item.adviceFeePercent) || 0) / 100);
}

// Upfront commission in rand (Risk: year 1): {productType, lumpSum,
// monthly, adviceFeePercent}.
function caseUpfrontCommission(item) {
  const monthly = Number(item.monthly) || 0;
  switch (item.productType) {
    case 'risk': return monthly * RISK_YEAR1_RATE;
    case 'ra-builder': return monthly * BUILDER_COMMISSION_RATE + _adviceFee(item);
    default: return _adviceFee(item); // liberty-ra, investment
  }
}

// Risk's year-2 commission.
function caseRiskYear2Commission(item) {
  return caseUpfrontCommission(item) * RISK_YEAR2_SHARE;
}

// PCR for one case (or a sum of same-type, same-term cases):
// {productType, lumpSum, monthly, term}. Linear in lumpSum/monthly, so it
// works on the leaderboard's sums too.
function casePcr(item) {
  const annual = (Number(item.monthly) || 0) * 12;
  switch (item.productType) {
    case 'risk': return annual * RISK_PCR_MULTIPLIER;
    case 'ra-builder':
    case 'liberty-ra': return annual * caseTerm(item) + (Number(item.lumpSum) || 0);
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

