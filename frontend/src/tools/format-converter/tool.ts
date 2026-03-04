import type { Tool } from '../tools';

export const formatConverter: Tool = {
  path: 'format-converter',
  name: 'Format Converter',
  category: 'Converter',
  description: 'Convert between JSON, JSON5, XML, YAML, and TOML formats',
  icon: 'eva:swap-outline',
  component: () => import('./format-converter.vue'),
};
