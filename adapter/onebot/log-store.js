const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const { basename, join } = require("path");

const DEFAULT_SUMMARY_EVENT_THRESHOLD = 12;
const DEFAULT_SUMMARY_CHAR_THRESHOLD = 2400;

function ensureLogDirs(layout) {
  mkdirSync(layout.logsConversationDir, { recursive: true });
  mkdirSync(layout.chatLogDir, { recursive: true });
  mkdirSync(layout.ledgerLogDir, { recursive: true });
  mkdirSync(layout.stateDir, { recursive: true });
  mkdirSync(layout.summaryDir, { recursive: true });
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
  writeStateSnapshot,
  maybeRollupSummaries,
  safeReadJsonLines
};
