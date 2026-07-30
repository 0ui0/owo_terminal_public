import Joi from "joi"

const GUIDE_MARKDOWN = `# 🎭 角色包制作 (avatarMaker) 程序执行逻辑与流程图

本文档专门为 AI 智能助手提供 5 大制作模式的代码执行逻辑、步骤顺序与数据流向程序框图。

⚠️ **【通用交互规范】**：所有涉及图片生成步骤的模式（如 0a, 0b, 1, 2b），在生成完图片后，必须**暂停执行**并主动询问用户图片效果是否 OK。得到用户肯定答复后再继续执行后续步骤！

---

## 🔄 5 大制作模式程序框图与代码执行逻辑

### 模式 ⓪a：静态半身表情图片 (mode = "0a")

\`\`\`
[ 输入: halfBodyBase + prompt ]
       │
       ▼
 1. avatarMakeImage (baseImagePath: halfBodyBase, prompt: "修改面部表情...")
       │
       ▼
 [ 产出: 静态表情图片 ]
       │
       ▼
 2. ⏸️【暂停询问用户】展示图片路径并向用户确认："表情图片已生成，请检查效果是否 OK？"
\`\`\`

---

### 模式 ⓪b：静态全身动作图片 (mode = "0b")

\`\`\`
[ 输入: fullBodyBase + prompt ]
       │
       ▼
 1. avatarMakeImage (baseImagePath: fullBodyBase, prompt: "设计全身动作姿态...")
       │
       ▼
 [ 产出: 静态全身动作姿态图片 ]
       │
       ▼
 2. ⏸️【暂停询问用户】展示姿态图片路径并向用户确认："全身姿态图片已生成，请检查效果是否 OK？"
\`\`\`

---

### 模式 ①：表情特写到回位视频 (mode = "1")

\`\`\`
[ 输入: fullBodyBase + halfBodyBase + prompt ]
       │
       ├─► 1. avatarMakeImage (baseImagePath: halfBodyBase, prompt: "修改面部表情...")
       │         │
       │         ▼
       │   [ 产出: 表情半身图 ]
       │         │
       │         ▼
       │   2. ⏸️【暂停询问用户】展示表情半身图，询问：“Step 1 表情静态图已完成，请确认效果是否 OK？”
       │         │
       ├─────────┴───(收到用户确认OK后继续)────────────────────────────────┐
       │                                                                  │
       ▼                                                                  ▼
 3. avatarMakeVideo (推进: firstFrame=fullBodyBase, lastFrame=表情半身图)
       │
       ▼
 [ 产出: 临时推进视频 ]
       │
       ├──────────────────────────────────────────────────────────────────┘
       │
       ▼
 4. avatarMakeVideo (拉远: firstFrame=表情半身图, lastFrame=fullBodyBase, concatWith=临时推进视频)
       │
       ▼
 [ 输出产物: 最终自动拼接 WebM 视频 ]
\`\`\`

---

### 模式 ②a：全身微动动作视频 - 首尾相同 (mode = "2a")

\`\`\`
[ 输入: fullBodyBase + prompt ]
       │
       ▼
 1. avatarMakeVideo (微动: firstFrame=fullBodyBase, lastFrame=fullBodyBase, prompt: "全身微动...")
       │
       ▼
 [ 输出产物: 最终成品 WebM 视频 ]
       │
       ▼
 2. ⏸️【暂停询问用户】展示视频并询问用户效果是否满意。
\`\`\`

---

### 模式 ②b：全身过渡动作视频 - 首尾不同 (mode = "2b")

\`\`\`
[ 输入: fullBodyBase + prompt ]
       │
       ▼
 1. avatarMakeImage (baseImagePath: fullBodyBase, prompt: "设计全身新动作姿态...")
       │
       ▼
 [ 产出: 动作姿态尾帧图 ]
       │
       ▼
 2. ⏸️【暂停询问用户】展示姿态尾帧图，询问：“Step 1 全身姿态尾帧图已完成，请确认姿态是否 OK？”
       │
       ▼ (收到用户确认OK后继续)
 3. avatarMakeVideo (过渡: firstFrame=fullBodyBase, lastFrame=动作姿态尾帧图)
       │
       ▼
 [ 输出产物: 最终过渡 WebM 视频 ]
\`\`\`
`

export default {
  name: "获取角色包制作说明文档",
  id: "avatarGetGuide",

  async fn(argObj, metaData) {
    return {
      ok: true,
      msg: "获取角色包制作说明文档成功",
      data: {
        manual: GUIDE_MARKDOWN
      }
    }
  },

  joi() {
    return Joi.object({})
  }
}
