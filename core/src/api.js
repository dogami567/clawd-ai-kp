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
const {
  buildWarningLine,
  buildPreRollLine,
  buildAdjudicationBonusLine,
  buildPostRollLine,
  buildNarrativeLine
} = require("./voice-lines");
const { applyStateChanges, buildStateChanges } = require("./state-effects");
const { applyContentEffects } = require("./content-effects");

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
  const warningLine = buildWarningLine(action);
  const adjudicationBonusLine = buildAdjudicationBonusLine(action, adjudication);
  const preRollLine = buildPreRollLine(action, adjudication);

  if (!adjudication.needsCheck) {
    return {
      kind: action.kind,
      adjudication,
      warningLine,
      adjudicationBonusLine,
      preRollLine,
      postRollLine: null,
      narrativeLine: action.onDirectSuccess || "行，这一下直接成了，场面往前走。",
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
    balanceNote: adjudication.balanceNote,
    leverageScore: adjudication.leverageScore,
    narrativeBonus: adjudication.narrativeBonus
  };
  event.outcome.stateChanges = buildStateChanges(action, adjudication, event.result.success);
  applyStateChanges(sessionState, event.outcome.stateChanges);
  event.contentEffects = applyContentEffects(sessionState, action, event.result.success, event.result.successLevel);
  event.outcome.nextPrompt = buildOutcomePrompt(action, event.result.success, adjudication, event.contentEffects);

  return {
    kind: action.kind,
    adjudication,
    warningLine,
    adjudicationBonusLine,
    preRollLine,
    postRollLine: buildPostRollLine(action, event),
    narrativeLine: buildNarrativeLine(action, event),
    event
  };
}

function buildOutcomePrompt(action, success, adjudication, contentEffects = {}) {
  if (action.kind === "talk" && contentEffects.intelLine) {
    return contentEffects.intelLine;
  }
  if (action.kind === "use_item" && contentEffects.revealedClues?.length) {
    return action.onSuccessPrompt || `你手上的东西还真把一层旧痕给撬开了。`;
  }
  if (success) {
    return action.onSuccessPrompt || `这一下成了，${adjudication.intent} 已经开始起作用了。`;
  }
  return action.onFailPrompt || `这一下没全照你想的来，不过事情已经往前拱了一点，代价落在 ${adjudication.failForward} 这边。`;
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