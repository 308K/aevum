# Aevum · 倒数日

> 极简优雅的倒数日 PWA —— 纯前端、可离线、支持多历法与多粒度时间展示。

[![CI](https://img.shields.io/github/actions/workflow/status/308K/aevum/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/308K/aevum/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/308K/aevum?style=flat-square)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/308K/aevum?style=flat-square)](https://github.com/308K/aevum/commits)
[![Repo Size](https://img.shields.io/github/repo-size/308K/aevum?style=flat-square)](https://github.com/308K/aevum)
[![Issues](https://img.shields.io/github/issues/308K/aevum?style=flat-square)](https://github.com/308K/aevum/issues)
[![Stars](https://img.shields.io/github/stars/308K/aevum?style=flat-square)](https://github.com/308K/aevum/stargazers)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Lit](https://img.shields.io/badge/Lit-3.2-324FFF?style=flat-square&logo=lit&logoColor=white)](https://lit.dev/)
[![Material 3](https://img.shields.io/badge/Material%203-M3-6750A4?style=flat-square)](https://m3.material.io/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?style=flat-square)](https://vite-pwa-org.netlify.app/)
[![Bun](https://img.shields.io/badge/Bun-1.4-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)

---

## 特性

### 核心功能

- **倒数日**：记录重要日期，自动计算距离今天的天数（未来倒数 / 过去已历 / 今日）。
- **循环事件**：支持不循环 / 每周 / 每月 / 每年，自动推算下一次发生日；可配置日不存在时的溢出策略（RFC 5545 跳过 / 月末收敛 / 次月顺延）与闰月策略（从正不从闰 / 严格闰月 / 平闰皆可）。
- **多历法**：基于 TC39 Temporal API + `Intl`，支持公历、农历、伊斯兰历（乌姆库拉/民用/天文表算/沙特观月）、希伯来历、波斯历、佛历、日本和历、民国纪年、印度国家历、埃塞俄比亚历、科普特历、韩国农历、主体历共 17 种，无需重型日期库。
- **多粒度时间展示**：天 / 天-时-分-秒 / 年月日 / 年周天 / 周天 多种呈现。
- **精确时间**：可设置目标时刻（HH:MM），配合「天-时-分-秒」粒度精确到秒。
- **自定义日界限**：设置一天从何时开始（如 `04:00`），影响"今天"的判定。

### 个性化

- **事件置顶与背景图**：可置顶重要事件；支持为单个事件设置背景图。
- **自定义主题色**：管理多个主题色（添加 / 删除 / 重命名 / 改色 / 切换），由种子色生成完整 M3 OKLCH 配色，并可选 OKLCH 渐变背景；图标随主题色实时变化。
- **标签分类**：为事件打标签，首页按标签单选筛选；标签在设置页统一管理（含 6 个预设）。

### 数据与隐私

- **数据备份与迁移**：一键导出 / 导入 JSON 备份；导入做结构校验（禁用 `eval` / 动态执行、不注入 HTML），安全迁移数据。
- **分享图**：将事件导出 / 分享为图片，自动带上产品品牌域名。
- **本地存储**：数据保存在浏览器 `localStorage`，无后端、无账号、无网络请求、无遥测，隐私完全可控。

### 体验

- **中英文界面**：跟随系统或手动切换，词典式 i18n。
- **无障碍**：日历式日期选择器支持键盘导航（方向键 / Home / End / PageUp·Down）与读屏语义（role=grid、sr-only 操作提示）；支持本地化周起始日与多历法月份切换；全局适配 `prefers-reduced-motion`，关键提示带 ARIA 实时区域。
- **PWA 离线可用**：可安装到主屏，无网络也能查看。

## 技术栈

| 领域 | 技术 | 说明 |
|------|------|------|
| 框架 | [Lit 3](https://lit.dev/) | Web Components，无虚拟 DOM 运行时 |
| 组件库 | [@material/web](https://github.com/material-components/material-web) | Material 3 官方组件 |
| 配色 | [material-color-utilities](https://github.com/material-foundation/material-color-utilities) | 由种子色动态生成 OKLCH 全套 M3 色阶 |
| 日期/历法 | [TC39 Temporal API](https://tc39.es/proposal-temporal/) | 原生优先，按需回退 `temporal-polyfill` |
| 构建 | [Vite 5](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | 路由级代码分割 + Service Worker |
| 语言 | [TypeScript](https://www.typescriptlang.org/) | 严格类型，`tsc --noEmit` 检查 |
| 测试 | [Vitest](https://vitest.dev/) | 351 条断言，CI 集成 |
| 包管理 | [Bun](https://bun.sh/) | 依赖安装与脚本运行 |

### 性能优化

- **Temporal polyfill 按需加载**：有原生 Temporal 的浏览器（Chrome 144+、Bun 1.4+）不下载 polyfill chunk（节省 ~44KB gzip）。
- **路由级代码分割**：编辑页、设置页、分享图页均为懒加载 chunk，首屏仅加载主页。
- **构建产物**：主 chunk ~93KB gzip，polyfill chunk ~25KB gzip（按需），路由 chunk 各 5–12KB gzip。

## 本地开发

前置条件：已安装 [Bun](https://bun.sh/)。

```bash
bun install        # 安装依赖
bun run dev        # 启动开发服务器
bun run typecheck  # 类型检查（tsc --noEmit）
bun run build      # 类型检查 + 生产构建（产物输出到 dist/）
bun run preview    # 本地预览构建产物
```

## 测试

项目使用 [Vitest](https://vitest.dev/) 作为自动化测试框架，351 条断言覆盖历法转换、时间计算、循环事件、主题管理、备份导入等核心逻辑：

```bash
bun run test          # 单次运行全部测试
bun run test:watch    # watch 模式
bun run test:coverage # 带覆盖率报告
```

GitHub Actions CI 在每次 push / PR 时自动运行 `typecheck` + `test`（[CI 状态](https://github.com/308K/aevum/actions/workflows/ci.yml)）。

此外保留了一组 Deno 交叉验证脚本，用 Deno 原生 Temporal 验证与 Bun（polyfill）路径的一致性：

```bash
deno run --no-prompt --allow-read --allow-env scripts/smoke-temporal.ts
```

## 部署

### Cloudflare Pages（推荐）

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `bun install && bun run build` |
| 输出目录 | `dist` |
| 环境变量 | `SKIP_DEPENDENCY_INSTALL` = `true` |

### 其他平台

任何静态托管（GitHub Pages、Netlify、Vercel 等）均可，将输出目录设为 `dist`。

PWA（service worker + manifest）由 vite-plugin-pwa 自动生成，构建后含 `sw.js` 与 Web App Manifest。

## 项目结构

```
aevum/
├── index.html                  # 应用入口
├── vite.config.ts              # Vite + PWA 配置
├── vitest.config.ts            # Vitest 测试配置
├── tsconfig.json               # TypeScript 配置（experimentalDecorators + !useDefineForClassFields）
├── package.json
├── LICENSE
├── .github/workflows/ci.yml   # GitHub Actions CI（typecheck + test）
├── public/
│   ├── icons/                  # PWA 图标（SVG）
│   └── robots.txt
├── scripts/                    # Deno 交叉验证脚本
│   ├── smoke-temporal.ts       # Deno 原生 Temporal 兼容性
│   └── ...
├── tests/                      # Vitest 自动化测试（351 条断言）
│   ├── setup.ts                # 测试环境垫片（localStorage / navigator / i18n）
│   ├── calendar.test.ts        # 历法转换 / 纪元 / 差值 / 循环 / 网格 / 表头
│   ├── themes.test.ts          # 主题色增删改去重
│   ├── backup.test.ts          # 备份导入清洗
│   ├── dst.test.ts             # DST 回归（16 种非公历经法）
│   ├── recur.test.ts           # 日本和历改元循环
│   ├── era-transition.test.ts  # 改元边界枚举/往返
│   └── overflow.test.ts        # 全历法循环策略（dayOverflow / leapMonthStrategy）
└── src/
    ├── main.ts                 # 入口：全局样式 / M3 组件注册 / 设置初始化 / SW 注册
    ├── app.ts                  # 根组件 AevumApp：Top App Bar + 哈希路由 + FAB + Snackbar
    ├── theme.ts                # 动态主题（种子色 → OKLCH 配色）
    ├── types.ts                # 全局类型与默认值
    ├── i18n.ts                 # 国际化入口
    ├── icons.ts                # 内联 SVG 图标
    ├── install.ts              # PWA 安装提示
    ├── tick.ts                 # 每秒 tick（dhms 粒度用）
    ├── styles/
    │   └── global.css          # 全局样式
    ├── components/             # Web Components
    │   ├── event-card.ts       # 事件卡片
    │   ├── event-detail.ts     # 事件详情弹窗
    │   ├── time-display.ts     # 时间展示（消费计算层结果）
    │   ├── date-calendar.ts    # 日历式日期选择器（键盘导航 + ARIA）
    │   ├── color-picker.ts     # 主题色选择器
    │   └── app-snackbar.ts     # Snackbar 提示
    ├── pages/                  # 页面
    │   ├── home-page.ts        # 主页（事件列表 + 筛选）
    │   ├── edit-page.ts        # 编辑/新建事件
    │   ├── settings-page.ts    # 设置（历法/主题/标签/日界限/语言/备份）
    │   └── share-image-page.ts # 分享图渲染
    ├── store/                  # localStorage 状态层
    │   ├── events.ts           # 事件 CRUD + onChange 订阅
    │   ├── settings.ts         # 全局设置 + onChange 订阅
    │   ├── tags.ts             # 标签管理 + onChange 订阅
    │   └── themes.ts           # 主题色管理（settings.customThemes 派生）
    ├── utils/                  # 计算层（纯函数、无 DOM）
    │   ├── temporal.ts         # Temporal 桥接：原生优先 / polyfill 按需加载
    │   ├── calendar.ts         # 多历法 ↔ 公历键双向转换 / formatEventDate
    │   ├── time-calc.ts        # 差异引擎 computeDiff / 日界限 / nextOccurrenceDate
    │   ├── backup.ts           # JSON 备份导入/导出 + 结构校验
    │   ├── share-image.ts      # 事件分享图离屏渲染
    │   ├── image-file.ts       # 图片压缩处理
    │   ├── app-icon.ts        # 应用图标动态生成
    │   └── format.ts           # 格式化辅助
    └── locales/                # 国际化词典
        ├── zh-CN.ts            # 简体中文
        └── en-US.ts            # English
```

## 架构概览

```
index.html
    │
    ▼
main.ts ── 全局样式 / M3 组件注册 / 设置初始化 / SW 注册
    │
    ├── ensureTemporalReady() ── Temporal polyfill 按需加载
    │
    ▼
AevumApp (app.ts) ── 哈希路由
    │
    ├── #/           → home-page      （首屏，立即加载）
    ├── #/edit       → edit-page      （懒加载）
    ├── #/settings   → settings-page   （懒加载）
    └── #/share      → share-image-page（懒加载）

数据流：
    store/ ←── localStorage (aevum.events.v1 / aevum.settings.v1 / aevum.tags.v1)
       │
       ├── onChange 订阅 → components/ 响应更新
       │
    utils/calendar.ts + time-calc.ts （纯函数计算层）
       │
       └── Temporal API (temporal.ts 桥接)
```

## PWA 安装

1. 访问 Aevum 网站
2. 点击浏览器地址栏的安装图标，或从菜单选择「安装应用」
3. 安装后可从主屏启动，离线可用

## 贡献

欢迎提交 [Issue](https://github.com/308K/aevum/issues) 和 Pull Request。

### 开发约定

- 所有可见 UI 文案必须通过 `t(key)` 走 i18n，禁止硬编码
- 图标使用 `src/icons.ts` 内联 SVG，禁止 emoji 或外部图标字体
- 历法与时间计算一律走 TC39 Temporal API（通过 `src/utils/temporal.ts` 桥接），禁止引入重型日期库
- 修改 `utils/calendar.ts`、`utils/time-calc.ts`、`store/` 后运行 `bun run test` 确保无回归
- 主题色由种子色动态生成 M3 色阶，禁止硬编码色值覆盖动态主题
- 新增语言须在 `src/locales/` 新建词典文件并注册到 `src/i18n.ts` 的 `DICTS`

## 许可证

[MIT](./LICENSE) © 2026 308K
