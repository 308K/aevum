/**
 * Material 3 风格 Snackbar（@material/web 无官方 Snackbar 组件，自实现）
 * 无障碍要点：
 * - 作为 ARIA 实时区域（role=status / alert + aria-live），内容变化时由读屏器播报
 * - aria-atomic 保证整条信息被完整朗读
 * - 关闭按钮为原生 <button>，可键盘聚焦与触发，带 aria-label 与可见焦点环
 * - 尊重 prefers-reduced-motion，关闭位移动画
 */
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { onThemeChange } from '../theme.js';

@customElement('app-snackbar')
export class AppSnackbar extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      left: 50%;
      bottom: calc(96px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 100;
      pointer-events: none;
      color-scheme: light dark;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 200px;
      max-width: min(480px, calc(100vw - 48px));
      padding: 12px 12px 12px 20px;
      border-radius: 12px;
      background: var(--md-sys-color-inverse-surface);
      color: var(--md-sys-color-inverse-on-surface);
      box-shadow: 0 3px 8px color-mix(in oklch, var(--md-sys-color-shadow) 30%, transparent);
      font-size: 0.875rem;
      line-height: 1.4;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .bar.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .msg {
      flex: 1 1 auto;
      min-width: 0;
    }
    .close {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: -4px -4px -4px 0;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      cursor: pointer;
      pointer-events: auto;
      transition: background 0.15s ease;
    }
    .close:hover {
      background: color-mix(in oklch, currentColor 12%, transparent);
    }
    .close:active {
      background: color-mix(in oklch, currentColor 20%, transparent);
    }
    .close:focus-visible {
      outline: 2px solid var(--md-sys-color-inverse-primary);
      outline-offset: 2px;
    }
    .close svg {
      display: block;
    }
    @media (prefers-reduced-motion: reduce) {
      .bar {
        transform: none;
        transition: opacity 0.12s ease;
      }
      .bar.show {
        transform: none;
      }
    }
  `;

  @state() private message = '';
  @state() private shown = false;
  /** 是否为需要「强提醒」的错误型提示（assertive 播报） */
  @state() private assertive = false;
  /** 显式跟踪当前主题，确保深浅色都正确取色（不依赖隐式继承） */
  @state() private dark = false;

  private hideTimer?: ReturnType<typeof setTimeout>;
  private unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsub = onThemeChange((d) => (this.dark = d));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsub?.();
  }

  show(message: string, duration = 2600, assertive = false) {
    this.message = message;
    this.assertive = assertive;
    this.shown = true;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => (this.shown = false), duration);
  }

  private close = () => {
    clearTimeout(this.hideTimer);
    this.shown = false;
  };

  render() {
    return html`<div
      class=${this.shown ? 'bar show' : 'bar'}
      role=${this.assertive ? 'alert' : 'status'}
      aria-live=${this.assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-theme=${this.dark ? 'dark' : 'light'}
    >
      <span class="msg">${this.message}</span>
      <button class="close" type="button" aria-label=${t('actionClose')} @click=${this.close}>
        ${icon('close', 20)}
      </button>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-snackbar': AppSnackbar;
  }
}

/** 全局便捷调用：自管理一个 light DOM 单例，避免 shadow DOM 穿透问题 */
let singleton: AppSnackbar | null = null;
function ensureSingleton(): AppSnackbar {
  if (!singleton) {
    singleton = document.createElement('app-snackbar');
    document.body.appendChild(singleton);
  }
  return singleton;
}

/** 普通提示（polite） */
export function toast(message: string): void {
  ensureSingleton().show(message);
}

/** 错误型提示（assertive，读屏器会强提醒） */
export function toastError(message: string): void {
  ensureSingleton().show(message, 3200, true);
}
