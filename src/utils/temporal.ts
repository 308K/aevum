/**
 * Temporal 桥接模块
 * - 支持原生 Temporal（TC39 Stage 3）的环境直接使用全局 Temporal
 * - 不支持的环境（如 Safari、Bun）自动回退到 @js-temporal/polyfill
 * - 按日历 ID 粒度选择实现：某些浏览器原生 Temporal 禁用了特定日历
 *   （如 Firefox 139-148 禁用了 islamic / islamic-umalqura），对这些日历
 *   自动回退到 polyfill 实现。
 *
 * 用法：所有需要 Temporal 的模块都从此文件导入，而非直接引用全局或 polyfill。
 *   import { Temporal } from './temporal.js';
 *
 * `Temporal` 可同时用作值（如 `Temporal.PlainDate.from(...)`）和类型
 * （如函数参数 `d: Temporal.PlainDate`）。
 */

import { Temporal as PolyfillTemporal } from '@js-temporal/polyfill';

const _native = (globalThis as unknown as { Temporal?: typeof PolyfillTemporal }).Temporal;

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
 * 测试 polyfill 是否支持指定的日历 ID。
 * 首次调用时执行，结果缓存。
 */
let _polyfillTested = false;
let _polyfillSupportsIslamic = false;

function polyfillSupportsCalendar(calId: string): boolean {
  if (calId !== 'islamic-umalqura' && calId !== 'islamic') return true;
  if (!_polyfillTested) {
    try {
      PolyfillTemporal.PlainDate.from({ calendar: 'islamic-umalqura', year: 2026, month: 1, day: 1 });
      _polyfillSupportsIslamic = true;
    } catch {
      _polyfillSupportsIslamic = false;
    }
    _polyfillTested = true;
  }
  return _polyfillSupportsIslamic;
}

/**
 * 日历实现缓存：calId → 使用原生还是 polyfill
 */
const _calImplCache = new Map<string, boolean>();

/**
 * 判断给定日历 ID 应使用原生 Temporal 还是 polyfill。
 * - 无原生 Temporal → 始终用 polyfill
 * - 原生支持该日历 → 用原生
 * - 原生不支持但 polyfill 支持 → 用 polyfill
 * - 两者都不支持 → 用原生（调用方自行 catch）
 */
export function useNativeForCalendar(calId: string): boolean {
  const cached = _calImplCache.get(calId);
  if (cached !== undefined) return cached;

  let result: boolean;
  if (!_native) {
    result = false;
  } else if (nativeSupportsCalendar(calId)) {
    result = true;
  } else if (polyfillSupportsCalendar(calId)) {
    result = false;
  } else {
    result = true; // 两者都不支持，用原生（让调用方看到原生错误）
  }
  _calImplCache.set(calId, result);
  return result;
}

/**
 * 获取指定日历对应的 Temporal 实现（原生或 polyfill）。
 */
export function getTemporalForCalendar(calId: string): typeof PolyfillTemporal {
  return useNativeForCalendar(calId) && _native ? _native : PolyfillTemporal;
}

/**
 * 获取默认的 Temporal 实现（用于不指定日历的场景，如 PlainDate.from 不带 calendar）。
 * 优先原生，回退 polyfill。
 */
export const Temporal: typeof PolyfillTemporal = _native ?? PolyfillTemporal;

// 使用 TypeScript 的 namespace merging：
// 1) `export const Temporal` 提供运行时值（供 `Temporal.PlainDate.from()` 调用）
// 2) `export namespace Temporal` 重新导出 polyfill 的类型（供 `d: Temporal.PlainDate` 注解）
// 这样消费方 `import { Temporal }` 后可以同时使用值和类型。
export namespace Temporal {
  export type PlainDate = PolyfillTemporal.PlainDate;
  export type PlainDateTime = PolyfillTemporal.PlainDateTime;
  export type PlainTime = PolyfillTemporal.PlainTime;
  export type Duration = PolyfillTemporal.Duration;
  export type Instant = PolyfillTemporal.Instant;
  export type ZonedDateTime = PolyfillTemporal.ZonedDateTime;
}
