import { TILE, MAP_WIDTH, MAP_HEIGHT, DUNGEON } from '../utils/constants.js';

/**
 * BSP(二分木)風の簡易部屋生成ダンジョンジェネレーター
 *  - 部屋をランダムに配置
 *  - 部屋同士をL字廊下でつなぐ
 *  - マップ外周は必ず壁
 */
export class DungeonGenerator {
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
    this.width  = width;
    this.height = height;
  }

  generate() {
    // 全マスを壁で初期化
    const map = Array.from({ length: this.height }, () =>
      new Array(this.width).fill(TILE.WALL)
    );

    const rooms = this._placeRooms(map);
    this._connectRooms(map, rooms);
    this._placeStairs(map, rooms);

    return { map, rooms };
  }

  // ── 部屋配置 ──────────────────────────────────────────────
  _placeRooms(map) {
    const roomCount = this._rand(DUNGEON.MIN_ROOMS, DUNGEON.MAX_ROOMS);
    const rooms = [];
    const MAX_TRIES = 50;

    for (let i = 0; i < roomCount; i++) {
      let placed = false;
      for (let t = 0; t < MAX_TRIES; t++) {
        const w = this._rand(DUNGEON.MIN_ROOM_W, DUNGEON.MAX_ROOM_W);
        const h = this._rand(DUNGEON.MIN_ROOM_H, DUNGEON.MAX_ROOM_H);
        const x = this._rand(1, this.width  - w - 1);
        const y = this._rand(1, this.height - h - 1);
        const room = { x, y, w, h };

        if (!this._overlaps(rooms, room)) {
          this._carveRoom(map, room);
          rooms.push(room);
          placed = true;
          break;
        }
      }
      if (!placed) continue; // 置けなかった部屋はスキップ
    }
    return rooms;
  }

  _carveRoom(map, { x, y, w, h }) {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        map[row][col] = TILE.FLOOR;
      }
    }
  }

  _overlaps(rooms, newRoom) {
    const pad = 1;
    return rooms.some(r =>
      newRoom.x < r.x + r.w + pad &&
      newRoom.x + newRoom.w + pad > r.x &&
      newRoom.y < r.y + r.h + pad &&
      newRoom.y + newRoom.h + pad > r.y
    );
  }

  // ── 廊下で接続 ────────────────────────────────────────────
  _connectRooms(map, rooms) {
    // シャッフル後、隣接ペアをL字廊下でつなぐ
    const shuffled = [...rooms].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i++) {
      const a = this._center(shuffled[i]);
      const b = this._center(shuffled[i + 1]);
      this._carveCorridor(map, a, b);
    }
  }

  _center(room) {
    return {
      x: Math.floor(room.x + room.w / 2),
      y: Math.floor(room.y + room.h / 2),
    };
  }

  _carveCorridor(map, a, b) {
    // 水平 → 垂直 (L字)
    const hDir = a.x < b.x ? 1 : -1;
    for (let x = a.x; x !== b.x; x += hDir) {
      if (x > 0 && x < this.width - 1) map[a.y][x] = TILE.FLOOR;
    }
    const vDir = a.y < b.y ? 1 : -1;
    for (let y = a.y; y !== b.y; y += vDir) {
      if (y > 0 && y < this.height - 1) map[y][b.x] = TILE.FLOOR;
    }
    map[b.y][b.x] = TILE.FLOOR;
  }

  // ── 階段配置 ──────────────────────────────────────────────
  _placeStairs(map, rooms) {
    if (rooms.length === 0) return;
    const last = rooms[rooms.length - 1];
    const c = this._center(last);
    map[c.y][c.x] = TILE.STAIRS;
  }

  // ── ユーティリティ ────────────────────────────────────────
  _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** 最初の部屋の中心座標（プレイヤー初期位置用）*/
  getStartPosition(rooms) {
    if (rooms.length === 0) return { x: 2, y: 2 };
    const c = this._center(rooms[0]);
    return c;
  }
}
