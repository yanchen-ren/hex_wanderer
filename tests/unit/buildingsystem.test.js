/**
 * BuildingSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { BuildingSystem } from '../../src/systems/BuildingSystem.js';
import { EventBus } from '../../src/core/EventBus.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { MapData } from '../../src/map/MapData.js';

// Minimal building config for testing (v1.2 updated)
const buildingConfig = {
  buildingTypes: {
    lighthouse: {
      name: '灯塔',
      description: '点亮后永久揭开周围迷雾',
      effect: { type: 'trigger_event' },
      allowedTerrains: ['grass', 'desert', 'forest'],
      triggerEvent: 'lighthouse_event',
    },
    camp: {
      name: '营地',
      description: '可以休息、治疗或交易',
      effect: { type: 'trigger_event' },
      allowedTerrains: ['grass', 'forest', 'desert'],
      triggerEvent: 'camp_rest_event',
    },
    portal: {
      name: '传送门',
      description: '通关出口',
      effect: { type: 'win_condition' },
      allowedTerrains: ['grass', 'desert', 'forest', 'swamp', 'water', 'ice', 'lava'],
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
    church: {
      name: '教堂',
      description: '祈祷解除诅咒和流血',
      effect: { type: 'trigger_event' },
      triggerEvent: 'church_prayer',
    },
    farm: {
      name: '农田',
      description: '持有镰刀时休息可恢复生命',
      effect: { restHpBonus: 0, restApBonus: 0 },
      triggerEvent: null,
    },
    city: {
      name: '城市',
      description: '交易道具和获取情报',
      effect: { restHpBonus: 15, restApBonus: 1, refreshSuppression: true },
      triggerEvent: 'city_market',
    },
    watchtower: {
      name: '瞭望塔',
      description: '登上后可揭开周围迷雾',
      effect: { type: 'trigger_event' },
      triggerEvent: 'watchtower_event',
    },
    reef: {
      name: '暗礁',
      description: '水域中的危险暗礁',
      effect: { type: 'trigger_event' },
      triggerEvent: 'reef_event',
      repeatable: true,
    },
    training_ground: {
      name: '训练场',
      description: '永久提升HP或AP上限',
      effect: { type: 'trigger_event' },
      triggerEvent: 'training_event',
    },
    altar: {
      name: '祭坛',
      description: '献祭HP换道具或供奉道具换金币',
      effect: { type: 'trigger_event' },
      triggerEvent: 'altar_event',
      repeatable: true,
    },
    spring: {
      name: '泉水',
      description: '经过时自动恢复行动力',
      effect: { type: 'passive_ap_restore', apMin: 2, apMax: 5, fullRestoreChance: 0.05 },
      triggerEvent: null,
    },
  },
};

describe('BuildingSystem', () => {
  // --- triggerBuildingEffect ---

  it('营地返回 trigger_event 并携带 camp_rest_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'camp', position: { q: 0, r: 0 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('camp_rest_event');
    expect(eventData.eventId).toBe('camp_rest_event');
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

  it('灯塔返回 trigger_event 并携带 lighthouse_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'lighthouse', position: { q: 0, r: 0 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('lighthouse_event');
    expect(eventData.eventId).toBe('lighthouse_event');
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

  it('灯塔区域效果（trigger_event 无 areaRadius 默认 0）', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);

    const area = sys.getAreaEffect(
      { buildingId: 'lighthouse', position: { q: 5, r: 5 } }
    );

    // areaRadius = 0 (trigger_event type) → only the building tile itself
    expect(area.affectedTiles.length).toBe(1);
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

  // --- 怪物营地 trigger_event ---

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

  // --- Church (now trigger_event with church_prayer) ---

  it('教堂返回 trigger_event 并携带 church_prayer', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'church', position: { q: 4, r: 4 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('church_prayer');
    expect(eventData.eventId).toBe('church_prayer');
  });

  // --- Farm (restHpBonus: 0, restApBonus: 0) ---

  it('农田返回 passive 效果（无休息加成）', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'farm', position: { q: 2, r: 2 } },
      player
    );

    // restHpBonus: 0, restApBonus: 0 → falls through to passive
    expect(result.type).toBe('passive');
  });

  // --- City (trigger_event with city_market) ---

  it('城市返回 trigger_event 并携带 city_market', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'city', position: { q: 5, r: 5 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('city_market');
    expect(eventData.eventId).toBe('city_market');
  });

  // --- v1.2 New Buildings ---

  it('瞭望塔返回 trigger_event 并携带 watchtower_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'watchtower', position: { q: 1, r: 1 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('watchtower_event');
    expect(eventData.eventId).toBe('watchtower_event');
  });

  it('暗礁返回 trigger_event 并携带 reef_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    let eventData = null;
    bus.on('building:event', (data) => { eventData = data; });

    const result = sys.triggerBuildingEffect(
      { buildingId: 'reef', position: { q: 2, r: 2 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('reef_event');
    expect(eventData.eventId).toBe('reef_event');
  });

  it('暗礁标记为可重复', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const def = sys.getBuildingDef('reef');
    expect(def.repeatable).toBeTrue();
  });

  it('训练场返回 trigger_event 并携带 training_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'training_ground', position: { q: 3, r: 3 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('training_event');
  });

  it('祭坛返回 trigger_event 并携带 altar_event', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();

    const result = sys.triggerBuildingEffect(
      { buildingId: 'altar', position: { q: 4, r: 4 } },
      player
    );

    expect(result.type).toBe('trigger_event');
    expect(result.eventId).toBe('altar_event');
  });

  it('祭坛标记为可重复', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const def = sys.getBuildingDef('altar');
    expect(def.repeatable).toBeTrue();
  });

  it('泉水返回 passive_ap_restore 并恢复AP', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const player = new PlayerState();
    player.ap = 3;
    player.apMax = 8;

    const result = sys.triggerBuildingEffect(
      { buildingId: 'spring', position: { q: 5, r: 5 } },
      player
    );

    expect(result.type).toBe('passive_ap_restore');
    expect(result.apRestore).toBeGreaterThanOrEqual(0);
    expect(typeof result.message).toBe('string');
  });

  it('泉水无 triggerEvent', () => {
    const bus = new EventBus();
    const sys = new BuildingSystem(buildingConfig, bus);
    const def = sys.getBuildingDef('spring');
    expect(def.triggerEvent).toBeNull();
    expect(def.effect.type).toBe('passive_ap_restore');
  });
});
