// Week meters: the admin Home's team view (in place of the FA's PCR
// meter) — one PCR meter (pcr-meter.js) per week of the business month,
// each the PCR the team submitted that week (every case whose Submitted
// date falls in it) against the month's weekly submission target (the
// Calendar, calendar.js). Only the weeks so far show (a past month: all
// of them), so the layout grows through the month:
//   1 week    one meter
//   2, 3      a row of meters
//   4         two by two
//   5         Weeks 1–4 two by two, as with 4, and Week 5 big in the
//             middle of them
//   6+        rows of three
// Each meter fills green, gold once the target's met; a past week that
// fell short is red. Under each: "Week 1 ·
// 1–7 Oct", this week's darker.
//
// data.js works the weeks out and hands them over with update().

function _injectWeekMetersCSS() {
  if (document.getElementById('week-meters-styles')) return;
  const s = document.createElement('style');
  s.id = 'week-meters-styles';
  s.textContent = `
    .wm { display: grid; justify-content: center; align-items: center; column-gap: 24px; }
    .wm[hidden] { display: none; }
    .wm .pcr-meter-svg { width: 100%; max-width: none; }
    .wm-current .pcr-period { fill: var(--ink); }

    .wm[data-n="1"] { grid-template-columns: 280px; }
    .wm[data-n="2"] { grid-template-columns: repeat(2, 260px); }
    .wm[data-n="3"] { grid-template-columns: repeat(3, 210px); }
    .wm[data-n="4"] { grid-template-columns: repeat(2, 190px); }
    .wm[data-n="5"] {
      grid-template-columns: 140px 280px 140px;
      grid-template-areas: "w1 w5 w2" "w3 w5 w4";
    }
    .wm[data-n="5"] > :nth-child(1) { grid-area: w1; }
    .wm[data-n="5"] > :nth-child(2) { grid-area: w2; }
    .wm[data-n="5"] > :nth-child(3) { grid-area: w3; }
    .wm[data-n="5"] > :nth-child(4) { grid-area: w4; }
    .wm[data-n="5"] > :nth-child(5) { grid-area: w5; }
    .wm[data-n="6"] { grid-template-columns: repeat(3, 180px); }
  `;
  document.head.appendChild(s);
}
_injectWeekMetersCSS();

class WeekMeters {
  constructor(container) {
    this.container = container;
    this.config = { weeks: [], target: null };
    this.render();
  }

  // weeks: [{week, pcr, state: 'met'|'current'|'missed'|'none', label}]
  // — the weeks so far; target: the weekly target (PCR)
  // or null.
  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  show(on) {
    this.container.hidden = !on;
  }

  render() {
    const { weeks, target } = this.config;
    this.container.dataset.n = Math.min(Math.max(weeks.length, 1), 6);
    this.container.innerHTML = weeks.map(w =>
      `<div class="wm-week${w.state === 'current' ? ' wm-current' : ''}"></div>`).join('');
    this.container.querySelectorAll('.wm-week').forEach((el, i) => {
      const w = weeks[i];
      new PcrMeter(el, {
        validationTarget: target,
        currentCount: w.pcr,
        showValue: true,
        stageNote: target ? `of ${formatNumber(target)}` : null,
        tone: w.state === 'missed' ? 'missed' : null,
        periodLabel: w.label,
      });
    });
  }
}

function initWeekMeters(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.classList.add('wm');
  return new WeekMeters(container);
}
