/**
 * 多粒度时间展示器：按事件粒度实时刷新（秒级）
 */
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AevumEvent } from '../types.js';
import { computeDiff, parseBoundary, effectiveEvent, type DiffResult } from '../utils/time-calc.js';
import { formatSegments, statusLabel } from '../utils/format.js';
import { getSettings, onSettingsChange } from '../store/settings.js';
import { onLocaleChange, t } from '../i18n.js';
import { onTick } from '../tick.js';

@customElement('time-display')
export class TimeDisplay extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .status {
      font-size: 0.85rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 2px;
    }
    .status.today {
      color: var(--md-sys-color-primary);
      font-weight: 600;
    }
    .segments {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 8px;
    }
    .seg .value {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      font-size: 1.6rem;
      line-height: 1.1;
      color: var(--md-sys-color-primary);
    }
    .seg.past .value {
      color: var(--md-sys-color-tertiary);
    }
    .seg .unit {
      font-size: 0.8rem;
      color: var(--md-sys-color-on-surface-variant);
      margin-left: 1px;
    }
    :host([large]) .seg .value {
      font-size: clamp(2.4rem, 9vw, 3.6rem);
    }
    :host([large]) .seg .unit {
      font-size: 1rem;
    }
    :host([large]) .status {
      font-size: 1rem;
    }
  `;

  @property({ attribute: false }) event!: AevumEvent;

  @state() private diff: DiffResult | null = null;

  private unsubTick?: () => void;
  private unsubSettings?: () => void;
  private unsubLocale?: () => void;

  connectedCallback() {
    super.connectedCallback();
    const refresh = () => this.refresh();
    this.unsubTick = onTick(refresh);
    this.unsubSettings = onSettingsChange(refresh);
    this.unsubLocale = onLocaleChange(refresh);
    this.refresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubTick?.();
    this.unsubSettings?.();
    this.unsubLocale?.();
  }

  private refresh() {
    if (!this.event) return;
    const s = getSettings();
    const boundary = parseBoundary(s.dayBoundary);
    // 循环事件：将日期滚动到下一次发生，再计算差值
    const eff = effectiveEvent(this.event, Date.now(), boundary);
    this.diff = computeDiff(eff, Date.now(), boundary, eff.granularity);
  }

  render() {
    if (!this.diff) return html``;
    const diff = this.diff;
    const segs = formatSegments(diff);
    const statusClass = diff.status === 'today' ? 'status today' : 'status';
    const segClass = diff.status === 'past' ? 'seg past' : 'seg';

    if (diff.status === 'today') {
      return html`
        <div class=${statusClass}>${t('statusToday')}</div>
        <div class="segments">
          <span class="seg"><span class="value">0</span><span class="unit">${t('unitDay')}</span></span>
        </div>
      `;
    }

    return html`
      <div class=${statusClass}>${statusLabel(diff)}</div>
      <div class="segments">
        ${segs.map(
          (s) => html`<span class=${segClass}><span class="value">${s.value}</span><span class="unit">${s.unit}</span></span>`
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'time-display': TimeDisplay;
  }
}
