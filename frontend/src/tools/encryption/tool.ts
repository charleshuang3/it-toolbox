import type { Tool } from '../tools';

export const encryption: Tool = {
  path: 'encryption',
  name: 'Encryption',
  category: 'Crypto',
  description: 'Encrypt and decrypt text using AES, TripleDES, Rabbit, or RC4 algorithms',
  icon: 'solar:lock-keyhole-bold',
  component: () => import('./encryption-tool.vue'),
};
