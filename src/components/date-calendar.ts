/**
 * 日历形式的目标日期选择器（历法感知、无障碍）
 * - 复用 calendar.ts 的纯函数层（keysFromGregorian / yearOptions / monthOptions / monthCalendarDays）
 * - 7 列周网格，支持上/下月、上/下年导航与「今天」快捷跳转
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历均按各自历法展示
 * - 无障碍：role=grid 语义、roving tabindex、方向键/Home/End/PageUp/PageDown 键盘导航、
 *   每个日格提供完整日期的 aria-label、选中态用 aria-selected
 */
import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  monthCalendarDays,
  yearOptions,
  monthOptions,
  keysFromGregorian,
  formatYearMonthHeader,
  type CalDayCell,
} from '../utils/calendar.js';
import { Temporal } from '../utils/temporal.js';
import type { CalendarId, WeekStart } from '../types.js';
import { getLocale, t } from '../i18n.js';
import { getSettings, onSettingsChange } from '../store/settings.js';
import { icon } from '../icons.js';

const GRID_ID = 'aevum-cal-grid';
const HINT_ID = 'aevum-cal-hint';

function toISO(d: Date): string {
  const pd = Temporal.PlainDate.from({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
  return pd.toString();
}

function fromISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  try {
    const pd = Temporal.PlainDate.from(iso);
    return new Date(pd.year, pd.month - 1, pd.day);
  } catch {
    return null;
  }
}

/** 取某 locale 的每周首日列索引（0=周日 … 6=周六）
 *  优先用 Intl weekInfo；override 为固定选择（'sunday'/'monday'/'saturday'）时直接采用；
 *  override 为 'locale' 或省略时回退到语言惯例。 */
function firstDayOfWeek(locale: string, override?: WeekStart): number {
  if (override && override !== 'locale') {
    switch (override) {
      case 'sunday': return 0;
      case 'monday': return 1;
      case 'saturday': return 6;
    }
  }
  try {
    const li = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const wi = li.getWeekInfo?.() ?? li.weekInfo;
    if (wi && typeof wi.firstDay === 'number') return wi.firstDay === 7 ? 0 : wi.firstDay;
  } catch {
    /* 忽略，按下方惯例回退 */
  }
  return locale.startsWith('zh') ? 1 : 0;
}

@customElement('date-calendar')
export class DateCalendar extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .picker {
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 55%, transparent);
      padding: 14px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 8px;
    }
    .title {
      flex: 1;
      min-width: 0;
      text-align: center;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      flex: none;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--md-sys-color-on-surface-variant);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .nav:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .nav:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      margin-bottom: 4px;
    }
    .wd {
      text-align: center;
      font-size: 0.72rem;
      color: var(--md-sys-color-on-surface-variant);
      padding: 4px 0;
    }
    .grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .grid-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    .empty {
      display: block;
      aspect-ratio: 1 / 1;
      pointer-events: none;
    }
    .day {
      aspect-ratio: 1 / 1;
      width: 100%;
      max-width: 44px;
      margin: 0 auto;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
    }
    .day:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .day:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .day.muted {
      color: color-mix(in oklch, var(--md-sys-color-on-surface) 42%, transparent);
    }
    .day.today {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .day.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .day.selected.today {
      box-shadow: none;
    }
    .footer {
      display: flex;
      justify-content: center;
      margin-top: 10px;
    }
    .hint {
      /* 仅供屏幕阅读器：视觉隐藏，但读屏在网格获焦时会念出 */
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .today-btn {
      padding: 6px 18px;
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 999px;
      background: transparent;
      color: var(--md-sys-color-primary);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .today-btn:hover {
      background: color-mix(in oklch, var(--md-sys-color-primary) 8%, transparent);
    }
    .today-btn:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
  `;

  /** 当前录入使用的历法 */
  @property({ type: String }) calendar: CalendarId = 'gregory';
  /** 当前选中的公历 ISO 日期 yyyy-mm-dd */
  @property({ type: String }) value = '';

  @state() private viewYearKey = '';
  @state() private viewMonthKey = '';
  /** 当前键盘/视觉焦点所在的日（公历 ISO），用于 roving tabindex */
  @state() private focusKey = '';
  /** 标记一次键盘导航后需要把 DOM 焦点移到指定日格 */
  private pendingFocus = false;
  /** 上次用于初始化视图的 value，避免视图被已选值反复重置 */
  private lastValue = '';

  willUpdate() {
    if (this.value && this.value !== this.lastValue) {
      const d = fromISO(this.value);
      if (d) {
        const sel = keysFromGregorian(d, this.calendar);
        this.viewYearKey = sel.yearKey;
        this.viewMonthKey = sel.monthKey;
        this.lastValue = this.value;
        // 首次由外部值初始化视图时，同步焦点到该日
        if (!this.focusKey) this.focusKey = this.value;
      }
    }
  }

  protected updated(changed: PropertyValues) {
    if (this.pendingFocus && this.focusKey) {
      const el = this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-iso="${this.focusKey}"]`);
      el?.focus();
      this.pendingFocus = false;
    }
    void changed;
  }

  private get locale() {
    return getLocale();
  }

  /** 当前生效的每周首日列索引：跟随设置（默认按 locale 习惯） */
  private get resolvedFirstDOW(): number {
    return firstDayOfWeek(this.locale, getSettings().weekStart);
  }

  private unsubSettings?: () => void;

  connectedCallback() {
    super.connectedCallback();
    // 设置变更（如周起始日）即时反映到日历
    this.unsubSettings = onSettingsChange(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubSettings?.();
  }

  /** 作为 yearOptions 采样中心的参考公历日期（取当前选中值，确保视图年份落在 ±100 年内） */
  private get refDate(): Date {
    return fromISO(this.value) ?? new Date();
  }

  private emit(date: Date) {
    this.dispatchEvent(
      new CustomEvent<string>('date-change', { detail: toISO(date), bubbles: true, composed: true })
    );
  }

  /** 当前焦点日的「公历日序号」，用于跨月导航时尽量保持同一天 */
  private currentFocusDay(): number {
    const d = fromISO(this.focusKey) ?? fromISO(this.value) ?? new Date();
    return d.getDate();
  }

  /** 视图切换后，让焦点落在新月份中「相同日序号」（超出则月末）的日格上 */
  private reseatFocusAfterViewChange(oldDay: number) {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.locale);
    if (!cells.length) return;
    const idx = Math.min(Math.max(oldDay, 1), cells.length) - 1;
    this.focusKey = toISO(cells[idx].greg);
  }

  private stepMonth(delta: number) {
    const oldDay = this.currentFocusDay();
    const years = yearOptions(this.calendar, this.refDate, this.locale);
    const months = monthOptions(this.calendar, this.viewYearKey, this.locale);
    const mi = months.findIndex((m) => m.key === this.viewMonthKey);
    const next = mi + delta;
    if (next >= 0 && next < months.length) {
      this.viewMonthKey = months[next].key;
    } else {
      // 跨年：先定位年份，再取该年首/末月
      const yi = years.findIndex((y) => y.key === this.viewYearKey) + delta;
      if (yi < 0 || yi >= years.length) return;
      this.viewYearKey = years[yi].key;
      const nm = monthOptions(this.calendar, this.viewYearKey, this.locale);
      this.viewMonthKey = delta > 0 ? nm[0].key : nm[nm.length - 1].key;
    }
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  private stepYear(delta: number) {
    const oldDay = this.currentFocusDay();
    const years = yearOptions(this.calendar, this.refDate, this.locale);
    const yi = years.findIndex((y) => y.key === this.viewYearKey) + delta;
    if (yi < 0 || yi >= years.length) return;
    this.viewYearKey = years[yi].key;
    // 新年份可能不含当前月份（如闰月/缺失月），回退到该年首月
    const months = monthOptions(this.calendar, this.viewYearKey, this.locale);
    if (!months.some((m) => m.key === this.viewMonthKey)) {
      this.viewMonthKey = months[0].key;
    }
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  /** 取得相对当前视图偏移 delta（±1）个月的年/月键；越界（年份选项外）返回 null */
  private adjacentMonthKeys(delta: number): { yearKey: string; monthKey: string } | null {
    const years = yearOptions(this.calendar, this.refDate, this.locale);
    const months = monthOptions(this.calendar, this.viewYearKey, this.locale);
    const mi = months.findIndex((m) => m.key === this.viewMonthKey);
    const next = mi + delta;
    if (next >= 0 && next < months.length) {
      return { yearKey: this.viewYearKey, monthKey: months[next].key };
    }
    const yi = years.findIndex((y) => y.key === this.viewYearKey) + delta;
    if (yi < 0 || yi >= years.length) return null;
    const ny = years[yi].key;
    const nm = monthOptions(this.calendar, ny, this.locale);
    return { yearKey: ny, monthKey: delta > 0 ? nm[0].key : nm[nm.length - 1].key };
  }

  private jumpToday() {
    const sel = keysFromGregorian(new Date(), this.calendar);
    this.viewYearKey = sel.yearKey;
    this.viewMonthKey = sel.monthKey;
    this.focusKey = toISO(new Date());
    this.requestUpdate();
  }

  /** 把焦点（可能跨月）移到某公历日期对应的日格 */
  private setFocusDate(d: Date) {
    const k = keysFromGregorian(d, this.calendar);
    if (k.yearKey !== this.viewYearKey || k.monthKey !== this.viewMonthKey) {
      this.viewYearKey = k.yearKey;
      this.viewMonthKey = k.monthKey;
    }
    this.focusKey = toISO(d);
    this.pendingFocus = true;
    this.requestUpdate();
  }

  private pickDay(d: Date) {
    this.focusKey = toISO(d);
    this.emit(d);
  }

  /** 网格键盘导航：方向键/Home/End/PageUp/PageDown */
  private onGridKeydown(e: KeyboardEvent) {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.locale);
    if (!cells.length) return;
    const cur = fromISO(this.focusKey) ?? fromISO(this.value) ?? new Date();
    const curPd = Temporal.PlainDate.from({
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      day: cur.getDate(),
    });
    let nextPd: Temporal.PlainDate | null = null;
    switch (e.key) {
      case 'ArrowRight':
        nextPd = curPd.add({ days: 1 });
        break;
      case 'ArrowLeft':
        nextPd = curPd.subtract({ days: 1 });
        break;
      case 'ArrowDown':
        nextPd = curPd.add({ days: 7 });
        break;
      case 'ArrowUp':
        nextPd = curPd.subtract({ days: 7 });
        break;
      case 'Home':
        nextPd = Temporal.PlainDate.from({ year: curPd.year, month: curPd.month, day: 1 });
        break;
      case 'End':
        nextPd = Temporal.PlainDate.from({ year: curPd.year, month: curPd.month, day: cells.length });
        break;
      case 'PageUp':
        nextPd = curPd.subtract({ months: 1 });
        break;
      case 'PageDown':
        nextPd = curPd.add({ months: 1 });
        break;
      default:
        return; // Enter/Space 等交给按钮默认行为触发选择
    }
    e.preventDefault();
    const next = nextPd ? new Date(nextPd.year, nextPd.month - 1, nextPd.day) : null;
    if (next) this.setFocusDate(next);
  }

  /** 计算实际应获得 tabindex=0 的日格 ISO（焦点日 → 选中日 → 今天 → 首日） */
  private effectiveFocusKey(cells: CalDayCell[]): string {
    if (this.focusKey && cells.some((c) => toISO(c.greg) === this.focusKey)) return this.focusKey;
    const sel = fromISO(this.value);
    if (sel) {
      const sk = keysFromGregorian(sel, this.calendar);
      const hit = cells.find(
        (c) =>
          c.dayKey === sk.dayKey &&
          this.viewYearKey === sk.yearKey &&
          this.viewMonthKey === sk.monthKey
      );
      if (hit) return toISO(hit.greg);
    }
    const tk = keysFromGregorian(new Date(), this.calendar);
    const th = cells.find(
      (c) =>
        c.dayKey === tk.dayKey &&
        this.viewYearKey === tk.yearKey &&
        this.viewMonthKey === tk.monthKey
    );
    if (th) return toISO(th.greg);
    return cells[0] ? toISO(cells[0].greg) : '';
  }

  render() {
    const locale = this.locale;
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, locale);
    const firstDOW = this.resolvedFirstDOW;

    // 周列标题：以 2023-01-01（周日）为基准，按首日偏移归列；同时取窄/全称供可见与读屏使用
    const wdNarrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    const wdLong = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const headers: { narrow: string; long: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2023, 0, 1 + i);
      const col = (d.getDay() - firstDOW + 7) % 7;
      headers[col] = { narrow: wdNarrow.format(d), long: wdLong.format(d) };
    }

    // 选中 / 今天的历法键（用于高亮比对）
    const valDate = fromISO(this.value);
    const selKeys = valDate ? keysFromGregorian(valDate, this.calendar) : null;
    const todayKeys = keysFromGregorian(new Date(), this.calendar);
    const now = new Date();

    const leading = cells.length ? ((cells[0].greg.getDay() - firstDOW + 7) % 7) : 0;
    const trailing = (7 - ((leading + cells.length) % 7)) % 7;

    // 前导/后置：取相邻月份的真实日格，以灰色显示（而非空白占位）
    const prev = this.adjacentMonthKeys(-1);
    const next = this.adjacentMonthKeys(1);
    const prevDays = prev ? monthCalendarDays(this.calendar, prev.yearKey, prev.monthKey, locale) : [];
    const nextDays = next ? monthCalendarDays(this.calendar, next.yearKey, next.monthKey, locale) : [];
    const leadingCells = leading ? prevDays.slice(Math.max(0, prevDays.length - leading)) : [];
    const trailingCells = trailing ? nextDays.slice(0, trailing) : [];

    // 拼成 7 列网格（含相邻月灰色日），再按行切分
    const flat: ({ cell: CalDayCell; muted: boolean } | null)[] = [
      ...leadingCells.map((c) => ({ cell: c, muted: true })),
      ...cells.map((c) => ({ cell: c, muted: false })),
      ...trailingCells.map((c) => ({ cell: c, muted: true })),
    ];
    const rows: ({ cell: CalDayCell; muted: boolean } | null)[][] = [];
    for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));

    const fk = this.effectiveFocusKey(cells);
    const headerLabel = formatYearMonthHeader(this.calendar, this.viewYearKey, this.viewMonthKey, locale);

    return html`
      <div class="picker">
        <div class="header">
          <button class="nav" type="button" aria-label=${t('calPrevYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(-1)}>
            ${icon('doubleChevronLeft', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calPrevMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(-1)}>
            ${icon('chevronLeft', 20)}
          </button>
          <div class="title">${headerLabel}</div>
          <button class="nav" type="button" aria-label=${t('calNextMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(1)}>
            ${icon('chevronRight', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calNextYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(1)}>
            ${icon('doubleChevronRight', 20)}
          </button>
        </div>

        <div class="grid" id=${GRID_ID} role="grid" aria-label=${headerLabel} aria-describedby=${HINT_ID} @keydown=${this.onGridKeydown}>
          <div class="weekdays" role="row">
            ${headers.map(
              (h) => html`<div class="wd" role="columnheader" aria-label=${h.long}>${h.narrow}</div>`
            )}
          </div>

          ${rows.map(
            (row) => html`<div class="grid-row" role="row">
              ${row.map((entry) =>
                entry
                  ? this.renderDay(entry.cell, entry.muted, valDate, now, fk, headerLabel)
                  : html`<span class="empty" role="gridcell" aria-disabled="true"></span>`
              )}
            </div>`
          )}
        </div>

        <p class="hint" id=${HINT_ID}>${t('calKeyboardHint')}</p>

        <div class="footer">
          <button class="today-btn" type="button" @click=${() => this.jumpToday()}>${t('calToday')}</button>
        </div>
      </div>
    `;
  }

  private renderDay(
    c: CalDayCell,
    muted: boolean,
    valDate: Date | null,
    now: Date,
    fk: string,
    headerLabel: string
  ) {
    const isSel =
      valDate != null &&
      c.greg.getFullYear() === valDate.getFullYear() &&
      c.greg.getMonth() === valDate.getMonth() &&
      c.greg.getDate() === valDate.getDate();
    const isToday =
      c.greg.getFullYear() === now.getFullYear() &&
      c.greg.getMonth() === now.getMonth() &&
      c.greg.getDate() === now.getDate();
    const iso = toISO(c.greg);
    // 灰色（相邻月）日格：用其真实年月表头，避免读屏误读为当前月
    const ownKeys = muted ? keysFromGregorian(c.greg, this.calendar) : null;
    const cellHeader = ownKeys
      ? formatYearMonthHeader(this.calendar, ownKeys.yearKey, ownKeys.monthKey, this.locale)
      : headerLabel;
    // 完整日期作为读屏标签（含年月与「今天」提示），单日数字本身信息不足
    const label = `${cellHeader} ${c.dayDisplay}${isToday ? ' ' + t('calToday') : ''}`;
    return html`<button
      class="day ${muted ? 'muted' : ''} ${isSel ? 'selected' : ''} ${isToday ? 'today' : ''}"
      type="button"
      role="gridcell"
      data-iso=${iso}
      tabindex=${iso === fk ? '0' : '-1'}
      aria-selected=${isSel ? 'true' : 'false'}
      aria-label=${label}
      @click=${() => this.pickDay(c.greg)}
    >
      ${c.dayDisplay}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'date-calendar': DateCalendar;
  }
}
