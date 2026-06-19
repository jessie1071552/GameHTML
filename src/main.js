import { BootScene }  from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene }  from './scenes/GameScene.js';
import { UIScene }    from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,

  width:  800,
  height: 600,

  backgroundColor: '#0d0d1a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  scene: [BootScene, TitleScene, GameScene, UIScene],

  // ピクセルパーフェクトなドット絵に向けてアンチエイリアス無効化
  render: {
    antialias: false,
    pixelArt: true,
  },
};

// グローバル参照（デバッグ用）
window.game = new Phaser.Game(config);
