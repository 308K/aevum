# Aevum · 倒数日

> 极简优雅的倒数日 PWA —— 纯前端、可离线、支持多历法与多粒度时间展示。

[![License](https://img.shields.io/github/license/308K/aevum?style=flat-square)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/308K/aevum?style=flat-square)](https://github.com/308K/aevum/commits)
[![Repo Size](https://img.shields.io/github/repo-size/308K/aevum?style=flat-square)](https://github.com/308K/aevum)
[![Issues](https://img.shields.io/github/issues/308K/aevum?style=flat-square)](https://github.com/308K/aevum/issues)
[![Stars](https://img.shields.io/github/stars/308K/aevum?style=flat-square)](https://github.com/308K/aevum/stargazers)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Lit](https://img.shields.io/badge/Lit-3.2-324FFF?style=flat-square&logo=lit&logoColor=white)](https://lit.dev/)
[![Material 3](https://img.shields.io/badge/Material%203-M3-6750A4?style=flat-square)](https://m3.material.io/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?style=flat-square)](https://vite-pwa-org.netlify.app/)

## 特性

- **倒数日**：记录重要日期，自动计算距离今天的天数（未来倒数 / 过去已历）。
- **多历法**：基于原生 `Intl` API，支持公历及浏览器支持的其他历法，无需重型日期库。
- **多粒度**：天 / 天-时-分-秒 / 年月日 / 年周天 / 周天 多种时间展示方式。
- **自定义日界限**：设置一天从何时开始（如 `04:00`），影响“今天”的判定。
- **自定义主题色**：可管理**多个**主题色 —— 添加、删除、重命名、改色、应用切换，并带同色去重。
- **标签分类**：为事件打标签，按分类筛选。
- **中英文界面**：跟随系统或手动切换，词典式 i18n。
- **PWA 离线可用**：可安装到主屏，无网络也能查看。
- **本地存储**：数据保存在浏览器 `localStorage`，无后端、无账号、隐私可控。

## 技术栈

- [Lit 3](https://lit.dev/) —— Web Components 框架
- [@material/web](https://github.com/material-components/material-web) —— Material 3 组件库
- [material-color-utilities](https://github.com/material-foundation/material-color-utilities) —— 由种子色生成 OKLCH 动态配色
- [Vite 5](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- TypeScript
- 包管理与运行：[Bun](https://bun.sh/)

## 本地开发

前置条件：已安装 [Bun](https://bun.sh/)。

```bash
bun install      # 安装依赖
bun run dev      # 启动开发服务器
bun run build    # 类型检查 + 生产构建（产物输出到 dist/）
bun run preview  # 本地预览构建产物
```

## 测试

```bash
bun scripts/smoke.ts        # 核心冒烟测试：历法往返 / 枚举 / 日界限 / 多粒度 / 标签库
bun scripts/smoke-themes.ts # 自定义主题色逻辑测试：增 / 删 / 改 / 去重 / 回退
```

## 部署

推荐部署到 [Cloudflare Pages](https://pages.cloudflare.com/)：

- 构建命令：`bun install && bun run build`
- 输出目录：`dist`
- 环境变量：`SKIP_DEPENDENCY_INSTALL` 值为 `true`
- 已内置 PWA（service worker），构建后自动生成 `sw.js` 与 Web App Manifest。

任何静态托管（GitHub Pages、Netlify、Vercel 等）均可，将输出目录设为 `dist` 即可。

## 项目结构

```
aevum/
├── index.html              # 应用入口
├── vite.config.ts          # Vite + PWA 配置
├── tsconfig.json
├── public/                 # 静态资源（图标等）
├── scripts/                # 冒烟测试
└── src/
    ├── main.ts             # 启动引导
    ├── app.ts              # 根组件与路由
    ├── theme.ts            # 动态主题（种子色 → OKLCH 配色）
    ├── types.ts            # 全局类型与默认值
    ├── i18n.ts             # 国际化入口
    ├── icons.ts            # 内联 SVG 图标
    ├── components/         # 自定义 Web Components
    ├── pages/              # 页面（设置页等）
    ├── store/              # localStorage 状态（events / settings / tags / themes）
    ├── utils/              # 历法 / 时间计算
    └── locales/            # 中英文词典
```

## 许可证

[MIT](./LICENSE) © 2026 308K
