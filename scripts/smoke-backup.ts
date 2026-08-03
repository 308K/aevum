/* Aevum 备份导入冒烟测试（utils/backup，需 localStorage 垫片）
 * 重点覆盖：事件循环规则 recurrence 是否在导入清洗中被保留 */
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();

import { ensureTemporalReady } from '../src/utils/temporal.js';
await ensureTemporalReady();

import { importBackup } from '../src/utils/backup.js';
import { getEvents } from '../src/store/events.js';
import { getSettings } from '../src/store/settings.js';
import { getTags } from '../src/store/tags.js';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       actual:   ${JSON.stringify(actual)}\n       expected: ${JSON.stringify(expected)}`); }
}

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

console.log('== 导入：循环规则 recurrence ==');
await importBackup(
  jsonFile({
    app: 'aevum',
    version: 1,
    events: [
      ev('e_yearly', { recurrence: 'yearly' }),
      ev('e_monthly', { recurrence: 'monthly' }),
      ev('e_weekly', { recurrence: 'weekly' }),
      ev('e_explicit_none', { recurrence: 'none' }),
      ev('e_missing'), // 旧备份：无 recurrence 字段
      ev('e_bogus', { recurrence: 'daily' }), // 非法值
    ],
    tags: [],
  }),
);
const byId = (id: string) => getEvents().find((e) => e.id === id);
check('导入事件数', getEvents().length, 6);
check('yearly 保留', byId('e_yearly')?.recurrence, 'yearly');
check('monthly 保留', byId('e_monthly')?.recurrence, 'monthly');
check('weekly 保留', byId('e_weekly')?.recurrence, 'weekly');
check('显式 none 保留', byId('e_explicit_none')?.recurrence, 'none');
check('缺省字段回落 none', byId('e_missing')?.recurrence, 'none');
check('非法值回落 none', byId('e_bogus')?.recurrence, 'none');

console.log('\n== 导入：旧备份（无 tags 库）不应跳过设置 ==');
const tagsBefore = getTags().length;
await importBackup(
  jsonFile({
    app: 'aevum',
    version: 1,
    events: [ev('e_old', { recurrence: 'weekly' })],
    settings: { dayBoundary: '04:00', gradientBg: true },
  }),
);
check('旧备份循环仍保留', getEvents()[0]?.recurrence, 'weekly');
check('旧备份设置已应用 dayBoundary', getSettings().dayBoundary, '04:00');
check('旧备份设置已应用 gradientBg', getSettings().gradientBg, true);
check('无 tags 库时保留现有标签库', getTags().length, tagsBefore);

console.log('\n== 导入：设置字段类型校验 ==');
await importBackup(
  jsonFile({
    app: 'aevum',
    version: 1,
    events: [ev('e_x')],
    settings: { customThemes: null, dayBoundary: 123, defaultGranularity: 'ymd' },
  }),
);
check('customThemes=null 被拒绝', Array.isArray(getSettings().customThemes), true);
check('dayBoundary 类型不符被拒绝', getSettings().dayBoundary, '04:00');
check('合法设置仍被接受', getSettings().defaultGranularity, 'ymd');

console.log('\n== 导入：裸数组备份 ==');
await importBackup(jsonFile([ev('e_bare', { recurrence: 'monthly' })]));
check('裸数组导入成功', getEvents().length, 1);
check('裸数组循环保留', getEvents()[0]?.recurrence, 'monthly');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
