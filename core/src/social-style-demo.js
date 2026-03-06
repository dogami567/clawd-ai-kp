const { createCharacter, startSessionApi, addInvestigator, submitAction } = require("./index");
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

function runSocialStyleDemo() {
  const session = startSessionApi({ sessionId: "social-style-demo-001", summary: "社交方式测试", location: "旧教堂外" });
  const investigator = createCharacter({
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
    attributeAssignments: { STR:50, CON:60, DEX:60, APP:50, POW:70, INT:80, SIZ:40, EDU:50 },
    skills: [
      { key: 'Persuade', value: 60, tag: 'social' },
      { key: 'Charm', value: 55, tag: 'social' },
      { key: 'Intimidate', value: 35, tag: 'social' },
      { key: 'Credit Rating', value: 25, tag: 'social' }
    ],
    inventory: [{ name: '名片夹', category: 'tool', quantity: 1 }]
  });
  addInvestigator(session, investigator);
  session.scene.participants.npcs.push({ id: 'gravedigger', name: '守墓人', attitude: 'neutral', trust: 0, status: 'active', items: ['钥匙串','皱烟盒','零钱'] });
  const random = scriptedRandom([41, 88, 22]);

  const persuade = submitAction(session, buildTalkStyleActionFromNpcCard({ actorId: investigator.id, npcId: 'gravedigger', style: 'persuade' }), random);
  const intimidate = submitAction(session, buildTalkStyleActionFromNpcCard({ actorId: investigator.id, npcId: 'gravedigger', style: 'intimidate' }), random);
  const bribery = submitAction(session, buildTalkStyleActionFromNpcCard({ actorId: investigator.id, npcId: 'gravedigger', style: 'bribery' }), random);

  return { persuade, intimidate, bribery };
}

if (require.main === module) {
  console.log(JSON.stringify(runSocialStyleDemo(), null, 2));
}

module.exports = { runSocialStyleDemo };
