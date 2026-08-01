/**
 * 数据备份：导入 / 导出
 * - 导出：全部事件（含事件级背景图）+ 设置为 JSON 文件下载
 * - 导入：严格校验并逐条清洗，覆盖当前事件；设置仅合并已知键
 */
import type { AevumEvent, AevumSettings, CalendarId, Granularity, Recurrence } from '../types.js';
import { DEFAULT_SETTINGS } from '../types.js';
import { getEvents, replaceAllEvents } from '../store/events.js';
import { getTags, replaceTags, normalizeEventTags } from '../store/tags.js';
import { getSettings, updateSettings } from '../store/settings.js';
import { CALENDAR_IDS } from './calendar.js';

const GRANULARITIES: Granularity[] = ['day', 'dhms', 'ymd', 'ywd', 'wd'];
const RECURRENCES: Recurrence[] = ['none', 'weekly', 'monthly', 'yearly'];

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 导出备份 */
export function exportBackup(): void {
  const data = {
    app: 'aevum',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    events: getEvents(),
    tags: getTags(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `aevum-backup-${todayStamp()}.json`);
}

/* ---------------- 导入清洗 ---------------- */

function sanitizeEvent(raw: unknown): AevumEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const date = typeof r.date === 'string' ? r.date : '';
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1) return null;

  const time = typeof r.time === 'string' && /^\d{2}:\d{2}$/.test(r.time) ? r.time : undefined;
  const calendar = CALENDAR_IDS.includes(r.calendar as CalendarId) ? (r.calendar as CalendarId) : 'gregory';
  const granularity = GRANULARITIES.includes(r.granularity as Granularity)
    ? (r.granularity as Granularity)
    : 'day';
  // 循环规则：缺省 / 非法值一律视为不循环（兼容无 recurrence 字段的旧备份）
  const recurrence = RECURRENCES.includes(r.recurrence as Recurrence)
    ? (r.recurrence as Recurrence)
    : 'none';
  const tags = normalizeEventTags(r.tags).slice(0, 8);

  const bgImage =
    typeof r.bgImage === 'string' && r.bgImage.startsWith('data:image/') && r.bgImage.length < 4_500_000
      ? r.bgImage
      : undefined;

  return {
    id: typeof r.id === 'string' && r.id ? r.id : `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 80),
    date,
    time,
    calendar,
    recurrence,
    granularity,
    tags,
    pinned: Boolean(r.pinned),
    bgImage,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  };
}

function pickKnownSettings(raw: unknown): Partial<AevumSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AevumSettings)[]) {
    if (!(key in r)) continue;
    const val = r[key];
    const def = DEFAULT_SETTINGS[key];
    // 数组型设置（customThemes）单独判定：typeof 无法区分 array / null / object
    if (Array.isArray(def)) {
      if (Array.isArray(val)) out[key] = val;
      continue;
    }
    if (val === null || typeof val !== typeof def) continue;
    out[key] = val;
  }
  return out as Partial<AevumSettings>;
}

/**
 * 导入备份文件：覆盖全部事件，合并已知设置键。
 * @returns 导入的事件数量
 * @throws 文件无法解析或格式无效
 */
export async function importBackup(file: File): Promise<number> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid-json');
  }
  const rawEvents = Array.isArray(parsed)
    ? parsed
    : (parsed as Record<string, unknown>)?.events;
  if (!Array.isArray(rawEvents)) throw new Error('invalid-shape');

  const events = rawEvents.map(sanitizeEvent).filter((e): e is AevumEvent => e !== null);
  // id 去重（后来的覆盖先来的）
  const dedup = new Map(events.map((e) => [e.id, e]));

  const root =
    !Array.isArray(parsed) && parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;

  // 若备份包含标签库，先整体替换，使导入事件引用的标签 id 有效
  // 旧备份无标签库时保留现有标签库，事件里失效的 id 由 resolveEventTags 展示时丢弃
  const rawTags = root?.tags;
  if (Array.isArray(rawTags)) {
    const valid = rawTags
      .filter((x): x is { id: string; label: string; color: string; preset?: boolean } => {
        const o = x as Record<string, unknown>;
        return (
          typeof o.id === 'string' &&
          typeof o.label === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(String(o.color))
        );
      })
      .map((o) => ({
        id: o.id,
        label: String(o.label).slice(0, 24),
        color: o.color,
        ...(o.preset ? { preset: true } : {}),
      }));
    replaceTags(valid);
  }

  replaceAllEvents([...dedup.values()]);

  if (root) {
    const settingsPatch = pickKnownSettings(root.settings);
    if (Object.keys(settingsPatch).length > 0) updateSettings(settingsPatch);
  }
  return dedup.size;
}
