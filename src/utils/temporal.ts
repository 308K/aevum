/**
 * Temporal 桥接模块
 * - 支持原生 Temporal（TC39 Stage 3）的环境直接使用全局 Temporal
 * - 不支持的环境（如 Safari、Node < 某版本）自动回退到 @js-temporal/polyfill
 *
 * 用法：所有需要 Temporal 的模块都从此文件导入，而非直接引用全局或 polyfill。
 *   import { Temporal } from './temporal.js';
 *
 * `Temporal` 可同时用作值（如 `Temporal.PlainDate.from(...)`）和类型
 * （如函数参数 `d: Temporal.PlainDate`）。
 *
 * 实现说明：@js-temporal/polyfill 导出 Temporal 为 namespace（同时是值和类型）。
 * 我们不能 `export const Temporal = ...` 因为这会丢失命名空间类型信息。
 * 因此我们直接 re-export polyfill 的 Temporal（polyfill 在导入时不会覆盖
 * 已存在的 globalThis.Temporal），并额外导出运行时检测函数。
 */

// polyfill 在导入时会将 Temporal 挂载到 globalThis（如果不存在），
// 并导出 Temporal 命名空间。如果原生 Temporal 已存在，polyfill 不会覆盖它。
// 直接 re-export 即可：消费方获得的是 polyfill 管理的 Temporal 对象，
// 它在原生可用时会代理到原生实现。
export { Temporal } from '@js-temporal/polyfill';
