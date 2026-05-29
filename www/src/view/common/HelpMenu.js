import m from "mithril"
import Box from "./box.js"
import { trs } from "./i18n.js"

export default {
  view() {
    return m(Box, {
      style: {
        overflowWrap: "break-word",
        wordBreak: "break-all",
        whiteSpace: "wrap",
      }
    }, m.trust(trs("输入栏/帮助/模式说明", {
      cn: `
      <b>工具调用模式对比（共 5 种）</b>
      <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; border: 1px solid #555;">
        <tr style="background: #444; color: #fff;">
          <th style="border: 1px solid #555; padding: 4px;">模式</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonSchema</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonObject</th>
          <th style="border: 1px solid #555; padding: 4px;">响应格式</th>
          <th style="border: 1px solid #555; padding: 4px;">核心特征与主要用途（通俗指南）</th>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">1. 提示词模式</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px;">纯 JSON 字符串</td>
          <td style="border: 1px solid #555; padding: 4px;">使用纯文本来模仿工具调用。主要用于给那些不支持原生工具调用（Function Call）的旧模型或轻量模型进行兼容兜底。</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">2. 标准工具模式</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON 字符串 + 原生 tool_calls</td>
          <td style="border: 1px solid #555; padding: 4px;">AI 使用大模型官方标准的工具调用方式。<b>不需要记录笔记（note）和任务清单（tasks）</b>，专注于极速执行工具，非常适合日常问答和执行单次独立任务。</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;"><b>3. 宅喵工具模式</b></td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON 字符串</td>
          <td style="border: 1px solid #555; padding: 4px;">系统的招牌主打模式！强制 AI 回复结构化的 JSON 报文，深度融合了“记忆笔记”和“任务管理”系统，极大提高 AI 自主解决复杂工程任务的成功率。<b>★ 推荐现代主力模型（如 Qwen3.7-Max, Claude 3.5 Sonnet）首选。</b></td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">4. 原生外壳模式</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON 字符串</td>
          <td style="border: 1px solid #555; padding: 4px;">把<b>自定义的 JSON 结构回复</b>嫁接到<b>大模型的原生工具调用（sendTemplate）</b>上。利用官方的原生外壳去严格包裹和规范 AI 的输出，能有效防止 AI 满嘴跑火车或输出杂乱废话，适合需要极致结构化的严谨场景。</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">5. 编程模式</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">Markdown + &lt;extJsonConfig&gt;</td>
          <td style="border: 1px solid #555; padding: 4px;">AI 可以自由倾泻漂亮的 Markdown 文本（如代码块、图表等）。工具调用则作为特定配置标签隐藏在正文中。因为<b>没有繁琐的强校验约束</b>，大模型回复<b>速度极快</b>，且<b>非常适合用于大规模、流水线式地连续执行复杂任务</b>（如批量文件编辑与深度代码重构）。</td>
        </tr>
      </table>
      `,
      en: `
      <b>Tool Mode Comparison (5 Modes)</b>
      <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; border: 1px solid #555;">
        <tr style="background: #444; color: #fff;">
          <th style="border: 1px solid #555; padding: 4px;">Mode</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonSchema</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonObject</th>
          <th style="border: 1px solid #555; padding: 4px;">Response Format</th>
          <th style="border: 1px solid #555; padding: 4px;">Core Features & Primary Use Cases (Friendly Guide)</th>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">1. Prompt</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px;">Pure JSON string</td>
          <td style="border: 1px solid #555; padding: 4px;">Uses plain text to simulate tool calls. Mainly used as a fallback compatibility layer for older or smaller models lacking native Function Call.</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">2. Standard</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON string + native tool_calls</td>
          <td style="border: 1px solid #555; padding: 4px;">AI calls tools via the official native API. <b>No memory notes (note) or task lists (tasks) required</b>. Focuses on rapid tool execution, ideal for everyday Q&A.</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;"><b>3. OwO Tools</b></td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON string</td>
          <td style="border: 1px solid #555; padding: 4px;">The flagship mode! Forces AI to respond in a structured JSON schema, deeply integrating memory notes and task management to boost complex task success rates. <b>★ Recommended for modern main models (e.g., Qwen3.7-Max, Claude 3.5 Sonnet)</b>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">4. Native Wrapper</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✓</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">JSON string</td>
          <td style="border: 1px solid #555; padding: 4px;">Grafts the <b>custom JSON structured response</b> onto the <b>model's native tool call (sendTemplate)</b>. Uses the official native wrapper to strictly regulate and standardize AI output, preventing unnecessary filler text.</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">5. Coding</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✗</td>
          <td style="border: 1px solid #555; padding: 4px;">Markdown + &lt;extJsonConfig&gt;</td>
          <td style="border: 1px solid #555; padding: 4px;">AI is free to output beautiful Markdown (such as code blocks and tables). Tool calls are neatly tucked inside tags in the main text. Because <b>there is no strict schema validation</b>, the model responds <b>extremely fast</b> and is <b>ideal for executing large-scale, continuous pipeline tasks</b> (e.g., batch file editing).</td>
        </tr>
      </table>
      `
    }).trim()))
  }
}
