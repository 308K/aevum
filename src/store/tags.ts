/**
 * 全局标签（分类）库：设置页统一管理，事件以 id 引用
 * 支持新增 / 删除 / 重命名 / 改色，并负责旧数据的标签迁移
 */
import type { AevumEvent, TagDef } from '../types.js';
import { PRESET_TAGS } from '../types.js';
import { t } from '../i18n.js';
import type { LocaleDict } from '../locales/zh-CN.js';

export type { TagDef } from '../types.js';

const STORAGE_KEY = 'aevum.tags.v1';

type Listener = (tags: TagDef[]) => void;

function load(): TagDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as TagDef[];
    }
  } catch {
    /* 忽略损坏数据 */
  }
  // 首次运行：用内置预设作为初始标签库
  return PRESET_TAGS.map((p) => ({
    id: `preset_${p.key}`,
    label: p.key,
    color: p.color,
    preset: true,
  }));
}

let tags: TagDef[] = load();
const listeners = new Set<Listener>();

// 首次运行：把预设种子持久化
if (typeof localStorage !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
  persist();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

function emit() {
  persist();
  listeners.forEach((fn) => fn(tags));
}

export function getTags(): TagDef[] {
  return tags;
}

export function getTag(id: string): TagDef | undefined {
  return tags.find((tg) => tg.id === id);
}

function newId(): string {
  return `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function addTag(label: string, color: string): TagDef {
  const def: TagDef = { id: newId(), label: label.trim().slice(0, 24), color };
  tags = [...tags, def];
  emit();
  return def;
}

export function updateTag(id: string, patch: { label?: string; color?: string }): void {
  let changed = false;
  tags = tags.map((tg) => {
    if (tg.id !== id) return tg;
    changed = true;
    return {
      ...tg,
      ...patch,
      label: patch.label !== undefined ? patch.label.trim().slice(0, 24) : tg.label,
    };
  });
  if (changed) emit();
}

export function deleteTag(id: string): void {
  const before = tags.length;
  tags = tags.filter((tg) => tg.id !== id);
  if (tags.length !== before) emit();
}

/** 整体替换（用于备份导入） */
export function replaceTags(list: TagDef[]): void {
  tags = [...list];
  emit();
}

export function onTagsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 仅供测试：重置内存缓存使其重新从 localStorage 加载 */
export function __resetForTesting(): void {
  tags = load();
}

/** 显示名：内置标签存 i18n key，统一用 t() 解析；普通字符串原样返回 */
export function tagDisplay(tag: TagDef): string {
  return t(tag.label as keyof LocaleDict);
}

/** 把事件携带的标签（旧格式对象 / 新格式 id）归一化为 id 列表 */
export function normalizeEventTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const out: string[] = [];
  for (const item of rawTags) {
    let id: string | undefined;
    if (typeof item === 'string') {
      // 新格式：直接作为 id 保留（不存在的 id 在解析时丢弃）
      id = item;
    } else if (item && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
      // 旧格式：{label,color} → 合并进标签库并返回 id（同名合并）
      id = ensureTag(String((item as { label: string }).label), String((item as { color?: string }).color));
    }
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

/** 按显示名匹配已有标签（含预设的翻译名），否则新建 */
function ensureTag(label: string, color: string): string {
  const n = normLabel(label);
  const existing = tags.find((tg) => normLabel(tg.label) === n || normLabel(t(tg.label as keyof LocaleDict)) === n);
  if (existing) return existing.id;
  return addTag(label, color).id;
}

/** 把事件引用的标签 id 解析为标签定义（丢弃已删除的 id） */
export function resolveEventTags(ev: AevumEvent): TagDef[] {
  if (!ev.tags || ev.tags.length === 0) return [];
  const out: TagDef[] = [];
  for (const id of ev.tags) {
    const tg = getTag(id);
    if (tg) out.push(tg);
  }
  return out;
}
