// Tema de la app: oscuro (Grafito) por defecto, o claro si lo elegís.

export type Theme = 'light' | 'dark';
const KEY = 'mochi:theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  meta.forEach((m) => (m.content = isDark() ? '#0a0a0a' : '#fafafa'));
}

export function setTheme(t: Theme) {
  try {
    if (t === 'dark') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {}
  applyTheme(t);
}

export function isDark() {
  return getTheme() === 'dark';
}
