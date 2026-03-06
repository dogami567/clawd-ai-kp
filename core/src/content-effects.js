function revealExistingClue(scene, clueId, quality) {
  const clue = (scene.clues || []).find((item) => item.id === clueId);
  if (!clue) return null;
  clue.revealed = true;
  if (quality) clue.quality = quality;
  return clue;
}

function buildTalkIntel(action, success) {
  if (!action.targetNpc) return null;
  const fallback = success
    ? `他终于松了口，提到：${action.topicHint || "昨晚确实有点不对劲"}`
    : `他还是防着你，但临走前漏了一句：${action.topicHint || "昨晚钟楼那边不太对"}`;
  return action.intelLine || fallback;
}

function applyContentEffects(sessionState, action, success) {
  const effects = {
    revealedClues: [],
    intelLine: null
  };

  if (action.kind === "talk") {
    effects.intelLine = buildTalkIntel(action, success);
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

  return effects;
}

module.exports = {
  applyContentEffects
};