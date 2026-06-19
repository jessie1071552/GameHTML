import { BootScene }  from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene }  from './scenes/GameScene.js';
import { UIScene }    from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,

  backgroundColor: '#0d0d1a',

  scale: {
    mode: Phaser.Scale.RESIZE,   // ウィンドウサイズに完全追従
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  '100%',
    height: '100%',
  },

  scene: [BootScene, TitleScene, GameScene, UIScene],

  render: {
    antialias: false,
    pixelArt: true,
  },

  parent: 'game-container',
};

window.game = new Phaser.Game(config);
