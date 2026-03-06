const { runCheck, runOpposedCheck } = require("./check-engine");

let checkSequence = 0;

function createSession({ sessionId, sceneId = "scene-intro-001", investigatorIds = [] }) {
  return {
    sessionId,
    scene: {
      sessionId,
      sceneId,
      sceneType: "intro",
      summary: "开场场景",
      location: "未知地点",
      timeState: {
        timelineMinute: 0,
        combatRound: 0,
        countdowns: []
      },
      participants: {
        investigators: investigatorIds,
        npcs: []
      },
      clues: [],
      events: [],
      threats: {
        exposure: 0,
        pressure: 0,
        dangerLevel: "low"
      },
      nextOptions: [
        { id: "opt-investigate", label: "开始调查", type: "investigate" },
        { id: "opt-talk", label: "接触 NPC", type: "talk" }
      ]
    },
    investigators: {},
    checkLog: [],
    settlement: null
  };
}

function registerInvestigator(sessionState, investigatorCard) {
  sessionState.investigators[investigatorCard.id] = investigatorCard;
  if (!sessionState.scene.participants.investigators.includes(investigatorCard.id)) {
    sessionState.scene.participants.investigators.push(investigatorCard.id);
  }
  return sessionState;
}

function startInvestigationScene(sessionState, payload = {}) {
  sessionState.scene.sceneType = "investigation";
  sessionState.scene.summary = payload.summary || "调查进行中";
  sessionState.scene.location = payload.location || sessionState.scene.location;
  sessionState.scene.nextOptions = [
    { id: "check-spot", label: "侦查现场", type: "investigate" },
    { id: "check-charm", label: "交涉取证", type: "talk" },
    { id: "goto-combat", label: "进入战斗", type: "fight" }
  ];
  return sessionState;
}

function applyFailForward(scene, failType) {
  const map = {
    time: () => {
      scene.timeState.timelineMinute += 10;
      scene.threats.pressure = Math.min(10, scene.threats.pressure + 1);
      return "你花了更多时间，压力上升。";
    },
    exposure: () => {
      scene.threats.exposure = Math.min(10, scene.threats.exposure + 2);
      return "你发出了动静，暴露风险提高。";
    },
    resource: () => "你成功推进，但消耗了一些资源。",
    relationship: () => "你拿到信息，但 NPC 态度变差。",
    misinfo: () => "你获得了线索，但其中包含误导。"
  };

  return (map[failType] || map.time)();
}

function performSkillCheck(sessionState, input, randomInt) {
  const actor = sessionState.investigators[input.actorId];
  if (!actor) {
    throw new Error(`Investigator not found: ${input.actorId}`);
  }

  const skill = actor.skills.find((item) => item.key === input.skillKey);
  if (!skill) {
    throw new Error(`Skill not found: ${input.skillKey}`);
  }

  const check = runCheck(
    {
      checkType: input.checkType || "normal",
      mode: input.mode || "open",
      skillKey: input.skillKey,
      difficulty: input.difficulty || "regular",
      targetValue: skill.value
    },
    randomInt
  );

  checkSequence += 1;
  const event = {
    id: `check-${Date.now()}-${checkSequence}`,
    sessionId: sessionState.sessionId,
    sceneId: sessionState.scene.sceneId,
    actorId: input.actorId,
    checkType: check.checkType,
    mode: check.mode,
    skillKey: input.skillKey,
    difficulty: check.difficulty,
    targetValue: check.targetValue,
    roll: check.roll,
    result: check.result,
    outcome: {
      narrative: "",
      cost: [],
      stateChanges: []
    },
    timestamp: new Date().toISOString()
  };

  if (check.result.success) {
    event.outcome.narrative = `检定成功（${check.result.successLevel}）。`;
  } else {
    const failType = input.failForward || "time";
    const narrative = applyFailForward(sessionState.scene, failType);
    event.outcome.narrative = `检定失败，但剧情推进：${narrative}`;
    event.outcome.cost.push({ kind: failType, value: 1 });
  }

  sessionState.checkLog.push(event);
  return event;
}

function startCombat(sessionState, enemies = []) {
  sessionState.scene.sceneType = "combat";
  sessionState.scene.timeState.combatRound = 1;
  sessionState.scene.participants.npcs = enemies;
  sessionState.scene.nextOptions = [
    { id: "combat-attack", label: "攻击", type: "fight" },
    { id: "combat-dodge", label: "闪避", type: "fight" },
    { id: "combat-move", label: "移动", type: "move" }
  ];
  return sessionState;
}

function resolveCombatRound(sessionState, action, randomInt) {
  const actor = sessionState.investigators[action.actorId];
  if (!actor) throw new Error("Combat actor missing");

  const actorCheck = runCheck(
    {
      checkType: "combat",
      mode: "open",
      skillKey: action.attackSkill,
      targetValue: action.attackValue,
      difficulty: "regular"
    },
    randomInt
  );

  const defendCheck = runCheck(
    {
      checkType: "combat",
      mode: "open",
      skillKey: action.defendSkill,
      targetValue: action.defendValue,
      difficulty: "regular"
    },
    randomInt
  );

  const winner = runOpposedCheck(actorCheck, defendCheck);
  let summary;

  if (winner === "actor") {
    const damage = Math.max(1, (action.baseDamage || 1) + (action.damageBonus || 0));
    summary = `攻击命中，造成 ${damage} 点伤害。`;
  } else if (winner === "opponent") {
    summary = "对手成功防御，未造成伤害。";
  } else {
    summary = "双方僵持，本轮未分胜负。";
  }

  const event = {
    round: sessionState.scene.timeState.combatRound,
    actorRoll: actorCheck.roll,
    actorLevel: actorCheck.result.successLevel,
    defendRoll: defendCheck.roll,
    defendLevel: defendCheck.result.successLevel,
    winner,
    summary
  };

  sessionState.scene.timeState.combatRound += 1;
  return event;
}

function runSanCheck(sessionState, payload, randomInt) {
  const actor = sessionState.investigators[payload.actorId];
  if (!actor) throw new Error("Investigator not found for SAN check");

  const sanCheck = runCheck(
    {
      checkType: "san",
      mode: payload.mode || "hidden",
      skillKey: "SAN",
      targetValue: actor.resources.san,
      difficulty: "regular"
    },
    randomInt
  );

  const loss = sanCheck.result.success ? payload.onSuccessLoss : payload.onFailLoss;
  actor.resources.san = Math.max(0, actor.resources.san - loss);

  return {
    actorId: payload.actorId,
    roll: sanCheck.roll,
    success: sanCheck.result.success,
    successLevel: sanCheck.result.successLevel,
    sanLoss: loss,
    sanNow: actor.resources.san
  };
}

function settleSession(sessionState) {
  sessionState.scene.sceneType = "settlement";
  const snapshot = Object.values(sessionState.investigators).map((item) => ({
    id: item.id,
    name: item.name,
    hp: item.resources.hp,
    san: item.resources.san,
    luck: item.resources.luck,
    conditions: item.status.conditions
  }));

  sessionState.settlement = {
    sessionId: sessionState.sessionId,
    generatedAt: new Date().toISOString(),
    investigatorSnapshots: snapshot,
    clueSummary: sessionState.scene.clues,
    eventCount: sessionState.checkLog.length,
    unresolved: sessionState.scene.events.filter((item) => !item.triggered).map((item) => item.label)
  };

  return sessionState.settlement;
}

module.exports = {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession
};
