const WEAPON_TABLE = {
  unarmed: {
    key: 'unarmed',
    name: '徒手',
    skill: 'Fighting',
    damage: '1D3',
    range: 'melee',
    attacksPerRound: 1
  },
  knife: {
    key: 'knife',
    name: '小刀',
    skill: 'Fighting',
    damage: '1D4+2',
    range: 'melee',
    attacksPerRound: 1
  },
  club: {
    key: 'club',
    name: '棍棒',
    skill: 'Fighting',
    damage: '1D6',
    range: 'melee',
    attacksPerRound: 1
  },
  handgun: {
    key: 'handgun',
    name: '手枪',
    skill: 'Firearms',
    damage: '1D10',
    range: 'short',
    attacksPerRound: 1,
    malfunction: 100
  },
  shotgun: {
    key: 'shotgun',
    name: '霰弹枪',
    skill: 'Firearms',
    damage: '4D6/2D6/1D6',
    range: 'short-medium-long',
    attacksPerRound: 1,
    malfunction: 100
  }
};

function getWeaponProfile(key) {
  const weapon = WEAPON_TABLE[key];
  if (!weapon) throw new Error(`Unknown weapon key: ${key}`);
  return weapon;
}

function buildCombatActionFromWeapon(input = {}) {
  const weapon = getWeaponProfile(input.weaponKey || 'unarmed');
  return {
    attackSkill: input.attackSkill || weapon.skill,
    baseDamage: input.baseDamage || weapon.damage,
    weapon,
    damageBonusText: input.damageBonusText,
    defenseMode: input.defenseMode || 'dodge',
    counterBaseDamage: input.counterBaseDamage || '1D3'
  };
}

module.exports = {
  WEAPON_TABLE,
  getWeaponProfile,
  buildCombatActionFromWeapon
};
