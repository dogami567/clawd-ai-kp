const { calculateHalfAndFifth, calculateDerivedStats } = require("./derived-stats");
const { getOccupationTemplate } = require("./occupation-templates");
const { validateInventoryForEra, buildConditionalAllowance } = require("./inventory-rules");
const { deriveFinanceFromCreditRating } = require("./finance-rules");
const { applySkillDefaults } = require("./skill-defaults");

const QUICK_FIRE_VALUES = [40, 50, 50, 50, 60, 60, 70, 80];
const ATTRIBUTE_KEYS = ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU"];
const TRADITIONAL_ATTRIBUTE_KEYS = ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU"];

function defaultRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollDice(count, sides, randomInt = defaultRandomInt) {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += randomInt(1, sides);
  }
  return total;
}

function generateTraditionalAttributes(randomInt = defaultRandomInt) {
  return {
    STR: rollDice(3, 6, randomInt) * 5,
    CON: rollDice(3, 6, randomInt) * 5,
    DEX: rollDice(3, 6, randomInt) * 5,
    APP: rollDice(3, 6, randomInt) * 5,
    POW: rollDice(3, 6, randomInt) * 5,
    SIZ: (rollDice(2, 6, randomInt) + 6) * 5,
    INT: (rollDice(2, 6, randomInt) + 6) * 5,
    EDU: (rollDice(2, 6, randomInt) + 6) * 5,
    Luck: rollDice(3, 6, randomInt) * 5
  };
}

function buildQuickFireAttributes(assignments, luck = 50) {
  const values = { ...assignments };
  const used = ATTRIBUTE_KEYS.map((key) => values[key]).sort((a, b) => a - b);
  const expected = [...QUICK_FIRE_VALUES].sort((a, b) => a - b);

  if (JSON.stringify(used) !== JSON.stringify(expected)) {
    throw new Error("Quick-Fire attributes must use exactly 40, 50, 50, 50, 60, 60, 70, 80.");
  }

  values.Luck = luck;
  return values;
}

function validateTraditionalAttributes(attributes) {
  for (const key of TRADITIONAL_ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (!Number.isInteger(value) || value < 15 || value > 90 || value % 5 !== 0) {
      throw new Error(`Traditional attribute out of range: ${key}=${value}`);
    }
  }
  if (!Number.isInteger(attributes.Luck) || attributes.Luck < 15 || attributes.Luck > 90 || attributes.Luck % 5 !== 0) {
    throw new Error(`Traditional Luck out of range: Luck=${attributes.Luck}`);
  }
  return attributes;
}

function expandAttributeBlocks(attributes) {
  return {
    STR: calculateHalfAndFifth(attributes.STR),
    CON: calculateHalfAndFifth(attributes.CON),
    DEX: calculateHalfAndFifth(attributes.DEX),
    APP: calculateHalfAndFifth(attributes.APP),
    POW: calculateHalfAndFifth(attributes.POW),
    INT: calculateHalfAndFifth(attributes.INT),
    SIZ: calculateHalfAndFifth(attributes.SIZ),
    EDU: calculateHalfAndFifth(attributes.EDU),
    Luck: calculateHalfAndFifth(attributes.Luck)
  };
}

function calculatePointBudgets(attributes, occupation) {
  const occupationPoints = occupation.occupationSkillFormula === "EDUx4"
    ? attributes.EDU * 4
    : occupation.occupationSkillFormula === "EDUx2+DEXx2"
      ? (attributes.EDU * 2) + (attributes.DEX * 2)
      : occupation.occupationSkillFormula === "EDUx2+APPx2"
        ? (attributes.EDU * 2) + (attributes.APP * 2)
        : occupation.occupationSkillFormula === "EDUx2+STRx2"
          ? (attributes.EDU * 2) + (attributes.STR * 2)
          : attributes.EDU * 4;

  return {
    occupation: occupationPoints,
    interest: attributes.INT * 2
  };
}

function normalizeSkillAllocation(skill = {}) {
  const occupation = Number(
    skill.occupationPointsSpent
    ?? skill.occupationPoints
    ?? skill.occupation
    ?? skill.allocation?.occupation
    ?? 0
  );
  const interest = Number(
    skill.interestPointsSpent
    ?? skill.interestPoints
    ?? skill.interest
    ?? skill.allocation?.interest
    ?? 0
  );
  const base = Number(skill.baseValue ?? skill.base ?? skill.startingValue ?? 0);

  return {
    occupation,
    interest,
    base,
    totalAllocated: occupation + interest,
    finalValue: Number(skill.value ?? 0)
  };
}

function validateSkillPointBudgets(skills = [], pointBudgets = {}) {
  const usage = {
    occupation: 0,
    interest: 0,
    trackedSkills: 0,
    untrackedSkills: 0,
    mismatches: []
  };

  for (const skill of skills) {
    const allocation = normalizeSkillAllocation(skill);
    const hasTrackedAllocation = allocation.occupation > 0 || allocation.interest > 0 || skill.baseValue !== undefined || skill.base !== undefined || skill.startingValue !== undefined || skill.allocation;

    if (!hasTrackedAllocation) {
      usage.untrackedSkills += 1;
      continue;
    }

    usage.trackedSkills += 1;
    usage.occupation += allocation.occupation;
    usage.interest += allocation.interest;

    if (allocation.finalValue !== allocation.base + allocation.totalAllocated) {
      usage.mismatches.push({
        key: skill.key,
        expected: allocation.base + allocation.totalAllocated,
        actual: allocation.finalValue
      });
    }
  }

  if (usage.mismatches.length) {
    const detail = usage.mismatches.map((item) => `${item.key}: expected ${item.expected}, got ${item.actual}`).join("; ");
    throw new Error(`Skill allocation values do not match base + spent points: ${detail}`);
  }

  if (usage.occupation > Number(pointBudgets.occupation || 0)) {
    throw new Error(`Occupation skill points exceeded: spent ${usage.occupation}, budget ${pointBudgets.occupation}`);
  }

  if (usage.interest > Number(pointBudgets.interest || 0)) {
    throw new Error(`Interest skill points exceeded: spent ${usage.interest}, budget ${pointBudgets.interest}`);
  }

  return {
    occupationSpent: usage.occupation,
    occupationBudget: Number(pointBudgets.occupation || 0),
    interestSpent: usage.interest,
    interestBudget: Number(pointBudgets.interest || 0),
    trackedSkills: usage.trackedSkills,
    untrackedSkills: usage.untrackedSkills,
    valid: true
  };
}

function validateCreditRating(creditRating, occupation) {
  if (!Number.isInteger(creditRating) || creditRating < 0 || creditRating > 99) {
    throw new Error(`Credit Rating must be an integer between 0 and 99: ${creditRating}`);
  }

  const range = occupation.creditRatingRange;
  if (!Array.isArray(range) || range.length !== 2) return creditRating;

  const [min, max] = range;
  if (creditRating < min || creditRating > max) {
    throw new Error(`Credit Rating ${creditRating} out of range for ${occupation.name}: expected ${min}-${max}`);
  }

  return creditRating;
}

function createInvestigatorRecord(input, occupation, baseAttributes, creationMethod) {
  const resources = calculateDerivedStats(baseAttributes);
  const validation = validateInventoryForEra(input.inventory || [], input.era);
  const allowance = buildConditionalAllowance(validation);
  const creditRating = validateCreditRating(input.creditRating ?? occupation.creditRatingRange?.[0] ?? 0, occupation);
  const pointBudgets = calculatePointBudgets(baseAttributes, occupation);
  const normalizedSkills = applySkillDefaults(input.skills || [], { attributes: baseAttributes });
  const skillAllocation = validateSkillPointBudgets(normalizedSkills, pointBudgets);
  const finance = deriveFinanceFromCreditRating(creditRating);

  return {
    id: input.id,
    name: input.name,
    age: input.age,
    occupation: occupation.name,
    occupationKey: occupation.key,
    persona: input.persona,
    motivation: input.motivation,
    era: input.era,
    identity: {
      sex: input.sex || "",
      residence: input.residence || "unknown",
      birthplace: input.birthplace || "unknown",
      creditRating
    },
    attributes: {
      STR: baseAttributes.STR,
      CON: baseAttributes.CON,
      DEX: baseAttributes.DEX,
      APP: baseAttributes.APP,
      POW: baseAttributes.POW,
      INT: baseAttributes.INT,
      SIZ: baseAttributes.SIZ,
      EDU: baseAttributes.EDU
    },
    attributeChecks: expandAttributeBlocks(baseAttributes),
    occupationTemplate: occupation,
    pointBudgets,
    skillAllocation,
    creationMethod,
    resources,
    finance,
    backstory: {
      traits: input.backstory?.traits || [],
      beliefs: input.backstory?.beliefs || [],
      significantPeople: input.backstory?.significantPeople || [],
      meaningfulLocations: input.backstory?.meaningfulLocations || [],
      treasuredPossessions: input.backstory?.treasuredPossessions || [],
      injuriesScars: input.backstory?.injuriesScars || [],
      phobiasManias: input.backstory?.phobiasManias || []
    },
    skills: normalizedSkills,
    inventory: input.inventory || [],
    inventoryValidation: validation,
    inventoryAllowance: allowance,
    status: {
      conditions: ["normal"],
      majorWound: false,
      temporaryInsanity: false,
      indefiniteInsanity: false,
      temporaryEffects: []
    }
  };
}

function createInvestigatorFromQuickFire(input) {
  const occupation = getOccupationTemplate(input.occupationKey);
  const baseAttributes = buildQuickFireAttributes(input.attributeAssignments, input.luck ?? 50);
  return createInvestigatorRecord(input, occupation, baseAttributes, "quick_fire");
}

function createInvestigatorFromTraditional(input, randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(input.occupationKey);
  const rolled = input.attributeAssignments
    ? validateTraditionalAttributes({ ...input.attributeAssignments, Luck: input.luck ?? input.attributeAssignments.Luck ?? 50 })
    : generateTraditionalAttributes(randomInt);
  return createInvestigatorRecord(input, occupation, rolled, "traditional_random");
}

module.exports = {
  QUICK_FIRE_VALUES,
  ATTRIBUTE_KEYS,
  buildQuickFireAttributes,
  generateTraditionalAttributes,
  createInvestigatorFromQuickFire,
  createInvestigatorFromTraditional,
  calculatePointBudgets,
  validateSkillPointBudgets,
  validateCreditRating
};
