import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types.js';
import { getSettings, __resetForTesting as resetSettings } from '../src/store/settings.js';
import {
  addCustomTheme,
  removeCustomTheme,
  renameCustomTheme,
  setCustomThemeColor,
  applyCustomTheme,
  getCustomThemes,
} from '../src/store/themes.js';

beforeEach(() => {
  localStorage.clear();
  resetSettings();
});

describe('自定义主题色：增 / 删 / 改 / 去重', () => {
  it('初始色库为空', () => {
    expect(getCustomThemes().length).toBe(0);
  });

  it('新增 A 返回 added=true', () => {
    const a = addCustomTheme('A', '#123456');
    expect(a.added).toBe(true);
  });

  it('色库长度=1', () => {
    addCustomTheme('A', '#123456');
    expect(getCustomThemes().length).toBe(1);
  });

  it('新增后当前生效色=新色', () => {
    addCustomTheme('A', '#123456');
    expect(getSettings().seedColor.toLowerCase()).toBe('#123456');
  });

  it('重复色返回 added=false', () => {
    addCustomTheme('A', '#123456');
    const dup = addCustomTheme('B', '#123456');
    expect(dup.added).toBe(false);
  });

  it('色库长度仍为 1（未产生重复）', () => {
    addCustomTheme('A', '#123456');
    addCustomTheme('B', '#123456');
    expect(getCustomThemes().length).toBe(1);
  });

  it('改 A 色值生效', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    expect(getCustomThemes().find((t) => t.id === a.id)?.color.toLowerCase()).toBe('#000000');
  });

  it('改当前色同步 seedColor', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    expect(getSettings().seedColor.toLowerCase()).toBe('#000000');
  });

  it('新增 C 后当前生效色=C', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    expect(c.added).toBe(true);
    expect(getCustomThemes().length).toBe(2);
    expect(getSettings().seedColor.toLowerCase()).toBe('#abcdef');
  });

  it('C 改名生效', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    renameCustomTheme(c.id, 'RenamedC');
    expect(getCustomThemes().find((t) => t.id === c.id)?.name).toBe('RenamedC');
  });

  it('改 C 色值同步 seedColor', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    setCustomThemeColor(c.id, '#111111');
    expect(getCustomThemes().find((t) => t.id === c.id)?.color.toLowerCase()).toBe('#111111');
    expect(getSettings().seedColor.toLowerCase()).toBe('#111111');
  });

  it('删除当前色 C 回退默认种子色', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    removeCustomTheme(c.id);
    expect(getCustomThemes().length).toBe(1);
    expect(getSettings().seedColor.toLowerCase()).toBe(DEFAULT_SETTINGS.seedColor.toLowerCase());
  });

  it('应用 A 后 seedColor=A 色', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    removeCustomTheme(c.id);
    applyCustomTheme(a.id);
    expect(getSettings().seedColor.toLowerCase()).toBe('#000000');
  });

  it('删除 A 后色库=0 且回退默认', () => {
    const a = addCustomTheme('A', '#123456');
    setCustomThemeColor(a.id, '#000000');
    const c = addCustomTheme('C', '#abcdef');
    removeCustomTheme(c.id);
    applyCustomTheme(a.id);
    removeCustomTheme(a.id);
    expect(getCustomThemes().length).toBe(0);
    expect(getSettings().seedColor.toLowerCase()).toBe(DEFAULT_SETTINGS.seedColor.toLowerCase());
  });
});
