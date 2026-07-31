/**
 * 主页：事件列表（排序：置顶优先 → 日期升序）+ 空状态
 */
import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import type { AevumEvent } from '../types.js';
import { getEvents, onEventsChange, sortedEvents } from '../store/events.js';
import { getTags, onTagsChange, tagDisplay } from '../store/tags.js';
import { onLocaleChange, t } from '../i18n.js';
import { icon } from '../icons.js';
import '../components/event-card.js';
import '../components/event-detail.js';
import type { EventDetail } from '../components/event-detail.js';

/** 跨导航保持的筛选状态（首页卸载后仍记住所选标签） */
let sessionTagFilter: string[] = [];

@customElement('home-page')
export class HomePage extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .filterbar {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 2px 2px 12px;
      scrollbar-width: none;
    }
    .filterbar::-webkit-scrollbar {
      display: none;
    }
    .fchip {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid var(--md-sys-color-outline-variant);
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 70%, transparent);
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .fchip::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--chip-color, var(--md-sys-color-outline));
    }
    .fchip.on {
      background: color-mix(in oklch, var(--chip-color, var(--md-sys-color-primary)) 22%, var(--md-sys-color-surface-container));
      border-color: color-mix(in oklch, var(--chip-color, var(--md-sys-color-primary)) 60%, transparent);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 96px 24px;
      color: var(--md-sys-color-on-surface-variant);
    }
    .empty .art {
      width: 96px;
      height: 96px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in oklch, var(--md-sys-color-primary-container) 60%, transparent);
      color: var(--md-sys-color-on-primary-container);
      margin-bottom: 20px;
    }
    .empty .title {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
      margin-bottom: 6px;
    }
    .empty .hint {
      font-size: 0.85rem;
    }
  `;

  @state() private events: AevumEvent[] = [];
  @state() private filterIds: string[] = sessionTagFilter;

  @query('event-detail') private detail!: EventDetail;

  private unsubEvents?: () => void;
  private unsubLocale?: () => void;
  private unsubTags?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.events = getEvents();
    this.unsubEvents = onEventsChange((list) => (this.events = list));
    this.unsubLocale = onLocaleChange(() => this.requestUpdate());
    this.unsubTags = onTagsChange(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubEvents?.();
    this.unsubLocale?.();
    this.unsubTags?.();
  }

  private onCardOpen(e: CustomEvent<{ id: string }>) {
    this.detail.open(e.detail.id);
  }

  private toggleFilter(id: string) {
    const set = new Set(this.filterIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.filterIds = [...set];
    sessionTagFilter = this.filterIds;
  }

  private clearFilter() {
    this.filterIds = [];
    sessionTagFilter = [];
  }

  render() {
    const all = sortedEvents(this.events);
    // 丢弃已被删除的标签 id，避免筛选后列表意外为空
    const validFilter = this.filterIds.filter((id) => getTags().some((tg) => tg.id === id));
    const visible =
      validFilter.length === 0
        ? all
        : all.filter((e) => e.tags.some((id) => validFilter.includes(id)));
    const hasTags = getTags().length > 0;
    const filtering = validFilter.length > 0;

    return html`
      ${hasTags
        ? html`<div class="filterbar">
            <button class="fchip ${filtering ? '' : 'on'}" @click=${this.clearFilter}>${t('filterAll')}</button>
            ${getTags().map(
              (tg) => html`<button
                class="fchip ${validFilter.includes(tg.id) ? 'on' : ''}"
                style="--chip-color: ${tg.color}"
                @click=${() => this.toggleFilter(tg.id)}
              >${tagDisplay(tg)}</button>`
            )}
          </div>`
        : null}
      ${visible.length === 0
        ? html`
            <div class="empty">
              <div class="art">${icon(filtering ? 'tag' : 'event', 44)}</div>
              <div class="title">${filtering ? t('filterEmpty') : t('emptyTitle')}</div>
              <div class="hint">${filtering ? '' : t('emptyHint')}</div>
            </div>
          `
        : html`
            <div class="list" @card-open=${this.onCardOpen}>
              ${visible.map((ev) => html`<event-card .event=${ev}></event-card>`)}
            </div>
          `}
      <event-detail></event-detail>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'home-page': HomePage;
  }
}
