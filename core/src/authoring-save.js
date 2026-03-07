const { mkdirSync, writeFileSync } = require("fs");
const { join } = require("path");

function ensureParentDir(filePath) {
  const dirPath = filePath.split(/[/\\]/).slice(0, -1).join("/");
  mkdirSync(dirPath, { recursive: true });
}

function buildScenePath(sceneId) {
  return join(__dirname, "..", "data", "scenes", `${sceneId}.scene.json`);
}

function buildCampaignPath(campaignId) {
  return join(__dirname, "..", "data", "campaigns", `${campaignId}.campaign.json`);
}

function buildStoryPackPath(storyPackId) {
  return join(__dirname, "..", "data", "story-packs", `${storyPackId}.story-pack.json`);
}

function writeJsonFile(filePath, data) {
  ensureParentDir(filePath);
  const content = JSON.stringify(data, null, 2);
  writeFileSync(filePath, `${content}\n`, "utf8");
  return {
    ok: true,
    filePath,
    bytesWritten: Buffer.byteLength(content, "utf8")
  };
}

function saveSceneTemplate(scene) {
  return writeJsonFile(buildScenePath(scene.id), scene);
}

function saveCampaignTemplate(campaign) {
  return writeJsonFile(buildCampaignPath(campaign.id), campaign);
}

function saveStoryPackTemplate(storyPack) {
  return writeJsonFile(buildStoryPackPath(storyPack.id), storyPack);
}

module.exports = {
  buildScenePath,
  buildCampaignPath,
  buildStoryPackPath,
  saveSceneTemplate,
  saveCampaignTemplate,
  saveStoryPackTemplate
};
