import type { Tool } from '../tools';

export const jwtParser: Tool = {
  path: 'jwt-parser',
  name: 'JWT Parser',
  category: 'Crypto',
  description:
    'Decode and verify JSON Web Tokens (RFC 7519), which are a standard method for representing claims securely between two parties',
  icon: 'tabler:key',
  component: () => import('./jwt-parser.vue'),
};
