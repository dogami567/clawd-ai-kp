# clawd-ai-kp

AI KP（TRPG 跑团主持）项目仓库。

## 目标
- 做一个可持续运营的 AI KP 核心能力
- 支持剧本驱动、状态记忆、规则检定、资源调用
- 先做最小可跑版本，再逐步增强

## V0.1 范围（第一阶段）
- 单群/单会话跑团
- 基础检定（d100 / d20 / 自定义）
- 剧情状态记录（人物、线索、事件进度）
- 基础指令：开团、入团、检定、查看状态、结束

## 目录规划（草案）
- `docs/` 设计文档与里程碑
- `core/` 跑团核心引擎（规则、状态机、记忆）
- `adapter/` 聊天平台适配层（后续接插件）
- `assets/` 剧本与图片资源

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
  - `core/src/check-engine.js`（d100 检定、成功等级、对抗）
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
```

当前 demo 已覆盖：
- Quick-Fire 车卡
- 职业模板读取
- 派生属性计算（HP / MP / SAN / Build / Damage Bonus / MOV）
- 物品时代校验与条件化许可
- 检定 -> fail-forward -> 战斗一轮 -> SAN -> 结团
- 命令式 API 外壳（建角 / 开团 / 入团 / 提交行动 / 查状态 / 结团）
- 动作裁定层（`explore / talk / use_item / risky_action`）
- 单幕场景 demo（旧教堂、守墓人、祭坛、线索链、危险节点）

## 下一步
1. 把 `core/src` 封装成命令式 API（开团/入团/行动/检定/状态/结团）
2. 接 OneBot 指令路由（先打通单群单会话）
3. 增加 JSON Schema 校验与落盘存档
