# AI-KP 外部 Codex 接手文档（2026-03-08）

> 目的：把 `clawd-ai-kp` 当前真实状态、OneBot 路由链路、已验证能力、未接完的缺口、建议修改点整理成一份单文档，方便外部 Codex 直接接着改“真实消息路由 / 接线”等问题，而不需要回看聊天记录。

---

## 1. 项目一句话定义

`AI-KP` 里的 `KP` 指的是 **TRPG / CoC 主持人（Keeper）**，不是普通陪聊机器人。

当前方向已经定死：
- 规则基线：`Call of Cthulhu 7th Edition`
- 架构顺序：**先核心引擎，再插件 / 消息接入层**
- 当前阶段目标：把现有 `core + adapter + http bridge` 从“仓库内可测”推进到“真实 OneBot 消息链路可接”

---

## 2. 当前仓库快照

- 仓库路径：`/home/node/clawd/clawd-ai-kp`
- 当前分支：`main`
- 当前 HEAD：`6f72e12`
- 最近提交序列（节选）：
  - `6f72e12` `docs: add onebot bridge deployment guide`
  - `da4b5b5` `feat: harden onebot bridge event handling`
  - `58f12cb` `feat: add http authoring import endpoints`
  - `54c02bb` `feat: add onebot http bridge`
  - `aa7ae7f` `feat: add onebot runtime event entry`
  - `7119a0d` `feat: add markdown campaign and story pack import`
  - `8cf5c2a` `feat: add markdown scene authoring import`
  - `df55eb3` `feat: add hook-driven story pack framework`
  - `9874812` `feat: add campaign skeleton and onebot campaign panel`
  - `80d0d5f` `docs: add final old church scenario draft`
  - `bf23e6a` `feat: add onebot scene and recap panels`
  - `366ef93` `feat: improve onebot kp reply pacing`
  - `e3dc7cc` `feat: add onebot clue and npc panels`
  - `a9051c5` `feat: add onebot party state controls`
  - `5daa289` `feat: add onebot chargen commands`
  - `0a0aa04` `feat: improve onebot kp command flow`
  - `98049dc` `feat: add onebot single-session adapter`

当前工作树状态：**干净**。

---

## 3. 已经真实存在的模块，不是规划图

### 3.1 OneBot 适配层

关键文件：
- `adapter/onebot/single-session.js`
- `adapter/onebot/runtime.js`
- `adapter/onebot/http-bridge.js`

它们目前已经形成了完整三层：

1. **玩法 / 会话层**：`single-session.js`
   - 管单群 / 单会话状态
   - 车卡、行动、切人、面板、结团
   - 会话落盘
   - 自然语言行动路由进核心引擎

2. **事件标准化层**：`runtime.js`
   - 只接 `post_type=message`
   - 忽略 bot 自己发的消息
   - 清洗 CQ 片段
   - 把 OneBot envelope 转成内部 message event
   - 根据 group/private 构造 `send_group_msg` / `send_private_msg`

3. **HTTP 接线层**：`http-bridge.js`
   - 提供 `POST /onebot/event`
   - 提供 `GET /health`
   - 可选自动回发 OneBot HTTP API
   - 还带作者导入接口：
     - `POST /authoring/import/scene`
     - `POST /authoring/import/campaign`
     - `POST /authoring/import/story-pack`

### 3.2 核心引擎层

关键能力已落地：
- `core/src/check-engine.js`
- `core/src/state-machine.js`
- `core/src/api.js`
- `core/src/scene-loader.js`
- `core/src/scene-action-router.js`
- `core/src/session-storage.js`
- `core/src/character-creation.js`
- `core/src/combat-rules.js`
- `core/src/npc-actions.js`
- `core/src/voice-lines.js`
- `core/src/authoring-validation.js`
- `core/src/scene-markdown-import.js`
- `core/src/campaign-story-markdown-import.js`

### 3.3 已有场景 / campaign / story pack

关键资产：
- `core/data/scenes/old-church-night.scene.json`
- `core/data/campaigns/old-church-arc.campaign.json`
- `core/data/story-packs/old-church-arc-pack.story-pack.json`
- `core/data/npcs/gravedigger.card.json`

### 3.4 文档层

关键文档：
- `README.md`
- `docs/onebot-bridge-deployment.md`
- `docs/old-church-night-final-v0.1.md`
- `docs/story-pack-authoring-v0.1.md`
- `docs/scene-markdown-authoring-template.md`
- `docs/campaign-markdown-authoring-template.md`
- `docs/story-pack-markdown-authoring-template.md`

---

## 4. 当前 OneBot 路由到底怎么走

这是现在代码里的真实路径，不是口头规划。

### 4.1 输入路径

OneBot 原始事件
→ `adapter/onebot/http-bridge.js`
→ `handleOneBotEnvelope(...)` in `adapter/onebot/runtime.js`
→ `handleOneBotMessage(...)` in `adapter/onebot/single-session.js`
→ `processScenarioTurn(...)` / 其他 command handler
→ `core/src/api.js` / scene router / state machine

### 4.2 输出路径

核心结果
→ `single-session.js` 组织回复文本
→ `runtime.js` 按 `group/private` 生成 OneBot send action
→ `http-bridge.js`
  - 若 `autoSendActions=false`：只把 action 返回给调用方
  - 若 `autoSendActions=true`：直接 POST 到 OneBot HTTP API 回发

### 4.3 事件过滤逻辑（当前已做）

在 `runtime.js`：
- 非 `post_type=message`：忽略
- 自己发给自己的回环消息：忽略
- 清洗 CQ 标签：
  - `CQ:at`
  - 其他 `CQ:*`
- 清洗后空消息：忽略

### 4.4 会话与存储逻辑（当前已做）

在 `single-session.js`：
- group 会话 key：`onebot-group-<group_id>`
- private 会话 key：`onebot-dm-<user_id>`
- 默认存储根：`runtime/onebot`
- 会写两个文件：
  - `runtime/onebot/sessions/<conversationKey>.json`
  - `runtime/onebot/meta/<conversationKey>.json`

这意味着：
- 现在已经有 **单群单会话** 的最小持久化
- 但还没有做更细粒度的多团 / 多 campaign / 多线程隔离

---

## 5. 现在能跑什么

### 5.1 指令面

`/aikp` 当前已支持：
- `/aikp help`
- `/aikp start`
- `/aikp reset`
- `/aikp roll <occupationKey>`
- `/aikp quickfire <occupationKey>`
- `/aikp party-roll <occupationKey>`
- `/aikp party-quickfire <occupationKey>`
- `/aikp join`
- `/aikp sheet`
- `/aikp state`
- `/aikp campaign`
- `/aikp hooks`
- `/aikp advance [hookId]`
- `/aikp storypack`
- `/aikp goto <sceneId>`
- `/aikp scene`
- `/aikp recap`
- `/aikp party`
- `/aikp clues`
- `/aikp npcs`
- `/aikp who`
- `/aikp focus <玩家名>`
- `/aikp next`
- `/aikp settle`

### 5.2 自然语言面

只要玩家已经有调查员卡，就能把普通自然语言输入路由到旧教堂场景动作，例如：
- 看祭坛背后的刮痕
- 安抚守墓人并套话
- 之类的探索 / 交谈 / 用道具 / 危险动作

### 5.3 输出面

当前回复已不只是单句结果，通常会拼出：
- 裁定前提示
- 检定结果
- 叙述结果
- 状态变化摘要
- 场上此刻
- 下一步提示
- spotlight 提示

### 5.4 多人团基础

当前已具备：
- `party` 面板
- 当前行动者 / spotlight
- 手动 focus
- next 轮转
- round 计数

但还没有完整处理：
- 晚到加入
- 掉线重回
- 多人同时抢行动
- 更细的权限与冲突裁定

---

## 6. 已验证状态（2026-03-08 实跑）

以下测试已在仓库里直接跑过，全部通过：

```bash
node adapter/onebot/single-session.test.js
node adapter/onebot/runtime.test.js
node adapter/onebot/http-bridge.test.js
node core/src/scene-markdown-import.test.js
node core/src/campaign-story-markdown-import.test.js
node core/src/coc7-validation.test.js
```

通过结果：
- `single-session.test.js`：21/21 pass
- `runtime.test.js`：6/6 pass
- `http-bridge.test.js`：5/5 pass
- `scene-markdown-import.test.js`：1/1 pass
- `campaign-story-markdown-import.test.js`：2/2 pass
- `coc7-validation.test.js`：pass

所以现状不是“概念草图”，而是：
- **仓库内逻辑链已打通**
- **HTTP bridge 能收事件、吐 action、可选自动回发**
- **作者 Markdown 导入也已通**

---

## 7. 真正还没接完的地方

这是外部 Codex 接手时最重要的部分。

### 7.1 最大缺口：还没接进“真实正式消息链”

现在最关键的事实：
- 仓库里的 `runtime + http-bridge` 已经能工作
- 但它还主要停留在“仓库内联调 / 独立 bridge 服务”层
- **还没正式并稳妥地挂进当前实际线上 OneBot 主消息链路**

也就是说，现在缺的不是核心玩法，而是 **路由接线**。

### 7.2 当前链路更像 sidecar，不像正式主路由

现状更像：
- 单独起一个 `http-bridge`
- 外部 OneBot 或中间层把事件 POST 过来
- 再由 bridge 自己选择返回 action 或直接回发

如果要接正式系统，通常会碰到这些问题：
- 谁来决定哪些消息应该进 AIKP，哪些不该进
- `/aikp` 指令和普通聊天怎么分流
- AIKP 激活中的群，普通自然语言是否也该被吃进来
- 如何避免和现有 bot 主逻辑重复消费
- 如何避免 bot 自己消息回环
- 如何处理超长消息、分段、CQ 富文本、图片等
- 如何做 feature flag / 白名单 / 测试群隔离

### 7.3 当前仍偏“单场景 hardcode”

虽然已经有 campaign / story pack 骨架，但当前真实默认仍主要围绕：
- `old-church-night`
- `old-church-arc`

所以如果外部 Codex 改路由，不要误以为这里已经是全自动多剧本平台；它现在更接近：
- 核心框架已出现
- 一个样板场景可跑
- 路由接线刚要进入真环境

### 7.4 场景文档分层还没收完

用户已经确认过一个重要方向：
- 旧教堂文档后续需要拆成
  - 玩家可见版
  - KP 版
  - 系统版

这是为了避免把作者 / keeper / 机关信息直接暴露给玩家。

当前这块还没完全收口。

---

## 8. 如果现在要改“路由”，最该先看的文件

优先级从高到低：

### A. `adapter/onebot/http-bridge.js`
看点：
- HTTP 接口形状
- `POST /onebot/event` 的总入口
- `autoSendActions` 的工作方式
- `dispatchOneBotAction(...)`

适合改：
- 是否保留 bridge 直发
- 是否只返回 action，由外部主链统一发送
- 是否增加鉴权 / 签名 / 白名单 / source 标识
- 是否扩展 debug / trace 字段

### B. `adapter/onebot/runtime.js`
看点：
- OneBot envelope 过滤
- CQ 清洗
- 自己消息回环防护
- 构造 send action

适合改：
- 更多事件兼容
- reply / at / 引用策略
- CQ 保留 / 清洗粒度
- 长消息切片前的标准结构输出
- 更细的 ignore reason

### C. `adapter/onebot/single-session.js`
看点：
- 会话 key 设计
- 状态落盘
- `/aikp` 指令解析
- 自然语言动作入口
- campaign / hooks / goto / advance

适合改：
- 会话隔离策略
- 激活态路由规则
- 多群 / 多团 / 多 campaign 映射
- 更稳的 party / spotlight 规则
- 输出格式拆段

### D. 外部消息主链（不在本仓库）
外部 Codex 如果改的是正式接线路由，最终大概率还要动“主 bot / 主插件”的分发逻辑。

本仓库已经准备好的，是一个可嵌入的处理器链：
- 输入：OneBot message envelope
- 输出：replyText / sendAction / sessionState

但“谁把消息送进来、谁最终发送、怎么做优先级分流”这部分，往往在仓库外。

---

## 9. 推荐的接线思路（偏保守、最稳）

### 方案 1：先保留 bridge，当 sidecar 接入正式主链

做法：
- 正式主消息链收到 OneBot 事件后
- 只把测试群 / 白名单群 / 显式 `/aikp` 消息转发到 AIKP bridge
- 先设 `autoSendActions=false`
- 由主链根据 bridge 返回的 `sendAction` 再统一发送

优点：
- 风险最小
- 不会立刻让 AIKP 抢整个 bot 主路由
- 方便打日志、灰度、回滚

适合：
- 现在就想开始真实联调
- 但还不想让 AIKP 直接拥有最终发送权

### 方案 2：把 runtime / single-session 内嵌进主插件

做法：
- 不走独立 HTTP bridge
- 主插件直接调用 `handleOneBotEnvelope(...)`
- 由主插件拿到返回结果后统一处理发送

优点：
- 结构更干净
- 少一层 HTTP hop
- 更容易和主系统的权限、日志、限流整合

缺点：
- 耦合更深
- 回滚成本稍高
- 需要主插件侧更明确地管理激活条件

### 当前更推荐

如果目标是“先把真实路由接上，别一上来就重构太大”，我更推荐：

**先做方案 1，再视情况收进方案 2。**

原因很现实：
- 现在最值钱的是先验证真实消息链是否通
- 不是先追求架构最漂亮
- bridge 现成可用，拿来做灰度最好

---

## 10. 建议外部 Codex 优先做的改动

### 第一优先级：明确“哪些消息进入 AIKP”

建议至少支持三种门槛之一：
1. 测试群白名单
2. `/aikp ...` 显式指令
3. 已激活会话中的自然语言消息

一个比较稳的规则是：
- 未激活会话：只吃 `/aikp` 指令
- 已激活并已开团的会话：允许自然语言进入 AIKP
- 非白名单群：默认不进入

### 第二优先级：把发送权收回主链

如果正式环境已经有自己的消息发送抽象，建议：
- AIKP bridge / runtime 只负责返回结构化结果
- 主链统一执行 send

也就是尽量减少 `autoSendActions=true` 在正式环境里的使用。

这样更利于：
- 统一日志
- 统一限流
- 统一重试
- 统一错误处理

### 第三优先级：补最小灰度 / 防回环 / debug 能力

建议补：
- group whitelist
- debug trace id
- source tag
- ignore reason 透出
- action preview 模式

### 第四优先级：长消息与多段回复

当前 reply 还是单文本为主。真实群里跑起来后，下一批很可能会撞上：
- 回复过长
- 面板太密
- 多人团连续输出太挤

所以可以预留：
- `replySegments`
- `replyMode`
- 分段发送策略

---

## 11. 当前已知后续 TODO（和这次接手直接相关）

这是用户已经明确过、值得继续推进的主线：

### 路由 / 接线
- [ ] 把 `adapter/onebot/single-session` 真挂入实际消息插件链路，而不是只停在模块可测层

### 文档与内容分层
- [x] 把旧教堂文档拆成：玩家可见版 / KP 版 / 系统版

### 故事推进
- [x] 接出旧教堂后一幕（钟楼 / 地下 / 失踪案）并形成可运行钩子
- [x] 把旧教堂样板补到可完整收束：新增 `钟下密室` 作为 act-3 终幕
- [ ] 把 `advance` 从手动推进继续收成更自动的条件驱动切幕

### 规则与内容库
- [x] 扩职业模板到常用可玩库，并补中文自然语言别名
- [x] 把失败推进 / 推骰风险 / 惩罚骰提示 / 伤势与疯狂后果收成结构化规则库

### 多人团体验
- [ ] 补多人团边缘流程：晚到、掉线重回、spotlight 权限与冲突处理

### 状态呈现
- [ ] 补更完整状态呈现：SAN / 伤势 / 临时异常 / 物品变动等

---

## 12. 外部 Codex 不该误判的几点

### 不是“只有文档，没有代码”
不是。当前已经有：
- 核心引擎代码
- OneBot runtime
- HTTP bridge
- 测试
- authoring import

### 不是“已经完全接到线上了”
也不是。现在主要缺的是：
- 真消息主链整合
- 正式路由分流
- 灰度与防撞逻辑

### 不是“多剧本平台已经完成”
还没。现在更准确地说是：
- 框架已开始通用化
- 旧教堂是当前样板场景
- campaign / story pack 骨架已在，但仍处于推进期

---

## 13. 如果外部 Codex 只想最快开工，最短阅读路径

按这个顺序读就够：

1. `README.md`
2. `docs/onebot-bridge-deployment.md`
3. `adapter/onebot/runtime.js`
4. `adapter/onebot/http-bridge.js`
5. `adapter/onebot/single-session.js`
6. `adapter/onebot/*.test.js`

如果要继续看剧情/框架：
7. `docs/old-church-night-final-v0.1.md`
8. `docs/story-pack-authoring-v0.1.md`
9. `core/src/scene-action-router.js`
10. `core/src/api.js`

---

## 14. 一句话结论

`clawd-ai-kp` 现在最值钱、也最该改的，不再是“有没有 demo”，而是：

**把已经可测的 AIKP OneBot runtime / bridge，稳稳接进真实消息路由。**

核心玩法和样板场景已经足够支撑联调了，下一步的主战场就是：
- 路由分流
- 正式接线
- 灰度策略
- 多人团边缘规则
- 文档可见性分层

---

## 15. 文档生成说明

本文件基于以下真实材料整理：
- 仓库当前文件结构
- 当前 git 提交历史
- `adapter/onebot/*.js` 实际代码
- `docs/onebot-bridge-deployment.md`
- 已跑通的本地测试结果
- 项目长期记忆与最近两日工作记录

如果外部 Codex 要接手“路由 / 真实接线”，这份文档应足够作为第一上下文入口。
