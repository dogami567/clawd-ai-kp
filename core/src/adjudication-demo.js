const {
  createCharacter,
  startSessionApi,
  addInvestigator,
  submitAction,
  getState
} = require("./index");

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

function runAdjudicationDemo() {
  const session = startSessionApi({
    sessionId: "adj-demo-001",
    summary: "废弃教堂夜探",
    location: "河谷旧教堂"
  });

  const investigator = createCharacter({
    id: "pc-adj-001",
    name: "苏晚",
    age: 26,
    occupationKey: "artist",
    persona: "胆子不大，但观察很细，也很会拿气氛做文章",
    motivation: "想确认朋友留下的怪异素描到底指向什么",
    era: "depression_era_1920s",
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 60, APP: 70, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Spot Hidden", value: 65, tag: "investigation" },
      { key: "Persuade", value: 60, tag: "social" },
      { key: "Psychology", value: 50, tag: "investigation" },
      { key: "Fighting", value: 35, tag: "action" }
    ],
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "素描本", category: "tool", quantity: 1 },
      { name: "小刀", category: "weapon", quantity: 1 }
    ]
  });

  addInvestigator(session, investigator);
  const random = scriptedRandom([31, 72, 48]);

  const explore = submitAction(session, {
    kind: "explore",
    actorId: investigator.id,
    intent: "借着手电细查祭坛背后的刮痕",
    skillKey: "Spot Hidden",
    riskLevel: "medium",
    leverageScore: 2,
    impactScore: 2,
    environmentTags: ["dark", "dusty", "ritual_site"],
    mode: "hidden",
    onSuccessPrompt: "你看见了更具体的痕迹，要继续追查来源还是先记录下来？"
  }, random);

  const talk = submitAction(session, {
    kind: "talk",
    actorId: investigator.id,
    intent: "安抚守墓人，试着套出他昨晚看见了什么",
    skillKey: "Persuade",
    riskLevel: "low",
    leverageScore: 2,
    impactScore: 1,
    environmentTags: ["npc_nervous"],
    mode: "open"
  }, random);

  const useItem = submitAction(session, {
    kind: "use_item",
    actorId: investigator.id,
    intent: "用素描本把墙上的符号快速临摹下来",
    itemName: "素描本",
    skillKey: "Psychology",
    riskLevel: "medium",
    leverageScore: 1,
    impactScore: 1,
    duration: "scene",
    environmentTags: ["occult_symbol"],
    mode: "open"
  }, random);

  const risky = submitAction(session, {
    kind: "risky_action",
    actorId: investigator.id,
    intent: "直接掀开祭坛下方的木板看看里面藏了什么",
    skillKey: "Fighting",
    riskLevel: "high",
    leverageScore: 1,
    impactScore: 3,
    environmentTags: ["unstable_floor", "unknown_presence"],
    mode: "open",
    onFailPrompt: "木板是掀开了，但动静太大，某种东西已经被惊动。"
  }, random);

  return {
    explore,
    talk,
    useItem,
    risky,
    state: getState(session)
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runAdjudicationDemo(), null, 2));
}

module.exports = { runAdjudicationDemo };
