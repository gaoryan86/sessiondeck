<!-- SEO: SessionDeck – Claude Code 会话管理器、查看器、恢复工具。本地浏览、搜索、恢复 Claude Code 被压缩的上下文。 -->

<div align="center">

# SessionDeck

**Claude Code 本地会话控制台 — 浏览、搜索、恢复、管理你的 AI 编程会话，不触碰源数据。**

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)]()

[English](./README.md) | 简体中文

</div>

---

## 为什么需要 SessionDeck？

Claude Code 将会话存储为 `~/.claude/projects` 下的本地 JSON 文件。随着会话增多，你会遇到这些问题：

| 痛点 | 没有 SessionDeck | 有 SessionDeck |
|------|-----------------|---------------|
| **找不到以前的会话** | 手动翻 JSON 文件 | 可视化表格 + 搜索、排序、过滤 |
| **自动压缩后丢失上下文** | 永久丢失——Claude 会自动压缩长会话 | **Session Timeline** 可读取压缩前的快照 |
| **误删会话** | `rm` = 永久丢失 | 只通过系统回收站删除，可恢复 |
| **跨会话搜索** | 不写脚本就做不到 | 全文搜索，支持跨会话 + 子代理 |
| **导出对话记录** | 从 JSON 里复制粘贴 | 一键导出 Markdown（单条或批量） |
| **查看会话历史** | 直接看原始 JSON | 可视化时间线，按角色颜色区分消息 |

> **一句话总结** — SessionDeck 是一个**只读控制台**，挂载在你的 Claude Code 会话文件之上。它从不修改源数据。它提供 Claude Code 本身没有的可视化、搜索和恢复能力。

## 核心功能

### 🗂️ Session Manager（会话管理器）
- **可视化会话浏览** — 项目名、摘要、首条/末条 Prompt、消息数、时间戳
- **关键词搜索与过滤** — 秒级检索任何会话
- **自定义命名与标签** — 通过 sidecar 元数据（永远不改源文件）
- **批量选择与导出** — 批量导出为 Markdown
- **安全删除** — 移入系统回收站，从不硬删

### 🔍 Session Timeline（会话时间线）
- **完整对话时间线** — 按 Session ID 加载（主会话 + 子代理）
- **查看压缩前上下文** — 恢复被 Claude Code 自动压缩的消息
- **定位压缩点** — 精确显示压缩发生的时间和位置
- **导出 Markdown** — 保存完整的恢复时间线

### ♻️ Recovery（恢复）
- **从系统回收站恢复已删除会话** 到原路径
- **按 session/path/status 过滤恢复记录**
- **查看恢复状态**（deleted / restored / failed）
- **恢复后可快速返回 Session Manager**

### 🔧 进阶工具
- **重建 `sessions-index.json`** — 修复损坏的索引，不动会话内容
- **全文搜索** — 跨所有会话搜索，可选是否包含子代理
- **全局搜索** — 在整个会话库中查找关键词

### 🎨 界面
- **War-Room 终端美学** — 深色等宽字体 UI，专为信息密度设计
- **双语支持** — English / 中文 一键切换
- **桌面优先，兼容移动端** — 响应式布局

## 数据安全

SessionDeck 严格遵守只读边界：

```
 ┌─────────────────────────────────────────────┐
 │  ~/.claude/projects（你的会话数据）          │
 │                                             │
 │  SessionDeck 读取 ──────► 在 UI 中展示      │
 │  SessionDeck 永远不写入会话文件             │
 │                                             │
 │  删除 = 仅通过系统回收站（可恢复）          │
 │  标签/命名 = 单独的 Sidecar 文件            │
 └─────────────────────────────────────────────┘
```

## 快速启动

### 一行命令（终端）

```bash
git clone https://github.com/gaoryan86/sessiondeck.git
cd sessiondeck && ./run.sh
```

浏览器打开 **http://127.0.0.1:47831** 即可使用。

### 双击启动

| 平台 | 启动 | 停止 |
|------|------|------|
| **macOS** | `Session Deck.command` | `Stop Session Deck.command` |
| **Windows** | `Session Deck.bat` | `Stop Session Deck.bat` |

### macOS Spotlight 集成

```bash
./scripts/install-macos-launcher.sh
```
创建 `~/Applications/Session Deck.app`，可通过 Spotlight 直接搜索启动。

## 截图

### Session Manager

![Session Manager](docs/images/session-manager.png)

### Session Timeline（会话时间线）

![Session Timeline](docs/images/session-timeline.png)

### Recovery（恢复）

![Recovery View](docs/images/recovery-view.png)

## 环境要求

- **Node.js 18+**（无其他依赖——不需要 `npm install`）
- Claude Code 已安装，会话存储在 `~/.claude/projects`

## 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `47831` | 服务端口 |
| `CLAUDE_PROJECTS` | `~/.claude/projects` | Claude Code 会话目录 |

```bash
PORT=47840 CLAUDE_PROJECTS="$HOME/.claude/projects" ./run.sh
```

## 架构

```
SessionDeck/
├── index.html          # 单页前端（HTML + CSS + JS）
├── server.mjs          # Node.js HTTP 服务（零依赖）
├── run.sh              # 跨平台启动脚本
├── Session Deck.command # macOS 双击启动器
├── Session Deck.bat    # Windows 双击启动器
└── docs/               # 截图与文档
```

- **无框架、无构建步骤、无 npm install** — 只需 `node server.mjs`
- 整个前端是一个 `index.html`
- 纯 Node.js HTTP 服务器，零外部依赖

## 适用场景

- **日常使用 Claude Code 的开发者** — 快速找到历史会话
- **恢复丢失的上下文** — 找回被 Claude Code 自动压缩的长对话
- **审计 AI 交互** — 回顾 Claude 在各项目中做了什么
- **导出对话记录** — 用于文档、分享或归档
- **管理会话蔓延** — 跨数十个项目的数百个会话

## 常见问题

<details>
<summary><strong>SessionDeck 会修改我的 Claude Code 会话吗？</strong></summary>

不会。SessionDeck 严格只读。唯一的写操作是删除，且走系统回收站（完全可恢复）。自定义命名和标签存储在独立的 sidecar 文件中。
</details>

<details>
<summary><strong>支持所有平台吗？</strong></summary>

支持。SessionDeck 在 macOS、Windows 和 Linux 上均可运行——只要 Claude Code 在本地存储会话就可以。
</details>

<details>
<summary><strong>能恢复被压缩的会话吗？</strong></summary>

可以——这是 SessionDeck 的核心功能之一。`Session Timeline` 页签可以读取 Claude Code 保留但不在自己界面中展示的压缩前快照数据。
</details>

<details>
<summary><strong>需要联网吗？</strong></summary>

不需要。SessionDeck 100% 本地运行，数据不会发送到任何地方。
</details>

## 项目状态

- 当前版本：`v0.1.5`
- 发布记录见 [`CHANGELOG.md`](./CHANGELOG.md)

## 贡献

请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## 安全

漏洞报告流程见 [`SECURITY.md`](./SECURITY.md)

## 许可证

MIT License，见 [`LICENSE`](./LICENSE)

---

<div align="center">

**SessionDeck** — 看到 Claude Code 没有展示给你的一切。

</div>
