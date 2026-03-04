import type { Tool } from '../tools';

export const jsonViewer: Tool = {
  path: 'json-viewer',
  name: 'JSON Viewer',
  category: 'Data',
  description: 'View and navigate JSON data in a tree format',
  icon: 'si:json-duotone',
  component: () => import('./json-viewer.vue'),
};
