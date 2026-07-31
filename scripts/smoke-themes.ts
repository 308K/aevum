/* Aevum 自定义主题色逻辑冒烟测试（store/themes + store/settings，需 localStorage 垫片） */
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

import { DEFAULT_SETTINGS } from '../src/types.js';
import { getSettings } from '../src/store/settings.js';
import {
  addCustomTheme,
  removeCustomTheme,
  renameCustomTheme,
  setCustomThemeColor,
  applyCustomTheme,
  getCustomThemes,
} from '../src/store/themes.js';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       actual:   ${JSON.stringify(actual)}\n       expected: ${JSON.stringify(expected)}`); }
}

console.log('== 自定义主题色：增 / 删 / 改 / 去重 ==');
check('初始色库为空', getCustomThemes().length, 0);

const a = addCustomTheme('A', '#123456');
check('新增 A 返回 added=true', a.added, true);
check('色库长度=1', getCustomThemes().length, 1);
check('新增后当前生效色=新色', getSettings().seedColor.toLowerCase(), '#123456');

const dup = addCustomTheme('B', '#123456'); // 同色重复
check('重复色返回 added=false', dup.added, false);
check('色库长度仍为 1（未产生重复）', getCustomThemes().length, 1);

// 改当前生效色（A）应同步 seedColor
setCustomThemeColor(a.id, '#000000');
check('改 A 色值生效', getCustomThemes().find((t) => t.id === a.id)?.color.toLowerCase(), '#000000');
check('改当前色同步 seedColor', getSettings().seedColor.toLowerCase(), '#000000');

// 再新增 C：C 成为当前生效色，A 不再生效
const c = addCustomTheme('C', '#abcdef');
check('新增 C added=true', c.added, true);
check('色库长度=2', getCustomThemes().length, 2);
check('新增 C 后当前生效色=C', getSettings().seedColor.toLowerCase(), '#abcdef');

renameCustomTheme(c.id, 'RenamedC');
check('C 改名生效', getCustomThemes().find((t) => t.id === c.id)?.name, 'RenamedC');

// 改当前生效色（C）应同步 seedColor
setCustomThemeColor(c.id, '#111111');
check('改 C 色值生效', getCustomThemes().find((t) => t.id === c.id)?.color.toLowerCase(), '#111111');
check('改 C 同步 seedColor', getSettings().seedColor.toLowerCase(), '#111111');

// 删除当前生效色 C → 回退默认种子色
removeCustomTheme(c.id);
check('删除 C 后色库=1', getCustomThemes().length, 1);
check('删除当前色回退默认种子色', getSettings().seedColor.toLowerCase(), DEFAULT_SETTINGS.seedColor.toLowerCase());

// 应用 A（仍保留）后删除 → 再次回退默认
applyCustomTheme(a.id);
check('应用 A 后 seedColor=A 色', getSettings().seedColor.toLowerCase(), '#000000');
removeCustomTheme(a.id);
check('删除 A 后色库=0', getCustomThemes().length, 0);
check('删除当前色回退默认种子色', getSettings().seedColor.toLowerCase(), DEFAULT_SETTINGS.seedColor.toLowerCase());

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);

