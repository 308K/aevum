/**
 * Temporal 桥接模块
 * - 支持原生 Temporal（TC39 Stage 3）的环境直接使用全局 Temporal
 * - 不支持的环境（如 Safari）自动回退到 temporal-polyfill（动态导入）
 * - 按日历 ID 粒度选择实现：某些浏览器原生 Temporal 禁用了特定日历
 *   （如 Firefox 139-148 禁用了 islamic / islamic-umalqura），对这些日历
 *   自动回退到 polyfill 实现。
 *
 * polyfill 选型（2026-08-30）：temporal-polyfill（fullcalendar 系）替代
 * @js-temporal/polyfill。原因：旧 polyfill 的 chinese/dangi 闰月转换抛
 * "Unexpected leap month suffix"、ethiopic/coptic 的 era 匹配抛错，导致 Safari
 * （无原生 Temporal）下这些历法完全不可用；temporal-polyfill 的日历数据基于
 * 宿主 Intl.DateTimeFormat（Safari 14.1+ 均支持），且体积更小（23KB vs 52KB
 * gzip）、规范日期更新（2026-08 vs 2025-03）。使用其 /full/implementation
 * 入口（强制非原生实现 + 全部日历系统）。
 *
 * 性能优化：polyfill 通过动态 import() 按需加载。有原生 Temporal 且所有日历
 * 都支持的浏览器（Chrome 144+、Edge 144+、Bun 1.4+）完全不会下载 polyfill。
 * 应用启动时调用 ensureTemporalReady() 确保在渲染前就绪。
 *
 * 用法：所有需要 Temporal 的模块都从此文件导入，而非直接引用全局或 polyfill。
 *   import { Temporal } from './temporal.js';
 *
 * `Temporal` 可同时用作值（如 `Temporal.PlainDate.from(...)`）和类型
 * （如函数参数 `d: Temporal.PlainDate`）。
 */

import type { Temporal as PolyfillTemporalType } from 'temporal-polyfill/full/implementation';

/**
 * Temporal 运行时值的形态（仅声明项目实际用到的静态成员）。
 * temporal-spec 的 `Temporal` namespace 是纯类型（无值侧），故值类型手动声明。
 */
interface TemporalRuntime {
  PlainDate: {
    from(item: PolyfillTemporalType.PlainDateLike): PolyfillTemporalType.PlainDate;
    compare(
      a: PolyfillTemporalType.PlainDateLike,
      b: PolyfillTemporalType.PlainDateLike
    ): number;
  };
  Now: {
    plainDateISO(timeZone?: PolyfillTemporalType.TimeZoneLike): PolyfillTemporalType.PlainDate;
  };
}

const _native: TemporalRuntime | undefined = (globalThis as unknown as { Temporal?: TemporalRuntime }).Temporal;

/**
 * polyfill 模块的动态导入 Promise（仅在需要时触发）。
 * 有原生 Temporal 且所有日历都支持的浏览器永远不会执行此导入。
 */
let _polyfillPromise: Promise<TemporalRuntime> | null = null;
let _polyfillLoaded: TemporalRuntime | null = null;

function loadPolyfill(): Promise<TemporalRuntime> {
  if (!_polyfillPromise) {
    _polyfillPromise = import('temporal-polyfill/full/implementation').then((m) => {
      _polyfillLoaded = m.Temporal as TemporalRuntime;
      return _polyfillLoaded;
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
    _native.PlainDate.from({ calendar: calId, year: 2026, month: 1, day: 1 } as PolyfillTemporalType.PlainDateLike);
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
export function getTemporalForCalendar(calId: string): TemporalRuntime {
  if (useNativeForCalendar(calId) && _native) return _native;
  return _polyfillLoaded!;
}

/**
 * 检测当前浏览器是否需要 polyfill。
 * 无原生 Temporal，或原生 Temporal 不支持某些日历时需要。
 * 注意：列表须与 calendar.ts temporalCalId() 映射后的实际日历集合一致——
 * 'islamic-rgsa' 已映射到 islamic-umalqura，无需单独探测（原生 V8/ICU 不支持
 * rgsa 标识符，探测它会导致 Chrome/Edge 也白白加载 polyfill）。
 */
function needsPolyfill(): boolean {
  if (!_native) return true;
  const cals = ['gregory', 'chinese', 'islamic-umalqura', 'islamic-civil', 'islamic-tbla', 'hebrew', 'persian', 'buddhist', 'japanese', 'roc', 'indian', 'ethiopic', 'ethiopic-amete-alem', 'coptic', 'dangi'];
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
function activeImpl(): TemporalRuntime {
  return _native ?? _polyfillLoaded!;
}

/**
 * Temporal 运行时值——通过 Proxy 惰性转发到原生或 polyfill 实现。
 * 确保在 ensureTemporalReady() 完成后才被访问（应用 bootstrap 流程保证）。
 */
export const Temporal: TemporalRuntime = new Proxy(
  {} as TemporalRuntime,
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
