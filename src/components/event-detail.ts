/**
 * 事件详情弹窗（Material 3 Dialog）：大字号倒计时 + 信息 + 编辑/删除
 * 删除操作带 M3 确认 Dialog 防误触
 */
import { LitElement, html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/iconbutton/icon-button.js';
import type { AevumEvent, Recurrence } from '../types.js';
import { getEvent, deleteEvent } from '../store/events.js';
import { formatEventDateTime } from '../utils/calendar.js';
import { effectiveEvent } from '../utils/time-calc.js';
import { parseBoundary } from '../utils/time-calc.js';
import { getSettings } from '../store/settings.js';
import { resolveEventTags, tagDisplay } from '../store/tags.js';
import { saveEventShareImage } from '../utils/share-image.js';
import { getLocale, t, formatGregorian } from '../i18n.js';
import { icon } from '../icons.js';
import { toast } from './app-snackbar.js';
import './time-display.js';

const CAL_I18N_KEYS = {
  gregory: 'calGregory',
  chinese: 'calChinese',
  islamic: 'calIslamic',
  hebrew: 'calHebrew',
  persian: 'calPersian',
  buddhist: 'calBuddhist',
  japanese: 'calJapanese',
} as const;

const GRAN_I18N_KEYS = {
  day: 'granDay',
  dhms: 'granDhms',
  ymd: 'granYmd',
  ywd: 'granYwd',
  wd: 'granWd',
} as const;

const REC_I18N_KEYS: Record<Recurrence, 'fieldRecurNone' | 'recurWeekly' | 'recurMonthly' | 'recurYearly'> = {
  none: 'fieldRecurNone',
  weekly: 'recurWeekly',
  monthly: 'recurMonthly',
  yearly: 'recurYearly',
};

@customElement('event-detail')
export class EventDetail extends LitElement {
  static styles = css`
    md-dialog {
      --md-dialog-container-color: var(--md-sys-color-surface-container-high);
      min-width: min(420px, 92vw);
    }
    .hero {
      position: relative;
      text-align: center;
      padding: 8px 0 16px;
      border-radius: 20px;
      overflow: hidden;
    }
    .hero.has-bg {
      padding: 24px 16px 20px;
    }
    .hero-bg,
    .hero-scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .hero-bg {
      background-size: cover;
      background-position: center;
    }
    .hero-scrim {
      background: color-mix(in oklch, var(--md-sys-color-surface-container-high) 84%, transparent);
    }
    .hero-inner {
      position: relative;
    }
    .hero .name {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0 0 4px;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }
    .hero .pin {
      display: inline-flex;
      color: var(--md-sys-color-primary);
    }
    .hero .date {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.9rem;
      margin-bottom: 16px;
    }
    .hero time-display {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .tags {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 14px;
    }
    .tag {
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--tag-fg);
      background: var(--tag-bg);
    }
    .meta {
      margin-top: 16px;
      border-top: 1px solid var(--md-sys-color-outline-variant);
      padding-top: 12px;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 16px;
      font-size: 0.82rem;
    }
    .meta dt {
      color: var(--md-sys-color-on-surface-variant);
    }
    .meta dd {
      margin: 0;
      color: var(--md-sys-color-on-surface);
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .btn-icon {
      display: inline-flex;
      align-items: center;
    }
    /* 头部标题 + 右上角关闭叉号 */
    .dialog-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .dialog-title {
      font-size: 1.35rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .head-close {
      flex: none;
      color: var(--md-sys-color-on-surface-variant);
    }
    /* 窄屏：操作按钮换行并占满整行，避免挤在一排 */
    @media (max-width: 480px) {
      .actions > * {
        flex: 1 1 40%;
        min-width: 0;
      }
    }
  `;

  @query('#detailDialog') private detailDialog!: MdDialog;
  @query('#confirmDialog') private confirmDialog!: MdDialog;

  @state() private eventId: string | null = null;

  open(id: string) {
    this.eventId = id;
    this.detailDialog.show();
  }

  private get ev(): AevumEvent | undefined {
    return this.eventId ? getEvent(this.eventId) : undefined;
  }

  private close() {
    this.detailDialog.close();
  }

  private onEdit() {
    const id = this.eventId;
    this.close();
    if (id) location.hash = `#/edit?id=${encodeURIComponent(id)}`;
  }

  private onDeleteRequest() {
    this.confirmDialog.show();
  }

  private sharing = false;

  private async onShareImage() {
    const ev = this.ev;
    if (!ev || this.sharing) return;
    this.sharing = true;
    try {
      await saveEventShareImage(ev);
      toast(t('toastImageSaved'));
    } catch {
      /* 用户环境不支持 canvas 导出时静默失败 */
    } finally {
      this.sharing = false;
    }
  }

  private onDeleteConfirm() {
    if (this.eventId) {
      deleteEvent(this.eventId);
      toast(t('toastDeleted'));
    }
    this.confirmDialog.close();
    this.close();
  }

  render() {
    const ev = this.ev;
    const locale = getLocale();
    const eff = ev ? effectiveEvent(ev, Date.now(), parseBoundary(getSettings().dayBoundary)) : undefined;
    const recurring = ev?.recurrence && ev.recurrence !== 'none';
    return html`
      <md-dialog id="detailDialog">
        <div slot="headline" class="dialog-head">
          <span class="dialog-title">${ev ? ev.name : ''}</span>
          <md-icon-button class="head-close" @click=${this.close} aria-label=${t('actionClose')}>
            ${icon('close', 20)}
          </md-icon-button>
        </div>
        <div slot="content">
          ${ev && eff
            ? html`
                <div class="hero ${ev.bgImage ? 'has-bg' : ''}">
                  ${ev.bgImage
                    ? html`<div class="hero-bg" style="background-image: url('${ev.bgImage}')"></div>
                        <div class="hero-scrim"></div>`
                    : null}
                  <div class="hero-inner">
                    <div class="date">
                      ${formatEventDateTime(eff.date, eff.time, eff.calendar, locale)}
                    </div>
                    <time-display large .event=${eff}></time-display>
                    ${resolveEventTags(ev).length
                      ? html`<div class="tags">
                          ${resolveEventTags(ev).map(
                            (tag) => html`<span
                              class="tag"
                              style="--tag-bg: color-mix(in oklch, ${tag.color} 22%, var(--md-sys-color-surface-container)); --tag-fg: color-mix(in oklch, ${tag.color} 72%, var(--md-sys-color-on-surface));"
                              >${tagDisplay(tag)}</span
                            >`
                          )}
                        </div>`
                      : null}
                  </div>
                </div>
                <dl class="meta">
                  <dt>${t('detailCalendar')}</dt>
                  <dd>${t(CAL_I18N_KEYS[ev.calendar])}</dd>
                  <dt>${t('detailGranularity')}</dt>
                  <dd>${t(GRAN_I18N_KEYS[ev.granularity])}</dd>
                  ${recurring
                    ? html`<dt>${t('detailRecurrence')}</dt>
                        <dd>${t(REC_I18N_KEYS[ev.recurrence!])}</dd>`
                    : null}
                  <dt>${t('detailCreatedAt')}</dt>
                  <dd>${formatGregorian(new Date(ev.createdAt), true)}</dd>
                </dl>
              `
            : null}
        </div>
        <div slot="actions" class="actions">
          <md-text-button @click=${this.onDeleteRequest}>
            <span class="btn-icon" slot="icon">${icon('delete', 18)}</span>${t('actionDelete')}
          </md-text-button>
          <md-outlined-button @click=${this.onShareImage}>
            <span class="btn-icon" slot="icon">${icon('share', 18)}</span>${t('actionShareImage')}
          </md-outlined-button>
          <md-outlined-button @click=${this.onEdit}>
            <span class="btn-icon" slot="icon">${icon('edit', 18)}</span>${t('actionEdit')}
          </md-outlined-button>
        </div>
      </md-dialog>

      <md-dialog id="confirmDialog">
        <div slot="headline">${t('deleteConfirmTitle')}</div>
        <div slot="content">${ev ? t('deleteConfirmBody', { name: ev.name }) : ''}</div>
        <div slot="actions">
          <md-text-button @click=${() => this.confirmDialog.close()}>${t('actionCancel')}</md-text-button>
          <md-filled-button @click=${this.onDeleteConfirm}>${t('actionConfirmDelete')}</md-filled-button>
        </div>
      </md-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'event-detail': EventDetail;
  }
}
