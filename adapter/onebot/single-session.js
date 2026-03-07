const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const {
  startSessionApi,
  addInvestigator,
  getState,
  saveSessionApi,
  loadSessionApi,
  createCharacter,
  processScenarioTurn,
  settleSessionApi
} = require("../../core/src/index");

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

function createDefaultInvestigator(event, overrides = {}) {
  const userId = String(event.user_id || "guest");
  const name = getSenderName(event);
  return createCharacter({
    id: `pc-onebot-${sanitizeSegment(userId)}`,
    name,
    age: 26,
    occupationKey: "journalist",
    creditRating: 20,
    persona: "眼睛尖，嘴不算慢，遇到怪事会先记再追。",
    motivation: "想把眼前这摊怪事追出个所以然。",
    era: "depression_era_1920s",
    residence: "Arkham",
    birthplace: "Boston",
    luck: 55,
    attributeAssignments: { STR: 50, CON: 50, DEX: 60, APP: 60, POW: 50, INT: 70, SIZ: 40, EDU: 80 },
    skills: [
      { key: "Spot Hidden", value: 65, baseValue: 25, occupationPointsSpent: 40, interestPointsSpent: 0, tag: "investigation" },
      { key: "Persuade", value: 60, baseValue: 10, occupationPointsSpent: 30, interestPointsSpent: 20, tag: "social" },
      { key: "Psychology", value: 50, baseValue: 10, occupationPointsSpent: 20, interestPointsSpent: 20, tag: "investigation" },
      { key: "Listen", value: 40, baseValue: 20, occupationPointsSpent: 20, interestPointsSpent: 0, tag: "investigation" },
      { key: "Fighting", value: 35, baseValue: 25, occupationPointsSpent: 0, interestPointsSpent: 10, tag: "action" },
      { key: "Stealth", value: 35, baseValue: 20, occupationPointsSpent: 0, interestPointsSpent: 15, tag: "action" }
    ],
    inventory: [
      { name: "手电", category: "tool", quantity: 1 },
      { name: "笔记本", category: "tool", quantity: 1 },
      { name: "素描本", category: "tool", quantity: 1 }
    ],
    ...overrides
  });
}

function buildInitialMeta(event, layout, scenarioId) {
  return {
    conversationKey: layout.conversationKey,
    sessionFile: layout.sessionFile,
    scenarioId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actorsByUserId: {},
    messageCount: 0
  };
}

function ensureConversationSession(event, options = {}) {
  const layout = buildStorageLayout(options.storageRoot, event);
  const scenarioId = options.scenarioId || "old-church-night";
  let meta = loadMeta(layout);
  let sessionState;

  if (meta && existsSync(layout.sessionFile)) {
    sessionState = loadSessionApi(layout.sessionFile);
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

function ensureActorForUser(event, stateBundle, options = {}) {
  const userId = String(event.user_id || "guest");
  const mappedActorId = stateBundle.meta.actorsByUserId[userId];
  if (mappedActorId && stateBundle.sessionState.investigators[mappedActorId]) {
    return { actorId: mappedActorId, created: false };
  }

  const investigator = createDefaultInvestigator(event, options.investigatorOverrides || {});
  addInvestigator(stateBundle.sessionState, investigator);
  stateBundle.meta.actorsByUserId[userId] = investigator.id;
  stateBundle.meta.updatedAt = new Date().toISOString();
  saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
  saveMeta(stateBundle.layout, stateBundle.meta);
  return { actorId: investigator.id, created: true, investigator };
}

function formatStateSummary(sessionState) {
  const state = getState(sessionState);
  const revealedClues = state.scene.clues.filter((item) => item.revealed).map((item) => item.title);
  const npcBits = (state.scene.participants.npcs || []).map((npc) => `${npc.name}(${npc.attitude})`);
  const lines = [
    `场景：${state.scene.summary || state.scene.location}`,
    `地点：${state.scene.location}`,
    `时间：${state.scene.timeState.timelineMinute} 分钟`,
    `危险：${state.scene.threats.dangerLevel}（暴露 ${state.scene.threats.exposure} / 压力 ${state.scene.threats.pressure}）`,
    `线索：${revealedClues.length ? revealedClues.join("、") : "还没翻到明线索"}`,
    `在场 NPC：${npcBits.length ? npcBits.join("、") : "暂无"}`
  ];
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

function formatStartReply(stateBundle, actorResult) {
  const opening = stateBundle.sessionState.scene.meta?.opening || "场景已经起好了。";
  const prompts = stateBundle.sessionState.scene.meta?.starterPrompts || [];
  const joinLine = actorResult?.created ? `已帮你入场，调查员是 ${actorResult.investigator.name}。` : "你已经在场里了。";
  const promptLine = prompts.length ? `你可以直接试这些：\n- ${prompts.join("\n- ")}` : "你现在可以直接说行动。";
  const helpLine = "可用指令：/aikp state /aikp help /aikp settle /aikp reset";
  return [joinLine, opening, promptLine, helpLine].join("\n");
}

function formatHelpReply() {
  return [
    "AI-KP 可用指令：",
    "- /aikp start 重新开场",
    "- /aikp join 确认当前调查员",
    "- /aikp state 查看当前场景状态",
    "- /aikp settle 生成本轮结团摘要",
    "- /aikp reset 重开当前场景",
    "平时直接发行动句子就行，比如：查祭坛、聊守墓人、临符号、掀木板。"
  ].join("\n");
}

function formatSettlementReply(settlement) {
  const lines = ["这轮先帮你收一下："];
  if (Array.isArray(settlement.summaryLines)) lines.push(...settlement.summaryLines);
  lines.push(`事件数：${settlement.eventCount}`);
  return lines.join("\n");
}

function handleCommand(text, event, stateBundle, actorResult) {
  const normalized = text.trim();
  if (normalized === "/aikp help") {
    return { reply: formatHelpReply() };
  }
  if (normalized === "/aikp state") {
    return { reply: formatStateSummary(stateBundle.sessionState) };
  }
  if (normalized === "/aikp start" || normalized === "/aikp reset") {
    const fresh = rebuildConversationSession(event, { storageRoot: stateBundle.layout.root, scenarioId: stateBundle.meta.scenarioId, reset: true });
    const actor = ensureActorForUser(event, fresh);
    return { reply: formatStartReply(fresh, actor), stateBundle: fresh };
  }
  if (normalized === "/aikp join") {
    return { reply: actorResult.created ? `好呀，你已经进场啦：${actorResult.investigator.name}` : `你已经在场里了，调查员是 ${stateBundle.sessionState.investigators[actorResult.actorId].name}` };
  }
  if (normalized === "/aikp settle") {
    const settlement = settleSessionApi(stateBundle.sessionState);
    saveSessionApi(stateBundle.sessionState, stateBundle.layout.sessionFile, { meta: { conversationKey: stateBundle.layout.conversationKey } });
    return { reply: formatSettlementReply(settlement) };
  }
  return null;
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

function handleOneBotMessage(event, options = {}) {
  const text = getMessageText(event);
  const stateBundle = maybeResetSession(event, options);
  const actorResult = ensureActorForUser(event, stateBundle, options);

  if (!text || text === "/aikp start") {
    return {
      ok: true,
      reply: formatStartReply(stateBundle, actorResult),
      sessionState: cloneJson(stateBundle.sessionState)
    };
  }

  const commandResult = handleCommand(text, event, stateBundle, actorResult);
  if (commandResult) {
    const currentBundle = commandResult.stateBundle || stateBundle;
    return {
      ok: true,
      reply: commandResult.reply,
      sessionState: cloneJson(currentBundle.sessionState)
    };
  }

  const turn = processScenarioTurn(stateBundle.sessionState, actorResult.actorId, text, options.submitAction || require("../../core/src/api").submitAction, options.randomInt || defaultRandomInt);
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
  createDefaultInvestigator,
  ensureConversationSession,
  ensureActorForUser,
  formatStateSummary,
  formatTurnReply,
  formatStartReply,
  formatHelpReply,
  formatSettlementReply,
  handleOneBotMessage,
  rebuildConversationSession
};
