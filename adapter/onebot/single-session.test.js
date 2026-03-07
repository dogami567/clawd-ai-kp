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
  assert.match(result.reply, /状态变化：/);
  assert.match(result.reply, /时间 \+5/);
  assert.match(result.reply, /场上此刻/);
  assert.match(result.reply, /当前 spotlight/);
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
  assert.match(result.reply, /当前轮次：第 1 轮/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("campaign command shows story arc hooks", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("/aikp campaign"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /故事弧：旧教堂异响/);
  assert.match(result.reply, /当前预留钩子：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("storypack and goto commands expose framework-level transitions", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const storypack = handleOneBotMessage(makeEvent("/aikp storypack"), { storageRoot });
  assert.equal(storypack.ok, true);
  assert.match(storypack.reply, /Story Pack：旧教堂异响 Story Pack/);
  const goto = handleOneBotMessage(makeEvent("/aikp goto bell-tower-followup"), { storageRoot });
  assert.equal(goto.ok, true);
  assert.match(goto.reply, /切到 bell-tower-followup/);
  assert.match(goto.reply, /当前场景：bell-tower-followup/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("authoring validators keep campaign and story pack loadable", () => {
  const { loadCampaignTemplate, loadStoryPackTemplate } = require('../../core/src/index');
  const campaign = loadCampaignTemplate('old-church-arc');
  const storyPack = loadStoryPackTemplate('old-church-arc-pack');
  assert.equal(campaign.id, 'old-church-arc');
  assert.equal(storyPack.id, 'old-church-arc-pack');
});

test("hooks and advance commands support conditional transitions", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  const hooksBefore = handleOneBotMessage(makeEvent("/aikp hooks"), { storageRoot });
  assert.equal(hooksBefore.ok, true);
  assert.match(hooksBefore.reply, /withdraw-with-clues/);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const advance = handleOneBotMessage(makeEvent("/aikp advance"), { storageRoot });
  assert.equal(advance.ok, true);
  assert.match(advance.reply, /把这幕往后推进了/);
  assert.match(advance.reply, /当前场景：bell-tower-followup/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("scene and recap commands show environment and stage summary", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const scene = handleOneBotMessage(makeEvent("/aikp scene"), { storageRoot });
  const recap = handleOneBotMessage(makeEvent("/aikp recap"), { storageRoot });
  assert.equal(scene.ok, true);
  assert.match(scene.reply, /场景环境：夜探旧教堂/);
  assert.match(scene.reply, /区域：/);
  assert.equal(recap.ok, true);
  assert.match(recap.reply, /阶段总结：/);
  assert.match(recap.reply, /已得线索/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("party command shows party panel and current focus", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("hello"), { storageRoot });
  handleOneBotMessage(makeEvent("hello", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /队伍面板｜第 1 轮/);
  assert.match(result.reply, /👉/);
  assert.match(result.reply, /dogami/);
  assert.match(result.reply, /阿青/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("clues and npcs commands show dedicated panels", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const clues = handleOneBotMessage(makeEvent("/aikp clues"), { storageRoot });
  const npcs = handleOneBotMessage(makeEvent("/aikp npcs"), { storageRoot });
  assert.equal(clues.ok, true);
  assert.match(clues.reply, /线索面板/);
  assert.match(clues.reply, /祭坛背后的异常刮痕/);
  assert.equal(npcs.ok, true);
  assert.match(npcs.reply, /NPC 面板/);
  assert.match(npcs.reply, /守墓人/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("returns help command text", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("/aikp help"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /AI-KP 可用指令/);
  assert.match(result.reply, /party-roll/);
  assert.match(result.reply, /focus/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("focus and next commands switch current actor", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("hello"), { storageRoot });
  handleOneBotMessage(makeEvent("hello", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  const focus = handleOneBotMessage(makeEvent("/aikp focus 阿青"), { storageRoot });
  assert.equal(focus.ok, true);
  assert.match(focus.reply, /切到 .*阿青|切到 .*了/);
  const who = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(who.ok, true);
  assert.match(who.reply, /阿青/);
  const next = handleOneBotMessage(makeEvent("/aikp next"), { storageRoot });
  assert.equal(next.ok, true);
  assert.doesNotMatch(next.reply, /阿青（第 1 轮）$/);
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
