import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTemporalReady } from '../src/utils/temporal.js';
import {
  monthOptions,
  dayOptions,
  gregorianFromKeys,
  yearOptions,
  monthCalendarDays,
  startOfMonthKeys,
  sameCalendarMonth,
  keysFromGregorian,
  formatYearMonthHeader,
  type DateSelection,
} from '../src/utils/calendar.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

const cal = 'japanese' as const;

describe('月初改元：平成31年（5月1日改元令和）', () => {
  it('平成31年月份数量 = 4', () => {
    expect(monthOptions(cal, '平成|31', 'zh-CN').length).toBe(4);
  });
  it('平成31年第1月 = 1', () => {
    expect(monthOptions(cal, '平成|31', 'zh-CN')[0]?.key).toBe('1');
  });
  it('平成31年第4月 = 4', () => {
    expect(monthOptions(cal, '平成|31', 'zh-CN')[3]?.key).toBe('4');
  });
  it('令和元年月份数量 = 8', () => {
    expect(monthOptions(cal, '令和|1', 'zh-CN').length).toBe(8);
  });
  it('令和元年第1月 = 5', () => {
    expect(monthOptions(cal, '令和|1', 'zh-CN')[0]?.key).toBe('5');
  });
  it('令和元年第8月 = 12', () => {
    expect(monthOptions(cal, '令和|1', 'zh-CN')[7]?.key).toBe('12');
  });
});

describe('月中改元：昭和64→平成（1989-01-08）', () => {
  it('昭和64年月份数量 = 1', () => {
    expect(monthOptions(cal, '昭和|64', 'zh-CN').length).toBe(1);
  });
  it('昭和64年第1月 = 1', () => {
    expect(monthOptions(cal, '昭和|64', 'zh-CN')[0]?.key).toBe('1');
  });
  it('平成元年月份数量 = 12', () => {
    expect(monthOptions(cal, '平成|1', 'zh-CN').length).toBe(12);
  });
  it('平成元年第1月 = 1', () => {
    expect(monthOptions(cal, '平成|1', 'zh-CN')[0]?.key).toBe('1');
  });
  it('平成元年最后月 = 12', () => {
    expect(monthOptions(cal, '平成|1', 'zh-CN')[11]?.key).toBe('12');
  });
  it('平成元年包含1月', () => {
    expect(monthOptions(cal, '平成|1', 'zh-CN').some(m => m.key === '1')).toBe(true);
  });
});

describe('月中改元：昭和元年12月（1926-12-25起）', () => {
  it('昭和元年月份数量 = 1', () => {
    expect(monthOptions(cal, '昭和|1', 'zh-CN').length).toBe(1);
  });
  it('昭和元年仅有12月', () => {
    expect(monthOptions(cal, '昭和|1', 'zh-CN')[0]?.key).toBe('12');
  });
  it('大正15年月份数量 = 12', () => {
    expect(monthOptions(cal, '大正|15', 'zh-CN').length).toBe(12);
  });
});

describe('dayOptions：月初改元月份', () => {
  it('平成31年4月日数 = 30', () => {
    expect(dayOptions(cal, '平成|31', '4', 'zh-CN').length).toBe(30);
  });
  it('平成31年4月首日 = 1', () => {
    expect(dayOptions(cal, '平成|31', '4', 'zh-CN')[0]?.key).toBe('1');
  });
  it('平成31年4月末日 = 30', () => {
    expect(dayOptions(cal, '平成|31', '4', 'zh-CN')[29]?.key).toBe('30');
  });
  it('令和元年5月日数 = 31', () => {
    expect(dayOptions(cal, '令和|1', '5', 'zh-CN').length).toBe(31);
  });
  it('令和元年5月首日 = 1', () => {
    expect(dayOptions(cal, '令和|1', '5', 'zh-CN')[0]?.key).toBe('1');
  });
});

describe('dayOptions：月中改元月份', () => {
  it('昭和64年1月日数 = 31', () => {
    expect(dayOptions(cal, '昭和|64', '1', 'zh-CN').length).toBe(31);
  });
  it('昭和64年1月首日 = 1', () => {
    expect(dayOptions(cal, '昭和|64', '1', 'zh-CN')[0]?.key).toBe('1');
  });
  it('昭和64年1月末日 = 31', () => {
    expect(dayOptions(cal, '昭和|64', '1', 'zh-CN')[30]?.key).toBe('31');
  });
  it('大正15年12月日数 = 31', () => {
    expect(dayOptions(cal, '大正|15', '12', 'zh-CN').length).toBe(31);
  });
  it('大正15年12月首日 = 1', () => {
    expect(dayOptions(cal, '大正|15', '12', 'zh-CN')[0]?.key).toBe('1');
  });
  it('大正15年12月末日 = 31', () => {
    expect(dayOptions(cal, '大正|15', '12', 'zh-CN')[30]?.key).toBe('31');
  });
  it('昭和元年12月日数 = 31', () => {
    expect(dayOptions(cal, '昭和|1', '12', 'zh-CN').length).toBe(31);
  });
  it('昭和元年12月首日 = 1', () => {
    expect(dayOptions(cal, '昭和|1', '12', 'zh-CN')[0]?.key).toBe('1');
  });
});

describe('年份选项包含所有改元年', () => {
  it('2019年包含 平成|31 和 令和|1', () => {
    const keys = yearOptions(cal, new Date(2019, 0, 1), 'zh-CN').map(y => y.key);
    expect(keys.includes('平成|31')).toBe(true);
    expect(keys.includes('令和|1')).toBe(true);
  });
  it('1926年包含 大正|15 和 昭和|1', () => {
    const keys = yearOptions(cal, new Date(1926, 0, 1), 'zh-CN').map(y => y.key);
    expect(keys.includes('大正|15')).toBe(true);
    expect(keys.includes('昭和|1')).toBe(true);
  });
  it('1989年包含 昭和|64 和 平成|1', () => {
    const keys = yearOptions(cal, new Date(1989, 0, 1), 'zh-CN').map(y => y.key);
    expect(keys.includes('昭和|64')).toBe(true);
    expect(keys.includes('平成|1')).toBe(true);
  });
});

describe('gregorianFromKeys 往返', () => {
  it('昭和元年12月25日 = 1926-12-25', () => {
    const sel: DateSelection = { yearKey: '昭和|1', monthKey: '12', dayKey: '25' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(1926);
    expect(g?.getMonth()).toBe(11);
    expect(g?.getDate()).toBe(25);
  });
  it('昭和64年1月8日 = 1989-01-08', () => {
    const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '8' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(1989);
    expect(g?.getMonth()).toBe(0);
    expect(g?.getDate()).toBe(8);
  });
  it('令和元年5月1日 = 2019-05-01', () => {
    const sel: DateSelection = { yearKey: '令和|1', monthKey: '5', dayKey: '1' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(2019);
    expect(g?.getMonth()).toBe(4);
    expect(g?.getDate()).toBe(1);
  });
  it('平成31年4月30日 = 2019-04-30', () => {
    const sel: DateSelection = { yearKey: '平成|31', monthKey: '4', dayKey: '30' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(2019);
    expect(g?.getMonth()).toBe(3);
    expect(g?.getDate()).toBe(30);
  });
  it('昭和64年1月1日 = 1989-01-01', () => {
    const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '1' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(1989);
    expect(g?.getMonth()).toBe(0);
    expect(g?.getDate()).toBe(1);
  });
  it('昭和64年1月31日 = 1989-01-31', () => {
    const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '31' };
    const g = gregorianFromKeys(sel, cal);
    expect(g?.getFullYear()).toBe(1989);
    expect(g?.getMonth()).toBe(0);
    expect(g?.getDate()).toBe(31);
  });
});

describe('不存在的日期', () => {
  it('平成31年5月无日期选项', () => {
    expect(dayOptions(cal, '平成|31', '5', 'zh-CN').length).toBe(0);
  });
  it('平成元年1月有31天', () => {
    expect(dayOptions(cal, '平成|1', '1', 'zh-CN').length).toBe(31);
  });
});

describe('monthCalendarDays 网格完整性', () => {
  it('昭和64年1月网格日数 = 31', () => {
    const cells = monthCalendarDays(cal, '昭和|64', '1', 'zh-CN');
    expect(cells.length).toBe(31);
  });
  it('昭和64年1月网格首日 = 1989-01-01', () => {
    const cells = monthCalendarDays(cal, '昭和|64', '1', 'zh-CN');
    expect(cells[0]?.greg.getFullYear()).toBe(1989);
    expect(cells[0]?.greg.getMonth()).toBe(0);
    expect(cells[0]?.greg.getDate()).toBe(1);
  });
  it('昭和64年1月网格末日 = 1989-01-31', () => {
    const cells = monthCalendarDays(cal, '昭和|64', '1', 'zh-CN');
    expect(cells[30]?.greg.getFullYear()).toBe(1989);
    expect(cells[30]?.greg.getMonth()).toBe(0);
    expect(cells[30]?.greg.getDate()).toBe(31);
  });
  it('令和元年5月网格日数 = 31', () => {
    const cells = monthCalendarDays(cal, '令和|1', '5', 'zh-CN');
    expect(cells.length).toBe(31);
  });
  it('令和元年5月网格首日 = 2019-05-01', () => {
    const cells = monthCalendarDays(cal, '令和|1', '5', 'zh-CN');
    expect(cells[0]?.greg.getFullYear()).toBe(2019);
    expect(cells[0]?.greg.getMonth()).toBe(4);
    expect(cells[0]?.greg.getDate()).toBe(1);
  });
});

describe('sameCalendarMonth 与 startOfMonthKeys', () => {
  it('sameCalendarMonth(1/1, 1/8) = true', () => {
    expect(sameCalendarMonth(new Date(1989, 0, 1), new Date(1989, 0, 8), cal)).toBe(true);
  });
  it('sameCalendarMonth(1/31, 2/1) = false', () => {
    expect(sameCalendarMonth(new Date(1989, 0, 31), new Date(1989, 1, 1), cal)).toBe(false);
  });
  it('sameCalendarMonth(4/30, 5/1) = false', () => {
    expect(sameCalendarMonth(new Date(2019, 3, 30), new Date(2019, 4, 1), cal)).toBe(false);
  });
  it('startOfMonthKeys(1/8) yearKey = 昭和|64', () => {
    const k = startOfMonthKeys(new Date(1989, 0, 8), cal);
    expect(k.yearKey).toBe('昭和|64');
  });
  it('startOfMonthKeys(1/8) monthKey = 1', () => {
    const k = startOfMonthKeys(new Date(1989, 0, 8), cal);
    expect(k.monthKey).toBe('1');
  });
  it('keysFromGregorian(1/8) yearKey = 平成|1', () => {
    const k = keysFromGregorian(new Date(1989, 0, 8), cal);
    expect(k.yearKey).toBe('平成|1');
  });
});

describe('元年格式化（中文）', () => {
  it('formatYearMonthHeader 令和元年5月', () => {
    expect(formatYearMonthHeader(cal, '令和|1', '5', 'zh-CN')).toBe('令和元年5月');
  });
  it('formatYearMonthHeader 平成元年1月', () => {
    expect(formatYearMonthHeader(cal, '平成|1', '1', 'zh-CN')).toBe('平成元年1月');
  });
  it('formatYearMonthHeader 昭和64年1月', () => {
    expect(formatYearMonthHeader(cal, '昭和|64', '1', 'zh-CN')).toBe('昭和64年1月');
  });
});
