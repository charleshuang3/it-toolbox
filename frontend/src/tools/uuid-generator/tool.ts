import type { Tool } from '../tools';

export const uuidGenerator: Tool = {
  path: 'uuid-generator',
  name: 'UUID Generator',
  category: 'Crypto',
  description: 'UUID is a 128-bit number used to identify information, this tool supports v4, v5, v7',
  icon: 'fluent-emoji-high-contrast:id-button',
  component: () => import('./uuid-generator.vue'),
};
