/**
 * MapValidator — 地图验证逻辑
 * 检查地图是否满足游戏运行的基本要求。
 * 每个检查方法返回 ValidationIssue 或 null。
 *
 * ValidationIssue: { type: string, severity: 'error'|'warning', message: string, tiles: Array<{q,r}> }
 */
import { HexGrid } from '../map/HexGrid.js';

export class MapValidator {
  /**
   * @param {{ building: { buildingTypes: object } }} configs
   */
  constructor(configs) {
    this.configs = configs;
  }

  /**
   * Run all validation checks on the map.
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {{ valid: boolean, issues: Array<{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}> }}
   */
  validate(mapData) {
    const buildingConfig = this.configs.building?.buildingTypes || {};
    const issues = [];

    const checks = [
      this._checkPortalExists(mapData),
      this._checkRelicCount(mapData),
      this._checkReachability(mapData),
      this._checkBuildingTerrainConstraints(mapData, buildingConfig),
      this._checkTeleporterPairs(mapData),
    ];

    for (const issue of checks) {
      if (issue) issues.push(issue);
    }

    const valid = !issues.some(i => i.severity === 'error');
    return { valid, issues };
  }

  /**
   * Check that at least one tile has building='portal'.
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}|null}
   */
  _checkPortalExists(mapData) {
    const allTiles = mapData.getAllTiles();
    const hasPortal = allTiles.some(t => t.building === 'portal');
    if (!hasPortal) {
      return {
        type: 'no_portal',
        severity: 'error',
        message: 'Map must contain at least one portal building.',
        tiles: [],
      };
    }
    return null;
  }

  /**
   * Check that relicPositions.length >= relicsNeeded.
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}|null}
   */
  _checkRelicCount(mapData) {
    const count = mapData.relicPositions.length;
    const needed = mapData.relicsNeeded;
    if (count < needed) {
      return {
        type: 'insufficient_relics',
        severity: 'error',
        message: `Map has ${count} relic position(s) but needs at least ${needed}.`,
        tiles: mapData.relicPositions.map(p => ({ q: p.q, r: p.r })),
      };
    }
    return null;
  }

  /**
   * BFS from map center; check all non-void tiles are reachable.
   * Tiles with terrain='void' are impassable barriers.
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}|null}
   */
  _checkReachability(mapData) {
    const { width, height } = mapData.getSize();
    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    const visited = new Set();
    const queue = [];

    // Only start BFS if center tile is non-void
    const centerTile = mapData.getTile(centerQ, centerR);
    if (centerTile && centerTile.terrain !== 'void') {
      const startKey = `${centerQ},${centerR}`;
      visited.add(startKey);
      queue.push({ q: centerQ, r: centerR });
    }

    while (queue.length > 0) {
      const pos = queue.shift();
      const neighbors = HexGrid.neighbors(pos.q, pos.r);
      for (const n of neighbors) {
        const key = `${n.q},${n.r}`;
        if (visited.has(key)) continue;
        if (!HexGrid.isInBounds(n.q, n.r, width, height)) continue;
        const tile = mapData.getTile(n.q, n.r);
        if (!tile || tile.terrain === 'void') continue;
        visited.add(key);
        queue.push(n);
      }
    }

    // Find all non-void tiles that were not reached
    const unreachable = [];
    const allTiles = mapData.getAllTiles();
    for (const t of allTiles) {
      if (t.terrain === 'void') continue;
      const key = `${t.q},${t.r}`;
      if (!visited.has(key)) {
        unreachable.push({ q: t.q, r: t.r });
      }
    }

    if (unreachable.length > 0) {
      return {
        type: 'unreachable_tiles',
        severity: 'warning',
        message: `${unreachable.length} non-void tile(s) are unreachable from the map center.`,
        tiles: unreachable,
      };
    }
    return null;
  }

  /**
   * For each tile with a building, check if the tile's terrain is in the
   * building's allowedTerrains list.
   * @param {import('../map/MapData.js').MapData} mapData
   * @param {object} buildingConfig - buildingTypes map from building.json
   * @returns {{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}|null}
   */
  _checkBuildingTerrainConstraints(mapData, buildingConfig) {
    const violating = [];
    const allTiles = mapData.getAllTiles();

    for (const t of allTiles) {
      if (!t.building) continue;
      const config = buildingConfig[t.building];
      if (!config || !config.allowedTerrains) continue;
      if (!config.allowedTerrains.includes(t.terrain)) {
        violating.push({ q: t.q, r: t.r });
      }
    }

    if (violating.length > 0) {
      return {
        type: 'invalid_building_terrain',
        severity: 'error',
        message: `${violating.length} building(s) are placed on incompatible terrain.`,
        tiles: violating,
      };
    }
    return null;
  }

  /**
   * Count teleporter buildings on the map. If count is odd, return a warning.
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {{type: string, severity: string, message: string, tiles: Array<{q:number,r:number}>}|null}
   */
  _checkTeleporterPairs(mapData) {
    const allTiles = mapData.getAllTiles();
    const teleporters = allTiles.filter(t => t.building === 'teleporter');

    if (teleporters.length % 2 !== 0) {
      return {
        type: 'unpaired_teleporter',
        severity: 'warning',
        message: `There are ${teleporters.length} teleporter(s) on the map — teleporters should be paired (even count).`,
        tiles: teleporters.map(t => ({ q: t.q, r: t.r })),
      };
    }
    return null;
  }
}
