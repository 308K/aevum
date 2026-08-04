/**
 * 冒烟测试：日本和历改元边界
 * 覆盖月中改元（昭和1926-12-25）和月初改元（平成1989-01-08、令和2019-05-01）
 */
import { Temporal, ensureTemporalReady } from '../src/utils/temporal.js';
import {
  monthOptions,
  dayOptions,
  gregorianFromKeys,
  yearOptions,
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

console.log('== 1. 平成31年：仅1-4月，5月改元令和 ==');
{
  const months = monthOptions(cal, '平成|31', 'zh-CN');
  check('平成31年月份数量 = 4', months.length === 4);
  check('平成31年第1月 = 1', months[0]?.key === '1');
  check('平成31年第4月 = 4', months[3]?.key === '4');
}

console.log('== 2. 令和元年：5-12月 ==');
{
  const months = monthOptions(cal, '令和|1', 'zh-CN');
  check('令和元年月份数量 = 8', months.length === 8);
  check('令和元年第1月 = 5', months[0]?.key === '5');
  check('令和元年第8月 = 12', months[7]?.key === '12');
}

console.log('== 3. 昭和元年（1926-12-25起）：仅12月 ==');
{
  const months = monthOptions(cal, '昭和|1', 'zh-CN');
  check('昭和元年月份数量 = 1', months.length === 1);
  check('昭和元年仅有12月', months[0]?.key === '12');
}

console.log('== 4. 昭和元年12月：仅25-31日 ==');
{
  const days = dayOptions(cal, '昭和|1', '12', 'zh-CN');
  check('昭和元年12月日数 = 7', days.length === 7);
  check('昭和元年12月首日 = 25', days[0]?.key === '25');
  check('昭和元年12月末日 = 31', days[6]?.key === '31');
}

console.log('== 5. 大正15年12月：仅1-24日（25日改昭和） ==');
{
  const days = dayOptions(cal, '大正|15', '12', 'zh-CN');
  check('大正15年12月日数 = 24', days.length === 24);
  check('大正15年12月首日 = 1', days[0]?.key === '1');
  check('大正15年12月末日 = 24', days[23]?.key === '24');
}

console.log('== 6. 平成元年1月：仅8-31日（1月7日昭和天皇驾崩，8日改元） ==');
{
  const days = dayOptions(cal, '平成|1', '1', 'zh-CN');
  check('平成元年1月日数 = 24', days.length === 24);
  check('平成元年1月首日 = 8', days[0]?.key === '8');
  check('平成元年1月末日 = 31', days[23]?.key === '31');
}

console.log('== 7. 大正15年：应有1-12月（年初未改元） ==');
{
  const months = monthOptions(cal, '大正|15', 'zh-CN');
  check('大正15年月份数量 = 12', months.length === 12);
}

console.log('== 8. 年份选项包含所有改元年 ==');
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

console.log('== 9. gregorianFromKeys 往返 ==');
{
  // 昭和元年12月25日 = 1926-12-25
  const sel: DateSelection = { yearKey: '昭和|1', monthKey: '12', dayKey: '25' };
  const g = gregorianFromKeys(sel, cal);
  check('昭和元年12月25日 = 1926-12-25', g?.getFullYear() === 1926 && g?.getMonth() === 11 && g?.getDate() === 25);
}
{
  // 平成元年1月8日 = 1989-01-08
  const sel: DateSelection = { yearKey: '平成|1', monthKey: '1', dayKey: '8' };
  const g = gregorianFromKeys(sel, cal);
  check('平成元年1月8日 = 1989-01-08', g?.getFullYear() === 1989 && g?.getMonth() === 0 && g?.getDate() === 8);
}
{
  // 令和元年5月1日 = 2019-05-01
  const sel: DateSelection = { yearKey: '令和|1', monthKey: '5', dayKey: '1' };
  const g = gregorianFromKeys(sel, cal);
  check('令和元年5月1日 = 2019-05-01', g?.getFullYear() === 2019 && g?.getMonth() === 4 && g?.getDate() === 1);
}
{
  // 平成31年4月30日 = 2019-04-30（平成最后一天）
  const sel: DateSelection = { yearKey: '平成|31', monthKey: '4', dayKey: '30' };
  const g = gregorianFromKeys(sel, cal);
  check('平成31年4月30日 = 2019-04-30', g?.getFullYear() === 2019 && g?.getMonth() === 3 && g?.getDate() === 30);
}

console.log('== 10. 不存在的日期返回 null/空 ==');
{
  // 平成31年5月1日不存在（5月已属令和）
  const days = dayOptions(cal, '平成|31', '5', 'zh-CN');
  check('平成31年5月无日期选项', days.length === 0);
}
{
  // 昭和元年1月不存在（1月仍属大正）
  const days = dayOptions(cal, '昭和|1', '1', 'zh-CN');
  check('昭和元年1月无日期选项', days.length === 0);
}
{
  // 大正15年12月25日不存在（25日已属昭和）→ gregorianFromKeys 应返回 null
  const sel: DateSelection = { yearKey: '大正|15', monthKey: '12', dayKey: '25' };
  const g = gregorianFromKeys(sel, cal);
  check('大正15年12月25日 = null（已属昭和）', g === null);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
