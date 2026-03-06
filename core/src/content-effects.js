const { loadNpcCard, mapSkillToMethod, responseStrengthToModifier, pickKnowledgeByOutcome, methodResponseProfile } = require("./npc-cards");

function revealExistingClue(scene, clueId, quality) {
  const clue = (scene.clues || []).find((item) => item.id === clueId);
  if (!clue) return null;
  clue.revealed = true;
  if (quality) clue.quality = quality;
  return clue;
}

function findNpc(sessionState, npcId) {
  return (sessionState.scene.participants.npcs || []).find((item) => item.id === npcId || item.name === npcId) || null;
}

function buildSocialAftermath(card, action, success, successLevel) {
  const method = action.interactionStyle || mapSkillToMethod(action.skillKey);
  const profile = methodResponseProfile(card, method);
  const base = {
    method,
    responseStrength: profile.strength,
    nextStateHint: null,
    extraCost: null,
    intelLine: null
  };

  if (method === "persuade") {
    base.nextStateHint = success ? `${card.name} 觉得你至少是在讲道理，之后再问同类问题会顺手一点。` : `${card.name} 还是防着你，但暂时没把门彻底关死。`;
  }

  if (method === "charm") {
    base.nextStateHint = success
      ? `${card.name} 被你哄得松了点，未必立刻交底，但会记住你这个人。`
      : `${card.name} 听得出来你在往软处贴，嘴上没松，心里倒未必真反感。`;
  }

  if (method === "intimidate") {
    base.nextStateHint = success
      ? `${card.name} 是被你压住了，可这口气他大概率会记着。`
      : `${card.name} 脸色立刻硬了，后面再想温和聊就更难。`;
  }

  if (method === "bribery") {
    base.extraCost = success ? "你得真的掏出点能打动他的好处。" : "这点价码没砸开，反而像在拿人当叫花子。";
    base.nextStateHint = success
      ? `${card.name} 会把这事记成一次交易，后面可能还会继续要价。`
      : `${card.name} 对你这套更警惕了，尤其会盯着你的钱和来意。`;
  }

  if (success) {
    const successTag = successLevel === "extreme" || successLevel === "hard" ? `${successLevel}_success` : "regular_success";
    const directIntel = pickKnowledgeByOutcome(card, action.skillKey, successTag, true);
    if (directIntel) base.intelLine = directIntel.text;
  }

  return base;
}

function buildTalkIntel(action, success, successLevel) {
  if (!action.targetNpc) return null;

  try {
    const card = loadNpcCard(action.targetNpc);
    const method = action.interactionStyle || mapSkillToMethod(action.skillKey);
    const strength = responseStrengthToModifier(card.social?.respondsTo?.[method]);
    const effectiveSuccessLevel = success
      ? (successLevel === "extreme" || successLevel === "hard" ? `${successLevel}_success` : "regular_success")
      : "fail_forward";
    const hit = pickKnowledgeByOutcome(card, action.skillKey, effectiveSuccessLevel, success);
    const aftermath = buildSocialAftermath(card, action, success, successLevel);

    if (hit?.text && method === "intimidate" && success) {
      return `${hit.text} ${aftermath.nextStateHint}`;
    }
    if (hit?.text && method === "bribery" && success) {
      return `${hit.text} ${aftermath.extraCost} ${aftermath.nextStateHint}`;
    }
    if (hit?.text && method === "charm" && success) {
      return `${card.name} 先是被你哄得眼神松了一寸，随后才低声补了一句：${hit.text} ${aftermath.nextStateHint}`;
    }
    if (hit) return `${hit.text} ${aftermath.nextStateHint}`;
    if (method === "charm") {
      return success
        ? `${card.name} 没一下子把关键东西全吐出来，但态度明显软了。${aftermath.nextStateHint}`
        : `${card.name} 被你哄得没翻脸，却也没真交底。${aftermath.nextStateHint}`;
    }
    if (strength > 0 && success) return `${card.name} 明显松了口，但说得还是很慢，像是在边回忆边防着人。${aftermath.nextStateHint}`;
    return aftermath.nextStateHint;
  } catch {
  }

  const fallback = success
    ? `他终于松了口，提到：${action.topicHint || "昨晚确实有点不对劲"}`
    : `他还是防着你，但临走前漏了一句：${action.topicHint || "昨晚钟楼那边不太对"}`;
  return action.intelLine || fallback;
}

function removeNpcItem(sessionState, npcId, itemName) {
  const npc = findNpc(sessionState, npcId);
  if (!npc) return false;
  npc.items = Array.isArray(npc.items) ? npc.items : [];
  if (!npc.items.includes(itemName)) return false;
  npc.items = npc.items.filter((item) => item !== itemName);
  return true;
}

function applyContentEffects(sessionState, action, success, successLevel) {
  const effects = {
    revealedClues: [],
    intelLine: null,
    routeLine: null,
    stolenItem: null,
    aftermathLine: null,
    socialAftermath: null
  };

  if (action.kind === "talk") {
    effects.intelLine = buildTalkIntel(action, success, successLevel);
    if (action.targetNpc) {
      try {
        const card = loadNpcCard(action.targetNpc);
        effects.socialAftermath = buildSocialAftermath(card, action, success, successLevel);
        effects.aftermathLine = effects.socialAftermath.nextStateHint;
      } catch {
      }
    }
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
