const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");

const { handleOneBotEnvelope } = require("./runtime");
const { buildConversationKey } = require("./single-session");

const GROUP_ID = 95270001;
const BOT_ID = 114514;
const DOGAMI_ID = 281894872;
const AQING_ID = 9527;

function makeEnvelope(message, overrides = {}) {
  return {
    post_type: "message",
    message_type: "group",
    user_id: DOGAMI_ID,
    group_id: GROUP_ID,
    raw_message: `[CQ:at,qq=${BOT_ID}] ${message}`,
    sender: { nickname: "dogami" },
    ...overrides
  };
}

function readJsonLines(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8").trim();
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("runtime-level full session simulation covers a realistic multiplayer ai-kp flow", () => {
  const storageRoot = mkdtempSync(join(tmpdir(), "aikp-onebot-sim-"));
  const conversationKey = buildConversationKey({ group_id: GROUP_ID });
  const logsRoot = join(storageRoot, "logs", conversationKey);
  const chatLogFile = join(logsRoot, "chat", "events.jsonl");
  const ledgerLogFile = join(logsRoot, "ledger", "operations.jsonl");
  const playerLogDir = join(logsRoot, "players");
  const stateFile = join(logsRoot, "state", "latest.json");
  const contextFile = join(logsRoot, "context", "latest.json");
  const summaryDir = join(logsRoot, "summaries");

  function send(message, overrides = {}, options = {}) {
    return handleOneBotEnvelope(makeEnvelope(message, overrides), {
      storageRoot,
      includeContextPacket: true,
      summaryEventThreshold: 8,
      contextSummaryChunkLimit: 4,
      randomInt: options.randomInt
    });
  }

  const idle = send("今晚吃什么");
  assert.equal(idle.ok, true);
  assert.equal(idle.ignored, true);
  assert.equal(idle.reason, "inactive_group_session");

  const start = send("我想跑团");
  assert.equal(start.ok, true);
  assert.equal(start.ignored, false);
  assert.equal(start.routing.reason, "activation_intent");
  assert.match(start.replyText, /先别急着进场/);
  assert.match(start.replyText, /当前可选剧本/);

  const selectStoryPack = send("1");
  assert.equal(selectStoryPack.ok, true);
  assert.equal(selectStoryPack.ignored, false);
  assert.equal(selectStoryPack.routing.reason, "pending_storypack_choice");
  assert.match(selectStoryPack.replyText, /这次先跑《旧教堂异响》/);
  assert.match(selectStoryPack.replyText, /你现在还没车卡/);
  assert.doesNotMatch(selectStoryPack.replyText, /门一推开/);

  const joiner = send("我也来", { user_id: AQING_ID, sender: { nickname: "阿青" } });
  assert.equal(joiner.ok, false);
  assert.equal(joiner.ignored, false);
  assert.equal(joiner.routing.reason, "active_session");
  assert.equal(joiner.reason, "missing_investigator");
  assert.match(joiner.replyText, /你还没车卡喔/);

  const partyRoll = send("我想一次全车完卡，角色选记者", {}, { randomInt: () => 3 });
  assert.equal(partyRoll.ok, true);
  assert.equal(partyRoll.ignored, false);
  assert.equal(partyRoll.routing.reason, "active_session");
  assert.match(partyRoll.replyText, /批量做了 传统随机车卡/);
  assert.match(partyRoll.replyText, /dogami/);
  assert.match(partyRoll.replyText, /阿青/);
  assert.match(partyRoll.replyText, /STR 9->45/);

  const partyPanel = send("/aikp party");
  assert.equal(partyPanel.ok, true);
  assert.match(partyPanel.replyText, /队伍面板｜第 1 轮/);
  assert.match(partyPanel.replyText, /👉 dogami/);
  assert.match(partyPanel.replyText, /阿青/);

  const sheetDogami = send("/aikp sheet");
  assert.match(sheetDogami.replyText, /dogami｜记者/);
  assert.match(sheetDogami.replyText, /Spot Hidden 65/);

  const sheetAqing = send("/aikp sheet", { user_id: AQING_ID, sender: { nickname: "阿青" } });
  assert.match(sheetAqing.replyText, /阿青｜记者/);
  assert.match(sheetAqing.replyText, /Listen 60/);

  const whoBefore = send("/aikp who");
  assert.match(whoBefore.replyText, /现在轮到 dogami/);

  const explore = send("我借着手电去看祭坛背后的刮痕", {}, { randomInt: () => 28 });
  assert.equal(explore.ok, true);
  assert.equal(explore.action.kind, "explore");
  assert.match(explore.replyText, /暗骰：Spot Hidden/);
  assert.match(explore.replyText, /祭坛背后的异常刮痕/);
  assert.match(explore.replyText, /时间 \+5/);

  const cluesAfterExplore = send("/aikp clues");
  assert.match(cluesAfterExplore.replyText, /线索面板/);
  assert.match(cluesAfterExplore.replyText, /祭坛背后的异常刮痕/);

  const next = send("/aikp next");
  assert.match(next.replyText, /下一位是 阿青/);

  const whoAfterNext = send("/aikp who");
  assert.match(whoAfterNext.replyText, /现在轮到 阿青/);

  const talk = send(
    "我先安抚守墓人，再把话慢慢引到昨晚的钟声上",
    { user_id: AQING_ID, sender: { nickname: "阿青" } },
    { randomInt: () => 15 }
  );
  assert.equal(talk.ok, true);
  assert.equal(talk.action.kind, "talk");
  assert.match(talk.replyText, /投掷：15（目标 20，regular）/);
  assert.match(talk.replyText, /守墓人 觉得你至少是在讲道理/);
  assert.match(talk.replyText, /trust 0→1/);

  const npcPanel = send("/aikp npcs");
  assert.match(npcPanel.replyText, /NPC 面板/);
  assert.match(npcPanel.replyText, /守墓人｜态度 neutral｜trust 1/);

  const recap = send("/aikp recap");
  assert.match(recap.replyText, /阶段总结：/);
  assert.match(recap.replyText, /祭坛背后的异常刮痕/);

  const hooks = send("/aikp hooks");
  assert.match(hooks.replyText, /withdraw-with-clues/);
  assert.match(hooks.replyText, /eligible/);

  const advance = send("/aikp advance");
  assert.equal(advance.ok, true);
  assert.match(advance.replyText, /bell-tower-followup/);
  assert.match(advance.replyText, /旧教堂异响/);

  const campaign = send("/aikp campaign");
  assert.match(campaign.replyText, /当前场景：bell-tower-followup/);

  const scene = send("/aikp scene");
  assert.match(scene.replyText, /场景环境：钟楼余响/);
  assert.match(scene.replyText, /旧木楼梯/);

  const towerListen = send(
    "我先停在楼梯口，听听上面是不是有动静",
    { user_id: AQING_ID, sender: { nickname: "阿青" } },
    { randomInt: () => 18 }
  );
  assert.equal(towerListen.ok, true);
  assert.equal(towerListen.action.kind, "explore");
  assert.match(towerListen.replyText, /投掷：18（目标 60，hard）/);
  assert.match(towerListen.replyText, /钟楼里残留的人为回响|楼上确实留过人活动后的余波/);

  const towerRope = send("我想看看钟绳有没有被人新近碰过", {}, { randomInt: () => 24 });
  assert.equal(towerRope.ok, true);
  assert.equal(towerRope.action.kind, "explore");
  assert.match(towerRope.replyText, /投掷：24（目标 65，hard）/);
  assert.match(towerRope.replyText, /被动过的钟绳/);

  const cluesInTower = send("/aikp clues");
  assert.match(cluesInTower.replyText, /被动过的钟绳/);
  assert.match(cluesInTower.replyText, /钟室角落的翻动痕迹/);

  const settle = send("/aikp settle");
  assert.match(settle.replyText, /时间推进到 20 分钟/);
  assert.match(settle.replyText, /线索共拿到 2 条/);
  assert.match(settle.replyText, /核心线索 1 条/);

  const exit = send("先不跑了");
  assert.equal(exit.ok, true);
  assert.equal(exit.ignored, false);
  assert.match(exit.replyText, /这局我先帮你收住啦/);

  const ignoredAfterExit = send("那等会儿打别的游戏");
  assert.equal(ignoredAfterExit.ok, true);
  assert.equal(ignoredAfterExit.ignored, true);
  assert.equal(ignoredAfterExit.reason, "inactive_group_session");

  const restart = send("我想跑团");
  assert.equal(restart.ok, true);
  assert.equal(restart.ignored, false);
  assert.equal(restart.routing.reason, "activation_intent");
  assert.match(restart.replyText, /已经有旧档了/);
  assert.match(restart.replyText, /线索 2 条/);

  const listChoice = send("看看存档");
  assert.equal(listChoice.ok, true);
  assert.equal(listChoice.ignored, false);
  assert.equal(listChoice.routing.reason, "pending_resume_choice");
  assert.match(listChoice.replyText, /当前可用存档：/);
  assert.match(listChoice.replyText, /current｜钟楼余响/);

  const fresh = send("新开");
  assert.equal(fresh.ok, true);
  assert.equal(fresh.ignored, false);
  assert.equal(fresh.routing.reason, "pending_resume_choice");
  assert.match(fresh.replyText, /旧档我先收成 save-/);

  const freshState = send("/aikp state");
  assert.match(freshState.replyText, /时间：0 分钟/);
  assert.match(freshState.replyText, /夜探旧教堂/);

  const saves = send("/aikp saves");
  assert.match(saves.replyText, /save-\d{4}-\d+/);
  const saveId = saves.replyText.match(/save-\d{4}-\d+/)?.[0];
  assert.ok(saveId);

  const resume = send(`/aikp resume ${saveId}`);
  assert.equal(resume.ok, true);
  assert.equal(resume.ignored, false);
  assert.match(resume.replyText, new RegExp(saveId));
  assert.match(resume.replyText, /钟楼门板旧得发涩/);

  const restoredState = send("/aikp state");
  assert.match(restoredState.replyText, /场景：钟楼余响/);
  assert.match(restoredState.replyText, /时间：20 分钟/);
  assert.match(restoredState.replyText, /被动过的钟绳、钟室角落的翻动痕迹/);

  assert.equal(existsSync(chatLogFile), true);
  assert.equal(existsSync(ledgerLogFile), true);
  assert.equal(existsSync(join(playerLogDir, `user-${DOGAMI_ID}.jsonl`)), true);
  assert.equal(existsSync(join(playerLogDir, `user-${AQING_ID}.jsonl`)), true);
  assert.equal(existsSync(stateFile), true);
  assert.equal(existsSync(contextFile), true);
  assert.equal(existsSync(summaryDir), true);

  const chatEvents = readJsonLines(chatLogFile);
  assert.ok(chatEvents.length >= 40);
  assert.equal(chatEvents[0].direction, "inbound");
  assert.equal(chatEvents[1].direction, "outbound");
  assert.ok(chatEvents.some((event) => event.message.includes("我想看看钟绳有没有被人新近碰过")));
  assert.ok(chatEvents.some((event) => event.message.includes("钟楼门板旧得发涩")));

  const ledgerEvents = readJsonLines(ledgerLogFile);
  const ledgerKinds = new Set(ledgerEvents.map((event) => event.kind));
  assert.ok(ledgerKinds.has("session.enter"));
  assert.ok(ledgerKinds.has("character.created"));
  assert.ok(ledgerKinds.has("scene.action"));
  assert.ok(ledgerKinds.has("campaign.advance"));
  assert.ok(ledgerKinds.has("session.exit"));
  assert.ok(ledgerKinds.has("session.resume_prompt"));
  assert.ok(ledgerKinds.has("session.resume"));
  assert.ok(ledgerKinds.has("summary.rollup"));

  const dogamiPlayerEvents = readJsonLines(join(playerLogDir, `user-${DOGAMI_ID}.jsonl`));
  const aqingPlayerEvents = readJsonLines(join(playerLogDir, `user-${AQING_ID}.jsonl`));
  assert.ok(dogamiPlayerEvents.some((event) => event.kind === "character.created"));
  assert.ok(dogamiPlayerEvents.some((event) => event.kind === "session.resume"));
  assert.ok(aqingPlayerEvents.some((event) => event.kind === "scene.action"));

  const stateSnapshot = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(stateSnapshot.sessionMode, "kp");
  assert.equal(stateSnapshot.scene.summary, "钟楼余响");
  assert.equal(stateSnapshot.scene.timelineMinute, 20);
  assert.deepEqual(stateSnapshot.revealedClues, ["被动过的钟绳", "钟室角落的翻动痕迹"]);

  const contextSnapshot = JSON.parse(readFileSync(contextFile, "utf8"));
  assert.equal(contextSnapshot.logPaths.chat, chatLogFile);
  assert.equal(contextSnapshot.logPaths.ledger, ledgerLogFile);
  assert.match(contextSnapshot.injectionText, /\[AI-KP Runtime Prompt\]/);
  assert.match(contextSnapshot.injectionText, /\[Summary Chunks\]/);
  assert.match(contextSnapshot.injectionText, /\[Raw Log Paths\]/);
  assert.match(contextSnapshot.injectionText, /钟楼余响/);
  assert.match(contextSnapshot.injectionText, /被动过的钟绳/);

  const summaryFiles = readdirSync(summaryDir);
  assert.ok(summaryFiles.length >= 4);
  const latestSummary = readFileSync(join(summaryDir, summaryFiles.at(-1)), "utf8");
  assert.match(latestSummary, /AI-KP Summary/);
  assert.match(latestSummary, /钟楼余响|旧档我先收成/);

  rmSync(storageRoot, { recursive: true, force: true });
});
