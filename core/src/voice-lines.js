function pickActionNoun(actionKind) {
  if (actionKind === "talk") return "交谈";
  if (actionKind === "explore") return "侦查";
  if (actionKind === "use_item") return "动作";
  if (actionKind === "risky_action") return "后果";
  return "这下";
}

function buildWarningLine(action) {
  if (action.kind !== "risky_action") return null;
  return "行啊，你想搞事是不是？（盯——）这一下真弄下去，多半会闹出响。你确定还要继续吗？";
}

function buildPreRollLine(action, adjudication) {
  if (adjudication.needsCheck === false) return null;

  if (action.mode === "hidden") {
    return "……好，这个我先替你暗骰一下，骰子咕噜咕噜转起来，你先别催。";
  }

  if (action.kind === "talk") {
    return "来，过个交谈。骰子咕噜咕噜转起来……";
  }

  if (action.kind === "risky_action") {
    return "……好，骰子已经丢下去了，嘘——";
  }

  return `来，先过个${pickActionNoun(action.kind)}。骰子咕噜咕噜转起来……`;
}

function buildAdjudicationBonusLine(action, adjudication) {
  if ((action.leverageScore ?? 0) >= 2 && action.kind === "talk") {
    return "这话递得蛮会挑地方，我给你往顺里放一点。";
  }
  if ((action.leverageScore ?? 0) >= 2 && action.kind === "explore") {
    return "你这下不是乱翻，是真顺着痕迹在摸，我让它更好撬一点。";
  }
  if (adjudication.impact === "large") {
    return "主意我收下了，但这口不能让你一把吃满，我会给你挂点代价。";
  }
  return null;
}

function buildPostRollLine(action, event) {
  if (!event?.result) return null;
  if (event.result.success) {
    if (action.kind === "talk") return "哼，还真给你撬开一点口子了。";
    if (action.kind === "explore") return "你这眼神还真没白带来。";
    if (action.kind === "use_item") return "行，这东西还真派上了用场。";
    return "成了，先别急，我把后面接给你。";
  }

  if (action.kind === "risky_action") {
    return "哎哟，这下果然闹出声了。";
  }
  return "没全按你想的来，不过也不是白忙。";
}

function buildNarrativeLine(action, event) {
  if (!event?.outcome?.narrative) return null;
  if (action.kind === "risky_action" && !event.result.success) {
    return action.onFailPrompt || "东西你是碰到了，但动静也一起放出去了，后面要开始变脸了。";
  }
  if (event.result.success && action.onSuccessPrompt) {
    return action.onSuccessPrompt;
  }
  return event.outcome.narrative;
}

module.exports = {
  buildWarningLine,
  buildPreRollLine,
  buildAdjudicationBonusLine,
  buildPostRollLine,
  buildNarrativeLine
};