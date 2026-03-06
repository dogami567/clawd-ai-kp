function rollFormula(formula, randomInt) {
  const text = String(formula || '1').trim().toUpperCase();
  const match = text.match(/^(\d+)D(\d+)([+-]\d+)?$/);
  if (!match) {
    const flat = Number(text);
    return { total: Number.isFinite(flat) ? flat : 0, rolls: [], modifier: 0, formula: text };
  }

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = Number(match[3] || 0);
  const rolls = [];
  for (let index = 0; index < count; index += 1) {
    rolls.push(randomInt(1, sides));
  }

  return {
    formula: text,
    rolls,
    modifier,
    total: rolls.reduce((sum, value) => sum + value, 0) + modifier
  };
}

function normalizeDamageFormula(baseDamage, damageBonusText) {
  const base = typeof baseDamage === 'string' ? baseDamage : String(baseDamage || 1);
  const bonus = damageBonusText || '0';
  if (!bonus || bonus === '0') return base;
  if (/^[+-]/.test(bonus)) return `${base}${bonus}`;
  return `${base}+${bonus}`;
}

function determineMajorWound(damage, hpMax) {
  return Number(damage || 0) >= Math.floor(Number(hpMax || 0) / 2);
}

function applyDamage(target, damage) {
  target.resources.hp = Math.max(0, Number(target.resources.hp || 0) - Number(damage || 0));
  const majorWound = determineMajorWound(damage, target.resources.hpMax);
  if (majorWound) target.status.majorWound = true;
  if (target.resources.hp === 0) {
    target.status.conditions = Array.isArray(target.status.conditions) ? target.status.conditions : [];
    if (!target.status.conditions.includes('dying')) target.status.conditions.push('dying');
  }
  return {
    hpNow: target.resources.hp,
    majorWound,
    dying: target.resources.hp === 0
  };
}

module.exports = {
  rollFormula,
  normalizeDamageFormula,
  determineMajorWound,
  applyDamage
};
