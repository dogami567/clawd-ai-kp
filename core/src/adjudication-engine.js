function clampImpact(score) {
  if (score <= 1) return "small";
  if (score === 2) return "medium";
  return "large";
}

function chooseDifficulty(riskLevel, leverageScore) {
  if (riskLevel === "high" && leverageScore <= 1) return "hard";
  if (riskLevel === "extreme") return "extreme";
  if (leverageScore >= 3 && riskLevel === "low") return "regular";
  return "regular";
}

function chooseFailForward(riskLevel, actionKind) {
  if (actionKind === "talk") return "relationship";
  if (actionKind === "use_item") return "resource";
  if (riskLevel === "high") return "exposure";
  if (riskLevel === "extreme") return "time";
  return "misinfo";
}

function buildBasis(action, actor) {
  const basis = [];
  if (action.skillKey) basis.push(`skill:${action.skillKey}`);
  if (action.itemName) basis.push(`item:${action.itemName}`);
  if (action.intent) basis.push(`intent:${action.intent}`);
  if (actor?.occupationKey) basis.push(`occupation:${actor.occupationKey}`);
  if (Array.isArray(action.environmentTags)) {
    for (const tag of action.environmentTags) basis.push(`env:${tag}`);
  }
  return basis;
}

function buildNextPrompt(actionKind, success, riskLevel) {
  if (success) {
    if (actionKind === "explore") return "你发现了新的可调查细节，准备继续深挖还是先整理线索？";
    if (actionKind === "talk") return "对方开始松口了，你要追问核心问题还是先稳住关系？";
    if (actionKind === "use_item") return "道具发挥了作用，你要立刻推进还是先观察反馈？";
    return "局面出现变化了，你下一步准备怎么做？";
  }

  if (riskLevel === "high" || riskLevel === "extreme") {
    return "局面开始变危险了，你要硬着头皮继续，还是先收手调整？";
  }
  return "虽然没完全如愿，但局势还在推进，你要顺势补救还是换个思路？";
}

function adjudicateAction(sessionState, actor, action) {
  const leverageScore = Math.max(0, Math.min(3, action.leverageScore ?? 1));
  const riskLevel = action.riskLevel || "medium";
  const impact = clampImpact(action.impactScore ?? leverageScore);
  const needsCheck = action.needsCheck ?? Boolean(action.skillKey || action.riskLevel === "high" || action.riskLevel === "extreme");
  const difficulty = chooseDifficulty(riskLevel, leverageScore);
  const failForward = chooseFailForward(riskLevel, action.kind);
  const basis = buildBasis(action, actor);
  const duration = action.duration || (action.kind === "use_item" ? "1_round" : "instant");
  const balanceNote = action.balanceNote || (impact === "large" ? "效果偏强，若成功也应附带代价或缩短持续时间。" : "效果处于当前场景可接受范围。");

  return {
    intent: action.intent || action.kind,
    basis,
    impact,
    duration,
    balanceNote,
    riskLevel,
    needsCheck,
    difficulty,
    failForward,
    skillKey: action.skillKey,
    nextPrompt: buildNextPrompt(action.kind, false, riskLevel)
  };
}

module.exports = {
  adjudicateAction
};