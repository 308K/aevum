import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

/** 一组快速取色色板（与主题种子色一致） */
const PRESET_PALETTE = [
  '#6750A4', '#006A6A', '#8E4956', '#4C662B',
  '#3B608F', '#9A4522', '#5B5791', '#7D5260',
  '#B3261E', '#E65100', '#F9A825', '#2E7D32',
  '#0277BD', '#512DA8', '#C2185B', '#37474F',
];

function normHex(hex: string): string {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase();
  return '';
}

function hexToHsv(hex: string): HSV {
  const n = normHex(hex);
  if (!n) return { h: 0, s: 0, v: 0 };
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToHex(hsv: HSV): string {
  const { h, s, v } = hsv;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * 自定义颜色选择器（不依赖系统原生 input[type=color]）。
 * - 触发按钮显示当前颜色
 * - 弹出面板：饱和度/明度方块 + 色相条 + 十六进制输入 + 快速色板
 * - 实时派发 `color-change` 事件，detail.value 为 #rrggbb
 */
@customElement('color-picker')
export class ColorPicker extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }
    .trigger {
      width: 100%;
      height: 100%;
      min-width: 28px;
      min-height: 28px;
      padding: 0;
      border: 2px solid var(--md-sys-color-outline-variant);
      border-radius: 50%;
      cursor: pointer;
      background: var(--cp-color, #888);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      transition: transform 0.15s ease;
    }
    .trigger:hover {
      transform: scale(1.06);
    }
    .trigger:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 9998;
    }
    .panel {
      position: fixed;
      z-index: 9999;
      width: 264px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      box-shadow: 0 10px 34px rgba(0, 0, 0, 0.4);
    }
    .sv {
      position: relative;
      width: 100%;
      height: 158px;
      border-radius: 10px;
      cursor: crosshair;
      touch-action: none;
    }
    .hue {
      position: relative;
      width: 100%;
      height: 14px;
      border-radius: 7px;
      cursor: pointer;
      touch-action: none;
      background: linear-gradient(
        to right,
        #f00 0%,
        #ff0 17%,
        #0f0 33%,
        #0ff 50%,
        #00f 67%,
        #f0f 83%,
        #f00 100%
      );
    }
    .thumb {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .hex-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hash {
      color: var(--md-sys-color-on-surface-variant);
      font-variant-numeric: tabular-nums;
      font-size: 0.95rem;
    }
    .hex-input {
      flex: 1;
      min-width: 0;
      padding: 9px 12px;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--md-sys-color-on-surface);
      background: var(--md-sys-color-surface);
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 10px;
    }
    .hex-input:focus {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 1px;
    }
    .palette {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
    }
    .pchip {
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      background: var(--c);
    }
    .pchip[selected] {
      border-color: var(--md-sys-color-on-surface);
      box-shadow: 0 0 0 2px color-mix(in oklch, var(--c) 50%, transparent);
    }
  `;

  @property({ type: String }) value = '#5B5791';

  @state() private open = false;
  @state() private hsv: HSV = { h: 0, s: 0, v: 0 };
  @state() private popStyle = '';
  private dragging: '' | 'sv' | 'hue' = '';
  private winHandler = () => this.close();
  private onWinMove = (e: PointerEvent) => {
    if (this.dragging === 'sv') this.updateSv(e);
    else if (this.dragging === 'hue') this.updateHue(e);
  };
  private onWinUp = () => {
    const wasDragging = this.dragging !== '';
    this.dragging = '';
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('pointerup', this.onWinUp);
    if (wasDragging) this.dispatchChange();
  };

  @query('.sv') private svEl!: HTMLDivElement;
  @query('.hue') private hueEl!: HTMLDivElement;

  connectedCallback() {
    super.connectedCallback();
    this.hsv = hexToHsv(this.value);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('value')) {
      const nh = normHex(this.value);
      if (nh && nh !== normHex(hsvToHex(this.hsv))) this.hsv = hexToHsv(this.value);
    }
  }

  private toggle() {
    if (this.open) this.close();
    else this.openPanel();
  }

  private openPanel() {
    this.hsv = hexToHsv(this.value);
    this.computePos();
    this.open = true;
    window.addEventListener('scroll', this.winHandler, true);
    window.addEventListener('resize', this.winHandler);
    window.addEventListener('keydown', this.onKey);
  }

  private close() {
    if (!this.open) return;
    this.open = false;
    this.dragging = '';
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('pointerup', this.onWinUp);
    window.removeEventListener('scroll', this.winHandler, true);
    window.removeEventListener('resize', this.winHandler);
    window.removeEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };

  private computePos() {
    const r = this.getBoundingClientRect();
    const pw = 264;
    const ph = 360;
    let left = r.left;
    let top = r.bottom + 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - 8 - ph);
    this.popStyle = `left:${Math.round(left)}px; top:${Math.round(top)}px;`;
  }

  /** 仅更新内部状态与触发按钮预览，不派发事件（拖动中逐帧调用，保持轻量） */
  private setLocal(next: HSV) {
    this.hsv = next;
    this.value = hsvToHex(next);
  }

  /** 派发最终颜色给父组件（释放时 / 离散操作时调用一次） */
  private dispatchChange() {
    this.dispatchEvent(
      new CustomEvent('color-change', { detail: { value: this.value }, bubbles: true, composed: true })
    );
  }

  private onSvDown(e: PointerEvent) {
    e.preventDefault();
    this.dragging = 'sv';
    this.updateSv(e);
    window.addEventListener('pointermove', this.onWinMove);
    window.addEventListener('pointerup', this.onWinUp);
  }

  private updateSv(e: PointerEvent) {
    const rect = this.svEl.getBoundingClientRect();
    const s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
    this.setLocal({ h: this.hsv.h, s, v });
  }

  private onHueDown(e: PointerEvent) {
    e.preventDefault();
    this.dragging = 'hue';
    this.updateHue(e);
    window.addEventListener('pointermove', this.onWinMove);
    window.addEventListener('pointerup', this.onWinUp);
  }

  private updateHue(e: PointerEvent) {
    const rect = this.hueEl.getBoundingClientRect();
    const h = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
    this.setLocal({ h, s: this.hsv.s, v: this.hsv.v });
  }

  private onHexInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value.replace('#', '').trim();
    const hex = normHex(raw);
    if (hex) {
      this.setLocal(hexToHsv(hex));
      this.dispatchChange();
    }
  }

  private pick(c: string) {
    this.setLocal(hexToHsv(c));
    this.dispatchChange();
  }

  render() {
    const { h, s, v } = this.hsv;
    const hueBase = `hsl(${Math.round(h)}, 100%, 50%)`;
    return html`
      <button
        class="trigger"
        type="button"
        style=${`--cp-color:${this.value}`}
        aria-label="choose color"
        aria-haspopup="dialog"
        aria-expanded=${this.open ? 'true' : 'false'}
        @click=${this.toggle}
      ></button>
      ${this.open
        ? html`
            <div class="backdrop" @click=${this.close}></div>
            <div class="panel" style=${this.popStyle} role="dialog" aria-label="color picker">
              <div
                class="sv"
                @pointerdown=${this.onSvDown}
                style=${`background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueBase};`}
              >
                <span class="thumb" style=${`left:${s * 100}%; top:${(1 - v) * 100}%; background:${this.value};`}></span>
              </div>
              <div
                class="hue"
                @pointerdown=${this.onHueDown}
              >
                <span class="thumb" style=${`left:${h / 360 * 100}%;`}></span>
              </div>
              <div class="hex-row">
                <span class="hash">#</span>
                <input
                  class="hex-input"
                  type="text"
                  .value=${this.value.replace('#', '')}
                  @input=${this.onHexInput}
                  maxlength="6"
                  spellcheck="false"
                  aria-label="hex color"
                />
              </div>
              <div class="palette">
                ${PRESET_PALETTE.map(
                  (c) => html`<button
                    class="pchip"
                    type="button"
                    style=${`--c:${c}`}
                    ?selected=${normHex(c) === normHex(this.value)}
                    @click=${() => this.pick(c)}
                    aria-label=${c}
                  ></button>`
                )}
              </div>
            </div>
          `
        : null}
    `;
  }
}
