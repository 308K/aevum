/**
 * 应用更新检测与提醒（浏览器侧）
 *
 * 基于 vite-plugin-pwa 的 Service Worker：vite.config.ts 中 registerType 设为 'prompt'，
 * 新版本 SW 下载完成后进入 waiting 状态而不会自动接管，由本模块决定何时提醒用户。
 *
 * 能力：
 * - registerSW({ immediate: true, onNeedRefresh }) 检测到新版本 → 状态置为 available
 * - applyUpdate() 调用 registerSW 返回的 updateServiceWorker() 发 SKIP_WAITING 消息，
 *   新 SW 接管后 workbox-window 触发 controlling 事件并自动 reload
 * - checkForUpdate() 手动检查（设置页按钮）
 * - 页面重新可见且距上次检查超过 1 小时时自动检查一次
 */
import { registerSW } from 'virtual:pwa-register';
import {
  INITIAL_UPDATE_STATE,
  reduceUpdateState,
  shouldAutoCheck,
  type UpdateAction,
  type UpdateState,
} from './utils/update-state.js';

type Listener = (state: UpdateState) => void;

let state: UpdateState = INITIAL_UPDATE_STATE;
const listeners = new Set<Listener>();
/** registerSW 返回的更新回调（触发 skipWaiting + reload） */
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

function emit(): void {
  listeners.forEach((fn) => fn(state));
}

function dispatch(action: UpdateAction): void {
  const next = reduceUpdateState(state, action);
  if (next === state) return;
  state = next;
  emit();
}

export function getUpdateState(): UpdateState {
  return state;
}

/** 订阅更新状态变化；返回取消订阅函数 */
export function onUpdateState(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 当前环境是否支持 Service Worker */
export function isUpdateSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * 检查更新。返回是否真的发起了检查（false 表示不支持 SW 或已有检查在进行）。
 * 离线时 registration.update() 会 reject，状态转为 error，由调用方决定如何提示。
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!isUpdateSupported()) {
    dispatch({ type: 'unsupported' });
    return false;
  }
  if (state.status === 'checking') return false;
  dispatch({ type: 'check-start' });
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      dispatch({ type: 'check-failed', now: Date.now() });
      return false;
    }
    await reg.update();
    dispatch({ type: 'check-done', now: Date.now() });
  } catch {
    dispatch({ type: 'check-failed', now: Date.now() });
  }
  return true;
}

/** 应用更新：通知 waiting 中的 SW 跳过等待，接管后自动刷新页面 */
export async function applyUpdate(): Promise<void> {
  dispatch({ type: 'apply-start' });
  try {
    await updateServiceWorker?.(true);
  } catch {
    // 极端情况下 SW 未就绪，退回整页刷新以确保拿到新版本
    location.reload();
  }
}

/** 注册 SW 并开启更新检测（应用启动时调用一次） */
export function initUpdateWatcher(): void {
  if (!isUpdateSupported()) {
    dispatch({ type: 'unsupported' });
    return;
  }
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => dispatch({ type: 'need-refresh' }),
    onRegisterError: (err) => {
      console.error('[Aevum] Service Worker 注册失败:', err);
    },
  });
  // 页面重新可见时按 1 小时间隔自动检查一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!shouldAutoCheck(state.lastCheckedAt, Date.now())) return;
    void checkForUpdate();
  });
}

/** 仅供测试：重置内存状态 */
export function __resetForTesting(): void {
  state = INITIAL_UPDATE_STATE;
  listeners.clear();
  updateServiceWorker = null;
}
