// Centralized Front-end State Store and Event Bus

class Store {
  constructor() {
    this.state = {
      metrics: null,
      services: [],
      workspaces: [],
      categories: [],
      notifications: [],
      activeApp: localStorage.getItem('activeApp') || 'dashboard',
      apps: [],
      activeWorkspace: localStorage.getItem('activeWorkspace') || 'overview',
      sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
      commandPaletteOpen: false,
      notificationCenterOpen: false,
      settings: {}
    };
    this.listeners = new Map();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    const prev = this.state[key];
    this.state[key] = value;
    
    // Persist UI state toggles locally
    if (key === 'activeApp') {
      localStorage.setItem('activeApp', value);
    }
    if (key === 'activeWorkspace') {
      localStorage.setItem('activeWorkspace', value);
    }
    if (key === 'sidebarCollapsed') {
      localStorage.setItem('sidebarCollapsed', value);
    }

    this.emit(key, { value, prev });
  }

  // Subscribe UI callback hook to state updates
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  // Unsubscribe UI callback hook
  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(callback);
    }
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in state event subscriber [${event}]:`, err);
        }
      });
    }
  }
}

export const store = new Store();
export default store;
