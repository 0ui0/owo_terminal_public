---
name: lsp_management
description: 负责在 owo-terminal 环境下管理、安装和排查 Language Server Protocol (LSP) 服务器的技能。
---

# LSP 智能感知系统部署指南

本指南旨在协助 AI 理解并引导用户完成代码感知环境的搭建，确保系统运行在“对标 Claude”的高标准隔离模式下。

## 1. 环境先决条件检查

在使用 `lspTool` 之前，必须确保系统满足以下基础环境：

### Node.js 环境
- **版本要求**：Node.js v18.0.0 或更高版本。
- **原因**：大多数主流 Language Server（如 `typescript-language-server`）依赖较新版本的 V8 引擎特性。
- **检查命令**：`node -v`

### 包管理器
- **要求**：必须安装 `npm`。
- **用途**：用于将语言服务器精准安装到隔离工具区。

### 操作系统兼容性
- **macOS**：完美支持。
- **Linux**：确保已安装 `libstdc++6` 等基础库。
- **Windows**：支持，但需注意 `spawn` 调用时的路径转义。

## 2. 隔离存储架构 (Claude-style)

为了保证主项目的纯净，所有自动安装的工具都会存放在：
`~/.owo-terminal/ext`

### 寻址优先级
1.  **Project Local**: `./node_modules/.bin/`
2.  **Isolated Bin**: `~/.owo-terminal/ext/node_modules/.bin/`
3.  **System PATH**: 全局变量。

## 3. 各语言服务器安装参考

| 语言 | 推荐服务器 | 安装指令 (由 installServer 自动执行) |
| :--- | :--- | :--- |
| **JS / TS / Coffee** | `typescript-language-server` | `npm install --prefix ~/.owo-terminal/ext typescript-language-server typescript` |
| **Python** | `pyright` | `npm install --prefix ~/.owo-terminal/ext pyright` |
| **JSON** | `vscode-json-languageserver` | `npm install --prefix ~/.owo-terminal/ext vscode-json-languageserver` |
| **Rust** | `rust-analyzer` | 建议通过 `rustup` 全局安装。 |

## 4. 故障排查流程

如果 AI 调用 `lspTool` 失败，应按以下顺序引导用户：
1.  **检查 Node.js**：询问是否安装了 Node.js 18+。
2.  **请求安装许可**：告知用户安装将发生在 `~/.owo-terminal/ext`，不会影响当前项目。
3.  **验证二进制路径**：如果安装后仍报错，检查隔离区对应的 `.bin` 是否存在。

---
*注：本技能文档由宅喵编写，用于指导 AI 更加智能地维护其“大脑感官”。*
