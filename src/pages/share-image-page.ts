/**
 * 保存为图片页：选择事件后自定义主题色、亮/暗背景、卡片覆盖（不透明/半透明/高斯模糊），
 * 实时预览并导出 PNG。对设置了卡片背景图的事件，背景图保持原色、不压暗。
 */
import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/icon-button.js';
import type { MdOutlinedSelect } from '@material/web/select/outlined-select.js';
import type { AevumEvent } from '../types.js';
import { getEvents, getEvent, onEventsChange, sortedEvents } from '../store/events.js';
import { getSettings, PRESET_SEED_COLORS } from '../store/settings.js';
import { onLocaleChange, t } from '../i18n.js';
import { icon } from '../icons.js';
import { resolveDark } from '../theme.js';
import { drawShareImage, saveEventShareImage, type CardStyle, W, H } from '../utils/share-image.js';
import { toast } from '../components/app-snackbar.js';
import '../components/color-picker.js';

@customElement('share-image-page')
export class ShareImagePage extends LitElement {
  static styles = css`
    :host {
      display: block;
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
      flex: none;
    }
    .control {
      flex: 1;
      min-width: 0;
      display: flex;
      justify-content: flex-end;
    }
    .control md-outlined-select {
      width: 100%;
      max-width: 260px;
    }
    .color-row {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .color-dot {
      flex: none;
      width: 40px;
      height: 40px;
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    .swatch {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      background: var(--swatch-color);
      transition: transform 0.15s ease;
    }
    .swatch:hover {
      transform: scale(1.08);
    }
    .swatch[selected] {
      border-color: var(--md-sys-color-on-surface);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--swatch-color) 45%, transparent);
    }
    /* 亮/暗分段切换（M3 风格） */
    .seg {
      display: inline-flex;
      padding: 4px;
      gap: 4px;
      background: var(--md-sys-color-surface-container);
      border-radius: 999px;
    }
    .seg-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--md-sys-color-on-surface-variant);
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .seg-btn.on {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }
    .seg-btn:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .seg-btn,
      .swatch {
        transition: none;
      }
    }
    @media (max-width: 480px) {
      .item {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }
      .item .label {
        flex: none;
      }
      .control,
      .color-row {
        justify-content: flex-start;
      }
      .control md-outlined-select {
        max-width: none;
      }
    }
    /* 预览 */
    .preview-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 4px 0 8px;
    }
    .preview {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 16px;
      border-radius: 24px;
      background: var(--md-sys-color-surface-container);
      transition: background 0.2s ease;
    }
    .preview.dark {
      background: color-mix(in oklch, var(--md-sys-color-surface-container-lowest, #000) 70%, #000);
    }
    .preview-canvas {
      width: 100%;
      max-width: 360px;
      height: auto;
      border-radius: 20px;
      box-shadow: 0 12px 40px color-mix(in oklch, var(--md-sys-color-shadow) 35%, transparent);
      display: block;
    }
    .hint {
      font-size: 0.85rem;
      color: var(--md-sys-color-on-surface-variant);
      text-align: center;
      padding: 40px 16px;
    }
    .save-bar {
      position: sticky;
      bottom: 12px;
      display: flex;
      justify-content: center;
      padding: 10px 0 16px;
    }
    .save-bar md-filled-button {
      min-width: 220px;
    }
    .save-bar[disabled] {
      opacity: 0.5;
      pointer-events: none;
    }
  `;

  @state() private events: AevumEvent[] = getEvents();
  @state() private eventId = '';
  @state() private seedColor = getSettings().seedColor;
  @state() private dark = resolveDark(getSettings().themeMode);
  @state() private cardStyle: CardStyle = 'opaque';
  @state() private saving = false;

  @query('#preview') private previewCanvas!: HTMLCanvasElement;

  private unsubEvents?: () => void;
  private unsubLocale?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubEvents = onEventsChange((list) => (this.events = list));
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
    // 从 hash 的 ?id= 预选事件；否则默认选中第一个
    const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const id = params.get('id');
    if (id && getEvent(id)) this.eventId = id;
    else if (!this.eventId && this.events.length > 0) {
      this.eventId = sortedEvents(this.events)[0].id;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubEvents?.();
    this.unsubLocale?.();
  }

  updated(changed: Map<string, unknown>) {
    if (
      changed.has('eventId') ||
      changed.has('seedColor') ||
      changed.has('dark') ||
      changed.has('cardStyle')
    ) {
      this.renderPreview();
    }
  }

  private get options() {
    return {
      themeColor: this.seedColor,
      dark: this.dark,
      cardStyle: this.cardStyle,
      darkenBg: false,
    };
  }

  private get selectedEvent(): AevumEvent | undefined {
    return this.eventId ? getEvent(this.eventId) : undefined;
  }

  private async renderPreview() {
    const canvas = this.previewCanvas;
    const ev = this.selectedEvent;
    if (!canvas || !ev) return;
    try {
      await drawShareImage(canvas, ev, this.options);
    } catch {
      /* 环境不支持 canvas 时静默 */
    }
  }

  private onEventChange(e: Event) {
    this.eventId = (e.target as MdOutlinedSelect).value;
  }

  private onCardStyleChange(e: Event) {
    this.cardStyle = (e.target as MdOutlinedSelect).value as CardStyle;
  }

  private onColorChange(e: CustomEvent<{ value: string }>) {
    this.seedColor = e.detail.value;
  }

  private onPreset(e: MouseEvent) {
    const c = (e.currentTarget as HTMLElement).getAttribute('data-c') || '';
    if (c) this.seedColor = c;
  }

  private async onSave() {
    const ev = this.selectedEvent;
    if (!ev || this.saving) return;
    this.saving = true;
    try {
      await saveEventShareImage(ev, this.options);
      toast(t('toastImageSaved'));
    } catch {
      /* 忽略：环境不支持导出 */
    } finally {
      this.saving = false;
    }
  }

  render() {
    const ev = this.selectedEvent;
    const sorted = sortedEvents(this.events);
    return html`
      ${this.events.length === 0
        ? html`<div class="hint">${t('shareImageNoEvents')}</div>`
        : html`
            <div class="group">
              <div class="group-title">${t('shareImageSectionEvent')}</div>
              <div class="card">
                <div class="item">
                  <div class="label">${t('shareImageEvent')}</div>
                  <div class="control">
                    <md-outlined-select .value=${this.eventId} @change=${this.onEventChange}>
                      ${sorted.map(
                        (e) => html`<md-select-option value=${e.id}
                          ><div slot="headline">${e.name}</div></md-select-option
                        >`
                      )}
                    </md-outlined-select>
                  </div>
                </div>
              </div>
            </div>

            <div class="group">
              <div class="group-title">${t('shareImageSectionStyle')}</div>
              <div class="card">
                <div class="item">
                  <div class="label">${t('shareImageThemeColor')}</div>
                  <div class="control">
                    <div class="color-row">
                      <div class="swatches">
                        ${PRESET_SEED_COLORS.map(
                          (c) => html`<button
                            class="swatch"
                            style="--swatch-color: ${c}"
                            ?selected=${this.seedColor.toLowerCase() === c.toLowerCase()}
                            data-c=${c}
                            aria-label=${c}
                            @click=${this.onPreset}
                          ></button>`
                        )}
                      </div>
                      <color-picker
                        class="color-dot"
                        .value=${this.seedColor}
                        @color-change=${this.onColorChange}
                        aria-label=${t('shareImageThemeColor')}
                      ></color-picker>
                    </div>
                  </div>
                </div>

                <div class="item">
                  <div class="label">${t('shareImageBackgroundMode')}</div>
                  <div class="control">
                    <div class="seg" role="group" aria-label=${t('shareImageBackgroundMode')}>
                      <button
                        type="button"
                        class="seg-btn ${!this.dark ? 'on' : ''}"
                        aria-pressed=${!this.dark}
                        @click=${() => (this.dark = false)}
                      >
                        ${icon('lightMode', 18)}${t('shareImageBgLight')}
                      </button>
                      <button
                        type="button"
                        class="seg-btn ${this.dark ? 'on' : ''}"
                        aria-pressed=${this.dark}
                        @click=${() => (this.dark = true)}
                      >
                        ${icon('darkMode', 18)}${t('shareImageBgDark')}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="item">
                  <div class="label">${t('shareImageCardStyle')}</div>
                  <div class="control">
                    <md-outlined-select .value=${this.cardStyle} @change=${this.onCardStyleChange}>
                      <md-select-option value="opaque"
                        ><div slot="headline">${t('shareImageCardOpaque')}</div></md-select-option
                      >
                      <md-select-option value="translucent"
                        ><div slot="headline">${t('shareImageCardTranslucent')}</div></md-select-option
                      >
                      <md-select-option value="blur"
                        ><div slot="headline">${t('shareImageCardBlur')}</div></md-select-option
                      >
                    </md-outlined-select>
                  </div>
                </div>
              </div>
            </div>

            <div class="group">
              <div class="group-title">${t('shareImageSectionPreview')}</div>
              <div class="card">
                ${ev
                  ? html`<div class="preview-wrap">
                      <div class="preview ${this.dark ? 'dark' : 'light'}">
                        <canvas
                          id="preview"
                          class="preview-canvas"
                          width=${W}
                          height=${H}
                          aria-label=${t('shareImagePreview')}
                        ></canvas>
                      </div>
                    </div>`
                  : html`<div class="hint">${t('shareImageSelectEventHint')}</div>`}
              </div>
            </div>

            <div class="save-bar" ?disabled=${!ev || this.saving}>
              <md-filled-button @click=${this.onSave} ?disabled=${!ev || this.saving}>
                <span slot="icon" style="display:inline-flex">${icon('download', 18)}</span>
                ${this.saving ? t('shareImageGenerating') : t('actionShareImage')}
              </md-filled-button>
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'share-image-page': ShareImagePage;
  }
}
