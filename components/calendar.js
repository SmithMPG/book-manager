// Calendar: Admin mode's ☰ → Calendar — purely for editing. One row per
// month, in date order: the month and year, and two fields, saved as
// soon as either changes:
//   Close-off date            the business month's last day; it runs from
//                             the day after the previous month's
//   Weekly submission target  the PCR the whole team should submit in
//                             each week of that month (the week meters on
//                             Home, week-meters.js)
// There's always one empty month after the last one with a close-off
// date, ready to fill in. The month bar only reaches months with one.
//
// Months live in the months table (data.js loadMonths / dbSaveMonth);
// the database refuses a close-off date out of order with its
// neighbours, and its message is shown on the row.

function _injectCalendarCSS() {
  if (document.getElementById('calendar-styles')) return;
  const s = document.createElement('style');
  s.id = 'calendar-styles';
  s.textContent = `
    .cal { max-width: 760px; }
    .cal-head,
    .cal-row {
      display: grid;
      grid-template-columns: 1fr 190px 230px;
      align-items: center;
      gap: 16px;
      padding: 0 20px;
    }
    .cal-head {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
      margin-bottom: 8px;
    }
    .cal-row {
      background: #f2f2f0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: var(--radius);
      min-height: 54px;
      margin-bottom: 8px;
      color: var(--ink);
    }
    .cal-row.next { background: transparent; border-style: dashed; }
    .cal-month { font-size: 15px; font-weight: 600; }
    .cal-row.next .cal-month { color: var(--ink-dim); font-weight: 500; }
    .cal-row input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 13px;
      font-family: inherit;
      color: var(--ink);
      background: #ffffff;
    }
    .cal-row input:focus { border-color: var(--gold); outline: none; }
    .cal-row input:disabled { opacity: 0.6; }
    .cal-money { position: relative; }
    .cal-money input { padding-right: 40px; }
    .cal-money span { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--ink-dim); }
    .cal-error { grid-column: 1 / -1; font-size: 12px; color: var(--red); padding-bottom: 8px; }
    .cal-error:empty { display: none; }
  `;
  document.head.appendChild(s);
}
_injectCalendarCSS();

// "2026-10-01" plus n months.
function _addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return isoDate(d);
}

// Every month from the first set up to one after the last with a
// close-off date (or the last with anything set, if later).
function _calendarRows() {
  const months = getMonths();
  const byMonth = new Map(months.map(m => [m.month, m]));
  const withCloseOff = months.filter(m => m.closeOffDate);
  const today = isoDate(new Date()).slice(0, 8) + '01';
  const first = months[0]?.month || today;
  let last = withCloseOff.length ? _addMonths(withCloseOff[withCloseOff.length - 1].month, 1) : first;
  if (months.length && months[months.length - 1].month > last) last = months[months.length - 1].month;
  const rows = [];
  for (let m = first; m <= last; m = _addMonths(m, 1)) {
    rows.push(byMonth.get(m) || { month: m, label: monthLabel(m), closeOffDate: null, weeklyTarget: null });
  }
  return rows;
}

function _calendarRowHTML(m, isNext) {
  return `
    <div class="cal-row${isNext ? ' next' : ''}" data-month="${m.month}">
      <span class="cal-month">${_escHtml(m.label)}</span>
      <input type="date" data-field="closeOffDate" value="${m.closeOffDate || ''}" aria-label="${_escHtml(m.label)} close-off date">
      <label class="cal-money">
        <input ${MONEY_INPUT_ATTRS} data-field="weeklyTarget" value="${moneyInputValue(m.weeklyTarget)}" placeholder="No target" aria-label="${_escHtml(m.label)} weekly submission target">
        <span>PCR</span>
      </label>
      <div class="cal-error"></div>
    </div>
  `;
}

function _renderCalendar() {
  const container = document.getElementById('calendar-months');
  if (!container) return;
  const rows = _calendarRows();
  const lastWithCloseOff = [...rows].reverse().find(r => r.closeOffDate);
  container.innerHTML = `
    <div class="cal">
      <div class="cal-head"><span>Month</span><span>Close-off date</span><span>Weekly submission target</span></div>
      ${rows.map(r => _calendarRowHTML(r, !r.closeOffDate && (!lastWithCloseOff || r.month > lastWithCloseOff.month))).join('')}
    </div>
  `;
}

async function _saveCalendarRow(row) {
  const month = row.dataset.month;
  const closeOffDate = row.querySelector('[data-field="closeOffDate"]').value || null;
  const weeklyTarget = parseMoney(row.querySelector('[data-field="weeklyTarget"]').value);
  const errorEl = row.querySelector('.cal-error');
  errorEl.textContent = '';
  // Clearing a close-off date would leave a gap before a later month's.
  if (!closeOffDate && getMonths().some(m => m.month > month && m.closeOffDate)) {
    errorEl.textContent = 'A later month has a close-off date, so this one needs one too.';
    return;
  }
  row.querySelectorAll('input').forEach(i => { i.disabled = true; });
  try {
    await dbSaveMonth(month, { closeOffDate, weeklyTarget }); // reloads and redraws ('months:changed')
  } catch (err) {
    console.error(err);
    row.querySelectorAll('input').forEach(i => { i.disabled = false; });
    errorEl.textContent = `Couldn't save — ${err.message || err}`;
  }
}

function initCalendar(root) {
  root.addEventListener('change', e => {
    const row = e.target.closest?.('.cal-row');
    if (row && e.target.matches('[data-field]')) _saveCalendarRow(row);
  });
  document.addEventListener('months:changed', _renderCalendar);
  _renderCalendar();
}
