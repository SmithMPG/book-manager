// Team leaderboard, in two views, switched on the title line:
//   PCR (default)  Cases submitted · Open case PCR's · Submitted PCR's ·
//                  Accepted PCR's — sorted by Accepted PCR's
//   Activity       Prospects · Referrals · Meetings · Wills Leads · FNAs ·
//                  Quotes — sorted by Prospects
// Clicking a header sorts by that column (largest first); clicking the
// active header again flips to smallest first.
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
    .leaderboard {
      padding: 20px 0 0;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    .lb-title { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .lb-views { display: inline-flex; background: #d4d6d8; border-radius: 8px; padding: 3px; gap: 2px; }
    .lb-view {
      background: none;
      border: none;
      border-radius: 6px;
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      color: #4b5563;
      cursor: pointer;
    }
    .lb-view.active { background: #ffffff; color: var(--navy); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }
    .leaderboard h4 {
      margin: 0;
      font-size: 14px;
      color: var(--ink-dim);
      font-weight: 500;
    }
    .lb-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      font-size: 14px;
      color: var(--ink);
    }
    .lb-row:last-child { border-bottom: none; }
    .lb-rank {
      width: 24px;
      color: var(--ink);
      font-size: 13px;
    }
    .lb-name { flex: 1; display: flex; align-items: center; gap: 8px; }
    .lb-row.clickable { cursor: pointer; }
    .lb-row.clickable:hover .lb-name-text { text-decoration: underline; }
    .lb-row.selected { background: rgba(212, 175, 55, 0.12); }
    .lb-row.selected .lb-name-text { font-weight: 700; }
    .lb-checkout { font-size: 13px; font-weight: 700; width: 14px; text-align: center; }
    .lb-checkout.yes { color: var(--green); }
    .lb-checkout.no { color: var(--red); }
    .lb-checkout.none { color: var(--ink-dim); }
    .lb-detail {
      padding: 10px 14px 14px 40px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
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
    .lb-detail-row { display: flex; gap: 16px; padding: 5px 0; color: var(--ink); }
    .lb-detail-client { width: 170px; flex-shrink: 0; font-weight: 600; }
    .lb-detail-type { width: 150px; flex-shrink: 0; color: var(--ink-dim); }
    .lb-detail-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lb-detail-pcr { flex-shrink: 0; color: var(--ink-dim); }
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

// The two views' columns. Wide columns fit their two-word headings.
const LEADERBOARD_VIEWS = {
  pcr: {
    label: "PCR",
    sortKey: "pcr",
    columns: [
      { key: "cases", label: "Cases submitted", wide: true },       // submitted in the period
      { key: "openPcr", label: "Open case PCR’s", wide: true },     // opened, not yet submitted — right now
      { key: "submittedPcr", label: "Submitted PCR’s", wide: true }, // submitted in the period, whatever's happened since
      { key: "pcr", label: "Accepted PCR’s", wide: true },          // accepted in the period, at the final PCR (Validation)
    ],
  },
  activity: {
    label: "Activity",
    sortKey: "prospects",
    columns: [
      { key: "prospects", label: "Prospects" },
      { key: "referrals", label: "Referrals" },
      { key: "meetings", label: "Meetings" },
      { key: "willsLeads", label: "Wills Leads" },
      { key: "fnas", label: "FNAs" },
      { key: "quotes", label: "Quotes" },
    ],
  },
};

// PCR in full with thousand separators (money.js); PCR is a score, not
// rand, so no currency prefix. Counts are small and shown as they are.
function _lbFormatValue(key, value) {
  if (key === "pcr" || key === "submittedPcr" || key === "openPcr") return formatNumber(value);
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
  openPcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
  submittedPcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
  pcr: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
  cases: [
    { key: "risk", label: "Risk" },
    { key: "investments", label: "Investments" },
  ],
};

class Leaderboard {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({ title: "Team Leaderboard — MTD", reps: [] }, config);
    this.options = {};
    this.sortKey = "pcr";
    this.sortDir = "desc";
    this.view = "pcr"; // LEADERBOARD_VIEWS
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

  // options (admin view): {onSelect, selectedId, detailHTML(rep),
  // activityDayLabel, title}. The FA view passes only activityDayLabel.
  setReps(reps, options = {}) {
    this.config.reps = reps;
    this.options = options;
    this.render();
  }

  render() {
    const { reps } = this.config;
    const title = this.options.title || this.config.title;
    const { onSelect, selectedId, detailHTML, activityDayLabel } = this.options;
    const dir = this.sortDir === "desc" ? -1 : 1;
    const sorted = [...reps].sort((a, b) => (a[this.sortKey] - b[this.sortKey]) * dir);
    const columns = LEADERBOARD_VIEWS[this.view].columns;

    const headCells = columns.map((col) => {
      const active = col.key === this.sortKey;
      const arrow = this.sortDir === "desc" ? "▼" : "▲";
      return `<div class="lb-value${col.wide ? " wide" : ""}${active ? " active" : ""}" data-sort-key="${col.key}">${col.label}<span class="lb-sort-arrow">${arrow}</span></div>`;
    }).join("");

    const rows = sorted
      .map((rep, i) => {
        const rank = i + 1;
        const cells = columns.map((col, colIndex) => {
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
        const selected = selectedId === rep.id;
        const day = _escHtml(activityDayLabel || "");
        const checkout = rep.hadActivity === true
          ? `<span class="lb-checkout yes" title="Activity logged on ${day}">✓</span>`
          : rep.hadActivity === false
            ? `<span class="lb-checkout no" title="Nothing logged on ${day}">✗</span>`
            : "";
        return `
          <div class="lb-row${onSelect ? " clickable" : ""}${selected ? " selected" : ""}" data-rep-id="${rep.id}">
            <div class="lb-rank">${rank}</div>
            <div class="lb-name">${checkout}<span class="lb-name-text">${_escHtml(rep.name)}</span></div>
            ${cells}
          </div>
          ${selected && detailHTML ? `<div class="lb-detail">${detailHTML(rep)}</div>` : ""}
        `;
      })
      .join("");

    this.container.innerHTML = `
      <div class="leaderboard">
        <div class="lb-title">
          <h4>${title}</h4>
          <div class="lb-views">${Object.entries(LEADERBOARD_VIEWS).map(([key, v]) =>
            `<button type="button" class="lb-view${key === this.view ? " active" : ""}" data-lb-view="${key}">${v.label}</button>`).join("")}</div>
        </div>
        <div class="lb-row lb-head">
          <div class="lb-rank"></div>
          <div class="lb-name"></div>
          ${headCells}
        </div>
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
