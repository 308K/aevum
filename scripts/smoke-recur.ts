/**
 * 日本和历改元（era transition）下的循环处理验证
 *
 * 关键改元边界：
 * - 昭和 1926-12-25（12 月起始，元年仅含 12 月下旬）
 * - 平成 1989-01-08（正月起始，1/1-1/7 仍属昭和 64）
 * - 令和 2019-05-01（年中起始）
 *
 * 运行：bun scripts/smoke-recur.ts（polyfill）/ deno run --no-prompt --allow-read --allow-env scripts/smoke-recur.ts（原生）
 */
import { ensureTemporalReady } from '../src/utils/temporal.ts';
import { nextOccurrenceDate } from '../src/utils/time-calc.ts';
import type { AevumEvent } from '../src/types.ts';

let pass = 0;
let fail = 0;
function check(name: string, got: string, want: string) {
  if (got === want) { pass++; console.log(`  ok  ${name} → ${got}`); }
  else { fail++; console.log(`FAIL  ${name} → ${got}（期望 ${want}）`); }
}

await ensureTemporalReady();
const impl = (globalThis as any).Temporal ? '原生' : 'polyfill';
console.log(`== 日本和历改元验证（${impl} Temporal）==\n`);

const mk = (date: string, recurrence: AevumEvent['recurrence'], time?: string): AevumEvent => ({
  id: 't', name: 't', date, calendar: 'japanese', recurrence, granularity: 'day', tags: [], pinned: false, createdAt: 0, time,
});
const at = (iso: string, h = 0, m = 0): number => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0).getTime();
};

console.log('== A. yearly 跨改元：昭和 63 年 3/3，1989-01-01 起算 → 1989-03-03（平成元年）==');
check('昭和63年3/3 yearly', nextOccurrenceDate(mk('1988-03-03', 'yearly'), at('1989-01-01'), 0), '1989-03-03');

console.log('\n== B. yearly 改元当年已过 → 次年 ==');
check('平成元年3/3 yearly 1989-01-10 起', nextOccurrenceDate(mk('1989-03-03', 'yearly'), at('1989-01-10'), 0), '1989-03-03');
check('平成31年3/3 yearly 令和元年6月起 → 次年', nextOccurrenceDate(mk('2019-03-03', 'yearly'), at('2019-06-01'), 0), '2020-03-03');

console.log('\n== C. yearly anchor 在改元前的昭和日（1989-01-03 属昭和64）==');
check('昭和64年1/3 yearly 1989-01-01 起', nextOccurrenceDate(mk('1989-01-03', 'yearly'), at('1989-01-01'), 0), '1989-01-03');
check('昭和64年1/3 yearly 1989-01-07 起 → 次年', nextOccurrenceDate(mk('1989-01-03', 'yearly'), at('1989-01-07'), 0), '1990-01-03');

console.log('\n== D. yearly anchor = 改元当天（令和元年 5/1）==');
check('令和元年5/1 yearly 2019-04-01 起', nextOccurrenceDate(mk('2019-05-01', 'yearly'), at('2019-04-01'), 0), '2019-05-01');
check('令和元年5/1 yearly 2019-06-01 起 → 次年', nextOccurrenceDate(mk('2019-05-01', 'yearly'), at('2019-06-01'), 0), '2020-05-01');

console.log('\n== E. yearly 12 月起始元年：昭和元年 12/25（1926-12-25）==');
check('昭和元年12/25 yearly 1927-01-01 起', nextOccurrenceDate(mk('1926-12-25', 'yearly'), at('1927-01-01'), 0), '1927-12-25');
check('昭和元年12/25 yearly 1926-12-26 起（今年已过）→ 次年', nextOccurrenceDate(mk('1926-12-25', 'yearly'), at('1926-12-26'), 0), '1927-12-25');

console.log('\n== F. monthly 改元当月：平成元年 1/8（改元当天）==');
check('平成元年1/8 monthly 1989-01-01 起', nextOccurrenceDate(mk('1989-01-08', 'monthly'), at('1989-01-01'), 0), '1989-01-08');
check('平成元年1/8 monthly 1989-02-01 起', nextOccurrenceDate(mk('1989-01-08', 'monthly'), at('1989-02-01'), 0), '1989-02-08');

console.log('\n== G. monthly 令和改元月：2019-05-01 ==');
check('2019-05-01 monthly 2019-05-15 起 → 6/1', nextOccurrenceDate(mk('2019-05-01', 'monthly'), at('2019-05-15'), 0), '2019-06-01');

console.log('\n== H. monthly 月末收敛（平成元年 1/31，2 月 28 天）==');
check('1/31 monthly 1989-02-01 起收敛 2/28', nextOccurrenceDate(mk('1989-01-31', 'monthly'), at('1989-02-01'), 0), '1989-02-28');
check('1/31 monthly 1989-03-01 起回到 3/31', nextOccurrenceDate(mk('1989-01-31', 'monthly'), at('1989-03-01'), 0), '1989-03-31');

console.log('\n== I. weekly 改元期间（星期不变，逐周推进）==');
check('weekly 1989-01-07(周六) 1989-01-07 起', nextOccurrenceDate(mk('1989-01-07', 'weekly'), at('1989-01-07'), 0), '1989-01-07');
check('weekly 1989-01-07(周六) 1989-01-08 起 → 下周六', nextOccurrenceDate(mk('1989-01-07', 'weekly'), at('1989-01-08'), 0), '1989-01-14');

console.log('\n== J. 精确时间 + 改元：令和元年 5/1 18:00 yearly ==');
check('5/1 18:00 yearly 2019-05-01 17:00 起（当天未到）', nextOccurrenceDate(mk('2019-05-01', 'yearly', '18:00'), at('2019-05-01', 17, 0), 0), '2019-05-01');
check('5/1 18:00 yearly 2019-05-01 19:00 起（当天已过）→ 次年', nextOccurrenceDate(mk('2019-05-01', 'yearly', '18:00'), at('2019-05-01', 19, 0), 0), '2020-05-01');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
