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
    // 折れ曲がり点にランダムオフセットを加えて通路を長くする
    const offsetX = this._rand(-6, 6);
    const offsetY = this._rand(-6, 6);

    // 中継点（曲がり角）をランダムにずらす
    const mid = {
      x: Math.min(this.width  - 2, Math.max(1, Math.floor((a.x + b.x) / 2) + offsetX)),
      y: Math.min(this.height - 2, Math.max(1, Math.floor((a.y + b.y) / 2) + offsetY)),
    };

    // a → mid（水平）→ mid（垂直）→ b の Z字型で掘る
    this._carveH(map, a.y,   a.x,   mid.x);
    this._carveV(map, mid.x, a.y,   mid.y);
    this._carveH(map, mid.y, mid.x, b.x);
    this._carveV(map, b.x,   mid.y, b.y);
  }

  _carveH(map, y, x1, x2) {
    const dir = x1 <= x2 ? 1 : -1;
    for (let x = x1; x !== x2 + dir; x += dir) {
      if (x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1) {
        map[y][x] = TILE.FLOOR;
      }
    }
  }

  _carveV(map, x, y1, y2) {
    const dir = y1 <= y2 ? 1 : -1;
    for (let y = y1; y !== y2 + dir; y += dir) {
      if (x > 0 && x < this.width - 1 && y > 0 && y < this.height - 1) {
        map[y][x] = TILE.FLOOR;
      }
    }
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
