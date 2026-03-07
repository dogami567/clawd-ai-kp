const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const {
  startSessionApi,
  addInvestigator,
  getState,
  saveSessionApi,
  loadSessionApi,
  createCharacter,
  createInvestigatorFromTraditional,
  generateTraditionalAttributes,
  getOccupationTemplate,
  QUICK_FIRE_VALUES,
  processScenarioTurn,
  settleSessionApi
} = require("../../core/src/index");
const { resolveSkillDefault } = require("../../core/src/skill-defaults");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

function buildConversationKey(event = {}) {
  if (event.group_id) return `onebot-group-${sanitizeSegment(event.group_id)}`;
  if (event.user_id) return `onebot-dm-${sanitizeSegment(event.user_id)}`;
  return "onebot-unknown";
}

function buildStorageLayout(storageRoot, event) {
  const conversationKey = buildConversationKey(event);
  const root = storageRoot || join(__dirname, "..", "..", "runtime", "onebot");
  return {
    root,
    conversationKey,
    sessionsDir: join(root, "sessions"),
    metaDir: join(root, "meta"),
    sessionFile: join(root, "sessions", `${conversationKey}.json`),
    metaFile: join(root, "meta", `${conversationKey}.json`)
  };
}

function ensureStorageDirs(layout) {
  mkdirSync(layout.sessionsDir, { recursive: true });
  mkdirSync(layout.metaDir, { recursive: true });
}

function loadMeta(layout) {
  ensureStorageDirs(layout);
  if (!existsSync(layout.metaFile)) return null;
  return JSON.parse(readFileSync(layout.metaFile, "utf8"));
}

function saveMeta(layout, meta) {
  ensureStorageDirs(layout);
  writeFileSync(layout.metaFile, JSON.stringify(meta, null, 2), "utf8");
  return meta;
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

function buildInitialMeta(event, layout, scenarioId) {
  const meta = {
    conversationKey: layout.conversationKey,
    sessionFile: layout.sessionFile,
    scenarioId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actorsByUserId: {},
    knownUsers: [],
    messageCount: 0,
    turnState: {
      actorOrder: [],
      currentActorId: null,
      round: 1
    }
  };
  rememberUser(meta, event);
  return meta;
}

function ensureConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  let meta = loadMeta(layout);
  let sessionState;

  if (meta && existsSync(layout.sessionFile)) {
    sessionState = loadSessionApi(layout.sessionFile);
    rememberUser(meta, event);
    saveMeta(layout, meta);
    return { layout, meta, sessionState, created: false };
  }

  sessionState = startSessionApi({
    sessionId: `onebot-${layout.conversationKey}`,
    scenarioId
  });
  saveSessionApi(sessionState, layout.sessionFile, { meta: { conversationKey: layout.conversationKey } });
  meta = buildInitialMeta(event, layout, scenarioId);
  saveMeta(layout, meta);
  return { layout, meta, sessionState, created: true };
}

function rebuildConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  const sessionState = startSessionApi({ sessionId: `onebot-${layout.conversationKey}`, scenarioId });
  const meta = buildInitialMeta(event, layout, scenarioId);
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

function createRolledInvestigator(event, occupationKey = "journalist", randomInt = defaultRandomInt) {
  const occupation = getOccupationTemplate(occupationKey);
  const rolled = generateTraditionalAttributes(randomInt);
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

  return createInvestigatorFromTraditional({
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
  }, randomInt);
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

function formatCheckResultLine(event) {
  if (!event?.result) return null;
  if (event.mode === "hidden") {
    return `暗骰：${event.skillKey}（${event.result.successLevel}）`;
  }
  return `检定：${event.skillKey} ${event.roll}/${event.targetValue}（${event.result.successLevel}）`;
}

function formatTurnReply(result) {
  if (!result) return "这下我没接住，怪。";
  const parts = [];
  if (result.warningLine) parts.push(result.warningLine);
  if (result.adjudicationBonusLine) parts.push(result.adjudicationBonusLine);
  if (result.preRollLine) parts.push(result.preRollLine);
  if (result.postRollLine) parts.push(result.postRollLine);
  if (result.narrativeLine) parts.push(result.narrativeLine);
  const checkResultLine = formatCheckResultLine(result.event);
  if (checkResultLine) parts.push(checkResultLine);
  if (result.event?.outcome?.nextPrompt) parts.push(result.event.outcome.nextPrompt);
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

function formatStartReply(stateBundle, actorResult) {
  const opening = stateBundle.sessionState.scene.meta?.opening || "场景已经起好了。";
  const prompts = stateBundle.sessionState.scene.meta?.starterPrompts || [];
  const joinLine = actorResult?.investigator
    ? `当前绑定调查员：${actorResult.investigator.name}。`
    : "你现在还没车卡，先建卡再入场会更像真跑团。";
  const promptLine = prompts.length ? `场景里可以直接试这些：\n- ${prompts.join("\n- ")}` : "你现在可以直接说行动。";
  const helpLine = "先建卡：/aikp roll journalist 或 /aikp quickfire artist；多人：/aikp party；切人：/aikp next";
  return [joinLine, opening, promptLine, helpLine].join("\n");
}

function formatHelpReply() {
  return [
    "AI-KP 可用指令：",
    "- /aikp start 重新开场",
    "- /aikp roll <occupationKey> 单人传统随机车卡",
    "- /aikp quickfire <occupationKey> 单人快速车卡",
    "- /aikp party-roll <occupationKey> 为当前已出现玩家批量传统随机车卡",
    "- /aikp party-quickfire <occupationKey> 为当前已出现玩家批量快速车卡",
    "- /aikp join 确认当前调查员",
    "- /aikp sheet 查看自己的调查员卡",
    "- /aikp state 查看当前场景状态",
    "- /aikp party 查看队伍面板",
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

function parseCommand(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return {
    command: tokens[0] || "",
    args: tokens.slice(1)
  };
}

function resolveOccupationKey(rawValue, fallback = "journalist") {
  if (!rawValue) return fallback;
  try {
    getOccupationTemplate(rawValue);
    return rawValue;
  } catch {
    return fallback;
  }
}

function createInvestigatorForMode(event, mode, occupationKey, randomInt) {
  if (mode === "quickfire") {
    return createQuickfireInvestigator(event, occupationKey, randomInt);
  }
  return createRolledInvestigator(event, occupationKey, randomInt);
}

function formatPartyRollReply(createdInvestigators, mode) {
  const modeText = mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  const lines = [`这轮我已经帮当前这批玩家批量做了 ${modeText}：`];
  for (const investigator of createdInvestigators) {
    lines.push(`- ${investigator.name}｜${investigator.occupation}｜HP ${investigator.resources.hp}｜SAN ${investigator.resources.san}`);
  }
  lines.push("现在可以用 `/aikp party` 看队伍面板，用 `/aikp next` 往下一位切。\n");
  return lines.join("\n");
}

function runSingleRollCommand(event, stateBundle, mode, occupationKey, randomInt) {
  const investigator = createInvestigatorForMode(event, mode, occupationKey, randomInt);
  upsertInvestigatorForUser(event, stateBundle, investigator);
  const modeText = mode === "quickfire" ? "快速车卡" : "传统随机车卡";
  return `${modeText} 已经给你落好了：\n${formatInvestigatorSummary(investigator)}`;
}

function runPartyRollCommand(stateBundle, mode, occupationKey, randomInt) {
  const createdInvestigators = [];
  const knownUsers = Array.isArray(stateBundle.meta.knownUsers) ? stateBundle.meta.knownUsers : [];

  for (const user of knownUsers) {
    const fakeEvent = {
      user_id: user.userId,
      sender: { nickname: user.name }
    };
    const existing = getActorForUser(stateBundle, user.userId);
    const resolvedOccupation = occupationKey || existing?.occupationKey || "journalist";
    const investigator = createInvestigatorForMode(fakeEvent, mode, resolvedOccupation, randomInt);
    addInvestigator(stateBundle.sessionState, investigator);
    stateBundle.meta.actorsByUserId[String(user.userId)] = investigator.id;
    syncActorIntoTurnState(stateBundle.meta, investigator.id);
    createdInvestigators.push(investigator);
  }

  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return formatPartyRollReply(createdInvestigators, mode);
}

function handleCommand(text, event, stateBundle, actorResult, options = {}) {
  const { command, args } = parseCommand(text);
  const randomInt = options.randomInt || defaultRandomInt;

  if (command === "/aikp" && !args.length) {
    return { reply: formatHelpReply() };
  }

  if (command === "/aikp" && args[0] === "help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp help") {
    return { reply: formatHelpReply() };
  }

  if (text.trim() === "/aikp state") {
    return { reply: formatStateSummary(stateBundle.sessionState, stateBundle.meta) };
  }
  if (text.trim() === "/aikp party") {
    return { reply: formatPartySummary(stateBundle) };
  }
  if (text.trim() === "/aikp who") {
    const turnState = ensureTurnState(stateBundle.meta);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return { reply: currentActor ? `现在轮到 ${currentActor.name}（第 ${turnState.round} 轮）。` : "现在还没指定当前行动者。" };
  }

  if (text.trim() === "/aikp start" || text.trim() === "/aikp reset") {
    const fresh = rebuildConversationSession(event, { storageRoot: stateBundle.layout.root, scenarioId: stateBundle.meta.scenarioId, reset: true });
    const actor = ensureActorForUser(event, fresh, { autoCreateInvestigator: false });
    return { reply: formatStartReply(fresh, actor), stateBundle: fresh };
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
    return { reply: formatSettlementReply(settlement) };
  }

  if (command === "/aikp" && args[0] === "roll") {
    const occupationKey = resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist");
    return { reply: runSingleRollCommand(event, stateBundle, "traditional", occupationKey, randomInt) };
  }

  if (command === "/aikp" && args[0] === "quickfire") {
    const occupationKey = resolveOccupationKey(args[1], actorResult.investigator?.occupationKey || "journalist");
    return { reply: runSingleRollCommand(event, stateBundle, "quickfire", occupationKey, randomInt) };
  }

  if (command === "/aikp" && args[0] === "party-roll") {
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    return { reply: runPartyRollCommand(stateBundle, "traditional", occupationKey, randomInt) };
  }

  if (command === "/aikp" && args[0] === "party-quickfire") {
    const occupationKey = args[1] ? resolveOccupationKey(args[1], "journalist") : null;
    return { reply: runPartyRollCommand(stateBundle, "quickfire", occupationKey, randomInt) };
  }

  if (command === "/aikp" && args[0] === "focus") {
    const entry = resolveActorSelection(stateBundle, args.slice(1).join(" "));
    if (!entry?.actorId || !entry.investigator) {
      return { reply: "我没找到你要切到的那位。可以用玩家名、调查员名、userId 来指。" };
    }
    const turnState = setCurrentActor(stateBundle, entry.actorId);
    return { reply: `好，现在 spotlight 切到 ${entry.investigator.name} 了（第 ${turnState.round} 轮）。` };
  }

  if (command === "/aikp" && args[0] === "next") {
    const turnState = advanceCurrentActor(stateBundle);
    const currentActor = turnState.currentActorId ? stateBundle.sessionState.investigators[turnState.currentActorId] : null;
    return { reply: currentActor ? `下一位是 ${currentActor.name}（第 ${turnState.round} 轮）。` : "现在还没有可轮转的调查员。" };
  }

  return null;
}

function handleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const stateBundle = maybeResetSession(event, options);
  rememberUser(stateBundle.meta, event);
  saveMeta(stateBundle.layout, stateBundle.meta);
  const actorResult = ensureActorForUser(event, stateBundle, { ...options, autoCreateInvestigator: false });

  if (!text || text === "/aikp start") {
    return {
      ok: true,
      reply: formatStartReply(stateBundle, actorResult),
      sessionState: cloneJson(stateBundle.sessionState)
    };
  }

  const commandResult = handleCommand(text, event, stateBundle, actorResult, options);
  if (commandResult) {
    const currentBundle = commandResult.stateBundle || stateBundle;
    return {
      ok: true,
      reply: commandResult.reply,
      sessionState: cloneJson(currentBundle.sessionState)
    };
  }

  if (!actorResult.actorId) {
    return {
      ok: false,
      reason: "missing_investigator",
      reply: "你还没车卡喔。先 `/aikp roll journalist` 自己 roll，或者 `/aikp quickfire artist` 先来一张快速卡；群里要一起开就用 `/aikp party-roll journalist`。",
      sessionState: cloneJson(stateBundle.sessionState)
    };
  }

  const turn = processScenarioTurn(
    stateBundle.sessionState,
    actorResult.actorId,
    text,
    options.submitAction || require("../../core/src/api").submitAction,
    options.randomInt || defaultRandomInt
  );

  if (!turn.ok) {
    return {
      ok: false,
      reply: turn.reply,
      reason: turn.reason,
      sessionState: cloneJson(stateBundle.sessionState)
    };
  }

  stateBundle.meta.messageCount += 1;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);

  return {
    ok: true,
    reply: formatTurnReply(turn.result),
    action: turn.action,
    sessionState: cloneJson(stateBundle.sessionState)
  };
}

module.exports = {
  sanitizeSegment,
  getMessageText,
  getSenderName,
  buildConversationKey,
  buildStorageLayout,
  loadMeta,
  saveMeta,
  rememberUser,
  createDefaultInvestigator,
  createRolledInvestigator,
  createQuickfireInvestigator,
  ensureConversationSession,
  ensureActorForUser,
  formatStateSummary,
  formatPartySummary,
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
