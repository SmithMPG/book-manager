// Pipeline: Admin mode's Cases tab — what's coming in, and from whom, at
// a glance. The whole team (team.js getTeamFas), like Home's figures, and
// their open and submitted cases — all of them, not tied to a month.
//
// One row per FA with any, like a collapsed client card, in columns:
// name · Open (its PCR) · Submitted (its PCR, gold
// where the admin can accept them), under headings. The biggest
// PCR first. Clicking a row opens their cases (one row open at a time),
// submitted first: client · product · stage · checklist progress (4/7) ·
// how long it's been waiting (since it was opened / submitted — past
// _PIPELINE_SLOW_DAYS it's highlighted) · PCR — and on a submitted case,
// Accept: the only place a case is accepted (team.js acceptTeamCase).
// Only the FA's manager can, so Accept shows on the cases of FAs on the
// admin's own list; anyone else's say who accepts them.
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
    .pl-days { width: 80px; flex-shrink: 0; text-align: right; color: var(--ink-dim); white-space: nowrap; }
    .pl-days.slow { color: var(--red); font-weight: 600; }
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
  const days = _daysSince(submitted ? c.submittedAt : c.openedAt);
  const slow = days > _PIPELINE_SLOW_DAYS[c.stage];
  const since = submitted ? 'since submitted' : 'since opened';
  const accept = submitted && canAccept
    ? `<button type="button" class="pl-accept" data-accept="${c.id}"${isLookOnly() ? ' disabled title="Look only while viewing as another admin"' : ''}>Accept</button>`
    : '';
  return `
    <div class="pl-case">
      <span class="pl-client">${_escHtml(c.clientName)}</span>
      <span class="pl-product">${_escHtml(c.type)}</span>
      <span class="pl-stage">${CASE_STAGE_LABELS[c.stage]}</span>
      <span class="pl-where">Checklist ${caseChecklistDone(c)}/${caseChecklistItems(c).length}</span>
      <span class="pl-days${slow ? ' slow' : ''}" title="${days} day${days === 1 ? '' : 's'} ${since}">${days} day${days === 1 ? '' : 's'}</span>
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

function initPipeline(root) {
  root.addEventListener('click', e => {
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
