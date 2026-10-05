// Pipeline: Admin mode's Open and Submitted tabs — what's coming in, and
// from whom, at a glance. The whole team (team.js getTeamFas), like
// Home's figures, and their cases — all of them, not tied to a month:
//
//   Open       cases opened but not yet submitted
//   Submitted  cases submitted and waiting to be accepted — the only
//              place a case is accepted (Accept, team.js acceptTeamCase).
//              Only the FA's manager can, so Accept shows on the cases of
//              FAs on the admin's own list; anyone else's say who
//              accepts them.
//
// Grouped by FA, the biggest PCR first; FAs with nothing in that pipeline
// are left out. The FA's line has their case count and PCR total; each
// case under it: client · product · where it's at (an Open case's case
// pack progress; a Submitted case's own stage, if it's moved on to one) ·
// how long it's been waiting (since it was opened / submitted) · PCR.
// Cases waiting longer than _PIPELINE_SLOW_DAYS are highlighted, oldest
// first.

function _injectPipelineCSS() {
  if (document.getElementById('pipeline-styles')) return;
  const s = document.createElement('style');
  s.id = 'pipeline-styles';
  s.textContent = `
    .pl-fa {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: var(--radius);
      margin-bottom: 12px;
      overflow: hidden;
    }
    .pl-fa-head {
      display: flex;
      align-items: baseline;
      gap: 16px;
      padding: 12px 20px;
      background: #f2f2f0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      font-size: 13px;
      color: var(--ink-dim);
    }
    .pl-fa-head .name { font-size: 15px; }
    .pl-fa-head .name b { color: var(--ink); }
    .pl-fa-head .name span { margin-left: 4px; }
    .pl-fa-head .spacer { flex: 1; }
    .pl-fa-head .pl-total b { color: var(--ink); }
    .pl-cases { padding: 2px 20px; }
    .pl-case {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 9px 0;
      font-size: 13px;
      color: var(--ink);
    }
    .pl-case + .pl-case { border-top: 1px solid rgba(0, 0, 0, 0.06); }
    .pl-client { width: 200px; flex-shrink: 0; font-weight: 600; }
    .pl-product { width: 160px; flex-shrink: 0; color: var(--ink-dim); }
    .pl-where { flex: 1; min-width: 0; color: var(--ink-dim); }
    .pl-days { width: 90px; flex-shrink: 0; text-align: right; color: var(--ink-dim); white-space: nowrap; }
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
const _PIPELINE_SLOW_DAYS = { open: 30, submitted: 14 };

const _PIPELINE_EMPTY = {
  open: 'No open cases waiting to be submitted.',
  submitted: 'No submitted cases waiting to be accepted.',
};

function _daysSince(iso) {
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - then) / 86400000));
}

function _pipelineCaseHTML(c, part, canAccept) {
  const days = _daysSince(part === 'open' ? c.openedAt : c.submittedAt);
  const slow = days > _PIPELINE_SLOW_DAYS[part];
  const where = part === 'open'
    ? `Case pack ${caseChecklistDone(c)}/${caseChecklistItems(c).length}`
    : caseStageLabel(c);
  const since = part === 'open' ? 'since opened' : 'since submitted';
  return `
    <div class="pl-case">
      <span class="pl-client">${_escHtml(c.clientName)}</span>
      <span class="pl-product">${_escHtml(c.type)}</span>
      <span class="pl-where">${_escHtml(where)}</span>
      <span class="pl-days${slow ? ' slow' : ''}" title="${days} day${days === 1 ? '' : 's'} ${since}">${days} day${days === 1 ? '' : 's'}</span>
      <span class="pl-pcr">PCR ${formatNumber(casePcr(c))}</span>
      ${part === 'submitted' && canAccept ? `<span class="pl-action"><button type="button" class="pl-accept" data-accept="${c.id}"${isLookOnly() ? ' disabled title="Look only while viewing as another admin"' : ''}>Accept</button></span>` : ''}
    </div>
  `;
}

function _renderPipeline(part) {
  const container = document.getElementById(`${part}-pipeline`);
  if (!container) return;
  const stage = part === 'open' ? 'opened' : 'submitted';
  const cases = getTeamCases().filter(c => c.stage === stage);
  const groups = getTeamFas()
    .map(fa => {
      const own = cases
        .filter(c => c.faId === fa.id)
        .sort((a, b) => (part === 'open' ? a.openedAt.localeCompare(b.openedAt) : a.submittedAt.localeCompare(b.submittedAt)));
      return { fa, cases: own, pcr: own.reduce((t, c) => t + casePcr(c), 0) };
    })
    .filter(g => g.cases.length)
    .sort((a, b) => b.pcr - a.pcr);

  container.innerHTML = groups.length ? groups.map(({ fa, cases: own, pcr }) => {
    const canAccept = canAcceptFor(fa);
    const acceptedBy = part === 'submitted' && !canAccept
      ? `<span title="Only an FA's manager can accept their cases">Accepted by ${_escHtml(managerName(fa) || 'their manager')}</span>`
      : '';
    return `
      <div class="pl-fa">
        <div class="pl-fa-head">
          <div class="name"><b>${_escHtml(fa.name)}</b><span>${_escHtml(fa.surname)}</span></div>
          ${fa.is_active ? '' : '<span>Resigned</span>'}
          ${acceptedBy}
          <span class="spacer"></span>
          <span class="pl-total">${own.length} case${own.length === 1 ? '' : 's'} · PCR <b>${formatNumber(pcr)}</b></span>
        </div>
        <div class="pl-cases">${own.map(c => _pipelineCaseHTML(c, part, canAccept)).join('')}</div>
      </div>
    `;
  }).join('') : `<div class="fa-list-empty">${_PIPELINE_EMPTY[part]}</div>`;

  updateTabCount(document.getElementById(`tab-${part}`)); // index.html — counts the cases
}

function _renderPipelines() {
  _renderPipeline('open');
  _renderPipeline('submitted');
}

function initPipeline(root) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('.pl-accept');
    if (btn) acceptTeamCase(btn.dataset.accept, btn).catch(showSaveError);
  });
  document.addEventListener('team:changed', _renderPipelines);
  // Products load separately; a renamed stage should show its new name.
  document.addEventListener('products:changed', _renderPipelines);
}
