/**
 * 时间计算引擎
 * - 自定义日界限（Custom Day Boundary）：
 *   · 界限 ≤ 12:00（如 02:00）：到达界限后才进入 T 日，之前仍算 T-1 日（晚睡人群）
 *   · 界限 > 12:00（如 18:00）：到达界限后提前进入 T+1 日（特定习俗/业务前置场景）
 * - 兼容「仅日期」与「精确时间」事件的差值计算
 * - 多粒度分解：仅天数 / 日时分秒 / 年月日 / 年周日 / 周日
 */
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
  /** 各粒度段，顺序即展示顺序 */
  segments: { unit: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'; value: number }[];
  totalDays: number;
}

/** 本地日期 → ISO(yyyy-mm-dd) */
function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
 * 锚点日期仅用于提供「星期几 / 日 / 月日」模式，实际展示与倒数均滚动到下一次发生。
 */
export function nextOccurrenceDate(event: AevumEvent, nowTs: number, boundaryMin: number): string {
  const r = event.recurrence;
  if (!r || r === 'none') return event.date;

  const time = event.time;
  const refMoment = time ? nowTs : logicalDaySerial(nowTs, boundaryMin);
  const [ay, am, ad] = event.date.split('-').map(Number);
  const now = new Date(nowTs);

  if (r === 'weekly') {
    const anchorWD = new Date(ay, am - 1, ad).getDay(); // 0=Sun..6=Sat
    const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const off = (anchorWD - cand.getDay() + 7) % 7;
    cand.setDate(cand.getDate() + off); // 今天或之后第一个匹配星期几
    for (let i = 0; i < 4; i++) {
      const iso = isoOf(cand);
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      cand.setDate(cand.getDate() + 7);
    }
  } else if (r === 'monthly') {
    let y = now.getFullYear();
    let m = now.getMonth(); // 0-based
    for (let i = 0; i < 13; i++) {
      const day = Math.min(ad, new Date(y, m + 1, 0).getDate()); // 当月不存在该日则收敛到月末
      const iso = isoOf(new Date(y, m, day));
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      m++;
      if (m > 11) { m = 0; y++; }
    }
  } else if (r === 'yearly') {
    let y = now.getFullYear();
    for (let i = 0; i < 3; i++) {
      const day = Math.min(ad, new Date(y, am, 0).getDate()); // 闰月/小月不存在该日则收敛到月末
      const iso = isoOf(new Date(y, am - 1, day));
      if (candidateMoment(iso, time, boundaryMin) >= refMoment) return iso;
      y++;
    }
  }
  return event.date; // 兜底（理论不可达）
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
  const serial = logicalDaySerial(new Date(y, m - 1, d).getTime(), 0); // 目标日历日序号
  const b = boundaryMin <= 720 ? boundaryMin : boundaryMin - 1440;
  return serial * DAY_MS + b * MIN_MS;
}

/** 按日历加法分解两个本地日期为 年/月/日（start → end，假定 end ≥ start） */
function decomposeYMD(startTs: number, endTs: number): { years: number; months: number; days: number } {
  const s = new Date(startTs);
  const e = new Date(endTs);
  let years = e.getFullYear() - s.getFullYear();
  let months = e.getMonth() - s.getMonth();
  let days = e.getDate() - s.getDate();
  if (days < 0) {
    months -= 1;
    // 上一个月的天数
    const prevMonthDays = new Date(e.getFullYear(), e.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
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
    // 精确时间：按时间戳
    const ms = target - nowTs;
    dayDiff = Math.trunc(ms / DAY_MS);
    status = Math.abs(ms) < 1000 ? 'today' : ms > 0 ? 'future' : 'past';
  } else {
    // 仅日期：按逻辑日
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
      // 精确到时分秒：仅日期事件以对齐后的目标时刻为准
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
      // 基于逻辑日做日历分解
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
        const from2 = new Date(from);
        from2.setFullYear(from2.getFullYear() + years);
        const rest = Math.max(0, Math.round((to - from2.getTime()) / DAY_MS));
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
