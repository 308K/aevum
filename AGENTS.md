# AGENTS.md

## Project overview
Aevum 是一个极简倒数日 PWA：纯前端单页应用（SPA），可离线安装、无后端、无账号，数据全部存于浏览器 `localStorage`。技术栈为 **Lit 3 + @material/web（Material 3）+ Vite 5 + vite-plugin-pwa + TypeScript**，包管理器用 **Bun**。核心特点是多历法（基于原生 `Intl`，含农历/伊斯兰历等）与多粒度时间展示。

## Setup commands
- 包管理与运行统一用 **Bun**（非 npm）；依赖锁文件为 `bun.lock`。
  - Install: `bun install`
  - Dev server: `bun run dev`
  - Type-check: `bun run typecheck`（`tsc --noEmit`）
  - Build: `bun run build`（`tsc --noEmit && vite build`，产物输出到 `dist/`）
  - Preview: `bun run preview`
- 部署：静态产物 `dist/`，目标 Cloudflare Pages（构建命令 `bun run build`，输出目录 `dist`）；任何静态托管均可。PWA（service worker + manifest）由 vite-plugin-pwa 自动生成。

## Code style
- Web Components 用 Lit 3 + `@material/web`；自定义组件继承 `LitElement`，字段声明用装饰器（`@property` / `@state`）。
- **所有可见 UI 文案**必须经 `t(key)` 走 i18n，字典在 `src/locales/{zh-CN,en-US}.ts`，新语言须在此新增文件并注册到 `src/i18n.ts` 的 `DICTS` —— 禁止在组件里硬编码可见字符串。
- 图标统一用 `src/icons.ts` 内的内联 SVG（`icon()` 函数），禁止 emoji 字形或外部图标字体。
- 主题色由用户种子色经 `@material/material-color-utilities` 动态生成完整 M3 色阶，配 OKLCH 渐变背景；禁止硬编码色值覆盖动态主题。
- 全局样式在 `src/styles/global.css`，统一 `text-autospace: normal`。**中西文间距由 CSS `text-autospace` 自动处理，源码中禁止手动在中西文（含中文与占位符 `{...}` 之间、中文与数字/英文之间）添加空格**——浏览器会在 CJK 与拉丁文/数字边界自动插入排版间距。

## Architecture
入口 `index.html` → `src/main.ts`（启动引导 + 注册 PWA）→ `src/app.ts`（`AevumApp` 根组件，按路由在 `home-page` / `edit-page` / `settings-page` 间切换）。
- **状态层**：`src/store/{events,settings,tags,themes}.ts` 各自封装 `localStorage` 读写，并提供 `on*Change(fn)` 订阅；组件通过订阅而非 prop drilling 获取更新（`themes` 实为 `settings.customThemes` 的派生管理）。
- **计算层**：`src/utils/calendar.ts`（多历法 ↔ 公历键的双向转换、`formatEventDate` 本地化，纪元名用内部权威映射）与 `src/utils/time-calc.ts`（差异引擎 `computeDiff`、自定义日界限 `parseBoundary`/`logicalDaySerial`、下一次发生日 `nextOccurrenceDate`）。二者为**纯函数、无 DOM**，是测试重点。日期/历法算术基于 TC39 Temporal API（通过 `src/utils/temporal.ts` 桥接模块导入，原生或 `@js-temporal/polyfill`）。
- **展示层**：`time-display.ts` 等组件消费计算层结果；`share-image.ts` / `image-file.ts` 负责事件分享图的离屏渲染与压缩。

## Hard constraints
- 历法与时间计算**一律走 TC39 Temporal API**（原生或 `@js-temporal/polyfill`），通过 `src/utils/temporal.ts` 桥接模块统一导入。禁止引入重型日期库（date-fns / moment / dayjs 等）。展示格式化仍使用 `Intl.DateTimeFormat`（Temporal 的 `toLocaleString` 底层也是 Intl，但 polyfill 的 era 字段不完整）。
- 可见文案**禁止硬编码**，必须走 `t()` + `src/locales` 字典；新增语言务必在 `src/i18n.ts` 的 `DICTS` 注册，否则该语言下会回退到 `zh-CN` 且缺失键显示键名。
- 持久化只用 `localStorage`，键名统一 `aevum.*.v1`（events / settings / tags）；新增存储须「先读后写」并经对应 `on*Change` 通知订阅者，否则 UI 不刷新。
- 组件使用 Lit 装饰器，**必须保持 `tsconfig.json`：`experimentalDecorators: true` 且 `useDefineForClassFields: false`**，否则 `@property` 会在子类字段初始化时被覆盖而失效。
- 历法与时间计算**一律走 TC39 Temporal API**（通过 `src/utils/temporal.ts` 桥接），禁止引入重型日期库（date-fns / moment / dayjs 等）。展示格式化可继续使用 `Intl.DateTimeFormat`。
- **中西文间距由 CSS 自动处理**（`text-autospace: normal`），**禁止在源码中手动添加空格**——包括中文与英文之间、中文与数字之间、中文与 i18n 占位符 `{...}` 之间。所有可见文案（i18n 字典值、组件模板内联文本）均不得包含手动中西文间距空格。

## Security considerations
纯前端、无后端、无账号、无网络请求、无密钥/凭证、无遥测。全部用户数据仅存于浏览器 `localStorage`。唯一的外部输入是「导入备份」（`src/utils/backup.ts` 的 `importBackup`）：解析用户提供的 JSON 文件，须做结构校验、**禁止 `eval`/`Function`、禁止把字段直接当 HTML 注入 DOM**。分享图导出为客户端 canvas，不离开设备。

## Known gotchas
- **构建失败**：在沙箱环境中 `vite build` 清空 `dist/` 时 `rmSync` 可能被 safe-delete 拦截导致构建失败。先手动清理再构建：
  `Remove-Item -LiteralPath 'D:\dev\aevum\dist' -Recurse -Force`（PowerShell），随后 `bun run build`。（`bash` 的 `rm` 也会被拦截且 fail-closed，勿用。）
- **会话恢复回退**：IDE 会话恢复偶发把文件回退到最近一次编辑态；关键修复后请用 grep 特征串核对 `dist/` 产物是否真正包含改动，避免「改了但没构建进去」。
- **本地化 `<select>` 年份键**：历法年份键形如 `chinese|2026`，locale 无关、不受 era bug 影响，跨历法比较/排序请直接用它而非格式化后的字符串。
- **Temporal 历法标识符映射**：`islamic` 在 Temporal 中不存在，`src/utils/calendar.ts` 的 `temporalCalId()` 会将其映射为 `islamic-umalqura`（与 Intl 的 `islamic` 结果一致）。
- **Temporal era 与 Intl era 不一致**：Temporal 返回英文小写 era（如 `"reiwa"`），Intl 返回本地化 era（如 `"令和"`）。`resolveYearStart()` 在搜索日本和历年份时使用 Intl 匹配 era，而非 Temporal 的 era 属性。

## Testing instructions
无测试框架 / 无 CI / 无 linter 强制门禁；回归靠冒烟脚本（纯逻辑、无 DOM）：
- `bun scripts/smoke.ts` —— 核心逻辑：历法键↔公历往返、农历/干支/各非公历纪元本地化、日界限、多粒度、枚举（约 68 条断言）。使用 `@js-temporal/polyfill`（bun 无原生 Temporal）。
- `deno run --no-prompt --allow-read --allow-env scripts/smoke-temporal.ts` —— Temporal 专项测试：与 smoke.ts 相同的断言，但使用 Deno 原生 Temporal（验证原生兼容性）。
- `bun scripts/smoke-themes.ts` —— 自定义主题色逻辑：增 / 删 / 改 / 同色去重 / 删当前色回退默认。
- `bun scripts/smoke-dst.ts` —— DST 日进位回归。
- `bun scripts/smoke-backup.ts` —— 备份导入清洗。
- `bun scripts/smoke-recur.ts` —— 循环事件回归（日本和历改元边界：昭和 12 月起始 / 平成正月起始 / 令和年中起始，monthly/yearly/weekly/精确时间，约 18 条断言）。也可用 Deno 原生 Temporal 跑（`deno run --no-prompt --allow-read --allow-env scripts/smoke-recur.ts`）。
修改 `utils/calendar.ts`、`utils/time-calc.ts` 或 `store/themes.ts` 后务必跑对应脚本。

## Vitest 测试
项目已引入 **Vitest** 作为自动化测试框架，测试文件位于 `tests/` 目录：
- `bun run test` —— 单次运行全部测试（351 条断言，约 1.3s）
- `bun run test:watch` —— watch 模式
- `bun run test:coverage` —— 带覆盖率报告
- `tests/setup.ts` —— 注入 localStorage / navigator 垫片（node 环境无全局 localStorage）
- Store 模块（`events.ts` / `settings.ts` / `tags.ts`）导出 `__resetForTesting()` 用于 `beforeEach` 重置内存缓存
- 原 `scripts/smoke-*.ts` 保留不动，其中 `smoke-temporal.ts` 仍需用 Deno 原生 Temporal 跑交叉验证
- **GitHub Actions CI**（`.github/workflows/ci.yml`）：push/PR 时自动运行 `bun install --frozen-lockfile` → `bun run typecheck` → `bun run test`
