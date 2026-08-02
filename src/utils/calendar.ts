/**
 * 历法工具 —— 基于 TC39 Temporal API（原生或 @js-temporal/polyfill）
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历的正反双向转换
 * - 农历完全使用汉字显示，并同时展示公元纪年与干支纪年（如：2026年 丙午年 正月十五）
 * - 利用 Temporal.PlainDate.withCalendar() 做精确历法转换，无需 Intl 扫描
 * - 展示格式化仍使用 Intl.DateTimeFormat（Temporal 的 toLocaleString 底层也是 Intl，
 *   但 polyfill 的 era 字段不完整，故展示层保留 Intl + 权威 era 映射）
 */
import { Temporal } from './temporal.js';
import { tIn, getLocale, type Locale } from '../i18n.js';
import type { LocaleDict } from '../locales/zh-CN.js';
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

/**
 * 将应用层 CalendarId 映射为 Temporal 支持的日历标识符。
 *
 * 重要：不同浏览器的原生 Temporal 对日历标识符的支持程度不同。
 * - Chrome 原生支持 'islamic-umalqura'（与 Intl 的 'islamic' 一致）
 * - Firefox 原生可能不支持 'islamic-umalqura'，需回退到 'islamic'
 * - Safari 无原生 Temporal，走 polyfill（两者都支持）
 *
 * 因此对伊斯兰历做运行时探测：依次尝试候选 ID，取第一个可用的。
 * 探测结果在模块级别缓存（首次调用后不再重复探测）。
 */
function temporalCalId(cal: CalendarId): string {
  if (cal === 'islamic') {
    const cached = _islamicCalCache;
    if (cached) return cached;
    // 优先 umalqura（与 Intl 行为一致），回退到通用 islamic
    const candidates: string[] = ['islamic-umalqura', 'islamic'];
    for (const id of candidates) {
      try {
        Temporal.PlainDate.from({ calendar: id, year: 1446, month: 1, day: 1 });
        _islamicCalCache = id;
        return id;
      } catch {
        /* 该 ID 不被当前运行时支持，继续尝试下一个 */
      }
    }
    // 极端情况：两个都不支持，仍返回首选（调用方会 catch）
    _islamicCalCache = 'islamic-umalqura';
    return 'islamic-umalqura';
  }
  return cal;
}

/** 缓存伊斯兰历探测结果（模块级单次写入） */
let _islamicCalCache: string | undefined;

/** 农历日汉字名（1–30） */
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

function lunarDayName(dayStr: string): string {
  const n = Number(dayStr);
  if (!Number.isInteger(n) || n < 1 || n > 30) return dayStr;
  return LUNAR_DAY_NAMES[n - 1];
}

const ERA_KEYS: Partial<Record<CalendarId, keyof LocaleDict>> = {
  islamic: 'eraIslamic',
  hebrew: 'eraHebrew',
  persian: 'eraPersian',
  buddhist: 'eraBuddhist',
};

function eraName(cal: CalendarId, locale: string): string {
  const key = ERA_KEYS[cal];
  if (!key) return '';
  return tIn(key, resolveLocale(locale));
}

function resolveLocale(locale: string): Locale {
  if (locale.startsWith('zh')) return 'zh-CN';
  if (locale.startsWith('en')) return 'en-US';
  return getLocale();
}

/* ---------------- Intl formatter（仅用于展示格式化） ---------------- */

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

/* ---------------- Temporal 辅助函数 ---------------- */

/** 公历 Date → Temporal.PlainDate（本地零点） */
function toPlainDate(d: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

/** Temporal.PlainDate → 公历 Date（本地零点） */
function fromDate(pd: Temporal.PlainDate): Date {
  const g = pd.withCalendar('gregory');
  return new Date(g.year, g.month - 1, g.day);
}

/** 公历日期加减天数 → Temporal.PlainDate（DST 安全，纯日历日运算） */
function addDays(pd: Temporal.PlainDate, n = 1): Temporal.PlainDate {
  return pd.add({ days: n });
}

function subDays(pd: Temporal.PlainDate, n = 1): Temporal.PlainDate {
  return pd.subtract({ days: n });
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

/**
 * 从 Temporal.PlainDate（已转换为目标历法）提取键值和展示文本。
 */
function keyPartsFromTemporal(
  pdCal: Temporal.PlainDate,
  cal: CalendarId,
  displayLocale: string
): KeyParts {
  const yearNum = pdCal.year;
  const monthNum = pdCal.month;
  const dayNum = pdCal.day;
  const monthCode = pdCal.monthCode;

  if (cal === 'gregory') {
    const greg = pdCal.withCalendar('gregory');
    const date = new Date(greg.year, greg.month - 1, greg.day);
    const monthName = fmt(displayLocale, 'gregory', { month: 'long' }).format(date);
    return {
      yearKey: String(yearNum),
      yearDisplay: String(yearNum),
      monthKey: String(monthNum),
      monthDisplay: monthName,
      dayKey: String(dayNum),
      dayDisplay: String(dayNum),
    };
  }

  if (cal === 'chinese') {
    const greg = pdCal.withCalendar('gregory');
    const date = new Date(greg.year, greg.month - 1, greg.day);
    const p = partsOf(fmt('zh-CN', 'chinese', { year: 'numeric', month: 'long', day: 'numeric' }), date);
    const relatedYear = p.relatedYear ?? String(greg.year);
    const ganzhi = p.yearName ?? '';
    return {
      yearKey: `${relatedYear}|${ganzhi}`,
      yearDisplay: ganzhi ? `${relatedYear}年·${ganzhi}年` : `${relatedYear}年`,
      monthKey: p.month ?? monthCode,
      monthDisplay: p.month ?? monthCode,
      dayKey: String(dayNum),
      dayDisplay: lunarDayName(String(dayNum)),
    };
  }

  if (cal === 'japanese') {
    const greg = pdCal.withCalendar('gregory');
    const date = new Date(greg.year, greg.month - 1, greg.day);
    const jp = partsOf(fmt('ja-JP', 'japanese', { year: 'numeric', month: 'numeric', day: 'numeric', era: 'long' }), date);
    const dp = partsOf(fmt(displayLocale, 'japanese', { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }), date);
    const kp = partsOf(fmt('en-US', 'japanese', { year: 'numeric', month: 'numeric', day: 'numeric', era: 'short' }), date);
    const jpEra = jp.era ?? pdCal.era ?? '';
    const jpYearInEra = jp.year ?? String(pdCal.eraYear ?? yearNum);
    return {
      yearKey: `${jpEra}|${jpYearInEra}`,
      yearDisplay: displayLocale.startsWith('zh')
        ? `${jpEra}${jpYearInEra}年`
        : dp.era
          ? `${dp.era} ${dp.year}`
          : jpYearInEra,
      monthKey: kp.month ?? String(monthNum),
      monthDisplay: dp.month ?? String(monthNum),
      dayKey: kp.day ?? String(dayNum),
      dayDisplay: kp.day ?? String(dayNum),
    };
  }

  // 其他历法（伊斯兰/希伯来/波斯/佛教）
  const greg = pdCal.withCalendar('gregory');
  const date = new Date(greg.year, greg.month - 1, greg.day);
  const kp = partsOf(fmt('en-US', cal, { year: 'numeric', month: 'numeric', day: 'numeric', era: 'short' }), date);
  const dp = partsOf(fmt(displayLocale, cal, { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }), date);
  const yearStr = kp.year ?? String(yearNum);
  const eraStr = eraName(cal, displayLocale);
  const yearKey = `${cal}|${yearStr}`;
  const yearDisplay = eraStr ? `${eraStr} ${yearStr}` : yearStr;
  return {
    yearKey,
    yearDisplay,
    monthKey: kp.month ?? monthCode,
    monthDisplay: dp.month ?? monthCode,
    dayKey: kp.day ?? String(dayNum),
    dayDisplay: dp.day ?? String(dayNum),
  };
}

/** 公历日期 → 历法键 */
export function keysFromGregorian(date: Date, cal: CalendarId): DateSelection {
  const pd = toPlainDate(date).withCalendar(temporalCalId(cal));
  const k = keyPartsFromTemporal(pd, cal, 'zh-CN');
  return { yearKey: k.yearKey, monthKey: k.monthKey, dayKey: k.dayKey };
}

/* ---------------- 枚举（年/月/日选项） ---------------- */

interface YearEntry extends CalOption { firstSeen: Date }
interface MonthEntry extends CalOption { firstSeen: Date }

const yearCache = new Map<string, YearEntry[]>();
const monthCache = new Map<string, MonthEntry[]>();
const dayCache = new Map<string, CalOption[]>();

const SPAN_YEARS = 100;

/**
 * 枚举某历法可用的年份选项（以 refDate 所在公历年为中心，前后各 100 年）。
 * 使用 Temporal API 直接遍历历法年份，无需采样扫描。
 */
export function yearOptions(cal: CalendarId, refDate: Date, displayLocale = 'zh-CN'): CalOption[] {
  const cacheKey = `${cal}|${displayLocale}|${refDate.getFullYear()}`;
  const hit = yearCache.get(cacheKey);
  if (hit) return hit;

  const center = toPlainDate(refDate);
  const calId = temporalCalId(cal);

  if (cal === 'gregory') {
    const entries: YearEntry[] = [];
    for (let y = center.year - SPAN_YEARS; y <= center.year + SPAN_YEARS; y++) {
      entries.push({ key: String(y), display: String(y), firstSeen: new Date(y, 0, 1) });
    }
    yearCache.set(cacheKey, entries);
    return entries;
  }

  // 非公历：以公历中心日期为基准，向前/后遍历该历法的年份
  const entries: YearEntry[] = [];
  const allMap = new Map<string, YearEntry>();
  const centerCal = center.withCalendar(calId);

  // 向前遍历
  let pd = centerCal;
  for (let i = 0; i < SPAN_YEARS + 5; i++) {
    const k = keyPartsFromTemporal(pd, cal, displayLocale);
    if (!allMap.has(k.yearKey)) {
      allMap.set(k.yearKey, { key: k.yearKey, display: k.yearDisplay, firstSeen: fromDate(pd) });
    }
    pd = pd.subtract({ years: 1 });
  }
  // 向后遍历
  pd = centerCal.add({ years: 1 });
  for (let i = 0; i < SPAN_YEARS + 5; i++) {
    const k = keyPartsFromTemporal(pd, cal, displayLocale);
    if (!allMap.has(k.yearKey)) {
      allMap.set(k.yearKey, { key: k.yearKey, display: k.yearDisplay, firstSeen: fromDate(pd) });
    }
    pd = pd.add({ years: 1 });
  }

  // 按 firstSeen 公历日期排序
  for (const entry of allMap.values()) entries.push(entry);
  entries.sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime());

  yearCache.set(cacheKey, entries);
  return entries;
}

/**
 * 根据年份键定位该历法年份的第一天（Temporal.PlainDate，已转换为目标历法）。
 */
function resolveYearStart(cal: CalendarId, yearKey: string, displayLocale: string): Temporal.PlainDate | null {
  const calId = temporalCalId(cal);

  if (cal === 'gregory') {
    const y = Number(yearKey);
    if (!y) return null;
    return Temporal.PlainDate.from({ calendar: calId, year: y, month: 1, day: 1 });
  }

  if (cal === 'chinese') {
    // yearKey = "relatedYear|ganzhi"，如 "2026|丙午"
    const [relatedYearStr] = yearKey.split('|');
    const relatedYear = Number(relatedYearStr);
    if (!relatedYear) return null;
    // 农历正月初一通常在 1/21 ~ 2/21 之间
    for (let m = 1; m <= 2; m++) {
      for (let d = 1; d <= 31; d++) {
        try {
          const greg = Temporal.PlainDate.from({ year: relatedYear, month: m, day: d });
          const chn = greg.withCalendar(calId);
          if (chn.month === 1 && chn.day === 1) return chn;
        } catch { /* 日期不存在 */ }
      }
    }
    return null;
  }

  if (cal === 'japanese') {
    // yearKey = "era|yearInEra"，如 "令和|8"
    // era 来自 Intl ja-JP（汉字），而 Temporal 的 era 字段是英文小写（如 "reiwa"），
    // 故搜索时需用 Intl 来匹配 era，而非 Temporal 的 era 属性。
    const [era, yearInEraStr] = yearKey.split('|');
    const yearInEra = Number(yearInEraStr);
    if (!era || !yearInEra) return null;
    // 用 Intl 搜索该年号+年对应的公历日期范围
    const jpFmt = fmt('ja-JP', 'japanese', { year: 'numeric', month: 'numeric', day: 'numeric', era: 'long' });
    for (let y = 1900; y <= 2100; y++) {
      for (let m = 1; m <= 12; m++) {
        try {
          const greg = Temporal.PlainDate.from({ year: y, month: m, day: 1 });
          const jpParts = partsOf(jpFmt, new Date(greg.year, greg.month - 1, greg.day));
          if (jpParts.era === era && Number(jpParts.year) === yearInEra) {
            return greg.withCalendar(calId);
          }
        } catch { /* */ }
      }
    }
    return null;
  }

  // 伊斯兰/希伯来/波斯/佛教：yearKey = "cal|yearNum"
  const yearNumStr = yearKey.split('|')[1];
  const yearNum = Number(yearNumStr);
  if (!yearNum) return null;
  try {
    return Temporal.PlainDate.from({ calendar: calId, year: yearNum, month: 1, day: 1 });
  } catch {
    return null;
  }
}

/**
 * 枚举某历法某年的月份选项。
 * 使用 Temporal 的 monthsInYear 直接确定月份数，再逐月获取 monthCode 和显示名。
 */
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
    const yearStart = resolveYearStart(cal, yearKey, displayLocale);
    if (!yearStart) return [];

    const calId = temporalCalId(cal);
    const monthsInYear = yearStart.monthsInYear;
    const seen = new Set<string>();

    for (let m = 1; m <= monthsInYear; m++) {
      try {
        // 直接用月份序号构造该月第1天
        const tryDate = Temporal.PlainDate.from({
          calendar: calId,
          year: yearStart.year,
          month: m,
          day: 1,
        });
        const k = keyPartsFromTemporal(tryDate, cal, displayLocale);
        if (!seen.has(k.monthKey)) {
          seen.add(k.monthKey);
          entries.push({ key: k.monthKey, display: k.monthDisplay, firstSeen: fromDate(tryDate) });
        }
      } catch { /* 闰月或不存在 */ }
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
    // 非公历：用 Temporal 直接获取该月天数，逐日枚举
    const yearStart = resolveYearStart(cal, yearKey, displayLocale);
    if (!yearStart) return [];
    const calId = temporalCalId(cal);

    // 从 monthKey 定位该月第一天
    let monthStart: Temporal.PlainDate | null = null;
    const monthsInYear = yearStart.monthsInYear;
    for (let m = 1; m <= monthsInYear; m++) {
      try {
        const tryDate = Temporal.PlainDate.from({
          calendar: calId,
          year: yearStart.year,
          month: m,
          day: 1,
        });
        const k = keyPartsFromTemporal(tryDate, cal, displayLocale);
        if (k.monthKey === monthKey) {
          monthStart = tryDate;
          break;
        }
      } catch { /* */ }
    }
    if (!monthStart) return [];

    const daysInMonth = monthStart.daysInMonth;
    for (let d = 1; d <= daysInMonth; d++) {
      const tryDate = monthStart.add({ days: d - 1 });
      const k = keyPartsFromTemporal(tryDate, cal, displayLocale);
      entries.push({ key: k.dayKey, display: k.dayDisplay });
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

  // 非公历：从 yearKey + monthKey 定位月份，再按 dayKey 找到对应公历日
  const yearStart = resolveYearStart(cal, sel.yearKey, 'zh-CN');
  if (!yearStart) return null;
  const calId = temporalCalId(cal);
  const monthsInYear = yearStart.monthsInYear;

  for (let m = 1; m <= monthsInYear; m++) {
    try {
      const monthStart = Temporal.PlainDate.from({
        calendar: calId,
        year: yearStart.year,
        month: m,
        day: 1,
      });
      const k = keyPartsFromTemporal(monthStart, cal, 'zh-CN');
      if (k.monthKey !== sel.monthKey) continue;

      const daysInMonth = monthStart.daysInMonth;
      for (let d = 1; d <= daysInMonth; d++) {
        const tryDate = monthStart.add({ days: d - 1 });
        const dk = keyPartsFromTemporal(tryDate, cal, 'zh-CN');
        if (dk.dayKey === sel.dayKey) return fromDate(tryDate);
      }
    } catch { /* */ }
  }
  return null;
}

/* ---------------- 日历网格 ---------------- */

export interface CalDayCell {
  dayKey: string;
  dayDisplay: string;
  greg: Date;
}

/**
 * 枚举某历法某年某月的全部日，并附上各自对应的公历日期。
 */
export function monthCalendarDays(
  cal: CalendarId,
  yearKey: string,
  monthKey: string,
  displayLocale = 'zh-CN'
): CalDayCell[] {
  const days = dayOptions(cal, yearKey, monthKey, displayLocale);
  if (days.length === 0) return [];

  if (cal === 'gregory') {
    const y = Number(yearKey);
    const m = Number(monthKey);
    return days.map((d, i) => ({ dayKey: d.key, dayDisplay: d.display, greg: new Date(y, m - 1, i + 1) }));
  }

  // 非公历：从 monthOptions 找到该月的 firstSeen，然后逐日推进
  const months = monthOptions(cal, yearKey, displayLocale) as MonthEntry[];
  const me = months.find((e) => e.key === monthKey);
  if (!me) return [];

  const calId = temporalCalId(cal);
  const yearStart = resolveYearStart(cal, yearKey, displayLocale);
  if (!yearStart) return [];

  // 从 firstSeen 对应的 Temporal.PlainDate 开始逐日枚举
  let pd = toPlainDate(me.firstSeen).withCalendar(calId);
  const cells: CalDayCell[] = [];
  for (const d of days) {
    const g = fromDate(pd);
    cells.push({ dayKey: d.key, dayDisplay: d.display, greg: g });
    pd = addDays(pd);
  }
  return cells;
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
    return fmt(displayLocale, 'japanese', { year: 'numeric', month: 'long', day: 'numeric', era: 'long' }).format(date);
  }
  if (cal === 'hebrew' && displayLocale.startsWith('zh')) {
    const k = keysFromGregorian(date, 'hebrew');
    const era = eraName('hebrew', displayLocale);
    const yearNum = k.yearKey.split('|')[1] ?? '';
    const mNum = hebrewMonthNum(k.monthKey, k.yearKey);
    return `${era}${yearNum}年${Number.isNaN(mNum) ? k.monthKey : mNum}月${k.dayKey}日`;
  }
  const parts = fmt(displayLocale, cal, { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(date);
  const era = eraName(cal, displayLocale);
  return parts.map((p) => (p.type === 'era' ? era : p.value)).join('');
}

/** 目标日期 + 可选精确时间的组合展示 */
export function formatEventDateTime(dateISO: string, time: string | undefined, cal: CalendarId, displayLocale: string): string {
  const base = formatEventDate(dateISO, cal, displayLocale);
  return time ? `${base} ${time}` : base;
}

/**
 * 希伯来历某年某月的「民用序号」（与 ICU 一致，提斯利月/Tishri 为每年第 1 个月），
 * 从「该年月份枚举顺序」取 1-based 序号。
 */
function hebrewMonthNum(monthKey: string, yearKey: string): number {
  const months = monthOptions('hebrew', yearKey, 'zh-CN') as MonthEntry[];
  const idx = months.findIndex((m) => m.key === monthKey);
  return idx < 0 ? NaN : idx + 1;
}

/**
 * 日历控件表头的「年-月」标签（仅年至月，不含日）。
 */
export function formatYearMonthHeader(
  cal: CalendarId,
  yearKey: string,
  monthKey: string,
  displayLocale = 'zh-CN'
): string {
  if (!displayLocale.startsWith('zh')) {
    const months = monthOptions(cal, yearKey, displayLocale) as MonthEntry[];
    const me = months.find((e) => e.key === monthKey);
    if (!me) return '';
    return fmt(displayLocale, cal, { year: 'numeric', month: 'long', era: 'short' }).format(me.firstSeen);
  }

  if (cal === 'chinese') {
    const ye = yearOptions('chinese', new Date(), 'zh-CN').find((e) => e.key === yearKey);
    const me = monthOptions('chinese', yearKey, 'zh-CN').find((e) => e.key === monthKey);
    return `${ye?.display ?? ''} ${me?.display ?? ''}`.trim();
  }

  if (cal === 'gregory') {
    return `${yearKey}年${monthKey}月`;
  }

  if (cal === 'hebrew') {
    const era = eraName('hebrew', 'zh-CN');
    const yearNum = yearKey.split('|')[1] ?? '';
    const m = hebrewMonthNum(monthKey, yearKey);
    return `${era}${yearNum}年${Number.isNaN(m) ? monthKey : m}月`;
  }

  const monthNum = (monthOptions(cal, yearKey, 'zh-CN') as MonthEntry[]).findIndex((m) => m.key === monthKey) + 1;

  if (cal === 'japanese') {
    const [era, yr] = yearKey.split('|');
    return `${era ?? ''}${yr ?? ''}年${monthNum}月`;
  }

  const era = eraName(cal, 'zh-CN');
  const yearNum = yearKey.split('|')[1] ?? '';
  return `${era}${yearNum}年${monthNum}月`;
}