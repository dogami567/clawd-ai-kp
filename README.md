# clawd-ai-kp

AI KP（TRPG 跑团主持）项目仓库。

## 项目目标框架（已确认）

### 1. 项目定位
- `AI-KP` 的 `KP` 指 `TRPG / CoC 主持人（Keeper）`
- 目标不是普通陪聊，而是一个能长期迭代的 `AI 跑团主持系统`
- 当前默认规则基线：`Call of Cthulhu 7th Edition`

### 2. 总体架构
- `core engine`
  - 规则判定
  - 场景状态机
  - 角色卡 / NPC 卡 / 存档
  - 线索、事件、时间推进
  - 软裁定与后果生成
- `adapter / plugin`
  - 接聊天平台消息
  - 把玩家输入路由到核心引擎
  - 处理群号、会话、权限、限流
  - 将结果回发到聊天入口

当前确定路线：
- 先做核心引擎
- 稳定后再包插件接入
- 不把首版实现直接绑死在单一聊天平台上

### 3. 核心体验目标
- 玩家用自然语言行动，KP 尽量都能接住
- 不做生硬空气墙，不轻易直接拒绝
- 离谱操作优先转成世界内后果，而不是机械拦截
- 失败采用 `fail forward`，剧情继续往前走
- 跑团输出要有“桌边感”，不是系统播报器
- 麦麦的口吻要活、有动作感、有一点坏笑，不回到通用 GPT 腔

### 4. 数据建模方向
- `investigator card`：玩家角色卡
- `scene state`：场景状态
- `check event`：检定事件
- `npc card`：NPC 资料卡
  - 外观
  - 财富 / 身上物品
  - 行动规律
  - 警觉度 / 跟踪难度
  - 社交偏好
  - 知识分层

### 5. V0.1 范围（第一阶段）
- 单群 / 单会话跑团
- 基础检定（先以 d100 / CoC 7 为主）
- 角色车卡与派生属性
- NPC 卡读取与基础互动
- 剧情状态记录（人物、线索、事件、时间、危险度）
- 基础动作：探索、交谈、用道具、高风险动作、偷窃、跟踪
- 基础指令/API：开团、入团、行动、查看状态、结束

## 目录规划（草案）
- `docs/` 设计文档与里程碑
- `core/` 跑团核心引擎（规则、状态机、记忆）
- `adapter/` 聊天平台适配层（后续接插件）
- `assets/` 剧本与图片资源

当前已落地一版最小适配层：
- `adapter/onebot/single-session.js`：OneBot 单群/单会话入口胶水

## 已固化流程
- CoC 玩家全流程场景（V0.1）：`docs/coc-player-flow-v0.1.md`

## 当前进展（已落地）
- CoC7 规则入口固定：`docs/rules-reference.md`
- CoC 玩家流程固化：`docs/coc-player-flow-v0.1.md`
- V0.1 最小规则清单：`docs/coc7-v0.1-rules-minimum.md`
- 决策摘要沉淀：`docs/ai-kp-decision-summary-2026-03-06.md`
- 三套核心 Schema：
  - `core/schemas/investigator-card.schema.json`
  - `core/schemas/scene-state.schema.json`
  - `core/schemas/check-event.schema.json`
- 已验证可运行的最小骨架：
  - `core/src/check-engine.js`（d100 检定、成功等级、对抗、bonus/penalty dice）
  - `core/src/state-machine.js`（会话状态、fail-forward、战斗/SAN/结算）
  - `core/src/demo.js`（最小流程演示，已本地跑通）

## 运行 demo
```bash
cd /home/node/clawd/clawd-ai-kp
node core/src/demo.js
node core/src/api-demo.js
node core/src/adjudication-demo.js
node core/src/voice-demo.js
node core/src/scene-demo.js
node core/src/npc-action-demo.js
node core/src/coc7-validation.test.js
```

当前 demo 已覆盖：
- Quick-Fire 车卡
- 基于 CoC7 的职业技能点 / 兴趣点预算校验
- 基于职业模板的 `Credit Rating` 范围校验
- 派生属性计算（HP / MP / SAN / Build / Damage Bonus / MOV）
- 物品时代校验与条件化许可
- 检定 -> fail-forward -> bonus/penalty dice -> 战斗一轮 -> SAN -> 结团
- 命令式 API 外壳（建角 / 开团 / 入团 / 提交行动 / 查状态 / 结团 / 时间推进 / session 落盘与回读）
- 轻量 schema 校验（调查员卡 / 场景状态 / 检定事件 / session state）
- 结团摘要会带线索统计、NPC 后效、未结算倒计时
- 动作裁定层（`explore / talk / use_item / risky_action / steal / follow`）
- 偷窃 / 跟踪的延迟后果倒计时（失物发现、路线变化、警觉上升）
- 单幕场景 demo（旧教堂、守墓人、祭坛、线索链、危险节点）
- 可复用场景包：`core/data/scenes/old-church-night.scene.json`
- 旧教堂场景自然语言动作路由：`core/src/scene-action-router.js`
- OneBot 单群单会话胶水层：`adapter/onebot/single-session.js`
- 正式车卡流已接入 OneBot：支持单人 `/aikp roll`、`/aikp quickfire` 与批量 `/aikp party-roll`
- 多人团状态已接入 OneBot：支持 `/aikp party`、`/aikp who`、`/aikp focus`、`/aikp next`
- 多人团当前会显示 `round + current spotlight`，方便群里轮流推进
- OneBot 现在还有独立 `线索面板 / NPC 面板 / 场景环境面板 / 阶段总结`
- 行动回包已开始带 `状态变化 / 场上此刻 / 可选下一步 / 当前 spotlight` 的收尾句
- 旧教堂正式单幕稿：`docs/old-church-night-final-v0.1.md`
- Campaign 骨架已落地：`core/data/campaigns/old-church-arc.campaign.json`
- Story Pack 骨架已落地：`core/data/story-packs/old-church-arc-pack.story-pack.json`
- Campaign 现在支持 `hooks / advance / goto` 三种推进方式，用于验证多幕衔接
- 作者输入格式说明：`docs/story-pack-authoring-v0.1.md`
- 作者格式校验已接入 loader：`core/src/authoring-validation.js`

## 下一步
1. 把 `advance` 从手动推进升级成更自动的 hook/条件驱动切幕
2. 把 story pack / campaign / scene 作者输入格式继续稳定下来
3. 把这套通用框架接进真实消息链，而不是只停在 adapter 模块测试层
