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
 import { AppDesktop } from './components/app-desktop.js';
 import { AppDesigner } from './components/app-designer.js';
 import { AppHealth } from './components/app-health.js';
 import { AppJobs } from './components/app-jobs.js';
 
 document.addEventListener('DOMContentLoaded', async () => {
   console.log('Booting HomeLab OS Control Plane...');
 
   const viewport = document.getElementById('widget-grid-viewport');
   const appShell = document.querySelector('.app-shell');
 
   // 1. Initialize global overlay components
   Header.init();
   CommandPalette.init();
   NotificationCenter.init();
   Sidebar.init(document.getElementById('sidebar-nav-menu'));
 
   // 1.5. Bind logged-in user profile view update state changes
   store.on('currentUser', ({ value }) => {
     const displayNameEl = document.getElementById('user-display-name');
     const roleEl = document.getElementById('user-role');
     const avatarEl = document.getElementById('user-avatar');
     
     if (value) {
       if (displayNameEl) displayNameEl.textContent = value.displayName || value.username || 'Administrator';
       if (roleEl) roleEl.textContent = value.role || 'ADMIN';
       if (avatarEl) {
         const name = value.displayName || value.username || 'A';
         avatarEl.textContent = name.charAt(0).toUpperCase();
       }
     }
   });
 
   // 2. Register dynamic view router
   store.on('activeApp', ({ value }) => {
     console.log(`Routing active viewport application: [${value}]`);
     
     if (appShell) {
       if (value === 'terminal' || value === 'desktop') {
         appShell.classList.add('terminal-active-mode');
       } else {
         appShell.classList.remove('terminal-active-mode');
       }
     }
 
     const cmdBar = document.querySelector('.command-bar');
     if (cmdBar) {
       cmdBar.style.display = (value === 'terminal' || value === 'desktop') ? 'none' : 'flex';
     }
 
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
       window.activeAppDestroy = () => AppTerminal.destroy();
     } else if (value === 'desktop') {
       viewport.className = 'app-viewport';
       AppDesktop.init(viewport);
       window.activeAppDestroy = () => AppDesktop.destroy();
     }
   });
 
   const startHealthPolling = () => {
     const poll = async () => {