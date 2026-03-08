const { stdin, stdout } = require("process");
const {
  handleOneBotMessage,
  shouldHandleOneBotMessage,
  getConversationRuntimeState
} = require("./single-session");

function isOneBotMessageEvent(envelope = {}) {
  return envelope && envelope.post_type === "message";
}

function stripCqTags(text = "") {
  return String(text)
    .replace(/\[CQ:at,[^\]]*qq=\d+[^\]]*\]/g, " ")
    .replace(/\[CQ:[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAtMentions(text = "") {
  return [...String(text).matchAll(/\[CQ:at,[^\]]*qq=(\d+)[^\]]*\]/g)].map((match) => match[1]);
}

function isAddressedToBot(envelope = {}, options = {}) {
  if (envelope.message_type !== "group") return true;
  if (options.requireGroupMention === false) return true;

  const mentions = extractAtMentions(envelope.raw_message ?? envelope.message ?? "");
  if (!mentions.length) return false;

  const candidateIds = [
    envelope.self_id,
    options.onebotSelfId,
    ...(Array.isArray(options.onebotSelfIds) ? options.onebotSelfIds : [])
  ]
    .filter((value) => value != null)
    .map((value) => String(value));

  if (!candidateIds.length) {
    return true;
  }

  const idSet = new Set(candidateIds);
  return mentions.some((mention) => idSet.has(String(mention)));
}

function isSelfMessage(envelope = {}) {
  const senderId = envelope.user_id ?? envelope.sender?.user_id;
  return senderId != null && envelope.self_id != null && String(senderId) === String(envelope.self_id);
}

function normalizeOneBotEvent(envelope = {}, options = {}) {
  if (!isOneBotMessageEvent(envelope)) {
    return null;
  }

  const cleanedMessage = stripCqTags(envelope.raw_message ?? envelope.message ?? "");
  return {
    user_id: envelope.user_id,
    group_id: envelope.message_type === "group" ? envelope.group_id : undefined,
    message: cleanedMessage,
    raw_message: envelope.raw_message ?? envelope.message ?? "",
    sender: envelope.sender || {},
    message_id: envelope.message_id,
    self_id: envelope.self_id,
    message_type: envelope.message_type,
    mentionedSelf: isAddressedToBot(envelope, options)
  };
}

function buildOneBotSendAction(envelope = {}, replyText = "") {
  if (envelope.message_type === "group") {
    return {
      action: "send_group_msg",
      params: {
        group_id: envelope.group_id,
        message: replyText
      }
    };
  }

  return {
    action: "send_private_msg",
    params: {
      user_id: envelope.user_id,
      message: replyText
    }
  };
}

function buildIgnoredResult(reason, envelope = {}, extras = {}) {
  return {
    ok: true,
    ignored: true,
    reason,
    replyText: null,
    sendAction: null,
    sessionState: null,
    action: null,
    contextRef: extras.contextRef || null,
    contextPacket: extras.contextPacket || null,
    routing: extras.routing || null,
    envelopeType: envelope.post_type || null
  };
}

function handleOneBotEnvelope(envelope, options = {}) {
  if (!isOneBotMessageEvent(envelope)) {
    return buildIgnoredResult("unsupported_post_type", envelope);
  }

  if (isSelfMessage(envelope)) {
    return buildIgnoredResult("self_message", envelope);
  }

  const normalized = normalizeOneBotEvent(envelope, options);
  if (!normalized || !normalized.message) {
    return buildIgnoredResult("empty_message", envelope);
  }

  const routing = shouldHandleOneBotMessage(normalized, options);
  if (!routing.handle) {
    const runtimeState = getConversationRuntimeState(normalized, options);
    return buildIgnoredResult(routing.reason, envelope, {
      routing,
      contextRef: runtimeState.contextRef
    });
  }

  const result = handleOneBotMessage(normalized, options);
  return {
    ok: result.ok,
    ignored: false,
    reason: result.reason || null,
    replyText: result.reply,
    sendAction: result.reply ? buildOneBotSendAction(envelope, result.reply) : null,
    sessionState: result.sessionState,
    action: result.action || null,
    contextRef: result.contextRef || null,
    contextPacket: result.contextPacket || null,
    routing
  };
}

async function readStdinText() {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => chunks.push(chunk));
    stdin.on("end", () => resolve(chunks.join("")));
    stdin.on("error", reject);
  });
}

async function main() {
  const input = await readStdinText();
  if (!input.trim()) {
    throw new Error("Expected OneBot event JSON on stdin");
  }
  const envelope = JSON.parse(input);
  const result = handleOneBotEnvelope(envelope);
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  isOneBotMessageEvent,
  stripCqTags,
  isSelfMessage,
  normalizeOneBotEvent,
  buildOneBotSendAction,
  buildIgnoredResult,
  handleOneBotEnvelope
};
