/**
 * CommandHistory 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { CommandHistory, TileEditCommand } from '../../src/editor/CommandHistory.js';
import { MapData } from '../../src/map/MapData.js';

/**
 * Helper: create a simple command that tracks execute/undo calls
 */
function makeCommand(id, log) {
  return {
    id,
    execute() { log.push(`exec:${id}`); },
    undo() { log.push(`undo:${id}`); },
  };
}

describe('CommandHistory', () => {
  it('starts with empty stacks', () => {
    const h = new CommandHistory();
    expect(h.canUndo()).toBeFalse();
    expect(h.canRedo()).toBeFalse();
  });

  it('execute() calls command.execute and enables undo', () => {
    const log = [];
    const h = new CommandHistory();
    const cmd = makeCommand('a', log);
    h.execute(cmd);
    expect(log).toEqual(['exec:a']);
    expect(h.canUndo()).toBeTrue();
    expect(h.canRedo()).toBeFalse();
  });

  it('undo() calls command.undo and enables redo', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    const undone = h.undo();
    expect(undone.id).toBe('a');
    expect(log).toEqual(['exec:a', 'undo:a']);
    expect(h.canUndo()).toBeFalse();
    expect(h.canRedo()).toBeTrue();
  });

  it('redo() calls command.execute and moves back to undo stack', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    h.undo();
    const redone = h.redo();
    expect(redone.id).toBe('a');
    expect(log).toEqual(['exec:a', 'undo:a', 'exec:a']);
    expect(h.canUndo()).toBeTrue();
    expect(h.canRedo()).toBeFalse();
  });

  it('undo() returns null when stack is empty', () => {
    const h = new CommandHistory();
    const result = h.undo();
    expect(result).toBeNull();
  });

  it('redo() returns null when stack is empty', () => {
    const h = new CommandHistory();
    const result = h.redo();
    expect(result).toBeNull();
  });

  it('new execute clears redo stack', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    h.execute(makeCommand('b', log));
    h.undo(); // undo b
    expect(h.canRedo()).toBeTrue();
    h.execute(makeCommand('c', log));
    expect(h.canRedo()).toBeFalse();
  });

  it('respects maxSize and removes oldest entry', () => {
    const log = [];
    const h = new CommandHistory(3);
    h.execute(makeCommand('1', log));
    h.execute(makeCommand('2', log));
    h.execute(makeCommand('3', log));
    h.execute(makeCommand('4', log)); // should evict '1'

    // We should be able to undo 3 times (4, 3, 2) but not a 4th
    expect(h.undo().id).toBe('4');
    expect(h.undo().id).toBe('3');
    expect(h.undo().id).toBe('2');
    expect(h.undo()).toBeNull();
  });

  it('default maxSize is 50', () => {
    const log = [];
    const h = new CommandHistory();
    for (let i = 0; i < 55; i++) {
      h.execute(makeCommand(`cmd${i}`, log));
    }
    // Should only be able to undo 50 times
    let undoCount = 0;
    while (h.canUndo()) {
      h.undo();
      undoCount++;
    }
    expect(undoCount).toBe(50);
  });

  it('clear() empties both stacks', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    h.execute(makeCommand('b', log));
    h.undo();
    expect(h.canUndo()).toBeTrue();
    expect(h.canRedo()).toBeTrue();
    h.clear();
    expect(h.canUndo()).toBeFalse();
    expect(h.canRedo()).toBeFalse();
  });

  it('multiple undo/redo cycles work correctly', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    h.execute(makeCommand('b', log));

    h.undo(); // undo b
    h.undo(); // undo a
    h.redo(); // redo a
    h.redo(); // redo b

    expect(log).toEqual([
      'exec:a', 'exec:b',
      'undo:b', 'undo:a',
      'exec:a', 'exec:b',
    ]);
    expect(h.canUndo()).toBeTrue();
    expect(h.canRedo()).toBeFalse();
  });

  it('undo after redo after new execute has correct state', () => {
    const log = [];
    const h = new CommandHistory();
    h.execute(makeCommand('a', log));
    h.execute(makeCommand('b', log));
    h.undo(); // undo b → redo has b
    h.execute(makeCommand('c', log)); // clears redo
    expect(h.canRedo()).toBeFalse();

    h.undo(); // undo c
    expect(h.canRedo()).toBeTrue();
    h.undo(); // undo a
    expect(h.canUndo()).toBeFalse();
  });
});


describe('TileEditCommand', () => {
  /**
   * Helper: create a small MapData with a few tiles
   */
  function makeMap() {
    const map = new MapData(3, 3);
    for (let q = 0; q < 3; q++) {
      for (let r = 0; r < 3; r++) {
        map.setTile(q, r, { terrain: 'grass', elevation: 5, building: null, event: null });
      }
    }
    return map;
  }

  it('execute() applies after state to mapData', () => {
    const map = makeMap();
    const changes = [
      { q: 0, r: 0, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'desert', elevation: 3, building: null, event: null } },
      { q: 1, r: 1, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'water', elevation: 0, building: null, event: null } },
    ];
    const cmd = new TileEditCommand(map, changes);
    cmd.execute();

    expect(map.getTile(0, 0).terrain).toBe('desert');
    expect(map.getTile(0, 0).elevation).toBe(3);
    expect(map.getTile(1, 1).terrain).toBe('water');
    expect(map.getTile(1, 1).elevation).toBe(0);
    // Unaffected tile
    expect(map.getTile(2, 2).terrain).toBe('grass');
  });

  it('undo() restores before state to mapData', () => {
    const map = makeMap();
    const changes = [
      { q: 0, r: 0, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'lava', elevation: 8, building: null, event: null } },
    ];
    const cmd = new TileEditCommand(map, changes);
    cmd.execute();
    expect(map.getTile(0, 0).terrain).toBe('lava');

    cmd.undo();
    expect(map.getTile(0, 0).terrain).toBe('grass');
    expect(map.getTile(0, 0).elevation).toBe(5);
  });

  it('handles multiple changes in a single command', () => {
    const map = makeMap();
    const changes = [
      { q: 0, r: 0, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'forest', elevation: 7, building: 'camp', event: null } },
      { q: 1, r: 0, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'desert', elevation: 2, building: null, event: 'combat_wolf' } },
      { q: 2, r: 0, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'ice', elevation: 10, building: 'portal', event: null } },
    ];
    const cmd = new TileEditCommand(map, changes);
    cmd.execute();

    expect(map.getTile(0, 0).building).toBe('camp');
    expect(map.getTile(1, 0).event).toBe('combat_wolf');
    expect(map.getTile(2, 0).terrain).toBe('ice');

    cmd.undo();
    expect(map.getTile(0, 0).terrain).toBe('grass');
    expect(map.getTile(1, 0).event).toBeNull();
    expect(map.getTile(2, 0).elevation).toBe(5);
  });

  it('works with CommandHistory execute/undo/redo', () => {
    const map = makeMap();
    const history = new CommandHistory();
    const changes = [
      { q: 1, r: 1, before: { terrain: 'grass', elevation: 5, building: null, event: null }, after: { terrain: 'swamp', elevation: 1, building: null, event: null } },
    ];
    const cmd = new TileEditCommand(map, changes);
    history.execute(cmd);
    expect(map.getTile(1, 1).terrain).toBe('swamp');

    history.undo();
    expect(map.getTile(1, 1).terrain).toBe('grass');

    history.redo();
    expect(map.getTile(1, 1).terrain).toBe('swamp');
  });

  it('handles empty changes array gracefully', () => {
    const map = makeMap();
    const cmd = new TileEditCommand(map, []);
    cmd.execute(); // should not throw
    cmd.undo();    // should not throw
    expect(map.getTile(0, 0).terrain).toBe('grass');
  });
});
