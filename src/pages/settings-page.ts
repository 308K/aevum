/**
 * 设置页：语言、主题（模式/种子色/OKLCH 渐变/自定义背景图）、日界限、默认历法与粒度、数据备份
 * 所有改动即时生效并持久化
 */
import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/divider/divider.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/dialog/dialog.js';
import '@material/web/iconbutton/icon-button.js';
import type { MdSwitch } from '@material/web/switch/switch.js';
import type { MdOutlinedSelect } from '@material/web/select/outlined-select.js';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type {
  AevumSettings,
  CalendarId,
  Granularity,
  LocalePref,
  ThemeMode,
  WeekStart,
  WeekdayDisplay,
} from '../types.js';
import { getSettings, onSettingsChange, updateSettings, PRESET_SEED_COLORS } from '../store/settings.js';
import {
  getTags,
  addTag,
  updateTag,
  deleteTag,
  onTagsChange,
  tagDisplay,
  type TagDef,
} from '../store/tags.js';
import { removeTagIdFromAllEvents } from '../store/events.js';
import {
  addCustomTheme,
  removeCustomTheme,
  renameCustomTheme,
  setCustomThemeColor,
  applyCustomTheme,
} from '../store/themes.js';
import { onLocaleChange, t } from '../i18n.js';
import { CALENDAR_IDS } from '../utils/calendar.js';
import { exportBackup, importBackup } from '../utils/backup.js';
import { icon } from '../icons.js';
import { toast, toastError } from '../components/app-snackbar.js';
import { isInstallable, onInstallAvailable, promptInstall } from '../install.js';
import '../components/color-picker.js';

const GRAN_I18N_KEYS: Record<Granularity, 'granDay' | 'granDhms' | 'granYmd' | 'granYwd' | 'granWd'> = {
  day: 'granDay',
  dhms: 'granDhms',
  ymd: 'granYmd',
  ywd: 'granYwd',
  wd: 'granWd',
};

const WEEKSTART_I18N_KEYS: Record<WeekStart, 'weekStartLocale' | 'weekStartSunday' | 'weekStartMonday' | 'weekStartSaturday'> = {
  locale: 'weekStartLocale',
  sunday: 'weekStartSunday',
  monday: 'weekStartMonday',
  saturday: 'weekStartSaturday',
};

const WEEKDAY_I18N_KEYS: Record<WeekdayDisplay, 'weekdayOff' | 'weekdayShort' | 'weekdayLong'> = {
  off: 'weekdayOff',
  short: 'weekdayShort',
  long: 'weekdayLong',
};

@customElement('settings-page')
export class SettingsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
      text-autospace: normal;
    }
    .group {
      margin-bottom: 8px;
    }
    .group-title {
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--md-sys-color-primary);
      padding: 14px 4px 10px;
    }
    .card {
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 82%, transparent);
      border: 1px solid color-mix(in oklch, var(--md-sys-color-outline-variant) 50%, transparent);
      border-radius: 20px;
      padding: 6px 20px;
    }
    .item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0;
    }
    .item + .item {
      border-top: 1px solid color-mix(in oklch, var(--md-sys-color-outline-variant) 45%, transparent);
    }
    .item .label {
      font-size: 0.95rem;
      color: var(--md-sys-color-on-surface);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .item .label .exp-icon {
      display: inline-flex;
      color: var(--md-sys-color-tertiary);
      cursor: help;
      flex: none;
    }
    .item .hint {
      font-size: 0.78rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-top: 3px;
      max-width: 420px;
    }
    .control {
      flex: none;
      min-width: 180px;
    }
    .control md-outlined-select,
    .control md-outlined-text-field {
      width: 100%;
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: flex-end;
    }
    .swatch {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      background: var(--swatch-color);
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .swatch:hover {
      transform: scale(1.08);
    }
    @media (prefers-reduced-motion: reduce) {
      .swatch {
        transition: border-color 0.15s ease;
      }
      .swatch:hover {
        transform: none;
      }
    }
    .swatch[selected] {
      border-color: var(--md-sys-color-on-surface);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--swatch-color) 45%, transparent);
    }
    .swatch.custom {
      position: relative;
    }
    .btn-icon {
      display: inline-flex;
      align-items: center;
    }
    .data-actions {
      display: flex;
      gap: 10px;
      flex: none;
    }
    /* 窄屏：导出/导入按钮移到文字下方，并占满整行便于点按 */
    @media (max-width: 480px) {
      .item.item-data {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .item.item-data .data-actions {
        width: 100%;
      }
      .item.item-data .data-actions md-outlined-button {
        flex: 1;
      }
    }
    .hidden-input {
      display: none;
    }
    .tag-row {
      align-items: center;
      gap: 12px;
      justify-content: flex-start;
    }
    .color-dot {
      flex: none;
      width: 40px;
      height: 40px;
      cursor: pointer;
    }
    .tag-name {
      flex: 1;
      min-width: 0;
    }
    .tag-create {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }
    .theme-row {
      align-items: center;
      gap: 12px;
      justify-content: flex-start;
    }
    .theme-name {
      flex: 1;
      min-width: 0;
    }
    .theme-create {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }
    @media (max-width: 560px) {
      .theme-create,
      .tag-create {
        flex-wrap: wrap;
      }
      /* 移动端：把名称输入框放到独立整行，避免被色块与按钮挤压得过窄 */
      .theme-create .theme-name,
      .tag-create .tag-name {
        order: 3;
        flex: 1 1 100%;
      }
      .theme-create md-outlined-button,
      .tag-create md-outlined-button {
        margin-left: auto;
      }
      .theme-row {
        flex-wrap: wrap;
      }
      .theme-row .theme-name {
        order: 4;
        flex: 1 1 100%;
      }
    }
    .theme-empty {
      padding: 4px 0 6px;
      font-size: 0.82rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .theme-row.active {
      box-shadow: inset 3px 0 0 var(--md-sys-color-primary);
      border-radius: 12px;
    }
    .active-badge {
      flex: none;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--md-sys-color-on-primary-container);
      background: var(--md-sys-color-primary-container);
      padding: 4px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }
  `;

  @state() private settings: AevumSettings = getSettings();
  @state() private tagList: TagDef[] = getTags();
  @state() private newTagName = '';
  @state() private newThemeName = '';
  @state() private newThemeColor = getSettings().seedColor;
  @state() private installAvailable = isInstallable();

  @query('#tagDeleteDialog') private tagDeleteDialog!: MdDialog;
  private pendingDeleteId: string | null = null;

  @query('#themeDeleteDialog') private themeDeleteDialog!: MdDialog;
  private pendingDeleteThemeId: string | null = null;

  private unsubSettings?: () => void;
  private unsubLocale?: () => void;
  private unsubTags?: () => void;
  private unsubInstall?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubSettings = onSettingsChange((s) => (this.settings = s));
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
    this.unsubTags = onTagsChange(() => (this.tagList = getTags()));
    this.unsubInstall = onInstallAvailable(() => {
      this.installAvailable = isInstallable();
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubSettings?.();
    this.unsubLocale?.();
    this.unsubTags?.();
    this.unsubInstall?.();
  }

  private set<K extends keyof AevumSettings>(key: K, value: AevumSettings[K]) {
    updateSettings({ [key]: value });
  }

  /* ---------- 标签（分类）管理 ---------- */

  private onTagColorChange(e: CustomEvent<{ value: string }>, id: string) {
    updateTag(id, { color: e.detail.value });
  }

  private onTagLabelChange(e: Event, id: string) {
    const v = (e.target as HTMLInputElement).value.trim();
    if (v) updateTag(id, { label: v });
  }

  private createTag() {
    const label = this.newTagName.trim();
    if (!label) return;
    addTag(label, '#5B5791');
    this.newTagName = '';
    toast(t('toastTagCreated'));
  }

  private requestDeleteTag(id: string) {
    this.pendingDeleteId = id;
    this.tagDeleteDialog.show();
  }

  private confirmDeleteTag() {
    if (this.pendingDeleteId) {
      const id = this.pendingDeleteId;
      deleteTag(id);
      removeTagIdFromAllEvents(id);
      toast(t('toastTagDeleted'));
    }
    this.pendingDeleteId = null;
    this.tagDeleteDialog.close();
  }

  /* ---------- 自定义主题色管理（逻辑收敛至 store/themes） ---------- */

  /** 应用某个已保存的主题色（点击 ✓） */
  private applyCustomTheme(id: string) {
    applyCustomTheme(id);
  }

  private onThemeColorChange(e: CustomEvent<{ value: string }>, id: string) {
    setCustomThemeColor(id, e.detail.value);
  }

  private onThemeNameChange(e: Event, id: string) {
    renameCustomTheme(id, (e.target as HTMLInputElement).value);
  }

  private addCustomTheme() {
    if (!this.newThemeName.trim()) {
      toast(t('toastThemeNameEmpty'));
      return;
    }
    const { added } = addCustomTheme(this.newThemeName, this.newThemeColor);
    this.newThemeName = '';
    this.newThemeColor = getSettings().seedColor;
    toast(added ? t('toastThemeAdded') : t('toastThemeDupe'));
  }

  private async onInstallClick() {
    const outcome = await promptInstall();
    if (outcome === 'installed') toast(t('toastInstalled'));
    else if (outcome === 'dismissed') toast(t('toastInstallCancelled'));
    else toast(t('installManualHint'));
  }

  private requestDeleteTheme(id: string) {
    this.pendingDeleteThemeId = id;
    this.themeDeleteDialog.show();
  }

  private confirmDeleteTheme() {
    const id = this.pendingDeleteThemeId;
    if (id) {
      removeCustomTheme(id);
      toast(t('toastThemeDeleted'));
    }
    this.pendingDeleteThemeId = null;
    this.themeDeleteDialog.close();
  }

  /* ---------- 数据备份 ---------- */

  private onExport() {
    exportBackup();
    toast(t('toastExported'));
  }

  private triggerImport() {
    this.shadowRoot?.querySelector<HTMLInputElement>('#importFile')?.click();
  }

  private async onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const count = await importBackup(file);
      toast(t('toastImported', { count }));
    } catch {
      toastError(t('toastImportFailed'));
    }
  }

  render() {
    const s = this.settings;
    return html`
      <div class="group">
        <div class="group-title">${t('settingsSectionGeneral')}</div>
        <div class="card">
          <div class="item">
            <div class="label">${t('settingsLanguage')}</div>
            <div class="control">
              <md-outlined-select
                .value=${s.locale}
                @change=${(e: Event) => this.set('locale', (e.target as MdOutlinedSelect).value as LocalePref)}
              >
                <md-select-option value="system"><div slot="headline">${t('langSystem')}</div></md-select-option>
                <md-select-option value="zh-CN"><div slot="headline">${t('langZhCN')}</div></md-select-option>
                <md-select-option value="en-US"><div slot="headline">${t('langEnUS')}</div></md-select-option>
              </md-outlined-select>
            </div>
          </div>
          <div class="item">
            <div>
              <div class="label">${t('installToHome')}</div>
              <div class="hint">${t('installHint')}</div>
            </div>
            ${this.installAvailable
              ? html`<md-outlined-button @click=${this.onInstallClick}>
                  <span class="btn-icon" slot="icon">${icon('download', 18)}</span>${t('installNow')}
                </md-outlined-button>`
              : html`<md-icon-button
                  @click=${this.onInstallClick}
                  aria-label=${t('installToHome')}
                  title=${t('installManualHint')}
                >
                  ${icon('download', 20)}
                </md-icon-button>`}
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">${t('settingsSectionAppearance')}</div>
        <div class="card">
          <div class="item">
            <div class="label">${t('settingsThemeMode')}</div>
            <div class="control">
              <md-outlined-select
                .value=${s.themeMode}
                @change=${(e: Event) => this.set('themeMode', (e.target as MdOutlinedSelect).value as ThemeMode)}
              >
                <md-select-option value="system"><div slot="headline">${t('themeSystem')}</div></md-select-option>
                <md-select-option value="light"><div slot="headline">${t('themeLight')}</div></md-select-option>
                <md-select-option value="dark"><div slot="headline">${t('themeDark')}</div></md-select-option>
              </md-outlined-select>
            </div>
          </div>
          <div class="item">
            <div class="label">${t('settingsSeedColor')}</div>
            <div class="swatches">
              ${PRESET_SEED_COLORS.map(
                (color) => html`<button
                  class="swatch"
                  style="--swatch-color: ${color}"
                  ?selected=${s.seedColor.toLowerCase() === color.toLowerCase() && !s.customThemes.some((c) => c.color.toLowerCase() === color.toLowerCase())}
                  aria-label=${color}
                  @click=${() => this.set('seedColor', color)}
                ></button>`
              )}
            </div>
          </div>
          <div class="item">
            <div>
              <div class="label">
                ${t('settingsGradientBg')}
                <span
                  class="exp-icon"
                  title=${t('experimental')}
                  aria-label=${t('experimental')}
                  >${icon('science', 16)}</span
                >
              </div>
              <div class="hint">${t('settingsGradientBgHint')}</div>
            </div>
            <md-switch
              ?selected=${s.gradientBg}
              @change=${(e: Event) => this.set('gradientBg', (e.target as MdSwitch).selected)}
            ></md-switch>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">${t('settingsSectionCustomThemes')}</div>
        <div class="card">
          ${s.customThemes.length === 0
            ? html`<div class="theme-empty">${t('customThemeEmptyHint')}</div>`
            : repeat(
                s.customThemes,
                (th) => th.id,
                (th) => {
                  const isActive = s.seedColor.toLowerCase() === th.color.toLowerCase();
                  return html`
                    <div class="item theme-row ${isActive ? 'active' : ''}">
                      <color-picker
                        class="color-dot"
                        .value=${th.color}
                        @color-change=${(e: CustomEvent<{ value: string }>) => this.onThemeColorChange(e, th.id)}
                        aria-label=${t('customThemePickColor')}
                      ></color-picker>
                      <md-outlined-text-field
                        class="theme-name"
                        .value=${th.name}
                        placeholder=${t('customThemeNamePlaceholder')}
                        aria-label=${t('customThemeNamePlaceholder')}
                        supporting-text=${t('customThemeNameHint')}
                        @change=${(e: Event) => this.onThemeNameChange(e, th.id)}
                      ></md-outlined-text-field>
                      ${isActive
                        ? html`<span class="active-badge">${t('customThemeActive')}</span>`
                        : html`<md-icon-button
                            @click=${() => this.applyCustomTheme(th.id)}
                            aria-label=${t('customThemeApply')}
                          >
                            ${icon('check', 20)}
                          </md-icon-button>`}
                      <md-icon-button @click=${() => this.requestDeleteTheme(th.id)} aria-label=${t('actionDelete')}>
                        ${icon('delete', 20)}
                      </md-icon-button>
                    </div>
                  `;
                }
              )}
          <div class="item">
            <div class="label">${t('settingsAddTheme')}</div>
            <div class="theme-create">
              <color-picker
                class="color-dot"
                .value=${this.newThemeColor}
                @color-change=${(e: CustomEvent<{ value: string }>) => (this.newThemeColor = e.detail.value)}
                aria-label=${t('customThemePickColor')}
              ></color-picker>
              <md-outlined-text-field
                class="theme-name"
                .value=${this.newThemeName}
                placeholder=${t('customThemeNamePlaceholder')}
                supporting-text=${t('customThemeNameHint')}
                @input=${(e: Event) => (this.newThemeName = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addCustomTheme();
                  }
                }}
              ></md-outlined-text-field>
              <md-outlined-button @click=${this.addCustomTheme}>
                <span class="btn-icon" slot="icon">${icon('add', 18)}</span>${t('settingsAddTheme')}
              </md-outlined-button>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">${t('settingsSectionTime')}</div>
        <div class="card">
          <div class="item">
            <div>
              <div class="label">${t('settingsDayBoundary')}</div>
              <div class="hint">${t('settingsDayBoundaryHint')}</div>
            </div>
            <div class="control" style="min-width: 140px">
              <md-outlined-text-field
                type="time"
                .value=${s.dayBoundary}
                @change=${(e: Event) => this.set('dayBoundary', (e.target as HTMLInputElement).value || '00:00')}
              ></md-outlined-text-field>
            </div>
          </div>
          <div class="item">
            <div class="label">${t('settingsDefaultCalendar')}</div>
            <div class="control">
              <md-outlined-select
                .value=${s.defaultCalendar}
                @change=${(e: Event) => this.set('defaultCalendar', (e.target as MdOutlinedSelect).value as CalendarId)}
              >
                ${CALENDAR_IDS.map(
                  (cal) => html`<md-select-option value=${cal}>
                    <div slot="headline">${t(`cal${cal[0].toUpperCase()}${cal.slice(1)}` as never)}</div>
                  </md-select-option>`
                )}
              </md-outlined-select>
            </div>
          </div>
          <div class="item">
            <div class="label">${t('settingsDefaultGranularity')}</div>
            <div class="control">
              <md-outlined-select
                .value=${s.defaultGranularity}
                @change=${(e: Event) => this.set('defaultGranularity', (e.target as MdOutlinedSelect).value as Granularity)}
              >
                ${(['day', 'dhms', 'ymd', 'ywd', 'wd'] as Granularity[]).map(
                  (g) => html`<md-select-option value=${g}>
                    <div slot="headline">${t(GRAN_I18N_KEYS[g])}</div>
                  </md-select-option>`
                )}
              </md-outlined-select>
            </div>
          </div>
          <div class="item">
            <div>
              <div class="label">${t('settingsWeekStart')}</div>
              <div class="hint">${t('settingsWeekStartHint')}</div>
            </div>
            <div class="control">
              <md-outlined-select
                .value=${s.weekStart}
                @change=${(e: Event) => this.set('weekStart', (e.target as MdOutlinedSelect).value as WeekStart)}
              >
                ${(['locale', 'sunday', 'monday', 'saturday'] as WeekStart[]).map(
                  (w) => html`<md-select-option value=${w}>
                    <div slot="headline">${t(WEEKSTART_I18N_KEYS[w])}</div>
                  </md-select-option>`
                )}
              </md-outlined-select>
            </div>
          </div>
          <div class="item">
            <div>
              <div class="label">${t('settingsWeekdayDisplay')}</div>
              <div class="hint">${t('settingsWeekdayDisplayHint')}</div>
            </div>
            <div class="control">
              <md-outlined-select
                .value=${s.weekdayDisplay}
                @change=${(e: Event) => this.set('weekdayDisplay', (e.target as MdOutlinedSelect).value as WeekdayDisplay)}
              >
                ${(['off', 'short', 'long'] as WeekdayDisplay[]).map(
                  (w) => html`<md-select-option value=${w}>
                    <div slot="headline">${t(WEEKDAY_I18N_KEYS[w])}</div>
                  </md-select-option>`
                )}
              </md-outlined-select>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">${t('settingsSectionTags')}</div>
        <div class="card">
          ${this.tagList.map(
            (tg) => html`
              <div class="item tag-row">
                <color-picker
                  class="color-dot"
                  .value=${tg.color}
                  @color-change=${(e: CustomEvent<{ value: string }>) => this.onTagColorChange(e, tg.id)}
                  aria-label=${t('tagEditColor')}
                ></color-picker>
                <md-outlined-text-field
                  class="tag-name"
                  .value=${tagDisplay(tg)}
                  @change=${(e: Event) => this.onTagLabelChange(e, tg.id)}
                ></md-outlined-text-field>
                <md-icon-button @click=${() => this.requestDeleteTag(tg.id)} aria-label=${t('actionDelete')}>
                  ${icon('delete', 20)}
                </md-icon-button>
              </div>
            `
          )}
          <div class="item">
            <div class="label">${t('settingsAddTag')}</div>
            <div class="tag-create">
              <md-outlined-text-field
                class="tag-name"
                .value=${this.newTagName}
                placeholder=${t('tagNewName')}
                @input=${(e: Event) => (this.newTagName = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createTag();
                  }
                }}
              ></md-outlined-text-field>
              <md-outlined-button @click=${this.createTag}>
                <span class="btn-icon" slot="icon">${icon('add', 18)}</span>${t('settingsAddTag')}
              </md-outlined-button>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-title">${t('settingsSectionData')}</div>
        <div class="card">
          <div class="item item-data">
            <div>
              <div class="label">${t('dataExport')} / ${t('dataImport')}</div>
              <div class="hint">${t('dataHint')}</div>
            </div>
            <div class="data-actions">
              <md-outlined-button @click=${this.onExport}>
                <span class="btn-icon" slot="icon">${icon('download', 18)}</span>${t('dataExport')}
              </md-outlined-button>
              <md-outlined-button @click=${this.triggerImport}>
                <span class="btn-icon" slot="icon">${icon('upload', 18)}</span>${t('dataImport')}
              </md-outlined-button>
              <input id="importFile" class="hidden-input" type="file" accept="application/json,.json" @change=${this.onImportFile} />
            </div>
          </div>
        </div>
      </div>

      <md-dialog id="tagDeleteDialog">
        <div slot="headline">${t('tagDeleteConfirmTitle')}</div>
        <div slot="content">
          ${(() => {
            const tg = this.pendingDeleteId
              ? this.tagList.find((x) => x.id === this.pendingDeleteId)
              : undefined;
            return tg ? t('tagDeleteConfirmBody', { name: tagDisplay(tg) }) : '';
          })()}
        </div>
        <div slot="actions">
          <md-text-button @click=${() => this.tagDeleteDialog.close()}>${t('actionCancel')}</md-text-button>
          <md-filled-button @click=${this.confirmDeleteTag}>${t('actionConfirmDelete')}</md-filled-button>
        </div>
      </md-dialog>

      <md-dialog id="themeDeleteDialog">
        <div slot="headline">${t('customThemeDeleteConfirmTitle')}</div>
        <div slot="content">
          ${(() => {
            const th = this.pendingDeleteThemeId
              ? this.settings.customThemes.find((x) => x.id === this.pendingDeleteThemeId)
              : undefined;
            return th ? t('customThemeDeleteConfirmBody', { name: th.name || th.color }) : '';
          })()}
        </div>
        <div slot="actions">
          <md-text-button @click=${() => this.themeDeleteDialog.close()}>${t('actionCancel')}</md-text-button>
          <md-filled-button @click=${this.confirmDeleteTheme}>${t('actionConfirmDelete')}</md-text-button>
        </div>
      </md-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage;
  }
}
