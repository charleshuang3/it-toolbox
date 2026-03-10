import type { Tool } from '../tools';

export const tokenCounter: Tool = {
  path: 'token-counter',
  name: 'Token Counter',
  category: 'Misc',
  description: 'Estimate the number of tokens in text using tokenx library',
  icon: 'mdi:counter',
  component: () => import('./token-counter.vue'),
};
