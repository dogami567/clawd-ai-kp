# Story Pack 编写格式 v0.1

> 目的：以后细化剧情时，不再手工一张张塞进代码，而是按 `story pack / campaign / scene` 三层结构组织。

## 1. 三层结构

### 1.1 `scene`
单个场景文件，负责：
- 场景名、地点、开场文本
- 气氛与区域
- 线索、事件、NPC 引用
- 当前可行动作

### 1.2 `campaign`
多幕故事弧文件，负责：
- 当前故事弧标题与摘要
- 场景顺序与阶段
- 每一幕能往哪里推进
- `hook` 条件与目标场景

### 1.3 `story pack`
作者打包层，负责：
- 这一组故事弧用了哪些 `scene`
- 对作者/系统的整体备注
- 作为后续导入工作流的入口

## 2. `scene` 建议字段

- `id`
- `title`
- `opening`
- `summary`
- `location`
- `sceneType`
- `threats`
- `atmosphere`
- `areas`
- `truthLayers`
- `endingHooks`
- `clues`
- `events`
- `nextOptions`
- `npcRefs`
- `starterPrompts`

## 3. `campaign` 建议字段

- `id`
- `title`
- `summary`
- `startSceneId`
- `scenes[]`

每个 `scenes[]` 节点至少包含：
- `sceneId`
- `title`
- `phase`
- `purpose`
- `hooks[]`

每个 `hook` 至少包含：
- `id`
- `label`
- `targetSceneId`
- `status`
- `conditions`（可选）

## 4. `hook.conditions` v0.1 支持

- `minRevealedCoreClues`
- `maxDangerLevel`
- `minDangerLevel`
- `requiredTriggeredEvents`
- `requiredNpcFlags`

说明：
- 先做最小条件集，不求全
- 后面再慢慢加更细的判断（道具、关系、SAN、时间节点等）

## 5. `story pack` 建议字段

- `id`
- `title`
- `campaignId`
- `sceneIds[]`
- `notes[]`

## 6. 当前工作方式建议

- 先把一条故事弧拆成：
  - 起始幕
  - 过渡幕
  - 后果幕
- 每一幕先写结构和钩子，不先追求文本全细化
- 文本和叙事细节可以等框架稳定后，再集中打磨

## 7. 当前结论

从现在开始，新增剧情更推荐按 `story pack -> campaign -> scene` 组织。

这样做的好处：
- 不会继续退回“手工一张张塞场景”
- 方便以后接故事书、素材包、作者输入格式
- 更适合 AIKP 后续做多幕推进与批量导入
