/**
 * SaveSystem — 存档系统
 * 序列化/反序列化、自动存档、版本兼容
 *
 * 需求 10: 存档导出与导入
 */

const AUTOSAVE_KEY = 'hexwanderer_autosave';

export class SaveSystem {
  /**
   * @param {string} gameVersion - Current game version string (e.g. "1.0.0")
   */
  constructor(gameVersion) {
    this._gameVersion = gameVersion;
  }

  /**
   * Serialize a complete GameState to a JSON string.
   * Includes the current game version in the output.
   *
   * @param {object} gameState - Full game state object
   * @returns {string} JSON string
   */
  serialize(gameState) {
    const data = {
      ...gameState,
      version: this._gameVersion,
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize a JSON string back into a GameState.
   * Validates the parsed data before returning.
   *
   * @param {string} jsonString - JSON string to parse
   * @returns {{ success: boolean, state?: object, error?: string }}
   */
  deserialize(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { success: false, error: `Invalid JSON: ${e.message}` };
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, error: 'JSON root must be an object' };
    }

    const validation = this.validate(parsed);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join('; ')}` };
    }

    // Migrate if version differs
    if (parsed.version && parsed.version !== this._gameVersion) {
      parsed = this.migrate(parsed, parsed.version, this._gameVersion);
    }

    return { success: true, state: parsed };
  }

  /**
   * Validate that a GameState object has all required fields.
   *
   * @param {object} gameState - State object to validate
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(gameState) {
    const errors = [];

    if (gameState === null || typeof gameState !== 'object') {
      return { valid: false, errors: ['gameState must be an object'] };
    }

    // Top-level required fields
    if (typeof gameState.seed === 'undefined') errors.push('Missing field: seed');
    if (typeof gameState.mapSize === 'undefined') errors.push('Missing field: mapSize');
    if (typeof gameState.turnNumber === 'undefined') errors.push('Missing field: turnNumber');

    // Player block
    if (!gameState.player || typeof gameState.player !== 'object') {
      errors.push('Missing or invalid field: player');
    } else {
      const p = gameState.player;
      if (!p.position || typeof p.position.q === 'undefined' || typeof p.position.r === 'undefined') {
        errors.push('Missing field: player.position (needs q, r)');
      }
      if (typeof p.hp === 'undefined') errors.push('Missing field: player.hp');
      if (typeof p.hpMax === 'undefined') errors.push('Missing field: player.hpMax');
      if (typeof p.ap === 'undefined') errors.push('Missing field: player.ap');
      if (typeof p.apMax === 'undefined') errors.push('Missing field: player.apMax');
    }

    // Map block
    if (!gameState.map || typeof gameState.map !== 'object') {
      errors.push('Missing or invalid field: map');
    } else {
      const m = gameState.map;
      if (!m.tiles || typeof m.tiles !== 'object') errors.push('Missing field: map.tiles');
      if (!Array.isArray(m.relicPositions)) errors.push('Missing field: map.relicPositions');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Auto-save the current GameState to localStorage.
   *
   * @param {object} gameState - Full game state
   */
  autoSave(gameState) {
    const json = this.serialize(gameState);
    try {
      localStorage.setItem(AUTOSAVE_KEY, json);
    } catch (_) {
      // localStorage may be unavailable or full — silently fail
    }
  }

  /**
   * Load the auto-saved GameState from localStorage.
   *
   * @returns {object|null} Restored GameState, or null if none / invalid
   */
  loadAutoSave() {
    let raw;
    try {
      raw = localStorage.getItem(AUTOSAVE_KEY);
    } catch (_) {
      return null;
    }
    if (!raw) return null;

    const result = this.deserialize(raw);
    return result.success ? result.state : null;
  }

  /**
   * Migrate an old-version state to a new version.
   * Fills missing fields with sensible defaults so old saves work in new versions.
   *
   * @param {object} oldState - The state from the old version
   * @param {string} fromVersion - Version string of the old state
   * @param {string} toVersion - Target version string
   * @returns {object} Migrated state
   */
  migrate(oldState, fromVersion, toVersion) {
    // Deep-clone to avoid mutating the original
    const state = JSON.parse(JSON.stringify(oldState));

    // Update version stamp
    state.version = toVersion;

    // Ensure top-level defaults
    if (typeof state.seed === 'undefined') state.seed = 0;
    if (typeof state.mapSize === 'undefined') state.mapSize = 'medium';
    if (typeof state.turnNumber === 'undefined') state.turnNumber = 1;

    // Ensure player defaults
    if (!state.player || typeof state.player !== 'object') {
      state.player = {};
    }
    const p = state.player;
    if (!p.position) p.position = { q: 0, r: 0 };
    if (typeof p.hp === 'undefined') p.hp = 100;
    if (typeof p.hpMax === 'undefined') p.hpMax = 100;
    if (typeof p.ap === 'undefined') p.ap = 5;
    if (typeof p.apMax === 'undefined') p.apMax = 5;
    if (typeof p.relicsCollected === 'undefined') p.relicsCollected = 0;
    if (!Array.isArray(p.items)) p.items = [];
    if (!Array.isArray(p.statusEffects)) p.statusEffects = [];

    // Ensure map defaults
    if (!state.map || typeof state.map !== 'object') {
      state.map = {};
    }
    const m = state.map;
    if (!m.tiles || typeof m.tiles !== 'object') m.tiles = {};
    if (!Array.isArray(m.relicPositions)) m.relicPositions = [];
    if (typeof m.portalPosition === 'undefined') m.portalPosition = null;
    if (!Array.isArray(m.teleportPairs)) m.teleportPairs = [];

    return state;
  }
}
