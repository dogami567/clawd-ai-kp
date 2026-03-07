const { readFileSync } = require("fs");
const { join } = require("path");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCampaignTemplate(campaignId) {
  const filePath = join(__dirname, "..", "data", "campaigns", `${campaignId}.campaign.json`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getCampaignScene(campaign, sceneId) {
  return (campaign.scenes || []).find((scene) => scene.sceneId === sceneId) || null;
}

function listCampaignHooks(campaign, sceneId) {
  const scene = getCampaignScene(campaign, sceneId);
  return cloneJson(scene?.hooks || []);
}

function buildCampaignMeta(campaign, sceneId) {
  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    campaignSummary: campaign.summary,
    currentSceneId: sceneId,
    hooks: listCampaignHooks(campaign, sceneId)
  };
}

function attachCampaignMeta(sessionState, campaign) {
  const sceneId = sessionState.scene?.meta?.scenarioId || sessionState.scene?.sceneId || campaign.startSceneId;
  sessionState.scene.meta = {
    ...(sessionState.scene.meta || {}),
    campaign: buildCampaignMeta(campaign, sceneId)
  };
  return sessionState.scene.meta.campaign;
}

function getCurrentCampaign(sessionState) {
  return sessionState.scene?.meta?.campaign || null;
}

function formatCampaignSummary(campaignMeta) {
  if (!campaignMeta) return "当前这幕还没挂进 campaign。";
  const lines = [
    `故事弧：${campaignMeta.campaignTitle}`,
    `当前场景：${campaignMeta.currentSceneId}`
  ];
  if (campaignMeta.campaignSummary) lines.push(`摘要：${campaignMeta.campaignSummary}`);
  if (Array.isArray(campaignMeta.hooks) && campaignMeta.hooks.length) {
    lines.push("当前预留钩子：");
    for (const hook of campaignMeta.hooks) {
      lines.push(`- ${hook.label}（${hook.status || "planned"}）`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  loadCampaignTemplate,
  getCampaignScene,
  listCampaignHooks,
  buildCampaignMeta,
  attachCampaignMeta,
  getCurrentCampaign,
  formatCampaignSummary
};
