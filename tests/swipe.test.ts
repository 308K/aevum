/**
 * 滑动翻页手势判定测试（src/utils/swipe.ts 纯函数层）
 */
import { describe, it, expect } from 'vitest';
import {
  applySwipeResistance,
  resolveSwipeAxis,
  resolveSwipePage,
  trackGeometry,
  trackTurnOffset,
  DEFAULT_SWIPE,
} from '../src/utils/swipe.js';

describe('resolveSwipeAxis', () => {
  it('位移不足时不判定主轴', () => {
    expect(resolveSwipeAxis(3, -2)).toBe('none');
    expect(resolveSwipeAxis(-3, 2)).toBe('none');
    expect(resolveSwipeAxis(0, 0)).toBe('none');
  });

  it('横向占优时判定为 horizontal', () => {
    expect(resolveSwipeAxis(30, 5)).toBe('horizontal');
    expect(resolveSwipeAxis(-30, 5)).toBe('horizontal');
    expect(resolveSwipeAxis(30, -30)).toBe('horizontal'); // 等值时按横向处理
  });

  it('纵向占优时判定为 vertical（交还页面滚动）', () => {
    expect(resolveSwipeAxis(5, 30)).toBe('vertical');
    expect(resolveSwipeAxis(-5, -30)).toBe('vertical');
  });

  it('尊重自定义 slop 阈值', () => {
    expect(resolveSwipeAxis(5, 1, 3)).toBe('horizontal');
    expect(resolveSwipeAxis(5, 1, 8)).toBe('none');
  });
});

describe('resolveSwipePage', () => {
  it('净位移达阈值即翻页，右滑到上一月、左滑到下一月', () => {
    expect(resolveSwipePage(60, 500)).toBe(-1);
    expect(resolveSwipePage(-60, 500)).toBe(1);
    expect(resolveSwipePage(DEFAULT_SWIPE.minDistance, 1000)).toBe(-1);
    expect(resolveSwipePage(-DEFAULT_SWIPE.minDistance, 1000)).toBe(1);
  });

  it('位移不足且速度不足时不翻页', () => {
    expect(resolveSwipePage(20, 1000)).toBe(0);
    expect(resolveSwipePage(-20, 1000)).toBe(0);
    expect(resolveSwipePage(0, 500)).toBe(0);
  });

  it('轻扫：位移未达阈值但速度够快仍翻页', () => {
    // 20px / 40ms = 0.5px/ms > 0.35
    expect(resolveSwipePage(20, 40)).toBe(-1);
    expect(resolveSwipePage(-20, 40)).toBe(1);
  });

  it('手抖不翻页：位移低于 axisSlop 即便速度极快', () => {
    expect(resolveSwipePage(5, 1)).toBe(0);
    expect(resolveSwipePage(-5, 1)).toBe(0);
  });

  it('dt 未知（<=0）时仅按位移判定', () => {
    expect(resolveSwipePage(60, 0)).toBe(-1);
    expect(resolveSwipePage(-60, -1)).toBe(1);
    expect(resolveSwipePage(20, 0)).toBe(0);
  });

  it('支持自定义阈值', () => {
    const cfg = { axisSlop: 4, minDistance: 20, minVelocity: 1 };
    expect(resolveSwipePage(25, 1000, cfg)).toBe(-1);
    expect(resolveSwipePage(15, 1000, cfg)).toBe(0);
    // 15px/10ms = 1.5px/ms >= 1，且 15 > axisSlop
    expect(resolveSwipePage(15, 10, cfg)).toBe(-1);
  });
});

describe('applySwipeResistance', () => {
  it('视口一半以内原样跟手', () => {
    expect(applySwipeResistance(30, 320)).toBe(30);
    expect(applySwipeResistance(-160, 320)).toBe(-160);
  });

  it('超过阈值后按 0.35 系数衰减', () => {
    // 上限 160（320 * 0.5），超出 40px 衰减为 14
    expect(applySwipeResistance(200, 320)).toBeCloseTo(174, 5);
    expect(applySwipeResistance(-200, 320)).toBeCloseTo(-174, 5);
  });

  it('位移单调递增，方向不反转', () => {
    let prev = 0;
    for (const dx of [10, 50, 100, 160, 200, 400, 800]) {
      const v = applySwipeResistance(dx, 320);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeGreaterThan(0);
      prev = v;
    }
  });

  it('视口宽度为 0 时不产生 NaN/Infinity', () => {
    const v = applySwipeResistance(-100, 0);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeLessThan(0);
  });

  it('尊重自定义 maxFraction', () => {
    // 上限 320 * 0.25 = 80，超出 20px 衰减为 7
    expect(applySwipeResistance(100, 320, 0.25)).toBeCloseTo(87, 5);
  });
});

describe('trackGeometry', () => {
  it('三面板且当前居中时，轨道宽 300%、左移一个面板', () => {
    const g = trackGeometry(3, 1);
    expect(g.trackWidth).toBe('300%');
    expect(g.trackShift).toBe('-100%');
    expect(g.panelWidth).toBe(`${100 / 3}%`);
  });

  it('无前月时当前面板位于索引 0，轨道不左移', () => {
    const g = trackGeometry(2, 0);
    expect(g.trackWidth).toBe('200%');
    expect(g.trackShift).toBe('-0%');
    expect(g.panelWidth).toBe('50%');
  });

  it('无后月时当前面板位于末位', () => {
    const g = trackGeometry(2, 1);
    expect(g.trackShift).toBe('-100%');
    expect(g.panelWidth).toBe('50%');
  });

  it('单面板（历法边界）退化为不位移、满宽', () => {
    const g = trackGeometry(1, 0);
    expect(g.trackWidth).toBe('100%');
    expect(g.trackShift).toBe('-0%');
    expect(g.panelWidth).toBe('100%');
  });

  it('每个面板恰好等于一个视口宽（CSS 百分比基准：width 相对轨道，margin 相对视口）', () => {
    // .track 的 width 百分比相对 .viewport（轨道 = n 倍视口宽）
    // .track 的 margin-left 百分比相对包含块 .viewport（故 -100% 即一个视口宽）
    // .panel 的 width 百分比相对 .track（100/n% × n 倍 = 1 倍视口宽）
    const viewport = 360;
    for (const n of [1, 2, 3]) {
      const g = trackGeometry(n, 0);
      const trackPx = (viewport * parseFloat(g.trackWidth)) / 100;
      const panelPx = (trackPx * parseFloat(g.panelWidth)) / 100;
      expect(panelPx).toBeCloseTo(viewport, 5);
    }
  });

  it('轨道左移量等于当前面板索引个视口宽（margin 基准为视口）', () => {
    const viewport = 360;
    for (const n of [1, 2, 3]) {
      for (let idx = 0; idx < n; idx++) {
        const g = trackGeometry(n, idx);
        const shiftPx = (-parseFloat(g.trackShift) / 100) * viewport;
        expect(shiftPx).toBeCloseTo(idx * viewport, 5);
      }
    }
  });

  it('越界索引被夹紧到合法范围', () => {
    expect(trackGeometry(3, -5).trackShift).toBe('-0%');
    expect(trackGeometry(3, 99).trackShift).toBe('-200%');
  });

  it('面板数非法时归一为 1，避免除零', () => {
    const g = trackGeometry(0, 0);
    expect(g.trackWidth).toBe('100%');
    expect(g.panelWidth).toBe('100%');
    expect(Number.isNaN(parseFloat(g.panelWidth))).toBe(false);
  });
});

describe('trackTurnOffset', () => {
  it('下一月向左偏移一个面板宽，上一月向右', () => {
    expect(trackTurnOffset(1, 360)).toBe(-360);
    expect(trackTurnOffset(-1, 360)).toBe(360);
  });

  it('面板宽为 0 时不产生 NaN', () => {
    const v = trackTurnOffset(1, 0);
    expect(Number.isNaN(v)).toBe(false);
    expect(Math.abs(v)).toBe(0); // 注意 -1*0 === -0，用 Math.abs 规避 Object.is 区分
  });
});
