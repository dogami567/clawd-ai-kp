# Campaign Markdown 模板 v0.1

```md
# Campaign Spec
id: campaign-id
title: 故事弧标题
summary: 一句话摘要
startSceneId: first-scene-id

## Scenes
### first-scene-id | 第一幕标题 | act-1
purpose: 这一幕的作用
#### Hooks
- hook-id | 钩子说明 | next-scene-id | planned | minRevealedCoreClues=1;maxDangerLevel=high
- hook-2 | 另一个钩子 | other-scene-id | planned | requiredTriggeredEvents=教堂深处有东西苏醒;minDangerLevel=medium
```

## 说明
- `###` 行格式：`sceneId | title | phase`
- `purpose:` 写本幕功能
- `Hooks` 行格式：`id | label | targetSceneId | status | conditions`
- `conditions` 先支持：
  - `minRevealedCoreClues=1`
  - `maxDangerLevel=high`
  - `minDangerLevel=medium`
  - `requiredTriggeredEvents=事件A,事件B`
  - `requiredNpcFlags=flagA,flagB`
