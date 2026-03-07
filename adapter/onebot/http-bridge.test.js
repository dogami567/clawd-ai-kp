const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { mkdtempSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { createOneBotHttpBridge } = require("./http-bridge");

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

async function listen(server) {
  await new Promise((resolve) => server.listen(0, resolve));
  return server.address().port;
}

test("http bridge health endpoint responds", async () => {
  const server = createOneBotHttpBridge();
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  server.close();
});

test("http bridge returns onebot send action from event", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const server = createOneBotHttpBridge({ storageRoot });
  const port = await listen(server);

  await fetch(`http://127.0.0.1:${port}/onebot/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeEnvelope("/aikp roll journalist"))
  });

  const response = await fetch(`http://127.0.0.1:${port}/onebot/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeEnvelope("我借着手电去看祭坛背后的刮痕"))
  });
  const json = await response.json();

  assert.equal(json.ok, true);
  assert.equal(json.result.ok, true);
  assert.equal(json.result.sendAction.action, "send_group_msg");
  assert.match(json.result.replyText, /Spot Hidden/);

  server.close();
  rmSync(storageRoot, { recursive: true, force: true });
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
  const bridgePort = await listen(bridge);

  await fetch(`http://127.0.0.1:${bridgePort}/onebot/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeEnvelope("/aikp roll journalist"))
  });

  const response = await fetch(`http://127.0.0.1:${bridgePort}/onebot/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeEnvelope("我借着手电去看祭坛背后的刮痕"))
  });
  const json = await response.json();

  assert.equal(json.ok, true);
  assert.equal(json.dispatchResult.ok, true);
  assert.equal(dispatched.url, "/send_group_msg");
  assert.equal(typeof dispatched.body.message, "string");

  bridge.close();
  apiServer.close();
  rmSync(storageRoot, { recursive: true, force: true });
});

test("http bridge can preview and save imported markdown scene", async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-http-bridge-"));
  const bridge = createOneBotHttpBridge({ storageRoot });
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

  bridge.close();
  rmSync(storageRoot, { recursive: true, force: true });
});
