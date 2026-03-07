const { readFileSync } = require("fs");
const { join } = require("path");
const { loadNpcCard } = require("./npc-cards");

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

function buildScenarioNpcs(npcRefs = []) {
  return npcRefs.map((npcRef) => {
    const card = loadNpcCard(npcRef.id);
    return buildNpcRuntimeFromCard(card, npcRef);
  });
}

function applySceneTemplate(sessionState, template) {
  sessionState.scene.sceneType = template.sceneType || sessionState.scene.sceneType;
  sessionState.scene.summary = template.summary || sessionState.scene.summary;
  sessionState.scene.location = template.location || sessionState.scene.location;
  sessionState.scene.clues = cloneJson(template.clues || []);
  sessionState.scene.events = cloneJson(template.events || []);
  sessionState.scene.nextOptions = cloneJson(template.nextOptions || sessionState.scene.nextOptions);
  sessionState.scene.threats = cloneJson(template.threats || sessionState.scene.threats);
  sessionState.scene.participants.npcs = buildScenarioNpcs(template.npcRefs || []);
  sessionState.scene.meta = {
    ...(sessionState.scene.meta || {}),
    scenarioId: template.id,
    scenarioTitle: template.title,
    opening: template.opening,
    starterPrompts: cloneJson(template.starterPrompts || [])
  };
  return sessionState;
}

function seedSessionFromScenario(sessionState, scenarioId) {
  const template = loadSceneTemplate(scenarioId);
  applySceneTemplate(sessionState, template);
  return {
    scenarioId: template.id,
    title: template.title,
    opening: template.opening,
    starterPrompts: cloneJson(template.starterPrompts || [])
  };
}

module.exports = {
  loadSceneTemplate,
  buildNpcRuntimeFromCard,
  buildScenarioNpcs,
  applySceneTemplate,
  seedSessionFromScenario
};
