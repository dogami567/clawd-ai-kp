const { readFileSync } = require("fs");
const { join } = require("path");
const { loadNpcCard } = require("./npc-cards");
const { loadCampaignTemplate, attachCampaignMeta } = require("./campaign-loader");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSceneTemplate(sceneId) {
  const filePath = join(__dirname, "..", "data", "scenes", `${sceneId}.scene.json`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function buildNpcRuntimeFromCard(card, overrides = {}) {
  const visibleItems = Array.isArray(card.appearance?.visibleItems) ? [...card.appearance.visibleItems] : [];
  const inventoryItems = Array.isArray(card.inventory) ? card.inventory.map((item) => item.name) : [];
  const items = [...new Set([...visibleItems, ...inventoryItems])];

  return {
    id: card.id,
    name: card.name,
    attitude: card.profile?.defaultAttitude || "neutral",
    trust: 0,
    status: "active",
    items,
    socialState: {
      suspicion: 0,
      fear: 0,
      affinity: 0,
      obligation: 0,
      flags: [],
      lastInteractionStyle: null
    },
    ...cloneJson(overrides)
  };
}

function mergePersistedNpcRuntime(baseNpc, persistedNpc = null) {
  if (!persistedNpc || typeof persistedNpc !== "object") return baseNpc;
  return {
    ...baseNpc,
    ...cloneJson(persistedNpc),
    id: baseNpc.id,
    name: persistedNpc.name || baseNpc.name,
    status: persistedNpc.status || baseNpc.status,
    items: Array.isArray(persistedNpc.items) ? [...persistedNpc.items] : baseNpc.items,
    socialState: {
      ...cloneJson(baseNpc.socialState || {}),
      ...cloneJson(persistedNpc.socialState || {})
    }
  };
}

function buildScenarioNpcs(npcRefs = [], options = {}) {
  const persistedNpcById = options?.campaignRuntime?.npcsById && typeof options.campaignRuntime.npcsById === "object"
    ? options.campaignRuntime.npcsById
    : {};
  return npcRefs.map((npcRef) => {
    const card = loadNpcCard(npcRef.id);
    const baseNpc = buildNpcRuntimeFromCard(card, npcRef);
    return mergePersistedNpcRuntime(baseNpc, persistedNpcById[baseNpc.id] || persistedNpcById[npcRef.id] || null);
  });
}

function applySceneTemplate(sessionState, template, options = {}) {
  sessionState.scene.sceneType = template.sceneType || sessionState.scene.sceneType;
  sessionState.scene.summary = template.summary || sessionState.scene.summary;
  sessionState.scene.location = template.location || sessionState.scene.location;
  sessionState.scene.clues = cloneJson(template.clues || []);
  sessionState.scene.events = cloneJson(template.events || []);
  sessionState.scene.nextOptions = cloneJson(template.nextOptions || sessionState.scene.nextOptions);
  sessionState.scene.threats = cloneJson(template.threats || sessionState.scene.threats);
  sessionState.scene.participants.npcs = buildScenarioNpcs(template.npcRefs || [], options);
  sessionState.scene.meta = {
    ...(sessionState.scene.meta || {}),
    scenarioId: template.id,
    scenarioTitle: template.title,
    opening: template.opening,
    starterPrompts: cloneJson(template.starterPrompts || []),
    atmosphere: cloneJson(template.atmosphere || {}),
    areas: cloneJson(template.areas || []),
    truthLayers: cloneJson(template.truthLayers || []),
    endingHooks: cloneJson(template.endingHooks || [])
  };
  return sessionState;
}

function seedSessionFromScenario(sessionState, scenarioId, options = {}) {
  const template = loadSceneTemplate(scenarioId);
  applySceneTemplate(sessionState, template);
  if (options.campaignId) {
    const campaign = loadCampaignTemplate(options.campaignId);
    attachCampaignMeta(sessionState, campaign);
  }
  return {
    scenarioId: template.id,
    title: template.title,
    opening: template.opening,
    starterPrompts: cloneJson(template.starterPrompts || []),
    campaignId: options.campaignId || null
  };
}

module.exports = {
  loadSceneTemplate,
  buildNpcRuntimeFromCard,
  buildScenarioNpcs,
  applySceneTemplate,
  seedSessionFromScenario
};
