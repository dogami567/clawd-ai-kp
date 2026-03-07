const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { handleOneBotEnvelope, buildOneBotSendAction } = require("./runtime");

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

test("handles onebot envelope through single-session runtime", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-runtime-"));
  const roll = handleOneBotEnvelope(makeEnvelope("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(roll.ok, true);
  assert.match(roll.replyText, /传统随机车卡/);

  const turn = handleOneBotEnvelope(makeEnvelope("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(turn.ok, true);
  assert.equal(turn.sendAction.action, "send_group_msg");
  assert.match(turn.replyText, /Spot Hidden/);
  assert.equal(turn.action.kind, "explore");
  rmSync(storageRoot, { recursive: true, force: true });
});
