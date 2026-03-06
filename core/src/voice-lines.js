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

  if (action.kind === "risky_action") {
    if (action.mode === "hidden") return "……好，骰子已经丢下去了，嘘——先别抬头，我看看会先响哪一边。";
    return "……行，那就真掷了喔。骰子咕噜咕噜转起来……";
  }

  if (action.kind === "explore") {
    if (action.mode === "hidden") return "这个我先替你暗骰一下。骰子咕噜咕噜转起来……你先别催，我看你到底摸到了哪一层。";
    return "来，先过个侦查。骰子咕噜咕噜转起来……";
  }

  if (action.kind === "talk") {
    return "来，过个交谈。骰子咕噜咕噜转起来……我看看他这回到底松不松口。";
  }

  if (action.kind === "use_item") {
    return "行，把东西递上来看看。骰子咕噜咕噜转起来……";
  }

  if (action.mode === "hidden") {
    return "……好，这个我先替你暗骰一下，骰子咕噜咕噜转起来，你先别催。";
  }

  return `来，先过个${pickActionNoun(action.kind)}。骰子咕噜咕噜转起来……`;
}

function buildAdjudicationBonusLine(action, adjudication) {
  if ((action.narrativeBonus ?? 0) >= 1 && action.kind === "talk") {
    return "你这段不是在堆字，是真的往他软处递了，我给你放松一点。";
  }
  if ((action.narrativeBonus ?? 0) >= 1 && action.kind === "explore") {
    return "你这下不是瞎摸，是顺着现场留下来的气味在找，我让它更好撬一点。";
  }
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
    if (action.kind === "talk") return "哼，还真让你从他嘴边撬下来一点。";
    if (action.kind === "explore") return "你这眼神还真没白长。";
    if (action.kind === "use_item") return "行，这玩意儿还真给你搭上桥了。";
    if (action.kind === "risky_action") return "哎，这下居然真让你碰着了。";
    return "成了，先别乱动，我把后劲接给你。";
  }

  if (action.kind === "talk") return "他没全吃你这套，但也不是一点口子都没留。";
  if (action.kind === "explore") return "差一点，还没让你一把摸到底。";
  if (action.kind === "use_item") return "东西是用上了，但没顺到你最想要的那条线上。";
  if (action.kind === "risky_action") {
    return "哎哟，这下果然闹出声了。";
  }
  return "没全照你想的来，不过线头还在。";
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