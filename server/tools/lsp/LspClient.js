import { spawn } from 'child_process';
import EventEmitter from 'events';

/**
 * 轻量级 LSP 客户端
 * 适配自 Claude Code，去除了对 vscode-jsonrpc 的依赖，直接解析 Content-Length 报文。
 */
export default class LspClient extends EventEmitter {
  constructor(name, command, args, options = {}) {
    super();
    this.name = name;
    this.command = command;
    this.args = args;
    this.options = options;
    this.process = null;
    this.idCounter = 1;
    this.buffer = Buffer.alloc(0);
    this.callbacks = new Map();
    this.isInitialized = false;
    this.capabilities = null;
  }

  /**
   * 启动 LSP 服务进程
   */
  async start() {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.cwd || process.cwd(),
      env: { ...process.env, ...this.options.env }
    });

    return new Promise((resolve, reject) => {
      this.process.stdout.on('data', (data) => this._onData(data));

      this.process.stderr.on('data', (data) => {
        // 仅记录不报错，有些 LSP 会在 stderr 发送调试信息
        // console.log(`[LSP ${this.name} stderr] ${data.toString()}`);
      });

      this.process.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.process.on('exit', (code) => {
        this.emit('exit', code);
        this.isInitialized = false;
      });

      this.process.once('spawn', () => {
        resolve();
      });
    });
  }

  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const str = this.buffer.toString('utf8');
      const contentLengthMatch = str.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!contentLengthMatch) break;

      const headerLength = contentLengthMatch[0].length;
      const contentLength = parseInt(contentLengthMatch[1], 10);

      // 报文长度不足，继续等待
      if (this.buffer.length < headerLength + contentLength) break;

      const messageBody = this.buffer.slice(headerLength, headerLength + contentLength);
      // 移动缓冲区指针
      this.buffer = this.buffer.slice(headerLength + contentLength);

      try {
        const message = JSON.parse(messageBody.toString('utf8'));
        this._handleMessage(message);
      } catch (err) {
        console.error(`[LSP ${this.name}] 报文解析失败:`, err);
      }
    }
  }

  _handleMessage(message) {
    if (message.id !== undefined) {
      const callback = this.callbacks.get(message.id);
      if (callback) {
        this.callbacks.delete(message.id);
        if (message.error) {
          callback.reject(message.error);
        } else {
          callback.resolve(message.result);
        }
      }
    } else if (message.method) {
      this.emit('notification', message);
    }
  }

  /**
   * 发送 LSP 请求
   */
  sendRequest(method, params) {
    if (!this.process) return Promise.reject(new Error("LSP 进程未启动"));
    const id = this.idCounter++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this._write(message);
    });
  }

  /**
   * 发送 LSP 通知
   */
  sendNotification(method, params) {
    if (!this.process) return;
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    this._write(message);
  }

  _write(message) {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    try {
      this.process.stdin.write(header + body);
    } catch (err) {
      console.error(`[LSP ${this.name}] 写入失败:`, err);
    }
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isInitialized = false;
    }
  }
}
