/**
 * BuildingSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { EventBus } from '../../src/core/EventBus.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { MapData } from '../../src/map/MapData.js';

// Minimal building config for testing
const buildingConfig = {
  buildingTypes: {
    lighthouse: {
      name: '灯塔',
      description: '增加周围地块视野',
      effect: { visionBonus: 3, areaRadius: 3 },
      allowedTerrains: ['grass', 'desert', 'forest'],
      triggerEvent: null,
    },
    camp: {
      name: '营地',
      description: '休息时额外恢复',
      effect: { restApBonus: 2, restHpBonus: 10 },
      allowedTerrains: ['grass', 'forest', 'desert'],
      triggerEvent: null,
    },
    portal: {
      name: '传送门',
      description: '通关出口',
      effect: { type: 'win_condition' },
      triggerEvent: null,
    },
    teleporter: {
      name: '传送阵',
      description: '传送到配对传送阵',
      effect: { type: 'teleport' },
      triggerEvent: null,
    },
    ruin: {
      name: '遗迹',
      description: '触发探索事件',
      effect: { type: 'trigger_event' },
      triggerEvent: 'ruin_explore',
    },
    monster_camp: {
      name: '怪物营地',
      description: '遭遇战斗',
      effect: { type: 'trigger_event', eventRefreshBonus: 0.05, eventRefreshRadius: 2 },
      triggerEvent: 'monster_camp_battle',
    },
  },
};

describe('BuildingSystem', () => {
  // --- triggerBuildingEffect ---

  it('营地返回 rest_bonus 效果', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'camp', position: { q: 0, r: 0 } },
      player
    );

    expect(result.type).toBe('rest_bonus');
    expect(result.effect.restApBonus).toBe(2);
    expect(result.effect.restHpBonus).toBe(10);
  });

  it('传送门返回 win_condition', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let emitted = false;
    bus.on('building:portal', () => { emitted = true; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'portal', position: { q: 5, r: 5 } },
      player
    );

    expect(result.type).toBe('win_condition');
    expect(emitted).toBeTrue();
  });

  it('遗迹返回 trigger_event 并携带 eventId', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'ruin', position: { q: 2, r: 3 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('ruin_explore');
    expect(eventData.eventId).toBe('ruin_explore');
  });

  it('灯塔返回 vision_bonus 效果', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'lighthouse', position: { q: 0, r: 0 } },
      player
    );

    expect(result.type).toBe('vision_bonus');
    expect(result.effect.visionBonus).toBe(3);
    expect(result.effect.areaRadius).toBe(3);
  });

  it('未知建筑返回 unknown', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'nonexistent', position: { q: 0, r: 0 } },
      player
    );

    expect(result.type).toBe('unknown');
  });

  // --- Teleporter ---

  it('传送阵正确传送到配对目标', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    const map = new MapData(20, 20);
    map.teleportPairs = [
      [{ q: 3, r: 7 }, { q: 10, r: 12 }],
    ];

    let teleportEvent = null;
    bus.on('building:teleport', (data) => { teleportEvent = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'teleporter', position: { q: 3, r: 7 } },
      player,
      map
    );

    expect(result.type).toBe('teleport');
    expect(result.teleportTarget.q).toBe(10);
    expect(result.teleportTarget.r).toBe(12);
    expect(teleportEvent.to.q).toBe(10);
  });

  it('传送阵反向传送', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    const map = new MapData(20, 20);
    map.teleportPairs = [
      [{ q: 3, r: 7 }, { q: 10, r: 12 }],
    ];

    const result = sys.triggerBuildingEffect(
      { buildingId: 'teleporter', position: { q: 10, r: 12 } },
      player,
      map
    );

    expect(result.type).toBe('teleport');
    expect(result.teleportTarget.q).toBe(3);
    expect(result.teleportTarget.r).toBe(7);
  });

  it('传送阵无配对时返回 teleport_failed', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    const map = new MapData(20, 20);
    map.teleportPairs = [];

    const result = sys.triggerBuildingEffect(
      { buildingId: 'teleporter', position: { q: 5, r: 5 } },
      player,
      map
    );

    expect(result.type).toBe('teleport_failed');
  });

  // --- getTeleportTarget ---

  it('getTeleportTarget 找到配对', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const map = new MapData(20, 20);
    map.teleportPairs = [
      [{ q: 1, r: 2 }, { q: 8, r: 9 }],
    ];

    const target = sys.getTeleportTarget('teleporter', map, { q: 1, r: 2 });
    expect(target.q).toBe(8);
    expect(target.r).toBe(9);
  });

  it('getTeleportTarget 无配对返回 null', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const map = new MapData(20, 20);
    map.teleportPairs = [];

    const target = sys.getTeleportTarget('teleporter', map, { q: 1, r: 2 });
    expect(target).toBeNull();
  });

  it('getTeleportTarget 无 mapData 返回 null', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);

    const target = sys.getTeleportTarget('teleporter', null, { q: 1, r: 2 });
    expect(target).toBeNull();
  });

  // --- getAreaEffect ---

  it('灯塔区域效果包含正确的地块数', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);

    const area = sys.getAreaEffect(
      { buildingId: 'lighthouse', position: { q: 5, r: 5 } }
    );

    // areaRadius = 3 → hexesInRange(5,5,3) = 1+6+12+18 = 37 tiles
    expect(area.affectedTiles.length).toBe(37);
    expect(area.effect.visionBonus).toBe(3);
  });

  it('营地区域效果（无 areaRadius 默认 0）', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);

    const area = sys.getAreaEffect(
      { buildingId: 'camp', position: { q: 0, r: 0 } }
    );

    // areaRadius = 0 → only the building tile itself
    expect(area.affectedTiles.length).toBe(1);
    expect(area.effect.restApBonus).toBe(2);
    expect(area.effect.restHpBonus).toBe(10);
  });

  it('getAreaEffect 可覆盖 radius', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);

    const area = sys.getAreaEffect(
      { buildingId: 'lighthouse', position: { q: 0, r: 0 } },
      1
    );

    // Override radius to 1 → 1+6 = 7 tiles
    expect(area.affectedTiles.length).toBe(7);
  });

  // ---怪物营地 trigger_event ---

  it('怪物营地触发事件', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'monster_camp', position: { q: 3, r: 3 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('monster_camp_battle');
  });
});
