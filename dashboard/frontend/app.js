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
      const [apps, categories, services, workspaces, notifications] = await Promise.all([
        api.get('/api/v1/apps'),
        api.get('/api/v1/categories'),
        api.get('/api/v1/services'),
        api.get('/api/v1/workspaces'),
        api.get('/api/v1/notifications')
      ]);
      store.set('apps', apps);
      store.set('categories', categories);
      store.set('services', services);
      store.set('workspaces', workspaces);
      store.set('notifications', notifications);
      
      // Switch to initial app from local storage
      const activeApp = store.get('activeApp') || 'dashboard';
      store.set('activeApp', activeApp);

      // Search and filter container cards in real time
      const cmdPalette = document.getElementById('cmd-palette');
      if (cmdPalette) {
        cmdPalette.addEventListener('input', () => {
          store.emit('services', { value: store.get('services') || [] });
        });
      }
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

// Global reusable premium custom alert dialog utility
window.showCustomAlert = function(title, message, type = 'error') {
  let overlay = document.getElementById('custom-alert-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-alert-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease-in-out';
    document.body.appendChild(overlay);
  }

  const accentColor = type === 'error' ? 'var(--border-focus, #ff4b4b)' : 'var(--term-green, #10b981)';
  overlay.innerHTML = `
    <div class="custom-alert-box" style="
      background-color: var(--bg-panel, #121214);
      border: 1px solid ${accentColor};
      border-radius: 6px;
      padding: 1.5rem;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      transform: scale(0.9);
      transition: transform 0.2s ease-in-out;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    ">
      <div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--border-slate, #2d2d30); padding-bottom: 0.5rem;">
        <span style="color: ${accentColor}; font-weight: bold; font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase;">
          ${type === 'error' ? '⚠ System Alert' : '✓ Success'}
        </span>
      </div>
      <div style="font-size: 0.85rem; font-weight: bold; color: var(--text-primary); margin-top: 0.25rem;">
        ${title}
      </div>
      <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; font-family: var(--font-sans);">
        ${message}
      </div>
      <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
        <button id="custom-alert-ok-btn" style="
          padding: 0.4rem 1.2rem;
          background-color: var(--bg-shell, #000);
          border: 1px solid ${accentColor};
          color: var(--text-primary);
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          text-transform: uppercase;
          transition: background-color 0.15s ease;
        ">OK</button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  overlay.offsetHeight; // force reflow
  overlay.style.opacity = '1';
  const alertBox = overlay.querySelector('.custom-alert-box');
  alertBox.style.transform = 'scale(1)';

  const closeAlert = () => {
    overlay.style.opacity = '0';
    alertBox.style.transform = 'scale(0.9)';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 200);
  };

  const okBtn = overlay.querySelector('#custom-alert-ok-btn');
  okBtn.addEventListener('click', closeAlert);
  okBtn.focus();

  // Allow hover state on custom button
  okBtn.addEventListener('mouseenter', () => {
    okBtn.style.backgroundColor = accentColor;
    okBtn.style.color = '#000';
  });
  okBtn.addEventListener('mouseleave', () => {
    okBtn.style.backgroundColor = 'var(--bg-shell, #000)';
    okBtn.style.color = 'var(--text-primary)';
  });

  const handleKeydown = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      closeAlert();
      window.removeEventListener('keydown', handleKeydown);
    }
  };
  window.addEventListener('keydown', handleKeydown);
};

// Override standard browser alert globally to route to custom toast notification
window.alert = function(message) {
  const isSuccess = message.toLowerCase().includes('success') || message.toLowerCase().includes('saved');
  window.showToast(message, isSuccess ? 'success' : 'error');
};

// Global reusable premium custom toast notification utility
window.showToast = function(message, type = 'error') {
  let container = document.getElementById('custom-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'custom-toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '2rem';
    container.style.right = '2rem';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '0.5rem';
    container.style.zIndex = '100000';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `custom-toast level-${type}`;
  toast.style.pointerEvents = 'auto';
  toast.style.backgroundColor = 'var(--bg-panel, #121214)';
  toast.style.border = '1px solid var(--border-slate, #2d2d30)';
  
  const accentColor = type === 'error' ? 'var(--border-focus, #ff4b4b)' : 'var(--term-green, #10b981)';
  toast.style.borderLeft = `3px solid ${accentColor}`;
  toast.style.borderRadius = '4px';
  toast.style.padding = '0.75rem 1rem';
  toast.style.minWidth = '280px';
  toast.style.maxWidth = '360px';
  toast.style.display = 'flex';
  toast.style.justifyContent = 'space-between';
  toast.style.alignItems = 'center';
  toast.style.gap = '0.75rem';
  toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
  
  // Slide in animation styles
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(1rem) scale(0.95)';
  toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

  toast.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 0.15rem; flex: 1;">
      <span style="font-family: var(--font-mono); font-size: 0.65rem; color: ${accentColor}; font-weight: bold; text-transform: uppercase;">
        ${type === 'error' ? 'SYSTEM ERROR' : 'SYSTEM SUCCESS'}
      </span>
      <span style="font-size: 0.75rem; color: var(--text-primary); line-height: 1.4;">${message}</span>
    </div>
    <button class="toast-close-btn" style="
      background: none;
      border: none;
      color: var(--text-muted, #7c7c82);
      cursor: pointer;
      font-size: 0.75rem;
      padding: 0.25rem;
      font-family: var(--font-mono);
      outline: none;
    ">×</button>
  `;

  container.appendChild(toast);
  
  // Trigger entry animation
  toast.offsetHeight; // force reflow
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0) scale(1)';

  const dismissToast = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-0.5rem) scale(0.95)';
    setTimeout(() => {
      toast.remove();
    }, 200);
  };

  toast.querySelector('.toast-close-btn').addEventListener('click', dismissToast);

  // Auto-dismiss after 4 seconds
  setTimeout(dismissToast, 4000);
};
