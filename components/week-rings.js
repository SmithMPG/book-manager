// Week rings: the admin Home's team meter (in place of the PCR meter) —
// one ring per week of the business month, against that month's weekly
// submission target (the Calendar, calendar.js).
//
// The rings grow outward through the month: Week 1 is the inner ring,
// and each new week adds a ring around the outside, so the outermost is
// this week. A past month shows all its weeks. Each ring fills with the
// PCR submitted that week (every case whose Submitted date falls in it):
//   met      full, green
//   current  this week, not met yet — gold, filling
//   missed   a past week that fell short — red, as far as it got
//   none     no target set — just the track
// The centre: this week's PCR against the target (a past month: the
// month's total against its weeks' targets). Under the rings, a key with
// each week's figures, then the month.
//
// data.js works the weeks out and hands them over with update().

function _injectWeekRingsCSS() {
  if (document.getElementById('week-rings-styles')) return;
  const s = document.createElement('style');
  s.id = 'week-rings-styles';
  s.textContent = `
    .week-rings { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0; }
    .week-rings[hidden] { display: none; }
    .wr-svg { width: 100%; max-width: 280px; }
    .wr-svg circle { fill: none; }
    .wr-track { stroke: var(--track-light); }
    .wr-fill { stroke-linecap: round; transition: stroke-dasharray 0.3s ease; }
    .wr-fill.met { stroke: var(--green); }
    .wr-fill.current { stroke: var(--gold); }
    .wr-fill.missed { stroke: var(--red); }
    .wr-value { fill: var(--ink); font-size: 24px; font-weight: 700; font-family: inherit; }
    .wr-of, .wr-note { fill: var(--ink-dim); font-size: 12px; font-family: inherit; }

    .wr-key { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--ink-dim); min-width: 220px; }
    .wr-key-row { display: flex; align-items: center; gap: 8px; }
    .wr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--track-light); }
    .wr-dot.met { background: var(--green); }
    .wr-dot.current { background: var(--gold); }
    .wr-dot.missed { background: var(--red); }
    .wr-key b { color: var(--ink); font-weight: 600; }
    .wr-period { margin-top: 6px; font-size: 14px; font-weight: 600; color: var(--ink-dim); text-align: center; }
  `;
  document.head.appendChild(s);
}
_injectWeekRingsCSS();

const _WR_SIZE = 300;
const _WR_INNER = 62;  // Week 1's radius
const _WR_STEP = 17;   // each later week's ring sits this much further out
const _WR_WIDTH = 12;

class WeekRings {
  constructor(container) {
    this.container = container;
    this.config = { weeks: [], target: null, centre: null, periodLabel: '' };
    this.render();
  }

  // weeks: [{week, pcr, state: 'met'|'current'|'missed'|'none'}] — only
  // the weeks so far; target: the weekly target (PCR) or null; centre:
  // {value, of, note}.
  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  show(on) {
    this.container.hidden = !on;
  }

  render() {
    const { weeks, target, centre, periodLabel } = this.config;
    const c = _WR_SIZE / 2;
    const rings = weeks.map((w, i) => {
      const r = _WR_INNER + i * _WR_STEP;
      const circ = 2 * Math.PI * r;
      const frac = target ? Math.min(w.pcr / target, 1) : 0;
      const fill = frac > 0
        ? `<circle class="wr-fill ${w.state}" cx="${c}" cy="${c}" r="${r}" stroke-width="${_WR_WIDTH}"
             stroke-dasharray="${(circ * frac).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${c} ${c})" />`
        : '';
      return `<circle class="wr-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${_WR_WIDTH}" />${fill}`;
    }).join('');
    const tick = w => (w.state === 'met' ? ' ✓' : '');
    const key = weeks.map(w => `
      <div class="wr-key-row">
        <span class="wr-dot ${w.state}"></span>
        <span>W${w.week} · <b>${formatNumber(w.pcr)}</b>${target ? ` / ${formatNumber(target)}` : ''}${tick(w)}</span>
      </div>
    `).join('');
    this.container.innerHTML = `
      <svg viewBox="0 0 ${_WR_SIZE} ${_WR_SIZE}" class="wr-svg" role="img" aria-label="Submitted PCR's by week">
        ${rings}
        ${centre ? `
          <text x="${c}" y="${c - 6}" class="wr-value" text-anchor="middle">${_escHtml(centre.value)}</text>
          <text x="${c}" y="${c + 14}" class="wr-of" text-anchor="middle">${_escHtml(centre.of || '')}</text>
          <text x="${c}" y="${c + 30}" class="wr-note" text-anchor="middle">${_escHtml(centre.note || '')}</text>
        ` : ''}
      </svg>
      ${key ? `<div class="wr-key">${key}</div>` : ''}
      ${periodLabel ? `<div class="wr-period">${_escHtml(periodLabel)}</div>` : ''}
    `;
  }
}

function initWeekRings(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.classList.add('week-rings');
  return new WeekRings(container);
}
