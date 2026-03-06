const SKILL_DEFAULTS = {
  "Accounting": 5,
  "Appraise": 5,
  "Archaeology": 1,
  "Art/Craft": 5,
  "Art/Craft (Photography)": 5,
  "Charm": 15,
  "Climb": 20,
  "Credit Rating": 0,
  "Disguise": 5,
  "Dodge": null,
  "Drive Auto": 20,
  "Fast Talk": 5,
  "Fighting": 25,
  "Firearms": 20,
  "First Aid": 30,
  "History": 5,
  "Intimidate": 15,
  "Language (Other)": 1,
  "Law": 5,
  "Library Use": 20,
  "Listen": 20,
  "Locksmith": 1,
  "Medicine": 1,
  "Natural World": 10,
  "Own Language": null,
  "Persuade": 10,
  "Psychology": 10,
  "Science": 1,
  "Science (Biology)": 1,
  "Science (Pharmacy)": 1,
  "Spot Hidden": 25,
  "Stealth": 20,
  "Survival": 10,
  "Swim": 20,
  "Throw": 20
};

function resolveSkillDefault(skillKey, investigator = {}) {
  if (skillKey === "Dodge") {
    return Math.floor(Number(investigator.attributes?.DEX || 0) / 2);
  }
  if (skillKey === "Own Language") {
    return Number(investigator.attributes?.EDU || 0);
  }
  return SKILL_DEFAULTS[skillKey] ?? 0;
}

function applySkillDefaults(skills = [], investigator = {}) {
  return skills.map((skill) => {
    const baseValue = skill.baseValue ?? skill.base ?? skill.startingValue ?? resolveSkillDefault(skill.key, investigator);
    const occupationPointsSpent = Number(skill.occupationPointsSpent ?? skill.occupationPoints ?? skill.occupation ?? skill.allocation?.occupation ?? 0);
    const interestPointsSpent = Number(skill.interestPointsSpent ?? skill.interestPoints ?? skill.interest ?? skill.allocation?.interest ?? 0);
    const computedValue = baseValue + occupationPointsSpent + interestPointsSpent;

    return {
      ...skill,
      baseValue,
      occupationPointsSpent,
      interestPointsSpent,
      value: skill.value ?? computedValue
    };
  });
}

module.exports = {
  SKILL_DEFAULTS,
  resolveSkillDefault,
  applySkillDefaults
};
