const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listOccupationTemplates,
  buildActionRuleGuidance,
  startSessionApi,
  createCharacter,
  addInvestigator,
  loadCampaignTemplate,
  attachCampaignMeta,
  transitionCampaignScene,
  autoAdvanceCampaign,
  loadStoryPackTemplate
} = require("./index");

function buildCharacter(overrides = {}) {
  return createCharacter({
    id: "pc-content-001",
    name: "林秋",
    age: 31,
    occupationKey: "librarian",
    creditRating: 18,
    persona: "谨慎、细看细记",
    motivation: "把旧教堂的线索先收成能说清的东西",
    era: "depression_era_1920s",
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 50, APP: 50, POW: 60, INT: 70, SIZ: 60, EDU: 80 },
    skills: [
      { key: "Library Use", value: 70, baseValue: 20, occupationPointsSpent: 30, interestPointsSpent: 20, tag: "investigation" },
      { key: "Spot Hidden", value: 55, baseValue: 25, occupationPointsSpent: 15, interestPointsSpent: 15, tag: "investigation" },
      { key: "Persuade", value: 45, baseValue: 10, occupationPointsSpent: 10, interestPointsSpent: 25, tag: "social" }
    ],
    inventory: [{ name: "登记纸", category: "document", quantity: 1 }],
    ...overrides
  });
}

test("occupation library covers the expanded common investigation set", () => {
  const keys = new Set(listOccupationTemplates().map((item) => item.key));
  for (const key of ["journalist", "detective", "doctor", "librarian", "clergy", "police", "criminal", "archaeologist"]) {
    assert.equal(keys.has(key), true);
  }
});

test("rule guidance returns fail-forward, penalty and crisis notes", () => {
  const guidance = buildActionRuleGuidance({
    action: {
      kind: "follow",
      intent: "我压着脚步继续跟住他",
      pushed: true
    },
    adjudication: {
      failForward: "exposure",
      riskLevel: "high"
    },
    scene: {
      sceneType: "investigation",
      location: "旧教堂地下通道",
      threats: { dangerLevel: "high" },
      meta: {
        atmosphere: {
          light: "这里只有一圈不稳定的灯火，亮处很亮，暗处却更像张着口。"
        }
      }
    },
    actor: {
      status: {
        majorWound: false,
        temporaryInsanity: false,
        indefiniteInsanity: false
      }
    }
  });

  assert.match(guidance.failurePreview, /暴露代价/);
  assert.match(guidance.penaltyNote, /惩罚骰/);
  assert.ok(guidance.crisisNote);
  assert.match(guidance.pushLine, /强推|再赌一次|再没过/);
});

test("old church arc story pack and campaign now converge into the finale scene", () => {
  const storyPack = loadStoryPackTemplate("old-church-arc-pack");
  assert.equal(storyPack.sceneIds.includes("underchurch-reckoning"), true);

  const session = startSessionApi({ sessionId: "old-church-finale", scenarioId: "old-church-night" });
  const campaign = loadCampaignTemplate("old-church-arc");
  attachCampaignMeta(session, campaign);
  addInvestigator(session, buildCharacter());
  transitionCampaignScene(session, campaign, "missing-person-followup");

  for (const clue of session.scene.clues) {
    clue.revealed = true;
  }

  const chosen = autoAdvanceCampaign(session, campaign);
  assert.equal(chosen?.targetSceneId, "underchurch-reckoning");
  assert.equal(session.scene.meta.scenarioId, "underchurch-reckoning");
  assert.match(session.scene.meta.opening, /钟楼底下/);
});
