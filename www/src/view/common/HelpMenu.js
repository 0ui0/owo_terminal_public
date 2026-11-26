import m from "/@npm/mithril.js"
import Box from "./box.js"
import getSize from "./getSize.js"
import { trs } from "./i18n.js"

// 表头
const headerArr = [
  { key: "帮助/模式/表头/模式", label: { cn: "模式", en: "Mode" } },
  { key: "帮助/模式/表头/schema", label: { cn: "jsonSchema", en: "jsonSchema" } },
  { key: "帮助/模式/表头/object", label: { cn: "jsonObject", en: "jsonObject" } },
  { key: "帮助/模式/表头/格式", label: { cn: "响应格式", en: "Response Format" } },
  { key: "帮助/模式/表头/说明", label: { cn: "核心特征与主要用途（通俗指南）", en: "Core Features & Primary Use Cases (Friendly Guide)" } }
]

// 5 种工具调用模式
const modeRowArr = [
  {
    nameKey: "帮助/模式/1/名称",
    name: { cn: "1. 提示词模式", en: "1. Prompt" },
    schema: "✗",
    object: "✓",
    formatKey: "帮助/模式/1/格式",
    format: { cn: "纯 JSON 字符串", en: "Pure JSON string" },
    descKey: "帮助/模式/1/说明",
    desc: {
      cn: "使用纯文本来模仿工具调用。主要用于给那些不支持原生工具调用（Function Call）的旧模型或轻量模型进行兼容兜底。",
      en: "Uses plain text to simulate tool calls. Mainly used as a fallback compatibility layer for older or smaller models lacking native Function Call."
    }
  },
  {
    nameKey: "帮助/模式/2/名称",
    name: { cn: "2. 标准工具模式", en: "2. Standard" },
    schema: "✗",
    object: "✗",
    formatKey: "帮助/模式/2/格式",
    format: { cn: "JSON 字符串 + 原生 tool_calls", en: "JSON string + native tool_calls" },
    descKey: "帮助/模式/2/说明",
    desc: {
      cn: "AI 使用大模型官方标准的工具调用方式。<b>不需要记录笔记（note）和任务清单（tasks）</b>，专注于极速执行工具，非常适合日常问答和执行单次独立任务。",
      en: "AI calls tools via the official native API. <b>No memory notes (note) or task lists (tasks) required</b>. Focuses on rapid tool execution, ideal for everyday Q&A."
    }
  },
  {
    nameKey: "帮助/模式/3/名称",
    name: { cn: "3. 宅喵工具模式", en: "3. OwO Tools" },
    isBold: true,
    schema: "✓",
    object: "✗",
    formatKey: "帮助/模式/3/格式",
    format: { cn: "JSON 字符串", en: "JSON string" },
    descKey: "帮助/模式/3/说明",
    desc: {
      cn: "系统的招牌主打模式！强制 AI 回复结构化的 JSON 报文，深度融合了“记忆笔记”和“任务管理”系统，极大提高 AI 自主解决复杂工程任务的成功率。<b>★ 推荐现代主力模型（如 Qwen3.7-Max, Claude 3.5 Sonnet）首选。</b>",
      en: "The flagship mode! Forces AI to respond in a structured JSON schema, deeply integrating memory notes and task management to boost complex task success rates. <b>★ Recommended for modern main models (e.g., Qwen3.7-Max, Claude 3.5 Sonnet)</b>."
    }
  },
  {
    nameKey: "帮助/模式/4/名称",
    name: { cn: "4. 原生外壳模式", en: "4. Native Wrapper" },
    schema: "✓",
    object: "✗",
    formatKey: "帮助/模式/4/格式",
    format: { cn: "JSON 字符串", en: "JSON string" },
    descKey: "帮助/模式/4/说明",
    desc: {
      cn: "把<b>自定义的 JSON 结构回复</b>嫁接到<b>大模型的原生工具调用（sendTemplate）</b>上。利用官方的原生外壳去严格包裹和规范 AI 的输出，能有效防止 AI 满嘴跑火车或输出杂乱废话，适合需要极致结构化的严谨场景。",
      en: "Grafts the <b>custom JSON structured response</b> onto the <b>model's native tool call (sendTemplate)</b>. Uses the official native wrapper to strictly regulate and standardize AI output, preventing unnecessary filler text."
    }
  },
  {
    nameKey: "帮助/模式/5/名称",
    name: { cn: "5. 编程模式", en: "5. Coding" },
    schema: "✗",
    object: "✗",
    formatKey: "帮助/模式/5/格式",
    format: { cn: "Markdown + &lt;extJsonConfig&gt;", en: "Markdown + &lt;extJsonConfig&gt;" },
    descKey: "帮助/模式/5/说明",
    desc: {
      cn: "AI 可以自由倾泻漂亮的 Markdown 文本（如代码块、图表等）。工具调用则作为特定配置标签隐藏在正文中。因为<b>没有繁琐的强校验约束</b>，大模型回复<b>速度极快</b>，且<b>非常适合用于大规模、流水线式地连续执行复杂任务</b>（如批量文件编辑与深度代码重构）。",
      en: "AI is free to output beautiful Markdown (such as code blocks and tables). Tool calls are neatly tucked inside tags in the main text. Because <b>there is no strict schema validation</b>, the model responds <b>extremely fast</b> and is <b>ideal for executing large-scale, continuous pipeline tasks</b> (e.g., batch file editing)."
    }
  }
]

export default {
  view() {
    return m(Box, {
      style: {
        overflowWrap: "break-word",
        wordBreak: "break-all",
        whiteSpace: "wrap"
      }
    }, [
      m("b", trs("帮助/模式/标题", {
        cn: "工具调用模式对比（共 5 种）",
        en: "Tool Mode Comparison (5 Modes)"
      })),
      m("table", {
        style: {
          width: "100%",
          borderCollapse: "collapse",
          margin: `${getSize(3)}rem 0`,
          fontSize: `${getSize(3)}rem`,
          border: `${getSize(0.25)}rem solid #555`
        }
      }, [
        m("tr", headerArr.map((headerObj) => m("th", {
          key: headerObj.key,
          style: {
            border: `${getSize(0.25)}rem solid #555`,
            padding: `${getSize(1)}rem`,
            textAlign: "left",
            verticalAlign: "top"
          }
        }, trs(headerObj.key, headerObj.label)))),
        modeRowArr.map((rowObj) => m("tr", {
          key: rowObj.nameKey
        }, [
          m("td", {
            style: {
              border: `${getSize(0.25)}rem solid #555`,
              padding: `${getSize(1)}rem`,
              verticalAlign: "top",
              fontWeight: rowObj.isBold ? "bold" : "normal"
            }
          }, trs(rowObj.nameKey, rowObj.name)),
          m("td", {
            style: {
              border: `${getSize(0.25)}rem solid #555`,
              padding: `${getSize(1)}rem`,
              textAlign: "center"
            }
          }, rowObj.schema),
          m("td", {
            style: {
              border: `${getSize(0.25)}rem solid #555`,
              padding: `${getSize(1)}rem`,
              textAlign: "center"
            }
          }, rowObj.object),
          m("td", {
            style: {
              border: `${getSize(0.25)}rem solid #555`,
              padding: `${getSize(1)}rem`,
              verticalAlign: "top"
            }
          }, trs(rowObj.formatKey, rowObj.format)),
          m("td", {
            style: {
              border: `${getSize(0.25)}rem solid #555`,
              padding: `${getSize(1)}rem`,
              verticalAlign: "top"
            }
          }, m.trust(trs(rowObj.descKey, rowObj.desc)))
        ]))
      ])
    ])
  }
}
