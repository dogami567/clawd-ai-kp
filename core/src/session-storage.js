const { mkdirSync, readFileSync, writeFileSync } = require("fs");
const { dirname } = require("path");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSessionSnapshot(sessionState, meta = {}) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sessionId: sessionState?.sessionId || null,
    sceneId: sessionState?.scene?.sceneId || null,
    meta: cloneJson(meta),
    sessionState: cloneJson(sessionState)
  };
}

function serializeSessionSnapshot(sessionState, meta = {}, pretty = true) {
  return JSON.stringify(createSessionSnapshot(sessionState, meta), null, pretty ? 2 : 0);
}

function parseSessionSnapshot(serialized) {
  const parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  if (parsed && parsed.sessionState) {
    return parsed;
  }
  return createSessionSnapshot(parsed || {}, {});
}

function saveSessionState(filePath, sessionState, options = {}) {
  mkdirSync(dirname(filePath), { recursive: true });
  const serialized = serializeSessionSnapshot(sessionState, options.meta || {}, options.pretty !== false);
  writeFileSync(filePath, serialized, "utf8");
  return {
    ok: true,
    filePath,
    bytesWritten: Buffer.byteLength(serialized, "utf8")
  };
}

function loadSessionSnapshot(filePath) {
  return parseSessionSnapshot(readFileSync(filePath, "utf8"));
}

function loadSessionState(filePath) {
  return loadSessionSnapshot(filePath).sessionState;
}

module.exports = {
  createSessionSnapshot,
  serializeSessionSnapshot,
  parseSessionSnapshot,
  saveSessionState,
  loadSessionSnapshot,
  loadSessionState
};
