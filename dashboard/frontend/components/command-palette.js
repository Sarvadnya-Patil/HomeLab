// VS Code style Command Palette (Ctrl+K search utility overlay)
import { store } from '../core/state.js';

export const CommandPalette = {
  init() {
    // Standard search bar filters containers on input, runs command on Enter
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      mainSearchBar.addEventListener('input', () => {
        store.emit('services', { value: store.get('services') || [] });
        store.emit('notifications', { value: store.get('notifications') || [] });
      });

      mainSearchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = mainSearchBar.value.trim();
          if (val) {
            store.emit('terminal_run_command', val);
            mainSearchBar.value = '';
          }
        }
      });
    }
  }
};

export default CommandPalette;
