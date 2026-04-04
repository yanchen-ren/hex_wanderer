/**
 * Property tests for CommandHistory — Properties 10-11
 * Uses fast-check (global `fc`) and the project test-runner.
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';
import { CommandHistory, TileEditCommand } from '../../src/editor/CommandHistory.js';

function createDefaultMap(width, height) {
  const map = new MapData(width, height);
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      map.setTile(q, r, { terrain: 'grass', elevation: 5, building: null, event: null, fogState: 'unexplored' });
    }
  }
  return map;
}

const TERRAIN_TYPES = ['grass', 'desert', 'water', 'forest', 'swamp', 'lava', 'ice'];

function snapshotMap(map) {
  const snap = {};
  for (const t of map.getAllTiles()) {
    snap[`${t.q},${t.r}`] = { terrain: t.terrain, elevation: t.elevation, building: t.building, event: t.event };
  }
  return snap;
}

function mapsEqual(snap1, snap2) {
  const keys1 = Object.keys(snap1);
  const keys2 = Object.keys(snap2);
  if (keys1.length !== keys2.length) return false;
  for (const k of keys1) {
    const a = snap1[k], b = snap2[k];
    if (!b) return false;
    if (a.terrain !== b.terrain || a.elevation !== b.elevation ||
        a.building !== b.building || a.event !== b.event) return false;
  }
  return true;
}

// ── Property 10: Undo/redo round-trip ──
// **Validates: Requirements 8.1, 8.2, 8.3**
describe('Feature: map-editor, Property 10: Undo/redo round-trip', () => {
  it('undoing all operations restores initial state; redoing restores final state', () => {
    const MAP_SIZE = 5;
    // Generate a sequence of terrain edit operations
    const opArb = fc.record({
      q: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      terrain: fc.constantFrom(...TERRAIN_TYPES),
    });
    const opsArb = fc.array(opArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(opsArb, (ops) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const history = new CommandHistory(50);

        const initialSnap = snapshotMap(map);

        // Execute all operations
        for (const op of ops) {
          const tile = map.getTile(op.q, op.r);
          if (!tile) continue;
          const before = { terrain: tile.terrain, elevation: tile.elevation, building: tile.building, event: tile.event };
          const after = { ...before, terrain: op.terrain };
          const cmd = new TileEditCommand(map, [{ q: op.q, r: op.r, before, after }]);
          history.execute(cmd);
        }

        const finalSnap = snapshotMap(map);

        // Undo all
        while (history.canUndo()) {
          history.undo();
        }
        const afterUndoSnap = snapshotMap(map);
        expect(mapsEqual(afterUndoSnap, initialSnap)).toBeTrue();

        // Redo all
        while (history.canRedo()) {
          history.redo();
        }
        const afterRedoSnap = snapshotMap(map);
        expect(mapsEqual(afterRedoSnap, finalSnap)).toBeTrue();
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 11: New edit clears redo stack ──
// **Validates: Requirements 8.5**
describe('Feature: map-editor, Property 11: New edit clears redo stack', () => {
  it('after undo then new edit, canRedo returns false', () => {
    const MAP_SIZE = 5;
    const arb = fc.record({
      q1: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r1: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      t1: fc.constantFrom(...TERRAIN_TYPES),
      q2: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      r2: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
      t2: fc.constantFrom(...TERRAIN_TYPES),
    });

    fc.assert(
      fc.property(arb, ({ q1, r1, t1, q2, r2, t2 }) => {
        const map = createDefaultMap(MAP_SIZE, MAP_SIZE);
        const history = new CommandHistory(50);

        // First edit
        const tile1 = map.getTile(q1, r1);
        const before1 = { terrain: tile1.terrain, elevation: tile1.elevation, building: tile1.building, event: tile1.event };
        const after1 = { ...before1, terrain: t1 };
        history.execute(new TileEditCommand(map, [{ q: q1, r: r1, before: before1, after: after1 }]));

        // Undo
        history.undo();
        expect(history.canRedo()).toBeTrue();

        // New edit
        const tile2 = map.getTile(q2, r2);
        const before2 = { terrain: tile2.terrain, elevation: tile2.elevation, building: tile2.building, event: tile2.event };
        const after2 = { ...before2, terrain: t2 };
        history.execute(new TileEditCommand(map, [{ q: q2, r: r2, before: before2, after: after2 }]));

        // Redo stack should be cleared
        expect(history.canRedo()).toBeFalse();
      }),
      { numRuns: 100 }
    );
  });
});
