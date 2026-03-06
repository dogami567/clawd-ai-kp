const { createCharacter, startSessionApi, addInvestigator, submitAction, getState } = require("./index");
const { buildStealActionFromNpcCard, buildFollowActionFromNpcCard } = require("./npc-actions");

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

function runNpcActionDemo() {
  const session = startSessionApi({ sessionId: "npc-action-demo-001", summary: "守墓人测试", location: "旧教堂外" });
  const investigator = createCharacter({
    id: "pc-npc-001",
    name: "沈青",
    age: 31,
    occupationKey: "detective",
    persona: "手稳，心也稳",
    motivation: "想先把钥匙摸到手",
    era: "depression_era_1920s",
    luck: 55,
    attributeAssignments: { STR: 60, CON: 50, DEX: 70, APP: 40, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Stealth", value: 55, tag: "action" },
      { key: "Spot Hidden", value: 65, tag: "investigation" }
    ],
    inventory: [{ name: "薄手套", category: "tool", quantity: 1 }]
  });
  addInvestigator(session, investigator);
  session.scene.participants.npcs.push({ id: "gravedigger", name: "守墓人", attitude: "neutral", trust: 0, status: "active" });
  const random = scriptedRandom([61, 32]);

  const steal = submitAction(session, buildStealActionFromNpcCard({ actorId: investigator.id, npcId: "gravedigger", itemName: "钥匙串" }), random);
  const follow = submitAction(session, buildFollowActionFromNpcCard({ actorId: investigator.id, npcId: "gravedigger" }), random);

  return { steal, follow, state: getState(session) };
}

if (require.main === module) {
  console.log(JSON.stringify(runNpcActionDemo(), null, 2));
}

module.exports = { runNpcActionDemo };
