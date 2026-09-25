// Client funnel: horizontal bar chart, descending top-to-bottom, showing
// the sales process end to end. The Meetings bar is further split into
// its three meeting types (Fact Finder / Closing / Relational) as stacked
// segments — the breakdown only shows on hover, no permanent legend.
// The headline percentage defaults to Meetings -> Cases Submitted, but
// clicking any other stage's label (except Cases Submitted itself, which
// would trivially be 100%) switches the headline to that stage's own
// conversion into Cases Submitted. (Wills Leads and Referrals live in
// the hero's right-hand stats, not here — they're side-outputs of
// meetings, not steps in this funnel.)

function _injectClientFunnelCSS() {
  if (document.getElementById('client-funnel-styles')) return;
  const s = document.createElement('style');
  s.id = 'client-funnel-styles';
  s.textContent = `
    .client-funnel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }

    .funnel-headline {
      font-size: 26px;
      font-weight: 700;
      color: var(--ink);
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .funnel-headline span {
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-dim);
    }

    .funnel-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .funnel-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .funnel-row-label {
      width: 130px;
      flex: 0 0 auto;
      text-align: right;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .funnel-row-label-selectable {
      cursor: pointer;
      border-radius: 4px;
      transition: color 0.12s ease;
    }
    .funnel-row-label-selectable:hover { color: var(--ink); }
    .funnel-row-label.active {
      color: var(--gold);
      font-weight: 700;
    }

    .funnel-row-track {
      flex: 0 0 auto;
      height: 22px;
      background: var(--track-light);
      border-radius: 11px;
      position: relative;
      overflow: hidden;
    }

    .funnel-row-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      display: flex;
      border-radius: 11px;
      overflow: hidden;
    }
    .funnel-row-bar-hoverable { cursor: pointer; }

    .funnel-seg-solid,
    .funnel-seg-factfinder { background: var(--gold); }
    .funnel-seg-closing { background: var(--green); }
    .funnel-seg-relational { background: #6f8bb3; }

    .funnel-row-value {
      width: 30px;
      flex: 0 0 auto;
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
    }

    .funnel-tooltip {
      min-height: 16px;
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
    }, config);
    this.selectedStage = 'meetings';
    this.render();
  }

  // Real numbers for this business month (data.js refreshDashboard).
  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  render() {
    const c = this.config;
    const meetingsTotal = c.meetings.factFinder + c.meetings.closing + c.meetings.relational;

    const stages = [
      { key: 'prospects', label: 'Prospects Contacted', value: c.prospectsContacted },
      { key: 'meetings', label: 'Meetings', value: meetingsTotal, stacked: c.meetings },
      { key: 'fnas', label: 'FNAs', value: c.fnas },
      { key: 'quotes', label: 'Quotes', value: c.quotes },
      { key: 'cases', label: 'Cases Submitted', value: c.casesSubmitted },
    ];

    const maxValue = Math.max(...stages.map(s => s.value), 1);
    const maxBarWidth = 240;

    const selectedStage = stages.find(s => s.key === this.selectedStage) || stages[1];
    const conversion = selectedStage.value > 0 ? Math.round((c.casesSubmitted / selectedStage.value) * 100) : 0;

    const rowsHtml = stages.map(stage => {
      const fillWidth = Math.max((stage.value / maxValue) * maxBarWidth, 6);

      const segments = stage.stacked
        ? [
            ['funnel-seg-factfinder', stage.stacked.factFinder],
            ['funnel-seg-closing', stage.stacked.closing],
            ['funnel-seg-relational', stage.stacked.relational],
          ]
        : [['funnel-seg-solid', stage.value]];

      const segHtml = segments.map(([cls, v]) => {
        const segWidth = stage.value > 0 ? (v / stage.value) * fillWidth : 0;
        return `<div class="funnel-seg ${cls}" style="width:${segWidth}px"></div>`;
      }).join('');

      // Cases Submitted can't convert into itself, so its label isn't selectable.
      const selectable = stage.key !== 'cases';
      const labelClass = 'funnel-row-label' +
        (selectable ? ' funnel-row-label-selectable' : '') +
        (stage.key === this.selectedStage ? ' active' : '');

      return `
        <div class="funnel-row" data-stage="${stage.key}">
          <div class="${labelClass}"${selectable ? ` data-select-stage="${stage.key}"` : ''}>${stage.label}</div>
          <div class="funnel-row-track" style="width:${maxBarWidth}px">
            <div class="funnel-row-bar${stage.stacked ? ' funnel-row-bar-hoverable' : ''}" style="width:${fillWidth}px">${segHtml}</div>
          </div>
          <div class="funnel-row-value">${stage.value}</div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="client-funnel">
        <div class="funnel-headline">${conversion}%<span>${selectedStage.label} &rarr; Sales</span></div>
        <div class="funnel-rows">${rowsHtml}</div>
        <div class="funnel-tooltip"></div>
      </div>
    `;

    this.container.querySelectorAll('[data-select-stage]').forEach(label => {
      label.addEventListener('click', () => {
        this.selectedStage = label.dataset.selectStage;
        this.render();
      });
    });

    const meetingsBar = this.container.querySelector('.funnel-row-bar-hoverable');
    const tooltip = this.container.querySelector('.funnel-tooltip');
    if (meetingsBar && tooltip) {
      const { factFinder, closing, relational } = c.meetings;
      meetingsBar.addEventListener('mouseenter', () => {
        tooltip.textContent = `Fact Finder ${factFinder} · Closing ${closing} · Relational ${relational}`;
        tooltip.classList.add('visible');
      });
      meetingsBar.addEventListener('mouseleave', () => {
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
