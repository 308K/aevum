/**
 * 冒烟测试：日本和历改元边界
 * 覆盖月初改元（平成31→令和，5月1日）和月中改元（昭和64→平成，1月8日；大正15→昭和，12月25日）
 *
 * 月份归属策略（React Aria style）：一个月属于哪个年号年，由该月第一天决定。
 * 月中改元时，整个公历月仍归属于月首所在的年号年。
 */
import { Temporal, ensureTemporalReady } from '../src/utils/temporal.js';
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
  type CalendarId,
  type DateSelection,
} from '../src/utils/calendar.js';

await ensureTemporalReady();

const cal: CalendarId = 'japanese';
let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}

console.log('== 1. 月初改元：平成31年（5月1日改元令和） ==');
{
  const months = monthOptions(cal, '平成|31', 'zh-CN');
  check('平成31年月份数量 = 4', months.length === 4);
  check('平成31年第1月 = 1', months[0]?.key === '1');
  check('平成31年第4月 = 4', months[3]?.key === '4');
}
{
  const months = monthOptions(cal, '令和|1', 'zh-CN');
  check('令和元年月份数量 = 8', months.length === 8);
  check('令和元年第1月 = 5', months[0]?.key === '5');
  check('令和元年第8月 = 12', months[7]?.key === '12');
}

console.log('== 2. 月中改元：昭和64→平成（1989-01-08） ==');
{
  // 昭和64年：1月1日属昭和64 → 1月归入；2月1日属平成1 → break
  const months = monthOptions(cal, '昭和|64', 'zh-CN');
  check('昭和64年月份数量 = 1', months.length === 1);
  check('昭和64年第1月 = 1', months[0]?.key === '1');
}
{
  // 平成元年：1月月首属昭和64，但 yearStart(1/8) 在1月内且属平成 → 1月也归入
  // 2-12月月首均属平成1 → 全部归入
  const months = monthOptions(cal, '平成|1', 'zh-CN');
  check('平成元年月份数量 = 12', months.length === 12);
  check('平成元年第1月 = 1', months[0]?.key === '1');
  check('平成元年最后月 = 12', months[11]?.key === '12');
  // 两个年号年都有1月（允许重复月份）
  check('平成元年包含1月', months.some(m => m.key === '1'));
}

console.log('== 3. 月中改元：昭和元年12月（1926-12-25起） ==');
{
  // 昭和元年从12月25日开始，12月1日不属昭和，12月首属大正15
  // 所以昭和元年没有任何月份的月首属昭和元年 → 但 resolveYearStart 会找到12月25日
  // monthOptions 从12月25日开始，12月25日的yearKey=昭和|1 ✓，monthKey=12
  // 但下一个月（1927-01-01）的yearKey=昭和|2 ≠ 昭和|1 → break
  // 所以昭和元年只有12月（1个月）
  const months = monthOptions(cal, '昭和|1', 'zh-CN');
  check('昭和元年月份数量 = 1', months.length === 1);
  check('昭和元年仅有12月', months[0]?.key === '12');
}
{
  // 大正15年从1月1日开始，12月1日仍属大正15，整个12月归大正15年
  const months = monthOptions(cal, '大正|15', 'zh-CN');
  check('大正15年月份数量 = 12', months.length === 12);
}

console.log('== 4. dayOptions：月初改元月份 ==');
{
  // 平成31年4月：完整4月（1-30日）
  const days = dayOptions(cal, '平成|31', '4', 'zh-CN');
  check('平成31年4月日数 = 30', days.length === 30);
  check('平成31年4月首日 = 1', days[0]?.key === '1');
  check('平成31年4月末日 = 30', days[29]?.key === '30');
}
{
  // 令和元年5月：完整5月（1-31日）
  const days = dayOptions(cal, '令和|1', '5', 'zh-CN');
  check('令和元年5月日数 = 31', days.length === 31);
  check('令和元年5月首日 = 1', days[0]?.key === '1');
}

console.log('== 5. dayOptions：月中改元月份 ==');
{
  // 昭和64年1月：完整1月（1-31日），月首属昭和64
  const days = dayOptions(cal, '昭和|64', '1', 'zh-CN');
  check('昭和64年1月日数 = 31', days.length === 31);
  check('昭和64年1月首日 = 1', days[0]?.key === '1');
  check('昭和64年1月末日 = 31', days[30]?.key === '31');
}
{
  // 大正15年12月：完整12月（1-31日），月首属大正15
  const days = dayOptions(cal, '大正|15', '12', 'zh-CN');
  check('大正15年12月日数 = 31', days.length === 31);
  check('大正15年12月首日 = 1', days[0]?.key === '1');
  check('大正15年12月末日 = 31', days[30]?.key === '31');
}
{
  // 昭和元年12月：从12月25日开始，但公历月首（12月1日）属大正15
  // resolveYearStart 找到12月25日，monthOptions 记录12月 firstSeen=12月25日
  // dayOptions 找到 monthStart=12月25日，对齐到公历月首=12月1日
  // 但12月1日的 yearKey=大正|15 ≠ 昭和|1 → monthOptions 的 break 逻辑
  // 实际上 monthOptions 从 yearStart(12月25日) 开始，k.yearKey=昭和|1 ✓
  // 然后 pd.add({months:1}) = 1927-01-01，yearKey=昭和|2 ≠ 昭和|1 → break
  // 所以昭和元年只有12月，dayOptions 从 monthStart(12月25日) 对齐到公历月首(12月1日)
  // daysInMonth=31，返回12月1-31日
  const days = dayOptions(cal, '昭和|1', '12', 'zh-CN');
  check('昭和元年12月日数 = 31', days.length === 31);
  check('昭和元年12月首日 = 1', days[0]?.key === '1');
}

console.log('== 6. 年份选项包含所有改元年 ==');
{
  const years = yearOptions(cal, new Date(2019, 0, 1), 'zh-CN');
  const keys = years.map(y => y.key);
  check('包含 平成|31', keys.includes('平成|31'));
  check('包含 令和|1', keys.includes('令和|1'));
}
{
  const years = yearOptions(cal, new Date(1926, 0, 1), 'zh-CN');
  const keys = years.map(y => y.key);
  check('包含 大正|15', keys.includes('大正|15'));
  check('包含 昭和|1', keys.includes('昭和|1'));
}
{
  const years = yearOptions(cal, new Date(1989, 0, 1), 'zh-CN');
  const keys = years.map(y => y.key);
  check('包含 昭和|64', keys.includes('昭和|64'));
  check('包含 平成|1', keys.includes('平成|1'));
}

console.log('== 7. gregorianFromKeys 往返 ==');
{
  // 昭和元年12月25日 = 1926-12-25
  const sel: DateSelection = { yearKey: '昭和|1', monthKey: '12', dayKey: '25' };
  const g = gregorianFromKeys(sel, cal);
  check('昭和元年12月25日 = 1926-12-25', g?.getFullYear() === 1926 && g?.getMonth() === 11 && g?.getDate() === 25);
}
{
  // 昭和64年1月8日 = 1989-01-08（用昭和64年1月）
  const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '8' };
  const g = gregorianFromKeys(sel, cal);
  check('昭和64年1月8日 = 1989-01-08', g?.getFullYear() === 1989 && g?.getMonth() === 0 && g?.getDate() === 8);
}
{
  // 令和元年5月1日 = 2019-05-01
  const sel: DateSelection = { yearKey: '令和|1', monthKey: '5', dayKey: '1' };
  const g = gregorianFromKeys(sel, cal);
  check('令和元年5月1日 = 2019-05-01', g?.getFullYear() === 2019 && g?.getMonth() === 4 && g?.getDate() === 1);
}
{
  // 平成31年4月30日 = 2019-04-30
  const sel: DateSelection = { yearKey: '平成|31', monthKey: '4', dayKey: '30' };
  const g = gregorianFromKeys(sel, cal);
  check('平成31年4月30日 = 2019-04-30', g?.getFullYear() === 2019 && g?.getMonth() === 3 && g?.getDate() === 30);
}
{
  // 昭和64年1月1日 = 1989-01-01
  const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '1' };
  const g = gregorianFromKeys(sel, cal);
  check('昭和64年1月1日 = 1989-01-01', g?.getFullYear() === 1989 && g?.getMonth() === 0 && g?.getDate() === 1);
}
{
  // 昭和64年1月31日 = 1989-01-31（改元前的最后一天）
  const sel: DateSelection = { yearKey: '昭和|64', monthKey: '1', dayKey: '31' };
  const g = gregorianFromKeys(sel, cal);
  check('昭和64年1月31日 = 1989-01-31', g?.getFullYear() === 1989 && g?.getMonth() === 0 && g?.getDate() === 31);
}

console.log('== 8. 不存在的日期 ==');
{
  // 平成31年5月不存在（5月月首属令和）
  const days = dayOptions(cal, '平成|31', '5', 'zh-CN');
  check('平成31年5月无日期选项', days.length === 0);
}
{
  // 平成元年1月存在（yearStart 1/8 在1月内且属平成）→ 31天
  const days = dayOptions(cal, '平成|1', '1', 'zh-CN');
  check('平成元年1月有31天', days.length === 31);
}

console.log('== 9. monthCalendarDays 网格完整性 ==');
{
  // 昭和64年1月：31天，首日公历=1989-01-01
  const cells = monthCalendarDays(cal, '昭和|64', '1', 'zh-CN');
  check('昭和64年1月网格日数 = 31', cells.length === 31);
  check('昭和64年1月网格首日 = 1989-01-01',
    cells[0]?.greg.getFullYear() === 1989 && cells[0]?.greg.getMonth() === 0 && cells[0]?.greg.getDate() === 1);
  check('昭和64年1月网格末日 = 1989-01-31',
    cells[30]?.greg.getFullYear() === 1989 && cells[30]?.greg.getMonth() === 0 && cells[30]?.greg.getDate() === 31);
}
{
  // 令和元年5月：31天，首日公历=2019-05-01
  const cells = monthCalendarDays(cal, '令和|1', '5', 'zh-CN');
  check('令和元年5月网格日数 = 31', cells.length === 31);
  check('令和元年5月网格首日 = 2019-05-01',
    cells[0]?.greg.getFullYear() === 2019 && cells[0]?.greg.getMonth() === 4 && cells[0]?.greg.getDate() === 1);
}

console.log('== 10. sameCalendarMonth 与 startOfMonthKeys ==');
{
  // 1989-01-01（昭和64）和 1989-01-08（平成1）：同属1月，月首都属昭和64
  const a = new Date(1989, 0, 1);
  const b = new Date(1989, 0, 8);
  check('sameCalendarMonth(1/1, 1/8) = true', sameCalendarMonth(a, b, cal) === true);
}
{
  // 1989-01-31（昭和64）和 1989-02-01（平成1）：不同月
  const a = new Date(1989, 0, 31);
  const b = new Date(1989, 1, 1);
  check('sameCalendarMonth(1/31, 2/1) = false', sameCalendarMonth(a, b, cal) === false);
}
{
  // 2019-04-30（平成31）和 2019-05-01（令和1）：不同月
  const a = new Date(2019, 3, 30);
  const b = new Date(2019, 4, 1);
  check('sameCalendarMonth(4/30, 5/1) = false', sameCalendarMonth(a, b, cal) === false);
}
{
  // startOfMonthKeys(1989-01-08) 应返回 昭和|64, 1
  const k = startOfMonthKeys(new Date(1989, 0, 8), cal);
  check('startOfMonthKeys(1/8) yearKey = 昭和|64', k.yearKey === '昭和|64');
  check('startOfMonthKeys(1/8) monthKey = 1', k.monthKey === '1');
}
{
  // keysFromGregorian(1989-01-08) 应返回 平成|1（逐日真实年号）
  const k = keysFromGregorian(new Date(1989, 0, 8), cal);
  check('keysFromGregorian(1/8) yearKey = 平成|1', k.yearKey === '平成|1');
}

console.log('== 11. 元年格式化（中文） ==');
{
  // 令和元年5月 → "令和元年5月"（非"令和1年5月"）
  const h = formatYearMonthHeader(cal, '令和|1', '5', 'zh-CN');
  check('formatYearMonthHeader 令和元年5月', h === '令和元年5月');
}
{
  // 平成元年1月 → "平成元年1月"
  const h = formatYearMonthHeader(cal, '平成|1', '1', 'zh-CN');
  check('formatYearMonthHeader 平成元年1月', h === '平成元年1月');
}
{
  // 昭和64年1月 → "昭和64年1月"（非元年）
  const h = formatYearMonthHeader(cal, '昭和|64', '1', 'zh-CN');
  check('formatYearMonthHeader 昭和64年1月', h === '昭和64年1月');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
