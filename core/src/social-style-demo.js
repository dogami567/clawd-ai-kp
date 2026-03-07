const { createCharacter, startSessionApi, addInvestigator, submitAction, getState } = require("./index");
const { buildTalkStyleActionFromNpcCard } = require("./npc-actions");

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
  return createCharacter({
    id: "pc-social-001",
    name: "林默",
    age: 27,
    occupationKey: "journalist",
    persona: "会装熟，也会装无辜",
    motivation: "想把钟楼钥匙的事问出来",
    era: "depression_era_1920s",
    residence: "Arkham",
    birthplace: "Boston",
    creditRating: 25,
    attributeAssignments: { STR: 50, CON: 60, DEX: 60, APP: 50, POW: 70, INT: 80, SIZ: 40, EDU: 50 },
    skills: [
      { key: "Persuade", value: 60, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 25, tag: "social" },
      { key: "Charm", value: 55, baseValue: 15, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "social" },
      { key: "Intimidate", value: 35, baseValue: 15, occupationPointsSpent: 10, interestPointsSpent: 10, tag: "social" },
      { key: "Credit Rating", value: 25, baseValue: 0, occupationPointsSpent: 25, interestPointsSpent: 0, tag: "social" }
    ],
    inventory: [{ name: "名片夹", category: "tool", quantity: 1 }]
  });
}

function buildNpc() {
  return {
    id: "gravedigger",
    name: "守墓人",
    attitude: "neutral",
    trust: 0,
    status: "active",
    items: ["钥匙串", "皱烟盒", "零钱"]
  };
}

function runStyle(style, roll) {
  const session = startSessionApi({ sessionId: `social-style-demo-${style}`, summary: "社交方式测试", location: "旧教堂外" });
  const investigator = buildDemoInvestigator();
  addInvestigator(session, investigator);
  session.scene.participants.npcs.push(buildNpc());
  const random = scriptedRandom([roll]);
  const result = submitAction(session, buildTalkStyleActionFromNpcCard({ actorId: investigator.id, npcId: "gravedigger", style }), random);
  return {
    result,
    npcState: getState(session).scene.participants.npcs[0]
  };
}

function runSocialStyleDemo() {
  return {
    persuade: runStyle("persuade", 41),
    charm: runStyle("charm", 34),
    intimidate: runStyle("intimidate", 22),
    bribery: runStyle("bribery", 88)
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runSocialStyleDemo(), null, 2));
}

module.exports = { runSocialStyleDemo };
