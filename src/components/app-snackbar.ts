/**
 * Material 3 风格 Snackbar（@material/web 无官方 Snackbar 组件，自实现）
 */
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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
    }
    .bar {
      display: flex;
      align-items: center;
      min-width: 200px;
      max-width: min(480px, calc(100vw - 48px));
      padding: 12px 20px;
      border-radius: 12px;
      background: var(--md-sys-color-inverse-surface);
      color: var(--md-sys-color-inverse-on-surface);
      box-shadow: 0 3px 8px color-mix(in oklch, var(--md-sys-color-shadow) 30%, transparent);
      font-size: 0.875rem;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .bar.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  `;

  @state() private message = '';
  @state() private shown = false;

  private hideTimer?: ReturnType<typeof setTimeout>;

  show(message: string, duration = 2600) {
    this.message = message;
    this.shown = true;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => (this.shown = false), duration);
  }

  render() {
    return html`<div class=${this.shown ? 'bar show' : 'bar'} role="status">${this.message}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-snackbar': AppSnackbar;
  }
}

/** 全局便捷调用 */
export function toast(message: string): void {
  const el = document.querySelector<AppSnackbar>('app-snackbar');
  el?.show(message);
}
