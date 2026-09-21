 // Remote Desktop Application Component with WebRTC & WebSocket Dual-Mode Transport
 import { api } from '../core/api.js';
 
 export const AppDesktop = {
   container: null,
   ws: null,
   pc: null,
   inputChannel: null,
   cleanupInputListeners: null,
   statsInterval: null,
 
   init(containerEl) {
     this.container = containerEl;
     this.render();
     this.connect();
   },
 
   render() {
     if (!this.container) return;
 
     this.container.innerHTML = `
       <div id="desktop-setup-view" style="max-width: 620px; margin: 4rem auto; background: #000; border: 2px solid #fff; box-shadow: 6px 6px 0 #fff; padding: 2.5rem; font-family: var(--font-mono); border-radius: 0;">
         <h3 style="margin-top: 0; font-size: 0.9rem; font-weight: 900; text-transform: uppercase; color: #fff; border-bottom: 2px dashed #fff; padding-bottom: 0.75rem; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
           <span>Remote Display Stream</span>
           <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase;">Control Console</span>
         </h3>
         
         <p style="font-size: 0.72rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 1.5rem; background: #0e0e11; border: 1px dashed #33333e; padding: 0.75rem;">
           <b>Virtual Display Isolation</b>: Safe sandbox environment streaming desktop pixels directly to the web client using WebRTC and secure WebSocket tunnels.
         </p>
 
         <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222222; padding-bottom: 0.5rem; font-size: 0.7rem;">
             <span style="color: #888;">Desktop Status:</span>
             <span style="color: #eab308; font-weight: bold;" id="desktop-status-val">Connecting...</span>
           </div>
           <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222222; padding-bottom: 0.5rem; font-size: 0.7rem;">
             <span style="color: #888;">Protocol Engine:</span>
             <span style="color: #fff;">Dual Transport (WebRTC / WS)</span>
           </div>
         </div>
 
         <button class="btn btn-panel btn-open" id="btn-start-desktop" disabled style="width: 100%; background: #333; color: #888; font-weight: 900; text-transform: uppercase; padding: 0.85rem; border: 2px solid #333; font-size: 0.75rem; text-align: center;">
           Negotiating Stream Handshake...
         </button>
       </div>
 
       <!-- Live Stream View Container -->
       <div id="desktop-stream-view" style="display: none; width: 100%; height: 100vh; background: #000; position: relative; overflow: hidden; justify-content: center; align-items: center;">
         <!-- Absolutely positioned against the relative parent above rather than percentage-sized as a
              flex child, so its size does not depend on percentage/flex resolution. -->
         <video id="desktop-video" autoplay playsinline muted style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; cursor: default; display: block;"></video>
         <canvas id="desktop-canvas" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; cursor: default; display: none;"></canvas>
         
         <!-- Global Action Dock -->
         <div id="desktop-action-dock" style="position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%); background: rgba(5, 7, 12, 0.95); border: 1.5px solid #27272a; padding: 0.55rem 1.25rem; display: flex; gap: 1.5rem; align-items: center; border-radius: 2px; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
           <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.65rem; color: #10b981; font-weight: bold; text-transform: uppercase;">
             <span style="width: 7px; height: 7px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
             Live
           </div>
           <div style="width: 1px; height: 12px; background: #27272a;"></div>
           <button id="btn-desktop-fit" style="background: none; border: none; color: #a1a1aa; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; font-weight: bold;">Toggle Scale</button>
           <div style="width: 1px; height: 12px; background: #27272a;"></div>
           <button id="btn-desktop-disconnect" style="background: none; border: none; color: #ef4444; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; font-weight: bold;">Disconnect</button>
         </div>
       </div>
     `;
 
     const launchBtn = this.container.querySelector('#btn-start-desktop');
     if (launchBtn) {
       launchBtn.addEventListener('click', () => this.connect());
     }
   },
 
   async connect() {
     const video = this.container.querySelector('#desktop-video');
     if (video) video.onplaying = () => this.syncDisplaySurface();
     const setupView = this.container.querySelector('#desktop-setup-view');
     const streamView = this.container.querySelector('#desktop-stream-view');
     const statusVal = this.container.querySelector('#desktop-status-val');
     const launchBtn = this.container.querySelector('#btn-start-desktop');
 
     if (launchBtn) {
       launchBtn.disabled = true;
       launchBtn.textContent = 'Negotiating Stream Handshake...';
       launchBtn.style.background = '#333';
       launchBtn.style.color = '#888';
       launchBtn.style.borderColor = '#333';
     }
     if (statusVal) {
       statusVal.textContent = 'Connecting...';
       statusVal.style.color = '#eab308';
     }
 
     try {
       const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
       const ticket = await api.wsTicket();
       const wsUrl = `${wsProtocol}//${window.location.host}/ws/desktop?ticket=${encodeURIComponent(ticket)}`;
 
       this.ws = new WebSocket(wsUrl);
 
       this.ws.onopen = async () => {
         this.pc = new RTCPeerConnection({
           iceServers: [
             { urls: 'stun:stun.l.google.com:19302' },
             { urls: 'stun:stun1.l.google.com:19302' },
             { urls: 'stun:stun2.l.google.com:19302' }
           ]
         });
 
         this.pc.ontrack = (event) => {
           const canvas = this.container?.querySelector('#desktop-canvas');
           if (video) {
             if (event.streams && event.streams[0]) {
               video.srcObject = event.streams[0];
             } else {
               video.srcObject = new MediaStream([event.track]);
             }
             
             video.style.display = 'block';
             if (canvas) canvas.style.display = 'none';
             video.play().catch((e) => console.warn('Video auto-play warning:', e));
             
             if (setupView) setupView.style.display = 'none';
             if (streamView) streamView.style.display = 'flex';
           }
         };
 
         this.inputChannel = this.pc.createDataChannel('input', { ordered: true });
         this.inputChannel.onopen = () => {
           console.log('WebRTC input channel active');
         };
 
         this.bindInputEvents(video);
 
         this.pc.addTransceiver('video', { direction: 'recvonly' });
         const offer = await this.pc.createOffer();
         await this.pc.setLocalDescription(offer);
 
         // Await local ICE gathering completion for STUN discovery candidate baking
         if (this.pc.iceGatheringState !== 'complete') {
           await new Promise((resolve) => {
             const checkState = () => {
               if (this.pc.iceGatheringState === 'complete') {
                 this.pc.removeEventListener('icegatheringstatechange', checkState);
                 resolve();
               }
             };
             this.pc.addEventListener('icegatheringstatechange', checkState);
             setTimeout(resolve, 1500);
           });
         }
 
         this.ws.send(JSON.stringify({
           type: 'offer',
           sdp: this.pc.localDescription.sdp
         }));
 
         setTimeout(() => {
           const setupView = this.container?.querySelector('#desktop-setup-view');
           const streamView = this.container?.querySelector('#desktop-stream-view');
           if (setupView && setupView.style.display !== 'none') {
             setupView.style.display = 'none';
             if (streamView) streamView.style.display = 'flex';
           }
         }, 800);
 
         this.startStatsPoller();
       };
 
       this.ws.onmessage = async (evt) => {
         try {
           const rawText = (typeof Blob !== 'undefined' && evt.data instanceof Blob) ? await evt.data.text() : evt.data;
           const payload = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
           if (payload.type === 'answer') {
             await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
           } else if (payload.type === 'frame') {
             const canvas = this.container.querySelector('#desktop-canvas');
             const video = this.container.querySelector('#desktop-video');
             const setupView = this.container.querySelector('#desktop-setup-view');
             const streamView = this.container.querySelector('#desktop-stream-view');
             
             // Only draw to canvas if WebRTC video is NOT actively streaming
             const isWebRTCPlaying = video && video.srcObject && video.readyState >= 2 && !video.paused;
             if (!isWebRTCPlaying && canvas && payload.data) {
               const img = new Image();
               img.onload = () => {
                 // The video may have started playing while this frame was decoding
                 if (this.isVideoPlaying()) {
                   this.syncDisplaySurface();
                   return;
                 }
                 canvas.width = img.width;
                 canvas.height = img.height;
                 const ctx = canvas.getContext('2d');
                 ctx.drawImage(img, 0, 0);
                 
                 if (canvas.style.display !== 'block') {
                   canvas.style.display = 'block';
                   if (video) video.style.display = 'none';
                 }
                 
                 if (setupView && setupView.style.display !== 'none') setupView.style.display = 'none';
                 if (streamView && streamView.style.display !== 'flex') streamView.style.display = 'flex';
                 
               };
               img.src = `data:image/jpeg;base64,${payload.data}`;
             }
           } else if (payload.type === 'status') {
             if (payload.status === 'daemon_online') {
               console.log('[DesktopClient] Host daemon online. Initiating WebRTC offer...');
               const offer = await this.pc.createOffer();
               await this.pc.setLocalDescription(offer);
               this.ws.send(JSON.stringify({
                 type: 'offer',
                 sdp: this.pc.localDescription.sdp
               }));
             } else if (payload.status === 'daemon_offline') {
               const statusVal = this.container?.querySelector('#desktop-status-val');
               if (statusVal) {
                 statusVal.textContent = 'Host daemon offline';
                 statusVal.style.color = '#ef4444';
               }
             }
           } else if (payload.type === 'error') {
             alert(`Stream error: ${payload.message}`);
             this.destroy();
           }
         } catch (err) {
           console.error('Failed to process message payload:', err);
         }
       };
 
       this.ws.onclose = () => this.destroy();
       this.ws.onerror = () => this.destroy();
 
       const fitBtn = this.container.querySelector('#btn-desktop-fit');
       if (fitBtn && video) {
         fitBtn.addEventListener('click', () => {
           video.style.objectFit = video.style.objectFit === 'contain' ? 'cover' : 'contain';
         });
       }
 
       const disconnectBtn = this.container.querySelector('#btn-desktop-disconnect');
       if (disconnectBtn) {
         disconnectBtn.addEventListener('click', () => this.destroy());
       }
 
     } catch (err) {
       alert(`Connection Negotiation Failed: ${err.message}`);
       this.destroy();
     }
   },
 
   // True when the WebRTC video is actually rendering frames.
   isVideoPlaying() {
     const video = this.container?.querySelector('#desktop-video');
     return !!(video && video.srcObject && !video.paused && video.readyState >= 2);
   },

   // Shows the live video and hides the JPEG fallback image once the video is playing. A fallback
   // frame that finishes decoding around the moment the video starts used to hide the video, and
   // nothing ever switched back, so the page kept showing the last fallback frame while the real
   // video played invisibly (its element size was 0). Called whenever playback starts and on every stats tick, so it always recovers.
   syncDisplaySurface() {
     if (!this.isVideoPlaying()) return;
     const video = this.container.querySelector('#desktop-video');
     const canvas = this.container.querySelector('#desktop-canvas');
     video.style.display = 'block';
     if (canvas) canvas.style.display = 'none';
   },

   startStatsPoller() {
     if (this.statsInterval) clearInterval(this.statsInterval);
     this.lastFramesDecoded = 0;
 
     this.statsInterval = setInterval(async () => {
       if (!this.pc) return;
       this.syncDisplaySurface();
 
       try {
         const stats = await this.pc.getStats();
         let framesDecoded = 0;
         stats.forEach((report) => {
           if (report.type === 'inbound-rtp' && report.kind === 'video') {
             framesDecoded = report.framesDecoded || 0;
           }
         });
 
         // Tell the daemon whether WebRTC video is actually rendering, so it knows whether it is safe to
         // stop the JPEG/WebSocket fallback stream. ICE being "connected" only proves connectivity was
         // negotiated, not that frames are flowing, so the daemon relies on this confirmation instead.
         // Video counts as playing while frames keep being decoded and the element is rendering them; a
         // stall lets the daemon resume the fallback by itself.
         const framesAdvanced = framesDecoded > this.lastFramesDecoded;
         this.lastFramesDecoded = framesDecoded;
         const isPlaying = framesAdvanced && this.isVideoPlaying();
         if (this.ws && this.ws.readyState === WebSocket.OPEN) {
           this.ws.send(JSON.stringify({ type: 'playback_status', playing: isPlaying }));
         }
       } catch (err) {
         console.warn('Stats collector error:', err);
       }
     }, 1000);
   },

    bindInputEvents(video) {
      const canvas = this.container?.querySelector('#desktop-canvas');
      const targetEl = canvas || video;
      if (!targetEl) return;

      const sendInput = (data) => {
        const msg = JSON.stringify(data);
        if (this.inputChannel && this.inputChannel.readyState === 'open') {
          this.inputChannel.send(msg);
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(msg);
        }
      };

      const getNormalizedCoordinates = (e, el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

        const isCanvas = (canvas && canvas.style.display !== 'none');
        const contentWidth = isCanvas ? canvas.width : (video?.videoWidth || rect.width);
        const contentHeight = isCanvas ? canvas.height : (video?.videoHeight || rect.height);

        if (contentWidth > 0 && contentHeight > 0) {
          const videoRatio = contentWidth / contentHeight;
          const containerRatio = rect.width / rect.height;

          let renderedWidth = rect.width;
          let renderedHeight = rect.height;
          let offsetX = 0;
          let offsetY = 0;

          if (containerRatio > videoRatio) {
            renderedWidth = rect.height * videoRatio;
            offsetX = (rect.width - renderedWidth) / 2;
          } else {
            renderedHeight = rect.width / videoRatio;
            offsetY = (rect.height - renderedHeight) / 2;
          }

          const clientX = e.clientX - rect.left - offsetX;
          const clientY = e.clientY - rect.top - offsetY;

          return {
            x: Math.max(0, Math.min(1, clientX / renderedWidth)),
            y: Math.max(0, Math.min(1, clientY / renderedHeight))
          };
        }

        return {
          x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        };
      };

      // Mouse moves fire hundreds of times a second on a high-polling mouse. Sending each one floods the
      // host, whose input handling then falls behind the video and key presses. Keep only the newest
      // position and send it once per animation frame.
      let pendingMove = null;
      let moveFrame = 0;
      const flushPendingMove = () => {
        if (moveFrame) {
          cancelAnimationFrame(moveFrame);
          moveFrame = 0;
        }
        if (pendingMove) {
          sendInput(pendingMove);
          pendingMove = null;
        }
      };

      const onMouseMove = (e) => {
        const el = (canvas && canvas.style.display !== 'none') ? canvas : video;
        if (el) {
          const coords = getNormalizedCoordinates(e, el);
          pendingMove = { type: 'mousemove', x: coords.x, y: coords.y };
          if (!moveFrame) moveFrame = requestAnimationFrame(flushPendingMove);
        }
      };

      const activePressedKeys = new Set();
      const activePressedButtons = new Set();

      const onMouseDown = (e) => {
        flushPendingMove();
        const btnMap = { 0: 'left', 1: 'middle', 2: 'right', 3: 'back', 4: 'forward' };
        const btn = btnMap[e.button] || 'left';
        activePressedButtons.add(btn);
        sendInput({
          type: 'mousedown',
          button: btn
        });
      };

      const onMouseUp = (e) => {
        flushPendingMove();
        const btnMap = { 0: 'left', 1: 'middle', 2: 'right', 3: 'back', 4: 'forward' };
        const btn = btnMap[e.button] || 'left';
        activePressedButtons.delete(btn);
        sendInput({
          type: 'mouseup',
          button: btn
        });
      };

      const releaseAllInputState = () => {
        if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0; }
        pendingMove = null;
        if (activePressedButtons.size > 0) {
          activePressedButtons.forEach(btn => {
            sendInput({ type: 'mouseup', button: btn });
          });
          activePressedButtons.clear();
        }
        if (activePressedKeys.size > 0) {
          activePressedKeys.forEach(code => {
            sendInput({ type: 'keyup', code: code, key: code });
          });
          activePressedKeys.clear();
        }
        sendInput({ type: 'reset_inputs' });
      };

      const onKeyDown = (e) => {
        const streamView = this.container?.querySelector('#desktop-stream-view');
        if (streamView && streamView.style.display !== 'none') {
          if (['Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'F1', 'F3', 'F5', 'F6', 'F11', 'F12'].includes(e.key)) {
            e.preventDefault();
          }
          activePressedKeys.add(e.code || e.key);
          sendInput({
            type: 'keydown',
            key: e.key,
            code: e.code
          });
        }
      };

      const onKeyUp = (e) => {
        const streamView = this.container?.querySelector('#desktop-stream-view');
        if (streamView && streamView.style.display !== 'none') {
          activePressedKeys.delete(e.code || e.key);
          sendInput({
            type: 'keyup',
            key: e.key,
            code: e.code
          });
        }
      };

      const onWheel = (e) => {
        e.preventDefault();
        sendInput({
          type: 'wheel',
          dx: e.deltaX,
          dy: e.deltaY
        });
      };

      if (canvas) {
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      if (video) {
        video.addEventListener('mousemove', onMouseMove);
        video.addEventListener('mousedown', onMouseDown);
        video.addEventListener('wheel', onWheel, { passive: false });
        video.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', releaseAllInputState);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          releaseAllInputState();
        }
      });

      this.cleanupInputListeners = () => {
        if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0; }
        pendingMove = null;
        if (canvas) {
          canvas.removeEventListener('mousemove', onMouseMove);
          canvas.removeEventListener('mousedown', onMouseDown);
          canvas.removeEventListener('mouseup', onMouseUp);
          canvas.removeEventListener('wheel', onWheel);
        }
        if (video) {
          video.removeEventListener('mousemove', onMouseMove);
          video.removeEventListener('mousedown', onMouseDown);
          video.removeEventListener('mouseup', onMouseUp);
          video.removeEventListener('wheel', onWheel);
        }
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    },
 
   destroy() {
     if (this.statsInterval) {
       clearInterval(this.statsInterval);
       this.statsInterval = null;
     }
 
     if (this.cleanupInputListeners) {
       this.cleanupInputListeners();
       this.cleanupInputListeners = null;
     }
 
     if (this.ws) {
       this.ws.onclose = null;
       this.ws.onerror = null;
       this.ws.onmessage = null;
       try {
         this.ws.close();
       } catch {}
       this.ws = null;
     }
 
     if (this.pc) {
       try {
         this.pc.close();
       } catch {}
       this.pc = null;
     }
 
     this.inputChannel = null;
 
     const setupView = this.container?.querySelector('#desktop-setup-view');
     const streamView = this.container?.querySelector('#desktop-stream-view');
     const statusVal = this.container?.querySelector('#desktop-status-val');
     const launchBtn = this.container?.querySelector('#btn-start-desktop');
 
     if (setupView) setupView.style.display = 'block';
     if (streamView) streamView.style.display = 'none';
     if (statusVal) {
       statusVal.textContent = 'Offline';
       statusVal.style.color = '#ef4444';
     }
     if (launchBtn) {
       launchBtn.disabled = false;
       launchBtn.textContent = 'Connect Remote Desktop Stream';
       launchBtn.style.background = '#fff';
       launchBtn.style.color = '#000';
       launchBtn.style.borderColor = '#fff';
     }
   }
 };
 
 export default AppDesktop;
 