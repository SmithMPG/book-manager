// Client detail: what's inside an open client card (see SPEC.md,
// "The client row and open card"). Two views:
//
// The client view, top to bottom:
//   Case cards  one per open case, stacked (caseCardHTML): product,
//               amounts, PCR, status (Opened / Submitted), ✎ for the
//               amounts, Opened ── Submitted ── Accepted with dates, its
//               checklist and next steps — Mark submitted, Not taken up,
//               Delete case. Only the FA's manager accepts a case, from
//               the Cases tab (pipeline.js).
//   Add form    opened from the row's "+" menu: the event on the left
//               (Contact, Note, Meeting, FNA, Quote, Case), its own
//               fields on the right. Dated today — or, for a card shown
//               inside the Review, the day being reviewed (entryDateFor).
//   Timeline    everything that's happened with the client, newest
//               first — one line each: date (Today / Yesterday) · kind ·
//               details — ending with "Client added". Case lines are
//               written by what happens to the case (opened, amended,
//               submitted, accepted, not taken up); their product is a
//               chip to the case view. When a day has more than one line
//               (and always for "Client added"), hovering the date shows
//               the time. Hovering a line shows its × (not case lines).
//
// The case view (showCaseView, from the row's chips): the client's cases
// in one group — Open, Submitted or Closed (accepted / not taken up —
// read-only) — each card with its own timeline lines. The row's chip for
// the group is highlighted; clicking it again, or the row, goes back.

// Saves go through data.js; the card is then updated in place and the
// dashboard numbers refreshed.
//
// Cases also decide the client's tab: the Business tab is for clients
// with an open case. Opening a case for a client anywhere else first asks
// to move them there (Move / Cancel — nothing is saved on Cancel). When
// a Business client's last open case closes, a popup asks which tab
// they move to next (syncTabAfterCaseChange).

function _injectCardItemsCSS() {
  if (document.getElementById('card-items-styles')) return;
  const s = document.createElement('style');
  s.id = 'card-items-styles';
  s.textContent = `
    /* ---- an open card's sections: Open cases, then Timeline ---- */
    .detail-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
      margin-bottom: 10px;
    }
    .detail-cases {
      padding-bottom: 22px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }
    .detail-cases .cc:last-child { margin-bottom: 0; }

    /* ---- case cards ---- */
    .cc {
      background: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      margin-bottom: 10px;
      transition: box-shadow 0.3s ease;
    }
    .cc.flash { box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.6); }
    .cc-head { display: flex; align-items: center; gap: 16px; padding: 10px 16px; cursor: pointer; }
    .cc-name { font-size: 14px; font-weight: 700; color: var(--ink); white-space: nowrap; }
    .cc-amounts { color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .cc-pcr { flex-shrink: 0; color: var(--ink); white-space: nowrap; }
    .cc-next { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .cc-body { display: none; }
    .cc.expanded .cc-body { display: block; }
    .cc-closed { font-size: 13px; color: var(--ink); }
    .cc-check-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); margin-bottom: 8px; }
    .cc-badge {
      flex-shrink: 0;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #e8e8e5;
      color: var(--ink-dim);
    }
    .cc-badge.opened { background: #e3ecfb; color: #2557b8; }
    .cc-badge.submitted { background: #fbf1d6; color: #8a6d0a; }
    .cc-badge.accepted { background: #dcf3e8; color: #1f7a52; }
    .cc-badge.not-taken-up { background: #f7dede; color: #a33a3a; }
    .cc-edit { background: none; border: none; padding: 0 2px; font-size: 14px; color: var(--ink-dim); cursor: pointer; }
    .cc-edit:hover { color: #8a6d0a; }

    /* Opened ── Submitted ── Accepted (or Not taken up), dated as reached. */
    .cc-crumbs { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--ink-dim); }
    .cc-step { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .cc-step::before { content: ''; width: 9px; height: 9px; border-radius: 50%; border: 2px solid #c4c7cc; box-sizing: border-box; }
    .cc-step.done { color: var(--ink); }
    .cc-step.done::before { background: var(--green); border-color: var(--green); }
    .cc-step.lost::before { background: var(--red); border-color: var(--red); }
    .cc-step b { font-weight: 600; }
    .cc-line { flex: 0 1 40px; height: 2px; background: #d9dce0; }

    .cc.expanded .cc-body { padding: 12px 16px 14px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
    .cc-history { margin-top: 10px; padding-top: 6px; border-top: 1px dashed rgba(0, 0, 0, 0.1); }
    .cc-history .tl-entry { padding: 4px 0; font-size: 12px; }

    .cv-empty { color: var(--ink-dim); font-size: 13px; padding: 8px 0 4px; }

    /* A case line's product, on the timeline: opens the case view. */
    .tl-case-chip {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 999px;
      padding: 1px 9px;
      margin-right: 6px;
      font-size: 12px;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .tl-case-chip:hover { border-color: var(--gold); }

    .cb-checklist { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px 16px; margin-bottom: 14px; }
    .cb-checklist .item-check { color: var(--ink); }
    .cb-actions { display: flex; align-items: center; gap: 10px; }
    .cb-btn {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink);
      cursor: pointer;
    }
    .cb-btn:hover { border-color: var(--gold); }
    .cb-btn.primary { background: var(--gold); border-color: var(--gold); color: var(--navy); }
    .cb-btn:disabled { opacity: 0.6; cursor: default; }
    .cb-link {
      background: none;
      border: none;
      padding: 4px;
      font-size: 12px;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .cb-link:hover { color: var(--ink); }
    .cb-link.danger { margin-left: auto; }
    .cb-link.danger:hover { color: var(--red); }
    .cb-waiting { font-size: 12px; color: var(--ink-dim); font-style: italic; }
    /* The add form lines up with the timeline: date, kind, then fields. */
    .item-add-form .tl-kind { font-weight: 700; }
    .item-number {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--ink);
    }
    .item-number input {
      box-sizing: border-box;
      width: 64px;
      height: 38px;
      padding: 0 10px;
      background: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .item-money.hidden { display: none; }

    .item-add-form {
      display: none;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 0 0 14px;
      margin-bottom: 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .item-add-form.open { display: flex; }
    .detail-empty + .item-add-form { border-top: none; margin-top: 0; }

    /* The date the item will be saved under (today), in the same column
       as the dates on the lines above. */
    .item-add-form .detail-date { margin-right: 10px; }

    /* Every box in the row is the same height. Selects drop the browser's
       own styling (which ignores height/padding on macOS) for a drawn
       chevron; number inputs drop their spinner arrows. */
    .item-add-form select,
    .item-money {
      box-sizing: border-box;
      height: 38px;
      background-color: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .item-add-form select {
      -webkit-appearance: none;
      appearance: none;
      min-width: 170px;
      padding: 0 32px 0 12px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      cursor: pointer;
    }
    .item-add-form .field-error { border-color: var(--red); }

    .item-money {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
    }
    .item-money span { font-weight: 600; font-size: 13px; }
    .item-money input {
      border: none;
      background: transparent;
      width: 96px;
      height: 100%;
      padding: 0;
      text-align: right;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      outline: none;
      -moz-appearance: textfield;
    }
    .item-money input::-webkit-outer-spin-button,
    .item-money input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    /* A case's amounts: lump sum and monthly the same width, advice fee
       and term the same smaller one, so they fit on one row. */
    .item-money[data-wrap="lumpSum"],
    .item-money[data-wrap="monthly"] { width: 150px; }
    .item-money[data-wrap="adviceFeePercent"],
    .item-money[data-wrap="term"] { width: 120px; }
    .item-money[data-wrap] input { flex: 1; width: 0; min-width: 0; }
    .item-money:focus-within { border-color: var(--gold); }
    .item-money.disabled { opacity: 0.45; }

    .item-check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--ink);
      cursor: pointer;
      user-select: none;
    }

    .item-form-actions { display: inline-flex; gap: 8px; margin-left: auto; }
    .item-save {
      background: var(--gold);
      color: var(--navy);
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .item-save:disabled { opacity: 0.6; cursor: default; }
    .item-cancel {
      background: none;
      border: none;
      color: var(--ink-dim);
      font-size: 12px;
      cursor: pointer;
      padding: 7px 6px;
    }
    .item-cancel:hover { color: var(--ink); }
    .item-form-error { flex-basis: 100%; font-size: 12px; color: var(--red); min-height: 0; }
    .item-form-error:empty { display: none; }

    .item-form-note { flex-basis: 100%; font-size: 12px; color: var(--ink-dim); }
    .item-form-note:empty { display: none; }
    .item-add-form input.item-text {
      box-sizing: border-box;
      height: 38px;
      flex: 1;
      min-width: 220px;
      padding: 0 12px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
    }
    .item-add-form input.item-text:focus { outline: none; border-color: var(--gold); }

    /* ---- timeline ---- */
    .tl-entry { display: flex; align-items: baseline; gap: 14px; padding: 7px 0; font-size: 13px; }
    .tl-entry + .tl-entry { border-top: 1px solid rgba(0, 0, 0, 0.05); }
    .tl-date { flex-shrink: 0; width: 96px; color: var(--ink-dim); }
    /* The time, on hover — drawn here rather than a native title tooltip,
       which takes seconds to appear. */
    .tl-date[data-time] { position: relative; text-decoration: underline dotted rgba(0, 0, 0, 0.25); text-underline-offset: 3px; }
    .tl-date[data-time]:hover::after {
      content: attr(data-time);
      position: absolute;
      left: 0;
      bottom: calc(100% + 4px);
      background: var(--navy);
      color: var(--text);
      font-size: 11px;
      font-weight: 600;
      padding: 3px 7px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 5;
    }
    .tl-kind { flex-shrink: 0; width: 92px; font-weight: 600; color: var(--ink); }
    .tl-entry.key .tl-kind { color: #8a6d0a; }
    .tl-text { flex: 1; min-width: 0; color: var(--ink); line-height: 1.45; }
    .tl-del {
      visibility: hidden;
      flex-shrink: 0;
      background: none;
      border: none;
      padding: 0 2px;
      font-size: 16px;
      line-height: 1;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .tl-entry:hover .tl-del { visibility: visible; }
    .tl-del:hover { color: var(--red); }
    .tl-edit { font-size: 13px; }
    .tl-edit:hover { color: #8a6d0a; }
  `;
  document.head.appendChild(s);
}
_injectCardItemsCSS();

// Every kind of timeline entry. key: the milestones (not the everyday
// contacts and notes), whose label is highlighted. Referrals and
// wills leads are recorded on meetings; the separate kinds remain for
// ones logged by the checkout.
const TIMELINE_KINDS = {
  contact: { label: 'Contact', key: false },
  note: { label: 'Note', key: false },
  meeting: { label: 'Meeting', key: true },
  fna: { label: 'FNA', key: true },
  quote: { label: 'Quote', key: true },
  wills_lead: { label: 'Wills lead', key: true },
  referral: { label: 'Referral', key: true },
  case: { label: 'Case', key: true },
};
// The row's "+" menu (client-card.js): each item is an entry to add, or
// a section with its own list (opening to the side). Everything in
// alphabetical order. Picking an option opens the add form
// with what it chose already set (preset: the form's fields), so the form
// only asks for the rest — a contact's outcome, a meeting's details, a
// case's amounts. formLabel: what the form calls it, when that isn't the
// option's own label (Note ▸ New / Same as last are both "Note"). Same
// as last fills the note in with the client's last update.
function addMenu() {
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  const items = [
    {
      label: 'Contact',
      options: CONTACT_METHODS.filter(m => m.offered)
        .map(m => ({ label: m.label, kind: 'contact', preset: { method: m.key } })),
    },
    {
      label: 'Note',
      options: [
        { label: 'New', kind: 'note', formLabel: 'Note' },
        { label: 'Same as last', kind: 'note', formLabel: 'Note', preset: { sameAsLast: true } },
      ],
    },
    {
      label: 'Meeting',
      options: MEETING_TYPES.map(t => ({ label: t.label, kind: 'meeting', preset: { meetingType: t.key } })),
    },
    {
      label: 'Activity',
      options: [
        { label: 'FNA', kind: 'fna' },
        { label: 'Quote', kind: 'quote' },
        { label: 'Wills lead submitted', kind: 'wills_lead' },
      ],
    },
    {
      label: 'Open a case',
      options: getProducts().map(p => ({ label: p.name, kind: 'case', preset: { productId: p.id } })),
    },
  ];
  items.forEach(it => it.options?.sort(byLabel));
  return items.sort(byLabel);
}

// The case view's groups (and the client row's chips): open (not yet
// submitted), submitted (waiting to be accepted), closed (accepted or
// not taken up).
const CASE_GROUPS = [
  { key: 'open', word: 'open', label: 'Open', has: c => c.stage === 'opened' },
  { key: 'submitted', word: 'submitted', label: 'Submitted', has: c => c.stage === 'submitted' },
  { key: 'closed', word: 'closed', label: 'Closed', has: c => !isOpenCase(c) },
];

function _caseGroupOf(c) {
  return CASE_GROUPS.find(g => g.has(c))?.key || 'open';
}

// Per-client view state that survives the card re-rendering: which open
// cards show the case view instead of the client view, on which group.
const _caseView = new Map();          // client id → a CASE_GROUPS key

// Switches an open card to the case view (filter: a CASE_GROUPS key),
// scrolled to caseId if given; filter null goes back to the client view.
function showCaseView(detail, clientId, filter, caseId) {
  if (filter) _caseView.set(clientId, filter); else _caseView.delete(clientId);
  if (caseId) _openCaseCards.add(caseId); // land on it opened up
  const data = getClientData(clientId);
  if (data) detail.innerHTML = clientDetailHTML(data);
  detail.previousElementSibling?.querySelectorAll('[data-case-chip]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.caseChip === filter);
  });
  const card = caseId && detail.querySelector(`.cc[data-case="${caseId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1200);
  }
}

// The group a card's case view is on, or null on the client view.
function caseViewOf(clientId) {
  return _caseView.get(clientId) || null;
}

// A collapsed card goes back to the client view next time it opens.
// True if it was on the case view (so it needs redrawing).
function resetCaseView(clientId) {
  return _caseView.delete(clientId);
}

function _findCase(data, caseId) {
  return (data.cases || []).find(c => c.id === caseId) || null;
}

// What an entry says: e.g. "Phone · No answer", "Fact Finder · Joint
// call", or a case line (below).
function timelineEntryText(data, entry) {
  if (entry.type === 'case') return _caseEntryText(_findCase(data, entry.caseId), entry.details);
  return entry.text;
}

// A case line: its type and stage, the amounts as they are now (opened
// line only — the later lines are about the stage), then its PCR and
// expected upfront commission:
// "Investment Builder · Opened · R500 000 lump sum · R2 000 pm · 3%
//  upfront advice fee · PCR 500 000 · Commission R15 000"
// An amended line says what changed, before → after (_amendedText).
// withoutType: leave the product's name off (it's shown as a chip).
function _caseEntryText(c, details, { withoutType = false } = {}) {
  const event = details.event;
  if (event === 'amended') return _amendedText(c, details, withoutType);
  if (!c) return `Case · ${CASE_STAGE_LABELS[event] || ''}`;
  const parts = [withoutType ? '' : c.type, CASE_STAGE_LABELS[event] || ''].filter(Boolean);
  if (event === 'opened') {
    if (c.lumpSum) parts.push(`${formatRand(c.lumpSum)} lump sum`);
    if (c.monthly) parts.push(`${formatRand(c.monthly)} pm`);
    if (c.adviceFeePercent) parts.push(`${c.adviceFeePercent}% upfront advice fee`);
  }
  if (event === 'accepted' && details.finalPcr != null) {
    parts.push(`Final PCR ${formatNumber(details.finalPcr)}`);
  } else {
    parts.push(`PCR ${formatNumber(casePcr(c))}`);
  }
  parts.push(`Commission ${formatRand(caseUpfrontCommission(c))}`);
  return parts.join(' · ');
}

// "Risk · Amended · R1 000 pm → R800 pm · PCR 313 800 → 251 040" — only
// the amounts that changed. from / to: {lumpSum, monthly,
// adviceFeePercent}, as saved by amend_case.
function _amendedText(c, { from = {}, to = {} }, withoutType = false) {
  const parts = [withoutType && c ? '' : c?.type || 'Case', 'Amended'].filter(Boolean);
  const changed = key => Number(from[key] || 0) !== Number(to[key] || 0);
  const rand = n => formatRand(Number(n) || 0);
  if (changed('lumpSum')) parts.push(`${rand(from.lumpSum)} → ${rand(to.lumpSum)} lump sum`);
  if (changed('monthly')) parts.push(`${rand(from.monthly)} → ${rand(to.monthly)} pm`);
  if (changed('adviceFeePercent')) parts.push(`${Number(from.adviceFeePercent) || 0}% → ${Number(to.adviceFeePercent) || 0}% advice fee`);
  if ((from.term ?? null) !== (to.term ?? null)) parts.push(`${from.term || '–'} → ${to.term || '–'} year term`);
  if (c) {
    const pcr = amounts => formatNumber(casePcr({ productType: c.productType, ...amounts }));
    parts.push(`PCR ${pcr(from)} → ${pcr(to)}`);
  }
  return parts.join(' · ');
}

// One line for the collapsed card row: the latest entry.
function latestTimelineSummary(data) {
  const e = (data.timeline || [])[0];
  if (!e) return '';
  const text = timelineEntryText(data, e);
  return e.type === 'contact' || e.type === 'note' || e.type === 'case' ? text
    : [TIMELINE_KINDS[e.type]?.label, text].filter(Boolean).join(' · ');
}

function _dayLabel(iso) {
  const today = _todayIso();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === today) return 'Today';
  if (iso === isoDate(y)) return 'Yesterday';
  return _formatStatusDate(iso);
}

// The time it was logged — only when that's the day it happened (an
// entry added in a later review has no meaningful time of day).
function _entryTime(entry) {
  if (!entry.createdAt) return '';
  const d = new Date(entry.createdAt);
  if (isoDate(d) !== entry.date) return '';
  return _timeOf(entry.createdAt);
}

// ---------- case cards ----------
//
// One card per case: product (opens the case view), amounts, PCR, its
// status badge and ✎ (amounts, while open); then where it's got to —
// Opened ── Submitted ── Accepted (or Not taken up), dated as reached —
// and its checklist:
//   Opened     the checklist to tick, Mark submitted, Not taken up,
//              Delete case
//   Submitted  the checklist folded ("Checklist 7/7 ▸"), waiting for the
//              manager to accept, Not taken up, Delete case
//   closed     read-only: the checklist folded, as it was when it closed
// In the case view each card also lists its own timeline lines.

function _shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${_STATUS_MONTHS[m - 1]}`;
}

// "R1 600 000 lump sum · R1 000 pm · 3% advice fee" — whatever it has.
function _caseAmountsText(c) {
  const parts = [];
  if (c.lumpSum) parts.push(`${formatRand(c.lumpSum)} lump sum`);
  if (c.monthly) parts.push(`${formatRand(c.monthly)} pm`);
  if (c.adviceFeePercent) parts.push(`${c.adviceFeePercent}% advice fee`);
  if (productHasTerm(c.productType) || c.productType === 'liberty-ra') parts.push(`${caseTerm(c)}-year term`);
  return parts.join(' · ');
}

// The day a case was marked not taken up (only on its timeline line).
function _notTakenUpDate(data, c) {
  return (data.timeline || []).find(e => e.caseId === c.id && e.details?.event === 'not-taken-up')?.date || null;
}

function _caseCrumbsHTML(data, c) {
  const step = (label, date, cls) => `<span class="cc-step ${cls}">${label}${date ? ` <b>${_shortDate(date)}</b>` : ''}</span>`;
  const line = '<span class="cc-line"></span>';
  const end = c.stage === 'not-taken-up'
    ? step(CASE_STAGE_LABELS['not-taken-up'], _notTakenUpDate(data, c), 'lost')
    : step(CASE_STAGE_LABELS.accepted, c.acceptedAt, c.acceptedAt ? 'done' : '');
  return `
    <div class="cc-crumbs">
      ${step(CASE_STAGE_LABELS.opened, c.openedAt, 'done')}${line}
      ${step(CASE_STAGE_LABELS.submitted, c.submittedAt, c.submittedAt ? 'done' : '')}${line}
      ${end}
    </div>
  `;
}

function _caseChecklistHTML(data, c, editable) {
  return `<div class="cb-checklist">${caseChecklistItems(c).map(item => `
    <label class="item-check">
      <input type="checkbox" data-action="check" data-client="${data.id}" data-case="${c.id}" data-item="${item.key}"${c.checklist?.[item.key] ? ' checked' : ''}${editable ? '' : ' disabled'}>
      ${_escHtml(item.label)}
    </label>
  `).join('')}</div>`;
}

// Opened up: while open, the checklist to tick and Delete case. Closed,
// just what it was closed with — its premiums and PCRs (the one worked
// out from the premiums, and the final PCR it was accepted at).
function _caseBodyHTML(data, c) {
  if (!isOpenCase(c)) {
    const figures = [_caseAmountsText(c), `PCR worked out ${formatNumber(casePcr(c))}`];
    if (c.finalPcr != null) figures.push(`Final PCR ${formatNumber(c.finalPcr)}`);
    return `<div class="cc-closed">${_escHtml(figures.filter(Boolean).join(' · '))}</div>`;
  }
  const done = caseChecklistDone(c);
  const total = caseChecklistItems(c).length;
  return `
    <div class="cc-check-title">Checklist ${done}/${total}</div>
    ${_caseChecklistHTML(data, c, true)}
    <div class="cb-actions"><button type="button" class="cb-link danger" data-action="delete-case" data-client="${data.id}" data-case="${c.id}">Delete case</button></div>
  `;
}

// The right end of the collapsed card: what can happen next.
//   Opened     Mark submitted · Not taken up
//   Submitted  Awaiting acceptance · Not taken up
//   closed     its badge: Accepted / Not taken up
function _caseNextHTML(data, c) {
  const stageBtn = (stage, label, primary) =>
    `<button type="button" class="cb-btn${primary ? ' primary' : ''}" data-action="stage" data-client="${data.id}" data-case="${c.id}" data-stage="${stage}">${label}</button>`;
  if (c.stage === 'opened') return stageBtn('submitted', 'Mark submitted', true) + stageBtn('not-taken-up', 'Not taken up');
  if (c.stage === 'submitted') {
    return `<span class="cc-badge submitted" title="Waiting for your manager to accept">Awaiting acceptance</span>${stageBtn('not-taken-up', 'Not taken up')}`;
  }
  return `<span class="cc-badge ${c.stage}">${CASE_STAGE_LABELS[c.stage]}</span>`;
}

// The case's own timeline lines, oldest first (the case view).
function _caseHistoryHTML(data, c) {
  const lines = (data.timeline || []).filter(e => e.caseId === c.id).slice().reverse();
  if (!lines.length) return '';
  return `<div class="cc-history">${lines.map(e => _timelineLineHTML({
    date: _dayLabel(e.date),
    kind: '',
    text: _escHtml(_caseEntryText(c, e.details, { withoutType: true })),
  })).join('')}</div>`;
}

// A case card, collapsed by default like a client card: product ·
// amounts · PCR · ✎ (while open), and what can happen next at the right
// end. Clicking it opens the breadcrumb (Opened ── Submitted ── Accepted,
// dated) and the checklist — plus, in the case view, its own timeline
// lines.
const _openCaseCards = new Set(); // case ids opened up; survives re-rendering

function caseCardHTML(data, c, inCaseView) {
  const expanded = _openCaseCards.has(c.id);
  const edit = isOpenCase(c)
    ? `<button type="button" class="cc-edit" data-action="edit-case" data-client="${data.id}" data-case="${c.id}" title="Change this case's amounts">&#9998;</button>`
    : '';
  return `
    <div class="cc${expanded ? ' expanded' : ''}" data-case="${c.id}">
      <div class="cc-head" data-action="toggle-case" data-case="${c.id}">
        <span class="cc-name">${_escHtml(c.type)}</span>
        <span class="cc-amounts">${_escHtml(_caseAmountsText(c))}</span>
        <span class="cc-pcr">${c.stage === 'accepted' ? `Final PCR ${formatNumber(caseAcceptedPcr(c))}` : `PCR ${formatNumber(casePcr(c))}`}</span>
        ${edit}
        <span class="cc-next">${_caseNextHTML(data, c)}</span>
      </div>
      <div class="cc-body">
        ${_caseCrumbsHTML(data, c)}
        ${_caseBodyHTML(data, c)}
        ${inCaseView ? _caseHistoryHTML(data, c) : ''}
      </div>
    </div>
  `;
}

// The client view: the open cases (opened or submitted), stacked. The
// row's chips open the case view.
// Under an "Open cases" heading, set apart from the timeline below; nothing
// when there are none.
function _openCasesHTML(data) {
  const open = (data.cases || []).filter(isOpenCase);
  if (!open.length) return '';
  return `
    <div class="detail-section detail-cases">
      <div class="detail-section-title">Open cases</div>
      ${open.map(c => caseCardHTML(data, c, false)).join('')}
    </div>
  `;
}

// The case view: the client's cases in one group — Open, Submitted or
// Closed — newest first. The row's chips switch group (the one showing is
// highlighted); clicking it again, or the row, goes back to the client
// view (client-card.js).
function _caseViewHTML(data, filter) {
  const cases = data.cases || [];
  const group = CASE_GROUPS.find(g => g.key === filter) || CASE_GROUPS[0];
  const latest = c => c.acceptedAt || c.submittedAt || c.openedAt;
  const shown = cases.filter(group.has).sort((a, b) => latest(b).localeCompare(latest(a)));
  return `
    <div class="cv">
      ${shown.length
        ? shown.map(c => caseCardHTML(data, c, true)).join('')
        : `<div class="cv-empty">No ${group.word} cases.</div>`}
    </div>
  `;
}

// The day an entry or stage change made from this element is recorded
// against: today, unless the card sits inside something that says
// otherwise with data-entry-date (the Review, for the day it reviews).
function entryDateFor(el) {
  return el?.closest('[data-entry-date]')?.dataset.entryDate || _todayIso();
}

// A client's last update — their latest contact or note — for Note ▸
// Same as last.
function lastUpdateOf(data) {
  return (data?.timeline || []).find(e => e.type === 'contact' || e.type === 'note') || null;
}

// ---------- timeline ----------

// The time it was logged, as HH:MM.
function _timeOf(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// time: shown as the date's tooltip, only when given.
function _timelineLineHTML({ date, time, kind, key, text, del }) {
  return `
    <div class="tl-entry${key ? ' key' : ''}">
      <span class="tl-date"${time ? ` data-time="${time}"` : ''}>${date}</span>
      <span class="tl-kind">${kind}</span>
      <span class="tl-text">${text}</span>
      ${del || ''}
    </div>
  `;
}

function _timelineHTML(data) {
  const createdDay = data.createdAt ? isoDate(new Date(data.createdAt)) : null;
  // Days with more than one line get the time on hover.
  const perDay = {};
  (data.timeline || []).forEach(e => { perDay[e.date] = (perDay[e.date] || 0) + 1; });
  if (createdDay) perDay[createdDay] = (perDay[createdDay] || 0) + 1;
  const busy = day => perDay[day] > 1;

  const lines = (data.timeline || []).map(e => {
    const kind = TIMELINE_KINDS[e.type] || { label: e.type };
    // Case lines are written by what happens to the case, so they're not
    // deleted here (a case goes with Delete case, on its card). Their
    // product is a chip to the case view.
    const del = e.type !== 'case'
      ? `<button type="button" class="tl-del" data-action="delete-entry" data-client="${data.id}" data-id="${e.id}" title="Delete">&times;</button>`
      : '';
    const c = e.type === 'case' ? _findCase(data, e.caseId) : null;
    const text = c
      ? `<button type="button" class="tl-case-chip" data-action="show-case" data-case="${c.id}" title="See this case">${_escHtml(c.type)}</button>${_escHtml(_caseEntryText(c, e.details, { withoutType: true }))}`
      : _escHtml(timelineEntryText(data, e));
    return _timelineLineHTML({
      date: _dayLabel(e.date),
      time: busy(e.date) ? _entryTime(e) : '',
      kind: kind.label,
      key: kind.key,
      text,
      del,
    });
  });
  if (createdDay) {
    lines.push(_timelineLineHTML({
      date: _dayLabel(createdDay),
      time: _timeOf(data.createdAt),
      kind: 'Client added',
      text: '',
    }));
  }
  return `<div class="tl">${lines.join('')}</div>`;
}

// Everything inside an open card: the client view (Open cases — the case
// cards — then Timeline: the add form and the timeline), or the case view.
function clientDetailHTML(data) {
  const filter = _caseView.get(data.id);
  if (filter) return _caseViewHTML(data, filter);
  return `
    ${_openCasesHTML(data)}
    <div class="detail-section">
      <div class="detail-section-title">Timeline</div>
      <div class="item-add-form" data-client="${data.id}"></div>
      ${_timelineHTML(data)}
    </div>
  `;
}

// From the row's "+" menu: the add form for one kind of entry, with what
// the menu chose (preset, label — addMenu) — back on the client view, if
// the card was showing its cases.
function openAddEntry(detail, kind, preset = {}, label = '') {
  const clientId = detail.id.replace('row-', '');
  if (_caseView.has(clientId)) showCaseView(detail, clientId, null);
  _openAddForm(detail.querySelector('.item-add-form'), kind, preset, label);
}

// ---------- adding an entry ----------

// last: the client's last update, filled in for Note ▸ Same as last.
// What the menu already chose (preset) goes in as hidden fields.
function _addFormFieldsHTML(kind, last = '', preset = {}) {
  const hidden = Object.entries(preset)
    .map(([k, v]) => `<input type="hidden" data-field="${k}" value="${_escHtml(v)}">`).join('');
  if (kind === 'contact') {
    return `
      ${hidden}
      ${statusInputHTML({ options: CONTACT_OUTCOMES, attrs: 'data-field="outcome"', placeholder: 'Outcome — pick one or type your own…' })}
    `;
  }
  if (kind === 'note') {
    return statusInputHTML({ value: preset.sameAsLast ? last : '', attrs: 'data-field="text"', placeholder: 'Note' });
  }
  if (kind === 'meeting') {
    return `
      ${hidden}
      <label class="item-check"><input type="checkbox" data-field="joint"> Joint call</label>
      <label class="item-number">Referrals <input type="number" min="0" step="1" data-field="referrals" placeholder="0"></label>
      <label class="item-check"><input type="checkbox" data-field="willsLead"> Wills lead</label>
    `;
  }
  if (kind === 'quote') {
    return `
      <label class="item-check"><input type="checkbox" data-field="risk"> Risk</label>
      <label class="item-check"><input type="checkbox" data-field="investment"> Investment</label>
    `;
  }
  if (kind === 'case') {
    return `
      ${hidden}
      <label class="item-money" data-wrap="lumpSum"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="lumpSum" placeholder="Lump sum"></label>
      <label class="item-money" data-wrap="monthly"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="monthly" placeholder="Monthly"></label>
      <label class="item-money" data-wrap="adviceFeePercent"><input type="number" min="0" step="0.1" data-field="adviceFeePercent" placeholder="Advice fee"><span>%</span></label>
      <label class="item-money" data-wrap="term"><input type="number" min="1" max="60" step="1" data-field="term" placeholder="Term"><span>years</span></label>
    `;
  }
  return ''; // FNA, wills lead: nothing to fill in
}

// label: what was picked, beside the date ("Phone call", "Fact Finder",
// "RA Builder"); the entry's kind if nothing more specific.
function _openAddForm(form, kind, preset = {}, label = '') {
  form.dataset.kind = kind;
  const last = lastUpdateOf(getClientData(form.dataset.client))?.text || '';
  form.innerHTML = `
    <span class="tl-date">${_dayLabel(entryDateFor(form))}</span>
    <span class="tl-kind">${_escHtml(label || TIMELINE_KINDS[kind].label)}</span>
    ${_addFormFieldsHTML(kind, last, preset)}
    <span class="item-form-actions">
      <button type="button" class="item-cancel" data-action="cancel-add">Cancel</button>
      <button type="button" class="item-save" data-action="save-add">Save ${TIMELINE_KINDS[kind].label.toLowerCase()}</button>
    </span>
    <div class="item-form-error"></div>
  `;
  form.classList.add('open');
  _syncCaseFields(form);
  form.querySelector('select, input, .item-save')?.focus();
}

function _closeAddForm(form) {
  form.classList.remove('open');
  form.innerHTML = '';
  delete form.dataset.kind;
}

// A case's own fields depend on its product's type: Risk takes just the
// monthly premium; everything else lump sum, monthly premium and upfront
// advice fee — and RA Builder its term (PCR caps it at 15).
function _syncCaseFields(form) {
  if (form.dataset.kind !== 'case') return;
  const product = getProduct(form.querySelector('[data-field="productId"]').value);
  const premiumOnly = productIsPremiumOnly(product?.type);
  const show = (key, on) => {
    const wrap = form.querySelector(`[data-wrap="${key}"]`);
    wrap.classList.toggle('hidden', !on);
    if (!on) wrap.querySelector('input').value = '';
  };
  show('monthly', !!product);
  show('lumpSum', !!product && !premiumOnly);
  show('adviceFeePercent', !!product && !premiumOnly);
  show('term', productHasTerm(product?.type));
}

function _formValues(form) {
  const v = {};
  form.querySelectorAll('[data-field]').forEach(el => {
    v[el.dataset.field] = el.type === 'checkbox' ? el.checked
      : el.matches('[data-money]') ? parseMoney(el.value)
      : el.value.trim();
  });
  return v;
}

// Returns an error message, or '' if the entry can be saved.
function _validateAddForm(form, v) {
  form.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  const flag = field => form.querySelector(`[data-field="${field}"]`)?.classList.add('field-error');
  const kind = form.dataset.kind;
  if (kind === 'contact' && !v.method) { flag('method'); return 'Pick how you contacted them.'; }
  if (kind === 'contact' && !v.outcome) { flag('outcome'); return 'Pick an outcome, or type your own.'; }
  if (kind === 'note' && !v.text) { flag('text'); return 'Type the note.'; }
  if (kind === 'meeting' && !v.meetingType) { flag('meetingType'); return 'Pick the meeting type.'; }
  if (kind === 'quote' && !v.risk && !v.investment) return 'Tick Risk, Investment, or both.';
  if (kind === 'case' && !v.productId) { flag('productId'); return 'Pick the product.'; }
  if (kind === 'case' && v.term && !(Number(v.term) >= 1 && Number(v.term) <= 60)) { flag('term'); return 'The term must be between 1 and 60 years.'; }
  return '';
}

function _detailsFor(kind, v) {
  if (kind === 'contact') return { method: v.method, outcome: v.outcome };
  if (kind === 'note') return { text: v.text };
  if (kind === 'meeting') {
    return { meetingType: v.meetingType, joint: !!v.joint, referrals: Math.max(0, parseInt(v.referrals, 10) || 0), willsLead: !!v.willsLead };
  }
  if (kind === 'quote') return { risk: !!v.risk, investment: !!v.investment };
  return {};
}

// Adds entries (and a case) to a client's card data, keeping order.
function _addToCard(clientId, { activity, caseItem: newCase }) {
  updateClient(clientId, d => {
    if (newCase) d.cases = [newCase, ...(d.cases || []).filter(c => c.id !== newCase.id)];
    if (activity) d.timeline = [activity, ...(d.timeline || [])].sort(byTimelineOrder);
  });
}

async function _saveAddForm(form) {
  const clientId = form.dataset.client;
  const kind = form.dataset.kind;
  const v = _formValues(form);
  const errorEl = form.querySelector('.item-form-error');
  const message = _validateAddForm(form, v);
  errorEl.textContent = message;
  if (message) return;

  const saveBtn = form.querySelector('.item-save');
  const saveLabel = saveBtn.textContent;
  if (kind === 'case' && clientTab(clientId) !== 'business') {
    saveBtn.disabled = true;
    const d = getClientData(clientId);
    const choice = await showChoiceDialog({
      title: 'Move to Open Cases?',
      message: `Opening this case will move ${d.firstName} ${d.lastName} to the Open Cases tab.`,
      choices: [{ label: 'Cancel', value: null }, { label: 'Move', value: 'move', primary: true }],
    });
    saveBtn.disabled = false;
    if (!choice) return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  const date = entryDateFor(form);
  try {
    if (kind === 'case') {
      const r = await dbOpenCase(clientId, v, date);
      _addToCard(clientId, { activity: r.activity, caseItem: r.case });
      // The card has re-rendered (this form's gone), so a failed move is
      // reported on its own rather than as a failed save.
      await syncTabAfterCaseChange(clientId).catch(showSaveError);
    } else {
      const row = await dbAddActivity(clientId, kind, date, _detailsFor(kind, v));
      _addToCard(clientId, { activity: activityItem(row) });
    }
    await refreshDashboard();
  } catch (err) {
    console.error(err);
    errorEl.textContent = `Couldn't save — ${err.message || err}`;
    saveBtn.disabled = false;
    saveBtn.textContent = saveLabel;
  }
}

// ---------- case actions ----------

async function _toggleChecklistItem(box) {
  const { client: clientId, case: caseId, item } = box.dataset;
  const c = _findCase(getClientData(clientId) || {}, caseId);
  if (!c) return;
  const checklist = { ...c.checklist };
  if (box.checked) checklist[item] = true; else delete checklist[item];
  box.disabled = true;
  try {
    await dbSetCaseChecklist(caseId, checklist);
    updateClient(clientId, d => {
      d.cases = d.cases.map(k => (k.id === caseId ? { ...k, checklist } : k));
    });
  } catch (err) {
    box.checked = !box.checked;
    box.disabled = false;
    showSaveError(err);
  }
}

// Submitting with checklist items unticked is allowed, after a warning
// that names them. Not taken up can't be undone, so it asks. (Accepting
// is the manager's, from their FA list — team.js.)
async function _confirmStage(c, stage) {
  if (stage === 'submitted') {
    const missing = caseChecklistItems(c).filter(item => !c.checklist?.[item.key]).map(item => item.label);
    if (!missing.length) return true;
    return !!await showChoiceDialog({
      title: 'Checklist not complete',
      message: `${missing.length} item${missing.length === 1 ? " isn't" : "s aren't"} ticked: ${missing.join(', ')}. Submit anyway?`,
      choices: [{ label: 'Cancel', value: null }, { label: 'Submit anyway', value: true, primary: true }],
    });
  }
  const label = CASE_STAGE_LABELS[stage].toLowerCase();
  return !!await showChoiceDialog({
    title: `Mark ${label}?`,
    message: `Mark this ${c.type} case as ${label}? This can't be undone.`,
    choices: [{ label: 'Cancel', value: null }, { label: `Mark ${label}`, value: true, primary: true }],
  });
}

// Moves a case to its next stage after confirming, keeps the card and
// the client's tab in step, and refreshes the dashboard. date: the day
// it's recorded against (today on the card, the review day in the
// Review). Returns true if it went ahead.
async function changeCaseStage(clientId, caseId, stage, date) {
  const d = getClientData(clientId) || {};
  const c = _findCase(d, caseId);
  if (!c) return false;
  if (!await _confirmStage(c, stage)) return false;
  const r = await dbSetCaseStage(caseId, stage, date);
  _addToCard(clientId, { activity: r.activity, caseItem: r.case });
  await syncTabAfterCaseChange(clientId).catch(showSaveError);
  await refreshDashboard();
  return true;
}

async function _setStage(btn) {
  const { client: clientId, case: caseId, stage } = btn.dataset;
  btn.disabled = true;
  try {
    await changeCaseStage(clientId, caseId, stage, entryDateFor(btn));
  } catch (err) {
    showSaveError(err);
  } finally {
    btn.disabled = false;
  }
}

// Changing an open case's amounts (the client changes their mind: R1 000
// pm becomes R800). Only the fields its product type records. Saving adds
// an "Amended" line to the timeline with the before and after, dated
// today (or the day being reviewed). Once it's accepted or not taken up
// it can't be changed (the database refuses).
async function _editCaseAmounts(btn) {
  const { client: clientId, case: caseId } = btn.dataset;
  const c = _findCase(getClientData(clientId) || {}, caseId);
  if (!c || !isOpenCase(c)) return;
  const premiumOnly = productIsPremiumOnly(c.productType);
  const hasTerm = productHasTerm(c.productType);
  const fields = [
    ...(premiumOnly ? [] : [{ key: 'lumpSum', label: 'Lump sum (R)', money: true, value: c.lumpSum }]),
    { key: 'monthly', label: 'Monthly premium (R)', money: true, value: c.monthly },
    ...(premiumOnly ? [] : [{ key: 'adviceFeePercent', label: 'Upfront advice fee (%)', type: 'number', value: c.adviceFeePercent }]),
    ...(hasTerm ? [{ key: 'term', label: `Term (years — PCR counts up to ${BUILDER_MAX_TERM})`, type: 'number', value: c.term }] : []),
  ];
  await _faFormDialog({
    title: `Change ${c.type} amounts`,
    fields,
    submitLabel: 'Save',
    onSubmit: async v => {
      const fee = v.adviceFeePercent === undefined || v.adviceFeePercent === '' ? 0 : Number(v.adviceFeePercent);
      if (!isFinite(fee) || fee < 0) throw new Error('The advice fee must be a number.');
      const term = hasTerm && v.term !== '' ? Math.round(Number(v.term)) : null;
      if (hasTerm && term !== null && !(term >= 1 && term <= 60)) throw new Error('The term must be between 1 and 60 years.');
      const amounts = {
        lumpSum: premiumOnly ? 0 : v.lumpSum || 0,
        monthly: v.monthly || 0,
        adviceFeePercent: premiumOnly ? 0 : fee,
        term,
      };
      const same = Object.keys(amounts).every(k => Number(amounts[k] || 0) === Number(c[k] || 0));
      if (same) return; // nothing changed: no Amended line
      const r = await dbAmendCase(caseId, amounts, entryDateFor(btn));
      _addToCard(clientId, { activity: r.activity, caseItem: r.case });
      await refreshDashboard();
    },
  });
}

async function _deleteCase(btn) {
  const { client: clientId, case: caseId } = btn.dataset;
  const c = _findCase(getClientData(clientId) || {}, caseId);
  if (!c) return;
  const ok = await showChoiceDialog({
    title: 'Delete case?',
    message: `Delete this ${c.type} case and its entries on the timeline? This can't be undone.`,
    choices: [{ label: 'Cancel', value: null }, { label: 'Delete case', value: true, primary: true }],
  });
  if (!ok) return;
  btn.disabled = true;
  try {
    await dbDeleteCase(caseId);
    updateClient(clientId, d => {
      d.cases = d.cases.filter(k => k.id !== caseId);
      d.timeline = d.timeline.filter(e => e.caseId !== caseId);
    });
    await syncTabAfterCaseChange(clientId).catch(showSaveError);
    await refreshDashboard();
  } catch (err) {
    btn.disabled = false;
    showSaveError(err);
  }
}

// ---------- keeping the tab in step with the cases ----------

// An open case belongs in Business (even alongside closed ones), so a
// client with one anywhere else moves there. A Business client with no
// open case left is asked where to go — they must pick one.
async function syncTabAfterCaseChange(clientId) {
  const d = getClientData(clientId);
  const open = (d.cases || []).some(isOpenCase);
  const tab = clientTab(clientId);
  if (open && tab !== 'business') {
    await moveClientToTab(clientId, 'business');
    showTab('business');
  } else if (!open && tab === 'business') {
    const next = await showChoiceDialog({
      title: 'No open cases left',
      message: `${d.firstName} ${d.lastName} has no open cases, so they're leaving the Open Cases tab. Where should they go?`,
      choices: [
        { label: 'Prospects', value: 'prospects' },
        { label: 'Not Moved Forward', value: 'not-moved' },
        { label: 'Clients', value: 'clients', primary: true },
      ],
      dismissable: false,
    });
    await moveClientToTab(clientId, next);
  }
}

// ---------- deleting a timeline entry ----------

async function _deleteEntry(btn) {
  const { client: clientId, id } = btn.dataset;
  if (!confirm("Delete this entry? This can't be undone.")) return;
  btn.disabled = true;
  try {
    await dbDeleteActivity(id);
    updateClient(clientId, d => { d.timeline = d.timeline.filter(e => e.id !== id); });
    await refreshDashboard();
  } catch (err) {
    btn.disabled = false;
    showSaveError(err);
  }
}

function initCardItems(root) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    const detail = btn?.closest('.row-detail');
    if (!btn || !detail) return;
    const action = btn.dataset.action;
    const clientId = detail.id.replace('row-', '');

    if (action === 'toggle-case') {
      // Buttons on the card's line (✎, Mark submitted…) do their own thing.
      if (e.target.closest('button')) return;
      const id = btn.dataset.case;
      if (_openCaseCards.has(id)) _openCaseCards.delete(id); else _openCaseCards.add(id);
      btn.closest('.cc').classList.toggle('expanded', _openCaseCards.has(id));
    } else if (action === 'show-case') {
      const c = _findCase(getClientData(clientId) || {}, btn.dataset.case);
      showCaseView(detail, clientId, c ? _caseGroupOf(c) : 'open', btn.dataset.case);
    } else if (action === 'cancel-add') {
      _closeAddForm(btn.closest('.item-add-form'));
    } else if (action === 'save-add') {
      _saveAddForm(btn.closest('.item-add-form'));
    } else if (action === 'stage') {
      _setStage(btn);
    } else if (action === 'delete-case') {
      _deleteCase(btn);
    } else if (action === 'edit-case') {
      _editCaseAmounts(btn);
    } else if (action === 'delete-entry') {
      _deleteEntry(btn);
    }
  });

  root.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-action="check"]')) _toggleChecklistItem(t);
    if (t.matches('.item-add-form [data-field="productId"]')) _syncCaseFields(t.closest('.item-add-form'));
  });

  root.addEventListener('keydown', e => {
    const form = e.target.closest?.('.row-detail .item-add-form');
    if (!form) return;
    if (e.key === 'Enter') { e.preventDefault(); _saveAddForm(form); }
    if (e.key === 'Escape') { e.stopPropagation(); _closeAddForm(form); }
  });
}
