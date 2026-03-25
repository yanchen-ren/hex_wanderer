/**
 * FogSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { FogSystem } from '../../src/systems/FogSystem.js';
import { ItemSystem } from '../../src/systems/ItemSystem.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { MapData } from '../../src/map/MapData.js';

// --- Helpers ---

const terrainConfig = {
  terrainTypes: {
    grass:  { name: '草地', baseCost: 1, visionModifier: 0 },
    forest: { name: '森林', baseCost: 1.5, visionModifier: -1 },
    desert: { name: '荒漠', baseCost: 1.5, visionModifier: 1 },
    water:  { name: '水域', baseCost: 1, visionModifier: 1 },
  },
};

const itemConfig = {
  items: {
    telescope: {
      name: '望远镜',
      quality: 'uncommon',
      effects: [{ type: 'vision_bonus', value: 2, permanent: true }],
    },
  },
};

/**
 * Build a small flat map of given radius around (0,0) with uniform terrain/elevation.
 */
function buildFlatMap(radius, terrain = 'grass', elevation = 5) {
  const size = radius * 2 + 1;
  const map = new MapData(size, size);
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      map.setTile(q, r, { terrain, elevation, building: null, event: null });
    }
  }
  return map;
}

describe('FogSystem', () => {
  // --- calculateVisionRange ---

  it('基础视野为 2（平坦草地，无道具）', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    expect(range).toBe(2);
  });

  it('森林地形减少视野 (-1)', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'forest', 5);

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // base 2 + terrain -1 = 1
    expect(range).toBe(1);
  });

  it('荒漠地形增加视野 (+1)', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'desert', 5);

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // base 2 + terrain +1 = 3
    expect(range).toBe(3);
  });

  it('高海拔增加视野', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 3);
    // Set center tile to higher elevation
    map.setTile(0, 0, { terrain: 'grass', elevation: 6, building: null, event: null });

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // elevation delta = 6 - 3 = 3, rounded = 3
    // base 2 + elev 3 + terrain 0 = 5
    expect(range).toBe(5);
  });

  it('低海拔减少视野', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 8);
    // Set center tile to lower elevation
    map.setTile(0, 0, { terrain: 'grass', elevation: 5, building: null, event: null });

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // elevation delta = 5 - 8 = -3, rounded = -3
    // base 2 + elev -3 + terrain 0 = -1 → clamped to 1
    expect(range).toBe(1);
  });

  it('视野最小值为 1', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'forest', 10);
    // Center at elevation 3, neighbors at 10 → delta = -7
    map.setTile(0, 0, { terrain: 'forest', elevation: 3, building: null, event: null });

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // base 2 + elev -7 + terrain -1 = -6 → clamped to 1
    expect(range).toBe(1);
  });

  it('望远镜道具增加视野 (+2)', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    items.addItem('telescope');
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // base 2 + item 2 = 4
    expect(range).toBe(4);
  });

  it('灯塔建筑增加视野 (+3)', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);
    // Place a lighthouse at (1, 0) with areaRadius 3
    map.setTile(1, 0, {
      terrain: 'grass',
      elevation: 5,
      building: 'lighthouse',
      buildingEffect: { visionBonus: 3, areaRadius: 3 },
      event: null,
    });

    const range = fog.calculateVisionRange({ q: 0, r: 0 }, map);
    // base 2 + lighthouse 3 = 5
    expect(range).toBe(5);
  });

  // --- getTileVisibility ---

  it('初始状态所有地块为 unexplored', () => {
    const player = new PlayerState();
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);

    expect(fog.getTileVisibility(0, 0)).toBe('unexplored');
    expect(fog.getTileVisibility(5, 5)).toBe('unexplored');
  });

  // --- updateFog ---

  it('updateFog 将视野内地块标记为 visible', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);

    fog.updateFog({ q: 0, r: 0 }, map);

    // Center should be visible
    expect(fog.getTileVisibility(0, 0)).toBe('visible');
    // Adjacent tile (distance 1) should be visible
    expect(fog.getTileVisibility(1, 0)).toBe('visible');
    // Distance 2 should be visible (base vision = 2)
    expect(fog.getTileVisibility(2, 0)).toBe('visible');
    // Distance 3 should still be unexplored
    expect(fog.getTileVisibility(3, 0)).toBe('unexplored');
  });

  it('移动后旧 visible 变为 explored', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(10, 'grass', 5);

    // First position
    fog.updateFog({ q: 0, r: 0 }, map);
    expect(fog.getTileVisibility(0, 0)).toBe('visible');

    // Move far away so (0,0) is out of range
    fog.updateFog({ q: 6, r: 0 }, map);
    // (0,0) was visible, now out of range → explored
    expect(fog.getTileVisibility(0, 0)).toBe('explored');
    // New position should be visible
    expect(fog.getTileVisibility(6, 0)).toBe('visible');
  });

  it('explored 地块不会回退到 unexplored', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(10, 'grass', 5);

    fog.updateFog({ q: 0, r: 0 }, map);
    fog.updateFog({ q: 6, r: 0 }, map);

    // (0,0) should be explored, not unexplored
    expect(fog.getTileVisibility(0, 0)).toBe('explored');
  });

  // --- getVisibleTiles ---

  it('getVisibleTiles 返回视野内所有地块', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);

    const visible = fog.getVisibleTiles({ q: 0, r: 0 }, map);
    // Base vision = 2, hexesInRange(0,0,2) = 1 + 6 + 12 = 19 tiles
    // But only tiles that exist in the map are returned
    expect(visible.length).toBeGreaterThan(0);
    // Center should be included
    const hasCenter = visible.some(t => t.q === 0 && t.r === 0);
    expect(hasCenter).toBeTrue();
  });

  it('getVisibleTiles 不包含地图外的坐标', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    // Very small map: only center tile
    const map = new MapData(1, 1);
    map.setTile(0, 0, { terrain: 'grass', elevation: 5, building: null, event: null });

    const visible = fog.getVisibleTiles({ q: 0, r: 0 }, map);
    expect(visible.length).toBe(1);
    expect(visible[0].q).toBe(0);
    expect(visible[0].r).toBe(0);
  });

  // --- toJSON / loadFromJSON ---

  it('序列化和反序列化迷雾状态', () => {
    const player = new PlayerState({ position: { q: 0, r: 0 } });
    const items = new ItemSystem(itemConfig);
    const fog = new FogSystem(terrainConfig, player, items);
    const map = buildFlatMap(5, 'grass', 5);

    fog.updateFog({ q: 0, r: 0 }, map);
    const json = fog.toJSON();

    const fog2 = new FogSystem(terrainConfig, player, items);
    fog2.loadFromJSON(json);

    expect(fog2.getTileVisibility(0, 0)).toBe('visible');
  });
});
