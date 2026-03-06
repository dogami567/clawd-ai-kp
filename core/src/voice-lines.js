function pickBySeed(options, seedText = "") {
  if (!options.length) return null;
  let hash = 0;
  for (const char of String(seedText)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return options[hash % options.length];
}

function pickActionNoun(actionKind) {
  if (actionKind === "talk") return "交谈";
  if (actionKind === "explore") return "侦查";
  if (actionKind === "use_item") return "动作";
  if (actionKind === "risky_action") return "后果";
  return "这下";
}

function buildWarningLine(action) {
  if (action.kind !== "risky_action") return null;
  return pickBySeed([
    "行啊，你想搞事是不是？（盯——）这一下真弄下去，多半会闹出响。你确定还要继续吗？",
    "哎，你这手都伸到这儿了喔。我先提醒你一句，真碰下去，后面十有八九要出声。还来吗？",
    "能动，但我先把话放这儿：你这一下要是真掀了，后面可就没法装无事发生。你还要继续？"
  ], action.intent);
}

function buildPreRollLine(action, adjudication) {
  if (adjudication.needsCheck === false) return null;

  if (action.kind === "risky_action") {
    if (action.mode === "hidden") {
      return pickBySeed([
        "……好，那我真替你掷了。嘘，先别抬头，我看看先炸哪边。",
        "行，骰子我已经替你丢下去了。先安静一下，我看看这回是谁先倒霉。",
        "好嘛，这下我可真给你算后果了。别催，让我先偷看一眼。"
      ], action.intent);
    }
    return pickBySeed([
      "……行，那就真掷了喔。",
      "好，那这一下我不替你省了，直接看骰子。"
    ], action.intent);
  }

  if (action.kind === "explore") {
    if (action.mode === "hidden") {
      return pickBySeed([
        "这个我先替你暗骰一下。你先别吭声，我看看你到底摸到了哪一层。",
        "先别急，我替你偷偷看一眼。",
        "行，这个不直接报给你，我先暗里掷一下。"
      ], action.intent);
    }
    return pickBySeed([
      "来，先过个侦查。",
      "好，掷一下，看你这眼神今天站不站你这边。"
    ], action.intent);
  }

  if (action.kind === "talk") {
    return pickBySeed([
      "来，过个交谈，我看看他这回嘴松不松。",
      "好，这句值一个骰，我替你看他吃不吃这套。",
      "那就过个交谈喔，看看你这回能不能把话送进去。"
    ], action.intent);
  }

  if (action.kind === "use_item") {
    return pickBySeed([
      "行，把东西递上来看看。",
      "好，这玩意儿能不能搭上桥，先掷一下。",
      "来，我看看这东西这回给不给你面子。"
    ], action.intent + String(action.itemName || ""));
  }

  if (action.mode === "hidden") {
    return pickBySeed([
      "这个我先替你暗里掷一下。",
      "先别问，我先偷偷看一眼。"
    ], action.intent);
  }

  return `来，先过个${pickActionNoun(action.kind)}。`;
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
    if (action.kind === "talk") return pickBySeed(["哼，还真让你从他嘴边撬下来一点。", "行，他那口气真的松了一下。"], action.intent);
    if (action.kind === "explore") return pickBySeed(["你这眼神还真没白长。", "哎，还真让你瞄着了。"], action.intent);
    if (action.kind === "use_item") return pickBySeed(["行，这玩意儿还真给你搭上桥了。", "好，这东西这回真给你长脸了。"], action.intent);
    if (action.kind === "risky_action") return pickBySeed(["哎，这下居然真让你碰着了。", "还真给你莽出点东西来了。"], action.intent);
    return "成了，先别乱动，我把后劲接给你。";
  }

  if (action.kind === "talk") return pickBySeed(["他没全吃你这套，但也不是一点口子都没留。", "他还是防你，不过没防到死。"], action.intent);
  if (action.kind === "explore") return pickBySeed(["差一点，还没让你一把摸到底。", "你手是碰到了，但还差最后那半层。"], action.intent);
  if (action.kind === "use_item") return pickBySeed(["东西是用上了，但没顺到你最想要的那条线上。", "有点用，但没让你一把看透。"], action.intent);
  if (action.kind === "risky_action") {
    return pickBySeed(["哎哟，这下果然闹出声了。", "你看，还是让你搞出动静了吧。"], action.intent);
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