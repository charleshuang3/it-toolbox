import type { Tool } from '../tools';

export const intBaseConverter: Tool = {
  path: 'int-base-converter',
  name: 'Integer Base Converter',
  category: 'Converter',
  description: 'Convert integers between different bases. from base2 to base64',
  icon: 'streamline-sharp:steps-number-solid',
  component: () => import('./int-base-converter.vue'),
};
