// Disk storage telemetry widget module

export default {
  id: 'disk',
  title: 'Storage Pool',
  icon: 'disk',
  supportedSizes: ['1x1', '2x1'],
  wsEvents: ['metrics'],

  render(container) {
    container.className = 'res-card widget-item';
    container.innerHTML = `
      <span class="res-title">Storage</span>
      <div class="res-bar-container">
        <div class="res-bar-fill" id="w-disk-bar" style="width: 0%;"></div>
      </div>
      <div class="res-meta-row">
        <span class="res-percentage" id="w-disk-val">--%</span>
        <span class="res-stats" id="w-disk-sub">--</span>
      </div>
      <div class="res-footer-detail" id="w-disk-model">ZFS/SSD Partitions</div>
    `;
  },

  update(container, data) {
    if (!data) return;

    const bar = container.querySelector('#w-disk-bar');
    const val = container.querySelector('#w-disk-val');
    const sub = container.querySelector('#w-disk-sub');
    const model = container.querySelector('#w-disk-model');

    if (data.disk !== null) {
      if (bar) bar.style.width = `${data.disk}%`;
      if (val) val.textContent = `${data.disk}%`;
      if (sub) sub.textContent = `${data.diskGbUsed} GB / ${data.diskGbTotal} GB`;
      if (model) model.textContent = 'SSD Storage Pool';
    } else {
      if (bar) bar.style.width = '0%';
      if (val) val.textContent = '--%';
      if (sub) sub.textContent = 'Metrics Unavailable';
      if (model) model.textContent = 'Node Exporter Disk Offline';
    }
  },

  resize(container, size) { },
  destroy(container) { }
};
