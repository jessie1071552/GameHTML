/**
 * Ally - 仲間エンティティ（ロジックのみ、描画はGameSceneが担当）
 * Enemy.jsと同じキャラクター定義（BASE_STATS）を共有し、
 * type: "ally" として区別する。
 */

let _idCounter = 0;

export class Ally {
  /**
   * @param {string} characterId - キャラ種別ID（敵だった時のcharacterIdを引き継ぐ）
   * @param {{x:number, y:number}} position
   * @param {number} level
   */
  constructor(characterId, position, level = 1) {
    this.instanceId  = `ally_${++_idCounter}`;
    this.characterId = characterId;
    this.type        = 'ally';
    this.level       = level;
    this.exp         = 0;

    const base = Ally.BASE_STATS[characterId] ?? Ally.BASE_STATS['slime'];
    this.maxHp   = base.hp  + base.hpGrow  * (level - 1);
    this.hp      = this.maxHp;
    this.attack  = base.atk + base.atkGrow * (level - 1);
    this.defense = base.def + base.defGrow * (level - 1);

    this.position = { ...position };

    // 指示コマンド: follow(追従) | wait(待機) | attack(積極攻撃)
    this.command = 'follow';
  }

  get isDead() { return this.hp <= 0; }

  /**
   * 敵から変換してAllyインスタンスを作る
   * （ステータスは引き継がず、Allyの基準値で再計算する）
   */
  static fromEnemy(enemy) {
    return new Ally(enemy.characterId, { ...enemy.position }, enemy.level);
  }

  // ──────────────────────────────────────────────────────────
  //  AI: コマンドに応じて次の行動を決定する
  //
  //  @param {{x:number,y:number}} playerPos
  //  @param {Array<{instanceId,position,isDead}>} enemies - 敵一覧
  //  @param {(x:number,y:number)=>boolean} isWalkable
  //  @param {(x:number,y:number)=>boolean} isOccupied - 他の仲間・敵・プレイヤーがいるか
  //  @returns {{type:'move', x:number, y:number} | {type:'attack', target:object} | null}
  //   null = その場で何もしない
  // ──────────────────────────────────────────────────────────
  decideAction(playerPos, enemies, isWalkable, isOccupied) {
    const aliveEnemies = enemies.filter(e => !e.isDead);

    switch (this.command) {
      case 'wait':
        return this._waitBehavior(aliveEnemies);
      case 'attack':
        return this._attackBehavior(aliveEnemies, isWalkable, isOccupied);
      case 'follow':
      default:
        return this._followBehavior(playerPos, aliveEnemies, isWalkable, isOccupied);
    }
  }

  // ── wait: その場から動かない。隣接した敵には反撃する ─────────
  _waitBehavior(enemies) {
    const adjacent = this._findAdjacentEnemy(enemies);
    if (adjacent) return { type: 'attack', target: adjacent };
    return null; // 動かない
  }

  // ── attack: 最も近い敵に向かって自律的に攻撃しに行く ──────────
  _attackBehavior(enemies, isWalkable, isOccupied) {
    if (enemies.length === 0) return null;

    // 隣接していればまず攻撃
    const adjacent = this._findAdjacentEnemy(enemies);
    if (adjacent) return { type: 'attack', target: adjacent };

    // 最も近い敵を探す
    const nearest = this._findNearestEnemy(enemies);
    if (!nearest) return null;

    const move = this._stepToward(nearest.position.x, nearest.position.y, isWalkable, isOccupied);
    return move ? { type: 'move', x: move.x, y: move.y } : null;
  }

  // ── follow: プレイヤーの後ろをついていく。近くの敵は自動攻撃 ──
  _followBehavior(playerPos, enemies, isWalkable, isOccupied) {
    // 隣接する敵がいれば優先して攻撃
    const adjacent = this._findAdjacentEnemy(enemies);
    if (adjacent) return { type: 'attack', target: adjacent };

    // プレイヤーから1マス以内にいれば動かない
    const dist = Math.max(
      Math.abs(this.position.x - playerPos.x),
      Math.abs(this.position.y - playerPos.y)
    );
    if (dist <= 1) return null;

    // プレイヤーに向かって1歩進む
    const move = this._stepToward(playerPos.x, playerPos.y, isWalkable, isOccupied);
    return move ? { type: 'move', x: move.x, y: move.y } : null;
  }

  // ── 隣接する敵を探す ──────────────────────────────────────
  _findAdjacentEnemy(enemies) {
    return enemies.find(e => {
      const dx = Math.abs(e.position.x - this.position.x);
      const dy = Math.abs(e.position.y - this.position.y);
      return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
    }) ?? null;
  }

  // ── 最も近い敵を探す（マンハッタン距離） ───────────────────
  _findNearestEnemy(enemies) {
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = Math.abs(e.position.x - this.position.x) + Math.abs(e.position.y - this.position.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // ── 目標座標に向かって1歩進む（8方向） ──────────────────────
  _stepToward(tx, ty, isWalkable, isOccupied) {
    const ex = this.position.x, ey = this.position.y;
    const dirs = Ally.DIRS.slice().sort((a, b) => {
      const da = Math.abs(ex + a[0] - tx) + Math.abs(ey + a[1] - ty);
      const db = Math.abs(ex + b[0] - tx) + Math.abs(ey + b[1] - ty);
      return da - db;
    });
    for (const [ddx, ddy] of dirs) {
      const nx = ex + ddx, ny = ey + ddy;
      if (isWalkable(nx, ny) && !isOccupied(nx, ny)) {
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  // ── 定数 ──────────────────────────────────────────────────
  static DIRS = [
    [-1,0],[1,0],[0,-1],[0,1],
    [-1,-1],[1,-1],[-1,1],[1,1],
  ];

  // Enemy.jsと同じステータステーブルを共有（将来JSONに統合予定）
  static BASE_STATS = {
    slime: { hp:20, hpGrow:3, atk:5,  atkGrow:1, def:1, defGrow:0 },
    goblin:{ hp:30, hpGrow:4, atk:8,  atkGrow:2, def:2, defGrow:1 },
    orc:   { hp:50, hpGrow:6, atk:12, atkGrow:2, def:4, defGrow:1 },
  };
}
