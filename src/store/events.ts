/**
 * 事件数据存储（localStorage 持久化 + 订阅通知）
 * 纯前端方案：所有数据仅保存在用户本机浏览器
 */
import type { AevumEvent } from '../types.js';
import { effectiveEvent, parseBoundary } from '../utils/time-calc.js';
import { normalizeEventTags } from './tags.js';
import { getSettings } from './settings.js';

const STORAGE_KEY = 'aevum.events.v1';

type Listener = (events: AevumEvent[]) => void;

let events: AevumEvent[] = load();
const listeners = new Set<Listener>();

function load(): AevumEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // 迁移旧格式（标签为 {label,color} 对象）为标签 id 列表
        return (parsed as AevumEvent[]).map((e) => ({
          ...e,
          tags: normalizeEventTags((e as AevumEvent & { tags?: unknown }).tags),
        }));
      }
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return [];
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function emit() {
  persist();
  listeners.forEach((fn) => fn(events));
}

export function getEvents(): AevumEvent[] {
  return events;
}

export function getEvent(id: string): AevumEvent | undefined {
  return events.find((e) => e.id === id);
}

export function addEvent(ev: Omit<AevumEvent, 'id' | 'createdAt'>): AevumEvent {
  const item: AevumEvent = {
    ...ev,
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  events = [...events, item];
  emit();
  return item;
}

export function updateEvent(id: string, patch: Partial<Omit<AevumEvent, 'id'>>): boolean {
  const idx = events.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
  return true;
}

export function deleteEvent(id: string): boolean {
  const before = events.length;
  events = events.filter((e) => e.id !== id);
  if (events.length === before) return false;
  emit();
  return true;
}

/** 从所有事件中移除某个标签 id（删除标签时调用，保持数据一致） */
export function removeTagIdFromAllEvents(id: string): void {
  let changed = false;
  events = events.map((e) => {
    if (!e.tags.includes(id)) return e;
    changed = true;
    return { ...e, tags: e.tags.filter((t) => t !== id) };
  });
  if (changed) emit();
}

/** 整体替换（用于备份导入） */
export function replaceAllEvents(list: AevumEvent[]): void {
  events = [...list];
  emit();
}

export function onEventsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 排序：置顶优先，其次按目标日期升序（未来近者在前）
 *  循环事件使用「下一次发生日期」参与排序，避免锚点（可能是过去）乱序 */
export function sortedEvents(list: AevumEvent[]): AevumEvent[] {
  const boundary = parseBoundary(getSettings().dayBoundary);
  const now = Date.now();
  const s = getSettings();
  const keyOf = (e: AevumEvent) => {
    const eff = effectiveEvent(e, now, boundary, {
      solarOverflow: s.solarOverflow,
      lunarLeapStrategy: s.lunarLeapStrategy,
    });
    return eff.date + (eff.time ?? 'T00:00');
  };
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return keyOf(a).localeCompare(keyOf(b));
  });
}
