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
const { createInvestigatorFromQuickFire, createInvestigatorFromTraditional, generateTraditionalAttributes, QUICK_FIRE_VALUES, ATTRIBUTE_KEYS } = require("./character-creation");
const { calculateDerivedStats } = require("./derived-stats");
const { listOccupationTemplates, getOccupationTemplate } = require("./occupation-templates");
const { validateInventoryForEra, buildConditionalAllowance } = require("./inventory-rules");
const { createCharacter, startSessionApi, addInvestigator, submitAction, getState, settleSessionApi } = require("./api");
const { adjudicateAction } = require("./adjudication-engine");
const { WEAPON_TABLE, getWeaponProfile, buildCombatActionFromWeapon } = require("./weapon-table");

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
  createInvestigatorFromTraditional,
  generateTraditionalAttributes,
  QUICK_FIRE_VALUES,
  ATTRIBUTE_KEYS,
  calculateDerivedStats,
  listOccupationTemplates,
  getOccupationTemplate,
  validateInventoryForEra,
  buildConditionalAllowance,
  createCharacter,
  startSessionApi,
  addInvestigator,
  submitAction,
  getState,
  settleSessionApi,
  adjudicateAction,
  WEAPON_TABLE,
  getWeaponProfile,
  buildCombatActionFromWeapon
};
