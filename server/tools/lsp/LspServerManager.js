import LspClient from './LspClient.js';
import path from 'path';
import os from 'os';
import fsSync from 'fs';
import { pathToFileURL } from 'url';

/**
 * LSP 服务器管理器 (对齐主流 IDE 架构)
 * 1. 按 mainDir 进行工作区隔离管理；
 * 2. 握手时传入 workspaceFolders，自动激活全项目 AST 深度扫描与依赖索引；
 * 3. 内存汇聚并暴露 Diagnostics 诊断数据 (get_errors)；
 * 4. 支持工作区生命周期优雅停机 (disposeWorkspace) 与按需轻量感知。
 */
class LspServerManager {
  constructor() {
    this.workspaces = new Map(); // mainDir -> Map<command, LspClient>
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
  resolveCommandPath(command, mainDir) {
    const userHome = os.homedir();
    const searchPaths = [];
    const commands = process.platform === 'win32' ? [`${command}.cmd`, command] : [command];

    for (const cmd of commands) {
      if (mainDir) {
        searchPaths.push(path.join(mainDir, 'node_modules', '.bin', cmd));
      }
      searchPaths.push(path.join(userHome, '.owo-terminal', 'ext', 'node_modules', '.bin', cmd));
    }

    for (const p of searchPaths) {
      if (fsSync.existsSync(p)) {
        return p;
      }
    }

    // 默认回滚到 PATH
    return command;
  }

  /**
   * 为指定文件获取对应 Client，若未启动则启动之 (按 mainDir 工作区隔离)
   */
  async getClientForFile(filePath = "", mainDir = null) {
    let isDir = false;
    try {
      if (filePath && fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()) {
        isDir = true;
      }
    } catch (e) {}

    let ext = isDir ? "" : path.extname(filePath || "").toLowerCase();
    // 若未提供具体文件扩展名，根据工作区主目录特征自动探测主语言
    if (!ext && mainDir && fsSync.existsSync(mainDir)) {
      if (fsSync.existsSync(path.join(mainDir, 'tsconfig.json'))) {
        ext = '.ts';
      } else if (fsSync.existsSync(path.join(mainDir, 'jsconfig.json'))) {
        ext = '.js';
      } else if (fsSync.existsSync(path.join(mainDir, 'pyproject.toml')) || fsSync.existsSync(path.join(mainDir, 'requirements.txt'))) {
        ext = '.py';
      } else {
        ext = '.js'; // 默认 JavaScript
      }
    }
    if (!ext) ext = '.js';

    const config = this.configs[ext];
    if (!config) return null;

    const wsKey = mainDir ? path.resolve(mainDir) : '__global__';
    if (!this.workspaces.has(wsKey)) {
      this.workspaces.set(wsKey, new Map());
    }
    const serverMap = this.workspaces.get(wsKey);

    if (serverMap.has(config.command)) {
      return serverMap.get(config.command);
    }

    const resolvedCommand = this.resolveCommandPath(config.command, mainDir);
    const clientCwd = mainDir && fsSync.existsSync(mainDir) ? mainDir : process.cwd();
    const client = new LspClient(config.command, resolvedCommand, config.args, { cwd: clientCwd });

    try {
      await client.start();

      const rootPath = mainDir && fsSync.existsSync(mainDir) ? mainDir : null;
      const rootUri = rootPath ? pathToFileURL(rootPath).href : null;

      // 执行标准 LSP 项目级初始化握手 (支持无工作区 null 模式)
      const capabilities = await client.sendRequest('initialize', {
        processId: process.pid,
        clientInfo: { name: "owo-terminal" },
        rootPath: rootPath,
        rootUri: rootUri,
        workspaceFolders: rootUri ? [
          {
            uri: rootUri,
            name: path.basename(rootPath)
          }
        ] : null,
        capabilities: {
          textDocument: {
            definition: { dynamicRegistration: true },
            references: { dynamicRegistration: true },
            hover: { dynamicRegistration: true },
            documentSymbol: { dynamicRegistration: true },
            publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] } }
          },
          workspace: {
            workspaceFolders: true,
            symbol: { dynamicRegistration: true }
          }
        },
        initializationOptions: {
          preferences: {
            includeInlayParameterNameHints: "all"
          },
          hostInfo: "owo-terminal"
        }
      });

      client.sendNotification('initialized', {});
      client.sendNotification('workspace/didChangeConfiguration', {
        settings: {
          javascript: {
            validate: { enable: true },
            suggestionActions: { enabled: true }
          },
          typescript: {
            validate: { enable: true }
          }
        }
      });
      client.capabilities = capabilities;
      client.isInitialized = true;

      serverMap.set(config.command, client);

      // -- 新增: 发送初始 didOpen 挂载项目并预热 AST (必须阻塞等待其建立索引，消除后续冷查询的时序赛跑)
      try {
        await this.warmupProjectAST(client, config.command, mainDir);
      } catch (e) {
        console.warn(`[LspManager] 项目 AST 预热失败 (didOpen):`, e);
      }

      return client;
    } catch (err) {
      serverMap.delete(config.command);
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
      await client.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: content }]
      });
    }
  }

  /**
   * 收集指定工作区或文件的全部语法诊断信息 (对齐 get_errors)
   */
  getDiagnostics(mainDir, targetFilePath = null) {
    const wsKey = mainDir ? path.resolve(mainDir) : '__global__';
    const serverMap = this.workspaces.get(wsKey);
    if (!serverMap) return [];

    const targetUri = targetFilePath ? pathToFileURL(targetFilePath).href : null;
    const allResults = [];

    for (const client of serverMap.values()) {
      if (targetUri) {
        const diags = client.getDiagnostics(targetUri);
        if (diags && diags.length > 0) {
          allResults.push({ uri: targetUri, diagnostics: diags });
        }
      } else {
        const allDiags = client.getDiagnostics();
        allResults.push(...allDiags);
      }
    }
    return allResults;
  }

  /**
   * 销毁并释放指定工作区的所有 LSP 进程与内存
   */
  async disposeWorkspace(mainDir) {
    const wsKey = mainDir ? path.resolve(mainDir) : '__global__';
    const serverMap = this.workspaces.get(wsKey);
    if (!serverMap) return;

    for (const client of serverMap.values()) {
      await client.stop();
    }
    serverMap.clear();
    this.workspaces.delete(wsKey);
    this.openedFiles.clear();
  }

  /**
   * 清除除了指定有效目录以外的所有残留工作区 LSP 实例
   * @param {string[]} validDirs 当前用户选择的所有有效目录数组
   */
  async retainOnlyWorkspaces(validDirs = []) {
    const resolvedValid = new Set(validDirs.filter(Boolean).map(d => path.resolve(d)));
    const allKeys = Array.from(this.workspaces.keys());

    for (const wsKey of allKeys) {
      if (wsKey !== '__global__' && !resolvedValid.has(wsKey)) {
        console.log(`[LspManager] 自动清理非当前目录的 LSP 残留进程: ${wsKey}`);
        await this.disposeWorkspace(wsKey);
      }
    }
  }

  /**
   * 主动预热主工作目录的 Language Server 并建立 AST 索引
   */
  async preloadWorkspace(mainDir) {
    if (!mainDir || !fsSync.existsSync(mainDir)) return;
    try {
      // 探测项目特征
      const hasTs = fsSync.existsSync(path.join(mainDir, 'tsconfig.json')) || fsSync.existsSync(path.join(mainDir, 'jsconfig.json')) || fsSync.existsSync(path.join(mainDir, 'package.json'));
      const hasPy = fsSync.existsSync(path.join(mainDir, 'pyproject.toml')) || fsSync.existsSync(path.join(mainDir, 'requirements.txt'));

      if (hasTs) {
        // 预先调起 TypeScript/JavaScript Language Server 进行握手与全项目 AST 扫描
        const dummyFile = path.join(mainDir, 'index.ts');
        await this.getClientForFile(dummyFile, mainDir);
      }
      if (hasPy) {
        const dummyFile = path.join(mainDir, 'main.py');
        await this.getClientForFile(dummyFile, mainDir);
      }
    } catch (err) {
      console.warn(`[LspManager] 预热工作区索引失败:`, err);
    }
  }

  /**
   * 通过发送真实的 didOpen 使 LSP 尤其是 typescript-language-server 建立 Project 索引
   */
  async warmupProjectAST(client, command, mainDir) {
    if (!mainDir || !fsSync.existsSync(mainDir)) return;

    let foundFile = null;
    const possibleEntries = ['app.js', 'index.js', 'main.js', 'src/index.ts', 'src/main.ts', 'src/index.js'];

    for (const e of possibleEntries) {
      const ep = path.join(mainDir, e);
      if (fsSync.existsSync(ep)) {
        foundFile = ep;
        break;
      }
    }

    if (!foundFile) {
      const validExts = ['.js', '.ts', '.py', '.jsx', '.tsx'];
      const searchValidFile = (dir, depth = 0) => {
        if (depth > 2) return null;
        try {
          const entries = fsSync.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && validExts.includes(path.extname(entry.name).toLowerCase())) {
              return fullPath;
            } else if (entry.isDirectory()) {
              const result = searchValidFile(fullPath, depth + 1);
              if (result) return result;
            }
          }
        } catch (e) { }
        return null;
      };
      foundFile = searchValidFile(mainDir);
    }

    if (foundFile) {
      try {
        const content = fsSync.readFileSync(foundFile, 'utf8');
        await this.syncFile(client, foundFile, content);

        // 发送 documentSymbol 请求，这能强迫 tsserver 等待 AST 扫描完成并回应
        // 增加 3 秒强制超时机制，防止 LSP 假死导致整个 getClientForFile 永久卡死
        try {
          const requestPromise = client.sendRequest('textDocument/documentSymbol', {
            textDocument: { uri: pathToFileURL(foundFile).href }
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("AST预热请求超时 (3000ms)")), 10000)
          );
          await Promise.race([requestPromise, timeoutPromise]);
        } catch (e) {
          console.warn("[LspManager] warmupProjectAST 强力阻塞提前放行:", e.message || e);
        }
      } catch (e) {
        console.warn("[LspManager] warmupProjectAST 文件读取异常:", e);
      }
    }
  }
}

export default new LspServerManager();
