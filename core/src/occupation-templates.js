const occupationTemplates = {
  journalist: {
    key: "journalist",
    name: "记者",
    creditRatingRange: [9, 30],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Art/Craft (Photography)", "Fast Talk", "History", "Library Use", "Listen", "Psychology", "Spot Hidden", "Own Language"]
  },
  detective: {
    key: "detective",
    name: "私家侦探",
    creditRatingRange: [20, 45],
    occupationSkillFormula: "EDUx2+DEXx2",
    suggestedSkills: ["Law", "Library Use", "Listen", "Psychology", "Spot Hidden", "Stealth", "Fighting", "Firearms"]
  },
  doctor: {
    key: "doctor",
    name: "医生",
    creditRatingRange: [30, 80],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["First Aid", "Medicine", "Psychology", "Science (Biology)", "Science (Pharmacy)", "Latin", "Library Use", "Credit Rating"]
  },
  professor: {
    key: "professor",
    name: "教授",
    creditRatingRange: [20, 70],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Library Use", "Own Language", "Psychology", "History", "Science", "Language (Other)", "Credit Rating", "Persuade"]
  },
  artist: {
    key: "artist",
    name: "艺术家/歌手",
    creditRatingRange: [9, 50],
    occupationSkillFormula: "EDUx2+APPx2",
    suggestedSkills: ["Art/Craft", "Charm", "Disguise", "Listen", "Psychology", "Spot Hidden", "Stealth", "Any Interpersonal"]
  },
  veteran: {
    key: "veteran",
    name: "退伍军人",
    creditRatingRange: [9, 30],
    occupationSkillFormula: "EDUx2+STRx2",
    suggestedSkills: ["Climb", "Dodge", "First Aid", "Fighting", "Firearms", "Intimidate", "Survival", "Throw"]
  },
  dilettante: {
    key: "dilettante",
    name: "富家子/社交名流",
    creditRatingRange: [50, 99],
    occupationSkillFormula: "EDUx2+APPx2",
    suggestedSkills: ["Art/Craft", "Charm", "Credit Rating", "Fast Talk", "History", "Language (Other)", "Persuade", "Psychology"]
  }
};

function listOccupationTemplates() {
  return Object.values(occupationTemplates);
}

function getOccupationTemplate(key) {
  const template = occupationTemplates[key];
  if (!template) {
    throw new Error(`Unknown occupation template: ${key}`);
  }
  return template;
}

module.exports = {
  occupationTemplates,
  listOccupationTemplates,
  getOccupationTemplate
};