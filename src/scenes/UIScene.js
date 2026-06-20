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
    hintBg.fillRect(W - 480, H - 82, 480, 18);
    this.add.text(W - 476, H - 80,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  R: 次フロア  1/2/3: 仲間指示', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#446644',
    });

    // ── 仲間コマンドパネル（左上パネルの下） ───────────────────
    const cmdBg = this.add.graphics();
    cmdBg.fillStyle(0x0a0a14, 0.88);
    cmdBg.fillRect(0, 100, 200, 40);
    cmdBg.lineStyle(1, 0x336666, 0.8);
    cmdBg.strokeRect(0, 100, 200, 40);

    this.add.text(8, 104, '仲間指示', {
      fontFamily: 'monospace', fontSize: '10px', color: '#88ccdd',
    });
    this._cmdText = this.add.text(8, 118, '[1]追従 [2]待機 [3]攻撃', {
      fontFamily: 'monospace', fontSize: '11px', color: '#88ddff',
    });
    this._cmdActiveText = this.add.text(8, 132, '現在: follow', {
      fontFamily: 'monospace', fontSize: '10px', color: '#557766',
    });

    // ── 仲間化確認ダイアログ（中央・初期は非表示） ─────────────
    this._recruitContainer = this.add.container(W / 2, H / 2).setVisible(false).setDepth(600);

    const dlgBg = this.add.graphics();
    dlgBg.fillStyle(0x0a0a14, 0.95);
    dlgBg.fillRect(-180, -70, 360, 140);
    dlgBg.lineStyle(2, 0x88ddff, 1);
    dlgBg.strokeRect(-180, -70, 360, 140);
    this._recruitContainer.add(dlgBg);

    this._recruitTitleText = this.add.text(0, -42, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5);
    this._recruitContainer.add(this._recruitTitleText);

    const promptText = this.add.text(0, -8, '仲間にしますか？', {
      fontFamily: 'monospace', fontSize: '14px', color: '#cceecc',
    }).setOrigin(0.5);
    this._recruitContainer.add(promptText);

    const hintText = this.add.text(0, 36, '[Y] はい　　[N] いいえ', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffff88',
    }).setOrigin(0.5);
    this._recruitContainer.add(hintText);

    // ── イベント受信 ────────────────────────────────────────
    this.game.events.on('ui-update-hp',      this._onHpUpdate,      this);
    this.game.events.on('ui-update-floor',   this._onFloorUpdate,   this);
    this.game.events.on('ui-update-coord',   this._onCoordUpdate,   this);
    this.game.events.on('ui-log',            this._onLog,           this);
    this.game.events.on('ui-ally-command',   this._onAllyCommand,   this);
    this.game.events.on('ui-recruit-prompt', this._onRecruitPrompt, this);
    this.game.events.on('ui-recruit-close',  this._onRecruitClose,  this);
  }

  shutdown() {
    this.game.events.off('ui-update-hp',      this._onHpUpdate,      this);
    this.game.events.off('ui-update-floor',   this._onFloorUpdate,   this);
    this.game.events.off('ui-update-coord',   this._onCoordUpdate,   this);
    this.game.events.off('ui-log',            this._onLog,           this);
    this.game.events.off('ui-ally-command',   this._onAllyCommand,   this);
    this.game.events.off('ui-recruit-prompt', this._onRecruitPrompt, this);
    this.game.events.off('ui-recruit-close',  this._onRecruitClose,  this);
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

  _onAllyCommand({ command }) {
    this._cmdActiveText.setText(`現在: ${command}`);
  }

  _onRecruitPrompt({ characterId, level }) {
    this._recruitTitleText.setText(`${characterId.toUpperCase()} Lv.${level} を`);
    this._recruitContainer.setVisible(true);
  }

  _onRecruitClose() {
    this._recruitContainer.setVisible(false);
  }
}
