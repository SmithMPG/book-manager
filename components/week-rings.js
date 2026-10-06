// Week rings: the admin Home's team meter (in place of the PCR meter) —
// one ring per week of the business month, against that month's weekly
// submission target (the Calendar, calendar.js).
//
// Drawn like the PCR meter (pcr-meter.js, whose arc helpers and label
// styles it uses): each ring is open at the bottom, with "PCR's" in the
// gap, 0 at the bottom left and the weekly target at the bottom right.
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
// each week's figures; the month's name under the rings, as the meter.
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
    .wr-svg path { fill: none; stroke-linecap: round; }
    .wr-fill.met { stroke: var(--green); }
    .wr-fill.current { stroke: var(--gold); }
    .wr-fill.missed { stroke: var(--red); }
    .wr-value { fill: var(--ink); font-size: 26px; font-weight: 700; font-family: inherit; }
    .wr-of, .wr-note { fill: var(--ink-dim); font-size: 12px; font-family: inherit; }

    .wr-key { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--ink-dim); min-width: 220px; }
    .wr-key-row { display: flex; align-items: center; gap: 8px; }
    .wr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--track-light); }
    .wr-dot.met { background: var(--green); }
    .wr-dot.current { background: var(--gold); }
    .wr-dot.missed { background: var(--red); }
    .wr-key b { color: var(--ink); font-weight: 600; }
  `;
  document.head.appendChild(s);
}
_injectWeekRingsCSS();

// The same frame and space as the PCR meter (pcr-meter.js _renderSingle):
// its ring is 20 thick at radius 100, so its outer edge is 110. The week
// rings share the space inside that edge: one week is drawn exactly like
// the meter; each added week goes round the outside and they all get
// thinner, down to what fits between _WR_BAND_INNER and the edge. 0, the
// target, "PCR's" and the month sit where the meter has them.
const _WR_SIZE = 280;
const _WR_OUTER_EDGE = 110;
const _WR_BAND_INNER = 64;   // inner edge with the most weeks (the centre text sits inside)
const _WR_MAX_WIDTH = 20;    // the meter's thickness
const _WR_RING_GAP = 3;      // between rings
const _WR_GAP = 60;    // the opening at the bottom, in degrees, as the meter's
const _WR_START = 180 + _WR_GAP / 2;
const _WR_END = 180 - _WR_GAP / 2 + 360;

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
    // n rings fill the band from the outer edge inward, Week 1 innermost.
    const n = Math.max(weeks.length, 1);
    const width = Math.min(_WR_MAX_WIDTH, (_WR_OUTER_EDGE - _WR_BAND_INNER - _WR_RING_GAP * (n - 1)) / n);
    const radius = i => _WR_OUTER_EDGE - width / 2 - (n - 1 - i) * (width + _WR_RING_GAP);
    const arc = (r, a1, a2, cls) =>
      (a2 - a1 > 0.05 ? `<path class="${cls}" d="${pcrDescribeArc(c, c, r, a1, a2)}" stroke-width="${width.toFixed(1)}" />` : '');
    const rings = weeks.map((w, i) => {
      const r = radius(i);
      const frac = target ? Math.min(w.pcr / target, 1) : 0;
      return arc(r, _WR_START, _WR_END, 'pcr-track')
        + arc(r, _WR_START, _WR_START + (_WR_END - _WR_START) * frac, `wr-fill ${w.state}`);
    }).join('');

    // 0 and the target sit just outside the ring ends, and "PCR's" in the
    // opening — the meter's places (its radius 100).
    const tickR = _WR_OUTER_EDGE + 16;
    const t0 = pcrPolarToCartesian(c, c, tickR, _WR_START);
    const t1 = pcrPolarToCartesian(c, c, tickR, _WR_END);
    const ticks = weeks.length ? `
      <text x="${t0.x}" y="${t0.y}" class="pcr-tick" text-anchor="middle">0</text>
      <text x="${t1.x}" y="${t1.y}" class="pcr-tick" text-anchor="middle">${target ? pcrFormatCompact(target) : '–'}</text>
    ` : '';
    const headingY = c + 100 * 0.92;

    const tick = w => (w.state === 'met' ? ' ✓' : '');
    const key = weeks.map(w => `
      <div class="wr-key-row">
        <span class="wr-dot ${w.state}"></span>
        <span>W${w.week} · <b>${formatNumber(w.pcr)}</b>${target ? ` / ${formatNumber(target)}` : ''}${tick(w)}</span>
      </div>
    `).join('');
    this.container.innerHTML = `
      <svg viewBox="0 0 ${_WR_SIZE} ${_WR_SIZE + 46}" class="wr-svg" role="img" aria-label="Submitted PCR's by week">
        ${rings}
        ${ticks}
        ${centre ? `
          <text x="${c}" y="${c - 10}" class="wr-value" text-anchor="middle">${_escHtml(centre.value)}</text>
          <text x="${c}" y="${c + 12}" class="wr-of" text-anchor="middle">${_escHtml(centre.of || '')}</text>
          <text x="${c}" y="${c + 28}" class="wr-note" text-anchor="middle">${_escHtml(centre.note || '')}</text>
        ` : ''}
        <text x="${c}" y="${headingY}" class="pcr-heading" text-anchor="middle">PCR&#8217;s</text>
        ${periodLabel ? `<text x="${c}" y="${_WR_SIZE + 4}" class="pcr-period" text-anchor="middle">${_escHtml(periodLabel)}</text>` : ''}
      </svg>
      ${key ? `<div class="wr-key">${key}</div>` : ''}
    `;
  }
}

function initWeekRings(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.classList.add('week-rings');
  return new WeekRings(container);
}
