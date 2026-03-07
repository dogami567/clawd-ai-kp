const test = require('node:test');
const assert = require('node:assert/strict');
const { importSceneMarkdown } = require('./scene-markdown-import');

test('imports a markdown scene draft into scene template json', () => {
  const markdown = `# Scene Spec
id: sample-scene
title: 样板场景
summary: 样板场景摘要
location: 河谷旧教堂
sceneType: investigation
exposure: 1
pressure: 2
dangerLevel: medium

## Opening
门一推开，灰就往下落。

## Atmosphere
tone: 潮湿、紧绷
light: 月光很薄
smell:
- 潮木头
- 灰尘
sound:
- 风声
- 木梁轻响

## Areas
### altar | 祭坛区
description: 祭坛发黑开裂，背后有不自然刮痕。
- 异常刮痕
- 高风险触碰点

## Truth Layers
- 祭坛下方有暗槽
- 最近有人半夜来过

## Ending Hooks
- 带着线索撤出

## Clues
- clue-altar-scratch | 祭坛背后的异常刮痕 | core | partial | false | scene

## Events
- evt-awake | 教堂深处有东西苏醒 | false

## Options
- check-spot | 侦查祭坛与墙面 | investigate

## NPC Refs
- gravedigger | 0 | active

## Starter Prompts
- 我借着手电去看祭坛背后的刮痕。
`;

  const scene = importSceneMarkdown(markdown);
  assert.equal(scene.id, 'sample-scene');
  assert.equal(scene.title, '样板场景');
  assert.equal(scene.threats.exposure, 1);
  assert.equal(scene.atmosphere.tone, '潮湿、紧绷');
  assert.equal(scene.areas[0].name, '祭坛区');
  assert.equal(scene.truthLayers.length, 2);
  assert.equal(scene.clues[0].revealed, false);
  assert.equal(scene.npcRefs[0].id, 'gravedigger');
  assert.equal(scene.starterPrompts[0], '我借着手电去看祭坛背后的刮痕。');
});
