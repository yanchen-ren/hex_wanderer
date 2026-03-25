/**
 * MapData — 地图数据结构
 * 以 "q,r" 为 key 的 Map 存储地块数据
 *
 * Each tile: {
 *   terrain: string,
 *   elevation: number,
 *   building: string|null,
 *   event: string|null,
 *   fogState: 'unexplored'|'explored'|'visible'
 * }
 */
export class MapData {
  /**
   * @param {number} width  - 地图宽度 (q 方向)
   * @param {number} height - 地图高度 (r 方向)
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** @type {Map<string, object>} */
    this._tiles = new Map();
    /** @type {Array<{q:number, r:number}>} */
    this.relicPositions = [];
    /** @type {{q:number, r:number}|null} */
    this.portalPosition = null;
    /** @type {Array<[{q:number,r:number},{q:number,r:number}]>} */
    this.teleportPairs = [];
  }

  /**
   * Build a "q,r" key string
   */
  static key(q, r) {
    return `${q},${r}`;
  }

  /**
   * Get tile data at (q, r)
   * @returns {object|undefined}
   */
  getTile(q, r) {
    return this._tiles.get(MapData.key(q, r));
  }

  /**
   * Set tile data at (q, r)
   * @param {number} q
   * @param {number} r
   * @param {object} data
   */
  setTile(q, r, data) {
    this._tiles.set(MapData.key(q, r), data);
  }

  /**
   * Get all tiles as an array of { q, r, ...tileData }
   * @returns {Array<object>}
   */
  getAllTiles() {
    const result = [];
    for (const [key, data] of this._tiles) {
      const [q, r] = key.split(',').map(Number);
      result.push({ q, r, ...data });
    }
    return result;
  }

  /**
   * Get map dimensions
   * @returns {{ width: number, height: number }}
   */
  getSize() {
    return { width: this.width, height: this.height };
  }

  /**
   * Get the number of tiles
   * @returns {number}
   */
  getTileCount() {
    return this._tiles.size;
  }

  /**
   * Serialize to a plain object (for save/preset)
   */
  toJSON() {
    const tiles = {};
    for (const [key, data] of this._tiles) {
      tiles[key] = data;
    }
    return {
      width: this.width,
      height: this.height,
      tiles,
      relicPositions: this.relicPositions,
      portalPosition: this.portalPosition,
      teleportPairs: this.teleportPairs,
    };
  }

  /**
   * Deserialize from a plain object
   * @param {object} json
   * @returns {MapData}
   */
  static fromJSON(json) {
    const map = new MapData(json.width, json.height);
    for (const [key, data] of Object.entries(json.tiles)) {
      map._tiles.set(key, data);
    }
    map.relicPositions = json.relicPositions || [];
    map.portalPosition = json.portalPosition || null;
    map.teleportPairs = json.teleportPairs || [];
    return map;
  }
}
