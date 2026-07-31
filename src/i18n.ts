/**
 * 轻量级 i18n 架构
 * - 文本资源与业务逻辑分离，键值对映射
 * - 新增语言仅需添加字典文件并在 DICTS 中注册
 * - 深度集成原生 Intl API 处理日期/数字本地化
 */
import { zhCN, type LocaleDict } from './locales/zh-CN.js';
import { enUS } from './locales/en-US.js';
import type { LocalePref } from './types.js';

export type Locale = 'zh-CN' | 'en-US';

/** 已注册语言包（社区可低成本扩展） */
const DICTS: Record<Locale, LocaleDict> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

type Listener = () => void;

let currentLocale: Locale = detectLocale('system');
const listeners = new Set<Listener>();

/** 根据偏好解析实际语言 */
function detectLocale(pref: LocalePref): Locale {
  if (pref === 'zh-CN' || pref === 'en-US') return pref;
  const nav = (navigator.language || 'zh-CN').toLowerCase();
  return nav.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function getLocale(): Locale {
  return currentLocale;
}

/** 应用语言偏好（system 时跟随浏览器） */
export function applyLocalePref(pref: LocalePref): void {
  const next = detectLocale(pref);
  if (next !== currentLocale) {
    currentLocale = next;
    document.documentElement.lang = next;
    listeners.forEach((fn) => fn());
  }
}

export function onLocaleChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 翻译 + 简单参数插值：t('deleteConfirmBody', {name: '高考'}) */
export function t(key: keyof LocaleDict, params?: Record<string, string | number>): string {
  let text: string = DICTS[currentLocale][key] ?? DICTS['zh-CN'][key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** 本地化数字（Intl.NumberFormat） */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(currentLocale).format(n);
}

/** 本地化日期时间（公历，Intl.DateTimeFormat） */
export function formatGregorian(date: Date, withTime = false): string {
  return new Intl.DateTimeFormat(currentLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
