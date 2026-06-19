// ===== ゲーム定数 =====
export const TILE_SIZE = 32;

export const MAP_WIDTH  = 50;   // タイル数（広めのマップ）
export const MAP_HEIGHT = 36;

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
  MIN_ROOMS: 8,
  MAX_ROOMS: 14,
  MIN_ROOM_W: 4,
  MAX_ROOM_W: 9,
  MIN_ROOM_H: 3,
  MAX_ROOM_H: 7,
};
