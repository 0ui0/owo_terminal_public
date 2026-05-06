import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import comData from '../../comData/comData.js';

/**
 * 时光机核心逻辑引擎 (对象化自适应版)
 */

const DB_NAME = 'snapshots.json';
let gitPath = 'git';
let gitStatus = null;

const timeMachineEngine = {
  dbName: DB_NAME,

  /**
   * 探测系统 Git 环境
   */
  checkGit: async () => {
    try {
      const version = await new Promise((resolve, reject) => {
        execFile(gitPath, ['--version'], {
          env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined }
        }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        });
      });

      if (version.includes("git version")) {
        gitStatus = { ok: true };
        return {
          ok: true,
          msg: "Git 环境探测成功喵！",
          data: { version }
        };
      }

      return {
        ok: false,
        msg: "未检测到有效的 Git 客户端喵！"
      };
    } catch (err) {
      console.log(err);
      if (err?.code === 'ENOENT') {
        return {
          ok: false,
          msg: "未检测到 Git 客户端，请确认 Git 已安装并加入 PATH"
        };
      }
      return {
        ok: false,
        msg: "Git 环境检测发生异常：" + err.message
      };
    }
  },

  /**
   * 内部执行 Git 命令的通用封装
   */
  _git: async function ({ repoPath, gitArgs, customWorkTree = null }) {
    if (!repoPath) throw new Error("git 执行失败：未提供 repoPath 喵");
    const gitDir = path.join(repoPath, '.git');
    const workTree = customWorkTree || path.dirname(repoPath);

    // 构造完整参数数组，杜绝 Shell 转义风险
    const args = [
      '-c', 'core.quotepath=false',
      `--git-dir=${gitDir}`,
      `--work-tree=${workTree}`
    ];

    if (Array.isArray(gitArgs)) {
      args.push(...gitArgs);
    } else {
      // 兼容逻辑：若传的是字符串，则按空格简单切分（注意：含空格路径建议传数组）
      args.push(...gitArgs.split(/\s+/).filter(Boolean));
    }

    return new Promise((resolve, reject) => {
      execFile(gitPath, args, { cwd: workTree, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined } }, (error, stdout, stderr) => {
        if (error) reject({ error, stderr, stdout });
        else resolve(stdout.trim());
      });
    });
  },

  /**
   * 内部执行 Git 命令并管道输出到文件的封装 (用于大文件/二进制提取，无副作用)
   */
  _gitPipe: async function ({ repoPath, gitArgs, destPath }) {
    if (!repoPath) throw new Error("git 管道执行失败：未提供 repoPath");
    const gitDir = path.join(repoPath, '.git');
    const workTree = path.dirname(repoPath);

    const args = [
      '-c', 'core.quotepath=false',
      `--git-dir=${gitDir}`,
      `--work-tree=${workTree}`
    ];

    if (Array.isArray(gitArgs)) args.push(...gitArgs);
    else args.push(...gitArgs.split(/\s+/).filter(Boolean));

    return new Promise((resolve, reject) => {
      // 1. 确保目标目录存在
      fs.ensureDirSync(path.dirname(destPath));

      // 2. 启动 Git 进程
      const cp = spawn(gitPath, args, { 
        cwd: workTree,
        env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined }
      });

      // 3. 创建文件写入流
      const writeStream = fs.createWriteStream(destPath);

      let errorMsg = "";
      let gitDone = false;
      let streamDone = false;
      let exitCode = null;
      let hasError = false;

      // 双重锁校验机制：只有流和进程双双完毕，才判定成功
      const checkDone = () => {
        if (hasError) return;
        if (gitDone && streamDone) {
          if (exitCode === 0) resolve({ ok: true });
          else {
            hasError = true;
            reject(new Error(errorMsg || `Git 管道执行失败，退出码：${exitCode}`));
          }
        }
      };

      // 写入流错误保护 (防止只读文件夹导致整个 Node.js 崩溃)
      writeStream.on('error', (err) => {
        if (hasError) return;
        hasError = true;
        cp.kill();
        reject(new Error(`写入文件失败: ${err.message}`));
      });

      // 写入流完成保护 (防止提前结束导致空文件/锁存)
      writeStream.on('finish', () => {
        streamDone = true;
        checkDone();
      });

      // 4. 建立管道
      cp.stdout.pipe(writeStream);

      cp.stderr.on('data', (data) => { errorMsg += data.toString(); });

      cp.on('error', (err) => { 
        if (hasError) return;
        hasError = true;
        writeStream.destroy();
        reject(err); 
      });

      cp.on('close', (code) => {
        gitDone = true;
        exitCode = code;
        if (code !== 0 && !hasError) {
          hasError = true;
          writeStream.destroy();
          reject(new Error(errorMsg || `Git 管道执行失败，退出码：${code}`));
        } else {
          checkDone();
        }
      });
    });
  },



  /**
   * 判定路径是否为备份仓库
   */
  isBackupRepo: async function ({ repoPath }) {
    try {
      if (!repoPath) return { ok: false, msg: "路径不能为空喵" };

      const hasGit = fs.existsSync(path.join(repoPath, '.git'));
      const hasDb = fs.existsSync(path.join(repoPath, DB_NAME));

      if (!hasGit || !hasDb) {
        return { ok: false, msg: "未检测到备份仓库特征文件（.git 或 snapshots.json）喵" };
      }

      const checkRes = await this.checkGit();
      if (!checkRes.ok) return checkRes;

      return {
        ok: true,
        msg: "检测到合法的备份仓库喵！",
        data: true
      };
    } catch (err) {
      console.log(err);
      return {
        ok: false,
        msg: "检测仓库状态时发生异常喵：" + err.message
      };
    }
  },

  /**
   * 初始化备份仓库
   */
  init: async function ({ repoPath }) {
    if (!repoPath) throw new Error("初始化失败：未提供有效路径喵");
    try {
      const checkRes = await this.checkGit();
      if (!checkRes.ok) throw new Error(checkRes.msg);

      const repoName = path.basename(repoPath);
      const gitDir = path.join(repoPath, '.git');
      const dbPath = path.join(repoPath, DB_NAME);
      const projectRoot = path.dirname(repoPath);
      await fs.ensureDir(repoPath);
      if (!fs.existsSync(gitDir)) {
        await new Promise((resolve, reject) => {
          execFile(gitPath, ['init'], { cwd: repoPath, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined } }, (error, stdout) => {
            if (error) reject(error); else resolve(stdout);
          });
        });
        const excludePath = path.join(gitDir, 'info', 'exclude');
        await fs.ensureDir(path.dirname(excludePath));
        await fs.writeFile(excludePath, `${repoName}/\n.git/\nnode_modules/\n`);
      }
      if (!fs.existsSync(dbPath)) await fs.writeJson(dbPath, { projectPath: projectRoot, snapshots: [] }, { spaces: 2 });
      await this.ensureGitIgnore({ projectRoot, repoName });
      return {
        ok: true,
        msg: "初始化备份仓库成功喵！",
        data: { repoPath }
      };
    } catch (err) {
      console.log(err);
      return {
        ok: false,
        msg: "初始化备份仓库发生异常喵：" + err.message
      };
    }
  },

  /**
   * 确保 .gitignore 包含备份目录
   */
  ensureGitIgnore: async function ({ projectRoot, repoName }) {
    try {
      const gitIgnorePath = path.join(projectRoot, '.gitignore');
      const pattern = `${repoName}/`;
      let content = fs.existsSync(gitIgnorePath) ? await fs.readFile(gitIgnorePath, 'utf-8') : "";
      if (!content.includes(pattern)) {
        await fs.writeFile(gitIgnorePath, (content.endsWith('\n') || content === "") ? `${content}${pattern}\n` : `${content}\n${pattern}\n`);
        return { ok: true, msg: "已更新 .gitignore 喵！", data: true };
      }
      return { ok: true, msg: ".gitignore 已经包含备份目录了喵！", data: false };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "更新 .gitignore 失败喵：" + err.message };
    }
  },

  /**
   * 根据消息 ID 查找快照
   */
  findSnapshotByMsgId: async function ({ repoPath, msgId }) {
    try {
      const dbPath = path.join(repoPath, DB_NAME);
      if (!fs.existsSync(dbPath)) return { ok: true, msg: "仓库尚未初始化喵", data: null };
      const db = await fs.readJson(dbPath);
      const snapshot = (db.snapshots || []).find(s => s.msgId === msgId) || null;
      return { ok: true, msg: snapshot ? "找到快照喵！" : "未找到匹配快照喵", data: snapshot };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "查找快照失败喵：" + err.message };
    }
  },

  /**
   * 创建快照
   */
  snapshot: async function ({ repoPath, message = "Manual Snapshot", msgId = null }) {
    try {
      await this.init({ repoPath });
      await this._git({ repoPath, gitArgs: ['add', '--all', '.'] });
      await this._git({ repoPath, gitArgs: ['commit', '--allow-empty', '-m', `[Snapshot] ${message}`] });
      const fullHash = await this._git({ repoPath, gitArgs: ['rev-parse', 'HEAD'] });
      const dbPath = path.join(repoPath, DB_NAME);
      const db = await fs.readJson(dbPath);
      const newSnapshot = { id: db.snapshots.length + 1, msgId: msgId || null, hash: fullHash, time: Date.now(), msg: message };
      db.snapshots.push(newSnapshot);
      await fs.writeJson(dbPath, db, { spaces: 2 });
      return { ok: true, data: newSnapshot };
    } catch (err) { return { ok: false, msg: err.message || "快照创建失败" }; }
  },

  /**
   * 获取历史记录
   */
  getHistory: async function ({ repoPath }) {
    try {
      const dbPath = path.join(repoPath, DB_NAME);
      if (!fs.existsSync(dbPath)) return { ok: true, msg: "仓库尚未初始化喵", data: [] };
      const data = await fs.readJson(dbPath);
      return {
        ok: true,
        msg: "获取历史快照成功喵！",
        data: (data.snapshots || []).sort((a, b) => b.time - a.time)
      };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "获取历史快照失败喵：" + err.message };
    }
  },

  /**
   * 还原文件/目录 (覆盖模式)
   */
  restore: async function ({ repoPath, hash, relPath = "." }) {
    try {
      await this._git({ repoPath, gitArgs: ['checkout', hash, '--', relPath] });
      return { ok: true, msg: `还原 ${relPath === "." ? "整个仓库" : relPath} 成功喵！`, data: true };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "还原失败喵：" + (err.stderr || err.message) };
    }
  },

  /**
   * 清理工作区中未追踪的文件 (对应替换模式)
   */
  clean: async function ({ repoPath, relPath = ".", targetWorkTree = null }) {
    try {
      const repoName = path.basename(repoPath);
      const cleanArgs = ['clean', '-fd', '-e', repoName, '--'];
      cleanArgs.push((relPath === "." || relPath === "") ? "." : relPath);
      await this._git({ repoPath, gitArgs: cleanArgs, customWorkTree: targetWorkTree });
      return { ok: true, msg: "清理工作区成功喵！", data: true };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "清理工作区失败喵：" + (err.stderr || err.message) };
    }
  },

  /**
   * 获取特定版本文件内容
   */
  getFileContent: async function ({ repoPath, hash, relPath }) {
    try {
      const content = await this._git({ repoPath, gitArgs: ['show', `${hash}:${relPath}`] });
      return { ok: true, msg: "读取文件内容成功喵！", data: content };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "读取文件内容失败喵：" + err.message };
    }
  },

  /**
   * 浏览目录树 (ls-tree)
   */
  lsTree: async function (config) {
    try {
      if (!config) {
        throw new Error("请传入config")
      }
      let { repoPath, hash, relPath = ".", recursive = false } = config
      const args = ['ls-tree'];
      if (recursive) args.push('-r');
      args.push(hash);
      if (relPath && relPath !== "." && relPath !== "") {
        let target = relPath;
        if (!recursive && !target.endsWith('/')) target += '/';
        args.push(target);
      }
      const output = await this._git({ repoPath, gitArgs: args });
      const data = output.split('\n').filter(Boolean).map(line => {
        const match = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\s+(.*)$/);
        if (!match) return null;
        const type = match[2], fullPath = match[4];
        const name = fullPath.replace(/\/$/, '').split('/').pop();
        return { mode: match[1], type, hash: match[3], name: type === 'tree' ? name + '/' : name, path: fullPath };
      }).filter(Boolean);
      return {
        ok: true,
        msg: "列出git目录成功",
        data: data
      }
    } catch (err) {
      console.log(err)
      return {
        ok: false,
        msg: "列git目录错误，请检查服务器",
        data: null
      }
    }
  },

  /**
   * 使用 git show 将单个文件恢复到指定位置
   */
  restoreFileTo: async function ({ repoPath, hash, relPath, destPath }) {
    if (!destPath) return { ok: false, msg: "精准还原失败：未提供目标路径 destPath" };
    try {
      // 直接流式提取，不经过工作区，不产生任何同名文件冲突
      await this._gitPipe({
        repoPath,
        gitArgs: ['show', `${hash}:${relPath}`],
        destPath
      });
      return { ok: true, msg: "文件精准还原成功！", data: destPath };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "文件还原失败：" + err.message };
    }
  },

  /**
   * 删除指定快照记录
   */
  deleteSnapshot: async function ({ repoPath, id }) {
    try {
      const dbPath = path.join(repoPath, DB_NAME);
      if (!fs.existsSync(dbPath)) return { ok: false, msg: "数据库不存在喵" };
      const db = await fs.readJson(dbPath);
      const initialCount = db.snapshots.length;
      db.snapshots = db.snapshots.filter(s => s.id !== id);
      if (db.snapshots.length === initialCount) return { ok: false, msg: "未找到指定快照喵" };
      await fs.writeJson(dbPath, db, { spaces: 2 });
      return { ok: true, msg: "删除快照成功喵！", data: id };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "删除快照失败喵：" + err.message };
    }
  },

  /**
   * 检测嵌套的时光机仓库 (默认检测名称为 .owoTimeMachine 的文件夹)
   */
  detectNested: async function ({ repoPath, targetName = '.owoTimeMachine' }) {
    try {
      const results = [];
      const items = await fs.readdir(repoPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const subPath = path.join(repoPath, item.name);
          if (item.name === targetName) {
            results.push(subPath);
          } else {
            const nested = await fs.readdir(subPath, { withFileTypes: true });
            if (nested.some(n => n.name === targetName)) results.push(path.join(subPath, targetName));
          }
        }
      }
      return { ok: true, msg: "检测嵌套仓库成功喵！", data: results };
    } catch (err) {
      console.log(err);
      return { ok: false, msg: "检测嵌套仓库失败喵：" + err.message };
    }
  }
};

export default timeMachineEngine;
