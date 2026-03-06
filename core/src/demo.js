const {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession,
  createInvestigatorFromQuickFire,
  listOccupationTemplates
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

function buildDemoInvestigator() {
  return createInvestigatorFromQuickFire({
    id: "pc-001",
    name: "林默",
    age: 27,
    occupationKey: "journalist",
    creditRating: 20,
    persona: "好奇心强，遇事先记录再行动",
    motivation: "想查清病院旧案真相",
    era: "depression_era_1920s",
    luck: 45,
    attributeAssignments: {
      STR: 50,
      CON: 60,
      DEX: 60,
      APP: 50,
      POW: 70,
      INT: 80,
      SIZ: 40,
      EDU: 50
    },
    skills: [
      { key: "Spot Hidden", value: 60, baseValue: 25, occupationPointsSpent: 25, interestPointsSpent: 10, tag: "investigation" },
      { key: "Persuade", value: 55, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 20, tag: "social" },
      { key: "Fighting", value: 50, baseValue: 25, occupationPointsSpent: 0, interestPointsSpent: 25, tag: "action" },
      { key: "Dodge", value: 40, baseValue: 20, occupationPointsSpent: 0, interestPointsSpent: 20, tag: "action" }
    ],
    inventory: [
      { name: "笔记本", category: "tool", quantity: 1 },
      { name: "手电", category: "tool", quantity: 1 },
      { name: "智能手机", category: "tool", quantity: 1 }
    ]
  });
}

function runDemo() {
  const session = createSession({ sessionId: "demo-coc7-v01", investigatorIds: [] });
  const occupations = listOccupationTemplates();
  const investigator = buildDemoInvestigator();

  registerInvestigator(session, investigator);
  startInvestigationScene(session, { summary: "进入废弃病院调查", location: "静海路病院" });

  const random = scriptedRandom([73, 22, 87, 41]);

  const check1 = performSkillCheck(
    session,
    { actorId: investigator.id, skillKey: "Spot Hidden", mode: "hidden", failForward: "exposure" },
    random
  );

  const check2 = performSkillCheck(
    session,
    { actorId: investigator.id, skillKey: "Persuade", mode: "open", failForward: "time" },
    random
  );

  startCombat(session, [
    { id: "npc-001", name: "狂信徒", attitude: "hostile", status: "active" }
  ]);

  const target = createInvestigatorFromQuickFire({
    id: "pc-target-001",
    name: "梁夜",
    age: 33,
    occupationKey: "veteran",
    creditRating: 15,
    persona: "受雇护卫",
    motivation: "挡住所有可疑人物",
    era: "depression_era_1920s",
    luck: 50,
    attributeAssignments: { STR: 60, CON: 70, DEX: 50, APP: 40, POW: 50, INT: 80, SIZ: 60, EDU: 50 },
    skills: [
      { key: "Dodge", interestPointsSpent: 10, value: 35 },
      { key: "Fighting", occupationPointsSpent: 20, interestPointsSpent: 10, value: 55 }
    ],
    inventory: []
  });
  registerInvestigator(session, target);

  const combat = resolveCombatRound(
    session,
    {
      actorId: investigator.id,
      targetActorId: target.id,
      attackSkill: "Fighting",
      attackValue: investigator.skills.find((item) => item.key === "Fighting").value,
      defendSkill: "Dodge",
      defendValue: target.skills.find((item) => item.key === "Dodge").value,
      defenseMode: "dodge",
      weaponKey: "club",
      damageBonusText: investigator.resources.damageBonusText
    },
    random
  );

  const san = runSanCheck(
    session,
    { actorId: investigator.id, mode: "hidden", onSuccessLoss: 1, onFailLoss: 4 },
    random
  );

  const settlement = settleSession(session);

  return {
    occupations: occupations.map((item) => ({ key: item.key, name: item.name, formula: item.occupationSkillFormula, creditRatingRange: item.creditRatingRange })),
    investigatorPreview: {
      id: investigator.id,
      name: investigator.name,
      occupation: investigator.occupation,
      attributes: investigator.attributes,
      derived: investigator.resources,
      pointBudgets: investigator.pointBudgets,
      skillAllocation: investigator.skillAllocation,
      inventoryValidation: investigator.inventoryValidation,
      inventoryAllowance: investigator.inventoryAllowance
    },
    checks: [check1, check2],
    combat,
    san,
    settlement
  };
}

if (require.main === module) {
  const output = runDemo();
  console.log(JSON.stringify(output, null, 2));
}

module.exports = { runDemo };
