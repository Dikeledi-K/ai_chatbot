// Saves and applies the user's chosen interface theme across browser sessions.
const THEME_KEY = 'studybuddy-theme';

// Chooses the light or dark mode based on saved preference and device preference.
export function resolveThemePreference(savedTheme, systemPrefersDark) {
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return systemPrefersDark ? 'dark' : 'light';
}

// Reads the saved theme from local storage without breaking when storage is unavailable.
export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

// Saves a chosen theme for the next visit so the interface stays consistent.
export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors to avoid breaking the app in restricted browsers.
  }
}

// Applies the chosen theme to the document so the app updates immediately.
export function applyTheme(theme) {
  const nextTheme = resolveThemePreference(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
}
