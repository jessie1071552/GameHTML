/**
 * BootScene
 *  - アセットのプリロードを担当
 *  - フェーズ1では画像の代わりにプログラムでテクスチャを生成する
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // ── ローディングバーUI ──────────────────────────────────
    const { width, height } = this.scale;
    const barW = 300, barH = 20;
    const barX = (width - barW) / 2;
    const barY = height / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x111111);
    bg.fillRect(0, 0, width, height);

    this.add.text(width / 2, barY - 40, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaffaa',
    }).setOrigin(0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x333333);
    barBg.fillRect(barX, barY, barW, barH);

    const barFg = this.add.graphics();
    this.load.on('progress', (v) => {
      barFg.clear();
      barFg.fillStyle(0x44ff88);
      barFg.fillRect(barX, barY, barW * v, barH);
    });

    this.load.on('complete', () => {
      barFg.clear();
      barFg.fillStyle(0x44ff88);
      barFg.fillRect(barX, barY, barW, barH);
    });

    // ── フェーズ1: プロシージャルテクスチャ生成 ─────────────
    //   実際の画像素材が揃ったらここで load.image / load.spritesheet を使う
  }

  create() {
    // プロシージャルテクスチャをここで生成する（preloadは非同期だがcreateは同期）
    this._generateTileTextures();
    this._generatePlayerTexture();

    this.scene.start('TitleScene');
  }

  // ── タイルテクスチャ生成 ───────────────────────────────────
  _generateTileTextures() {
    const TILE_SIZE = 32;

    // 壁タイル (暗い石タイル風)
    const wallGfx = this.make.graphics({ x: 0, y: 0, add: false });
    wallGfx.fillStyle(0x2a2a3a);
    wallGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // レンガ模様
    wallGfx.lineStyle(1, 0x1a1a28, 1);
    wallGfx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    wallGfx.fillStyle(0x363650);
    wallGfx.fillRect(2, 2, TILE_SIZE - 4, TILE_SIZE / 2 - 3);
    wallGfx.fillStyle(0x2e2e48);
    wallGfx.fillRect(2, TILE_SIZE / 2, TILE_SIZE / 2 - 4, TILE_SIZE / 2 - 3);
    wallGfx.fillRect(TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE / 2 - 3, TILE_SIZE / 2 - 3);
    wallGfx.generateTexture('tile_wall', TILE_SIZE, TILE_SIZE);
    wallGfx.destroy();

    // 床タイル (明るい石床風)
    const floorGfx = this.make.graphics({ x: 0, y: 0, add: false });
    floorGfx.fillStyle(0x4a4060);
    floorGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    floorGfx.lineStyle(1, 0x3a3050, 1);
    floorGfx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    // ハイライト
    floorGfx.fillStyle(0x524868, 0.5);
    floorGfx.fillRect(1, 1, TILE_SIZE - 2, 2);
    floorGfx.fillRect(1, 1, 2, TILE_SIZE - 2);
    floorGfx.generateTexture('tile_floor', TILE_SIZE, TILE_SIZE);
    floorGfx.destroy();

    // 階段タイル
    const stairsGfx = this.make.graphics({ x: 0, y: 0, add: false });
    stairsGfx.fillStyle(0x4a6040);
    stairsGfx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // 階段の段
    for (let i = 0; i < 4; i++) {
      stairsGfx.fillStyle(0x6a8060, 0.8);
      stairsGfx.fillRect(i * 4 + 4, i * 6 + 4, TILE_SIZE - i * 8 - 8, 4);
    }
    // 矢印（下へ）
    stairsGfx.fillStyle(0xaaffaa);
    stairsGfx.fillTriangle(16, 20, 22, 20, 19, 26);
    stairsGfx.generateTexture('tile_stairs', TILE_SIZE, TILE_SIZE);
    stairsGfx.destroy();
  }

  // ── プレイヤーテクスチャ生成 ───────────────────────────────
  _generatePlayerTexture() {
    const SIZE = 28;
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });

    // 影
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillEllipse(14, 26, 18, 6);

    // 体（青いフード付きマント）
    gfx.fillStyle(0x2244aa);
    gfx.fillRoundedRect(7, 12, 14, 14, 3);

    // 頭
    gfx.fillStyle(0xf0d0a0);
    gfx.fillCircle(14, 9, 7);

    // 目
    gfx.fillStyle(0x222222);
    gfx.fillCircle(11, 9, 1.5);
    gfx.fillCircle(17, 9, 1.5);

    // 口
    gfx.fillStyle(0xaa6644);
    gfx.fillRect(12, 12, 4, 1);

    // 剣
    gfx.fillStyle(0xcccccc);
    gfx.fillRect(21, 10, 2, 10);
    gfx.fillStyle(0xaa8833);
    gfx.fillRect(19, 14, 6, 2);

    gfx.generateTexture('player', SIZE, SIZE);
    gfx.destroy();
  }
}
