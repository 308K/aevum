/**
 * 历法注册表守护：islamic-rgsa 已移除（2026-09-15）
 * - 迁移映射仍把旧值（rgsa / islamic）指向 islamic-umalqura
 * - CALENDAR_IDS 不再包含 rgsa，且每一项都能正常取键（无死项）
 * - 迁移目标历法 umalqura 行为不受影响
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { migrateCalendarId } from '../src/types.js';
import { CALENDAR_IDS, keysFromGregorian, formatEventDate } from '../src/utils/calendar.js';
import { ensureTemporalReady } from '../src/utils/temporal.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

describe('islamic-rgsa 移除守护', () => {
  it('迁移映射仍把 rgsa / islamic 指向 umalqura', () => {
    expect(migrateCalendarId('islamic-rgsa')).toBe('islamic-umalqura');
    expect(migrateCalendarId('islamic')).toBe('islamic-umalqura');
    expect(migrateCalendarId('gregory')).toBe('gregory');
  });

  it('CALENDAR_IDS 不再含 rgsa、长度 16、无重复', () => {
    expect(CALENDAR_IDS).not.toContain('islamic-rgsa');
    expect(CALENDAR_IDS).toHaveLength(16);
    expect(new Set(CALENDAR_IDS).size).toBe(CALENDAR_IDS.length);
  });

  it('迁移目标历法 umalqura 行为正常', () => {
    expect(keysFromGregorian(new Date(2026, 6, 31), 'islamic-umalqura').yearKey).toBe('islamic-umalqura|1448');
    expect(formatEventDate('2026-07-31', 'islamic-umalqura', 'zh-CN')).toBe('伊斯兰历1448年2月17日');
  });

  it('CALENDAR_IDS 每项均能取到完整键（无死项）', () => {
    expect(CALENDAR_IDS.length).toBeGreaterThan(0);
    for (const cal of CALENDAR_IDS) {
      const k = keysFromGregorian(new Date(2026, 6, 31), cal);
      expect(k.yearKey, cal).toBeTruthy();
      expect(k.monthKey, cal).toBeTruthy();
      expect(k.dayKey, cal).toBeTruthy();
    }
  });
});
