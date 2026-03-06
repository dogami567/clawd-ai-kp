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
    if (actionKind === "explore") return "你现在已经摸到一层皮了。还要继续往里抠，还是先把这点东西记稳？";
    if (actionKind === "talk") return "他嘴已经松了一点。你要趁热追一句，还是先顺着哄下去？";
    if (actionKind === "use_item") return "东西已经派上用场了。你要立刻顺着它往下追，还是先看看还有没有别的呼应？";
    return "这一下算是有回音了。你下一手准备往哪边伸？";
  }

  if (riskLevel === "high" || riskLevel === "extreme") {
    return "事情已经开始有点拧巴了。你还要硬顶，还是先缩半步看看？";
  }
  return "这下没全照你想的来，但线头还在。你要接着抻，还是换个手法？";
}

function adjudicateAction(sessionState, actor, action) {
  const narrativeBonus = Math.max(0, Math.min(2, action.narrativeBonus ?? 0));
  const leverageScore = Math.max(0, Math.min(3, (action.leverageScore ?? 1) + narrativeBonus));
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
    leverageScore,
    narrativeBonus,
    skillKey: action.skillKey,
    nextPrompt: buildNextPrompt(action.kind, false, riskLevel)
  };
}

module.exports = {
  adjudicateAction
};