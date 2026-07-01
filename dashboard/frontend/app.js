// Master OS Frontend Runtime Bootstrapper (ES Module)
import { store } from './core/state.js';
import { WsClient } from './core/ws-client.js';
import { api } from './core/api.js';
import { Sidebar } from './components/sidebar.js';
import { Header } from './components/header.js';
import { WidgetGrid } from './components/widget-grid.js';
import { CommandPalette } from './components/command-palette.js';
import { NotificationCenter } from './components/notification-center.js';

// Import modular application views
import { AppContainers } from './components/app-containers.js';
import { AppSettings } from './components/app-settings.js';
import { AppTerminal } from './components/app-terminal.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Booting HomeLab OS Control Plane...');

  const viewport = document.getElementById('widget-grid-viewport');

  // 1. Initialize global overlay components
  Header.init();
  CommandPalette.init();
  NotificationCenter.init();
  Sidebar.init(document.getElementById('sidebar-nav-menu'));

  // 2. Register dynamic view router
  store.on('activeApp', ({ value }) => {
    console.log(`Routing active viewport application: [${value}]`);
    viewport.innerHTML = '';
    
    if (value === 'dashboard') {
      viewport.className = 'widget-viewport';
      WidgetGrid.init(viewport);
      WidgetGrid.loadWorkspaceLayout();
    } else if (value === 'containers') {
      viewport.className = 'app-viewport';
      AppContainers.init(viewport);
    } else if (value === 'settings') {
      viewport.className = 'app-viewport';
      AppSettings.init(viewport);
    } else if (value === 'terminal') {
      viewport.className = 'app-viewport';
      AppTerminal.init(viewport);
    }
  });

  // 3. Load active apps on boot and establish socket streams
  try {
    const apps = await api.get('/api/v1/apps');
    store.set('apps', apps);
    
    // Switch to initial app from local storage
    const activeApp = store.get('activeApp') || 'dashboard';
    store.set('activeApp', activeApp);
  } catch (err) {
    console.error('Failed to load OS applications list:', err);
  }

  // 4. Open WebSocket stream connection
  WsClient.connect();

  // 5. Register global keystroke handlers for palette search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const isOpen = store.get('commandPaletteOpen');
      store.set('commandPaletteOpen', !isOpen);
    }
  });

  // 6. Expose clock clicks callback to toggle alert panel drawer
  window.storeTriggerNotificationCenter = () => {
    const isOpen = store.get('notificationCenterOpen');
    store.set('notificationCenterOpen', !isOpen);
  };
});
