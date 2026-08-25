/**
 * 全局设置存储（localStorage 持久化 + 订阅通知）
 */
import { DEFAULT_SETTINGS, migrateCalendarId, type AevumSettings, defaultDayOverflow, defaultLeapMonthStrategy } from '../types.js';

const STORAGE_KEY = 'aevum.settings.v1';

/** 预设主题色（快捷取色板，与 UI 共享，保证单一来源） */
export const PRESET_SEED_COLORS = [
  '#6750A4', '#006A6A', '#8E4956', '#4C662B',
  '#3B608F', '#9A4522', '#5B5791', '#7D5260',
];

type Listener = (settings: AevumSettings) => void;

let settings: AevumSettings = load();
const listeners = new Set<Listener>();

function load(): AevumSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AevumSettings & { bgImage?: unknown; customThemes?: unknown };
      // 清理历史版本的全局背景图字段（已迁移为事件级）
      delete merged.bgImage;
      // 兼容旧数据：customThemes 缺失或非数组时初始化为空
      if (!Array.isArray(merged.customThemes)) merged.customThemes = [];
      // 迁移：当前活动色若既非预设、也不在自定义列表中，收进自定义列表避免「孤儿色」
      const active = (merged.seedColor || '').toLowerCase();
      const inPreset = PRESET_SEED_COLORS.map((c) => c.toLowerCase()).includes(active);
      const inCustom = merged.customThemes.some((c) => c?.color?.toLowerCase() === active);
      if (active && !inPreset && !inCustom) {
        merged.customThemes = [
          { id: `theme_${Date.now().toString(36)}`, name: '', color: merged.seedColor },
          ...merged.customThemes,
        ];
      }
      // 新增字段迁移：dayOverflow / leapMonthStrategy 缺失时按浏览器 locale 推断默认值
      // 同时兼容旧字段名 solarOverflow / lunarLeapStrategy
      const rawObj = JSON.parse(raw) as Record<string, unknown>;
      if (!('dayOverflow' in rawObj) && !('solarOverflow' in rawObj)) {
        const navLocale = (navigator.language || 'zh-CN');
        merged.dayOverflow = defaultDayOverflow(navLocale);
      }
      if (!('leapMonthStrategy' in rawObj) && !('lunarLeapStrategy' in rawObj)) {
        const navLocale = (navigator.language || 'zh-CN');
        merged.leapMonthStrategy = defaultLeapMonthStrategy(navLocale);
      }
      // 迁移旧版历法 ID（如 'islamic' → 'islamic-umalqura'）
      merged.defaultCalendar = migrateCalendarId(String(merged.defaultCalendar));
      return merged;
    }
  } catch {
    /* 忽略损坏数据，回退默认 */
  }
  // 全新安装：按浏览器 locale 推断策略默认值
  const navLocale = (navigator.language || 'zh-CN');
  return {
    ...DEFAULT_SETTINGS,
    dayOverflow: defaultDayOverflow(navLocale),
    leapMonthStrategy: defaultLeapMonthStrategy(navLocale),
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getSettings(): AevumSettings {
  return settings;
}

export function updateSettings(patch: Partial<AevumSettings>): void {
  settings = { ...settings, ...patch };
  persist();
  listeners.forEach((fn) => fn(settings));
}

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
