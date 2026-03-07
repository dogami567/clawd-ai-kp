function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, path) {
  assertCondition(typeof value === "string" && value.trim().length > 0, `${path} must be a non-empty string`);
}

function assertArray(value, path) {
  assertCondition(Array.isArray(value), `${path} must be an array`);
}

function validateCampaignTemplate(campaign) {
  assertCondition(campaign && typeof campaign === "object" && !Array.isArray(campaign), "campaign must be an object");
  assertString(campaign.id, "campaign.id");
  assertString(campaign.title, "campaign.title");
  assertString(campaign.summary, "campaign.summary");
  assertString(campaign.startSceneId, "campaign.startSceneId");
  assertArray(campaign.scenes, "campaign.scenes");
  assertCondition(campaign.scenes.length > 0, "campaign.scenes must not be empty");

  const sceneIds = new Set();
  for (const [index, scene] of campaign.scenes.entries()) {
    assertCondition(scene && typeof scene === "object" && !Array.isArray(scene), `campaign.scenes[${index}] must be an object`);
    assertString(scene.sceneId, `campaign.scenes[${index}].sceneId`);
    assertString(scene.title, `campaign.scenes[${index}].title`);
    assertString(scene.phase, `campaign.scenes[${index}].phase`);
    assertString(scene.purpose, `campaign.scenes[${index}].purpose`);
    assertArray(scene.hooks, `campaign.scenes[${index}].hooks`);
    sceneIds.add(scene.sceneId);

    for (const [hookIndex, hook] of scene.hooks.entries()) {
      assertCondition(hook && typeof hook === "object" && !Array.isArray(hook), `campaign.scenes[${index}].hooks[${hookIndex}] must be an object`);
      assertString(hook.id, `campaign.scenes[${index}].hooks[${hookIndex}].id`);
      assertString(hook.label, `campaign.scenes[${index}].hooks[${hookIndex}].label`);
      assertString(hook.targetSceneId, `campaign.scenes[${index}].hooks[${hookIndex}].targetSceneId`);
      assertString(hook.status, `campaign.scenes[${index}].hooks[${hookIndex}].status`);
    }
  }

  assertCondition(sceneIds.has(campaign.startSceneId), "campaign.startSceneId must exist in campaign.scenes[].sceneId");
  return true;
}

function validateStoryPackTemplate(storyPack) {
  assertCondition(storyPack && typeof storyPack === "object" && !Array.isArray(storyPack), "storyPack must be an object");
  assertString(storyPack.id, "storyPack.id");
  assertString(storyPack.title, "storyPack.title");
  assertString(storyPack.campaignId, "storyPack.campaignId");
  assertArray(storyPack.sceneIds, "storyPack.sceneIds");
  assertCondition(storyPack.sceneIds.length > 0, "storyPack.sceneIds must not be empty");
  for (const [index, sceneId] of storyPack.sceneIds.entries()) {
    assertString(sceneId, `storyPack.sceneIds[${index}]`);
  }
  if (storyPack.notes !== undefined) {
    assertArray(storyPack.notes, "storyPack.notes");
  }
  return true;
}

module.exports = {
  validateCampaignTemplate,
  validateStoryPackTemplate
};
