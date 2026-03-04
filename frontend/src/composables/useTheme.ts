import { ref, watch, computed } from 'vue';
import { ayuLight } from 'thememirror';
import { dracula } from 'thememirror';
const THEME_LIGHT = import.meta.env.VITE_THEME_LIGHT;
const THEME_DARK = import.meta.env.VITE_THEME_DARK;

// Re-export theme constants for external use
export { THEME_LIGHT, THEME_DARK };

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

  // Get the CodeMirror theme based on current dark mode
  const codeMirrorTheme = () => {
    return isDark.value ? dracula : ayuLight;
  };

  return {
    theme,
    isDark,
    toggleTheme,
    initTheme,
    THEME_LIGHT,
    THEME_DARK,
    codeMirrorTheme,
  };
}
