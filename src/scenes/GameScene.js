import { DungeonGenerator } from '../game/DungeonGenerator.js';
import { Enemy }            from '../game/Enemy.js';
import { BattleSystem }     from '../game/BattleSystem.js';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TILE, CAMERA_LERP } from '../utils/constants.js';

// フロアごとの敵スポーン数
const ENEMY_COUNT = 8;

// 敵種別テーブル（フロアが上がるほど強い敵が出やすい）
const ENEMY_TYPES = ['slime', 'goblin', 'orc'];

/**
 * GameScene - フェーズ2: ターン制 + 敵スポーン・AI・戦闘
 *
 * ターンの流れ:
 *   1. プレイヤーが移動/攻撃入力
 *   2. プレイヤー行動を解決（移動 or 隣接敵への攻撃）
 *   3. 敵AI行動を解決（全敵を順に処理）
 *   4. 次の入力を受付
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this._map    = null;
    this._rooms  = [];
    this._floor  = 1;
    this._tileSprites = [];

    // プレイヤーロジック用オブジェクト（Enemy と同形式のフィールドを持つ）
    this._playerData = null;
    this._playerSprite = null;

    // 敵リスト
    this._enemies = [];          // Enemy インスタンス配列
    this._enemySprites = new Map(); // instanceId → Phaser.Image

    // ターン制御
    this._turnLocked = false;    // true の間は入力を受け付けない

    // HP表示テキスト
    this._hpTexts = new Map();   // instanceId → Phaser.Text
  }

  // ──────────────────────────────────────────────────────────
  create() {
    this._generateDungeon();
    this._drawTiles();
    this._spawnPlayer();
    this._spawnEnemies();
    this._setupCamera();
    this._setupInput();
    this._buildUI();
  }

  // ──────────────────────────────────────────────────────────
  update() {
    // 入力はキーイベントで処理するため update では何もしない
  }

  // ──────────────────────────────────────────────────────────
  //  ダンジョン生成
  // ──────────────────────────────────────────────────────────
  _generateDungeon() {
    const gen = new DungeonGenerator(MAP_WIDTH, MAP_HEIGHT);
    const { map, rooms } = gen.generate();
    this._map   = map;
    this._rooms = rooms;
    this._startPos = gen.getStartPosition(rooms);
  }

  // ──────────────────────────────────────────────────────────
  //  タイル描画
  // ──────────────────────────────────────────────────────────
  _drawTiles() {
    this._tileSprites.forEach(row => row.forEach(s => s.destroy()));
    this._tileSprites = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = this._map[y][x];
        const key = t === TILE.FLOOR ? 'tile_floor'
                  : t === TILE.STAIRS ? 'tile_stairs'
                  : 'tile_wall';
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const s = this.add.image(px, py, key);
        if (t === TILE.WALL) s.setAlpha(0.85);
        row.push(s);
      }
      this._tileSprites.push(row);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  プレイヤー
  // ──────────────────────────────────────────────────────────
  _spawnPlayer() {
    if (this._playerSprite) this._playerSprite.destroy();

    const { x, y } = this._startPos;
    this._playerData = {
      type: 'player',
      hp: 60, maxHp: 60,
      attack: 15, defense: 5,
      position: { x, y },
    };

    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite = this.add.image(px, py, 'player').setDepth(10);
    this._playerSprite.setAlpha(0);
    this.tweens.add({ targets: this._playerSprite, alpha: 1, duration: 400 });
  }

  // ──────────────────────────────────────────────────────────
  //  敵スポーン
  // ──────────────────────────────────────────────────────────
  _spawnEnemies() {
    // 既存の敵スプライト・テキストを破棄
    this._enemySprites.forEach(s => s.destroy());
    this._enemySprites.clear();
    this._hpTexts.forEach(t => t.destroy());
    this._hpTexts.clear();
    this._enemies = [];

    const playerRoomIdx = this._findRoomIndex(this._playerData.position.x, this._playerData.position.y);

    let placed = 0;
    const maxTries = 100;

    for (let i = 0; i < maxTries && placed < ENEMY_COUNT; i++) {
      // プレイヤーと異なる部屋を選ぶ
      const candidateRooms = this._rooms.filter((_, idx) => idx !== playerRoomIdx);
      if (candidateRooms.length === 0) break;

      const room = candidateRooms[Math.floor(Math.random() * candidateRooms.length)];
      const tx = room.x + Math.floor(Math.random() * room.w);
      const ty = room.y + Math.floor(Math.random() * room.h);

      if (this._map[ty][tx] === TILE.WALL) continue;
      if (this._isEnemyAt(tx, ty)) continue;

      // フロアに応じて敵種別を選択
      const typeIdx = Math.min(Math.floor(Math.random() * (1 + this._floor * 0.5)), ENEMY_TYPES.length - 1);
      const charId  = ENEMY_TYPES[typeIdx];
      const level   = Math.max(1, this._floor + Math.floor(Math.random() * 2) - 1);

      const enemy = new Enemy(charId, { x: tx, y: ty }, level);
      this._enemies.push(enemy);

      const { px, py } = this._tileToWorld(tx, ty);
      const textureKey = `enemy_${charId}`;
      const sprite = this.add.image(px, py, textureKey).setDepth(9);
      this._enemySprites.set(enemy.instanceId, sprite);

      // HP表示（敵の上）
      const hpText = this.add.text(px, py - 18, this._hpLabel(enemy), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ff6666',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(20);
      this._hpTexts.set(enemy.instanceId, hpText);

      placed++;
    }
  }

  _hpLabel(enemy) { return `${enemy.hp}/${enemy.maxHp}`; }

  // ──────────────────────────────────────────────────────────
  //  カメラ
  // ──────────────────────────────────────────────────────────
  _setupCamera() {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP);
    this.cameras.main.setZoom(1.5);
  }

  // ──────────────────────────────────────────────────────────
  //  入力（キーダウンイベントでターンを進める）
  // ──────────────────────────────────────────────────────────
  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
      c: Phaser.Input.Keyboard.KeyCodes.C,
      r: Phaser.Input.Keyboard.KeyCodes.R,
    });

    // 各キーのkeydownにターン処理をバインド
    const dirKeys = ['up','down','left','right','w','a','s','d','q','e','z','c'];
    dirKeys.forEach(k => {
      this._keys[k].on('down', () => this._onDirectionKey());
    });

    this._keys.r.on('down', () => {
      if (this._turnLocked) return;
      this._turnLocked = true;
      this._startFloorTransition();
    });
  }

  _onDirectionKey() {
    if (this._turnLocked) return;

    const dx = this._getDX();
    const dy = this._getDY();
    if (dx === 0 && dy === 0) return;

    this._doPlayerTurn(dx, dy);
  }

  _getDX() {
    const k = this._keys;
    if (k.left.isDown  || k.a.isDown) return -1;
    if (k.right.isDown || k.d.isDown) return  1;
    if (k.q.isDown || k.z.isDown)     return -1;
    if (k.e.isDown || k.c.isDown)     return  1;
    return 0;
  }

  _getDY() {
    const k = this._keys;
    if (k.up.isDown   || k.w.isDown) return -1;
    if (k.down.isDown || k.s.isDown) return  1;
    if (k.q.isDown || k.e.isDown)    return -1;
    if (k.z.isDown || k.c.isDown)    return  1;
    return 0;
  }

  // ──────────────────────────────────────────────────────────
  //  ターン処理
  // ──────────────────────────────────────────────────────────
  _doPlayerTurn(dx, dy) {
    this._turnLocked = true;

    const px  = this._playerData.position.x;
    const py  = this._playerData.position.y;
    const nx  = px + dx;
    const ny  = py + dy;

    // 隣接マスに敵がいるか
    const target = this._enemies.find(e => e.position.x === nx && e.position.y === ny);

    if (target) {
      // ── プレイヤー攻撃 ──────────────────────────────────────
      const dmg = BattleSystem.applyAttack(this._playerData, target);
      this._showDamageText(nx, ny, dmg, '#ffffff');
      this._updateEnemyHpText(target);

      if (target.isDead) {
        this._logMessage(`${target.characterId}を倒した！(+${target.expDrop}exp)`);
        this._removeEnemy(target);
      } else {
        this._logMessage(`${target.characterId}に${dmg}ダメージ！`);
      }
    } else if (this._isWalkable(nx, ny)) {
      // ── 移動 ─────────────────────────────────────────────────
      this._playerData.position.x = nx;
      this._playerData.position.y = ny;
      const { px: wpx, py: wpy } = this._tileToWorld(nx, ny);
      this.tweens.add({
        targets: this._playerSprite,
        x: wpx, y: wpy,
        duration: 100,
        ease: 'Linear',
      });
      this._updateCoordText();

      // 階段チェック
      if (this._map[ny][nx] === TILE.STAIRS) {
        this._turnLocked = true;
        this._startFloorTransition();
        return;
      }
    } else {
      // 移動も攻撃もできない
      this._turnLocked = false;
      return;
    }

    // プレイヤー行動後に敵ターンを遅延実行
    this.time.delayedCall(120, () => {
      this._doEnemyTurns();
      this._updateHpBar();
      this._turnLocked = false;
    });
  }

  // ──────────────────────────────────────────────────────────
  //  敵AIターン
  // ──────────────────────────────────────────────────────────
  _doEnemyTurns() {
    const playerPos = this._playerData.position;

    for (const enemy of this._enemies) {
      if (enemy.isDead) continue;

      const action = enemy.decideAction(
        playerPos,
        (x, y) => this._isWalkable(x, y),
        (ex, ey) => this._isPlayerInSameRoom(ex, ey),
        (x, y)  => x === playerPos.x && y === playerPos.y
                || this._isEnemyAt(x, y, enemy.instanceId),
      );

      if (action === null) {
        // 隣接 → 攻撃
        const dmg = BattleSystem.applyAttack(enemy, this._playerData);
        this._showDamageText(playerPos.x, playerPos.y, dmg, '#ff4444');
        this._logMessage(`${enemy.characterId}に${dmg}ダメージを受けた！`);

        if (this._playerData.hp <= 0) {
          this._gameOver();
          return;
        }
      } else {
        // 移動
        enemy.position.x = action.x;
        enemy.position.y = action.y;

        const sprite = this._enemySprites.get(enemy.instanceId);
        const hpText = this._hpTexts.get(enemy.instanceId);
        const { px, py } = this._tileToWorld(action.x, action.y);

        if (sprite) {
          this.tweens.add({ targets: sprite, x: px, y: py, duration: 100 });
        }
        if (hpText) {
          this.tweens.add({ targets: hpText, x: px, y: py - 18, duration: 100 });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  //  ユーティリティ
  // ──────────────────────────────────────────────────────────
  _isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    return this._map[y][x] !== TILE.WALL;
  }

  _isEnemyAt(x, y, excludeId = null) {
    return this._enemies.some(e =>
      !e.isDead &&
      e.instanceId !== excludeId &&
      e.position.x === x && e.position.y === y
    );
  }

  /** プレイヤーと enemy の座標が同じ rooms[] に含まれるか */
  _isPlayerInSameRoom(ex, ey) {
    const pp = this._playerData.position;
    return this._rooms.some(r =>
      this._inRoom(r, ex, ey) && this._inRoom(r, pp.x, pp.y)
    );
  }

  _inRoom(r, x, y) {
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  _findRoomIndex(x, y) {
    return this._rooms.findIndex(r => this._inRoom(r, x, y));
  }

  _tileToWorld(tx, ty) {
    return {
      px: tx * TILE_SIZE + TILE_SIZE / 2,
      py: ty * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  // ──────────────────────────────────────────────────────────
  //  敵の除去
  // ──────────────────────────────────────────────────────────
  _removeEnemy(enemy) {
    const sprite = this._enemySprites.get(enemy.instanceId);
    const hpText = this._hpTexts.get(enemy.instanceId);

    if (sprite) {
      this.tweens.add({
        targets: sprite,
        alpha: 0, y: sprite.y - 10,
        duration: 300,
        onComplete: () => sprite.destroy(),
      });
    }
    if (hpText) {
      hpText.destroy();
      this._hpTexts.delete(enemy.instanceId);
    }

    this._enemySprites.delete(enemy.instanceId);
    this._enemies = this._enemies.filter(e => e.instanceId !== enemy.instanceId);
  }

  _updateEnemyHpText(enemy) {
    const t = this._hpTexts.get(enemy.instanceId);
    if (t) t.setText(this._hpLabel(enemy));
  }

  // ──────────────────────────────────────────────────────────
  //  ダメージ数字エフェクト
  // ──────────────────────────────────────────────────────────
  _showDamageText(tx, ty, dmg, color = '#ffffff') {
    const { px, py } = this._tileToWorld(tx, ty);
    const t = this.add.text(px, py - 10, `-${dmg}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);

    this.tweens.add({
      targets: t,
      y: py - 35,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ──────────────────────────────────────────────────────────
  //  ゲームオーバー
  // ──────────────────────────────────────────────────────────
  _gameOver() {
    this._turnLocked = true;
    this.cameras.main.flash(500, 255, 0, 0);

    const cx = this.scale.width  / 2;
    const cy = this.scale.height / 2;

    this.add.text(cx, cy, 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '36px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(200);

    this.add.text(cx, cy + 50, 'SPACEでタイトルへ', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffaaaa',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(200);

    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('TitleScene'));
    this.input.once('pointerdown', () => this.scene.start('TitleScene'));
  }

  // ──────────────────────────────────────────────────────────
  //  フロア遷移（フェード演出）
  // ──────────────────────────────────────────────────────────

  _startFloorTransition() {
    this.cameras.main.fadeOut(300, 0, 0, 0);

    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._nextFloor();

      this.cameras.main.fadeIn(400, 0, 0, 0);

      this.cameras.main.once('camerafadeincomplete', () => {
        // フェードイン完了後にバナーを表示
        this._showFloorBanner();
        this._turnLocked = false;
      });
    });
  }

  /** 画面中央に「B○F」を大きく一瞬表示するバナー */
  _showFloorBanner() {
    const cx = this.scale.width  / 2;
    const cy = this.scale.height / 2;

    const bg = this.add.rectangle(cx, cy, 260, 70, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(300);

    const text = this.add.text(cx, cy, `B${this._floor}F`, {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#aaffaa',
      stroke: '#004400',
      strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(301);

    const sub = this.add.text(cx, cy + 28, `${this._floor}階層目`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#66aa66',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(301);

    // 1秒表示してからフェードアウト
    this.time.delayedCall(900, () => {
      this.tweens.add({
        targets: [bg, text, sub],
        alpha: 0,
        duration: 400,
        onComplete: () => { bg.destroy(); text.destroy(); sub.destroy(); },
      });
    });
  }

  _nextFloor() {
    this._floor++;

    // 敵スプライト・テキストをすべて破棄
    this._enemySprites.forEach(s => s.destroy());
    this._enemySprites.clear();
    this._hpTexts.forEach(t => t.destroy());
    this._hpTexts.clear();
    this._enemies = [];

    this._generateDungeon();
    this._drawTiles();

    // プレイヤーHPは引き継ぎ
    const { x, y } = this._startPos;
    this._playerData.position = { x, y };
    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite.setPosition(px, py);

    this._spawnEnemies();
    this.cameras.main.startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP);
    this._updateFloorText();
    this._updateHpBar();
    this._logMessage(`--- B${this._floor}Fに降りた ---`);
  }

  // ──────────────────────────────────────────────────────────
  //  UI
  // ──────────────────────────────────────────────────────────
  _buildUI() {
    const style = {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaffaa',
      stroke: '#001100',
      strokeThickness: 3,
    };

    this._floorText = this.add.text(10, 10, this._floorLabel(), style)
      .setScrollFactor(0).setDepth(100);

    this._coordText = this.add.text(10, 28, this._coordLabel(), style)
      .setScrollFactor(0).setDepth(100);

    // HPパネル背景
    this._hpPanel = this.add.rectangle(75, 58, 150, 40, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(99);

    // HPバー背景・前景（RenderTextureで代替）
    this._hpBarBgImg = this.add.rectangle(10 + 60, 62 + 5, 120, 10, 0x333333)
      .setScrollFactor(0).setDepth(100).setOrigin(0.5, 0.5);

    this._hpBarFgImg = this.add.rectangle(10, 62, 120, 10, 0x44dd44)
      .setScrollFactor(0).setDepth(101).setOrigin(0, 0);

    this._hpLabel2 = this.add.text(10, 46, '', style).setScrollFactor(0).setDepth(102);
    this._updateHpBar();

    // メッセージログ（下部）
    this._logLines = [];
    for (let i = 0; i < 3; i++) {
      this._logLines.push(
        this.add.text(10, this.scale.height - 14 - i * 14, '', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ccffcc',
          stroke: '#000000',
          strokeThickness: 2,
        }).setScrollFactor(0).setDepth(100)
      );
    }
    this._logMessages = [];

    // 操作ガイド（右下）
    this.add.text(this.scale.width - 8, this.scale.height - 8,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#446644',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 1);
  }

  _updateHpBar() {
    const p   = this._playerData;
    const rat = p.hp / p.maxHp;
    const W = 120, H = 10;
    const X = 10, Y = 62;

    // 前景バーの幅を比率で変える
    const fgW = Math.max(1, Math.floor(W * rat));
    this._hpBarFgImg.setSize(fgW, H);

    // HP残量で色を変える
    const col = rat > 0.5 ? 0x44dd44 : rat > 0.25 ? 0xdddd44 : 0xdd4444;
    this._hpBarFgImg.setFillStyle(col);

    this._hpLabel2.setText(`HP ${p.hp}/${p.maxHp}`);
  }

  _logMessage(msg) {
    this._logMessages.unshift(msg);
    if (this._logMessages.length > 3) this._logMessages.length = 3;
    this._logLines.forEach((t, i) => {
      t.setText(this._logMessages[i] ?? '');
    });
  }

  _floorLabel()  { return `B${this._floor}F`; }
  _coordLabel()  {
    const p = this._playerData?.position;
    return p ? `(${p.x}, ${p.y})` : '';
  }

  _updateFloorText() { this._floorText?.setText(this._floorLabel()); }
  _updateCoordText() { this._coordText?.setText(this._coordLabel()); }
}
