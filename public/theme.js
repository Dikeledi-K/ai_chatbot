const THEME_KEY = 'studybuddy-theme';

export function resolveThemePreference(savedTheme, systemPrefersDark) {
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return systemPrefersDark ? 'dark' : 'light';
}

export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors to avoid breaking the app in restricted browsers.
  }
}

export function applyTheme(theme) {
  const nextTheme = resolveThemePreference(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
}
