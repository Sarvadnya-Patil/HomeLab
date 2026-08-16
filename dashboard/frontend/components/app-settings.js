         formEl.querySelector('#btn-save-ssh').addEventListener('click', () => this.saveSSHConfig());
       } catch (err) {
         formEl.innerHTML = `<div style="font-size: 0.75rem; color: #ef4444;">Failed to load SSH configuration: ${err.message}</div>`;
       }
     } else if (this.activeTab === 'desktop') {
       formEl.innerHTML = `<div style="font-size: 0.75rem; color: #a1a1aa;">Loading Remote Desktop configuration...</div>`;
       try {
         const config = await api.get('/api/v1/settings/desktop');
         
         formEl.innerHTML = `
           <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem; border-radius: 0;">
             <div style="border-bottom: 2px dashed #ffffff; padding-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
               <span style="font-weight: 900; text-transform: uppercase; font-size: 0.85rem; color: #ffffff;">Remote Screen Configuration</span>
               <label class="switch" style="position: relative; display: inline-block; width: 34px; height: 20px;">
                 <input type="checkbox" id="desktop-rdp-enabled" ${config.enabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
                 <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #27272a; transition: .3s; border: 1px solid #52525b;"></span>
               </label>
             </div>
             
             <p style="font-size: 0.68rem; color: #a1a1aa; line-height: 1.4; margin: 0;">
               Enabling this setup configures your host's GNOME Remote Desktop service natively on port 3389 and connects to it through the container virtual display frame buffer.
             </p>
 
             <div class="detail-item">
               <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">Host OS Session User (e.g. username)</label>
               <input type="text" id="desktop-host-user" value="${config.hostUser || ''}" placeholder="e.g. username" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
             </div>
 
             <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
               <div class="detail-item">
                 <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">RDP Username</label>
                 <input type="text" id="desktop-rdp-user" value="${config.username || ''}" placeholder="Desired RDP Username" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
               </div>
 
               <div class="detail-item">
                 <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">
                   RDP Password ${config.hasPassword ? '<span style="color: #22c55e;">(Saved)</span>' : ''}
                 </label>
                 <div style="position: relative; width: 100%;">
                   <input type="password" id="desktop-rdp-pass" value="${config.hasPassword ? '••••••••' : ''}" placeholder="Desired RDP Password" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; padding-right: 2.2rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
                   <button type="button" id="toggle-desktop-rdp-pass" style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: #ffffff; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;">
                     <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                       <circle cx="12" cy="12" r="3"></circle>
                     </svg>
                   </button>
                 </div>
               </div>
             </div>
 
             <button class="btn btn-panel btn-open" id="btn-save-desktop" style="margin-top: 0.5rem; width: 100%; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; padding: 0.75rem; box-shadow: 3px 3px 0 #888888;">Save and Apply Settings</button>
           </div>
         `;
         
         const styleId = 'desktop-slider-styles';
         if (!document.getElementById(styleId)) {
           const style = document.createElement('style');
           style.id = styleId;
           style.textContent = `
             #desktop-rdp-enabled:checked + .slider { background-color: #22c55e !important; }
             .slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: #fff; transition: .3s; }
             #desktop-rdp-enabled:checked + .slider:before { transform: translateX(14px); }
           `;
           document.head.appendChild(style);
         }
 
         const passInput = formEl.querySelector('#desktop-rdp-pass');
         const toggleBtn = formEl.querySelector('#toggle-desktop-rdp-pass');
         const eyeIcon = formEl.querySelector('#eye-icon');
         
         toggleBtn.addEventListener('click', () => {
           if (passInput.type === 'password') {
             passInput.type = 'text';
             eyeIcon.innerHTML = `
               <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
               <line x1="1" y1="1" x2="23" y2="23"></line>
             `;
           } else {
             passInput.type = 'password';
             eyeIcon.innerHTML = `
               <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
               <circle cx="12" cy="12" r="3"></circle>
             `;
           }
         });
 
         formEl.querySelector('#btn-save-desktop').addEventListener('click', () => this.saveDesktopConfig());
       } catch (err) {
         formEl.innerHTML = `<div style="font-size: 0.75rem; color: #ef4444;">Failed to load Remote Desktop settings: ${err.message}</div>`;
       }
     } else if (this.activeTab === 'backup') {
       formEl.innerHTML = `
         <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; border-radius: 0;">
           <h4 style="margin: 0; font-weight: 900; text-transform: uppercase; font-size: 0.85rem; color: #ffffff;">Database & Configuration Backup Center</h4>
           <p style="font-size: 0.7rem; color: #a1a1aa; margin: 0; line-height: 1.4;">Create a complete SQL archive snapshot of your workspaces, categories, widgets, encrypted settings, and custom overrides.</p>
           <button class="btn btn-panel btn-open" id="btn-trigger-backup" style="margin-top: 0.5rem; width: 160px; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Run Backup</button>
         </div>
       `;
       formEl.querySelector('#btn-trigger-backup').addEventListener('click', () => this.runBackup());
     }
   },