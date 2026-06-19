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

  /** 隣接しているか（8方向） */
  static isAdjacent(a, b) {
    return Math.abs(a.position.x - b.position.x) <= 1 &&
           Math.abs(a.position.y - b.position.y) <= 1 &&
           !(a.position.x === b.position.x && a.position.y === b.position.y);
  }
}
