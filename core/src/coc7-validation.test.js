const assert = require("assert");
const { existsSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { createCharacter, startSessionApi, addInvestigator, submitAction, saveSessionApi, loadSessionApi, loadSessionSnapshotApi, settleSessionApi } = require("./api");
const { runCheck } = require("./check-engine");
const { routeScenarioAction, processScenarioTurn } = require("./scene-action-router");

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
  assert.equal(advanced.triggered[0].effect, "steal_discovery");
  assert.equal(session.scene.timeState.countdowns.length, 1);
  assert.equal(session.scene.threats.exposure >= 2, true);

  const followup = submitAction(session, { kind: "advance_time", minutes: 5 });
  assert.equal(followup.triggered.some((item) => item.effect === "search_sweep"), true);
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
  assert.equal(advanced.triggered[0].effect, "follow_alert");
  assert.equal(session.scene.participants.npcs[0].attitude, "guarded");
  assert.equal(session.scene.timeState.countdowns.length >= 2, true);

  const escalated = submitAction(session, { kind: "advance_time", minutes: 6 });
  assert.equal(escalated.triggered.some((item) => item.effect === "route_shift"), true);
  assert.equal(escalated.triggered.some((item) => item.effect === "reinforcements_arrive"), true);
}

function testCombatDamageAndMajorWounds() {
  const session = startSessionApi({ sessionId: "combat-major-wound", summary: "战斗测试", location: "病院走廊" });
  const actor = buildCharacter({
    skills: [
      { key: "Fighting", occupationPointsSpent: 15, interestPointsSpent: 15, value: 55 },
      { key: "Dodge", interestPointsSpent: 10, value: 45 }
    ]
  });
  const target = buildCharacter({
    id: "pc-target-001",
    name: "韩朔",
    skills: [{ key: "Dodge", interestPointsSpent: 5, value: 40 }]
  });

  addInvestigator(session, actor);
  addInvestigator(session, target);
  submitAction(session, { kind: "start_combat", enemies: [] });

  const result = submitAction(session, {
    kind: "combat_round",
    actorId: actor.id,
    targetActorId: target.id,
    attackSkill: "Fighting",
    attackValue: 55,
    defendSkill: "Dodge",
    defendValue: 40,
    defenseMode: "dodge",
    baseDamage: "1D6+1",
    damageBonusText: "+1D4"
  }, scriptedRandom([12, 70, 6, 4]));

  assert.equal(result.event.winner, "actor");
  assert.ok(Number.isInteger(result.event.damage));
  assert.ok(result.event.damage >= 1);
  assert.equal(target.status.majorWound, result.event.damage >= Math.floor(target.resources.hpMax / 2));
}

function testWeaponProfiles() {
  const session = startSessionApi({ sessionId: 'combat-weapon-profile', summary: '武器表测试', location: '院墙边' });
  const actor = buildCharacter({ skills: [{ key: 'Fighting', occupationPointsSpent: 15, interestPointsSpent: 15, value: 55 }] });
  const target = buildCharacter({ id: 'pc-target-weapon', name: '白砚', skills: [{ key: 'Dodge', interestPointsSpent: 5, value: 40 }] });
  addInvestigator(session, actor);
  addInvestigator(session, target);
  submitAction(session, { kind: 'start_combat', enemies: [] });

  const result = submitAction(session, {
    kind: 'combat_round',
    actorId: actor.id,
    targetActorId: target.id,
    weaponKey: 'knife',
    attackValue: 55,
    defendSkill: 'Dodge',
    defendValue: 40
  }, scriptedRandom([10, 88, 2]));

  assert.equal(result.event.damageFormula.startsWith('1D4+2'), true);
}

function testBonusDiceChoosesBetterRoll() {
  const result = runCheck({
    skillKey: 'Spot Hidden',
    targetValue: 60,
    difficulty: 'regular',
    bonusDice: 1
  }, scriptedRandom([7, 8, 2]));

  assert.equal(result.roll, 27);
  assert.equal(result.rollDetail.modifierType, 'bonus');
  assert.equal(result.result.success, true);
}

function testPenaltyDiceChoosesWorseRoll() {
  const result = runCheck({
    skillKey: 'Listen',
    targetValue: 60,
    difficulty: 'regular',
    penaltyDice: 1
  }, scriptedRandom([4, 1, 8]));

  assert.equal(result.roll, 84);
  assert.equal(result.rollDetail.modifierType, 'penalty');
  assert.equal(result.result.success, false);
}

function testSessionStorageRoundTrip() {
  const session = startSessionApi({ sessionId: 'save-roundtrip', summary: '存档测试', location: '旧教堂' });
  const actor = buildCharacter();
  addInvestigator(session, actor);
  submitAction(session, { kind: 'advance_time', minutes: 7 });

  const filePath = join(tmpdir(), `aikp-session-${Date.now()}.json`);
  const saveResult = saveSessionApi(session, filePath, { meta: { source: 'test-suite' } });
  const snapshot = loadSessionSnapshotApi(filePath);
  const loaded = loadSessionApi(filePath);

  assert.equal(saveResult.ok, true);
  assert.equal(existsSync(filePath), true);
  assert.equal(snapshot.meta.source, 'test-suite');
  assert.equal(loaded.sessionId, session.sessionId);
  assert.equal(loaded.scene.timeState.timelineMinute, 7);
  assert.equal(loaded.scene.location, '旧教堂');

  rmSync(filePath, { force: true });
}

function testSettlementSummaryIncludesSceneAftermath() {
  const session = startSessionApi({ sessionId: 'settlement-summary', summary: '夜探旧教堂', location: '河谷旧教堂' });
  const actor = buildCharacter();
  addInvestigator(session, actor);
  session.scene.clues.push({ id: 'clue-1', title: '祭坛背后的异常刮痕', kind: 'core', quality: 'clear', revealed: true, source: 'scene' });
  session.scene.clues.push({ id: 'clue-2', title: '祭坛下方的细长槽口', kind: 'core', quality: 'partial', revealed: false, source: 'scene' });
  session.scene.events.push({ id: 'evt-1', label: '守墓人对你起了戒心', triggered: true });
  session.scene.events.push({ id: 'evt-2', label: '钟楼深处还有动静', triggered: false });
  session.scene.participants.npcs.push({
    id: 'gravedigger',
    name: '守墓人',
    attitude: 'guarded',
    trust: -1,
    status: 'active',
    socialState: { suspicion: 2, fear: 0, affinity: 0, obligation: 0, flags: ['reasoned_with'], lastInteractionStyle: 'persuade' }
  });
  submitAction(session, { kind: 'advance_time', minutes: 9 });

  const settlement = settleSessionApi(session);
  assert.equal(settlement.clueStats.revealed, 1);
  assert.equal(settlement.clueStats.hiddenCore, 1);
  assert.equal(settlement.threatSummary.dangerLevel, session.scene.threats.dangerLevel);
  assert.equal(settlement.npcAftermath[0].name, '守墓人');
  assert.equal(Array.isArray(settlement.summaryLines), true);
  assert.equal(settlement.summaryLines.some((line) => line.includes('核心线索')), true);
}

function testScenarioTemplateSeeding() {
  const session = startSessionApi({ sessionId: 'scenario-seeding', scenarioId: 'old-church-night' });
  assert.equal(session.scene.summary, '夜探旧教堂');
  assert.equal(session.scene.location, '河谷旧教堂');
  assert.equal(session.scene.clues.length >= 3, true);
  assert.equal(session.scene.participants.npcs[0].id, 'gravedigger');
  assert.equal(session.scene.meta.scenarioId, 'old-church-night');
  assert.equal(Array.isArray(session.scene.meta.starterPrompts), true);
}

function testScenarioActionRouterMatchesOldChurchPrompts() {
  const session = startSessionApi({ sessionId: 'scenario-router', scenarioId: 'old-church-night' });
  const explore = routeScenarioAction(session, 'pc-any', '我借着手电去看祭坛背后的刮痕');
  const talk = routeScenarioAction(session, 'pc-any', '我先安抚守墓人，再把话慢慢引到昨晚的钟声上');
  const risky = routeScenarioAction(session, 'pc-any', '我直接把祭坛下面那块木板掀开');

  assert.equal(explore.kind, 'explore');
  assert.equal(talk.kind, 'talk');
  assert.equal(risky.kind, 'risky_action');
}

function testScenarioTurnProcessesNaturalLanguage() {
  const session = startSessionApi({ sessionId: 'scenario-turn', scenarioId: 'old-church-night' });
  const actor = createCharacter({
    id: 'pc-turn',
    name: '苏晚',
    age: 26,
    occupationKey: 'artist',
    persona: '胆子不大，但眼睛尖，写字和画图都很稳',
    motivation: '想把朋友留下来的怪线索查明白',
    era: 'depression_era_1920s',
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 60, APP: 70, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: 'Spot Hidden', value: 65, baseValue: 25, occupationPointsSpent: 20, interestPointsSpent: 20, tag: 'investigation' },
      { key: 'Persuade', value: 60, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 25, tag: 'social' },
      { key: 'Psychology', value: 50, baseValue: 10, occupationPointsSpent: 20, interestPointsSpent: 20, tag: 'investigation' },
      { key: 'Fighting', value: 35, baseValue: 25, occupationPointsSpent: 0, interestPointsSpent: 10, tag: 'action' }
    ],
    inventory: [
      { name: '手电', category: 'tool', quantity: 1 },
      { name: '素描本', category: 'tool', quantity: 1 }
    ]
  });
  addInvestigator(session, actor);

  const result = processScenarioTurn(session, actor.id, '我借着手电去看祭坛背后的刮痕', submitAction, scriptedRandom([28]));
  assert.equal(result.ok, true);
  assert.equal(result.result.kind, 'explore');
  assert.equal(result.result.event.result.success, true);
}

function run() {
  testSkillBudgetValidation();
  testCreditRatingValidation();
  testDelayedStealConsequences();
  testDelayedFollowAlert();
  testCombatDamageAndMajorWounds();
  testWeaponProfiles();
  testBonusDiceChoosesBetterRoll();
  testPenaltyDiceChoosesWorseRoll();
  testSessionStorageRoundTrip();
  testSettlementSummaryIncludesSceneAftermath();
  testScenarioTemplateSeeding();
  testScenarioActionRouterMatchesOldChurchPrompts();
  testScenarioTurnProcessesNaturalLanguage();
  console.log("coc7-validation.test.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };


(function autoFillsBaseSkillDefaults() {
  const character = buildCharacter({
    occupationKey: 'detective',
    skills: [
      { key: 'Spot Hidden', occupationPointsSpent: 25, interestPointsSpent: 10 },
      { key: 'Dodge', interestPointsSpent: 5 },
      { key: 'Own Language', occupationPointsSpent: 10 }
    ]
  });

  const spotHidden = character.skills.find((skill) => skill.key === 'Spot Hidden');
  const dodge = character.skills.find((skill) => skill.key === 'Dodge');
  const ownLanguage = character.skills.find((skill) => skill.key === 'Own Language');

  assert.equal(spotHidden.baseValue, 25);
  assert.equal(spotHidden.value, 60);
  assert.equal(dodge.baseValue, Math.floor(character.attributes.DEX / 2));
  assert.equal(ownLanguage.baseValue, character.attributes.EDU);
})();


(function appliesAgeBasedMovePenalties() {
  const middleAged = buildCharacter({ age: 52, occupationKey: 'detective' });
  const elder = buildCharacter({ age: 68, occupationKey: 'professor' });
  const young = buildCharacter({ age: 18, occupationKey: 'journalist' });

  assert.equal(middleAged.resources.baseMoveRate - middleAged.resources.moveRate, 2);
  assert.equal(elder.resources.baseMoveRate - elder.resources.moveRate, 3);
  assert.equal(young.resources.ageAdjustments.luckRerolls, 1);
  assert.ok(middleAged.resources.ageAdjustments.eduImprovementChecks >= 2);
})();
