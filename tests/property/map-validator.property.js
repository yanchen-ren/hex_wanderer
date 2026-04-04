/**
 * Property test for MapValidator — Property 15
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';
import { MapValidator } from '../../src/editor/MapValidator.js';

const buildingConfig = {
  buildingTypes: {
    portal: { name: 'Portal', allowedTerrains: ['grass', 'desert', 'forest', 'swamp', 'water', 'ice', 'lava'] },
    teleporter: { name: 'Teleporter', allowedTerrains: ['grass', 'desert', 'forest'] },
    camp: { name: 'Camp', allowedTerrains: ['grass', 'forest', 'desert'] },
    farm: { name: 'Farm', allowedTerrains: ['grass'] },
  }
};

function createDefaultMap(width, height) {
  const map = new MapData(width, height);
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      map.setTile(q, r, { terrain: 'grass', elevation: 5, building: null, event: null, fogState: 'unexplored' });
    }
  }
  return map;
}

const configs = { building: buildingConfig, terrain: {}, event: {}, item: {} };

// ── Property 15: Map validation correctness ──
// **Validates: Requirements 6.5, 13.2**
describe('Feature: map-editor, Property 15: Map validation correctness', () => {
  it('(a) no portal → reports no_portal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }),
        (size) => {
          const map = createDefaultMap(size, size);
          // No portal placed
          const validator = new MapValidator(configs);
          const result = validator.validate(map);
          const hasNoPortal = result.issues.some(i => i.type === 'no_portal');
          expect(hasNoPortal).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(b) insufficient relics → reports insufficient_relics', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.integer({ min: 5, max: 15 }),
          relicsNeeded: fc.integer({ min: 2, max: 5 }),
          relicCount: fc.integer({ min: 0, max: 1 }),
        }),
        ({ size, relicsNeeded, relicCount }) => {
          if (relicCount >= relicsNeeded) return; // skip non-applicable
          const map = createDefaultMap(size, size);
          map.relicsNeeded = relicsNeeded;
          map.relicPositions = [];
          for (let i = 0; i < relicCount; i++) {
            map.relicPositions.push({ q: i, r: 0 });
          }
          const validator = new MapValidator(configs);
          const result = validator.validate(map);
          const hasInsufficient = result.issues.some(i => i.type === 'insufficient_relics');
          expect(hasInsufficient).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(c) unreachable non-void tiles → reports unreachable_tiles', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 12 }),
        (size) => {
          const map = createDefaultMap(size, size);
          // Create a void wall across the middle to isolate some tiles
          const midR = Math.floor(size / 2);
          for (let q = 0; q < size; q++) {
            map.setTile(q, midR, { terrain: 'void', elevation: 5, building: null, event: null, fogState: 'unexplored' });
          }
          const validator = new MapValidator(configs);
          const result = validator.validate(map);
          const hasUnreachable = result.issues.some(i => i.type === 'unreachable_tiles');
          expect(hasUnreachable).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(d) building on wrong terrain → reports invalid_building_terrain', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.integer({ min: 5, max: 10 }),
          q: fc.integer({ min: 0, max: 4 }),
          r: fc.integer({ min: 0, max: 4 }),
        }),
        ({ size, q, r }) => {
          const map = createDefaultMap(size, size);
          // Place farm on water (farm only allowed on grass)
          map.setTile(q, r, { terrain: 'water', elevation: 5, building: 'farm', event: null, fogState: 'unexplored' });
          const validator = new MapValidator(configs);
          const result = validator.validate(map);
          const hasInvalid = result.issues.some(i => i.type === 'invalid_building_terrain');
          expect(hasInvalid).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(e) odd teleporter count → reports unpaired_teleporter', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.integer({ min: 5, max: 10 }),
          count: fc.constantFrom(1, 3),
        }),
        ({ size, count }) => {
          const map = createDefaultMap(size, size);
          // Place odd number of teleporters on grass
          for (let i = 0; i < count && i < size; i++) {
            map.setTile(i, 0, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null, fogState: 'unexplored' });
          }
          const validator = new MapValidator(configs);
          const result = validator.validate(map);
          const hasUnpaired = result.issues.some(i => i.type === 'unpaired_teleporter');
          expect(hasUnpaired).toBeTrue();
        }
      ),
      { numRuns: 100 }
    );
  });
});
