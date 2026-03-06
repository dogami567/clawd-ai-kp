const { loadNpcCard, mapSkillToMethod, responseStrengthToModifier, pickKnowledgeByOutcome } = require("./npc-cards");

function revealExistingClue(scene, clueId, quality) {
  const clue = (scene.clues || []).find((item) => item.id === clueId);
  if (!clue) return null;
  clue.revealed = true;
  if (quality) clue.quality = quality;
  return clue;
}

function buildTalkIntel(action, success, successLevel) {
  if (!action.targetNpc) return null;

  try {
    const card = loadNpcCard(action.targetNpc);
    const method = mapSkillToMethod(action.skillKey);
    const strength = responseStrengthToModifier(card.social?.respondsTo?.[method]);
    const effectiveSuccessLevel = success
      ? (successLevel === "extreme" || successLevel === "hard" ? `${successLevel}_success` : "regular_success")
      : "fail_forward";
    const hit = pickKnowledgeByOutcome(card, action.skillKey, effectiveSuccessLevel, success);
    if (hit) return hit.text;
    if (strength > 0 && success) return `${card.name} 明显松了口，但说得还是很慢，像是在边回忆边防着人。`;
  } catch {
  }

  const fallback = success
    ? `他终于松了口，提到：${action.topicHint || "昨晚确实有点不对劲"}`
    : `他还是防着你，但临走前漏了一句：${action.topicHint || "昨晚钟楼那边不太对"}`;
  return action.intelLine || fallback;
}

function removeNpcItem(sessionState, npcId, itemName) {
  const npc = (sessionState.scene.participants.npcs || []).find((item) => item.id === npcId || item.name === npcId);
  if (!npc) return false;
  npc.items = Array.isArray(npc.items) ? npc.items : [];
  if (!npc.items.includes(itemName)) return false;
  npc.items = npc.items.filter((item) => item !== itemName);
  return true;
}

function findNpc(sessionState, npcId) {
  return (sessionState.scene.participants.npcs || []).find((item) => item.id === npcId || item.name === npcId) || null;
}

function applyContentEffects(sessionState, action, success, successLevel) {
  const effects = {
    revealedClues: [],
    intelLine: null,
    routeLine: null,
    stolenItem: null
  };

  if (action.kind === "talk") {
    effects.intelLine = buildTalkIntel(action, success, successLevel);
    if (action.revealClueId) {
      const clue = revealExistingClue(sessionState.scene, action.revealClueId, success ? "partial" : "partial");
      if (clue) effects.revealedClues.push(clue);
    }
  }

  if (action.kind === "use_item") {
    if (action.revealClueId) {
      const clue = revealExistingClue(sessionState.scene, action.revealClueId, success ? (action.revealQuality || "partial") : "partial");
      if (clue) effects.revealedClues.push(clue);
    }
  }

  if (action.kind === "steal" && action.targetNpc && action.targetItem) {
    const npc = findNpc(sessionState, action.targetNpc);
    effects.intelLine = success
      ? `你手指一勾，${action.targetItem} 还真让你带出来了。`
      : `你这一下没偷利索，${action.targetNpc} 像是已经觉出点不对。`;
    if (success) {
      effects.stolenItem = action.targetItem;
      removeNpcItem(sessionState, action.targetNpc, action.targetItem);
      effects.aftermathLine = npc && action.targetItem === "钥匙串"
        ? `${npc.name} 过不了多久就会下意识去摸口袋。等他发现钥匙没了，人会立刻绷起来。`
        : null;
    }
  }

  if (action.kind === "follow" && action.targetNpc) {
    effects.intelLine = success
      ? `${action.targetNpc} 还没察觉你，路线倒是让你看了个七七八八。`
      : `${action.targetNpc} 走到半路忽然慢了一下，像是已经闻到后面有人了。`;
    if (success && Array.isArray(action.routineHints) && action.routineHints.length) {
      effects.routeLine = action.routineHints.join("；");
      effects.intelLine = `${effects.intelLine} 你看见他大概是这样走的：${effects.routeLine}`;
    }
  }

  return effects;
}

module.exports = {
  applyContentEffects
};