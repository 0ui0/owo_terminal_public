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
      <b>工具调用模式对比</b>
      <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; border: 1px solid #555;">
        <tr style="background: #444; color: #fff;">
          <th style="border: 1px solid #555; padding: 4px;">模式</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonSchema</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonObject</th>
          <th style="border: 1px solid #555; padding: 4px;">工具调用方式</th>
          <th style="border: 1px solid #555; padding: 4px;">适配场景</th>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">1. 提示词 (Prompt)</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✅</td>
          <td style="border: 1px solid #555; padding: 4px;">提示词模拟 (sysCalls)</td>
          <td style="border: 1px solid #555; padding: 4px;">不支持原生工具调用的旧模型</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">2. 标准工具 (Standard)</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px;">原生工具 (Function Call)</td>
          <td style="border: 1px solid #555; padding: 4px;">不支持 Native Tool 与结构化输出同时开启的模型</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;"><b>3. 宅喵工具 (OwO)</b></td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✅</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px;">原生工具 (Function Call)</td>
          <td style="border: 1px solid #555; padding: 4px;">支持 JSONSchema 的现代主流模型 <b>(推荐)</b></td>
        </tr>
      </table>
      <hr style="border:0; border-top:1px solid #444; margin: 10px 0;">
      <b>1. 提示词模式</b>：完全使用提示词配合 jsonObject + Joi 校验完成任务。工具说明由提示词实现。适合不支持原生工具调用功能的大模型。
      <br><br>
      <b>2. 标准工具模式</b>：使用原生工具调用。提示词限定正文回复 JSON 格式（不使用 jsonObject 或 JsonSchema，仅使用提示词让 AI 回复 JSON + Joi 校验）。适合支持原生工具调用的大模型，解决了部分模型无法同时使用原生工具与结构化输出的问题。<b>系统已对协议序列进行深度优化：若 JSON 格式有误但发起了工具，系统会自动拦截并引导 AI 修复，确保不触发 400 错误。</b>
      <br><br>
      <b>3. 宅喵工具模式</b>：完全使用 JSONSchema + Joi 校验实现工具调用。工具说明由 JSONSchema 提供。使用系统自有协议，需要大模型支持 JSONSchema 功能。<b>【推荐使用宅喵工具模式】</b>
      `,
      en: `
      <b>Tool Mode Comparison</b>
      <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; border: 1px solid #555;">
        <tr style="background: #444; color: #fff;">
          <th style="border: 1px solid #555; padding: 4px;">Mode</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonSchema</th>
          <th style="border: 1px solid #555; padding: 4px;">jsonObject</th>
          <th style="border: 1px solid #555; padding: 4px;">Call Method</th>
          <th style="border: 1px solid #555; padding: 4px;">Scenario</th>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">1. Prompt</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✅</td>
          <td style="border: 1px solid #555; padding: 4px;">Prompt Simulation (sysCalls)</td>
          <td style="border: 1px solid #555; padding: 4px;">Models without native tool call support</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;">2. Standard</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px;">Native Function Call</td>
          <td style="border: 1px solid #555; padding: 4px;">Models with native tool vs structured output conflict</td>
        </tr>
        <tr>
          <td style="border: 1px solid #555; padding: 4px;"><b>3. OwO</b></td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">✅</td>
          <td style="border: 1px solid #555; padding: 4px; text-align: center;">-</td>
          <td style="border: 1px solid #555; padding: 4px;">Native Function Call</td>
          <td style="border: 1px solid #555; padding: 4px;">Modern models with JSONSchema support <b>(Recommended)</b></td>
        </tr>
      </table>
      <hr style="border:0; border-top:1px solid #444; margin: 10px 0;">
      <b>1. Prompt Mode</b>: Works via prompts with jsonObject + Joi validation. Tool descriptions are provided in the prompts. Best for models without native tool call support.
      <br><br>
      <b>2. Standard Mode</b>: Uses native tools. Response format restricted by prompts (no jsonObject/jsonSchema). Solves simultaneous tool/JSON output issues. <b>System has been optimized to intercept format errors when tools are called to prevent 400 errors.</b>
      <br><br>
      <b>3. OwO Tools</b>: Fully powered by JSONSchema + Joi. Tool descriptions provided by the JSONSchema. Requires models with JSONSchema support (e.g., GPT-4o). <b>[Recommended]</b>
      `
    }).trim()))
  }
}
