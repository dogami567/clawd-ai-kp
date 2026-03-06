const {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession
} = require("./state-machine");

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

function runDemo() {
  const session = createSession({ sessionId: "demo-coc7-v01", investigatorIds: [] });

  registerInvestigator(session, {
    id: "pc-001",
    name: "林默",
    age: 27,
    occupation: "记者",
    persona: "好奇心强，遇事先记录再行动",
    attributes: { STR: 45, CON: 60, DEX: 55, APP: 60, POW: 50, INT: 70, SIZ: 50, EDU: 65 },
    skills: [
      { key: "Spot Hidden", value: 60, tag: "investigation" },
      { key: "Persuade", value: 55, tag: "social" },
      { key: "Fighting", value: 50, tag: "action" }
    ],
    resources: { hp: 11, hpMax: 11, san: 60, sanMax: 99, luck: 45 },
    inventory: [
      { name: "笔记本", category: "tool", quantity: 1 },
      { name: "手电", category: "tool", quantity: 1 }
    ],
    status: { conditions: ["normal"], temporaryEffects: [] }
  });

  startInvestigationScene(session, { summary: "进入废弃病院调查", location: "静海路病院" });

  const random = scriptedRandom([73, 22, 87, 41]);

  const check1 = performSkillCheck(
    session,
    { actorId: "pc-001", skillKey: "Spot Hidden", mode: "hidden", failForward: "exposure" },
    random
  );

  const check2 = performSkillCheck(
    session,
    { actorId: "pc-001", skillKey: "Persuade", mode: "open", failForward: "time" },
    random
  );

  startCombat(session, [
    { id: "npc-001", name: "狂信徒", attitude: "hostile", status: "active" }
  ]);

  const combat = resolveCombatRound(
    session,
    {
      actorId: "pc-001",
      attackSkill: "Fighting",
      attackValue: 50,
      defendSkill: "Dodge",
      defendValue: 40,
      baseDamage: 3,
      damageBonus: 1
    },
    random
  );

  const san = runSanCheck(
    session,
    { actorId: "pc-001", mode: "hidden", onSuccessLoss: 1, onFailLoss: 4 },
    random
  );

  const settlement = settleSession(session);

  return {
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
