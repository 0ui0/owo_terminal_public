---
name: memory-optimization
overview: 修改 AiAsk.coffee 的消息上限(12→10)和记忆管理(60→100触发总结，保留总结+50条)，降低 token 消耗并提高缓存命中率
todos:
  - id: modify-addask-threshold
    content: 将 addAsk 中 asks 上限从 12 改为 10 (line 290)
    status: pending
  - id: modify-buildmemory-hint
    content: 将 buildMemory 中满额提示阈值从 60 改为 100 (line 344)
    status: pending
  - id: rewrite-rollmemory
    content: "重写 _rollMemory 函数: 阈值 60->100，满额时生成总结并保留总结+最近 50 条 (lines 1407-1489)"
    status: pending
  - id: compile-coffee
    content: 执行 npx coffee -bc 编译 AiAsk.coffee 为 AiAsk.js
    status: pending
    dependencies:
      - modify-addask-threshold
      - modify-buildmemory-hint
      - rewrite-rollmemory
---

修改 AiAsk.coffee 的三个核心阈值和 _rollMemory 逻辑：

1. **asks 上限** 从 12 改为 10 — 减少对话历史携带量
2. **memory 满额提示** 从 60 改为 100 — 匹配新阈值
3. **_rollMemory 重写** — 阈值从 60 改为 100，触发时生成全量总结，保留【新总结 + 最近 50 条笔记】，移除旧的复杂分支逻辑

## 技术方案

### 修改文件

`/Users/lambda/old_lamuda/文稿和桌面/原桌面/owo_terminal/server/tools/aiAsk/AiAsk.coffee`

### 编译

修改后执行 `npx coffee -bc server/tools/aiAsk/AiAsk.coffee`，生成 AiAsk.js

### 三处修改

#### 1. asks 上限 (line 290)

```coffeescript

# 旧:

if (@asks.length + 1) > 12

# 新:

if (@asks.length + 1) > 10

```

#### 2. buildMemory 满额提示 (line 344)
```coffeescript
# 旧:
if @memorys.length >= 60
# 新:
if @memorys.length >= 100
```

#### 3. _rollMemory 重写 (lines 1407-1489)

当前逻辑有两个分支：

- **无总结/总结在首位**：splice 0,2 + 生成全量摘要
- **总结在中间**：shift() 让总结自然左移

新逻辑统一为一种模式：

- 阈值 >= 100 时触发
- 所有 100 条记忆发给 AI 做全量压缩摘要（与当前摘要生成代码一致）
- 生成新总结后，保留【新总结 + 最近 50 条笔记】(splice 掉前 49 条)
- 去掉旧的"总结在中间时 shift"分支

具体代码：
```coffeescript

# 双重滚动总结：超过100条时裁剪并按需生成摘要

_rollMemory:(config)->
return unless @memorys.length > 100

config?.onRollMemory? "start"
try
allContent = @memorys.map((m) =>
if m.isSummary then "[旧总结] #{m.content}" else m.content
).join "\n"

completion = await @openAi.chat.completions.create
model: @aiConfig.model
messages: [
role: "system", content: "你是记忆压缩助手，只输出摘要，不做任何多余对话。"
,
role: "user", content: """
系统即将裁剪你的记忆，为了避免遗忘，请小心谨慎得对下面的记忆笔记做个信息密度极高的压缩，以日记形式呈现。
注意如果总结不到位，你会失忆哦【！！！】
注意事情发生的时间、地点、人物、起因、经过、结果。注意记录任务目标，任务过程和任务完成情况。
要求：

            1. 保留所有关键事实、数字、文件名、决策结论
            2. 删除寒暄、重复内容、过渡语句
            3. 如果已有旧总结，请将旧总结的信息融合进新总结中
            4. 总字数控制在800字以内
            5. 必须以第一人称（我）来记录
范例：时间xxx，今天心情不错，很开心，用户说今天电脑故障了，让我帮忙排查下，我通故终端执行xxx,xxx,xxx等命令，发现xxx...(详细过程和重点)...最后通过xxx帮助用户解决了问题。用户很感谢我，太开心啦！
=== 记忆笔记 ===
#{allContent}
""".trim()
]
max_tokens: 1000
temperature: 0.3

summaryText = completion.choices?[0]?.message?.content?.trim() or ""

if completion.usage
@usage.promptTokens += completion.usage.prompt_tokens or 0
@usage.completionTokens += completion.usage.completion_tokens or 0
@usage.totalTokens += completion.usage.total_tokens or 0
if config?.onTokenChange
await config.onTokenChange this,
promptT: completion.usage.prompt_tokens or 0
completionT: completion.usage.completion_tokens or 0
totalT: completion.usage.total_tokens or 0
cachedT: 0

if summaryText

# 保留最近 50 条，前面全删

spliceStart = @memorys.length - 50
@memorys.splice 0, spliceStart

# 清除旧总结（如果还在）

oldIdx = @memorys.findIndex (m) => m.isSummary
@memorys.splice oldIdx, 1 if oldIdx >= 0

# 推入新总结

@memorys.unshift
id: "summary_#{Date.now()}"
isSummary: true
listId: config.listId or 0
time: new Date().toISOString()
content: "[列表id：#{config.listId or 0}][消息id:summary][时间:#{new Date().toISOString()}]\n【滚动总结】#{summaryText}"

console.log "滚动总结生成成功 (#{summaryText.length}字, #{completion.usage?.total_tokens or '?'}tokens)"
else
console.warn "滚动总结返回为空，跳过插入"

config?.onRollMemory? "done"

catch err
console.error "滚动总结生成失败:", err
config?.onRollMemory? "error"

# 失败时保留最后 50 条，清掉前面的

spliceStart = @memorys.length - 50
@memorys.splice 0, spliceStart
@memorys.unshift
id: "summary_#{Date.now()}"
isSummary: true
time: new Date().toISOString()
content: "记忆总结失败，请使用历史记录工具查询历史消息"
```

### 核心差异说明

| 维度 | 旧逻辑 | 新逻辑 |
| --- | --- | --- |
| 阈值 | 60 | 100 |
| 裁剪后保留 | 60 条（删 2 + 推 1） | 51 条（总结 + 50 条笔记） |
| 触发频率 | ~每 2 轮 | ~每 50 轮 |
| 保留最近内容 | 2 条 | 50 条 |
| 信息丢失 | 每轮损失 ~2 条 | 每 50 轮才损失 ~49 条（较旧内容） |


### 不修改的部分

- buildMemory 中的记忆条目格式（`[列表id][消息id][时间]` 前缀）
- addAsk 中的 tool 孤儿清理逻辑
- exportState / importState 等外部接口
- sendAskByMsgProtocol 中记忆的 push 和 _rollMemory 调用顺序