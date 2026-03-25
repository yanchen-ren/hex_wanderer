/**
 * SaveSystem 单元测试
 */
import { describe, it, expect, beforeEach } from '../test-runner.js';
import { SaveSystem } from '../../src/systems/SaveSystem.js';

/** Helper: build a minimal valid GameState */
function makeGameState(overrides = {}) {
  return {
    version: '1.0.0',
    seed: 12345,
    mapSize: 'medium',
    turnNumber: 15,
    player: {
      position: { q: 0, r: 0 },
      hp: 85,
      hpMax: 100,
      ap: 3,
      apMax: 5,
      relicsCollected: 1,
      items: [{ itemId: 'rope_claw', enabled: true }],
      statusEffects: [{ id: 'poison', duration: 2, effect: { apCostModifier: 1 } }],
    },
    map: {
      tiles: {
        '0,0': { terrain: 'grass', elevation: 3, building: null, event: null, fogState: 'visible' },
        '1,0': { terrain: 'forest', elevation: 5, building: 'lighthouse', event: null, fogState: 'explored' },
      },
      relicPositions: [{ q: -20, r: 0 }, { q: 15, r: -18 }, { q: 5, r: 20 }],
      portalPosition: { q: 10, r: -5 },
      teleportPairs: [[{ q: 3, r: 7 }, { q: -8, r: 12 }]],
    },
    ...overrides,
  };
}

// --- Mock localStorage for autoSave / loadAutoSave tests ---
function createMockLocalStorage() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    _store: store,
  };
}

describe('SaveSystem', () => {
  // ===== serialize / deserialize roundtrip =====
  it('serialize→deserialize roundtrip produces equivalent state', () => {
    const sys = new SaveSystem('1.0.0');
    const original = makeGameState();
    const json = sys.serialize(original);
    const result = sys.deserialize(json);

    expect(result.success).toBeTrue();
    expect(result.state.seed).toBe(original.seed);
    expect(result.state.turnNumber).toBe(original.turnNumber);
    expect(result.state.player.hp).toBe(original.player.hp);
    expect(result.state.player.position.q).toBe(original.player.position.q);
    expect(result.state.player.position.r).toBe(original.player.position.r);
    expect(result.state.map.relicPositions.length).toBe(3);
    expect(result.state.map.portalPosition.q).toBe(10);
    expect(result.state.map.teleportPairs.length).toBe(1);
  });

  it('serialize includes version number', () => {
    const sys = new SaveSystem('2.5.0');
    const json = sys.serialize(makeGameState());
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('2.5.0');
  });

  // ===== invalid JSON rejection =====
  it('deserialize rejects invalid JSON', () => {
    const sys = new SaveSystem('1.0.0');
    const result = sys.deserialize('not valid json {{{');
    expect(result.success).toBeFalse();
    expect(result.error).toContain('Invalid JSON');
  });

  it('deserialize rejects non-object JSON (array)', () => {
    const sys = new SaveSystem('1.0.0');
    const result = sys.deserialize('[1,2,3]');
    expect(result.success).toBeFalse();
    expect(result.error).toContain('JSON root must be an object');
  });

  it('deserialize rejects null JSON', () => {
    const sys = new SaveSystem('1.0.0');
    const result = sys.deserialize('null');
    expect(result.success).toBeFalse();
  });

  // ===== validation =====
  it('validate passes for a complete GameState', () => {
    const sys = new SaveSystem('1.0.0');
    const result = sys.validate(makeGameState());
    expect(result.valid).toBeTrue();
    expect(result.errors.length).toBe(0);
  });

  it('validate fails when player is missing', () => {
    const sys = new SaveSystem('1.0.0');
    const state = makeGameState();
    delete state.player;
    const result = sys.validate(state);
    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate fails when map is missing', () => {
    const sys = new SaveSystem('1.0.0');
    const state = makeGameState();
    delete state.map;
    const result = sys.validate(state);
    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate fails when player.position is missing', () => {
    const sys = new SaveSystem('1.0.0');
    const state = makeGameState();
    delete state.player.position;
    const result = sys.validate(state);
    expect(result.valid).toBeFalse();
  });

  it('validate fails when map.tiles is missing', () => {
    const sys = new SaveSystem('1.0.0');
    const state = makeGameState();
    delete state.map.tiles;
    const result = sys.validate(state);
    expect(result.valid).toBeFalse();
  });

  // ===== version migration =====
  it('migrate fills missing player fields with defaults', () => {
    const sys = new SaveSystem('2.0.0');
    const oldState = {
      version: '0.9.0',
      seed: 99,
      mapSize: 'small',
      turnNumber: 5,
      player: { position: { q: 1, r: 2 }, hp: 50, hpMax: 100, ap: 3, apMax: 5 },
      map: { tiles: {}, relicPositions: [] },
    };
    const migrated = sys.migrate(oldState, '0.9.0', '2.0.0');

    expect(migrated.version).toBe('2.0.0');
    expect(migrated.player.relicsCollected).toBe(0);
    expect(Array.isArray(migrated.player.items)).toBeTrue();
    expect(Array.isArray(migrated.player.statusEffects)).toBeTrue();
    expect(migrated.map.portalPosition).toBeNull();
    expect(Array.isArray(migrated.map.teleportPairs)).toBeTrue();
  });

  it('migrate fills missing top-level fields', () => {
    const sys = new SaveSystem('2.0.0');
    const oldState = {
      version: '0.5.0',
      player: { position: { q: 0, r: 0 }, hp: 100, hpMax: 100, ap: 5, apMax: 5 },
      map: { tiles: {}, relicPositions: [] },
    };
    const migrated = sys.migrate(oldState, '0.5.0', '2.0.0');

    expect(migrated.seed).toBe(0);
    expect(migrated.mapSize).toBe('medium');
    expect(migrated.turnNumber).toBe(1);
  });

  it('deserialize auto-migrates old version saves', () => {
    const sys = new SaveSystem('2.0.0');
    const oldState = makeGameState({ version: '1.0.0' });
    const json = JSON.stringify(oldState);
    const result = sys.deserialize(json);

    expect(result.success).toBeTrue();
    expect(result.state.version).toBe('2.0.0');
  });

  it('migrate does not mutate the original state', () => {
    const sys = new SaveSystem('2.0.0');
    const oldState = makeGameState({ version: '1.0.0' });
    const originalSeed = oldState.seed;
    sys.migrate(oldState, '1.0.0', '2.0.0');
    expect(oldState.seed).toBe(originalSeed);
    expect(oldState.version).toBe('1.0.0');
  });

  // ===== autoSave / loadAutoSave (mock localStorage) =====
  it('autoSave stores to localStorage and loadAutoSave retrieves it', () => {
    const mock = createMockLocalStorage();
    const original = globalThis.localStorage;
    // Temporarily replace localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });

    try {
      const sys = new SaveSystem('1.0.0');
      const state = makeGameState();
      sys.autoSave(state);

      // Verify something was stored
      const raw = mock.getItem('hexwanderer_autosave');
      expect(typeof raw).toBe('string');
      expect(raw.length).toBeGreaterThan(0);

      // Load it back
      const loaded = sys.loadAutoSave();
      expect(loaded).toBeDefined();
      expect(loaded.seed).toBe(state.seed);
      expect(loaded.player.hp).toBe(state.player.hp);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, writable: true, configurable: true });
    }
  });

  it('loadAutoSave returns null when no save exists', () => {
    const mock = createMockLocalStorage();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });

    try {
      const sys = new SaveSystem('1.0.0');
      const loaded = sys.loadAutoSave();
      expect(loaded).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, writable: true, configurable: true });
    }
  });
});
