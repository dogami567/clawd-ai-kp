function floorDivide(value, divisor) {
  return Math.floor(value / divisor);
}

function calculateHalfAndFifth(value) {
  return {
    value,
    half: floorDivide(value, 2),
    fifth: floorDivide(value, 5)
  };
}

function calculateDamageBonusAndBuild(str, siz) {
  const total = str + siz;

  if (total <= 64) return { damageBonus: -2, damageBonusText: "-2", build: -2 };
  if (total <= 84) return { damageBonus: -1, damageBonusText: "-1", build: -1 };
  if (total <= 124) return { damageBonus: 0, damageBonusText: "0", build: 0 };
  if (total <= 164) return { damageBonus: null, damageBonusText: "+1D4", build: 1 };
  if (total <= 204) return { damageBonus: null, damageBonusText: "+1D6", build: 2 };

  return { damageBonus: null, damageBonusText: "+2D6", build: 3 };
}

function calculateBaseMoveRate({ str, dex, siz }) {
  if (dex > siz && str > siz) return 9;
  if (dex < siz && str < siz) return 7;
  return 8;
}

function calculateAgeAdjustedMoveRate(baseMoveRate, age) {
  if (!Number.isInteger(age) || age < 40) return baseMoveRate;
  if (age < 50) return Math.max(1, baseMoveRate - 1);
  if (age < 60) return Math.max(1, baseMoveRate - 2);
  if (age < 70) return Math.max(1, baseMoveRate - 3);
  if (age < 80) return Math.max(1, baseMoveRate - 4);
  return Math.max(1, baseMoveRate - 5);
}

function buildAgeAdjustments(age) {
  if (!Number.isInteger(age)) {
    return {
      movementPenalty: 0,
      eduImprovementChecks: 0,
      luckRerolls: 0,
      buildPenalty: 0,
      notes: []
    };
  }

  const notes = [];
  let movementPenalty = 0;
  let eduImprovementChecks = 0;
  let luckRerolls = 0;
  let buildPenalty = 0;

  if (age >= 40 && age < 50) {
    movementPenalty = 1;
    eduImprovementChecks = 1;
    notes.push("40-49 岁：MOV -1，创建时可做 1 次 EDU 提升检定。");
  } else if (age >= 50 && age < 60) {
    movementPenalty = 2;
    eduImprovementChecks = 2;
    notes.push("50-59 岁：MOV -2，创建时可做 2 次 EDU 提升检定。");
  } else if (age >= 60 && age < 70) {
    movementPenalty = 3;
    eduImprovementChecks = 3;
    buildPenalty = 1;
    notes.push("60-69 岁：MOV -3，创建时可做 3 次 EDU 提升检定，并应考虑体能衰退。");
  } else if (age >= 70 && age < 80) {
    movementPenalty = 4;
    eduImprovementChecks = 4;
    buildPenalty = 2;
    notes.push("70-79 岁：MOV -4，创建时可做 4 次 EDU 提升检定，并附带更明显体能衰退。");
  } else if (age >= 80) {
    movementPenalty = 5;
    eduImprovementChecks = 4;
    buildPenalty = 2;
    notes.push("80+：MOV -5，创建时可做 4 次 EDU 提升检定，并附带更明显体能衰退。");
  } else if (age >= 20 && age < 40) {
    notes.push("20-39 岁：无额外 MOV 惩罚。");
  } else if (age >= 15 && age < 20) {
    luckRerolls = 1;
    buildPenalty = 1;
    notes.push("15-19 岁：建议进行 Luck 重掷取高，并承受一定体格/教育限制。");
  }

  return {
    movementPenalty,
    eduImprovementChecks,
    luckRerolls,
    buildPenalty,
    notes
  };
}

function calculateDerivedStats(attributes, options = {}) {
  const hp = floorDivide(attributes.CON + attributes.SIZ, 10);
  const mp = floorDivide(attributes.POW, 5);
  const san = attributes.POW;
  const luck = attributes.Luck ?? 50;
  const db = calculateDamageBonusAndBuild(attributes.STR, attributes.SIZ);
  const ageAdjustments = buildAgeAdjustments(options.age);
  const baseMoveRate = calculateBaseMoveRate({ str: attributes.STR, dex: attributes.DEX, siz: attributes.SIZ });
  const moveRate = calculateAgeAdjustedMoveRate(baseMoveRate, options.age);

  return {
    hp,
    hpMax: hp,
    mp,
    mpMax: mp,
    san,
    sanMax: 99,
    luck,
    baseMoveRate,
    moveRate,
    build: db.build,
    ageAdjustments,
    damageBonus: db.damageBonus,
    damageBonusText: db.damageBonusText
  };
}

module.exports = {
  calculateHalfAndFifth,
  calculateDamageBonusAndBuild,
  calculateBaseMoveRate,
  calculateAgeAdjustedMoveRate,
  buildAgeAdjustments,
  calculateDerivedStats
};
