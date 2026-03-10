const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const {
  createCharacter,
  startSessionApi,
  addInvestigator,
  submitAction,
  saveSessionApi,
  loadSessionApi,
  loadCampaignTemplate,
  attachCampaignMeta,
  transitionCampaignScene,
  listEligibleHooks
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

function buildCharacter(overrides = {}) {
  return createCharacter({
    id: "pc-runtime-001",
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
      { key: "Persuade", value: 60, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 25, tag: "social" },
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" }
    ],
    inventory: [{ name: "薄手套", category: "tool", quantity: 1 }],
    ...overrides
  });
}

test("campaign runtime keeps npc flags and countdown aftermath across transition and save", () => {
  const session = startSessionApi({ sessionId: "campaign-runtime", scenarioId: "old-church-night" });
  const campaign = loadCampaignTemplate("old-church-arc");
  attachCampaignMeta(session, campaign);

  const actor = buildCharacter();
  addInvestigator(session, actor);
  const gravedigger = session.scene.participants.npcs.find((npc) => npc.id === "gravedigger");
  assert.equal(Boolean(gravedigger), true);
  gravedigger.socialState.flags.push("reasoned_with");
  gravedigger.socialState.lastInteractionStyle = "persuade";

  const follow = submitAction(session, {
    kind: "follow",
    actorId: actor.id,
    targetNpc: "gravedigger",
    skillKey: "Stealth",
    riskLevel: "medium",
    impactScore: 2,
    leverageScore: 1,
    intent: "远远跟着守墓人"
  }, scriptedRandom([99]));
  assert.equal(follow.event.result.success, false);

  const countdownAdvance = submitAction(session, { kind: "advance_time", minutes: 8 });
  const triggeredLabel = countdownAdvance.triggered[0]?.label;
  assert.equal(Boolean(triggeredLabel), true);

  campaign.scenes.find((scene) => scene.sceneId === "bell-tower-followup").hooks.push({
    id: "carryover-runtime-hook",
    label: "沿用上一幕留下的 NPC 状态与倒计时后果",
    targetSceneId: "missing-person-followup",
    status: "planned",
    conditions: {
      requiredNpcFlags: ["reasoned_with"],
      requiredTriggeredEvents: [triggeredLabel]
    }
  });

  transitionCampaignScene(session, campaign, "bell-tower-followup");
  const eligibleHooks = listEligibleHooks(session, campaign, "bell-tower-followup");
  const carryoverHook = eligibleHooks.find((hook) => hook.id === "carryover-runtime-hook");
  assert.equal(carryoverHook?.eligible, true);
  assert.equal(session.scene.meta.campaign.runtime.npcsById.gravedigger.socialState.lastInteractionStyle, "persuade");

  const filePath = join(tmpdir(), `aikp-campaign-runtime-${Date.now()}.json`);
  saveSessionApi(session, filePath, { meta: { source: "campaign-runtime-test" } });
  const loaded = loadSessionApi(filePath);
  const loadedHooks = listEligibleHooks(loaded, campaign, "bell-tower-followup");
  assert.equal(loadedHooks.find((hook) => hook.id === "carryover-runtime-hook")?.eligible, true);
  assert.equal(loaded.scene.meta.campaign.runtime.npcsById.gravedigger.socialState.lastInteractionStyle, "persuade");

  if (existsSync(filePath)) rmSync(filePath, { force: true });
});

test("campaign runtime initializes compatibly for snapshots without runtime payload", () => {
  const session = startSessionApi({ sessionId: "campaign-runtime-compat", scenarioId: "old-church-night" });
  const campaign = loadCampaignTemplate("old-church-arc");
  attachCampaignMeta(session, campaign);
  delete session.scene.meta.campaign.runtime;

  const actor = buildCharacter({ id: "pc-runtime-compat", name: "白砚" });
  addInvestigator(session, actor);
  const gravedigger = session.scene.participants.npcs.find((npc) => npc.id === "gravedigger");
  gravedigger.socialState.flags.push("reasoned_with");

  transitionCampaignScene(session, campaign, "bell-tower-followup");
  assert.equal(Boolean(session.scene.meta.campaign.runtime), true);
  assert.match((session.scene.meta.campaign.runtime.npcsById.gravedigger.socialState.flags || []).join(","), /reasoned_with/);
});
