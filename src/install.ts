/**
 * PWA「安装到主屏幕」支持
 * - 捕获浏览器发出的 beforeinstallprompt，缓存事件以便用户主动触发
 * - 在 iOS Safari 等不触发该事件的平台上，isInstallable() 恒为 false，
 *   此时应由界面引导用户使用浏览器自带的「添加到主屏幕」
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallOutcome = 'installed' | 'dismissed' | 'unavailable';

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((cb) => cb());
}

/** 应用启动时调用一次，注册全局捕获逻辑（建议在 main.ts 中尽早调用） */
export function initInstall(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // 阻止浏览器默认的自动迷你信息栏，改为由我们自己的 UI 触发
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** 订阅「可安装状态」变化；返回取消订阅函数 */
export function onInstallAvailable(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 当前是否可触发原生安装提示（iOS Safari 不会触发，始终为 false） */
export function isInstallable(): boolean {
  return deferred !== null;
}

/**
 * 触发原生安装提示。
 * - 用户接受 → 'installed'
 * - 用户拒绝 → 'dismissed'
 * - 当前环境不可安装（如已安装 / iOS Safari）→ 'unavailable'
 */
export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    emit();
    return choice.outcome === 'accepted' ? 'installed' : 'dismissed';
  } catch {
    deferred = null;
    emit();
    return 'dismissed';
  }
}
