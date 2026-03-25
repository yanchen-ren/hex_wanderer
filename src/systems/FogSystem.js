/**
 * FogSystem — 战争迷雾系统
 * 三态迷雾（unexplored / explored / visible）
 * BFS 视野点数（VP）计算
 *
 * 需求 5: 战争迷雾与视野系统
 *
 * Vision model:
 *   Base VP = 2. BFS expands from player, each step costs 1 VP.
 *   Extra VP cost when passing through:
 *     - A tile with elevation higher than the player: +elevationDiff VP
 *     - A forest tile: +1 VP
 *   Item bonuses (telescope etc.) add to base VP.
 *   Building bonuses (lighthouse) add to base VP when in range.
 *   Minimum visible area = player tile + direct neighbors.
 */
import { HexGrid } from '../map/HexGrid.js';

export class FogSystem {
  /**
   * @param {object} terrainConfig - Parsed terrain.json ({ terrainTypes: { ... } })
   * @param {import('./PlayerState.js').PlayerState} playerState
   * @param {import('./ItemSystem.js').ItemSystem} itemSystem
   */
  constructor(terrainConfig, playerState, itemSystem) {
    this._terrainTypes = terrainConfig?.terrainTypes ?? {};
    this._playerState = playerState;
    this._itemSystem = itemSystem;

    /** @type {Map<string, string>} "q,r" → 'unexplored' | 'explored' | 'visible' */
    this._fogState = new Map();
  }

  /**
   * Calculate the player's base vision points (VP) at a given position.
   * VP = BASE + itemBonus + buildingBonus
   */
  calculateVisionPoints(playerPos, mapData) {
    const BASE_VP = 2;
    let vp = BASE_VP;

    // Item vision bonus (telescope +2 etc.)
    if (this._itemSystem) {
      const effects = this._itemSystem.getActiveEffects();
      vp += effects.visionBonus ?? 0;
    }

    // Building vision bonus (lighthouse etc.)
    vp += this._getBuildingVisionBonus(playerPos, mapData);

    return Math.max(1, vp);
  }

  /**
   * Calculate visible tiles using BFS with vision points.
   * Each step costs 1 VP. Extra cost for:
   *   - Higher elevation than player: +elevDiff
   *   - Forest terrain: +1
   *
   * @param {{q:number, r:number}} playerPos
   * @param {import('../map/MapData.js').MapData} mapData
   * @returns {Array<{q:number, r:number}>}
   */
  getVisibleTiles(playerPos, mapData) {
    const playerTile = mapData.getTile(playerPos.q, playerPos.r);
    if (!playerTile) return [{ q: playerPos.q, r: playerPos.r }];

    const playerElev = playerTile.elevation;
    const totalVP = this.calculateVisionPoints(playerPos, mapData);

    // BFS with VP tracking
    const visited = new Map(); // key → best remaining VP
    const result = [];
    const startKey = `${playerPos.q},${playerPos.r}`;
    visited.set(startKey, totalVP);
    result.push({ q: playerPos.q, r: playerPos.r });

    const queue = [{ q: playerPos.q, r: playerPos.r, vp: totalVP }];

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.vp <= 0) continue;

      const neighbors = HexGrid.neighbors(cur.q, cur.r);
      for (const nb of neighbors) {
        const nbTile = mapData.getTile(nb.q, nb.r);
        if (!nbTile) continue;

        // Adjacent tiles (distance 1 from player) are ALWAYS visible
        const distFromPlayer = HexGrid.distance(playerPos.q, playerPos.r, nb.q, nb.r);
        if (distFromPlayer <= 1) {
          const key = `${nb.q},${nb.r}`;
          if (!visited.has(key)) {
            visited.set(key, totalVP - 1);
            result.push({ q: nb.q, r: nb.r });
            queue.push({ q: nb.q, r: nb.r, vp: totalVP - 1 });
          }
          continue;
        }

        // VP cost depends on elevation change from CURRENT tile to NEXT tile
        const curTile = mapData.getTile(cur.q, cur.r);
        const localElevDiff = nbTile.elevation - (curTile ? curTile.elevation : playerElev);
        let seeVP;
        if (localElevDiff < 0) {
          seeVP = cur.vp - 0.5; // looking downhill: half cost
        } else {
          seeVP = cur.vp - 1; // same level or uphill: full cost
        }
        if (seeVP < 0) continue;

        // Extra pass-through cost for cliffs and forests
        let passVP = seeVP;
        const cliffDiff = nbTile.elevation - playerElev;
        if (cliffDiff >= 3) passVP -= cliffDiff;
        if (nbTile.terrain === 'forest') passVP -= 0.5;

        const key = `${nb.q},${nb.r}`;
        const prevVP = visited.get(key);

        if (prevVP === undefined || prevVP < seeVP) {
          visited.set(key, seeVP);
          result.push({ q: nb.q, r: nb.r });
          if (passVP > 0) {
            queue.push({ q: nb.q, r: nb.r, vp: passVP });
          }
        }
      }
    }

    return result;
  }

  /**
   * Calculate vision range (approximate, for backward compatibility).
   * Returns the base VP value.
   */
  calculateVisionRange(playerPos, mapData) {
    return this.calculateVisionPoints(playerPos, mapData);
  }

  /**
   * Check if the player is within a building's area-of-effect that grants vision bonus.
   */
  _getBuildingVisionBonus(playerPos, mapData) {
    let bonus = 0;
    const allTiles = mapData.getAllTiles();
    for (const tile of allTiles) {
      if (!tile.building) continue;
      let effect = null;
      if (tile.buildingEffect) {
        effect = tile.buildingEffect;
      }
      if (!effect || !effect.visionBonus || !effect.areaRadius) continue;
      const dist = HexGrid.distance(playerPos.q, playerPos.r, tile.q, tile.r);
      if (dist <= effect.areaRadius) {
        bonus += effect.visionBonus;
      }
    }
    return bonus;
  }

  /**
   * Update fog states after the player moves.
   * Uses BFS VP-based vision calculation.
   */
  updateFog(playerPos, mapData) {
    const visibleTiles = this.getVisibleTiles(playerPos, mapData);
    const newVisibleKeys = new Set(visibleTiles.map(h => `${h.q},${h.r}`));

    // Demote old visible tiles to explored
    for (const [key, state] of this._fogState) {
      if (state === 'visible' && !newVisibleKeys.has(key)) {
        this._fogState.set(key, 'explored');
      }
    }

    // Set new visible tiles
    for (const key of newVisibleKeys) {
      this._fogState.set(key, 'visible');
    }
  }

  /**
   * Get the visibility state of a tile.
   */
  getTileVisibility(q, r) {
    return this._fogState.get(`${q},${r}`) ?? 'unexplored';
  }

  /** Serialize fog state for save system. */
  toJSON() {
    const obj = {};
    for (const [key, state] of this._fogState) {
      obj[key] = state;
    }
    return obj;
  }

  /** Restore fog state from saved data. */
  loadFromJSON(data) {
    this._fogState.clear();
    if (!data) return;
    for (const [key, state] of Object.entries(data)) {
      this._fogState.set(key, state);
    }
  }
}
