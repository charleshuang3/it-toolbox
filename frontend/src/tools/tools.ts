import type { Component } from 'vue';

export interface BrowserSupportCheck {
  isSupported: boolean;
  warningMessage: string;
}

export type BrowserSupportChecker = () => BrowserSupportCheck;

export interface Tool {
  path: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  component: () => Promise<Component>;
  checkBrowserSupport?: BrowserSupportChecker;
}
