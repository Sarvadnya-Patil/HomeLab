// Registry of available widget components
import CpuWidget from './cpu.js';
import RamWidget from './ram.js';
import GpuWidget from './gpu.js';
import DiskWidget from './disk.js';
import ServicesWidget from './services.js';
import TerminalWidget from './terminal.js';
import IngressWidget from './ingress.js';
import EventsWidget from './events.js';

export const widgetRegistry = {
  cpu: CpuWidget,
  ram: RamWidget,
  gpu: GpuWidget,
  disk: DiskWidget,
  services: ServicesWidget,
  terminal: TerminalWidget,
  ingress: IngressWidget,
  events: EventsWidget
};

export function getWidget(type) {
  const widget = widgetRegistry[type];
  if (!widget) return null;

  return {
    initialize: () => {},
    subscribe: () => {},
    unsubscribe: () => {},
    resize: () => {},
    destroy: () => {},
    ...widget
  };
}

export default widgetRegistry;
