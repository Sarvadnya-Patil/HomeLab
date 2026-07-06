// System Event logs widget module

export default {
  id: 'events',
  title: 'Recent Events',
  icon: 'bell',
  supportedSizes: ['full'],
  wsEvents: ['events', 'alert'],

  render(container) {
    container.className = 'grid-events widget-item';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem;">
        <span class="panel-title">System Logs & Event Feeds</span>
      </div>
      <div class="events-feed-body" id="w-events-feed" style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; font-family: var(--font-mono); font-size: 0.7rem;">
        <div style="color: var(--text-muted);">Waiting for logs feed...</div>
      </div>
    `;
  },

  update(container, data) {
    // Note: The ws-client sets 'notifications' state in store, which contains full alerts.
    // In our component render lifecycle, app.js passes the store state or events data array.
    const feed = container.querySelector('#w-events-feed');
    if (!feed || !Array.isArray(data)) return;

    const filterQuery = (document.getElementById("cmd-palette")?.value || '').toLowerCase();

    feed.innerHTML = '';
    
    const filtered = data.filter(evt => {
      return !filterQuery || 
             (evt.message && evt.message.toLowerCase().includes(filterQuery)) || 
             (evt.origin && evt.origin.toLowerCase().includes(filterQuery));
    });

    if (filtered.length === 0) {
      feed.innerHTML = `<div style="color: var(--text-muted);">${filterQuery ? 'No matching log events found.' : 'No log events recorded.'}</div>`;
      return;
    }

    filtered.forEach(evt => {
      const line = document.createElement("div");
      line.className = `event-line level-${evt.level || 'info'}`;
      
      // Handle timestamp formatting from either database (createdAt) or WS alerts (time)
      const timeStr = evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString('en-US', { hour12: false }) : (evt.time || '');

      line.innerHTML = `
        <span class="event-time" style="color: var(--text-muted); margin-right: 0.5rem;">[${timeStr}]</span>
        <span class="event-origin" style="color: var(--border-focus); font-weight: bold; margin-right: 0.5rem; display: inline-block; width: 80px;">${evt.origin}</span>
        <span class="event-message" style="color: var(--text-secondary);">${evt.message}</span>
      `;
      feed.appendChild(line);
    });
  },

  resize(container, size) { },
  destroy(container) { }
};
