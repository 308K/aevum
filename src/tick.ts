/**
 * 全局秒级时钟：对齐到下一秒边界的 setTimeout 循环，
 * 避免 setInterval 漂移与跳秒，JS 线程阻塞后自动重新对齐。
 */
type Listener = (now: number) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

function loop() {
  const now = Date.now();
  listeners.forEach((fn) => fn(now));
  // 对齐下一秒边界（+16ms 容差，避免过早触发）
  const delay = 1000 - (now % 1000) + 16;
  timer = setTimeout(loop, delay);
}

export function onTick(fn: Listener): () => void {
  listeners.add(fn);
  if (!timer) loop();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
