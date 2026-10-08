// Client funnel: this month's sales process as a plain list, top to
// bottom — prospects, meetings, FNAs, quotes, cases submitted — each a
// label with its number, then a last row "Wills 2 · Referrals 3" in the
// same type. Hovering Meetings shows its three types (Fact Finder /
// Closing / Relational) just under the list, without moving anything.

function _injectClientFunnelCSS() {
  if (document.getElementById('client-funnel-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-funnel-styles';
  s.textContent = `
    .client-funnel {
      position: relative;
      width: 260px;
    }

    .funnel-rows { display: flex; flex-direction: column; }

    .funnel-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      padding: 9px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .funnel-row:last-child { border-bottom: none; }
    .funnel-row[data-stage="extra"] { justify-content: flex-start; gap: 10px; }
    .funnel-extra-sep { color: var(--ink-dim); font-size: 14px; }
    .funnel-row-hoverable { cursor: default; }

    .funnel-row-label { font-size: 14px; color: var(--ink-dim); }
    .funnel-row-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }

    .funnel-tooltip {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 6px;
      white-space: nowrap;
      font-size: 12px;
      color: var(--ink-dim);
      opacity: 0;
      transition: opacity 0.12s ease;
    }
    .funnel-tooltip.visible { opacity: 1; }
  `;
  document.head.appendChild(s);
}
_injectClientFunnelCSS();

class ClientFunnel {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({
      prospectsContacted: 0,
      meetings: { factFinder: 0, closing: 0, relational: 0 },
      fnas: 0,
      quotes: 0,
      casesSubmitted: 0,
      willsLeads: 0,
      referrals: 0,
    }, config);
    this.render();
  }

  // Real numbers for this business month (data.js refreshDashboard).
  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  render() {
    const c = this.config;
    const { factFinder, closing, relational } = c.meetings;

    const stages = [
      { key: 'prospects', label: 'Prospects contacted', value: c.prospectsContacted },
      { key: 'meetings', label: 'Meetings', value: factFinder + closing + relational, hoverable: true },
      { key: 'fnas', label: 'FNAs', value: c.fnas },
      { key: 'quotes', label: 'Quotes', value: c.quotes },
      { key: 'cases', label: 'Cases submitted', value: c.casesSubmitted },
    ];

    const rowsHtml = stages.map(stage => `
      <div class="funnel-row${stage.hoverable ? ' funnel-row-hoverable' : ''}" data-stage="${stage.key}">
        <span class="funnel-row-label">${stage.label}</span>
        <span class="funnel-row-value">${stage.value}</span>
      </div>
    `).join('') + `
      <div class="funnel-row" data-stage="extra">
        <span><span class="funnel-row-label">Wills</span> <span class="funnel-row-value">${c.willsLeads}</span></span>
        <span class="funnel-extra-sep">·</span>
        <span><span class="funnel-row-label">Referrals</span> <span class="funnel-row-value">${c.referrals}</span></span>
      </div>
    `;

    this.container.innerHTML = `
      <div class="client-funnel">
        <div class="funnel-rows">${rowsHtml}</div>
        <div class="funnel-tooltip"></div>
      </div>
    `;

    const meetingsRow = this.container.querySelector('.funnel-row-hoverable');
    const tooltip = this.container.querySelector('.funnel-tooltip');
    if (meetingsRow && tooltip) {
      meetingsRow.addEventListener('mouseenter', () => {
        tooltip.textContent = `Fact Finder ${factFinder} · Closing ${closing} · Relational ${relational}`;
        tooltip.classList.add('visible');
      });
      meetingsRow.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    }
  }
}

function initClientFunnel(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new ClientFunnel(container, config);
}
