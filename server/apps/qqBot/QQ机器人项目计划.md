# QQ 机器人 (QQBot) 迁移与重构计划书
> 首先，先阅读app开发指南。【前提】app和主系统尽可能完全隔离，app要自己做数据存储。我建议和主系统一样，使用记事本的打开、保存、另存为的方式来保存配置数据。关闭app要提示是否保存。（当然这些逻辑是app内部自带的，不和主系统耦合）。【目标】然后，我们的目标如下。1完全引入qqBotServer，在app启动的时候初始化 2完全引入botMsgCenter，但是对于里面读取系统配置的部分做单独处理。无需改变其中的逻辑。这个作为消息发送中心。3完全引入qqBotOnline，我们要同时支持QQ官方机器人 。完全引入botCmds目录和aiAsk。，但是cmd_aiAsk需要做改造。【改造部分】

1.唯一和主系统耦合的部分是ai，主系统有创建子智能体的函数——没错，我一提你可能就想到了。甚至子智能体还有现成的消息列表和前端显示UI！

我们要做的是，根据app后台的配置（后台配置格式我建议和o-o.space项目完全一致，包括字段名，有另外追加的内容后续再说），为每个群聊单独创建一个子智能体，以此来替代cmd_aiAsk里面的单体实例。

app启动后会根据app的后台配置（包括开关）等，自动开始初始化对应的智能体

请注意，我们的aiAsk.coffee消息列表的设计，从一开始就是支持多用户的，所以和旧版一样，在send开头add不同用户的消息就行（不过这次我们要在开头做个路由了，不能就一行代码，一股脑儿全add到一个模型里面了）
对了，我们暂时不对私聊做支持，所以私聊部分暂时不处理任何逻辑

还要注意的是，这里的子智能体，要去掉大部分的可用工具。基本上我们要为它重新设计专属工具。默认情况下，不给工具好了，这里我们再后续app完成了再讨论。单独准备一个目录放专属工具。

【关于add要注意 主系统的ui渲染走的是comData->chatlist和ai的asks是分离的（参考ioapi_chat里面如何同步这2部分），如果这里单独只add到模型里，ui是没有东西的，所以这里要做到如何在不发起ai的情况下维护2个列表】

那app的界面会显示什么呢。

子智能体的列表。每个列表都允许点击一个按钮【查看会话】
此时耦合的地方来了。

主系统前台也支持弹窗显示智能体列表的，于是基本逻辑是一样的，点击按钮，弹出主系统的那个子智能体聊天窗口

注意子智能体的聊天记录是保存在主系统存档内的。

——

既然是子智能体。那么，系统主ai当然支持向这个子智能体ai发起消息，这是系统默认功能


根据以上需求，全面调查，并创建ide下的plan.md，等我审核


本计划旨在将 `o-o.space` 项目的 QQ 机器人模块迁移至 `owo_terminal`，并基于主系统的“子智能体”架构进行重构，实现“一群一智能体”的物理隔离与深度集成。

## 1. 核心设计原则

*   **完全隔离**：App 拥有独立的配置文件（`.json`），支持打开、保存、另存为。不直接读写主系统的 `tb_options`。
*   **子智能体化**：每个 QQ 群或频道对应一个 `owo_terminal` 子智能体，拥有独立的记忆（`asks`）和 UI 列表（`chatLists`）。
*   **路由驱动**：通过 `groupId` / `channelId` 映射到主系统的 `listId`，实现消息精准路由。
*   **隐私优先**：默认不处理私聊消息，确保主系统逻辑不被干扰。

## 2. 目录结构预览

```text
/server/apps/qqBot/
├── app.json                # App 注册信息
├── backend.js              # 后端入口：WS 连接、子智能体管理、消息中心
├── frontend.js             # 前端入口：Metro UI 管理面板
├── lib/
│   ├── qqBotServer.js      # OneBot WS 协议封装 (ESM 重构版)
│   ├── qqBotOnline.js      # QQ 官方机器人 API 封装 (ESM 重构版)
│   ├── msgCenter.js        # 消息路由逻辑中心
│   ├── configManager.js    # 独立配置管理（打开/保存逻辑）
│   └── botCmds/            # 机器人指令集 (移植自旧项目)
│       ├── botCmd_aiAsk.js # AI 聊天触发逻辑 (重构版)
│       └── ...
└── tools/
    └── agentTools/         # 子智能体专用工具集 (独立目录)
```

## 3. 核心逻辑流程

### 3.1 启动与初始化
1.  `backend.js` 启动后，调用 `configManager.loadDefault()` 加载 App 配置。
2.  初始化 `qqBotServer` (连接 OneBot) 和 `qqBotOnline` (连接官方 API)。
3.  遍历配置中的群列表：
    *   检查 `comData.data.chatLists` 是否存在对应的 `listId`。
    *   如果不存在，调用 `createAgent` 逻辑创建新的列表项和 `AiAsk` 实例。
    *   将实例注册到 `subAgents` 容器中。

### 3.2 消息处理链路 (msgCenter.js)
1.  **接收消息**：OneBot/官方 API 推送消息。
2.  **路由查找**：
    *   群消息 -> 根据 `group_id` 查找配置中的 `listId`。
    *   如果没找到且配置允许自动加入 -> 执行“初始化子智能体”流程。
3.  **UI 同步**：
    *   构造 `chat` 对象，设置 `chatListId: listId`。
    *   调用 `io.emit("chat", chat)` 让主系统前台渲染。
    *   调用 `chats.add(chat, listId)` 持久化到主系统存档。
4.  **记忆注入**：
    *   调用 `subAgents.get(listId).addAsk(...)` 更新 AI 上下文。
5.  **指令匹配**：
    *   遍历 `botCmds`。如果是 AI 触发指令（如 `>>`）：
        *   调用 `subAgent.sendAskByMsgProtocol(...)` 启动思考。
        *   流式回复通过 `getMsgProtocalConfig` 自动同步到 UI。

## 4. UI 功能规划 (Metro UI)

*   **状态概览**：WS 连接状态、当前在线机器人信息。
*   **智能体列表**：
    *   显示“群名 - 列表 ID - 智能体名称”。
    *   **按钮 [查看会话]**：点击后调起 `agentWindow:open` 事件，直接打开主系统的聊天窗口。
*   **配置管理**：直角扁平化的文本域和开关，支持修改后“保存配置”。

## 5. 开发步骤 (Phases)

1.  **Phase 1: 环境搭建**
    *   创建目录结构。
    *   重构 `qqBotServer.js` 和 `qqBotOnline.js` 为 ESM 模块。
2.  **Phase 2: 路由与子智能体集成**
    *   实现 `configManager` 独立存储逻辑。
    *   编写 `msgCenter.js` 路由分发器。
    *   实现自动创建/获取 `chatList` 的 Helper 函数。
3.  **Phase 3: 指令与 AI 改造**
    *   移植 `botCmds`。
    *   重构 `botCmd_aiAsk.js`，使其从单例模式切换为 `subAgents` 模式。
4.  **Phase 4: UI 开发**
    *   使用 Mithril 编写 Metro 风格的管理面板。
    *   对接 `agentWindow:open` 事件。

## 6. 待确认细节 (Audit Items)

*   [ ] **Token 统计**：新版是否需要沿用旧版的 Token 计费逻辑？（建议先跑通逻辑，后期再加）。
*   [ ] **工具限制**：确定哪些 `crossFuncs` 应该开放给机器人子智能体。

---
*Created by Antigravity AI for 啦沐达*
