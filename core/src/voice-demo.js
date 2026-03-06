const { createCharacter, startSessionApi, addInvestigator, submitAction, getState } = require("./index");

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

function runVoiceDemo() {
  const session = startSessionApi({ sessionId: "voice-demo-001", summary: "旧教堂", location: "河谷旧教堂" });
  const investigator = createCharacter({
    id: "pc-voice-001",
    name: "苏晚",
    age: 26,
    occupationKey: "artist",
    persona: "胆子不大，但眼睛很尖",
    motivation: "想把怪事查到头",
    era: "depression_era_1920s",
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 60, APP: 70, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Spot Hidden", value: 65, tag: "investigation" },
      { key: "Persuade", value: 60, tag: "social" },
      { key: "Fighting", value: 35, tag: "action" }
    ],
    inventory: [{ name: "手电", category: "tool", quantity: 1 }]
  });
  addInvestigator(session, investigator);
  const random = scriptedRandom([31, 78]);

  const explore = submitAction(session, {
    kind: "explore",
    actorId: investigator.id,
    intent: "借着手电去看祭坛背后的刮痕",
    skillKey: "Spot Hidden",
    riskLevel: "medium",
    leverageScore: 2,
    narrativeBonus: 1,
    impactScore: 2,
    clueTitle: "祭坛背后的异常刮痕",
    mode: "hidden",
    onSuccessPrompt: "你确实看出不对了。那不像自然磨出来的痕，更像是有人反复把什么细长东西塞进去又拔出来。"
  }, random);

  const risky = submitAction(session, {
    kind: "risky_action",
    actorId: investigator.id,
    intent: "直接把祭坛下面那块木板掀开",
    skillKey: "Fighting",
    riskLevel: "high",
    leverageScore: 1,
    impactScore: 3,
    mode: "hidden",
    failureEventLabel: "教堂深处有东西被这声脆响惊醒了",
    onFailPrompt: "木板是掀开了，但那声脆响一下就在教堂里荡开了。你还没来得及往里细看，右边走廊深处先传来了一下很轻的拖擦声。"
  }, random);

  return { explore, risky, state: getState(session) };
}

if (require.main === module) {
  console.log(JSON.stringify(runVoiceDemo(), null, 2));
}

module.exports = { runVoiceDemo };
