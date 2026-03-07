const { createCharacter, startSessionApi, addInvestigator, submitAction, getState, loadSceneTemplate } = require("./index");

function scriptedRandom(values) {
  let index = 0;
  return function randomInt(min, max) {
    const value = values[index] ?? values[values.length - 1] ?? min;
    index += 1;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };
}

function runSceneDemo() {
  const scenario = loadSceneTemplate("old-church-night");
  const session = startSessionApi({ sessionId: "scene-demo-001", scenarioId: "old-church-night" });

  const investigator = createCharacter({
    id: "pc-scene-001",
    name: "苏晚",
    age: 26,
    occupationKey: "artist",
    persona: "胆子不大，但眼睛尖，写字和画图都很稳",
    motivation: "想把朋友留下来的怪线索查明白",
    era: "depression_era_1920s",
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 60, APP: 70, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" },
      { key: "Persuade", value: 60, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 25, tag: "social" },
      { key: "Psychology", value: 50, baseValue: 10, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" },
      { key: "Fighting", value: 35, baseValue: 25, occupationPointsSpent: 0, interestPointsSpent: 10, tag: "action" }
    ],
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "素描本", category: "tool", quantity: 1 }
    ]
  });

  addInvestigator(session, investigator);
  const random = scriptedRandom([28, 76, 33, 81]);

  const step1 = submitAction(session, {
    kind: "explore",
    actorId: investigator.id,
    intent: "借着手电去看祭坛背后的刮痕",
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
  }, random);

  const step2 = submitAction(session, {
    kind: "talk",
    actorId: investigator.id,
    intent: "我先安抚守墓人，再把话慢慢引到昨晚的钟声上",
    skillKey: "Persuade",
    targetNpc: "gravedigger",
    leverageScore: 1,
    narrativeBonus: 1,
    riskLevel: "low",
    impactScore: 1,
    revealClueId: "clue-wall-symbol",
    mode: "open"
  }, random);

  const step3 = submitAction(session, {
    kind: "use_item",
    actorId: investigator.id,
    intent: "我用素描本把墙上的符号临下来，再和朋友留下的图样对照",
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
  }, random);

  const step4 = submitAction(session, {
    kind: "risky_action",
    actorId: investigator.id,
    intent: "我直接把祭坛下面那块木板掀开",
    skillKey: "Fighting",
    leverageScore: 1,
    riskLevel: "high",
    impactScore: 3,
    mode: "hidden",
    failureEventLabel: "祭坛下的脆响把教堂深处的东西惊醒了",
    onFailPrompt: "木板是掀开了，但那声脆响一下就在教堂里荡开了。你刚看见底下有一截黑布，右边走廊深处就先传来了一下拖擦声。"
  }, random);

  return {
    intro: {
      title: scenario.title,
      opening: scenario.opening
    },
    steps: [step1, step2, step3, step4],
    state: getState(session)
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runSceneDemo(), null, 2));
}

module.exports = { runSceneDemo };
