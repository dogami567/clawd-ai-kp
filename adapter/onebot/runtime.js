const { stdin, stdout } = require("process");
const { handleOneBotMessage } = require("./single-session");

function isOneBotMessageEvent(envelope = {}) {
  return envelope && envelope.post_type === "message";
}

function normalizeOneBotEvent(envelope = {}) {
  if (!isOneBotMessageEvent(envelope)) {
    throw new Error("Unsupported OneBot envelope: only post_type=message is supported");
  }

  return {
    user_id: envelope.user_id,
    group_id: envelope.message_type === "group" ? envelope.group_id : undefined,
    message: envelope.raw_message ?? envelope.message ?? "",
    raw_message: envelope.raw_message ?? envelope.message ?? "",
    sender: envelope.sender || {},
    message_id: envelope.message_id,
    self_id: envelope.self_id,
    message_type: envelope.message_type
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

function handleOneBotEnvelope(envelope, options = {}) {
  const normalized = normalizeOneBotEvent(envelope);
  const result = handleOneBotMessage(normalized, options);
  return {
    ok: result.ok,
    reason: result.reason || null,
    replyText: result.reply,
    sendAction: buildOneBotSendAction(envelope, result.reply),
    sessionState: result.sessionState,
    action: result.action || null
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
  normalizeOneBotEvent,
  buildOneBotSendAction,
  handleOneBotEnvelope
};
