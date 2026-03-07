const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { handleOneBotMessage, buildConversationKey } = require("./single-session");

function makeEvent(message, overrides = {}) {
  return {
    user_id: 281894872,
    group_id: 95270001,
    sender: { nickname: "dogami" },
    message,
    ...overrides
  };
}

test("builds stable onebot conversation key", () => {
  assert.equal(buildConversationKey(makeEvent("hi")), "onebot-group-95270001");
  assert.equal(buildConversationKey({ user_id: 123, message: "hi" }), "onebot-dm-123");
});

test("start reply asks players to roll instead of auto default sheet", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent(""), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /你现在还没车卡/);
  assert.match(result.reply, /\/aikp roll journalist/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("single player can roll a traditional investigator", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("/aikp roll detective"), { storageRoot, randomInt: () => 3 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /传统随机车卡/);
  assert.match(result.reply, /私家侦探/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("single player can build a quickfire investigator", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("/aikp quickfire artist"), { storageRoot, randomInt: () => 0 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /快速车卡/);
  assert.match(result.reply, /艺术家\/歌手/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("party-roll can batch roll all known users", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("hello"), { storageRoot });
  handleOneBotMessage(makeEvent("hello", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  const result = handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /批量做了 传统随机车卡/);
  assert.match(result.reply, /dogami/);
  assert.match(result.reply, /阿青/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("plain action is blocked before chargen", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, false);
  assert.match(result.reply, /你还没车卡/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("rolled investigator can route old church natural language into scene action", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, true);
  assert.equal(result.action.kind, "explore");
  assert.match(result.reply, /暗骰：Spot Hidden/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("sheet command shows current investigator", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp quickfire journalist"), { storageRoot, randomInt: () => 0 });
  const result = handleOneBotMessage(makeEvent("/aikp sheet"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /dogami｜记者/);
  assert.match(result.reply, /资源：HP/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("returns state summary command", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /场景：/);
  assert.match(result.reply, /危险：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("returns help command text", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("/aikp help"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /AI-KP 可用指令/);
  assert.match(result.reply, /party-roll/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("settle command returns summary lines", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const result = handleOneBotMessage(makeEvent("/aikp settle"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /这轮先帮你收一下/);
  assert.match(result.reply, /线索共拿到/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("hidden checks stay hidden in reply line", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("我直接把祭坛下面那块木板掀开"), { storageRoot, randomInt: () => 81 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /暗骰：Fighting/);
  assert.doesNotMatch(result.reply, /81\/35/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("reset command rebuilds session state", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const before = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(before.reply, /时间：5 分钟/);
  const reset = handleOneBotMessage(makeEvent("/aikp reset"), { storageRoot });
  assert.equal(reset.ok, true);
  const after = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(after.reply, /时间：0 分钟/);
  rmSync(storageRoot, { recursive: true, force: true });
});
