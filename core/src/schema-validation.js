function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, path) {
  assertCondition(typeof value === "string" && value.length > 0, `${path} must be a non-empty string`);
}

function assertInteger(value, path, options = {}) {
  assertCondition(Number.isInteger(value), `${path} must be an integer`);
  if (options.min !== undefined) assertCondition(value >= options.min, `${path} must be >= ${options.min}`);
  if (options.max !== undefined) assertCondition(value <= options.max, `${path} must be <= ${options.max}`);
}

function assertBoolean(value, path) {
  assertCondition(typeof value === "boolean", `${path} must be a boolean`);
}

function assertArray(value, path) {
  assertCondition(Array.isArray(value), `${path} must be an array`);
}

function assertObject(value, path) {
  assertCondition(isPlainObject(value), `${path} must be an object`);
}

function validateAttributeBlock(block, path) {
  assertObject(block, path);
  assertInteger(block.value, `${path}.value`, { min: 0, max: 100 });
  assertInteger(block.half, `${path}.half`, { min: 0, max: 100 });
  assertInteger(block.fifth, `${path}.fifth`, { min: 0, max: 100 });
}

function validateInvestigatorCard(card) {
  assertObject(card, "investigator");
  assertString(card.id, "investigator.id");
  assertString(card.name, "investigator.name");
  assertInteger(card.age, "investigator.age", { min: 10, max: 120 });
  assertString(card.occupation, "investigator.occupation");
  assertString(card.occupationKey, "investigator.occupationKey");
  assertString(card.persona, "investigator.persona");

  assertObject(card.identity, "investigator.identity");
  assertString(card.identity.residence, "investigator.identity.residence");
  assertString(card.identity.birthplace, "investigator.identity.birthplace");
  assertInteger(card.identity.creditRating, "investigator.identity.creditRating", { min: 0, max: 99 });

  assertObject(card.attributes, "investigator.attributes");
  for (const key of ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU"]) {
    assertInteger(card.attributes[key], `investigator.attributes.${key}`, { min: 1, max: 99 });
  }

  assertObject(card.attributeChecks, "investigator.attributeChecks");
  for (const key of ["STR", "CON", "DEX", "APP", "POW", "INT", "SIZ", "EDU", "Luck"]) {
    validateAttributeBlock(card.attributeChecks[key], `investigator.attributeChecks.${key}`);
  }

  assertArray(card.skills, "investigator.skills");
  assertCondition(card.skills.length > 0, "investigator.skills must not be empty");
  card.skills.forEach((skill, index) => {
    assertObject(skill, `investigator.skills[${index}]`);
    assertString(skill.key, `investigator.skills[${index}].key`);
    assertInteger(skill.value, `investigator.skills[${index}].value`, { min: 0, max: 99 });
    if (skill.baseValue !== undefined) assertInteger(skill.baseValue, `investigator.skills[${index}].baseValue`, { min: 0, max: 99 });
  });

  assertObject(card.resources, "investigator.resources");
  assertInteger(card.resources.hp, "investigator.resources.hp", { min: 0 });
  assertInteger(card.resources.hpMax, "investigator.resources.hpMax", { min: 1 });
  assertInteger(card.resources.san, "investigator.resources.san", { min: 0, max: 99 });
  assertInteger(card.resources.sanMax, "investigator.resources.sanMax", { min: 1, max: 99 });
  assertInteger(card.resources.luck, "investigator.resources.luck", { min: 0, max: 99 });

  assertArray(card.inventory, "investigator.inventory");
  card.inventory.forEach((item, index) => {
    assertObject(item, `investigator.inventory[${index}]`);
    assertString(item.name, `investigator.inventory[${index}].name`);
    assertString(item.category, `investigator.inventory[${index}].category`);
  });

  assertObject(card.skillAllocation, "investigator.skillAllocation");
  assertInteger(card.skillAllocation.occupationSpent, "investigator.skillAllocation.occupationSpent", { min: 0 });
  assertInteger(card.skillAllocation.occupationBudget, "investigator.skillAllocation.occupationBudget", { min: 0 });
  assertInteger(card.skillAllocation.interestSpent, "investigator.skillAllocation.interestSpent", { min: 0 });
  assertInteger(card.skillAllocation.interestBudget, "investigator.skillAllocation.interestBudget", { min: 0 });
  assertBoolean(card.skillAllocation.valid, "investigator.skillAllocation.valid");

  assertObject(card.finance, "investigator.finance");
  assertCondition(typeof card.finance.cash === "number" && card.finance.cash >= 0, "investigator.finance.cash must be >= 0");
  assertCondition(typeof card.finance.assets === "number" && card.finance.assets >= 0, "investigator.finance.assets must be >= 0");
  assertCondition(typeof card.finance.spendingLevel === "number" && card.finance.spendingLevel >= 0, "investigator.finance.spendingLevel must be >= 0");

  assertObject(card.backstory, "investigator.backstory");
  for (const key of ["traits", "beliefs", "significantPeople", "meaningfulLocations", "treasuredPossessions", "injuriesScars", "phobiasManias"]) {
    assertArray(card.backstory[key], `investigator.backstory.${key}`);
  }

  assertObject(card.status, "investigator.status");
  assertArray(card.status.conditions, "investigator.status.conditions");
  if (card.status.majorWound !== undefined) assertBoolean(card.status.majorWound, "investigator.status.majorWound");
  if (card.status.temporaryInsanity !== undefined) assertBoolean(card.status.temporaryInsanity, "investigator.status.temporaryInsanity");
  if (card.status.indefiniteInsanity !== undefined) assertBoolean(card.status.indefiniteInsanity, "investigator.status.indefiniteInsanity");

  return true;
}

function validateCountdown(countdown, path) {
  assertObject(countdown, path);
  assertString(countdown.key, `${path}.key`);
  assertInteger(countdown.remaining, `${path}.remaining`, { min: 0 });
  assertString(countdown.unit, `${path}.unit`);
}

function validateSceneState(scene) {
  assertObject(scene, "scene");
  assertString(scene.sessionId, "scene.sessionId");
  assertString(scene.sceneId, "scene.sceneId");
  assertString(scene.sceneType, "scene.sceneType");

  assertObject(scene.timeState, "scene.timeState");
  assertInteger(scene.timeState.timelineMinute, "scene.timeState.timelineMinute", { min: 0 });
  assertInteger(scene.timeState.combatRound, "scene.timeState.combatRound", { min: 0 });
  assertArray(scene.timeState.countdowns, "scene.timeState.countdowns");
  scene.timeState.countdowns.forEach((countdown, index) => validateCountdown(countdown, `scene.timeState.countdowns[${index}]`));

  assertObject(scene.participants, "scene.participants");
  assertArray(scene.participants.investigators, "scene.participants.investigators");
  assertArray(scene.participants.npcs, "scene.participants.npcs");
  scene.participants.npcs.forEach((npc, index) => {
    assertObject(npc, `scene.participants.npcs[${index}]`);
    assertString(npc.id, `scene.participants.npcs[${index}].id`);
    assertString(npc.name, `scene.participants.npcs[${index}].name`);
    assertString(npc.attitude, `scene.participants.npcs[${index}].attitude`);
    assertString(npc.status, `scene.participants.npcs[${index}].status`);
  });

  assertArray(scene.clues, "scene.clues");
  scene.clues.forEach((clue, index) => {
    assertObject(clue, `scene.clues[${index}]`);
    assertString(clue.id, `scene.clues[${index}].id`);
    assertString(clue.title, `scene.clues[${index}].title`);
    assertString(clue.kind, `scene.clues[${index}].kind`);
    assertBoolean(clue.revealed, `scene.clues[${index}].revealed`);
  });

  assertArray(scene.events, "scene.events");
  scene.events.forEach((event, index) => {
    assertObject(event, `scene.events[${index}]`);
    assertString(event.id, `scene.events[${index}].id`);
    assertString(event.label, `scene.events[${index}].label`);
    assertBoolean(event.triggered, `scene.events[${index}].triggered`);
  });

  assertObject(scene.threats, "scene.threats");
  assertInteger(scene.threats.exposure, "scene.threats.exposure", { min: 0, max: 10 });
  assertInteger(scene.threats.pressure, "scene.threats.pressure", { min: 0, max: 10 });
  assertString(scene.threats.dangerLevel, "scene.threats.dangerLevel");

  assertArray(scene.nextOptions, "scene.nextOptions");
  scene.nextOptions.forEach((option, index) => {
    assertObject(option, `scene.nextOptions[${index}]`);
    assertString(option.id, `scene.nextOptions[${index}].id`);
    assertString(option.label, `scene.nextOptions[${index}].label`);
    assertString(option.type, `scene.nextOptions[${index}].type`);
  });

  return true;
}

function validateCheckEvent(event) {
  assertObject(event, "checkEvent");
  assertString(event.id, "checkEvent.id");
  assertString(event.sessionId, "checkEvent.sessionId");
  assertString(event.actorId, "checkEvent.actorId");
  assertString(event.checkType, "checkEvent.checkType");
  assertString(event.skillKey, "checkEvent.skillKey");
  assertInteger(event.targetValue, "checkEvent.targetValue", { min: 0, max: 99 });
  assertInteger(event.roll, "checkEvent.roll", { min: 1, max: 100 });
  assertObject(event.result, "checkEvent.result");
  assertBoolean(event.result.success, "checkEvent.result.success");
  assertString(event.result.successLevel, "checkEvent.result.successLevel");
  assertObject(event.outcome, "checkEvent.outcome");
  assertString(event.outcome.narrative, "checkEvent.outcome.narrative");
  assertArray(event.outcome.cost, "checkEvent.outcome.cost");
  assertArray(event.outcome.stateChanges, "checkEvent.outcome.stateChanges");
  assertString(event.timestamp, "checkEvent.timestamp");
  return true;
}

function validateSessionState(sessionState) {
  assertObject(sessionState, "sessionState");
  assertString(sessionState.sessionId, "sessionState.sessionId");
  validateSceneState(sessionState.scene);
  assertObject(sessionState.investigators, "sessionState.investigators");
  Object.values(sessionState.investigators).forEach((investigator) => validateInvestigatorCard(investigator));
  assertArray(sessionState.checkLog, "sessionState.checkLog");
  sessionState.checkLog.forEach((event) => validateCheckEvent(event));
  return true;
}

module.exports = {
  validateInvestigatorCard,
  validateSceneState,
  validateCheckEvent,
  validateSessionState
};
