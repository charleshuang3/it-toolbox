import type { Tool } from '../tools';

export const worldTime: Tool = {
  path: 'world-time',
  name: 'World Time',
  category: 'Time',
  description: 'View current time across multiple cities and timezones',
  icon: 'mdi:clock-outline',
  component: () => import('./world-time.vue'),
};
