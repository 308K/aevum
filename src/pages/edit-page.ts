/**
 * 添加/编辑事件页
 * - 历法切换（公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历）
 * - 历法感知的年/月/日选择（农历汉字显示 + 干支纪年）
 * - 仅日期 or 精确时间、展示粒度、彩色标签、置顶
 */
import { LitElement, html, css } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { customElement, state } from 'lit/decorators.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';
import { CALENDAR_IDS } from '../utils/calendar.js';
import { Temporal } from '../utils/temporal.js';
import type { CalendarId, Granularity, Recurrence } from '../types.js';
import { addEvent, getEvent, updateEvent } from '../store/events.js';
import { getSettings } from '../store/settings.js';
import { getTags, addTag, onTagsChange, tagDisplay, type TagDef } from '../store/tags.js';
import { getLocale, onLocaleChange, t } from '../i18n.js';
import { fileToDownscaledDataURL } from '../utils/image-file.js';
import { icon } from '../icons.js';
import { toast } from '../components/app-snackbar.js';
import '../components/date-calendar.js';

/** 新建标签使用的默认颜色（可在设置页改色） */
const NEW_TAG_COLOR = '#5B5791';

const CAL_I18N_KEYS: Record<CalendarId, 'calGregory' | 'calChinese' | 'calIslamic' | 'calHebrew' | 'calPersian' | 'calBuddhist' | 'calJapanese'> = {
  gregory: 'calGregory',
  chinese: 'calChinese',
  islamic: 'calIslamic',
  hebrew: 'calHebrew',
  persian: 'calPersian',
  buddhist: 'calBuddhist',
  japanese: 'calJapanese',
};

const GRAN_I18N_KEYS: Record<Granularity, 'granDay' | 'granDhms' | 'granYmd' | 'granYwd' | 'granWd'> = {
  day: 'granDay',
  dhms: 'granDhms',
  ymd: 'granYmd',
  ywd: 'granYwd',
  wd: 'granWd',
};

const REC_I18N_KEYS: Record<Recurrence, 'fieldRecurNone' | 'recurWeekly' | 'recurMonthly' | 'recurYearly'> = {
  none: 'fieldRecurNone',
  weekly: 'recurWeekly',
  monthly: 'recurMonthly',
  yearly: 'recurYearly',
};

function toISO(d: Date): string {
  const pd = Temporal.PlainDate.from({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
  return pd.toString();
}

@customElement('edit-page')
export class EditPage extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    md-outlined-text-field,
    md-outlined-select {
      width: 100%;
    }
    .switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--md-sys-color-outline-variant);
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 70%, transparent);
    }
    .switch-row .label {
      font-size: 0.95rem;
      color: var(--md-sys-color-on-surface);
    }
    .switch-row .hint {
      font-size: 0.76rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-top: 2px;
    }
    .time-input {
      display: block;
      width: 100%;
      min-width: 0;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--md-sys-color-outline);
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 1rem;
      outline: none;
      box-sizing: border-box;
    }
    .time-input:focus {
      border-color: var(--md-sys-color-primary);
      border-width: 2px;
    }
    .section-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: -10px;
    }
    .tag-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tag-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 500;
      font-family: inherit;
      color: var(--md-sys-color-on-surface-variant);
      background: color-mix(in oklch, var(--tag-color) 10%, var(--md-sys-color-surface-container));
      border: 1.5px solid var(--md-sys-color-outline-variant);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease;
    }
    .tag-toggle:hover {
      filter: brightness(1.04);
    }
    .tag-toggle.on {
      color: var(--tag-fg);
      background: color-mix(in oklch, var(--tag-color) 30%, var(--md-sys-color-surface-container));
      border: 2px solid var(--tag-color);
      font-weight: 700;
    }
    .tag-toggle .check {
      display: inline-flex;
    }
    .custom-tag-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }
    .add-tag-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      color: var(--md-sys-color-on-primary);
      background: var(--md-sys-color-primary);
      transition: filter 0.15s ease;
    }
    .add-tag-btn:hover {
      filter: brightness(1.1);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .error {
      color: var(--md-sys-color-error);
      font-size: 0.78rem;
      margin-top: -14px;
    }
    .bg-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .bg-thumb {
      width: 132px;
      height: 76px;
      border-radius: 14px;
      border: 1px solid var(--md-sys-color-outline-variant);
      background-size: cover;
      background-position: center;
      flex: none;
    }
    .bg-thumb.empty {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--md-sys-color-on-surface-variant);
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 70%, transparent);
    }
    .bg-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .hidden-input {
      display: none;
    }
    .hint-text {
      font-size: 0.76rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-top: -12px;
    }
    /* 拖拽放置区：包裹缩略图 + 按钮的区域，拖拽时高亮 */
    .bg-drop-zone {
      border-radius: 18px;
      padding: 10px;
      margin: -10px;
      transition: background 0.15s ease, outline 0.15s ease;
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
    .bg-drop-zone.drag-over {
      background: color-mix(in oklch, var(--md-sys-color-primary-container) 40%, transparent);
      outline-color: var(--md-sys-color-primary);
    }
  `;

  @state() private editId: string | null = null;
  @state() private name = '';
  @state() private calendar: CalendarId = getSettings().defaultCalendar;
  @state() private gregDate: Date = new Date();
  @state() private hasTime = false;
  @state() private timeValue = '09:00';
  @state() private granularity: Granularity = getSettings().defaultGranularity;
  @state() private recurrence: Recurrence = 'none';
  /** 选中的标签 id 列表（对应全局标签库） */
  @state() private tags: string[] = [];
  @state() private pinned = false;
  @state() private bgImage: string | undefined = undefined;
  @state() private dragOverBg = false;
  @state() private newTagName = '';
  @state() private nameError = '';

  private unsubLocale?: () => void;
  private unsubTags?: () => void;
  private boundPaste!: (e: ClipboardEvent) => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
    this.unsubTags = onTagsChange(() => this.requestUpdate());
    this.boundPaste = (e: ClipboardEvent) => this.onPaste(e);
    window.addEventListener('paste', this.boundPaste);
    // 解析 ?id=
    const hash = location.hash;
    const q = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : null;
    const id = q?.get('id');
    if (id) {
      const ev = getEvent(id);
      if (ev) {
        this.editId = id;
        this.name = ev.name;
        this.calendar = ev.calendar;
        const [y, m, d] = ev.date.split('-').map(Number);
        this.gregDate = new Date(y, m - 1, d);
        this.hasTime = Boolean(ev.time);
        if (ev.time) this.timeValue = ev.time;
        this.granularity = ev.granularity;
        this.recurrence = ev.recurrence ?? 'none';
        this.tags = [...ev.tags];
        this.pinned = ev.pinned;
        this.bgImage = ev.bgImage;
        return;
      }
    }
    // 新建事件：重置为初始状态，避免复用元素时沿用上一次（可能陈旧的）数据
    this.editId = null;
    this.name = '';
    this.calendar = getSettings().defaultCalendar;
    this.gregDate = new Date();
    this.hasTime = false;
    this.timeValue = '09:00';
    this.granularity = getSettings().defaultGranularity;
    this.recurrence = 'none';
    this.tags = [];
    this.pinned = false;
    this.bgImage = undefined;
    this.newTagName = '';
    this.nameError = '';
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubLocale?.();
    this.unsubTags?.();
    window.removeEventListener('paste', this.boundPaste);
  }

  /* ---------- 历法日期选择联动 ---------- */

  private onCalendarChange(value: string) {
    this.calendar = value as CalendarId;
    // 新建事件：切换历法时把目标日期同步为「今日」（按新历法视角），不再沿用旧历法的日期
    if (!this.editId) this.gregDate = new Date();
    this.requestUpdate();
  }

  private onDatePicked(iso: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) {
      this.gregDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      this.requestUpdate();
    }
  }

  /* ---------- 标签（引用全局标签库） ---------- */

  private tagStyle(color: string): string {
    return `--tag-color: ${color}; --tag-bg: color-mix(in oklch, ${color} 22%, var(--md-sys-color-surface-container)); --tag-fg: color-mix(in oklch, ${color} 74%, var(--md-sys-color-on-surface));`;
  }

  private toggleTag(id: string) {
    this.tags = this.tags.includes(id) ? this.tags.filter((t) => t !== id) : [...this.tags, id];
    this.requestUpdate();
  }

  private createTag() {
    const label = this.newTagName.trim();
    if (!label) return;
    const def = addTag(label, NEW_TAG_COLOR);
    if (!this.tags.includes(def.id)) this.tags = [...this.tags, def.id];
    this.newTagName = '';
    toast(t('toastTagCreated'));
  }

  /* ---------- 卡片背景图（事件级） ---------- */

  private triggerBgUpload() {
    this.shadowRoot?.querySelector<HTMLInputElement>('#bgFile')?.click();
  }

  private async onBgFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.applyBgFile(file);
  }

  /** 从剪贴板粘贴或拖拽得到的图片文件 → 压缩 → 设置背景图 */
  private async applyBgFile(file: File) {
    try {
      this.bgImage = await fileToDownscaledDataURL(file);
      toast(t('toastBgSet'));
    } catch (err) {
      toast(err instanceof Error && err.message === 'too-large' ? t('toastBgTooLarge') : t('toastBgNotImage'));
    }
  }

  private onBgClear() {
    this.bgImage = undefined;
    toast(t('toastBgCleared'));
  }

  /* ---------- 拖拽上传 & 剪贴板粘贴 ---------- */

  private onBgDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      this.dragOverBg = true;
    }
  }

  private onBgDragLeave() {
    this.dragOverBg = false;
  }

  private async onBgDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOverBg = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await this.applyBgFile(file);
  }

  private async onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await this.applyBgFile(file);
          return;
        }
      }
    }
  }

  /** 点击「粘贴图片」按钮：尝试读取剪贴板中的图片 */
  private async onPasteButtonClick() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        toast(t('toastPasteUnsupported'));
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const file = new File([blob], 'pasted.png', { type: imgType });
          await this.applyBgFile(file);
          return;
        }
      }
      toast(t('toastPasteNoImage'));
    } catch {
      toast(t('toastPasteUnsupported'));
    }
  }

  /* ---------- 循环预览 ---------- */

  private recurrenceSummary(): string {
    const r = this.recurrence;
    if (r === 'none') return '';
    const locale = getLocale();
    const pd = Temporal.PlainDate.from({
      year: this.gregDate.getFullYear(),
      month: this.gregDate.getMonth() + 1,
      day: this.gregDate.getDate(),
    });
    if (r === 'weekly') {
      // Temporal dayOfWeek: 1=Mon..7=Sun；转为 Date 以复用 Intl 格式化
      const wd = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(this.gregDate);
      return t('recurSummaryWeekly', { weekday: wd });
    }
    if (r === 'monthly') {
      return t('recurSummaryMonthly', { day: pd.day });
    }
    const md = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(this.gregDate);
    return t('recurSummaryYearly', { date: md });
  }

  /* ---------- 保存 ---------- */

  private onSubmit(e: Event) {
    e.preventDefault();
    const name = this.name.trim();
    if (!name) {
      this.nameError = t('fieldNameRequired');
      toast(t('toastNameEmpty'));
      return;
    }
    this.nameError = '';
    const payload = {
      name,
      date: toISO(this.gregDate),
      time: this.hasTime ? this.timeValue : undefined,
      calendar: this.calendar,
      granularity: this.granularity,
      recurrence: this.recurrence,
      tags: this.tags,
      pinned: this.pinned,
      bgImage: this.bgImage,
    };
    if (this.editId) {
      updateEvent(this.editId, payload);
      toast(t('toastUpdated'));
    } else {
      addEvent(payload);
      toast(t('toastSaved'));
    }
    location.hash = '#/';
  }

  private fieldValue(e: Event): string {
    return (e.target as unknown as { value: string }).value;
  }

  private switchSelected(e: Event): boolean {
    return (e.target as unknown as { selected: boolean }).selected;
  }

  render() {
    return html`
      <form @submit=${this.onSubmit}>
        <md-outlined-text-field
          label=${t('fieldName')}
          placeholder=${t('fieldNamePlaceholder')}
          .value=${this.name}
          @input=${(e: Event) => (this.name = this.fieldValue(e))}
          ?error=${Boolean(this.nameError)}
          .errorText=${this.nameError}
          required
        ></md-outlined-text-field>
        ${this.nameError ? html`<div class="error">${this.nameError}</div>` : null}

        <md-outlined-select
          label=${t('fieldCalendar')}
          .value=${this.calendar}
          @change=${(e: Event) => this.onCalendarChange(this.fieldValue(e))}
        >
          ${CALENDAR_IDS.map(
            (cal) => html`<md-select-option value=${cal}>
              <div slot="headline">${t(CAL_I18N_KEYS[cal])}</div>
            </md-select-option>`
          )}
        </md-outlined-select>

        <div class="section-label">${t('fieldDate')}</div>
        ${keyed(
          this.calendar,
          html`<date-calendar
            .calendar=${this.calendar}
            .value=${toISO(this.gregDate)}
            @date-change=${(e: CustomEvent<string>) => this.onDatePicked(e.detail)}
          ></date-calendar>`
        )}

        <div class="switch-row">
          <div>
            <div class="label">${t('fieldPreciseTime')}</div>
            <div class="hint">${t('fieldPreciseTimeHint')}</div>
          </div>
          <md-switch ?selected=${this.hasTime} @change=${(e: Event) => (this.hasTime = this.switchSelected(e))}></md-switch>
        </div>
        ${this.hasTime
          ? html`<input
              class="time-input"
              type="time"
              .value=${this.timeValue}
              @input=${(e: Event) => (this.timeValue = (e.target as HTMLInputElement).value)}
              aria-label=${t('fieldPreciseTime')}
            />`
          : null}

        <md-outlined-select
          label=${t('fieldGranularity')}
          .value=${this.granularity}
          @change=${(e: Event) => (this.granularity = this.fieldValue(e) as Granularity)}
        >
          ${(Object.keys(GRAN_I18N_KEYS) as Granularity[]).map(
            (g) => html`<md-select-option value=${g}>
              <div slot="headline">${t(GRAN_I18N_KEYS[g])}</div>
            </md-select-option>`
          )}
        </md-outlined-select>

        <md-outlined-select
          label=${t('fieldRecurrence')}
          .value=${this.recurrence}
          @change=${(e: Event) => (this.recurrence = this.fieldValue(e) as Recurrence)}
        >
          ${(Object.keys(REC_I18N_KEYS) as Recurrence[]).map(
            (r) => html`<md-select-option value=${r}>
              <div slot="headline">${t(REC_I18N_KEYS[r])}</div>
            </md-select-option>`
          )}
        </md-outlined-select>
        ${this.recurrence !== 'none'
          ? html`<div class="hint-text">${this.recurrenceSummary()}</div>`
          : null}

        <div class="section-label">${t('fieldTags')}</div>
        <div class="tag-chips">
          ${getTags().map(
            (tg: TagDef) => {
              const on = this.tags.includes(tg.id);
              return html`<button
                type="button"
                class="tag-toggle ${on ? 'on' : ''}"
                style=${this.tagStyle(tg.color)}
                aria-pressed=${on ? 'true' : 'false'}
                @click=${() => this.toggleTag(tg.id)}
              >${on ? html`<span class="check">${icon('check', 16)}</span>` : null}${tagDisplay(tg)}</button>`;
            }
          )}
        </div>
        ${getTags().length === 0
          ? html`<div class="hint-text">${t('tagEmptyHint')}</div>`
          : null}
        <div class="custom-tag-row">
          <md-outlined-text-field
            label=${t('fieldCustomTag')}
            placeholder=${t('fieldCustomTagPlaceholder')}
            .value=${this.newTagName}
            @input=${(e: Event) => (this.newTagName = this.fieldValue(e))}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                this.createTag();
              }
            }}
          ></md-outlined-text-field>
          <button type="button" class="add-tag-btn" @click=${this.createTag} aria-label=${t('actionAdd')}>
            ${icon('add', 22)}
          </button>
        </div>

        <div class="section-label">${t('settingsBgImage')}</div>
        <div
          class="bg-drop-zone ${this.dragOverBg ? 'drag-over' : ''}"
          @dragover=${this.onBgDragOver}
          @dragleave=${this.onBgDragLeave}
          @drop=${this.onBgDrop}
        >
          <div class="bg-row">
            ${this.bgImage
              ? html`<div class="bg-thumb" style="background-image: url('${this.bgImage}')"></div>`
              : html`<div class="bg-thumb empty">${icon('image', 28)}</div>`}
            <div class="bg-actions">
              <md-outlined-button type="button" @click=${this.triggerBgUpload}>
                <span slot="icon" style="display:inline-flex">${icon('upload', 18)}</span>${t('actionUpload')}
              </md-outlined-button>
              <md-outlined-button type="button" @click=${this.onPasteButtonClick}>
                <span slot="icon" style="display:inline-flex">${icon('contentCopy', 18)}</span>${t('actionPaste')}
              </md-outlined-button>
              ${this.bgImage
                ? html`<md-text-button type="button" @click=${this.onBgClear}>${t('actionClear')}</md-text-button>`
                : null}
            </div>
            <input id="bgFile" class="hidden-input" type="file" accept="image/*" @change=${this.onBgFile} />
          </div>
        </div>
        <div class="hint-text">${t('settingsBgImageDropHint')}</div>

        <div class="switch-row">
          <div class="label">${t('fieldPinned')}</div>
          <md-switch ?selected=${this.pinned} @change=${(e: Event) => (this.pinned = this.switchSelected(e))}></md-switch>
        </div>

        <div class="actions">
          <md-text-button type="button" @click=${() => (location.hash = '#/')}>${t('actionCancel')}</md-text-button>
          <md-filled-button type="submit">
            <span slot="icon" style="display:inline-flex">${icon('check', 18)}</span>${t('actionSave')}
          </md-filled-button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'edit-page': EditPage;
  }
}
