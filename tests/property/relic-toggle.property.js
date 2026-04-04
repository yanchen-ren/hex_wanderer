/**
 * Property test for relic toggle — Property 9
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';
import { EditorState } from '../../src/editor/EditorState.js';
import { EditorTools } from '../../src/editor/EditorTools.js';
import { EventBus } from '../../src/core/EventBus.js';

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

// ── Property 9: Relic toggle round-trip ──
// **Validates: Requirements 6.2, 6.3**
describe('Feature: map-editor, Property 9: Relic toggle round-trip', () => {
  it('toggling relic twice restores original relicPositions', () => {
    const MAP_SIZE = 15;
    const arb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
    });

    fc.assert(
      fc.property(arb, ({ q, r }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const tools = makeTools(map);

        // Snapshot initial relicPositions (should be empty)
        const initialRelics = JSON.parse(JSON.stringify(map.relicPositions));

        // Toggle once — should add
        const r1 = tools.toggleRelic(q, r);
        expect(r1.added).toBeTrue();
        expect(map.relicPositions.length).toBe(initialRelics.length + 1);

        // Toggle again — should remove
        const r2 = tools.toggleRelic(q, r);
        expect(r2.added).toBeFalse();

        // Should be back to initial state
        expect(map.relicPositions.length).toBe(initialRelics.length);
        expect(JSON.stringify(map.relicPositions)).toBe(JSON.stringify(initialRelics));
      }),
      { numRuns: 100 }
    );
  });
});
