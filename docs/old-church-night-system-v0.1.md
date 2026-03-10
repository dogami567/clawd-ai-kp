# 夜探旧教堂 · 系统版 v0.1

> 用途：给 story pack / campaign / runtime / authoring 工作流使用的系统入口。

## 1. 当前文件分工

- 玩家版：`docs/old-church-night-player-v0.1.md`
- KP版：`docs/old-church-night-kp-v0.1.md`
- 系统版：`docs/old-church-night-system-v0.1.md`
- 历史总稿：`docs/old-church-night-final-v0.1.md`

## 2. 当前故事包与场景映射

- Story Pack：`core/data/story-packs/old-church-arc-pack.story-pack.json`
- Campaign：`core/data/campaigns/old-church-arc.campaign.json`
- 起始场景：`core/data/scenes/old-church-night.scene.json`
- 后续场景：
  - `core/data/scenes/bell-tower-followup.scene.json`
  - `core/data/scenes/underchurch-aftershock.scene.json`
  - `core/data/scenes/missing-person-followup.scene.json`

## 3. 面向 runtime 的事实来源

### 玩家可见素材
- 开场文本
- 场景公开目标
- 区域描述
- 守墓人的表层形象
- 玩家已知钩子

### KP/系统内部素材
- 真相层
- 线索分层
- 推进建议
- 后果与延迟后果
- 条件驱动切幕

## 4. authoring 工作流建议

- 玩家文案优先从玩家版提取，避免把内部条件和幕后信息抄进展示层。
- KP 提示、复盘、主持参考优先从 KP版提取。
- `scene / campaign / story pack` 字段与导入备注优先从系统版核对。

## 5. 当前旧教堂样板的系统约束

- 玩家版不得出现 `truthLayers`、隐藏事件、内部切幕条件。
- KP版可以解释真相层，但不要直接照抄 JSON 字段名。
- 系统版负责把自然语言稿件和 `story pack / campaign / scene` 三层结构对齐。

## 6. 推荐维护方式

- 剧情事实变动时，先改系统版确认来源，再同步 KP版与玩家版。
- 玩家版只维护“可见事实”和体验文案，不承担内部逻辑说明。
- 旧的总稿继续保留做审计与对照，不再当作单一入口。
