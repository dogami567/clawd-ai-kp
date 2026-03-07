function normalizeText(text = "") {
  return String(text).trim().toLowerCase();
}

function hasAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function findInvestigatorSkill(investigator, skillKey) {
  return investigator.skills.find((item) => item.key === skillKey) || null;
}

function routeOldChurchNightAction(text, actorId) {
  const normalized = normalizeText(text);

  if (hasAny(normalized, ["刮痕", "祭坛背后", "看看祭坛", "调查祭坛", "侦查祭坛", "spot hidden"])) {
    return {
      kind: "explore",
      actorId,
      intent: text,
      skillKey: "Spot Hidden",
      leverageScore: 2,
      narrativeBonus: 1,
      riskLevel: "medium",
      impactScore: 2,
      clueTitle: "祭坛背后的异常刮痕",
      clueKind: "core",
      clueQuality: "clear",
      mode: "hidden",
      onSuccessPrompt: "你确实看出不对了。那不像自然磨出来的痕，更像是有人反复把什么细长东西塞进去又拔出来。祭坛下面多半有个能开的口子。"
    };
  }

  if (hasAny(normalized, ["守墓人", "钟声", "钟楼", "聊", "套话", "安抚"])) {
    return {
      kind: "talk",
      actorId,
      intent: text,
      skillKey: "Persuade",
      targetNpc: "gravedigger",
      leverageScore: 1,
      narrativeBonus: 1,
      riskLevel: "low",
      impactScore: 1,
      revealClueId: "clue-wall-symbol",
      mode: "open"
    };
  }

  if (hasAny(normalized, ["素描", "临", "符号", "画下来", "抄下来", "记录符号"])) {
    return {
      kind: "use_item",
      actorId,
      intent: text,
      itemName: "素描本",
      skillKey: "Psychology",
      leverageScore: 1,
      narrativeBonus: 1,
      riskLevel: "medium",
      impactScore: 1,
      duration: "scene",
      revealClueId: "clue-wall-symbol",
      revealQuality: "clear",
      clueTitle: "重描后的旧符号轮廓",
      clueKind: "partial",
      clueQuality: "partial",
      mode: "open",
      onSuccessPrompt: "你把线条拆开一层层临下来后，终于看出来了：这不是一笔成形的符号，而是有人在旧痕上不断补写。"
    };
  }

  if (hasAny(normalized, ["掀开木板", "木板掀开", "掀木板", "掀开祭坛", "祭坛下面那块木板", "直接掀", "强行打开", "撬开祭坛"])) {
    return {
      kind: "risky_action",
      actorId,
      intent: text,
      skillKey: "Fighting",
      leverageScore: 1,
      riskLevel: "high",
      impactScore: 3,
      mode: "hidden",
      failureEventLabel: "祭坛下的脆响把教堂深处的东西惊醒了",
      onFailPrompt: "木板是掀开了，但那声脆响一下就在教堂里荡开了。你刚看见底下有一截黑布，右边走廊深处就先传来了一下拖擦声。"
    };
  }

  if (hasAny(normalized, ["跟踪守墓人", "跟着守墓人", "尾随守墓人"])) {
    return {
      kind: "follow",
      actorId,
      intent: text,
      skillKey: "Stealth",
      targetNpc: "gravedigger",
      riskLevel: "medium",
      impactScore: 2,
      leverageScore: 1,
      routineHints: ["他傍晚会绕墓地和钟楼下巡一圈", "听见教堂异响时会先停一下，再提灯过去"]
    };
  }

  return null;
}

function routeScenarioAction(sessionState, actorId, text) {
  const scenarioId = sessionState?.scene?.meta?.scenarioId;
  if (scenarioId === "old-church-night") {
    return routeOldChurchNightAction(text, actorId);
  }
  return null;
}

function processScenarioTurn(sessionState, actorId, text, submitAction, randomInt) {
  const investigator = sessionState.investigators[actorId];
  if (!investigator) {
    return {
      ok: false,
      reason: "missing_actor",
      reply: "这位调查员还没进场，我现在没法替他落动作。"
    };
  }

  const action = routeScenarioAction(sessionState, actorId, text);
  if (!action) {
    return {
      ok: false,
      reason: "unmatched_action",
      reply: "这句我先没稳稳对上现成动作。你可以试着说得更具体一点，比如查祭坛、聊守墓人、临符号、或者直接掀木板。"
    };
  }

  const requiredSkill = findInvestigatorSkill(investigator, action.skillKey);
  if (!requiredSkill) {
    return {
      ok: false,
      reason: "missing_skill",
      action,
      reply: `我听懂你想做什么了，但这名调查员现在卡里没有 ${action.skillKey}，这一步我还不能稳稳落。`
    };
  }

  return {
    ok: true,
    action,
    result: submitAction(sessionState, action, randomInt)
  };
}

module.exports = {
  normalizeText,
  routeOldChurchNightAction,
  routeScenarioAction,
  processScenarioTurn
};
