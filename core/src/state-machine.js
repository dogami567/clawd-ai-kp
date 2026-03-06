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

function ensureCountdownList(sessionState) {
  sessionState.scene.timeState.countdowns = Array.isArray(sessionState.scene.timeState.countdowns)
    ? sessionState.scene.timeState.countdowns
    : [];
  return sessionState.scene.timeState.countdowns;
}

function findNpc(sessionState, npcId) {
  return (sessionState.scene.participants.npcs || []).find((item) => item.id === npcId || item.name === npcId) || null;
}

function updateDangerLevel(scene) {
  const total = Number(scene.threats.exposure || 0) + Number(scene.threats.pressure || 0);
  if (total >= 12) scene.threats.dangerLevel = "extreme";
  else if (total >= 8) scene.threats.dangerLevel = "high";
  else if (total >= 4) scene.threats.dangerLevel = "medium";
  else scene.threats.dangerLevel = "low";
}

function appendTriggeredEvent(sessionState, label, extra = {}) {
  sessionState.scene.events.push({
    id: extra.id || `event-${Date.now()}-${sessionState.scene.events.length + 1}`,
    label,
    triggered: true,
    triggerAtMinute: sessionState.scene.timeState.timelineMinute,
    ...extra
  });
}

function appendCountdown(sessionState, countdown) {
  const countdowns = ensureCountdownList(sessionState);
  countdowns.push({
    key: countdown.key || `countdown-${Date.now()}-${countdowns.length + 1}`,
    ...countdown
  });
}

function applyCountdownEffect(sessionState, countdown) {
  const npc = countdown.targetNpc ? findNpc(sessionState, countdown.targetNpc) : null;

  if (countdown.effect === "steal_discovery") {
    sessionState.scene.threats.exposure = Math.min(10, sessionState.scene.threats.exposure + 2);
    sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + 1);
    if (npc) {
      npc.trust = Math.max(-5, Number(npc.trust || 0) - 2);
      npc.attitude = npc.trust <= -2 ? "hostile" : "guarded";
      npc.socialState = npc.socialState || { suspicion: 0, fear: 0, affinity: 0, obligation: 0, flags: [] };
      npc.socialState.suspicion = Math.min(5, Number(npc.socialState.suspicion || 0) + 2);
      npc.socialState.flags = Array.isArray(npc.socialState.flags) ? npc.socialState.flags : [];
      if (!npc.socialState.flags.includes("theft_discovered")) npc.socialState.flags.push("theft_discovered");
    }
    appendTriggeredEvent(sessionState, countdown.label || `${countdown.targetNpc} 发现东西丢了，现场警觉明显上升。`);
    if (countdown.targetNpc) {
      appendCountdown(sessionState, {
        key: `search-sweep-${countdown.targetNpc}-${Date.now()}`,
        label: `${countdown.targetNpc} 开始回想刚刚靠近过自己的人，并在周围搜一圈。`,
        remaining: countdown.followupDelayMinutes ?? 5,
        unit: "minute",
        effect: "search_sweep",
        targetNpc: countdown.targetNpc,
        sourceCountdown: countdown.key
      });
    }
  }

  if (countdown.effect === "follow_alert") {
    sessionState.scene.threats.exposure = Math.min(10, sessionState.scene.threats.exposure + 1);
    sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + 1);
    if (npc) {
      npc.attitude = "guarded";
      npc.socialState = npc.socialState || { suspicion: 0, fear: 0, affinity: 0, obligation: 0, flags: [] };
      npc.socialState.suspicion = Math.min(5, Number(npc.socialState.suspicion || 0) + 1);
      npc.socialState.flags = Array.isArray(npc.socialState.flags) ? npc.socialState.flags : [];
      if (!npc.socialState.flags.includes("changes_route")) npc.socialState.flags.push("changes_route");
    }
    appendTriggeredEvent(sessionState, countdown.label || `${countdown.targetNpc} 开始疑神疑鬼，临时改了路线。`);
    appendCountdown(sessionState, {
      key: `route-shift-${countdown.targetNpc || "npc"}-${Date.now()}`,
      label: `${countdown.targetNpc} 为了甩尾，又拐进了另一段路线。`,
      remaining: countdown.routeShiftDelayMinutes ?? 4,
      unit: "minute",
      effect: "route_shift",
      targetNpc: countdown.targetNpc,
      routeHint: countdown.routeHint || "对方开始故意绕路"
    });
    if (countdown.escalateToReinforcements) {
      appendCountdown(sessionState, {
        key: `reinforcements-${countdown.targetNpc || "npc"}-${Date.now()}`,
        label: countdown.reinforcementLabel || "附近有人被悄悄招呼过来，局面开始变硬。",
        remaining: countdown.reinforcementDelayMinutes ?? 6,
        unit: "minute",
        effect: "reinforcements_arrive",
        targetNpc: countdown.targetNpc,
        amount: countdown.reinforcementAmount || 1
      });
    }
  }

  if (countdown.effect === "route_shift") {
    sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + 1);
    appendTriggeredEvent(sessionState, countdown.label || `${countdown.targetNpc} 按既定节奏转进下一段路线。`, {
      routeHint: countdown.routeHint || null
    });
  }

  if (countdown.effect === "search_sweep") {
    sessionState.scene.threats.exposure = Math.min(10, sessionState.scene.threats.exposure + 1);
    sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + 1);
    if (npc) {
      npc.socialState = npc.socialState || { suspicion: 0, fear: 0, affinity: 0, obligation: 0, flags: [] };
      npc.socialState.suspicion = Math.min(5, Number(npc.socialState.suspicion || 0) + 1);
      npc.socialState.flags = Array.isArray(npc.socialState.flags) ? npc.socialState.flags : [];
      if (!npc.socialState.flags.includes("searching_area")) npc.socialState.flags.push("searching_area");
    }
    appendTriggeredEvent(sessionState, countdown.label || `${countdown.targetNpc} 开始在附近找人和查漏补缺。`);
  }

  if (countdown.effect === "reinforcements_arrive") {
    const amount = Number(countdown.amount || 1);
    sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + amount + 1);
    sessionState.scene.threats.exposure = Math.min(10, sessionState.scene.threats.exposure + 1);
    appendTriggeredEvent(sessionState, countdown.label || "又有人赶到了现场，局面肉眼可见地紧起来。", {
      reinforcements: amount,
      sourceNpc: countdown.targetNpc || null
    });
  }

  if (countdown.effect === "opportunity_close") {
    appendTriggeredEvent(sessionState, countdown.label || "原本那扇还开着的窗口，现在已经慢慢合上了。", {
      closedOption: countdown.optionId || null,
      clueId: countdown.clueId || null
    });
    sessionState.scene.nextOptions = (sessionState.scene.nextOptions || []).filter((item) => item.id !== countdown.optionId);
  }

  updateDangerLevel(sessionState.scene);
}

function resolveSceneCountdowns(sessionState, progress = {}) {
  const countdowns = ensureCountdownList(sessionState);
  const minuteStep = Number(progress.minutes || 0);
  const roundStep = Number(progress.rounds || 0);
  const triggered = [];

  for (const countdown of countdowns) {
    if (countdown.unit === "minute" && minuteStep > 0) {
      countdown.remaining = Math.max(0, countdown.remaining - minuteStep);
    }
    if (countdown.unit === "round" && roundStep > 0) {
      countdown.remaining = Math.max(0, countdown.remaining - roundStep);
    }
    if (countdown.unit === "scene" && progress.scenes) {
      countdown.remaining = Math.max(0, countdown.remaining - Number(progress.scenes));
    }
  }

  const pending = [];
  for (const countdown of countdowns) {
    if (countdown.remaining === 0) {
      applyCountdownEffect(sessionState, countdown);
      triggered.push(countdown);
    } else {
      pending.push(countdown);
    }
  }

  sessionState.scene.timeState.countdowns = pending;
  return triggered;
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
    countdownsTriggered: [],
    timestamp: new Date().toISOString()
  };

  if (check.result.success) {
    event.outcome.narrative = `检定成功（${check.result.successLevel}）。`;
  } else {
    const failType = input.failForward || "time";
    const narrative = applyFailForward(sessionState.scene, failType);
    event.outcome.narrative = `检定失败，但剧情推进：${narrative}`;
    event.outcome.cost.push({ kind: failType, value: 1 });
    if (failType === "time") {
      event.countdownsTriggered = resolveSceneCountdowns(sessionState, { minutes: 10 });
    }
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
  event.countdownsTriggered = resolveSceneCountdowns(sessionState, { rounds: 1 });
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
    unresolved: sessionState.scene.events.filter((item) => !item.triggered).map((item) => item.label),
    pendingCountdowns: sessionState.scene.timeState.countdowns.map((item) => ({
      key: item.key,
      remaining: item.remaining,
      unit: item.unit,
      label: item.label
    }))
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
  settleSession,
  resolveSceneCountdowns,
  updateDangerLevel
};
