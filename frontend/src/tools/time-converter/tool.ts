import type { Tool } from '../tools';

export const timeConverter: Tool = {
  path: 'time-converter',
  name: 'Time Converter',
  category: 'Time',
  description: 'Convert time between different formats, timezones, and Unix timestamps',
  icon: 'mdi:clock-time-nine-outline',
  component: () => import('./time-converter.vue'),
};
