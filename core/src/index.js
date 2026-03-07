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
const { createCharacter, startSessionApi, addInvestigator, submitAction, getState, settleSessionApi, saveSessionApi, loadSessionApi, loadSessionSnapshotApi } = require("./api");
const { adjudicateAction } = require("./adjudication-engine");
const { WEAPON_TABLE, getWeaponProfile, buildCombatActionFromWeapon } = require("./weapon-table");
const { createSessionSnapshot, serializeSessionSnapshot, parseSessionSnapshot, saveSessionState, loadSessionState, loadSessionSnapshot } = require("./session-storage");
const { validateInvestigatorCard, validateSceneState, validateCheckEvent, validateSessionState } = require("./schema-validation");
const { loadSceneTemplate, buildNpcRuntimeFromCard, buildScenarioNpcs, applySceneTemplate, seedSessionFromScenario } = require("./scene-loader");
const { loadCampaignTemplate, getCampaignScene, listCampaignHooks, buildCampaignMeta, attachCampaignMeta, getCurrentCampaign, transitionCampaignScene, evaluateHookConditions, listEligibleHooks, autoAdvanceCampaign, formatCampaignSummary } = require("./campaign-loader");
const { loadStoryPackTemplate, formatStoryPackSummary } = require("./story-pack-loader");
const { validateCampaignTemplate, validateStoryPackTemplate } = require("./authoring-validation");
const { normalizeText, routeOldChurchNightAction, routeScenarioAction, processScenarioTurn } = require("./scene-action-router");

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
  saveSessionApi,
  loadSessionApi,
  loadSessionSnapshotApi,
  adjudicateAction,
  WEAPON_TABLE,
  getWeaponProfile,
  buildCombatActionFromWeapon,
  createSessionSnapshot,
  serializeSessionSnapshot,
  parseSessionSnapshot,
  saveSessionState,
  loadSessionState,
  loadSessionSnapshot,
  validateInvestigatorCard,
  validateSceneState,
  validateCheckEvent,
  validateSessionState,
  loadSceneTemplate,
  buildNpcRuntimeFromCard,
  buildScenarioNpcs,
  applySceneTemplate,
  seedSessionFromScenario,
  loadCampaignTemplate,
  getCampaignScene,
  listCampaignHooks,
  buildCampaignMeta,
  attachCampaignMeta,
  getCurrentCampaign,
  transitionCampaignScene,
  evaluateHookConditions,
  listEligibleHooks,
  autoAdvanceCampaign,
  formatCampaignSummary,
  loadStoryPackTemplate,
  formatStoryPackSummary,
  validateCampaignTemplate,
  validateStoryPackTemplate,
  normalizeText,
  routeOldChurchNightAction,
  routeScenarioAction,
  processScenarioTurn
};
