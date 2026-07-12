export type ThemeName = 'minimal-light' | 'minimal-dark' | 'ocean' | 'midnight';
export type ThemeChoice = ThemeName | 'auto';

export interface ThemeVars {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textMuted: string;
  border: string;
  focus: string;
  danger: string;
}

// Themes are code, not data: the profile row stores only a name from this set.
// All text/background pairs meet WCAG AA (muted text >= 4.5:1 against bg and surface).
export const THEMES: Record<ThemeName, ThemeVars> = {
  'minimal-light': {
    scheme: 'light',
    bg: '#fafaf9',
    surface: '#ffffff',
    surfaceHover: '#f0efed',
    text: '#1c1917',
    textMuted: '#57534e',
    border: '#e0ddd9',
    focus: '#1c1917',
    danger: '#b42318',
  },
  'minimal-dark': {
    scheme: 'dark',
    bg: '#121110',
    surface: '#1e1c1a',
    surfaceHover: '#282522',
    text: '#f5f5f4',
    textMuted: '#a8a29e',
    border: '#343130',
    focus: '#f5f5f4',
    danger: '#f97066',
  },
  ocean: {
    scheme: 'light',
    bg: '#eef4f7',
    surface: '#ffffff',
    surfaceHover: '#e2edf3',
    text: '#12283c',
    textMuted: '#42607a',
    border: '#cfe0ea',
    focus: '#0b5da8',
    danger: '#b42318',
  },
  midnight: {
    scheme: 'dark',
    bg: '#0b1220',
    surface: '#141e33',
    surfaceHover: '#1b2742',
    text: '#e4ebf5',
    textMuted: '#9aa9c0',
    border: '#24304b',
    focus: '#7db8e8',
    danger: '#f97066',
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
export const THEME_CHOICES: readonly string[] = ['auto', ...THEME_NAMES];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && THEME_CHOICES.includes(value);
}

function block(vars: ThemeVars): string {
  return (
    `color-scheme:${vars.scheme};--bg:${vars.bg};--surface:${vars.surface};` +
    `--surface-hover:${vars.surfaceHover};--text:${vars.text};--text-muted:${vars.textMuted};` +
    `--border:${vars.border};--focus:${vars.focus};--danger:${vars.danger};`
  );
}

/** Emits one custom-property block per theme; 'auto' follows prefers-color-scheme. */
export function themeCss(): string {
  let css = `:root{${block(THEMES['minimal-light'])}}\n`;
  for (const name of THEME_NAMES) {
    css += `[data-theme="${name}"]{${block(THEMES[name])}}\n`;
  }
  css += `@media (prefers-color-scheme:dark){[data-theme="auto"]{${block(THEMES['minimal-dark'])}}}\n`;
  return css;
}
