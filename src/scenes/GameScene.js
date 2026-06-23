import { DungeonGenerator }   from '../game/DungeonGenerator.js';
import { Enemy }              from '../game/Enemy.js';
import { Ally }               from '../game/Ally.js';
import { BattleSystem }       from '../game/BattleSystem.js';
import { CharacterFactory }   from '../game/CharacterFactory.js';
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

    this._factory      = new CharacterFactory();
    this._playerData   = null;
    this._playerSprite = null;

    this._enemies      = [];
    this._enemySprites = new Map();
    this._hpTexts      = new Map();

    this._allies       = [];
    this._allySprites  = new Map();
    this._allyHpTexts  = new Map();

    this._turnLocked     = false;
    this._pendingRecruit = null;

    // 技メニュー
    this._skillMenuOpen  = false;
    this._selectedSkillIdx = 0;
  }

  // ──────────────────────────────────────────────────────────
  create() {
    this.scene.launch('UIScene');

    // CharacterFactoryのJSONロードを待ってからゲームを開始
    this._factory.init().then(() => {
      this._generateDungeon();
      this._drawTiles();
      this._spawnPlayer();
      this._spawnEnemies();
      this._setupCamera();
      this._setupInput();
      this._updateFog();
      this._emitAll();
    }).catch(err => {
      console.error('CharacterFactory init failed:', err);
    });
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
        const key = t === TILE.FLOOR ? 'tile_floor' : t === TILE.STAIRS ? 'tile_stairs' : 'tile_wall';
        const px  = x * TILE_SIZE + TILE_SIZE / 2;
        const py  = y * TILE_SIZE + TILE_SIZE / 2;
        row.push(this.add.image(px, py, key).setDepth(1).setAlpha(0));
      }
      this._tileSprites.push(row);
    }
  }

  // ──────────────────────────────────────────────────────────
  //  霧
  // ──────────────────────────────────────────────────────────
  _updateFog() {
    const visible = this._calcVisible();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (visible[y][x]) this._visited[y][x] = true;
        const tile = this._tileSprites[y][x];
        if (!tile) continue;
        if (visible[y][x])           tile.setAlpha(1).setTint(0xffffff);
        else if (this._visited[y][x]) tile.setAlpha(1).setTint(0x445566);
        else                          tile.setAlpha(0);
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
    const vis  = Array.from({ length: MAP_HEIGHT }, () => new Array(MAP_WIDTH).fill(false));
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

    // 既存のプレイヤーデータがあればHP・レベル・技を引き継ぐ（フロア遷移時）
    if (!this._playerData) {
      this._playerData = this._factory.createPlayer({ x, y });
    } else {
      this._playerData.position = { x, y };
    }

    const { px, py } = this._tileToWorld(x, y);
    this._playerSprite = this.add.image(px, py, 'player').setDepth(10).setAlpha(0);
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

    const pp    = this._playerData.position;
    const pRoom = this._rooms.find(r => this._inRoom(r, pp.x, pp.y));
    let placed = 0, tries = 0;

    while (placed < ENEMY_COUNT && tries < 200) {
      tries++;
      const rx = Math.floor(Math.random() * MAP_WIDTH);
      const ry = Math.floor(Math.random() * MAP_HEIGHT);
      if (this._map[ry][rx] === TILE.WALL)     continue;
      if (this._isAnyOccupied(rx, ry))          continue;
      if (pRoom && this._inRoom(pRoom, rx, ry)) continue;
      if (rx === pp.x && ry === pp.y)           continue;

      const typeIdx = Math.min(
        Math.floor(Math.random() * (1 + this._floor * 0.5)),
        ENEMY_TYPES.length - 1
      );
      const charId = ENEMY_TYPES[typeIdx];
      const level  = Math.max(1, this._floor + Math.floor(Math.random() * 2) - 1);

      // CharacterFactory経由で生成（なければEnemy従来方式にフォールバック）
      let eData;
      if (this._factory.isReady) {
        eData = this._factory.createEnemy(charId, { x: rx, y: ry }, level);
        eData.instanceId = `enemy_${rx}_${ry}_${Date.now()}_${placed}`;
        eData.state = 'roaming';
      } else {
        eData = new Enemy(charId, { x: rx, y: ry }, level);
      }

      this._enemies.push(eData);
      const { px, py } = this._tileToWorld(rx, ry);
      const sprite = this.add.image(px, py, `enemy_${charId}`).setDepth(9).setVisible(false);
      this._enemySprites.set(eData.instanceId, sprite);

      const hpText = this.add.text(px, py - 18, `${eData.hp}/${eData.maxHp}`, {
        fontFamily: 'monospace', fontSize: '10px',
        color: '#ff6666', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(50).setVisible(false);
      this._hpTexts.set(eData.instanceId, hpText);

      placed++;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  仲間スプライト生成
  // ──────────────────────────────────────────────────────────
  _createAllySprite(ally) {
    const { px, py } = this._tileToWorld(ally.position.x, ally.position.y);
    const sprite = this.add.image(px, py, `enemy_${ally.characterId}`)
      .setDepth(9).setTint(0x88ddff);
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
      f: Phaser.Input.Keyboard.KeyCodes.F,       // 技メニュー開閉
      one:   Phaser.Input.Keyboard.KeyCodes.ONE,
      two:   Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four:  Phaser.Input.Keyboard.KeyCodes.FOUR,
      y: Phaser.Input.Keyboard.KeyCodes.Y,
      n: Phaser.Input.Keyboard.KeyCodes.N,
    });

    ['up','down','left','right','w','a','s','d','q','e','z','c'].forEach(k =>
      this._keys[k].on('down', () => this._onDirectionKey())
    );
    this._keys.r.on('down', () => {
      if (this._turnLocked || this._pendingRecruit || this._skillMenuOpen) return;
      this._turnLocked = true;
      this._startFloorTransition();
    });
    this._keys.f.on('down', () => this._toggleSkillMenu());

    // 技選択（メニュー open時のみ有効）
    this._keys.one.on('down',   () => this._skillMenuOpen ? this._useSkillByIndex(0) : this._setAllyCommand('follow'));
    this._keys.two.on('down',   () => this._skillMenuOpen ? this._useSkillByIndex(1) : this._setAllyCommand('wait'));
    this._keys.three.on('down', () => this._skillMenuOpen ? this._useSkillByIndex(2) : this._setAllyCommand('attack'));
    this._keys.four.on('down',  () => this._skillMenuOpen ? this._useSkillByIndex(3) : null);

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

  // ──────────────────────────────────────────────────────────
  //  技メニュー
  // ──────────────────────────────────────────────────────────
  _toggleSkillMenu() {
    if (this._turnLocked || this._pendingRecruit) return;
    this._skillMenuOpen = !this._skillMenuOpen;
    this.game.events.emit('ui-skill-menu', {
      open:   this._skillMenuOpen,
      skills: this._playerData?.skills ?? [],
    });
  }

  _useSkillByIndex(idx) {
    const skills = this._playerData?.skills ?? [];
    const skill  = skills[idx];
    if (!skill) return;
    if (skill.pp <= 0) {
      this._log(`${skill.name}はPPが切れている！`);
      return;
    }

    this._skillMenuOpen = false;
    this.game.events.emit('ui-skill-menu', { open: false, skills });

    // 技の射程で対象を決定
    const targets = this._resolveSkillTargets(skill);
    if (targets === null) {
      this._log(`対象がいない！`);
      return;
    }

    this._turnLocked = true;
    const result = BattleSystem.applySkill(this._playerData, targets, skill);

    if (skill.type === 'heal') {
      this._log(`${skill.name}を使った！HP+${result.healAmt}`);
      this._showHealText(this._playerData.position.x, this._playerData.position.y, result.healAmt);
    } else {
      for (const { target, dmg } of result.dmgList) {
        this._showDamageText(target.position.x, target.position.y, dmg, '#ffdd44');
        this._hpTexts.get(target.instanceId)?.setText(`${target.hp}/${target.maxHp}`);
        this._log(`${skill.name}で${target.name ?? target.characterId}に${dmg}ダメージ！`);
        if (target.hp <= 0) {
          this._onEnemyKilled(target, this._playerData);
        }
      }
    }

    // 技UIのPP更新
    this.game.events.emit('ui-skill-menu', { open: false, skills: this._playerData.skills });
    this.game.events.emit('ui-update-hp', { hp: this._playerData.hp, maxHp: this._playerData.maxHp });

    this._continueTurnAfterPlayer();
  }

  /**
   * 技の射程に応じた対象リストを返す
   * @returns {object[]|null} - null = 対象なし（技を使わない）
   */
  _resolveSkillTargets(skill) {
    const pp = this._playerData.position;

    switch (skill.range) {
      case 'self':
        return [this._playerData];

      case 'adjacent': {
        // プレイヤーが向いている方向（最後の移動方向）の隣接1マスの敵
        const adj = this._enemies.filter(e =>
          !e.isDead &&
          Math.abs(e.position.x - pp.x) <= 1 &&
          Math.abs(e.position.y - pp.y) <= 1 &&
          !(e.position.x === pp.x && e.position.y === pp.y)
        );
        return adj.length > 0 ? [adj[0]] : null;
      }

      case 'line': {
        // プレイヤーから8方向のうち、最も近い敵がいる方向に直線で全貫通
        const dir = this._getFacingDir();
        const hits = [];
        for (let i = 1; i <= 10; i++) {
          const tx = pp.x + dir.dx * i;
          const ty = pp.y + dir.dy * i;
          if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) break;
          if (this._map[ty][tx] === TILE.WALL) break;
          const hit = this._enemies.find(e => !e.isDead && e.position.x === tx && e.position.y === ty);
          if (hit) hits.push(hit);
        }
        return hits.length > 0 ? hits : null;
      }

      case 'area': {
        // 周囲8マス全体
        const area = this._enemies.filter(e =>
          !e.isDead &&
          Math.abs(e.position.x - pp.x) <= 1 &&
          Math.abs(e.position.y - pp.y) <= 1 &&
          !(e.position.x === pp.x && e.position.y === pp.y)
        );
        return area.length > 0 ? area : null;
      }

      default:
        return null;
    }
  }

  /** 最後に移動した方向（なければ下方向をデフォルト） */
  _getFacingDir() {
    return this._lastDir ?? { dx: 0, dy: 1 };
  }

  // ──────────────────────────────────────────────────────────
  //  方向キー入力
  // ──────────────────────────────────────────────────────────
  _onDirectionKey() {
    if (this._turnLocked || this._pendingRecruit) return;
    if (this._skillMenuOpen) {
      // 技メニューが開いていればEscとして閉じる
      this._skillMenuOpen = false;
      this.game.events.emit('ui-skill-menu', { open: false, skills: this._playerData?.skills ?? [] });
      return;
    }
    const dx = this._getDX(), dy = this._getDY();
    if (dx === 0 && dy === 0) return;
    this._lastDir = { dx, dy };
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

    const target = this._enemies.find(e => !e.isDead && e.position.x === nx && e.position.y === ny);

    if (target) {
      const dmg = BattleSystem.applyAttack(this._playerData, target);
      this._showDamageText(nx, ny, dmg, '#ffffff');
      this._hpTexts.get(target.instanceId)?.setText(`${target.hp}/${target.maxHp}`);
      this._log(`${target.name ?? target.characterId}に${dmg}ダメージ！`);
      if (target.hp <= 0) {
        this._onEnemyKilled(target, this._playerData);
        if (this._pendingRecruit) return;
      }
    } else if (this._isWalkable(nx, ny)) {
      const allyHere = this._allies.find(a => !a.isDead && a.position.x === nx && a.position.y === ny);
      if (allyHere) {
        const { px: apx, py: apy } = this._tileToWorld(px, py);
        allyHere.position.x = px;
        allyHere.position.y = py;
        const allySprite = this._allySprites.get(allyHere.instanceId);
        const allyHpText = this._allyHpTexts.get(allyHere.instanceId);
        if (allySprite) this.tweens.add({ targets: allySprite, x: apx, y: apy, duration: 100 });
        if (allyHpText) this.tweens.add({ targets: allyHpText, x: apx, y: apy - 18, duration: 100 });
      }

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
  //  敵撃破処理（経験値・仲間化）
  // ──────────────────────────────────────────────────────────
  _onEnemyKilled(enemy, killer) {
    const baseExp = enemy.expDrop ?? 8;
    const gained  = BattleSystem.calcExp(baseExp, killer.level, enemy.level);
    this._log(`${enemy.name ?? enemy.characterId}を倒した！(EXP +${gained})`);
    this._removeEnemy(enemy);

    // 経験値付与とレベルアップチェック
    this._grantExp(killer, gained);

    // 仲間化の打診
    this._maybeOfferRecruit(enemy);
  }

  _grantExp(entity, amount) {
    if (!entity.exp !== undefined) entity.exp = 0;
    entity.exp = (entity.exp ?? 0) + amount;

    const { leveledUp, newSkills } = this._factory.tryLevelUp(entity);
    if (leveledUp) {
      const name = entity.name ?? entity.characterId ?? '冒険者';
      this._log(`${name}はレベル${entity.level}になった！`);
      this.game.events.emit('ui-update-hp', {
        hp: entity.hp, maxHp: entity.maxHp,
      });
      // 新技習得ログ
      for (const sk of newSkills) {
        this._log(`${name}は「${sk.name}」を覚えた！`);
      }
      // 技メニューを更新
      if (entity.type === 'player') {
        this.game.events.emit('ui-skill-menu', {
          open: false, skills: entity.skills,
        });
      }
    }

    if (entity.type === 'player') {
      this.game.events.emit('ui-update-exp', {
        level: entity.level,
        exp: entity.exp,
        expToNext: entity.expToNext,
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  //  仲間化フロー
  // ──────────────────────────────────────────────────────────
  _maybeOfferRecruit(defeatedEnemy) {
    if (this._allies.length >= MAX_ALLIES) return;
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
      let ally;
      if (this._factory.isReady) {
        const data = this._factory.createAllyFromEnemy(enemy, enemy.position);
        if (data) {
          // Ally.jsの形式に合わせる
          data.instanceId = `ally_${Date.now()}`;
          data.isDead = false;
          ally = data;
        }
      }
      if (!ally) ally = Ally.fromEnemy(enemy); // フォールバック

      this._allies.push(ally);
      this._createAllySprite(ally);
      this._log(`${ally.name ?? ally.characterId}が仲間になった！`);
      this._updateFog();
    } else {
      this._log(`${enemy.name ?? enemy.characterId}を仲間にしなかった`);
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

      const action = ally.decideAction
        ? ally.decideAction(
            pp, this._enemies,
            (x, y) => this._isWalkable(x, y),
            (x, y) => (x === pp.x && y === pp.y) || this._isAnyOccupied(x, y, ally.instanceId),
          )
        : null;

      if (!action) continue;

      if (action.type === 'attack') {
        const dmg = BattleSystem.applyAttack(ally, action.target);
        this._showDamageText(action.target.position.x, action.target.position.y, dmg, '#88ddff');
        this._hpTexts.get(action.target.instanceId)?.setText(`${action.target.hp}/${action.target.maxHp}`);
        if (action.target.hp <= 0) {
          this._log(`仲間が${action.target.name ?? action.target.characterId}を倒した！`);
          this._grantExp(ally, BattleSystem.calcExp(
            action.target.expDrop ?? 8, ally.level, action.target.level
          ));
          this._removeEnemy(action.target);
        } else {
          this._log(`仲間が${action.target.name ?? action.target.characterId}に${dmg}ダメージ！`);
        }
      } else if (action.type === 'move') {
        ally.position.x = action.x;
        ally.position.y = action.y;
        const { px, py } = this._tileToWorld(action.x, action.y);
        const sprite  = this._allySprites.get(ally.instanceId);
        const hpText  = this._allyHpTexts.get(ally.instanceId);
        if (sprite) this.tweens.add({ targets: sprite,  x: px,      y: py,      duration: 100 });
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
      if (enemy.hp <= 0) continue;

      const adjacentAlly = this._allies.find(a => !a.isDead && BattleSystem.isAdjacent(enemy, a));
      if (adjacentAlly) {
        const dmg = BattleSystem.applyAttack(enemy, adjacentAlly);
        this._showDamageText(adjacentAlly.position.x, adjacentAlly.position.y, dmg, '#ff4444');
        this._allyHpTexts.get(adjacentAlly.instanceId)?.setText(`${adjacentAlly.hp}/${adjacentAlly.maxHp}`);
        this._log(`${enemy.name ?? enemy.characterId}が仲間に${dmg}ダメージ！`);
        if (adjacentAlly.hp <= 0) {
          this._log(`仲間が倒れた…`);
          this._removeAlly(adjacentAlly);
        }
        continue;
      }

      // Enemy.jsのdecideActionを使う（または同等の簡易AIをインライン実装）
      let action;
      if (typeof enemy.decideAction === 'function') {
        action = enemy.decideAction(
          pp,
          (x, y) => this._isWalkable(x, y),
          (ex, ey) => this._isPlayerInSameRoom(ex, ey),
          (x, y) => (x === pp.x && y === pp.y) || this._isAnyOccupied(x, y, enemy.instanceId),
        );
      } else {
        // factory生成の敵（プレーンオブジェクト）用の簡易AI
        action = this._simpleEnemyAI(enemy, pp);
      }

      if (action === null) {
        const dmg = BattleSystem.applyAttack(enemy, this._playerData);
        this._showDamageText(pp.x, pp.y, dmg, '#ff4444');
        this._log(`${enemy.name ?? enemy.characterId}に${dmg}ダメージを受けた！`);
        if (this._playerData.hp <= 0) { this._gameOver(); return; }
      } else if (action) {
        enemy.position.x = action.x;
        enemy.position.y = action.y;
        const { px, py } = this._tileToWorld(action.x, action.y);
        const sprite = this._enemySprites.get(enemy.instanceId);
        const hpText = this._hpTexts.get(enemy.instanceId);
        if (sprite) this.tweens.add({ targets: sprite,  x: px,      y: py,      duration: 100 });
        if (hpText) this.tweens.add({ targets: hpText, x: px, y: py - 18, duration: 100 });
      }
    }
  }

  /** factory生成の敵（プレーンオブジェクト）用の簡易AI */
  _simpleEnemyAI(enemy, playerPos) {
    const ex = enemy.position.x, ey = enemy.position.y;
    const dx = playerPos.x - ex, dy = playerPos.y - ey;

    // 隣接していれば攻撃（null）
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) return null;

    // 索敵
    if (this._isPlayerInSameRoom(ex, ey)) enemy.state = 'chasing';

    if (enemy.state === 'chasing') {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
        .sort((a, b) => {
          const da = Math.abs(ex+a[0]-playerPos.x) + Math.abs(ey+a[1]-playerPos.y);
          const db = Math.abs(ex+b[0]-playerPos.x) + Math.abs(ey+b[1]-playerPos.y);
          return da - db;
        });
      for (const [ddx, ddy] of dirs) {
        const nx = ex+ddx, ny = ey+ddy;
        if (this._isWalkable(nx,ny) && !this._isAnyOccupied(nx,ny,enemy.instanceId) &&
            !(nx===playerPos.x && ny===playerPos.y)) {
          return { x: nx, y: ny };
        }
      }
    } else {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]].sort(() => Math.random()-0.5);
      for (const [ddx, ddy] of dirs) {
        const nx = ex+ddx, ny = ey+ddy;
        if (this._isWalkable(nx,ny) && !this._isAnyOccupied(nx,ny,enemy.instanceId)) {
          return { x: nx, y: ny };
        }
      }
    }
    return undefined; // 動けない（undefined = 何もしない）
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
      e.hp > 0 && e.instanceId !== excludeId &&
      e.position.x === x && e.position.y === y
    );
  }

  _isAllyAt(x, y, excludeId = null) {
    return this._allies.some(a =>
      !a.isDead && a.instanceId !== excludeId &&
      a.position.x === x && a.position.y === y
    );
  }

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
  //  エフェクト
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

  _showHealText(tx, ty, amt) {
    const { px, py } = this._tileToWorld(tx, ty);
    const t = this.add.text(px, py - 10, `+${amt}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#44ff88',
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

    // 仲間を近くに再配置
    this._allies.forEach((ally, i) => {
      const candidates = [
        { x: x + (i + 1), y },
        { x: x - (i + 1), y },
        { x, y: y + (i + 1) },
        { x, y: y - (i + 1) },
      ];
      const spot = candidates.find(c => this._isWalkable(c.x, c.y)) ?? { x, y };
      ally.position = { ...spot };
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
    this.game.events.emit('ui-update-exp', {
      level: this._playerData.level,
      exp: this._playerData.exp ?? 0,
      expToNext: this._playerData.expToNext ?? 20,
    });
    this.game.events.emit('ui-skill-menu', {
      open: false,
      skills: this._playerData.skills ?? [],
    });
  }

  _log(msg) {
    this.game.events.emit('ui-log', { msg });
  }
}
