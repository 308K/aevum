/**
 * DST 回归测试（日历核心层）
 *
 * 背景：原核心层用 `时间戳 + 86400000ms` 在非公历月份里逐日递进，
 * 在夏令时回拨月（如美国 11 月，当天有 25 小时）会出现「+24h 仍落在同一公历日」的错位，
 * 导致历法键扫描、gregorianFromKeys 往返、以及日历网格 weekday 对齐出错。
 * 修复后用 addDays（按 年/月/日 分量构造）步进，任意时区（含 DST）都精确等价于「日历日 +1」。
 *
 * 重要：本机时区若不实行夏令时（如 Asia/Shanghai），无法在运行时复现 DST 错位，
 * 此时下列断言仅作为「无回归」守卫；要真正验证 DST 修复，请在实行夏令时的时区运行，例如：
 *     TZ=America/New_York bun scripts/smoke-dst.ts
 */
import { ensureTemporalReady } from '../src/utils/temporal.js';

await ensureTemporalReady();

import {
  keysFromGregorian,
  gregorianFromKeys,
  monthCalendarDays,
  type CalendarId,
} from '../src/utils/calendar.js';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}

console.log(`\n[DST 回归] 运行环境时区: ${tz}`);
console.log('  要在实行夏令时的时区验证，请运行： TZ=America/New_York bun scripts/smoke-dst.ts');

const NON_GREG: CalendarId[] = ['chinese', 'islamic', 'hebrew', 'persian', 'buddhist', 'japanese'];

// 1) 日历网格：相邻单元格的公历日期必须恰好相差 1 个日历日（DST 安全的核心不变量）
for (const cal of NON_GREG) {
  const base = new Date(2025, 9, 20); // 2025-10-20，覆盖 11 月初的北半球 DST 回拨月
  const sel = keysFromGregorian(base, cal);
  const cells = monthCalendarDays(cal, sel.yearKey, sel.monthKey, 'en-US');
  if (cells.length < 2) {
    check(`${cal} 网格含多个日格`, cells.length >= 2, true);
    continue;
  }
  let adjOk = true;
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1].greg;
    const cur = cells[i].greg;
    const exp = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
    if (exp.getFullYear() !== cur.getFullYear() || exp.getMonth() !== cur.getMonth() || exp.getDate() !== cur.getDate()) {
      adjOk = false;
      break;
    }
  }
  check(`${cal} 网格相邻日格公历恰好 +1 天`, adjOk, true);
}

// 2) 双向往返：覆盖 DST 回拨日（2025-11-02 前后）的公历日期不应漂移
for (const cal of NON_GREG) {
  let allOk = true;
  for (let off = -5; off <= 12; off++) {
    const d = new Date(2025, 10, 2 + off); // 2025-10-28 .. 2025-11-14，含 11/2 回拨日
    const sel = keysFromGregorian(d, cal);
    const back = gregorianFromKeys(sel, cal);
    if (
      !back ||
      back.getFullYear() !== d.getFullYear() ||
      back.getMonth() !== d.getMonth() ||
      back.getDate() !== d.getDate()
    ) {
      allOk = false;
      break;
    }
  }
  check(`${cal} 跨 DST 月 历法键↔公历 双向往返`, allOk, true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
