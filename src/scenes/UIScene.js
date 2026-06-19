/**
 * UIScene - ゲームUIオーバーレイ（GameSceneと並列動作）
 * GameSceneのカメラズームと完全に独立して動作する
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    this._buildStatusPanel();
    this._buildLogPanel();
    this._buildHintBar();

    // リサイズ対応
    this.scale.on('resize', this._onResize, this);

    // GameSceneからのイベント受信
    this.game.events.on('ui-update-hp',    this._onHpUpdate,    this);
    this.game.events.on('ui-update-floor', this._onFloorUpdate, this);
    this.game.events.on('ui-update-coord', this._onCoordUpdate, this);
    this.game.events.on('ui-log',          this._onLog,         this);
  }

  shutdown() {
    this.scale.off('resize', this._onResize, this);
    this.game.events.off('ui-update-hp',    this._onHpUpdate,    this);
    this.game.events.off('ui-update-floor', this._onFloorUpdate, this);
    this.game.events.off('ui-update-coord', this._onCoordUpdate, this);
    this.game.events.off('ui-log',          this._onLog,         this);
  }

  // ── ステータスパネル（左上）────────────────────────────────
  _buildStatusPanel() {
    const PW = 190, PH = 92;

    this._statusBg = this.add.graphics();
    this._statusBg.fillStyle(0x0a0a14, 0.82);
    this._statusBg.fillRoundedRect(0, 0, PW, PH, 0);
    this._statusBg.lineStyle(1, 0x336633, 0.8);
    this._statusBg.strokeRoundedRect(0, 0, PW, PH, 0);

    // フロア表示
    this._floorText = this.add.text(12, 8, 'B1F', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffff88',
      stroke: '#443300',
      strokeThickness: 2,
    });

    // 座標
    this._coordText = this.add.text(80, 12, '(0, 0)', {
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
    this._hpBarBg = this.add.graphics();
    this._hpBarBg.fillStyle(0x222233);
    this._hpBarBg.fillRect(32, 37, 148, 12);

    // HPバー前景（rectangleで幅を動的変更）
    this._hpBarFg = this.add.rectangle(32, 37, 148, 12, 0x44dd44).setOrigin(0, 0);

    // HP数値
    this._hpValText = this.add.text(12, 53, 'HP 60 / 60', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaffaa',
    });

    // キャラ名（仮）
    this.add.text(12, 72, '冒険者', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#778877',
    });
  }

  // ── ログパネル（下部）──────────────────────────────────────
  _buildLogPanel() {
    this._logMessages = [];
    this._logContainer = this.add.container(0, 0);
    this._rebuildLogPanel();
  }

  _rebuildLogPanel() {
    this._logContainer.removeAll(true);

    const W   = this.scale.width;
    const H   = this.scale.height;
    const LH  = 78;   // ログパネル高さ
    const LY  = H - LH;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a14, 0.82);
    bg.fillRect(0, LY, W, LH);
    bg.lineStyle(1, 0x336633, 0.6);
    bg.lineBetween(0, LY, W, LY);
    this._logContainer.add(bg);

    // ログラベル
    const label = this.add.text(10, LY + 4, '[ ログ ]', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#446644',
    });
    this._logContainer.add(label);

    // ログ行（4行）
    this._logLines = [];
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(10, LY + 16 + i * 15, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: i === 0 ? '#eeffee' : i === 1 ? '#aaccaa' : '#778877',
      });
      this._logLines.push(t);
      this._logContainer.add(t);
    }

    this._refreshLogLines();
  }

  // ── ヒントバー（右下）──────────────────────────────────────
  _buildHintBar() {
    this._hintContainer = this.add.container(0, 0);
    this._rebuildHintBar();
  }

  _rebuildHintBar() {
    this._hintContainer.removeAll(true);
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(W - 350, H - 80, 350, 16);
    this._hintContainer.add(bg);

    const t = this.add.text(W - 346, H - 79,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#446644',
    });
    this._hintContainer.add(t);
  }

  // ── リサイズ ───────────────────────────────────────────────
  _onResize() {
    this._rebuildLogPanel();
    this._rebuildHintBar();
  }

  // ── イベントハンドラ ────────────────────────────────────────
  _onHpUpdate({ hp, maxHp }) {
    const rat = Math.max(0, hp / maxHp);
    const w   = Math.max(1, Math.floor(148 * rat));
    this._hpBarFg.setSize(w, 12);
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
    this._refreshLogLines();
  }

  _refreshLogLines() {
    if (!this._logLines) return;
    this._logLines.forEach((t, i) => {
      t.setText(this._logMessages[i] ?? '');
      t.setColor(i === 0 ? '#eeffee' : i === 1 ? '#aaccaa' : '#778877');
    });
  }
}
