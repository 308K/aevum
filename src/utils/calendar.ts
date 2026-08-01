/**
 * 历法工具 —— 完全基于浏览器原生 Intl API（Intl.DateTimeFormat）
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历的正反双向转换
 * - 农历完全使用汉字显示，并同时展示公元纪年与干支纪年（如：2026年 丙午年 正月十五）
 * - 反向转换（历法日期 → 公历时间戳）通过 Intl 格式化扫描实现，带缓存，零第三方依赖
 */
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
 * 公历日历日递进 / 回退：用「年/月/日」分量重新构造 Date，
 * 而非对时间戳加/减 86400000ms。后者在夏令时回拨月（如美国 11 月，当天有 25 小时）
 * 会出现「+24h 仍落在同一公历日」的错位，导致历法扫描与网格 weekday 对齐错误。
 * 分量构造法在任意时区（含 DST）都精确等价于「日历日 ±n」，是日历日步进的正确做法。
 */
function addDays(d: Date, n = 1): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function subDays(d: Date, n = 1): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}

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

/**
 * 各非公历历法的纪元（era）词条 key。
 *
 * 背景：Android 版 Chrome 自带的 ICU 数据被裁剪，非公历 era 会返回错误值
 *（如伊斯兰历退化成“BC”），且其它历法的 era 也未中文本地化；该问题在其它
 * 平台/浏览器上并不存在。这里把纪元名称交给 i18n 字典（src/locales/*）管理，
 * 通过 t() 取词，既覆盖 Intl 的 era 字段、保证全平台（含 Android）一致正确，
 * 又不引入任何第三方日期库，且不破坏 i18n 可扩展性——新增语言只需在字典中
 * 补充对应词条即可，无需改动此处的逻辑。
 * 仅覆盖需要纪元前缀的历法；公历/农历/日本和历另有专门处理。
 */
const ERA_KEYS: Partial<Record<CalendarId, keyof LocaleDict>> = {
  islamic: 'eraIslamic',
  hebrew: 'eraHebrew',
  persian: 'eraPersian',
  buddhist: 'eraBuddhist',
};

/** 取某历法在指定界面语言下的纪元显示名（未知历法回退空串，由调用方决定） */
function eraName(cal: CalendarId, locale: string): string {
  const key = ERA_KEYS[cal];
  if (!key) return '';
  return tIn(key, resolveLocale(locale));
}

/** 将显示语言字符串解析为已注册 Locale（未注册时回退到当前界面语言） */
function resolveLocale(locale: string): Locale {
  if (locale.startsWith('zh')) return 'zh-CN';
  if (locale.startsWith('en')) return 'en-US';
  return getLocale();
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
  // 其他历法（伊斯兰/希伯来/波斯/佛教）：纪元名称用权威映射覆盖，
  // 避免依赖 Intl 的 era 字段（Android Chrome 的 ICU 会返回错误 era）。
  // 年份数字仍由 Intl 正确计算（与 era 命名互相独立）。
  const kp = partsOf(fmt('en-US', cal, { year: 'numeric', month: 'numeric', day: 'numeric', era: 'short' }), date);
  const dp = partsOf(fmt(displayLocale, cal, { year: 'numeric', month: 'long', day: 'numeric', era: 'short' }), date);
  const yearNum = kp.year ?? dp.year ?? '';
  const era = eraName(cal, displayLocale);
  // 键固定为「历法id|年」，locale 无关且不受 Android era bug 影响（更稳定）
  const yearKey = `${cal}|${yearNum}`;
  const yearDisplay = era ? `${era} ${yearNum}` : yearNum;
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
    const prev = subDays(d);
    if (keyPartsOf(prev, cal, displayLocale).yearKey !== entry.key) break;
    d = prev;
  }
  // 正向扫描直到进入目标年
  for (let i = 0; i < 400; i++) {
    if (keyPartsOf(d, cal, displayLocale).yearKey === entry.key) return d;
    d = addDays(d);
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
      d = addDays(d);
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
      d = addDays(d);
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
    d = addDays(d);
  }
  return null;
}

/* ---------------- 日历网格（供可视化日历控件使用） ---------------- */

/** 日历网格中的一个日格：含历法显示与对应公历日期（用于周列对齐） */
export interface CalDayCell {
  dayKey: string;
  dayDisplay: string;
  /** 该历法日对应的公历本地零点 Date */
  greg: Date;
}

/**
 * 枚举某历法某年某月的全部日，并附上各自对应的公历日期。
 * 用于把日格摆进 7 列周网格：连续历法日 ⟷ 连续公历日，故 weekday 逐日 +1，
 * 用 greg.getDay() 即可正确归列。纯函数、无 DOM，复用 monthOptions 的首见起点顺序扫描。
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
  const months = monthOptions(cal, yearKey, displayLocale) as MonthEntry[];
  const me = months.find((e) => e.key === monthKey);
  if (!me) return [];
  let g = new Date(me.firstSeen.getTime());
  return days.map((d) => {
    const cur = new Date(g.getFullYear(), g.getMonth(), g.getDate());
    g = addDays(g);
    return { dayKey: d.key, dayDisplay: d.display, greg: cur };
  });
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
  if (cal === 'hebrew' && displayLocale.startsWith('zh')) {
    // 中文下用民用月序（与 ICU 一致：Tishri=1 … Elul=13 闰年），闰年末月即「13月」
    const k = keysFromGregorian(date, 'hebrew');
    const era = eraName('hebrew', displayLocale);
    const yearNum = k.yearKey.split('|')[1] ?? '';
    const m = hebrewMonthNum(k.monthKey, k.yearKey);
    return `${era}${yearNum}年${Number.isNaN(m) ? k.monthKey : m}月${k.dayKey}日`;
  }
  // 其他历法：用原生 Intl 完整格式化（保留“月/日”单位、标点与正确顺序），
  // 仅把 era 字段替换为权威映射值。好处：在完整 ICU 的平台上映射值与原值一致
  //（等于无操作），在 Android Chrome 裁减 ICU 下则替换掉错误的 era（如“BC”），
  // 从而全平台结果一致正确，且不引入任何第三方日期库。
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
 * 从「该年月份枚举顺序」取 1-based 序号：闰年 Tishri=1 … 闰亚达(Adar I)=6、
 * 正常亚达(Adar II)=7 … Elul=13；平年同理但末月 Elul=12。用枚举顺序而非静态表，
 * 才能同时正确处理平/闰年（同一月名在不同年型序号不同）。键无法识别时回退 NaN。
 */
function hebrewMonthNum(monthKey: string, yearKey: string): number {
  const months = monthOptions('hebrew', yearKey, 'zh-CN') as MonthEntry[];
  const idx = months.findIndex((m) => m.key === monthKey);
  return idx < 0 ? NaN : idx + 1;
}

/**
 * 日历控件表头的「年-月」标签（仅年至月，不含日）。
 *
 * 中文统一为「{年}年{月}月」风格：年份带纪元/年号并以「年」结尾，月份用数字加「月」，
 * 年与月之间、纪元与年号之间均无多余空格。示例：
 * - 公历：       2026年8月
 * - 伊斯兰历：   伊斯兰历1448年2月
 * - 日本和历：   令和8年8月
 * - 农历（沿用既有风格）：2026年·丙午年 正月
 *
 * 非中文回退到 Intl 标准「月 年（纪元缩写）」格式。
 * 纯函数、无 DOM，键均 locale 无关（yearKey/monthKey 由 keysFromGregorian 产出）。
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
    // 农历：沿用既有正确的「年（公元·干支） 月（汉字名）」风格
    const ye = yearOptions('chinese', new Date(), 'zh-CN').find((e) => e.key === yearKey);
    const me = monthOptions('chinese', yearKey, 'zh-CN').find((e) => e.key === monthKey);
    return `${ye?.display ?? ''} ${me?.display ?? ''}`.trim();
  }

  if (cal === 'gregory') {
    return `${yearKey}年${monthKey}月`;
  }

  if (cal === 'hebrew') {
    // 中文下用民用月序（与 ICU 一致：Tishri=1 … Elul=13 闰年），闰年末月即「13月」
    const era = eraName('hebrew', 'zh-CN');
    const yearNum = yearKey.split('|')[1] ?? '';
    const m = hebrewMonthNum(monthKey, yearKey);
    return `${era}${yearNum}年${Number.isNaN(m) ? monthKey : m}月`;
  }

  // 非公历：月份用「该年月份枚举顺序」的数字序号（1-based）。
  // 注意：希伯来历在部分 ICU 下 month:'numeric' 会退化成英文月名（如 “Av”），
  // 不能直接当数字月用；故统一取枚举序数，确保中文表头为「X月」而非「Av月」。
  const monthNum = (monthOptions(cal, yearKey, 'zh-CN') as MonthEntry[]).findIndex((m) => m.key === monthKey) + 1;

  if (cal === 'japanese') {
    const [era, yr] = yearKey.split('|');
    return `${era ?? ''}${yr ?? ''}年${monthNum}月`;
  }

  // 伊斯兰历 / 希伯来历 / 波斯历 / 佛教历：纪元 + 年 + 月（均数字）
  const era = eraName(cal, 'zh-CN');
  const yearNum = yearKey.split('|')[1] ?? '';
  return `${era}${yearNum}年${monthNum}月`;
}
