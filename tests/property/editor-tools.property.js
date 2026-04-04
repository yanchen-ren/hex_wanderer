/**
 * Property tests for EditorTools — Properties 1-8
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';
import { EditorState } from '../../src/editor/EditorState.js';
import { EditorTools } from '../../src/editor/EditorTools.js';
import { EventBus } from '../../src/core/EventBus.js';
import { HexGrid } from '../../src/map/HexGrid.js';

const TERRAIN_TYPES = ['grass', 'desert', 'water', 'forest', 'swamp', 'lava', 'ice', 'void'];

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

function makeTools(mapData) {
  const eventBus = new EventBus();
  const state = new EditorState(eventBus);
  const configs = { building: buildingConfig, terrain: {}, event: {}, item: {} };
  const tools = new EditorTools(state, mapData, configs);
  return { tools, state };
}


// ── Property 1: Default map initialization ──
// **Validates: Requirements 1.2**
describe('Feature: map-editor, Property 1: Default map initialization', () => {
  it('every tile is grass with elevation 5, tile count = width * height', () => {
    const sizeArb = fc.constantFrom(
      { w: 25, h: 25 },
      { w: 50, h: 50 },
      { w: 75, h: 75 }
    );

    fc.assert(
      fc.property(sizeArb, ({ w, h }) => {
        const map = createDefaultMap(w, h);
        expect(map.getTileCount()).toBe(w * h);
        const allTiles = map.getAllTiles();
        for (const t of allTiles) {
          expect(t.terrain).toBe('grass');
          expect(t.elevation).toBe(5);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 2: Terrain brush painting ──
// **Validates: Requirements 2.2, 2.5**
describe('Feature: map-editor, Property 2: Terrain brush painting', () => {
  it('brush paints correct tiles and leaves others unchanged', () => {
    const MAP_SIZE = 15;
    const arb = fc.record({
      terrain: fc.constantFrom(...TERRAIN_TYPES),
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      brushSize: fc.constantFrom(1, 2, 3),
    });

    fc.assert(
      fc.property(arb, ({ terrain, q, r, brushSize }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const { tools, state } = makeTools(map);
        state.selectedTerrain = terrain;
        state.brushSize = brushSize;

        // Snapshot before
        const beforeMap = new Map();
        for (const t of map.getAllTiles()) {
          beforeMap.set(`${t.q},${t.r}`, t.terrain);
        }

        const changes = tools.paintTerrain(q, r);
        // Apply changes
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        // Brush tiles should have the new terrain
        const radius = brushSize - 1;
        const brushTiles = HexGrid.hexesInRange(q, r, radius)
          .filter(h => HexGrid.isInBounds(h.q, h.r, MAP_SIZE, MAP_SIZE));

        for (const bt of brushTiles) {
          const tile = map.getTile(bt.q, bt.r);
          expect(tile.terrain).toBe(terrain);
        }

        // Tiles outside brush should be unchanged
        const brushSet = new Set(brushTiles.map(h => `${h.q},${h.r}`));
        for (const t of map.getAllTiles()) {
          const key = `${t.q},${t.r}`;
          if (!brushSet.has(key)) {
            expect(t.terrain).toBe(beforeMap.get(key));
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: Elevation clamp ──
// **Validates: Requirements 3.2, 3.3**
describe('Feature: map-editor, Property 3: Elevation adjustment and clamping', () => {
  it('adjustElevation clamps to [0, 10]', () => {
    const MAP_SIZE = 10;
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      initElev: fc.integer({ min: 0, max: 10 }),
      delta: fc.constantFrom(1, -1),
    });

    fc.assert(
      fc.property(arb, ({ q, r, initElev, delta }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        map.setTile(q, r, { terrain: 'grass', elevation: initElev, building: null, event: null, fogState: 'unexplored' });
        const { tools, state } = makeTools(map);
        state.brushSize = 1;

        const changes = tools.adjustElevation(q, r, delta);
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        const tile = map.getTile(q, r);
        const expected = Math.max(0, Math.min(10, initElev + delta));
        expect(tile.elevation).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('setElevation sets exact value clamped to [0, 10]', () => {
    const MAP_SIZE = 10;
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      value: fc.integer({ min: -5, max: 15 }),
    });

    fc.assert(
      fc.property(arb, ({ q, r, value }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const { tools, state } = makeTools(map);
        state.brushSize = 1;

        const changes = tools.setElevation(q, r, value);
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        const tile = map.getTile(q, r);
        const expected = Math.max(0, Math.min(10, value));
        expect(tile.elevation).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});


// ── Property 4: Building placement and replacement ──
// **Validates: Requirements 4.2, 4.3**
describe('Feature: map-editor, Property 4: Building placement and replacement', () => {
  it('placing a building on allowed terrain sets the building property', () => {
    const MAP_SIZE = 10;
    // Generate building + terrain combos that are allowed
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      buildingId: fc.constantFrom('portal', 'teleporter', 'camp', 'farm'),
    }).chain(({ q, r, buildingId }) => {
      const allowed = buildingConfig.buildingTypes[buildingId].allowedTerrains;
      return fc.record({
        q: fc.constant(q),
        r: fc.constant(r),
        buildingId: fc.constant(buildingId),
        terrain: fc.constantFrom(...allowed),
        existingBuilding: fc.constantFrom(null, 'camp', 'farm'),
      });
    });

    fc.assert(
      fc.property(arb, ({ q, r, buildingId, terrain, existingBuilding }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        map.setTile(q, r, { terrain, elevation: 5, building: existingBuilding, event: null, fogState: 'unexplored' });
        const { tools } = makeTools(map);

        const result = tools.placeBuilding(q, r, buildingId);
        for (const c of result.changes) {
          map.setTile(c.q, c.r, c.after);
        }

        const tile = map.getTile(q, r);
        expect(tile.building).toBe(buildingId);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Portal position invariant ──
// **Validates: Requirements 4.5**
describe('Feature: map-editor, Property 5: Portal position invariant', () => {
  it('portalPosition matches the single portal tile on the map', () => {
    const MAP_SIZE = 10;
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      placePortal: fc.boolean(),
    });

    fc.assert(
      fc.property(arb, ({ q, r, placePortal }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const { tools } = makeTools(map);

        if (placePortal) {
          const result = tools.placeBuilding(q, r, 'portal');
          for (const c of result.changes) {
            map.setTile(c.q, c.r, c.after);
          }
          // portalPosition should match
          expect(map.portalPosition.q).toBe(q);
          expect(map.portalPosition.r).toBe(r);
        } else {
          // No portal placed, portalPosition should be null
          expect(map.portalPosition).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 6: Teleporter pairing invariant ──
// **Validates: Requirements 4.6**
describe('Feature: map-editor, Property 6: Teleporter pairing invariant', () => {
  it('each teleportPair references actual teleporter buildings', () => {
    const MAP_SIZE = 10;
    // Place 2-4 teleporters on grass tiles
    const arb = fc.array(
      fc.record({
        q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
        r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      }),
      { minLength: 2, maxLength: 4 }
    );

    fc.assert(
      fc.property(arb, (positions) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const { tools } = makeTools(map);

        // Deduplicate positions
        const seen = new Set();
        const unique = [];
        for (const p of positions) {
          const key = `${p.q},${p.r}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
          }
        }

        for (const p of unique) {
          const result = tools.placeBuilding(p.q, p.r, 'teleporter');
          for (const c of result.changes) {
            map.setTile(c.q, c.r, c.after);
          }
        }

        // Every pair should reference actual teleporter tiles
        for (const pair of map.teleportPairs) {
          const t0 = map.getTile(pair[0].q, pair[0].r);
          const t1 = map.getTile(pair[1].q, pair[1].r);
          expect(t0.building).toBe('teleporter');
          expect(t1.building).toBe('teleporter');
        }

        // Each teleporter in a pair should appear exactly once across all pairs
        const pairedKeys = new Set();
        for (const pair of map.teleportPairs) {
          pairedKeys.add(`${pair[0].q},${pair[0].r}`);
          pairedKeys.add(`${pair[1].q},${pair[1].r}`);
        }
        // pairedKeys size should be 2 * number of pairs
        expect(pairedKeys.size).toBe(map.teleportPairs.length * 2);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Building terrain constraint ──
// **Validates: Requirements 4.7**
describe('Feature: map-editor, Property 7: Building terrain constraint rejection', () => {
  it('placing a building on disallowed terrain is rejected', () => {
    const MAP_SIZE = 10;
    // Generate building + terrain combos that are NOT allowed
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      buildingId: fc.constantFrom('portal', 'teleporter', 'camp', 'farm'),
    }).chain(({ q, r, buildingId }) => {
      const allowed = buildingConfig.buildingTypes[buildingId].allowedTerrains;
      const disallowed = TERRAIN_TYPES.filter(t => !allowed.includes(t));
      if (disallowed.length === 0) {
        // portal allows almost everything, use void
        return fc.record({
          q: fc.constant(q),
          r: fc.constant(r),
          buildingId: fc.constant(buildingId),
          terrain: fc.constant('void'),
        });
      }
      return fc.record({
        q: fc.constant(q),
        r: fc.constant(r),
        buildingId: fc.constant(buildingId),
        terrain: fc.constantFrom(...disallowed),
      });
    });

    fc.assert(
      fc.property(arb, ({ q, r, buildingId, terrain }) => {
        const MAP_SIZE2 = 10;
        const map = createDefaultMap(MAP_SIZE2, MAP_SIZE2);
        map.setTile(q, r, { terrain, elevation: 5, building: null, event: null, fogState: 'unexplored' });
        const { tools } = makeTools(map);

        const result = tools.placeBuilding(q, r, buildingId);
        // Should be rejected — no changes
        expect(result.changes.length).toBe(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        // Tile building should remain null
        const tile = map.getTile(q, r);
        expect(tile.building).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Event placement ──
// **Validates: Requirements 5.2**
describe('Feature: map-editor, Property 8: Event placement', () => {
  it('placing an event sets the tile event property', () => {
    const MAP_SIZE = 10;
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      eventId: fc.constantFrom('camp_rest_event', 'ruin_explore', 'cave_explore', 'monster_camp_battle'),
    });

    fc.assert(
      fc.property(arb, ({ q, r, eventId }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const { tools } = makeTools(map);

        const changes = tools.placeEvent(q, r, eventId);
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        const tile = map.getTile(q, r);
        expect(tile.event).toBe(eventId);
      }),
      { numRuns: 100 }
    );
  });
});
