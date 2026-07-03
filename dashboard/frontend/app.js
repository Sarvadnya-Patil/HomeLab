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
import { AppDesigner } from './components/app-designer.js';
import { AppHealth } from './components/app-health.js';
import { AppJobs } from './components/app-jobs.js';
import { AppWorkflows } from './components/app-workflows.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Booting HomeLab OS Control Plane...');

  const viewport = document.getElementById('widget-grid-viewport');
  const appShell = document.querySelector('.app-shell');

  // 1. Initialize global overlay components
  Header.init();
  CommandPalette.init();
  NotificationCenter.init();
  Sidebar.init(document.getElementById('sidebar-nav-menu'));

  // 2. Register dynamic view router
  store.on('activeApp', ({ value }) => {
    console.log(`Routing active viewport application: [${value}]`);
    
    // Clear active polling intervals on switch
    if (window.activeAppDestroy && typeof window.activeAppDestroy === 'function') {
      window.activeAppDestroy();
      window.activeAppDestroy = null;
    }

    viewport.innerHTML = '';
    
    if (value === 'dashboard') {
      viewport.className = 'widget-viewport';
      WidgetGrid.init(viewport);
      WidgetGrid.loadWorkspaceLayout();
    } else if (value === 'containers') {
      viewport.className = 'app-viewport';
      AppContainers.init(viewport);
    } else if (value === 'designer') {
      viewport.className = 'app-viewport';
      AppDesigner.init(viewport);
    } else if (value === 'workflows') {
      viewport.className = 'app-viewport';
      AppWorkflows.init(viewport);
    } else if (value === 'health') {
      viewport.className = 'app-viewport';
      AppHealth.init(viewport);
    } else if (value === 'jobs') {
      viewport.className = 'app-viewport';
      AppJobs.init(viewport);
      window.activeAppDestroy = () => AppJobs.destroy();
    } else if (value === 'settings') {
      viewport.className = 'app-viewport';
      AppSettings.init(viewport);
    } else if (value === 'terminal') {
      viewport.className = 'app-viewport';
      AppTerminal.init(viewport);
    }
  });

  const startHealthPolling = () => {
    const poll = async () => {
      try {
        const health = await api.get('/api/v1/health');
        store.set('healthStatus', health);
      } catch (err) {
        console.error('Failed to fetch health status:', err);
      }
    };
    poll();
    setInterval(poll, 5000);
  };

  const initializeConsole = async () => {
    // 3. Load active apps on boot and establish socket streams
    try {
      const [apps, categories, services, workspaces] = await Promise.all([
        api.get('/api/v1/apps'),
        api.get('/api/v1/categories'),
        api.get('/api/v1/services'),
        api.get('/api/v1/workspaces')
      ]);
      store.set('apps', apps);
      store.set('categories', categories);
      store.set('services', services);
      store.set('workspaces', workspaces);
      
      // Switch to initial app from local storage
      const activeApp = store.get('activeApp') || 'dashboard';
      store.set('activeApp', activeApp);
    } catch (err) {
      console.error('Failed to pre-load essential console data:', err);
    }

    startHealthPolling();

    // 4. Open WebSocket stream connection
    WsClient.connect();
  };

  const checkAuthAndBoot = async () => {
    try {
      const setupStatus = await api.get('/api/v1/auth/setup-status');
      if (setupStatus.setupRequired) {
        document.getElementById('setup-wizard-overlay').classList.remove('hidden');
        if (appShell) appShell.style.display = 'none';
        return;
      }

      const token = localStorage.getItem('homelab_token');
      if (!token) {
        document.getElementById('login-overlay').classList.remove('hidden');
        if (appShell) appShell.style.display = 'none';
        return;
      }

      // Verify token
      try {
        const user = await api.get('/api/v1/auth/me');
        store.set('currentUser', user);
        if (appShell) appShell.style.display = 'flex';
        await initializeConsole();
      } catch (err) {
        localStorage.removeItem('homelab_token');
        document.getElementById('login-overlay').classList.remove('hidden');
        if (appShell) appShell.style.display = 'none';
      }
    } catch (err) {
      console.error('Setup status check failed:', err);
      if (appShell) appShell.style.display = 'none';
    }
  };

  // Bind Setup Form Submits
  const setupForm = document.getElementById('setup-form');
  const setupError = document.getElementById('setup-error');
  const setupUsernameInput = document.getElementById('setup-username');
  const setupDisplayNameInput = document.getElementById('setup-display-name');
  const setupPasswordInput = document.getElementById('setup-password');
  const setupConfirmPasswordInput = document.getElementById('setup-confirm-password');
  const setupSubmitBtn = document.getElementById('btn-setup-submit');

  const validateSetupForm = () => {
    const username = setupUsernameInput.value.trim();
    const displayName = setupDisplayNameInput.value.trim();
    const password = setupPasswordInput.value;
    const confirmPassword = setupConfirmPasswordInput.value;

    let isValid = true;
    setupError.style.display = 'none';

    if (!username || !displayName || !password || !confirmPassword) {
      isValid = false;
    }

    if (password && confirmPassword && password !== confirmPassword) {
      setupError.textContent = 'Passwords do not match.';
      setupError.style.display = 'block';
      isValid = false;
    }

    if (isValid) {
      setupSubmitBtn.disabled = false;
      setupSubmitBtn.style.background = 'var(--text-primary)';
      setupSubmitBtn.style.cursor = 'pointer';
    } else {
      setupSubmitBtn.disabled = true;
      setupSubmitBtn.style.background = 'var(--border-slate)';
      setupSubmitBtn.style.cursor = 'not-allowed';
    }
    return isValid;
  };

  setupUsernameInput.addEventListener('input', validateSetupForm);
  setupDisplayNameInput.addEventListener('input', validateSetupForm);
  setupPasswordInput.addEventListener('input', validateSetupForm);
  setupConfirmPasswordInput.addEventListener('input', validateSetupForm);

  // Setup password show/hide toggles
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = 'HIDE';
        } else {
          input.type = 'password';
          btn.textContent = 'SHOW';
        }
      }
    });
  });

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateSetupForm()) {
      return;
    }

    const username = setupUsernameInput.value;
    const displayName = setupDisplayNameInput.value;
    const password = setupPasswordInput.value;

    try {
      await api.post('/api/v1/auth/setup', { username, displayName, password });
      document.getElementById('setup-wizard-overlay').classList.add('hidden');
      document.getElementById('login-overlay').classList.remove('hidden');
      if (appShell) appShell.style.display = 'none';
    } catch (err) {
      setupError.textContent = err.message;
      setupError.style.display = 'block';
    }
  });

  // Bind Login Form Submits
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await api.post('/api/v1/auth/login', { username, password });
      localStorage.setItem('homelab_token', res.token);
      document.getElementById('login-overlay').classList.add('hidden');
      
      const user = await api.get('/api/v1/auth/me');
      store.set('currentUser', user);
      if (appShell) appShell.style.display = 'flex';
      await initializeConsole();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    }
  });

  // Boot startup check
  await checkAuthAndBoot();

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

  // 7. Bind mobile sidebar toggle controllers
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('hidden');
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.add('hidden');
    });
  }
});
