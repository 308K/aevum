/** 全局共享类型定义 */

/** 支持的历法 */
export type CalendarId =
  | 'gregory'
  | 'chinese'
  | 'islamic'
  | 'hebrew'
  | 'persian'
  | 'buddhist'
  | 'japanese';

/** 时间展示粒度 */
export type Granularity =
  | 'day'   // 仅天数
  | 'dhms'  // 日 时 分 秒
  | 'ymd'   // 年 月 日
  | 'ywd'   // 年 周 日
  | 'wd';   // 周 日

/** 循环规则 */
export type Recurrence =
  | 'none'    // 不循环
  | 'weekly'  // 每周（同一星期几）
  | 'monthly' // 每月（同日）
  | 'yearly'; // 每年（同月同日）

/** 事件状态 */
export type EventStatus = 'future' | 'past' | 'today';

/** 全局标签定义（设置页统一管理，事件以 id 引用） */
export interface TagDef {
  id: string;
  /** 显示名；内置预设可存 i18n key（如 'tagLife'），运行时由 t() 解析 */
  label: string;
  color: string; // hex
  /** 是否为内置预设（仅用于区分，可重命名/改色/删除） */
  preset?: boolean;
}

/** 倒数日事件 */
export interface AevumEvent {
  id: string;
  name: string;
  /** 目标日期（公历 ISO：yyyy-mm-dd） */
  date: string;
  /** 精确时间（HH:MM），缺省表示仅日期 */
  time?: string;
  /** 录入时使用的历法（用于展示） */
  calendar: CalendarId;
  /** 循环规则：不循环/每周/每月/每年（缺省视为不循环，兼容旧数据） */
  recurrence?: Recurrence;
  granularity: Granularity;
  /** 引用的标签 id 列表（对应全局标签库） */
  tags: string[];
  pinned: boolean;
  /** 事件卡片背景图（dataURL，事件级） */
  bgImage?: string;
  createdAt: number;
}

/** 主题模式 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 自定义主题色（用户保存的种子色库，可添加/删除/重命名） */
export interface CustomTheme {
  id: string;
  /** 显示名（可空，缺省显示颜色值） */
  name: string;
  /** 主题种子颜色 hex */
  color: string;
}

/** 语言偏好 */
export type LocalePref = 'system' | 'zh-CN' | 'en-US';

/** 日历周起始日（目标日期选择器）；'locale' 表示跟随语言/地区习惯 */
export type WeekStart = 'locale' | 'sunday' | 'monday' | 'saturday';

/** 星期显示模式：关闭 / 短（周四 / Thu）/ 长（星期四 / Thursday） */
export type WeekdayDisplay = 'off' | 'short' | 'long';

/**
 * 公历日不存在时的溢出处理策略（年循环2月29日、月循环31日等）。
 * - 'rfc5545'：严格跳过（RFC 5545 行为）
 * - 'lastDay'：视为当月最后一日
 * - 'nextMonth'：顺延至次月1日
 */
export type SolarOverflow = 'rfc5545' | 'lastDay' | 'nextMonth';

/**
 * 农历闰月循环事件策略（锚定在农历闰月的年循环）。
 * - 'nonLeap'：从正不从闰（以对应平月为准）
 * - 'strictLeap'：严格在闰月（该年无闰月则跳过）
 * - 'both'：平月和闰月都提醒
 */
export type LunarLeapStrategy = 'nonLeap' | 'strictLeap' | 'both';

/** 全局设置 */
export interface AevumSettings {
  locale: LocalePref;
  themeMode: ThemeMode;
  /** 当前生效的主题种子颜色 hex */
  seedColor: string;
  /** 用户保存的自定义主题色列表（可添加/删除/重命名） */
  customThemes: CustomTheme[];
  /** 是否启用 OKLCH 渐变背景 */
  gradientBg: boolean;
  /** 自定义日界限 HH:MM */
  dayBoundary: string;
  defaultCalendar: CalendarId;
  defaultGranularity: Granularity;
  /** 日历周起始日（目标日期选择器）；'locale' 表示跟随语言/地区习惯 */
  weekStart: WeekStart;
  /** 星期显示：关闭 / 短 / 长（影响首页卡片与事件详情，不影响分享图） */
  weekdayDisplay: WeekdayDisplay;
  /** 分享图页独立的星期显示设置（与全局 weekdayDisplay 解耦） */
  shareWeekdayDisplay: WeekdayDisplay;
  /** 公历日不存在时的溢出策略（年循环2月29日、月循环31日） */
  solarOverflow: SolarOverflow;
  /** 农历闰月循环事件策略 */
  lunarLeapStrategy: LunarLeapStrategy;
}

export const DEFAULT_SETTINGS: AevumSettings = {
  locale: 'system',
  themeMode: 'system',
  seedColor: '#6750A4',
  customThemes: [],
  gradientBg: false,
  dayBoundary: '00:00',
  defaultCalendar: 'gregory',
  defaultGranularity: 'day',
  weekStart: 'locale',
  weekdayDisplay: 'long',
  shareWeekdayDisplay: 'long',
  solarOverflow: 'lastDay',
  lunarLeapStrategy: 'nonLeap',
};

/** 预设标签（颜色区分） */
export interface PresetTag {
  key: string;
  color: string;
}

export const PRESET_TAGS: PresetTag[] = [
  { key: 'tagLife', color: '#4C662B' },
  { key: 'tagWork', color: '#006A6A' },
  { key: 'tagBirthday', color: '#8E4956' },
  { key: 'tagAnniversary', color: '#7D5260' },
  { key: 'tagHoliday', color: '#6A5F00' },
  { key: 'tagStudy', color: '#3B608F' },
];

/**
 * 根据浏览器语言推断地区适用的 solarOverflow 默认策略。
 * - 中国大陆、中国台湾 → 'lastDay'（平年2月28日等）
 * - 英联邦国家、中国香港、中国澳门 → 'nextMonth'（顺延至次月1日）
 * - 其他 → 'rfc5545'（严格跳过）
 */
export function defaultSolarOverflow(locale: string): SolarOverflow {
  const l = locale.toLowerCase();
  // 中国大陆 zh-CN, zh-Hans, zh-SG, zh-#Hans
  // 中国台湾 zh-TW, zh-Hant
  if (l.startsWith('zh') && (l.includes('tw') || l.includes('hk') || l.includes('mo'))) {
    // 香港、澳门 → nextMonth
    if (l.includes('hk') || l.includes('mo')) return 'nextMonth';
    // 台湾 → lastDay
    return 'lastDay';
  }
  if (l.startsWith('zh')) return 'lastDay';
  // 英联邦国家（大致列表，主要识别 en-GB / en-AU / en-NZ / en-CA / en-IN / en-ZA / en-SG）
  if (l.startsWith('en') && (l.includes('gb') || l.includes('au') || l.includes('nz') || l.includes('ca') || l.includes('in') || l.includes('za') || l.includes('sg'))) {
    return 'nextMonth';
  }
  return 'rfc5545';
}

/**
 * 农历闰月策略默认值。无论地区都默认 'nonLeap'。
 */
export function defaultLunarLeapStrategy(_locale: string): LunarLeapStrategy {
  return 'nonLeap';
}
