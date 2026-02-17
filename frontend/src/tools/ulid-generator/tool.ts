import type { Tool } from '../tools';

export const ulidGenerator: Tool = {
  path: 'ulid-generator',
  name: 'ULID Generator',
  category: 'Crypto',
  description: 'ULID is a 128-bit lexicographically sortable identifier, alternative to UUID with better sortability',
  icon: 'fluent-emoji-high-contrast:id-button',
  component: () => import('./ulid-generator.vue'),
};
