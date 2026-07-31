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
