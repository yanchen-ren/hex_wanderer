/**
 * HexGrid — 六边形网格数学工具
 * Axial Coordinates (q, r)，尖顶六边形（pointy-top）
 * High-level grid operations built on HexMath primitives.
 */
import { HexMath } from '../utils/HexMath.js';

/** Pointy-top axial direction vectors (6 neighbors) */
const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export class HexGrid {
  /**
   * 获取 (q,r) 的 6 个相邻坐标
   * @returns {Array<{q: number, r: number}>}
   */
  static neighbors(q, r) {
    return DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
  }

  /**
   * 两个六边形之间的距离（格数）
   */
  static distance(q1, r1, q2, r2) {
    return HexMath.distance(q1, r1, q2, r2);
  }

  /**
   * Axial → Pixel (pointy-top)
   */
  static hexToPixel(q, r, size) {
    return HexMath.hexToPixel(q, r, size);
  }

  /**
   * Pixel → Axial (pointy-top), rounded to nearest hex
   */
  static pixelToHex(x, y, size) {
    return HexMath.pixelToHex(x, y, size);
  }

  /**
   * 获取指定中心点、指定半径内的所有六边形坐标
   * Uses cube coordinate range algorithm.
   * @returns {Array<{q: number, r: number}>}
   */
  static hexesInRange(q, r, radius) {
    const results = [];
    for (let dq = -radius; dq <= radius; dq++) {
      const rMin = Math.max(-radius, -dq - radius);
      const rMax = Math.min(radius, -dq + radius);
      for (let dr = rMin; dr <= rMax; dr++) {
        results.push({ q: q + dq, r: r + dr });
      }
    }
    return results;
  }

  /**
   * 判断坐标是否在地图边界内
   * Map is defined as a rectangle in offset terms:
   *   q ∈ [0, mapWidth-1], r ∈ [0, mapHeight-1]
   */
  static isInBounds(q, r, mapWidth, mapHeight) {
    return q >= 0 && q < mapWidth && r >= 0 && r < mapHeight;
  }
}
