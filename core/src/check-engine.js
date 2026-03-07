function rollD100(randomInt) {
  return randomInt(1, 100);
}

function rollDigit(randomInt) {
  return randomInt(0, 9);
}

function normalizeModifierDice(bonusDice = 0, penaltyDice = 0) {
  const bonus = Math.max(0, Number(bonusDice || 0));
  const penalty = Math.max(0, Number(penaltyDice || 0));
  return bonus - penalty;
}

function buildRollFromDigits(tensDigit, onesDigit) {
  const roll = (Number(tensDigit) * 10) + Number(onesDigit);
  return roll === 0 ? 100 : roll;
}

function chooseCandidateRoll(candidateRolls, modifierDice) {
  if (modifierDice > 0) {
    return candidateRolls.reduce((best, item) => (item.roll < best.roll ? item : best));
  }
  return candidateRolls.reduce((worst, item) => (item.roll > worst.roll ? item : worst));
}

function rollD100WithModifiers(randomInt, modifierDice) {
  if (!modifierDice) {
    return {
      roll: rollD100(randomInt),
      detail: null
    };
  }

  const onesDigit = rollDigit(randomInt);
  const tensCandidates = [];

  for (let index = 0; index < Math.abs(modifierDice) + 1; index += 1) {
    const tensDigit = rollDigit(randomInt);
    tensCandidates.push({
      tensDigit,
      onesDigit,
      roll: buildRollFromDigits(tensDigit, onesDigit)
    });
  }

  const chosen = chooseCandidateRoll(tensCandidates, modifierDice);
  return {
    roll: chosen.roll,
    detail: {
      modifierType: modifierDice > 0 ? "bonus" : "penalty",
      modifierCount: Math.abs(modifierDice),
      onesDigit,
      candidateRolls: tensCandidates,
      chosenTensDigit: chosen.tensDigit
    }
  };
}

function successLevel(roll, targetValue) {
  if (roll === 1) return "critical";
  if (roll === 100) return "fumble";

  if (roll > targetValue) return "fail";
  if (roll <= Math.floor(targetValue / 5)) return "extreme";
  if (roll <= Math.floor(targetValue / 2)) return "hard";
  return "regular";
}

function isSuccess(level) {
  return ["critical", "extreme", "hard", "regular"].includes(level);
}

function levelRank(level) {
  const rank = {
    fumble: -1,
    fail: 0,
    regular: 1,
    hard: 2,
    extreme: 3,
    critical: 4
  };
  return rank[level] ?? -1;
}

function defaultRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyDifficultyTarget(targetValue, difficulty) {
  if (difficulty === "hard") return Math.floor(targetValue / 2);
  if (difficulty === "extreme") return Math.floor(targetValue / 5);
  return targetValue;
}

function runCheck(input, randomInt = defaultRandomInt) {
  const effectiveTarget = applyDifficultyTarget(input.targetValue, input.difficulty || "regular");
  const modifierDice = normalizeModifierDice(input.bonusDice, input.penaltyDice);
  const { roll, detail } = rollD100WithModifiers(randomInt, modifierDice);
  const level = successLevel(roll, effectiveTarget);

  return {
    checkType: input.checkType || "normal",
    mode: input.mode || "open",
    skillKey: input.skillKey,
    difficulty: input.difficulty || "regular",
    baseTargetValue: input.targetValue,
    targetValue: effectiveTarget,
    roll,
    rollDetail: detail,
    result: {
      success: isSuccess(level),
      successLevel: level,
      margin: effectiveTarget - roll
    }
  };
}

function runOpposedCheck(actorCheck, opponentCheck) {
  const actorRank = levelRank(actorCheck.result.successLevel);
  const opponentRank = levelRank(opponentCheck.result.successLevel);

  if (actorRank > opponentRank) return "actor";
  if (opponentRank > actorRank) return "opponent";

  if (actorCheck.roll < opponentCheck.roll) return "actor";
  if (opponentCheck.roll < actorCheck.roll) return "opponent";
  return "draw";
}

module.exports = {
  runCheck,
  runOpposedCheck,
  normalizeModifierDice,
  buildRollFromDigits
};
