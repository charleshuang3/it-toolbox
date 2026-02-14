import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  test: {
    globals: true,
    environment: 'node',
  },
});
