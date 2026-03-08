function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureNpcSocialState(npc) {
  npc.socialState = npc.socialState || {
    suspicion: 0,
    fear: 0,
    affinity: 0,
    obligation: 0,
    flags: [],
    lastInteractionStyle: null
  };
  npc.socialState.flags = ensureArray(npc.socialState.flags);
  return npc.socialState;
}

function updateDangerLevel(scene) {
  const pressure = scene.threats.pressure || 0;
  const exposure = scene.threats.exposure || 0;
  const total = pressure + exposure;

  if (total >= 12) scene.threats.dangerLevel = "extreme";
  else if (total >= 8) scene.threats.dangerLevel = "high";
  else if (total >= 4) scene.threats.dangerLevel = "medium";
  else scene.threats.dangerLevel = "low";
}

function adjustNpcAttitude(npc, delta) {
  npc.trust = Math.max(-5, Math.min(5, Number(npc.trust || 0) + Number(delta || 0)));
  if (npc.trust >= 2) npc.attitude = "friendly";
  else if (npc.trust >= 0) npc.attitude = "neutral";
  else if (npc.trust >= -2) npc.attitude = "guarded";
  else npc.attitude = "hostile";
}

function findNpc(sessionState, npcId) {
  return ensureArray(sessionState.scene.participants.npcs).find((item) => item.id === npcId || item.name === npcId) || null;
}

function applySocialStateChange(npc, field, delta = 0) {
  const socialState = ensureNpcSocialState(npc);
  socialState[field] = Math.max(0, Math.min(5, Number(socialState[field] || 0) + Number(delta || 0)));
}

function appendSocialFlag(npc, value) {
  if (!value) return;
  const socialState = ensureNpcSocialState(npc);
  if (!socialState.flags.includes(value)) socialState.flags.push(value);
}

function buildCountdown(change, sessionState) {
  if (!change.value) return null;
  const value = { ...change.value };

  if (!value.key) {
    value.key = `countdown-${Date.now()}-${ensureArray(sessionState.scene.timeState.countdowns).length + 1}`;
  }
  if (!Number.isInteger(value.remaining) || value.remaining < 0) {
    throw new Error(`Invalid countdown remaining value: ${value.remaining}`);
  }
  if (!["minute", "round", "scene"].includes(value.unit)) {
    throw new Error(`Invalid countdown unit: ${value.unit}`);
  }
  return value;
}

function applyStateChanges(sessionState, stateChanges = []) {
  const timeProgress = { minutes: 0, rounds: 0, scenes: 0 };

  for (const change of stateChanges) {
    if (change.path === "scene.timeState.timelineMinute" && change.op === "inc") {
      const delta = Number(change.value || 0);
      sessionState.scene.timeState.timelineMinute += delta;
      timeProgress.minutes += delta;
    }

    if (change.path === "scene.timeState.countdowns" && change.op === "append") {
      sessionState.scene.timeState.countdowns = ensureArray(sessionState.scene.timeState.countdowns);
      sessionState.scene.timeState.countdowns.push(buildCountdown(change, sessionState));
    }

    if (change.path === "scene.threats.exposure" && change.op === "inc") {
      sessionState.scene.threats.exposure = Math.min(10, sessionState.scene.threats.exposure + Number(change.value || 0));
    }

    if (change.path === "scene.threats.pressure" && change.op === "inc") {
      sessionState.scene.threats.pressure = Math.min(10, sessionState.scene.threats.pressure + Number(change.value || 0));
    }

    if (change.path === "scene.clues" && change.op === "append") {
      sessionState.scene.clues = ensureArray(sessionState.scene.clues);
      sessionState.scene.clues.push(change.value);
    }

    if (change.path === "scene.events" && change.op === "append") {
      sessionState.scene.events = ensureArray(sessionState.scene.events);
      sessionState.scene.events.push(change.value);
    }

    if (change.path === "scene.participants.npcs" && change.op === "append") {
      sessionState.scene.participants.npcs = ensureArray(sessionState.scene.participants.npcs);
      sessionState.scene.participants.npcs.push(change.value);
    }

    if (change.path === "scene.npcAttitude" && change.op === "shift") {
      const npc = findNpc(sessionState, change.npcId);
      if (npc) adjustNpcAttitude(npc, change.value);
    }

    if (change.path === "scene.npcSocialState" && change.op === "shift") {
      const npc = findNpc(sessionState, change.npcId);
      if (npc && change.field) applySocialStateChange(npc, change.field, change.value);
    }

    if (change.path === "scene.npcSocialFlag" && change.op === "append") {
      const npc = findNpc(sessionState, change.npcId);
      if (npc) appendSocialFlag(npc, change.value);
    }

    if (change.path === "scene.npcSocialState.lastInteractionStyle" && change.op === "set") {
      const npc = findNpc(sessionState, change.npcId);
      if (npc) ensureNpcSocialState(npc).lastInteractionStyle = change.value;
    }

    if (change.path === "investigator.status.conditions" && change.op === "append") {
      const investigator = sessionState.investigators[change.actorId];
      if (investigator) {
        investigator.status.conditions = ensureArray(investigator.status.conditions);
        investigator.status.conditions.push(change.value);
      }
    }
  }

  updateDangerLevel(sessionState.scene);
  return timeProgress;
}

function buildTalkStateChanges(action, success) {
  const style = action.interactionStyle || "persuade";
  const targetNpc = action.targetNpc;
  const changes = [
    { path: "scene.timeState.timelineMinute", op: "inc", value: 5 },
    { path: "scene.npcSocialState.lastInteractionStyle", op: "set", npcId: targetNpc, value: style }
  ];

  if (!targetNpc) return changes;

  if (style === "persuade") {
    changes.push({ path: "scene.npcAttitude", op: "shift", npcId: targetNpc, value: success ? 1 : -1 });
    if (success) changes.push({ path: "scene.npcSocialFlag", op: "append", npcId: targetNpc, value: "reasoned_with" });
  }

  if (style === "charm") {
    changes.push({ path: "scene.npcSocialState", op: "shift", npcId: targetNpc, field: "affinity", value: success ? 2 : 1 });
    changes.push({ path: "scene.npcAttitude", op: "shift", npcId: targetNpc, value: success ? 1 : 0 });
    changes.push({ path: "scene.npcSocialFlag", op: "append", npcId: targetNpc, value: success ? "softened_by_charm" : "remembers_flattery" });
  }

  if (style === "intimidate") {
    changes.push({ path: "scene.npcSocialState", op: "shift", npcId: targetNpc, field: "fear", value: success ? 2 : 1 });
    changes.push({ path: "scene.npcAttitude", op: "shift", npcId: targetNpc, value: -1 });
    changes.push({ path: "scene.threats.exposure", op: "inc", value: success ? 1 : 2 });
    changes.push({ path: "scene.npcSocialFlag", op: "append", npcId: targetNpc, value: success ? "cowed" : "resents_threat" });
  }

  if (style === "bribery") {
    changes.push({ path: "scene.npcSocialState", op: "shift", npcId: targetNpc, field: "obligation", value: success ? 2 : 0 });
    changes.push({ path: "scene.npcAttitude", op: "shift", npcId: targetNpc, value: success ? 0 : -1 });
    changes.push({ path: "scene.npcSocialFlag", op: "append", npcId: targetNpc, value: success ? "took_money" : "insulted_by_offer" });
  }

  if (!success) {
    changes.push({ path: "scene.threats.pressure", op: "inc", value: 1 });
    changes.push({ path: "scene.npcSocialState", op: "shift", npcId: targetNpc, field: "suspicion", value: style === "charm" ? 0 : 1 });
    changes.push({
      path: "scene.events",
      op: "append",
      value: {
        id: `npc-shift-${Date.now()}`,
        label: `${targetNpc} 对你起了戒心`,
        triggered: true
      }
    });
  }

  return changes;
}

function buildStateChanges(action, adjudication, success) {
  const changes = [];

  if (action.kind === "explore") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 5 : 10 });
    if (success && !action.revealClueId) {
      changes.push({
        path: "scene.clues",
        op: "append",
        value: {
          id: `clue-${Date.now()}`,
          title: action.clueTitle || action.intent,
          kind: success && adjudication.impact === "large" ? "core" : (action.clueKind || "optional"),
          quality: action.clueQuality || (success ? "clear" : "partial"),
          revealed: true,
          source: action.skillKey || "explore"
        }
      });
    }
  }

  if (action.kind === "talk") {
    changes.push(...buildTalkStateChanges(action, success));
  }

  if (action.kind === "use_item") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: 3 });
    if (!success) changes.push({ path: "scene.threats.pressure", op: "inc", value: 1 });
  }

  if (action.kind === "risky_action") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 2 : 6 });
    changes.push({ path: "scene.threats.exposure", op: "inc", value: success ? 1 : 2 });
    if (!success) {
      changes.push({
        path: "scene.events",
        op: "append",
        value: {
          id: `threat-awake-${Date.now()}`,
          label: action.failureEventLabel || "某个潜伏的东西被惊动了",
          triggered: true
        }
      });
    }
  }

  if (action.kind === "steal") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 1 : 2 });
    if (success) {
      changes.push({
        path: "scene.timeState.countdowns",
        op: "append",
        value: {
          key: `steal-discovery-${action.targetNpc || "npc"}-${Date.now()}`,
          label: action.delayedDiscoveryLabel || `${action.targetNpc} 过了一阵才发现失物不见。`,
          remaining: action.discoveryDelayMinutes ?? 5,
          unit: "minute",
          effect: "steal_discovery",
          targetNpc: action.targetNpc,
          targetItem: action.targetItem,
          followupDelayMinutes: action.searchSweepDelayMinutes ?? 5
        }
      });
    } else {
      changes.push({ path: "scene.threats.exposure", op: "inc", value: 2 });
      if (action.targetNpc) {
        changes.push({ path: "scene.npcAttitude", op: "shift", npcId: action.targetNpc, value: -1 });
        changes.push({ path: "scene.npcSocialState", op: "shift", npcId: action.targetNpc, field: "suspicion", value: 2 });
        changes.push({
          path: "scene.timeState.countdowns",
          op: "append",
          value: {
            key: `steal-aftershock-${action.targetNpc}-${Date.now()}`,
            label: `${action.targetNpc} 越想越不对，开始摸口袋清点东西。`,
            remaining: action.discoveryDelayMinutes ?? 2,
            unit: "minute",
            effect: "steal_discovery",
            targetNpc: action.targetNpc,
            targetItem: action.targetItem
          }
        });
      }
    }
  }

  if (action.kind === "follow") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 10 : 5 });
    if (success) {
      changes.push({
        path: "scene.timeState.countdowns",
        op: "append",
        value: {
          key: `follow-route-shift-${action.targetNpc || "npc"}-${Date.now()}`,
          label: action.routeShiftLabel || `${action.targetNpc} 再过一段时间会转去下一处地点。`,
          remaining: action.routeShiftDelayMinutes ?? 15,
          unit: "minute",
          effect: "route_shift",
          targetNpc: action.targetNpc,
          routeHint: Array.isArray(action.routineHints) ? action.routineHints.join("；") : null
        }
      });
    } else {
      changes.push({ path: "scene.threats.exposure", op: "inc", value: 1 });
      if (action.targetNpc) {
        changes.push({ path: "scene.npcAttitude", op: "shift", npcId: action.targetNpc, value: -1 });
        changes.push({ path: "scene.npcSocialState", op: "shift", npcId: action.targetNpc, field: "suspicion", value: 1 });
        changes.push({
          path: "scene.timeState.countdowns",
          op: "append",
          value: {
            key: `follow-alert-${action.targetNpc}-${Date.now()}`,
            label: action.followAlertLabel || `${action.targetNpc} 很快会彻底确认有人跟着，并换一条更绕的路。`,
            remaining: action.followAlertDelayMinutes ?? 8,
            unit: "minute",
            effect: "follow_alert",
            targetNpc: action.targetNpc,
            routeShiftDelayMinutes: action.routeShiftDelayMinutes ?? 4,
            escalateToReinforcements: action.escalateToReinforcements ?? true,
            reinforcementDelayMinutes: action.reinforcementDelayMinutes ?? 6,
            reinforcementAmount: action.reinforcementAmount ?? 1
          }
        });
      }
    }
  }

  return changes;
}

module.exports = {
  applyStateChanges,
  buildStateChanges,
  updateDangerLevel
};
