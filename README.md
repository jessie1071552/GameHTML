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
- [x] **Phase 2**: ターン制・敵AI・戦闘システム
- [ ] Phase 3: 仲間・レベリング・技
- [ ] Phase 4: Firebase マルチ対応

## 📋 アップデート履歴

### Phase 2 - 2026/06/19
- ターン制を実装（プレイヤー行動 → 全敵AI行動の順）
- 敵スポーン（フロア入場時に4体、プレイヤーと別の部屋に配置）
- 敵AI: 同室でプレイヤーを発見 → 追跡（廊下でも継続）、視野外はランダム移動
- 攻撃: 隣接1マスで自動攻撃（部屋・廊下問わず）
- ダメージ計算を `BattleSystem.js` に分離（仲間・プレイヤーと共通）
- ダメージ数字エフェクト・HPバー・メッセージログ追加
- 敵3種追加: スライム・ゴブリン・オーク（フロアが深いほど強敵）
- ゲームオーバー画面追加

### Phase 1 - 2026/06/19
- Phaser 3 初期化・シーン管理
- プロシージャルダンジョン生成（BSP風: 部屋 + L字廊下）
- タイルマップ描画（壁・床・階段）
- プレイヤー8方向移動・カメラ追従
- 階段でフロア遷移

## 📁 ディレクトリ

```
project-root/
├── index.html
├── src/
│   ├── main.js                  # Phaserの初期化・シーン管理
│   ├── scenes/
│   │   ├── BootScene.js         # 素材ロード・プロシージャルテクスチャ
│   │   ├── TitleScene.js        # タイトル画面
│   │   └── GameScene.js         # メインゲーム（ターン制・戦闘）
│   ├── game/
│   │   ├── DungeonGenerator.js  # ダンジョン自動生成（BSP風）
│   │   ├── Enemy.js             # 敵エンティティ・AIロジック
│   │   └── BattleSystem.js      # 戦闘計算（ダメージ・隣接判定）
│   └── utils/
│       └── constants.js
└── assets/                      # 素材（フェーズ3以降で追加）
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
