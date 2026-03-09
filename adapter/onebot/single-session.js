const { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("fs");
const { join } = require("path");
const {
  startSessionApi,
  addInvestigator,
  getState,
  saveSessionApi,
  loadSessionApi,
  createCharacter,
  createInvestigatorFromTraditional,
  generateTraditionalAttributesDetailed,
  getOccupationTemplate,
  listOccupationTemplates,
  QUICK_FIRE_VALUES,
  processScenarioTurn,
  settleSessionApi,
  loadCampaignTemplate,
  attachCampaignMeta,
  formatCampaignSummary,
  getCurrentCampaign,
  transitionCampaignScene,
  listEligibleHooks,
  autoAdvanceCampaign,
  loadStoryPackTemplate,
  formatStoryPackSummary
} = require("../../core/src/index");
const { resolveSkillDefault } = require("../../core/src/skill-defaults");
const {
  ensureSummaryState,
  appendChatLog,
  appendOperationLog,
  appendPlayerOperationLogs,
  writeStateSnapshot,
  writeContextSnapshot,
  buildContextPacket,
  maybeRollupSummaries,
  safeReadJsonLines
} = require("./log-store");

const KP_RUNTIME_PROMPT = [
  "你现在是 AI 跑团的 KP，名字叫麦麦。",
  "语气可爱、口语化，会自然带一点颜文字，但不要说教，也别端着像模板回复。",
  "你要优先理解玩家自然语言意图，能自动帮他们触发车卡、检定、推进场景，不要求玩家背指令。",
  "公开骰一定给玩家看清楚点数、目标值和结果；暗骰不要把点数直接抖给玩家。"
].join("\n");

const OCCUPATION_ALIASES = Object.freeze([
  ["journalist", "journalist"],
  ["reporter", "journalist"],
  ["记者", "journalist"],
  ["detective", "detective"],
  ["private detective", "detective"],
  ["私家侦探", "detective"],
  ["侦探", "detective"],
  ["doctor", "doctor"],
  ["physician", "doctor"],
  ["医生", "doctor"],
  ["professor", "professor"],
  ["学者", "professor"],
  ["教授", "professor"],
  ["artist", "artist"],
  ["singer", "artist"],
  ["艺术家", "artist"],
  ["歌手", "artist"],
  ["veteran", "veteran"],
  ["soldier", "veteran"],
  ["退伍军人", "veteran"],
  ["老兵", "veteran"],
  ["军人", "veteran"],
  ["dilettante", "dilettante"],
  ["socialite", "dilettante"],
  ["富家子", "dilettante"],
  ["社交名流", "dilettante"],
  ["名流", "dilettante"]
]);

const STORY_PACK_FILE_SUFFIX = ".story-pack.json";
const STORY_PACKS_DIR = join(__dirname, "..", "..", "core", "data", "story-packs");
const STORY_PACK_REQUIRED_COMMANDS = new Set([
  "start",
  "state",
  "campaign",
  "hooks",
  "storypack",
  "goto",
  "advance",
  "scene",
  "recap",
  "clues",
  "npcs",
  "settle"
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getKpRuntimePrompt() {
  return KP_RUNTIME_PROMPT;
}

function listStoryPackTemplates() {
  if (!existsSync(STORY_PACKS_DIR)) return [];
  return readdirSync(STORY_PACKS_DIR)
    .filter((fileName) => fileName.endsWith(STORY_PACK_FILE_SUFFIX))
    .map((fileName) => fileName.slice(0, -STORY_PACK_FILE_SUFFIX.length))
    .sort()
    .map((storyPackId) => loadStoryPackTemplate(storyPackId));
}

function listStoryPackEntries() {
  return listStoryPackTemplates().map((storyPack, index) => {
    const campaign = loadCampaignTemplate(storyPack.campaignId);
    return {
      index: index + 1,
      storyPack,
      campaign,
      startSceneId: campaign.startSceneId || storyPack.sceneIds?.[0] || "old-church-night"
    };
  });
}

function getSelectedStoryPackEntry(meta = {}) {
  const storyPackId = typeof meta.storyPackId === "string" ? meta.storyPackId.trim() : "";
  if (!storyPackId) return null;
  return listStoryPackEntries().find((entry) => entry.storyPack.id === storyPackId) || null;
}

function normalizeStoryPackSelectorText(text = "") {
  return normalizeIntentText(text)
    .replace(/\s+/g, "")
    .replace(/^(那就|就|我选|选|跑|开|来跑|来个|玩|想跑|想开)+/g, "")
    .replace(/(那个|这个|这条|那条|这一条|那一条|这个本|那个本|这个剧本|那个剧本|这个模组|那个模组|故事包)/g, "")
    .replace(/(就行|就好|可以了|好了|行了|可以|行吧|吧|呀|啊|啦|呢|嘛)+$/g, "")
    .trim();
}

function resolveStoryPackSelection(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;

  if (includesAny(normalized, ["看看剧本", "剧本列表", "模组列表", "故事包列表", "story pack", "storypack", "packs"])) {
    return { kind: "list" };
  }

  const entries = listStoryPackEntries();
  const trimmed = normalized.trim();
  const looseTrimmed = normalizeStoryPackSelectorText(text);
  if (/^\d+$/.test(trimmed)) {
    const byIndex = entries.find((entry) => String(entry.index) === trimmed);
    if (byIndex) return { kind: "select", storyPackId: byIndex.storyPack.id };
  }

  for (const entry of entries) {
    const aliases = [
      entry.storyPack.id,
      entry.storyPack.title,
      String(entry.storyPack.title || "").replace(/\s*story pack\s*/ig, ""),
      entry.campaign.id,
      entry.campaign.title
    ]
      .map((value) => normalizeIntentText(value))
      .filter(Boolean);
    const looseAliases = aliases
      .map((alias) => normalizeStoryPackSelectorText(alias))
      .filter(Boolean);

    if (
      aliases.some((alias) => trimmed === alias || trimmed.includes(alias) || alias.includes(trimmed)) ||
      (looseTrimmed && looseAliases.some(
        (alias) => looseTrimmed === alias || looseTrimmed.includes(alias) || alias.includes(looseTrimmed)
      ))
    ) {
      return { kind: "select", storyPackId: entry.storyPack.id };
    }
  }

  return null;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getMessageText(event = {}) {
  return String(event.message ?? event.raw_message ?? event.text ?? "").trim();
}

function getSenderName(event = {}) {
  return String(event.sender?.card || event.sender?.nickname || event.user_name || `玩家${event.user_id || "unknown"}`);
}

function normalizeIntentText(text = "") {
  return String(text).trim().toLowerCase();
}

function includesAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getOccupationAliasPairs() {
  const dynamicPairs = listOccupationTemplates().flatMap((occupation) => ([
    [occupation.key.toLowerCase(), occupation.key],
    [occupation.name.toLowerCase(), occupation.key]
  ]));
  return [...dynamicPairs, ...OCCUPATION_ALIASES];
}

function extractOccupationKeyFromText(text) {
  if (!text) return null;
  const normalized = normalizeIntentText(text);
  const aliasPairs = getOccupationAliasPairs()
    .map(([alias, key]) => [String(alias).toLowerCase(), key])
    .sort((left, right) => right[0].length - left[0].length);

  for (const [alias, key] of aliasPairs) {
    if (normalized.includes(alias)) {
      return key;
    }
  }

  return null;
}

function detectOccupationKeyFromText(text, fallback = "journalist") {
  return extractOccupationKeyFromText(text) || fallback;
}

function buildConversationKey(event = {}) {
  if (event.group_id) return `onebot-group-${sanitizeSegment(event.group_id)}`;
  if (event.user_id) return `onebot-dm-${sanitizeSegment(event.user_id)}`;
  return "onebot-unknown";
}

function buildStorageLayoutFromConversationKey(storageRoot, conversationKey) {
  const root = storageRoot || join(__dirname, "..", "..", "runtime", "onebot");
  const logsConversationDir = join(root, "logs", conversationKey);
  return {
    root,
    conversationKey,
    sessionsDir: join(root, "sessions"),
    metaDir: join(root, "meta"),
    archiveConversationDir: join(root, "archives", conversationKey),
    sessionFile: join(root, "sessions", `${conversationKey}.json`),
    metaFile: join(root, "meta", `${conversationKey}.json`),
    logsConversationDir,
    chatLogDir: join(logsConversationDir, "chat"),
    ledgerLogDir: join(logsConversationDir, "ledger"),
    playerLogDir: join(logsConversationDir, "players"),
    stateDir: join(logsConversationDir, "state"),
    summaryDir: join(logsConversationDir, "summaries"),
    contextDir: join(logsConversationDir, "context"),
    chatLogFile: join(logsConversationDir, "chat", "events.jsonl"),
    ledgerLogFile: join(logsConversationDir, "ledger", "operations.jsonl"),
    stateFile: join(logsConversationDir, "state", "latest.json"),
    contextFile: join(logsConversationDir, "context", "latest.json")
  };
}

function buildStorageLayout(storageRoot, event) {
  return buildStorageLayoutFromConversationKey(storageRoot, buildConversationKey(event));
}

function ensureStorageDirs(layout) {
  mkdirSync(layout.sessionsDir, { recursive: true });
  mkdirSync(layout.metaDir, { recursive: true });
  mkdirSync(layout.archiveConversationDir, { recursive: true });
}

function ensureConversationControlState(meta) {
  meta.archiveHistory = Array.isArray(meta.archiveHistory) ? meta.archiveHistory : [];
  meta.pendingResumeChoice = meta.pendingResumeChoice && typeof meta.pendingResumeChoice === "object"
    ? meta.pendingResumeChoice
    : null;
  meta.pendingStoryPackChoice = meta.pendingStoryPackChoice && typeof meta.pendingStoryPackChoice === "object"
    ? meta.pendingStoryPackChoice
    : null;
  meta.storyPackId = typeof meta.storyPackId === "string" && meta.storyPackId.trim()
    ? meta.storyPackId.trim()
    : null;
  meta.sceneIntroDeliveredAt = typeof meta.sceneIntroDeliveredAt === "string" && meta.sceneIntroDeliveredAt.trim()
    ? meta.sceneIntroDeliveredAt.trim()
    : null;
  return meta;
}

function loadMeta(layout) {
  ensureStorageDirs(layout);
  if (!existsSync(layout.metaFile)) return null;
  const meta = JSON.parse(readFileSync(layout.metaFile, "utf8"));
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  return meta;
}

function saveMeta(layout, meta) {
  ensureStorageDirs(layout);
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  writeFileSync(layout.metaFile, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

function isAiKpCommand(text = "") {
  return String(text).trim().startsWith("/aikp");
}

function normalizeWhitelist(values = []) {
  return new Set((values || []).map((value) => String(value)));
}

function isConversationWhitelisted(event, options = {}) {
  if (!event.group_id) return true;
  if (!Array.isArray(options.groupWhitelist) || !options.groupWhitelist.length) return true;
  return normalizeWhitelist(options.groupWhitelist).has(String(event.group_id));
}

function readConversationMetaSnapshot(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  return {
    layout,
    meta: loadMeta(layout)
  };
}

function getConversationRuntimeState(event, options = {}) {
  const { layout, meta } = readConversationMetaSnapshot(event, options);
  return {
    conversationKey: layout.conversationKey,
    sessionMode: meta?.sessionMode || "idle",
    runtimeProfileId: meta?.runtimeProfileId || "maimai-kp-v1",
    summaryState: cloneJson(meta?.summaryState || {}),
    knownUsers: cloneJson(meta?.knownUsers || []),
    contextRef: layout.contextFile,
    hasContext: existsSync(layout.contextFile),
    hasSession: existsSync(layout.sessionFile)
  };
}

function rememberUser(meta, event) {
  meta.knownUsers = Array.isArray(meta.knownUsers) ? meta.knownUsers : [];
  if (!event.user_id) return meta;
  const userId = String(event.user_id);
  const existing = meta.knownUsers.find((item) => item.userId === userId);
  if (existing) {
    existing.name = getSenderName(event);
  } else {
    meta.knownUsers.push({ userId, name: getSenderName(event) });
  }
  return meta;
}

function ensureTurnState(meta) {
  meta.turnState = meta.turnState || {
    actorOrder: [],
    currentActorId: null,
    round: 1
  };
  meta.turnState.actorOrder = Array.isArray(meta.turnState.actorOrder) ? meta.turnState.actorOrder : [];
  if (meta.turnState.round == null) meta.turnState.round = 1;
  return meta.turnState;
}

function buildInitialMeta(event, layout, scenarioId, options = {}) {
  const meta = {
    conversationKey: layout.conversationKey,
    sessionFile: layout.sessionFile,
    scenarioId,
    storyPackId: options.storyPackId || null,
    sceneIntroDeliveredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actorsByUserId: {},
    knownUsers: [],
    messageCount: 0,
    sessionMode: "idle",
    runtimeProfileId: "maimai-kp-v1",
    turnState: {
      actorOrder: [],
      currentActorId: null,
      round: 1
    }
  };
  ensureConversationControlState(meta);
  ensureSummaryState(meta);
  rememberUser(meta, event);
  return meta;
}

function ensureConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  const campaignId = options.campaignId || "old-church-arc";
  const storyPackId = options.storyPackId || null;
  let meta = loadMeta(layout);
  let sessionState;

  if (meta && existsSync(layout.sessionFile)) {
    sessionState = loadSessionApi(layout.sessionFile);
    ensureSummaryState(meta);
    ensureConversationControlState(meta);
    if (!meta.sessionMode) meta.sessionMode = "idle";
    if (!meta.runtimeProfileId) meta.runtimeProfileId = "maimai-kp-v1";
    rememberUser(meta, event);
    saveMeta(layout, meta);
    return { layout, meta, sessionState, created: false };
  }

  sessionState = startSessionApi({
    sessionId: `onebot-${layout.conversationKey}`,
    scenarioId
  });
  attachCampaignMeta(sessionState, loadCampaignTemplate(campaignId));
  saveSessionApi(sessionState, layout.sessionFile, { meta: { conversationKey: layout.conversationKey } });
  meta = buildInitialMeta(event, layout, scenarioId, { storyPackId });
  meta.campaignId = campaignId;
  saveMeta(layout, meta);
  return { layout, meta, sessionState, created: true };
}

function rebuildConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  const campaignId = options.campaignId || "old-church-arc";
  const storyPackId = options.storyPackId || null;
  const sessionState = startSessionApi({ sessionId: `onebot-${layout.conversationKey}`, scenarioId });
  attachCampaignMeta(sessionState, loadCampaignTemplate(campaignId));
  const meta = buildInitialMeta(event, layout, scenarioId, { storyPackId });
  meta.campaignId = campaignId;
  saveSessionApi(sessionState, layout.sessionFile, { meta: { conversationKey: layout.conversationKey } });
  saveMeta(layout, meta);
  return { layout, meta, sessionState, created: true };
}

function maybeResetSession(event, options = {}) {
  if (!options.reset) return ensureConversationSession(event, options);
  return rebuildConversationSession(event, options);
}

function calculateOccupationBudget(attributes, formula) {
  if (formula === "EDUx4") return attributes.EDU * 4;
  if (formula === "EDUx2+DEXx2") return (attributes.EDU * 2) + (attributes.DEX * 2);
  if (formula === "EDUx2+APPx2") return (attributes.EDU * 2) + (attributes.APP * 2);
  if (formula === "EDUx2+STRx2") return (attributes.EDU * 2) + (attributes.STR * 2);
  return attributes.EDU * 4;
}

function uniqueList(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function guessSkillTag(skillKey = "") {
  if (["Spot Hidden", "Listen", "Psychology", "Library Use", "History", "Law", "Science", "Science (Biology)", "Science (Pharmacy)", "Own Language", "Language (Other)", "Medicine", "First Aid"].includes(skillKey)) {
    return "investigation";
  }
  if (["Persuade", "Fast Talk", "Charm", "Intimidate", "Credit Rating", "Psychology"].includes(skillKey)) {
    return "social";
  }
  if (["Fighting", "Firearms", "Stealth", "Dodge", "Climb", "Throw", "Survival", "Disguise", "Locksmith"].includes(skillKey)) {
    return "action";
  }
  return "other";
}

function normalizeSuggestedSkills(skills = []) {
  return uniqueList(skills.map((skill) => {
    if (skill === "Any Interpersonal") return "Persuade";
    return skill;
  }));
}

function allocatePool(skillMap, keys, field, budget, capMap = {}) {
  let remaining = budget;
  let safety = 0;

  while (remaining >= 5 && safety < 2000) {
    safety += 1;
    let progressed = false;

    for (const key of keys) {
      if (remaining < 5) break;
      const skill = skillMap.get(key);
      if (!skill) continue;
      const current = skill.baseValue + skill.occupationPointsSpent + skill.interestPointsSpent;
      const cap = capMap[key] ?? 75;
      if (current >= cap) continue;
      skill[field] += 5;
      remaining -= 5;
      progressed = true;
    }

    if (!progressed) break;
  }

  return remaining;
}

function buildStarterSkills(attributes, occupation, creditRating) {
  const occupationSkills = normalizeSuggestedSkills(occupation.suggestedSkills || []);
  const interestSkills = uniqueList([
    ...occupationSkills,
    "Spot Hidden",
    "Listen",
    "Psychology",
    "Persuade",
    "Stealth",
    "Fighting",
    "Library Use",
    "First Aid"
  ]);

  const skillMap = new Map();
  const ensureSkill = (key) => {
    if (!skillMap.has(key)) {
      skillMap.set(key, {
        key,
        tag: guessSkillTag(key),
        baseValue: resolveSkillDefault(key, { attributes }),
        occupationPointsSpent: 0,
        interestPointsSpent: 0
      });
    }
    return skillMap.get(key);
  };

  occupationSkills.forEach(ensureSkill);
  interestSkills.forEach(ensureSkill);

  const occupationBudget = calculateOccupationBudget(attributes, occupation.occupationSkillFormula);
  const interestBudget = attributes.INT * 2;

  let remainingOccupation = occupationBudget;
  if (skillMap.has("Credit Rating")) {
    const creditSkill = skillMap.get("Credit Rating");
    const needed = Math.max(0, creditRating - creditSkill.baseValue);
    const allocated = Math.min(needed, remainingOccupation);
    creditSkill.occupationPointsSpent += allocated;
    remainingOccupation -= allocated;
  }

  allocatePool(skillMap, occupationSkills, "occupationPointsSpent", remainingOccupation, {
    "Credit Rating": Math.max(creditRating, 75),
    "Own Language": 90
  });
  allocatePool(skillMap, interestSkills, "interestPointsSpent", interestBudget, {
    "Own Language": 90
  });

  return Array.from(skillMap.values()).map((skill) => ({
    ...skill,
    value: Math.min(99, skill.baseValue + skill.occupationPointsSpent + skill.interestPointsSpent)
  }));
}

function pickCreditRating(occupation) {
  const [min, max] = occupation.creditRatingRange || [0, 20];
  return Math.floor((min + max) / 2);
}

function shuffleQuickFireAssignments(randomInt = defaultRandomInt) {
  const pool = [...QUICK_FIRE_VALUES];
  const keys = ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU"];
  const assignments = {};

  for (const key of keys) {
    const index = randomInt(0, pool.length - 1);
    assignments[key] = pool.splice(index, 1)[0];
  }

  return assignments;
}

function buildGeneratedBase(event, occupationKey) {
  const name = getSenderName(event);
  return {
    id: `pc-onebot-${sanitizeSegment(event.user_id || "guest")}`,
    name,
    age: 26,
    occupationKey,
    persona: "眼睛尖，脑子转得快，遇到怪事不会轻易撒手。",
    motivation: "想把眼前这摊怪事查出个真相。",
    era: "depression_era_1920s",
    residence: "Arkham",
    birthplace: "Boston"
  };
}

function buildTraditionalInvestigatorBundle(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(occupationKey);
  const generated = generateTraditionalAttributesDetailed(randomInt);
  const rolled = generated.attributes;
  const attributes = {
    STR: rolled.STR,
    CON: rolled.CON,
    DEX: rolled.DEX,
    APP: rolled.APP,
    POW: rolled.POW,
    SIZ: rolled.SIZ,
    INT: rolled.INT,
    EDU: rolled.EDU,
    Luck: rolled.Luck
  };
  const creditRating = pickCreditRating(occupation);
  const skills = buildStarterSkills(attributes, occupation, creditRating);

  return {
    generated,
    investigator: createInvestigatorFromTraditional({
      ...buildGeneratedBase(event, occupationKey),
      creditRating,
      luck: rolled.Luck,
      attributeAssignments: {
        STR: rolled.STR,
        CON: rolled.CON,
        DEX: rolled.DEX,
        APP: rolled.APP,
        POW: rolled.POW,
        SIZ: rolled.SIZ,
        INT: rolled.INT,
        EDU: rolled.EDU
      },
      skills,
      inventory: [
        { name: "手电", category: "tool", quantity: 1 },
        { name: "笔记本", category: "tool", quantity: 1 }
      ]
    }, randomInt)
  };
}

function createRolledInvestigator(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  return buildTraditionalInvestigatorBundle(event, occupationKey, randomInt).investigator;
}

function createQuickfireInvestigator(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(occupationKey);
  const attributeAssignments = shuffleQuickFireAssignments(randomInt);
  const luck = 55;
  const creditRating = pickCreditRating(occupation);
  const skills = buildStarterSkills({ ...attributeAssignments, Luck: luck }, occupation, creditRating);

  return createCharacter({
    ...buildGeneratedBase(event, occupationKey),
    creditRating,
    luck,
    attributeAssignments,
    skills,
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "笔记本", category: "tool", quantity: 1 }
    ]
  });
}

function buildInvestigatorBundleForMode(event, mode, occupationKey, randomInt) {
  if (mode === "quickfire") {
    const investigator = createQuickfireInvestigator(event, occupationKey, randomInt);
    return {
      mode,
      occupationKey,
      investigator,
      generation: {
        mode,
        quickfireAssignments: { ...investigator.attributes, Luck: investigator.resources.luck }
      }
    };
  }

  const bundle = buildTraditionalInvestigatorBundle(event, occupationKey, randomInt);
  return {
    mode,
    occupationKey,
    investigator: bundle.investigator,
    generation: {
      mode,
      breakdown: bundle.generated.breakdown
    }
  };
}

function getActorForUser(stateBundle, userId) {
  const actorId = stateBundle.meta.actorsByUserId[String(userId)];
  return actorId ? stateBundle.sessionState.investigators[actorId] : null;
}

function syncActorIntoTurnState(meta, actorId) {
  const turnState = ensureTurnState(meta);
  if (!turnState.actorOrder.includes(actorId)) {
    turnState.actorOrder.push(actorId);
  }
  if (!turnState.currentActorId) {
    turnState.currentActorId = actorId;
  }
  return turnState;
}

function buildPartyEntries(stateBundle) {
  const knownUsers = Array.isArray(stateBundle.meta.knownUsers) ? stateBundle.meta.knownUsers : [];
  const turnState = ensureTurnState(stateBundle.meta);
  return knownUsers.map((user) => {
    const actorId = stateBundle.meta.actorsByUserId[String(user.userId)] || null;
    const investigator = actorId ? stateBundle.sessionState.investigators[actorId] : null;
    return {
      userId: String(user.userId),
      userName: user.name,
      actorId,
      investigator,
      isCurrent: Boolean(actorId && turnState.currentActorId === actorId)
    };
  });
}

function resolveActorSelection(stateBundle, selector = "") {
  const normalized = String(selector || "").trim().toLowerCase();
  if (!normalized) return null;
  const entries = buildPartyEntries(stateBundle);
  return entries.find((entry) => {
    const fields = [
      entry.userId,
      entry.userName,
      entry.actorId,
      entry.investigator?.id,
      entry.investigator?.name
    ].filter(Boolean).map((value) => String(value).toLowerCase());
    return fields.some((value) => value === normalized || value.includes(normalized));
  }) || null;
}

function setCurrentActor(stateBundle, actorId) {
  const turnState = ensureTurnState(stateBundle.meta);
  syncActorIntoTurnState(stateBundle.meta, actorId);
  turnState.currentActorId = actorId;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return turnState;
}

function advanceCurrentActor(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  const available = turnState.actorOrder.filter((actorId) => stateBundle.sessionState.investigators[actorId]);
  if (!available.length) return turnState;
  const currentIndex = Math.max(available.indexOf(turnState.currentActorId), 0);
  const nextIndex = (currentIndex + 1) % available.length;
  turnState.currentActorId = available[nextIndex];
  if (nextIndex === 0) turnState.round += 1;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return turnState;
}

function upsertInvestigatorForUser(event, stateBundle, investigator) {
  addInvestigator(stateBundle.sessionState, investigator);
  stateBundle.meta.actorsByUserId[String(event.user_id || "guest")] = investigator.id;
  syncActorIntoTurnState(stateBundle.meta, investigator.id);
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return investigator;
}

function createDefaultInvestigator(event, overrides = {}) {
  return createQuickfireInvestigator(event, overrides.occupationKey || "journalist", overrides.randomInt || defaultRandomInt);
}

function ensureActorForUser(event, stateBundle, options = {}) {
  const userId = String(event.user_id || "guest");
  const mappedActorId = stateBundle.meta.actorsByUserId[userId];
  if (mappedActorId && stateBundle.sessionState.investigators[mappedActorId]) {
    return { actorId: mappedActorId, created: false, investigator: stateBundle.sessionState.investigators[mappedActorId] };
  }

  if (!options.autoCreateInvestigator) {
    return { actorId: null, created: false, investigator: null };
  }

  const investigator = createDefaultInvestigator(event, options.investigatorOverrides || {});
  upsertInvestigatorForUser(event, stateBundle, investigator);
  return { actorId: investigator.id, created: true, investigator };
}

function formatStateSummary(sessionState, meta = {}) {
  const state = getState(sessionState);
  const revealedClues = state.scene.clues.filter((item) => item.revealed).map((item) => item.title);
  const npcBits = (state.scene.participants.npcs || []).map((npc) => `${npc.name}(${npc.attitude})`);
  const turnState = ensureTurnState(meta);
  const currentActor = turnState.currentActorId ? sessionState.investigators[turnState.currentActorId] : null;
  const lines = [
    `场景：${state.scene.summary || state.scene.location}`,
    `地点：${state.scene.location}`,
    `时间：${state.scene.timeState.timelineMinute} 分钟`,
    `危险：${state.scene.threats.dangerLevel}（暴露 ${state.scene.threats.exposure} / 压力 ${state.scene.threats.pressure}）`,
    `当前轮次：第 ${turnState.round} 轮｜当前聚焦：${currentActor ? currentActor.name : "未指定"}`,
    `线索：${revealedClues.length ? revealedClues.join("、") : "还没翻到明线索"}`,
    `在场 NPC：${npcBits.length ? npcBits.join("、") : "暂无"}`
  ];
  return lines.join("\n");
}

function formatPartySummary(stateBundle) {
  const entries = buildPartyEntries(stateBundle);
  const turnState = ensureTurnState(stateBundle.meta);
  const lines = [`队伍面板｜第 ${turnState.round} 轮`];
  if (!entries.length) {
    lines.push("- 当前还没人进场。先 `/aikp roll journalist` 或 `/aikp quickfire artist`。");
    return lines.join("\n");
  }

  for (const entry of entries) {
    if (!entry.investigator) {
      lines.push(`- ${entry.userName}：还没车卡`);
      continue;
    }
    const marker = entry.isCurrent ? "👉" : "-";
    lines.push(`${marker} ${entry.userName}｜${entry.investigator.name}｜${entry.investigator.occupation}｜HP ${entry.investigator.resources.hp}｜SAN ${entry.investigator.resources.san}`);
  }
  return lines.join("\n");
}

function formatScenePanel(sessionState) {
  const meta = sessionState.scene?.meta || {};
  const lines = [
    `场景环境：${meta.scenarioTitle || sessionState.scene?.summary || "未知场景"}`
  ];

  if (meta.atmosphere?.tone) lines.push(`- 气氛：${meta.atmosphere.tone}`);
  if (meta.atmosphere?.light) lines.push(`- 光线：${meta.atmosphere.light}`);
  if (Array.isArray(meta.atmosphere?.smell) && meta.atmosphere.smell.length) {
    lines.push(`- 气味：${meta.atmosphere.smell.join("、")}`);
  }
  if (Array.isArray(meta.atmosphere?.sound) && meta.atmosphere.sound.length) {
    lines.push(`- 声音：${meta.atmosphere.sound.join("、")}`);
  }
  if (Array.isArray(meta.areas) && meta.areas.length) {
    lines.push("- 区域：");
    for (const area of meta.areas) {
      lines.push(`  - ${area.name}：${area.description}`);
    }
  }
  return lines.join("\n");
}

function formatRecapReply(sessionState) {
  const revealedClues = (sessionState.scene?.clues || []).filter((item) => item.revealed).map((item) => item.title);
  const triggeredEvents = (sessionState.scene?.events || []).filter((item) => item.triggered).map((item) => item.label);
  const endingHooks = sessionState.scene?.meta?.endingHooks || [];
  const lines = ["阶段总结："];
  lines.push(`- 已推进到 ${sessionState.scene?.timeState?.timelineMinute || 0} 分钟，危险等级 ${sessionState.scene?.threats?.dangerLevel || "low"}`);
  lines.push(`- 已得线索：${revealedClues.length ? revealedClues.join("、") : "暂时还少关键明线"}`);
  lines.push(`- 已触发事件：${triggeredEvents.length ? triggeredEvents.join("、") : "目前还没炸出大事"}`);
  if (endingHooks.length) {
    lines.push(`- 这幕后面最可能走向：${endingHooks.join(" / ")}`);
  }
  return lines.join("\n");
}

function formatCluePanel(sessionState) {
  const clues = Array.isArray(sessionState.scene?.clues) ? sessionState.scene.clues : [];
  const revealed = clues.filter((item) => item.revealed);
  const hiddenCore = clues.filter((item) => !item.revealed && item.kind === "core");
  const hiddenOther = clues.filter((item) => !item.revealed && item.kind !== "core");
  const lines = ["线索面板："];

  if (revealed.length) {
    lines.push(...revealed.map((item) => `- 已得：${item.title}（${item.kind}/${item.quality || "unknown"}）`));
  } else {
    lines.push("- 已得：暂无");
  }

  if (hiddenCore.length) {
    lines.push(`- 未出的核心线索：${hiddenCore.length} 条`);
  }
  if (hiddenOther.length) {
    lines.push(`- 其他未显线索：${hiddenOther.length} 条`);
  }

  return lines.join("\n");
}

function formatNpcPanel(sessionState) {
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  const lines = ["NPC 面板："];
  if (!npcs.length) {
    lines.push("- 当前场里没有可见 NPC。");
    return lines.join("\n");
  }

  for (const npc of npcs) {
    const socialBits = [];
    if (npc.socialState?.suspicion) socialBits.push(`戒心 ${npc.socialState.suspicion}`);
    if (npc.socialState?.fear) socialBits.push(`恐惧 ${npc.socialState.fear}`);
    if (npc.socialState?.affinity) socialBits.push(`亲近 ${npc.socialState.affinity}`);
    if (npc.socialState?.obligation) socialBits.push(`亏欠 ${npc.socialState.obligation}`);
    lines.push(`- ${npc.name}｜态度 ${npc.attitude}｜trust ${npc.trust ?? 0}${socialBits.length ? `｜${socialBits.join(" / ")}` : ""}`);
  }
  return lines.join("\n");
}

function collectNpcStateMap(sessionState) {
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  return new Map(npcs.map((npc) => [npc.id, cloneJson(npc)]));
}

function formatStateDelta(beforeSessionState, afterSessionState) {
  if (!beforeSessionState || !afterSessionState) return null;
  const lines = [];
  const beforeTime = Number(beforeSessionState.scene?.timeState?.timelineMinute || 0);
  const afterTime = Number(afterSessionState.scene?.timeState?.timelineMinute || 0);
  const beforeExposure = Number(beforeSessionState.scene?.threats?.exposure || 0);
  const afterExposure = Number(afterSessionState.scene?.threats?.exposure || 0);
  const beforePressure = Number(beforeSessionState.scene?.threats?.pressure || 0);
  const afterPressure = Number(afterSessionState.scene?.threats?.pressure || 0);

  if (afterTime !== beforeTime) lines.push(`时间 +${afterTime - beforeTime}`);
  if (afterExposure !== beforeExposure) lines.push(`暴露 ${beforeExposure}→${afterExposure}`);
  if (afterPressure !== beforePressure) lines.push(`压力 ${beforePressure}→${afterPressure}`);

  const beforeClues = new Set((beforeSessionState.scene?.clues || []).filter((item) => item.revealed).map((item) => item.id));
  const newClues = (afterSessionState.scene?.clues || []).filter((item) => item.revealed && !beforeClues.has(item.id));
  if (newClues.length) {
    lines.push(`新线索：${newClues.map((item) => item.title).join("、")}`);
  }

  const beforeEvents = new Set((beforeSessionState.scene?.events || []).filter((item) => item.triggered).map((item) => item.id));
  const newEvents = (afterSessionState.scene?.events || []).filter((item) => item.triggered && !beforeEvents.has(item.id));
  if (newEvents.length) {
    lines.push(`新事件：${newEvents.map((item) => item.label).join("、")}`);
  }

  const beforeNpcMap = collectNpcStateMap(beforeSessionState);
  for (const npc of (afterSessionState.scene?.participants?.npcs || [])) {
    const beforeNpc = beforeNpcMap.get(npc.id);
    if (!beforeNpc) continue;
    const npcChanges = [];
    if (beforeNpc.attitude !== npc.attitude) npcChanges.push(`态度 ${beforeNpc.attitude}→${npc.attitude}`);
    if ((beforeNpc.trust ?? 0) !== (npc.trust ?? 0)) npcChanges.push(`trust ${(beforeNpc.trust ?? 0)}→${(npc.trust ?? 0)}`);
    if ((beforeNpc.socialState?.suspicion ?? 0) !== (npc.socialState?.suspicion ?? 0)) npcChanges.push(`戒心 ${(beforeNpc.socialState?.suspicion ?? 0)}→${(npc.socialState?.suspicion ?? 0)}`);
    if ((beforeNpc.socialState?.fear ?? 0) !== (npc.socialState?.fear ?? 0)) npcChanges.push(`恐惧 ${(beforeNpc.socialState?.fear ?? 0)}→${(npc.socialState?.fear ?? 0)}`);
    if ((beforeNpc.socialState?.affinity ?? 0) !== (npc.socialState?.affinity ?? 0)) npcChanges.push(`亲近 ${(beforeNpc.socialState?.affinity ?? 0)}→${(npc.socialState?.affinity ?? 0)}`);
    if ((beforeNpc.socialState?.obligation ?? 0) !== (npc.socialState?.obligation ?? 0)) npcChanges.push(`亏欠 ${(beforeNpc.socialState?.obligation ?? 0)}→${(npc.socialState?.obligation ?? 0)}`);
    if (npcChanges.length) {
      lines.push(`${npc.name}：${npcChanges.join("，")}`);
    }
  }

  if (!lines.length) return null;
  return `状态变化：\n- ${lines.join("\n- ")}`;
}

function formatCheckResultLine(event) {
  if (!event?.result) return null;
  if (event.mode === "hidden") {
    return `暗骰：${event.skillKey}（${event.result.successLevel}）`;
  }
  return `投掷：${event.roll}（目标 ${event.targetValue}，${event.result.successLevel}）`;
}

function formatSceneBeat(sessionState) {
  const dangerLevel = sessionState.scene?.threats?.dangerLevel || "low";
  const npcs = Array.isArray(sessionState.scene?.participants?.npcs) ? sessionState.scene.participants.npcs : [];
  const guardedNpcs = npcs.filter((npc) => ["guarded", "hostile"].includes(npc.attitude)).map((npc) => npc.name);
  const recentTriggeredEvent = [...(sessionState.scene?.events || [])].reverse().find((item) => item.triggered);
  const lines = [];

  if (dangerLevel === "low") lines.push("场上此刻还没彻底炸开，但空气已经有点绷住了。");
  if (dangerLevel === "medium") lines.push("场上已经开始起刺了，再多碰几下，后果会往外翻。");
  if (dangerLevel === "high") lines.push("场面已经很紧，谁再往前硬顶，教堂这口气就要变脸了。");
  if (dangerLevel === "extreme") lines.push("现在这地方已经快绷断了，下一步很可能直接出大动静。");

  if (guardedNpcs.length) {
    lines.push(`现在明显绷着的人有：${guardedNpcs.join("、")}。`);
  }

  if (recentTriggeredEvent?.label) {
    lines.push(`刚刚场里最新冒出来的是：${recentTriggeredEvent.label}。`);
  }

  return lines.join("\n");
}

function formatOptionCue(sessionState) {
  const options = Array.isArray(sessionState.scene?.nextOptions) ? sessionState.scene.nextOptions : [];
  if (!options.length) return null;
  return `你们眼下最顺手的路有：${options.slice(0, 3).map((item) => item.label).join("、")}。`;
}

function formatSpotlightCue(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
  if (!currentActor) return null;
  return `当前 spotlight 还在 ${currentActor.name} 这边；想切人就用 "/aikp next" 或 "/aikp focus <名字>"。`;
}

function formatTurnReply(result, extras = {}) {
  if (!result) return "这下我没接住，怪。";
  const parts = [];
  if (result.warningLine) parts.push(result.warningLine);
  if (result.adjudicationBonusLine) parts.push(result.adjudicationBonusLine);
  if (result.preRollLine) parts.push(result.preRollLine);
  if (result.postRollLine) parts.push(result.postRollLine);
  if (result.narrativeLine) parts.push(result.narrativeLine);
  const checkResultLine = formatCheckResultLine(result.event);
  if (checkResultLine) parts.push(checkResultLine);
  if (extras.deltaSummary) parts.push(extras.deltaSummary);
  if (extras.sceneBeat) parts.push(extras.sceneBeat);
  if (result.event?.outcome?.nextPrompt) parts.push(result.event.outcome.nextPrompt);
  if (extras.optionCue) parts.push(extras.optionCue);
  if (extras.spotlightCue) parts.push(extras.spotlightCue);
  return parts.filter(Boolean).join("\n");
}

function formatInvestigatorSummary(investigator) {
  if (!investigator) return "你现在还没有调查员卡。";
  const skillBits = investigator.skills
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((skill) => `${skill.key} ${skill.value}`)
    .join("、");
  return [
    `${investigator.name}｜${investigator.occupation}`,
    `年龄：${investigator.age}｜信用评级：${investigator.identity.creditRating}`,
    `属性：STR ${investigator.attributes.STR} / CON ${investigator.attributes.CON} / DEX ${investigator.attributes.DEX} / POW ${investigator.attributes.POW} / INT ${investigator.attributes.INT} / EDU ${investigator.attributes.EDU}`,
    `资源：HP ${investigator.resources.hp} / SAN ${investigator.resources.san} / MOV ${investigator.resources.moveRate}`,
    `擅长：${skillBits}`
  ].join("\n");
}

function formatTraditionalBreakdownLines(breakdown = []) {
  if (!breakdown.length) return [];
  const lines = ["属性骰："];
  for (const entry of breakdown) {
    const diceText = entry.dice.join("+");
    const modifierText = entry.modifier ? `+${entry.modifier}` : "";
    lines.push(`- ${entry.key}：${entry.formula}（${diceText}${modifierText ? `${modifierText}` : ""}=${entry.rawTotal}）→ ${entry.value}`);
  }
  return lines;
}

function formatQuickfireBreakdownLines(investigator) {
  const orderedKeys = ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU"];
  return [
    "快速分配：",
    `- ${orderedKeys.map((key) => `${key} ${investigator.attributes[key]}`).join(" / ")}`,
    `- Luck ${investigator.resources.luck}`
  ];
}

function formatGeneratedInvestigatorReply(bundle) {
  const modeText = bundle.mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  const lines = [
    `${modeText} 已经给你落好了：`,
    formatInvestigatorSummary(bundle.investigator)
  ];

  if (bundle.mode === "quickfire") {
    lines.push(...formatQuickfireBreakdownLines(bundle.investigator));
  } else {
    lines.push(...formatTraditionalBreakdownLines(bundle.generation.breakdown));
  }

  return lines.join("\n");
}

function formatStoryPackChoicePrompt() {
  const entries = listStoryPackEntries();
  const lines = [
    "先别急着进场，我们先定这次跑哪条线。",
    "当前可选剧本："
  ];

  if (!entries.length) {
    lines.push("- 现在还没有可用 story pack。先补剧本数据吧。");
    return lines.join("\n");
  }

  for (const entry of entries) {
    lines.push(`- ${entry.index}. ${entry.storyPack.title}｜ID ${entry.storyPack.id}｜故事弧 ${entry.campaign.title}｜${(entry.storyPack.sceneIds || []).length} 幕`);
  }

  lines.push("群里继续和我说话时记得带 `@麦麦`。");
  lines.push("回复序号、剧本名，或 `/aikp pack <storyPackId>` 来选择。");
  return lines.join("\n");
}

function formatStoryPackDisplayTitle(storyPack) {
  return String(storyPack?.title || "未命名剧本").replace(/\s*story pack\s*$/i, "").trim();
}

function formatAwaitingInvestigatorReply(stateBundle) {
  const entry = getSelectedStoryPackEntry(stateBundle.meta);
  const title = formatStoryPackDisplayTitle(entry?.storyPack);
  return [
    `这次先跑《${title}》。`,
    "你现在还没车卡，先把调查员卡定下来，我再给你正式开场。",
    "群里继续操作时记得带 `@麦麦`。",
    "可以直接说“我想一次全车完卡，角色选记者”或“给我快速车卡，职业医生”。",
    "继续用指令也行：`/aikp roll journalist`、`/aikp quickfire artist`。"
  ].join("\n");
}

function formatSceneStartReply(stateBundle, actorResult) {
  const entry = getSelectedStoryPackEntry(stateBundle.meta);
  const opening = stateBundle.sessionState.scene.meta?.opening || "场景已经起好了。";
  const prompts = stateBundle.sessionState.scene.meta?.starterPrompts || [];
  const packLine = entry?.storyPack?.title ? `这次跑《${formatStoryPackDisplayTitle(entry.storyPack)}》。` : null;
  const joinLine = actorResult?.investigator ? `当前绑定调查员：${actorResult.investigator.name}。` : null;
  const promptLine = prompts.length ? `场景里可以直接试这些：\n- ${prompts.join("\n- ")}` : "你现在可以直接说行动。";
  const helpLine = "群里继续操作时记得带 `@麦麦`。自然语言就行：比如“我想一次全车完卡，角色选记者”“给我快速车卡，职业医生”“我借着手电去看祭坛背后的刮痕”；继续用指令也行：`/aikp roll journalist`、`/aikp quickfire artist`。";
  return [packLine, joinLine, opening, promptLine, helpLine].filter(Boolean).join("\n");
}

function formatStartReply(stateBundle, actorResult) {
  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    return formatStoryPackChoicePrompt();
  }
  if (!actorResult?.investigator) {
    return formatAwaitingInvestigatorReply(stateBundle);
  }
  if (!stateBundle.meta.sceneIntroDeliveredAt) {
    stateBundle.meta.sceneIntroDeliveredAt = new Date().toISOString();
  }
  return formatSceneStartReply(stateBundle, actorResult);
}

function appendSceneStartReplyIfNeeded(stateBundle, actorResult, replyText) {
  if (!getSelectedStoryPackEntry(stateBundle.meta) || !actorResult?.investigator) {
    return replyText;
  }
  if (stateBundle.meta.sceneIntroDeliveredAt) {
    return replyText;
  }
  return `${replyText}\n\n${formatStartReply(stateBundle, actorResult)}`;
}

function formatHelpReply() {
  return [
    "AI-KP 可用指令：",
    "- 群聊里和我继续交互时，统一带 `@麦麦`，避免误吃到旁边人的讨论",
    "- 平时直接说自然语言也行，例如：我想一次全车完卡，角色选记者",
    "- /aikp start 开始跑团；如果有旧档会先问你续上还是新开，没有旧档就先选剧本",
    "- /aikp packs 查看当前可选剧本",
    "- /aikp pack <storyPackId> 选择这条要跑的剧本",
    "- /aikp roll <occupationKey> 单人传统随机车卡",
    "- /aikp quickfire <occupationKey> 单人快速车卡",
    "- /aikp party-roll <occupationKey> 为当前已出现玩家批量传统随机车卡",
    "- /aikp party-quickfire <occupationKey> 为当前已出现玩家批量快速车卡",
    "- /aikp saves 查看当前线和历史归档",
    "- /aikp resume [saveId] 恢复当前线或某个归档",
    "- /aikp new 把当前线归档后新开一条",
    "- /aikp join 确认当前调查员",
    "- /aikp sheet 查看自己的调查员卡",
    "- /aikp state 查看当前场景状态",
    "- /aikp campaign 查看当前故事弧与预留钩子",
    "- /aikp hooks 查看当前可用推进钩子",
    "- /aikp advance [hookId] 按钩子推进到下一幕",
    "- /aikp storypack 查看当前故事包摘要",
    "- /aikp goto <sceneId> 切到下一幕骨架场景",
    "- /aikp scene 查看场景环境面板",
    "- /aikp recap 看当前阶段总结",
    "- /aikp party 查看队伍面板",
    "- /aikp clues 查看线索面板",
    "- /aikp npcs 查看 NPC 面板",
    "- /aikp who 查看当前轮到谁",
    "- /aikp focus <玩家名> 手动切到某位玩家",
    "- /aikp next 切到下一位玩家",
    "- /aikp settle 生成本轮结团摘要",
    "- /aikp reset 重开当前场景",
    "职业 key 可先用：journalist detective doctor professor artist veteran dilettante"
  ].join("\n");
}

function formatSettlementReply(settlement) {
  const lines = ["这轮先帮你收一下："];
  if (Array.isArray(settlement.summaryLines)) lines.push(...settlement.summaryLines);
  lines.push(`事件数：${settlement.eventCount}`);
  return lines.join("\n");
}

function buildSessionEnterOperationEvent(event, actionText = "进入了本群 AI-KP") {
  return buildOperationEvent("session.enter", `${getSenderName(event)} ${actionText}`, {
    userId: event.user_id != null ? String(event.user_id) : null
  });
}

function buildStartPanelResponse(event, stateBundle, actorResult, operationEvents = []) {
  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    const prompt = maybePromptForStoryPackChoice(event, stateBundle) || {
      reply: formatStoryPackChoicePrompt(),
      operationEvents: []
    };
    return {
      stateBundle: prompt.stateBundle || stateBundle,
      reply: prompt.reply,
      operationEvents: [...operationEvents, ...(prompt.operationEvents || [])]
    };
  }

  return {
    stateBundle,
    reply: formatStartReply(stateBundle, actorResult),
    operationEvents
  };
}

function parseCommand(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return {
    command: tokens[0] || "",
    args: tokens.slice(1)
  };
}

function resolveOccupationKey(rawValue, fallback = "journalist") {
  if (!rawValue) return fallback;
  const detected = detectOccupationKeyFromText(rawValue, fallback);
  try {
    getOccupationTemplate(detected);
    return detected;
  } catch {
    return fallback;
  }
}

function createInvestigatorForMode(event, mode, occupationKey, randomInt) {
  return buildInvestigatorBundleForMode(event, mode, occupationKey, randomInt);
}

function formatPartyRollReply(createdBundles, mode) {
  const modeText = mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  const lines = [`这轮我已经帮当前这批玩家批量做了 ${modeText}：`];
  for (const bundle of createdBundles) {
    const investigator = bundle.investigator;
    lines.push(`- ${investigator.name}｜${investigator.occupation}｜HP ${investigator.resources.hp}｜SAN ${investigator.resources.san}`);
    if (bundle.mode === "quickfire") {
      lines.push(`  ${formatQuickfireBreakdownLines(investigator).slice(1).join("｜")}`);
      continue;
    }

    const highlight = (bundle.generation.breakdown || [])
      .map((entry) => `${entry.key} ${entry.rawTotal}->${entry.value}`)
      .join(" / ");
    lines.push(`  ${highlight}`);
  }
  lines.push("现在可以用 `/aikp party` 看队伍面板，用 `/aikp next` 往下一位切。\n");
  return lines.join("\n");
}

function runSingleRollCommand(event, stateBundle, mode, occupationKey, randomInt) {
  const bundle = createInvestigatorForMode(event, mode, occupationKey, randomInt);
  upsertInvestigatorForUser(event, stateBundle, bundle.investigator);
  return {
    reply: formatGeneratedInvestigatorReply(bundle),
    bundle
  };
}

function runPartyRollCommand(stateBundle, mode, occupationKey, randomInt) {
  const createdBundles = [];
  const knownUsers = Array.isArray(stateBundle.meta.knownUsers) ? stateBundle.meta.knownUsers : [];

  for (const user of knownUsers) {
    const fakeEvent = {
      user_id: user.userId,
      sender: { nickname: user.name }
    };
    const existing = getActorForUser(stateBundle, user.userId);
    const resolvedOccupation = occupationKey || existing?.occupationKey || "journalist";
    const bundle = createInvestigatorForMode(fakeEvent, mode, resolvedOccupation, randomInt);
    addInvestigator(stateBundle.sessionState, bundle.investigator);
    stateBundle.meta.actorsByUserId[String(user.userId)] = bundle.investigator.id;
    syncActorIntoTurnState(stateBundle.meta, bundle.investigator.id);
    createdBundles.push({
      ...bundle,
      sourceUserId: String(user.userId),
      sourceUserName: user.name
    });
  }

  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatPartyRollReply(createdBundles, mode),
    bundles: createdBundles
  };
}

function buildOperationEvent(kind, summary, payload = {}) {
  return {
    timestamp: new Date().toISOString(),
    kind,
    summary,
    ...payload
  };
}

function setSessionMode(stateBundle, sessionMode) {
  stateBundle.meta.sessionMode = sessionMode;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return sessionMode;
}

function buildChatLogEntry(event, direction, message) {
  return {
    timestamp: new Date().toISOString(),
    conversationKey: buildConversationKey(event),
    direction,
    message,
    messageId: event.message_id || null,
    messageType: event.message_type || (event.group_id ? "group" : "private"),
    userId: event.user_id != null ? String(event.user_id) : null,
    senderName: getSenderName(event)
  };
}

function buildStateSnapshot(stateBundle) {
  const turnState = ensureTurnState(stateBundle.meta);
  const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
  return {
    updatedAt: new Date().toISOString(),
    conversationKey: stateBundle.layout.conversationKey,
    sessionMode: stateBundle.meta.sessionMode || "idle",
    runtimeProfileId: stateBundle.meta.runtimeProfileId || "maimai-kp-v1",
    summaryState: cloneJson(stateBundle.meta.summaryState || {}),
    knownUsers: cloneJson(stateBundle.meta.knownUsers || []),
    turnState: {
      actorOrder: [...turnState.actorOrder],
      currentActorId: turnState.currentActorId,
      currentActorName: currentActor?.name || null,
      round: turnState.round
    },
    revealedClues: (stateBundle.sessionState.scene?.clues || [])
      .filter((item) => item.revealed)
      .map((item) => item.title),
    scene: {
      summary: stateBundle.sessionState.scene?.summary || null,
      location: stateBundle.sessionState.scene?.location || null,
      dangerLevel: stateBundle.sessionState.scene?.threats?.dangerLevel || null,
      exposure: stateBundle.sessionState.scene?.threats?.exposure ?? 0,
      pressure: stateBundle.sessionState.scene?.threats?.pressure ?? 0,
      timelineMinute: stateBundle.sessionState.scene?.timeState?.timelineMinute ?? 0,
      combatRound: stateBundle.sessionState.scene?.timeState?.combatRound ?? 0
    },
    investigators: Object.values(stateBundle.sessionState.investigators || {}).map((investigator) => ({
      id: investigator.id,
      name: investigator.name,
      occupation: investigator.occupation,
      occupationKey: investigator.occupationKey,
      hp: investigator.resources?.hp ?? null,
      san: investigator.resources?.san ?? null,
      luck: investigator.resources?.luck ?? null
    })),
    sessionState: cloneJson(stateBundle.sessionState)
  };
}

function createArchiveSaveId(meta = {}) {
  const nextIndex = (Array.isArray(meta.archiveHistory) ? meta.archiveHistory.length : 0) + 1;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `save-${String(nextIndex).padStart(4, "0")}-${stamp}`;
}

function buildArchiveLayout(layout, saveId) {
  const dir = join(layout.archiveConversationDir, saveId);
  return {
    dir,
    sessionFile: join(dir, "session.json"),
    metaFile: join(dir, "meta.json"),
    logsDir: join(dir, "logs"),
    manifestFile: join(dir, "manifest.json")
  };
}

function hasMeaningfulSessionProgress(layout, meta = {}, sessionState = {}) {
  if (Object.keys(sessionState.investigators || {}).length) return true;
  if ((sessionState.scene?.timeState?.timelineMinute || 0) > 0) return true;
  const ledgerEvents = safeReadJsonLines(layout.ledgerLogFile).filter((event) => event.kind !== "summary.rollup");
  if (ledgerEvents.length) return true;
  return Number(meta.messageCount || 0) > 2;
}

function summarizeConversationSave(stateBundle, overrides = {}) {
  const snapshot = buildStateSnapshot(stateBundle);
  return {
    saveId: overrides.saveId || "current",
    kind: overrides.kind || "active",
    source: overrides.source || null,
    savedAt: overrides.savedAt || stateBundle.meta.updatedAt || snapshot.updatedAt,
    updatedAt: stateBundle.meta.updatedAt || snapshot.updatedAt,
    scenarioId: stateBundle.meta.scenarioId || stateBundle.sessionState.scene?.meta?.scenarioId || null,
    sessionMode: stateBundle.meta.sessionMode || "idle",
    sceneSummary: snapshot.scene.summary || null,
    location: snapshot.scene.location || null,
    currentActorName: snapshot.turnState.currentActorName || null,
    investigatorCount: snapshot.investigators.length,
    clueCount: snapshot.revealedClues.length
  };
}

function formatSaveRecordLine(record, label = null) {
  const bits = [
    label || record.saveId,
    record.sceneSummary || "未命名场景",
    record.location ? `地点 ${record.location}` : null,
    record.currentActorName ? `当前聚焦 ${record.currentActorName}` : null,
    `玩家 ${record.investigatorCount || 0} 人`,
    `线索 ${record.clueCount || 0} 条`,
    `保存 ${record.savedAt || record.updatedAt || "unknown"}`
  ].filter(Boolean);
  return `- ${bits.join("｜")}`;
}

function findArchiveRecord(meta = {}, selector = "") {
  ensureConversationControlState(meta);
  const archives = Array.isArray(meta.archiveHistory) ? meta.archiveHistory : [];
  if (!archives.length) return null;
  if (!selector) return archives.at(-1) || null;

  const normalized = String(selector).trim().toLowerCase();
  if (!normalized) return archives.at(-1) || null;

  const exact = archives.find((item) => String(item.saveId || "").toLowerCase() === normalized);
  if (exact) return exact;

  const partialMatches = archives.filter((item) => String(item.saveId || "").toLowerCase().includes(normalized));
  if (partialMatches.length === 1) return partialMatches[0];
  return null;
}

function archiveConversationState(stateBundle, source = "manual") {
  ensureConversationControlState(stateBundle.meta);
  if (!hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    return null;
  }

  const saveId = createArchiveSaveId(stateBundle.meta);
  const archiveLayout = buildArchiveLayout(stateBundle.layout, saveId);
  mkdirSync(archiveLayout.dir, { recursive: true });

  if (existsSync(stateBundle.layout.sessionFile)) {
    cpSync(stateBundle.layout.sessionFile, archiveLayout.sessionFile);
  }
  if (existsSync(stateBundle.layout.metaFile)) {
    cpSync(stateBundle.layout.metaFile, archiveLayout.metaFile);
  }
  if (existsSync(stateBundle.layout.logsConversationDir)) {
    cpSync(stateBundle.layout.logsConversationDir, archiveLayout.logsDir, { recursive: true });
  }

  const record = summarizeConversationSave(stateBundle, {
    saveId,
    kind: "archive",
    source,
    savedAt: new Date().toISOString()
  });
  writeFileSync(archiveLayout.manifestFile, JSON.stringify(record, null, 2), "utf8");

  stateBundle.meta.archiveHistory.push(record);
  stateBundle.meta.updatedAt = new Date().toISOString();
  stateBundle.meta.pendingResumeChoice = null;
  stateBundle.meta.pendingStoryPackChoice = null;
  saveMeta(stateBundle.layout, stateBundle.meta);
  return record;
}

function preserveConversationControls(meta = {}) {
  ensureConversationControlState(meta);
  return {
    archiveHistory: cloneJson(meta.archiveHistory || []),
    runtimeProfileId: meta.runtimeProfileId || "maimai-kp-v1",
    storyPackId: meta.storyPackId || null
  };
}

function applyPreservedConversationControls(meta = {}, preserved = {}) {
  ensureConversationControlState(meta);
  meta.archiveHistory = cloneJson(preserved.archiveHistory || []);
  meta.runtimeProfileId = preserved.runtimeProfileId || meta.runtimeProfileId || "maimai-kp-v1";
  meta.pendingResumeChoice = null;
  meta.pendingStoryPackChoice = null;
  meta.storyPackId = preserved.storyPackId || meta.storyPackId || null;
  return meta;
}

function clearActiveConversationArtifacts(layout) {
  rmSync(layout.logsConversationDir, { recursive: true, force: true });
}

function startFreshConversationLine(event, stateBundle, options = {}) {
  const preserved = preserveConversationControls(stateBundle.meta);
  clearActiveConversationArtifacts(stateBundle.layout);
  const fresh = rebuildConversationSession(event, {
    storageRoot: stateBundle.layout.root,
    scenarioId: stateBundle.meta.scenarioId,
    campaignId: stateBundle.meta.campaignId,
    reset: true
  });
  applyPreservedConversationControls(fresh.meta, preserved);
  saveMeta(fresh.layout, fresh.meta);
  setSessionMode(fresh, "kp");
  const actor = ensureActorForUser(event, fresh, {
    autoCreateInvestigator: false
  });
  return { stateBundle: fresh, actor };
}

function restoreArchivedConversation(event, stateBundle, selector, options = {}) {
  const selected = findArchiveRecord(stateBundle.meta, selector);
  if (!selected) {
    return {
      ok: false,
      reason: "archive_not_found",
      reply: selector
        ? "我没找到这个存档。先发 `/aikp saves` 看一下可用 saveId。"
        : "现在还没有可恢复的存档。"
    };
  }

  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    archiveConversationState(stateBundle, "resume-swap");
  }

  const latestMeta = loadMeta(stateBundle.layout) || stateBundle.meta;
  const preserved = preserveConversationControls(latestMeta);
  const archiveLayout = buildArchiveLayout(stateBundle.layout, selected.saveId);

  if (!existsSync(archiveLayout.sessionFile) || !existsSync(archiveLayout.metaFile)) {
    return {
      ok: false,
      reason: "archive_files_missing",
      reply: "这个存档条目还在，但底层文件已经不见了。你先 `/aikp saves` 看一下别的档吧。"
    };
  }

  clearActiveConversationArtifacts(stateBundle.layout);
  cpSync(archiveLayout.sessionFile, stateBundle.layout.sessionFile);
  cpSync(archiveLayout.metaFile, stateBundle.layout.metaFile);
  if (existsSync(archiveLayout.logsDir)) {
    cpSync(archiveLayout.logsDir, stateBundle.layout.logsConversationDir, { recursive: true });
  }

  const restoredMeta = loadMeta(stateBundle.layout) || {};
  applyPreservedConversationControls(restoredMeta, preserved);
  saveMeta(stateBundle.layout, restoredMeta);
  const restoredSession = loadSessionApi(stateBundle.layout.sessionFile);
  const restoredBundle = {
    layout: stateBundle.layout,
    meta: restoredMeta,
    sessionState: restoredSession,
    created: false
  };
  setSessionMode(restoredBundle, "kp");
  const actor = ensureActorForUser(event, restoredBundle, {
    autoCreateInvestigator: false
  });
  return {
    ok: true,
    record: selected,
    stateBundle: restoredBundle,
    actor
  };
}

function getResumeCandidate(stateBundle) {
  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    return {
      source: "active",
      record: summarizeConversationSave(stateBundle, {
        saveId: "current",
        kind: "active",
        source: "current"
      })
    };
  }

  const latestArchive = findArchiveRecord(stateBundle.meta);
  if (latestArchive) {
    return {
      source: "archive",
      record: latestArchive
    };
  }

  return null;
}

function formatResumeChoicePrompt(candidate) {
  return [
    "我这边看到这个群已经有旧档了：",
    formatSaveRecordLine(candidate.record, candidate.source === "active" ? "current" : candidate.record.saveId),
    "你要 `续上` 这条，还是 `新开` 一条？",
    "群里继续操作时记得带 `@麦麦`。",
    "想看历史存档可以发 `/aikp saves`。"
  ].join("\n");
}

function formatSaveListReply(stateBundle) {
  const lines = ["当前可用存档："];
  if (hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
    lines.push(formatSaveRecordLine(summarizeConversationSave(stateBundle), "current"));
  }

  const archives = [...(stateBundle.meta.archiveHistory || [])].reverse();
  if (!archives.length) {
    lines.push("- 还没有归档存档。");
    return lines.join("\n");
  }

  for (const archive of archives) {
    lines.push(formatSaveRecordLine(archive));
  }
  return lines.join("\n");
}

function activateStoryPackSelection(event, stateBundle, storyPackId) {
  const selected = listStoryPackEntries().find((entry) => entry.storyPack.id === storyPackId);
  if (!selected) return null;

  const preservedControls = preserveConversationControls(stateBundle.meta);
  const preservedKnownUsers = cloneJson(stateBundle.meta.knownUsers || []);
  const preservedActorsByUserId = cloneJson(stateBundle.meta.actorsByUserId || {});
  const preservedTurnState = cloneJson(ensureTurnState(stateBundle.meta));
  const preservedInvestigators = cloneJson(stateBundle.sessionState.investigators || {});

  const fresh = rebuildConversationSession(event, {
    storageRoot: stateBundle.layout.root,
    scenarioId: selected.startSceneId,
    campaignId: selected.storyPack.campaignId,
    storyPackId: selected.storyPack.id,
    reset: true
  });

  applyPreservedConversationControls(fresh.meta, preservedControls);
  fresh.meta.storyPackId = selected.storyPack.id;
  fresh.meta.knownUsers = preservedKnownUsers;
  fresh.meta.actorsByUserId = preservedActorsByUserId;
  fresh.meta.turnState = preservedTurnState;
  rememberUser(fresh.meta, event);

  fresh.sessionState.investigators = preservedInvestigators;
  saveSessionApi(fresh.sessionState, fresh.layout.sessionFile, { meta: { conversationKey: fresh.layout.conversationKey } });
  saveMeta(fresh.layout, fresh.meta);
  return { stateBundle: fresh, selected };
}

function maybePromptForStoryPackChoice(event, stateBundle) {
  if (getSelectedStoryPackEntry(stateBundle.meta)) return null;
  stateBundle.meta.pendingStoryPackChoice = {
    askedAt: new Date().toISOString()
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatStoryPackChoicePrompt(),
    operationEvents: [buildOperationEvent("storypack.prompt", `${getSenderName(event)} 触发了剧本选择`, {
      userId: event.user_id != null ? String(event.user_id) : null
    })]
  };
}

function handlePendingStoryPackChoice(text, event, stateBundle) {
  const pending = stateBundle.meta.pendingStoryPackChoice;
  if (!pending) return null;

  const selection = resolveStoryPackSelection(text);
  if (!selection || selection.kind === "list") {
    return { reply: formatStoryPackChoicePrompt() };
  }

  const activated = activateStoryPackSelection(event, stateBundle, selection.storyPackId);
  if (!activated) {
    return {
      reply: `我没对上这个剧本。\n${formatStoryPackChoicePrompt()}`
    };
  }

  setSessionMode(activated.stateBundle, "kp");
  activated.stateBundle.meta.pendingStoryPackChoice = null;
  activated.stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(activated.stateBundle.layout, activated.stateBundle.meta);
  const actor = ensureActorForUser(event, activated.stateBundle, { autoCreateInvestigator: false });

  return {
    stateBundle: activated.stateBundle,
    reply: formatStartReply(activated.stateBundle, actor),
    operationEvents: [buildOperationEvent("storypack.select", `${getSenderName(event)} 选择了剧本 ${activated.selected.storyPack.title}`, {
      userId: event.user_id != null ? String(event.user_id) : null,
      storyPackId: activated.selected.storyPack.id,
      campaignId: activated.selected.storyPack.campaignId,
      scenarioId: activated.selected.startSceneId
    })]
  };
}

function detectResumeChoice(text = "") {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;
  if (includesAny(normalized, ["续上", "继续上次", "接着上次", "恢复这个档", "继续这条", "resume"])) {
    return "resume";
  }
  if (includesAny(normalized, ["新开", "开新线", "新开一条", "另开一条", "重开一条", "new"])) {
    return "new";
  }
  if (includesAny(normalized, ["存档列表", "看看存档", "看存档", "列出存档", "存档"])) {
    return "list";
  }
  return null;
}

function maybePromptForExistingSave(event, stateBundle) {
  const candidate = getResumeCandidate(stateBundle);
  if (!candidate) return null;
  stateBundle.meta.pendingResumeChoice = {
    askedAt: new Date().toISOString(),
    source: candidate.source,
    saveId: candidate.record.saveId
  };
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  return {
    reply: formatResumeChoicePrompt(candidate),
    operationEvents: [buildOperationEvent("session.resume_prompt", `${getSenderName(event)} 触发了旧档续团确认`, {
      userId: event.user_id != null ? String(event.user_id) : null,
      source: candidate.source,
      saveId: candidate.record.saveId
    })]
  };
}

function handlePendingResumeChoice(text, event, stateBundle) {
  const pending = stateBundle.meta.pendingResumeChoice;
  if (!pending) return null;

  const choice = detectResumeChoice(text);
  if (choice === "list") {
    return { reply: formatSaveListReply(stateBundle) };
  }

  if (choice === "resume") {
    stateBundle.meta.pendingResumeChoice = null;
    saveMeta(stateBundle.layout, stateBundle.meta);
    if (pending.source === "archive" && pending.saveId && pending.saveId !== "current") {
      const restored = restoreArchivedConversation(event, stateBundle, pending.saveId);
      if (!restored.ok) return { reply: restored.reply };
      return {
        reply: `好，我把旧档 ${pending.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
        stateBundle: restored.stateBundle,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${pending.saveId}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: pending.saveId
        })]
      };
    }

    setSessionMode(stateBundle, "kp");
    return {
      reply: `好，那我们就沿着这条继续。\n${formatStartReply(stateBundle, ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false }))}`,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 继续了当前存档`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: pending.saveId || "current"
      })]
    };
  }

  if (choice === "new") {
    stateBundle.meta.pendingResumeChoice = null;
    saveMeta(stateBundle.layout, stateBundle.meta);
    const archived = archiveConversationState(stateBundle, "new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const archiveLine = archived
      ? `旧档我先收成 ${archived.saveId} 了。`
      : "这边没有需要打包的旧档，我直接给你开了新线。";
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archiveLine}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  return {
    reply: [
      "我这边先等你拍板喔。",
      "群里继续操作时记得带 `@麦麦`。",
      "回复 `续上` 我就接回旧档；回复 `新开` 我就另起一条。",
      "想看历史存档可以发 `/aikp saves`。"
    ].join("\n")
  };
}

function flushConversationArtifacts(event, stateBundle, response, options = {}) {
  if (!stateBundle) {
    return {
      ...response,
      sessionState: response.sessionState ?? null,
      contextRef: response.contextRef || null,
      contextPacket: response.contextPacket || null
    };
  }

  if (response.reply) {
    appendChatLog(stateBundle.layout, buildChatLogEntry(event, "outbound", response.reply));
  }

  const operationEvents = Array.isArray(options.operationEvents) ? options.operationEvents : [];
  for (const operationEvent of operationEvents) {
    appendOperationLog(stateBundle.layout, operationEvent);
  }
  appendPlayerOperationLogs(stateBundle.layout, operationEvents);

  let stateSnapshot = buildStateSnapshot(stateBundle);
  const summaryChunk = maybeRollupSummaries(stateBundle.layout, stateBundle.meta, stateSnapshot, options.summaryOptions || {});
  if (summaryChunk) {
    const summaryEvent = buildOperationEvent("summary.rollup", `生成摘要块 ${summaryChunk.chunkName}`, {
      chunkName: summaryChunk.chunkName,
      pendingChatCount: summaryChunk.pendingChatCount
    });
    appendOperationLog(stateBundle.layout, summaryEvent);
    stateSnapshot = buildStateSnapshot(stateBundle);
  }

  writeStateSnapshot(stateBundle.layout, stateSnapshot);
  const contextPacket = buildContextPacket(stateBundle.layout, stateBundle.meta, stateSnapshot, {
    runtimePrompt: getKpRuntimePrompt(),
    recentChatLimit: options.contextOptions?.recentChatLimit,
    recentOperationLimit: options.contextOptions?.recentOperationLimit,
    summaryChunkLimit: options.contextOptions?.summaryChunkLimit
  });
  writeContextSnapshot(stateBundle.layout, contextPacket);
  saveMeta(stateBundle.layout, stateBundle.meta);

  return {
    ...response,
    sessionState: cloneJson(stateBundle.sessionState),
    contextRef: stateBundle.layout.contextFile,
    contextPacket: options.includeContextPacket ? contextPacket : null
  };
}

function describeOperationOutcome(resultEvent = {}) {
  if (!resultEvent?.result) return null;
  if (resultEvent.mode === "hidden") {
    return `${resultEvent.skillKey}（暗骰 ${resultEvent.result.successLevel}）`;
  }
  return `${resultEvent.skillKey} 投掷 ${resultEvent.roll}/${resultEvent.targetValue}（${resultEvent.result.successLevel}）`;
}

function buildRollOperationEvents(event, result, partyMode = false) {
  if (partyMode) {
    return (result.bundles || []).map((bundle) => {
      const description = bundle.mode === "quickfire"
        ? `${bundle.investigator.name} 快速车卡完成，职业 ${bundle.investigator.occupation}`
        : `${bundle.investigator.name} 传统车卡完成，职业 ${bundle.investigator.occupation}`;
      return buildOperationEvent("character.created", description, {
        userId: bundle.sourceUserId || null,
        userName: bundle.sourceUserName || null,
        actorId: bundle.investigator.id,
        occupationKey: bundle.occupationKey,
        mode: bundle.mode,
        generation: cloneJson(bundle.generation)
      });
    });
  }

  if (!result.bundle) return [];
  const description = result.bundle.mode === "quickfire"
    ? `${getSenderName(event)} 快速车卡完成，职业 ${result.bundle.investigator.occupation}`
    : `${getSenderName(event)} 传统车卡完成，职业 ${result.bundle.investigator.occupation}`;
  return [
    buildOperationEvent("character.created", description, {
      userId: event.user_id != null ? String(event.user_id) : null,
      actorId: result.bundle.investigator.id,
      occupationKey: result.bundle.occupationKey,
      mode: result.bundle.mode,
      generation: cloneJson(result.bundle.generation)
    })
  ];
}

function detectNaturalIntent(text, actorResult = {}) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return null;

  if (includesAny(normalized, ["不跑了", "先不跑了", "结束跑团", "收团", "退出跑团", "先停团"])) {
    return { kind: "exit" };
  }

  if (includesAny(normalized, ["续上", "继续上次", "接着上次", "恢复跑团", "继续这条"])) {
    return { kind: "resume" };
  }

  if (includesAny(normalized, ["开新线", "新开一条", "另开一条", "重开一条", "新开"])) {
    return { kind: "new" };
  }

  if (includesAny(normalized, ["看看状态", "现在什么情况", "当前状态", "场景状态"])) {
    return { kind: "state" };
  }

  if (includesAny(normalized, ["总结一下", "回顾一下", "复盘一下", "recap"])) {
    return { kind: "recap" };
  }

  if (includesAny(normalized, ["看看队伍", "队伍情况", "谁在场", "队伍面板"])) {
    return { kind: "party" };
  }

  const explicitOccupationKey = extractOccupationKeyFromText(text);
  const occupationKey = explicitOccupationKey || actorResult.investigator?.occupationKey || "journalist";
  const wantsQuickfire = includesAny(normalized, ["quickfire", "快速车卡", "快速建卡", "快车卡", "快速卡"]);
  const wantsRoll = includesAny(normalized, ["车卡", "建卡", "开卡", "人物卡", "角色卡", "roll卡", "roll"]) || includesAny(normalized, ["角色选", "职业选", "职业是", "职业当", "我选"]);
  const wantsParty = includesAny(normalized, ["全车", "全员", "一起车", "大家都", "批量车卡", "一次全车完卡", "一起开卡"]);
  const wantsStart = includesAny(normalized, [
    "想跑团",
    "我要跑团",
    "来跑团",
    "陪我跑团",
    "开始跑团",
    "开始跑个团",
    "开始吧",
    "开团",
    "我要开团",
    "想开团",
    "开局",
    "进游戏",
    "进入游戏",
    "开始跑",
    "想玩coc",
    "我要玩coc",
    "来个coc",
    "开个coc"
  ]);

  if (wantsRoll || (!actorResult.actorId && wantsStart && explicitOccupationKey)) {
    return {
      kind: "roll",
      mode: wantsQuickfire ? "quickfire" : "traditional",
      party: wantsParty,
      occupationKey
    };
  }

  if (wantsStart) {
    return { kind: "start" };
  }

  return null;
}

function shouldHandleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const commandLike = isAiKpCommand(text);
  const isGroupMessage = Boolean(event.group_id);
  const requiresMention = isGroupMessage && options.requireGroupMention !== false;
  const mentionedSelf = event.mentionedSelf !== false;
  const { layout, meta } = readConversationMetaSnapshot(event, options);
  const sessionMode = meta?.sessionMode || "idle";
  const isActive = sessionMode === "kp";
  const allowDirectMessages = options.allowDirectMessages !== false;

  if (!text) {
    return {
      handle: false,
      reason: "empty_message",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isConversationWhitelisted(event, options)) {
    return {
      handle: false,
      reason: "group_not_whitelisted",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (requiresMention && !mentionedSelf) {
    return {
      handle: false,
      reason: "not_addressed",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isGroupMessage && !allowDirectMessages) {
    return {
      handle: false,
      reason: "direct_message_disabled",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (commandLike) {
    return {
      handle: true,
      reason: "command",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (!isGroupMessage) {
    return {
      handle: true,
      reason: "direct_message",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (meta?.pendingResumeChoice) {
    return {
      handle: true,
      reason: "pending_resume_choice",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (meta?.pendingStoryPackChoice) {
    return {
      handle: true,
      reason: "pending_storypack_choice",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (isActive) {
    return {
      handle: true,
      reason: "active_session",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  if (options.allowNaturalActivation === false) {
    return {
      handle: false,
      reason: "inactive_group_session",
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  const naturalIntent = detectNaturalIntent(text, {});
  if (naturalIntent && ["start", "roll", "exit", "resume", "new"].includes(naturalIntent.kind)) {
    return {
      handle: true,
      reason: "activation_intent",
      trigger: naturalIntent.kind,
      conversationKey: layout.conversationKey,
      sessionMode
    };
  }

  return {
    handle: false,
    reason: "inactive_group_session",
    conversationKey: layout.conversationKey,
    sessionMode
  };
}

function loadConversationContext(conversationKey, options = {}) {
  const layout = buildStorageLayoutFromConversationKey(options.storageRoot, conversationKey);
  if (!existsSync(layout.contextFile)) return null;
  return JSON.parse(readFileSync(layout.contextFile, "utf8"));
}

function handleNaturalIntent(text, event, stateBundle, actorResult, options = {}) {
  const naturalIntent = detectNaturalIntent(text, actorResult);
  if (!naturalIntent) return null;
  const randomInt = options.randomInt || defaultRandomInt;
  const hasSelectedStoryPack = Boolean(getSelectedStoryPackEntry(stateBundle.meta));

  if (naturalIntent.kind === "exit") {
    setSessionMode(stateBundle, "idle");
    return {
      reply: "好，这局我先帮你收住啦。之后想继续的话，群里记得带 `@麦麦` 再说“开始跑团”或者“我想车卡”，我就能接上。",
      operationEvents: [buildOperationEvent("session.exit", `${getSenderName(event)} 结束了本群 AI-KP 状态`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    };
  }

  if (naturalIntent.kind === "state") {
    if (!hasSelectedStoryPack) return { reply: formatStoryPackChoicePrompt() };
    return { reply: formatStateSummary(stateBundle.sessionState, stateBundle.meta) };
  }

  if (naturalIntent.kind === "recap") {
    if (!hasSelectedStoryPack) return { reply: formatStoryPackChoicePrompt() };
    return { reply: formatRecapReply(stateBundle.sessionState) };
  }

  if (naturalIntent.kind === "party") {
    return { reply: formatPartySummary(stateBundle) };
  }

  if (naturalIntent.kind === "resume") {
    const resumeCandidate = getResumeCandidate(stateBundle);
    if (!resumeCandidate) {
      setSessionMode(stateBundle, "kp");
      return buildStartPanelResponse(event, stateBundle, actorResult, [
        buildSessionEnterOperationEvent(event)
      ]);
    }

    if (resumeCandidate.source === "archive") {
      const restored = restoreArchivedConversation(event, stateBundle, resumeCandidate.record.saveId);
      if (!restored.ok) {
        return { reply: restored.reply };
      }
      return {
        reply: `好，我把旧档 ${resumeCandidate.record.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
        stateBundle: restored.stateBundle,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${resumeCandidate.record.saveId}`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: resumeCandidate.record.saveId
        })]
      };
    }

    setSessionMode(stateBundle, "kp");
    return {
      reply: `好，那我们就沿着这条继续。\n${formatStartReply(stateBundle, actorResult)}`,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 继续了当前存档`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: resumeCandidate.record.saveId
      })]
    };
  }

  if (naturalIntent.kind === "new") {
    const archived = archiveConversationState(stateBundle, "natural-new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 自然语言新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archived ? `旧档我先收成 ${archived.saveId} 了。` : "这边没有旧档要打包，我直接给你起新线。"}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (naturalIntent.kind === "start") {
    const prompt = maybePromptForExistingSave(event, stateBundle);
    if (prompt) return prompt;
    setSessionMode(stateBundle, "kp");
    return buildStartPanelResponse(event, stateBundle, actorResult, [
      buildSessionEnterOperationEvent(event, "激活了本群 AI-KP")
    ]);
  }

  if (naturalIntent.kind === "roll") {
    setSessionMode(stateBundle, "kp");
    if (naturalIntent.party) {
      const rollResult = runPartyRollCommand(stateBundle, naturalIntent.mode, naturalIntent.occupationKey, randomInt);
      const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
      return {
        reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
        operationEvents: buildRollOperationEvents(event, rollResult, true)
      };
    }

    const rollResult = runSingleRollCommand(event, stateBundle, naturalIntent.mode, naturalIntent.occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  return null;
}

function handleCommand(text, event, stateBundle, actorResult, options = {}) {
  const { command, args } = parseCommand(text);
  const randomInt = options.randomInt || defaultRandomInt;
  const subcommand = args[0] || "";

  if (command === "/aikp" && !args.length) {
    return { reply: formatHelpReply() };
  }

  if (command === "/aikp" && subcommand === "help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp start") {
    const prompt = maybePromptForExistingSave(event, stateBundle);
    if (prompt) return prompt;
    setSessionMode(stateBundle, "kp");
    return buildStartPanelResponse(event, stateBundle, actorResult, [
      buildSessionEnterOperationEvent(event, "查看了开场面板")
    ]);
  }

  if (text.trim() === "/aikp saves") {
    return { reply: formatSaveListReply(stateBundle) };
  }

  if (text.trim() === "/aikp packs") {
    return { reply: formatStoryPackChoicePrompt() };
  }

  if (command === "/aikp" && subcommand === "pack") {
    const selection = resolveStoryPackSelection(args.slice(1).join(" "));
    if (!selection || selection.kind === "list") {
      return { reply: formatStoryPackChoicePrompt() };
    }
    const activated = activateStoryPackSelection(event, stateBundle, selection.storyPackId);
    if (!activated) {
      return { reply: `我没对上这个剧本。\n${formatStoryPackChoicePrompt()}` };
    }
    setSessionMode(activated.stateBundle, "kp");
    const nextActor = ensureActorForUser(event, activated.stateBundle, { autoCreateInvestigator: false });
    return {
      reply: formatStartReply(activated.stateBundle, nextActor),
      stateBundle: activated.stateBundle,
      operationEvents: [buildOperationEvent("storypack.select", `${getSenderName(event)} 手动选择了剧本 ${activated.selected.storyPack.title}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        storyPackId: activated.selected.storyPack.id,
        campaignId: activated.selected.storyPack.campaignId,
        scenarioId: activated.selected.startSceneId
      })]
    };
  }

  if (text.trim() === "/aikp new") {
    const archived = archiveConversationState(stateBundle, "command-new-line");
    const fresh = startFreshConversationLine(event, stateBundle);
    const startReply = buildStartPanelResponse(event, fresh.stateBundle, fresh.actor, [
      buildOperationEvent("session.new", `${getSenderName(event)} 手动新开了一条跑团线`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        archivedSaveId: archived?.saveId || null
      })
    ]);
    return {
      reply: `${archived ? `旧档我先收成 ${archived.saveId} 了。` : "这边没有旧档要打包，我直接给你起新线。"}\n${startReply.reply}`,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (command === "/aikp" && subcommand === "resume") {
    const selector = args[1] || "";
    if (!selector && hasMeaningfulSessionProgress(stateBundle.layout, stateBundle.meta, stateBundle.sessionState)) {
      setSessionMode(stateBundle, "kp");
      return {
        reply: `好，这条我给你接上。\n${formatStartReply(stateBundle, actorResult)}`,
        operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了当前存档`, {
          userId: event.user_id != null ? String(event.user_id) : null,
          saveId: "current"
        })]
      };
    }

    const restored = restoreArchivedConversation(event, stateBundle, selector);
    if (!restored.ok) {
      return { reply: restored.reply };
    }
    return {
      reply: `好，我把旧档 ${restored.record.saveId} 接回来了。\n${formatStartReply(restored.stateBundle, restored.actor)}`,
      stateBundle: restored.stateBundle,
      operationEvents: [buildOperationEvent("session.resume", `${getSenderName(event)} 恢复了存档 ${restored.record.saveId}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        saveId: restored.record.saveId
      })]
    };
  }

  if (!getSelectedStoryPackEntry(stateBundle.meta) && STORY_PACK_REQUIRED_COMMANDS.has(subcommand)) {
    return { reply: formatStoryPackChoicePrompt() };
  }

  if (text.trim() === "/aikp state") {
    return { reply: formatStateSummary(stateBundle.sessionState, stateBundle.meta) };
  }
  if (text.trim() === "/aikp campaign") {
    return { reply: formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState)) };
  }
  if (text.trim() === "/aikp hooks") {
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    const sceneId = getCurrentCampaign(stateBundle.sessionState)?.currentSceneId || stateBundle.sessionState.scene?.meta?.scenarioId;
    const hooks = listEligibleHooks(stateBundle.sessionState, campaign, sceneId);
    const lines = ["当前钩子："];
    for (const hook of hooks) {
      lines.push(`- ${hook.id}｜${hook.label}｜${hook.eligible ? "eligible" : "locked"}`);
    }
    return { reply: lines.join("\n") };
  }
  if (text.trim() === "/aikp storypack") {
    const selected = getSelectedStoryPackEntry(stateBundle.meta);
    return { reply: selected ? formatStoryPackSummary(selected.storyPack) : formatStoryPackChoicePrompt() };
  }
  if (text.trim() === "/aikp scene") {
    return { reply: formatScenePanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp recap") {
    return { reply: formatRecapReply(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp party") {
    return { reply: formatPartySummary(stateBundle) };
  }
  if (text.trim() === "/aikp clues") {
    return { reply: formatCluePanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp npcs") {
    return { reply: formatNpcPanel(stateBundle.sessionState) };
  }
  if (text.trim() === "/aikp who") {
    const turnState = ensureTurnState(stateBundle.meta);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return { reply: currentActor ? `现在轮到 ${currentActor.name}（第 ${turnState.round} 轮）。` : "现在还没指定当前行动者。" };
  }

  if (text.trim() === "/aikp reset") {
    const fresh = rebuildConversationSession(event, {
      storageRoot: stateBundle.layout.root,
      scenarioId: stateBundle.meta.scenarioId,
      campaignId: stateBundle.meta.campaignId,
      storyPackId: stateBundle.meta.storyPackId,
      reset: true
    });
    setSessionMode(fresh, "kp");
    const actor = ensureActorForUser(event, fresh, { autoCreateInvestigator: false });
    const startReply = buildStartPanelResponse(event, fresh, actor, [
      buildOperationEvent("session.reset", `${getSenderName(event)} 重置了当前会话`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })
    ]);
    return {
      reply: startReply.reply,
      stateBundle: startReply.stateBundle,
      operationEvents: startReply.operationEvents
    };
  }

  if (text.trim() === "/aikp join") {
    if (!actorResult.investigator) {
      return { reply: "你现在还没绑定调查员。先用 `/aikp roll journalist` 或 `/aikp quickfire artist` 来一张卡。" };
    }
    return { reply: `你已经在场里了，当前调查员是 ${actorResult.investigator.name}。` };
  }

  if (text.trim() === "/aikp sheet") {
    return { reply: formatInvestigatorSummary(actorResult.investigator) };
  }

  if (text.trim() === "/aikp settle") {
    const settlement = settleSessionApi(stateBundle.sessionState);
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: formatSettlementReply(settlement),
      operationEvents: [buildOperationEvent("session.settle", `${getSenderName(event)} 生成了结团摘要`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        settlement: cloneJson(settlement)
      })]
    };
  }

  if (command === "/aikp" && args[0] === "roll") {
    const occupationKey = resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist");
    setSessionMode(stateBundle, "kp");
    const rollResult = runSingleRollCommand(event, stateBundle, "traditional", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  if (command === "/aikp" && args[0] === "quickfire") {
    const occupationKey = resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist");
    setSessionMode(stateBundle, "kp");
    const rollResult = runSingleRollCommand(event, stateBundle, "quickfire", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, false)
    };
  }

  if (command === "/aikp" && args[0] === "party-roll") {
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    setSessionMode(stateBundle, "kp");
    const rollResult = runPartyRollCommand(stateBundle, "traditional", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, true)
    };
  }

  if (command === "/aikp" && args[0] === "party-quickfire") {
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    setSessionMode(stateBundle, "kp");
    const rollResult = runPartyRollCommand(stateBundle, "quickfire", occupationKey, randomInt);
    const currentActor = ensureActorForUser(event, stateBundle, { autoCreateInvestigator: false });
    return {
      reply: appendSceneStartReplyIfNeeded(stateBundle, currentActor, rollResult.reply),
      operationEvents: buildRollOperationEvents(event, rollResult, true)
    };
  }

  if (command === "/aikp" && subcommand === "focus") {
    const entry = resolveActorSelection(stateBundle, args.slice(1).join(" "));
    if (!entry?.actorId || !entry.investigator) {
      return { reply: "我没找到你要切到的那位。可以用玩家名、调查员名、userId 来指。" };
    }
    const turnState = setCurrentActor(stateBundle, entry.actorId);
    return {
      reply: `好，现在 spotlight 切到 ${entry.investigator.name} 了（第 ${turnState.round} 轮）。`,
      operationEvents: [buildOperationEvent("turn.focus", `${getSenderName(event)} 把 spotlight 切到了 ${entry.investigator.name}`, {
        actorId: entry.actorId,
        round: turnState.round
      })]
    };
  }

  if (command === "/aikp" && subcommand === "goto") {
    const targetSceneId = args[1];
    if (!targetSceneId) {
      return { reply: "你得给我一个 sceneId，比如 `/aikp goto bell-tower-followup`。" };
    }
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    transitionCampaignScene(stateBundle.sessionState, campaign, targetSceneId);
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: `好，这幕我先切到 ${targetSceneId} 了。\n${formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState))}`,
      operationEvents: [buildOperationEvent("campaign.goto", `${getSenderName(event)} 切换到了场景 ${targetSceneId}`, {
        targetSceneId
      })]
    };
  }

  if (command === "/aikp" && subcommand === "advance") {
    const preferredHookId = args[1] || null;
    const campaignId = stateBundle.meta.campaignId || "old-church-arc";
    const campaign = loadCampaignTemplate(campaignId);
    const chosen = autoAdvanceCampaign(stateBundle.sessionState, campaign, preferredHookId);
    if (!chosen) {
      return { reply: "这会儿还没有满足条件的下一幕钩子。先继续推进，或者用 `/aikp hooks` 看当前哪些是锁着的。" };
    }
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return {
      reply: `好，我按钩子 ${chosen.id} 把这幕往后推进了。\n${formatCampaignSummary(getCurrentCampaign(stateBundle.sessionState))}`,
      operationEvents: [buildOperationEvent("campaign.advance", `${getSenderName(event)} 按钩子 ${chosen.id} 推进了剧情`, {
        hookId: chosen.id
      })]
    };
  }

  if (command === "/aikp" && subcommand === "next") {
    const turnState = advanceCurrentActor(stateBundle);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return {
      reply: currentActor ? `下一位是 ${currentActor.name}（第 ${turnState.round} 轮）。` : "现在还没有可轮转的调查员。",
      operationEvents: currentActor
        ? [buildOperationEvent("turn.advance", `${getSenderName(event)} 把当前聚焦推进到 ${currentActor.name}`, {
          actorId: currentActor.id,
          round: turnState.round
        })]
        : []
    };
  }

  return null;
}

function handleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const summaryOptions = {
    summaryEventThreshold: options.summaryEventThreshold,
    summaryCharThreshold: options.summaryCharThreshold
  };
  const contextOptions = {
    recentChatLimit: options.contextRecentChatLimit,
    recentOperationLimit: options.contextRecentOperationLimit,
    summaryChunkLimit: options.contextSummaryChunkLimit
  };
  const stateBundle = maybeResetSession(event, options);
  rememberUser(stateBundle.meta, event);
  stateBundle.meta.messageCount += text ? 1 : 0;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveMeta(stateBundle.layout, stateBundle.meta);
  if (text) {
    appendChatLog(stateBundle.layout, buildChatLogEntry(event, "inbound", text));
  }
  const actorResult = ensureActorForUser(event, stateBundle, { ...options, autoCreateInvestigator: false });

  if (stateBundle.meta.pendingResumeChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingResumeChoice(text, event, stateBundle);
    if (pendingResult) {
      const currentBundle = pendingResult.stateBundle || stateBundle;
      return flushConversationArtifacts(event, currentBundle, {
        ok: true,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: pendingResult.operationEvents || []
      });
    }
  }

  if (stateBundle.meta.pendingStoryPackChoice && text && !isAiKpCommand(text)) {
    const pendingResult = handlePendingStoryPackChoice(text, event, stateBundle);
    if (pendingResult) {
      const currentBundle = pendingResult.stateBundle || stateBundle;
      return flushConversationArtifacts(event, currentBundle, {
        ok: true,
        reply: pendingResult.reply
      }, {
        includeContextPacket: options.includeContextPacket === true,
        contextOptions,
        summaryOptions,
        operationEvents: pendingResult.operationEvents || []
      });
    }
  }

  if (!text) {
    const startReply = buildStartPanelResponse(event, stateBundle, actorResult);
    return flushConversationArtifacts(event, startReply.stateBundle || stateBundle, {
      ok: true,
      reply: startReply.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: startReply.operationEvents || []
    });
  }

  const commandResult = handleCommand(text, event, stateBundle, actorResult, options);
  if (commandResult) {
    const currentBundle = commandResult.stateBundle || stateBundle;
    return flushConversationArtifacts(event, currentBundle, {
      ok: true,
      reply: commandResult.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: commandResult.operationEvents || []
    });
  }

  const naturalIntentResult = handleNaturalIntent(text, event, stateBundle, actorResult, options);
  if (naturalIntentResult) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: true,
      reply: naturalIntentResult.reply
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: naturalIntentResult.operationEvents || []
    });
  }

  if (!getSelectedStoryPackEntry(stateBundle.meta)) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "missing_storypack",
      reply: formatStoryPackChoicePrompt()
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [buildOperationEvent("turn.blocked", `${getSenderName(event)} 想继续，但当前还没选剧本`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    });
  }

  if (!actorResult.actorId) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reason: "missing_investigator",
      reply: "你还没车卡喔。可以直接说“我想一次全车完卡，角色选记者”，或者“给我快速车卡，职业医生”；要继续用指令也行：`/aikp roll journalist`。"
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [buildOperationEvent("turn.blocked", `${getSenderName(event)} 想行动，但还没有调查员卡`, {
        userId: event.user_id != null ? String(event.user_id) : null
      })]
    });
  }

  const beforeSessionState = cloneJson(stateBundle.sessionState);
  setSessionMode(stateBundle, "kp");
  const turn = processScenarioTurn(
    stateBundle.sessionState,
    actorResult.actorId,
    text,
    options.submitAction || require("../../core/src/api").submitAction,
    options.randomInt || defaultRandomInt
  );

  if (!turn.ok) {
    return flushConversationArtifacts(event, stateBundle, {
      ok: false,
      reply: turn.reply,
      reason: turn.reason
    }, {
      includeContextPacket: options.includeContextPacket === true,
      contextOptions,
      summaryOptions,
      operationEvents: [buildOperationEvent("turn.rejected", `${getSenderName(event)} 的行动没有落地：${turn.reason || "unknown"}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        actorId: actorResult.actorId,
        reason: turn.reason || null,
        intent: text
      })]
    });
  }

  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);

  const deltaSummary = formatStateDelta(beforeSessionState, stateBundle.sessionState);
  const sceneBeat = formatSceneBeat(stateBundle.sessionState);
  const optionCue = formatOptionCue(stateBundle.sessionState);
  const spotlightCue = formatSpotlightCue(stateBundle);
  const investigator = stateBundle.sessionState.investigators[actorResult.actorId];
  const operationSummary = describeOperationOutcome(turn.result?.event) || turn.action?.kind || "行动已处理";

  return flushConversationArtifacts(event, stateBundle, {
    ok: true,
    reply: formatTurnReply(turn.result, {
      deltaSummary,
      sceneBeat,
      optionCue,
      spotlightCue
    }),
    action: turn.action
  }, {
    includeContextPacket: options.includeContextPacket === true,
    contextOptions,
    summaryOptions,
    operationEvents: [
      buildOperationEvent("scene.action", `${investigator?.name || getSenderName(event)} 执行了 ${turn.action?.kind || "unknown"}：${operationSummary}`, {
        userId: event.user_id != null ? String(event.user_id) : null,
        actorId: actorResult.actorId,
        action: cloneJson(turn.action),
        result: cloneJson(turn.result?.event || null),
        deltaSummary
      })
    ]
  });
}

module.exports = {
  sanitizeSegment,
  getMessageText,
  getSenderName,
  getKpRuntimePrompt,
  buildConversationKey,
  buildStorageLayoutFromConversationKey,
  buildStorageLayout,
  loadMeta,
  saveMeta,
  isAiKpCommand,
  shouldHandleOneBotMessage,
  getConversationRuntimeState,
  loadConversationContext,
  rememberUser,
  createDefaultInvestigator,
  createRolledInvestigator,
  createQuickfireInvestigator,
  ensureConversationSession,
  ensureActorForUser,
  formatStateSummary,
  formatScenePanel,
  formatRecapReply,
  formatPartySummary,
  formatCluePanel,
  formatNpcPanel,
  formatSceneBeat,
  formatOptionCue,
  formatSpotlightCue,
  formatTurnReply,
  formatStartReply,
  formatHelpReply,
  formatSettlementReply,
  formatInvestigatorSummary,
  handleOneBotMessage,
  rebuildConversationSession,
  runPartyRollCommand,
  buildPartyEntries,
  resolveActorSelection,
  setCurrentActor,
  advanceCurrentActor
};
