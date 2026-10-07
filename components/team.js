// FA list: Admin mode's Financial Advisers page (from the tab bar's
// menu) — the FAs on the signed-in admin's list (users.manager_id), like
// a client list but of people, split into Active and Left.
//
// Collapsed row: name, branch, Validation target, how many open cases
// they have and how many are submitted, and an edit button at the far
// right. Clicking the row opens their open cases, read-only (one row open
// at a time). Accepting is done on the Submitted tab (pipeline.js), with
// acceptTeamCase below — the manager's alone, FAs can't (set_case_stage
// in supabase/schema.sql).
//
// This file also holds the admin's team for the Open and Submitted tabs
// (getTeamFas, getTeamCases; 'team:changed' when they reload).
//
// Viewing as: the super admin can pick another admin from the picker
// beside the mode toggle and see Admin mode as they do — their FA list,
// which cases they can accept. Look only: Accept, edit and + are shown
// but greyed out (isLookOnly).
//
// Edit: name, surname and Validation target, and marking them as left
// (or bringing them back). FAs who've left (users.is_active = false)
// can't sign in and drop off the leaderboard; their clients and history
// stay. The floating + creates a login for someone
// new (the add-fa Edge Function) and shows their temporary password.
//
// Loaded whenever Admin mode is switched to; reads and writes go through
// data.js.

function _injectTeamCSS() {
  if (document.getElementById('team-styles')) return;
  const s = document.createElement('style');
  s.id = 'team-styles';
  s.textContent = `
    /* Financial Advisers: Active / Left. */
    .fa-views {
      display: inline-flex;
      background: #d4d6d8;
      border-radius: 8px;
      padding: 3px;
      gap: 2px;
      margin-bottom: 16px;
    }
    .fa-view {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      color: #4b5563;
      cursor: pointer;
    }
    .fa-view.active { background: #ffffff; color: var(--navy); font-weight: 600; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }

    .fa-row {
      background: #f2f2f0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: var(--radius);
      padding: 14px 20px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 24px;
      cursor: pointer;
      color: var(--ink-dim);
      font-size: 13px;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    .fa-row .name { min-width: 180px; font-size: 15px; }
    .fa-row .name b { color: var(--ink); }
    .fa-row .name span { margin-left: 4px; }
    .fa-row .fa-meta { white-space: nowrap; }
    .fa-row .spacer { flex: 1; }
    .fa-row.active { background: var(--navy); border-color: var(--navy); color: var(--text-dim); }
    .fa-row.active .name b { color: var(--text); }

    .fa-chip {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 999px;
      padding: 4px 11px;
      font-size: 12px;
      color: var(--ink);
      white-space: nowrap;
    }
    .fa-chip.to-accept { background: var(--gold); border-color: var(--gold); color: var(--navy); font-weight: 600; }
    .fa-chip.pending { font-style: italic; color: var(--ink-dim); }
    .fa-row.active .fa-chip:not(.to-accept) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.25); color: var(--text); }

    .fa-edit {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.15);
      background: transparent;
      color: var(--ink-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .fa-edit:hover { border-color: var(--gold); color: #8a6d0a; background: rgba(212, 175, 55, 0.1); }
    .fa-row.active .fa-edit { border-color: rgba(255, 255, 255, 0.35); color: var(--text-dim); }
    .fa-row.active .fa-edit:hover { border-color: var(--gold); color: var(--gold-soft); }
    .fa-edit:disabled,
    .fab:disabled { opacity: 0.4; cursor: not-allowed; }
    .fa-edit:disabled:hover { border-color: rgba(0, 0, 0, 0.15); color: var(--ink-dim); background: transparent; }
    .fab:disabled:hover { transform: none; }

    /* The super admin's "Viewing as" picker, beside the mode toggle. */
    .view-as {
      background: var(--navy-lighter);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
      padding: 7px 10px;
      cursor: pointer;
      max-width: 220px;
    }
    .view-as.hidden { display: none; }
    .view-as.looking { border-color: var(--gold); color: var(--gold-soft); }

    .fa-detail {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-top: none;
      border-radius: 0 0 var(--radius) var(--radius);
      margin: -10px 0 10px 0;
      padding: 14px 20px;
      display: none;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .fa-detail.open { display: block; }
    .fa-detail-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }
    .fa-case {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      color: var(--ink);
    }
    .fa-case:last-child { border-bottom: none; }
    .fa-case-client { width: 190px; flex-shrink: 0; font-weight: 600; }
    .fa-case-type { width: 150px; flex-shrink: 0; color: var(--ink-dim); }
    .fa-case-stage { flex: 1; min-width: 0; }
    .fa-case-pcr { flex-shrink: 0; color: var(--ink-dim); width: 120px; text-align: right; }
    .fa-empty { color: var(--ink-dim); padding: 6px 0; }
    .fa-list-empty { color: var(--ink-dim); font-size: 14px; padding: 20px 4px; }

    /* Edit / Add FA: the choice dialog's popup (choice-dialog.js), with a form. */
    .fa-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
    .fa-form label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-dim);
    }
    .fa-form input,
    .fa-form select {
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
      text-transform: none;
      letter-spacing: 0;
      font-weight: 400;
    }
    .fa-form input:focus,
    .fa-form select:focus { border-color: var(--gold); outline: none; }
    .fa-form-error { font-size: 12px; color: var(--red); }
    .fa-form-error:empty { display: none; }
    .fa-form-actions { display: flex; align-items: center; gap: 10px; }
    .fa-form-actions [data-cancel] { margin-left: auto; }
    .fa-resign {
      background: none;
      border: none;
      padding: 0;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink-dim);
      text-decoration: underline;
      cursor: pointer;
    }
    .fa-resign:hover { color: var(--red); }
    .fa-resign.back:hover { color: var(--ink); }
  `;
  document.head.appendChild(s);
}
_injectTeamCSS();

let _teamFas = [];        // users rows on the admin's list
let _pipelineFas = [];    // everyone whose cases the Open and Submitted tabs show
let _teamCases = [];      // open cases of everyone in _pipelineFas (data.js dbLoadOpenCasesFor)
let _teamOpenId = null;   // the FA whose row is open
let _teamLoadRun = 0;

function _faName(fa) {
  return `${fa.name} ${fa.surname}`;
}

function _faCases(faId) {
  return _teamCases.filter(c => c.faId === faId);
}

function _faCaseHTML(c) {
  return `
    <div class="fa-case">
      <span class="fa-case-client">${_escHtml(c.clientName)}</span>
      <span class="fa-case-type">${_escHtml(c.type)}</span>
      <span class="fa-case-stage">${CASE_STAGE_LABELS[c.stage]} · checklist ${caseChecklistDone(c)}/${caseChecklistItems(c).length}</span>
      <span class="fa-case-pcr">PCR ${formatNumber(casePcr(c))}</span>
    </div>
  `;
}

// Submitted first, then by when they were opened.
function _faDetailHTML(fa) {
  const cases = _faCases(fa.id).sort((a, b) =>
    (a.stage === 'submitted' ? 0 : 1) - (b.stage === 'submitted' ? 0 : 1) || a.openedAt.localeCompare(b.openedAt));
  if (!cases.length) return '<div class="fa-empty">No open cases.</div>';
  return `
    <div class="fa-detail-title">${cases.length} open case${cases.length === 1 ? '' : 's'}</div>
    ${cases.map(_faCaseHTML).join('')}
  `;
}

function _faRowHTML(fa) {
  const cases = _faCases(fa.id);
  const submitted = cases.filter(c => c.stage === 'submitted').length;
  const open = fa.id === _teamOpenId;
  const target = fa.pcr_target ? `Target ${formatNumber(fa.pcr_target)}` : 'No target';
  return `
    <div class="fa-wrapper">
      <div class="fa-row${open ? ' active' : ''}" data-fa-id="${fa.id}">
        <div class="name"><b>${_escHtml(fa.name)}</b><span>${_escHtml(fa.surname)}</span></div>
        <span class="fa-meta">${_escHtml(fa.branch || '')}</span>
        <span class="fa-meta">${target}</span>
        <span class="spacer"></span>
        ${fa.password_set ? '' : '<span class="fa-chip pending" title="Hasn\'t signed in and set a password yet">Not signed in yet</span>'}
        ${cases.length ? `<span class="fa-chip">${cases.length} open case${cases.length === 1 ? '' : 's'}</span>` : ''}
        ${submitted ? `<span class="fa-chip to-accept">${submitted} submitted</span>` : ''}
        <button type="button" class="fa-edit" data-fa-edit title="${isLookOnly() ? 'Look only while viewing as another admin' : `Edit ${_escHtml(fa.name)}`}"${isLookOnly() ? ' disabled' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
      <div class="fa-detail${open ? ' open' : ''}">${_faDetailHTML(fa)}</div>
    </div>
  `;
}

function _renderTeamList(containerId, fas, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const sorted = [...fas].sort((a, b) => _faName(a).localeCompare(_faName(b)));
  container.innerHTML = sorted.length
    ? sorted.map(_faRowHTML).join('')
    : `<div class="fa-list-empty">${emptyText}</div>`;
}

// Which list the Financial Advisers page shows: 'active' or 'left'.
let _faView = 'active';

function _renderTeam() {
  const active = _teamFas.filter(f => f.is_active);
  const left = _teamFas.filter(f => !f.is_active);
  _renderTeamList('team-cards', active, 'No FAs on your list yet. Use + (bottom right) to add one.');
  _renderTeamList('left-cards', left, 'Nobody on your list has left.');
  document.getElementById('team-cards')?.toggleAttribute('hidden', _faView !== 'active');
  document.getElementById('left-cards')?.toggleAttribute('hidden', _faView !== 'left');
  document.querySelectorAll('[data-fa-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.faView === _faView);
    const count = b.querySelector('.tab-count');
    if (count) count.textContent = (b.dataset.faView === 'active' ? active : left).length;
  });
  document.dispatchEvent(new CustomEvent('team:changed'));  // the Open and Submitted tabs
}

// For the Open and Submitted tabs (pipeline.js): the whole team, like
// Home's figures — every FA (active and left), the Test Book only if
// it's on the admin's own list — and their open cases.
function getTeamFas() {
  return _pipelineFas;
}

function getTeamCases() {
  return _teamCases;
}

// Viewing as (super admin only): another admin's id, or null for your own.
let _viewAs = null;

// The admin whose Admin mode is shown: you, or whoever you're viewing as.
function _viewerId() {
  return _viewAs || currentUser?.id;
}

// Viewing as another admin: everything shows, nothing can be changed.
function isLookOnly() {
  return !!_viewAs && _viewAs !== currentUser?.id;
}

// Whether the admin being shown can accept this FA's cases: they're on
// their list (the database's manages(), schema.sql). Look only still
// shows the button, greyed out.
function canAcceptFor(fa) {
  return !!fa && (fa.manager_id === _viewerId()
    || (!isLookOnly() && !!currentUser?.is_super_admin && fa.branch === 'Test group'));
}

// fa's manager's name, for a case the signed-in admin can't accept.
function managerName(fa) {
  const m = _pipelineFas.find(u => u.id === fa?.manager_id) || null;
  return m ? `${m.name} ${m.surname}` : '';
}

async function loadTeam() {
  const run = ++_teamLoadRun;
  if (!currentUser?.is_admin || getAppMode() !== 'admin') return;
  const everyone = await dbLoadFas();
  const viewer = _viewerId();
  const mine = everyone.filter(u => u.manager_id === viewer);
  const pipeline = everyone.filter(u => u.branch !== 'Test group' || u.manager_id === viewer);
  const cases = await dbLoadOpenCasesFor(pipeline.map(f => f.id));
  if (run !== _teamLoadRun) return;
  _teamFas = mine;
  _pipelineFas = pipeline;
  _teamCases = cases;
  if (!mine.some(f => f.id === _teamOpenId)) _teamOpenId = null;
  _syncViewAs(everyone.filter(u => u.is_admin && u.is_active));
  _renderTeam();
}

// The picker: the super admin's own view first, then every other admin.
// Also greys out + while looking.
function _syncViewAs(admins) {
  const select = document.getElementById('view-as');
  if (!select) return;
  const show = !!currentUser?.is_super_admin && getAppMode() === 'admin';
  select.classList.toggle('hidden', !show);
  if (show) {
    const others = admins.filter(a => a.id !== currentUser.id).sort((a, b) => _faName(a).localeCompare(_faName(b)));
    select.innerHTML = '<option value="">Viewing: my own</option>'
      + others.map(a => `<option value="${a.id}"${a.id === _viewAs ? ' selected' : ''}>Viewing as ${_escHtml(_faName(a))}</option>`).join('');
  }
  select.classList.toggle('looking', isLookOnly());
  document.querySelectorAll('.btn-add-fa').forEach(b => {
    b.disabled = isLookOnly();
    b.title = isLookOnly() ? 'Look only while viewing as another admin' : 'Add an FA';
  });
}

function _clearTeam() {
  _teamLoadRun++;
  _viewAs = null;
  _teamFas = [];
  _pipelineFas = [];
  _teamCases = [];
  _teamOpenId = null;
  _renderTeam();
}

// The admin's FAs for the top bar's search (client-search.js), with the
// tab each is in.
function getFaRecords() {
  return _teamFas.map(fa => ({
    id: fa.id,
    name: _faName(fa),
    tab: 'team',
    tabLabel: fa.is_active ? 'Active' : 'Left',
  }));
}

// Opens one FA's row (closing any other) and scrolls to it — used by
// search. Their tab should already be showing.
function openFaRow(id) {
  const fa = _teamFas.find(f => f.id === id);
  if (fa) _faView = fa.is_active ? 'active' : 'left';
  _teamOpenId = id;
  _renderTeam();
  document.querySelector(`.fa-row[data-fa-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- accepting ----------

// From the Submitted tab (pipeline.js): accepts a case for one of the
// admin's FAs, after confirming. btn is disabled while it saves.
async function acceptTeamCase(caseId, btn) {
  if (isLookOnly()) return;
  const c = _teamCases.find(k => k.id === caseId);
  const fa = c && _pipelineFas.find(f => f.id === c.faId);
  if (!canAcceptFor(fa)) return;
  const lastOpen = !_teamCases.some(k => k.id !== c.id && k.clientId === c.clientId);
  // The final PCR: what it was accepted at — the PCR worked out from its
  // premiums unless the manager changes it.
  btn.disabled = true;
  const accepted = await _faFormDialog({
    title: `Accept ${c.clientName}'s ${c.type}`,
    message: `For ${_faName(fa)}. The final PCR starts as the one worked out from the premiums; change it if the case was accepted at a different value.`
      + (lastOpen ? ` It's ${c.clientName}'s last open case, so they'll move to ${fa.name}'s Clients tab.` : '')
      + " This can't be undone.",
    fields: [{ key: 'finalPcr', label: 'Final PCR', money: true, value: Math.round(casePcr(c)) }],
    submitLabel: 'Accept',
    onSubmit: async v => {
      if (v.finalPcr === null) throw new Error('Enter the final PCR (0 if there is none).');
      await dbSetCaseStage(c.id, 'accepted', _todayIso(), v.finalPcr);
    },
  });
  if (!accepted) {
    btn.disabled = false;
    return;
  }
  _teamCases = _teamCases.filter(k => k.id !== c.id);
  _renderTeam(); // the Submitted tab redraws too ('team:changed')
  await refreshDashboard().catch(showSaveError);
}

// ---------- edit / add ----------

// A popup with a form (also the Products tab's, products.js). fields:
// [{key, label, type?, money?, options?: [{value, label}], value?,
// placeholder?}] — options makes it a dropdown. message: optional text
// above the fields. onSubmit(values) saves and returns nothing, or throws
// to show its message and stay open. extra: an optional link at the
// bottom left, {label, className, onClick(values, close)}. Resolves true
// once saved (or extra finished), false if cancelled.
function _faFormDialog({ title, message, fields, submitLabel, onSubmit, extra }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.innerHTML = `
      <div class="cd-modal" role="dialog" aria-modal="true">
        <h3 class="cd-title">${_escHtml(title)}</h3>
        ${message ? `<p class="cd-message">${_escHtml(message)}</p>` : ''}
        <form class="fa-form" novalidate>
          ${fields.map(f => `
            <label>${_escHtml(f.label)}
              ${f.options ? `
                <select name="${f.key}">
                  ${f.options.map(o => `<option value="${_escHtml(o.value)}"${o.value === f.value ? ' selected' : ''}>${_escHtml(o.label)}</option>`).join('')}
                </select>
              ` : `
                <input name="${f.key}" ${f.money ? MONEY_INPUT_ATTRS : `type="${f.type || 'text'}"`}
                  value="${_escHtml(f.money ? moneyInputValue(f.value) : f.value ?? '')}"
                  placeholder="${_escHtml(f.placeholder || '')}">
              `}
            </label>
          `).join('')}
          <div class="fa-form-error"></div>
          <div class="fa-form-actions">
            ${extra ? `<button type="button" class="fa-resign ${extra.className || ''}" data-extra>${_escHtml(extra.label)}</button>` : ''}
            <button type="button" class="cd-btn plain" data-cancel>Cancel</button>
            <button type="submit" class="cd-btn primary">${_escHtml(submitLabel)}</button>
          </div>
        </form>
      </div>
    `;
    const form = overlay.querySelector('form');
    const errorEl = overlay.querySelector('.fa-form-error');
    const values = () => Object.fromEntries(fields.map(f => {
      const v = form.elements[f.key].value;
      return [f.key, f.money ? parseMoney(v) : v.trim()];
    }));
    const close = result => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(false);
    };
    const busy = on => form.querySelectorAll('button').forEach(b => { b.disabled = on; });
    const run = async fn => {
      errorEl.textContent = '';
      busy(true);
      try {
        if (await fn() !== false) close(true);
      } catch (err) {
        errorEl.textContent = err.message || String(err);
      } finally {
        busy(false);
      }
    };

    form.addEventListener('submit', e => {
      e.preventDefault();
      run(() => onSubmit(values()));
    });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-extra]')?.addEventListener('click', () => run(() => extra.onClick(values())));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    form.querySelector('input, select')?.focus();
  });
}

function _checkName(v) {
  if (!v.name || !v.surname) throw new Error('Name and surname are required.');
}

async function _editFa(fa) {
  const save = async (v, active) => {
    _checkName(v);
    await dbUpdateFa(fa.id, { name: v.name, surname: v.surname, pcrTarget: v.pcrTarget, active });
  };
  const markLeft = async v => {
    _checkName(v);
    const open = _faCases(fa.id).length;
    const ok = await showChoiceDialog({
      title: `Mark ${fa.name} as left?`,
      message: `${_faName(fa)} won't be able to sign in and comes off the leaderboard. Their clients and history are kept.`
        + (open ? ` They still have ${open} open case${open === 1 ? '' : 's'}.` : ''),
      choices: [{ label: 'Cancel', value: null }, { label: 'Mark as left', value: true, primary: true }],
    });
    if (!ok) return false;
    await save(v, false);
  };
  const saved = await _faFormDialog({
    title: `Edit ${_faName(fa)}`,
    fields: [
      { key: 'name', label: 'Name', value: fa.name },
      { key: 'surname', label: 'Surname', value: fa.surname },
      { key: 'pcrTarget', label: 'Validation target (PCR)', money: true, value: fa.pcr_target, placeholder: 'No target' },
    ],
    submitLabel: 'Save',
    onSubmit: v => save(v, fa.is_active),
    extra: fa.is_active
      ? { label: 'Mark as left', onClick: markLeft }
      : { label: 'Bring back to Active', className: 'back', onClick: v => save(v, true) },
  });
  if (!saved) return;
  await loadTeam();
  await refreshDashboard();
}

async function _addFa() {
  let added = null;
  const saved = await _faFormDialog({
    title: 'Add an FA',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'surname', label: 'Surname' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'name@liblink.co.za' },
      { key: 'phone', label: 'Phone (optional)', type: 'tel' },
      { key: 'pcrTarget', label: 'Validation target (PCR)', money: true, placeholder: 'No target' },
    ],
    submitLabel: 'Add FA',
    onSubmit: async v => {
      _checkName(v);
      if (!v.email) throw new Error('Email is required — it\'s what they sign in with.');
      added = await dbAddFa(v);
    },
  });
  if (!saved || !added) return;
  const copy = await showChoiceDialog({
    title: `${added.user.name} is on your list`,
    message: `Their temporary password is ${added.tempPassword} — give it to them with their email (${added.user.email}). `
      + "They'll choose their own password the first time they sign in. This is the only time it's shown.",
    choices: [{ label: 'Copy password', value: true, primary: true }, { label: 'Done', value: null }],
    dismissable: false,
  });
  if (copy) navigator.clipboard?.writeText(added.tempPassword).catch(() => {});
  await loadTeam();
  await refreshDashboard();
}

// ---------- wiring ----------

function initTeam(root) {
  document.querySelector('.topbar-left')?.insertAdjacentHTML('beforeend',
    '<select class="view-as hidden" id="view-as" title="Super admin: see Admin mode as another admin does (look only)"></select>');
  document.getElementById('view-as')?.addEventListener('change', e => {
    _viewAs = e.target.value || null;
    _teamOpenId = null;
    loadTeam().catch(showSaveError);
  });

  root.addEventListener('click', e => {
    if (isLookOnly() && e.target.closest('.btn-add-fa, [data-fa-edit], [data-accept]')) return;
    if (e.target.closest('.btn-add-fa')) {
      _addFa().catch(showSaveError);
      return;
    }
    const view = e.target.closest('[data-fa-view]');
    if (view) {
      _faView = view.dataset.faView;
      _teamOpenId = null;
      _renderTeam();
      return;
    }
    const row = e.target.closest('.fa-row');
    if (!row) return;
    const fa = _teamFas.find(f => f.id === row.dataset.faId);
    if (!fa) return;
    if (e.target.closest('[data-fa-edit]')) {
      _editFa(fa).catch(showSaveError);
      return;
    }
    _teamOpenId = _teamOpenId === fa.id ? null : fa.id;
    _renderTeam();
  });

  document.addEventListener('appmodechange', e => {
    if (e.detail.mode === 'admin') {
      loadTeam().catch(showSaveError);
    } else {
      // Leaving Admin mode: back to your own view next time.
      _viewAs = null;
      document.getElementById('view-as')?.classList.add('hidden');
    }
  });
  // Coming back to the app: pick up cases FAs have opened or submitted
  // since (the Open and Submitted tabs).
  window.addEventListener('focus', () => {
    if (currentUser && getAppMode() === 'admin') loadTeam().catch(console.error);
  });
  document.addEventListener('currentuser:changed', () => {
    if (!currentUser) _clearTeam();
    else loadTeam().catch(showSaveError);
  });
}
