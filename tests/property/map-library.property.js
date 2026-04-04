/**
 * Property test for MapLibrary — Property 14
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapLibrary } from '../../src/editor/MapLibrary.js';

// ── Property 14: Map library save/load round-trip ──
// **Validates: Requirements 10.4, 10.5**
describe('Feature: map-editor, Property 14: Map library save/load round-trip', () => {
  it('saving then loading produces equivalent map data; deleting removes it', () => {
    // Use a unique storage key per test run to avoid collisions
    const testKey = `test_map_lib_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const arb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      author: fc.string({ minLength: 0, maxLength: 20 }),
      description: fc.string({ minLength: 0, maxLength: 50 }),
      width: fc.integer({ min: 5, max: 30 }),
      height: fc.integer({ min: 5, max: 30 }),
    });

    fc.assert(
      fc.property(arb, ({ name, author, description, width, height }) => {
        const lib = new MapLibrary(testKey);

        // Build a minimal mapJSON
        const tiles = {};
        for (let r = 0; r < height; r++) {
          for (let q = 0; q < width; q++) {
            tiles[`${q},${r}`] = { terrain: 'grass', elevation: 5, building: null, event: null, fogState: 'unexplored' };
          }
        }
        const mapJSON = { width, height, tiles, relicPositions: [], relicsNeeded: 3, portalPosition: null, teleportPairs: [] };

        const id = lib.generateId();
        const customMap = {
          id,
          meta: { name, author, description, createdAt: Date.now(), updatedAt: Date.now(), size: `${width}x${height}` },
          mapJSON,
        };

        // Save
        const saveResult = lib.save(id, customMap);
        expect(saveResult.success).toBeTrue();

        // Load
        const loaded = lib.load(id);
        expect(loaded).toBeDefined();
        expect(loaded.id).toBe(id);
        expect(loaded.meta.name).toBe(name);
        expect(loaded.mapJSON.width).toBe(width);
        expect(loaded.mapJSON.height).toBe(height);
        expect(Object.keys(loaded.mapJSON.tiles).length).toBe(width * height);

        // List should contain it
        const list = lib.list();
        const found = list.some(entry => entry.id === id);
        expect(found).toBeTrue();

        // Delete
        lib.delete(id);
        const afterDelete = lib.load(id);
        expect(afterDelete).toBeNull();

        // Clean up
        localStorage.removeItem(testKey);
      }),
      { numRuns: 100 }
    );
  });
});
