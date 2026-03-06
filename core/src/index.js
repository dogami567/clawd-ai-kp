const {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession
} = require("./state-machine");

const { runCheck, runOpposedCheck } = require("./check-engine");
const { createInvestigatorFromQuickFire, QUICK_FIRE_VALUES, ATTRIBUTE_KEYS } = require("./character-creation");
const { calculateDerivedStats } = require("./derived-stats");
const { listOccupationTemplates, getOccupationTemplate } = require("./occupation-templates");
const { validateInventoryForEra, buildConditionalAllowance } = require("./inventory-rules");

module.exports = {
  createSession,
  registerInvestigator,
  startInvestigationScene,
  performSkillCheck,
  startCombat,
  resolveCombatRound,
  runSanCheck,
  settleSession,
  runCheck,
  runOpposedCheck,
  createInvestigatorFromQuickFire,
  QUICK_FIRE_VALUES,
  ATTRIBUTE_KEYS,
  calculateDerivedStats,
  listOccupationTemplates,
  getOccupationTemplate,
  validateInventoryForEra,
  buildConditionalAllowance
};
