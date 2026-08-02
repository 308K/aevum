/**
 * 时间计算引擎 —— 基于 TC39 Temporal API（原生或 @js-temporal/polyfill）
 * - 自定义日界限（Custom Day Boundary）：
 *   · 界限 ≤ 12:00（如 02:00）：到达界限后才进入 T 日，之前仍算 T-1 日（晚睡人群）
 *   · 界限 > 12:00（如 18:00）：到达界限后提前进入 T+1 日（特定习俗/业务前置场景）
 * - 兼容「仅日期」与「精确时间」事件的差值计算
 * - 多粒度分解：仅天数 / 日时分秒 / 年月日 / 年周日 / 周日
 *
 * Temporal 替换说明：
 * - 日期算术（加减天/月/年）改用 Temporal.PlainDate.add/subtract（DST 安全）
 * - 日期差值分解改用 Temporal.PlainDate.until（日历感知的年/月/日分解）
 * - 时间戳与公历日期的互转改用 Temporal.PlainDateTime / Temporal.Instant
 * - 逻辑日序号仍基于时间戳运算（因自定义日界限需要时间戳级精度）
 */
import { Temporal } from './temporal.js';
import type { AevumEvent, EventStatus, Granularity } from '../types.js';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

export interface DiffParts {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  totalDays: number;
}

export interface DiffResult {
  status: EventStatus;
  segments: { unit: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'; value: number }[];
  totalDays: number;
}

/** 本地日期 → ISO(yyyy-mm-dd) */
function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
  return new Date(pd.year, pd.month - 1, pd.day);
}

/**
 * 候选日期的「比较基准」：
 * - 精确时间事件 → 目标时间戳（与 nowTs 比较）
 * - 仅日期事件 → 目标逻辑日序号（与 now 的逻辑日序号比较，兼容日界限）
 */
function candidateMoment(iso: string, time: string | undefined, boundaryMin: number): number {
  const ts = targetTimestamp({ date: iso, time } as AevumEvent, boundaryMin);
  if (time) return ts;
  return logicalDaySerial(ts, boundaryMin);
}

/**
 * 计算循环事件的「下一个发生日期」ISO。
 * - 'none' / 未设置 → 返回原基准日期
 * - 否则按 weekly/monthly/yearly 规则，找到 first occurrence ≥ 当前时刻（含今天）的日期
 *
 * 使用 Temporal.PlainDate 做日期算术（DST 安全、日历感知）。
 */
export function nextOccurrenceDate(event: AevumEvent, nowTs: number, boundaryMin: number): string {
  const r = event.recurrence;
  if (!r || r === 'none') return event.date;

  const time = event.time;
  const refMoment = time ? nowTs : logicalDaySerial(nowTs, boundaryMin);
  const [ay, am, ad] = event.date.split('-').map(Number);
  const anchor = Temporal.PlainDate.from({ year: ay, month: am, day: ad });
  const now = new Date(nowTs);
  const nowPd = toPlainDate(now);

  if (r === 'weekly') {
    // Temporal dayOfWeek: 1=Mon..7=Sun，需转为 0=Sun..6=Sat 以兼容旧逻辑
    const anchorWD = anchor.dayOfWeek % 7;
    const nowWD = nowPd.dayOfWeek % 7;
    let cand = nowPd;
    const off = (anchorWD - nowWD + 7) % 7;
    cand = cand.add({ days: off });
    for (let i = 0; i < 4; i++) {
      const iso = isoOf(fromDate(cand));
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      cand = cand.add({ days: 7 });
    }
  } else if (r === 'monthly') {
    let cand = nowPd;
    for (let i = 0; i < 13; i++) {
      // 当月不存在该日则收敛到月末
      const dim = cand.daysInMonth;
      const day = Math.min(ad, dim);
      const tryDate = Temporal.PlainDate.from({ year: cand.year, month: cand.month, day });
      const iso = isoOf(fromDate(tryDate));
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      cand = cand.add({ months: 1 });
    }
  } else if (r === 'yearly') {
    let cand = nowPd;
    for (let i = 0; i < 3; i++) {
      const dim = Temporal.PlainDate.from({ year: cand.year, month: am, day: 1 }).daysInMonth;
      const day = Math.min(ad, dim);
      const tryDate = Temporal.PlainDate.from({ year: cand.year, month: am, day });
      const iso = isoOf(fromDate(tryDate));
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      cand = cand.add({ years: 1 });
    }
  }
  return event.date;
}

/**
 * 返回用于「展示与倒数」的等效事件：循环事件将日期滚动到下一次发生。
 * 非循环事件原样返回（同引用，无额外分配）。
 */
export function effectiveEvent(event: AevumEvent, nowTs: number, boundaryMin: number): AevumEvent {
  const r = event.recurrence;
  if (!r || r === 'none') return event;
  const iso = nextOccurrenceDate(event, nowTs, boundaryMin);
  if (iso === event.date) return event;
  return { ...event, date: iso };
}

/** 解析 "HH:MM" 为分钟数 */
export function parseBoundary(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 逻辑日序号：将时间戳按自定义日界限折算为「逻辑日期」的天序号。
 * b ≤ 720：逻辑日 = (ts - b) 的本地日期
 * b > 720：逻辑日 = (ts + (1440 - b)) 的本地日期
 */
export function logicalDaySerial(ts: number, boundaryMin: number): number {
  const shift = boundaryMin <= 720 ? -boundaryMin : 1440 - boundaryMin;
  const d = new Date(ts + shift * MIN_MS);
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round(localMidnight / DAY_MS);
}

/** 事件目标时刻（时间戳）。仅日期事件取目标逻辑日的起始真实时刻。 */
export function targetTimestamp(event: AevumEvent, boundaryMin: number): number {
  const [y, m, d] = event.date.split('-').map(Number);
  if (event.time) {
    const [hh, mm] = event.time.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0).getTime();
  }
  // 仅日期：目标逻辑日的真实起始时刻（按界限对齐）
  const serial = logicalDaySerial(new Date(y, m - 1, d).getTime(), 0);
  const b = boundaryMin <= 720 ? boundaryMin : boundaryMin - 1440;
  return serial * DAY_MS + b * MIN_MS;
}

/**
 * 按日历分解两个日期为 年/月/日（start → end，假定 end ≥ start）
 * 使用 Temporal.PlainDate.until() 做日历感知的差值分解。
 */
function decomposeYMD(startTs: number, endTs: number): { years: number; months: number; days: number } {
  const sDate = new Date(startTs);
  const eDate = new Date(endTs);
  const s = toPlainDate(sDate);
  const e = toPlainDate(eDate);
  const [from, to] = startTs <= endTs ? [s, e] : [e, s];
  const diff = from.until(to, { largestUnit: 'year', smallestUnit: 'day' });
  return { years: diff.years, months: diff.months, days: diff.days };
}

function pushSeg(
  segs: DiffResult['segments'],
  unit: DiffResult['segments'][number]['unit'],
  value: number
) {
  if (value > 0 || segs.length > 0 || unit === 'day' || unit === 'second') segs.push({ unit, value });
}

/** 核心：计算事件与当前时间的差值（多粒度） */
export function computeDiff(
  event: AevumEvent,
  nowTs: number,
  boundaryMin: number,
  granularity: Granularity
): DiffResult {
  const hasTime = Boolean(event.time);
  const target = targetTimestamp(event, boundaryMin);

  // —— 状态与天数基准 ——
  let dayDiff: number;
  let status: EventStatus;
  if (hasTime) {
    const ms = target - nowTs;
    dayDiff = Math.trunc(ms / DAY_MS);
    status = Math.abs(ms) < 1000 ? 'today' : ms > 0 ? 'future' : 'past';
  } else {
    dayDiff = logicalDaySerial(target, boundaryMin) - logicalDaySerial(nowTs, boundaryMin);
    status = dayDiff > 0 ? 'future' : dayDiff < 0 ? 'past' : 'today';
  }

  const absDays = Math.abs(dayDiff);
  const segments: DiffResult['segments'] = [];

  switch (granularity) {
    case 'day': {
      segments.push({ unit: 'day', value: absDays });
      break;
    }
    case 'dhms': {
      let ms = Math.abs(target - nowTs);
      const days = Math.floor(ms / DAY_MS);
      ms -= days * DAY_MS;
      const hours = Math.floor(ms / 3_600_000);
      ms -= hours * 3_600_000;
      const minutes = Math.floor(ms / MIN_MS);
      ms -= minutes * MIN_MS;
      const seconds = Math.floor(ms / 1000);
      pushSeg(segments, 'day', days);
      segments.push({ unit: 'hour', value: hours });
      segments.push({ unit: 'minute', value: minutes });
      segments.push({ unit: 'second', value: seconds });
      break;
    }
    case 'ymd':
    case 'ywd': {
      const nowSerialTs = logicalDaySerial(nowTs, boundaryMin) * DAY_MS;
      const targetSerialTs = logicalDaySerial(target, boundaryMin) * DAY_MS;
      const [from, to] = nowSerialTs <= targetSerialTs ? [nowSerialTs, targetSerialTs] : [targetSerialTs, nowSerialTs];
      const { years, months, days } = decomposeYMD(from, to);
      if (granularity === 'ymd') {
        if (years > 0) segments.push({ unit: 'year', value: years });
        if (months > 0 || years > 0) segments.push({ unit: 'month', value: months });
        segments.push({ unit: 'day', value: days });
      } else {
        // 年（日历整年）+ 剩余天数按周分解
        const fromPd = toPlainDate(new Date(from));
        const afterYears = fromPd.add({ years });
        const rest = Math.max(0, Math.round((to - fromDate(afterYears).getTime()) / DAY_MS));
        const weeks = Math.floor(rest / 7);
        const remDays = rest % 7;
        if (years > 0) segments.push({ unit: 'year', value: years });
        segments.push({ unit: 'week', value: weeks });
        segments.push({ unit: 'day', value: remDays });
      }
      break;
    }
    case 'wd': {
      const weeks = Math.floor(absDays / 7);
      const remDays = absDays % 7;
      segments.push({ unit: 'week', value: weeks });
      segments.push({ unit: 'day', value: remDays });
      break;
    }
  }

  return { status, segments, totalDays: dayDiff };
}
