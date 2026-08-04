/**
 * 日历形式的目标日期选择器（历法感知、无障碍）
 * - 复用 calendar.ts 的纯函数层（keysFromGregorian / yearOptions / monthOptions / monthCalendarDays）
 * - 7 列周网格，支持上/下月、上/下年导航与「今天」快捷跳转
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历均按各自历法展示
 * - 无障碍：role=grid 语义、roving tabindex、方向键/Home/End/PageUp/PageDown 键盘导航、
 *   每个日格提供完整日期的 aria-label、选中态用 aria-selected
 * - 快速跳转：点击表头年份/月份可展开年份网格视图与月份网格视图
 */
import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  monthCalendarDays,
  yearOptions,
  monthOptions,
  keysFromGregorian,
  startOfMonthKeys,
  sameCalendarMonth,
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

/** 视图模式：日期网格 / 年份选择 / 月份选择 */
type ViewMode = 'days' | 'years' | 'months';

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
    .title-group {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .title-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 8px;
      transition: background 0.15s ease;
      white-space: nowrap;
    }
    .title-btn:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .title-btn:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .title-btn.active {
      color: var(--md-sys-color-primary);
    }
    .title-sep {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.95rem;
      user-select: none;
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

    /* ---- 年份/月份选择视图 ---- */
    .view-panel {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 260px;
    }
    .view-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0 8px;
    }
    .view-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }
    .year-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      overflow-y: auto;
      max-height: 280px;
      padding: 2px;
      scrollbar-width: thin;
      scrollbar-color: var(--md-sys-color-outline-variant) transparent;
    }
    .year-grid::-webkit-scrollbar {
      width: 6px;
    }
    .year-grid::-webkit-scrollbar-thumb {
      background: var(--md-sys-color-outline-variant);
      border-radius: 3px;
    }
    .year-cell {
      padding: 10px 4px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s ease, color 0.15s ease;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .year-cell:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .year-cell:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .year-cell.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .year-cell.current {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .year-cell.selected.current {
      box-shadow: none;
    }
    .month-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    .month-cell {
      padding: 14px 4px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s ease, color 0.15s ease;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .month-cell:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .month-cell:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .month-cell.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .month-cell.current {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .month-cell.selected.current {
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
  /** 当前视图模式：日期网格 / 年份选择 / 月份选择 */
  @state() private viewMode: ViewMode = 'days';
  /** 年份视图中需要滚动到的年份键（触发后清空） */
  @state() private yearScrollKey = '';
  /** 标记一次键盘导航后需要把 DOM 焦点移到指定日格 */
  private pendingFocus = false;
  /** 上次用于初始化视图的 value，避免视图被已选值反复重置 */
  private lastValue = '';

  willUpdate() {
    if (this.value && this.value !== this.lastValue) {
      const d = fromISO(this.value);
      if (d) {
        // 月份归属由月首决定（日本和历月中改元时，选中日的 yearKey 可能与月首不同）
        const sel = startOfMonthKeys(d, this.calendar);
        this.viewYearKey = sel.yearKey;
        this.viewMonthKey = sel.monthKey;
        this.lastValue = this.value;
        // 首次由外部值初始化视图时，同步焦点到该日
        if (!this.focusKey) this.focusKey = this.value;
      }
    }
  }

  protected updated(changed: PropertyValues) {
    if (this.pendingFocus && this.focusKey && this.viewMode === 'days') {
      const el = this.shadowRoot?.querySelector<HTMLButtonElement>(`[data-iso="${this.focusKey}"]`);
      el?.focus();
      this.pendingFocus = false;
    }
    // 年份选择视图打开时，滚动到当前选中年份
    if (this.viewMode === 'years' && this.yearScrollKey) {
      const el = this.shadowRoot?.querySelector<HTMLElement>(
        `[data-year-key="${CSS.escape(this.yearScrollKey)}"]`
      );
      el?.scrollIntoView({ block: 'center', behavior: 'auto' });
      this.yearScrollKey = '';
    }
    void changed;
  }

  private get locale() {
    return getLocale();
  }

  /** 用于历法年/月/日展示格式化的 locale（农历始终用中文） */
  private get calLocale(): string {
    return this.calendar === 'chinese' ? 'zh-CN' : this.locale;
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

  /** 当前视图月份的首日公历日期，用于 sameCalendarMonth 比较 */
  private get viewRefDate(): Date {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    if (cells.length) return cells[0].greg;
    // 月份无日期（理论上不会发生），回退到今天
    return new Date();
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
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    if (!cells.length) return;
    const idx = Math.min(Math.max(oldDay, 1), cells.length) - 1;
    this.focusKey = toISO(cells[idx].greg);
  }

  /**
   * 查找相邻的「不同公历月」。
   * 日本和历允许重复月份（如昭和64年1月与平成元年1月同为 1989-01），
   * 导航时需跳过映射到同一公历月的条目，否则会出现「两个1月」。
   */
  private findAdjacentMonth(delta: number): { yearKey: string; monthKey: string } | null {
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const curCells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    const curGregId = curCells.length
      ? `${curCells[0].greg.getFullYear()}-${curCells[0].greg.getMonth()}`
      : '';

    const yi = years.findIndex((y) => y.key === this.viewYearKey);
    if (yi < 0) return null;

    // 先在当前年份的剩余月份中搜索
    const curMonths = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    const mi = curMonths.findIndex((m) => m.key === this.viewMonthKey);
    for (let i = mi + delta; i >= 0 && i < curMonths.length; i += delta) {
      const cells = monthCalendarDays(this.calendar, this.viewYearKey, curMonths[i].key, this.calLocale);
      if (cells.length) {
        const id = `${cells[0].greg.getFullYear()}-${cells[0].greg.getMonth()}`;
        if (id !== curGregId) return { yearKey: this.viewYearKey, monthKey: curMonths[i].key };
      }
    }

    // 跨年搜索：逐年扫描月份，跳过同一公历月的重复条目
    for (let yOff = yi + delta; yOff >= 0 && yOff < years.length; yOff += delta) {
      const yk = years[yOff].key;
      const ms = monthOptions(this.calendar, yk, this.calLocale);
      const range = delta > 0 ? ms : [...ms].reverse();
      for (const m of range) {
        const cells = monthCalendarDays(this.calendar, yk, m.key, this.calLocale);
        if (cells.length) {
          const id = `${cells[0].greg.getFullYear()}-${cells[0].greg.getMonth()}`;
          if (id !== curGregId) return { yearKey: yk, monthKey: m.key };
        }
      }
    }

    return null;
  }

  private stepMonth(delta: number) {
    const oldDay = this.currentFocusDay();
    const next = this.findAdjacentMonth(delta);
    if (!next) return;
    this.viewYearKey = next.yearKey;
    this.viewMonthKey = next.monthKey;
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  private stepYear(delta: number) {
    const oldDay = this.currentFocusDay();
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const yi = years.findIndex((y) => y.key === this.viewYearKey) + delta;
    if (yi < 0 || yi >= years.length) return;
    this.viewYearKey = years[yi].key;
    // 新年份可能不含当前月份（如闰月/缺失月），回退到该年首月
    const months = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    if (!months.some((m) => m.key === this.viewMonthKey)) {
      this.viewMonthKey = months[0].key;
    }
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  /** 取得相对当前视图偏移 delta（±1）个月的年/月键；越界或映射到同一公历月时返回 null */
  private adjacentMonthKeys(delta: number): { yearKey: string; monthKey: string } | null {
    return this.findAdjacentMonth(delta);
  }

  private jumpToday() {
    const now = new Date();
    const sel = startOfMonthKeys(now, this.calendar);
    this.viewYearKey = sel.yearKey;
    this.viewMonthKey = sel.monthKey;
    this.focusKey = toISO(now);
    this.viewMode = 'days';
    this.requestUpdate();
  }

  /** 把焦点（可能跨月）移到某公历日期对应的日格 */
  private setFocusDate(d: Date) {
    // 月份归属由月首决定（日本和历月中改元时逐日 yearKey 不同，但同属一个月）
    if (!sameCalendarMonth(d, this.viewRefDate, this.calendar)) {
      const k = startOfMonthKeys(d, this.calendar);
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

  /** 网格键盘导航：方向键/Home/End/PageUp/PageDown
   *  Ctrl+Home / Ctrl+End：切换上/下年 */
  private onGridKeydown(e: KeyboardEvent) {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
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
        // Home: 前一年
        this.stepYear(-1);
        e.preventDefault();
        return;
      case 'End':
        // End: 后一年
        this.stepYear(1);
        e.preventDefault();
        return;
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

  /** 计算实际应获得 tabindex=0 的日格 ISO（焦点日 -> 选中日 -> 今天 -> 首日） */
  private effectiveFocusKey(cells: CalDayCell[]): string {
    if (this.focusKey && cells.some((c) => toISO(c.greg) === this.focusKey)) return this.focusKey;
    const sel = fromISO(this.value);
    if (sel && sameCalendarMonth(sel, this.viewRefDate, this.calendar)) {
      const sk = keysFromGregorian(sel, this.calendar);
      const hit = cells.find((c) => c.dayKey === sk.dayKey);
      if (hit) return toISO(hit.greg);
    }
    const now = new Date();
    if (sameCalendarMonth(now, this.viewRefDate, this.calendar)) {
      const tk = keysFromGregorian(now, this.calendar);
      const th = cells.find((c) => c.dayKey === tk.dayKey);
      if (th) return toISO(th.greg);
    }
    return cells[0] ? toISO(cells[0].greg) : '';
  }

  // ---- 年份/月份选择视图相关 ----

  /** 打开年份选择视图，并滚动到当前选中年份 */
  private openYearView() {
    this.viewMode = 'years';
    this.yearScrollKey = this.viewYearKey;
  }

  /** 打开月份选择视图 */
  private openMonthView() {
    this.viewMode = 'months';
  }

  /** 在年份视图中选择某年，返回日期网格 */
  private selectYear(yearKey: string) {
    this.viewYearKey = yearKey;
    // 新年份可能不含当前月份（如闰月/缺失月），回退到该年首月
    const months = monthOptions(this.calendar, yearKey, this.calLocale);
    if (!months.some((m) => m.key === this.viewMonthKey)) {
      this.viewMonthKey = months[0].key;
    }
    this.viewMode = 'days';
    this.reseatFocusAfterViewChange(this.currentFocusDay());
    this.pendingFocus = true;
    this.requestUpdate();
  }

  /** 在月份视图中选择某月，返回日期网格 */
  private selectMonth(monthKey: string) {
    this.viewMonthKey = monthKey;
    this.viewMode = 'days';
    this.reseatFocusAfterViewChange(this.currentFocusDay());
    this.pendingFocus = true;
    this.requestUpdate();
  }

  /** 年份视图键盘导航：方向键移动焦点，Enter 选择，Escape 返回 */
  private onYearGridKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (!target.dataset.yearKey) return;
    const cells = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-year-key]') ?? []
    );
    const idx = cells.findIndex((c) => c.dataset.yearKey === target.dataset.yearKey);
    if (idx < 0) return;
    let nextIdx = idx;
    switch (e.key) {
      case 'ArrowRight': nextIdx = Math.min(idx + 1, cells.length - 1); break;
      case 'ArrowLeft': nextIdx = Math.max(idx - 1, 0); break;
      case 'ArrowDown': nextIdx = Math.min(idx + 3, cells.length - 1); break;
      case 'ArrowUp': nextIdx = Math.max(idx - 3, 0); break;
      case 'Home': nextIdx = 0; break;
      case 'End': nextIdx = cells.length - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.selectYear(target.dataset.yearKey);
        return;
      case 'Escape':
        e.preventDefault();
        this.viewMode = 'days';
        this.requestUpdate();
        return;
      default:
        return;
    }
    if (nextIdx !== idx) {
      e.preventDefault();
      cells[nextIdx]?.focus();
      // 滚动到可见
      cells[nextIdx]?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  /** 月份视图键盘导航：方向键移动焦点，Enter 选择，Escape 返回 */
  private onMonthGridKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (!target.dataset.monthKey) return;
    const cells = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-month-key]') ?? []
    );
    const idx = cells.findIndex((c) => c.dataset.monthKey === target.dataset.monthKey);
    if (idx < 0) return;
    let nextIdx = idx;
    switch (e.key) {
      case 'ArrowRight': nextIdx = Math.min(idx + 1, cells.length - 1); break;
      case 'ArrowLeft': nextIdx = Math.max(idx - 1, 0); break;
      case 'ArrowDown': nextIdx = Math.min(idx + 3, cells.length - 1); break;
      case 'ArrowUp': nextIdx = Math.max(idx - 3, 0); break;
      case 'Home': nextIdx = 0; break;
      case 'End': nextIdx = cells.length - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.selectMonth(target.dataset.monthKey);
        return;
      case 'Escape':
        e.preventDefault();
        this.viewMode = 'days';
        this.requestUpdate();
        return;
      default:
        return;
    }
    if (nextIdx !== idx) {
      e.preventDefault();
      cells[nextIdx]?.focus();
    }
  }

  /** 渲染年份选择视图 */
  private renderYearView() {
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const todayYearKey = keysFromGregorian(new Date(), this.calendar).yearKey;
    const selYearKey = this.viewYearKey;

    // 拆分显示：年份的 display 可能含额外文字（如 "2026年 丙午年"），取前半部分
    return html`
      <div
        class="view-panel"
        role="grid"
        aria-label=${t('calSelectYear')}
        @keydown=${this.onYearGridKeydown}
      >
        <div class="view-header">
          <span class="view-title">${t('calSelectYear')}</span>
        </div>
        <div class="year-grid">
          ${years.map((y) => {
            const isSel = y.key === selYearKey;
            const isCur = y.key === todayYearKey;
            return html`
              <button
                class="year-cell ${isSel ? 'selected' : ''} ${isCur ? 'current' : ''}"
                type="button"
                role="gridcell"
                data-year-key=${y.key}
                tabindex=${isSel ? '0' : '-1'}
                aria-selected=${isSel ? 'true' : 'false'}
                @click=${() => this.selectYear(y.key)}
              >
                ${y.display}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  /** 渲染月份选择视图 */
  private renderMonthView() {
    const months = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    const selMonthKey = this.viewMonthKey;
    const todayKeys = startOfMonthKeys(new Date(), this.calendar);
    const isTodayYear = todayKeys.yearKey === this.viewYearKey;

    return html`
      <div
        class="view-panel"
        role="grid"
        aria-label=${t('calSelectMonth')}
        @keydown=${this.onMonthGridKeydown}
      >
        <div class="view-header">
          <span class="view-title">${t('calSelectMonth')}</span>
        </div>
        <div class="month-grid">
          ${months.map((m) => {
            const isSel = m.key === selMonthKey;
            const isCur = isTodayYear && m.key === todayKeys.monthKey;
            return html`
              <button
                class="month-cell ${isSel ? 'selected' : ''} ${isCur ? 'current' : ''}"
                type="button"
                role="gridcell"
                data-month-key=${m.key}
                tabindex=${isSel ? '0' : '-1'}
                aria-selected=${isSel ? 'true' : 'false'}
                @click=${() => this.selectMonth(m.key)}
              >
                ${m.display}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  render() {
    const locale = this.locale;

    // 年份/月份选择视图
    if (this.viewMode === 'years') {
      return html`
        <div class="picker">
          <div class="header">
            <button class="nav" type="button" aria-label=${t('actionBack')} @click=${() => { this.viewMode = 'days'; this.requestUpdate(); }}>
              ${icon('back', 20)}
            </button>
            <div class="title-group">
              <span class="title-btn active">${t('calSelectYear')}</span>
            </div>
            <span class="nav" style="visibility:hidden"></span>
          </div>
          ${this.renderYearView()}
          <div class="footer">
            <button class="today-btn" type="button" @click=${() => this.jumpToday()}>${t('calToday')}</button>
          </div>
        </div>
      `;
    }

    if (this.viewMode === 'months') {
      const yearLabel = yearOptions(this.calendar, this.refDate, this.calLocale)
        .find((y) => y.key === this.viewYearKey)?.display ?? this.viewYearKey;
      return html`
        <div class="picker">
          <div class="header">
            <button class="nav" type="button" aria-label=${t('actionBack')} @click=${() => { this.viewMode = 'days'; this.requestUpdate(); }}>
              ${icon('back', 20)}
            </button>
            <div class="title-group">
              <span class="title-btn active">${yearLabel}</span>
            </div>
            <span class="nav" style="visibility:hidden"></span>
          </div>
          ${this.renderMonthView()}
          <div class="footer">
            <button class="today-btn" type="button" @click=${() => this.jumpToday()}>${t('calToday')}</button>
          </div>
        </div>
      `;
    }

    // 日期网格视图（默认）
    const calLocale = this.calLocale;
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, calLocale);
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

    // 选中日期（用于高亮比对）
    const valDate = fromISO(this.value);
    const now = new Date();

    const leading = cells.length ? ((cells[0].greg.getDay() - firstDOW + 7) % 7) : 0;
    const trailing = (7 - ((leading + cells.length) % 7)) % 7;

    // 前导/后置：取相邻月份的真实日格，以灰色显示（而非空白占位）
    const prev = this.adjacentMonthKeys(-1);
    const next = this.adjacentMonthKeys(1);
    const prevDays = prev ? monthCalendarDays(this.calendar, prev.yearKey, prev.monthKey, calLocale) : [];
    const nextDays = next ? monthCalendarDays(this.calendar, next.yearKey, next.monthKey, calLocale) : [];
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

    // 拆分表头为年份和月份两部分，分别可点击
    const yearOpts = yearOptions(this.calendar, this.refDate, this.calLocale);
    const monthOpts = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    // 日本和历月中改元时，焦点日可能属于与月首不同的年号年。
    // 表头跟随焦点日（或选中日）的真实年号，而非固定用 viewYearKey。
    const focusDate = fromISO(fk) ?? fromISO(this.value);
    const headerYearKey = focusDate && this.calendar === 'japanese'
      ? keysFromGregorian(focusDate, this.calendar).yearKey
      : this.viewYearKey;
    const headerMonthKey = focusDate && this.calendar === 'japanese'
      ? keysFromGregorian(focusDate, this.calendar).monthKey
      : this.viewMonthKey;
    const yearDisplay = yearOpts.find((y) => y.key === headerYearKey)?.display
      ?? formatYearMonthHeader(this.calendar, headerYearKey, headerMonthKey, this.calLocale);
    const monthDisplay = monthOpts.find((m) => m.key === headerMonthKey)?.display
      ?? monthOptions(this.calendar, headerYearKey, this.calLocale).find((m) => m.key === headerMonthKey)?.display
      ?? this.viewMonthKey;

    return html`
      <div class="picker">
        <div class="header">
          <button class="nav" type="button" aria-label=${t('calPrevYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(-1)}>
            ${icon('doubleChevronLeft', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calPrevMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(-1)}>
            ${icon('chevronLeft', 20)}
          </button>
          <div class="title-group">
            <button class="title-btn" type="button" @click=${() => this.openYearView()} aria-label=${t('calSelectYear')} title=${t('calYearViewHint')}>
              ${yearDisplay}
            </button>
            <span class="title-sep">·</span>
            <button class="title-btn" type="button" @click=${() => this.openMonthView()} aria-label=${t('calSelectMonth')} title=${t('calMonthViewHint')}>
              ${monthDisplay}
            </button>
          </div>
          <button class="nav" type="button" aria-label=${t('calNextMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(1)}>
            ${icon('chevronRight', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calNextYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(1)}>
            ${icon('doubleChevronRight', 20)}
          </button>
        </div>

        <div class="grid" id=${GRID_ID} role="grid" aria-label=${`${yearDisplay} ${monthDisplay}`} aria-describedby=${HINT_ID} @keydown=${this.onGridKeydown}>
          <div class="weekdays" role="row">
            ${headers.map(
              (h) => html`<div class="wd" role="columnheader" aria-label=${h.long}>${h.narrow}</div>`
            )}
          </div>

          ${rows.map(
            (row) => html`<div class="grid-row" role="row">
              ${row.map((entry) =>
                entry
                  ? this.renderDay(entry.cell, entry.muted, valDate, now, fk, `${yearDisplay} ${monthDisplay}`)
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
    const isSel = valDate != null && toISO(c.greg) === toISO(valDate);
    const isToday =
      c.greg.getFullYear() === now.getFullYear() &&
      c.greg.getMonth() === now.getMonth() &&
      c.greg.getDate() === now.getDate();
    const iso = toISO(c.greg);
    // 灰色（相邻月）日格：用其真实年月表头，避免读屏误读为当前月
    const ownKeys = muted ? keysFromGregorian(c.greg, this.calendar) : null;
    const cellHeader = ownKeys
      ? formatYearMonthHeader(this.calendar, ownKeys.yearKey, ownKeys.monthKey, this.calLocale)
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