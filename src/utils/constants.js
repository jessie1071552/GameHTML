// ===== ゲーム定数 =====
export const TILE_SIZE = 32;

export const MAP_WIDTH  = 30;   // タイル数
export const MAP_HEIGHT = 20;

// タイル種別
export const TILE = {
  WALL:  0,
  FLOOR: 1,
  STAIRS: 2,
};

// カメラ
export const CAMERA_LERP = 0.1;

// ダンジョン生成パラメータ
export const DUNGEON = {
  MIN_ROOMS: 5,
  MAX_ROOMS: 10,
  MIN_ROOM_W: 4,
  MAX_ROOM_W: 8,
  MIN_ROOM_H: 3,
  MAX_ROOM_H: 6,
};
