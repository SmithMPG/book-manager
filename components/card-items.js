// Card items: the Meetings / FNAs / Quotes / Cases lists inside
// an open client card, each editable in place — no checkout needed to log
// one thing for one client.
//
// Every list ends in the same two controls: "+ Add <item>" bottom left
// opens an inline row (that item's own fields) with Save / Cancel — no
// date to pick, an item is dated the day it's added. "Delete" bottom
// right switches the list into delete mode, where an × appears beside
// every line (and the button reads "Done"); deleting one item switches
// delete mode back off, so it's one at a time.
//
// What each line shows:
//   FNAs             the date only
//   Meetings         meeting type, and "Joint call" if it was one
//   Quotes           Risk, Investment, or both
//   Cases            case type, its latest status (the thing that
//                    matters most — "Accepted" / "Not taken up" when
//                    closed), and at the end of the line its PCR
//                    (casePcr, constants.js). No date on the line — every
//                    status in the log carries its own, starting with
//                    "Case opened". Clicking a case opens its log — every status it's
//                    had, newest first; the "+" at the right of the case
//                    opens it with a new-status box ready at the top.
//                    The "Accepted" and "Not taken up" presets close the
//                    case; any other status reopens a closed one.
//
// Saves go through data.js; the card is then updated in place and the
// dashboard numbers refreshed.
//
// Cases also decide the client's tab: the Business tab is for clients
// with an open case. Saving a case for a client anywhere else first asks
// to move them there (Move / Cancel — the case isn't saved on Cancel).
// When a Business client's last open case goes, a popup asks which tab
// they move to next (see syncTabAfterCaseChange).

function _injectCardItemsCSS() {
  if (document.getElementById('card-items-styles')) return;
  const s = document.createElement('style');
  s.id = 'card-items-styles';
  s.textContent = `
    .item-del {
      display: none;
      flex-shrink: 0;
      width: 20px;
      background: none;
      border: none;
      padding: 0;
      font-size: 16px;
      line-height: 1;
      color: var(--red);
      cursor: pointer;
    }
    .item-del:hover { color: #b83434; }
    .detail-view.deleting .item-del { display: inline-block; }
    .detail-item { align-items: center; }
    /* Each case is its own small card, so the cases read as a set above
       the list's "+ Add case" / "Delete" rather than in line with them. */
    .case-block {
      background: #f7f7f5;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      margin-bottom: 8px;
      transition: border-color 0.12s ease;
    }
    .case-block:hover { border-color: rgba(0, 0, 0, 0.16); }
    .case-block.open { border-color: rgba(0, 0, 0, 0.16); }
    .case-line { display: flex; align-items: center; gap: 20px; padding: 12px 16px; cursor: pointer; }
    .case-line:hover .case-type { color: var(--ink); }
    .case-type { flex-shrink: 0; min-width: 150px; color: var(--ink-dim); }
    .case-current {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ink);
      font-weight: 600;
    }
    .case-pcr { flex-shrink: 0; color: var(--ink-dim); white-space: nowrap; }
    .case-add-status {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      border-radius: 50%;
      border: 1px dashed rgba(0, 0, 0, 0.25);
      background: transparent;
      color: var(--ink-dim);
      font-size: 15px;
      line-height: 1;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .case-add-status:hover { border-style: solid; border-color: var(--gold); color: #8a6d0a; background: rgba(212, 175, 55, 0.1); }
    .case-block.not-taken-up .case-line { opacity: 0.6; }

    .case-log { display: none; padding: 10px 16px 12px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
    .case-block.open .case-log { display: block; }
    .case-log-entries { list-style: none; margin: 0; padding: 0; }
    .case-log-entry { display: flex; gap: 16px; padding: 6px 0; font-size: 13px; }
    .case-log-when { flex-shrink: 0; width: 132px; color: var(--ink-dim); }
    .case-log-text { color: var(--ink); line-height: 1.45; }
    .case-log-entry.ending .case-log-text { font-weight: 700; }
    /* Open cases with logs get tall — let the list grow rather than scroll. */
    .detail-view[data-view="cases"] > .detail-list { max-height: none; overflow: visible; }
    .case-log .item-add-form .case-log-when { margin-right: 6px; }
    .case-log .item-add-form { border-top: none; margin: 0 0 10px; padding: 0 0 12px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
    .item-form-note { flex-basis: 100%; font-size: 12px; color: var(--ink-dim); }
    .item-form-note:empty { display: none; }

    .item-add-form {
      display: none;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 12px 0 2px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      margin-top: 10px;
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

    .section-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 14px;
    }
    .section-add,
    .section-delete {
      background: none;
      border: none;
      padding: 6px 4px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .section-add:hover { color: var(--ink); }
    .section-delete:hover,
    .detail-view.deleting .section-delete { color: var(--red); }
  `;
  document.head.appendChild(s);
}
_injectCardItemsCSS();

const CARD_SECTIONS = {
  meetings: { noun: 'meeting', empty: 'No meetings yet.' },
  fnas: { noun: 'FNA', empty: 'No FNAs yet.' },
  quotes: { noun: 'quote', empty: 'No quotes yet.' },
  cases: { noun: 'case', empty: 'No cases yet.' },
};

// Lists in delete mode, as "clientId:view", so the mode survives the
// card re-rendering (e.g. after a case's In Progress / Accepted switch).
const _deletingLists = new Set();

function _itemLineHTML(clientId, view, item) {
  return `
    <li class="detail-item">
      <button type="button" class="item-del" data-action="delete-item" data-client="${clientId}" data-view="${view}" data-id="${item.id}" title="Delete">&times;</button>
      <span class="detail-date">${_formatStatusDate(item.date)}</span>
      <span class="detail-text">${_escHtml(item.text)}</span>
    </li>
  `;
}

// Cases whose log is open, so it stays open when the card re-renders.
const _expandedCases = new Set();

// For the "Saving this closes the case as …" note.
const _CASE_STATE_LABELS = { 'in-progress': 'In Progress', accepted: 'Accepted', 'not-taken-up': 'Not taken up' };

function _allCases(data) {
  return [...(data.casesInProgress || []), ...(data.acceptedCases || []), ...(data.notTakenUpCases || [])]
    .sort((a, b) => b.date.localeCompare(a.date));
}

function _findCase(data, caseId) {
  return _allCases(data).find(c => c.id === caseId) || null;
}

// "25 Sep 2026, 14:05" in the viewer's own time.
function _formatStatusTime(at) {
  const d = new Date(at);
  const pad = n => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${_formatStatusDate(iso)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _caseLogHTML(clientId, c) {
  const entries = (c.statuses || []).map(st => `
    <li class="case-log-entry${st.ending ? ' ending' : ''}">
      <span class="case-log-when">${_formatStatusTime(st.at)}</span>
      <span class="case-log-text">${_escHtml(st.text)}</span>
    </li>
  `).join('');
  return `
    <div class="case-log">
      <div class="item-add-form" data-client="${clientId}" data-view="case-status" data-case="${c.id}"></div>
      ${entries ? `<ul class="case-log-entries">${entries}</ul>` : '<div class="detail-empty">No statuses yet.</div>'}
    </div>
  `;
}

function _caseLinesHTML(data) {
  return _allCases(data).map(c => {
    const current = (c.statuses || [])[0];
    return `
      <li class="case-block ${c.status}${_expandedCases.has(c.id) ? ' open' : ''}">
        <div class="case-line" data-action="toggle-case" data-case="${c.id}">
          <button type="button" class="item-del" data-action="delete-item" data-client="${data.id}" data-view="cases" data-id="${c.id}" title="Delete">&times;</button>
          <span class="case-type">${_escHtml(c.type)}</span>
          <span class="case-current"${current ? ` title="${_escHtml(current.text)}"` : ''}>${current ? _escHtml(current.text) : ''}</span>
          <span class="case-pcr">PCR ${formatNumber(casePcr(c))}</span>
          <button type="button" class="case-add-status" data-action="add-status" title="Add a status">+</button>
        </div>
        ${_caseLogHTML(data.id, c)}
      </li>
    `;
  }).join('');
}

function cardSectionHTML(data, view) {
  const section = CARD_SECTIONS[view];
  const lines = view === 'cases'
    ? _caseLinesHTML(data)
    : (data[view] || []).map(item => _itemLineHTML(data.id, view, item)).join('');
  const deleting = _deletingLists.has(`${data.id}:${view}`) && lines;
  const list = lines ? `<ul class="detail-list">${lines}</ul>` : `<div class="detail-empty">${section.empty}</div>`;
  return {
    className: deleting ? ' deleting' : '',
    html: `
      ${list}
      <div class="item-add-form" data-client="${data.id}" data-view="${view}"></div>
      <div class="section-actions">
        <button type="button" class="section-add" data-action="open-add">+ Add ${section.noun}</button>
        ${lines ? `<button type="button" class="section-delete" data-action="toggle-delete" data-client="${data.id}" data-view="${view}">${deleting ? 'Done' : 'Delete'}</button>` : ''}
      </div>
    `,
  };
}

// ---------- the inline add row ----------

function _addFormFieldsHTML(view) {
  if (view === 'meetings') {
    const opts = CHECKOUT_MEETING_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    return `
      <select data-field="meetingType"><option value="">Meeting type&hellip;</option>${opts}</select>
      <label class="item-check"><input type="checkbox" data-field="joint"> Joint call</label>
    `;
  }
  if (view === 'quotes') {
    return `
      <label class="item-check"><input type="checkbox" data-field="risk"> Risk</label>
      <label class="item-check"><input type="checkbox" data-field="investment"> Investment</label>
    `;
  }
  if (view === 'cases') {
    const opts = CASE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    return `
      <select data-field="caseType"><option value="">Case type&hellip;</option>${opts}</select>
      <label class="item-money" data-wrap="lumpSum"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="lumpSum" placeholder="Lump sum"></label>
      <label class="item-money" data-wrap="monthly"><span>R</span><input ${MONEY_INPUT_ATTRS} data-field="monthly" placeholder="Monthly"></label>
      <label class="item-money" data-wrap="adviceFeePercent"><input type="number" min="0" step="0.1" data-field="adviceFeePercent" placeholder="Upfront advice fee"><span>%</span></label>
    `;
  }
  return '';
}

// One text box (status-input.js): type your own, or pick Same as last /
// Accepted / Not taken up from its arrow.
function _caseStatusFieldsHTML(form) {
  const c = _findCase(getClientData(form.dataset.client) || {}, form.dataset.case);
  const last = (c?.statuses || [])[0]?.text || '';
  return `
    ${statusInputHTML({ last, attrs: 'data-field="text"' })}
    <div class="item-form-note"></div>
  `;
}

function _openAddForm(form) {
  const isStatus = form.dataset.view === 'case-status';
  form.innerHTML = `
    ${isStatus
      ? `<span class="case-log-when">${_formatStatusDate(_todayIso())}</span>`
      : `<span class="detail-date">${_formatStatusDate(_todayIso())}</span>`}
    ${isStatus ? _caseStatusFieldsHTML(form) : _addFormFieldsHTML(form.dataset.view)}
    <span class="item-form-actions">
      <button type="button" class="item-cancel" data-action="cancel-add">Cancel</button>
      <button type="button" class="item-save" data-action="save-add">Save</button>
    </span>
    <div class="item-form-error"></div>
  `;
  form.classList.add('open');
  _syncCaseFields(form);
  form.querySelector(isStatus ? '[data-field="text"]' : 'select, input, .item-save')?.focus();
}

function _closeAddForm(form) {
  form.classList.remove('open');
  form.innerHTML = '';
}

// Premium-only products have no lump sum; only advice-fee products take
// an advice fee %. Same rules as the checkout's cases page.
function _syncCaseFields(form) {
  if (form.dataset.view !== 'cases') return;
  const type = form.querySelector('[data-field="caseType"]').value;
  const setEnabled = (key, on) => {
    const wrap = form.querySelector(`[data-wrap="${key}"]`);
    const input = wrap.querySelector('input');
    wrap.classList.toggle('disabled', !on);
    input.disabled = !on;
    if (!on) input.value = '';
  };
  setEnabled('lumpSum', !CHECKOUT_MONTHLY_ONLY_CASE_TYPES.includes(type));
  setEnabled('adviceFeePercent', !type || caseUsesAdviceFee(type));
}

// Under a case's status box: says when saving will close or reopen it.
function _syncStatusNote(form) {
  const c = _findCase(getClientData(form.dataset.client) || {}, form.dataset.case);
  if (!c) return;
  const ending = caseEndingFor(form.querySelector('[data-field="text"]').value);
  const note = ending ? `Saving this closes the case as ${_CASE_STATE_LABELS[ending]}.`
    : c.status !== 'in-progress' ? 'Saving this reopens the case.'
    : '';
  form.querySelector('.item-form-note').textContent = note;
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

// Returns an error message, or '' if the row can be saved.
function _validateAddForm(form, v) {
  form.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  const flag = field => form.querySelector(`[data-field="${field}"]`)?.classList.add('field-error');
  if (form.dataset.view === 'meetings' && !v.meetingType) { flag('meetingType'); return 'Pick the meeting type.'; }
  if (form.dataset.view === 'quotes' && !v.risk && !v.investment) return 'Tick Risk, Investment, or both.';
  if (form.dataset.view === 'cases' && !v.caseType) { flag('caseType'); return 'Pick the case type.'; }
  if (form.dataset.view === 'case-status' && !v.text) { flag('text'); return 'Type a status, or pick one from the arrow.'; }
  return '';
}

async function _saveAddForm(form) {
  const clientId = form.dataset.client;
  const view = form.dataset.view;
  const v = _formValues(form);
  const errorEl = form.querySelector('.item-form-error');
  const message = _validateAddForm(form, v);
  errorEl.textContent = message;
  if (message) return;

  const saveBtn = form.querySelector('.item-save');
  if (view === 'cases' && clientTab(clientId) !== 'business') {
    saveBtn.disabled = true;
    const d = getClientData(clientId);
    const choice = await showChoiceDialog({
      title: 'Move to Business?',
      message: `Saving this case will move ${d.firstName} ${d.lastName} to the Business tab.`,
      choices: [{ label: 'Cancel', value: null }, { label: 'Move', value: 'move', primary: true }],
    });
    saveBtn.disabled = false;
    if (!choice) return;
  }

  const date = _todayIso();
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  const num = x => (x === '' || x == null ? null : Number(x));
  try {
    if (view === 'case-status') {
      const caseId = form.dataset.case;
      const item = caseItem(await dbAddCaseStatus(caseId, v.text));
      const listFor = { 'in-progress': 'casesInProgress', accepted: 'acceptedCases', 'not-taken-up': 'notTakenUpCases' };
      updateClient(clientId, d => {
        Object.values(listFor).forEach(k => { d[k] = (d[k] || []).filter(c => c.id !== caseId); });
        d[listFor[item.status]] = _addDatedItem(d[listFor[item.status]], item);
      });
      // Closing the last open case, or reopening one, can move the client.
      await syncTabAfterCaseChange(clientId).catch(showSaveError);
    } else if (view === 'cases') {
      const row = await dbAddCase({
        client_id: clientId,
        case_type: v.caseType,
        initiated_date: date,
        lump_sum: num(v.lumpSum),
        monthly: num(v.monthly),
        advice_fee_percent: num(v.adviceFeePercent),
      });
      updateClient(clientId, d => { d.casesInProgress = _addDatedItem(d.casesInProgress, caseItem(row)); });
      // The case is saved and the card re-rendered (this form's gone), so a
      // failed move is reported on its own rather than as a failed save.
      await syncTabAfterCaseChange(clientId).catch(showSaveError);
    } else {
      const details = view === 'meetings' ? { meetingType: v.meetingType, joint: !!v.joint }
        : view === 'quotes' ? { risk: !!v.risk, investment: !!v.investment }
        : {};
      const row = await dbAddActivity(clientId, ACTIVITY_TYPE_FOR_VIEW[view], date, details);
      updateClient(clientId, d => { d[view] = _addDatedItem(d[view], activityItem(row)); });
    }
    await refreshDashboard();
  } catch (err) {
    console.error(err);
    errorEl.textContent = `Couldn't save — ${err.message || err}`;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// ---------- keeping the tab in step with the cases ----------

// An open case belongs in Business (even alongside accepted ones), so a
// client with one anywhere else moves there. A Business client with no
// open case left is asked where to go — they must pick one.
async function syncTabAfterCaseChange(clientId) {
  const d = getClientData(clientId);
  const open = (d.casesInProgress || []).length > 0;
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

// ---------- delete ----------

async function _deleteItem(btn) {
  const { client: clientId, view, id } = btn.dataset;
  if (!confirm(`Delete this ${CARD_SECTIONS[view].noun}? This can't be undone.`)) return;
  btn.disabled = true;
  try {
    // One at a time: the list leaves delete mode once something's gone.
    _deletingLists.delete(`${clientId}:${view}`);
    if (view === 'cases') {
      await dbDeleteCase(id);
      updateClient(clientId, d => {
        d.casesInProgress = (d.casesInProgress || []).filter(c => c.id !== id);
        d.acceptedCases = (d.acceptedCases || []).filter(c => c.id !== id);
        d.notTakenUpCases = (d.notTakenUpCases || []).filter(c => c.id !== id);
      });
      await syncTabAfterCaseChange(clientId);
    } else {
      await dbDeleteActivity(id);
      updateClient(clientId, d => { d[view] = (d[view] || []).filter(it => it.id !== id); });
    }
    await refreshDashboard();
  } catch (err) {
    btn.disabled = false;
    showSaveError(err);
  }
}

function initCardItems(root) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !btn.closest('.row-detail')) return;
    const action = btn.dataset.action;

    if (action === 'open-add') {
      // The form sits right above its own Add button — the Cases list has
      // one per case log as well as its own, so it must be this one.
      const form = btn.closest('.section-actions').previousElementSibling;
      if (!form.classList.contains('open')) _openAddForm(form);
    } else if (action === 'cancel-add') {
      _closeAddForm(btn.closest('.item-add-form'));
    } else if (action === 'save-add') {
      _saveAddForm(btn.closest('.item-add-form'));
    } else if (action === 'toggle-delete') {
      const key = `${btn.dataset.client}:${btn.dataset.view}`;
      const view = btn.closest('.detail-view');
      const on = !_deletingLists.has(key);
      if (on) _deletingLists.add(key); else _deletingLists.delete(key);
      view.classList.toggle('deleting', on);
      btn.textContent = on ? 'Done' : 'Delete';
    } else if (action === 'delete-item') {
      _deleteItem(btn);
    } else if (action === 'add-status') {
      // Opens the case (if it isn't already) with its status box ready.
      const block = btn.closest('.case-block');
      const caseId = block.querySelector('.case-line').dataset.case;
      block.classList.add('open');
      _expandedCases.add(caseId);
      const form = block.querySelector('.case-log .item-add-form');
      if (form.classList.contains('open')) form.querySelector('select')?.focus();
      else _openAddForm(form);
    } else if (action === 'toggle-case') {
      const block = btn.closest('.case-block');
      const open = block.classList.toggle('open');
      if (open) _expandedCases.add(btn.dataset.case); else _expandedCases.delete(btn.dataset.case);
    }
  });

  root.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('.item-add-form [data-field="caseType"]')) _syncCaseFields(t.closest('.item-add-form'));
  });

  root.addEventListener('input', e => {
    if (e.target.matches('.item-add-form [data-field="text"]')) {
      e.target.classList.remove('field-error');
      _syncStatusNote(e.target.closest('.item-add-form'));
    }
  });

  root.addEventListener('keydown', e => {
    const form = e.target.closest?.('.item-add-form');
    if (!form) return;
    if (e.key === 'Enter') { e.preventDefault(); _saveAddForm(form); }
    if (e.key === 'Escape') { e.stopPropagation(); _closeAddForm(form); }
  });
}
