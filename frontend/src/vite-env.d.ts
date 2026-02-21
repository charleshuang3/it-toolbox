/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;

  // Need to add theme to style.css before change these env var.
  readonly VITE_THEME_LIGHT: string;
  readonly VITE_THEME_DARK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
