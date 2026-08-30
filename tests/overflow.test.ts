import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTemporalReady, getTemporalForCalendar } from '../src/utils/temporal.js';
import { temporalCalId } from '../src/utils/calendar.js';
import { nextOccurrenceDate } from '../src/utils/time-calc.js';
import type { AevumEvent, CalendarId, DayOverflow, LeapMonthStrategy } from '../src/types.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

const mk = (date: string, recurrence: AevumEvent['recurrence'], calendar: AevumEvent['calendar'] = 'gregory', time?: string): AevumEvent => ({
  id: 't', name: 't', date, calendar, recurrence, granularity: 'day', tags: [], pinned: false, createdAt: 0, time,
});
const at = (iso: string, h = 0, m = 0): number => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0).getTime();
};
const strat = (so: DayOverflow = 'lastDay', ll: LeapMonthStrategy = 'nonLeap') => ({ dayOverflow: so, leapMonthStrategy: ll });
const calIdOf = (id: CalendarId) => temporalCalId(id);
const pdOf = (calId: string, iso: string) => {
  const tid = temporalCalId(calId as CalendarId);
  const T = getTemporalForCalendar(tid);
  const [y, m, d] = iso.split('-').map(Number);
  return T.PlainDate.from({ year: y, month: m, day: d }).withCalendar(tid);
};
const monthCodeOf = (calId: string, iso: string) => pdOf(calId, iso).monthCode;
const dayOf = (calId: string, iso: string) => pdOf(calId, iso).day;
const daysInMonthOf = (calId: string, iso: string) => pdOf(calId, iso).daysInMonth;
const isoPlusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};
const isoOfPd = (pd: any) => {
  const g = pd.withCalendar('gregory');
  const p = (n: number) => String(n).padStart(2, '0');
  return `${g.year}-${p(g.month)}-${p(g.day)}`;
};

const CALS: { id: CalendarId; anchorIso: string; label: string }[] = [
  { id: 'gregory', anchorIso: '2025-03-15', label: '公历' },
  { id: 'chinese', anchorIso: '2025-02-17', label: '农历' },
  { id: 'islamic-umalqura', anchorIso: '2025-07-31', label: '伊斯兰历(乌姆库拉)' },
  { id: 'islamic-civil', anchorIso: '2025-07-31', label: '伊斯兰历(民用)' },
  { id: 'islamic-tbla', anchorIso: '2025-07-31', label: '伊斯兰历(天文表算)' },
  { id: 'islamic-rgsa', anchorIso: '2025-07-31', label: '伊斯兰历(沙特观月)' },
  { id: 'hebrew', anchorIso: '2025-09-23', label: '希伯来历' },
  { id: 'persian', anchorIso: '2025-03-21', label: '波斯历' },
  { id: 'buddhist', anchorIso: '2025-01-01', label: '佛教历' },
  { id: 'japanese', anchorIso: '2025-01-01', label: '日本和历' },
  { id: 'roc', anchorIso: '2025-01-01', label: '民国纪年' },
  { id: 'indian', anchorIso: '2025-04-14', label: '印度国家历' },
  { id: 'ethiopic', anchorIso: '2025-01-01', label: '埃塞俄比亚历' },
  { id: 'ethiopic-amete-alem', anchorIso: '2025-01-01', label: '埃塞俄比亚历(Amete Alem)' },
  { id: 'coptic', anchorIso: '2025-01-01', label: '科普特历' },
  { id: 'dangi', anchorIso: '2025-01-29', label: '韩国农历' },
  { id: 'juche', anchorIso: '2025-01-01', label: '主体历' },
];

describe('A. 公历年循环 2/29 x dayOverflow', () => {
  it('2/29 yearly rfc5545 -> 2028-02-29', () => {
    expect(nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('rfc5545'))).toBe('2028-02-29');
  });
  it('2/29 yearly lastDay -> 2025-02-28', () => {
    expect(nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('lastDay'))).toBe('2025-02-28');
  });
  it('2/29 yearly nextMonth -> 2025-03-01', () => {
    expect(nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('nextMonth'))).toBe('2025-03-01');
  });
});

describe('A2. 公历年循环 2/29，从 2023-01-01 起算', () => {
  it('2/29 yearly rfc5545 2023起 -> 2024-02-29', () => {
    expect(nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2023-01-01'), 0, strat('rfc5545'))).toBe('2024-02-29');
  });
  it('2/29 yearly lastDay 2023起 -> 2023-02-28', () => {
    expect(nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2023-01-01'), 0, strat('lastDay'))).toBe('2023-02-28');
  });
});

describe('B. 公历月循环 1/31 x dayOverflow', () => {
  it('1/31 monthly rfc5545 2月起 -> 2025-03-31', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('rfc5545'))).toBe('2025-03-31');
  });
  it('1/31 monthly lastDay 2月起 -> 2025-02-28', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('lastDay'))).toBe('2025-02-28');
  });
  it('1/31 monthly nextMonth 2月起 -> 2025-03-01', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('nextMonth'))).toBe('2025-03-01');
  });
});

describe('B2. 公历月循环 1/31，从 2025-04-01 起算', () => {
  it('1/31 monthly rfc5545 4月起 -> 2025-05-31', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('rfc5545'))).toBe('2025-05-31');
  });
  it('1/31 monthly lastDay 4月起 -> 2025-04-30', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('lastDay'))).toBe('2025-04-30');
  });
  it('1/31 monthly nextMonth 4月起 -> 2025-05-01', () => {
    expect(nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('nextMonth'))).toBe('2025-05-01');
  });
});

describe('C. 农历闰月年循环 x leapMonthStrategy', () => {
  const Tch = getTemporalForCalendar('chinese');
  let leapMonthDate = '';
  for (let m = 6; m <= 9; m++) {
    for (let d = 1; d <= 30; d++) {
      try {
        const pd = Tch.PlainDate.from({ year: 2025, month: m, day: d }).withCalendar('chinese');
        if (pd.monthCode.endsWith('L')) {
          leapMonthDate = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          break;
        }
      } catch {}
    }
    if (leapMonthDate) break;
  }

  if (leapMonthDate) {
    const anchor = mk(leapMonthDate, 'yearly', 'chinese');
    it('nonLeap 2026年夏季', () => {
      const r1 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'nonLeap'));
      const r1d = new Date(r1);
      expect(r1d.getFullYear() === 2026 && r1d.getMonth() >= 5 && r1d.getMonth() <= 8).toBe(true);
    });
    it('strictLeap 不在2026', () => {
      const r2 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'strictLeap'));
      expect(new Date(r2).getFullYear() !== 2026).toBe(true);
    });
    it('both 2026年夏季', () => {
      const r3 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'both'));
      const r3d = new Date(r3);
      expect(r3d.getFullYear() === 2026 && r3d.getMonth() >= 5 && r3d.getMonth() <= 8).toBe(true);
    });
  } else {
    it.skip('未找到2025年农历闰月，跳过');
  }
});

describe('D. 希伯来历闰月年循环 x leapMonthStrategy', () => {
  const The = getTemporalForCalendar('hebrew');
  let hebrewLeapDate = '';
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      try {
        const pd = The.PlainDate.from({ year: 2027, month: m, day: d }).withCalendar('hebrew');
        if (pd.monthCode.endsWith('L')) {
          hebrewLeapDate = `2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          break;
        }
      } catch {}
    }
    if (hebrewLeapDate) break;
  }

  if (hebrewLeapDate) {
    const anchor = mk(hebrewLeapDate, 'yearly', 'hebrew');
    it('hebrew nonLeap 2028年', () => {
      const r1 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'nonLeap'));
      expect(new Date(r1).getFullYear() === 2028).toBe(true);
    });
    it('hebrew strictLeap 不在2028', () => {
      const r2 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'strictLeap'));
      expect(new Date(r2).getFullYear() !== 2028).toBe(true);
    });
    it('hebrew both 2028年', () => {
      const r3 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'both'));
      expect(new Date(r3).getFullYear() === 2028).toBe(true);
    });
  } else {
    it.skip('未找到希伯来历闰月，跳过');
  }
});

describe('E. 全历法 monthly 基本循环', () => {
  for (const { id, anchorIso, label } of CALS) {
    it(`${label} monthly day 一致或收敛月末`, () => {
      const calId = calIdOf(id);
      const anchorDay = dayOf(calId, anchorIso);
      const futureIso = isoPlusDays(anchorIso, 45);
      const result = nextOccurrenceDate(mk(anchorIso, 'monthly', id), at(futureIso), 0, strat('lastDay'));
      const resultDay = dayOf(calId, result);
      const resultDim = daysInMonthOf(calId, result);
      if (anchorDay <= resultDim) {
        expect(String(resultDay)).toBe(String(anchorDay));
      } else {
        expect(String(resultDay)).toBe(String(resultDim));
      }
    });
    it(`${label} monthly >= now`, () => {
      const futureIso = isoPlusDays(anchorIso, 45);
      const result = nextOccurrenceDate(mk(anchorIso, 'monthly', id), at(futureIso), 0, strat('lastDay'));
      expect(result >= futureIso).toBe(true);
    });
  }
});

describe('F. 全历法 yearly 基本循环', () => {
  for (const { id, anchorIso, label } of CALS) {
    it(`${label} yearly monthCode`, () => {
      const calId = calIdOf(id);
      const anchorMC = monthCodeOf(calId, anchorIso);
      const futureIso = isoPlusDays(anchorIso, 400);
      const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
      const resultMC = monthCodeOf(calId, result);
      expect(resultMC).toBe(anchorMC);
    });
    it(`${label} yearly day 一致或收敛月末`, () => {
      const calId = calIdOf(id);
      const anchorDay = dayOf(calId, anchorIso);
      const futureIso = isoPlusDays(anchorIso, 400);
      const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
      const resultDay = dayOf(calId, result);
      const resultDim = daysInMonthOf(calId, result);
      if (anchorDay <= resultDim) {
        expect(String(resultDay)).toBe(String(anchorDay));
      } else {
        expect(String(resultDay)).toBe(String(resultDim));
      }
    });
    it(`${label} yearly >= now`, () => {
      const futureIso = isoPlusDays(anchorIso, 400);
      const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
      expect(result >= futureIso).toBe(true);
    });
  }
});

describe('G. 全历法 weekly 基本循环', () => {
  for (const { id, anchorIso, label } of CALS) {
    it(`${label} weekly 星期一致`, () => {
      const futureIso = isoPlusDays(anchorIso, 8);
      const result = nextOccurrenceDate(mk(anchorIso, 'weekly', id), at(futureIso), 0, strat('lastDay'));
      const anchorWd = new Date(anchorIso).getDay();
      const resultWd = new Date(result).getDay();
      expect(String(resultWd)).toBe(String(anchorWd));
    });
    it(`${label} weekly >= now`, () => {
      const futureIso = isoPlusDays(anchorIso, 8);
      const result = nextOccurrenceDate(mk(anchorIso, 'weekly', id), at(futureIso), 0, strat('lastDay'));
      expect(result >= futureIso).toBe(true);
    });
  }
});

describe('H. 全历法 monthly 锚定当月最后一天', () => {
  for (const { id, anchorIso, label } of CALS) {
    it(`${label} monthly末 day 一致或收敛`, () => {
      const calId = calIdOf(id);
      const T = getTemporalForCalendar(calId);
      const [y, m, d] = anchorIso.split('-').map(Number);
      const anchorPd = T.PlainDate.from({ year: y, month: m, day: d }).withCalendar(calId);
      const lastDay = anchorPd.daysInMonth;
      const lastDayIso = isoOfPd(anchorPd.with({ day: lastDay }));
      const futureIso = isoPlusDays(lastDayIso, 35);
      const result = nextOccurrenceDate(mk(lastDayIso, 'monthly', id), at(futureIso), 0, strat('lastDay'));
      const resultDay = dayOf(calId, result);
      const resultDim = daysInMonthOf(calId, result);
      if (lastDay <= resultDim) {
        expect(String(resultDay)).toBe(String(lastDay));
      } else {
        expect(String(resultDay)).toBe(String(resultDim));
      }
    });
  }
});

describe('I. 伊斯兰历 monthly 月长变化（29/30交替）', () => {
  it('islamic-umalqura monthly day 一致或收敛', () => {
    const calId = 'islamic-umalqura';
    const anchorPd = pdOf(calId, '2025-07-31');
    const anchorDay = anchorPd.day;
    const anchorIso = isoOfPd(anchorPd);
    const futureIso = isoPlusDays(anchorIso, 70);
    const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'islamic-umalqura'), at(futureIso), 0, strat('lastDay'));
    const resultDay = dayOf(calId, result);
    const resultDim = daysInMonthOf(calId, result);
    if (anchorDay <= resultDim) {
      expect(String(resultDay)).toBe(String(anchorDay));
    } else {
      expect(String(resultDay)).toBe(String(resultDim));
    }
  });
});

describe('J. 波斯历 monthly 月长变化', () => {
  it('persian monthly day 一致或收敛', () => {
    const calId = 'persian';
    const anchorPd = pdOf(calId, '2025-03-21');
    const anchorDay = anchorPd.day;
    const anchorIso = isoOfPd(anchorPd);
    const futureIso = isoPlusDays(anchorIso, 70);
    const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'persian'), at(futureIso), 0, strat('lastDay'));
    const resultDay = dayOf(calId, result);
    const resultDim = daysInMonthOf(calId, result);
    if (anchorDay <= resultDim) {
      expect(String(resultDay)).toBe(String(anchorDay));
    } else {
      expect(String(resultDay)).toBe(String(resultDim));
    }
  });
});

describe('K. 佛教历/日本和历 yearly monthCode 对齐', () => {
  for (const { id, anchorIso, label } of CALS.filter(c => c.id === 'buddhist' || c.id === 'japanese')) {
    it(`${label} yearly monthCode 对齐`, () => {
      const calId = calIdOf(id);
      const anchorMC = monthCodeOf(calId, anchorIso);
      const futureIso = isoPlusDays(anchorIso, 400);
      const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
      const resultMC = monthCodeOf(calId, result);
      expect(resultMC).toBe(anchorMC);
    });
  }
});

describe('L. 农历 monthly 闰月跳过', () => {
  it('chinese monthly 闰月跳过 day 一致或收敛', () => {
    const calId = 'chinese';
    const anchorPd = pdOf(calId, '2025-05-28');
    const anchorMC = anchorPd.monthCode;
    const anchorDay = anchorPd.day;
    const anchorIso = isoOfPd(anchorPd);
    const futureIso = isoPlusDays(anchorIso, 100);
    const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'chinese'), at(futureIso), 0, strat('lastDay'));
    const resultDay = dayOf(calId, result);
    const resultDim = daysInMonthOf(calId, result);
    if (anchorDay <= resultDim) {
      expect(String(resultDay)).toBe(String(anchorDay));
    } else {
      expect(String(resultDay)).toBe(String(resultDim));
    }
  });
});