import type { Tool } from '../tools';

export const jwtGenerator: Tool = {
  path: 'jwt-generator',
  name: 'JWT Generator',
  category: 'Crypto',
  description: 'Generate JSON Web Tokens (RFC 7519) with custom claims and varioius algorithms for signature',
  icon: 'tabler:key-filled',
  component: () => import('./jwt-generator.vue'),
};
