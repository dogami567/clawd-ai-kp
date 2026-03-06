const {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession
} = require("./state-machine");
const { createInvestigatorFromQuickFire } = require("./character-creation");

function createCharacter(input) {
  return createInvestigatorFromQuickFire(input);
}

function startSessionApi(input = {}) {
  const session = createSession({
    sessionId: input.sessionId,
    sceneId: input.sceneId || "scene-intro-001",
    investigatorIds: []
  });

  if (input.summary || input.location) {
    startInvestigationScene(session, {
      summary: input.summary || "调查开始",
      location: input.location || "未知地点"
    });
  }

  return session;
}

function addInvestigator(sessionState, investigator) {
  registerInvestigator(sessionState, investigator);
  return {
    ok: true,
    investigatorId: investigator.id,
    investigatorName: investigator.name,
    investigatorCount: Object.keys(sessionState.investigators).length
  };
}

function submitAction(sessionState, action, randomInt) {
  if (action.kind === "skill_check") {
    return {
      kind: "skill_check",
      event: performSkillCheck(sessionState, action, randomInt)
    };
  }

  if (action.kind === "start_combat") {
    startCombat(sessionState, action.enemies || []);
    return {
      kind: "start_combat",
      sceneType: sessionState.scene.sceneType,
      round: sessionState.scene.timeState.combatRound,
      enemies: sessionState.scene.participants.npcs
    };
  }

  if (action.kind === "combat_round") {
    return {
      kind: "combat_round",
      event: resolveCombatRound(sessionState, action, randomInt)
    };
  }

  if (action.kind === "san_check") {
    return {
      kind: "san_check",
      event: runSanCheck(sessionState, action, randomInt)
    };
  }

  throw new Error(`Unsupported action kind: ${action.kind}`);
}

function getState(sessionState) {
  return {
    sessionId: sessionState.sessionId,
    scene: sessionState.scene,
    investigators: Object.values(sessionState.investigators).map((item) => ({
      id: item.id,
      name: item.name,
      occupation: item.occupation,
      hp: item.resources.hp,
      san: item.resources.san,
      luck: item.resources.luck,
      conditions: item.status.conditions
    })),
    checkCount: sessionState.checkLog.length,
    settlementReady: Boolean(sessionState.settlement)
  };
}

function settleSessionApi(sessionState) {
  return settleSession(sessionState);
}

module.exports = {
  createCharacter,
  startSessionApi,
  addInvestigator,
  submitAction,
  getState,
  settleSessionApi
};