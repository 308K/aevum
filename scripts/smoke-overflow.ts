/**
 * 循环事件策略验证（solarOverflow + lunarLeapStrategy）
 * 覆盖全部 7 种历法：gregory / chinese / islamic / hebrew / persian / buddhist / japanese
 *
 * 运行：bun scripts/smoke-overflow.ts
 */
import { ensureTemporalReady, getTemporalForCalendar } from '../src/utils/temporal.ts';
import { nextOccurrenceDate } from '../src/utils/time-calc.ts';
import type { AevumEvent, CalendarId, SolarOverflow, LunarLeapStrategy } from '../src/types.ts';

let pass = 0, fail = 0;
function check(name: string, got: string, want: string) {
  if (got === want) { pass++; console.log(`  ok  ${name} → ${got}`); }
  else { fail++; console.log(`FAIL  ${name} → ${got}（期望 ${want}）`); }
}

await ensureTemporalReady();
const impl = (globalThis as any).Temporal ? '原生' : 'polyfill';
console.log(`== 循环事件策略验证（${impl} Temporal）==\n`);

const mk = (date: string, recurrence: AevumEvent['recurrence'], calendar: AevumEvent['calendar'] = 'gregory', time?: string): AevumEvent => ({ id: 't', name: 't', date, calendar, recurrence, granularity: 'day', tags: [], pinned: false, createdAt: 0, time });
const at = (iso: string, h = 0, m = 0): number => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, h, m, 0).getTime(); };
const strat = (so: SolarOverflow = 'lastDay', ll: LunarLeapStrategy = 'nonLeap') => ({ solarOverflow: so, lunarLeapStrategy: ll });
const calIdOf = (id: CalendarId) => id === 'islamic' ? 'islamic-umalqura' : id;
const pdOf = (calId: string, iso: string) => { const T = getTemporalForCalendar(calId); const [y, m, d] = iso.split('-').map(Number); return T.PlainDate.from({ year: y, month: m, day: d }).withCalendar(calId); };
const monthCodeOf = (calId: string, iso: string) => pdOf(calId, iso).monthCode;
const dayOf = (calId: string, iso: string) => pdOf(calId, iso).day;
const daysInMonthOf = (calId: string, iso: string) => pdOf(calId, iso).daysInMonth;
const isoPlusDays = (iso: string, days: number) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d + days); const p = (n: number) => String(n).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`; };
const isoOfPd = (pd: any) => { const g = pd.withCalendar('gregory'); const p = (n: number) => String(n).padStart(2, '0'); return `${g.year}-${p(g.month)}-${p(g.day)}`; };

const CALS: { id: CalendarId; anchorIso: string; label: string }[] = [
  { id: 'gregory', anchorIso: '2025-03-15', label: '公历' },
  { id: 'chinese', anchorIso: '2025-02-17', label: '农历' },
  { id: 'islamic', anchorIso: '2025-07-31', label: '伊斯兰历' },
  { id: 'hebrew', anchorIso: '2025-09-23', label: '希伯来历' },
  { id: 'persian', anchorIso: '2025-03-21', label: '波斯历' },
  { id: 'buddhist', anchorIso: '2025-01-01', label: '佛教历' },
  { id: 'japanese', anchorIso: '2025-01-01', label: '日本和历' },
];

// ============ A. 公历年循环 2/29 × solarOverflow ============
console.log('== A. 公历年循环 2/29，从 2025-01-01 起算（平年）==');
check('2/29 yearly rfc5545 → 2028-02-29', nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('rfc5545')), '2028-02-29');
check('2/29 yearly lastDay → 2025-02-28', nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('lastDay')), '2025-02-28');
check('2/29 yearly nextMonth → 2025-03-01', nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2025-01-01'), 0, strat('nextMonth')), '2025-03-01');

console.log('\n== A2. 公历年循环 2/29，从 2023-01-01 起算 ==');
check('2/29 yearly rfc5545 2023起 → 2024-02-29', nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2023-01-01'), 0, strat('rfc5545')), '2024-02-29');
check('2/29 yearly lastDay 2023起 → 2023-02-28', nextOccurrenceDate(mk('2024-02-29', 'yearly'), at('2023-01-01'), 0, strat('lastDay')), '2023-02-28');

// ============ B. 公历月循环 31 日 × solarOverflow ============
console.log('\n== B. 公历月循环 1/31，从 2025-02-01 起算 ==');
check('1/31 monthly rfc5545 2月起 → 2025-03-31', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('rfc5545')), '2025-03-31');
check('1/31 monthly lastDay 2月起 → 2025-02-28', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('lastDay')), '2025-02-28');
check('1/31 monthly nextMonth 2月起 → 2025-03-01', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-02-01'), 0, strat('nextMonth')), '2025-03-01');

console.log('\n== B2. 公历月循环 1/31，从 2025-04-01 起算 ==');
check('1/31 monthly rfc5545 4月起 → 2025-05-31', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('rfc5545')), '2025-05-31');
check('1/31 monthly lastDay 4月起 → 2025-04-30', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('lastDay')), '2025-04-30');
check('1/31 monthly nextMonth 4月起 → 2025-05-01', nextOccurrenceDate(mk('2025-01-31', 'monthly'), at('2025-04-01'), 0, strat('nextMonth')), '2025-05-01');

// ============ C. 农历闰月年循环 × lunarLeapStrategy ============
console.log('\n== C. 农历闰月年循环策略 ==');
const Tch = getTemporalForCalendar('chinese');
let leapMonthDate = '';
for (let m = 6; m <= 9; m++) { for (let d = 1; d <= 30; d++) { try { const pd = Tch.PlainDate.from({ year: 2025, month: m, day: d }).withCalendar('chinese'); if (pd.monthCode.endsWith('L')) { leapMonthDate = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; console.log(`  找到闰月: ${leapMonthDate} → monthCode=${pd.monthCode}`); break; } } catch {} } if (leapMonthDate) break; }
if (leapMonthDate) {
  const anchor = mk(leapMonthDate, 'yearly', 'chinese');
  const r1 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'nonLeap')); console.log(`  nonLeap 2026起 → ${r1}`);
  const r1d = new Date(r1); check('nonLeap 2026年夏季', r1d.getFullYear() === 2026 && r1d.getMonth() >= 5 && r1d.getMonth() <= 8 ? 'ok' : 'wrong', 'ok');
  const r2 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'strictLeap')); console.log(`  strictLeap 2026起 → ${r2}`);
  check('strictLeap 不在2026', new Date(r2).getFullYear() !== 2026 ? 'ok' : 'wrong', 'ok');
  const r3 = nextOccurrenceDate(anchor, at('2026-01-01'), 0, strat('lastDay', 'both')); console.log(`  both 2026起 → ${r3}`);
  const r3d = new Date(r3); check('both 2026年夏季', r3d.getFullYear() === 2026 && r3d.getMonth() >= 5 && r3d.getMonth() <= 8 ? 'ok' : 'wrong', 'ok');
} else { console.log('  未找到2025年农历闰月，跳过'); }

// ============ D. 希伯来历闰月年循环 × lunarLeapStrategy ============
console.log('\n== D. 希伯来历闰月年循环策略 ==');
const The = getTemporalForCalendar('hebrew');
let hebrewLeapDate = '';
for (let m = 1; m <= 12; m++) { for (let d = 1; d <= 28; d++) { try { const pd = The.PlainDate.from({ year: 2027, month: m, day: d }).withCalendar('hebrew'); if (pd.monthCode.endsWith('L')) { hebrewLeapDate = `2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; console.log(`  找到希伯来历闰月: ${hebrewLeapDate} → monthCode=${pd.monthCode}`); break; } } catch {} } if (hebrewLeapDate) break; }
if (hebrewLeapDate) {
  const anchor = mk(hebrewLeapDate, 'yearly', 'hebrew');
  const r1 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'nonLeap')); console.log(`  hebrew nonLeap 2028起 → ${r1}`);
  check('hebrew nonLeap 2028年', new Date(r1).getFullYear() === 2028 ? 'ok' : 'wrong', 'ok');
  const r2 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'strictLeap')); console.log(`  hebrew strictLeap 2028起 → ${r2}`);
  check('hebrew strictLeap 不在2028', new Date(r2).getFullYear() !== 2028 ? 'ok' : 'wrong', 'ok');
  const r3 = nextOccurrenceDate(anchor, at('2028-01-01'), 0, strat('lastDay', 'both')); console.log(`  hebrew both 2028起 → ${r3}`);
  check('hebrew both 2028年', new Date(r3).getFullYear() === 2028 ? 'ok' : 'wrong', 'ok');
} else { console.log('  未找到希伯来历闰月，跳过'); }

// ============ E. 全历法 monthly 基本循环 ============
console.log('\n== E. 全历法 monthly 基本循环 ==');
for (const { id, anchorIso, label } of CALS) {
  const calId = calIdOf(id);
  const anchorDay = dayOf(calId, anchorIso);
  const futureIso = isoPlusDays(anchorIso, 45);
  const result = nextOccurrenceDate(mk(anchorIso, 'monthly', id), at(futureIso), 0, strat('lastDay'));
  const resultDay = dayOf(calId, result);
  const resultDim = daysInMonthOf(calId, result);
  if (anchorDay <= resultDim) { check(`${label} monthly day=${anchorDay}`, String(resultDay), String(anchorDay)); }
  else { check(`${label} monthly 收敛月末 ${anchorDay}→${resultDim}`, String(resultDay), String(resultDim)); }
  check(`${label} monthly >= now`, result >= futureIso ? 'ok' : 'wrong', 'ok');
}

// ============ F. 全历法 yearly 基本循环 ============
console.log('\n== F. 全历法 yearly 基本循环 ==');
for (const { id, anchorIso, label } of CALS) {
  const calId = calIdOf(id);
  const anchorMC = monthCodeOf(calId, anchorIso);
  const anchorDay = dayOf(calId, anchorIso);
  const futureIso = isoPlusDays(anchorIso, 400);
  const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
  const resultMC = monthCodeOf(calId, result);
  const resultDay = dayOf(calId, result);
  const resultDim = daysInMonthOf(calId, result);
  check(`${label} yearly monthCode`, resultMC, anchorMC);
  if (anchorDay <= resultDim) { check(`${label} yearly day=${anchorDay}`, String(resultDay), String(anchorDay)); }
  else { check(`${label} yearly 收敛月末`, String(resultDay), String(resultDim)); }
  check(`${label} yearly >= now`, result >= futureIso ? 'ok' : 'wrong', 'ok');
}

// ============ G. 全历法 weekly 基本循环 ============
console.log('\n== G. 全历法 weekly 基本循环 ==');
for (const { id, anchorIso, label } of CALS) {
  const futureIso = isoPlusDays(anchorIso, 8);
  const result = nextOccurrenceDate(mk(anchorIso, 'weekly', id), at(futureIso), 0, strat('lastDay'));
  const anchorWd = new Date(anchorIso).getDay();
  const resultWd = new Date(result).getDay();
  check(`${label} weekly 星期一致`, String(resultWd), String(anchorWd));
  check(`${label} weekly >= now`, result >= futureIso ? 'ok' : 'wrong', 'ok');
}

// ============ H. 全历法 monthly 锚定当月最后一天 ============
console.log('\n== H. 全历法 monthly 锚定当月最后一天 ==');
for (const { id, anchorIso, label } of CALS) {
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
  if (lastDay <= resultDim) { check(`${label} monthly末 day=${lastDay}`, String(resultDay), String(lastDay)); }
  else { check(`${label} monthly末 收敛 ${lastDay}→${resultDim}`, String(resultDay), String(resultDim)); }
}

// ============ I. 伊斯兰历月循环（月长29/30交替）============
console.log('\n== I. 伊斯兰历 monthly 月长变化（29/30交替）==');
{
  const calId = 'islamic-umalqura';
  const anchorPd = pdOf(calId, '2025-07-31');
  const anchorDay = anchorPd.day;
  const anchorDim = anchorPd.daysInMonth;
  console.log(`  锚定: day=${anchorDay}, daysInMonth=${anchorDim}, monthCode=${anchorPd.monthCode}`);
  const anchorIso = isoOfPd(anchorPd);
  // 推进2个月，验证 day 一致或收敛
  const futureIso = isoPlusDays(anchorIso, 70);
  const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'islamic'), at(futureIso), 0, strat('lastDay'));
  const resultDay = dayOf(calId, result);
  const resultDim = daysInMonthOf(calId, result);
  console.log(`  结果: day=${resultDay}, daysInMonth=${resultDim}, monthCode=${monthCodeOf(calId, result)}`);
  if (anchorDay <= resultDim) { check(`islamic monthly day=${anchorDay}`, String(resultDay), String(anchorDay)); }
  else { check(`islamic monthly 收敛 ${anchorDay}→${resultDim}`, String(resultDay), String(resultDim)); }
}

// ============ J. 波斯历月循环（月长29/31交替）============
console.log('\n== J. 波斯历 monthly 月长变化 ==');
{
  const calId = 'persian';
  const anchorPd = pdOf(calId, '2025-03-21');
  const anchorDay = anchorPd.day;
  const anchorDim = anchorPd.daysInMonth;
  console.log(`  锚定: day=${anchorDay}, daysInMonth=${anchorDim}, monthCode=${anchorPd.monthCode}`);
  const anchorIso = isoOfPd(anchorPd);
  const futureIso = isoPlusDays(anchorIso, 70);
  const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'persian'), at(futureIso), 0, strat('lastDay'));
  const resultDay = dayOf(calId, result);
  const resultDim = daysInMonthOf(calId, result);
  console.log(`  结果: day=${resultDay}, daysInMonth=${resultDim}`);
  if (anchorDay <= resultDim) { check(`persian monthly day=${anchorDay}`, String(resultDay), String(anchorDay)); }
  else { check(`persian monthly 收敛 ${anchorDay}→${resultDim}`, String(resultDay), String(resultDim)); }
}

// ============ K. 佛教历/日本和历 yearly（月份与公历对齐）============
console.log('\n== K. 佛教历/日本和历 yearly monthCode 对齐 ==');
for (const { id, anchorIso, label } of CALS.filter(c => c.id === 'buddhist' || c.id === 'japanese')) {
  const calId = calIdOf(id);
  const anchorMC = monthCodeOf(calId, anchorIso);
  const futureIso = isoPlusDays(anchorIso, 400);
  const result = nextOccurrenceDate(mk(anchorIso, 'yearly', id), at(futureIso), 0, strat('lastDay'));
  const resultMC = monthCodeOf(calId, result);
  check(`${label} yearly monthCode 对齐`, resultMC, anchorMC);
}

// ============ L. 农历 monthly 闰月跳过 ============
console.log('\n== L. 农历 monthly 闰月跳过（锚定平月，推进时遇闰月应正确跳过）==');
{
  const calId = 'chinese';
  const anchorPd = pdOf(calId, '2025-05-28');
  const anchorMC = anchorPd.monthCode;
  const anchorDay = anchorPd.day;
  console.log(`  锚定: monthCode=${anchorMC}, day=${anchorDay}`);
  const anchorIso = isoOfPd(anchorPd);
  const futureIso = isoPlusDays(anchorIso, 100);
  const result = nextOccurrenceDate(mk(anchorIso, 'monthly', 'chinese'), at(futureIso), 0, strat('lastDay'));
  const resultDay = dayOf(calId, result);
  const resultDim = daysInMonthOf(calId, result);
  console.log(`  结果: day=${resultDay}, daysInMonth=${resultDim}, monthCode=${monthCodeOf(calId, result)}`);
  if (anchorDay <= resultDim) { check(`chinese monthly 闰月跳过 day=${anchorDay}`, String(resultDay), String(anchorDay)); }
  else { check(`chinese monthly 闰月跳过 收敛`, String(resultDay), String(resultDim)); }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);