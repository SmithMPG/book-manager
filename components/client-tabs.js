// Client tabs: the sub-tab bar inside an expanded client card (Metrics
// and Cases). Metrics is the default active tab.
// One delegated listener covers every client card, current and future,
// so nothing needs re-initializing when cards move between tabs (e.g.
// via drag-and-drop).

function initClientTabs(root) {
  root.addEventListener('click', e => {
    const tabBtn = e.target.closest('.client-tab');
    if (!tabBtn) return;
    const tabsEl = tabBtn.closest('.client-tabs');
    if (!tabsEl) return;
    const key = tabBtn.dataset.tab;
    tabsEl.querySelectorAll('.client-tab').forEach(t => t.classList.toggle('active', t === tabBtn));
    tabsEl.querySelectorAll('.client-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === key));
  });
}
