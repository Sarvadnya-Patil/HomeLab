// RAM telemetry widget module with live history charting
import { generateSvgChart } from '../utils/charts.js';
import { api } from '../core/api.js';

export default {
  id: 'ram',
  title: 'RAM Allocation',
  icon: 'ram',
  supportedSizes: ['1x1', '2x1'],
  wsEvents: ['metrics'],
  history: [],

  async render(container) {
    container.className = 'res-card widget-item';
    container.innerHTML = `
      <span class="res-title">RAM Allocation</span>
      <div class="res-bar-container">
        <div class="res-bar-fill" id="w-ram-bar" style="width: 0%; background-color: var(--term-green);"></div>
      </div>
      <div class="res-meta-row">
        <span class="res-percentage" id="w-ram-val">--%</span>
        <span class="res-stats" id="w-ram-sub">--</span>
      </div>
      <!-- Reusable Sparkline area -->
      <div class="widget-chart-container" id="w-ram-chart" style="margin-top: 0.5rem; width: 100%; height: 40px; overflow: hidden;">
        <!-- Chart SVG injected here -->
      </div>
      <div class="res-footer-detail" id="w-ram-model">Host Memory</div>
    `;

    // Query historical metrics on mount to populate initial line points
    try {
      const records = await api.get('/api/v1/metrics/history?limit=30');
      this.history = records.map(r => r.ramPercent);
      this.drawChart(container);
    } catch {
      this.history = [];
    }
  },

  update(container, data) {
    if (!data) return;

    const bar = container.querySelector('#w-ram-bar');
    const val = container.querySelector('#w-ram-val');
    const sub = container.querySelector('#w-ram-sub');

    if (data.ram !== null) {
      if (bar) bar.style.width = `${data.ram}%`;
      if (val) val.textContent = `${data.ram}%`;
      if (sub) sub.textContent = `${data.ramGbUsed} GB / ${data.ramGbTotal} GB`;

      // Append new live point to history
      this.history.push(data.ram);
      if (this.history.length > 30) {
        this.history.shift();
      }
      this.drawChart(container);
    } else {
      if (bar) bar.style.width = '0%';
      if (val) val.textContent = '--%';
      if (sub) sub.textContent = 'Metrics Offline';
    }
  },

  drawChart(container) {
    const chartEl = container.querySelector('#w-ram-chart');
    if (chartEl && this.history.length > 1) {
      chartEl.innerHTML = generateSvgChart(this.history, 300, 36, '#22c55e'); // Green line
    }
  },

  resize(container, size) { },
  destroy(container) { }
};
