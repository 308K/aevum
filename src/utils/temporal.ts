/**
 * Temporal 桥接模块
 * - 支持原生 Temporal（TC39 Stage 3）的环境直接使用全局 Temporal
 * - 不支持的环境（如 Safari、Bun）自动回退到 @js-temporal/polyfill
 *
 * 用法：所有需要 Temporal 的模块都从此文件导入，而非直接引用全局或 polyfill。
 *   import { Temporal } from './temporal.js';
 *
 * `Temporal` 可同时用作值（如 `Temporal.PlainDate.from(...)`）和类型
 * （如函数参数 `d: Temporal.PlainDate`）。
 *
 * 实现说明：
 * - 当原生 globalThis.Temporal 存在时，优先使用原生实现（polyfill 的 chinese
 *   calendar 实现存在 bug：闰月 monthCode 处理不一致，会抛出
 *   "Unexpected leap month suffix: Mo6" 错误）。
 * - 当原生 Temporal 不存在时（Safari、Bun），polyfill 会在导入时自动挂载到
 *   globalThis，我们从 globalThis 取用即可。
 * - 类型来自 polyfill 的 namespace 导出（与原生 API 类型一致）。
 */

// 导入 polyfill：确保它被打包进产物（供无原生 Temporal 的环境使用），
// 同时获取 Temporal 命名空间的类型信息。
import { Temporal as PolyfillTemporal } from '@js-temporal/polyfill';

// 优先使用原生 globalThis.Temporal，回退到 polyfill 导出的 Temporal。
const _globalTemporal = (globalThis as unknown as { Temporal?: typeof PolyfillTemporal }).Temporal;
const _resolved = _globalTemporal ?? PolyfillTemporal;

// 使用 TypeScript 的 namespace merging：
// 1) `export const Temporal` 提供运行时值（供 `Temporal.PlainDate.from()` 调用）
// 2) `export namespace Temporal` 重新导出 polyfill 的类型（供 `d: Temporal.PlainDate` 注解）
// 这样消费方 `import { Temporal }` 后可以同时使用值和类型。
export const Temporal: typeof PolyfillTemporal = _resolved;

// 重新导出类型命名空间，使 `Temporal.PlainDate` 可用作类型注解。
// 注意：这不是 `export type { Temporal }`（那会与 const 冲突），
// 而是用 namespace 声明将类型成员透传给消费方。
export namespace Temporal {
  export type PlainDate = PolyfillTemporal.PlainDate;
  export type PlainDateTime = PolyfillTemporal.PlainDateTime;
  export type PlainTime = PolyfillTemporal.PlainTime;
  export type Duration = PolyfillTemporal.Duration;
  export type Instant = PolyfillTemporal.Instant;
  export type ZonedDateTime = PolyfillTemporal.ZonedDateTime;
  // Calendar 和 Now 在 polyfill 中是值而非类型，这里不重新导出它们。
  // 如果需要 Calendar 类型，请直接从 polyfill 导入。
}
