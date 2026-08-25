/**
 * Temporal 桥接模块
 * - 支持原生 Temporal（TC39 Stage 3）的环境直接使用全局 Temporal
 * - 不支持的环境（如 Safari、Bun）自动回退到 @js-temporal/polyfill（动态导入）
 * - 按日历 ID 粒度选择实现：某些浏览器原生 Temporal 禁用了特定日历
 *   （如 Firefox 139-148 禁用了 islamic / islamic-umalqura），对这些日历
 *   自动回退到 polyfill 实现。
 *
 * 性能优化：polyfill 通过动态 import() 按需加载。有原生 Temporal 的浏览器
 * （Chrome 141+、Edge 141+）完全不会下载 polyfill 代码（约 200KB+ gzip）。
 * 应用启动时调用 ensureTemporalReady() 确保在渲染前就绪。
 *
 * 用法：所有需要 Temporal 的模块都从此文件导入，而非直接引用全局或 polyfill。
 *   import { Temporal } from './temporal.js';
 *
 * `Temporal` 可同时用作值（如 `Temporal.PlainDate.from(...)`）和类型
 * （如函数参数 `d: Temporal.PlainDate`）。
 */

import type { Temporal as PolyfillTemporalType } from '@js-temporal/polyfill';

const _native = (globalThis as unknown as { Temporal?: typeof PolyfillTemporalType }).Temporal;

/**
 * polyfill 模块的动态导入 Promise（仅在需要时触发）。
 * 有原生 Temporal 且所有日历都支持的浏览器永远不会执行此导入。
 */
let _polyfillPromise: Promise<typeof PolyfillTemporalType> | null = null;
let _polyfillLoaded: typeof PolyfillTemporalType | null = null;

function loadPolyfill(): Promise<typeof PolyfillTemporalType> {
  if (!_polyfillPromise) {
    _polyfillPromise = import('@js-temporal/polyfill').then((m) => {
      _polyfillLoaded = m.Temporal;
      return m.Temporal;
    });
  }
  return _polyfillPromise;
}

/**
 * 判断原生 Temporal 是否支持指定的日历 ID。
 * 通过尝试构造一个日期来探测。
 */
function nativeSupportsCalendar(calId: string): boolean {
  if (!_native) return false;
  try {
    _native.PlainDate.from({ calendar: calId, year: 2026, month: 1, day: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 日历实现缓存：calId → 使用原生还是 polyfill
 */
const _calImplCache = new Map<string, boolean>();

/**
 * 判断给定日历 ID 应使用原生 Temporal 还是 polyfill。
 * - 无原生 Temporal → 始终用 polyfill
 * - 原生支持该日历 → 用原生
 * - 原生不支持 → 用 polyfill
 */
export function useNativeForCalendar(calId: string): boolean {
  const cached = _calImplCache.get(calId);
  if (cached !== undefined) return cached;

  let result: boolean;
  if (!_native) {
    result = false;
  } else if (nativeSupportsCalendar(calId)) {
    result = true;
  } else {
    result = false;
  }
  _calImplCache.set(calId, result);
  return result;
}

/**
 * 获取指定日历对应的 Temporal 实现（原生或 polyfill）。
 * 同步版本：polyfill 必须已通过 ensureTemporalReady() 加载完成。
 */
export function getTemporalForCalendar(calId: string): typeof PolyfillTemporalType {
  if (useNativeForCalendar(calId) && _native) return _native;
  return _polyfillLoaded!;
}

/**
 * 检测当前浏览器是否需要 polyfill。
 * 无原生 Temporal，或原生 Temporal 不支持某些日历时需要。
 */
function needsPolyfill(): boolean {
  if (!_native) return true;
  const cals = ['gregory', 'chinese', 'islamic-umalqura', 'islamic-civil', 'islamic-tbla', 'islamic-rgsa', 'hebrew', 'persian', 'buddhist', 'japanese', 'roc', 'indian', 'ethiopic', 'ethiopic-amete-alem', 'coptic', 'dangi'];
  return cals.some((c) => !nativeSupportsCalendar(c));
}

/**
 * 确保 Temporal polyfill 已加载完成（如果需要的话）。
 * 在应用初始化时调用（main.ts 的 bootstrap 阶段），确保后续同步访问不会出错。
 * 如果浏览器有原生 Temporal 且所有日历都支持，此函数立即返回（不触发任何网络请求）。
 */
export async function ensureTemporalReady(): Promise<void> {
  if (_native && !needsPolyfill()) return;
  await loadPolyfill();
}

/**
 * 获取当前激活的 Temporal 实现（原生或已加载的 polyfill）。
 */
function activeImpl(): typeof PolyfillTemporalType {
  return _native ?? _polyfillLoaded!;
}

/**
 * Temporal 运行时值——通过 Proxy 惰性转发到原生或 polyfill 实现。
 * 确保在 ensureTemporalReady() 完成后才被访问（应用 bootstrap 流程保证）。
 */
export const Temporal: typeof PolyfillTemporalType = new Proxy(
  {} as typeof PolyfillTemporalType,
  {
    get(_target, prop: string | symbol) {
      return Reflect.get(activeImpl(), prop);
    },
    has(_target, prop: string | symbol) {
      return Reflect.has(activeImpl(), prop);
    },
    ownKeys() {
      return Reflect.ownKeys(activeImpl());
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      return Reflect.getOwnPropertyDescriptor(activeImpl(), prop);
    },
  }
);

// 使用 TypeScript 的 namespace merging：
// 1) `export const Temporal` 提供运行时值（供 `Temporal.PlainDate.from()` 调用）
// 2) `export namespace Temporal` 重新导出 polyfill 的类型（供 `d: Temporal.PlainDate` 注解）
// 这样消费方 `import { Temporal }` 后可以同时使用值和类型。
export namespace Temporal {
  export type PlainDate = PolyfillTemporalType.PlainDate;
  export type PlainDateTime = PolyfillTemporalType.PlainDateTime;
  export type PlainTime = PolyfillTemporalType.PlainTime;
  export type Duration = PolyfillTemporalType.Duration;
  export type Instant = PolyfillTemporalType.Instant;
  export type ZonedDateTime = PolyfillTemporalType.ZonedDateTime;
}
