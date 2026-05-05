import LspClient from './LspClient.js';
import path from 'path';
import os from 'os';
import fsSync from 'fs';
import { pathToFileURL } from 'url';

/**
 * LSP 服务器管理器
 * 维护多门语言服务器。
 * 寻址逻辑：
 * 1. 项目本地 (node_modules/.bin)
 * 2. 隔离缓存区 (~/.owo-terminal/ext/node_modules/.bin)
 * 3. 全局 PATH
 */
class LspServerManager {
  constructor() {
    this.servers = new Map(); // command -> LspClient
    this.openedFiles = new Set(); // URISet
    this.configs = {
      '.ts': { command: 'typescript-language-server', args: ['--stdio'] },
      '.js': { command: 'typescript-language-server', args: ['--stdio'] },
      '.coffee': { command: 'typescript-language-server', args: ['--stdio'] },
      '.py': { command: 'pyright-langserver', args: ['--stdio'] },
      '.json': { command: 'vscode-json-languageserver', args: ['--stdio'] },
      '.html': { command: 'vscode-html-languageserver', args: ['--stdio'] },
      '.css': { command: 'vscode-css-languageserver', args: ['--stdio'] },
      '.rs': { command: 'rust-analyzer', args: [] }
    };
  }

  /**
   * 智能寻址：找到最合适的可执行文件路径
   */
  resolveCommandPath(command) {
    const cwd = process.cwd();
    const userHome = os.homedir();

    const searchPaths = [
      path.join(cwd, 'node_modules', '.bin', command),
      path.join(userHome, '.owo-terminal', 'ext', 'node_modules', '.bin', command),
    ];

    for (const p of searchPaths) {
      if (fsSync.existsSync(p)) {
        return p;
      }
    }

    // 默认回滚到 PATH
    return command;
  }

  /**
   * 为指定文件获取对应 Client，若未启动则启动之
   */
  async getClientForFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const config = this.configs[ext];
    if (!config) return null;

    if (this.servers.has(config.command)) {
      return this.servers.get(config.command);
    }

    const resolvedCommand = this.resolveCommandPath(config.command);
    const client = new LspClient(config.command, resolvedCommand, config.args);
    try {
      await client.start();

      // 执行 LSP 初始化握手
      const capabilities = await client.sendRequest('initialize', {
        processId: process.pid,
        clientInfo: { name: "owo-terminal" },
        rootUri: pathToFileURL(process.cwd()).href,
        capabilities: {
          textDocument: {
            definition: { dynamicRegistration: true },
            references: { dynamicRegistration: true },
            hover: { dynamicRegistration: true },
            documentSymbol: { dynamicRegistration: true }
          }
        }
      });

      client.sendNotification('initialized', {});
      client.capabilities = capabilities;
      client.isInitialized = true;

      this.servers.set(config.command, client);
      return client;
    } catch (err) {
      // 记录失败，清理实例以免残留
      this.servers.delete(config.command);
      console.error(`无法启动 LSP 服务器 ${config.command}:`, err);
      return null;
    }
  }

  /**
   * 安装指定扩展名的 Server 到隔离区
   */
  async installServer(ext) {
    const config = this.configs[ext];
    if (!config) throw new Error(`不支持的扩展名: ${ext}`);

    // 包名映射
    const pkgMap = {
      '.ts': 'typescript-language-server typescript',
      '.js': 'typescript-language-server typescript',
      '.coffee': 'typescript-language-server typescript',
      '.py': 'pyright',
      '.json': 'vscode-langservers-extracted',
      '.html': 'vscode-langservers-extracted',
      '.css': 'vscode-langservers-extracted'
    };

    const pkgs = pkgMap[ext];
    if (!pkgs) throw new Error(`${ext} 暂不支持自动安装，请手动安装。`);

    const userHome = os.homedir();
    const targetDir = path.join(userHome, '.owo-terminal', 'ext');

    if (!fsSync.existsSync(targetDir)) {
      fsSync.mkdirSync(targetDir, { recursive: true });
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execP = promisify(exec);

    console.log(`正在安装 ${pkgs} 到隔离区 ${targetDir}...`);
    try {
      // 使用 --prefix 实现隔离安装
      await execP(`npm install --prefix "${targetDir}" ${pkgs}`);
      return true;
    } catch (err) {
      console.error("安装失败:", err);
      throw err;
    }
  }

  /**
   * 同步文件内容到 LSP
   */
  async syncFile(client, filePath, content) {
    const uri = pathToFileURL(filePath).href;
    if (!this.openedFiles.has(uri)) {
      const ext = path.extname(filePath).toLowerCase();
      const languageId = ext === '.ts' ? 'typescript' :
        ext === '.js' ? 'javascript' :
          ext === '.py' ? 'python' :
            ext === '.html' ? 'html' :
              ext === '.css' ? 'css' : 'plaintext';

      await client.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content
        }
      });
      this.openedFiles.add(uri);
    } else {
      // 若已打开，可按需发送 didChange (当前先做简单同步)
      await client.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: content }]
      });
    }
  }
}

export default new LspServerManager();
