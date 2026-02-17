import type { Tool } from '../tools';

export const bcrypt: Tool = {
  path: 'bcrypt',
  name: 'Bcrypt Hash',
  category: 'Crypto',
  description: 'Hash and compare strings using bcrypt, a password hashing function designed for security',
  icon: 'solar:lock-keyhole-bold-duotone',
  component: () => import('./bcrypt-tool.vue'),
};
