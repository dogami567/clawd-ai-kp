const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { existsSync, mkdtempSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { createOneBotHttpBridge } = require("./http-bridge");

const BOT_ID = 114514;

function makeEnvelope(message, overrides = {}) {
  return {
    post_type: "message",
    message_type: "group",
    user_id: 281894872,
    group_id: 95270001,
    raw_message: message,
    sender: { nickname: "dogami" },
    ...overrides
  };
}

function makeAtEnvelope(message, overrides = {}) {
  return makeEnvelope(`[CQ:at,qq=${BOT_ID}] ${message}`, overrides);
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, resolve));
  return server.address().port;
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  });
}

test("http bridge health endpoint responds", async () => {
  const server = createOneBotHttpBridge();
  try {
    const port = await listen(server);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
  } finally {
    await closeServer(server);
  }
});

test("http bridge returns onebot send action from event", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const server = createOneBotHttpBridge({ storageRoot });
  try {
    const port = await listen(server);

    await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("/aikp pack old-church-arc-pack"))
    });

    await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("/aikp roll journalist"))
    });

    const response = await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("我借着手电去看祭坛背后的刮痕"))
    });
    const json = await response.json();

    assert.equal(json.ok, true);
    assert.equal(json.result.ok, true);
    assert.equal(json.result.sendAction.action, "send_group_msg");
    assert.match(json.result.replyText, /Spot Hidden/);
    assert.equal(typeof json.result.contextRef, "string");
    assert.equal(existsSync(json.result.contextRef), true);
  } finally {
    await closeServer(server);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("http bridge exposes stored session context", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const server = createOneBotHttpBridge({ storageRoot });
  try {
    const port = await listen(server);

    const rollResponse = await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...makeAtEnvelope("给我快速车卡，职业医生"), includeContextPacket: true })
    });
    const rollJson = await rollResponse.json();
    const contextResponse = await fetch(`http://127.0.0.1:${port}/onebot/session-context?conversationKey=onebot-group-95270001`);
    const contextJson = await contextResponse.json();

    assert.equal(rollJson.result.ok, true);
    assert.equal(typeof rollJson.result.contextRef, "string");
    assert.equal(rollJson.result.contextPacket.runtimeProfileId, "maimai-kp-v1");
    assert.equal(contextJson.ok, true);
    assert.equal(contextJson.context.conversationKey, "onebot-group-95270001");
    assert.match(contextJson.context.injectionText, /AI-KP Runtime Prompt/);
    assert.match(contextJson.context.injectionText, /给我快速车卡，职业医生/);
  } finally {
    await closeServer(server);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("http bridge can auto-dispatch action to onebot api", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  let dispatched = null;
  const apiServer = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    dispatched = {
      url: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  const apiPort = await listen(apiServer);

  const bridge = createOneBotHttpBridge({
    storageRoot,
    autoSendActions: true,
    apiBaseUrl: `http://127.0.0.1:${apiPort}`
  });
  try {
    const bridgePort = await listen(bridge);

    await fetch(`http://127.0.0.1:${bridgePort}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("/aikp pack old-church-arc-pack"))
    });

    await fetch(`http://127.0.0.1:${bridgePort}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("/aikp roll journalist"))
    });

    const response = await fetch(`http://127.0.0.1:${bridgePort}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAtEnvelope("我借着手电去看祭坛背后的刮痕"))
    });
    const json = await response.json();

    assert.equal(json.ok, true);
    assert.equal(json.dispatchResult.ok, true);
    assert.equal(dispatched.url, "/send_group_msg");
    assert.equal(typeof dispatched.body.message, "string");
  } finally {
    await closeServer(bridge);
    await closeServer(apiServer);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("http bridge ignores non-message envelopes without dispatching", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const bridge = createOneBotHttpBridge({ storageRoot, autoSendActions: true, apiBaseUrl: 'http://127.0.0.1:9' });
  try {
    const port = await listen(bridge);
    const response = await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ post_type: 'notice', notice_type: 'group_upload' })
    });
    const json = await response.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.ignored, true);
    assert.equal(json.dispatchResult, null);
  } finally {
    await closeServer(bridge);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("http bridge ignores inactive group chatter before activation", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const bridge = createOneBotHttpBridge({ storageRoot });
  try {
    const port = await listen(bridge);
    const response = await fetch(`http://127.0.0.1:${port}/onebot/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeEnvelope("今天先随便聊聊"))
    });
    const json = await response.json();
    assert.equal(json.ok, true);
    assert.equal(json.result.ignored, true);
    assert.equal(json.result.reason, "not_addressed");
  } finally {
    await closeServer(bridge);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test("http bridge can preview and save imported markdown scene", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const bridge = createOneBotHttpBridge({ storageRoot });
  try {
    const port = await listen(bridge);
    const markdown = `# Scene Spec\nid: imported-scene\ntitle: 导入场景\nsummary: 导入场景摘要\nlocation: 测试地点\nsceneType: investigation\n\n## Opening\n这里是导入场景开场。\n`;

    const previewResponse = await fetch(`http://127.0.0.1:${port}/authoring/import/scene`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown })
    });
    const preview = await previewResponse.json();
    assert.equal(preview.ok, true);
    assert.equal(preview.mode, "preview");
    assert.equal(preview.template.id, "imported-scene");

    const saveResponse = await fetch(`http://127.0.0.1:${port}/authoring/import/scene`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown, save: true })
    });
    const saved = await saveResponse.json();
    assert.equal(saved.ok, true);
    assert.equal(saved.mode, "save");
    assert.match(saved.saveResult.filePath, /imported-scene\.scene\.json$/);
  } finally {
    await closeServer(bridge);
    rmSync(storageRoot, { recursive: true, force: true });
  }
});
