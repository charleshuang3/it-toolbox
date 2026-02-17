import type { Tool } from '../tools';

export const randomStringGenerator: Tool = {
  path: 'random-string-generator',
  name: 'Random String Generator',
  category: 'Crypto',
  description: 'Generate random strings with customizable character sets, length, and quantity',
  icon: 'solar:text-bold',
  component: () => import('./random-string-generator.vue'),
};
