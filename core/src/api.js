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
const { adjudicateAction } = require("./adjudication-engine");

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

function buildAdjudicationResponse(sessionState, actor, action, randomInt) {
  const adjudication = adjudicateAction(sessionState, actor, action);

  if (!adjudication.needsCheck) {
    return {
      kind: action.kind,
      adjudication,
      event: {
        outcome: {
          narrative: action.onDirectSuccess || "行动直接生效，局势向前推进。",
          nextPrompt: adjudication.nextPrompt,
          cost: [],
          stateChanges: []
        }
      }
    };
  }

  const event = performSkillCheck(
    sessionState,
    {
      actorId: action.actorId,
      skillKey: adjudication.skillKey,
      mode: action.mode || "open",
      difficulty: adjudication.difficulty,
      failForward: adjudication.failForward,
      checkType: "adjudication"
    },
    randomInt
  );

  event.adjudication = {
    intent: adjudication.intent,
    basis: adjudication.basis,
    impact: adjudication.impact,
    duration: adjudication.duration,
    balanceNote: adjudication.balanceNote
  };
  event.outcome.nextPrompt = buildOutcomePrompt(action, event.result.success, adjudication);

  return {
    kind: action.kind,
    adjudication,
    event
  };
}

function buildOutcomePrompt(action, success, adjudication) {
  if (success) {
    return action.onSuccessPrompt || `行动成功了，${adjudication.intent} 取得了阶段性效果。`;
  }
  return action.onFailPrompt || `行动没完全按计划进行，但剧情仍在推进，代价类型：${adjudication.failForward}。`;
}

function submitAction(sessionState, action, randomInt) {
  if (action.kind === "skill_check") {
    return {
      kind: "skill_check",
      event: performSkillCheck(sessionState, action, randomInt)
    };
  }

  if (["explore", "talk", "use_item", "risky_action"].includes(action.kind)) {
    const actor = sessionState.investigators[action.actorId];
    if (!actor) {
      throw new Error(`Investigator not found: ${action.actorId}`);
    }
    return buildAdjudicationResponse(sessionState, actor, action, randomInt);
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