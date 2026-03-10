const occupationTemplates = {
  journalist: {
    key: "journalist",
    name: "记者",
    aliases: ["reporter", "记者"],
    creditRatingRange: [9, 30],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Art/Craft (Photography)", "Fast Talk", "History", "Library Use", "Listen", "Psychology", "Spot Hidden", "Own Language"]
  },
  detective: {
    key: "detective",
    name: "私家侦探",
    aliases: ["detective", "private detective", "私家侦探", "侦探"],
    creditRatingRange: [20, 45],
    occupationSkillFormula: "EDUx2+DEXx2",
    suggestedSkills: ["Law", "Library Use", "Listen", "Psychology", "Spot Hidden", "Stealth", "Fighting", "Firearms"]
  },
  doctor: {
    key: "doctor",
    name: "医生",
    aliases: ["doctor", "physician", "医生"],
    creditRatingRange: [30, 80],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["First Aid", "Medicine", "Psychology", "Science (Biology)", "Science (Pharmacy)", "Library Use", "Listen", "Credit Rating"]
  },
  professor: {
    key: "professor",
    name: "教授",
    aliases: ["professor", "scholar", "学者", "教授"],
    creditRatingRange: [20, 70],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Library Use", "Own Language", "Psychology", "History", "Science", "Language (Other)", "Credit Rating", "Persuade"]
  },
  artist: {
    key: "artist",
    name: "艺术家/歌手",
    aliases: ["artist", "singer", "艺术家", "歌手"],
    creditRatingRange: [9, 50],
    occupationSkillFormula: "EDUx2+APPx2",
    suggestedSkills: ["Art/Craft", "Charm", "Disguise", "Listen", "Psychology", "Spot Hidden", "Stealth", "Persuade"]
  },
  veteran: {
    key: "veteran",
    name: "退伍军人",
    aliases: ["veteran", "soldier", "退伍军人", "老兵", "军人"],
    creditRatingRange: [9, 30],
    occupationSkillFormula: "EDUx2+STRx2",
    suggestedSkills: ["Climb", "Dodge", "First Aid", "Fighting", "Firearms", "Intimidate", "Survival", "Throw"]
  },
  dilettante: {
    key: "dilettante",
    name: "富家子/社交名流",
    aliases: ["dilettante", "socialite", "富家子", "社交名流", "名流"],
    creditRatingRange: [50, 99],
    occupationSkillFormula: "EDUx2+APPx2",
    suggestedSkills: ["Art/Craft", "Charm", "Credit Rating", "Fast Talk", "History", "Language (Other)", "Persuade", "Psychology"]
  },
  antiquarian: {
    key: "antiquarian",
    name: "古董商",
    aliases: ["antiquarian", "dealer", "古董商", "古物研究者"],
    creditRatingRange: [30, 70],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Appraise", "Art/Craft", "History", "Library Use", "Language (Other)", "Spot Hidden", "Persuade", "Credit Rating"]
  },
  librarian: {
    key: "librarian",
    name: "图书管理员",
    aliases: ["librarian", "archivist", "图书管理员", "档案员"],
    creditRatingRange: [9, 35],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Accounting", "History", "Library Use", "Listen", "Own Language", "Language (Other)", "Spot Hidden", "Psychology"]
  },
  nurse: {
    key: "nurse",
    name: "护士",
    aliases: ["nurse", "护士", "护工"],
    creditRatingRange: [9, 40],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["First Aid", "Medicine", "Psychology", "Listen", "Persuade", "Science (Biology)", "Stealth", "Credit Rating"]
  },
  clergy: {
    key: "clergy",
    name: "神职人员",
    aliases: ["clergy", "priest", "minister", "神职人员", "牧师", "神父"],
    creditRatingRange: [9, 60],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["History", "Library Use", "Listen", "Own Language", "Language (Other)", "Persuade", "Psychology", "Credit Rating"]
  },
  police: {
    key: "police",
    name: "警探/警员",
    aliases: ["police", "inspector", "constable", "警探", "警员", "巡警"],
    creditRatingRange: [20, 50],
    occupationSkillFormula: "EDUx2+DEXx2",
    suggestedSkills: ["Drive Auto", "Fighting", "Firearms", "Law", "Listen", "Psychology", "Spot Hidden", "Intimidate"]
  },
  criminal: {
    key: "criminal",
    name: "罪犯/骗子",
    aliases: ["criminal", "con artist", "crook", "罪犯", "骗子", "盗贼"],
    creditRatingRange: [5, 65],
    occupationSkillFormula: "EDUx2+DEXx2",
    suggestedSkills: ["Appraise", "Fast Talk", "Fighting", "Locksmith", "Psychology", "Disguise", "Spot Hidden", "Stealth"]
  },
  archaeologist: {
    key: "archaeologist",
    name: "考古学家",
    aliases: ["archaeologist", "考古学家", "遗迹研究者"],
    creditRatingRange: [10, 40],
    occupationSkillFormula: "EDUx4",
    suggestedSkills: ["Appraise", "Archaeology", "History", "Language (Other)", "Library Use", "Natural World", "Spot Hidden", "Science"]
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
