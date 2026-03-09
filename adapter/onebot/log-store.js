const { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("fs");
const { basename, join } = require("path");

const DEFAULT_SUMMARY_EVENT_THRESHOLD = 12;
const DEFAULT_SUMMARY_CHAR_THRESHOLD = 2400;

function ensureLogDirs(layout) {
  mkdirSync(layout.logsConversationDir, { recursive: true });
  mkdirSync(layout.chatLogDir, { recursive: true });
  mkdirSync(layout.ledgerLogDir, { recursive: true });
  mkdirSync(layout.playerLogDir, { recursive: true });
  mkdirSync(layout.stateDir, { recursive: true });
  mkdirSync(layout.summaryDir, { recursive: true });
  mkdirSync(layout.contextDir, { recursive: true });
}

function appendJsonLine(filePath, payload) {
  appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function safeReadJsonLines(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8").trim();
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function ensureSummaryState(meta) {
  meta.summaryState = meta.summaryState || {
    nextChunkIndex: 1,
    rolledUpChatCount: 0,
    latestSummaryFile: null,
    lastGeneratedAt: null
  };
  if (meta.summaryState.nextChunkIndex == null) meta.summaryState.nextChunkIndex = 1;
  if (meta.summaryState.rolledUpChatCount == null) meta.summaryState.rolledUpChatCount = 0;
  return meta.summaryState;
}

function appendChatLog(layout, payload) {
  ensureLogDirs(layout);
  appendJsonLine(layout.chatLogFile, payload);
}

function appendOperationLog(layout, payload) {
  ensureLogDirs(layout);
  appendJsonLine(layout.ledgerLogFile, payload);
}

function writeStateSnapshot(layout, payload) {
  ensureLogDirs(layout);
  writeFileSync(layout.stateFile, JSON.stringify(payload, null, 2), "utf8");
}

function writeContextSnapshot(layout, payload) {
  ensureLogDirs(layout);
  writeFileSync(layout.contextFile, JSON.stringify(payload, null, 2), "utf8");
}

function buildPlayerLogFile(layout, playerKey) {
  return join(layout.playerLogDir, `${playerKey}.jsonl`);
}

function appendPlayerOperationLogs(layout, payloads = []) {
  ensureLogDirs(layout);
  const grouped = new Map();

  for (const payload of payloads) {
    const playerKey = payload.userId
      ? `user-${String(payload.userId)}`
      : payload.actorId
        ? `actor-${String(payload.actorId)}`
        : null;
    if (!playerKey) continue;
    if (!grouped.has(playerKey)) grouped.set(playerKey, []);
    grouped.get(playerKey).push(payload);
  }

  for (const [playerKey, events] of grouped.entries()) {
    const filePath = buildPlayerLogFile(layout, playerKey);
    for (const event of events) {
      appendJsonLine(filePath, event);
    }
  }
}

function formatChatSummaryLine(event) {
  const speaker = event.direction === "outbound"
    ? "KP"
    : event.senderName || event.userName || event.userId || "玩家";
  const message = String(event.message || "").replace(/\s+/g, " ").trim();
  return `- ${speaker}：${message}`;
}

function formatLedgerSummaryLine(event) {
  const summary = String(event.summary || event.kind || "").trim();
  return summary ? `- ${summary}` : null;
}

function buildSummaryMarkdown(chunkIndex, chatEvents, ledgerEvents, stateSnapshot, meta) {
  const participants = new Set();
  for (const event of chatEvents) {
    if (event.direction === "inbound") {
      participants.add(event.senderName || event.userName || event.userId || "玩家");
    }
  }

  const lines = [
    `# AI-KP Summary ${String(chunkIndex).padStart(4, "0")}`,
    "",
    `- 会话：${meta.conversationKey || "unknown"}`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 汇总消息数：${chatEvents.length}`,
    `- 参与者：${participants.size ? Array.from(participants).join("、") : "暂无"}`,
    ""
  ];

  const stateLines = [];
  if (stateSnapshot?.scene?.summary) stateLines.push(`场景：${stateSnapshot.scene.summary}`);
  if (stateSnapshot?.scene?.location) stateLines.push(`地点：${stateSnapshot.scene.location}`);
  if (stateSnapshot?.turnState?.round != null) stateLines.push(`轮次：第 ${stateSnapshot.turnState.round} 轮`);
  if (stateSnapshot?.turnState?.currentActorName) stateLines.push(`当前聚焦：${stateSnapshot.turnState.currentActorName}`);
  if (Array.isArray(stateSnapshot?.revealedClues) && stateSnapshot.revealedClues.length) {
    stateLines.push(`明线索：${stateSnapshot.revealedClues.join("、")}`);
  }
  if (stateLines.length) {
    lines.push("## 状态摘要");
    lines.push(...stateLines.map((line) => `- ${line}`));
    lines.push("");
  }

  lines.push("## 对话摘录");
  lines.push(...chatEvents.slice(-10).map(formatChatSummaryLine));
  lines.push("");

  const ledgerSummaryLines = ledgerEvents
    .slice(-10)
    .map(formatLedgerSummaryLine)
    .filter(Boolean);
  if (ledgerSummaryLines.length) {
    lines.push("## 操作账本摘录");
    lines.push(...ledgerSummaryLines);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function readSummaryChunks(layout, limit = 2) {
  ensureLogDirs(layout);
  if (!existsSync(layout.summaryDir)) return [];
  const fileNames = readdirSync(layout.summaryDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .slice(-Math.max(0, limit));

  return fileNames.map((fileName) => ({
    fileName,
    text: readFileSync(join(layout.summaryDir, fileName), "utf8")
  }));
}

function formatRecentChatLines(chatEvents = []) {
  return chatEvents.map((event) => formatChatSummaryLine(event));
}

function formatRecentLedgerLines(ledgerEvents = []) {
  return ledgerEvents
    .map((event) => formatLedgerSummaryLine(event))
    .filter(Boolean);
}

function buildInjectionText(packet) {
  const lines = [
    "[AI-KP Runtime Prompt]",
    packet.runtimePrompt || "",
    "",
    "[Session State]",
    `- 会话：${packet.conversationKey}`,
    `- 模式：${packet.sessionMode}`,
    `- Profile：${packet.runtimeProfileId}`,
    `- 场景：${packet.state.scene?.summary || "unknown"}`,
    `- 地点：${packet.state.scene?.location || "unknown"}`,
    `- 当前聚焦：${packet.state.turnState?.currentActorName || "未指定"}`,
    `- 轮次：第 ${packet.state.turnState?.round ?? 1} 轮`,
    `- 明线索：${Array.isArray(packet.state.revealedClues) && packet.state.revealedClues.length ? packet.state.revealedClues.join("、") : "暂无"}`,
    ""
  ];

  if (packet.state.pendingInvestigatorDraft?.stage) {
    lines.push(
      `[Pending Chargen]`,
      `- 阶段：${packet.state.pendingInvestigatorDraft.stage}`,
      `- 职业：${packet.state.pendingInvestigatorDraft.occupationName || packet.state.pendingInvestigatorDraft.occupationKey || "未定"}`,
      ""
    );
  }

  if (packet.summaryChunks.length) {
    lines.push("[Summary Chunks]");
    for (const chunk of packet.summaryChunks) {
      lines.push(`## ${chunk.fileName}`);
      lines.push(chunk.text.trim());
    }
    lines.push("");
  }

  if (packet.recentChatLines.length) {
    lines.push("[Recent Chat]");
    lines.push(...packet.recentChatLines);
    lines.push("");
  }

  if (packet.recentOperationLines.length) {
    lines.push("[Recent Operations]");
    lines.push(...packet.recentOperationLines);
    lines.push("");
  }

  lines.push("[Raw Log Paths]");
  lines.push(`- chat: ${packet.logPaths.chat}`);
  lines.push(`- ledger: ${packet.logPaths.ledger}`);
  lines.push(`- players: ${packet.logPaths.players}`);
  lines.push(`- state: ${packet.logPaths.state}`);
  lines.push(`- summaries: ${packet.logPaths.summaries}`);

  return `${lines.join("\n").trim()}\n`;
}

function buildContextPacket(layout, meta, stateSnapshot, options = {}) {
  ensureLogDirs(layout);
  const recentChat = safeReadJsonLines(layout.chatLogFile).slice(-(Number(options.recentChatLimit || 12)));
  const recentOperations = safeReadJsonLines(layout.ledgerLogFile).slice(-(Number(options.recentOperationLimit || 12)));
  const summaryChunks = readSummaryChunks(layout, Number(options.summaryChunkLimit || 2));
  const packet = {
    updatedAt: new Date().toISOString(),
    conversationKey: meta.conversationKey || layout.conversationKey,
    sessionMode: meta.sessionMode || "idle",
    runtimeProfileId: meta.runtimeProfileId || "maimai-kp-v1",
    runtimePrompt: options.runtimePrompt || "",
    state: {
      scene: stateSnapshot.scene,
      turnState: stateSnapshot.turnState,
      revealedClues: stateSnapshot.revealedClues,
      investigators: stateSnapshot.investigators,
      pendingInvestigatorDraft: stateSnapshot.pendingInvestigatorDraft || null
    },
    summaryState: stateSnapshot.summaryState || meta.summaryState || {},
    summaryChunks,
    recentChat,
    recentOperations,
    recentChatLines: formatRecentChatLines(recentChat),
    recentOperationLines: formatRecentLedgerLines(recentOperations),
    logPaths: {
      chat: layout.chatLogFile,
      ledger: layout.ledgerLogFile,
      players: layout.playerLogDir,
      state: layout.stateFile,
      summaries: layout.summaryDir
    }
  };
  packet.injectionText = buildInjectionText(packet);
  return packet;
}

function maybeRollupSummaries(layout, meta, stateSnapshot, options = {}) {
  ensureLogDirs(layout);
  const summaryState = ensureSummaryState(meta);
  const chatEvents = safeReadJsonLines(layout.chatLogFile);
  const pendingChatEvents = chatEvents.slice(summaryState.rolledUpChatCount);
  const pendingCharCount = pendingChatEvents.reduce((total, event) => total + String(event.message || "").length, 0);
  const eventThreshold = Number(options.summaryEventThreshold || DEFAULT_SUMMARY_EVENT_THRESHOLD);
  const charThreshold = Number(options.summaryCharThreshold || DEFAULT_SUMMARY_CHAR_THRESHOLD);

  if (!pendingChatEvents.length) return null;
  if (pendingChatEvents.length < eventThreshold && pendingCharCount < charThreshold) return null;

  const chunkIndex = summaryState.nextChunkIndex;
  const chunkName = `summary-${String(chunkIndex).padStart(4, "0")}.md`;
  const chunkPath = join(layout.summaryDir, chunkName);
  const ledgerEvents = safeReadJsonLines(layout.ledgerLogFile);
  const markdown = buildSummaryMarkdown(chunkIndex, pendingChatEvents, ledgerEvents, stateSnapshot, meta);

  writeFileSync(chunkPath, markdown, "utf8");
  summaryState.nextChunkIndex += 1;
  summaryState.rolledUpChatCount = chatEvents.length;
  summaryState.latestSummaryFile = basename(chunkPath);
  summaryState.lastGeneratedAt = new Date().toISOString();

  return {
    chunkPath,
    chunkName,
    pendingChatCount: pendingChatEvents.length
  };
}

module.exports = {
  DEFAULT_SUMMARY_EVENT_THRESHOLD,
  DEFAULT_SUMMARY_CHAR_THRESHOLD,
  ensureLogDirs,
  ensureSummaryState,
  appendChatLog,
  appendOperationLog,
  appendPlayerOperationLogs,
  writeStateSnapshot,
  writeContextSnapshot,
  buildContextPacket,
  maybeRollupSummaries,
  readSummaryChunks,
  safeReadJsonLines
};
