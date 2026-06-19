/**
 * Enemy - 敵エンティティ（ロジックのみ、描画はGameSceneが担当）
 */

let _idCounter = 0;

export class Enemy {
  /**
   * @param {string} characterId  - キャラ種別ID（将来JSON管理用）
   * @param {{x:number, y:number}} position - タイル座標
   * @param {number} level
   */
  constructor(characterId, position, level = 1) {
    this.instanceId  = `enemy_${++_idCounter}`;
    this.characterId = characterId;
    this.type        = 'enemy';
    this.level       = level;

    // ── ステータス（characterIdごとに後でJSONから引く予定）──
    const base = Enemy.BASE_STATS[characterId] ?? Enemy.BASE_STATS['slime'];
    this.maxHp   = base.hp   + base.hpGrow   * (level - 1);
    this.hp      = this.maxHp;
    this.attack  = base.atk  + base.atkGrow  * (level - 1);
    this.defense = base.def  + base.defGrow  * (level - 1);
    this.expDrop = base.exp  + 2 * (level - 1);

    this.position = { ...position };

    // 索敵状態
    this.state = 'roaming'; // 'roaming' | 'chasing'
  }

  get isDead() { return this.hp <= 0; }

  // ──────────────────────────────────────────────────────────
  //  AI: 次の行動先を決定して返す（移動先タイル座標）
  //  実際の移動・衝突判定はGameSceneが行う
  // ──────────────────────────────────────────────────────────

  /**
   * プレイヤーが同じ部屋にいるか、または追跡中かを更新し
   * 次の移動先 {x, y} を返す。攻撃すべき場合は null を返す。
   *
   * @param {{x:number,y:number}} playerPos
   * @param {(x:number,y:number)=>boolean} isWalkable
   * @param {(x:number,y:number)=>boolean} isSameRoom - プレイヤーと同じ部屋か
   * @param {(x:number,y:number)=>boolean} isOccupied - 他のエネミーがいるか
   * @returns {{x:number, y:number} | null}  null = その場に留まる
   */
  decideAction(playerPos, isWalkable, isSameRoom, isOccupied) {
    const px = playerPos.x;
    const py = playerPos.y;
    const ex = this.position.x;
    const ey = this.position.y;

    // ── 索敵状態を更新 ────────────────────────────────────────
    if (isSameRoom(ex, ey)) {
      // 同じ部屋にプレイヤーがいれば発見
      this.state = 'chasing';
    }
    // 一度発見したら廊下に入っても追跡継続（stateはchasingのまま）

    // ── 隣接していれば攻撃（移動しない） ─────────────────────
    const dx = px - ex;
    const dy = py - ey;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) {
      return null; // 攻撃フラグとして null を返す
    }

    // ── 移動先を決定 ──────────────────────────────────────────
    if (this.state === 'chasing') {
      return this._chaseMove(px, py, isWalkable, isOccupied);
    } else {
      return this._roamMove(isWalkable, isOccupied);
    }
  }

  // ── 追跡移動: プレイヤーに近づく方向を優先 ──────────────────
  _chaseMove(px, py, isWalkable, isOccupied) {
    const ex = this.position.x;
    const ey = this.position.y;

    // 8方向をプレイヤーへの距離でソート
    const dirs = Enemy.DIRS.slice().sort((a, b) => {
      const da = Math.abs(ex + a[0] - px) + Math.abs(ey + a[1] - py);
      const db = Math.abs(ex + b[0] - px) + Math.abs(ey + b[1] - py);
      return da - db;
    });

    for (const [ddx, ddy] of dirs) {
      const nx = ex + ddx;
      const ny = ey + ddy;
      if (isWalkable(nx, ny) && !isOccupied(nx, ny)) {
        return { x: nx, y: ny };
      }
    }
    return null; // 動けない
  }

  // ── ランダム移動 ─────────────────────────────────────────────
  _roamMove(isWalkable, isOccupied) {
    const ex = this.position.x;
    const ey = this.position.y;

    // 4方向のみランダム（ローミングは穏やか）
    const dirs = Enemy.DIRS_4.slice().sort(() => Math.random() - 0.5);
    for (const [ddx, ddy] of dirs) {
      const nx = ex + ddx;
      const ny = ey + ddy;
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

  static DIRS_4 = [[-1,0],[1,0],[0,-1],[0,1]];

  // キャラクター別ベースステータス（後でJSONに移行）
  static BASE_STATS = {
    slime: { hp:20, hpGrow:3, atk:5,  atkGrow:1, def:1, defGrow:0, exp:8  },
    goblin:{ hp:30, hpGrow:4, atk:8,  atkGrow:2, def:2, defGrow:1, exp:12 },
    orc:   { hp:50, hpGrow:6, atk:12, atkGrow:2, def:4, defGrow:1, exp:20 },
  };
}
