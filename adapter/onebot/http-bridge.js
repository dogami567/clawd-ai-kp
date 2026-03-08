const http = require("http");
const { existsSync, readFileSync } = require("fs");
const { URL } = require("url");
const { handleOneBotEnvelope } = require("./runtime");
const {
  buildConversationKey,
  buildStorageLayout,
  buildStorageLayoutFromConversationKey
} = require("./single-session");
const {
  importSceneMarkdown,
  importCampaignMarkdown,
  importStoryPackMarkdown,
  saveSceneTemplate,
  saveCampaignTemplate,
  saveStoryPackTemplate
} = require("../../core/src/index");

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

function getRequestMode(body = {}) {
  return body.save === true ? "save" : "preview";
}

function importAuthoringMarkdown(kind, markdown) {
  if (kind === "scene") return importSceneMarkdown(markdown);
  if (kind === "campaign") return importCampaignMarkdown(markdown);
  if (kind === "story-pack") return importStoryPackMarkdown(markdown);
  throw new Error(`Unsupported import kind: ${kind}`);
}

function saveAuthoringTemplate(kind, template) {
  if (kind === "scene") return saveSceneTemplate(template);
  if (kind === "campaign") return saveCampaignTemplate(template);
  if (kind === "story-pack") return saveStoryPackTemplate(template);
  throw new Error(`Unsupported save kind: ${kind}`);
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

  function loadContextPayload(requestUrl) {
    const conversationKey = requestUrl.searchParams.get("conversationKey");
    if (!conversationKey) {
      return { ok: false, error: "missing_conversation_key" };
    }
    const layout = buildStorageLayoutFromConversationKey(storageRoot, conversationKey);
    if (!existsSync(layout.contextFile)) {
      return { ok: false, error: "context_not_found", conversationKey, contextFile: layout.contextFile };
    }
    return {
      ok: true,
      conversationKey,
      contextFile: layout.contextFile,
      context: JSON.parse(readFileSync(layout.contextFile, "utf8"))
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === healthPath) {
        return sendJson(response, 200, { ok: true, service: "aikp-onebot-http-bridge" });
      }

      if (request.method === "GET" && url.pathname === "/onebot/session-context") {
        const payload = loadContextPayload(url);
        return sendJson(response, payload.ok ? 200 : 404, payload);
      }

      if (request.method === "POST" && url.pathname === eventPath) {
        const envelope = await readRequestJson(request);
        const result = handleOneBotEnvelope(envelope, {
          storageRoot,
          includeContextPacket: envelope.includeContextPacket === true,
          groupWhitelist: Array.isArray(options.groupWhitelist) ? options.groupWhitelist : undefined,
          allowDirectMessages: options.allowDirectMessages,
          allowNaturalActivation: options.allowNaturalActivation
        });
        let dispatchResult = null;

        if (autoSendActions && result.sendAction) {
          dispatchResult = await dispatchOneBotAction(apiBaseUrl, result.sendAction);
        }

        return sendJson(response, 200, {
          ok: true,
          result,
          dispatchResult
        });
      }

      if (request.method === "POST" && url.pathname === "/onebot/session-context") {
        const body = await readRequestJson(request);
        const conversationKey = body.conversationKey
          || (body.event ? buildConversationKey(body.event) : null);
        if (!conversationKey) {
          return sendJson(response, 400, { ok: false, error: "missing_conversation_key" });
        }
        const layout = buildStorageLayoutFromConversationKey(storageRoot, conversationKey);
        if (!existsSync(layout.contextFile)) {
          return sendJson(response, 404, {
            ok: false,
            error: "context_not_found",
            conversationKey,
            contextFile: layout.contextFile
          });
        }
        return sendJson(response, 200, {
          ok: true,
          conversationKey,
          contextFile: layout.contextFile,
          context: JSON.parse(readFileSync(layout.contextFile, "utf8"))
        });
      }

      if (request.method === "POST" && url.pathname.startsWith("/authoring/import/")) {
        const kind = url.pathname.replace("/authoring/import/", "");
        const body = await readRequestJson(request);
        const template = importAuthoringMarkdown(kind, body.markdown || "");
        const mode = getRequestMode(body);
        const saveResult = mode === "save" ? saveAuthoringTemplate(kind, template) : null;
        return sendJson(response, 200, {
          ok: true,
          kind,
          mode,
          template,
          saveResult
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
    apiBaseUrl: process.env.AIKP_ONEBOT_API_BASE_URL,
    groupWhitelist: process.env.AIKP_ONEBOT_GROUP_WHITELIST
      ? process.env.AIKP_ONEBOT_GROUP_WHITELIST.split(",").map((item) => item.trim()).filter(Boolean)
      : undefined,
    allowDirectMessages: process.env.AIKP_ONEBOT_ALLOW_DMS !== "false",
    allowNaturalActivation: process.env.AIKP_ONEBOT_ALLOW_NATURAL_ACTIVATION !== "false"
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
