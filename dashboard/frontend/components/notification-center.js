// Notifications Center slide-out panel
import { store } from '../core/state.js';
import { api } from '../core/api.js';

export const NotificationCenter = {
  el: null,
  bodyList: null,

  init() {
    this.createDom();

    store.on('notificationCenterOpen', ({ value }) => {
      if (value) this.open();
      else this.close();
    });

    store.on('notifications', () => this.render());
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  createDom() {
    if (document.getElementById('notification-center-drawer')) return;

    this.el = document.createElement('div');
    this.el.id = 'notification-center-drawer';
    this.el.className = 'slideout-drawer';
    this.el.style.transform = 'translateX(100%)';
    this.el.innerHTML = `
      <div class="drawer-header">
        <span class="drawer-title">Alert Notifications</span>
        <div class="drawer-header-actions">
          <button class="btn btn-panel" id="btn-clear-notifications">Clear All</button>
          <button class="btn btn-panel" id="btn-close-drawer">X</button>
        </div>
      </div>
      <div class="drawer-body" id="notifications-drawer-body">
        <!-- Persistent notifications go here -->
      </div>
    `;

    document.body.appendChild(this.el);
    this.bodyList = this.el.querySelector('#notifications-drawer-body');

    // Close action
    this.el.querySelector('#btn-close-drawer').addEventListener('click', () => {
      store.set('notificationCenterOpen', false);
    });

    // Clear action
    this.el.querySelector('#btn-clear-notifications').addEventListener('click', () => this.clearAll());
  },

  open() {
    this.el.style.transform = 'translateX(0)';
    this.render();
  },

  close() {
    this.el.style.transform = 'translateX(100%)';
  },

  async clearAll() {
    try {
      await api.delete('/api/v1/notifications/read');
      store.set('notifications', []);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  },

  async markAsRead(id, rowEl) {
    try {
      await api.put(`/api/v1/notifications/${id}/read`);
      rowEl.classList.add('read');
      
      const current = store.get('notifications') || [];
      store.set('notifications', current.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  },

  render() {
    if (!this.bodyList) return;

    const list = store.get('notifications') || [];
    this.bodyList.innerHTML = '';

    if (list.length === 0) {
      this.bodyList.innerHTML = `<div class="drawer-empty-state">No notifications recorded in history.</div>`;
      return;
    }

    list.forEach(item => {
      const row = document.createElement('div');
      row.className = `notification-drawer-item level-${item.level || 'info'} ${item.read ? 'read' : ''}`;
      
      const escOrigin = this.escapeHtml(item.origin || '');
      const escMessage = this.escapeHtml(item.message || '');
      
      row.innerHTML = `
        <div class="notif-drawer-meta">
          <span class="notif-drawer-time">[${this.escapeHtml(item.createdAt || '')}]</span>
          <span class="notif-drawer-origin">${escOrigin}</span>
        </div>
        <div class="notif-drawer-msg">${escMessage}</div>
      `;

      if (!item.read) {
        row.addEventListener('click', () => this.markAsRead(item.id, row));
      }

      this.bodyList.appendChild(row);
    });
  }
};

export default NotificationCenter;
