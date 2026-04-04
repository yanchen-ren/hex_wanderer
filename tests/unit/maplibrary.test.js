/**
 * MapLibrary 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from '../test-runner.js';
import { MapLibrary } from '../../src/editor/MapLibrary.js';

/** Helper: create a mock localStorage */
function createMockLocalStorage() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
    _store: store,
  };
}

/** Helper: build a minimal CustomMap */
function makeCustomMap(id, name = 'Test Map') {
  return {
    id,
    meta: {
      name,
      author: 'Tester',
      description: 'A test map',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: 'small',
    },
    mapJSON: {
      width: 25,
      height: 25,
      tiles: { '0,0': { terrain: 'grass', elevation: 5, building: null, event: null } },
      relicPositions: [],
      relicsNeeded: 3,
      portalPosition: null,
      teleportPairs: [],
    },
  };
}

let originalLocalStorage;
let mockStorage;

describe('MapLibrary', () => {
  beforeEach(() => {
    mockStorage = createMockLocalStorage();
    originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage, writable: true, configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage, writable: true, configurable: true,
    });
  });

  // --- Constructor ---
  it('uses default storageKey', () => {
    const lib = new MapLibrary();
    const map = makeCustomMap('m1');
    lib.save('m1', map);
    expect(mockStorage._store['hexwanderer_map_library']).toBeDefined();
  });

  it('uses custom storageKey', () => {
    const lib = new MapLibrary('custom_key');
    const map = makeCustomMap('m1');
    lib.save('m1', map);
    expect(mockStorage._store['custom_key']).toBeDefined();
  });

  // --- save / load roundtrip ---
  it('save and load roundtrip returns equivalent data', () => {
    const lib = new MapLibrary();
    const map = makeCustomMap('m1', 'My Map');
    lib.save('m1', map);
    const loaded = lib.load('m1');
    expect(loaded.id).toBe('m1');
    expect(loaded.meta.name).toBe('My Map');
    expect(loaded.meta.author).toBe('Tester');
    expect(loaded.mapJSON.width).toBe(25);
    expect(loaded.mapJSON.height).toBe(25);
  });

  it('save returns success true', () => {
    const lib = new MapLibrary();
    const result = lib.save('m1', makeCustomMap('m1'));
    expect(result.success).toBeTrue();
  });

  it('save overwrites existing map with same id', () => {
    const lib = new MapLibrary();
    lib.save('m1', makeCustomMap('m1', 'First'));
    lib.save('m1', makeCustomMap('m1', 'Second'));
    const loaded = lib.load('m1');
    expect(loaded.meta.name).toBe('Second');
  });

  // --- load ---
  it('load returns null for non-existent id', () => {
    const lib = new MapLibrary();
    const loaded = lib.load('nonexistent');
    expect(loaded).toBeNull();
  });

  // --- delete ---
  it('delete removes a map', () => {
    const lib = new MapLibrary();
    lib.save('m1', makeCustomMap('m1'));
    const delResult = lib.delete('m1');
    expect(delResult.success).toBeTrue();
    expect(lib.load('m1')).toBeNull();
  });

  it('delete non-existent id succeeds without error', () => {
    const lib = new MapLibrary();
    const result = lib.delete('nonexistent');
    expect(result.success).toBeTrue();
  });

  // --- list ---
  it('list returns empty array when no maps saved', () => {
    const lib = new MapLibrary();
    const items = lib.list();
    expect(items.length).toBe(0);
  });

  it('list returns metadata without mapJSON', () => {
    const lib = new MapLibrary();
    lib.save('m1', makeCustomMap('m1', 'Map One'));
    lib.save('m2', makeCustomMap('m2', 'Map Two'));
    const items = lib.list();
    expect(items.length).toBe(2);
    // Each item should have id and meta but not mapJSON
    const item = items.find(i => i.id === 'm1');
    expect(item.meta.name).toBe('Map One');
    expect(item.mapJSON).toBeUndefined();
  });

  it('list reflects deletions', () => {
    const lib = new MapLibrary();
    lib.save('m1', makeCustomMap('m1'));
    lib.save('m2', makeCustomMap('m2'));
    lib.delete('m1');
    const items = lib.list();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('m2');
  });

  // --- generateId ---
  it('generateId returns a string starting with map_', () => {
    const lib = new MapLibrary();
    const id = lib.generateId();
    expect(typeof id).toBe('string');
    expect(id.substring(0, 4)).toBe('map_');
  });

  it('generateId returns unique ids', () => {
    const lib = new MapLibrary();
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      ids.add(lib.generateId());
    }
    // With random suffix, all 20 should be unique
    expect(ids.size).toBe(20);
  });

  // --- localStorage error handling ---
  it('save returns error when localStorage throws (quota exceeded)', () => {
    const lib = new MapLibrary();
    // Override setItem to throw
    mockStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
    const result = lib.save('m1', makeCustomMap('m1'));
    expect(result.success).toBeFalse();
    expect(result.error).toBeDefined();
  });

  it('load returns null when localStorage throws', () => {
    const lib = new MapLibrary();
    mockStorage.getItem = () => { throw new Error('SecurityError'); };
    const loaded = lib.load('m1');
    expect(loaded).toBeNull();
  });

  it('list returns empty array when localStorage throws', () => {
    const lib = new MapLibrary();
    mockStorage.getItem = () => { throw new Error('SecurityError'); };
    const items = lib.list();
    expect(items.length).toBe(0);
  });

  it('delete returns error when localStorage throws', () => {
    const lib = new MapLibrary();
    // First save successfully, then break setItem for delete
    lib.save('m1', makeCustomMap('m1'));
    mockStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
    const result = lib.delete('m1');
    expect(result.success).toBeFalse();
  });
});
