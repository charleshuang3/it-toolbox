import type { Component } from 'vue';

export interface Tool {
  path: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  component: () => Promise<Component>;
}
