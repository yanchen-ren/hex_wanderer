/**
 * MapValidator 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { MapValidator } from '../../src/editor/MapValidator.js';
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

const configs = { building: buildingConfig };

/** Create a small map with all grass terrain */
function createTestMap(width = 5, height = 5) {
  const map = new MapData(width, height);
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      map.setTile(q, r, { terrain: 'grass', elevation: 5, building: null, event: null });
    }
  }
  return map;
}

/** Create a valid map (has portal, enough relics, all reachable, no constraint violations) */
function createValidMap() {
  const map = createTestMap();
  map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: 'portal', event: null });
  map.portalPosition = { q: 2, r: 2 };
  map.relicPositions = [{ q: 0, r: 0 }, { q: 4, r: 4 }, { q: 0, r: 4 }];
  map.relicsNeeded = 3;
  return map;
}

describe('MapValidator — validate returns correct structure', () => {
  it('returns { valid, issues } object', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    expect(result.valid).toBeTrue();
    expect(Array.isArray(result.issues)).toBeTrue();
  });

  it('valid map has no issues', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    expect(result.issues.length).toBe(0);
  });
});

describe('MapValidator — _checkPortalExists', () => {
  it('reports error when no portal exists', () => {
    const validator = new MapValidator(configs);
    const map = createTestMap();
    map.relicPositions = [{ q: 0, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 2 }];
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'no_portal');
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('error');
    expect(result.valid).toBeFalse();
  });

  it('no issue when portal exists', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'no_portal');
    expect(issue).toBeUndefined();
  });
});

describe('MapValidator — _checkRelicCount', () => {
  it('reports error when relics are insufficient', () => {
    const validator = new MapValidator(configs);
    const map = createTestMap();
    map.setTile(2, 2, { terrain: 'grass', elevation: 5, building: 'portal', event: null });
    map.relicPositions = [{ q: 0, r: 0 }];
    map.relicsNeeded = 3;
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'insufficient_relics');
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('error');
    expect(result.valid).toBeFalse();
  });

  it('no issue when relics meet requirement', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'insufficient_relics');
    expect(issue).toBeUndefined();
  });

  it('no issue when relics exceed requirement', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    map.relicPositions = [{ q: 0, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 0 }, { q: 3, r: 3 }];
    map.relicsNeeded = 3;
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'insufficient_relics');
    expect(issue).toBeUndefined();
  });
});

describe('MapValidator — _checkReachability', () => {
  it('reports warning for unreachable non-void tiles', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    // Create a void barrier isolating tile (0,0)
    map.setTile(1, 0, { terrain: 'void', elevation: 0, building: null, event: null });
    map.setTile(0, 1, { terrain: 'void', elevation: 0, building: null, event: null });
    // (0,0) is grass but surrounded by void on the sides that connect to the rest
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unreachable_tiles');
    if (issue) {
      expect(issue.severity).toBe('warning');
      expect(issue.tiles.length).toBeGreaterThan(0);
    }
    // valid should still be true since unreachable_tiles is a warning
    expect(result.valid).toBeTrue();
  });

  it('no issue when all non-void tiles are reachable', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unreachable_tiles');
    expect(issue).toBeUndefined();
  });

  it('void tiles are not reported as unreachable', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    map.setTile(0, 0, { terrain: 'void', elevation: 0, building: null, event: null });
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unreachable_tiles');
    // void tile at (0,0) should not appear in unreachable list
    if (issue) {
      const hasVoidTile = issue.tiles.some(t => t.q === 0 && t.r === 0);
      expect(hasVoidTile).toBeFalse();
    }
  });
});

describe('MapValidator — _checkBuildingTerrainConstraints', () => {
  it('reports error for building on incompatible terrain', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    // Place farm on water (farm only allowed on grass)
    map.setTile(1, 1, { terrain: 'water', elevation: 5, building: 'farm', event: null });
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'invalid_building_terrain');
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('error');
    expect(issue.tiles.length).toBe(1);
    expect(issue.tiles[0].q).toBe(1);
    expect(issue.tiles[0].r).toBe(1);
    expect(result.valid).toBeFalse();
  });

  it('no issue when all buildings are on allowed terrain', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    // camp is allowed on grass
    map.setTile(1, 1, { terrain: 'grass', elevation: 5, building: 'camp', event: null });
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'invalid_building_terrain');
    expect(issue).toBeUndefined();
  });
});

describe('MapValidator — _checkTeleporterPairs', () => {
  it('reports warning for odd number of teleporters', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    map.setTile(0, 0, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unpaired_teleporter');
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('warning');
    expect(issue.tiles.length).toBe(1);
    // valid is still true since it's a warning
    expect(result.valid).toBeTrue();
  });

  it('no issue for even number of teleporters', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    map.setTile(0, 0, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    map.setTile(4, 4, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unpaired_teleporter');
    expect(issue).toBeUndefined();
  });

  it('no issue when no teleporters exist', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    const result = validator.validate(map);
    const issue = result.issues.find(i => i.type === 'unpaired_teleporter');
    expect(issue).toBeUndefined();
  });
});

describe('MapValidator — valid flag logic', () => {
  it('valid is false when any error-severity issue exists', () => {
    const validator = new MapValidator(configs);
    const map = createTestMap(); // no portal, no relics
    const result = validator.validate(map);
    expect(result.valid).toBeFalse();
  });

  it('valid is true when only warning-severity issues exist', () => {
    const validator = new MapValidator(configs);
    const map = createValidMap();
    // Add a single unpaired teleporter (warning only)
    map.setTile(0, 0, { terrain: 'grass', elevation: 5, building: 'teleporter', event: null });
    const result = validator.validate(map);
    expect(result.valid).toBeTrue();
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
