/**
 * EditorTools — 编辑工具核心逻辑
 * 封装地形绘制、海拔调整、建筑放置、事件配置、圣物碎片、洪水填充等工具。
 * 每个工具方法返回 changes 数组，供 CommandHistory 使用。
 */
import { HexGrid } from '../map/HexGrid.js';

/**
 * Create a shallow snapshot of the tile properties relevant to editing.
 * @param {object} tile
 * @returns {{terrain: string, elevation: number, building: string|null, event: string|null}}
 */
function tileSnapshot(tile) {
  return {
    terrain: tile.terrain,
    elevation: tile.elevation,
    building: tile.building,
    event: tile.event,
  };
}

export class EditorTools {
  /**
   * @param {import('./EditorState.js').EditorState} editorState
   * @param {import('../map/MapData.js').MapData} mapData
   * @param {{ terrain: object, building: object, event: object, item: object }} configs
   */
  constructor(editorState, mapData, configs) {
    this.editorState = editorState;
    this.mapData = mapData;
    this.configs = configs;
  }

  /**
   * Get all tile coordinates affected by the brush centered at (q, r).
   * BrushSize 1 → radius 0 (1 tile), 2 → radius 1 (7 tiles), 3 → radius 2 (19 tiles).
   * Filters out coordinates that are outside the map bounds.
   * @param {number} q
   * @param {number} r
   * @param {number} brushSize - 1, 2, or 3
   * @returns {Array<{q: number, r: number}>}
   */
  getBrushTiles(q, r, brushSize) {
    const radius = brushSize - 1;
    const hexes = HexGrid.hexesInRange(q, r, radius);
    const { width, height } = this.mapData.getSize();
    return hexes.filter(h => HexGrid.isInBounds(h.q, h.r, width, height));
  }

  /**
   * Paint terrain on tiles within brush range.
   * Uses editorState.selectedTerrain and editorState.brushSize.
   * @param {number} q
   * @param {number} r
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  paintTerrain(q, r) {
    const terrain = this.editorState.selectedTerrain;
    const tiles = this.getBrushTiles(q, r, this.editorState.brushSize);
    const changes = [];

    for (const pos of tiles) {
      const tile = this.mapData.getTile(pos.q, pos.r);
      if (!tile) continue;
      const before = tileSnapshot(tile);
      if (before.terrain === terrain) continue;
      const after = { ...before, terrain };
      changes.push({ q: pos.q, r: pos.r, before, after });
    }

    return changes;
  }

  /**
   * Adjust elevation by delta (+1 or -1) for tiles within brush range.
   * Elevation is clamped to [0, 10].
   * @param {number} q
   * @param {number} r
   * @param {number} delta - typically +1 or -1
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  adjustElevation(q, r, delta) {
    const tiles = this.getBrushTiles(q, r, this.editorState.brushSize);
    const changes = [];

    for (const pos of tiles) {
      const tile = this.mapData.getTile(pos.q, pos.r);
      if (!tile) continue;
      const before = tileSnapshot(tile);
      const newElevation = Math.max(0, Math.min(10, before.elevation + delta));
      if (newElevation === before.elevation) continue;
      const after = { ...before, elevation: newElevation };
      changes.push({ q: pos.q, r: pos.r, before, after });
    }

    return changes;
  }

  /**
   * Set elevation to an exact value for tiles within brush range.
   * Value is clamped to [0, 10].
   * @param {number} q
   * @param {number} r
   * @param {number} value
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  setElevation(q, r, value) {
    const clampedValue = Math.max(0, Math.min(10, value));
    const tiles = this.getBrushTiles(q, r, this.editorState.brushSize);
    const changes = [];

    for (const pos of tiles) {
      const tile = this.mapData.getTile(pos.q, pos.r);
      if (!tile) continue;
      const before = tileSnapshot(tile);
      if (before.elevation === clampedValue) continue;
      const after = { ...before, elevation: clampedValue };
      changes.push({ q: pos.q, r: pos.r, before, after });
    }

    return changes;
  }

  /**
   * Place a building on a single tile. Validates allowedTerrains constraint.
   * Handles portal and teleporter special logic.
   * @param {number} q
   * @param {number} r
   * @param {string} buildingId
   * @returns {{ changes: Array<{q: number, r: number, before: object, after: object}>, warnings: string[] }}
   */
  placeBuilding(q, r, buildingId) {
    const warnings = [];
    const tile = this.mapData.getTile(q, r);
    if (!tile) return { changes: [], warnings };

    const buildingConfig = this.configs.building?.buildingTypes?.[buildingId];
    if (!buildingConfig) return { changes: [], warnings: [`Unknown building type: ${buildingId}`] };

    // Check allowedTerrains constraint
    const allowed = buildingConfig.allowedTerrains;
    if (allowed && !allowed.includes(tile.terrain)) {
      warnings.push(`${buildingConfig.name || buildingId} cannot be placed on ${tile.terrain} terrain`);
      return { changes: [], warnings };
    }

    const before = tileSnapshot(tile);
    const after = { ...before, building: buildingId };
    const changes = [{ q, r, before, after }];

    // Portal special logic: update mapData.portalPosition
    if (buildingId === 'portal') {
      this.mapData.portalPosition = { q, r };
    }

    // Teleporter special logic: manage teleportPairs
    if (buildingId === 'teleporter') {
      this._assignTeleporterPair(q, r);
    }

    return { changes, warnings };
  }

  /**
   * Erase the building from a single tile.
   * Handles portal and teleporter cleanup.
   * @param {number} q
   * @param {number} r
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  eraseBuilding(q, r) {
    const tile = this.mapData.getTile(q, r);
    if (!tile || !tile.building) return [];

    const before = tileSnapshot(tile);
    const buildingId = tile.building;
    const after = { ...before, building: null };

    // Portal cleanup
    if (buildingId === 'portal') {
      this.mapData.portalPosition = null;
    }

    // Teleporter cleanup: remove from teleportPairs
    if (buildingId === 'teleporter') {
      this._removeTeleporter(q, r);
    }

    return [{ q, r, before, after }];
  }

  /**
   * Assign a teleporter pair when placing a new teleporter.
   * Finds an unpaired teleporter to pair with. If none exists, the new
   * teleporter remains unpaired until another is placed.
   * @param {number} q
   * @param {number} r
   * @private
   */
  _assignTeleporterPair(q, r) {
    const pairs = this.mapData.teleportPairs;

    // Find all teleporter positions already in pairs
    const pairedSet = new Set();
    for (const pair of pairs) {
      pairedSet.add(`${pair[0].q},${pair[0].r}`);
      pairedSet.add(`${pair[1].q},${pair[1].r}`);
    }

    // Find an unpaired teleporter on the map (not the one we just placed)
    const allTiles = this.mapData.getAllTiles();
    let unpaired = null;
    for (const t of allTiles) {
      if (t.building === 'teleporter' && !(t.q === q && t.r === r)) {
        const key = `${t.q},${t.r}`;
        if (!pairedSet.has(key)) {
          unpaired = { q: t.q, r: t.r };
          break;
        }
      }
    }

    if (unpaired) {
      pairs.push([unpaired, { q, r }]);
    }
  }

  /**
   * Remove a teleporter from teleportPairs when erasing.
   * If the teleporter was paired, the pair is removed and the partner
   * becomes unpaired.
   * @param {number} q
   * @param {number} r
   * @private
   */
  _removeTeleporter(q, r) {
    const pairs = this.mapData.teleportPairs;
    const idx = pairs.findIndex(
      pair =>
        (pair[0].q === q && pair[0].r === r) ||
        (pair[1].q === q && pair[1].r === r)
    );
    if (idx !== -1) {
      pairs.splice(idx, 1);
    }
  }

  /**
   * Place an event on a single tile.
   * @param {number} q
   * @param {number} r
   * @param {string} eventId
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  placeEvent(q, r, eventId) {
    const tile = this.mapData.getTile(q, r);
    if (!tile) return [];

    const before = tileSnapshot(tile);
    if (before.event === eventId) return [];
    const after = { ...before, event: eventId };
    return [{ q, r, before, after }];
  }

  /**
   * Erase the event from a single tile.
   * @param {number} q
   * @param {number} r
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  eraseEvent(q, r) {
    const tile = this.mapData.getTile(q, r);
    if (!tile || !tile.event) return [];

    const before = tileSnapshot(tile);
    const after = { ...before, event: null };
    return [{ q, r, before, after }];
  }

  /**
   * Toggle a relic position at (q, r).
   * If the position is already in relicPositions, remove it.
   * If not, add it.
   * @param {number} q
   * @param {number} r
   * @returns {{ added: boolean, position: {q: number, r: number} }}
   */
  toggleRelic(q, r) {
    const positions = this.mapData.relicPositions;
    const idx = positions.findIndex(p => p.q === q && p.r === r);

    if (idx !== -1) {
      positions.splice(idx, 1);
      return { added: false, position: { q, r } };
    } else {
      positions.push({ q, r });
      return { added: true, position: { q, r } };
    }
  }

  /**
   * Flood fill using BFS from (q, r), replacing connected tiles of the same
   * terrain type with newTerrain.
   * @param {number} q
   * @param {number} r
   * @param {string} newTerrain
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  floodFill(q, r, newTerrain) {
    const startTile = this.mapData.getTile(q, r);
    if (!startTile) return [];

    const originalTerrain = startTile.terrain;
    if (originalTerrain === newTerrain) return [];

    const { width, height } = this.mapData.getSize();
    const changes = [];
    const visited = new Set();
    const queue = [{ q, r }];
    visited.add(`${q},${r}`);

    while (queue.length > 0) {
      const pos = queue.shift();
      const tile = this.mapData.getTile(pos.q, pos.r);
      if (!tile || tile.terrain !== originalTerrain) continue;

      const before = tileSnapshot(tile);
      const after = { ...before, terrain: newTerrain };
      changes.push({ q: pos.q, r: pos.r, before, after });

      const neighbors = HexGrid.neighbors(pos.q, pos.r);
      for (const n of neighbors) {
        const key = `${n.q},${n.r}`;
        if (visited.has(key)) continue;
        if (!HexGrid.isInBounds(n.q, n.r, width, height)) continue;
        visited.add(key);

        const nTile = this.mapData.getTile(n.q, n.r);
        if (nTile && nTile.terrain === originalTerrain) {
          queue.push(n);
        }
      }
    }

    return changes;
  }

  /**
   * Fill all tiles on the map with the specified terrain type.
   * @param {string} newTerrain
   * @returns {Array<{q: number, r: number, before: object, after: object}>}
   */
  fillAll(newTerrain) {
    const allTiles = this.mapData.getAllTiles();
    const changes = [];

    for (const t of allTiles) {
      const tile = this.mapData.getTile(t.q, t.r);
      if (!tile) continue;
      const before = tileSnapshot(tile);
      if (before.terrain === newTerrain) continue;
      const after = { ...before, terrain: newTerrain };
      changes.push({ q: t.q, r: t.r, before, after });
    }

    return changes;
  }
}
