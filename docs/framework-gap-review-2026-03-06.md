# AI-KP 框架缺口复核（2026-03-06）

## 这轮已补上的低风险项

### 已实现
- `core/src/state-effects.js`
  - 交涉动作现在区分 `persuade / charm / intimidate / bribery`
  - 为 NPC 增加可持续后效状态：`suspicion / fear / affinity / obligation / flags / lastInteractionStyle`
- `core/src/content-effects.js`
  - 四种社交方式现在会给出不同的信息释放口径与后续关系提示
  - `charm` 不再只是技能名占位，而是明确走“先软化、再为后续交涉创造窗口”的路线
  - `intimidate` 成功会更容易撬口，但会留下敌意与暴露代价
  - `bribery` 成功会形成交易/要价后果，失败会触发被冒犯的反应
- `core/src/character-creation.js`
  - 补了传统随机属性生成：`3D6x5` / `(2D6+6)x5` / `Luck 3D6x5`
  - 补了职业点/兴趣点预算字段 `pointBudgets`
  - 保留原 Quick-Fire，同时支持 `traditional_random`
- `core/schemas/scene-state.schema.json`
  - 为场景中的 NPC 追加 `socialState`
- `core/schemas/check-event.schema.json`
  - 为新的状态变更操作补充 `shift / npcId / field`

## 文档里已写、但代码仍未完整覆盖的部分

### 车卡与角色生成
- **技能分配约束** 已补基础校验
  - 现在会基于 `pointBudgets` 校验 `occupationPointsSpent / interestPointsSpent`
  - 同时校验 `value = baseValue + occupation + interest`，避免点数账不平
  - 仍未接完整基础技能默认值表，因此当前推荐在输入技能时显式带 `baseValue`
- **年龄修正** 未实现
  - `MOV` 年龄修正未接
  - 年龄相关 EDU / Luck / 属性调整未接
- **完整随机生成功能** 还差最后一层封装
  - 目前有底层传统随机属性生成，但没有完整的“随机生成角色卡 API / demo 流程”

### 数值约束与规则限制
- **Credit Rating 范围校验** 已落地
  - `createCharacter` 现在会按职业模板的 `creditRatingRange` 拦截超界输入
  - 当前规则基线按 CoC7 v0.1：若职业模板已定义范围，则创建阶段必须满足该范围
- **技能值上下限与默认值表** 已补最小基础表
  - 已为 v0.1 常用技能接入基础默认值（如 `Spot Hidden 25`、`Listen 20`、`Persuade 10`）
  - `Dodge` 按 `DEX/2` 自动求，`Own Language` 按 `EDU` 自动求
  - 目前仍未补完整职业建议技能最低保障与全技能大全
- **伤害骰/武器表** 仍是极简占位
  - 只支持演示级 `baseDamage + damageBonus`
  - 没有武器数据表、射程、故障值、贯穿等

### 社交 / NPC / 场景
- **NPC 卡 schema 与 JSON 数据** 还可继续增强
  - 目前后效状态主要存在于运行态，不在 NPC 原始 card 中持久化
  - 若后面要做跨场景持续关系，需要单独的 `npc runtime state` 存档结构
- **跟踪 / 偷窃后的延迟后果** 已补最小倒计时版
  - 偷窃成功后会延迟触发“失物发现”
  - 偷窃失败后会延迟触发“越想越不对并清点物品”
  - 跟踪失败后会延迟触发“确认被跟、改路线、警觉上升”
  - 跟踪成功后会挂上后续路线切换倒计时，便于后面继续接时间推进
- **动态援军到达** 仍未实现
  - 文档已要求根据时间线和前置行动调整到场回合
  - 代码里还没有 countdown 驱动逻辑

### 检定与裁定
- **暗投接口只是模式标记**
  - `mode: hidden` 已存在
  - 但没有真正区分“玩家可见文本”和“KP 内部日志”两层输出
- **失败推进菜单** 还没形成统一模板库
  - 现在是若干固定字符串
  - 缺少按动作类型/场景危险度/NPC 特性拼装的模块化后果表
- **对抗细化** 仍然较薄
  - 目前比较成功等级 + 掷骰大小
  - 还没接 build/体型、特殊战斗交互、复杂对抗叙事

### SAN / 战斗 /存档
- **SAN 异常状态** 仅有最小标签
  - 尚未按阈值自动施加短时疯狂、临时症状模板
- **重大伤与濒死流程** 未实现
- **结团存档** 还没包含 NPC 社交后效与时间线摘要细化

## 按 CoC7 v0.1 范围，下一批最值得直接编码的项

### P0：非常适合下一轮继续做
1. `creditRatingRange` 校验 + 错误提示
2. 技能点预算校验（职业点 / 兴趣点）
3. 跟踪/偷窃的延迟发现 `countdowns`
4. 结团报告加入 NPC 社交后效摘要
5. 隐藏检定输出分层（玩家版 / 调试版）

### P1：可以做，但稍微要多设计一点
1. 年龄修正与 MOV 修正
2. SAN 阈值触发的短时异常模板
3. 战斗伤害骰表达式与简武器表
4. NPC 运行态单独存档结构

## 结论

当前 `core` 已经从“有 talk 动作”进到“同样是说话，不同话术会留下不同世界后果”的阶段了。
下一轮最有性价比的不是继续堆新动作，而是把**数值约束、时间触发器、结团摘要**补齐。这样整个框架会从 demo 感更接近可持续跑团底座。
