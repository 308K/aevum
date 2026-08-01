/**
 * 主题系统
 * - 基于 @material/material-color-utilities 从种子色动态生成完整 M3 色阶
 * - 亮色/暗色模式（跟随系统 / 手动）
 * - OKLCH 色彩空间渐变背景，避免 RGB 渐变「灰色死区」
 */
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities';
import type { AevumSettings, ThemeMode } from './types.js';
import { applyAppIcon } from './utils/app-icon.js';

type Listener = (dark: boolean) => void;

const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<Listener>();

/** 最近一次应用的设置（系统主题变化时按此重放） */
let lastSettings: AevumSettings | null = null;

/** 需要映射到 CSS 变量的 Scheme 令牌 */
const SCHEME_TOKENS = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface',
  'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'shadow', 'scrim', 'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'surfaceTint',
] as const;

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'light') return false;
  if (mode === 'dark') return true;
  return media.matches;
}

/** 应用主题：生成并注入 --md-sys-color-* 变量，返回实际生效的模式 */
export function applyTheme(s: AevumSettings): 'light' | 'dark' {
  lastSettings = s;
  const dark = resolveDark(s.themeMode);
  const theme = themeFromSourceColor(argbFromHex(s.seedColor));
  const scheme = (dark ? theme.schemes.dark : theme.schemes.light) as unknown as Record<string, number>;
  const root = document.documentElement;
  const body = document.body;

  for (const token of SCHEME_TOKENS) {
    const argb = scheme[token];
    if (typeof argb === 'number') {
      root.style.setProperty(`--md-sys-color-${camelToKebab(token)}`, hexFromArgb(argb));
    }
  }

  // M3 surface container 色阶（中性色板推导，与规范一致）
  const neutral = theme.palettes.neutral;
  const tones = dark
    ? { surfaceDim: 6, surfaceBright: 24, surfaceContainerLowest: 4, surfaceContainerLow: 10, surfaceContainer: 12, surfaceContainerHigh: 17, surfaceContainerHighest: 22 }
    : { surfaceDim: 87, surfaceBright: 98, surfaceContainerLowest: 100, surfaceContainerLow: 96, surfaceContainer: 94, surfaceContainerHigh: 92, surfaceContainerHighest: 90 };
  for (const [token, tone] of Object.entries(tones)) {
    root.style.setProperty(`--md-sys-color-${camelToKebab(token)}`, hexFromArgb(neutral.tone(tone)));
  }

  // 亮暗标记（供自定义组件样式使用）
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';

  // OKLCH 渐变背景（避免灰色死区，过渡平滑鲜艳）
  body.classList.toggle('gradient-bg', s.gradientBg);

  // 同步浏览器 UI 主题色
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', hexFromArgb(scheme.surface));

  // 按当前主题色自动生成并更新应用图标（favicon / apple-touch-icon）
  applyAppIcon(s.seedColor, dark);

  listeners.forEach((fn) => fn(dark));
  return dark ? 'dark' : 'light';
}

export function onThemeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* 系统亮暗变化时，若当前为跟随系统则自动重放主题 */
media.addEventListener('change', () => {
  if (lastSettings && lastSettings.themeMode === 'system') {
    applyTheme(lastSettings);
  } else {
    listeners.forEach((fn) => fn(media.matches));
  }
});
