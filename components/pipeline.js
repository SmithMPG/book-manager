// Pipeline: Admin mode's Cases tab — what's coming in, and from whom, at
// a glance. The whole team (team.js getTeamFas), like Home's figures, and
// their open and submitted cases — all of them, not tied to a month.
//
// One row per FA with any, like a collapsed client card, in columns:
// name · Open (its PCR) · Submitted (its PCR, gold
// where the admin can accept them), under headings. The biggest
// PCR first. Clicking a row opens their cases (one row open at a time),
// submitted first: the date it's been waiting since (submitted, or
// opened — as on the timeline: Today, Yesterday, 9 Oct 2026; red past
// _PIPELINE_SLOW_DAYS, the days on hover) · client · product · stage ·
// checklist progress (4/7) · PCR — and on a submitted case,
// Accept: the only place a case is accepted (team.js acceptTeamCase).
// Only the FA's manager can, so Accept shows on the cases of FAs on the
// admin's own list; anyone else's say who accepts them. The manager can
// also change the date (a ✎ on hover — as on the timeline): the case's
// opened date, or submitted date once submitted (team.js
// setTeamCaseDate).
//
// Rows reuse the FA list's styles (team.js: .fa-wrapper, .fa-row, …).

function _injectPipelineCSS() {
  if (document.getElementById('pipeline-styles')) return;
  const s = document.createElement('style');
  s.id = 'pipeline-styles';
  s.textContent = `
    /* Open and Submitted line up row under row, under their headings. */
    /* Just the PCR, right-aligned, so the figures line up. */
    .pl-col { width: 160px; flex-shrink: 0; text-align: right; white-space: nowrap; color: var(--ink); }
    .pl-col.none { color: var(--ink-dim); }
    .pl-col b { font-weight: 600; }
    .pl-col.can-accept b { color: #8a6d0a; }
    .fa-row.active .pl-col { color: var(--text); }
    .fa-row.active .pl-col.none { color: var(--text-dim); }
    .fa-row.active .pl-col.can-accept b { color: var(--gold-soft); }
    .pl-head {
      display: flex;
      gap: 24px;
      padding: 0 21px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
    }
    .pl-head span:first-child { flex: 1; }
    .pl-note { font-size: 12px; color: var(--ink-dim); margin-bottom: 4px; }
    .pl-case {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 0;
      font-size: 13px;
      color: var(--ink);
    }
    .pl-case + .pl-case { border-top: 1px solid rgba(0, 0, 0, 0.06); }
    .pl-client { width: 190px; flex-shrink: 0; font-weight: 600; }
    .pl-product { width: 150px; flex-shrink: 0; color: var(--ink-dim); }
    .pl-stage { width: 90px; flex-shrink: 0; color: var(--ink-dim); }
    .pl-where { flex: 1; min-width: 0; color: var(--ink-dim); }
    .pl-date { width: 96px; flex-shrink: 0; color: var(--ink-dim); white-space: nowrap; }
    .pl-date.slow { color: var(--red); font-weight: 600; }
    .pl-date:has(.tl-date-input) { width: auto; }
    .pl-date-edit {
      visibility: hidden;
      background: none;
      border: none;
      padding: 0 0 0 6px;
      font-size: 12px;
      line-height: 1;
      color: var(--ink-dim);
      cursor: pointer;
    }
    .pl-date:hover .pl-date-edit { visibility: visible; }
    .pl-date-edit:hover { color: #8a6d0a; }
    .pl-pcr { width: 130px; flex-shrink: 0; text-align: right; white-space: nowrap; }
    .pl-action { width: 80px; flex-shrink: 0; display: flex; justify-content: flex-end; }
    .pl-accept {
      background: var(--gold);
      border: 1px solid var(--gold);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      color: var(--navy);
      cursor: pointer;
    }
    .pl-accept:hover { opacity: 0.9; }
    .pl-accept:disabled { opacity: 0.4; cursor: not-allowed; }
  `;
  document.head.appendChild(s);
}
_injectPipelineCSS();

// Waiting longer than this many days is highlighted.
const _PIPELINE_SLOW_DAYS = { opened: 30, submitted: 14 };

let _pipelineOpenFa = null; // the FA whose row is open

function _daysSince(iso) {
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - then) / 86400000));
}

function _pipelineCaseHTML(c, canAccept) {
  const submitted = c.stage === 'submitted';
  const since = submitted ? c.submittedAt : c.openedAt;
  const days = _daysSince(since);
  const slow = days > _PIPELINE_SLOW_DAYS[c.stage];
  const pencil = canAccept && since && !isLookOnly()
    ? `<button type="button" class="pl-date-edit" data-case-date="${c.id}" data-date="${since}" title="Change the ${submitted ? 'submitted' : 'opened'} date">✎</button>`
    : '';
  const accept = submitted && canAccept
    ? `<button type="button" class="pl-accept" data-accept="${c.id}"${isLookOnly() ? ' disabled title="Look only while viewing as another admin"' : ''}>Accept</button>`
    : '';
  return `
    <div class="pl-case">
      <span class="pl-date${slow ? ' slow' : ''}" title="${submitted ? 'Submitted' : 'Opened'} ${days} day${days === 1 ? '' : 's'} ago">${since ? _dayLabel(since) : '–'}${pencil}</span>
      <span class="pl-client">${_escHtml(c.clientName)}</span>
      <span class="pl-product">${_escHtml(c.type)}</span>
      <span class="pl-stage">${CASE_STAGE_LABELS[c.stage]}</span>
      <span class="pl-where">Checklist ${caseChecklistDone(c)}/${caseChecklistItems(c).length}</span>
      <span class="pl-pcr">PCR ${formatNumber(casePcr(c))}</span>
      <span class="pl-action">${accept}</span>
    </div>
  `;
}

function _pipelineFaHTML({ fa, cases, pcr }) {
  const open = fa.id === _pipelineOpenFa;
  const at = stage => cases.filter(c => c.stage === stage);
  // The PCR ("1 240 000"; the case count on hover), or "–".
  const col = (list, cls = '') => (list.length
    ? `<span class="pl-col ${cls}" title="${list.length} case${list.length === 1 ? '' : 's'}"><b>${formatNumber(list.reduce((t, c) => t + casePcr(c), 0))}</b></span>`
    : '<span class="pl-col none">–</span>');
  const opened = at('opened');
  const submitted = at('submitted');
  const canAccept = canAcceptFor(fa);
  const note = !canAccept && submitted.length
    ? `<div class="pl-note">Only ${_escHtml(managerName(fa) || 'their manager')} can accept these.</div>`
    : '';
  return `
    <div class="fa-wrapper">
      <div class="fa-row${open ? ' active' : ''}" data-pipeline-fa="${fa.id}">
        <div class="name"><b>${_escHtml(fa.name)}</b><span>${_escHtml(fa.surname)}</span></div>
        ${fa.is_active ? '' : '<span class="fa-meta">Left</span>'}
        <span class="spacer"></span>
        ${col(opened)}
        ${col(submitted, canAccept ? 'can-accept' : '')}
      </div>
      <div class="fa-detail${open ? ' open' : ''}">${note}${cases.map(c => _pipelineCaseHTML(c, canAccept)).join('')}</div>
    </div>
  `;
}

function _renderPipeline() {
  const container = document.getElementById('cases-pipeline');
  if (!container) return;
  const all = getTeamCases().filter(isOpenCase);
  const groups = getTeamFas()
    .map(fa => {
      const cases = all
        .filter(c => c.faId === fa.id)
        .sort((a, b) => (a.stage === 'submitted' ? 0 : 1) - (b.stage === 'submitted' ? 0 : 1)
          || (a.submittedAt || a.openedAt).localeCompare(b.submittedAt || b.openedAt));
      return { fa, cases, pcr: cases.reduce((t, c) => t + casePcr(c), 0) };
    })
    .filter(g => g.cases.length)
    .sort((a, b) => b.pcr - a.pcr);
  if (!groups.some(g => g.fa.id === _pipelineOpenFa)) _pipelineOpenFa = null;

  container.innerHTML = groups.length
    ? '<div class="pl-head"><span>Financial adviser</span><span class="pl-col">Open</span><span class="pl-col">Submitted</span></div>'
      + groups.map(_pipelineFaHTML).join('')
    : '<div class="fa-list-empty">No open or submitted cases.</div>';
  // The tab's count is the cases (index.html updateTabCount reads it).
  const tab = document.getElementById('tab-cases');
  if (tab) {
    tab.dataset.count = all.length;
    updateTabCount(tab);
  }
}

// The ✎ on a case's date: a date picker in its place (no later than
// today); picking a day saves it, Escape or no change puts it back.
function _editPipelineDate(btn) {
  const { caseDate: caseId, date } = btn.dataset;
  const cell = btn.closest('.pl-date');
  const before = cell.innerHTML;
  cell.innerHTML = `<input type="date" class="tl-date-input" value="${date}" max="${_todayIso()}" aria-label="Date">`;
  const input = cell.querySelector('input');
  input.focus();
  let done = false;
  const restore = () => { if (!done) { done = true; cell.innerHTML = before; } };
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') restore();
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', async () => {
    const next = input.value;
    if (done) return;
    if (!next || next === date || next > _todayIso()) return restore();
    done = true;
    input.disabled = true;
    try {
      await setTeamCaseDate(caseId, next);
    } catch (err) {
      cell.innerHTML = before;
      showSaveError(err);
    }
  });
}

function initPipeline(root) {
  root.addEventListener('click', e => {
    const edit = e.target.closest('.pl-date-edit');
    if (edit) {
      _editPipelineDate(edit);
      return;
    }
    const btn = e.target.closest('.pl-accept');
    if (btn) {
      acceptTeamCase(btn.dataset.accept, btn).catch(showSaveError);
      return;
    }
    const row = e.target.closest('.fa-row[data-pipeline-fa]');
    if (!row) return;
    _pipelineOpenFa = _pipelineOpenFa === row.dataset.pipelineFa ? null : row.dataset.pipelineFa;
    _renderPipeline();
  });
  document.addEventListener('team:changed', _renderPipeline);
  document.addEventListener('products:changed', _renderPipeline); // checklist sizes
}
