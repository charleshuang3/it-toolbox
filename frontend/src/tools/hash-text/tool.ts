import type { Tool } from '../tools';

export const hashText: Tool = {
  path: 'hash-text',
  name: 'Hash Text',
  category: 'Crypto',
  description: 'Compute hash values for text using various algorithms (MD5, SHA1, SHA256, etc.)',
  icon: 'tabler:hash',
  component: () => import('./hash-text.vue'),
};
