/**
 * PathfindingSystem — 自动寻路系统
 * A* 算法，以 AP 消耗为权重，六边形距离为启发式。
 * 仅在已探索地块上规划路径，考虑道具对通行和 AP 消耗的影响。
 */
import { HexGrid } from '../map/HexGrid.js';
import { HexRenderer } from '../render/HexRenderer.js';

export class PathfindingSystem {
  /**
   * @param {import('./MovementSystem.js').MovementSystem} movementSystem
   * @param {import('./FogSystem.js').FogSystem} fogSystem
   * @param {import('./ItemSystem.js').ItemSystem} itemSystem
   * @param {import('../map/MapData.js').MapData} mapData
   */
  constructor(movementSystem, fogSystem, itemSystem, mapData) {
    this._movementSystem = movementSystem;
    this._fogSystem = fogSystem;
    this._itemSystem = itemSystem;
    this._mapData = mapData;
  }

  /**
   * Check if a tile is passable for pathfinding purposes.
   * Skips unexplored tiles. Uses MovementSystem.canMoveTo but ignores AP check.
   * @param {object} fromTile - tile data { q, r, terrain, elevation, ... }
   * @param {object} toTile - tile data { q, r, terrain, elevation, ... }
   * @returns {boolean}
   */
  isPassable(fromTile, toTile) {
    // Check fog — only explored or visible tiles are passable
    const vis = this._fogSystem.getTileVisibility(toTile.q, toTile.r);
    if (vis === 'unexplored') return false;

    // Use MovementSystem.canMoveTo but we need to temporarily bypass AP check.
    // canMoveTo checks: terrain item, water elevation, elevation blocks, AP.
    // We want all checks EXCEPT AP.
    const toCfg = this._movementSystem._terrainTypes[toTile.terrain];

    // Terrain required item (also accepts terrain_pass effect)
    if (toCfg?.requiredItem) {
      const hasItem = this._itemSystem.hasActiveItem(toCfg.requiredItem);
      if (!hasItem) {
        const effects = this._itemSystem.getActiveEffects();
        const hasPass = effects.terrainPass.some(
          e => e.type === 'terrain_pass' && e.terrainType === toTile.terrain
        );
        if (!hasPass) return false;
      }
    }

    // Impassable terrain (void)
    if (toCfg?.impassable) return false;

    // From-terrain required item (exiting water needs boat)
    const fromCfg = this._movementSystem._terrainTypes[fromTile.terrain];
    if (fromCfg?.requiredItem) {
      const hasItem = this._itemSystem.hasActiveItem(fromCfg.requiredItem);
      if (!hasItem) {
        const effects = this._itemSystem.getActiveEffects();
        const hasPass = effects.terrainPass.some(
          e => e.type === 'terrain_pass' && e.terrainType === fromTile.terrain
        );
        if (!hasPass) return false;
      }
    }

    // Water elevation rule
    const fromIsWater = fromTile.terrain === 'water';
    const toIsWater = toTile.terrain === 'water';
    if ((fromIsWater && !toIsWater) || (!fromIsWater && toIsWater)) {
      if (fromTile.elevation !== toTile.elevation) return false;
    }

    // Elevation blocks
    const delta = (toTile.elevation ?? 0) - (fromTile.elevation ?? 0);
    if (delta > 3 && !this._itemSystem.hasActiveItem('rope_claw')) return false;
    if (delta <= -4 && !this._itemSystem.hasActiveItem('parachute')) return false;

    return true;
  }

  /**
   * Calculate AP cost for a single step (from → to).
   * Delegates to MovementSystem.calculateAPCost.
   * @param {object} fromTile
   * @param {object} toTile
   * @returns {number}
   */
  getStepCost(fromTile, toTile) {
    return this._movementSystem.calculateAPCost(fromTile, toTile);
  }

  /**
   * Calculate the farthest reachable path index given current AP.
   * @param {number[]} stepCosts - AP cost for each step
   * @param {number} currentAP
   * @returns {number} index of last reachable step (-1 if can't even take first step)
   */
  getReachableIndex(stepCosts, currentAP) {
    let ap = currentAP;
    for (let i = 0; i < stepCosts.length; i++) {
      if (ap < stepCosts[i]) return i - 1;
      ap -= stepCosts[i];
    }
    return stepCosts.length - 1;
  }

  /**
   * A* pathfinding from start to goal.
   * Weight = AP cost per step. Heuristic = hex distance.
   * Only explores explored/visible tiles.
   *
   * @param {{q:number, r:number}} start
   * @param {{q:number, r:number}} goal
   * @returns {{ found: boolean, path: Array<{q:number, r:number}>, totalAP: number, stepCosts: number[] } | { found: false, reason: string }}
   */
  findPath(start, goal) {
    const startTile = this._mapData.getTile(start.q, start.r);
    const goalTile = this._mapData.getTile(goal.q, goal.r);
    if (!startTile || !goalTile) {
      return { found: false, reason: '起点或目标无效' };
    }

    // Check goal is explored
    const goalVis = this._fogSystem.getTileVisibility(goal.q, goal.r);
    if (goalVis === 'unexplored') {
      return { found: false, reason: '目标未探索' };
    }

    const startKey = `${start.q},${start.r}`;
    const goalKey = `${goal.q},${goal.r}`;

    // g-scores: cost from start to node
    const gScore = new Map();
    gScore.set(startKey, 0);

    // Parent map for path reconstruction
    const cameFrom = new Map();

    // Open set as a simple sorted array (adequate for hex maps up to 75x75)
    // Each entry: { key, q, r, f }
    const openSet = [{ key: startKey, q: start.q, r: start.r, f: 0 }];
    const inOpen = new Set([startKey]);
    const closed = new Set();

    while (openSet.length > 0) {
      // Find node with lowest f-score
      let bestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[bestIdx].f) bestIdx = i;
      }
      const current = openSet[bestIdx];
      openSet.splice(bestIdx, 1);
      inOpen.delete(current.key);

      if (current.key === goalKey) {
        // Reconstruct path
        return this._reconstructPath(cameFrom, current, gScore);
      }

      closed.add(current.key);

      const currentTile = this._mapData.getTile(current.q, current.r);
      if (!currentTile) continue;

      // Expand neighbors
      const neighbors = HexRenderer.offsetNeighbors(current.q, current.r);
      for (const nb of neighbors) {
        const nbKey = `${nb.col},${nb.row}`;
        if (closed.has(nbKey)) continue;

        const nbTile = this._mapData.getTile(nb.col, nb.row);
        if (!nbTile) continue;

        // Build tile data objects for passability check
        const fromData = { ...currentTile, q: current.q, r: current.r };
        const toData = { ...nbTile, q: nb.col, r: nb.row };

        if (!this.isPassable(fromData, toData)) continue;

        const stepCost = this.getStepCost(fromData, toData);
        const tentativeG = (gScore.get(current.key) ?? Infinity) + stepCost;

        if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
          gScore.set(nbKey, tentativeG);
          cameFrom.set(nbKey, { key: current.key, q: current.q, r: current.r });

          const h = HexGrid.distance(nb.col, nb.row, goal.q, goal.r);
          const f = tentativeG + h;

          if (!inOpen.has(nbKey)) {
            openSet.push({ key: nbKey, q: nb.col, r: nb.row, f });
            inOpen.add(nbKey);
          } else {
            // Update f-score in open set
            const existing = openSet.find(n => n.key === nbKey);
            if (existing) existing.f = f;
          }
        }
      }
    }

    return { found: false, reason: '目标不可达' };
  }

  /**
   * Reconstruct path from A* cameFrom map.
   * @private
   */
  _reconstructPath(cameFrom, goalNode, gScore) {
    const path = [];
    const stepCosts = [];
    let current = { key: goalNode.key, q: goalNode.q, r: goalNode.r };

    while (cameFrom.has(current.key)) {
      path.unshift({ q: current.q, r: current.r });
      const parent = cameFrom.get(current.key);
      const parentG = gScore.get(parent.key) ?? 0;
      const currentG = gScore.get(current.key) ?? 0;
      stepCosts.unshift(currentG - parentG);
      current = parent;
    }
    // Don't include start in path (player is already there)

    const totalAP = stepCosts.reduce((sum, c) => sum + c, 0);
    return { found: true, path, totalAP, stepCosts };
  }
}
