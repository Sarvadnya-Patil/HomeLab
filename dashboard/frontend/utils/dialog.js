// Custom, premium Dialog subsystem component (modals, confirms, prompts)
export const Dialog = {
  // Returns Promise resolving to string (input value) or null if cancelled
  prompt({ title, message, placeholder = '', defaultValue = '' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.innerHTML = `
        <div class="custom-dialog-box animate-modal">
          <div class="custom-dialog-header">${title}</div>
          <div class="custom-dialog-body">${message}</div>
          <div class="custom-dialog-input-wrapper">
            <input type="text" class="custom-dialog-input" placeholder="${placeholder}" value="${defaultValue}" />
          </div>
          <div class="custom-dialog-actions">
            <button class="btn btn-dialog-cancel">Cancel</button>
            <button class="btn btn-dialog-ok">OK</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('.custom-dialog-input');
      input.focus();
      input.select();

      const cleanup = (val) => {
        overlay.classList.add('fade-out');
        overlay.querySelector('.custom-dialog-box').classList.add('scale-out');
        setTimeout(() => {
          overlay.remove();
          resolve(val);
        }, 150);
      };

      overlay.querySelector('.btn-dialog-ok').addEventListener('click', () => {
        cleanup(input.value.trim());
      });

      overlay.querySelector('.btn-dialog-cancel').addEventListener('click', () => {
        cleanup(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          cleanup(input.value.trim());
        } else if (e.key === 'Escape') {
          cleanup(null);
        }
      });
    });
  },

  // Returns Promise resolving to true or false
  confirm({ title, message }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.innerHTML = `
        <div class="custom-dialog-box animate-modal">
          <div class="custom-dialog-header">${title}</div>
          <div class="custom-dialog-body">${message}</div>
          <div class="custom-dialog-actions">
            <button class="btn btn-dialog-cancel">Cancel</button>
            <button class="btn btn-dialog-ok">Confirm</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cleanup = (val) => {
        overlay.classList.add('fade-out');
        overlay.querySelector('.custom-dialog-box').classList.add('scale-out');
        setTimeout(() => {
          overlay.remove();
          resolve(val);
        }, 150);
      };

      overlay.querySelector('.btn-dialog-ok').addEventListener('click', () => cleanup(true));
      overlay.querySelector('.btn-dialog-cancel').addEventListener('click', () => cleanup(false));

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          window.removeEventListener('keydown', escHandler);
          cleanup(false);
        }
      };
      window.addEventListener('keydown', escHandler);
    });
  }
};
