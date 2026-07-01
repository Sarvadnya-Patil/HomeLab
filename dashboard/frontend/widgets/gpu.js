// GPU telemetry widget module

export default {
  id: 'gpu',
  title: 'GPU Utilization',
  icon: 'gpu',
  supportedSizes: ['1x1'],
  wsEvents: ['metrics'],

  render(container) {
    container.className = 'res-card widget-item';
    container.innerHTML = `
      <span class="res-title">GPU</span>
      <div class="res-bar-container">
        <div class="res-bar-fill" id="w-gpu-bar" style="width: 0%;"></div>
      </div>
      <div class="res-meta-row">
        <span class="res-percentage" id="w-gpu-val">--</span>
        <span class="res-stats" id="w-gpu-sub">--</span>
      </div>
      <div class="res-footer-detail" id="w-gpu-model">Graphics Core</div>
    `;
  },

  update(container, data) {
    if (!data) return;

    const bar = container.querySelector('#w-gpu-bar');
    const val = container.querySelector('#w-gpu-val');
    const sub = container.querySelector('#w-gpu-sub');
    const model = container.querySelector('#w-gpu-model');

    if (data.gpu !== null) {
      if (bar) bar.style.width = `${data.gpu}%`;
      if (val) val.textContent = `${data.gpu}%`;
      if (sub) sub.textContent = `${data.gpuTemp}°C`;
      if (model) model.textContent = 'GPU Cluster Active';
    } else {
      if (bar) bar.style.width = '0%';
      if (val) val.textContent = '--';
      if (sub) sub.textContent = 'No GPU';
      if (model) model.textContent = 'GPU Exporter Offline';
    }
  },

  resize(container, size) { },
  destroy(container) { }
};
