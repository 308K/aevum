/**
 * 事件卡片（Material 3 Card）：名称、历法日期、标签、多粒度倒计时
 */
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { AevumEvent, Recurrence } from '../types.js';
import { formatEventDate } from '../utils/calendar.js';
import { effectiveEvent, parseBoundary } from '../utils/time-calc.js';
import { getSettings } from '../store/settings.js';
import { resolveEventTags, tagDisplay } from '../store/tags.js';
import { getLocale, onLocaleChange, t } from '../i18n.js';
import { icon } from '../icons.js';
import './time-display.js';

const REC_I18N_KEYS: Record<Recurrence, 'fieldRecurNone' | 'recurWeekly' | 'recurMonthly' | 'recurYearly'> = {
  none: 'fieldRecurNone',
  weekly: 'recurWeekly',
  monthly: 'recurMonthly',
  yearly: 'recurYearly',
};

@customElement('event-card')
export class EventCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .card {
      position: relative;
      border-radius: 20px;
      padding: 16px 20px;
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 88%, transparent);
      border: 1px solid color-mix(in oklch, var(--md-sys-color-outline-variant) 55%, transparent);
      box-shadow: 0 1px 2px color-mix(in oklch, var(--md-sys-color-shadow) 10%, transparent);
      cursor: pointer;
      transition:
        transform 0.18s ease,
        box-shadow 0.18s ease,
        background 0.18s ease;
      overflow: hidden;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 14px color-mix(in oklch, var(--md-sys-color-shadow) 16%, transparent);
      background: color-mix(in oklch, var(--md-sys-color-surface-container-high) 92%, transparent);
    }
    .card:active {
      transform: translateY(0);
    }
    .card:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .card {
        transition: box-shadow 0.18s ease, background 0.18s ease;
      }
      .card:hover,
      .card:active {
        transform: none;
      }
    }
    .card .bg,
    .card .scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .card .bg {
      background-size: cover;
      background-position: center;
    }
    .card .scrim {
      /* 压暗/提亮纱罩，亮暗模式下均保证文字可读 */
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 82%, transparent);
    }
    .card .inner {
      position: relative;
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .name {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 4px;
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
      word-break: break-word;
    }
    .pin {
      flex: none;
      display: inline-flex;
      color: var(--md-sys-color-primary);
    }
    .date {
      font-size: 0.82rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .date .recur {
      display: inline-flex;
      color: var(--md-sys-color-primary);
      flex: none;
    }
    .bottom {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 0.72rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--tag-fg, var(--md-sys-color-on-surface));
      background: var(--tag-bg, var(--md-sys-color-secondary-container));
    }
    .tag .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.75;
    }
    time-display {
      flex: none;
      text-align: right;
    }
    time-display::part(wrapper) {
      justify-content: flex-end;
    }
  `;

  @property({ attribute: false }) event!: AevumEvent;

  private unsubLocale?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubLocale?.();
  }

  private onActivate(e: Event) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('card-open', { detail: { id: this.event.id }, bubbles: true, composed: true })
    );
  }

  private tagStyle(color: string): string {
    // 标签色 → 柔和容器色 + 深色文字（OKLCH 混合，亮暗皆宜）
    return `--tag-bg: color-mix(in oklch, ${color} 22%, var(--md-sys-color-surface-container)); --tag-fg: color-mix(in oklch, ${color} 72%, var(--md-sys-color-on-surface));`;
  }

  render() {
    const ev = effectiveEvent(this.event, Date.now(), parseBoundary(getSettings().dayBoundary));
    const recurring = ev.recurrence && ev.recurrence !== 'none';
    return html`
      <div
        class="card"
        role="button"
        tabindex="0"
        aria-label=${ev.name}
        @click=${this.onActivate}
        @keydown=${this.onActivate}
      >
        ${ev.bgImage
          ? html`<div class="bg" style="background-image: url('${ev.bgImage}')"></div>
              <div class="scrim"></div>`
          : null}
        <div class="inner">
          <div class="top">
            <div>
              <h3 class="name">
                ${ev.pinned ? html`<span class="pin">${icon('pin', 16)}</span>` : null}${ev.name}
              </h3>
              <div class="date">
                ${recurring ? html`<span class="recur" title=${t(REC_I18N_KEYS[ev.recurrence!])}>${icon('repeat', 14)}</span>` : null}
                ${formatEventDate(ev.date, ev.calendar, getLocale())}${ev.time ? ` ${ev.time}` : ''}
              </div>
            </div>
          </div>
          <div class="bottom">
            <div class="tags">
              ${resolveEventTags(ev).map(
                (tag) => html`<span class="tag" style=${this.tagStyle(tag.color)}><span class="dot"></span>${tagDisplay(tag)}</span>`
              )}
            </div>
            <time-display .event=${ev}></time-display>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'event-card': EventCard;
  }
}
