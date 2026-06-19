/**
 * UIScene - ゲームUIオーバーレイ（GameSceneと並列動作）
 * 固定解像度 1280x720 前提
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    const W = 1280;
    const H = 720;

    // ── 左上ステータスパネル ────────────────────────────────
    // パネル背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0a0a14, 0.88);
    panelBg.fillRect(0, 0, 200, 96);
    panelBg.lineStyle(1, 0x336633, 0.9);
    panelBg.strokeRect(0, 0, 200, 96);

    // フロア
    this._floorText = this.add.text(12, 8, 'B1F', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffff88',
    });

    // 座標
    this._coordText = this.add.text(75, 13, '(0, 0)', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#668866',
    });

    // HP ラベル
    this.add.text(12, 36, 'HP', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#88aaff',
    });

    // HPバー背景
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x222233);
    hpBg.fillRect(32, 37, 152, 12);

    // HPバー前景
    this._hpBarFg = this.add.rectangle(32, 37, 152, 12, 0x44dd44).setOrigin(0, 0);

    // HP数値
    this._hpValText = this.add.text(12, 53, 'HP 60 / 60', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaffaa',
    });

    // キャラ名
    this.add.text(12, 72, '冒険者 Lv.1', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#778877',
    });

    // ── 下部ログパネル ─────────────────────────────────────
    const LOG_Y = H - 82;
    const LOG_H = 82;

    const logBg = this.add.graphics();
    logBg.fillStyle(0x0a0a14, 0.88);
    logBg.fillRect(0, LOG_Y, W, LOG_H);
    logBg.lineStyle(1, 0x336633, 0.7);
    logBg.lineBetween(0, LOG_Y, W, LOG_Y);

    // ログラベル
    this.add.text(10, LOG_Y + 4, '▼ ログ', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#446644',
    });

    // ログ行（4行）
    this._logLines = [];
    this._logMessages = [];
    for (let i = 0; i < 4; i++) {
      this._logLines.push(
        this.add.text(10, LOG_Y + 16 + i * 16, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: i === 0 ? '#eeffee' : i === 1 ? '#aaccaa' : '#778877',
        })
      );
    }

    // ── ヒントバー（右下） ─────────────────────────────────
    const hintBg = this.add.graphics();
    hintBg.fillStyle(0x000000, 0.55);
    hintBg.fillRect(W - 420, H - 82, 420, 18);
    this.add.text(W - 416, H - 80,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#446644',
    });

    // ── イベント受信 ────────────────────────────────────────
    this.game.events.on('ui-update-hp',    this._onHpUpdate,    this);
    this.game.events.on('ui-update-floor', this._onFloorUpdate, this);
    this.game.events.on('ui-update-coord', this._onCoordUpdate, this);
    this.game.events.on('ui-log',          this._onLog,         this);
  }

  shutdown() {
    this.game.events.off('ui-update-hp',    this._onHpUpdate,    this);
    this.game.events.off('ui-update-floor', this._onFloorUpdate, this);
    this.game.events.off('ui-update-coord', this._onCoordUpdate, this);
    this.game.events.off('ui-log',          this._onLog,         this);
  }

  _onHpUpdate({ hp, maxHp }) {
    const rat = Math.max(0, hp / maxHp);
    this._hpBarFg.setSize(Math.max(1, Math.floor(152 * rat)), 12);
    const col = rat > 0.5 ? 0x44dd44 : rat > 0.25 ? 0xdddd44 : 0xdd4444;
    this._hpBarFg.setFillStyle(col);
    this._hpValText.setText(`HP ${hp} / ${maxHp}`);
  }

  _onFloorUpdate({ floor }) {
    this._floorText.setText(`B${floor}F`);
  }

  _onCoordUpdate({ x, y }) {
    this._coordText.setText(`(${x}, ${y})`);
  }

  _onLog({ msg }) {
    this._logMessages.unshift(msg);
    if (this._logMessages.length > 4) this._logMessages.length = 4;
    this._logLines.forEach((t, i) => {
      t.setText(this._logMessages[i] ?? '');
      t.setColor(i === 0 ? '#eeffee' : i === 1 ? '#aaccaa' : '#778877');
    });
  }
}
