import { DungeonGenerator } from '../game/DungeonGenerator.js';
import { Enemy }            from '../game/Enemy.js';
import { Ally }             from '../game/Ally.js';
import { BattleSystem }     from '../game/BattleSystem.js';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TILE, CAMERA_LERP } from '../utils/constants.js';

const ENEMY_COUNT = 8;
const ENEMY_TYPES = ['slime', 'goblin', 'orc'];
const ZOOM = 2.0;
const MAX_ALLIES = 2;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._map         = null;
    this._rooms       = [];
    this._floor       = 1;
    this._tileSprites = [];
    this._visited     = null;

    this._playerData   = null;
    this._playerSprite = null;

    this._enemies      = [];
    this._enemySprites = new Map();
    this._hpTexts      = new Map();

    this._allies        = [];
    this._allySprites    = new Map();
    this._allyHpTexts    = new Map();

    this._turnLocked   = false;
    this._pendingRecruit = null; // 確認ダイアログ表示中の対象
  }

  create() {
    this.scene.launch('UIScene');

    this._generateDungeon();
    this._drawTiles();
    this._spawnPlayer();
    this._spawnEnemies();
    this._setupCamera();
    this._setupInput();
    this._updateFog();
    this._emitAll();
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
        const key = t === TILE.FLOOR   ? 'tile_floor'
                  : t === TILE.STAIRS  ? 'tile_stairs'
                  :                      'tile_wall';
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        row.push(this.add.image(px, py, key).setDepth(1).setAlpha(0));
      }
      this._tileSprites.push(row);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  霧 - タイル本体の alpha / tint を直接制御
  // ──────────────────────────────────────────────────────────
  _updateFog() {
    const visible = this._calcVisible();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (visible[y][x]) this._visited[y][x] = true;

        const tile = this._tileSprites[y][x];
        if (!tile) continue;

        if (visible[y][x]) {
          tile.setAlpha(1).setTint(0xffffff);
        } else if (this._visited[y][x]) {
          tile.setAlpha(1).setTint(0x445566);
        } else {
          tile.setAlpha(0);
        }
      }
    }

    this._enemies.forEach(e => {
      const show = visible[e.position.y]?.[e.position.x] ?? false;
      this._enemySprites.get(e.instanceId)?.setVisible(show);
      this._hpTexts.get(e.instanceId)?.setVisible(show);
    });

    this._allies.forEach(a => {
      const show = visible[a.position.y]?.[a.position.x] ?? false;
      this._allySprites.get(a.instanceId)?.setVisible(show);
      this._allyHpTexts.get(a.instanceId)?.setVisible(show);
    });
  }

  _calcVisible() {
    const vis = Array.from({ length: MAP_HEIGHT }, () =>
      new Array(MAP_WIDTH).fill(false)
    );
    const pp   = this._playerData.position;
    const room = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));

    if (room) {
      for (let y = room.y - 1; y <= room.y + room.h; y++)
        for (let x = room.x - 1; x <= room.x + room.w; x++)
          if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT)
            vis[y][x] = true;
    } else {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const nx = pp.x + dx, ny = pp.y + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)
            vis[ny][nx] = true;
        }
    }
    vis[pp.y][pp.x] = true;
    return vis;
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

    const pp       = this._playerData.position;
    const pRoom    = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));
    let placed = 0, tries = 0;

    while (placed < ENEMY_COUNT && tries < 200) {
      tries++;
      const rx = Math.floor(Math.random() * MAP_WIDTH);
      const ry = Math.floor(Math.random() * MAP_HEIGHT);
      if (this._map[ry][rx] === TILE.WALL)          continue;
      if (this._isAnyOccupied(rx, ry))               continue;
      if (pRoom && this._inRoom(pRoom, rx, ry))      continue;
      if (rx === pp.x && ry === pp.y)                continue;

      const typeIdx = Math.min(
        Math.floor(Math.random() * (1 + this._floor * 0.5)),
        ENEMY_TYPES.length - 1
      );
      const enemy = new Enemy(
        ENEMY_TYPES[typeIdx], { x: rx, y: ry },
        Math.max(1, this._floor + Math.floor(Math.random() * 2) - 1)
      );
      this._enemies.push(enemy);

      const { px, py } = this._tileToWorld(rx, ry);
      const sprite = this.add.image(px, py, `enemy_${enemy.characterId}`)
        .setDepth(9).setVisible(false);
      this._enemySprites.set(enemy.instanceId, sprite);

      const hpText = this.add.text(px, py - 18, `${enemy.hp}/${enemy.maxHp}`, {
        fontFamily: 'monospace', fontSize: '10px',
        color: '#ff6666', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(50).setVisible(false);
      this._hpTexts.set(enemy.instanceId, hpText);

      placed++;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  仲間スプライト生成（フロア間で引き継ぐ際にも使用）
  // ──────────────────────────────────────────────────────────
  _createAllySprite(ally) {
    const { px, py } = this._tileToWorld(ally.position.x, ally.position.y);
    const sprite = this.add.image(px, py, `enemy_${ally.characterId}`)
      .setDepth(9).setTint(0x88ddff); // 仲間は青みがかった色で区別
    this._allySprites.set(ally.instanceId, sprite);

    const hpText = this.add.text(px, py - 18, `${ally.hp}/${ally.maxHp}`, {
      fontFamily: 'monospace', fontSize: '10px',
      color: '#88ddff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(50);
    this._allyHpTexts.set(ally.instanceId, hpText);
  }

  // ──────────────────────────────────────────────────────────
  //  カメラ
  // ──────────────────────────────────────────────────────────
  _setupCamera() {
    this.cameras.main
      .setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
      .startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP)
      .setZoom(ZOOM);
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
      one:   Phaser.Input.Keyboard.KeyCodes.ONE,   // 仲間コマンド: follow
      two:   Phaser.Input.Keyboard.KeyCodes.TWO,   // 仲間コマンド: wait
      three: Phaser.Input.Keyboard.KeyCodes.THREE, // 仲間コマンド: attack
      y: Phaser.Input.Keyboard.KeyCodes.Y,         // 確認ダイアログ: YES
      n: Phaser.Input.Keyboard.KeyCodes.N,         // 確認ダイアログ: NO
    });

    ['up','down','left','right','w','a','s','d','q','e','z','c'].forEach(k =>
      this._keys[k].on('down', () => this._onDirectionKey())
    );
    this._keys.r.on('down', () => {
      if (this._turnLocked || this._pendingRecruit) return;
      this._turnLocked = true;
      this._startFloorTransition();
    });

    // 仲間コマンド切り替え（1=follow, 2=wait, 3=attack）
    this._keys.one.on('down',   () => this._setAllyCommand('follow'));
    this._keys.two.on('down',   () => this._setAllyCommand('wait'));
    this._keys.three.on('down', () => this._setAllyCommand('attack'));

    // 仲間化確認ダイアログ
    this._keys.y.on('down', () => this._resolveRecruit(true));
    this._keys.n.on('down', () => this._resolveRecruit(false));
  }

  _setAllyCommand(cmd) {
    if (this._allies.length === 0) return;
    this._allies.forEach(a => { a.command = cmd; });
    const label = cmd === 'follow' ? '追従' : cmd === 'wait' ? '待機' : '攻撃';
    this._log(`仲間に「${label}」を指示した`);
    this.game.events.emit('ui-ally-command', { command: cmd });
  }

  _onDirectionKey() {
    if (this._turnLocked || this._pendingRecruit) return;
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
  //  ターン処理（プレイヤー → 仲間 → 敵）
  // ──────────────────────────────────────────────────────────
  _doPlayerTurn(dx, dy) {
    this._turnLocked = true;
    const { x: px, y: py } = this._playerData.position;
    const nx = px + dx, ny = py + dy;

    const target = this._enemies.find(e => e.position.x === nx && e.position.y === ny);

    if (target) {
      const dmg = BattleSystem.applyAttack(this._playerData, target);
      this._showDamageText(nx, ny, dmg, '#ffffff');
      this._hpTexts.get(target.instanceId)?.setText(`${target.hp}/${target.maxHp}`);
      if (target.isDead) {
        this._log(`${target.characterId}を倒した！(+${target.expDrop}exp)`);
        this._removeEnemy(target);
        this._maybeOfferRecruit(target);
        // 仲間化確認待ちの場合はここでターンを止める（YES/NO待ち）
        if (this._pendingRecruit) return;
      } else {
        this._log(`${target.characterId}に${dmg}ダメージ！`);
      }
    } else if (this._isWalkable(nx, ny)) {
      this._playerData.position.x = nx;
      this._playerData.position.y = ny;
      const { px: wpx, py: wpy } = this._tileToWorld(nx, ny);
      this.tweens.add({ targets: this._playerSprite, x: wpx, y: wpy, duration: 100 });
      this.game.events.emit('ui-update-coord', { x: nx, y: ny });
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

    this._continueTurnAfterPlayer();
  }

  /** プレイヤー行動後、仲間→敵の順でターンを進める（確認ダイアログがなければ即時） */
  _continueTurnAfterPlayer() {
    this.time.delayedCall(120, () => {
      this._doAllyTurns();
      this.time.delayedCall(100, () => {
        this._doEnemyTurns();
        this.game.events.emit('ui-update-hp', {
          hp: this._playerData.hp, maxHp: this._playerData.maxHp,
        });
        this._updateFog();
        this._turnLocked = false;
      });
    });
  }

  // ──────────────────────────────────────────────────────────
  //  仲間化フロー
  // ──────────────────────────────────────────────────────────
  _maybeOfferRecruit(defeatedEnemy) {
    if (this._allies.length >= MAX_ALLIES) return; // 上限なら確認なし

    this._pendingRecruit = defeatedEnemy;
    this.game.events.emit('ui-recruit-prompt', {
      characterId: defeatedEnemy.characterId,
      level: defeatedEnemy.level,
    });
  }

  _resolveRecruit(accepted) {
    if (!this._pendingRecruit) return;
    const enemy = this._pendingRecruit;
    this._pendingRecruit = null;
    this.game.events.emit('ui-recruit-close');

    if (accepted) {
      const ally = Ally.fromEnemy(enemy);
      this._allies.push(ally);
      this._createAllySprite(ally);
      this._log(`${ally.characterId}が仲間になった！`);
      this._updateFog();
    } else {
      this._log(`${enemy.characterId}を仲間にしなかった`);
    }

    this._continueTurnAfterPlayer();
  }

  // ──────────────────────────────────────────────────────────
  //  仲間AIターン
  // ──────────────────────────────────────────────────────────
  _doAllyTurns() {
    const pp = this._playerData.position;

    for (const ally of this._allies) {
      if (ally.isDead) continue;

      const action = ally.decideAction(
        pp,
        this._enemies,
        (x, y) => this._isWalkable(x, y),
        (x, y) => this._isAnyOccupied(x, y, ally.instanceId),
      );

      if (!action) continue;

      if (action.type === 'attack') {
        const dmg = BattleSystem.applyAttack(ally, action.target);
        this._showDamageText(action.target.position.x, action.target.position.y, dmg, '#88ddff');
        this._hpTexts.get(action.target.instanceId)?.setText(`${action.target.hp}/${action.target.maxHp}`);
        if (action.target.isDead) {
          this._log(`仲間が${action.target.characterId}を倒した！`);
          this._removeEnemy(action.target);
        } else {
          this._log(`仲間が${action.target.characterId}に${dmg}ダメージ！`);
        }
      } else if (action.type === 'move') {
        ally.position.x = action.x;
        ally.position.y = action.y;
        const { px, py } = this._tileToWorld(action.x, action.y);
        const sprite = this._allySprites.get(ally.instanceId);
        const hpText = this._allyHpTexts.get(ally.instanceId);
        if (sprite) this.tweens.add({ targets: sprite, x: px, y: py, duration: 100 });
        if (hpText) this.tweens.add({ targets: hpText, x: px, y: py - 18, duration: 100 });
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  //  敵AIターン
  // ──────────────────────────────────────────────────────────
  _doEnemyTurns() {
    const pp = this._playerData.position;
    for (const enemy of this._enemies) {
      if (enemy.isDead) continue;

      // 仲間が隣接していれば仲間を優先攻撃、いなければプレイヤーを狙う
      const adjacentAlly = this._allies.find(a => !a.isDead && BattleSystem.isAdjacent(enemy, a));

      if (adjacentAlly) {
        const dmg = BattleSystem.applyAttack(enemy, adjacentAlly);
        this._showDamageText(adjacentAlly.position.x, adjacentAlly.position.y, dmg, '#ff4444');
        this._allyHpTexts.get(adjacentAlly.instanceId)?.setText(`${adjacentAlly.hp}/${adjacentAlly.maxHp}`);
        this._log(`${enemy.characterId}が仲間に${dmg}ダメージ！`);
        if (adjacentAlly.isDead) {
          this._log(`仲間が倒れた…`);
          this._removeAlly(adjacentAlly);
        }
        continue;
      }

      const action = enemy.decideAction(
        pp,
        (x, y) => this._isWalkable(x, y),
        (ex, ey) => this._isPlayerInSameRoom(ex, ey),
        (x, y) => (x === pp.x && y === pp.y) || this._isAnyOccupied(x, y, enemy.instanceId),
      );
      if (action === null) {
        const dmg = BattleSystem.applyAttack(enemy, this._playerData);
        this._showDamageText(pp.x, pp.y, dmg, '#ff4444');
        this._log(`${enemy.characterId}に${dmg}ダメージを受けた！`);
        if (this._playerData.hp <= 0) { this._gameOver(); return; }
      } else {
        enemy.position.x = action.x;
        enemy.position.y = action.y;
        const { px, py } = this._tileToWorld(action.x, action.y);
        const sprite  = this._enemySprites.get(enemy.instanceId);
        const hpText  = this._hpTexts.get(enemy.instanceId);
        if (sprite) this.tweens.add({ targets: sprite,  x: px,      y: py,      duration: 100 });
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

  _isAllyAt(x, y, excludeId = null) {
    return this._allies.some(a =>
      !a.isDead && a.instanceId !== excludeId &&
      a.position.x === x && a.position.y === y
    );
  }

  /** 敵・仲間どちらも考慮した占有チェック（敵同士・仲間同士・敵と仲間が重ならないようにする） */
  _isAnyOccupied(x, y, excludeId = null) {
    return this._isEnemyAt(x, y, excludeId) || this._isAllyAt(x, y, excludeId);
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
  //  敵・仲間の除去
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

  _removeAlly(ally) {
    const sprite = this._allySprites.get(ally.instanceId);
    const hpText = this._allyHpTexts.get(ally.instanceId);
    if (sprite) {
      this.tweens.add({
        targets: sprite, alpha: 0, y: sprite.y - 10, duration: 300,
        onComplete: () => sprite.destroy(),
      });
    }
    if (hpText) { hpText.destroy(); this._allyHpTexts.delete(ally.instanceId); }
    this._allySprites.delete(ally.instanceId);
    this._allies = this._allies.filter(a => a.instanceId !== ally.instanceId);
  }

  // ──────────────────────────────────────────────────────────
  //  ダメージエフェクト
  // ──────────────────────────────────────────────────────────
  _showDamageText(tx, ty, dmg, color) {
    const { px, py } = this._tileToWorld(tx, ty);
    const t = this.add.text(px, py - 10, `-${dmg}`, {
      fontFamily: 'monospace', fontSize: '14px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
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
    this._log('--- ゲームオーバー ---');

    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, 300, 120, 0x000000, 0.85).setScrollFactor(0).setDepth(500);
    this.add.text(cx, cy - 20, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ff4444',
      stroke: '#000000', strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(501);
    this.add.text(cx, cy + 25, 'SPACEでタイトルへ', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffaaaa',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(501);

    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.stop('UIScene');
      this.scene.start('TitleScene');
    });
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
    const bg   = this.add.rectangle(cx, cy, 260, 70, 0x000000, 0.85).setScrollFactor(0).setDepth(400);
    const text = this.add.text(cx, cy - 10, `B${this._floor}F`, {
      fontFamily: 'monospace', fontSize: '44px', color: '#aaffaa',
      stroke: '#004400', strokeThickness: 5,
    }).setScrollFactor(0).setOrigin(0.5).setDepth(401);
    const sub  = this.add.text(cx, cy + 26, `${this._floor}階層目`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#66aa66',
    }).setScrollFactor(0).setOrigin(0.5).setDepth(401);

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

    // 仲間スプライトも一旦破棄（位置を引き継いで再生成する）
    this._allySprites.forEach(s => s.destroy());
    this._allySprites.clear();
    this._allyHpTexts.forEach(t => t.destroy());
    this._allyHpTexts.clear();

    this._generateDungeon();
    this._drawTiles();

    const { x, y } = this._startPos;
    this._playerData.position = { x, y };
    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite.setPosition(px, py);

    // 仲間はプレイヤーの近くに再配置（HP・レベルは維持）
    this._allies.forEach((ally, i) => {
      const ax = Math.min(MAP_WIDTH - 1, x + (i + 1));
      const ay = y;
      ally.position = { x: this._isWalkable(ax, ay) ? ax : x, y: ay };
      this._createAllySprite(ally);
    });

    this._spawnEnemies();
    this.cameras.main
      .setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
      .startFollow(this._playerSprite, true, CAMERA_LERP, CAMERA_LERP)
      .setZoom(ZOOM);
    this._updateFog();
    this._emitAll();
    this._log(`--- B${this._floor}Fに降りた ---`);
  }

  // ── UIシーンへの通知 ────────────────────────────────────
  _emitAll() {
    this.game.events.emit('ui-update-floor', { floor: this._floor });
    this.game.events.emit('ui-update-hp', {
      hp: this._playerData.hp, maxHp: this._playerData.maxHp,
    });
    this.game.events.emit('ui-update-coord', { ...this._playerData.position });
  }

  _log(msg) {
    this.game.events.emit('ui-log', { msg });
  }
}
