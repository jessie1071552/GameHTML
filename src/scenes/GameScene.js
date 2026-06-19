import { DungeonGenerator } from '../game/DungeonGenerator.js';
import { Enemy }            from '../game/Enemy.js';
import { BattleSystem }     from '../game/BattleSystem.js';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TILE, CAMERA_LERP } from '../utils/constants.js';

const ENEMY_COUNT = 8;
const ENEMY_TYPES = ['slime', 'goblin', 'orc'];

// 視界外タイルの暗さ（0=完全に黒, 1=完全に見える）
const FOG_ALPHA_UNSEEN  = 0.0;  // 未踏破：完全に黒
const FOG_ALPHA_VISITED = 0.45; // 踏破済・視界外：薄暗い（敵は隠す）
const FOG_ALPHA_VISIBLE = 1.0;  // 視界内：完全に見える

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this._map    = null;
    this._rooms  = [];
    this._floor  = 1;
    this._tileSprites = [];   // タイル本体
    this._fogSprites  = [];   // フォグオーバーレイ（タイルと1:1対応）
    this._visited = null;     // 2D boolean: 踏破済みか

    this._playerData   = null;
    this._playerSprite = null;
    this._enemies      = [];
    this._enemySprites = new Map();
    this._hpTexts      = new Map();

    this._turnLocked = false;
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
    this._updateFog(); // 初期視界
  }

  update() {}

  // ──────────────────────────────────────────────────────────
  //  ダンジョン生成
  // ──────────────────────────────────────────────────────────
  _generateDungeon() {
    const gen = new DungeonGenerator(MAP_WIDTH, MAP_HEIGHT);
    const { map, rooms } = gen.generate();
    this._map   = map;
    this._rooms = rooms;
    this._startPos = gen.getStartPosition(rooms);
    // 踏破済みマップを初期化
    this._visited = Array.from({ length: MAP_HEIGHT }, () =>
      new Array(MAP_WIDTH).fill(false)
    );
  }

  // ──────────────────────────────────────────────────────────
  //  タイル描画
  // ──────────────────────────────────────────────────────────
  _drawTiles() {
    this._tileSprites.forEach(row => row.forEach(s => s.destroy()));
    this._fogSprites.forEach(row => row.forEach(s => s.destroy()));
    this._tileSprites = [];
    this._fogSprites  = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const tileRow = [];
      const fogRow  = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = this._map[y][x];
        const key = t === TILE.FLOOR ? 'tile_floor'
                  : t === TILE.STAIRS ? 'tile_stairs'
                  : 'tile_wall';
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;

        // タイル本体（初期は非表示）
        const tile = this.add.image(px, py, key).setDepth(1).setAlpha(0);
        tileRow.push(tile);

        // フォグオーバーレイ（黒い矩形をタイルの上に被せる）
        const fog = this.add.rectangle(px, py, TILE_SIZE, TILE_SIZE, 0x000000)
          .setAlpha(1).setDepth(50);
        fogRow.push(fog);
      }
      this._tileSprites.push(tileRow);
      this._fogSprites.push(fogRow);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  視界・フォグ更新
  // ──────────────────────────────────────────────────────────
  _updateFog() {
    const visibleTiles = this._calcVisible();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isVisible = visibleTiles[y][x];
        if (isVisible) this._visited[y][x] = true;

        const tile = this._tileSprites[y][x];
        const fog  = this._fogSprites[y][x];

        if (isVisible) {
          tile.setAlpha(1);
          fog.setAlpha(0);
        } else if (this._visited[y][x]) {
          tile.setAlpha(0.6);
          fog.setAlpha(FOG_ALPHA_VISITED);
        } else {
          tile.setAlpha(0);
          fog.setAlpha(1);
        }
      }
    }

    // 敵・HPテキストの表示/非表示
    this._enemies.forEach(enemy => {
      const { x, y } = enemy.position;
      const show = visibleTiles[y]?.[x] ?? false;
      const sprite  = this._enemySprites.get(enemy.instanceId);
      const hpText  = this._hpTexts.get(enemy.instanceId);
      if (sprite)  sprite.setVisible(show);
      if (hpText)  hpText.setVisible(show);
    });
  }

  /**
   * 視界内タイルを計算して返す（2D boolean配列）
   * 視界 = プレイヤーがいる部屋の全タイル + その周囲1タイル（廊下の入口）
   */
  _calcVisible() {
    const visible = Array.from({ length: MAP_HEIGHT }, () =>
      new Array(MAP_WIDTH).fill(false)
    );
    const pp = this._playerData.position;
    const playerRoom = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));

    if (playerRoom) {
      // 部屋全体（少し外側まで含めて廊下入口も見える）
      for (let y = playerRoom.y - 1; y < playerRoom.y + playerRoom.h + 1; y++) {
        for (let x = playerRoom.x - 1; x < playerRoom.x + playerRoom.w + 1; x++) {
          if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
            visible[y][x] = true;
          }
        }
      }
    } else {
      // 廊下にいる場合: プレイヤー周囲2マスを視界に
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = pp.x + dx;
          const ny = pp.y + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            visible[ny][nx] = true;
          }
        }
      }
    }

    // プレイヤー自身は常に見える
    visible[pp.y][pp.x] = true;
    return visible;
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
  //  敵スポーン（プレイヤーの部屋以外ならどこでもOK）
  // ──────────────────────────────────────────────────────────
  _spawnEnemies() {
    this._enemySprites.forEach(s => s.destroy());
    this._enemySprites.clear();
    this._hpTexts.forEach(t => t.destroy());
    this._hpTexts.clear();
    this._enemies = [];

    const pp = this._playerData.position;
    const playerRoom = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));

    let placed = 0;
    let tries  = 0;

    while (placed < ENEMY_COUNT && tries < 200) {
      tries++;

      // ランダムなフロアタイルを選ぶ
      const rx = Math.floor(Math.random() * MAP_WIDTH);
      const ry = Math.floor(Math.random() * MAP_HEIGHT);

      if (this._map[ry][rx] === TILE.WALL) continue;
      if (this._isEnemyAt(rx, ry)) continue;

      // プレイヤーの部屋内はスキップ
      if (playerRoom && this._inRoom(playerRoom, rx, ry)) continue;

      // プレイヤー自身の座標もスキップ
      if (rx === pp.x && ry === pp.y) continue;

      const typeIdx = Math.min(
        Math.floor(Math.random() * (1 + this._floor * 0.5)),
        ENEMY_TYPES.length - 1
      );
      const charId = ENEMY_TYPES[typeIdx];
      const level  = Math.max(1, this._floor + Math.floor(Math.random() * 2) - 1);

      const enemy = new Enemy(charId, { x: rx, y: ry }, level);
      this._enemies.push(enemy);

      const { px, py } = this._tileToWorld(rx, ry);
      const sprite = this.add.image(px, py, `enemy_${charId}`)
        .setDepth(9).setVisible(false); // 初期は非表示（フォグで隠す）
      this._enemySprites.set(enemy.instanceId, sprite);

      const hpText = this.add.text(px, py - 18, this._hpLabel(enemy), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ff6666',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(55).setVisible(false);
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
    this.cameras.main.setZoom(1.0);
  }

  // ──────────────────────────────────────────────────────────
  //  入力
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

    const dirKeys = ['up','down','left','right','w','a','s','d','q','e','z','c'];
    dirKeys.forEach(k => this._keys[k].on('down', () => this._onDirectionKey()));

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

    const px = this._playerData.position.x;
    const py = this._playerData.position.y;
    const nx = px + dx;
    const ny = py + dy;

    const target = this._enemies.find(e => e.position.x === nx && e.position.y === ny);

    if (target) {
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
      this._updateFog(); // 移動のたびに視界更新

      if (this._map[ny][nx] === TILE.STAIRS) {
        this._turnLocked = true;
        this._startFloorTransition();
        return;
      }
    } else {
      this._turnLocked = false;
      return;
    }

    this.time.delayedCall(120, () => {
      this._doEnemyTurns();
      this._updateHpBar();
      this._updateFog(); // 敵移動後も視界更新
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
        (x, y)  => (x === playerPos.x && y === playerPos.y)
                || this._isEnemyAt(x, y, enemy.instanceId),
      );

      if (action === null) {
        const dmg = BattleSystem.applyAttack(enemy, this._playerData);
        this._showDamageText(playerPos.x, playerPos.y, dmg, '#ff4444');
        this._logMessage(`${enemy.characterId}に${dmg}ダメージを受けた！`);
        if (this._playerData.hp <= 0) {
          this._gameOver();
          return;
        }
      } else {
        enemy.position.x = action.x;
        enemy.position.y = action.y;
        const sprite  = this._enemySprites.get(enemy.instanceId);
        const hpText  = this._hpTexts.get(enemy.instanceId);
        const { px, py } = this._tileToWorld(action.x, action.y);
        if (sprite) this.tweens.add({ targets: sprite, x: px, y: py, duration: 100 });
        if (hpText) this.tweens.add({ targets: hpText, x: px, y: py - 18, duration: 100 });
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
      !e.isDead && e.instanceId !== excludeId &&
      e.position.x === x && e.position.y === y
    );
  }

  _isPlayerInSameRoom(ex, ey) {
    const pp = this._playerData.position;
    return this._rooms.some(r => this._inRoom(r, ex, ey) && this._inRoom(r, pp.x, pp.y));
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
    const sprite  = this._enemySprites.get(enemy.instanceId);
    const hpText  = this._hpTexts.get(enemy.instanceId);
    if (sprite) {
      this.tweens.add({
        targets: sprite, alpha: 0, y: sprite.y - 10, duration: 300,
        onComplete: () => sprite.destroy(),
      });
    }
    if (hpText) { hpText.destroy(); this._hpTexts.delete(enemy.instanceId); }
    this._enemySprites.delete(enemy.instanceId);
    this._enemies = this._enemies.filter(e => e.instanceId !== enemy.instanceId);
  }

  _updateEnemyHpText(enemy) {
    const t = this._hpTexts.get(enemy.instanceId);
    if (t) t.setText(this._hpLabel(enemy));
  }

  // ──────────────────────────────────────────────────────────
  //  ダメージエフェクト
  // ──────────────────────────────────────────────────────────
  _showDamageText(tx, ty, dmg, color = '#ffffff') {
    const { px, py } = this._tileToWorld(tx, ty);
    const t = this.add.text(px, py - 10, `-${dmg}`, {
      fontFamily: 'monospace', fontSize: '14px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({
      targets: t, y: py - 35, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ──────────────────────────────────────────────────────────
  //  ゲームオーバー
  // ──────────────────────────────────────────────────────────
  _gameOver() {
    this._turnLocked = true;
    this.cameras.main.flash(500, 255, 0, 0);
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.add.text(cx, cy, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ff4444',
      stroke: '#000000', strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(200);
    this.add.text(cx, cy + 50, 'SPACEでタイトルへ', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffaaaa',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(200);
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('TitleScene'));
    this.input.once('pointerdown', () => this.scene.start('TitleScene'));
  }

  // ──────────────────────────────────────────────────────────
  //  フロア遷移
  // ──────────────────────────────────────────────────────────
  _startFloorTransition() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._nextFloor();
      this.cameras.main.fadeIn(400, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this._showFloorBanner();
        this._turnLocked = false;
      });
    });
  }

  _showFloorBanner() {
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    const bg   = this.add.rectangle(cx, cy, 260, 70, 0x000000, 0.75).setScrollFactor(0).setDepth(300);
    const text = this.add.text(cx, cy, `B${this._floor}F`, {
      fontFamily: 'monospace', fontSize: '40px', color: '#aaffaa',
      stroke: '#004400', strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(301);
    const sub  = this.add.text(cx, cy + 28, `${this._floor}階層目`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#66aa66',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(301);
    this.time.delayedCall(900, () => {
      this.tweens.add({
        targets: [bg, text, sub], alpha: 0, duration: 400,
        onComplete: () => { bg.destroy(); text.destroy(); sub.destroy(); },
      });
    });
  }

  _nextFloor() {
    this._floor++;
    this._enemySprites.forEach(s => s.destroy());
    this._enemySprites.clear();
    this._hpTexts.forEach(t => t.destroy());
    this._hpTexts.clear();
    this._enemies = [];

    this._generateDungeon();
    this._drawTiles();

    const { x, y } = this._startPos;
    this._playerData.position = { x, y };
    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite.setPosition(px, py);

    this._spawnEnemies();
    this.cameras.main.startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP);
    this._updateFog();
    this._updateFloorText();
    this._updateHpBar();
    this._logMessage(`--- B${this._floor}Fに降りた ---`);
  }

  // ──────────────────────────────────────────────────────────
  //  UI
  // ──────────────────────────────────────────────────────────
  _buildUI() {
    const style = {
      fontFamily: 'monospace', fontSize: '13px',
      color: '#aaffaa', stroke: '#001100', strokeThickness: 3,
    };

    // UIパネル背景
    this.add.rectangle(85, 55, 170, 70, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(98);

    this._floorText = this.add.text(10, 10, this._floorLabel(), style)
      .setScrollFactor(0).setDepth(100);
    this._coordText = this.add.text(10, 28, this._coordLabel(), style)
      .setScrollFactor(0).setDepth(100);

    // HPバー
    this.add.rectangle(70, 52, 120, 10, 0x333333)
      .setScrollFactor(0).setDepth(100).setOrigin(0.5, 0.5);
    this._hpBarFgImg = this.add.rectangle(10, 47, 120, 10, 0x44dd44)
      .setScrollFactor(0).setDepth(101).setOrigin(0, 0);
    this._hpLabel2 = this.add.text(10, 60, '', style)
      .setScrollFactor(0).setDepth(102);
    this._updateHpBar();

    // メッセージログ
    this._logLines = [];
    for (let i = 0; i < 3; i++) {
      this._logLines.push(
        this.add.text(10, this.scale.height - 14 - i * 14, '', {
          fontFamily: 'monospace', fontSize: '11px',
          color: '#ccffcc', stroke: '#000000', strokeThickness: 2,
        }).setScrollFactor(0).setDepth(100)
      );
    }
    this._logMessages = [];

    // 操作ガイド
    this.add.text(this.scale.width - 8, this.scale.height - 8,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア', {
      fontFamily: 'monospace', fontSize: '10px',
      color: '#446644', stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100).setOrigin(1, 1);
  }

  _updateHpBar() {
    const p   = this._playerData;
    const rat = Math.max(0, p.hp / p.maxHp);
    const fgW = Math.max(1, Math.floor(120 * rat));
    this._hpBarFgImg.setSize(fgW, 10);
    const col = rat > 0.5 ? 0x44dd44 : rat > 0.25 ? 0xdddd44 : 0xdd4444;
    this._hpBarFgImg.setFillStyle(col);
    this._hpLabel2.setText(`HP ${p.hp}/${p.maxHp}`);
  }

  _logMessage(msg) {
    this._logMessages.unshift(msg);
    if (this._logMessages.length > 3) this._logMessages.length = 3;
    this._logLines.forEach((t, i) => t.setText(this._logMessages[i] ?? ''));
  }

  _floorLabel() { return `B${this._floor}F`; }
  _coordLabel() {
    const p = this._playerData?.position;
    return p ? `(${p.x}, ${p.y})` : '';
  }
  _updateFloorText() { this._floorText?.setText(this._floorLabel()); }
  _updateCoordText() { this._coordText?.setText(this._coordLabel()); }
}
