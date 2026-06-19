import { DungeonGenerator } from '../game/DungeonGenerator.js';
import { Enemy }            from '../game/Enemy.js';
import { BattleSystem }     from '../game/BattleSystem.js';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TILE, CAMERA_LERP } from '../utils/constants.js';

const ENEMY_COUNT = 8;
const ENEMY_TYPES = ['slime', 'goblin', 'orc'];
const ZOOM = 1.5;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._map         = null;
    this._rooms       = [];
    this._floor       = 1;
    this._tileSprites = [];
    this._visited     = null;
    this._fogRT       = null;  // RenderTexture: マップ全体の霧

    this._playerData   = null;
    this._playerSprite = null;
    this._enemies      = [];
    this._enemySprites = new Map();
    this._hpTexts      = new Map();
    this._turnLocked   = false;

    // UI用カメラ（固定）
    this._uiCamera = null;
  }

  // ──────────────────────────────────────────────────────────
  create() {
    this._generateDungeon();
    this._drawTiles();
    this._initFog();
    this._spawnPlayer();
    this._spawnEnemies();
    this._setupCamera();
    this._buildUI();
    this._setupInput();
    this._updateFog();
  }

  update() {}

  // ──────────────────────────────────────────────────────────
  //  ダンジョン生成
  // ──────────────────────────────────────────────────────────
  _generateDungeon() {
    const gen = new DungeonGenerator(MAP_WIDTH, MAP_HEIGHT);
    const { map, rooms } = gen.generate();
    this._map      = map;
    this._rooms    = rooms;
    this._startPos = gen.getStartPosition(rooms);
    this._visited  = Array.from({ length: MAP_HEIGHT }, () =>
      new Array(MAP_WIDTH).fill(false)
    );
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
        const t   = this._map[y][x];
        const key = t === TILE.FLOOR ? 'tile_floor'
                  : t === TILE.STAIRS ? 'tile_stairs'
                  : 'tile_wall';
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const s  = this.add.image(px, py, key).setDepth(1);
        row.push(s);
      }
      this._tileSprites.push(row);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  霧（RenderTexture: マップ全体を1枚で覆う）
  // ──────────────────────────────────────────────────────────
  _initFog() {
    if (this._fogRT) this._fogRT.destroy();

    const totalW = MAP_WIDTH  * TILE_SIZE;
    const totalH = MAP_HEIGHT * TILE_SIZE;

    // マップ全体サイズのRenderTexture（深度を高くしてタイル・敵の上に重ねる）
    this._fogRT = this.add.renderTexture(0, 0, totalW, totalH)
      .setOrigin(0, 0)
      .setDepth(80);

    // 最初は全面真っ黒
    this._fogRT.fill(0x000000, 1);
  }

  // ──────────────────────────────────────────────────────────
  //  視界・霧の更新
  // ──────────────────────────────────────────────────────────
  _updateFog() {
    const visible = this._calcVisible();

    // 踏破済みをマーク
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (visible[y][x]) this._visited[y][x] = true;
      }
    }

    // RenderTextureを再描画
    // ① 全体をリセット（真っ黒）
    this._fogRT.clear();
    this._fogRT.fill(0x000000, 1);

    // ② 踏破済み領域を薄暗くする（eraseで黒を半透明に）
    const visitedGfx = this.make.graphics({ x: 0, y: 0, add: false });
    visitedGfx.fillStyle(0x000000, 0.0); // 完全透明で「穴」として使う
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this._visited[y][x] && !visible[y][x]) {
          visitedGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    // 踏破済みを0.5の黒で上書き（薄暗い）
    const visitedGfx2 = this.make.graphics({ x: 0, y: 0, add: false });
    visitedGfx2.fillStyle(0x000000, 0.55);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this._visited[y][x] && !visible[y][x]) {
          visitedGfx2.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    this._fogRT.draw(visitedGfx2, 0, 0);
    visitedGfx.destroy();
    visitedGfx2.destroy();

    // ③ 視界内を完全に透明にする（erase で黒を消す）
    const visibleGfx = this.make.graphics({ x: 0, y: 0, add: false });
    visibleGfx.fillStyle(0xffffff, 1);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (visible[y][x]) {
          visibleGfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    this._fogRT.erase(visibleGfx, 0, 0);
    visibleGfx.destroy();

    // 敵の表示/非表示
    this._enemies.forEach(enemy => {
      const { x, y } = enemy.position;
      const show = visible[y]?.[x] ?? false;
      this._enemySprites.get(enemy.instanceId)?.setVisible(show);
      this._hpTexts.get(enemy.instanceId)?.setVisible(show);
    });
  }

  _calcVisible() {
    const visible = Array.from({ length: MAP_HEIGHT }, () =>
      new Array(MAP_WIDTH).fill(false)
    );
    const pp = this._playerData.position;
    const playerRoom = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));

    if (playerRoom) {
      // 部屋全体 + 外周1マス（廊下入口）
      for (let y = playerRoom.y - 1; y <= playerRoom.y + playerRoom.h; y++) {
        for (let x = playerRoom.x - 1; x <= playerRoom.x + playerRoom.w; x++) {
          if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
            visible[y][x] = true;
          }
        }
      }
    } else {
      // 廊下: 周囲2マス
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = pp.x + dx, ny = pp.y + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            visible[ny][nx] = true;
          }
        }
      }
    }
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
      type: 'player', hp: 60, maxHp: 60,
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
    this._enemySprites.forEach(s => s.destroy());
    this._enemySprites.clear();
    this._hpTexts.forEach(t => t.destroy());
    this._hpTexts.clear();
    this._enemies = [];

    const pp = this._playerData.position;
    const playerRoom = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));

    let placed = 0, tries = 0;
    while (placed < ENEMY_COUNT && tries < 200) {
      tries++;
      const rx = Math.floor(Math.random() * MAP_WIDTH);
      const ry = Math.floor(Math.random() * MAP_HEIGHT);
      if (this._map[ry][rx] === TILE.WALL) continue;
      if (this._isEnemyAt(rx, ry)) continue;
      if (playerRoom && this._inRoom(playerRoom, rx, ry)) continue;
      if (rx === pp.x && ry === pp.y) continue;

      const typeIdx = Math.min(
        Math.floor(Math.random() * (1 + this._floor * 0.5)),
        ENEMY_TYPES.length - 1
      );
      const enemy = new Enemy(ENEMY_TYPES[typeIdx], { x: rx, y: ry },
        Math.max(1, this._floor + Math.floor(Math.random() * 2) - 1));
      this._enemies.push(enemy);

      const { px, py } = this._tileToWorld(rx, ry);
      const sprite = this.add.image(px, py, `enemy_${enemy.characterId}`)
        .setDepth(9).setVisible(false);
      this._enemySprites.set(enemy.instanceId, sprite);

      const hpText = this.add.text(px, py - 18, this._hpLabel(enemy), {
        fontFamily: 'monospace', fontSize: '10px',
        color: '#ff6666', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(85).setVisible(false);
      this._hpTexts.set(enemy.instanceId, hpText);

      placed++;
    }
  }

  _hpLabel(e) { return `${e.hp}/${e.maxHp}`; }

  // ──────────────────────────────────────────────────────────
  //  カメラ
  // ──────────────────────────────────────────────────────────
  _setupCamera() {
    const totalW = MAP_WIDTH  * TILE_SIZE;
    const totalH = MAP_HEIGHT * TILE_SIZE;

    // メインカメラ（ゲーム世界）
    this.cameras.main
      .setBounds(0, 0, totalW, totalH)
      .startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP)
      .setZoom(ZOOM);

    // UIカメラ（固定・スクロールしない）
    if (!this._uiCamera) {
      this._uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
      this._uiCamera.setScroll(0, 0);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  入力
  // ──────────────────────────────────────────────────────────
  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
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
    ['up','down','left','right','w','a','s','d','q','e','z','c'].forEach(k =>
      this._keys[k].on('down', () => this._onDirectionKey())
    );
    this._keys.r.on('down', () => {
      if (this._turnLocked) return;
      this._turnLocked = true;
      this._startFloorTransition();
    });
  }

  _onDirectionKey() {
    if (this._turnLocked) return;
    const dx = this._getDX(), dy = this._getDY();
    if (dx === 0 && dy === 0) return;
    this._doPlayerTurn(dx, dy);
  }

  _getDX() {
    const k = this._keys;
    if (k.left.isDown  || k.a.isDown || k.q.isDown || k.z.isDown) return -1;
    if (k.right.isDown || k.d.isDown || k.e.isDown || k.c.isDown) return  1;
    return 0;
  }

  _getDY() {
    const k = this._keys;
    if (k.up.isDown   || k.w.isDown || k.q.isDown || k.e.isDown) return -1;
    if (k.down.isDown || k.s.isDown || k.z.isDown || k.c.isDown) return  1;
    return 0;
  }

  // ──────────────────────────────────────────────────────────
  //  ターン処理
  // ──────────────────────────────────────────────────────────
  _doPlayerTurn(dx, dy) {
    this._turnLocked = true;
    const { x: px, y: py } = this._playerData.position;
    const nx = px + dx, ny = py + dy;
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
      this.tweens.add({ targets: this._playerSprite, x: wpx, y: wpy, duration: 100 });
      this._updateCoordText();
      this._updateFog();

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
      this._updateFog();
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
        (x, y) => (x === playerPos.x && y === playerPos.y)
               || this._isEnemyAt(x, y, enemy.instanceId),
      );
      if (action === null) {
        const dmg = BattleSystem.applyAttack(enemy, this._playerData);
        this._showDamageText(playerPos.x, playerPos.y, dmg, '#ff4444');
        this._logMessage(`${enemy.characterId}に${dmg}ダメージを受けた！`);
        if (this._playerData.hp <= 0) { this._gameOver(); return; }
      } else {
        enemy.position.x = action.x;
        enemy.position.y = action.y;
        const { px, py } = this._tileToWorld(action.x, action.y);
        const sprite = this._enemySprites.get(enemy.instanceId);
        const hpText = this._hpTexts.get(enemy.instanceId);
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

  _tileToWorld(tx, ty) {
    return { px: tx * TILE_SIZE + TILE_SIZE / 2, py: ty * TILE_SIZE + TILE_SIZE / 2 };
  }

  // ──────────────────────────────────────────────────────────
  //  敵の除去
  // ──────────────────────────────────────────────────────────
  _removeEnemy(enemy) {
    const sprite = this._enemySprites.get(enemy.instanceId);
    const hpText = this._hpTexts.get(enemy.instanceId);
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
    this._hpTexts.get(enemy.instanceId)?.setText(this._hpLabel(enemy));
  }

  // ──────────────────────────────────────────────────────────
  //  ダメージエフェクト
  // ──────────────────────────────────────────────────────────
  _showDamageText(tx, ty, dmg, color = '#ffffff') {
    const { px, py } = this._tileToWorld(tx, ty);
    const t = this.add.text(px, py - 10, `-${dmg}`, {
      fontFamily: 'monospace', fontSize: '14px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(90);
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
    }).setScrollFactor(0).setDepth(200);
    this.add.text(cx, cy + 50, 'SPACEでタイトルへ', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffaaaa',
    }).setScrollFactor(0).setDepth(200);
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
    if (this._fogRT) { this._fogRT.destroy(); this._fogRT = null; }

    this._generateDungeon();
    this._drawTiles();
    this._initFog();

    const { x, y } = this._startPos;
    this._playerData.position = { x, y };
    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite.setPosition(px, py);

    this._spawnEnemies();
    this.cameras.main
      .setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
      .startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP)
      .setZoom(ZOOM);
    this._updateFog();
    this._updateFloorText();
    this._updateHpBar();
    this._logMessage(`--- B${this._floor}Fに降りた ---`);
  }

  // ──────────────────────────────────────────────────────────
  //  UI（UIカメラのみが描画するオブジェクトとして作成）
  // ──────────────────────────────────────────────────────────
  _buildUI() {
    const W = this.scale.width;
    const H = this.scale.height;
    const style = {
      fontFamily: 'monospace', fontSize: '13px',
      color: '#aaffaa', stroke: '#001100', strokeThickness: 3,
    };

    // UIパネル背景
    const panelBg = this.add.rectangle(90, 48, 180, 76, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(200);

    this._floorText = this.add.text(10, 10, this._floorLabel(), style)
      .setScrollFactor(0).setDepth(201);
    this._coordText = this.add.text(10, 28, this._coordLabel(), style)
      .setScrollFactor(0).setDepth(201);

    // HPバー背景
    this.add.rectangle(10, 48, 160, 12, 0x333333)
      .setScrollFactor(0).setDepth(201).setOrigin(0, 0);
    // HPバー前景
    this._hpBarFgImg = this.add.rectangle(10, 48, 160, 12, 0x44dd44)
      .setScrollFactor(0).setDepth(202).setOrigin(0, 0);
    // HPラベル
    this._hpLabel2 = this.add.text(10, 62, '', style)
      .setScrollFactor(0).setDepth(203);

    this._updateHpBar();

    // メッセージログ（下部）
    this._logLines = [];
    for (let i = 0; i < 3; i++) {
      this._logLines.push(
        this.add.text(10, H - 14 - i * 14, '', {
          fontFamily: 'monospace', fontSize: '11px',
          color: '#ccffcc', stroke: '#000000', strokeThickness: 2,
        }).setScrollFactor(0).setDepth(201)
      );
    }
    this._logMessages = [];

    // 操作ガイド
    this.add.text(W - 8, H - 8,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア', {
      fontFamily: 'monospace', fontSize: '10px',
      color: '#446644', stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(201).setOrigin(1, 1);

    // UIカメラはメインカメラのゲームオブジェクトを無視し
    // scrollFactor(0)のオブジェクトのみを表示するため、
    // メインカメラのignoreListに追加する必要はない
    // （scrollFactor(0)はすべてのカメラで機能する）
  }

  _updateHpBar() {
    const p   = this._playerData;
    const rat = Math.max(0, p.hp / p.maxHp);
    const fgW = Math.max(1, Math.floor(160 * rat));
    this._hpBarFgImg.setSize(fgW, 12);
    const col = rat > 0.5 ? 0x44dd44 : rat > 0.25 ? 0xdddd44 : 0xdd4444;
    this._hpBarFgImg.setFillStyle(col);
    this._hpLabel2.setText(`HP ${p.hp} / ${p.maxHp}`);
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
