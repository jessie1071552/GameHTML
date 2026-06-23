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
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0a0a14, 0.88);
    panelBg.fillRect(0, 0, 200, 116);
    panelBg.lineStyle(1, 0x336633, 0.9);
    panelBg.strokeRect(0, 0, 200, 116);

    // フロア
    this._floorText = this.add.text(12, 8, 'B1F', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffff88',
    });

    // 座標
    this._coordText = this.add.text(75, 13, '(0, 0)', {
      fontFamily: 'monospace', fontSize: '12px', color: '#668866',
    });

    // Lv表示
    this._lvText = this.add.text(150, 8, 'Lv.1', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffaaff',
    });

    // HP ラベル
    this.add.text(12, 36, 'HP', {
      fontFamily: 'monospace', fontSize: '12px', color: '#88aaff',
    });
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x222233);
    hpBg.fillRect(32, 37, 152, 12);
    this._hpBarFg = this.add.rectangle(32, 37, 152, 12, 0x44dd44).setOrigin(0, 0);
    this._hpValText = this.add.text(12, 53, 'HP 60 / 60', {
      fontFamily: 'monospace', fontSize: '12px', color: '#aaffaa',
    });

    // EXP バー
    this.add.text(12, 70, 'EX', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffaaff',
    });
    const expBg = this.add.graphics();
    expBg.fillStyle(0x221133);
    expBg.fillRect(32, 71, 152, 8);
    this._expBarFg = this.add.rectangle(32, 71, 0, 8, 0xcc44ff).setOrigin(0, 0);
    this._expValText = this.add.text(12, 82, 'EXP 0 / 20', {
      fontFamily: 'monospace', fontSize: '10px', color: '#cc88ff',
    });

    // キャラ名
    this.add.text(12, 98, '冒険者', {
      fontFamily: 'monospace', fontSize: '11px', color: '#778877',
    });

    // ── 技メニューパネル（右上・初期は非表示）──────────────────
    this._skillMenuContainer = this.add.container(W - 220, 0).setVisible(false).setDepth(500);

    const skillPanelBg = this.add.graphics();
    skillPanelBg.fillStyle(0x0a0a14, 0.95);
    skillPanelBg.fillRect(0, 0, 220, 180);
    skillPanelBg.lineStyle(2, 0xffdd44, 0.9);
    skillPanelBg.strokeRect(0, 0, 220, 180);
    this._skillMenuContainer.add(skillPanelBg);

    const skillTitle = this.add.text(10, 8, '[ 技メニュー ] F: 閉じる', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffdd44',
    });
    this._skillMenuContainer.add(skillTitle);

    this._skillTexts = [];
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(10, 30 + i * 36, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#dddddd',
      });
      const pp = this.add.text(10, 44 + i * 36, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#888888',
      });
      this._skillTexts.push({ name: t, pp });
      this._skillMenuContainer.add(t);
      this._skillMenuContainer.add(pp);
    }

    // ── 仲間コマンドパネル ──────────────────────────────────
    const cmdBg = this.add.graphics();
    cmdBg.fillStyle(0x0a0a14, 0.88);
    cmdBg.fillRect(0, 120, 200, 40);
    cmdBg.lineStyle(1, 0x336666, 0.8);
    cmdBg.strokeRect(0, 120, 200, 40);

    this.add.text(8, 124, '仲間指示', {
      fontFamily: 'monospace', fontSize: '10px', color: '#88ccdd',
    });
    this.add.text(8, 138, '[1]追従 [2]待機 [3]攻撃', {
      fontFamily: 'monospace', fontSize: '11px', color: '#88ddff',
    });
    this._cmdActiveText = this.add.text(8, 152, '現在: follow', {
      fontFamily: 'monospace', fontSize: '10px', color: '#557766',
    });

    // ── 下部ログパネル ─────────────────────────────────────
    const LOG_Y = H - 82;
    const logBg = this.add.graphics();
    logBg.fillStyle(0x0a0a14, 0.88);
    logBg.fillRect(0, LOG_Y, W, 82);
    logBg.lineStyle(1, 0x336633, 0.7);
    logBg.lineBetween(0, LOG_Y, W, LOG_Y);

    this.add.text(10, LOG_Y + 4, '▼ ログ', {
      fontFamily: 'monospace', fontSize: '10px', color: '#446644',
    });
    this._logLines = [];
    this._logMessages = [];
    for (let i = 0; i < 4; i++) {
      this._logLines.push(
        this.add.text(10, LOG_Y + 16 + i * 16, '', {
          fontFamily: 'monospace', fontSize: '12px',
          color: i === 0 ? '#eeffee' : i === 1 ? '#aaccaa' : '#778877',
        })
      );
    }

    // ── ヒントバー（右下） ─────────────────────────────────
    const hintBg = this.add.graphics();
    hintBg.fillStyle(0x000000, 0.55);
    hintBg.fillRect(W - 560, H - 82, 560, 18);
    this.add.text(W - 556, H - 80,
      '矢印/WASD: 移動・攻撃  Q/E/Z/C: 斜め  F: 技メニュー  1/2/3: 仲間指示  R: 次フロア', {
      fontFamily: 'monospace', fontSize: '11px', color: '#446644',
    });

    // ── 仲間化確認ダイアログ ────────────────────────────────
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
    this._recruitContainer.add(
      this.add.text(0, -8, '仲間にしますか？', {
        fontFamily: 'monospace', fontSize: '14px', color: '#cceecc',
      }).setOrigin(0.5)
    );
    this._recruitContainer.add(
      this.add.text(0, 36, '[Y] はい　　[N] いいえ', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffff88',
      }).setOrigin(0.5)
    );

    // ── イベント受信 ────────────────────────────────────────
    this.game.events.on('ui-update-hp',      this._onHpUpdate,      this);
    this.game.events.on('ui-update-floor',   this._onFloorUpdate,   this);
    this.game.events.on('ui-update-coord',   this._onCoordUpdate,   this);
    this.game.events.on('ui-log',            this._onLog,           this);
    this.game.events.on('ui-ally-command',   this._onAllyCommand,   this);
    this.game.events.on('ui-recruit-prompt', this._onRecruitPrompt, this);
    this.game.events.on('ui-recruit-close',  this._onRecruitClose,  this);
    this.game.events.on('ui-update-exp',     this._onExpUpdate,     this);
    this.game.events.on('ui-skill-menu',     this._onSkillMenu,     this);
  }

  shutdown() {
    this.game.events.off('ui-update-hp',      this._onHpUpdate,      this);
    this.game.events.off('ui-update-floor',   this._onFloorUpdate,   this);
    this.game.events.off('ui-update-coord',   this._onCoordUpdate,   this);
    this.game.events.off('ui-log',            this._onLog,           this);
    this.game.events.off('ui-ally-command',   this._onAllyCommand,   this);
    this.game.events.off('ui-recruit-prompt', this._onRecruitPrompt, this);
    this.game.events.off('ui-recruit-close',  this._onRecruitClose,  this);
    this.game.events.off('ui-update-exp',     this._onExpUpdate,     this);
    this.game.events.off('ui-skill-menu',     this._onSkillMenu,     this);
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

  _onExpUpdate({ level, exp, expToNext }) {
    this._lvText.setText(`Lv.${level}`);
    const rat = Math.min(1, exp / expToNext);
    this._expBarFg.setSize(Math.max(0, Math.floor(152 * rat)), 8);
    this._expValText.setText(`EXP ${exp} / ${expToNext}`);
  }

  _onSkillMenu({ open, skills }) {
    this._skillMenuContainer.setVisible(open);
    if (!skills) return;
    for (let i = 0; i < 4; i++) {
      const slot = skills[i];
      const row  = this._skillTexts[i];
      if (slot) {
        const ppEmpty = slot.pp <= 0;
        row.name.setText(`[${i+1}] ${slot.name}  (${slot.range})`);
        row.name.setColor(ppEmpty ? '#555555' : '#dddddd');
        row.pp.setText(`PP: ${slot.pp} / ${slot.maxPp}`);
        row.pp.setColor(slot.pp <= 2 ? '#ff4444' : '#888888');
      } else {
        row.name.setText(`[${i+1}] ---`);
        row.name.setColor('#333333');
        row.pp.setText('');
      }
    }
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
