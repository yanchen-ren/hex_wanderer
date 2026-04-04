/**
 * Property tests for flood fill — Properties 16-17
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';
import { EditorState } from '../../src/editor/EditorState.js';
import { EditorTools } from '../../src/editor/EditorTools.js';
import { EventBus } from '../../src/core/EventBus.js';
import { HexGrid } from '../../src/map/HexGrid.js';

const TERRAIN_TYPES = ['grass', 'desert', 'water', 'forest', 'swamp', 'lava', 'ice'];

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
  return new EditorTools(state, mapData, configs);
}

/**
 * BFS to find all tiles connected to (q,r) with the same terrain.
 */
function findConnectedRegion(map, startQ, startR) {
  const { width, height } = map.getSize();
  const startTile = map.getTile(startQ, startR);
  if (!startTile) return new Set();
  const targetTerrain = startTile.terrain;
  const visited = new Set();
  const queue = [{ q: startQ, r: startR }];
  visited.add(`${startQ},${startR}`);

  while (queue.length > 0) {
    const pos = queue.shift();
    const neighbors = HexGrid.neighbors(pos.q, pos.r);
    for (const n of neighbors) {
      const key = `${n.q},${n.r}`;
      if (visited.has(key)) continue;
      if (!HexGrid.isInBounds(n.q, n.r, width, height)) continue;
      const tile = map.getTile(n.q, n.r);
      if (tile && tile.terrain === targetTerrain) {
        visited.add(key);
        queue.push(n);
      }
    }
  }
  return visited;
}

// ── Property 16: Flood fill correctness ──
// **Validates: Requirements 14.2**
describe('Feature: map-editor, Property 16: Flood fill correctness', () => {
  it('flood fill changes connected same-terrain tiles and leaves others unchanged', () => {
    const MAP_SIZE = 8;
    const arb = fc.record({
      startQ: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      startR: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      newTerrain: fc.constantFrom(...TERRAIN_TYPES),
      // Place some random terrain patches to create regions
      patches: fc.array(
        fc.record({
          q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
          r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
          terrain: fc.constantFrom(...TERRAIN_TYPES),
        }),
        { minLength: 0, maxLength: 15 }
      ),
    });

    fc.assert(
      fc.property(arb, ({ startQ, startR, newTerrain, patches }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);

        // Apply patches to create varied terrain
        for (const p of patches) {
          const tile = map.getTile(p.q, p.r);
          if (tile) {
            map.setTile(p.q, p.r, { ...tile, terrain: p.terrain });
          }
        }

        const startTile = map.getTile(startQ, startR);
        if (!startTile) return;
        const originalTerrain = startTile.terrain;

        // If same terrain, flood fill returns empty — skip
        if (originalTerrain === newTerrain) return;

        // Find connected region BEFORE fill
        const connectedRegion = findConnectedRegion(map, startQ, startR);

        // Snapshot all tiles before fill
        const beforeSnap = new Map();
        for (const t of map.getAllTiles()) {
          beforeSnap.set(`${t.q},${t.r}`, t.terrain);
        }

        const tools = makeTools(map);
        const changes = tools.floodFill(startQ, startR, newTerrain);
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        // (a) All connected tiles should now have newTerrain
        for (const key of connectedRegion) {
          const [q, r] = key.split(',').map(Number);
          const tile = map.getTile(q, r);
          expect(tile.terrain).toBe(newTerrain);
        }

        // (b) Tiles NOT in connected region should be unchanged
        for (const t of map.getAllTiles()) {
          const key = `${t.q},${t.r}`;
          if (!connectedRegion.has(key)) {
            expect(t.terrain).toBe(beforeSnap.get(key));
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 17: Fill all correctness ──
// **Validates: Requirements 14.3**
describe('Feature: map-editor, Property 17: Fill all correctness', () => {
  it('fillAll sets every tile to the specified terrain', () => {
    const MAP_SIZE = 8;
    const arb = fc.record({
      newTerrain: fc.constantFrom(...TERRAIN_TYPES),
      patches: fc.array(
        fc.record({
          q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
          r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
          terrain: fc.constantFrom(...TERRAIN_TYPES),
        }),
        { minLength: 0, maxLength: 10 }
      ),
    });

    fc.assert(
      fc.property(arb, ({ newTerrain, patches }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);

        // Apply patches
        for (const p of patches) {
          const tile = map.getTile(p.q, p.r);
          if (tile) {
            map.setTile(p.q, p.r, { ...tile, terrain: p.terrain });
          }
        }

        const tools = makeTools(map);
        const changes = tools.fillAll(newTerrain);
        for (const c of changes) {
          map.setTile(c.q, c.r, c.after);
        }

        // Every tile should have newTerrain
        for (const t of map.getAllTiles()) {
          expect(t.terrain).toBe(newTerrain);
        }
      }),
      { numRuns: 100 }
    );
  });
});
