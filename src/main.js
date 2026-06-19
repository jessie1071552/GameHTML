import { BootScene }  from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene }  from './scenes/GameScene.js';
import { UIScene }    from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,

  width:  1280,
  height: 720,

  backgroundColor: '#0d0d1a',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  scene: [BootScene, TitleScene, GameScene, UIScene],

  render: {
    antialias: false,
    pixelArt: true,
  },
};

window.game = new Phaser.Game(config);
