const { loadNpcCard } = require("./npc-cards");

function difficultyToRiskLevel(difficulty) {
  if (difficulty === "easy") return "low";
  if (difficulty === "hard") return "high";
  if (difficulty === "extreme") return "extreme";
  return "medium";
}

function buildStealActionFromNpcCard({ actorId, npcId, itemName, skillKey = "Stealth" }) {
  const card = loadNpcCard(npcId);
  const item = card.inventory.find((entry) => entry.name === itemName);
  if (!item) throw new Error(`Item not found on NPC card: ${itemName}`);

  return {
    kind: "steal",
    actorId,
    targetNpc: npcId,
    targetItem: itemName,
    intent: `我想从${card.name}身上顺走${itemName}`,
    skillKey,
    riskLevel: difficultyToRiskLevel(item.stealDifficulty),
    impactScore: item.importance === "critical" ? 3 : item.importance === "high" ? 2 : 1,
    leverageScore: 1,
    failureEventLabel: item.reaction
  };
}

function buildFollowActionFromNpcCard({ actorId, npcId, skillKey = "Stealth" }) {
  const card = loadNpcCard(npcId);
  return {
    kind: "follow",
    actorId,
    targetNpc: npcId,
    intent: `我想远远跟住${card.name}，看他夜里到底往哪边走`,
    skillKey,
    riskLevel: difficultyToRiskLevel(card.behavior.followDifficulty),
    impactScore: 2,
    leverageScore: 1,
    routineHints: card.behavior.routine || [],
    failureEventLabel: `${card.name} 半路像是察觉到了什么，开始变得更警惕`
  };
}

function buildTalkStyleActionFromNpcCard({ actorId, npcId, style = "persuade", intent, skillKey, revealClueId }) {
  const card = loadNpcCard(npcId);
  const methodMap = {
    persuade: { skillKey: "Persuade", riskLevel: "low", narrativeBonus: 1 },
    charm: { skillKey: "Charm", riskLevel: "low", narrativeBonus: 0 },
    intimidate: { skillKey: "Intimidate", riskLevel: "medium", narrativeBonus: 0 },
    bribery: { skillKey: "Credit Rating", riskLevel: "medium", narrativeBonus: 0 }
  };
  const base = methodMap[style] || methodMap.persuade;

  return {
    kind: "talk",
    actorId,
    targetNpc: npcId,
    intent: intent || `我想试着用${style}的方式撬开${card.name}的嘴`,
    skillKey: skillKey || base.skillKey,
    leverageScore: 1,
    narrativeBonus: base.narrativeBonus,
    riskLevel: base.riskLevel,
    impactScore: style === "intimidate" ? 2 : 1,
    revealClueId,
    interactionStyle: style
  };
}

module.exports = {
  buildStealActionFromNpcCard,
  buildFollowActionFromNpcCard,
  buildTalkStyleActionFromNpcCard
};
