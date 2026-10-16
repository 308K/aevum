/**
 * 应用更新状态机（纯函数、无 DOM）
 *
 * 浏览器侧的驱动逻辑在 src/update.ts（封装 virtual:pwa-register），
 * 本文件只负责状态迁移规则，便于 Vitest 直接回归。
 *
 * 设计要点：
 * - 「检查失败」不应盖掉「有可用更新」这一更有价值的信息 → 失败时保留 available
 * - 「检查中」不打断待应用的更新（避免按钮闪烁/文案抖动）
 * - 自动检查需限流：lastCheckedAt 为 0 表示从未检查过，不触发自动检查
 */

/** 更新状态 */
export type UpdateStatus =
  | 'idle'          // 未检查 / 已确认无更新
  | 'checking'      // 正在检查
  | 'available'     // 检测到新版本（SW 已下载完成，等待激活）
  | 'applying'      // 正在应用更新（即将刷新页面）
  | 'error'         // 检查失败（多为离线）
  | 'unsupported';  // 当前环境不支持 Service Worker

export interface UpdateState {
  status: UpdateStatus;
  /** 最近一次检查结束的时间戳；0 表示从未检查过 */
  lastCheckedAt: number;
}

export const INITIAL_UPDATE_STATE: UpdateState = { status: 'idle', lastCheckedAt: 0 };

/** 自动检查的最小间隔（页面重新可见时触发） */
export const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type UpdateAction =
  | { type: 'check-start' }
  | { type: 'check-done'; now: number }
  | { type: 'check-failed'; now: number }
  | { type: 'need-refresh' }
  | { type: 'apply-start' }
  | { type: 'unsupported' };

/** 状态迁移；不需要变更时返回入参 state 本身（同一引用，便于调用方跳过通知） */
export function reduceUpdateState(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case 'check-start':
      // 已有待应用的更新时不再回到 checking（横幅按钮不闪烁）
      return state.status === 'available' ? state : { ...state, status: 'checking' };
    case 'check-done':
      return state.status === 'available' ? state : { status: 'idle', lastCheckedAt: action.now };
    case 'check-failed':
      // 检查失败不应盖掉「有可用更新」这一更有价值的信息
      return state.status === 'available' ? state : { status: 'error', lastCheckedAt: action.now };
    case 'need-refresh':
      return { ...state, status: 'available' };
    case 'apply-start':
      return { ...state, status: 'applying' };
    case 'unsupported':
      return { ...state, status: 'unsupported' };
  }
}

/** 是否到达自动检查时间（lastCheckedAt 为 0 时不自动检查） */
export function shouldAutoCheck(
  lastCheckedAt: number,
  now: number,
  intervalMs: number = AUTO_CHECK_INTERVAL_MS,
): boolean {
  return lastCheckedAt > 0 && now - lastCheckedAt >= intervalMs;
}

/** 各状态对应的 i18n 键（在测试中断言双语字典均已覆盖，避免漏键显示键名） */
export type UpdateStatusKey =
  | 'updateStatusIdle'
  | 'updateStatusChecking'
  | 'updateStatusAvailable'
  | 'updateStatusApplying'
  | 'updateStatusError'
  | 'updateStatusUnsupported';

export const UPDATE_STATUS_KEYS: Record<UpdateStatus, UpdateStatusKey> = {
  idle: 'updateStatusIdle',
  checking: 'updateStatusChecking',
  available: 'updateStatusAvailable',
  applying: 'updateStatusApplying',
  error: 'updateStatusError',
  unsupported: 'updateStatusUnsupported',
};
