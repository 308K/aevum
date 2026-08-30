import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTemporalReady } from '../src/utils/temporal.js';
import { nextOccurrenceDate } from '../src/utils/time-calc.js';
import type { AevumEvent } from '../src/types.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

const mk = (date: string, recurrence: AevumEvent['recurrence'], time?: string): AevumEvent => ({
  id: 't', name: 't', date, calendar: 'japanese', recurrence, granularity: 'day', tags: [], pinned: false, createdAt: 0, time,
});
const at = (iso: string, h = 0, m = 0): number => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0).getTime();
};
const strategy = { dayOverflow: 'lastDay' as const, leapMonthStrategy: 'nonLeap' as const };

describe('日本和历改元：yearly 跨改元', () => {
  it('昭和63年3/3 yearly 1989-01-01 起算 → 1989-03-03（平成元年）', () => {
    expect(nextOccurrenceDate(mk('1988-03-03', 'yearly'), at('1989-01-01'), 0, strategy)).toBe('1989-03-03');
  });
  it('平成元年3/3 yearly 1989-01-10 起', () => {
    expect(nextOccurrenceDate(mk('1989-03-03', 'yearly'), at('1989-01-10'), 0, strategy)).toBe('1989-03-03');
  });
  it('平成31年3/3 yearly 令和元年6月起 → 次年', () => {
    expect(nextOccurrenceDate(mk('2019-03-03', 'yearly'), at('2019-06-01'), 0, strategy)).toBe('2020-03-03');
  });
});

describe('日本和历改元：yearly anchor 在改元前', () => {
  it('昭和64年1/3 yearly 1989-01-01 起', () => {
    expect(nextOccurrenceDate(mk('1989-01-03', 'yearly'), at('1989-01-01'), 0, strategy)).toBe('1989-01-03');
  });
  it('昭和64年1/3 yearly 1989-01-07 起 → 次年', () => {
    expect(nextOccurrenceDate(mk('1989-01-03', 'yearly'), at('1989-01-07'), 0, strategy)).toBe('1990-01-03');
  });
});

describe('日本和历改元：yearly anchor = 改元当天', () => {
  it('令和元年5/1 yearly 2019-04-01 起', () => {
    expect(nextOccurrenceDate(mk('2019-05-01', 'yearly'), at('2019-04-01'), 0, strategy)).toBe('2019-05-01');
  });
  it('令和元年5/1 yearly 2019-06-01 起 → 次年', () => {
    expect(nextOccurrenceDate(mk('2019-05-01', 'yearly'), at('2019-06-01'), 0, strategy)).toBe('2020-05-01');
  });
});

describe('日本和历改元：yearly 12 月起始元年', () => {
  it('昭和元年12/25 yearly 1927-01-01 起', () => {
    expect(nextOccurrenceDate(mk('1926-12-25', 'yearly'), at('1927-01-01'), 0, strategy)).toBe('1927-12-25');
  });
  it('昭和元年12/25 yearly 1926-12-26 起（今年已过）→ 次年', () => {
    expect(nextOccurrenceDate(mk('1926-12-25', 'yearly'), at('1926-12-26'), 0, strategy)).toBe('1927-12-25');
  });
});

describe('日本和历改元：monthly 改元当月', () => {
  it('平成元年1/8 monthly 1989-01-01 起', () => {
    expect(nextOccurrenceDate(mk('1989-01-08', 'monthly'), at('1989-01-01'), 0, strategy)).toBe('1989-01-08');
  });
  it('平成元年1/8 monthly 1989-02-01 起', () => {
    expect(nextOccurrenceDate(mk('1989-01-08', 'monthly'), at('1989-02-01'), 0, strategy)).toBe('1989-02-08');
  });
  it('2019-05-01 monthly 2019-05-15 起 → 6/1', () => {
    expect(nextOccurrenceDate(mk('2019-05-01', 'monthly'), at('2019-05-15'), 0, strategy)).toBe('2019-06-01');
  });
  it('1/31 monthly 1989-02-01 起收敛 2/28', () => {
    expect(nextOccurrenceDate(mk('1989-01-31', 'monthly'), at('1989-02-01'), 0, strategy)).toBe('1989-02-28');
  });
  it('1/31 monthly 1989-03-01 起回到 3/31', () => {
    expect(nextOccurrenceDate(mk('1989-01-31', 'monthly'), at('1989-03-01'), 0, strategy)).toBe('1989-03-31');
  });
});

describe('日本和历改元：weekly 改元期间', () => {
  it('weekly 1989-01-07(周六) 1989-01-07 起', () => {
    expect(nextOccurrenceDate(mk('1989-01-07', 'weekly'), at('1989-01-07'), 0, strategy)).toBe('1989-01-07');
  });
  it('weekly 1989-01-07(周六) 1989-01-08 起 → 下周六', () => {
    expect(nextOccurrenceDate(mk('1989-01-07', 'weekly'), at('1989-01-08'), 0, strategy)).toBe('1989-01-14');
  });
});

describe('日本和历改元：精确时间 + 改元', () => {
  it('5/1 18:00 yearly 2019-05-01 17:00 起（当天未到）', () => {
    expect(nextOccurrenceDate(mk('2019-05-01', 'yearly', '18:00'), at('2019-05-01', 17, 0), 0, strategy)).toBe('2019-05-01');
  });
  it('5/1 18:00 yearly 2019-05-01 19:00 起（当天已过）→ 次年', () => {
    expect(nextOccurrenceDate(mk('2019-05-01', 'yearly', '18:00'), at('2019-05-01', 19, 0), 0, strategy)).toBe('2020-05-01');
  });
});
