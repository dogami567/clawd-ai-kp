const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const { handleOneBotMessage, buildConversationKey, getKpRuntimePrompt } = require("./single-session");

function makeEvent(message, overrides = {}) {
  return {
    user_id: 281894872,
    group_id: 95270001,
    sender: { nickname: "dogami" },
    message,
    ...overrides
  };
}

function readJsonLines(filePath) {
  return readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function selectDefaultStoryPack(storageRoot) {
  return handleOneBotMessage(makeEvent("/aikp pack old-church-arc-pack"), { storageRoot });
}

function lockCurrentInvestigator(storageRoot, randomInt = () => 3) {
  const profile = handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt });
  const gear = handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt });
  const locked = handleOneBotMessage(makeEvent("锁卡"), { storageRoot, randomInt });
  return { profile, gear, locked };
}

function completeTraditionalInvestigator(storageRoot, options = {}) {
  const occupationKey = Object.prototype.hasOwnProperty.call(options, "occupationKey")
    ? options.occupationKey
    : "journalist";
  const skillReply = options.skillReply || "自动分配";
  const randomInt = options.randomInt || (() => 3);
  const rollCommand = occupationKey ? `/aikp roll ${occupationKey}` : "/aikp roll";
  const opened = handleOneBotMessage(makeEvent(rollCommand), { storageRoot, randomInt });
  const finalized = handleOneBotMessage(makeEvent(skillReply), { storageRoot, randomInt });
  const review = lockCurrentInvestigator(storageRoot, randomInt);
  return { opened, finalized, ...review };
}

function makeQueuedRandomInt(values = [], fallback = 1) {
  let index = 0;
  return () => {
    if (index < values.length) {
      const nextValue = values[index];
      index += 1;
      return nextValue;
    }
    return fallback;
  };
}

function prepareQuickfireInvestigator(storageRoot, occupationKey = "journalist") {
  selectDefaultStoryPack(storageRoot);
  const started = handleOneBotMessage(makeEvent(`/aikp quickfire ${occupationKey}`), {
    storageRoot,
    randomInt: () => 0
  });
  assert.equal(started.ok, true);
  return started;
}

function getSessionFile(storageRoot, eventOverrides = {}) {
  const conversationKey = buildConversationKey(makeEvent("session", eventOverrides));
  return join(storageRoot, "sessions", `${conversationKey}.json`);
}

function rewriteSession(storageRoot, updater, eventOverrides = {}) {
  const sessionFile = getSessionFile(storageRoot, eventOverrides);
  const snapshot = JSON.parse(readFileSync(sessionFile, "utf8"));
  updater(snapshot.sessionState);
  writeFileSync(sessionFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function prepareCombatParty(storageRoot, members = [], baseOverrides = {}) {
  handleOneBotMessage(makeEvent("/aikp pack old-church-arc-pack", baseOverrides), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", baseOverrides), { storageRoot });
  for (const member of members) {
    handleOneBotMessage(makeEvent("/aikp join", { ...baseOverrides, ...member }), { storageRoot });
  }
  handleOneBotMessage(makeEvent("/aikp party-roll journalist", baseOverrides), { storageRoot, randomInt: () => 3 });
}

function resolveFailedPersuade(storageRoot, overrides = {}) {
  const pending = handleOneBotMessage(
    makeEvent("我想走说服，找守墓人聊聊钟声", overrides),
    { storageRoot, randomInt: () => 98 }
  );
  assert.equal(pending.ok, false);
  assert.match(pending.reply, /你现在可以这么选：/);
  const accepted = handleOneBotMessage(
    makeEvent("接受当前结果", overrides),
    { storageRoot, randomInt: () => 98 }
  );
  return { pending, accepted };
}

test("builds stable onebot conversation key", () => {
  assert.equal(buildConversationKey(makeEvent("hi")), "onebot-group-95270001");
  assert.equal(buildConversationKey({ user_id: 123, message: "hi" }), "onebot-dm-123");
});

test("kp runtime prompt bans templated rule-speak and spoiler-y outro habits", () => {
  const prompt = getKpRuntimePrompt();
  assert.match(prompt, /请使用自然、精简的日常口语/);
  assert.match(prompt, /绝对禁止使用以下词汇和句式/);
  assert.match(prompt, /不要生成任何开头寒暄和结尾总结/);
  assert.match(prompt, /拓展不能带剧透内容/);
});

test("start reply prompts players to pick a story pack before opening scene text", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent(""), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /先别急着进场/);
  assert.match(result.reply, /当前可选剧本/);
  assert.match(result.reply, /old-church-arc-pack/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("single player traditional chargen now rolls attributes first and finalizes after skill choice", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const opened = handleOneBotMessage(makeEvent("/aikp roll detective"), { storageRoot, randomInt: () => 3 });
  assert.equal(opened.ok, true);
  assert.match(opened.reply, /先把这张调查员的属性掷出来啦/);
  assert.match(opened.reply, /职业先定成 私家侦探/);
  assert.match(opened.reply, /职业技能点/);

  const finalized = handleOneBotMessage(makeEvent("自动分配"), { storageRoot, randomInt: () => 3 });
  assert.equal(finalized.ok, true);
  assert.match(finalized.reply, /传统随机车卡 已经给你落好了/);
  assert.match(finalized.reply, /私家侦探/);
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

test("natural language can start session without auto default chargen", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /先别急着进场/);
  assert.match(result.reply, /当前可选剧本/);
  assert.doesNotMatch(result.reply, /传统随机车卡/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural language start also accepts 我要跑团 phrasing", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("我要跑团"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /先别急着进场/);
  assert.match(result.reply, /当前可选剧本/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("story pack selection switches session into prestart lobby without dumping opening when no card exists", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const result = handleOneBotMessage(makeEvent("1"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /这次先跑《旧教堂异响》/);
  assert.match(result.reply, /开团前先对一下边界/);
  assert.match(result.reply, /开始建卡/);
  assert.doesNotMatch(result.reply, /门一推开/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural language can pick a story pack with a loose referential phrase", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const result = handleOneBotMessage(makeEvent("旧教堂那个就行"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /这次先跑《旧教堂异响》/);
  assert.match(result.reply, /开团前先对一下边界/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group story pack choice stays group-shared", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const result = handleOneBotMessage(
    makeEvent("旧教堂那个就行", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot }
  );
  assert.equal(result.ok, true);
  assert.match(result.reply, /这次先跑《旧教堂异响》/);
  assert.match(result.reply, /开团前先对一下边界/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("first traditional chargen after story pack selection waits for skill choice before opening", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  handleOneBotMessage(makeEvent("1"), { storageRoot });
  const opened = handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(opened.ok, true);
  assert.match(opened.reply, /职业先定成 记者/);
  assert.doesNotMatch(opened.reply, /门一推开/);

  const result = handleOneBotMessage(makeEvent("自动分配"), { storageRoot, randomInt: () => 3 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /传统随机车卡/);
  assert.match(result.reply, /先别急着开场/);
  assert.doesNotMatch(result.reply, /门一推开/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("traditional chargen can finish in one natural sentence after attribute roll", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const opened = handleOneBotMessage(makeEvent("/aikp roll"), { storageRoot, randomInt: () => 3 });
  assert.equal(opened.ok, true);
  assert.match(opened.reply, /下一步先定职业/);

  const finalized = handleOneBotMessage(makeEvent("记者吧，信用20，侦查、图书馆、心理学、说服"), { storageRoot, randomInt: () => 3 });
  assert.equal(finalized.ok, true);
  assert.match(finalized.reply, /传统随机车卡 已经给你落好了/);
  assert.match(finalized.reply, /这次我按信用评级 20 来配职业面/);
  assert.match(finalized.reply, /Spot Hidden|Library Use|Psychology|Persuade/);
  assert.match(finalized.reply, /先别急着开场/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("traditional chargen can continue after an interruption and still lock into the formal opening", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);

  const opened = handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(opened.ok, true);
  assert.match(opened.reply, /职业先定成 记者/);

  const interrupted = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.equal(interrupted.ok, true);
  assert.match(interrupted.reply, /调查员：暂无/);

  const finalized = handleOneBotMessage(makeEvent("自动分配"), { storageRoot, randomInt: () => 3 });
  assert.equal(finalized.ok, true);
  assert.match(finalized.reply, /传统随机车卡 已经给你落好了/);
  assert.match(finalized.reply, /先别急着开场/);

  handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt: () => 3 });
  const locked = handleOneBotMessage(makeEvent("锁卡"), { storageRoot, randomInt: () => 3 });
  assert.equal(locked.ok, true);
  assert.match(locked.reply, /前情：/);
  assert.match(locked.reply, /门一推开/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("locking a traditional card sends briefing once and the first scene action does not replay it", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("自动分配"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("默认继续"), { storageRoot, randomInt: () => 3 });
  const locked = handleOneBotMessage(makeEvent("锁卡"), { storageRoot, randomInt: () => 3 });
  assert.equal(locked.ok, true);
  assert.match(locked.reply, /前情：/);
  assert.match(locked.reply, /门一推开/);

  const firstAction = handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), {
    storageRoot,
    randomInt: () => 28
  });
  assert.equal(firstAction.ok, true);
  assert.doesNotMatch(firstAction.reply, /前情：/);
  assert.doesNotMatch(firstAction.reply, /门一推开/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("multiplayer chargen drafts stay isolated by user id", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);

  const aStart = handleOneBotMessage(makeEvent("开始建卡"), { storageRoot, randomInt: () => 3 });
  assert.equal(aStart.ok, true);
  assert.match(aStart.reply, /下一步先定职业/);

  const bWrongFollowUp = handleOneBotMessage(
    makeEvent("默认继续", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 3 }
  );
  assert.equal(bWrongFollowUp.ok, false);
  assert.match(bWrongFollowUp.reply, /你还没车卡/);

  const aOccupation = handleOneBotMessage(makeEvent("记者"), { storageRoot, randomInt: () => 3 });
  assert.equal(aOccupation.ok, true);
  assert.match(aOccupation.reply, /职业先定成 记者/);

  const bStart = handleOneBotMessage(
    makeEvent("开始建卡", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 3 }
  );
  assert.equal(bStart.ok, true);
  assert.match(bStart.reply, /下一步先定职业/);

  const bOccupation = handleOneBotMessage(
    makeEvent("医生", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 3 }
  );
  assert.equal(bOccupation.ok, true);
  assert.match(bOccupation.reply, /职业先定成 医生/);

  const aFinalize = handleOneBotMessage(makeEvent("自动分配"), { storageRoot, randomInt: () => 3 });
  assert.equal(aFinalize.ok, true);
  assert.match(aFinalize.reply, /传统随机车卡 已经给你落好了/);
  assert.match(aFinalize.reply, /记者/);

  const bFinalize = handleOneBotMessage(
    makeEvent("自动分配", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 3 }
  );
  assert.equal(bFinalize.ok, true);
  assert.match(bFinalize.reply, /传统随机车卡 已经给你落好了/);
  assert.match(bFinalize.reply, /医生/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural language can quickfire chargen with chinese occupation", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const result = handleOneBotMessage(makeEvent("给我快速车卡，职业医生"), { storageRoot, randomInt: () => 0 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /快速车卡/);
  assert.match(result.reply, /医生/);
  assert.match(result.reply, /快速分配/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("party-roll can batch roll all joined party members", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  const result = handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /批量做了 传统随机车卡/);
  assert.match(result.reply, /dogami/);
  assert.match(result.reply, /阿青/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("natural language can batch roll traditional investigators with visible attribute breakdown", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  const result = handleOneBotMessage(makeEvent("我想一次全车完卡，角色选记者"), { storageRoot, randomInt: () => 3 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /批量做了 传统随机车卡/);
  assert.match(result.reply, /dogami/);
  assert.match(result.reply, /阿青/);
  assert.match(result.reply, /STR 9->45/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("plain action is blocked before chargen", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  const result = handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, false);
  assert.match(result.reply, /你还没车卡/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("rolled investigator can route old church natural language into scene action", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
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

test("ambiguous social actions pause for player skill choice before rolling", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const result = handleOneBotMessage(makeEvent("我去找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, false);
  assert.match(result.reply, /这句我先不替你直接判/);
  assert.match(result.reply, /心理学/);
  assert.match(result.reply, /说服/);
  assert.doesNotMatch(result.reply, /投掷：28/);

  const followUp = handleOneBotMessage(makeEvent("走说服"), { storageRoot, randomInt: () => 8 });
  assert.equal(followUp.ok, true);
  assert.match(followUp.reply, /投掷：8（目标 \d+，/);
  assert.doesNotMatch(followUp.reply, /检定：Persuade 8\//);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group scene method choice stays bound to the original player", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const prompt = handleOneBotMessage(makeEvent("我去找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  assert.equal(prompt.ok, false);
  assert.match(prompt.reply, /这句我先不替你直接判/);

  const hijacked = handleOneBotMessage(
    makeEvent("走说服", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 8 }
  );
  assert.equal(hijacked.ok, false);
  assert.match(hijacked.reply, /先等 dogami 选走法/);
  assert.doesNotMatch(hijacked.reply, /投掷：8/);

  const resolved = handleOneBotMessage(makeEvent("走说服"), { storageRoot, randomInt: () => 8 });
  assert.equal(resolved.ok, true);
  assert.match(resolved.reply, /投掷：8（目标 \d+，/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group off-spotlight action is blocked without explicit handoff", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const blocked = handleOneBotMessage(
    makeEvent("我借着手电去看祭坛背后的刮痕", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 28 }
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.reply, /当前 spotlight 还在 dogami/);
  assert.match(blocked.reply, /切我|我打断一下/);
  assert.doesNotMatch(blocked.reply, /暗骰：Spot Hidden/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group player can explicitly claim spotlight before acting", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const acted = handleOneBotMessage(
    makeEvent("切我，我借着手电去看祭坛背后的刮痕", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 28 }
  );
  assert.equal(acted.ok, true);
  assert.match(acted.reply, /spotlight 切到 阿青/);
  assert.match(acted.reply, /暗骰：Spot Hidden/);

  const who = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(who.ok, true);
  assert.match(who.reply, /dogami/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("group spotlight auto-advances after a resolved action", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const first = handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  assert.equal(first.ok, true);
  assert.match(first.reply, /当前 spotlight 还在 阿青|阿青 这边/);

  const afterFirst = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(afterFirst.ok, true);
  assert.match(afterFirst.reply, /阿青/);

  const second = handleOneBotMessage(
    makeEvent("我借着手电去看祭坛背后的刮痕", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 28 }
  );
  assert.equal(second.ok, true);
  assert.match(second.reply, /暗骰：Spot Hidden/);

  const afterSecond = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(afterSecond.ok, true);
  assert.match(afterSecond.reply, /dogami/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("group soft time cues the next actor after time-consuming resolution", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const { accepted } = resolveFailedPersuade(storageRoot);
  assert.equal(accepted.ok, true);
  assert.match(accepted.reply, /时间 \+5/);
  assert.match(accepted.reply, /阿青 这边也一起过去了 5 分钟/);

  const who = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(who.ok, true);
  assert.match(who.reply, /阿青/);

  const state = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.equal(state.ok, true);
  assert.match(state.reply, /时间：5 分钟/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("group soft time stays incremental across two players", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const first = resolveFailedPersuade(storageRoot);
  assert.equal(first.accepted.ok, true);
  assert.match(first.accepted.reply, /阿青 这边也一起过去了 5 分钟/);

  const second = resolveFailedPersuade(storageRoot, { user_id: 9527, sender: { nickname: "阿青" } });
  assert.equal(second.accepted.ok, true);
  assert.match(second.accepted.reply, /dogami 这边也一起过去了 5 分钟/);
  assert.doesNotMatch(second.accepted.reply, /dogami 这边也一起过去了 10 分钟/);

  const state = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.equal(state.ok, true);
  assert.match(state.reply, /时间：10 分钟/);

  const who = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(who.ok, true);
  assert.match(who.reply, /dogami/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("party panel keeps third player's pending soft time visible", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9528, sender: { nickname: "老周" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const first = resolveFailedPersuade(storageRoot);
  assert.equal(first.accepted.ok, true);

  const party = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.equal(party.ok, true);
  assert.match(party.reply, /老周.*待同步 \+5 分钟/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("explicitly chosen social methods can resolve immediately", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const result = handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 8 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /投掷：8（目标 \d+，/);
  assert.doesNotMatch(result.reply, /这句我先不替你直接判/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("failed checks offer accept push and luck choices", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const result = handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, false);
  assert.match(result.reply, /你现在可以这么选：/);
  assert.match(result.reply, /接受当前结果/);
  assert.match(result.reply, /推骰再试/);
  assert.match(result.reply, /花幸运/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group post-check choice stays bound to the original player", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const failed = handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  assert.equal(failed.ok, false);
  assert.match(failed.reply, /你现在可以这么选：/);

  const hijacked = handleOneBotMessage(
    makeEvent("花幸运", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 28 }
  );
  assert.equal(hijacked.ok, false);
  assert.match(hijacked.reply, /先等 dogami 决定这次检定怎么收/);
  assert.doesNotMatch(hijacked.reply, /投掷：\d+（目标 \d+，/);

  const resolved = handleOneBotMessage(makeEvent("花幸运"), { storageRoot, randomInt: () => 28 });
  assert.equal(resolved.ok, true);
  assert.match(resolved.reply, /投掷：\d+（目标 \d+，/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("accepting a failed check continues without reopening the same choice prompt", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  const accepted = handleOneBotMessage(makeEvent("接受"), { storageRoot, randomInt: () => 28 });
  assert.equal(accepted.ok, true);
  assert.match(accepted.reply, /投掷：28（目标 \d+，/);
  assert.doesNotMatch(accepted.reply, /你现在可以这么选：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("pushing a failed check rerolls the same action", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  const pushed = handleOneBotMessage(makeEvent("推骰"), { storageRoot, randomInt: () => 8 });
  assert.equal(pushed.ok, true);
  assert.match(pushed.reply, /投掷：8（目标 \d+，/);
  assert.doesNotMatch(pushed.reply, /你现在可以这么选：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("spending luck upgrades the failed check and deducts luck", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const failed = handleOneBotMessage(makeEvent("我想走说服，找守墓人聊聊钟声"), { storageRoot, randomInt: () => 28 });
  const luckBefore = Object.values(failed.sessionState.investigators)[0].resources.luck;
  const luckResult = handleOneBotMessage(makeEvent("花幸运"), { storageRoot, randomInt: () => 28 });
  const luckAfter = Object.values(luckResult.sessionState.investigators)[0].resources.luck;
  assert.equal(luckResult.ok, true);
  assert.match(luckResult.reply, /投掷：\d+（目标 \d+，/);
  assert.doesNotMatch(luckResult.reply, /你现在可以这么选：/);
  assert.ok(luckAfter < luckBefore);
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
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const result = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /场景：/);
  assert.match(result.reply, /当前轮次：第 1 轮/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("campaign command shows story arc hooks", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  const result = handleOneBotMessage(makeEvent("/aikp campaign"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /故事弧：旧教堂异响/);
  assert.match(result.reply, /当前预留钩子：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("storypack and goto commands expose framework-level transitions", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
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
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
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

test("bell tower route can keep advancing into the missing-person followup", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);

  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const towerAdvance = handleOneBotMessage(makeEvent("/aikp advance"), { storageRoot });
  assert.equal(towerAdvance.ok, true);
  assert.match(towerAdvance.reply, /bell-tower-followup/);

  const towerAction = handleOneBotMessage(makeEvent("我想看看钟绳有没有被人新近碰过。"), {
    storageRoot,
    randomInt: () => 8
  });
  assert.equal(towerAction.ok, true);
  assert.match(towerAction.reply, /钟绳|昨晚来的人/);

  const towerHooks = handleOneBotMessage(makeEvent("/aikp hooks"), { storageRoot });
  assert.equal(towerHooks.ok, true);
  assert.match(towerHooks.reply, /tower-to-missing-person/);

  const missingAdvance = handleOneBotMessage(makeEvent("/aikp advance tower-to-missing-person"), { storageRoot });
  assert.equal(missingAdvance.ok, true);
  assert.match(missingAdvance.reply, /missing-person-followup/);

  const missingAction = handleOneBotMessage(makeEvent("我先把素描和教堂符号摊开对一下。"), {
    storageRoot,
    randomInt: () => 8
  });
  assert.equal(missingAction.ok, true);
  assert.match(missingAction.reply, /登记纸和素描一对|失踪者最后登记的去向/);

  const gotoUnderchurch = handleOneBotMessage(makeEvent("/aikp goto underchurch-aftershock"), { storageRoot });
  assert.equal(gotoUnderchurch.ok, true);
  assert.match(gotoUnderchurch.reply, /underchurch-aftershock/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("underchurch and missing-person chain supports manual advance and resume", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);

  handleOneBotMessage(makeEvent("我直接把祭坛下面那块木板掀开"), { storageRoot, randomInt: () => 81 });
  const hooksBefore = handleOneBotMessage(makeEvent("/aikp hooks"), { storageRoot });
  assert.equal(hooksBefore.ok, true);
  assert.match(hooksBefore.reply, /retreat-after-awakening/);

  const underchurchAdvance = handleOneBotMessage(makeEvent("/aikp advance retreat-after-awakening"), { storageRoot });
  assert.equal(underchurchAdvance.ok, true);
  assert.match(underchurchAdvance.reply, /underchurch-aftershock/);

  const underchurchAction = handleOneBotMessage(makeEvent("我先别乱动，再听一次那声音是从哪边来的。"), {
    storageRoot,
    randomInt: () => 8
  });
  assert.equal(underchurchAction.ok, true);
  assert.match(underchurchAction.reply, /深处回响|在贴着地下某条窄路慢慢挪/);

  const underchurchHooks = handleOneBotMessage(makeEvent("/aikp hooks"), { storageRoot });
  assert.equal(underchurchHooks.ok, true);
  assert.match(underchurchHooks.reply, /underchurch-to-missing-person/);

  const missingAdvance = handleOneBotMessage(makeEvent("/aikp advance underchurch-to-missing-person"), { storageRoot });
  assert.equal(missingAdvance.ok, true);
  assert.match(missingAdvance.reply, /missing-person-followup/);

  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const resumed = handleOneBotMessage(makeEvent("续上"), { storageRoot });
  assert.equal(resumed.ok, true);

  const resumedState = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(resumedState.reply, /失踪者线索浮出水面/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("npc runtime persists across scene transition resume and settlement", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);

  const talked = handleOneBotMessage(makeEvent("我想跟守墓人聊聊钟声"), {
    storageRoot,
    randomInt: () => 8
  });
  assert.equal(talked.ok, false);
  assert.match(talked.reply, /走心理学|走说服/);

  const resolvedTalk = handleOneBotMessage(makeEvent("走说服"), {
    storageRoot,
    randomInt: () => 8
  });
  assert.equal(resolvedTalk.ok, true);

  const advanced = handleOneBotMessage(makeEvent("/aikp advance take-key-evidence"), { storageRoot });
  assert.equal(advanced.ok, true);
  assert.match(advanced.reply, /bell-tower-followup/);

  const snapshot = JSON.parse(readFileSync(getSessionFile(storageRoot), "utf8"));
  const persistedNpc = snapshot.sessionState.scene.meta?.campaign?.runtime?.npcsById?.gravedigger;
  assert.equal(Boolean(persistedNpc), true);
  assert.match((persistedNpc.socialState?.flags || []).join(","), /reasoned_with/);
  assert.equal(persistedNpc.socialState?.lastInteractionStyle, "persuade");

  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const resumed = handleOneBotMessage(makeEvent("续上"), { storageRoot });
  assert.equal(resumed.ok, true);

  const settle = handleOneBotMessage(makeEvent("/aikp settle"), { storageRoot });
  assert.equal(settle.ok, true);
  assert.match(settle.reply, /跨幕 NPC 后效：守墓人/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("scene and recap commands show environment and stage summary", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
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
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /队伍面板｜.*第 1 轮/);
  assert.match(result.reply, /👉/);
  assert.match(result.reply, /dogami/);
  assert.match(result.reply, /阿青/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("clues and npcs commands show dedicated panels", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
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
  assert.match(result.reply, /group-luck/);
  assert.match(result.reply, /focus/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("group luck command uses the lowest party luck", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  const result = handleOneBotMessage(makeEvent("/aikp group-luck"), { storageRoot, randomInt: () => 42 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /group Luck/);
  assert.match(result.reply, /最低 Luck/);
  assert.match(result.reply, /投掷：42（目标 45，regular）/);
  assert.match(result.reply, /幸运检定过了/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("focus and next commands switch current actor", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
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

test("locked party blocks late joiners from slipping into chargen", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp lock-party"), { storageRoot });

  const lateJoin = handleOneBotMessage(
    makeEvent("开始建卡", { user_id: 4242, sender: { nickname: "路人" } }),
    { storageRoot, randomInt: () => 3 }
  );
  assert.equal(lateJoin.ok, true);
  assert.match(lateJoin.reply, /名单已经先锁住了|名单已经锁了/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("outsiders cannot control shared group session with commands", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });

  const focusBlocked = handleOneBotMessage(
    makeEvent("/aikp focus 阿青", { user_id: 4242, sender: { nickname: "路人" } }),
    { storageRoot }
  );
  assert.equal(focusBlocked.ok, true);
  assert.match(focusBlocked.reply, /先让场内玩家来定/);
  assert.match(focusBlocked.reply, /切 spotlight/);

  const newBlocked = handleOneBotMessage(
    makeEvent("/aikp new", { user_id: 4242, sender: { nickname: "路人" } }),
    { storageRoot }
  );
  assert.equal(newBlocked.ok, true);
  assert.match(newBlocked.reply, /先让场内玩家来定/);
  assert.match(newBlocked.reply, /新开跑团线/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("locked party lets existing investigators auto-rejoin on their next action", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  handleOneBotMessage(makeEvent("/aikp join"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp join", { user_id: 9527, sender: { nickname: "阿青" } }), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp party-roll journalist"), { storageRoot, randomInt: () => 3 });
  handleOneBotMessage(makeEvent("/aikp lock-party"), { storageRoot });

  const left = handleOneBotMessage(
    makeEvent("/aikp leave", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot }
  );
  assert.equal(left.ok, true);
  assert.match(left.reply, /移出来/);

  const acted = handleOneBotMessage(
    makeEvent("切我，我借着手电去看祭坛背后的刮痕", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: () => 28 }
  );
  assert.equal(acted.ok, true);
  assert.match(acted.reply, /spotlight 切到 阿青/);
  assert.match(acted.reply, /暗骰：Spot Hidden/);

  const party = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.equal(party.ok, true);
  assert.match(party.reply, /阿青/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("outsiders cannot trigger old-save flow through natural language start", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });

  const blocked = handleOneBotMessage(
    makeEvent("我想跑团", { user_id: 4242, sender: { nickname: "路人" } }),
    { storageRoot }
  );
  assert.equal(blocked.ok, true);
  assert.match(blocked.reply, /先让场内玩家来定/);
  assert.match(blocked.reply, /改旧档状态/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("settle command returns summary lines", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const result = handleOneBotMessage(makeEvent("/aikp settle"), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /这轮先帮你收一下/);
  assert.match(result.reply, /线索共拿到/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("hidden checks stay hidden in reply line", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  const result = handleOneBotMessage(makeEvent("我直接把祭坛下面那块木板掀开"), { storageRoot, randomInt: () => 81 });
  assert.equal(result.ok, true);
  assert.match(result.reply, /暗骰：Fighting/);
  assert.doesNotMatch(result.reply, /81\/35/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("writes chat log, operation ledger, state snapshot and summary chunks", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const conversationKey = buildConversationKey(makeEvent("x"));
  const logsRoot = join(storageRoot, "logs", conversationKey);
  const chatLogFile = join(logsRoot, "chat", "events.jsonl");
  const ledgerLogFile = join(logsRoot, "ledger", "operations.jsonl");
  const playerLogDir = join(logsRoot, "players");
  const stateFile = join(logsRoot, "state", "latest.json");
  const contextFile = join(logsRoot, "context", "latest.json");
  const summaryDir = join(logsRoot, "summaries");

  const result = handleOneBotMessage(makeEvent("给我快速车卡，职业医生"), {
    storageRoot,
    randomInt: () => 0,
    summaryEventThreshold: 2,
    includeContextPacket: true
  });

  assert.equal(result.ok, true);
  assert.equal(existsSync(chatLogFile), true);
  assert.equal(existsSync(ledgerLogFile), true);
  assert.equal(existsSync(stateFile), true);
  assert.equal(existsSync(contextFile), true);
  assert.equal(existsSync(join(playerLogDir, "user-281894872.jsonl")), true);
  assert.equal(result.contextRef, contextFile);
  assert.equal(result.contextPacket.runtimeProfileId, "maimai-kp-v1");

  const chatEvents = readJsonLines(chatLogFile);
  assert.equal(chatEvents.length, 2);
  assert.equal(chatEvents[0].direction, "inbound");
  assert.equal(chatEvents[1].direction, "outbound");

  const ledgerEvents = readJsonLines(ledgerLogFile);
  assert.match(ledgerEvents[0].kind, /character\.created/);
  assert.match(ledgerEvents.at(-1).kind, /summary\.rollup/);

  const stateSnapshot = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(stateSnapshot.sessionMode, "kp");
  assert.equal(stateSnapshot.runtimeProfileId, "maimai-kp-v1");
  assert.match(JSON.stringify(stateSnapshot), /医生/);

  const contextSnapshot = JSON.parse(readFileSync(contextFile, "utf8"));
  assert.match(contextSnapshot.injectionText, /AI-KP Runtime Prompt/);
  assert.match(contextSnapshot.injectionText, /给我快速车卡，职业医生/);

  const summaryFiles = readdirSync(summaryDir);
  assert.equal(summaryFiles.length, 1);
  const summaryText = readFileSync(join(summaryDir, summaryFiles[0]), "utf8");
  assert.match(summaryText, /AI-KP Summary/);
  assert.match(summaryText, /给我快速车卡，职业医生/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("reset command rebuilds session state", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  const before = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(before.reply, /时间：5 分钟/);
  const reset = handleOneBotMessage(makeEvent("/aikp reset"), { storageRoot });
  assert.equal(reset.ok, true);
  const after = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(after.reply, /时间：0 分钟/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test("start prompts to resume or open a new line when an old save exists", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });

  const prompt = handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  assert.equal(prompt.ok, true);
  assert.match(prompt.reply, /旧档/);
  assert.match(prompt.reply, /续上/);
  assert.match(prompt.reply, /新开/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group resume choice stays bound to the requesting player", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });

  const prompt = handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  assert.equal(prompt.ok, true);
  assert.match(prompt.reply, /旧档/);

  const hijacked = handleOneBotMessage(
    makeEvent("新开", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot }
  );
  assert.equal(hijacked.ok, true);
  assert.match(hijacked.reply, /先等 dogami 拍板旧档/);

  const resumed = handleOneBotMessage(makeEvent("续上"), { storageRoot });
  assert.equal(resumed.ok, true);
  assert.match(resumed.reply, /沿着这条继续|接回来了/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("new line archives current run and resume can restore the archived save", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const conversationKey = buildConversationKey(makeEvent("x"));
  const archiveRoot = join(storageRoot, "archives", conversationKey);

  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });

  const fresh = handleOneBotMessage(makeEvent("新开"), { storageRoot });
  assert.equal(fresh.ok, true);
  assert.match(fresh.reply, /save-/);
  assert.equal(readdirSync(archiveRoot).length, 1);

  const stateAfterNew = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(stateAfterNew.reply, /时间：0 分钟/);

  const saves = handleOneBotMessage(makeEvent("/aikp saves"), { storageRoot });
  assert.match(saves.reply, /save-/);
  const saveId = saves.reply.match(/save-\d{4}-\d+/)?.[0];
  assert.ok(saveId);

  const resumed = handleOneBotMessage(makeEvent(`/aikp resume ${saveId}`), { storageRoot });
  assert.equal(resumed.ok, true);
  assert.match(resumed.reply, /接回来了/);

  const stateAfterResume = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(stateAfterResume.reply, /时间：5 分钟/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("delete command can remove an archived save after confirmation", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const conversationKey = buildConversationKey(makeEvent("x"));
  const archiveRoot = join(storageRoot, "archives", conversationKey);

  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("/aikp new"), { storageRoot });

  const saves = handleOneBotMessage(makeEvent("/aikp saves"), { storageRoot });
  const saveId = saves.reply.match(/save-\d{4}-\d+/)?.[0];
  assert.ok(saveId);
  assert.equal(readdirSync(archiveRoot).length, 1);

  const prompt = handleOneBotMessage(makeEvent(`/aikp delete ${saveId}`), { storageRoot });
  assert.equal(prompt.ok, true);
  assert.match(prompt.reply, /你要删的是这条历史归档/);
  assert.match(prompt.reply, new RegExp(saveId));

  const deleted = handleOneBotMessage(makeEvent("确认删除"), { storageRoot });
  assert.equal(deleted.ok, true);
  assert.match(deleted.reply, /已经删掉了/);
  assert.equal(existsSync(join(archiveRoot, saveId)), false);

  const savesAfterDelete = handleOneBotMessage(makeEvent("/aikp saves"), { storageRoot });
  assert.doesNotMatch(savesAfterDelete.reply, new RegExp(saveId));

  rmSync(storageRoot, { recursive: true, force: true });
});

test("same-group delete confirmation stays bound to the requesting player", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const conversationKey = buildConversationKey(makeEvent("x"));
  const archiveRoot = join(storageRoot, "archives", conversationKey);

  selectDefaultStoryPack(storageRoot);
  completeTraditionalInvestigator(storageRoot);
  handleOneBotMessage(makeEvent("我借着手电去看祭坛背后的刮痕"), { storageRoot, randomInt: () => 28 });
  handleOneBotMessage(makeEvent("/aikp new"), { storageRoot });

  const saves = handleOneBotMessage(makeEvent("/aikp saves"), { storageRoot });
  const saveId = saves.reply.match(/save-\d{4}-\d+/)?.[0];
  assert.ok(saveId);

  const prompt = handleOneBotMessage(makeEvent(`/aikp delete ${saveId}`), { storageRoot });
  assert.equal(prompt.ok, true);
  assert.match(prompt.reply, new RegExp(saveId));

  const hijacked = handleOneBotMessage(
    makeEvent("确认删除", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot }
  );
  assert.equal(hijacked.ok, true);
  assert.match(hijacked.reply, /先等 dogami 确认删档/);
  assert.equal(existsSync(join(archiveRoot, saveId)), true);

  const deleted = handleOneBotMessage(makeEvent("确认删除"), { storageRoot });
  assert.equal(deleted.ok, true);
  assert.match(deleted.reply, /已经删掉了/);
  assert.equal(existsSync(join(archiveRoot, saveId)), false);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("combat commands update combat round and expose HP SAN in state and settlement", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const opened = prepareQuickfireInvestigator(storageRoot);
  const actorId = Object.keys(opened.sessionState.investigators)[0];
  const beforeHp = opened.sessionState.investigators[actorId].resources.hp;

  const started = handleOneBotMessage(makeEvent("/aikp combat start"), { storageRoot });
  assert.equal(started.ok, true);
  assert.match(started.reply, /战斗态/);
  assert.match(started.reply, /战斗第 1 轮/);

  const attack = handleOneBotMessage(makeEvent("/aikp combat attack fight_back"), {
    storageRoot,
    randomInt: makeQueuedRandomInt([98, 12, 2], 2)
  });
  assert.equal(attack.ok, true);
  assert.match(attack.reply, /战斗第 1 轮/);
  assert.match(attack.reply, /反击/);
  assert.equal(attack.sessionState.scene.timeState.combatRound, 2);
  assert.equal(attack.sessionState.investigators[actorId].resources.hp, beforeHp - 2);

  const state = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(state.reply, /战斗：进行中｜第 2 轮/);
  assert.match(state.reply, /HP \d+\/\d+｜SAN \d+\/\d+/);

  const settle = handleOneBotMessage(makeEvent("/aikp settle"), { storageRoot });
  assert.equal(settle.ok, true);
  assert.match(settle.reply, /战斗轮次：第 2 轮收口/);
  assert.match(settle.reply, /调查员收尾/);
  assert.match(settle.reply, /HP \d+\/\d+/);
  assert.match(settle.reply, /SAN \d+\/\d+/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("san command handles success failure and survives resume", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const opened = prepareQuickfireInvestigator(storageRoot);
  const actorId = Object.keys(opened.sessionState.investigators)[0];
  const beforeSan = opened.sessionState.investigators[actorId].resources.san;

  const sanSuccess = handleOneBotMessage(makeEvent("/aikp san 0 1"), {
    storageRoot,
    randomInt: () => 1
  });
  assert.equal(sanSuccess.ok, true);
  assert.match(sanSuccess.reply, /SAN 检定/);
  assert.match(sanSuccess.reply, new RegExp(`SAN ${beforeSan}→${beforeSan}`));

  const sanFailed = handleOneBotMessage(makeEvent("/aikp san 1 1d4"), {
    storageRoot,
    randomInt: makeQueuedRandomInt([4, 99], 99)
  });
  assert.equal(sanFailed.ok, true);
  assert.match(sanFailed.reply, /SAN 检定/);
  assert.match(sanFailed.reply, new RegExp(`SAN ${beforeSan}→${beforeSan - 4}`));

  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  const prompt = handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  assert.match(prompt.reply, /续上|新开/);

  const resumed = handleOneBotMessage(makeEvent("续上"), { storageRoot });
  assert.equal(resumed.ok, true);
  assert.match(resumed.reply, /沿着这条继续|接回来了/);

  const stateAfterResume = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(stateAfterResume.reply, new RegExp(`SAN ${beforeSan - 4}\\/`));

  rmSync(storageRoot, { recursive: true, force: true });
});

test("combat and san commands return bounded fallback guidance for invalid input", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  prepareQuickfireInvestigator(storageRoot);

  const combatBeforeStart = handleOneBotMessage(makeEvent("/aikp combat attack"), { storageRoot });
  assert.equal(combatBeforeStart.ok, true);
  assert.match(combatBeforeStart.reply, /还没进战斗态/);

  const invalidSan = handleOneBotMessage(makeEvent("/aikp san ???"), { storageRoot });
  assert.equal(invalidSan.ok, true);
  assert.match(invalidSan.reply, /成功\/失败两档损失/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("multiplayer combat sorts by dex and blocks off-turn commands", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  prepareCombatParty(storageRoot, [
    { user_id: 9527, sender: { nickname: "阿青" } },
    { user_id: 7788, sender: { nickname: "老周" } }
  ]);
  rewriteSession(storageRoot, (session) => {
    const dexByName = { dogami: 50, 阿青: 80, 老周: 60 };
    for (const investigator of Object.values(session.investigators)) {
      investigator.attributes.DEX = dexByName[investigator.name] || investigator.attributes.DEX;
    }
  });

  const started = handleOneBotMessage(makeEvent("/aikp combat start"), { storageRoot });
  assert.equal(started.ok, true);
  assert.match(started.reply, /战斗顺序：1\.阿青\(DEX 80\) → 2\.老周\(DEX 60\) → 3\.dogami\(DEX 50\)/);

  const who = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.equal(who.ok, true);
  assert.match(who.reply, /阿青/);

  const blocked = handleOneBotMessage(makeEvent("/aikp combat attack"), { storageRoot });
  assert.equal(blocked.ok, true);
  assert.match(blocked.reply, /当前 spotlight 还在 阿青/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("multiplayer combat auto advances in initiative order and focus can override explicitly", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  prepareCombatParty(storageRoot, [
    { user_id: 9527, sender: { nickname: "阿青" } },
    { user_id: 7788, sender: { nickname: "老周" } }
  ]);
  rewriteSession(storageRoot, (session) => {
    const dexByName = { dogami: 50, 阿青: 80, 老周: 60 };
    for (const investigator of Object.values(session.investigators)) {
      investigator.attributes.DEX = dexByName[investigator.name] || investigator.attributes.DEX;
    }
  });

  handleOneBotMessage(makeEvent("/aikp combat start"), { storageRoot });

  const first = handleOneBotMessage(
    makeEvent("/aikp combat attack dodge", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: makeQueuedRandomInt([12, 88, 2], 2) }
  );
  assert.equal(first.ok, true);
  assert.match(first.reply, /战斗第 1 轮/);
  assert.match(first.reply, /当前 spotlight 还在 老周|老周 这边/);

  const secondWho = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.match(secondWho.reply, /老周/);

  const second = handleOneBotMessage(
    makeEvent("/aikp combat attack dodge", { user_id: 7788, sender: { nickname: "老周" } }),
    { storageRoot, randomInt: makeQueuedRandomInt([12, 88, 2], 2) }
  );
  assert.equal(second.ok, true);
  assert.match(second.reply, /当前 spotlight 还在 dogami|dogami 这边/);

  const focused = handleOneBotMessage(makeEvent("/aikp focus 阿青"), { storageRoot });
  assert.equal(focused.ok, true);
  assert.match(focused.reply, /阿青/);

  const afterFocus = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.match(afterFocus.reply, /阿青/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("combat current actor survives resume and different groups stay isolated", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  prepareCombatParty(storageRoot, [
    { user_id: 9527, sender: { nickname: "阿青" } }
  ]);
  rewriteSession(storageRoot, (session) => {
    const dexByName = { dogami: 50, 阿青: 80 };
    for (const investigator of Object.values(session.investigators)) {
      investigator.attributes.DEX = dexByName[investigator.name] || investigator.attributes.DEX;
    }
  });

  handleOneBotMessage(makeEvent("/aikp combat start"), { storageRoot });
  handleOneBotMessage(
    makeEvent("/aikp combat attack dodge", { user_id: 9527, sender: { nickname: "阿青" } }),
    { storageRoot, randomInt: makeQueuedRandomInt([12, 88, 2], 2) }
  );

  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  const resumed = handleOneBotMessage(makeEvent("续上"), { storageRoot });
  assert.equal(resumed.ok, true);

  const resumedWho = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.match(resumedWho.reply, /dogami/);
  const resumedState = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(resumedState.reply, /战斗：进行中｜第 2 轮/);

  prepareCombatParty(storageRoot, [
    { user_id: 8899, group_id: 95270002, sender: { nickname: "小李" } }
  ], { group_id: 95270002 });
  rewriteSession(storageRoot, (session) => {
    const dexByName = { dogami: 70, 小李: 40 };
    for (const investigator of Object.values(session.investigators)) {
      investigator.attributes.DEX = dexByName[investigator.name] || investigator.attributes.DEX;
    }
  }, { group_id: 95270002 });

  handleOneBotMessage(makeEvent("/aikp combat start", { group_id: 95270002 }), { storageRoot });
  const otherGroupWho = handleOneBotMessage(makeEvent("/aikp who", { group_id: 95270002 }), { storageRoot });
  assert.match(otherGroupWho.reply, /dogami/);

  const originalGroupWho = handleOneBotMessage(makeEvent("/aikp who"), { storageRoot });
  assert.match(originalGroupWho.reply, /dogami/);
  const originalGroupParty = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.match(originalGroupParty.reply, /阿青/);

  rmSync(storageRoot, { recursive: true, force: true });
});

test("state party npc and settlement panels surface wounds san thresholds inventory changes and survive resume", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-"));
  const opened = prepareQuickfireInvestigator(storageRoot);
  const actorId = Object.keys(opened.sessionState.investigators)[0];

  rewriteSession(storageRoot, (session) => {
    const investigator = session.investigators[actorId];
    investigator.resources.hp = 2;
    investigator.resources.hpMax = 2;
    investigator.resources.san = 20;
    investigator.resources.sanMax = 20;
    investigator.inventory = [...investigator.inventory, { name: "急救包", category: "tool", quantity: 1 }];
  });

  handleOneBotMessage(makeEvent("/aikp combat start"), { storageRoot });
  handleOneBotMessage(makeEvent("/aikp combat attack fight_back"), {
    storageRoot,
    randomInt: makeQueuedRandomInt([98, 12, 2], 2)
  });
  handleOneBotMessage(makeEvent("/aikp san 1 5"), {
    storageRoot,
    randomInt: () => 99
  });

  const state = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(state.reply, /重大伤/);
  assert.match(state.reply, /濒死/);
  assert.match(state.reply, /临时异常/);
  assert.match(state.reply, /长期异常/);
  assert.match(state.reply, /急救包x1/);
  assert.match(state.reply, /变动 .*急救包x1/);

  const party = handleOneBotMessage(makeEvent("/aikp party"), { storageRoot });
  assert.match(party.reply, /重大伤/);
  assert.match(party.reply, /濒死/);
  assert.match(party.reply, /急救包x1/);

  const npcs = handleOneBotMessage(makeEvent("/aikp npcs"), { storageRoot });
  assert.match(npcs.reply, /守墓人/);
  assert.match(npcs.reply, /物品/);

  handleOneBotMessage(makeEvent("先不跑了"), { storageRoot });
  handleOneBotMessage(makeEvent("我想跑团"), { storageRoot });
  handleOneBotMessage(makeEvent("续上"), { storageRoot });

  const resumedState = handleOneBotMessage(makeEvent("/aikp state"), { storageRoot });
  assert.match(resumedState.reply, /重大伤/);
  assert.match(resumedState.reply, /临时异常/);
  assert.match(resumedState.reply, /急救包x1/);

  const settle = handleOneBotMessage(makeEvent("/aikp settle"), { storageRoot });
  assert.match(settle.reply, /持续状态/);
  assert.match(settle.reply, /重大伤/);
  assert.match(settle.reply, /濒死/);
  assert.match(settle.reply, /急救包x1/);

  rmSync(storageRoot, { recursive: true, force: true });
});
