const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const {
  handleOneBotEnvelope,
  buildOneBotSendAction,
  stripCqTags,
  normalizeOneBotEvent
} = require("./runtime");

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

test("builds group send action for group envelope", () => {
  const action = buildOneBotSendAction(makeEnvelope("hi"), "hello");
  assert.equal(action.action, "send_group_msg");
  assert.equal(action.params.group_id, 95270001);
  assert.equal(action.params.message, "hello");
});

test("builds private send action for private envelope", () => {
  const action = buildOneBotSendAction({ post_type: "message", message_type: "private", user_id: 123 }, "hello");
  assert.equal(action.action, "send_private_msg");
  assert.equal(action.params.user_id, 123);
});

test("strips cq tags from incoming message", () => {
  assert.equal(stripCqTags("[CQ:at,qq=123] 我借着手电去看祭坛背后的刮痕 [CQ:image,file=1.jpg]"), "我借着手电去看祭坛背后的刮痕");
  assert.equal(normalizeOneBotEvent(makeEnvelope("[CQ:at,qq=123] /aikp state")).message, "/aikp state");
});

test("ignores non-message post types", () => {
  const result = handleOneBotEnvelope({ post_type: "notice", notice_type: "group_upload" });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "unsupported_post_type");
  assert.equal(result.sendAction, null);
});

test("ignores self messages", () => {
  const result = handleOneBotEnvelope(makeEnvelope("hello", { self_id: 281894872 }));
  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "self_message");
});

test("ignores unrelated group messages before kp session is active", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const result = handleOneBotEnvelope(makeEnvelope("今天天气不错"), { storageRoot });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "not_addressed");
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural activation intent can enter kp flow without command prefix", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const result = handleOneBotEnvelope(makeAtEnvelope("我想一次全车完卡，角色选记者"), { storageRoot });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, false);
  assert.equal(result.routing.reason, "activation_intent");
  assert.match(result.replyText, /传统随机车卡/);
  assert.equal(typeof result.contextRef, "string");
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural start intent now prompts story pack selection before scene intro", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const result = handleOneBotEnvelope(makeAtEnvelope("我想跑团"), { storageRoot });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, false);
  assert.equal(result.routing.reason, "activation_intent");
  assert.match(result.replyText, /先别急着进场/);
  assert.match(result.replyText, /当前可选剧本/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("group whitelist blocks non-whitelisted groups", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const result = handleOneBotEnvelope(makeAtEnvelope("/aikp roll journalist", { group_id: 12345 }), {
    storageRoot,
    groupWhitelist: [95270001]
  });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "group_not_whitelisted");
  rmSync(storageRoot, { recursive: true, force: true });
});

test("active group session ignores chatter without bot mention", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  handleOneBotEnvelope(makeAtEnvelope("/aikp pack old-church-arc-pack"), { storageRoot });
  handleOneBotEnvelope(makeAtEnvelope("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });

  const result = handleOneBotEnvelope(makeEnvelope("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "not_addressed");

  rmSync(storageRoot, { recursive: true, force: true });
});

test("handles onebot envelope through single-session runtime", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const roll = handleOneBotEnvelope(makeAtEnvelope("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(roll.ok, true);
  assert.match(roll.replyText, /传统随机车卡/);

  const pack = handleOneBotEnvelope(makeAtEnvelope("/aikp pack old-church-arc-pack"), { storageRoot });
  assert.equal(pack.ok, true);
  assert.match(pack.replyText, /旧教堂异响/);

  const turn = handleOneBotEnvelope(makeAtEnvelope("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(turn.ok, true);
  assert.equal(turn.sendAction.action, "send_group_msg");
  assert.match(turn.replyText, /Spot Hidden/);
  assert.equal(turn.action.kind, "explore");
  assert.equal(typeof turn.contextRef, "string");
  rmSync(storageRoot, { recursive: true, force: true });
});

test("pending resume choice keeps follow-up group reply inside ai-kp runtime", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));

  handleOneBotEnvelope(makeAtEnvelope("/aikp pack old-church-arc-pack"), { storageRoot });
  handleOneBotEnvelope(makeAtEnvelope("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotEnvelope(makeAtEnvelope("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotEnvelope(makeAtEnvelope("先不跑了"), { storageRoot });

  const prompt = handleOneBotEnvelope(makeAtEnvelope("我想跑团"), { storageRoot });
  assert.equal(prompt.ok, true);
  assert.equal(prompt.ignored, false);
  assert.match(prompt.replyText, /续上/);
  assert.match(prompt.replyText, /新开/);

  const resume = handleOneBotEnvelope(makeAtEnvelope("续上"), { storageRoot });
  assert.equal(resume.ok, true);
  assert.equal(resume.ignored, false);
  assert.match(resume.replyText, /沿着这条继续|接回来了/);

  rmSync(storageRoot, { recursive: true, force: true });
});
