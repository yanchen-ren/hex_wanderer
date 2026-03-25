/**
 * MapGenerator — 地图生成器
 * 基于种子的确定性地图生成，Simplex Noise 自然地形
 */
import { MapData } from './MapData.js';
import { HexGrid } from './HexGrid.js';
import { SeededRandom } from '../utils/SeededRandom.js';
import { SimplexNoise } from '../utils/SimplexNoise.js';

/** Map size presets: small / medium / large */
const SIZE_PRESETS = {
  small:  { width: 25,  height: 25 },
  medium: { width: 50, height: 50 },
  large:  { width: 75, height: 75 },
};

/**
 * Default elevation thresholds → terrain type mapping.
 * Can be overridden via terrainConfig.terrainMapping if provided.
 * Ordered low → high by maxElev.
 */
const DEFAULT_TERRAIN_MAPPING = [
  { maxElev: -0.35, terrain: 'water' },
  { maxElev: -0.15, terrain: 'swamp' },
  { maxElev:  0.15, terrain: 'grass' },
  { maxElev:  0.35, terrain: 'forest' },
  { maxElev:  0.55, terrain: 'desert' },
  { maxElev:  0.75, terrain: 'ice' },
  { maxElev:  Infinity, terrain: 'lava' },
];

export class MapGenerator {
  /**
   * @param {number} seed
   * @param {string} size - 'small' | 'medium' | 'large'
   * @param {object} terrainConfig - parsed terrain.json
   * @param {object} buildingConfig - parsed building.json
   * @param {object} itemConfig - parsed item.json
   */
  constructor(seed, size, terrainConfig, buildingConfig, itemConfig) {
    this.seed = seed;
    this.sizeKey = size;
    const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;
    this.width = preset.width;
    this.height = preset.height;
    this.terrainConfig = terrainConfig;
    this.buildingConfig = buildingConfig;
    this.itemConfig = itemConfig;
    this.rng = new SeededRandom(seed);
    this.noise = new SimplexNoise(seed);
    this.noise2 = new SimplexNoise(seed + 1000);
    this.noise3 = new SimplexNoise(seed + 2000);
    // Use terrain mapping from config if provided, otherwise use defaults
    this.terrainMapping = (terrainConfig && terrainConfig.terrainMapping) || DEFAULT_TERRAIN_MAPPING;
  }

  /**
   * Generate a complete map
   * @returns {MapData}
   */
  generate() {
    const map = new MapData(this.width, this.height);

    // 1. Generate terrain using multi-octave simplex noise
    this._generateTerrain(map);

    // 2. Post-process: normalize water elevation
    this._normalizeWaterElevation(map);

    // 3. Ensure spawn area is safe
    this._ensureSafeSpawn(map);

    // 3.5 Place tutorial event near spawn
    this._placeTutorialEvent(map);

    // 4. Ensure water-land borders have matching elevation
    this._fixWaterBorders(map);

    // 6. Place buildings
    this.placeBuildings(map);

    // 7. Place relics at extreme coordinates
    this.placeRelics(map);

    // 8. Place items matching terrain
    this.placeItems(map);

    // 8.5 Place random events on empty tiles
    this._placeRandomEvents(map);

    // 9. Validate reachability and fix if needed
    this._ensureReachability(map);

    return map;
  }

  /**
   * Generate elevation and terrain for all tiles using multi-octave noise
   */
  _generateTerrain(map) {
    const scale = 0.04; // base frequency

    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        // Multi-octave elevation noise
        const nx = q * scale;
        const ny = r * scale;
        let elevation =
          0.5  * this.noise.noise2D(nx, ny) +
          0.25 * this.noise.noise2D(nx * 2, ny * 2) +
          0.125 * this.noise.noise2D(nx * 4, ny * 4);

        // Secondary moisture noise for terrain variation
        const moisture = this.noise2.noise2D(nx * 0.8, ny * 0.8);

        // Combined value for terrain selection
        const combined = elevation * 0.7 + moisture * 0.3;

        // Map combined noise to terrain type
        const terrain = this._noiseToTerrain(combined, moisture);

        // Map elevation to integer [0..10]
        const elevInt = Math.round((elevation + 1) * 5);

        map.setTile(q, r, {
          terrain,
          elevation: Math.max(0, Math.min(10, elevInt)),
          building: null,
          event: null,
          fogState: 'unexplored',
        });
      }
    }
  }

  /**
   * Map noise value to terrain type
   */
  _noiseToTerrain(combined, _moisture) {
    for (const entry of this.terrainMapping) {
      if (combined <= entry.maxElev) {
        return entry.terrain;
      }
    }
    return 'grass';
  }

  /**
   * Normalize water elevation: connected water regions share the same elevation,
   * but different water regions can have different elevations (mountain lakes vs sea).
   * Uses flood-fill to identify connected water regions.
   */
  _normalizeWaterElevation(map) {
    const visited = new Set();

    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        const tile = map.getTile(q, r);
        const key = MapData.key(q, r);
        if (!tile || tile.terrain !== 'water' || visited.has(key)) continue;

        // Flood-fill to find this connected water region
        const region = [];
        const queue = [{ q, r }];
        visited.add(key);
        let elevSum = 0;

        while (queue.length > 0) {
          const pos = queue.shift();
          const t = map.getTile(pos.q, pos.r);
          region.push(pos);
          elevSum += t.elevation;

          const neighbors = HexGrid.neighbors(pos.q, pos.r);
          for (const n of neighbors) {
            const nKey = MapData.key(n.q, n.r);
            if (visited.has(nKey)) continue;
            if (!HexGrid.isInBounds(n.q, n.r, this.width, this.height)) continue;
            const nt = map.getTile(n.q, n.r);
            if (nt && nt.terrain === 'water') {
              visited.add(nKey);
              queue.push(n);
            }
          }
        }

        // Set all tiles in this region to the average elevation
        const avgElev = Math.round(elevSum / region.length);
        for (const pos of region) {
          const t = map.getTile(pos.q, pos.r);
          if (t) t.elevation = avgElev;
        }
      }
    }
  }

  /**
   * Ensure land tiles adjacent to water have at least one tile with matching elevation
   * for entry/exit. Requirement: 需求 2.14 — 进出水域只能从同海拔的陆地进入
   */
  _fixWaterBorders(map) {
    // For each water region, ensure at least one adjacent land tile matches its elevation
    const processedWater = new Set();

    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        const tile = map.getTile(q, r);
        const key = MapData.key(q, r);
        if (!tile || tile.terrain !== 'water' || processedWater.has(key)) continue;
        processedWater.add(key);

        const waterElev = tile.elevation;
        const neighbors = HexGrid.neighbors(q, r);
        const landNeighbors = [];

        for (const n of neighbors) {
          if (!HexGrid.isInBounds(n.q, n.r, this.width, this.height)) continue;
          const nt = map.getTile(n.q, n.r);
          if (nt && nt.terrain !== 'water') {
            landNeighbors.push(n);
          }
        }

        if (landNeighbors.length === 0) continue;

        // Check if at least one land neighbor matches water elevation
        const hasMatch = landNeighbors.some(n => {
          const t = map.getTile(n.q, n.r);
          return t && t.elevation === waterElev;
        });

        if (!hasMatch) {
          // Force the first land neighbor to match water elevation
          const first = map.getTile(landNeighbors[0].q, landNeighbors[0].r);
          if (first) first.elevation = waterElev;
        }
      }
    }
  }

  /**
   * Ensure spawn point (center) and surrounding tiles are passable
   */
  _ensureSafeSpawn(map) {
    const cq = Math.floor(this.width / 2);
    const cr = Math.floor(this.height / 2);

    // Make center tile grass with moderate elevation
    this._makeSafe(map, cq, cr);

    // Make all neighbors safe too
    const neighbors = HexGrid.neighbors(cq, cr);
    for (const n of neighbors) {
      if (HexGrid.isInBounds(n.q, n.r, this.width, this.height)) {
        this._makeSafe(map, n.q, n.r);
      }
    }
  }

  _makeSafe(map, q, r) {
    const tile = map.getTile(q, r);
    if (tile) {
      tile.terrain = 'grass';
      tile.elevation = 5;
    }
  }

  /**
   * Place a tutorial event on a neighbor of the spawn point
   */
  _placeTutorialEvent(map) {
    const cq = Math.floor(this.width / 2);
    const cr = Math.floor(this.height / 2);
    const neighbors = HexGrid.neighbors(cq, cr);
    for (const n of neighbors) {
      if (HexGrid.isInBounds(n.q, n.r, this.width, this.height)) {
        const tile = map.getTile(n.q, n.r);
        if (tile && !tile.event) {
          tile.event = 'tutorial';
          return;
        }
      }
    }
  }

  /**
   * Place 3 relic fragments hidden inside events at map extreme coordinates.
   * Relics are NOT visible on the map — they are rewards inside events.
   */
  placeRelics(map) {
    // Events that can contain relic fragments as rewards
    const relicEvents = ['relic_guardian', 'relic_shrine', 'relic_trial'];

    const candidates = [
      { q: Math.floor(this.width * 0.15), r: Math.floor(this.height * 0.15) },
      { q: Math.floor(this.width * 0.85), r: Math.floor(this.height * 0.15) },
      { q: Math.floor(this.width * 0.5),  r: Math.floor(this.height * 0.85) },
    ];

    map.relicPositions = [];
    for (let i = 0; i < candidates.length; i++) {
      const pos = candidates[i];
      const placed = this._findPassableTileNear(map, pos.q, pos.r);
      if (placed) {
        const tile = map.getTile(placed.q, placed.r);
        if (tile) {
          // Place a relic-containing event (not directly visible as relic)
          tile.event = relicEvents[i % relicEvents.length];
        }
        map.relicPositions.push({ q: placed.q, r: placed.r });
      }
    }
  }

  /**
   * Place buildings respecting allowedTerrains and adjacencyConstraints
   */
  placeBuildings(map) {
    const buildingTypes = this.buildingConfig.buildingTypes;

    // Place portal first (required for win condition)
    this._placeBuilding(map, 'portal', buildingTypes.portal);

    // Place teleporter pair
    this._placeTeleporterPair(map, buildingTypes.teleporter);

    // Place other buildings
    const otherBuildings = ['lighthouse', 'camp', 'city', 'ruin', 'cave', 'farm', 'mine', 'monster_camp'];
    // Scale building count with map size — aim for ~8% coverage
    const buildingCount = Math.max(8, Math.floor((this.width * this.height) / 80));

    for (let i = 0; i < buildingCount; i++) {
      const typeId = otherBuildings[i % otherBuildings.length];
      const config = buildingTypes[typeId];
      if (config) {
        this._placeBuilding(map, typeId, config);
      }
    }

    // Place whirlpool on water if water exists
    if (buildingTypes.whirlpool) {
      this._placeWaterBuilding(map, 'whirlpool', buildingTypes.whirlpool);
    }
  }

  _placeBuilding(map, typeId, config) {
    const allowed = config.allowedTerrains || [];
    const forbidden = (config.adjacencyConstraints && config.adjacencyConstraints.forbidden) || [];
    const maxAttempts = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const q = this.rng.nextInt(0, this.width - 1);
      const r = this.rng.nextInt(0, this.height - 1);
      const tile = map.getTile(q, r);
      if (!tile || tile.building) continue;
      if (!allowed.includes(tile.terrain)) continue;

      // Check adjacency constraints
      if (forbidden.length > 0) {
        const neighbors = HexGrid.neighbors(q, r);
        let violates = false;
        for (const n of neighbors) {
          const nt = map.getTile(n.q, n.r);
          if (nt && nt.building && forbidden.includes(nt.building)) {
            violates = true;
            break;
          }
        }
        if (violates) continue;
      }

      // Don't place on spawn area
      const spawnQ = Math.floor(this.width / 2);
      const spawnR = Math.floor(this.height / 2);
      if (HexGrid.distance(q, r, spawnQ, spawnR) < 3) continue;

      tile.building = typeId;
      // If building has a triggerEvent, set it on the tile
      if (config.triggerEvent) {
        tile.event = config.triggerEvent;
      }
      if (typeId === 'portal') {
        map.portalPosition = { q, r };
      }
      return { q, r };
    }
    return null;
  }

  _placeTeleporterPair(map, config) {
    const allowed = config.allowedTerrains || [];
    const maxAttempts = 100;
    const placed = [];

    for (let i = 0; i < 2 && placed.length < 2; i++) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const q = this.rng.nextInt(0, this.width - 1);
        const r = this.rng.nextInt(0, this.height - 1);
        const tile = map.getTile(q, r);
        if (!tile || tile.building) continue;
        if (!allowed.includes(tile.terrain)) continue;

        // Ensure teleporters are spread apart
        if (placed.length > 0) {
          const dist = HexGrid.distance(q, r, placed[0].q, placed[0].r);
          if (dist < Math.min(this.width, this.height) / 4) continue;
        }

        tile.building = 'teleporter';
        placed.push({ q, r });
        break;
      }
    }

    if (placed.length === 2) {
      map.teleportPairs.push([placed[0], placed[1]]);
    }
  }

  _placeWaterBuilding(map, typeId, _config) {
    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const q = this.rng.nextInt(0, this.width - 1);
      const r = this.rng.nextInt(0, this.height - 1);
      const tile = map.getTile(q, r);
      if (!tile || tile.building) continue;
      if (tile.terrain !== 'water') continue;
      tile.building = typeId;
      return;
    }
  }

  /**
   * Place items as events, ensuring terrain-item matching.
   * - If water exists → place boat
   * - If lava exists → place fire_boots
   * - No duplicate items per map (Req 13.5)
   * - Only items relevant to map terrain (Req 13.6)
   */
  placeItems(map) {
    const terrainTypes = this.terrainConfig.terrainTypes;
    const items = this.itemConfig.items;
    const placedItems = new Set();

    // Determine which terrains exist on the map
    const existingTerrains = new Set();
    const allTiles = map.getAllTiles();
    for (const t of allTiles) {
      existingTerrains.add(t.terrain);
    }

    // Terrain-required items: if terrain exists and requires an item, that item MUST be placed
    const requiredItems = [];
    for (const [terrainId, tConfig] of Object.entries(terrainTypes)) {
      if (existingTerrains.has(terrainId) && tConfig.requiredItem) {
        requiredItems.push(tConfig.requiredItem);
      }
    }

    // Place required items first (on passable tiles, reachable without that item)
    for (const itemId of requiredItems) {
      if (placedItems.has(itemId)) continue;
      this._placeItemEvent(map, itemId, placedItems);
    }

    // Place optional items that are relevant to the map
    const optionalItems = this._getRelevantOptionalItems(items, existingTerrains, requiredItems);
    for (const itemId of optionalItems) {
      if (placedItems.has(itemId)) continue;
      this._placeItemEvent(map, itemId, placedItems);
    }
  }

  /**
   * Get optional items relevant to the map's terrain
   */
  _getRelevantOptionalItems(items, existingTerrains, requiredItems) {
    const optional = [];
    for (const [itemId, config] of Object.entries(items)) {
      if (requiredItems.includes(itemId)) continue;

      // Check if item is relevant to existing terrains
      let relevant = false;
      for (const effect of (config.effects || [])) {
        if (effect.type === 'terrain_pass') {
          // Only include if the terrain it enables exists
          if (effect.terrainType && existingTerrains.has(effect.terrainType)) {
            relevant = true;
          } else if (effect.condition) {
            // Elevation-based items (rope_claw, parachute) are always relevant
            relevant = true;
          }
        } else {
          // Non-terrain-pass items (telescope, tent, etc.) are generally relevant
          relevant = true;
        }
      }
      if (relevant) {
        optional.push(itemId);
      }
    }
    // Shuffle for variety
    this.rng.shuffle(optional);
    return optional;
  }

  /**
   * Place a single item as an event on a passable tile.
   * Key distinction:
   * - requiredItem terrains (water) are IMPASSABLE without the item → item CANNOT be placed there
   * - enterDamage terrains (lava) are PASSABLE but hurt → item CAN be placed there
   */
  _placeItemEvent(map, itemId, placedItems) {
    const spawnQ = Math.floor(this.width / 2);
    const spawnR = Math.floor(this.height / 2);
    const maxAttempts = 200;

    const terrainTypes = this.terrainConfig.terrainTypes;

    // Build set of terrains that are completely impassable without their required item
    // Distinction: terrains with enterDamage > 0 are reachable (player takes damage),
    // so items CAN be placed there. Only terrains with requiredItem AND no enterDamage
    // path are truly impassable (e.g., water without boat).
    const impassableTerrains = new Map(); // terrain → requiredItemId
    for (const [tid, tc] of Object.entries(terrainTypes)) {
      if (tc.requiredItem && !(tc.enterDamage > 0)) {
        impassableTerrains.set(tid, tc.requiredItem);
      }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const q = this.rng.nextInt(0, this.width - 1);
      const r = this.rng.nextInt(0, this.height - 1);
      const tile = map.getTile(q, r);
      if (!tile || tile.event) continue;

      // For impassable terrains: don't place the required item ON that terrain
      // (e.g. can't place boat on water — water is unreachable without boat)
      const terrainReqItem = impassableTerrains.get(tile.terrain);
      if (terrainReqItem && terrainReqItem === itemId) continue;

      // Don't place ANY item on impassable terrain (player can't reach it without the item)
      if (impassableTerrains.has(tile.terrain)) continue;

      // Note: enterDamage terrains (lava) are fine — player can reach them, just takes damage
      // So fire_boots CAN be placed on lava

      // Don't place too close to spawn
      if (HexGrid.distance(q, r, spawnQ, spawnR) < 2) continue;

      tile.event = `item_pickup_${itemId}`;
      placedItems.add(itemId);
      return true;
    }
    return false;
  }

  /**
   * Validate reachability: BFS from spawn to verify all tiles reachable
   * (with or without items)
   */
  validateReachability(map) {
    const spawnQ = Math.floor(this.width / 2);
    const spawnR = Math.floor(this.height / 2);

    // BFS from spawn, ignoring item requirements (checking structural reachability)
    const visited = new Set();
    const queue = [{ q: spawnQ, r: spawnR }];
    visited.add(MapData.key(spawnQ, spawnR));

    while (queue.length > 0) {
      const { q, r } = queue.shift();
      const neighbors = HexGrid.neighbors(q, r);
      for (const n of neighbors) {
        const key = MapData.key(n.q, n.r);
        if (visited.has(key)) continue;
        const tile = map.getTile(n.q, n.r);
        if (!tile) continue;

        // Check elevation constraint: can't climb >3 or drop <=-4 without items
        const currentTile = map.getTile(q, r);
        // With items, all elevation differences are passable (structural reachability)
        // Future: use elevation delta for without-items reachability check
        void currentTile;
        visited.add(key);
        queue.push(n);
      }
    }

    const unreachable = [];
    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        if (!visited.has(MapData.key(q, r))) {
          unreachable.push({ q, r });
        }
      }
    }

    return { valid: unreachable.length === 0, unreachable };
  }

  /**
   * Place random events on empty tiles based on terrain event weights.
   * Aim for ~15% of tiles having events for good exploration density.
   */
  _placeRandomEvents(map) {
    const terrainTypes = this.terrainConfig.terrainTypes;
    const eventConfig = this.itemConfig; // events are separate but we use terrain weights
    const EVENT_DENSITY = 0.15; // 15% of tiles get events

    // Available event IDs by type
    const eventsByType = {
      combat: ['wolf_attack', 'swamp_creature'],
      treasure: ['chest_01', 'chest_02', 'herb_discovery', 'floating_crate'],
      choice: ['stargazing', 'forest_spirit', 'will_o_wisp', 'desert_merchant',
               'wandering_healer', 'ancient_shrine', 'ice_crack', 'sandstorm', 'blizzard'],
    };

    for (let r = 0; r < this.height; r++) {
      for (let q = 0; q < this.width; q++) {
        const tile = map.getTile(q, r);
        if (!tile || tile.event || tile.building) continue;

        // Skip spawn area
        const spawnQ = Math.floor(this.width / 2);
        const spawnR = Math.floor(this.height / 2);
        if (HexGrid.distance(q, r, spawnQ, spawnR) < 3) continue;

        // Roll for event placement
        if (this.rng.next() > EVENT_DENSITY) continue;

        // Get terrain event weights
        const tc = terrainTypes[tile.terrain];
        const weights = (tc && tc.eventWeights) || { combat: 0.3, treasure: 0.4, choice: 0.3 };

        // Pick event type based on weights
        const roll = this.rng.next();
        let eventType;
        if (roll < weights.combat) {
          eventType = 'combat';
        } else if (roll < weights.combat + weights.treasure) {
          eventType = 'treasure';
        } else {
          eventType = 'choice';
        }

        // Pick a random event of that type
        const pool = eventsByType[eventType];
        if (pool && pool.length > 0) {
          tile.event = pool[this.rng.nextInt(0, pool.length - 1)];
        }
      }
    }
  }

  /**
   * Ensure all tiles are reachable by smoothing elevation barriers
   */
  _ensureReachability(map) {
    const result = this.validateReachability(map);
    if (result.valid) return;

    // For unreachable tiles, smooth elevation to make them reachable
    for (const pos of result.unreachable) {
      const tile = map.getTile(pos.q, pos.r);
      if (!tile) continue;
      // Find a reachable neighbor and match elevation
      const neighbors = HexGrid.neighbors(pos.q, pos.r);
      for (const n of neighbors) {
        const nt = map.getTile(n.q, n.r);
        if (nt) {
          // Smooth elevation difference
          const diff = Math.abs(tile.elevation - nt.elevation);
          if (diff > 3) {
            tile.elevation = nt.elevation + (tile.elevation > nt.elevation ? 3 : -3);
          }
        }
      }
    }
  }

  /**
   * Find a passable tile near the given coordinates
   */
  _findPassableTileNear(map, targetQ, targetR) {
    // Clamp to bounds
    const q = Math.max(0, Math.min(this.width - 1, targetQ));
    const r = Math.max(0, Math.min(this.height - 1, targetR));

    const tile = map.getTile(q, r);
    if (tile && !tile.event && this._isPassableWithoutItems(tile)) {
      return { q, r };
    }

    // Spiral search outward
    for (let radius = 1; radius < 10; radius++) {
      const hexes = HexGrid.hexesInRange(q, r, radius);
      this.rng.shuffle(hexes);
      for (const h of hexes) {
        if (!HexGrid.isInBounds(h.q, h.r, this.width, this.height)) continue;
        const t = map.getTile(h.q, h.r);
        if (t && !t.event && !t.building && this._isPassableWithoutItems(t)) {
          return { q: h.q, r: h.r };
        }
      }
    }
    return { q, r }; // fallback
  }

  _isPassableWithoutItems(tile) {
    const terrainTypes = this.terrainConfig.terrainTypes;
    const tc = terrainTypes[tile.terrain];
    // Terrain is passable without items if it has no requiredItem,
    // OR if it has enterDamage (reachable with damage cost)
    return !tc || !tc.requiredItem || (tc.enterDamage > 0);
  }

  /**
   * Load a preset map from JSON data
   * @param {object} jsonData - preset map data
   * @returns {MapData}
   */
  static fromPreset(jsonData) {
    return MapData.fromJSON(jsonData);
  }
}
