// Money: the one way numbers are shown and typed across the app. Whole
// rand only, thousands separated by a plain space: 2500000 → "2 500 000".
// (A plain space, not the locale's non-breaking one, so figures copy
// cleanly into Excel.)
//
// Showing:   formatNumber(2500000) → "2 500 000"   (PCR, counts)
//            formatRand(2500000)   → "R2 500 000"  (rand amounts)
// Typing:    <input data-money> — any input with this attribute formats
//            itself as you type (one listener below covers every one,
//            now and later), keeping the cursor where it was.
// Reading:   parseMoney("2 500 000") → 2500000, or null when empty. Use
//            it wherever a data-money box's value is read.

function formatNumber(n) {
  const v = Math.round(Number(n));
  if (!isFinite(v)) return '0';
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatRand(n) {
  return `R${formatNumber(n)}`;
}

function parseMoney(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

// Attributes for a money input: a text box (number boxes can't show
// spaces) that brings up the number keypad on phones.
const MONEY_INPUT_ATTRS = 'type="text" inputmode="numeric" autocomplete="off" data-money';

// Value to put back into a data-money box: "2 500 000", or '' if unset.
function moneyInputValue(n) {
  return n === null || n === undefined || n === '' ? '' : formatNumber(n);
}

// Runs in the capture phase, before any other 'input' listener, so they
// all see the formatted text (and read it with parseMoney).
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.matches?.('input[data-money]')) return;
  const caret = el.selectionStart ?? el.value.length;
  const digitsBeforeCaret = el.value.slice(0, caret).replace(/\D/g, '').length;
  const n = parseMoney(el.value);
  el.value = n === null ? '' : formatNumber(n);

  // Put the cursor back after the same number of digits.
  let pos = 0;
  for (let seen = 0; pos < el.value.length && seen < digitsBeforeCaret; pos++) {
    if (/\d/.test(el.value[pos])) seen++;
  }
  el.setSelectionRange(pos, pos);
}, true);
