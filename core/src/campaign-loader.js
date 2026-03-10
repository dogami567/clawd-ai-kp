const { readFileSync } = require("fs");
const { join } = require("path");
const { validateCampaignTemplate } = require("./authoring-validation");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCampaignTemplate(campaignId) {
  const filePath = join(__dirname, "..", "data", "campaigns", `${campaignId}.campaign.json`);
  const campaign = JSON.parse(readFileSync(filePath, "utf8"));
  validateCampaignTemplate(campaign);
  return campaign;
}

function getCampaignScene(campaign, sceneId) {
  return (campaign.scenes || []).find((scene) => scene.sceneId === sceneId) || null;
}

function listCampaignHooks(campaign, sceneId) {
  const scene = getCampaignScene(campaign, sceneId);
  return cloneJson(scene?.hooks || []);
}

function normalizeCampaignRuntime(runtime = {}) {
  const safeRuntime = runtime && typeof runtime === "object" ? runtime : {};
  const npcsById = safeRuntime.npcsById && typeof safeRuntime.npcsById === "object"
    ? cloneJson(safeRuntime.npcsById)
    : {};
  const triggeredEvents = Array.isArray(safeRuntime.triggeredEvents)
    ? safeRuntime.triggeredEvents
      .filter((event) => event && typeof event === "object" && typeof event.label === "string" && event.label.trim())
      .map((event) => ({
        ...cloneJson(event),
        label: event.label.trim()
      }))
    : [];
  return {
    npcsById,
    triggeredEvents
  };
}

function ensureCampaignRuntime(sessionState) {
  sessionState.scene = sessionState.scene || {};
  sessionState.scene.meta = sessionState.scene.meta || {};
  const runtime = normalizeCampaignRuntime(sessionState.scene.meta.campaign?.runtime || {});
  if (sessionState.scene.meta.campaign && typeof sessionState.scene.meta.campaign === "object") {
    sessionState.scene.meta.campaign.runtime = runtime;
  }
  return runtime;
}

function mergeCampaignNpcRuntime(existingNpc = {}, nextNpc = {}) {
  const base = existingNpc && typeof existingNpc === "object" ? existingNpc : {};
  const incoming = nextNpc && typeof nextNpc === "object" ? nextNpc : {};
  return {
    ...cloneJson(base),
    ...cloneJson(incoming),
    id: incoming.id || base.id || null,
    name: incoming.name || base.name || null,
    items: Array.isArray(incoming.items)
      ? [...incoming.items]
      : (Array.isArray(base.items) ? [...base.items] : []),
    socialState: {
      ...(base.socialState && typeof base.socialState === "object" ? cloneJson(base.socialState) : {}),
      ...(incoming.socialState && typeof incoming.socialState === "object" ? cloneJson(incoming.socialState) : {})
    }
  };
}

function upsertTriggeredEvent(runtime, event = {}, sceneId = null) {
  if (!event || typeof event.label !== "string" || !event.label.trim()) return;
  const label = event.label.trim();
  const nextEvent = {
    ...cloneJson(event),
    label,
    sceneId: sceneId || event.sceneId || null
  };
  const existingIndex = runtime.triggeredEvents.findIndex((entry) => entry.label === label);
  if (existingIndex >= 0) runtime.triggeredEvents[existingIndex] = nextEvent;
  else runtime.triggeredEvents.push(nextEvent);
}

function recordCampaignRuntime(sessionState) {
  const runtime = ensureCampaignRuntime(sessionState);
  for (const npc of sessionState.scene?.participants?.npcs || []) {
    if (!npc?.id) continue;
    runtime.npcsById[npc.id] = mergeCampaignNpcRuntime(runtime.npcsById[npc.id], npc);
  }
  for (const event of sessionState.scene?.events || []) {
    if (!event?.triggered) continue;
    upsertTriggeredEvent(runtime, event, sessionState.scene?.meta?.scenarioId || sessionState.scene?.sceneId || null);
  }
  if (sessionState.scene?.meta?.campaign && typeof sessionState.scene.meta.campaign === "object") {
    sessionState.scene.meta.campaign.runtime = runtime;
  }
  return runtime;
}

function listCampaignRuntimeNpcAftermath(sessionState) {
  const runtime = normalizeCampaignRuntime(sessionState.scene?.meta?.campaign?.runtime || {});
  return Object.values(runtime.npcsById || {}).map((npc) => ({
    id: npc.id,
    name: npc.name,
    attitude: npc.attitude || "neutral",
    trust: npc.trust ?? 0,
    suspicion: npc.socialState?.suspicion ?? 0,
    fear: npc.socialState?.fear ?? 0,
    affinity: npc.socialState?.affinity ?? 0,
    obligation: npc.socialState?.obligation ?? 0,
    flags: Array.isArray(npc.socialState?.flags) ? [...npc.socialState.flags] : [],
    lastInteractionStyle: npc.socialState?.lastInteractionStyle || null,
    status: npc.status || "active"
  }));
}

function buildCampaignMeta(campaign, sceneId, runtime = null) {
  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    campaignSummary: campaign.summary,
    currentSceneId: sceneId,
    hooks: listCampaignHooks(campaign, sceneId),
    runtime: normalizeCampaignRuntime(runtime || {})
  };
}

function attachCampaignMeta(sessionState, campaign, runtimeOverride = null) {
  const sceneId = sessionState.scene?.meta?.scenarioId || sessionState.scene?.sceneId || campaign.startSceneId;
  const runtime = runtimeOverride
    ? normalizeCampaignRuntime(runtimeOverride)
    : ensureCampaignRuntime(sessionState);
  sessionState.scene.meta = {
    ...(sessionState.scene.meta || {}),
    campaign: buildCampaignMeta(campaign, sceneId, runtime)
  };
  return sessionState.scene.meta.campaign;
}

function getCurrentCampaign(sessionState) {
  return sessionState.scene?.meta?.campaign || null;
}

function transitionCampaignScene(sessionState, campaign, targetSceneId) {
  const { loadSceneTemplate, applySceneTemplate } = require("./scene-loader");
  const runtime = recordCampaignRuntime(sessionState);
  const sceneTemplate = loadSceneTemplate(targetSceneId);
  applySceneTemplate(sessionState, sceneTemplate, { campaignRuntime: runtime });
  attachCampaignMeta(sessionState, campaign, runtime);
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
  const flags = new Set();
  for (const npc of sessionState.scene?.participants?.npcs || []) {
    for (const flag of npc.socialState?.flags || []) flags.add(flag);
  }
  for (const npc of listCampaignRuntimeNpcAftermath(sessionState)) {
    for (const flag of npc.flags || []) flags.add(flag);
  }
  return [...flags];
}

function collectTriggeredLabels(sessionState) {
  const labels = new Set(
    (sessionState.scene?.events || [])
      .filter((item) => item.triggered)
      .map((item) => item.label)
      .filter(Boolean)
  );
  const runtime = normalizeCampaignRuntime(sessionState.scene?.meta?.campaign?.runtime || {});
  for (const event of runtime.triggeredEvents) labels.add(event.label);
  return [...labels];
}

function evaluateHookConditions(sessionState, hook) {
  const conditions = hook.conditions || {};
  const revealedCoreClues = (sessionState.scene?.clues || []).filter((item) => item.revealed && item.kind === "core").length;
  const currentDanger = sessionState.scene?.threats?.dangerLevel || "low";
  const triggeredLabels = collectTriggeredLabels(sessionState);
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
  ensureCampaignRuntime,
  attachCampaignMeta,
  getCurrentCampaign,
  transitionCampaignScene,
  recordCampaignRuntime,
  listCampaignRuntimeNpcAftermath,
  evaluateHookConditions,
  listEligibleHooks,
  autoAdvanceCampaign,
  formatCampaignSummary
};
