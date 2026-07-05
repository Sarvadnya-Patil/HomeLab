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
            <button class="btn-dialog-cancel">Cancel</button>
            <button class="btn-dialog-ok">OK</button>
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
            <button class="btn-dialog-cancel">Cancel</button>
            <button class="btn-dialog-ok">Confirm</button>
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
  },

  // Returns Promise resolving to string (hex color code like #3b82f6) or null if cancelled
  color({ title, defaultValue = '#3b82f6' }) {
    return new Promise((resolve) => {
      // Helper conversion functions
      const hexToHsv = (hex) => {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) {
          hex = hex.split('').map(c => c + c).join('');
        }
        let r = parseInt(hex.substring(0, 2), 16) / 255;
        let g = parseInt(hex.substring(2, 4), 16) / 255;
        let b = parseInt(hex.substring(4, 6), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
          h = 0;
        } else {
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return {
          h: Math.round(h * 360),
          s: Math.round(s * 100),
          v: Math.round(v * 100)
        };
      };

      const hsvToRgb = (h, s, v) => {
        h = parseFloat(h) || 0;
        s = parseFloat(s) || 0;
        v = parseFloat(v) || 0;
        s /= 100;
        v /= 100;
        let c = v * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = v - c;
        let r = 0, g = 0, b = 0;
        if (h >= 0 && h < 60) { r = c; g = x; }
        else if (h >= 60 && h < 120) { r = x; g = c; }
        else if (h >= 120 && h < 180) { g = c; b = x; }
        else if (h >= 180 && h < 240) { g = x; b = c; }
        else if (h >= 240 && h < 300) { r = x; b = c; }
        else if (h >= 300 && h <= 360) { r = c; b = x; }
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        return { r, g, b };
      };

      const rgbToHex = (r, g, b) => {
        const toHex = (c) => {
          const val = Math.max(0, Math.min(255, Math.round(c) || 0));
          const hex = val.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        };
        return "#" + toHex(r) + toHex(g) + toHex(b);
      };

      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.innerHTML = `
        <div class="custom-dialog-box animate-modal" style="max-width: 320px; padding: 1.25rem;">
          <div class="custom-dialog-header" style="margin-bottom: 0.75rem; text-align: left;">${title}</div>
          
          <div class="color-picker-sb-container" style="position: relative; width: 100%; height: 160px; border-radius: 8px; overflow: hidden; cursor: crosshair; margin-bottom: 1rem; background-color: rgb(255, 0, 0); user-select: none;">
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to right, #fff, rgba(255,255,255,0));"></div>
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to top, #000, rgba(0,0,0,0));"></div>
            <div class="color-picker-cursor" style="position: absolute; width: 14px; height: 14px; border: 2.5px solid #fff; border-radius: 50%; transform: translate(-7px, -7px); box-shadow: 0 0 4px rgba(0,0,0,0.6); pointer-events: none; left: 100%; top: 0%;"></div>
          </div>

          <div style="margin-bottom: 1rem; display: flex; align-items: center; position: relative; height: 14px;">
            <input type="range" class="custom-hue-slider" min="0" max="360" value="0" style="width: 100%; -webkit-appearance: none; height: 10px; border-radius: 5px; background: linear-gradient(to right, red, #ff0, lime, #0ff, blue, #f0f, red); outline: none; margin: 0; cursor: pointer;">
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem;">
            <div class="color-picker-preview" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; background: ${defaultValue};"></div>
            <div style="display: flex; align-items: center; background: #171b26; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0.4rem 0.6rem; width: 100%;">
              <span style="color: var(--text-muted); font-size: 0.8rem; margin-right: 0.2rem; font-family: var(--font-mono);">#</span>
              <input type="text" class="color-picker-hex-input" style="background: transparent; border: none; color: #fff; font-family: var(--font-mono); font-size: 0.8rem; width: 100%; outline: none; text-transform: uppercase;" value="${defaultValue.replace('#', '')}" maxlength="6">
              <button class="btn-copy-color" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem; display: flex; align-items: center;" title="Copy to clipboard">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 13px; height: 13px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
            <div style="background: #171b26; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0.4rem 0.6rem; font-size: 0.75rem; color: var(--text-secondary); cursor: pointer; user-select: none;">Hex</div>
          </div>

          <div class="custom-dialog-actions">
            <button class="btn-dialog-cancel">Cancel</button>
            <button class="btn-dialog-ok">Select</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const sbContainer = overlay.querySelector('.color-picker-sb-container');
      const cursor = overlay.querySelector('.color-picker-cursor');
      const hueSlider = overlay.querySelector('.custom-hue-slider');
      const preview = overlay.querySelector('.color-picker-preview');
      const hexInput = overlay.querySelector('.color-picker-hex-input');
      const okBtn = overlay.querySelector('.btn-dialog-ok');
      const cancelBtn = overlay.querySelector('.btn-dialog-cancel');
      const copyBtn = overlay.querySelector('.btn-copy-color');

      let currentH = 0;
      let currentS = 100;
      let currentV = 100;

      if (defaultValue) {
        try {
          const hsv = hexToHsv(defaultValue);
          currentH = hsv.h;
          currentS = hsv.s;
          currentV = hsv.v;
        } catch {}
      }

      const updateColorUI = () => {
        sbContainer.style.backgroundColor = `hsl(${currentH}, 100%, 50%)`;
        
        cursor.style.left = `${currentS}%`;
        cursor.style.top = `${100 - currentV}%`;

        const rgb = hsvToRgb(currentH, currentS, currentV);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

        preview.style.backgroundColor = hex;
        if (document.activeElement !== hexInput) {
          hexInput.value = hex.replace('#', '');
        }
        hueSlider.value = currentH;
      };

      setTimeout(updateColorUI, 50);

      let isDragging = false;
      const handleSBDrop = (e) => {
        const rect = sbContainer.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        }
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        currentS = Math.round((x / rect.width) * 100);
        currentV = Math.round((1 - (y / rect.height)) * 100);

        updateColorUI();
      };

      sbContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        handleSBDrop(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDragging) handleSBDrop(e);
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

      sbContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        handleSBDrop(e);
      });
      window.addEventListener('touchmove', (e) => {
        if (isDragging) handleSBDrop(e);
      });
      window.addEventListener('touchend', () => {
        isDragging = false;
      });

      hueSlider.addEventListener('input', () => {
        currentH = parseInt(hueSlider.value);
        updateColorUI();
      });

      hexInput.addEventListener('input', () => {
        let val = hexInput.value.trim();
        if (val.length === 6) {
          try {
            const hsv = hexToHsv('#' + val);
            currentH = hsv.h;
            currentS = hsv.s;
            currentV = hsv.v;
            updateColorUI();
          } catch {}
        }
      });

      copyBtn.addEventListener('click', () => {
        const rgb = hsvToRgb(currentH, currentS, currentV);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        navigator.clipboard.writeText(hex).then(() => {
          const originalColor = copyBtn.style.color;
          copyBtn.style.color = '#10b981';
          setTimeout(() => copyBtn.style.color = originalColor, 1000);
        });
      });

      const cleanup = (val) => {
        overlay.classList.add('fade-out');
        overlay.querySelector('.custom-dialog-box').classList.add('scale-out');
        setTimeout(() => {
          overlay.remove();
          resolve(val);
        }, 150);
      };

      okBtn.addEventListener('click', () => {
        const rgb = hsvToRgb(currentH, currentS, currentV);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        cleanup(hex);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup(null);
      });

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          window.removeEventListener('keydown', escHandler);
          cleanup(null);
        }
      };
      window.addEventListener('keydown', escHandler);
    });
  },

  promptCategory({ templates }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.style.userSelect = 'none';
      
      let templatesHtml = '';
      if (templates && templates.length > 0) {
        templatesHtml = `
          <div class="custom-dialog-body" style="margin-bottom: 0.5rem; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Quick Add Defaults</div>
          <div class="dialog-templates-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 1.25rem;">
            ${templates.map(t => `
              <button class="btn-template-item" data-id="${t.id}" data-name="${t.name}" data-accent="${t.accent}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-panel); border: 1px solid var(--border-slate); border-radius: 6px; color: var(--text-primary); cursor: pointer; text-align: left; transition: all 0.15s ease;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${t.accent};"></span>
                <span style="font-size: 0.75rem; font-weight: 500;">${t.name}</span>
              </button>
            `).join('')}
          </div>
          <div style="border-top: 1px solid var(--border-slate); margin-bottom: 1rem; opacity: 0.5;"></div>
        `;
      }

      const swatchColors = [
        '#3b82f6', // Blue
        '#10b981', // Green
        '#a855f7', // Purple
        '#f59e0b', // Orange
        '#06b6d4', // Cyan
        '#eab308', // Yellow
        '#ef4444', // Red
        '#ec4899'  // Pink
      ];

      const swatchesHtml = `
        <div class="custom-dialog-body" style="margin-top: 1rem; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Accent Color</div>
        <div class="dialog-color-swatches" style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1rem;">
          ${swatchColors.map((color, index) => `
            <button class="btn-swatch-item ${index === 0 ? 'active' : ''}" data-color="${color}" style="width: 24px; height: 24px; border-radius: 50%; background-color: ${color}; border: 2px solid transparent; cursor: pointer; outline: none; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: ${index === 0 ? '0 0 0 2px var(--text-primary)' : 'none'}; transform: ${index === 0 ? 'scale(1.1)' : 'none'};"></button>
          `).join('')}
          <button class="custom-swatch-picker-container" style="width: 24px; height: 24px; border-radius: 50%; overflow: hidden; cursor: pointer; background: conic-gradient(red, yellow, green, cyan, blue, magenta, red); transition: transform 0.15s ease, box-shadow 0.15s ease; border: 1px solid var(--border-slate); outline: none; padding: 0;"></button>
        </div>
      `;

      overlay.innerHTML = `
        <div class="custom-dialog-box animate-modal" style="max-width: 400px; width: 90%;">
          <div class="custom-dialog-header">Add Services Category</div>
          
          ${templatesHtml}

          <div class="custom-dialog-body" style="margin-bottom: 0.5rem; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Custom Category</div>
          <div class="custom-dialog-input-wrapper">
            <input type="text" class="custom-dialog-input" placeholder="Enter custom name..." />
          </div>
          
          ${swatchesHtml}

          <div class="custom-dialog-actions" style="margin-top: 1.25rem;">
            <button class="btn-dialog-cancel">Cancel</button>
            <button class="btn-dialog-ok">Create Custom</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('.custom-dialog-input');
      input.focus();

      const cleanup = (val) => {
        overlay.classList.add('fade-out');
        overlay.querySelector('.custom-dialog-box').classList.add('scale-out');
        setTimeout(() => {
          overlay.remove();
          resolve(val);
        }, 150);
      };

      overlay.querySelectorAll('.btn-template-item').forEach(btn => {
        btn.addEventListener('click', () => {
          cleanup({
            type: 'template',
            id: btn.getAttribute('data-id'),
            name: btn.getAttribute('data-name'),
            accent: btn.getAttribute('data-accent')
          });
        });
        btn.addEventListener('mouseenter', () => {
          btn.style.borderColor = btn.getAttribute('data-accent');
          btn.style.background = 'var(--bg-shell)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.borderColor = 'var(--border-slate)';
          btn.style.background = 'var(--bg-panel)';
        });
      });

      let selectedColor = '#3b82f6';
      
      const selectSwatch = (color, targetElement) => {
        selectedColor = color;
        overlay.querySelectorAll('.btn-swatch-item').forEach(el => {
          el.style.boxShadow = 'none';
          el.style.transform = 'none';
        });
        const customContainer = overlay.querySelector('.custom-swatch-picker-container');
        customContainer.style.boxShadow = 'none';
        customContainer.style.transform = 'none';

        targetElement.style.boxShadow = '0 0 0 2px var(--text-primary)';
        targetElement.style.transform = 'scale(1.1)';
      };

      overlay.querySelectorAll('.btn-swatch-item').forEach(swatch => {
        swatch.addEventListener('click', () => {
          selectSwatch(swatch.getAttribute('data-color'), swatch);
        });
      });

      const customContainer = overlay.querySelector('.custom-swatch-picker-container');
      
      customContainer.addEventListener('click', async () => {
        const chosenColor = await this.color({
          title: 'Custom Color',
          defaultValue: selectedColor
        });
        if (chosenColor) {
          customContainer.style.background = chosenColor;
          selectSwatch(chosenColor, customContainer);
        }
      });

      overlay.querySelector('.btn-dialog-ok').addEventListener('click', () => {
        const val = input.value.trim();
        if (val) {
          cleanup({ type: 'custom', name: val, accent: selectedColor });
        }
      });

      overlay.querySelector('.btn-dialog-cancel').addEventListener('click', () => {
        cleanup(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = input.value.trim();
          if (val) cleanup({ type: 'custom', name: val, accent: selectedColor });
        } else if (e.key === 'Escape') {
          cleanup(null);
        }
      });
    });
  }
};
