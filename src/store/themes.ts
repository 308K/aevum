/**
 * 自定义主题色管理
 * - 在「当前生效种子色（seedColor）」之上维护一个可增 / 删 / 改的命名色库（customThemes）
 * - 所有操作即时持久化并通知订阅者（复用 settings 存储）
 * - 集中处理「当前生效色」与「色库」的一致性：改色/删色时若影响当前生效色则同步回退
 */
import { DEFAULT_SETTINGS, type AevumSettings, type CustomTheme } from '../types.js';
import { getSettings, updateSettings } from './settings.js';

function newId(): string {
  return `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 当前色库 */
export function getCustomThemes(): CustomTheme[] {
  return getSettings().customThemes ?? [];
}

/** 某颜色是否已被色库中某个主题使用（不区分大小写） */
export function hasColor(hex: string): boolean {
  const h = (hex || '').toLowerCase();
  return getCustomThemes().some((t) => t.color.toLowerCase() === h);
}

/**
 * 新增并立即应用一个自定义主题色。
 * 若同色已存在于色库，则直接应用已有项、不再产生重复条目。
 * @returns added=true 表示新建；added=false 表示命中了已存在的同色主题
 */
export function addCustomTheme(name: string, color: string): { added: boolean; id: string } {
  const trimmed = (name ?? '').trim();
  const existing = getCustomThemes().find((t) => t.color.toLowerCase() === color.toLowerCase());
  if (existing) {
    updateSettings({ seedColor: color });
    return { added: false, id: existing.id };
  }
  const theme: CustomTheme = { id: newId(), name: trimmed.slice(0, 24), color };
  const customThemes = [...getCustomThemes(), theme];
  updateSettings({ customThemes, seedColor: color });
  return { added: true, id: theme.id };
}

/** 删除一个自定义主题色；若删除的是当前生效色，回退到默认种子色 */
export function removeCustomTheme(id: string): void {
  const list = getCustomThemes();
  const target = list.find((t) => t.id === id);
  if (!target) return;
  const customThemes = list.filter((t) => t.id !== id);
  const patch: Partial<AevumSettings> = { customThemes };
  if (target.color.toLowerCase() === getSettings().seedColor.toLowerCase()) {
    patch.seedColor = DEFAULT_SETTINGS.seedColor;
  }
  updateSettings(patch);
}

/** 重命名（允许空名，界面回退显示颜色值） */
export function renameCustomTheme(id: string, name: string): void {
  const customThemes = getCustomThemes().map((t) =>
    t.id === id ? { ...t, name: name.trim().slice(0, 24) } : t
  );
  updateSettings({ customThemes });
}

/** 修改某主题的种子色；若该主题当前生效，则同步更新 seedColor */
export function setCustomThemeColor(id: string, color: string): void {
  const list = getCustomThemes();
  const target = list.find((t) => t.id === id);
  if (!target) return;
  const wasActive = target.color.toLowerCase() === getSettings().seedColor.toLowerCase();
  const customThemes = list.map((t) => (t.id === id ? { ...t, color } : t));
  const patch: Partial<AevumSettings> = { customThemes };
  if (wasActive) patch.seedColor = color;
  updateSettings(patch);
}

/** 应用某个已保存的主题色（点击 ✓ / 色块） */
export function applyCustomTheme(id: string): void {
  const theme = getCustomThemes().find((t) => t.id === id);
  if (theme) updateSettings({ seedColor: theme.color });
}
