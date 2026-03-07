const { readFileSync } = require("fs");
const { join } = require("path");

function loadStoryPackTemplate(storyPackId) {
  const filePath = join(__dirname, "..", "data", "story-packs", `${storyPackId}.story-pack.json`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatStoryPackSummary(storyPack) {
  const lines = [
    `Story Pack：${storyPack.title}`,
    `Campaign：${storyPack.campaignId}`,
    `场景数：${(storyPack.sceneIds || []).length}`
  ];
  if (Array.isArray(storyPack.notes) && storyPack.notes.length) {
    lines.push("说明：");
    for (const note of storyPack.notes) lines.push(`- ${note}`);
  }
  return lines.join("\n");
}

module.exports = {
  loadStoryPackTemplate,
  formatStoryPackSummary
};
