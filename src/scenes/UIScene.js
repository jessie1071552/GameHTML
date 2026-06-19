/**
 * UIScene - ゲームUIオーバーレイ（GameSceneと並列動作）
 *  - カメラ固定・ズームなし
 *  - GameSceneからイベント経由でデータを受け取って描画する
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── 左上ステータスパネル ────────────────────────────────
    // パネル背景
    this.add.rectangle(0, 0, 200, 90, 0x000000, 0.72).setOrigin(0, 0);
    this.add.rectangle(1, 1, 198, 88, 0x224422, 0.3).setOrigin(0, 0);

    const style = {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaffaa',
    };

    // フロア
    this._floorText = this.add.text(10, 8, 'B1F', {
      ...style, fontSize: '16px', color: '#ffff88',
    });

    // HP ラベル
    this.add.text(10, 30, 'HP', { ...style, color: '#88aaff' });

    // HPバー背景
    this.add.rectangle(32, 33, 148, 11, 0x333333).setOrigin(0, 0);
    // HPバー前景
    this._hpBar = this.add.rectangle(32, 33, 148, 11, 0x44dd44).setOrigin(0, 0);
    // HP数値
    this._hpText = this.add.text(10, 47, 'HP 60 / 60', style);

    // 座標
    this._coordText = this.add.text(10, 65, '(0, 0)', {
      ...style, color: '#888888', fontSize: '11px',
    });

    // ── 下部ログパネル ─────────────────────────────────────
    const logH = 68;
    const logY = H - logH;

    // ログパネル背景
    this.add.rectangle(0, logY, W, logH, 0x000000, 0.72).setOrigin(0, 0);
    this.add.rectangle(0, logY, W, 2, 0x44aa44, 0.5).setOrigin(0, 0);

    this._logLines = [];
    for (let i = 0; i < 4; i++) {
      this._logLines.push(
        this.add.text(12, logY + 6 + i * 15, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: i === 0 ? '#eeffee' : '#99bb99',
        })
      );
    }
    this._logMessages = [];

    // ── 操作ガイド（右上） ──────────────────────────────────
    this.add.rectangle(W, 0, 230, 22, 0x000000, 0.55).setOrigin(1, 0);
    this.add.text(W - 8, 4, '矢印/WASD:移動  Q/E/Z/C:斜め  R:次F', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#557755',
    }).setOrigin(1, 0);

    // ── GameSceneからのイベントを受け取る ──────────────────
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

  // ── イベントハンドラ ────────────────────────────────────
  _onHpUpdate({ hp, maxHp }) {
    const rat = Math.max(0, hp / maxHp);
    const w   = Math.max(1, Math.floor(148 * rat));
    this._hpBar.setSize(w, 11);
    const col = rat > 0.5 ? 0x44dd44 : rat > 0.25 ? 0xdddd44 : 0xdd4444;
    this._hpBar.setFillStyle(col);
    this._hpText.setText(`HP ${hp} / ${maxHp}`);
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
      t.setColor(i === 0 ? '#eeffee' : '#99bb99');
    });
  }
}
