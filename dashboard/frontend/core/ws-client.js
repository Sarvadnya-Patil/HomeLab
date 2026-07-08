// WebSocket Client Connection Manager with REST poll fallbacks
import { store } from './state.js';
import { api } from './api.js';

let wsConn = null;
let pollInterval = null;
let reconnectDelay = 1000;
const logSubscribers = new Set();

export const WsClient = {
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('homelab_token') || '';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

    console.log(`WsClient connecting to stream endpoint: ${wsUrl}`);
    wsConn = new WebSocket(wsUrl);

    wsConn.onopen = () => {
      console.log('WsClient connection active.');
      reconnectDelay = 1000;
      
      // Resubmit active subscriptions upon reconnect
      if (this.activeSubscriptions && this.activeSubscriptions.length > 0) {
        wsConn.send(JSON.stringify({ type: 'subscribe', events: this.activeSubscriptions }));
      }
      
      // Stop REST polling loop if active
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    wsConn.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.dispatchMessage(packet);
      } catch (err) {
        console.error('Failed to parse WebSocket packet:', err);
      }
    };

    wsConn.onclose = () => {
      console.warn(`WebSocket closed. Reconnecting in ${reconnectDelay}ms...`);
      wsConn = null;
      
      setTimeout(() => this.connect(), reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);

      // Start REST fallback poll loop
      this.startFallbackPolling();
    };

    wsConn.onerror = (err) => {
      console.error('WebSocket connection error:', err);
      wsConn.close();
    };
  },

  dispatchMessage(packet) {
    if (!packet) return;

    switch (packet.type) {
      case 'metrics':
        store.set('metrics', packet.data);
        break;
      case 'services':
        store.set('services', packet.data);
        break;
      case 'categories':
        store.set('categories', packet.data);
        break;
      case 'workspaces':
        store.set('workspaces', packet.data);
        break;
      case 'events':
        store.set('notifications', packet.data);
        break;
      case 'terminal':
        logSubscribers.forEach(cb => cb(packet.output));
        break;
      case 'alert':
        // Append new alert to store list
        const currentAlerts = store.get('notifications') || [];
        store.set('notifications', [packet.data, ...currentAlerts]);
        break;
    }
  },

  activeSubscriptions: ['metrics', 'services', 'events', 'alert'],

  send(payload) {
    if (payload.type === 'subscribe') {
      this.activeSubscriptions = payload.events || [];
    }
    if (wsConn && wsConn.readyState === WebSocket.OPEN) {
      wsConn.send(JSON.stringify(payload));
    }
  },

  subscribeLogs(serviceId, callback) {
    logSubscribers.add(callback);
    this.send({ type: 'subscribe_logs', serviceId });
  },

  unsubscribeLogs(serviceId, callback) {
    logSubscribers.delete(callback);
    this.send({ type: 'unsubscribe_logs', serviceId });
  },

  // Fallback REST polling if proxy blocks websockets
  startFallbackPolling() {
    if (pollInterval) return;
    console.log('Activating HTTP fallback polling loops...');

    const runPoll = async () => {
      try {
        const metrics = await api.get('/api/v1/system');
        store.set('metrics', metrics);

        const services = await api.get('/api/v1/services');
        store.set('services', services);

        const workspaces = await api.get('/api/v1/workspaces');
        store.set('workspaces', workspaces);

        const categories = await api.get('/api/v1/categories');
        store.set('categories', categories);
        
        const notifications = await api.get('/api/v1/notifications');
        store.set('notifications', notifications);
      } catch (err) {
        console.error('REST poll fallback cycle failed:', err.message);
      }
    };

    runPoll();
    pollInterval = setInterval(runPoll, 4000);
  }
};

export default WsClient;
