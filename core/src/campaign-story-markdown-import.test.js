const test = require('node:test');
const assert = require('node:assert/strict');
const { importCampaignMarkdown, importStoryPackMarkdown } = require('./campaign-story-markdown-import');

test('imports campaign markdown into campaign template json', () => {
  const markdown = `# Campaign Spec
id: sample-campaign
title: 样板故事弧
summary: 一条用来测试多幕推进的故事弧
startSceneId: old-church-night

## Scenes
### old-church-night | 夜探旧教堂 | act-1
purpose: 让玩家摸到祭坛、钟楼和守墓人之间的关系
#### Hooks
- withdraw-with-clues | 带着线索撤出 | bell-tower-followup | planned | minRevealedCoreClues=1;maxDangerLevel=high
- retreat-after-awakening | 惊醒深处后撤退 | underchurch-aftershock | planned | requiredTriggeredEvents=教堂深处有东西苏醒;minDangerLevel=medium
`;

  const campaign = importCampaignMarkdown(markdown);
  assert.equal(campaign.id, 'sample-campaign');
  assert.equal(campaign.startSceneId, 'old-church-night');
  assert.equal(campaign.scenes.length, 1);
  assert.equal(campaign.scenes[0].hooks.length, 2);
  assert.equal(campaign.scenes[0].hooks[0].conditions.minRevealedCoreClues, 1);
  assert.equal(campaign.scenes[0].hooks[0].conditions.maxDangerLevel, 'high');
});

test('imports story pack markdown into story pack template json', () => {
  const markdown = `# Story Pack Spec
id: old-church-pack
title: 旧教堂异响 Story Pack
campaignId: old-church-arc

## Scene Ids
- old-church-night
- bell-tower-followup
- underchurch-aftershock

## Notes
- 先用样板场景验证多幕推进
- 不继续一张张手写地图
`;

  const storyPack = importStoryPackMarkdown(markdown);
  assert.equal(storyPack.id, 'old-church-pack');
  assert.equal(storyPack.campaignId, 'old-church-arc');
  assert.equal(storyPack.sceneIds.length, 3);
  assert.equal(storyPack.notes.length, 2);
});
