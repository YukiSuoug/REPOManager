# 🎮 R.E.P.O. Portable Mod Station (便携版 Mod 管理器)

<div align="center">

![Version](https://img.shields.io/badge/version-v1.4.2-cyan.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-blue.svg)
![React](https://img.shields.io/badge/React-v19-61dafb.svg)
![Rust](https://img.shields.io/badge/Rust-2021-orange.svg)
![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)
![Platform](https://img.shields.io/badge/platform-Windows-0078d7.svg)
![AI Model](https://img.shields.io/badge/AI%20Model-Google%20DeepMind%20Antigravity%20(Gemini)-8A2BE2.svg)

**专为游戏《R.E.P.O.》打造的极简、轻量、高性能便携式 Mod 工作站**  
无需安装环境 · 即解即用 · 纯便携数据隔离 · 支持社区在线浏览与一键更新

</div>

> 🤖 **AI 创作声明**：本项目由 AI 辅助制作。全套代码（包括前端 React 桌面界面、横版侧边栏工作台、Thunderstore 社区在线市场、版本检测更新、冲突与依赖体检，以及 Rust 后端核心逻辑与 50 项自动化单元测试）均由 **Google DeepMind Antigravity (Gemini)** 模型驱动完成。

---

## 🌟 核心特性

- 🏢 **横版战术双栏工作台**：左侧全能侧边栏整合路径选择、开黑指纹、环境状态与大尺寸「启动游戏」按钮；右侧宽屏弹性自适应 2~3 列 Mod 栅格。
- 🛍️ **Thunderstore 社区在线 Mod 市场**：官方 API 免认证直连，内置高性能分页引擎，支持关键词搜索、多维排序（下载量/评分/最新发布）与分类标签筛选，一键下载自动解压部署。
- ✨ **智能版本对比与一键无缝升级**：基于语义化版本（SemVer）比对本地已安装插件，自动点亮呼吸灯升级标识，支持一键热替换。
- 🩺 **冲突诊断与前置依赖检测系统**：
  - 自动递归比对 Mod `manifest.json` 依赖项，前置缺失时提示并支持一键去社区市场检索；
  - 深度扫描跨目录同名 DLL 冲突，防止多版本冲突崩溃。
- ⚡ **智能解压分流内核**：
  - 自动识别 Thunderstore 标准包、纯 DLL 单文件包与 BepInEx 完整根目录包；
  - 覆盖安装前自动生成时间戳备份（`data/backups/`）。
- 🔑 **开黑联机指纹系统**：基于已启用插件计算联机指纹哈希（如 `REPO-8A3F`），一键生成可直接发送至群聊的开黑 Mod 清单文本。
- 📁 **纯粹便携数据模型**：完全不污染系统 `AppData`，所有配置与缓存严格存放在可执行文件同级 `./data/` 目录下。
- 🔊 **微触感物理音效反馈**：内置 Web Audio API 合成音效，操作反馈清脆舒适（支持一键全局静音）。

---

## 🏗️ 架构与技术栈

- **桌面运行时**：[Tauri 2](https://v2.tauri.app/)（仅限 Windows 平台，支持 Steam 注册表自识别与协议唤起）
- **前端技术栈**：React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Lucide Icons
- **后端技术栈**：Rust 2021 Edition（`reqwest` 配合 rustls-tls、`zip`、`winreg`、`semver`）

---

## 🛠️ 本地开发与构建

### 前置要求
1. [Node.js](https://nodejs.org/) (v18+)
2. [Rust](https://rustup.rs/) (stable toolchain)
3. Windows 10/11 环境 + WebView2

### 开发与测试

```bash
# 1. 安装前端依赖
npm install

# 2. 启动 Tauri 2 完整桌面开发调试 (同时启动 Vite 与 Rust 后端)
npm run tauri dev

# 3. 仅启动前端热重载预览 (浏览器调试 UI 布局)
npm run dev

# 4. 前端类型检查与生产打包
npm run build

# 5. 运行 Rust 单元测试 (含 50 个高覆盖度全自动化单测)
cd src-tauri
cargo test
cargo clippy
```

### 生产打包构建

```bash
# 生成 Windows 便携可执行程序与安装包 (位于 src-tauri/target/release/bundle/)
npm run tauri build
```

---

## 📄 便携目录说明

```text
├── data/
│   ├── config.json          # 记录当前游戏安装路径与 Mod 启停配置
│   ├── cache/               # Thunderstore 社区市场 Mod 缓存 (30分钟 TTL)
│   ├── backups/             # BepInEx 自动时间戳备份压缩包
│   └── temp/                # 压缩包解压暂存目录
```

---

## 📜 开源协议

本项目基于 MIT License 开源。
