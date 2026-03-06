const { readFileSync } = require("fs");
const { join } = require("path");

function loadNpcCard(npcId) {
  const filePath = join(__dirname, "..", "data", "npcs", `${npcId}.card.json`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function responseStrengthToModifier(strength) {
  if (strength === "strong") return 1;
  if (strength === "weak") return -1;
  return 0;
}

function mapSkillToMethod(skillKey = "") {
  const lower = skillKey.toLowerCase();
  if (lower.includes("persuade")) return "persuade";
  if (lower.includes("charm")) return "charm";
  if (lower.includes("intimidate")) return "intimidate";
  if (lower.includes("credit rating")) return "bribery";
  if (lower.includes("fast talk")) return "charm";
  if (lower.includes("psychology")) return "empathy";
  return "persuade";
}

function methodResponseProfile(card, method) {
  const strength = card.social?.respondsTo?.[method] || "normal";
  const modifier = responseStrengthToModifier(strength);

  return {
    method,
    strength,
    modifier,
    softSpots: card.social?.softSpots || [],
    resentments: card.social?.resentments || []
  };
}

function pickKnowledgeByOutcome(card, skillKey, successLevel, success) {
  const method = mapSkillToMethod(skillKey);
  const revealOrder = success
    ? [successLevel, successLevel === "extreme" ? "hard_success" : null, "regular_success"]
    : ["fail_forward"];

  for (const revealAt of revealOrder.filter(Boolean)) {
    const hit = card.knowledge.find((item) => item.revealAt === revealAt && (!item.requiresMethod || item.requiresMethod.includes(method)));
    if (hit) return hit;
  }
  return null;
}

module.exports = {
  loadNpcCard,
  responseStrengthToModifier,
  mapSkillToMethod,
  pickKnowledgeByOutcome,
  methodResponseProfile
};
