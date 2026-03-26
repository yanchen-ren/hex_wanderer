/**
 * AssetLoader — 素材预加载与缓存
 * 批量预加载、进度回调、缺失回退（颜色/Emoji）、多变体支持
 *
 * Works with PixiJS v7+ PIXI.Assets API.
 * Falls back to color fills / emoji when sprites are missing.
 */

/** Default terrain colors used when no sprite is available */
const TERRAIN_COLORS = {
  grass:  0x4caf50,
  desert: 0xd4a843,
  water:  0x2196f3,
  forest: 0x2e7d32,
  swamp:  0x6d4c41,
  lava:   0xe53935,
  ice:    0xb3e5fc,
};

/** UI marker sprite paths */
const UI_MARKERS = {
  player: 'assets/ui/player.png',
  event: 'assets/ui/event_marker.png',
  monster: 'assets/ui/monster_marker.png',
  treasure: 'assets/ui/treature_marker.png',
};
const BUILDING_EMOJI = {
  portal: '🌀', teleporter: '⚡', lighthouse: '🗼', camp: '⛺',
  city: '🏘️', ruin: '🏚️', cave: '🕳️', farm: '🌾', mine: '⛏️',
  monster_camp: '👹', whirlpool: '🌊', church: '⛪', watchtower: '🔭',
  reef: '🪸', training_ground: '🏋️', altar: '🪨', spring: '💧',
  wishing_well: '🪙', phone_booth: '📞', food_truck: '🍔',
  bonfire: '🔥', hollow_tree: '🌳', colossus_hand: '✋',
  vending_machine: '🥫', village: '🏡',
};

export class AssetLoader {
  constructor() {
    /** @type {Map<string, PIXI.Texture>} loaded textures keyed by path */
    this._cache = new Map();
    /** @type {Set<string>} paths that failed to load */
    this._failed = new Set();
    /** @type {boolean} */
    this._loaded = false;
  }

  // ── public getters ──────────────────────────────────────────

  /** Get fallback color for a terrain type */
  static getTerrainColor(terrain) {
    return TERRAIN_COLORS[terrain] ?? 0x888888;
  }

  /** Get fallback emoji for a building type */
  static getBuildingEmoji(buildingType) {
    return BUILDING_EMOJI[buildingType] ?? '🏗️';
  }

  /** Get UI marker sprite path by marker type */
  static getMarkerPath(markerType) {
    return UI_MARKERS[markerType] ?? null;
  }

  /** Whether all requested assets have been loaded (or attempted) */
  get loaded() { return this._loaded; }

  // ── core API ────────────────────────────────────────────────

  /**
   * Batch-preload an array of asset paths.
   * @param {string[]} paths - asset file paths (relative to page)
   * @param {function} [onProgress] - callback(loaded, total)
   * @returns {Promise<void>}
   */
  async preload(paths, onProgress) {
    const unique = [...new Set(paths)].filter(p => !this._cache.has(p));
    const total = unique.length;
    let loaded = 0;

    const promises = unique.map(async (path) => {
      try {
        const texture = await PIXI.Assets.load(path);
        this._cache.set(path, texture);
      } catch (_e) {
        this._failed.add(path);
      }
      loaded++;
      if (onProgress) onProgress(loaded, total);
    });

    await Promise.all(promises);
    this._loaded = true;
  }

  /**
   * Collect all sprite paths from terrain + building configs for preloading.
   * @param {object} terrainConfig - parsed terrain.json
   * @param {object} buildingConfig - parsed building.json
   * @returns {string[]}
   */
  static collectAssetPaths(terrainConfig, buildingConfig) {
    const paths = [];

    // Terrain sprites
    if (terrainConfig?.terrainTypes) {
      for (const tc of Object.values(terrainConfig.terrainTypes)) {
        const sprites = tc.sprites;
        if (!sprites) continue;
        if (sprites.variants) paths.push(...sprites.variants);
        if (sprites.default) paths.push(sprites.default);
        if (sprites.highElevation?.variants) paths.push(...sprites.highElevation.variants);
        if (sprites.lowElevation?.variants) paths.push(...sprites.lowElevation.variants);
      }
    }

    // Building sprites
    if (buildingConfig?.buildingTypes) {
      for (const bc of Object.values(buildingConfig.buildingTypes)) {
        if (bc.sprite) paths.push(bc.sprite);
      }
    }

    // UI marker sprites
    paths.push(...Object.values(UI_MARKERS));

    return [...new Set(paths)];
  }

  /**
   * Get a cached texture by path, or null if missing / failed.
   * @param {string} path
   * @returns {PIXI.Texture|null}
   */
  getTexture(path) {
    return this._cache.get(path) ?? null;
  }

  /**
   * Check if a path failed to load.
   */
  hasFailed(path) {
    return this._failed.has(path);
  }

  /**
   * Resolve the correct sprite path for a terrain + elevation combo,
   * respecting multi-variant rules and high-elevation overrides.
   *
   * @param {object} terrainTypeConfig - single terrain entry from terrain.json
   * @param {number} elevation
   * @param {number} col - tile column (used for deterministic variant pick)
   * @param {number} row - tile row
   * @returns {string|null} resolved asset path, or null if none configured
   */
  resolveTerrainSprite(terrainTypeConfig, elevation, col, row) {
    if (!terrainTypeConfig?.sprites) return null;

    const sprites = terrainTypeConfig.sprites;
    const threshold = terrainTypeConfig.elevationSpriteThreshold;

    // Check high-elevation override
    if (threshold != null && elevation >= threshold && sprites.highElevation) {
      return this._pickVariant(sprites.highElevation, col, row);
    }

    // Check low-elevation override
    const lowThreshold = sprites.lowElevationThreshold;
    if (lowThreshold != null && elevation < lowThreshold && sprites.lowElevation) {
      return this._pickVariant(sprites.lowElevation, col, row);
    }

    // Normal variants
    if (sprites.variants) {
      return this._pickVariant(sprites, col, row);
    }

    // Single default
    return sprites.default ?? null;
  }

  /**
   * Pick a variant from a sprites descriptor using the configured rule.
   * @private
   */
  _pickVariant(spriteDesc, col, row) {
    const variants = spriteDesc.variants;
    if (!variants || variants.length === 0) return spriteDesc.default ?? null;
    if (variants.length === 1) return variants[0];

    const rule = spriteDesc.rule ?? 'random';
    if (rule === 'random') {
      // Deterministic hash from tile coords so same tile always picks same variant
      const hash = Math.abs(((col * 73856093) ^ (row * 19349663)) | 0);
      return variants[hash % variants.length];
    }
    if (rule === 'elevation') {
      // Not commonly used yet, just pick first
      return variants[0];
    }
    return variants[0];
  }

  /**
   * Clear all cached textures.
   */
  clear() {
    this._cache.clear();
    this._failed.clear();
    this._loaded = false;
  }
}
