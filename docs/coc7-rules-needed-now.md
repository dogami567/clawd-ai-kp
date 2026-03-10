# CoC 7 规则摘录（当前开发轮需要）

> 目标：只整理当前这一轮实现 `车卡 + 属性 + 基础判定 + 派生属性 + 职业/物品约束` 必须要先定下来的规则点。

## 固定参考入口

优先级：
1. `docs/rules-reference.md` 中的 Chaosium 官方规则书入口
2. Chaosium 官方 Quick-Start PDF（免费，适合先落 v0.1）

Quick-Start：
- https://www.chaosium.com/content/FreePDFs/CoC/CHA23131%20Call%20of%20Cthulhu%207th%20Edition%20Quick-Start%20Rules.pdf

## 1. 调查员八大属性

CoC 7 调查员基础属性共 8 个：
- `STR`：力量，影响纯粹的身体力量与近战相关表现
- `CON`：体质，影响健康、硬抗能力、抗毒抗病等
- `DEX`：敏捷，影响反应、灵活度、战斗行动先后
- `APP`：外貌，影响魅力、存在感、第一印象
- `POW`：意志，影响精神强度、意志力、稳定性
- `INT`：智力，影响理解力、推理与灵感
- `SIZ`：体型，影响身高体重总量，也参与 HP / Build
- `EDU`：教育，影响受教育程度与系统化知识

补充：
- `Luck` 不是八大基础属性之一，但在车卡阶段通常一起确定。

## 2. 属性生成方法（v0.1 先定 Quick-Fire）

为了先把原型跑起来，建议当前版本先固定用 `Quick-Fire Method`：
- 将以下数值分配给 8 个属性：
- `40, 50, 50, 50, 60, 60, 70, 80`

这样有几个好处：
- 实现简单
- 少掉掷属性时的流程噪音
- 更适合先做聊天原型
- 后续再补传统掷骰法

后续可扩展的传统法：
- `STR / CON / DEX / APP / POW`：`3D6 × 5`
- `SIZ / INT / EDU`：`(2D6 + 6) × 5`
- `Luck`：通常 `3D6 × 5`

## 3. 属性半值 / 五分之一值

CoC 7 经常需要：
- 属性原值
- 半值
- 五分之一值

建议实现时在角色卡里直接缓存：
- `value`
- `half`
- `fifth`

用途：
- 困难成功通常看半值
- 极难成功通常看五分之一值

## 4. 成功等级

当前实现统一按这套：
- `Regular`：`1d100 <= 原目标值`
- `Hard`：`1d100 <= 半值`
- `Extreme`：`1d100 <= 五分之一值`
- `Critical`：当前代码先保留 `1`
- `Fumble`：当前代码先保留 `100`

说明：
- v0.1 先用统一简化逻辑即可
- 后续再补更精细的 fumble/critical 条件

## 5. 派生属性（本轮要用）

### 5.1 SAN
- 初始 `SAN = POW`

### 5.2 Magic Points
- 初始 `MP = POW / 5`

### 5.3 Hit Points
- `HP = floor((CON + SIZ) / 10)`

### 5.4 Damage Bonus / Build
由 `STR + SIZ` 决定：
- `2–64` -> `DB -2`, `Build -2`
- `65–84` -> `DB -1`, `Build -1`
- `85–124` -> `DB 0`, `Build 0`
- `125–164` -> `DB +1D4`, `Build +1`
- `165–204` -> `DB +1D6`, `Build +2`

### 5.5 Move Rate
当前原型先不做完整年龄修正，先保留基础版本：
- 若 `DEX < SIZ` 且 `STR < SIZ` -> `MOV 7`
- 若 `DEX >= SIZ` 或 `STR >= SIZ` -> `MOV 8`
- 若 `DEX > SIZ` 且 `STR > SIZ` -> `MOV 9`

## 6. 职业（本轮需要先定的最小规则）

职业在 CoC 里至少承担这几件事：
- 给角色一个社会身份
- 限定/建议一组职业技能
- 决定职业技能点公式
- 给出 `Credit Rating` 范围

### v0.1 现做法
先不把整本职业列表全搬进来，但已经把常用可玩的职业模板扩成一组可跑团的基础库：
- 记者
- 私家侦探
- 医生
- 教授 / 学者
- 艺术家 / 歌手
- 退伍军人
- 富家子 / 社交名流
- 古董商
- 图书管理员 / 档案员
- 护士
- 神职人员
- 警探 / 警员
- 罪犯 / 骗子
- 考古学家

每个职业模板先提供：
- `name`
- `occupationSkillFormula`
- `creditRatingRange`
- `suggestedSkills`

### 职业技能点公式
CoC 7 的职业技能点通常是：
- `EDU × 4`
- 或 `EDU × 2 + (STR / DEX / APP / POW 中某项 × 2)`

当前建议：
- 先给每个模板写死公式
- 不在 v0.1 里追求职业大全，但要先把常见调查向职业补到“够用”

## 7. 技能（本轮要先用到的范围）

当前版本不需要完整技能表，但至少要先覆盖三类：
- 调查：`Spot Hidden`, `Listen`, `Library Use`, `Psychology`
- 社交：`Charm`, `Fast Talk`, `Intimidate`, `Persuade`
- 行动/战斗：`Stealth`, `Dodge`, `Fighting`, `Firearms`

额外建议补：
- `First Aid`
- `Credit Rating`
- `Drive Auto`
- `Locksmith`

## 8. 车卡流程（本轮实现要点）

当前这轮建议做成：
1. 选择时代
2. 选择职业模板
3. 分配 8 个属性（Quick-Fire）
4. 自动算出派生属性
5. 填姓名、年龄、性格一句话、动机
6. 分配职业技能点 / 个人兴趣点（个人兴趣点后续可先简化）
7. 选择初始物品
8. 校验时代与物品配额
9. 锁卡

## 9. 物品与时代约束（AIkp 项目约定）

这部分不是 CoC 规则书里的硬数值条款，而是本项目已确认的实现原则：
- 物品必须符合剧本时代
- 强力物品通常只给 `1` 件
- 日常/通用物品通常可给 `3` 件
- 可根据背景与合理解释灵活调整
- 不直接硬拒绝，优先给条件化许可与世界内代价

## 10. 这一轮代码实现最需要先补的点

基于上面这些规则，下一批代码应优先补：
- `character-creation.js`
  - Quick-Fire 分配
  - 派生属性计算
  - 职业模板装载
- `occupation-templates.js`
  - 最小职业集
- `derived-stats.js`
  - SAN / MP / HP / DB / Build / MOV
- `inventory-rules.js`
  - 时代校验
  - 物品配额
  - 条件化许可

## 11. 当前结论

为了尽快看到可玩的快速测试：
- 这轮不先抠完整规则书
- 先以官方 `Quick-Start` + 官方主规则入口为锚
- 先做一个能稳定车卡和进场的 `v0.1`
- 复杂可选规则后续再层层加上
