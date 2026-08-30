import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTemporalReady } from '../src/utils/temporal.js';
import { importBackup } from '../src/utils/backup.js';
import { getEvents, __resetForTesting as resetEvents } from '../src/store/events.js';
import { getSettings, __resetForTesting as resetSettings } from '../src/store/settings.js';
import { getTags, __resetForTesting as resetTags } from '../src/store/tags.js';

beforeAll(async () => {
  await ensureTemporalReady();
});

beforeEach(() => {
  localStorage.clear();
  resetSettings();
  resetEvents();
  resetTags();
});

function jsonFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' });
}

const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  date: '2026-03-05',
  calendar: 'gregory',
  granularity: 'day',
  tags: [],
  pinned: false,
  createdAt: 1_700_000_000_000,
  ...extra,
});

describe('导入：循环规则 recurrence', () => {
  it('保留所有合法 recurrence 值', async () => {
    await importBackup(
      jsonFile({
        app: 'aevum',
        version: 1,
        events: [
          ev('e_yearly', { recurrence: 'yearly' }),
          ev('e_monthly', { recurrence: 'monthly' }),
          ev('e_weekly', { recurrence: 'weekly' }),
          ev('e_explicit_none', { recurrence: 'none' }),
          ev('e_missing'),
          ev('e_bogus', { recurrence: 'daily' }),
        ],
        tags: [],
      }),
    );
    const byId = (id: string) => getEvents().find((e) => e.id === id);
    expect(getEvents().length).toBe(6);
    expect(byId('e_yearly')?.recurrence).toBe('yearly');
    expect(byId('e_monthly')?.recurrence).toBe('monthly');
    expect(byId('e_weekly')?.recurrence).toBe('weekly');
    expect(byId('e_explicit_none')?.recurrence).toBe('none');
    expect(byId('e_missing')?.recurrence).toBe('none');
    expect(byId('e_bogus')?.recurrence).toBe('none');
  });
});

describe('导入：旧备份兼容', () => {
  it('旧备份循环仍保留且设置已应用', async () => {
    const tagsBefore = getTags().length;
    await importBackup(
      jsonFile({
        app: 'aevum',
        version: 1,
        events: [ev('e_old', { recurrence: 'weekly' })],
        settings: { dayBoundary: '04:00', gradientBg: true },
      }),
    );
    expect(getEvents()[0]?.recurrence).toBe('weekly');
    expect(getSettings().dayBoundary).toBe('04:00');
    expect(getSettings().gradientBg).toBe(true);
    expect(getTags().length).toBe(tagsBefore);
  });
});

describe('导入：设置字段类型校验', () => {
  it('customThemes=null 被拒绝', async () => {
    await importBackup(
      jsonFile({
        app: 'aevum',
        version: 1,
        events: [ev('e_x')],
        settings: { customThemes: null, dayBoundary: 123, defaultGranularity: 'ymd' },
      }),
    );
    expect(Array.isArray(getSettings().customThemes)).toBe(true);
  });
  it('dayBoundary 类型不符被拒绝', async () => {
    await importBackup(
      jsonFile({
        app: 'aevum',
        version: 1,
        events: [ev('e_x2')],
        settings: { dayBoundary: 123 },
      }),
    );
    expect(getSettings().dayBoundary).toBe('00:00');
  });
  it('合法设置仍被接受', async () => {
    await importBackup(
      jsonFile({
        app: 'aevum',
        version: 1,
        events: [ev('e_x3')],
        settings: { defaultGranularity: 'ymd' },
      }),
    );
    expect(getSettings().defaultGranularity).toBe('ymd');
  });
});

describe('导入：裸数组备份', () => {
  it('裸数组导入成功且循环保留', async () => {
    await importBackup(jsonFile([ev('e_bare', { recurrence: 'monthly' })]));
    expect(getEvents().length).toBe(1);
    expect(getEvents()[0]?.recurrence).toBe('monthly');
  });
});
