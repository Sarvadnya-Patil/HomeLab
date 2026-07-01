// CPU telemetry widget module with live history charting
import { generateSvgChart } from '../utils/charts.js';
import { api } from '../core/api.js';

export default {
  id: 'cpu',
  title: 'CPU Load',
  icon: 'cpu',
  supportedSizes: ['1x1', '2x1'],
  wsEvents: ['metrics'],
  history: [],

  async render(container) {
    container.className = 'res-card widget-item';
    container.innerHTML = `
      <span class="res-title">CPU Load</span>
      <div class="res-bar-container">
        <div class="res-bar-fill" id="w-cpu-bar" style="width: 0%; background-color: var(--term-green);"></div>
      </div>
      <div class="res-meta-row">
        <span class="res-percentage" id="w-cpu-val">--%</span>
        <span class="res-stats" id="w-cpu-sub">--</span>
      </div>
      <!-- Reusable Sparkline area -->
      <div class="widget-chart-container" id="w-cpu-chart" style="margin-top: 0.5rem; width: 100%; height: 40px; overflow: hidden;">
        <!-- Chart SVG injected here -->
      </div>
      <div class="res-footer-detail" id="w-cpu-model">Detecting...</div>
    `;

    // Query historical metrics on mount to populate initial line points
    try {
      const records = await api.get('/api/v1/metrics/history?limit=30');
      this.history = records.map(r => r.cpuPercent);
      this.drawChart(container);
    } catch {
      this.history = [];
    }
  },

  update(container, data) {
    if (!data) return;

    const bar = container.querySelector('#w-cpu-bar');
    const val = container.querySelector('#w-cpu-val');
    const sub = container.querySelector('#w-cpu-sub');
    const model = container.querySelector('#w-cpu-model');

    if (data.cpu !== null) {
      if (bar) bar.style.width = `${data.cpu}%`;
      if (val) val.textContent = `${data.cpu}%`;
      
      const tempStr = data.cpuTemp !== null ? `${data.cpuTemp}°C • ` : '';
      const freqStr = data.cpuFreq !== null ? `${data.cpuFreq} GHz` : 'Load';
      if (sub) sub.textContent = `${tempStr}${freqStr}`;

      // Append new live point to history
      this.history.push(data.cpu);
      if (this.history.length > 30) {
        this.history.shift();
      }
      this.drawChart(container);
    } else {
      if (bar) bar.style.width = '0%';
      if (val) val.textContent = '--%';
      if (sub) sub.textContent = 'Metrics Unavailable';
    }

    if (model) {
      model.textContent = `${data.cpuModel} (${data.cpuCores} Cores)`;
    }
  },

  drawChart(container) {
    const chartEl = container.querySelector('#w-cpu-chart');
    if (chartEl && this.history.length > 1) {
      chartEl.innerHTML = generateSvgChart(this.history, 300, 36, '#22c55e'); // Green line
    }
  },

  resize(container, size) { },
  destroy(container) { }
};
