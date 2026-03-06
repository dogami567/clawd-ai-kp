const { calculateHalfAndFifth, calculateDerivedStats } = require("./derived-stats");
const { getOccupationTemplate } = require("./occupation-templates");
const { validateInventoryForEra, buildConditionalAllowance } = require("./inventory-rules");

const QUICK_FIRE_VALUES = [40, 50, 50, 50, 60, 60, 70, 80];
const ATTRIBUTE_KEYS = ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU"];

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

function createInvestigatorFromQuickFire(input) {
  const occupation = getOccupationTemplate(input.occupationKey);
  const baseAttributes = buildQuickFireAttributes(input.attributeAssignments, input.luck ?? 50);
  const resources = calculateDerivedStats(baseAttributes);
  const validation = validateInventoryForEra(input.inventory || [], input.era);
  const allowance = buildConditionalAllowance(validation);

  return {
    id: input.id,
    name: input.name,
    age: input.age,
    occupation: occupation.name,
    occupationKey: occupation.key,
    persona: input.persona,
    motivation: input.motivation,
    era: input.era,
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
    resources,
    skills: input.skills || [],
    inventory: input.inventory || [],
    inventoryValidation: validation,
    inventoryAllowance: allowance,
    status: {
      conditions: ["normal"],
      temporaryEffects: []
    }
  };
}

module.exports = {
  QUICK_FIRE_VALUES,
  ATTRIBUTE_KEYS,
  buildQuickFireAttributes,
  createInvestigatorFromQuickFire
};