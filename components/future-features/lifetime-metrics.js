// Lifetime metrics: compact AUM / Clients / Policies indicators that will live
// in the toolbar (visible on every tab, not just Home). Each shows a
// rounded headline number; hover (or tap, for touch) reveals the exact
// figure and, for policies, the Risk/Investment breakdown.

function _injectLifetimeMetricsCSS() {
  if (document.getElementById('lifetime-metrics-styles')) return;
  const s = document.createElement('style');
  s.id = 'lifetime-metrics-styles';
  s.textContent = `
    .lm-metrics {
      display: flex;
      align-items: baseline;
      gap: 18px;
      padding-left: 18px;
      margin-left: 4px;
      border-left: 1px solid var(--border);
      flex-shrink: 0;
    }

    .lm-metric {
      position: relative;
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-size: 12px;
      color: var(--text-dim);
      cursor: default;
      white-space: nowrap;
    }
    .lm-metric-value {
      font-size: 14px;
      font-weight: 700;
      color: var(--gold-soft);
    }

    .lm-metric-tooltip {
      position: absolute;
      top: 130%;
      left: 50%;
      transform: translateX(-50%);
      background: var(--navy-lighter);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease;
      z-index: 20;
    }
    .lm-metric-tooltip b { color: var(--gold-soft); font-weight: 700; }
    .lm-metric:hover .lm-metric-tooltip,
    .lm-metric.tapped .lm-metric-tooltip {
      opacity: 1;
      pointer-events: auto;
    }

    @media (max-width: 1100px) {
      .lm-metrics { display: none; }
    }
  `;
  document.head.appendChild(s);
}
_injectLifetimeMetricsCSS();

class LifetimeMetrics {
  constructor(container, config) {
    this.container = container;
    this.config = Object.assign({
      aumRounded: 'R48m',
      aumExact: 'R48 320 000',
      totalClients: 62,
      policiesInForce: 84,
      riskPolicies: 52,
      investmentPolicies: 32,
    }, config);
    this.render();
  }

  render() {
    const c = this.config;
    this.container.innerHTML = `
      <div class="lm-metrics">
        <div class="lm-metric">
          <span class="lm-metric-label">AUM</span>
          <span class="lm-metric-value">${c.aumRounded}</span>
          <div class="lm-metric-tooltip">${c.aumExact}</div>
        </div>
        <div class="lm-metric">
          <span class="lm-metric-label">Clients</span>
          <span class="lm-metric-value">${c.totalClients}</span>
          <div class="lm-metric-tooltip">${c.totalClients} active clients</div>
        </div>
        <div class="lm-metric">
          <span class="lm-metric-label">Policies</span>
          <span class="lm-metric-value">${c.policiesInForce}</span>
          <div class="lm-metric-tooltip">Risk <b>${c.riskPolicies}</b> &middot; Investment <b>${c.investmentPolicies}</b></div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.lm-metric').forEach(metric => {
      metric.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = metric.classList.contains('tapped');
        this.container.querySelectorAll('.lm-metric').forEach(b => b.classList.remove('tapped'));
        if (!isOpen) metric.classList.add('tapped');
      });
    });
    document.addEventListener('click', () => {
      this.container.querySelectorAll('.lm-metric').forEach(b => b.classList.remove('tapped'));
    });
  }
}

function initLifetimeMetrics(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  return new LifetimeMetrics(container, config);
}
