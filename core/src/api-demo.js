const {
  createCharacter,
  startSessionApi,
  addInvestigator,
  submitAction,
  getState,
  settleSessionApi
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

function runApiDemo() {
  const investigator = createCharacter({
    id: "pc-api-001",
    name: "沈青",
    age: 31,
    occupationKey: "detective",
    creditRating: 28,
    persona: "谨慎、爱记笔记、对异常细节过敏",
    motivation: "想查清朋友失踪案",
    era: "depression_era_1920s",
    luck: 55,
    attributeAssignments: { STR: 60, CON: 50, DEX: 70, APP: 40, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 25, interestPointsSpent: 15, tag: "investigation" },
      { key: "Persuade", value: 40, baseValue: 10, occupationPointsSpent: 15, interestPointsSpent: 15, tag: "social" },
      { key: "Fighting", value: 55, baseValue: 25, occupationPointsSpent: 15, interestPointsSpent: 15, tag: "action" },
      { key: "Dodge", value: 50, baseValue: 20, occupationPointsSpent: 0, interestPointsSpent: 30, tag: "action" }
    ],
    inventory: [
      { name: "手枪", category: "weapon", quantity: 1 },
      { name: "撬锁工具", category: "tool", quantity: 1 },
      { name: "笔记本", category: "tool", quantity: 1 }
    ]
  });

  const session = startSessionApi({
    sessionId: "api-demo-001",
    summary: "深夜公寓失踪案",
    location: "河岸公寓"
  });

  const join = addInvestigator(session, investigator);
  const random = scriptedRandom([62, 18, 44, 67, 29]);

  const action1 = submitAction(session, {
    kind: "skill_check",
    actorId: investigator.id,
    skillKey: "Spot Hidden",
    mode: "hidden",
    failForward: "misinfo"
  }, random);

  const action2 = submitAction(session, {
    kind: "start_combat",
    enemies: [{ id: "cultist-1", name: "持刀教徒", attitude: "hostile", status: "active" }]
  });

  const action3 = submitAction(session, {
    kind: "combat_round",
    actorId: investigator.id,
    attackSkill: "Fighting",
    attackValue: 55,
    defendSkill: "Dodge",
    defendValue: 40,
    defenseMode: "fight_back",
    baseDamage: "1D4+1",
    damageBonusText: investigator.resources.damageBonusText,
    counterBaseDamage: "1D3"
  }, random);

  const action4 = submitAction(session, {
    kind: "san_check",
    actorId: investigator.id,
    mode: "hidden",
    onSuccessLoss: 0,
    onFailLoss: 3
  }, random);

  const state = getState(session);
  const settlement = settleSessionApi(session);

  return { investigator, join, action1, action2, action3, action4, state, settlement };
}

if (require.main === module) {
  console.log(JSON.stringify(runApiDemo(), null, 2));
}

module.exports = { runApiDemo };
