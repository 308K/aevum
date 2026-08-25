/**
 * Temporal 迁移冒烟测试 —— 用 Deno 运行（Deno 原生支持 Temporal）
 *
 * 运行：deno run --no-prompt --allow-read scripts/smoke-temporal.ts
 *
 * 验证 Temporal 迁移后的历法转换、时间计算等核心逻辑是否正确。
 * 本脚本直接导入 src/utils/calendar.ts 和 src/utils/time-calc.ts，
 * 它们通过 src/utils/temporal.ts 桥接模块使用 Temporal（原生或 polyfill）。
 *
 * 注意：Deno 原生 Temporal 不支持 'islamic' 标识符，
 * 需映射为 'islamic-umalqura'（已在 calendar.ts 中处理）。
 */

// 导入 polyfill（在 Deno 中会使用 globalThis.Temporal 如果已存在）
// 在 Deno 中 native Temporal 已存在，polyfill 不会覆盖它
import '@js-temporal/polyfill';
import { ensureTemporalReady } from '../src/utils/temporal.ts';
await ensureTemporalReady();

import {
  formatEventDate,
  formatYearMonthHeader,
  keysFromGregorian,
  gregorianFromKeys,
  yearOptions,
  monthOptions,
  dayOptions,
  monthCalendarDays,
  type CalendarId,
} from '../src/utils/calendar.ts';
import { computeDiff, logicalDaySerial, parseBoundary, nextOccurrenceDate, effectiveEvent } from '../src/utils/time-calc.ts';
import type { AevumEvent, Recurrence } from '../src/types.ts';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       actual:   ${JSON.stringify(actual)}\n       expected: ${JSON.stringify(expected)}`); }
}

console.log('== 1. 农历汉字 + 公元/干支纪年 ==');
// 2026-02-17 = 丙午年正月初一
check('2026-02-17 农历', formatEventDate('2026-02-17', 'chinese', 'zh-CN'), '2026年 丙午年 正月初一');
// 2025-01-29 = 乙巳年正月初一
check('2025-01-29 农历', formatEventDate('2025-01-29', 'chinese', 'zh-CN'), '2025年 乙巳年 正月初一');
// 腊八 2026-01-26 = 乙巳年腊月初八（relatedYear 2025）
check('2026-01-26 腊八', formatEventDate('2026-01-26', 'chinese', 'zh-CN'), '2025年 乙巳年 腊月初八');

console.log('== 1.5 非公历纪元（era）本地化 ==');
check('islamic-umalqura 中文纪元', formatEventDate('2026-07-31', 'islamic-umalqura', 'zh-CN'), '伊斯兰历1448年2月17日');
check('islamic-umalqura 英文纪元', formatEventDate('2026-07-31', 'islamic-umalqura', 'en-US').endsWith('AH'), true);
check('hebrew 中文纪元', formatEventDate('2026-07-31', 'hebrew', 'zh-CN').startsWith('希伯来历'), true);
check('persian 中文纪元', formatEventDate('2026-07-31', 'persian', 'zh-CN').startsWith('波斯历'), true);
check('buddhist 中文纪元', formatEventDate('2026-07-31', 'buddhist', 'zh-CN').startsWith('佛历'), true);
// 新增历法纪元
check('roc 中文纪元', formatEventDate('2026-07-31', 'roc', 'zh-CN').startsWith('民国'), true);
check('ethiopic 中文纪元', formatEventDate('2026-07-31', 'ethiopic', 'zh-CN').startsWith('埃塞俄比亚历'), true);
check('coptic 中文纪元', formatEventDate('2026-07-31', 'coptic', 'zh-CN').startsWith('科普特历'), true);
check('juche 中文纪元', formatEventDate('2026-07-31', 'juche', 'zh-CN'), '主体115年7月31日');
check('islamic-umalqura 年份键', keysFromGregorian(new Date(2026, 6, 31), 'islamic-umalqura').yearKey, 'islamic-umalqura|1448');
check('islamic-civil 年份键', keysFromGregorian(new Date(2026, 6, 31), 'islamic-civil').yearKey.startsWith('islamic-civil|'), true);
check('islamic-tbla 年份键', keysFromGregorian(new Date(2026, 6, 31), 'islamic-tbla').yearKey.startsWith('islamic-tbla|'), true);
check('islamic-rgsa 年份键', keysFromGregorian(new Date(2026, 6, 31), 'islamic-rgsa').yearKey.startsWith('islamic-rgsa|'), true);
check('roc 年份键', keysFromGregorian(new Date(2026, 6, 31), 'roc').yearKey.startsWith('roc|'), true);
check('indian 年份键', keysFromGregorian(new Date(2026, 6, 31), 'indian').yearKey.startsWith('indian|'), true);
check('ethiopic 年份键', keysFromGregorian(new Date(2026, 6, 31), 'ethiopic').yearKey.startsWith('ethiopic|'), true);
check('coptic 年份键', keysFromGregorian(new Date(2026, 6, 31), 'coptic').yearKey.startsWith('coptic|'), true);
check('juche 年份键', keysFromGregorian(new Date(2026, 6, 31), 'juche').yearKey, 'juche|115');
check('dangi 年份键', keysFromGregorian(new Date(2026, 6, 31), 'dangi').yearKey.startsWith('dangi|'), true);
// 希伯来历正文
check('hebrew 闰年闰亚达月', formatEventDate('2027-02-10', 'hebrew', 'zh-CN'), '希伯来历5787年6月3日');
check('hebrew 闰年亚达月', formatEventDate('2027-03-10', 'hebrew', 'zh-CN'), '希伯来历5787年7月1日');

console.log('== 2. 历法键 ↔ 公历 往返 ==');
const cals: CalendarId[] = ['gregory', 'chinese', 'islamic-umalqura', 'islamic-civil', 'islamic-tbla', 'islamic-rgsa', 'hebrew', 'persian', 'buddhist', 'japanese', 'roc', 'indian', 'ethiopic', 'ethiopic-amete-alem', 'coptic', 'dangi', 'juche'];
for (const cal of cals) {
  const src = new Date(2026, 6, 31); // 2026-07-31
  const keys = keysFromGregorian(src, cal);
  const back = gregorianFromKeys(keys, cal);
  const roundtrip = back ? `${back.getFullYear()}-${back.getMonth()}-${back.getDate()}` : null;
  check(`${cal} 往返`, roundtrip, '2026-6-31');
}

console.log('== 3. 枚举选项 ==');
const years = yearOptions('chinese', new Date(2026, 6, 31), 'zh-CN');
check('农历年选项含丙午', years.some((o) => o.display.includes('丙午')), true);
const months = monthOptions('chinese', keysFromGregorian(new Date(2026, 6, 31), 'chinese').yearKey, 'zh-CN');
check('农历月选项含正月', months.some((o) => o.display === '正月'), true);
const sel = keysFromGregorian(new Date(2026, 1, 17), 'chinese'); // 正月初一
const days = dayOptions('chinese', sel.yearKey, sel.monthKey, 'zh-CN');
check('农历丙午正月首日', days[0]?.display, '初一');
check('农历正月天数(29或30)', [29, 30].includes(days.length), true);
const gDays = dayOptions('gregory', '2024', '2', 'zh-CN');
check('公历 2024-02 闰年 29 天', gDays.length, 29);

console.log('== 4. 自定义日界限 ==');
const now1 = new Date(2026, 6, 31, 1, 0).getTime();
const t730 = new Date(2026, 6, 30).getTime();
check('界限02:00 逻辑日=昨天', logicalDaySerial(now1, parseBoundary('02:00')), logicalDaySerial(t730, 0));
const now2 = new Date(2026, 6, 31, 19, 0).getTime();
const t801 = new Date(2026, 7, 1).getTime();
check('界限18:00 逻辑日=明天', logicalDaySerial(now2, parseBoundary('18:00')), logicalDaySerial(t801, 0));
const t731 = new Date(2026, 6, 31).getTime();
check('界限00:00 逻辑日=今天', logicalDaySerial(now2, parseBoundary('00:00')), logicalDaySerial(t731, 0));

console.log('== 5. 多粒度差值 ==');
function ev(date: string, time: string | undefined, granularity: AevumEvent['granularity']): AevumEvent {
  return { id: 't', name: 't', date, time, calendar: 'gregory', granularity, tags: [], pinned: false, createdAt: 0 };
}
function rev(date: string, time: string | undefined, granularity: AevumEvent['granularity'], recurrence: Recurrence): AevumEvent {
  return { ...ev(date, time, granularity), recurrence };
}
const d1 = computeDiff(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('未来15天', [d1.status, d1.segments[0].value], ['future', 15]);
const d2 = computeDiff(ev('2026-07-31', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('今天', d2.status, 'today');
const d3 = computeDiff(ev('2026-07-01', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('过去30天', [d3.status, d3.segments[0].value], ['past', 30]);
const d4 = computeDiff(ev('2026-08-01', '14:30', 'dhms'), new Date(2026, 6, 31, 12, 0, 0).getTime(), 0, 'dhms');
check('dhms 1天2时30分', d4.segments.map((s) => `${s.unit}:${s.value}`), ['day:1', 'hour:2', 'minute:30', 'second:0']);
const d5 = computeDiff(ev('2028-03-20', undefined, 'ymd'), new Date(2026, 0, 15, 12, 0).getTime(), 0, 'ymd');
check('ymd 2年2月5天', d5.segments.map((s) => `${s.unit}:${s.value}`), ['year:2', 'month:2', 'day:5']);
const d6 = computeDiff(ev('2026-08-30', undefined, 'wd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'wd');
check('wd 4周2天', d6.segments.map((s) => `${s.unit}:${s.value}`), ['week:4', 'day:2']);
const d7 = computeDiff(ev('2027-09-04', undefined, 'ywd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'ywd');
check('ywd 1年5周', d7.segments.map((s) => `${s.unit}:${s.value}`), ['year:1', 'week:5', 'day:0']);

console.log('== 6. 循环下一次发生 ==');
check('weekly 下周一', nextOccurrenceDate(rev('2026-07-13', undefined, 'day', 'weekly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2026-08-03');
check('monthly 下月同日', nextOccurrenceDate(rev('2026-07-15', undefined, 'day', 'monthly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2026-08-15');
check('monthly 月末收敛', nextOccurrenceDate(rev('2026-01-31', undefined, 'day', 'monthly'), new Date(2026, 1, 15, 12, 0).getTime(), 0), '2026-02-28');
check('yearly 次年同月日', nextOccurrenceDate(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2027-06-15');
check('none 原样', nextOccurrenceDate(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31).getTime(), 0), '2026-08-15');
check('weekly 精确时间已过', nextOccurrenceDate(rev('2026-07-13', '09:00', 'dhms', 'weekly'), new Date(2026, 6, 13, 10, 0).getTime(), 0), '2026-07-20');
const effBirth = effectiveEvent(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31).getTime(), 0);
check('yearly 生效日期', effBirth.date, '2027-06-15');
const effDiff = computeDiff(effBirth, new Date(2026, 6, 31).getTime(), 0, 'day');
check('yearly 倒数为未来', [effDiff.status, effDiff.segments[0].value > 0], ['future', true]);

console.log('== 7. 日历网格 monthCalendarDays ==');
const feb24 = monthCalendarDays('gregory', '2024', '2', 'zh-CN');
check('公历 2024-02 网格 29 格', feb24.length, 29);
check('公历 2024-02 首日公历对齐', `${feb24[0].greg.getFullYear()}-${feb24[0].greg.getMonth()}-${feb24[0].greg.getDate()}`, '2024-1-1');
check('公历 2024-02 首日星期', feb24[0].greg.getDay(), 4);
check('公历网格 dayKey 升序', feb24.map((c) => c.dayKey).join(','), Array.from({ length: 29 }, (_, i) => String(i + 1)).join(','));
const lunarSel = keysFromGregorian(new Date(2026, 1, 17), 'chinese');
const lunarGrid = monthCalendarDays('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
const lunarDays = dayOptions('chinese', lunarSel.yearKey, lunarSel.monthKey, 'zh-CN');
check('农历网格与日选项数量一致', lunarGrid.length, lunarDays.length);
check('农历网格首日显示初一', lunarGrid[0]?.dayDisplay, '初一');
const gridGreg = lunarGrid.find((c) => c.dayKey === lunarSel.dayKey);
const backGreg = gregorianFromKeys({ yearKey: lunarSel.yearKey, monthKey: lunarSel.monthKey, dayKey: lunarSel.dayKey }, 'chinese');
check('农历网格公历=往返公历', gridGreg ? `${gridGreg.greg.getFullYear()}-${gridGreg.greg.getMonth()}-${gridGreg.greg.getDate()}` : null,
  backGreg ? `${backGreg.getFullYear()}-${backGreg.getMonth()}-${backGreg.getDate()}` : null);

console.log('== 8. 日历表头年月格式化 ==');
check('公历表头', formatYearMonthHeader('gregory', '2026', '8', 'zh-CN'), '2026年8月');
check('伊斯兰历表头', formatYearMonthHeader('islamic-umalqura', 'islamic-umalqura|1448', '2', 'zh-CN'), '伊斯兰历1448年2月');
check('主体历表头', formatYearMonthHeader('juche', 'juche|115', '7', 'zh-CN'), '主体115年7月');
check('希伯来 闰年 Tishri=1月', formatYearMonthHeader('hebrew', 'hebrew|5787', 'Tishri', 'zh-CN'), '希伯来历5787年1月');
check('希伯来 闰年 Adar I=6月', formatYearMonthHeader('hebrew', 'hebrew|5787', 'Adar I', 'zh-CN'), '希伯来历5787年6月');
check('希伯来 闰年 Adar II=7月', formatYearMonthHeader('hebrew', 'hebrew|5787', 'Adar II', 'zh-CN'), '希伯来历5787年7月');
check('希伯来 闰年 末月Elul=13月', formatYearMonthHeader('hebrew', 'hebrew|5787', 'Elul', 'zh-CN'), '希伯来历5787年13月');
check('希伯来 平年 Adar=6月', formatYearMonthHeader('hebrew', 'hebrew|5786', 'Adar', 'zh-CN'), '希伯来历5786年6月');
check('希伯来 平年 末月Elul=12月', formatYearMonthHeader('hebrew', 'hebrew|5786', 'Elul', 'zh-CN'), '希伯来历5786年12月');
const hbCiv = ['Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar I', 'Adar II', 'Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul']
  .map((mk) => formatYearMonthHeader('hebrew', 'hebrew|5787', mk, 'zh-CN'));
check('希伯来 闰年民用序连续1-13', hbCiv.every((h, i) => h.endsWith(`${i + 1}月`)), true);
check('波斯历表头', formatYearMonthHeader('persian', 'persian|1405', '5', 'zh-CN').startsWith('波斯历1405年'), true);
check('佛教历表头', formatYearMonthHeader('buddhist', 'buddhist|2569', '8', 'zh-CN').startsWith('佛历2569年'), true);
check('日本和历表头', formatYearMonthHeader('japanese', '令和|8', '8', 'zh-CN'), '令和8年8月');
const cnHeader = formatYearMonthHeader('chinese', '2026|丙午', '正月', 'zh-CN');
check('农历表头含干支与月名', cnHeader.includes('丙午') && cnHeader.includes('正月'), true);
check('英文表头含 August', formatYearMonthHeader('gregory', '2026', '8', 'en-US').includes('August'), true);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
Deno.exit(fail ? 1 : 0);
