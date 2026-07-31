/**
 * Aevum 应用入口：全局样式、Material Web 组件注册、设置初始化、PWA Service Worker
 */
import './styles/global.css';

/* Material Web (M3) 组件注册 */
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/fab/fab.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';
import '@material/web/dialog/dialog.js';
import '@material/web/chips/filter-chip.js';

import { registerSW } from 'virtual:pwa-register';
import { getSettings, onSettingsChange } from './store/settings.js';
import { applyLocalePref } from './i18n.js';
import { applyTheme } from './theme.js';
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
