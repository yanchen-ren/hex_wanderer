/**
 * EditorTools 单元测试
 */
import { describe, it, expect, beforeEach } from '../test-runner.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EditorState } from '../../src/editor/EditorState.js';
import { EditorTools } from '../../src/editor/EditorTools.js';
import { MapData } from '../../src/map/MapData.js';

/** Minimal building config for tests */
const buildingConfig = {
  buildingTypes: {
    portal: { name: 'Portal', allowedTerrains: ['grass', 'desert', 'forest', 'swamp', 'water', 'ice', 'lava'] },
    teleporter: { name: 'Teleporter', allowedTerrains: ['grass', 'desert', 'forest'] },
    camp: { name: 'Camp', allowedTerrains: ['grass', 'forest', 'desert'] },
    farm: { name: 'Farm', allowedTerrains: ['grass'] },
    whirlpool: { name: 'Whirlpool', allowedTerrains: ['water'] },
  }
};

const configs = { terrain: {}, building: buildingConfig, event: {}, item: {} };

/** Create a small 5x5 map with all grass terrain at elevation 5 */
function createTestMap(width = 5, height = 5) {
  const map = new MapData(width, height);
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      map.setTile(q, r, { terrain: 'grass', elevation: 5, building: null, event: null });
    }
  }
  return map;
}

function createTools(mapData) {
  const bus = new EventBus();
  const state = new EditorState(bus);
  return new EditorTools(state, mapData || createTestMap(), configs);
}

describe('EditorTools — getBrushTiles', () => {
  it('brushSize 1 returns single tile', () => {
    const tools = createTools();
    const tiles = tools.getBrushTiles(2, 2, 1);
    expect(tiles.length).toBe(1);
    expect(tiles[0].q).toBe(2);
    expect(tiles[0].r).toBe(2);
  });

  it('brushSize 2 returns up to 7 tiles', () => {
    const tools = createTools();
    const tiles = tools.getBrushTiles(2, 2, 2);
    expect(tiles.length).toBe(7);
  });

  it('brushSize 3 returns up to 19 tiles at center of large map', () => {
    const map = createTestMap(10, 10);
    const tools = createTools(map);
    const tiles = tools.getBrushTiles(5, 5, 3);
    expect(tiles.length).toBe(19);
  });

  it('filters out-of-bounds tiles at corner', () => {
    const tools = createTools();
    const tiles = tools.getBrushTiles(0, 0, 2);
    // At corner (0,0) with radius 1, some neighbors are out of bounds
    for (const t of tiles) {
      expect(t.q >= 0).toBeTrue();
      expect(t.r >= 0).toBeTrue();
    }
  });
});

describe('EditorTools — paintTerrain', () => {
  it('paints single tile with brushSize 1', () => {
    const tools = createTools();
    tools.editorState.selectedTerrain = 'desert';
    tools.editorState.brushSize = 1;
    const changes = tools.paintTerrain(2, 2);
    expect(changes.length).toBe(1);
    expect(changes[0].before.terrain).toBe('grass');
    expect(changes[0].after.terrain).toBe('desert');
  });

  it('returns empty changes when terrain is same', () => {
    const tools = createTools();
    tools.editorState.selectedTerrain = 'grass';
    const changes = tools.paintTerrain(2, 2);
    expect(changes.length).toBe(0);
  });

  it('paints multiple tiles with brushSize 2', () => {
    const tools = createTools();
    tools.editorState.selectedTerrain = 'water';
    tools.editorState.brushSize = 2;
    const changes = tools.paintTerrain(2, 2);
    expect(changes.length).toBe(7);
    for (const c of changes) {
      expect(c.after.terrain).toBe('water');
    }
  });
});

describe('EditorTools — adjustElevation', () => {
  it('increases elevation by 1', () => {
    const tools = createTools();
    const changes = tools.adjustElevation(2, 2, 1);
    expect(changes.length).toBe(1);
    expect(changes[0].before.elevation).toBe(5);
    expect(changes[0].after.elevation).toBe(6);
  });

  it('decreases elevation by 1', () => {
    const tools = createTools();
    const changes = tools.adjustElevation(2, 2, -1);
    expect(changes.length).toBe(1);
    expect(changes[0].after.elevation).toBe(4);
  });

  it('clamps elevation at 10', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 10, building: null, event: null });
    const tools = createTools(map);
    const changes = tools.adjustElevation(2, 2, 1);
    expect(changes.length).toBe(0);
  });

  it('clamps elevation at 0', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 0, building: null, event: null });
    const tools = createTools(map);
    const changes = tools.adjustElevation(2, 2, -1);
    expect(changes.length).toBe(0);
  });
});

describe('EditorTools — setElevation', () => {
  it('sets elevation to exact value', () => {
    const tools = createTools();
    const changes = tools.setElevation(2, 2, 8);
    expect(changes.length).toBe(1);
    expect(changes[0].after.elevation).toBe(8);
  });

  it('clamps value above 10', () => {
    const tools = createTools();
    const changes = tools.setElevation(2, 2, 15);
    expect(changes.length).toBe(1);
    expect(changes[0].after.elevation).toBe(10);
  });

  it('clamps value below 0', () => {
    const tools = createTools();
    const changes = tools.setElevation(2, 2, -3);
    expect(changes.length).toBe(1);
    expect(changes[0].after.elevation).toBe(0);
  });

  it('returns empty when value is same', () => {
    const tools = createTools();
    const changes = tools.setElevation(2, 2, 5);
    expect(changes.length).toBe(0);
  });
});

describe('EditorTools — placeBuilding', () => {
  it('places building on allowed terrain', () => {
    const tools = createTools();
    const result = tools.placeBuilding(2, 2, 'camp');
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].after.building).toBe('camp');
    expect(result.warnings.length).toBe(0);
  });

  it('rejects building on disallowed terrain', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'water', elevation: 5, building: null, event: null });
    const tools = createTools(map);
    const result = tools.placeBuilding(2, 2, 'farm');
    expect(result.changes.length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });

  it('replaces existing building', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: 'camp', event: null });
    const tools = createTools(map);
    const result = tools.placeBuilding(2, 2, 'farm');
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].before.building).toBe('camp');
    expect(result.changes[0].after.building).toBe('farm');
  });

  it('portal placement updates portalPosition', () => {
    const map = createTestMap();
    const tools = createTools(map);
    tools.placeBuilding(3, 3, 'portal');
    expect(map.portalPosition).toEqual({ q: 3, r: 3 });
  });

  it('unknown building returns warning', () => {
    const tools = createTools();
    const result = tools.placeBuilding(2, 2, 'nonexistent');
    expect(result.changes.length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });
});

describe('EditorTools — eraseBuilding', () => {
  it('erases building from tile', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: 'camp', event: null });
    const tools = createTools(map);
    const changes = tools.eraseBuilding(2, 2);
    expect(changes.length).toBe(1);
    expect(changes[0].before.building).toBe('camp');
    expect(changes[0].after.building).toBeNull();
  });

  it('returns empty for tile without building', () => {
    const tools = createTools();
    const changes = tools.eraseBuilding(2, 2);
    expect(changes.length).toBe(0);
  });

  it('portal erase clears portalPosition', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: 'portal', event: null });
    map.portalPosition = { q: 2, r: 2 };
    const tools = createTools(map);
    tools.eraseBuilding(2, 2);
    expect(map.portalPosition).toBeNull();
  });
});

describe('EditorTools — teleporter pairing', () => {
  it('first teleporter is unpaired', () => {
    const map = createTestMap();
    const tools = createTools(map);
    tools.placeBuilding(1, 1, 'teleporter');
    // Apply the change to the map so the tile has the building
    map.setTile(1, 1, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    expect(map.teleportPairs.length).toBe(0);
  });

  it('second teleporter pairs with first', () => {
    const map = createTestMap();
    const tools = createTools(map);
    // Place first teleporter and apply
    tools.placeBuilding(1, 1, 'teleporter');
    map.setTile(1, 1, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    // Place second teleporter
    tools.placeBuilding(3, 3, 'teleporter');
    map.setTile(3, 3, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    expect(map.teleportPairs.length).toBe(1);
    expect(map.teleportPairs[0][0]).toEqual({ q: 1, r: 1 });
    expect(map.teleportPairs[0][1]).toEqual({ q: 3, r: 3 });
  });

  it('erasing paired teleporter removes the pair', () => {
    const map = createTestMap();
    const tools = createTools(map);
    tools.placeBuilding(1, 1, 'teleporter');
    map.setTile(1, 1, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    tools.placeBuilding(3, 3, 'teleporter');
    map.setTile(3, 3, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    expect(map.teleportPairs.length).toBe(1);
    tools.eraseBuilding(1, 1);
    expect(map.teleportPairs.length).toBe(0);
  });
});

describe('EditorTools — placeEvent / eraseEvent', () => {
  it('places event on tile', () => {
    const tools = createTools();
    const changes = tools.placeEvent(2, 2, 'wolf_attack');
    expect(changes.length).toBe(1);
    expect(changes[0].after.event).toBe('wolf_attack');
  });

  it('returns empty when same event already placed', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: null, event: 'wolf_attack' });
    const tools = createTools(map);
    const changes = tools.placeEvent(2, 2, 'wolf_attack');
    expect(changes.length).toBe(0);
  });

  it('erases event from tile', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: null, event: 'wolf_attack' });
    const tools = createTools(map);
    const changes = tools.eraseEvent(2, 2);
    expect(changes.length).toBe(1);
    expect(changes[0].after.event).toBeNull();
  });

  it('eraseEvent returns empty for tile without event', () => {
    const tools = createTools();
    const changes = tools.eraseEvent(2, 2);
    expect(changes.length).toBe(0);
  });
});

describe('EditorTools — toggleRelic', () => {
  it('adds relic position', () => {
    const map = createTestMap();
    const tools = createTools(map);
    const result = tools.toggleRelic(2, 2);
    expect(result.added).toBeTrue();
    expect(map.relicPositions.length).toBe(1);
  });

  it('removes relic position on second toggle', () => {
    const map = createTestMap();
    const tools = createTools(map);
    tools.toggleRelic(2, 2);
    const result = tools.toggleRelic(2, 2);
    expect(result.added).toBeFalse();
    expect(map.relicPositions.length).toBe(0);
  });

  it('double toggle is identity', () => {
    const map = createTestMap();
    const tools = createTools(map);
    tools.toggleRelic(2, 2);
    tools.toggleRelic(2, 2);
    expect(map.relicPositions.length).toBe(0);
  });
});

describe('EditorTools — floodFill', () => {
  it('fills connected same-terrain tiles', () => {
    const map = createTestMap();
    // All grass, fill from center with desert
    const tools = createTools(map);
    const changes = tools.floodFill(2, 2, 'desert');
    // All 25 tiles are grass and connected, so all should change
    expect(changes.length).toBe(25);
    for (const c of changes) {
      expect(c.after.terrain).toBe('desert');
    }
  });

  it('does not fill across different terrain', () => {
    const map = createTestMap();
    // Create a water barrier
    map.setTile(1, 2, { terrain: 'water', elevation: 5, building: null, event: null });
    map.setTile(2, 1, { terrain: 'water', elevation: 5, building: null, event: null });
    map.setTile(1, 1, { terrain: 'water', elevation: 5, building: null, event: null });
    const tools = createTools(map);
    // Fill from (0,0) which is grass
    const changes = tools.floodFill(0, 0, 'desert');
    // Should not fill the water tiles or tiles beyond the barrier
    for (const c of changes) {
      expect(c.before.terrain).toBe('grass');
      expect(c.after.terrain).toBe('desert');
    }
  });

  it('returns empty when target terrain is same as source', () => {
    const tools = createTools();
    const changes = tools.floodFill(2, 2, 'grass');
    expect(changes.length).toBe(0);
  });
});

describe('EditorTools — fillAll', () => {
  it('fills all tiles with new terrain', () => {
    const tools = createTools();
    const changes = tools.fillAll('lava');
    expect(changes.length).toBe(25);
    for (const c of changes) {
      expect(c.after.terrain).toBe('lava');
    }
  });

  it('skips tiles already matching target terrain', () => {
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'desert', elevation: 5, building: null, event: null });
    const tools = createTools(map);
    const changes = tools.fillAll('desert');
    // 24 grass tiles change, 1 desert tile stays
    expect(changes.length).toBe(24);
  });
});
