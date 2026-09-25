// PCR meter: a broken-ring gauge. The ring runs 0 -> High Flyer target,
// with a rounded notch one third of the way round marking the
// Validation target (High Flyer is always 3x Validation). The center
// percentage is measured against Validation until that's cleared, then
// resets to measure against High Flyer (which can run past 100%). Once
// the High Flyer target is reached the whole ring turns gold.

function _injectPcrMeterCSS() {
  if (document.getElementById("pcr-meter-styles")) return;
  const s = document.createElement("style");
  s.id = "pcr-meter-styles";
  s.textContent = `
    .pcr-meter {
      display: flex;
      justify-content: center;
      padding: 8px 0;
    }
    .pcr-meter-svg {
      width: 100%;
      max-width: 280px;
    }
    .pcr-meter-svg path {
      fill: none;
      stroke-linecap: round;
    }

    .pcr-track { stroke: var(--track-light); }
    .pcr-fill-red { stroke: var(--red); }
    .pcr-fill-green { stroke: var(--green); }
    .pcr-fill-gold { stroke: var(--gold); }

    .pcr-tick {
      fill: var(--ink-dim);
      font-size: 12px;
      font-family: inherit;
    }

    .pcr-percent {
      fill: var(--ink);
      font-size: 40px;
      font-weight: 700;
      font-family: inherit;
    }
    .pcr-percent.gold { fill: var(--gold); }

    .pcr-stage {
      fill: var(--ink-dim);
      font-size: 12px;
      font-family: inherit;
    }

    .pcr-heading {
      fill: var(--ink);
      font-family: inherit;
      font-size: 18px;
      font-weight: 700;
    }

    .pcr-period {
      fill: var(--ink-dim);
      font-family: inherit;
      font-size: 1rem;
      font-weight: 700;
    }
  `;
  document.head.appendChild(s);
}
_injectPcrMeterCSS();

function pcrFormatNumber(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Compact tick labels so the ring doesn't feel cramped: 400000 -> "400k", 1200000 -> "1.2m".
function pcrFormatCompact(n) {
  if (n === 0) return "0";
  if (n >= 1000000) {
    const m = n / 1000000;
    return (Number.isInteger(m) ? m.toString() : m.toFixed(1)) + "m";
  }
  if (n >= 1000) {
    const k = n / 1000;
    return (Number.isInteger(k) ? k.toString() : k.toFixed(1)) + "k";
  }
  return Math.round(n).toString();
}

function pcrPolarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function pcrDescribeArc(cx, cy, r, startAngle, endAngle) {
  const start = pcrPolarToCartesian(cx, cy, r, startAngle);
  const end = pcrPolarToCartesian(cx, cy, r, endAngle);
  const sweep = (((endAngle - startAngle) % 360) + 360) % 360;
  const largeArcFlag = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

class PcrMeter {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign(
      {
        validationTarget: null, // users.pcr_target, set by data.js; null = no target
        highFlyerMultiplier: 3,
        currentCount: 0, // set from real accepted cases by data.js refreshDashboard
        periodLabel: "", // e.g. "September 2026" — the live period, not whatever the month bar is navigated to
      },
      config,
    );
    this.render();
  }

  update(config) {
    Object.assign(this.config, config);
    this.render();
  }

  setPeriodLabel(periodLabel) {
    this.config.periodLabel = periodLabel;
    this.render();
  }

  render() {
    const { validationTarget, highFlyerMultiplier, currentCount, periodLabel } = this.config;
    if (!validationTarget) {
      this._renderNoTarget();
      return;
    }
    const highFlyerTarget = validationTarget * highFlyerMultiplier;

    const size = 280;
    const viewBoxHeight = periodLabel ? size + 46 : size;
    const cx = size / 2;
    const cy = size / 2;
    const r = 100;
    const strokeWidth = 20;

    const gap = 60; // main opening at the bottom, for the "PCR's" label
    const notchGap = 14; // small rounded break marking the validation threshold

    const start = 180 + gap / 2;
    const end = 180 - gap / 2 + 360;
    const sweep = end - start;
    const notchAngle = start + sweep / 3;

    const complete = currentCount >= highFlyerTarget;
    const fraction = Math.min(currentCount / highFlyerTarget, 1);
    const inValidationStage = currentCount < validationTarget;
    const percent = inValidationStage ? (currentCount / validationTarget) * 100 : (currentCount / highFlyerTarget) * 100;
    const valueAngle = start + sweep * fraction;

    const segAStart = start;
    const segAEnd = notchAngle - notchGap / 2;
    const segBStart = notchAngle + notchGap / 2;
    const segBEnd = end;

    const segAFillEnd = complete ? segAEnd : Math.min(valueAngle, segAEnd);
    const segBFillEnd = complete ? segBEnd : Math.max(Math.min(valueAngle, segBEnd), segBStart);

    const segAColor = complete ? "gold" : "red";
    const segBColor = complete ? "gold" : "green";

    const arc = (a1, a2) => pcrDescribeArc(cx, cy, r, a1, a2);
    const arcPath = (a1, a2, cls) => (a2 - a1 > 0.05 ? `<path class="${cls}" d="${arc(a1, a2)}" stroke-width="${strokeWidth}" />` : "");

    const tickRadius = r + strokeWidth / 2 + 16;
    const tickPos = (angle) => pcrPolarToCartesian(cx, cy, tickRadius, angle);
    const tickStart = tickPos(segAStart);
    const tickNotch = tickPos(notchAngle);
    const tickEnd = tickPos(segBEnd);

    const headingY = cy + r * 0.92;
    const stageLabel = complete ? "High Flyer!" : inValidationStage ? "to Validation" : "to High Flyer";

    const periodLabelHtml = periodLabel ? `<text x="${cx}" y="${headingY + 52}" class="pcr-period" text-anchor="middle">${periodLabel}</text>` : "";

    this.container.innerHTML = `
      <div class="pcr-meter">
        <svg viewBox="0 0 ${size} ${viewBoxHeight}" class="pcr-meter-svg">
          ${arcPath(segAStart, segAEnd, "pcr-track")}
          ${arcPath(segBStart, segBEnd, "pcr-track")}
          ${arcPath(segAStart, segAFillEnd, `pcr-fill pcr-fill-${segAColor}`)}
          ${arcPath(segBStart, segBFillEnd, `pcr-fill pcr-fill-${segBColor}`)}
          <text x="${tickStart.x}" y="${tickStart.y}" class="pcr-tick" text-anchor="middle">0</text>
          <text x="${tickNotch.x}" y="${tickNotch.y}" class="pcr-tick" text-anchor="middle">${pcrFormatCompact(validationTarget)}</text>
          <text x="${tickEnd.x}" y="${tickEnd.y}" class="pcr-tick" text-anchor="middle">${pcrFormatCompact(highFlyerTarget)}</text>
          <text x="${cx}" y="${cy - 4}" class="pcr-percent${complete ? " gold" : ""}" text-anchor="middle">${Math.round(percent)}%</text>
          <text x="${cx}" y="${cy + 20}" class="pcr-stage" text-anchor="middle">${stageLabel}</text>
          <text x="${cx}" y="${headingY}" class="pcr-heading" text-anchor="middle">PCR&#8217;s</text>
          ${periodLabelHtml}
        </svg>
      </div>
    `;
  }
}

// No Validation target (e.g. the manager): no gauge to fill, just this
// month's PCR total.
PcrMeter.prototype._renderNoTarget = function () {
  const { currentCount, periodLabel } = this.config;
  const size = 280;
  const cx = size / 2;
  const viewBoxHeight = periodLabel ? size + 46 : size;
  const headingY = size / 2 + 100 * 0.92;
  const periodLabelHtml = periodLabel ? `<text x="${cx}" y="${headingY + 52}" class="pcr-period" text-anchor="middle">${periodLabel}</text>` : "";
  this.container.innerHTML = `
    <div class="pcr-meter">
      <svg viewBox="0 0 ${size} ${viewBoxHeight}" class="pcr-meter-svg">
        <text x="${cx}" y="${size / 2 - 4}" class="pcr-percent" text-anchor="middle">${pcrFormatCompact(currentCount)}</text>
        <text x="${cx}" y="${size / 2 + 20}" class="pcr-stage" text-anchor="middle">No target set</text>
        <text x="${cx}" y="${headingY}" class="pcr-heading" text-anchor="middle">PCR&#8217;s</text>
        ${periodLabelHtml}
      </svg>
    </div>
  `;
};

function initPcrMeter(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new PcrMeter(container, config);
}
