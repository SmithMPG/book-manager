// Client detail: what's inside an open client card (see SPEC.md,
// "Client timeline"). Top to bottom:
//
//   Case panel  shown when one of the row's case chips is clicked: that
//               case's checklist (the standard submission items,
//               CASE_CHECKLIST) and its next steps — Mark submitted →
//               Mark accepted, or Not taken up — and Delete case.
//   Add form    opened from the row's "+" menu: the event on the left
//               (Contact, Note, Meeting, FNA, Quote, Case), its own
//               fields on the right. Dated today.
//   Timeline    everything that's happened with the client, newest
//               first, grouped by day, ending with "Client added".
//               Everything / Key moments (no contacts or notes) for a
//               quick read. Delete mode removes entries one at a time;
//               a case goes (with its entries) from its "Opened" entry.
//
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
    /* ---- cases box ---- */
    .cb { margin-bottom: 16px; }
    .cb-case {
      display: none;
      background: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .cb-case.focused { display: block; border-color: rgba(0, 0, 0, 0.16); }
    .cb-row { display: flex; align-items: center; gap: 20px; padding: 11px 16px; }
    .cb-close { background: none; border: none; padding: 0 2px; font-size: 18px; line-height: 1; color: var(--ink-dim); cursor: pointer; }
    .cb-close:hover { color: var(--ink); }
    .cb-type { flex: 1; min-width: 0; font-weight: 600; color: var(--ink); }
    .cb-stage { flex-shrink: 0; color: var(--ink); }
    .cb-check { flex-shrink: 0; color: var(--ink-dim); white-space: nowrap; }
    .cb-check.complete { color: #1f7a52; font-weight: 600; }
    .cb-pcr { flex-shrink: 0; color: var(--ink-dim); white-space: nowrap; }
    .cb-panel { padding: 12px 16px 14px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
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
    /* The add form: the event on the left, its fields on the right. */
    .item-kind { flex-shrink: 0; width: 76px; font-weight: 700; color: var(--ink); }
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
      gap: 10px;
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
    .item-money input[data-field="adviceFeePercent"] { width: 130px; }
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
    .tl-head { display: flex; align-items: center; gap: 12px; margin: 4px 0 8px; }
    .tl-modes { display: inline-flex; background: #ececea; border-radius: 999px; padding: 3px; gap: 2px; }
    .tl-mode {
      border: none;
      background: transparent;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .tl-mode.active { background: #ffffff; color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
    .tl-delete {
      margin-left: auto;
      background: none;
      border: none;
      padding: 4px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .tl-delete:hover, .tl.deleting .tl-delete { color: var(--red); }

    .tl-day { margin-top: 10px; }
    .tl-day-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
      padding: 4px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .tl-entry { display: flex; align-items: baseline; gap: 14px; padding: 7px 0; font-size: 13px; }
    .tl-time { flex-shrink: 0; width: 40px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
    .tl-kind { flex-shrink: 0; width: 76px; font-weight: 600; color: var(--ink); }
    .tl-entry.key .tl-kind { color: #8a6d0a; }
    .tl-text { flex: 1; min-width: 0; color: var(--ink); line-height: 1.45; }
    .tl-del {
      display: none;
      flex-shrink: 0;
      background: none;
      border: none;
      padding: 0;
      font-size: 16px;
      line-height: 1;
      color: var(--red);
      cursor: pointer;
    }
    .tl.deleting .tl-del { display: inline-block; }
    .tl-created { padding: 12px 0 2px; font-size: 12px; color: var(--ink-dim); }
    .tl-empty { padding: 10px 0; font-size: 13px; color: var(--ink-dim); }
  `;
  document.head.appendChild(s);
}
_injectCardItemsCSS();

// Every kind of timeline entry. key: shown under "Key moments" (contacts
// and notes are the everyday entries, so they're left out). Referrals and
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
// What the row's "+" menu offers, in order.
const ADD_KINDS = ['contact', 'note', 'meeting', 'fna', 'quote', 'case'];

// Per-client view state that survives the card re-rendering.
const _keyMomentsOnly = new Set();   // client ids showing Key moments
const _deletingTimelines = new Set(); // client ids in Delete mode
const _focusedCase = new Map();       // client id → the case whose checklist is showing

function caseIsFocused(clientId, caseId) {
  return _focusedCase.get(clientId) === caseId;
}

// Shows one case's panel (or none, caseId null) and marks its row chip.
function focusCase(detail, clientId, caseId) {
  if (caseId) _focusedCase.set(clientId, caseId); else _focusedCase.delete(clientId);
  detail.querySelectorAll('.cb-case').forEach(p => p.classList.toggle('focused', p.dataset.case === caseId));
  detail.previousElementSibling.querySelectorAll('[data-case-chip]').forEach(c => {
    c.classList.toggle('focused', c.dataset.caseChip === caseId);
  });
}

function _findCase(data, caseId) {
  return (data.cases || []).find(c => c.id === caseId) || null;
}

// What an entry says: e.g. "Phone · No answer", "Fact Finder · Joint
// call", "RA Builder · Submitted".
function timelineEntryText(data, entry) {
  if (entry.type === 'case') {
    const c = _findCase(data, entry.caseId);
    return `${c ? c.type : 'Case'} · ${CASE_STAGE_LABELS[entry.details.event] || ''}`;
  }
  return entry.text;
}

// One line for the collapsed card row: the latest entry.
function latestTimelineSummary(data) {
  const e = (data.timeline || [])[0];
  if (!e) return '';
  const text = timelineEntryText(data, e);
  return e.type === 'contact' || e.type === 'note' || e.type === 'case' ? text
    : [TIMELINE_KINDS[e.type]?.label, text].filter(Boolean).join(' · ');
}

const _DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function _dayLabel(iso) {
  const today = _todayIso();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === today) return 'Today';
  if (iso === isoDate(y)) return 'Yesterday';
  return `${_DAY_NAMES[new Date(`${iso}T00:00:00`).getDay()]} ${_formatStatusDate(iso)}`;
}

// The time it was logged — only when that's the day it happened (an
// entry added in a later review has no meaningful time of day).
function _entryTime(entry) {
  if (!entry.createdAt) return '';
  const d = new Date(entry.createdAt);
  if (isoDate(d) !== entry.date) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- cases box ----------

function _caseRowHTML(c) {
  const done = caseChecklistDone(c);
  const total = CASE_CHECKLIST.length;
  return `
    <span class="cb-type">${_escHtml(c.type)}</span>
    <span class="cb-stage">${CASE_STAGE_LABELS[c.stage]}</span>
    <span class="cb-check${done === total ? ' complete' : ''}" title="Checklist">&#10003; ${done}/${total}</span>
    <span class="cb-pcr">PCR ${formatNumber(casePcr(c))}</span>
  `;
}

function _casePanelHTML(data, c) {
  const checks = CASE_CHECKLIST.map(item => `
    <label class="item-check">
      <input type="checkbox" data-action="check" data-client="${data.id}" data-case="${c.id}" data-item="${item.key}"${c.checklist?.[item.key] ? ' checked' : ''}>
      ${_escHtml(item.label)}
    </label>
  `).join('');
  const stageBtn = (stage, label, primary) =>
    `<button type="button" class="cb-btn${primary ? ' primary' : ''}" data-action="stage" data-client="${data.id}" data-case="${c.id}" data-stage="${stage}">${label}</button>`;
  return `
    <div class="cb-checklist">${checks}</div>
    <div class="cb-actions">
      ${c.stage === 'opened' ? stageBtn('submitted', 'Mark submitted', true) : ''}
      ${c.stage === 'submitted' ? stageBtn('accepted', 'Mark accepted', true) : ''}
      ${stageBtn('not-taken-up', 'Not taken up')}
      <button type="button" class="cb-link danger" data-action="delete-case" data-client="${data.id}" data-case="${c.id}">Delete case</button>
    </div>
  `;
}

// A panel per open case, only the focused one shown.
function _casesBoxHTML(data) {
  const open = (data.cases || []).filter(isOpenCase);
  if (!open.length) return '';
  return `<div class="cb">${open.map(c => `
    <div class="cb-case${caseIsFocused(data.id, c.id) ? ' focused' : ''}" data-case="${c.id}">
      <div class="cb-row">
        ${_caseRowHTML(c)}
        <button type="button" class="cb-close" data-action="unfocus-case" title="Hide checklist">&times;</button>
      </div>
      <div class="cb-panel">${_casePanelHTML(data, c)}</div>
    </div>
  `).join('')}</div>`;
}

// ---------- timeline ----------

function _timelineHTML(data) {
  const keyOnly = _keyMomentsOnly.has(data.id);
  const shown = e => !keyOnly || !!TIMELINE_KINDS[e.type]?.key;
  const byDay = [];
  (data.timeline || []).forEach(e => {
    const last = byDay[byDay.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else byDay.push({ date: e.date, entries: [e] });
  });
  const days = byDay.map(day => `
    <div class="tl-day"${day.entries.some(shown) ? '' : ' hidden'}>
      <div class="tl-day-label">${_dayLabel(day.date)}</div>
      ${day.entries.map(e => {
        const kind = TIMELINE_KINDS[e.type] || { label: e.type };
        const del = e.type !== 'case'
          ? `<button type="button" class="tl-del" data-action="delete-entry" data-client="${data.id}" data-id="${e.id}" title="Delete">&times;</button>`
          : e.details.event === 'opened'
            ? `<button type="button" class="tl-del" data-action="delete-case" data-client="${data.id}" data-case="${e.caseId}" title="Delete this case">&times;</button>`
            : '';
        return `
          <div class="tl-entry${kind.key ? ' key' : ''}" data-type="${e.type}" data-key="${kind.key ? 1 : 0}"${shown(e) ? '' : ' hidden'}>
            <span class="tl-time">${_entryTime(e)}</span>
            <span class="tl-kind">${kind.label}</span>
            <span class="tl-text">${_escHtml(timelineEntryText(data, e))}</span>
            ${del}
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
  const created = data.createdAt ? `<div class="tl-created">Client added · ${_formatStatusDate(isoDate(new Date(data.createdAt)))}</div>` : '';
  const anyShown = (data.timeline || []).some(shown);
  const hasDeletable = (data.timeline || []).length > 0;
  return `
    <div class="tl${keyOnly ? ' key-only' : ''}${_deletingTimelines.has(data.id) && hasDeletable ? ' deleting' : ''}" data-client="${data.id}">
      <div class="tl-head">
        <div class="tl-modes">
          <button type="button" class="tl-mode${keyOnly ? '' : ' active'}" data-action="tl-mode" data-key-only="0">Everything</button>
          <button type="button" class="tl-mode${keyOnly ? ' active' : ''}" data-action="tl-mode" data-key-only="1">Key moments</button>
        </div>
        ${hasDeletable ? `<button type="button" class="tl-delete" data-action="toggle-delete">${_deletingTimelines.has(data.id) ? 'Done' : 'Delete'}</button>` : ''}
      </div>
      ${days}
      <div class="tl-empty"${anyShown || !(data.timeline || []).length ? ' hidden' : ''}>Nothing to show.</div>
      ${created}
    </div>
  `;
}

// Everything / Key moments: hides contacts and notes, and any day left
// with nothing showing.
function applyTimelineFilter(detail) {
  const tl = detail.querySelector('.tl');
  if (!tl) return;
  const keyOnly = tl.classList.contains('key-only');
  tl.querySelectorAll('.tl-entry').forEach(e => { e.hidden = keyOnly && e.dataset.key !== '1'; });
  let any = false;
  tl.querySelectorAll('.tl-day').forEach(d => {
    d.hidden = !d.querySelector('.tl-entry:not([hidden])');
    any = any || !d.hidden;
  });
  tl.querySelector('.tl-empty').hidden = any || !tl.querySelector('.tl-day');
}

// Everything inside an open card.
function clientDetailHTML(data) {
  return `
    ${_casesBoxHTML(data)}
    <div class="item-add-form" data-client="${data.id}"></div>
    ${_timelineHTML(data)}
  `;
}

// From the row's "+" menu: the add form for one kind of entry.
function openAddEntry(detail, kind) {
  _openAddForm(detail.querySelector('.item-add-form'), kind);
}

// ---------- adding an entry ----------

function _addFormFieldsHTML(kind) {
  if (kind === 'contact') {
    const opts = CONTACT_METHODS.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
    return `
      <select data-field="method"><option value="">How&hellip;</option>${opts}</select>
      ${statusInputHTML({ options: CONTACT_OUTCOMES, attrs: 'data-field="outcome"', placeholder: 'Outcome — pick one or type your own…' })}
    `;
  }
  if (kind === 'note') {
    return '<input type="text" class="item-text" data-field="text" placeholder="Note&hellip;" autocomplete="off">';
  }
  if (kind === 'meeting') {
    const opts = CHECKOUT_MEETING_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    return `
      <select data-field="meetingType"><option value="">Meeting type&hellip;</option>${opts}</select>
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
    const opts = CASE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    return `
      <select data-field="caseType"><option value="">Case type&hellip;</option>${opts}</select>
      <label class="item-money" data-wrap="lumpSum"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="lumpSum" placeholder="Lump sum"></label>
      <label class="item-money" data-wrap="monthly"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="monthly" placeholder="Monthly"></label>
      <label class="item-money" data-wrap="adviceFeePercent"><input type="number" min="0" step="0.1" data-field="adviceFeePercent" placeholder="Upfront advice fee"><span>%</span></label>
    `;
  }
  return ''; // FNA: nothing to fill in
}

function _openAddForm(form, kind) {
  form.dataset.kind = kind;
  form.innerHTML = `
    <span class="item-kind">${TIMELINE_KINDS[kind].label}</span>
    ${_addFormFieldsHTML(kind)}
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

// A case's own fields depend on its type, and appear once one's picked:
// premium-only products (Risk, Educator — CHECKOUT_MONTHLY_ONLY_CASE_TYPES)
// take just the monthly premium; everything else takes lump sum, monthly
// premium and upfront advice fee.
function _syncCaseFields(form) {
  if (form.dataset.kind !== 'case') return;
  const type = form.querySelector('[data-field="caseType"]').value;
  const premiumOnly = CHECKOUT_MONTHLY_ONLY_CASE_TYPES.includes(type);
  const show = (key, on) => {
    const wrap = form.querySelector(`[data-wrap="${key}"]`);
    wrap.classList.toggle('hidden', !on);
    if (!on) wrap.querySelector('input').value = '';
  };
  show('monthly', !!type);
  show('lumpSum', !!type && !premiumOnly);
  show('adviceFeePercent', !!type && !premiumOnly);
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
  if (kind === 'case' && !v.caseType) { flag('caseType'); return 'Pick the case type.'; }
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
      title: 'Move to Business?',
      message: `Opening this case will move ${d.firstName} ${d.lastName} to the Business tab.`,
      choices: [{ label: 'Cancel', value: null }, { label: 'Move', value: 'move', primary: true }],
    });
    saveBtn.disabled = false;
    if (!choice) return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  const date = _todayIso();
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
// that names them. Accepted and Not taken up can't be undone, so both ask.
async function _confirmStage(c, stage) {
  if (stage === 'submitted') {
    const missing = CASE_CHECKLIST.filter(item => !c.checklist?.[item.key]).map(item => item.label);
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

async function _setStage(btn) {
  const { client: clientId, case: caseId, stage } = btn.dataset;
  const c = _findCase(getClientData(clientId) || {}, caseId);
  if (!c || !await _confirmStage(c, stage)) return;
  btn.disabled = true;
  try {
    const r = await dbSetCaseStage(caseId, stage, _todayIso());
    _addToCard(clientId, { activity: r.activity, caseItem: r.case });
    await syncTabAfterCaseChange(clientId).catch(showSaveError);
    await refreshDashboard();
  } catch (err) {
    btn.disabled = false;
    showSaveError(err);
  }
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
      message: `${d.firstName} ${d.lastName} has no open cases, so they're leaving the Business tab. Where should they go?`,
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
    // One at a time: the timeline leaves delete mode once something's gone.
    _deletingTimelines.delete(clientId);
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

    if (action === 'unfocus-case') {
      focusCase(detail, clientId, null);
    } else if (action === 'cancel-add') {
      _closeAddForm(btn.closest('.item-add-form'));
    } else if (action === 'save-add') {
      _saveAddForm(btn.closest('.item-add-form'));
    } else if (action === 'stage') {
      _setStage(btn);
    } else if (action === 'delete-case') {
      _deleteCase(btn);
    } else if (action === 'tl-mode') {
      const keyOnly = btn.dataset.keyOnly === '1';
      if (keyOnly) _keyMomentsOnly.add(clientId); else _keyMomentsOnly.delete(clientId);
      const tl = btn.closest('.tl');
      tl.classList.toggle('key-only', keyOnly);
      tl.querySelectorAll('.tl-mode').forEach(m => m.classList.toggle('active', m === btn));
      applyTimelineFilter(detail);
    } else if (action === 'toggle-delete') {
      const tl = btn.closest('.tl');
      const on = !_deletingTimelines.has(clientId);
      if (on) _deletingTimelines.add(clientId); else _deletingTimelines.delete(clientId);
      tl.classList.toggle('deleting', on);
      btn.textContent = on ? 'Done' : 'Delete';
    } else if (action === 'delete-entry') {
      _deleteEntry(btn);
    }
  });

  root.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-action="check"]')) _toggleChecklistItem(t);
    if (t.matches('.item-add-form [data-field="caseType"]')) _syncCaseFields(t.closest('.item-add-form'));
  });

  root.addEventListener('keydown', e => {
    const form = e.target.closest?.('.item-add-form');
    if (!form) return;
    if (e.key === 'Enter') { e.preventDefault(); _saveAddForm(form); }
    if (e.key === 'Escape') { e.stopPropagation(); _closeAddForm(form); }
  });
}
