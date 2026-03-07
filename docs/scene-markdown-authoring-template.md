# Scene Markdown 模板 v0.1

> 用途：给作者或 AI 写场景草稿时用。写完后可由导入器转成 `scene.json` 结构。

```md
# Scene Spec
id: scene-id
title: 场景标题
summary: 一句话摘要
location: 地点
sceneType: investigation
exposure: 0
pressure: 0
dangerLevel: low

## Opening
这里写开场文本。

## Atmosphere
tone: 潮湿、空旷、安静得过头
light: 月光只照亮一小块。
smell:
- 潮木头
- 灰尘
sound:
- 风声
- 木梁轻响

## Areas
### area-id | 区域名
description: 区域描述。
- 区域重点 1
- 区域重点 2

## Truth Layers
- 真相层 1
- 真相层 2

## Ending Hooks
- 结尾钩子 1
- 结尾钩子 2

## Clues
- clue-id | 线索标题 | core | partial | false | scene

## Events
- event-id | 事件标题 | false

## Options
- option-id | 玩家当前可做动作 | investigate

## NPC Refs
- npc-id | 0 | active

## Starter Prompts
- 玩家可直接尝试的句子 1
- 玩家可直接尝试的句子 2
```

## 说明
- `Clues` 行格式：`id | title | kind | quality | revealed | source`
- `Events` 行格式：`id | label | triggered`
- `Options` 行格式：`id | label | type`
- `NPC Refs` 行格式：`id | trust | status`

当前 v0.1 先支持最小字段，不追求一次把所有 scene 细节全塞进 Markdown。
