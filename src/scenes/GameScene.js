import { DungeonGenerator } from '../game/DungeonGenerator.js';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, TILE, CAMERA_LERP } from '../utils/constants.js';

/**
 * GameScene - メインゲームシーン（フェーズ1: タイルマップ表示 + 移動）
 *
 * フェーズ1スコープ:
 *   - プロシージャルダンジョン生成
 *   - タイルマップ描画
 *   - プレイヤー表示・8方向移動（矢印/WASD/ドット絵）
 *   - カメラのプレイヤー追従
 *   - UI: フロア番号・座標表示
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this._map    = null;   // 2D tile array
    this._rooms  = [];
    this._floor  = 1;

    // タイルスプライト群
    this._tileSprites = [];

    // プレイヤー
    this._player = null;
    this._playerTileX = 0;
    this._playerTileY = 0;

    // 入力フラグ（キーリピート制御）
    this._moveReady = true;
    this._moveCooldown = 150; // ms
  }

  // ──────────────────────────────────────────────────────────
  //  create
  // ──────────────────────────────────────────────────────────
  create() {
    this._generateDungeon();
    this._drawTiles();
    this._spawnPlayer();
    this._setupCamera();
    this._setupInput();
    this._buildUI();

    // リサイズ対応
    this.scale.on('resize', this._onResize, this);
  }

  // ──────────────────────────────────────────────────────────
  //  update
  // ──────────────────────────────────────────────────────────
  update(_time, _delta) {
    if (!this._moveReady) return;
    this._handleMovement();
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
    // 既存タイルをすべて破棄（再生成時のため）
    this._tileSprites.forEach(row => row.forEach(s => s.destroy()));
    this._tileSprites = [];

    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileType = this._map[y][x];
        const key = this._tileKey(tileType);
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const sprite = this.add.image(px, py, key);

        // 壁は少し暗くする（FOG感）
        if (tileType === TILE.WALL) {
          sprite.setAlpha(0.85);
        }

        row.push(sprite);
      }
      this._tileSprites.push(row);
    }
  }

  _tileKey(tileType) {
    switch (tileType) {
      case TILE.FLOOR:  return 'tile_floor';
      case TILE.STAIRS: return 'tile_stairs';
      default:          return 'tile_wall';
    }
  }

  // ──────────────────────────────────────────────────────────
  //  プレイヤースポーン
  // ──────────────────────────────────────────────────────────
  _spawnPlayer() {
    if (this._player) this._player.destroy();

    this._playerTileX = this._startPos.x;
    this._playerTileY = this._startPos.y;

    const { px, py } = this._tileToWorld(this._playerTileX, this._playerTileY);
    this._player = this.add.image(px, py, 'player').setDepth(10);

    // 着地アニメ
    this._player.setAlpha(0);
    this.tweens.add({
      targets: this._player,
      alpha: 1,
      y: py,
      duration: 400,
      ease: 'Back.easeOut',
    });
  }

  // ──────────────────────────────────────────────────────────
  //  カメラ
  // ──────────────────────────────────────────────────────────
  _setupCamera() {
    const totalW = MAP_WIDTH  * TILE_SIZE;
    const totalH = MAP_HEIGHT * TILE_SIZE;

    this.cameras.main.setBounds(0, 0, totalW, totalH);
    this.cameras.main.startFollow(this._player, true, CAMERA_LERP, CAMERA_LERP);
    this.cameras.main.setZoom(1.5);
  }

  // ──────────────────────────────────────────────────────────
  //  入力セットアップ
  // ──────────────────────────────────────────────────────────
  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
      // 斜め
      q:     Phaser.Input.Keyboard.KeyCodes.Q,
      e:     Phaser.Input.Keyboard.KeyCodes.E,
      z:     Phaser.Input.Keyboard.KeyCodes.Z,
      c:     Phaser.Input.Keyboard.KeyCodes.C,
      // 次の階段（デバッグ）
      r:     Phaser.Input.Keyboard.KeyCodes.R,
    });

    // 次フロアへ（Rキー: デバッグ用）
    this._keys.r.on('down', () => this._nextFloor());
  }

  // ──────────────────────────────────────────────────────────
  //  移動処理
  // ──────────────────────────────────────────────────────────
  _handleMovement() {
    const k = this._keys;

    let dx = 0, dy = 0;

    if      (k.left.isDown  || k.a.isDown) dx = -1;
    else if (k.right.isDown || k.d.isDown) dx =  1;

    if      (k.up.isDown    || k.w.isDown) dy = -1;
    else if (k.down.isDown  || k.s.isDown) dy =  1;

    // 斜め (Q/E/Z/C)
    if (k.q.isDown) { dx = -1; dy = -1; }
    if (k.e.isDown) { dx =  1; dy = -1; }
    if (k.z.isDown) { dx = -1; dy =  1; }
    if (k.c.isDown) { dx =  1; dy =  1; }

    if (dx === 0 && dy === 0) return;

    const nx = this._playerTileX + dx;
    const ny = this._playerTileY + dy;

    if (!this._isWalkable(nx, ny)) return;

    this._playerTileX = nx;
    this._playerTileY = ny;

    const { px, py } = this._tileToWorld(nx, ny);

    // スムーズ移動トゥイーン
    this.tweens.add({
      targets: this._player,
      x: px,
      y: py,
      duration: 120,
      ease: 'Linear',
    });

    // クールダウン
    this._moveReady = false;
    this.time.delayedCall(this._moveCooldown, () => { this._moveReady = true; });

    // 座標表示更新
    this._updateCoordText();

    // 階段チェック
    if (this._map[ny][nx] === TILE.STAIRS) {
      this._onStairs();
    }
  }

  _isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    return this._map[y][x] !== TILE.WALL;
  }

  // ──────────────────────────────────────────────────────────
  //  階段
  // ──────────────────────────────────────────────────────────
  _onStairs() {
    // フラッシュ演出後にフロア遷移
    this.cameras.main.flash(300, 200, 255, 200);
    this.time.delayedCall(350, () => this._nextFloor());
  }

  _nextFloor() {
    this._floor++;
    this._generateDungeon();
    this._drawTiles();
    this._spawnPlayer();
    this.cameras.main.startFollow(this._player, true, CAMERA_LERP, CAMERA_LERP);
    this._updateFloorText();
  }

  // ──────────────────────────────────────────────────────────
  //  UI
  // ──────────────────────────────────────────────────────────
  _buildUI() {
    // カメラに追従しないUI用のオーバーレイカメラを使う
    // → setScrollFactor(0) で固定

    const style = {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#aaffaa',
      stroke: '#001100',
      strokeThickness: 3,
    };

    this._floorText = this.add.text(10, 10, this._floorLabel(), style)
      .setScrollFactor(0)
      .setDepth(100);

    this._coordText = this.add.text(10, 30, this._coordLabel(), style)
      .setScrollFactor(0)
      .setDepth(100);

    // 操作ガイド
    this.add.text(10, this.scale.height - 16,
      '矢印/WASD: 移動  Q/E/Z/C: 斜め  R: 次フロア(デバッグ)', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#557755',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);
  }

  _floorLabel()  { return `Floor ${this._floor}`; }
  _coordLabel()  { return `(${this._playerTileX}, ${this._playerTileY})`; }

  _updateFloorText() { this._floorText?.setText(this._floorLabel()); }
  _updateCoordText() { this._coordText?.setText(this._coordLabel()); }

  // ──────────────────────────────────────────────────────────
  //  ユーティリティ
  // ──────────────────────────────────────────────────────────
  _tileToWorld(tx, ty) {
    return {
      px: tx * TILE_SIZE + TILE_SIZE / 2,
      py: ty * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  _onResize(gameSize) {
    // UI位置調整
    // （現在はscrollFactor(0)で対応済み）
  }
}
