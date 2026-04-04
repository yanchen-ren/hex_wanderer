/**
 * 导入导出单元测试
 * 测试 MapData 序列化/反序列化逻辑及 MapFile 格式验证
 */
import { describe, it, expect } from '../test-runner.js';
import { MapData } from '../../src/map/MapData.js';

/** Helper: create a small MapData with a few tiles */
function makeMapData(width = 3, height = 3) {
  const map = new MapData(width, height);
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      map.setTile(q, r, {
        terrain: 'grass',
        elevation: 5,
        building: null,
        event: null,
        fogState: 'unexplored',
      });
    }
  }
  return map;
}

describe('Import/Export — MapData.toJSON()', () => {
  it('produces valid JSON with required fields (width, height, tiles)', () => {
    const map = makeMapData(4, 4);
    const json = map.toJSON();
    expect(json.width).toBe(4);
    expect(json.height).toBe(4);
    expect(typeof json.tiles).toBe('object');
    expect(json.tiles).toBeDefined();
  });

  it('includes relicPositions, relicsNeeded, portalPosition, teleportPairs', () => {
    const map = makeMapData(3, 3);
    map.relicPositions = [{ q: 0, r: 0 }];
    map.relicsNeeded = 2;
    map.portalPosition = { q: 1, r: 1 };
    map.teleportPairs = [[{ q: 0, r: 1 }, { q: 2, r: 1 }]];
    const json = map.toJSON();
    expect(json.relicPositions.length).toBe(1);
    expect(json.relicsNeeded).toBe(2);
    expect(json.portalPosition.q).toBe(1);
    expect(json.teleportPairs.length).toBe(1);
  });

  it('serializes tile data correctly', () => {
    const map = makeMapData(2, 2);
    map.setTile(0, 0, { terrain: 'water', elevation: 3, building: 'camp', event: 'combat_1', fogState: 'visible' });
    const json = map.toJSON();
    const tile = json.tiles['0,0'];
    expect(tile.terrain).toBe('water');
    expect(tile.elevation).toBe(3);
    expect(tile.building).toBe('camp');
    expect(tile.event).toBe('combat_1');
  });
});

describe('Import/Export — MapData.fromJSON()', () => {
  it('correctly restores a map from JSON', () => {
    const original = makeMapData(3, 3);
    original.setTile(1, 1, { terrain: 'desert', elevation: 8, building: 'portal', event: null, fogState: 'unexplored' });
    original.portalPosition = { q: 1, r: 1 };
    const json = original.toJSON();
    const restored = MapData.fromJSON(json);
    expect(restored.width).toBe(3);
    expect(restored.height).toBe(3);
    const tile = restored.getTile(1, 1);
    expect(tile.terrain).toBe('desert');
    expect(tile.elevation).toBe(8);
    expect(tile.building).toBe('portal');
    expect(restored.portalPosition.q).toBe(1);
    expect(restored.portalPosition.r).toBe(1);
  });

  it('restores relicPositions and teleportPairs', () => {
    const json = {
      width: 5, height: 5,
      tiles: { '0,0': { terrain: 'grass', elevation: 5 } },
      relicPositions: [{ q: 2, r: 3 }],
      relicsNeeded: 1,
      portalPosition: null,
      teleportPairs: [[{ q: 0, r: 0 }, { q: 4, r: 4 }]],
    };
    const map = MapData.fromJSON(json);
    expect(map.relicPositions.length).toBe(1);
    expect(map.relicPositions[0].q).toBe(2);
    expect(map.relicsNeeded).toBe(1);
    expect(map.teleportPairs.length).toBe(1);
  });

  it('defaults relicsNeeded to 3 when missing', () => {
    const json = { width: 2, height: 2, tiles: {} };
    const map = MapData.fromJSON(json);
    expect(map.relicsNeeded).toBe(3);
  });

  it('defaults relicPositions to empty array when missing', () => {
    const json = { width: 2, height: 2, tiles: {} };
    const map = MapData.fromJSON(json);
    expect(map.relicPositions.length).toBe(0);
  });
});

describe('Import/Export — Round-trip', () => {
  it('toJSON → fromJSON produces equivalent MapData', () => {
    const original = makeMapData(4, 4);
    original.setTile(0, 0, { terrain: 'lava', elevation: 10, building: null, event: 'treasure_1', fogState: 'unexplored' });
    original.setTile(3, 3, { terrain: 'ice', elevation: 0, building: 'camp', event: null, fogState: 'unexplored' });
    original.relicPositions = [{ q: 1, r: 1 }, { q: 2, r: 2 }];
    original.relicsNeeded = 2;
    original.portalPosition = { q: 3, r: 0 };
    original.teleportPairs = [[{ q: 0, r: 3 }, { q: 3, r: 3 }]];

    const json = original.toJSON();
    const restored = MapData.fromJSON(json);

    expect(restored.width).toBe(original.width);
    expect(restored.height).toBe(original.height);
    expect(restored.getTileCount()).toBe(original.getTileCount());
    expect(restored.relicPositions.length).toBe(2);
    expect(restored.relicsNeeded).toBe(2);
    expect(restored.portalPosition.q).toBe(3);
    expect(restored.teleportPairs.length).toBe(1);

    // Verify individual tiles
    const t00 = restored.getTile(0, 0);
    expect(t00.terrain).toBe('lava');
    expect(t00.elevation).toBe(10);
    const t33 = restored.getTile(3, 3);
    expect(t33.terrain).toBe('ice');
    expect(t33.building).toBe('camp');
  });
});

describe('Import/Export — Invalid input handling', () => {
  it('fromJSON with missing width creates map with undefined width', () => {
    const json = { height: 5, tiles: { '0,0': { terrain: 'grass', elevation: 5 } } };
    const map = MapData.fromJSON(json);
    // width will be undefined since it's not in the JSON
    expect(map.width).toBeUndefined();
  });

  it('fromJSON with missing tiles throws', () => {
    const json = { width: 5, height: 5 };
    expect(() => MapData.fromJSON(json)).toThrow();
  });

  it('fromJSON with empty tiles object creates a map with zero tiles', () => {
    const json = { width: 5, height: 5, tiles: {} };
    const map = MapData.fromJSON(json);
    expect(map.width).toBe(5);
    expect(map.height).toBe(5);
    expect(map.getTileCount()).toBe(0);
  });
});

describe('Import/Export — MapFile format validation', () => {
  it('export format has version, meta, and mapData fields', () => {
    const map = makeMapData(3, 3);
    const meta = { name: 'Test', author: 'Dev', description: 'A test map' };
    const now = new Date().toISOString();

    const mapFile = {
      version: '1.0',
      meta: {
        name: meta.name,
        author: meta.author,
        description: meta.description,
        createdAt: now,
        updatedAt: now,
      },
      mapData: map.toJSON(),
    };

    expect(mapFile.version).toBe('1.0');
    expect(typeof mapFile.meta).toBe('object');
    expect(mapFile.meta.name).toBe('Test');
    expect(mapFile.meta.author).toBe('Dev');
    expect(mapFile.meta.createdAt).toBeDefined();
    expect(mapFile.meta.updatedAt).toBeDefined();
    expect(typeof mapFile.mapData).toBe('object');
    expect(mapFile.mapData.width).toBe(3);
    expect(mapFile.mapData.tiles).toBeDefined();
  });

  it('mapData within MapFile can be deserialized via fromJSON', () => {
    const map = makeMapData(2, 2);
    map.setTile(0, 0, { terrain: 'forest', elevation: 7, building: null, event: null, fogState: 'unexplored' });
    const mapFile = {
      version: '1.0',
      meta: { name: 'Forest', author: '', description: '', createdAt: '', updatedAt: '' },
      mapData: map.toJSON(),
    };

    const restored = MapData.fromJSON(mapFile.mapData);
    expect(restored.width).toBe(2);
    expect(restored.getTile(0, 0).terrain).toBe('forest');
  });
});

describe('Import/Export — Forward compatibility (extra fields)', () => {
  it('fromJSON with extra unknown fields does not break', () => {
    const json = {
      width: 3, height: 3,
      tiles: { '0,0': { terrain: 'grass', elevation: 5, building: null, event: null } },
      relicPositions: [],
      relicsNeeded: 3,
      portalPosition: null,
      teleportPairs: [],
      unknownField: 'should be ignored',
      futureFeature: { nested: true },
    };
    const map = MapData.fromJSON(json);
    expect(map.width).toBe(3);
    expect(map.height).toBe(3);
    expect(map.getTile(0, 0).terrain).toBe('grass');
  });

  it('tiles with extra properties are preserved', () => {
    const json = {
      width: 2, height: 2,
      tiles: {
        '0,0': { terrain: 'grass', elevation: 5, building: null, event: null, customProp: 'hello' },
      },
    };
    const map = MapData.fromJSON(json);
    const tile = map.getTile(0, 0);
    expect(tile.terrain).toBe('grass');
    // Extra properties on tiles are preserved since fromJSON stores the data object as-is
    expect(tile.customProp).toBe('hello');
  });
});
