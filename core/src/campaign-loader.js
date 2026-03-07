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

function transitionCampaignScene(sessionState, campaign, targetSceneId) {
  const { loadSceneTemplate, applySceneTemplate } = require("./scene-loader");
  const sceneTemplate = loadSceneTemplate(targetSceneId);
  applySceneTemplate(sessionState, sceneTemplate);
  attachCampaignMeta(sessionState, campaign);
  sessionState.scene.meta.campaign.currentSceneId = targetSceneId;
  sessionState.scene.meta.campaign.hooks = listCampaignHooks(campaign, targetSceneId);
  sessionState.scene.events = sessionState.scene.events || [];
  sessionState.scene.events.push({
    id: `scene-transition-${Date.now()}`,
    label: `故事推进到 ${sceneTemplate.title}`,
    triggered: true,
    triggerAtMinute: sessionState.scene.timeState?.timelineMinute || 0
  });
  return sessionState.scene.meta.campaign;
}

function dangerRank(level = "low") {
  return {
    low: 1,
    medium: 2,
    high: 3,
    extreme: 4
  }[level] || 0;
}

function collectNpcFlags(sessionState) {
  const flags = [];
  for (const npc of sessionState.scene?.participants?.npcs || []) {
    for (const flag of npc.socialState?.flags || []) flags.push(flag);
  }
  return flags;
}

function evaluateHookConditions(sessionState, hook) {
  const conditions = hook.conditions || {};
  const revealedCoreClues = (sessionState.scene?.clues || []).filter((item) => item.revealed && item.kind === "core").length;
  const currentDanger = sessionState.scene?.threats?.dangerLevel || "low";
  const triggeredLabels = (sessionState.scene?.events || []).filter((item) => item.triggered).map((item) => item.label);
  const npcFlags = collectNpcFlags(sessionState);

  if (conditions.minRevealedCoreClues != null && revealedCoreClues < conditions.minRevealedCoreClues) return false;
  if (conditions.maxDangerLevel && dangerRank(currentDanger) > dangerRank(conditions.maxDangerLevel)) return false;
  if (conditions.minDangerLevel && dangerRank(currentDanger) < dangerRank(conditions.minDangerLevel)) return false;
  if (Array.isArray(conditions.requiredTriggeredEvents) && conditions.requiredTriggeredEvents.length) {
    const matched = conditions.requiredTriggeredEvents.some((label) => triggeredLabels.includes(label));
    if (!matched) return false;
  }
  if (Array.isArray(conditions.requiredNpcFlags) && conditions.requiredNpcFlags.length) {
    const matched = conditions.requiredNpcFlags.some((flag) => npcFlags.includes(flag));
    if (!matched) return false;
  }
  return true;
}

function listEligibleHooks(sessionState, campaign, sceneId) {
  return listCampaignHooks(campaign, sceneId).map((hook) => ({
    ...hook,
    eligible: evaluateHookConditions(sessionState, hook)
  }));
}

function autoAdvanceCampaign(sessionState, campaign, preferredHookId = null) {
  const currentSceneId = sessionState.scene?.meta?.campaign?.currentSceneId || sessionState.scene?.meta?.scenarioId;
  const hooks = listEligibleHooks(sessionState, campaign, currentSceneId);
  const chosen = preferredHookId
    ? hooks.find((hook) => hook.id === preferredHookId && hook.eligible)
    : hooks.find((hook) => hook.eligible);
  if (!chosen) return null;
  transitionCampaignScene(sessionState, campaign, chosen.targetSceneId);
  return chosen;
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
  transitionCampaignScene,
  evaluateHookConditions,
  listEligibleHooks,
  autoAdvanceCampaign,
  formatCampaignSummary
};
