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

function calculateMoveRate({ str, dex, siz }) {
  if (dex > siz && str > siz) return 9;
  if (dex < siz && str < siz) return 7;
  return 8;
}

function calculateDerivedStats(attributes) {
  const hp = floorDivide(attributes.CON + attributes.SIZ, 10);
  const mp = floorDivide(attributes.POW, 5);
  const san = attributes.POW;
  const luck = attributes.Luck ?? 50;
  const db = calculateDamageBonusAndBuild(attributes.STR, attributes.SIZ);
  const moveRate = calculateMoveRate({ str: attributes.STR, dex: attributes.DEX, siz: attributes.SIZ });

  return {
    hp,
    hpMax: hp,
    mp,
    mpMax: mp,
    san,
    sanMax: 99,
    luck,
    moveRate,
    build: db.build,
    damageBonus: db.damageBonus,
    damageBonusText: db.damageBonusText
  };
}

module.exports = {
  calculateHalfAndFifth,
  calculateDamageBonusAndBuild,
  calculateMoveRate,
  calculateDerivedStats
};