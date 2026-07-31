/* Aevum 核心逻辑冒烟测试（纯 Intl / 时间引擎，无 DOM） */
import {
  formatEventDate,
  keysFromGregorian,
  gregorianFromKeys,
  yearOptions,
  monthOptions,
  dayOptions,
  type CalendarId,
} from 'D:/dev/aevum/src/utils/calendar.js';
import { computeDiff, logicalDaySerial, parseBoundary, nextOccurrenceDate, effectiveEvent } from 'D:/dev/aevum/src/utils/time-calc.js';
import type { AevumEvent, Recurrence } from 'D:/dev/aevum/src/types.js';

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
// 腊八 2026-01-26 = 乙巳年腊月初八（relatedYear 2025：该农历年始于 2025，双纪年确保无歧义）
check('2026-01-26 腊八', formatEventDate('2026-01-26', 'chinese', 'zh-CN'), '2025年 乙巳年 腊月初八');

console.log('== 1.5 非公历纪元（era）本地化（规避 Android Chrome 裁减 ICU 的 era 错误）==');
// 纪元名必须用权威映射，不依赖 Intl 的 era 字段（Android 上会退化成 “BC” 且未中文本地化）
check('islamic 中文纪元', formatEventDate('2026-07-31', 'islamic', 'zh-CN'), '伊斯兰历1448年2月17日');
check('islamic 英文纪元', formatEventDate('2026-07-31', 'islamic', 'en-US').endsWith('AH'), true);
check('hebrew 中文纪元', formatEventDate('2026-07-31', 'hebrew', 'zh-CN').startsWith('希伯来历'), true);
check('persian 中文纪元', formatEventDate('2026-07-31', 'persian', 'zh-CN').startsWith('波斯历'), true);
check('buddhist 中文纪元', formatEventDate('2026-07-31', 'buddhist', 'zh-CN').startsWith('佛历'), true);
// 年份键稳定且 locale 无关：历法id|年（不受 Android era bug 影响）
check('islamic 年份键', keysFromGregorian(new Date(2026, 6, 31), 'islamic').yearKey, 'islamic|1448');

console.log('== 2. 历法键 ↔ 公历 往返 ==');
const cals: CalendarId[] = ['gregory', 'chinese', 'islamic', 'hebrew', 'persian', 'buddhist', 'japanese'];
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
// now = 2026-07-31 01:00，界限 02:00 → 逻辑日 = 07-30
const now1 = new Date(2026, 6, 31, 1, 0).getTime();
const t730 = new Date(2026, 6, 30).getTime();
check('界限02:00 逻辑日=昨天', logicalDaySerial(now1, parseBoundary('02:00')), logicalDaySerial(t730, 0));
// now = 2026-07-31 19:00，界限 18:00 → 逻辑日 = 08-01
const now2 = new Date(2026, 6, 31, 19, 0).getTime();
const t801 = new Date(2026, 7, 1).getTime();
check('界限18:00 逻辑日=明天', logicalDaySerial(now2, parseBoundary('18:00')), logicalDaySerial(t801, 0));
// 默认 00:00 不受影响
const t731 = new Date(2026, 6, 31).getTime();
check('界限00:00 逻辑日=今天', logicalDaySerial(now2, parseBoundary('00:00')), logicalDaySerial(t731, 0));

console.log('== 5. 多粒度差值 ==');
function ev(date: string, time: string | undefined, granularity: AevumEvent['granularity']): AevumEvent {
  return { id: 't', name: 't', date, time, calendar: 'gregory', granularity, tags: [], pinned: false, createdAt: 0 };
}
function rev(date: string, time: string | undefined, granularity: AevumEvent['granularity'], recurrence: Recurrence): AevumEvent {
  return { ...ev(date, time, granularity), recurrence };
}
// 仅日期：now 07-31 12:00 → 08-15 差 15 天
const d1 = computeDiff(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('未来15天', [d1.status, d1.segments[0].value], ['future', 15]);
// 今天
const d2 = computeDiff(ev('2026-07-31', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('今天', d2.status, 'today');
// 过去
const d3 = computeDiff(ev('2026-07-01', undefined, 'day'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'day');
check('过去30天', [d3.status, d3.segments[0].value], ['past', 30]);
// 精确时间 dhms：now 12:00:00 → 明天 14:30:00 = 1天2时30分0秒
const d4 = computeDiff(ev('2026-08-01', '14:30', 'dhms'), new Date(2026, 6, 31, 12, 0, 0).getTime(), 0, 'dhms');
check('dhms 1天2时30分', d4.segments.map((s) => `${s.unit}:${s.value}`), ['day:1', 'hour:2', 'minute:30', 'second:0']);
// ymd：2026-01-15 → 2028-03-20 = 2年2月5天
const d5 = computeDiff(ev('2028-03-20', undefined, 'ymd'), new Date(2026, 0, 15, 12, 0).getTime(), 0, 'ymd');
check('ymd 2年2月5天', d5.segments.map((s) => `${s.unit}:${s.value}`), ['year:2', 'month:2', 'day:5']);
// wd：30天 = 4周2天
const d6 = computeDiff(ev('2026-08-30', undefined, 'wd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'wd');
check('wd 4周2天', d6.segments.map((s) => `${s.unit}:${s.value}`), ['week:4', 'day:2']);
// ywd：400天 → 1年 + 35天 → 1年5周0天
const d7 = computeDiff(ev('2027-09-04', undefined, 'ywd'), new Date(2026, 6, 31, 12, 0).getTime(), 0, 'ywd');
check('ywd 1年5周', d7.segments.map((s) => `${s.unit}:${s.value}`), ['year:1', 'week:5', 'day:0']);

console.log('== 6. 循环下一次发生 ==');
// 每周：锚点周一(2026-07-13)，now 周五(2026-07-31 12:00) → 下周一 2026-08-03
check('weekly 下周一', nextOccurrenceDate(rev('2026-07-13', undefined, 'day', 'weekly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2026-08-03');
// 每月：锚点 15 日，now 07-31 → 下月 08-15
check('monthly 下月同日', nextOccurrenceDate(rev('2026-07-15', undefined, 'day', 'monthly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2026-08-15');
// 每月：锚点 31 日，now 02-15（2 月无 31 日）→ 收敛到月末 02-28
check('monthly 月末收敛', nextOccurrenceDate(rev('2026-01-31', undefined, 'day', 'monthly'), new Date(2026, 1, 15, 12, 0).getTime(), 0), '2026-02-28');
// 每年：锚点 1990-06-15，now 2026-07-31 → 2027-06-15
check('yearly 次年同月日', nextOccurrenceDate(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31, 12, 0).getTime(), 0), '2027-06-15');
// 不循环：原样返回
check('none 原样', nextOccurrenceDate(ev('2026-08-15', undefined, 'day'), new Date(2026, 6, 31).getTime(), 0), '2026-08-15');
// 精确时间每周：周一 09:00，now 周一 10:00 → 跳过到下周
check('weekly 精确时间已过', nextOccurrenceDate(rev('2026-07-13', '09:00', 'dhms', 'weekly'), new Date(2026, 6, 13, 10, 0).getTime(), 0), '2026-07-20');
// 生效事件用于倒数：yearly 生日滚动到下一次
const effBirth = effectiveEvent(rev('1990-06-15', undefined, 'day', 'yearly'), new Date(2026, 6, 31).getTime(), 0);
check('yearly 生效日期', effBirth.date, '2027-06-15');
const effDiff = computeDiff(effBirth, new Date(2026, 6, 31).getTime(), 0, 'day');
check('yearly 倒数为未来', [effDiff.status, effDiff.segments[0].value > 0], ['future', true]);

console.log('== 7. 全局标签库：迁移 / 解析 ==');
// 测试用垫片（仅本脚本，不影响应用）
if (typeof (globalThis as any).localStorage === 'undefined') {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = { language: 'zh-CN', userAgent: 'node' };
}
const tagsMod = await import('D:/dev/aevum/src/store/tags.js');
const baseEvent = (tags: string[]): AevumEvent => ({
  id: 'x', name: 'x', date: '2026-01-01', calendar: 'gregory', granularity: 'day', tags, pinned: false, createdAt: 0,
});
// 旧格式对象标签 → 归一化为 id，且同名合并
const ids = tagsMod.normalizeEventTags([
  { label: '生活', color: '#123456' },
  { label: '生活', color: '#123456' },
]);
check('旧对象标签合并为单一 id', ids.length, 1);
// 解析事件标签
const resolved = tagsMod.resolveEventTags(baseEvent(ids));
check('解析出 1 个标签', resolved.length, 1);
check('解析标签显示名', tagsMod.tagDisplay(resolved[0]), '生活');
// 不存在的 id 解析为空
check('缺失 id 解析为空', tagsMod.resolveEventTags(baseEvent(['nope'])).length, 0);
// 预设标签（i18n key）经 t() 解析为本地化名
const preset = tagsMod.getTags().find((tg: { id: string }) => tg.id === 'preset_tagLife');
check('预设标签存在', Boolean(preset), true);
check('预设标签显示名=生活', preset ? tagsMod.tagDisplay(preset) : '', '生活');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
