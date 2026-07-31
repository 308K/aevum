/**
 * 历法工具 —— 完全基于浏览器原生 Intl API（Intl.DateTimeFormat）
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历的正反双向转换
 * - 农历完全使用汉字显示，并同时展示公元纪年与干支纪年（如：2026年 丙午年 正月十五）
 * - 反向转换（历法日期 → 公历时间戳）通过 Intl 格式化扫描实现，带缓存，零第三方依赖
 */
import type { CalendarId } from '../types.js';

export const CALENDAR_IDS: CalendarId[] = [
  'gregory',
  'chinese',
  'islamic',
  'hebrew',
  'persian',
  'buddhist',
  'japanese',
];

export interface DateSelection {
  yearKey: string;
  monthKey: string;
  dayKey: string;
}

export interface CalOption {
  key: string;
  display: string;
}

const DAY_MS = 86_400_000;

/** 农历日汉字名（1–30）：初一…初十、十一…二十、廿一…廿九、三十 */
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** Intl 各 ICU 版本对农历 day 可能输出阿拉伯数字，统一转汉字（已是汉字则原样返回） */
function lunarDayName(dayStr: string): string {
  const n = Number(dayStr);
  if (!Number.isInteger(n) || n < 1 || n > 30) return dayStr;
  return LUNAR_DAY_NAMES[n - 1];
}

/* ---------------- formatter 缓存 ---------------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(locale: string, cal: CalendarId, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${cal}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    const tag = cal === 'gregory' ? locale : `${locale}-u-ca-${cal}`;
    f = new Intl.DateTimeFormat(tag, opts);
    fmtCache.set(key, f);
  }
  return f;
}

function partsOf(f: Intl.DateTimeFormat, d: Date): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of f.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return map;
}

/* ---------------- 键值（用于双向转换，locale 无关） ---------------- */

interface KeyParts {
  yearKey: string;
  yearDisplay: string;
  monthKey: string;
  monthDisplay: string;
  dayKey: string;
  dayDisplay: string;
}

/** 键值固定使用 zh-CN（汉字，天然处理农历闰月与干支），保证键稳定且唯一 */
function keyPartsOf(date: Date, cal: CalendarId, displayLocale: string): KeyParts {
  if (cal === 'gregory') {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const monthName = fmt(displayLocale, 'gregory', { month: 'long' }).format(date);
    return {
      yearKey: String(y),
      yearDisplay: String(y),
      monthKey: String(m),
      monthDisplay: monthName,
      dayKey: String(d),
      dayDisplay: String(d),
    };
  }
  if (cal === 'chinese') {
    const p = partsOf(fmt('zh-CN', 'chinese', { year: 'numeric', month: 'long', day: 'numeric' }), date);
    const relatedYear = p.relatedYear ?? '';
    const ganzhi = p.yearName ?? '';
    return {
      yearKey: `${relatedYear}|${ganzhi}`,
      yearDisplay: ganzhi ? `${relatedYear}年·${ganzhi}年` : `${relatedYear}年`,
      monthKey: p.month ?? '',
      monthDisplay: p.month ?? '',
      dayKey: p.day ?? '',
      dayDisplay: lunarDayName(p.day ?? ''),
    };
  }
  if (cal === 'japanese') {
    // 年号（令和/平成/昭和…）使用 ja-JP 提取，确保无论界面语言都显示汉字年号
    const jp = partsOf(fmt('ja-JP', 'japanese', { year: 'numeric', month: 'numeric', day: 'numeric', era: 'long' }), date);
    const eraName = jp.era ?? '';
    const yearInEra = jp.year ?? '';
    const dp = partsOf(fmt(displayLocale, 'japanese', { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }), date);
    const kp = partsOf(fmt('en-US', 'japanese', { year: 'numeric', month: 'numeric', day: 'numeric', era: 'short' }), date);
    return {
      // 键固定为「年号|年」，locale 无关、稳定
      yearKey: `${eraName}|${yearInEra}`,
      yearDisplay: displayLocale.startsWith('zh')
        ? `${eraName}${yearInEra}年`
        : dp.era
          ? `${dp.era} ${dp.year}`
          : yearInEra,
      monthKey: kp.month ?? '',
      monthDisplay: dp.month ?? '',
      dayKey: kp.day ?? '',
      dayDisplay: dp.day ?? '',
    };
  }
  // 其他历法：键使用 en（数字+era），显示使用当前语言
  const kp = partsOf(fmt('en-US', cal, { year: 'numeric', month: 'numeric', day: 'numeric', era: 'short' }), date);
  const dp = partsOf(fmt(displayLocale, cal, { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }), date);
  const yearKey = `${kp.era ?? ''}|${kp.year ?? ''}`;
  const yearDisplay = dp.era ? `${dp.era} ${dp.year}` : (dp.year ?? '');
  return {
    yearKey,
    yearDisplay,
    monthKey: kp.month ?? '',
    monthDisplay: dp.month ?? '',
    dayKey: kp.day ?? '',
    dayDisplay: dp.day ?? '',
  };
}

/** 公历日期 → 历法键 */
export function keysFromGregorian(date: Date, cal: CalendarId): DateSelection {
  const k = keyPartsOf(date, cal, 'zh-CN');
  return { yearKey: k.yearKey, monthKey: k.monthKey, dayKey: k.dayKey };
}

/* ---------------- 枚举（年/月/日选项，带首见日期缓存） ---------------- */

interface YearEntry extends CalOption { firstSeen: Date }
interface MonthEntry extends CalOption { firstSeen: Date }

const yearCache = new Map<string, YearEntry[]>();
const monthCache = new Map<string, MonthEntry[]>();
const dayCache = new Map<string, CalOption[]>();

const SPAN_YEARS = 100; // 公历前后各 100 年

/** 枚举某历法可用的年份选项（以 refDate 所在公历年为中心） */
export function yearOptions(cal: CalendarId, refDate: Date, displayLocale = 'zh-CN'): CalOption[] {
  const cacheKey = `${cal}|${displayLocale}|${refDate.getFullYear()}`;
  const hit = yearCache.get(cacheKey);
  if (hit) return hit;

  const center = refDate.getFullYear();
  const entries: YearEntry[] = [];
  const seen = new Set<string>();

  if (cal === 'gregory') {
    for (let y = center - SPAN_YEARS; y <= center + SPAN_YEARS; y++) {
      entries.push({ key: String(y), display: String(y), firstSeen: new Date(y, 0, 1) });
    }
    yearCache.set(cacheKey, entries);
    return entries;
  }

  // 每季度采样一次：任何历法的一年 ≥ 354 天，采样间隔 91 天不会漏掉任何年份
  for (let gy = center - SPAN_YEARS; gy <= center + SPAN_YEARS; gy++) {
    for (const gm of [0, 3, 6, 9]) {
      const sample = new Date(gy, gm, 1);
      const k = keyPartsOf(sample, cal, displayLocale);
      if (!seen.has(k.yearKey)) {
        seen.add(k.yearKey);
        entries.push({ key: k.yearKey, display: k.yearDisplay, firstSeen: sample });
      }
    }
  }
  yearCache.set(cacheKey, entries);
  return entries;
}

/** 精确定位某历法年份的第一天（从采样首见日期起前后扫描） */
function findYearStart(cal: CalendarId, entry: YearEntry, displayLocale: string): Date {
  let d = new Date(entry.firstSeen.getTime());
  // 回退到上一年的边界（采样间隔最长约 92 天，留足余量）
  for (let i = 0; i < 130; i++) {
    const prev = new Date(d.getTime() - DAY_MS);
    if (keyPartsOf(prev, cal, displayLocale).yearKey !== entry.key) break;
    d = prev;
  }
  // 正向扫描直到进入目标年
  for (let i = 0; i < 400; i++) {
    if (keyPartsOf(d, cal, displayLocale).yearKey === entry.key) return d;
    d = new Date(d.getTime() + DAY_MS);
  }
  return d;
}

/** 枚举某历法某年的月份选项 */
export function monthOptions(cal: CalendarId, yearKey: string, displayLocale = 'zh-CN'): CalOption[] {
  const cacheKey = `${cal}|${displayLocale}|${yearKey}`;
  const hit = monthCache.get(cacheKey);
  if (hit) return hit;

  let entries: MonthEntry[] = [];
  if (cal === 'gregory') {
    const y = Number(yearKey);
    entries = Array.from({ length: 12 }, (_, i) => ({
      key: String(i + 1),
      display: fmt(displayLocale, 'gregory', { month: 'long' }).format(new Date(2024, i, 1)),
      firstSeen: new Date(y, i, 1),
    }));
  } else {
    const years = yearOptions(cal, new Date(), displayLocale);
    const yearEntry = years.find((e) => e.key === yearKey) as YearEntry | undefined;
    if (!yearEntry) return [];
    let d = findYearStart(cal, yearEntry, displayLocale);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const k = keyPartsOf(d, cal, displayLocale);
      if (k.yearKey !== yearKey) break;
      if (!seen.has(k.monthKey)) {
        seen.add(k.monthKey);
        entries.push({ key: k.monthKey, display: k.monthDisplay, firstSeen: new Date(d.getTime()) });
      }
      d = new Date(d.getTime() + DAY_MS);
    }
  }
  monthCache.set(cacheKey, entries);
  return entries;
}

/** 枚举某历法某年某月的日选项 */
export function dayOptions(
  cal: CalendarId,
  yearKey: string,
  monthKey: string,
  displayLocale = 'zh-CN'
): CalOption[] {
  const cacheKey = `${cal}|${displayLocale}|${yearKey}|${monthKey}`;
  const hit = dayCache.get(cacheKey);
  if (hit) return hit;

  let entries: CalOption[] = [];
  if (cal === 'gregory') {
    const y = Number(yearKey);
    const m = Number(monthKey);
    const days = new Date(y, m, 0).getDate();
    entries = Array.from({ length: days }, (_, i) => ({ key: String(i + 1), display: String(i + 1) }));
  } else {
    const months = monthOptions(cal, yearKey, displayLocale);
    const monthEntry = (months as MonthEntry[]).find((e) => e.key === monthKey);
    if (!monthEntry) return [];
    let d = new Date(monthEntry.firstSeen.getTime());
    for (let i = 0; i < 40; i++) {
      const k = keyPartsOf(d, cal, displayLocale);
      if (k.yearKey !== yearKey || k.monthKey !== monthKey) break;
      entries.push({ key: k.dayKey, display: k.dayDisplay });
      d = new Date(d.getTime() + DAY_MS);
    }
  }
  dayCache.set(cacheKey, entries);
  return entries;
}

/** 历法键 → 公历 Date（本地零点），无效返回 null */
export function gregorianFromKeys(sel: DateSelection, cal: CalendarId): Date | null {
  if (cal === 'gregory') {
    const y = Number(sel.yearKey);
    const m = Number(sel.monthKey);
    const d = Number(sel.dayKey);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  const days = dayOptions(cal, sel.yearKey, sel.monthKey, 'zh-CN');
  if (!days.some((o) => o.key === sel.dayKey)) return null;
  const months = monthOptions(cal, sel.yearKey, 'zh-CN') as MonthEntry[];
  const monthEntry = months.find((e) => e.key === sel.monthKey);
  if (!monthEntry) return null;
  let d = new Date(monthEntry.firstSeen.getTime());
  for (let i = 0; i < 40; i++) {
    const k = keyPartsOf(d, cal, 'zh-CN');
    if (k.yearKey !== sel.yearKey || k.monthKey !== sel.monthKey) break;
    if (k.dayKey === sel.dayKey) return d;
    d = new Date(d.getTime() + DAY_MS);
  }
  return null;
}

/* ---------------- 展示格式化 ---------------- */

/**
 * 事件日期的完整本地化展示。
 * 农历强制汉字并附公元纪年与干支纪年，例如：2026年 丙午年 正月十五
 */
export function formatEventDate(dateISO: string, cal: CalendarId, displayLocale: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return dateISO;

  if (cal === 'gregory') {
    return fmt(displayLocale, 'gregory', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }
  if (cal === 'chinese') {
    const p = partsOf(fmt('zh-CN', 'chinese', { year: 'numeric', month: 'long', day: 'numeric' }), date);
    return `${p.relatedYear}年 ${p.yearName}年 ${p.month}${lunarDayName(p.day ?? '')}`;
  }
  if (cal === 'japanese') {
    // 强制 era:long，保证中文下显示年号（令和/平成…）而非缩写字母
    return fmt(displayLocale, 'japanese', { year: 'numeric', month: 'long', day: 'numeric', era: 'long' }).format(date);
  }
  return fmt(displayLocale, cal, { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }).format(date);
}

/** 目标日期 + 可选精确时间的组合展示 */
export function formatEventDateTime(dateISO: string, time: string | undefined, cal: CalendarId, displayLocale: string): string {
  const base = formatEventDate(dateISO, cal, displayLocale);
  return time ? `${base} ${time}` : base;
}
