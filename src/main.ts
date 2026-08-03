/**
 * Aevum 应用入口：全局样式、Material Web 组件注册、设置初始化、PWA Service Worker
 *
 * 性能优化：
 * - Temporal polyfill 按需加载（有原生 Temporal 的浏览器不下载）
 * - 非首屏组件（dialog）延迟到 idle 时注册
 */
import './styles/global.css';

/* Material Web (M3) 组件注册 —— 首屏必需（Top App Bar + FAB + 主页卡片 + 事件详情弹窗） */
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/fab/fab.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';

import { registerSW } from 'virtual:pwa-register';
import { getSettings, onSettingsChange } from './store/settings.js';
import { applyLocalePref } from './i18n.js';
import { applyTheme } from './theme.js';
import { initInstall } from './install.js';
import { ensureTemporalReady } from './utils/temporal.js';
import './app.js';

/* 初始化语言与主题，并跟随设置变更 */
function bootstrapSettings() {
  const s = getSettings();
  applyLocalePref(s.locale);
  applyTheme(s);
  onSettingsChange((next) => {
    applyLocalePref(next.locale);
    applyTheme(next);
  });
}

bootstrapSettings();

/* PWA：注册 Service Worker（离线缓存 + 自动更新） */
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

/* PWA：捕获「安装到主屏幕」提示事件 */
initInstall();

/* 确保 Temporal polyfill 已加载（如需要），完成后才渲染应用 */
ensureTemporalReady()
  .catch((err) => console.error('[Aevum] Temporal polyfill failed to load:', err))
  .finally(() => {
    // 渲染根组件：确保 Temporal 已就绪
    const app = document.createElement('aevum-app');
    document.body.append(app);
  });
