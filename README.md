# Dungeon Explorer - ポケダン風ダンジョンRPG

ポケモン不思議のダンジョン準拠のブラウザターン制ダンジョンRPG。

## 🎮 プレイ方法

**URL**: https://jessie1071552.github.io/GameHTML/

| キー | 操作 |
|------|------|
| 矢印キー / WASD | 4方向移動 |
| Q / E / Z / C | 斜め移動 |
| R | 次フロアへ（デバッグ） |
| SPACE / クリック | タイトルからゲーム開始 |

## 🏗️ フェーズ進捗

- [x] **Phase 1**: Phaserセットアップ・タイルマップ表示・プレイヤー移動
- [ ] Phase 2: ターン制・敵AI・戦闘システム
- [ ] Phase 3: 仲間・レベリング・技
- [ ] Phase 4: Firebase マルチ対応

## 📁 ディレクトリ

```
project-root/
├── index.html
├── src/
│   ├── main.js                  # Phaserの初期化・シーン管理
│   ├── scenes/
│   │   ├── BootScene.js         # 素材ロード・プロシージャルテクスチャ
│   │   ├── TitleScene.js        # タイトル画面
│   │   └── GameScene.js         # メインゲーム
│   ├── game/
│   │   └── DungeonGenerator.js  # ダンジョン自動生成（BSP風）
│   └── utils/
│       └── constants.js
└── assets/                      # 素材（フェーズ2以降で追加）
    ├── tiles/
    ├── characters/
    └── data/
```

## 🛠️ 技術スタック

- **Phaser.js 3.80** (CDN)
- JavaScript ES Modules
- GitHub Pages ホスティング
- Firebase（マルチ対応フェーズで追加予定）

## 📦 ローカル実行

```bash
# 簡易HTTPサーバー（ES Modules のため必須）
npx serve .
# または
python3 -m http.server 8080
```

`http://localhost:8080` をブラウザで開く。
