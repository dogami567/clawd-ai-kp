const { createCharacter, startSessionApi, addInvestigator, submitAction, getState, loadSceneTemplate, processScenarioTurn } = require("./index");

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

function runSceneDemo() {
  const scenario = loadSceneTemplate("old-church-night");
  const session = startSessionApi({ sessionId: "scene-demo-001", scenarioId: "old-church-night" });

  const investigator = createCharacter({
    id: "pc-scene-001",
    name: "苏晚",
    age: 26,
    occupationKey: "artist",
    persona: "胆子不大，但眼睛尖，写字和画图都很稳",
    motivation: "想把朋友留下来的怪线索查明白",
    era: "depression_era_1920s",
    luck: 60,
    attributeAssignments: { STR: 40, CON: 50, DEX: 60, APP: 70, POW: 60, INT: 80, SIZ: 50, EDU: 50 },
    skills: [
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" },
      { key: "Persuade", value: 60, baseValue: 10, occupationPointsSpent: 25, interestPointsSpent: 25, tag: "social" },
      { key: "Psychology", value: 50, baseValue: 10, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" },
      { key: "Fighting", value: 35, baseValue: 25, occupationPointsSpent: 0, interestPointsSpent: 10, tag: "action" }
    ],
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "素描本", category: "tool", quantity: 1 }
    ]
  });

  addInvestigator(session, investigator);
  const random = scriptedRandom([28, 76, 33, 81]);

  const step1 = processScenarioTurn(session, investigator.id, "我借着手电去看祭坛背后的刮痕", submitAction, random);
  const step2 = processScenarioTurn(session, investigator.id, "我先安抚守墓人，再把话慢慢引到昨晚的钟声上", submitAction, random);
  const step3 = processScenarioTurn(session, investigator.id, "我用素描本把墙上的符号临下来，再和朋友留下的图样对照", submitAction, random);
  const step4 = processScenarioTurn(session, investigator.id, "我直接把祭坛下面那块木板掀开", submitAction, random);

  return {
    intro: {
      title: scenario.title,
      opening: scenario.opening
    },
    steps: [step1.result, step2.result, step3.result, step4.result],
    state: getState(session)
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runSceneDemo(), null, 2));
}

module.exports = { runSceneDemo };
