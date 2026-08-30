import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTemporalReady } from '../src/utils/temporal.js';
import {
  formatEventDate,
  formatWeekday,
  weekdaySuffix,
  formatYearMonthHeader,
  keysFromGregorian,
  gregorianFromKeys,
  yearOptions,
  monthOptions,
  dayOptions,
  monthCalendarDays,
} from '../src/utils/calendar.js';
import type { CalendarId } from '../src/types.js';
import { computeDiff, logicalDaySerial, parseBoundary, nextOccurrenceDate, effectiveEvent } from '../src/utils/time-calc.js';
import type { AevumEvent, Recurrence } from '../src/types.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

function ev(date: string, time: string | undefined, granularity: AevumEvent['granularity']): AevumEvent {
  return { id: 't', name: 't', date, time, calendar: 'gregory', granularity, tags: [], pinned: false, createdAt: 0 };
}
function rev(date: string, time: string | undefined, granularity: AevumEvent['granularity'], recurrence: Recurrence): AevumEvent {
  return { ...ev(date, time, granularity), recurrence };
}

describe('农历汉字 + 公元/干支纪年', () => {
  it('2026-02-17 = 丙午年正月初一', () => {
    expect(formatEventDate('2026-02-17', 'chinese', 'zh-CN')).toBe('2026年 丙午年 正月初一');
  });
  it('2025-01-29 = 乙巳年正月初一', () => {
    expect(formatEventDate('2025-01-29', 'chinese', 'zh-CN')).toBe('2025年 乙巳年 正月初一');
  });
  it('2026-01-26 腊八 = 乙巳年腊月初八', () => {
    expect(formatEventDate('2026-01-26', 'chinese', 'zh-CN')).toBe('2025年 乙巳年 腊月初八');
  });
});

describe('非公历纪元（era）本地化', () => {
  it('islamic-umalqura 中文纪元', () => {
    expect(formatEventDate('2026-07-31', 'islamic-umalqura', 'zh-CN')).toBe('伊斯兰历1448年2月17日');
  });
  it('islamic-umalqura 英文纪元', () => {
    expect(formatEventDate('2026-07-31', 'islamic-umalqura', 'en-US').endsWith('AH')).toBe(true);
  });
  it('hebrew 中文纪元', () => {
    expect(formatEventDate('2026-07-31', 'hebrew', 'zh-CN').startsWith('希伯来历')).toBe(true);
  });
  it('persian 中文纪元', () => {
    expect(formatEventDate('2026-07-31', 'persian', 'zh-CN').startsWith('波斯历')).toBe(true);
  });
  it('buddhist 中文纪元', () => {
    expect(formatEventDate('2026-07-31', 'buddhist', 'zh-CN').startsWith('佛历')).toBe(true);
  });
  it('hebrew 闰年闰亚达月', () => {
    expect(formatEventDate('2027-02-10', 'hebrew', 'zh-CN')).toBe('希伯来历5787年6月3日');
  });
  it('hebrew 闰年亚达月', () => {
    expect(formatEventDate('2027-03-10', 'hebrew', 'zh-CN')).toBe('希伯来历5787年7月1日');
  });
  it('islamic-umalqura 年份键', () => {
    expect(keysFromGregorian(new Date(2026, 6, 31), 'islamic-umalqura').yearKey).toBe('islamic-umalqura|1448');
  });
});

describe('历法键 ↔ 公历 往返', () => {
  const cals: CalendarId[] = ['gregory', 'chinese', 'islamic-umalqura', 'hebrew', 'persian', 'buddhist', 'japanese'];
  for (const cal of cals) {
    it(`${cal} 往返`, () => {
      const src = new Date(2026, 6, 31);
      const keys = keysFromGregorian(src, cal);
      const back = gregorianFromKeys(keys, cal);
      const roundtrip = back ? `${back.getFullYear()}-${back.getMonth()}-${back.getDate()}` : null;
      expect(roundtrip).toBe('2026-6-31');
    });
  }
});

describe('枚举选项', () => {
  it('农历年选项含丙午', () => {
    const years = yearOptions('chinese', new Date(2026, 6, 31), 'zh-CN');
    expect(years.some((o) => o.display.includes('丙午'))).toBe(true);
  });
  it('农历月选项含正月', () => {
    const months = monthOptions('chinese', keysFromGregorian(new Date(2026, 6, 31), 'chinese').yearKey, 'zh-CN');
    expect(months.some((o) => o.display === '正月')).toBe(true);
  });
  it('农历丙午正月首日 = 初一', () => {
    const sel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
    const days = dayOptions('chinese', sel.yearKey, sel.monthKey, 'zh-CN');
    expect(days[0]?.display).toBe('初一');
  });
  it('农历正月天数(29或30)', () => {
    const sel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
    const days = dayOptions('chinese', sel.yearKey, sel.monthKey, 'zh-CN');
    expect([29, 30].includes(days.length)).toBe(true);
  });
  it('公历 2024-02 闰年 29 天', () => {
    const gDays = dayOptions('gregory', '2024', '2', 'zh-CN');
    expect(gDays.length).toBe(29);
  });
});

describe('自定义日界限', () => {
  it('界限02:00 逻辑日=昨天', () => {
    const now1 = new Date(2026, 6, 31, 1, 0).getTime();
    const t730 = new Date(2026, 6, 30).getTime();
    expect(logicalDaySerial(now1, parseBoundary('02:00'))).toBe(logicalDaySerial(t730, 0));
  });
  it('界限18:00 逻辑日=明天', () => {
    const now2 = new Date(2026, 6, 31, 19, 0).getTime();
    const t801 = new Date(2026, 7, 1).getTime();
    expect(logicalDaySerial(now2, parseBoundary('18:00'))).toBe(logicalDaySerial(t801, 0));
  });
  it('界限00:00 逻辑日=今天', () => {
    const now2 = new Date(2026, 6, 31, 19, 0).getTime();
    const t731 = new Date(2026, 6, 31).getTime();
    expect(logicalDaySerial(now2, parseBoundary('00:00'))).toBe(logicalDaySerial(t731, 0));
  });
});

describe('多粒度差值', () => {
  it('未来15天', () => {
    const d1 = computeDiff(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
    expect([d1.status, d1.segments[0].value]).toEqual(['future', 15]);
  });
  it('今天', () => {
    const d2 = computeDiff(ev('2026-07-31', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
    expect(d2.status).toBe('today');
  });
  it('过去30天', () => {
    const d3 = computeDiff(ev('2026-07-01', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
    expect([d3.status, d3.segments[0].value]).toEqual(['past', 30]);
  });
  it('dhms 1天2时30分', () => {
    const d4 = computeDiff(ev('2026-08-01', '14:30', 'dhms'), new Date(2026, 6, 31, 12, 0, 0).getTime(), 0, 'dhms');
    expect(d4.segments.map((s) => `${s.unit}:${s.value}`)).toEqual(['day:1', 'hour:2', 'minute:30', 'second:0']);
  });
  it('ymd 2年2月5天', () => {
    const d5 = computeDiff(ev('2028-03-20', undefined, 'ymd'), new Date(2026, 0, 15, 12, 0).getTime(), 0, 'ymd');
    expect(d5.segments.map((s) => `${s.unit}:${s.value}`)).toEqual(['year:2', 'month:2', 'day:5']);
  });
  it('wd 4周2天', () => {
    const d6 = computeDiff(ev('2026-08-30', undefined, 'wd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'wd');
    expect(d6.segments.map((s) => `${s.unit}:${s.value}`)).toEqual(['week:4', 'day:2']);
  });
  it('ywd 1年5周', () => {
    const d7 = computeDiff(ev('2027-09-04', undefined, 'ywd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'ywd');
    expect(d7.segments.map((s) => `${s.unit}:${s.value}`)).toEqual(['year:1', 'week:5', 'day:0']);
  });
});

describe('循环下一次发生', () => {
  it('weekly 下周一', () => {
    expect(nextOccurrenceDate(rev('2026-07-13', undefined, 'day', 'weekly'), new Date(2026, 6, 31, 12, 0).getTime(), 0)).toBe('2026-08-03');
  });
  it('monthly 下月同日', () => {
    expect(nextOccurrenceDate(rev('2026-07-15', undefined, 'day', 'monthly'), new Date(2026, 6, 31, 12, 0).getTime(), 0)).toBe('2026-08-15');
  });
  it('monthly 月末收敛', () => {
    expect(nextOccurrenceDate(rev('2026-01-31', undefined, 'day', 'monthly'), new Date(2026, 1, 15, 12, 0).getTime(), 0)).toBe('2026-02-28');
  });
  it('yearly 次年同月日', () => {
    expect(nextOccurrenceDate(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31, 12, 0).getTime(), 0)).toBe('2027-06-15');
  });
  it('none 原样', () => {
    expect(nextOccurrenceDate(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31).getTime(), 0)).toBe('2026-08-15');
  });
  it('weekly 精确时间已过', () => {
    expect(nextOccurrenceDate(rev('2026-07-13', '09:00', 'dhms', 'weekly'), new Date(2026, 6, 13, 10, 0).getTime(), 0)).toBe('2026-07-20');
  });
  it('yearly 生效日期', () => {
    const effBirth = effectiveEvent(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31).getTime(), 0);
    expect(effBirth.date).toBe('2027-06-15');
  });
  it('yearly 倒数为未来', () => {
    const effBirth = effectiveEvent(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31).getTime(), 0);
    const effDiff = computeDiff(effBirth, new Date(2026, 6, 31).getTime(), 0, 'day');
    expect([effDiff.status, effDiff.segments[0].value > 0]).toEqual(['future', true]);
  });
});

describe('全局标签库：迁移 / 解析', () => {
  it('旧对象标签合并为单一 id', async () => {
    const tagsMod = await import('../src/store/tags.js');
    const ids = tagsMod.normalizeEventTags([
      { label: '生活', color: '#123456' },
      { label: '生活', color: '#123456' },
    ]);
    expect(ids.length).toBe(1);
  });

  it('解析出 1 个标签', async () => {
    const tagsMod = await import('../src/store/tags.js');
    const ids = tagsMod.normalizeEventTags([{ label: '生活', color: '#123456' }]);
    const baseEvent = (tags: string[]): AevumEvent => ({
      id: 'x', name: 'x', date: '2026-01-01', calendar: 'gregory', granularity: 'day', tags, pinned: false, createdAt: 0,
    });
    const resolved = tagsMod.resolveEventTags(baseEvent(ids));
    expect(resolved.length).toBe(1);
    expect(tagsMod.tagDisplay(resolved[0])).toBe('生活');
  });

  it('缺失 id 解析为空', async () => {
    const tagsMod = await import('../src/store/tags.js');
    const baseEvent = (tags: string[]): AevumEvent => ({
      id: 'x', name: 'x', date: '2026-01-01', calendar: 'gregory', granularity: 'day', tags, pinned: false, createdAt: 0,
    });
    expect(tagsMod.resolveEventTags(baseEvent(['nope'])).length).toBe(0);
  });

  it('预设标签存在且显示名=生活', async () => {
    const tagsMod = await import('../src/store/tags.js');
    const preset = tagsMod.getTags().find((tg: { id: string }) => tg.id === 'preset_tagLife');
    expect(Boolean(preset)).toBe(true);
    expect(preset ? tagsMod.tagDisplay(preset) : '').toBe('生活');
  });
});

describe('日历网格 monthCalendarDays', () => {
  it('公历 2024-02 网格 29 格', () => {
    const feb24 = monthCalendarDays('gregory', '2024', '2', 'zh-CN');
    expect(feb24.length).toBe(29);
  });
  it('公历 2024-02 首日公历对齐', () => {
    const feb24 = monthCalendarDays('gregory', '2024', '2', 'zh-CN');
    expect(`${feb24[0].greg.getFullYear()}-${feb24[0].greg.getMonth()}-${feb24[0].greg.getDate()}`).toBe('2024-1-1');
  });
  it('公历 2024-02 首日星期', () => {
    const feb24 = monthCalendarDays('gregory', '2024', '2', 'zh-CN');
    expect(feb24[0].greg.getDay()).toBe(4);
  });
  it('公历网格 dayKey 升序', () => {
    const feb24 = monthCalendarDays('gregory', '2024', '2', 'zh-CN');
    expect(feb24.map((c) => c.dayKey).join(',')).toBe(Array.from({ length: 29 }, (_, i) => String(i + 1)).join(','));
  });
  it('农历网格与日选项数量一致', () => {
    const lunarSel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
    const lunarGrid = monthCalendarDays('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
    const lunarDays = dayOptions('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
    expect(lunarGrid.length).toBe(lunarDays.length);
  });
  it('农历网格首日显示初一', () => {
    const lunarSel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
    const lunarGrid = monthCalendarDays('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
    expect(lunarGrid[0]?.dayDisplay).toBe('初一');
  });
  it('农历网格公历=往返公历', () => {
    const lunarSel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
    const lunarGrid = monthCalendarDays('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
    const gridGreg = lunarGrid.find((c) => c.dayKey === lunarSel.dayKey);
    const backGreg = gregorianFromKeys({ yearKey: lunarSel.yearKey, monthKey: lunarSel.monthKey, dayKey: lunarSel.dayKey }, 'chinese');
    expect(gridGreg ? `${gridGreg.greg.getFullYear()}-${gridGreg.greg.getMonth()}-${gridGreg.greg.getDate()}` : null)
      .toBe(backGreg ? `${backGreg.getFullYear()}-${backGreg.getMonth()}-${backGreg.getDate()}` : null);
  });
});

describe('日历表头年月格式化（中文）', () => {
  it('公历表头', () => {
    expect(formatYearMonthHeader('gregory', '2026', '8', 'zh-CN')).toBe('2026年8月');
  });
  it('伊斯兰历表头', () => {
    expect(formatYearMonthHeader('islamic-umalqura', 'islamic-umalqura|1448', 'M02', 'zh-CN')).toBe('伊斯兰历1448年2月');
  });
  it('希伯来 闰年 Tishri=1月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5787', 'M01', 'zh-CN')).toBe('希伯来历5787年1月');
  });
  it('希伯来 闰年 Adar I=6月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5787', 'M05L', 'zh-CN')).toBe('希伯来历5787年6月');
  });
  it('希伯来 闰年 Adar II=7月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5787', 'M06', 'zh-CN')).toBe('希伯来历5787年7月');
  });
  it('希伯来 闰年 末月Elul=13月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5787', 'M12', 'zh-CN')).toBe('希伯来历5787年13月');
  });
  it('希伯来 平年 Adar=6月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5786', 'M06', 'zh-CN')).toBe('希伯来历5786年6月');
  });
  it('希伯来 平年 末月Elul=12月', () => {
    expect(formatYearMonthHeader('hebrew', 'hebrew|5786', 'M12', 'zh-CN')).toBe('希伯来历5786年12月');
  });
  it('希伯来 闰年民用序连续1-13', () => {
    const hbCiv = ['M01','M02','M03','M04','M05','M05L','M06','M07','M08','M09','M10','M11','M12']
      .map((mk) => formatYearMonthHeader('hebrew', 'hebrew|5787', mk, 'zh-CN'));
    expect(hbCiv.every((h, i) => h.endsWith(`${i + 1}月`))).toBe(true);
  });
  it('波斯历表头', () => {
    expect(formatYearMonthHeader('persian', 'persian|1405', 'M05', 'zh-CN').startsWith('波斯历1405年')).toBe(true);
  });
  it('佛教历表头', () => {
    expect(formatYearMonthHeader('buddhist', 'buddhist|2569', 'M08', 'zh-CN').startsWith('佛历2569年')).toBe(true);
  });
  it('日本和历表头', () => {
    expect(formatYearMonthHeader('japanese', '令和|8', '8', 'zh-CN')).toBe('令和8年8月');
  });
  it('农历表头含干支与月名', () => {
    const cnHeader = formatYearMonthHeader('chinese', '2026|丙午', '正月', 'zh-CN');
    expect(cnHeader.includes('丙午') && cnHeader.includes('正月')).toBe(true);
  });
  it('英文表头含 August', () => {
    expect(formatYearMonthHeader('gregory', '2026', '8', 'en-US').includes('August')).toBe(true);
  });
});

describe('日期后的星期名（本地化）', () => {
  it('2024-01-01 中文星期一', () => {
    expect(formatWeekday('2024-01-01', 'zh-CN')).toBe('星期一');
  });
  it('2024-01-01 英文 Monday', () => {
    expect(formatWeekday('2024-01-01', 'en-US')).toBe('Monday');
  });
  it('2024-01-07 中文星期日', () => {
    expect(formatWeekday('2024-01-07', 'zh-CN')).toBe('星期日');
  });
  it('2024-01-07 英文 Sunday', () => {
    expect(formatWeekday('2024-01-07', 'en-US')).toBe('Sunday');
  });
  it('非法日期返回空串', () => {
    expect(formatWeekday('not-a-date', 'zh-CN')).toBe('');
  });
  it('2024-01-04 中文短周四', () => {
    expect(formatWeekday('2024-01-04', 'zh-CN', 'short')).toBe('周四');
  });
  it('2024-01-04 英文短 Thu', () => {
    expect(formatWeekday('2024-01-04', 'en-US', 'short')).toBe('Thu');
  });
  it('weekdaySuffix off 返回空串', () => {
    expect(weekdaySuffix('2024-01-04', 'zh-CN', 'off')).toBe('');
  });
  it('weekdaySuffix short 返回周四', () => {
    expect(weekdaySuffix('2024-01-04', 'zh-CN', 'short')).toBe('周四');
  });
  it('weekdaySuffix long 返回星期四', () => {
    expect(weekdaySuffix('2024-01-04', 'zh-CN', 'long')).toBe('星期四');
  });
});