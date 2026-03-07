const http = require("http");
const { URL } = require("url");
const { handleOneBotEnvelope } = require("./runtime");

function buildJsonHeaders(statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  };
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${payload}\n`);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("Expected JSON body");
  return JSON.parse(text);
}

function buildActionUrl(apiBaseUrl, actionName) {
  const base = String(apiBaseUrl || "").replace(/\/$/, "");
  return `${base}/${actionName}`;
}

async function dispatchOneBotAction(apiBaseUrl, sendAction) {
  if (!apiBaseUrl) {
    return { ok: false, skipped: true, reason: "missing_api_base_url" };
  }

  const response = await fetch(buildActionUrl(apiBaseUrl, sendAction.action), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sendAction.params || {})
  });

  const rawText = await response.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed || rawText
  };
}

function createOneBotHttpBridge(options = {}) {
  const eventPath = options.eventPath || "/onebot/event";
  const healthPath = options.healthPath || "/health";
  const autoSendActions = options.autoSendActions === true;
  const storageRoot = options.storageRoot;
  const apiBaseUrl = options.apiBaseUrl;

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === healthPath) {
        return sendJson(response, 200, { ok: true, service: "aikp-onebot-http-bridge" });
      }

      if (request.method === "POST" && url.pathname === eventPath) {
        const envelope = await readRequestJson(request);
        const result = handleOneBotEnvelope(envelope, { storageRoot });
        let dispatchResult = null;

        if (autoSendActions) {
          dispatchResult = await dispatchOneBotAction(apiBaseUrl, result.sendAction);
        }

        return sendJson(response, 200, {
          ok: true,
          result,
          dispatchResult
        });
      }

      return sendJson(response, 404, { ok: false, error: "not_found" });
    } catch (error) {
      return sendJson(response, 500, {
        ok: false,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  return server;
}

async function startBridge(options = {}) {
  const port = Number(options.port || process.env.AIKP_ONEBOT_PORT || 8787);
  const server = createOneBotHttpBridge(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  return server;
}

if (require.main === module) {
  startBridge({
    port: process.env.AIKP_ONEBOT_PORT || 8787,
    eventPath: process.env.AIKP_ONEBOT_EVENT_PATH || "/onebot/event",
    healthPath: process.env.AIKP_ONEBOT_HEALTH_PATH || "/health",
    storageRoot: process.env.AIKP_STORAGE_ROOT,
    autoSendActions: process.env.AIKP_ONEBOT_AUTO_SEND === "true",
    apiBaseUrl: process.env.AIKP_ONEBOT_API_BASE_URL
  }).then((server) => {
    const address = server.address();
    process.stdout.write(`AIKP OneBot HTTP bridge listening on ${typeof address === "object" ? address.port : address}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  createOneBotHttpBridge,
  startBridge,
  dispatchOneBotAction,
  buildActionUrl,
  readRequestJson
};
