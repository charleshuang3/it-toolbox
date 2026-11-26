import { ref, watch, computed } from "vue";
const THEME_LIGHT = import.meta.env.VITE_THEME_LIGHT;
const THEME_DARK = import.meta.env.VITE_THEME_DARK;

// Re-export theme constants for external use
export { THEME_LIGHT, THEME_DARK };

// Singleton state - global unique (stores the actual DaisyUI theme name)
const theme = ref<string>(THEME_LIGHT);

// Computed property for checking if current theme is dark
const isDark = computed(() => theme.value === THEME_DARK);

const readSaved = (): string | null => {
  try {
    return localStorage.getItem("user-theme");
  } catch {
    return null;
  }
};

export function useTheme() {
  // Apply theme to DOM - DaisyUI compatible
  const applyToDOM = (val: string) => {
    document.documentElement.setAttribute("data-theme", val);
    if (val === THEME_DARK) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Initialize theme: saved explicit preference > system preference > default light
  const initTheme = () => {
    const saved = readSaved();
    if (saved) {
      theme.value = saved;
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      theme.value = mq.matches ? THEME_DARK : THEME_LIGHT;
      // Follow system changes while the user has not chosen explicitly
      mq.addEventListener("change", (e) => {
        if (!readSaved()) {
          theme.value = e.matches ? THEME_DARK : THEME_LIGHT;
        }
      });
    }
    applyToDOM(theme.value);
  };

  // Apply to DOM on change. Persist only on explicit user toggle, so the
  // system preference is not permanently overridden by merely visiting.
  watch(theme, (newVal) => {
    applyToDOM(newVal);
  });

  // Toggle between light and dark themes (explicit choice, persisted)
  const toggleTheme = () => {
    theme.value = theme.value === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    try {
      localStorage.setItem("user-theme", theme.value);
    } catch {
      // storage unavailable; ignore
    }
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
