// Team leaderboard, in two views — Production Leaderboard and Activity
// Leaderboard, switched at the start of the total row — both over the
// same days (the month to date, or the days picked on the month bar), so
// the toggle only changes what's measured:
//   Production  (always opens on this) Cases (each counted once, where it
//               is now) · Open PCR's (opened in it, still open) ·
//               Submitted PCR's (submitted in it, still awaiting
//               acceptance) · Accepted PCR's (accepted in it, at the final
//               PCR) — sorted by Accepted
//   Activity    Prospects · Referrals · Meetings (its three types on
//               hover) · Wills leads · FNAs · Quotes — sorted by Meetings
// Picking an FA (admin) opens their month's cases under the row in
// Production only; in Activity it just picks them for the hero's meter.
// What's in the pot whatever the month is the admin's Cases tab. Under the
// headings, a shaded row — the switch, then every column added up (the
// team's total, hover breakdowns too).
// Clicking a header sorts by that column (largest first); clicking the
// active header again flips to smallest first.
//
// The signed-in person's own row (rep.isYou) is highlighted, so an FA
// finds their month straight away.
//
// Beside each name (FAs' and admins' view alike), whether they had any
// activity on options.activityDayLabel (the last weekday): ✓ something
// logged, ✗ nothing (rep.hadActivity) — the Review on its own doesn't
// count.
//
// Admin view (options.onSelect): each name is clickable — it opens a
// panel under that row (options.detailHTML) and calls
// options.onSelect(id), or onSelect(null) when clicked again.

function _injectLeaderboardCSS() {
  if (document.getElementById("leaderboard-styles")) return;
  const s = document.createElement("style");
  s.id = "leaderboard-styles";
  s.textContent = `
    /* Few lines: the tabs start it, the Team row is a shaded band, and
       the FA rows have only a faint hairline (a tint on hover). */
    .leaderboard { padding: 20px 0 0; }
    /* The two views: a switch at the start of the total row, its figures
       beside it — the active one a white card, as Home / Cases. */
    .lb-tabs { display: inline-flex; gap: 2px; background: rgba(0, 0, 0, 0.06); border-radius: 8px; padding: 3px; }
    .lb-tab {
      background: none;
      border: none;
      border-radius: 6px;
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      color: #555c6a;
      cursor: pointer;
    }
    .lb-tab:hover:not(.active) { color: #2a3040; }
    .lb-tab.active { background: #ffffff; color: var(--navy); font-weight: 600; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
    .lb-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
      font-size: 14px;
      color: var(--ink);
    }
    .lb-row:last-child { border-bottom: none; }
    .lb-row.clickable:hover:not(.selected) { background: rgba(0, 0, 0, 0.025); }
    .lb-rank {
      width: 24px;
      color: var(--ink);
      font-size: 13px;
    }
    .lb-name { flex: 1; display: flex; align-items: center; gap: 8px; }
    .lb-row.clickable { cursor: pointer; }
    .lb-row.clickable:hover .lb-name-text { text-decoration: underline; }
    .lb-row.selected { background: rgba(212, 175, 55, 0.12); }
    /* The signed-in person's own row: their month at a glance. */
    .lb-row.you { background: rgba(212, 175, 55, 0.14); border-radius: 8px; border-bottom-color: transparent; margin: 0 -12px; padding-left: 12px; padding-right: 12px; }
    .lb-row.you .lb-name-text { font-weight: 700; }
    .lb-row.selected .lb-name-text { font-weight: 700; }
    .lb-checkout { font-size: 13px; font-weight: 700; width: 14px; text-align: center; }
    .lb-checkout.yes { color: var(--green); }
    .lb-checkout.no { color: var(--red); }
    .lb-checkout.none { color: var(--ink-dim); }
    .lb-detail {
      padding: 10px 0 14px 40px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
      background: rgba(212, 175, 55, 0.06);
      font-size: 13px;
    }
    .lb-detail-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-dim);
      margin-bottom: 6px;
    }
    .lb-detail-row { display: flex; align-items: center; gap: 16px; padding: 5px 0; color: var(--ink); }
    /* The case's PCR under each leaderboard column it counts in. */
    .lb-detail-row .lb-value { font-weight: 500; color: var(--ink); }
    .lb-detail-date { width: 96px; flex-shrink: 0; color: var(--ink-dim); white-space: nowrap; }
    .lb-detail-client { width: 170px; flex-shrink: 0; font-weight: 600; }
    .lb-detail-type { width: 150px; flex-shrink: 0; color: var(--ink-dim); }
    .lb-detail-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lb-detail-empty { color: var(--ink-dim); }
    .lb-value {
      width: 96px;
      flex-shrink: 0;
      text-align: center;
      color: var(--ink);
      font-weight: 600;
    }
    .lb-value.active { color: var(--gold); }
    .lb-value.wide { width: 140px; }
    .lb-value, .lb-head .lb-value { white-space: nowrap; } /* headings on one line */
    /* Wider than the rows by its padding (negative margins), so its
       figures stay in the columns. */
    .lb-total {
      font-weight: 700;
      background: rgba(0, 0, 0, 0.045);
      border-bottom: none;
      border-radius: 8px;
      margin: 2px -12px 6px;
      padding: 8px 12px;
    }
    .lb-total .lb-value { font-weight: 700; }
    .lb-head {
      border-bottom: none;
      padding: 0 0 6px;
    }
    .lb-head .lb-value {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      color: var(--ink-dim);
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      user-select: none;
    }
    .lb-head .lb-value:hover { color: var(--ink); }
    .lb-head .lb-value.active { color: var(--gold); }
    .lb-sort-arrow {
      font-size: 9px;
      opacity: 0;
    }
    .lb-head .lb-value.active .lb-sort-arrow { opacity: 1; }

    .lb-breakdown-cell {
      position: relative;
      cursor: default;
    }
    .lb-breakdown-tooltip {
      position: absolute;
      bottom: 130%;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
      color: var(--ink);
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease;
      z-index: 20;
    }
    .lb-breakdown-tooltip b { color: var(--gold); font-weight: 700; }
    .lb-breakdown-cell:hover .lb-breakdown-tooltip { opacity: 1; }
    /* Rightmost column's tooltip would overflow the page edge if centered
       on the cell, so it hangs off the cell's right edge instead. */
    .lb-breakdown-cell-end .lb-breakdown-tooltip {
      left: auto;
      right: 0;
      transform: none;
    }
  `;
  document.head.appendChild(s);
}
_injectLeaderboardCSS();

// The two views' columns. Wide columns fit their two-word headings;
// title: on hover, what the column counts.
const LEADERBOARD_VIEWS = {
  production: {
    label: "Production Leaderboard",
    sortKey: "pcr",
    detail: true, // a picked FA's row opens their cases (Activity: no list)
    columns: [
      { key: "monthCases", label: "Cases", wide: true, title: "Opened, submitted or accepted in the month (or the days picked), each counted once" },
      { key: "openedPcr", label: "Open PCR’s", wide: true, title: "Opened in the month and still open" },
      { key: "stillSubmittedPcr", label: "Submitted PCR’s", wide: true, title: "Submitted in the month and still awaiting acceptance" },
      { key: "pcr", label: "Accepted PCR’s", wide: true, title: "Accepted in the month, at the final PCR" },
    ],
  },
  activity: {
    label: "Activity Leaderboard",
    sortKey: "meetings",
    columns: [
      { key: "prospects", label: "Prospects", title: "Prospects contacted" },
      { key: "referrals", label: "Referrals" },
      { key: "meetings", label: "Meetings" },
      { key: "willsLeads", label: "Wills leads" },
      { key: "fnas", label: "FNAs" },
      { key: "quotes", label: "Quotes" },
    ],
  },
};

// PCR in full with thousand separators (money.js); PCR is a score, not
// rand, so no currency prefix. Counts are small and shown as they are.
function _lbFormatValue(key, value) {
  if (["pcr", "openedPcr", "stillSubmittedPcr"].includes(key)) return formatNumber(value);
  return value;
}

// Columns whose value can be broken down further on hover — the breakdown
// data lives on the rep as `${key}Breakdown`, keyed by these sub-keys.
const LEADERBOARD_BREAKDOWNS = {
  meetings: [
    { key: "factFinder", label: "Fact Finder" },
    { key: "closing", label: "Closing" },
    { key: "relational", label: "Relational" },
  ],
  openedPcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
  stillSubmittedPcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
  pcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
};

class Leaderboard {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({ reps: [] }, config);
    this.options = {};
    this.view = "production"; // LEADERBOARD_VIEWS; always opens on Production
    this.sortKey = LEADERBOARD_VIEWS.production.sortKey;
    this.sortDir = "desc";
    this.render();
    this.container.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-lb-view]");
      if (viewBtn) {
        this.view = viewBtn.dataset.lbView;
        this.sortKey = LEADERBOARD_VIEWS[this.view].sortKey;
        this.sortDir = "desc";
        this.render();
        return;
      }
      const row = e.target.closest(".lb-row.clickable");
      if (row) {
        const id = row.dataset.repId;
        this.options.onSelect?.(this.options.selectedId === id ? null : id);
        return;
      }
      const head = e.target.closest("[data-sort-key]");
      if (!head) return;
      const key = head.dataset.sortKey;
      if (key === this.sortKey) this.sortDir = this.sortDir === "desc" ? "asc" : "desc";
      else {
        this.sortKey = key;
        this.sortDir = "desc";
      }
      this.render();
    });
  }

  // options (admin view): {onSelect, selectedId, detailHTML(rep, columns),
  // activityDayLabel}. The FA view passes only activityDayLabel.
  setReps(reps, options = {}) {
    this.config.reps = reps;
    this.options = options;
    this.render();
  }

  render() {
    const { reps } = this.config;
    const { onSelect, selectedId, detailHTML, activityDayLabel } = this.options;
    const dir = this.sortDir === "desc" ? -1 : 1;
    const sorted = [...reps].sort((a, b) => (a[this.sortKey] - b[this.sortKey]) * dir);
    const columns = LEADERBOARD_VIEWS[this.view].columns;

    const headCells = columns.map((col) => {
      const active = col.key === this.sortKey;
      const arrow = this.sortDir === "desc" ? "▼" : "▲";
      return `<div class="lb-value${col.wide ? " wide" : ""}${active ? " active" : ""}" data-sort-key="${col.key}"${col.title ? ` title="${col.title}"` : ""}>${col.label}<span class="lb-sort-arrow">${arrow}</span></div>`;
    }).join("");

    // One row's figures, each column with its hover breakdown.
    const cellsOf = (rep) => columns.map((col, colIndex) => {
      const activeClass = col.key === this.sortKey ? " active" : "";
      const value = _lbFormatValue(col.key, rep[col.key]);
      const breakdownConfig = LEADERBOARD_BREAKDOWNS[col.key];
      const breakdownData = rep[`${col.key}Breakdown`];
      if (breakdownConfig && breakdownData) {
        const parts = breakdownConfig
          .map((b) => `${b.label} <b>${_lbFormatValue(col.key, breakdownData[b.key])}</b>`)
          .join(" &middot; ");
        const isEnd = colIndex === columns.length - 1;
        return `
          <div class="lb-value lb-breakdown-cell${col.wide ? " wide" : ""}${isEnd ? " lb-breakdown-cell-end" : ""}${activeClass}">
            ${value}
            <div class="lb-breakdown-tooltip">${parts}</div>
          </div>
        `;
      }
      return `<div class="lb-value${col.wide ? " wide" : ""}${activeClass}">${value}</div>`;
    }).join("");

    // The team: every column added up, breakdowns too — at the top, under
    // the headings.
    const total = {};
    columns.forEach((col) => {
      total[col.key] = reps.reduce((t, r) => t + (Number(r[col.key]) || 0), 0);
      const parts = LEADERBOARD_BREAKDOWNS[col.key];
      if (parts) {
        total[`${col.key}Breakdown`] = Object.fromEntries(parts.map((b) =>
          [b.key, reps.reduce((t, r) => t + (Number(r[`${col.key}Breakdown`]?.[b.key]) || 0), 0)]));
      }
    });
    // The two views' switch, at the start of the total row.
    const tabs = `<div class="lb-tabs" role="tablist">${Object.entries(LEADERBOARD_VIEWS).map(([key, v]) =>
      `<button type="button" role="tab" aria-selected="${key === this.view}" class="lb-tab${key === this.view ? " active" : ""}" data-lb-view="${key}">${v.label}</button>`).join("")}</div>`;
    const totalRow = `
      <div class="lb-row lb-total">
        <div class="lb-name">${tabs}</div>
        ${cellsOf(total)}
      </div>
    `;

    const rows = sorted
      .map((rep, i) => {
        const rank = i + 1;
        const cells = cellsOf(rep);
        const selected = selectedId === rep.id;
        const day = _escHtml(activityDayLabel || "");
        const checkout = rep.hadActivity === true
          ? `<span class="lb-checkout yes" title="Activity logged on ${day}">✓</span>`
          : rep.hadActivity === false
            ? `<span class="lb-checkout no" title="Nothing logged on ${day}">✗</span>`
            : "";
        return `
          <div class="lb-row${onSelect ? " clickable" : ""}${selected ? " selected" : ""}${rep.isYou ? " you" : ""}" data-rep-id="${rep.id}">
            <div class="lb-rank">${rank}</div>
            <div class="lb-name">${checkout}<span class="lb-name-text">${_escHtml(rep.name)}</span></div>
            ${cells}
          </div>
          ${selected && detailHTML && LEADERBOARD_VIEWS[this.view].detail ? `<div class="lb-detail">${detailHTML(rep, columns)}</div>` : ""}
        `;
      })
      .join("");

    this.container.innerHTML = `
      <div class="leaderboard">
        <div class="lb-row lb-head">
          <div class="lb-rank"></div>
          <div class="lb-name"></div>
          ${headCells}
        </div>
        ${totalRow}
        ${rows}
      </div>
    `;
  }
}

function initLeaderboard(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new Leaderboard(container, config);
}
