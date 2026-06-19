/**
 * TitleScene - タイトル画面
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    const { width, height } = this.scale;

    // 背景
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d1a);

    // タイトルロゴ
    this.add.text(width / 2, height * 0.28, 'DUNGEON\nEXPLORER', {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: '#aaffaa',
      stroke: '#004400',
      strokeThickness: 4,
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.48, 'ポケダン風ダンジョンRPG', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#88aaff',
    }).setOrigin(0.5);

    // ── 点滅するスタートメッセージ ────────────────────────────
    const startText = this.add.text(width / 2, height * 0.65, '[ SPACE / クリックでスタート ]', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffff88',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // バージョン
    this.add.text(width - 8, height - 8, 'Phase 1 - Tilemap', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#445544',
    }).setOrigin(1, 1);

    // ── 入力 ──────────────────────────────────────────────────
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
    this.input.once('pointerdown', () => this.scene.start('GameScene'));
  }
}
