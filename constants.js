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

// Liberty RA: upfront commission is an advice fee % of the lump sum (set
// per case — same shape as the advice-fee default below), plus an ongoing
// advice fee on the growing annuity value. PCR = annual premium x
// CC_LIBERTY_RA_PCR_MULTIPLIER.
const CC_LIBERTY_RA_PCR_MULTIPLIER = 5;

// Case commission (checkout / dashboard): maps the app's real 22-item case
// type list onto whichever of the rates above applies. Only Risk and RA
// Builder have a fixed multiplier; RA Liberty has no entry here because its
// upfront rule is just the advice-fee default. Educator has no lump sum
// (see CHECKOUT_MONTHLY_ONLY_CASE_TYPES in checkout.js) so it can't use the
// advice-fee rule either — mapped to the same rule as Risk as a best guess,
// unconfirmed. Everything else (the various Investment/INN8/Stanlib/TFSA/
// UT/Sec 14/... names, and RA Liberty) falls back to "advice fee % x lump
// sum", with the FA setting that fee when logging the case.
const CASE_COMMISSION_RULE = {
  Risk: 'risk',
  'RA Builder': 'ra-builder',
  Educator: 'risk',
};

function caseCommissionRule(caseType) {
  return CASE_COMMISSION_RULE[caseType] || 'advice-fee';
}

// Whether this case type takes an advice fee % (vs. a fixed premium
// multiple, or no upfront commission at all).
function caseUsesAdviceFee(caseType) {
  return caseCommissionRule(caseType) === 'advice-fee';
}

// Upfront commission in rand for one case item: {type, lumpSum, monthly,
// adviceFeePercent}.
function caseUpfrontCommission(item) {
  switch (caseCommissionRule(item.type)) {
    case 'risk': return (Number(item.monthly) || 0) * CC_RISK_YEAR1_RATE;
    case 'ra-builder': return (Number(item.monthly) || 0) * CC_BUILDER_RA_COMMISSION_MULTIPLIER;
    case 'no-upfront': return 0;
    default: return (Number(item.lumpSum) || 0) * ((Number(item.adviceFeePercent) || 0) / 100);
  }
}
