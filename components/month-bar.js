// Month bar: one cell per day of the current production month.
// Relies on the global CLOSE_OFF_DATES array from constants.js.
//
// A production month runs from the day after the previous entry's
// close-off date through this entry's close-off date. The first entry
// in CLOSE_OFF_DATES has no prior entry to derive a start date from, so
// it's excluded — navigation is bounded to periods we can fully compute.

function _injectMonthBarCSS() {
  if (document.getElementById('month-bar-styles')) return;
  const s = document.createElement('style');
  s.id = 'month-bar-styles';
  s.textContent = `
    :root {
      --mb-text: var(--ink);
      --mb-text-dim: var(--ink-dim);
      --mb-accent: var(--gold);
      --mb-elapsed: color-mix(in srgb, var(--green) 87%, black);
      --mb-elapsed-weekend: color-mix(in srgb, var(--green) 75%, black);
      --mb-current: var(--blue);
      --mb-current-weekend: color-mix(in srgb, var(--blue) 75%, black);
      --mb-future: color-mix(in srgb, var(--track-light) 90%, black);
      --mb-future-weekend: color-mix(in srgb, var(--track-light) 60%, black);
    }

    .month-bar-wrapper {
      padding: 20px 24px 0;
    }

    .month-bar {
      margin-bottom: 16px;
      padding-bottom: 26px;
    }

    .mb-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mb-nav {
      background: transparent;
      border: none;
      color: var(--mb-text-dim);
      font-size: 20px;
      line-height: 1;
      padding: 0 6px;
      height: 22px;
      display: flex;
      align-items: center;
      cursor: pointer;
      flex: 0 0 auto;
    }
    .mb-nav:hover:not(:disabled) {
      color: var(--mb-accent);
    }
    .mb-nav:disabled {
      opacity: 0.3;
      cursor: default;
    }

    .mb-track {
      flex: 1;
      min-width: 0;
      height: 22px;
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
    }

    .mb-cell {
      flex: 1 1 0;
      min-width: 0;
      height: 0.75rem;
      border-radius: 11px;
      background: var(--mb-future);
      position: relative;
    }
    .mb-cell.elapsed {
      background: var(--mb-elapsed);
    }
    .mb-cell.current {
      background: var(--mb-current);
    }
    .mb-cell.future {
      background: var(--mb-future);
    }
    /* Weekends read as small round dots (equal width/height), a touch darker
       than their weekday equivalent — weekdays stay pill-shaped. */
    .mb-cell.weekend {
      flex: 0 0 0.75rem;
      border-radius: 50%;
    }
    .mb-cell.weekend.elapsed {
      background: var(--mb-elapsed-weekend);
    }
    .mb-cell.weekend.current {
      background: var(--mb-current-weekend);
    }
    .mb-cell.weekend.future {
      background: var(--mb-future-weekend);
    }

    .mb-cell.checkout-cell {
      cursor: pointer;
    }
    .mb-cell.checkout-cell:hover {
      opacity: 0.85;
    }

    .mb-caption {
      position: absolute;
      top: 30px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      color: var(--mb-text-dim);
      white-space: nowrap;
    }
    .mb-cell.current .mb-caption {
      color: var(--mb-current);
      font-weight: 600;
    }

    .mb-hover-label {
      position: absolute;
      top: 30px;
      transform: translateX(-50%);
      font-size: 11px;
      color: var(--mb-text);
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.1s ease;
    }
    .mb-hover-label.visible {
      opacity: 1;
    }

    /* Mobile: collapse cells to dots, keep the bar full width, drop the
       boundary captions (current-day caption stays, since it's the one
       date people check at a glance). */
    @media (max-width: 640px) {
      .mb-track,
      .mb-nav,
      .mb-cell {
        height: 10px;
      }
      .mb-track {
        gap: 2px;
      }
      .mb-cell {
        border-radius: 5px;
      }
      .mb-cell:not(.current) .mb-caption {
        display: none;
      }
      .mb-caption,
      .mb-hover-label {
        top: 18px;
        font-size: 10px;
      }
    }
  `;
  document.head.appendChild(s);
}
_injectMonthBarCSS();

function buildMonthPeriods() {
  const periods = [];
  for (let i = 1; i < CLOSE_OFF_DATES.length; i++) {
    const prevClose = new Date(CLOSE_OFF_DATES[i - 1].closeOffDate + 'T00:00:00');
    const start = new Date(prevClose);
    start.setDate(start.getDate() + 1);
    const end = new Date(CLOSE_OFF_DATES[i].closeOffDate + 'T00:00:00');
    periods.push({
      label: `${CLOSE_OFF_DATES[i].month} ${CLOSE_OFF_DATES[i].year}`,
      start,
      end,
    });
  }
  return periods;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDayMonth(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Checkout log: every completed weekday (today or in the past) lives in
// this set. Placeholder — wire up to real checkout data later. Checkout
// itself is triggered automatically at 00h00 for the previous day and
// enforced the next time the FA opens the app, so by the time a past
// day is visible here it's already done — there's no lingering
// "missed" state to render. Today stays open until its own midnight.
const COMPLETED_CHECKOUT_DATES = new Set();

function seedDemoCheckoutHistory() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let n = 1; n <= 30; n++) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    if (isWeekend(d)) continue;
    COMPLETED_CHECKOUT_DATES.add(isoDate(d));
  }
}
seedDemoCheckoutHistory();

function isCheckedOut(date) {
  return COMPLETED_CHECKOUT_DATES.has(isoDate(date));
}

class MonthBar {
  constructor(container, options = {}) {
    this.container = container;
    this.onNavigate = options.onNavigate;
    this.periods = buildMonthPeriods();
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);
    this.index = this.findDefaultIndex();
    this.render();
  }

  findDefaultIndex() {
    const idx = this.periods.findIndex(p => this.today >= p.start && this.today <= p.end);
    if (idx !== -1) return idx;
    return this.today < this.periods[0].start ? 0 : this.periods.length - 1;
  }

  render() {
    const period = this.periods[this.index];

    this.container.innerHTML = '';
    this.container.className = 'month-bar';

    const row = document.createElement('div');
    row.className = 'mb-row';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'mb-nav';
    prevBtn.textContent = '‹';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.disabled = this.index === 0;
    prevBtn.addEventListener('click', () => {
      this.index--;
      this.render();
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'mb-nav';
    nextBtn.textContent = '›';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.disabled = this.index === this.periods.length - 1;
    nextBtn.addEventListener('click', () => {
      this.index++;
      this.render();
    });

    const track = document.createElement('div');
    track.className = 'mb-track';

    const days = [];
    const cursor = new Date(period.start);
    while (cursor <= period.end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const hoverLabel = document.createElement('div');
    hoverLabel.className = 'mb-hover-label';

    days.forEach((date, i) => {
      const cell = document.createElement('div');
      cell.className = 'mb-cell';
      if (isWeekend(date)) cell.classList.add('weekend');

      const isToday = isSameDay(date, this.today);
      const isWeekday = !isWeekend(date);
      if (isToday) cell.classList.add('current');
      else if (date < this.today) cell.classList.add('elapsed');
      else cell.classList.add('future');

      // Checkout is automatic at 00h00 for the previous day and enforced
      // the next time the FA opens the app, so any past weekday shown
      // here is already done. Only allow manual (re-)checkout on
      // weekdays that are today or in the past.
      if (isWeekday && (isToday || date < this.today)) {
        cell.classList.add('checkout-cell');
        cell.title = isCheckedOut(date) ? 'Checkout complete' : `Complete checkout for ${formatDayMonth(date)}`;
        cell.addEventListener('click', () => window.openCheckout?.(date));
      }

      // Boundary days and today always show their date; every other cell
      // only reveals it on hover — never both at once for the same cell.
      const isBoundary = i === 0 || i === days.length - 1;
      const hasPermanentCaption = isBoundary || isToday;
      if (hasPermanentCaption) {
        const caption = document.createElement('span');
        caption.className = 'mb-caption';
        caption.textContent = formatDayMonth(date);
        cell.appendChild(caption);
      } else {
        cell.addEventListener('mouseenter', () => {
          hoverLabel.textContent = formatDayMonth(date);
          hoverLabel.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
          hoverLabel.classList.add('visible');
        });
        cell.addEventListener('mouseleave', () => {
          hoverLabel.classList.remove('visible');
        });
      }

      track.appendChild(cell);
    });

    track.appendChild(hoverLabel);
    row.appendChild(prevBtn);
    row.appendChild(track);
    row.appendChild(nextBtn);
    this.container.appendChild(row);

    this.onNavigate?.(period);
  }
}

let _monthBarInstance = null;

function initMonthBar(containerId, options) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  _monthBarInstance = new MonthBar(container, options);
  return _monthBarInstance;
}

function markDateCheckedOut(date) {
  COMPLETED_CHECKOUT_DATES.add(isoDate(date));
  _monthBarInstance?.render();
}

// The current real-world period's label (e.g. "September 2026"). Used to
// seed the PCR meter's initial label before any navigation happens.
function getCurrentPeriodLabel() {
  const periods = buildMonthPeriods();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const idx = periods.findIndex(p => today >= p.start && today <= p.end);
  const period = idx !== -1 ? periods[idx] : (today < periods[0].start ? periods[0] : periods[periods.length - 1]);
  return period.label;
}
