/**
 * BattleSystem - 戦闘計算ロジック
 *  プレイヤー・敵・仲間で共通して使う純粋関数群
 *  Phaserへの依存なし
 */
export class BattleSystem {
  /**
   * 通常攻撃ダメージ計算
   * ダメージ = max(1, 攻撃者ATK - 防御者DEF) ± ぶれ10%
   */
  static calcDamage(attacker, defender) {
    const base = Math.max(1, attacker.attack - defender.defense);
    const variance = Math.floor(base * 0.1);
    const roll = Math.floor(Math.random() * (variance * 2 + 1)) - variance;
    return Math.max(1, base + roll);
  }

  /**
   * 攻撃を適用してダメージ量を返す
   * defender.hp を直接書き換える
   */
  static applyAttack(attacker, defender) {
    const dmg = BattleSystem.calcDamage(attacker, defender);
    defender.hp = Math.max(0, defender.hp - dmg);
    return dmg;
  }

  /**
   * 技ダメージ計算
   * ダメージ = max(1, skill.power + 攻撃者ATK/2 - 防御者DEF) ± ぶれ10%
   */
  static calcSkillDamage(attacker, defender, skill) {
    const base = Math.max(1, skill.power + Math.floor(attacker.attack / 2) - defender.defense);
    const variance = Math.floor(base * 0.1);
    const roll = Math.floor(Math.random() * (variance * 2 + 1)) - variance;
    return Math.max(1, base + roll);
  }

  /**
   * 技を適用する
   * @param {object} user - 使用者
   * @param {object[]} targets - 対象リスト（rangeによって複数になる）
   * @param {object} skill - 技スロット
   * @returns {{ dmgList: {target, dmg}[], healAmt: number }}
   */
  static applySkill(user, targets, skill) {
    const result = { dmgList: [], healAmt: 0 };

    if (skill.type === 'heal') {
      const amt = Math.floor(skill.power + user.defense);
      user.hp = Math.min(user.maxHp, user.hp + amt);
      result.healAmt = amt;
    } else {
      for (const target of targets) {
        const dmg = BattleSystem.calcSkillDamage(user, target, skill);
        target.hp = Math.max(0, target.hp - dmg);
        result.dmgList.push({ target, dmg });
      }
    }

    // PP消費
    skill.pp = Math.max(0, skill.pp - 1);

    return result;
  }

  /**
   * 経験値取得量を計算（レベル差補正あり）
   * baseExp * (1 + (enemyLevel - myLevel) * 0.1)  ※最低1
   */
  static calcExp(baseExp, myLevel, enemyLevel) {
    const rate = 1 + (enemyLevel - myLevel) * 0.1;
    return Math.max(1, Math.floor(baseExp * rate));
  }

  /** 隣接しているか（8方向） */
  static isAdjacent(a, b) {
    return Math.abs(a.position.x - b.position.x) <= 1 &&
           Math.abs(a.position.y - b.position.y) <= 1 &&
           !(a.position.x === b.position.x && a.position.y === b.position.y);
  }
}
