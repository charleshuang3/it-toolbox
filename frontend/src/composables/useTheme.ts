import { ref, watch, computed } from 'vue';

// Theme configuration - maps logical theme to actual DaisyUI theme names
const THEME_LIGHT = 'nord';
const THEME_DARK = 'dracula';

// Singleton state - global unique (stores the actual DaisyUI theme name)
const theme = ref<string>(THEME_LIGHT);

// Computed property for checking if current theme is dark
const isDark = computed(() => theme.value === THEME_DARK);

export function useTheme() {
  // Apply theme to DOM - DaisyUI compatible
  const applyToDOM = (val: string) => {
    document.documentElement.setAttribute('data-theme', val);
    if (val === THEME_DARK) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Initialize theme: saved preference > system preference > default light
  const initTheme = () => {
    const saved = localStorage.getItem('user-theme');
    if (saved) {
      theme.value = saved;
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme.value = prefersDark ? THEME_DARK : THEME_LIGHT;
    }
    applyToDOM(theme.value);
  };

  // Watch for changes: persist + apply to DOM
  watch(theme, (newVal) => {
    localStorage.setItem('user-theme', newVal);
    applyToDOM(newVal);
  });

  // Toggle between light and dark themes
  const toggleTheme = () => {
    theme.value = theme.value === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
  };

  return {
    theme,
    isDark,
    toggleTheme,
    initTheme,
    THEME_LIGHT,
    THEME_DARK,
  };
}
