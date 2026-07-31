/**
 * 应用外壳：Top App Bar + 哈希路由 + FAB + Snackbar
 * 主题与语言在此初始化并响应设置变化
 */
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import '@material/web/fab/fab.js';
import '@material/web/iconbutton/icon-button.js';
import { getSettings, onSettingsChange, updateSettings } from './store/settings.js';
import { applyTheme } from './theme.js';
import { applyLocalePref, onLocaleChange, t } from './i18n.js';
import { icon } from './icons.js';
import './pages/home-page.js';
import './pages/edit-page.js';
import './pages/settings-page.js';
import './components/app-snackbar.js';

type Route = 'home' | 'edit' | 'settings';

@customElement('aevum-app')
export class AevumApp extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
      background: color-mix(in oklch, var(--md-sys-color-surface) 82%, transparent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .topbar .title {
      flex: 1;
      min-width: 0;
    }
    .topbar h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
      letter-spacing: 0.02em;
    }
    .topbar .subtitle {
      font-size: 0.72rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-top: 1px;
    }
    .topbar md-icon-button {
      color: var(--md-sys-color-on-surface-variant);
    }
    main {
      max-width: var(--app-max-width, 720px);
      margin: 0 auto;
      padding: 12px 16px 120px;
    }
    .fab {
      position: fixed;
      right: max(20px, calc(50vw - var(--app-max-width, 720px) / 2 + 20px));
      bottom: var(--app-fab-bottom, 24px);
      z-index: 20;
      --md-fab-container-shape: 20px;
    }
    .fab .fab-icon {
      display: inline-flex;
    }
    .page {
      animation: fade-in 0.22s ease;
    }
    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `;

  @state() private route: Route = 'home';
  @state() private themeMode: 'light' | 'dark' = 'light';

  private unsubSettings?: () => void;
  private unsubLocale?: () => void;

  connectedCallback() {
    super.connectedCallback();
    // 初始化主题与语言
    const s = getSettings();
    applyLocalePref(s.locale);
    this.applyAll();

    this.unsubSettings = onSettingsChange(() => this.applyAll());
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
    window.addEventListener('hashchange', this.onHashChange);
    this.onHashChange();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubSettings?.();
    this.unsubLocale?.();
    window.removeEventListener('hashchange', this.onHashChange);
  }

  private applyAll() {
    const s = getSettings();
    applyLocalePref(s.locale);
    this.themeMode = applyTheme(s);
  }

  private onHashChange = () => {
    const hash = location.hash || '#/';
    const path = hash.split('?')[0];
    if (path.startsWith('#/edit')) this.route = 'edit';
    else if (path.startsWith('#/settings')) this.route = 'settings';
    else this.route = 'home';
    // 路由切换时重建编辑页（保证表单按 id 重新初始化）
    this.requestUpdate();
  };

  private goHome() {
    location.hash = '#/';
  }

  private goSettings() {
    location.hash = '#/settings';
  }

  private goEdit() {
    location.hash = '#/edit';
  }

  private toggleTheme() {
    // 手动切换亮/暗：基于当前生效模式取反，并脱离“跟随系统”
    const next = this.themeMode === 'dark' ? 'light' : 'dark';
    updateSettings({ themeMode: next });
  }

  private get pageTitle(): string {
    if (this.route === 'settings') return t('pageSettingsTitle');
    if (this.route === 'edit') {
      const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
      return params.get('id') ? t('pageEditTitleEdit') : t('pageEditTitleNew');
    }
    return t('appName');
  }

  render() {
    const isHome = this.route === 'home';
    return html`
      <header class="topbar">
        ${!isHome
          ? html`<md-icon-button @click=${this.goHome} aria-label=${t('actionBack')}>${icon('back')}</md-icon-button>`
          : null}
        <div class="title">
          <h1>${this.pageTitle}</h1>
          ${isHome ? html`<div class="subtitle">${t('appSubtitle')}</div>` : null}
        </div>
        <md-icon-button @click=${this.toggleTheme} aria-label=${t('settingsThemeMode')}>
          ${icon(this.themeMode === 'dark' ? 'lightMode' : 'darkMode')}
        </md-icon-button>
        ${isHome
          ? html`<md-icon-button @click=${this.goSettings} aria-label=${t('navSettings')}>${icon('settings')}</md-icon-button>`
          : null}
      </header>

      <main>
        <div class="page" key=${this.route + location.hash}>
          ${this.route === 'home' ? html`<home-page></home-page>` : null}
          ${this.route === 'edit' ? html`<edit-page></edit-page>` : null}
          ${this.route === 'settings' ? html`<settings-page></settings-page>` : null}
        </div>
      </main>

      ${isHome
        ? html`<md-fab class="fab" aria-label=${t('actionAdd')} @click=${this.goEdit}>
            <span class="fab-icon" slot="icon">${icon('add')}</span>
          </md-fab>`
        : null}

      <app-snackbar></app-snackbar>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'aevum-app': AevumApp;
  }
}
