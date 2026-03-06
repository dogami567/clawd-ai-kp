function ensureArray(value) {
  return Array.isArray(value) ? value : [];
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

function applyStateChanges(sessionState, stateChanges = []) {
  for (const change of stateChanges) {
    if (change.path === "scene.timeState.timelineMinute" && change.op === "inc") {
      sessionState.scene.timeState.timelineMinute += Number(change.value || 0);
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
      const npc = ensureArray(sessionState.scene.participants.npcs).find((item) => item.id === change.npcId || item.name === change.npcId);
      if (npc) {
        adjustNpcAttitude(npc, change.value);
      }
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
  return sessionState;
}

function buildStateChanges(action, adjudication, success) {
  const changes = [];

  if (action.kind === "explore") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 5 : 10 });
    if (success) {
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
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: 5 });
    if (action.targetNpc) {
      changes.push({ path: "scene.npcAttitude", op: "shift", npcId: action.targetNpc, value: success ? 1 : -1 });
    }
    if (!success) {
      changes.push({ path: "scene.threats.pressure", op: "inc", value: 1 });
      if (action.targetNpc) {
        changes.push({
          path: "scene.events",
          op: "append",
          value: {
            id: `npc-shift-${Date.now()}`,
            label: `${action.targetNpc} 对你起了戒心`,
            triggered: true
          }
        });
      }
    }
  }

  if (action.kind === "use_item") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: 3 });
    if (!success) {
      changes.push({ path: "scene.threats.pressure", op: "inc", value: 1 });
    }
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
    if (!success) {
      changes.push({ path: "scene.threats.exposure", op: "inc", value: 2 });
      if (action.targetNpc) {
        changes.push({ path: "scene.npcAttitude", op: "shift", npcId: action.targetNpc, value: -1 });
      }
    }
  }

  if (action.kind === "follow") {
    changes.push({ path: "scene.timeState.timelineMinute", op: "inc", value: success ? 10 : 5 });
    if (!success) {
      changes.push({ path: "scene.threats.exposure", op: "inc", value: 1 });
      if (action.targetNpc) {
        changes.push({ path: "scene.npcAttitude", op: "shift", npcId: action.targetNpc, value: -1 });
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