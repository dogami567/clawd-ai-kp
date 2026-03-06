const assert = require("assert");
const { createCharacter, startSessionApi, addInvestigator, submitAction } = require("./api");

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

function buildCharacter(overrides = {}) {
  return createCharacter({
    id: "pc-test-001",
    name: "周止",
    age: 29,
    occupationKey: "detective",
    creditRating: 25,
    persona: "冷静又记仇",
    motivation: "查清教堂夜巡路线",
    era: "depression_era_1920s",
    luck: 55,
    attributeAssignments: { STR: 60, CON: 50, DEX: 70, APP: 40, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Stealth", value: 55, baseValue: 20, occupationPointsSpent: 35, interestPointsSpent: 0, tag: "action" },
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" }
    ],
    inventory: [{ name: "薄手套", category: "tool", quantity: 1 }],
    ...overrides
  });
}

function testSkillBudgetValidation() {
  const actor = buildCharacter();
  assert.equal(actor.skillAllocation.occupationSpent, 55);
  assert.equal(actor.skillAllocation.interestSpent, 20);

  assert.throws(() => buildCharacter({
    skills: [
      { key: "Stealth", value: 235, baseValue: 20, occupationPointsSpent: 200, interestPointsSpent: 15, tag: "action" },
      { key: "Spot Hidden", value: 105, baseValue: 25, occupationPointsSpent: 60, interestPointsSpent: 20, tag: "investigation" }
    ]
  }), /Occupation skill points exceeded/);
}

function testCreditRatingValidation() {
  assert.throws(() => buildCharacter({ creditRating: 60 }), /Credit Rating 60 out of range/);
}

function testDelayedStealConsequences() {
  const session = startSessionApi({ sessionId: "test-steal", summary: "偷窃测试", location: "教堂" });
  const actor = buildCharacter();
  addInvestigator(session, actor);
  session.scene.participants.npcs.push({ id: "gravedigger", name: "守墓人", attitude: "neutral", trust: 0, status: "active", items: ["钥匙串"] });

  const successRandom = scriptedRandom([25]);
  const steal = submitAction(session, {
    kind: "steal",
    actorId: actor.id,
    targetNpc: "gravedigger",
    targetItem: "钥匙串",
    skillKey: "Stealth",
    riskLevel: "medium",
    impactScore: 1,
    leverageScore: 1,
    intent: "顺走钥匙串"
  }, successRandom);

  assert.equal(steal.event.result.success, true);
  assert.equal(session.scene.timeState.countdowns.length, 1);

  const advanced = submitAction(session, { kind: "advance_time", minutes: 5 });
  assert.equal(advanced.triggered.length, 1);
  assert.equal(session.scene.timeState.countdowns.length, 0);
  assert.equal(session.scene.threats.exposure >= 2, true);
}

function testDelayedFollowAlert() {
  const session = startSessionApi({ sessionId: "test-follow", summary: "跟踪测试", location: "墓地外" });
  const actor = buildCharacter();
  addInvestigator(session, actor);
  session.scene.participants.npcs.push({ id: "gravedigger", name: "守墓人", attitude: "neutral", trust: 0, status: "active", items: [] });

  const failRandom = scriptedRandom([99]);
  const follow = submitAction(session, {
    kind: "follow",
    actorId: actor.id,
    targetNpc: "gravedigger",
    skillKey: "Stealth",
    riskLevel: "medium",
    impactScore: 2,
    leverageScore: 1,
    intent: "远远跟着守墓人"
  }, failRandom);

  assert.equal(follow.event.result.success, false);
  assert.equal(session.scene.timeState.countdowns.length, 1);

  const advanced = submitAction(session, { kind: "advance_time", minutes: 8 });
  assert.equal(advanced.triggered.length, 1);
  assert.equal(session.scene.participants.npcs[0].attitude, "guarded");
}

function run() {
  testSkillBudgetValidation();
  testCreditRatingValidation();
  testDelayedStealConsequences();
  testDelayedFollowAlert();
  console.log("coc7-validation.test.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
