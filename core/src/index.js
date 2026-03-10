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
const {
  createInvestigatorFromQuickFire,
  createInvestigatorFromTraditional,
  generateTraditionalAttributes,
  generateTraditionalAttributesDetailed,
  QUICK_FIRE_VALUES,
  ATTRIBUTE_KEYS
} = require("./character-creation");
const { calculateDerivedStats } = require("./derived-stats");
const { listOccupationTemplates, getOccupationTemplate } = require("./occupation-templates");
const { validateInventoryForEra, buildConditionalAllowance } = require("./inventory-rules");
const { createCharacter, startSessionApi, addInvestigator, submitAction, getState, settleSessionApi, saveSessionApi, loadSessionApi, loadSessionSnapshotApi } = require("./api");
const { adjudicateAction } = require("./adjudication-engine");
const { WEAPON_TABLE, getWeaponProfile, buildCombatActionFromWeapon } = require("./weapon-table");
const { createSessionSnapshot, serializeSessionSnapshot, parseSessionSnapshot, saveSessionState, loadSessionState, loadSessionSnapshot } = require("./session-storage");
const { validateInvestigatorCard, validateSceneState, validateCheckEvent, validateSessionState } = require("./schema-validation");
const { loadSceneTemplate, buildNpcRuntimeFromCard, buildScenarioNpcs, applySceneTemplate, seedSessionFromScenario } = require("./scene-loader");
const { loadCampaignTemplate, getCampaignScene, listCampaignHooks, buildCampaignMeta, ensureCampaignRuntime, attachCampaignMeta, getCurrentCampaign, transitionCampaignScene, recordCampaignRuntime, listCampaignRuntimeNpcAftermath, evaluateHookConditions, listEligibleHooks, autoAdvanceCampaign, formatCampaignSummary } = require("./campaign-loader");
const { loadStoryPackTemplate, formatStoryPackSummary } = require("./story-pack-loader");
const { validateCampaignTemplate, validateStoryPackTemplate } = require("./authoring-validation");
const { importSceneMarkdown } = require("./scene-markdown-import");
const { importCampaignMarkdown, importStoryPackMarkdown } = require("./campaign-story-markdown-import");
const { saveSceneTemplate, saveCampaignTemplate, saveStoryPackTemplate } = require("./authoring-save");
const { normalizeText, routeOldChurchNightAction, routeScenarioAction, processScenarioTurn } = require("./scene-action-router");
const {
  FAILURE_FORWARD_LIBRARY,
  PUSHED_ROLL_LIBRARY,
  PENALTY_DICE_LIBRARY,
  SANITY_AFTERMATH_LIBRARY,
  INJURY_AFTERMATH_LIBRARY,
  buildActionRuleGuidance
} = require("./coc7-content-libraries");

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
  generateTraditionalAttributesDetailed,
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
  ensureCampaignRuntime,
  attachCampaignMeta,
  getCurrentCampaign,
  transitionCampaignScene,
  recordCampaignRuntime,
  listCampaignRuntimeNpcAftermath,
  evaluateHookConditions,
  listEligibleHooks,
  autoAdvanceCampaign,
  formatCampaignSummary,
  loadStoryPackTemplate,
  formatStoryPackSummary,
  validateCampaignTemplate,
  validateStoryPackTemplate,
  importSceneMarkdown,
  importCampaignMarkdown,
  importStoryPackMarkdown,
  saveSceneTemplate,
  saveCampaignTemplate,
  saveStoryPackTemplate,
  normalizeText,
  routeOldChurchNightAction,
  routeScenarioAction,
  processScenarioTurn,
  FAILURE_FORWARD_LIBRARY,
  PUSHED_ROLL_LIBRARY,
  PENALTY_DICE_LIBRARY,
  SANITY_AFTERMATH_LIBRARY,
  INJURY_AFTERMATH_LIBRARY,
  buildActionRuleGuidance
};
