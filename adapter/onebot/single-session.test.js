const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { handleOneBotMessage, buildConversationKey } = require('./single-session');

function makeEvent(message, overrides = {}) {
  return {
    user_id: 281894872,
    group_id: 95270001,
    sender: { nickname: 'dogami' },
    message,
    ...overrides
  };
}

test('builds stable onebot conversation key', () => {
  assert.equal(buildConversationKey(makeEvent('hi')), 'onebot-group-95270001');
  assert.equal(buildConversationKey({ user_id: 123, message: 'hi' }), 'onebot-dm-123');
});

test('auto starts scenario and auto joins first speaker', () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'aikp-onebot-'));
  const result = handleOneBotMessage(makeEvent(''), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /已帮你入场|你已经在场里了/);
  assert.equal(result.sessionState.scene.meta.scenarioId, 'old-church-night');
  rmSync(storageRoot, { recursive: true, force: true });
});

test('routes old church natural language into scene action', () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'aikp-onebot-'));
  handleOneBotMessage(makeEvent(''), { storageRoot });
  const result = handleOneBotMessage(makeEvent('我借着手电去看祭坛背后的刮痕'), { storageRoot, randomInt: () => 28 });
  assert.equal(result.ok, true);
  assert.equal(result.action.kind, 'explore');
  assert.match(result.reply, /祭坛下面多半有个能开的口子|线头还在/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test('returns state summary command', () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'aikp-onebot-'));
  handleOneBotMessage(makeEvent(''), { storageRoot });
  const result = handleOneBotMessage(makeEvent('/aikp state'), { storageRoot });
  assert.equal(result.ok, true);
  assert.match(result.reply, /场景：/);
  assert.match(result.reply, /危险：/);
  rmSync(storageRoot, { recursive: true, force: true });
});

test('reset command rebuilds session state', () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'aikp-onebot-'));
  handleOneBotMessage(makeEvent('我借着手电去看祭坛背后的刮痕'), { storageRoot, randomInt: () => 28 });
  const before = handleOneBotMessage(makeEvent('/aikp state'), { storageRoot });
  assert.match(before.reply, /时间：5 分钟/);
  const reset = handleOneBotMessage(makeEvent('/aikp reset'), { storageRoot });
  assert.equal(reset.ok, true);
  const after = handleOneBotMessage(makeEvent('/aikp state'), { storageRoot });
  assert.match(after.reply, /时间：0 分钟/);
  rmSync(storageRoot, { recursive: true, force: true });
});
