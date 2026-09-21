// Centralized Front-end State Store and Event Bus

// True when the browser is refreshing this page (as opposed to opening it fresh).
function isPageRefresh() {
  try {
    const entry = performance.getEntriesByType('navigation')[0];
    return !!entry && entry.type === 'reload';
  } catch {
    return false;
  }
}

// Opening the site starts on the dashboard. A refresh stays on the page you were on: the current page
// is kept in sessionStorage, which survives a refresh but is empty in a new tab or a new visit, so a
// stale page can never carry over into a fresh visit.
function startingApp() {
  if (!isPageRefresh()) return 'dashboard';
  try {
    return sessionStorage.getItem('activeApp') || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

class Store {
  constructor() {
    // Older versions remembered the last page in localStorage across visits, which reopened the
    // site on whatever page was open last. Drop that value so it cannot linger in the browser.
    try { localStorage.removeItem('activeApp'); } catch { /* storage unavailable */ }

    this.state = {
      metrics: null,
      services: [],
      workspaces: [],
      categories: [],
      notifications: [],
      activeApp: startingApp(),
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
      try { sessionStorage.setItem('activeApp', value); } catch { /* storage unavailable */ }
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
