import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTemporalReady } from '../src/utils/temporal.js';
import {
  keysFromGregorian,
  gregorianFromKeys,
  monthCalendarDays,
} from '../src/utils/calendar.js';
import type { CalendarId } from '../src/types.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

const NON_GREG: CalendarId[] = [
  'chinese', 'islamic-umalqura', 'islamic-civil', 'islamic-tbla', 'islamic-rgsa',
  'hebrew', 'persian', 'buddhist', 'japanese', 'roc', 'indian',
  'ethiopic', 'ethiopic-amete-alem', 'coptic', 'dangi', 'juche',
];

describe('DST 回归：日历网格相邻单元格公历恰好 +1 天', () => {
  for (const cal of NON_GREG) {
    it(`${cal} 网格相邻日格公历恰好 +1 天`, () => {
      const base = new Date(2025, 9, 20); // 2025-10-20，覆盖 11 月初的北半球 DST 回拨月
      const sel = keysFromGregorian(base, cal);
      const cells = monthCalendarDays(cal, sel.yearKey, sel.monthKey, 'en-US');
      expect(cells.length).toBeGreaterThanOrEqual(2);
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
      expect(adjOk).toBe(true);
    });
  }
});

describe('DST 回归：跨 DST 月 历法键↔公历 双向往返', () => {
  for (const cal of NON_GREG) {
    it(`${cal} 跨 DST 月双向往返`, () => {
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
      expect(allOk).toBe(true);
    });
  }
});
