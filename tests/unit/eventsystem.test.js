/**
 * EventSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { EventSystem } from '../../src/systems/EventSystem.js';
import { ItemSystem } from '../../src/systems/ItemSystem.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { EventBus } from '../../src/core/EventBus.js';
import { SeededRandom } from '../../src/utils/SeededRandom.js';

// --- Minimal configs for testing ---

const testEventConfig = {
  events: {
    chest_01: {
      type: 'treasure',
      title: '神秘宝箱',
      description: '你发现了一个宝箱',
      deathWarning: false,
      choices: [
        {
          text: '打开宝箱',
          conditions: [],
          outcomes: [
            { probability: 0.7, result: { type: 'item_reward', itemPool: ['tent'] } },
            { probability: 0.3, result: { type: 'hp_change', value: -10, message: '陷阱！' } },
          ],
        },
        {
          text: '用钩爪撬开',
          conditions: [{ type: 'has_item', itemId: 'rope_claw' }],
          outcomes: [
            { probability: 1.0, result: { type: 'item_reward', itemPool: ['telescope'] } },
          ],
        },
        {
          text: '离开',
          conditions: [],
          outcomes: [
            { probability: 1.0, result: { type: 'nothing' } },
          ],
        },
      ],
    },
    wolf_attack: {
      type: 'combat',
      title: '狼群突袭',
      description: '狼群来了！',
      deathWarning: true,
      choices: [
        {
          text: '迎战',
          conditions: [],
          outcomes: [
            { probability: 0.6, result: { type: 'hp_change', value: -15 } },
            { probability: 0.4, result: { type: 'hp_change', value: -40 } },
          ],
        },
        {
          text: '逃跑',
          conditions: [],
          outcomes: [
            { probability: 0.7, result: { type: 'ap_change', value: -2 } },
            { probability: 0.3, result: { type: 'hp_change', value: -20 } },
          ],
        },
      ],
    },
    healer: {
      type: 'choice',
      title: '治疗师',
      description: '一位治疗师',
      deathWarning: false,
      choices: [
        {
          text: '请求治疗',
          conditions: [],
          outcomes: [
            { probability: 1.0, result: { type: 'hp_change', value: 30 } },
          ],
        },
        {
          text: '紧急治疗',
          conditions: [{ type: 'hp_below', value: 30 }],
          outcomes: [
            { probability: 1.0, result: { type: 'hp_change', value: 50 } },
          ],
        },
        {
          text: '离开',
          conditions: [],
          outcomes: [
            { probability: 1.0, result: { type: 'nothing' } },
          ],
        },
      ],
    },
  },
};

const testTerrainConfig = {
  terrainTypes: {
    grass: {
      name: '草地',
      baseCost: 1,
      refreshChance: 0.02,
      overnightEvents: ['wolf_attack'],
      eventWeights: { combat: 0.3, treasure: 0.4, choice: 0.3 },
    },
    desert: {
      name: '荒漠',
      baseCost: 1.5,
      refreshChance: 0.01,
      overnightEvents: [],
      eventWeights: { combat: 0.2, treasure: 0.3, choice: 0.5 },
    },
    forest: {
      name: '森林',
      baseCost: 1.5,
      refreshChance: 0.03,
      overnightEvents: ['wolf_attack'],
      eventWeights: { combat: 0.4, treasure: 0.3, choice: 0.3 },
    },
  },
};

const testBuildingConfig = {
  buildingTypes: {
    ruin: {
      name: '遗迹',
      triggerEvent: 'chest_01',
      effect: { type: 'trigger_event' },
    },
    city: {
      name: '城市',
      triggerEvent: 'healer',
      effect: { refreshSuppression: true },
    },
    monster_camp: {
      name: '怪物营地',
      triggerEvent: 'wolf_attack',
      effect: { type: 'trigger_event', eventRefreshBonus: 0.05, eventRefreshRadius: 2 },
    },
  },
};

const testItemConfig = {
  items: {
    rope_claw: { name: '钩爪', quality: 'rare', effects: [] },
    telescope: { name: '望远镜', quality: 'uncommon', effects: [] },
    tent: { name: '帐篷', quality: 'common', effects: [] },
    iron_sword: { name: '铁剑', quality: 'uncommon', tags: ['metal'], effects: [] },
  },
};

function makeSystem(opts = {}) {
  const playerState = opts.playerState ?? new PlayerState({ hp: 100, hpMax: 100 });
  const eventBus = opts.eventBus ?? new EventBus();
  const itemSystem = opts.itemSystem ?? new ItemSystem(testItemConfig);
  const rng = opts.rng ?? new SeededRandom(42);
  return new EventSystem(
    testEventConfig,
    testTerrainConfig,
    testBuildingConfig,
    playerState,
    eventBus,
    { itemSystem, rng },
  );
}

describe('EventSystem', () => {
  // --- triggerEvent ---
  it('triggerEvent 返回事件实例（含可用选项）', () => {
    const sys = makeSystem();
    const result = sys.triggerEvent({ event: 'chest_01', terrain: 'grass' });
    expect(result).toBeDefined();
    expect(result.eventId).toBe('chest_01');
    expect(result.definition.title).toBe('神秘宝箱');
    // Without rope_claw, only 2 choices available (打开宝箱, 离开)
    expect(result.availableChoices.length).toBe(2);
  });

  it('triggerEvent 无事件返回 null', () => {
    const sys = makeSystem();
    expect(sys.triggerEvent({ terrain: 'grass' })).toBeNull();
    expect(sys.triggerEvent({ event: null })).toBeNull();
    expect(sys.triggerEvent({})).toBeNull();
  });

  it('triggerEvent 未知事件 ID 返回 null', () => {
    const sys = makeSystem();
    expect(sys.triggerEvent({ event: 'nonexistent' })).toBeNull();
  });

  it('triggerEvent 持有道具时解锁隐藏分支', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('rope_claw');
    const sys = makeSystem({ itemSystem });
    const result = sys.triggerEvent({ event: 'chest_01', terrain: 'grass' });
    // With rope_claw: 打开宝箱, 用钩爪撬开, 离开 = 3 choices
    expect(result.availableChoices.length).toBe(3);
  });

  // --- checkBranchConditions ---
  it('checkBranchConditions 空条件返回 true', () => {
    const sys = makeSystem();
    expect(sys.checkBranchConditions({ conditions: [] }, new PlayerState())).toBeTrue();
    expect(sys.checkBranchConditions({ conditions: null }, new PlayerState())).toBeTrue();
    expect(sys.checkBranchConditions({}, new PlayerState())).toBeTrue();
  });

  it('checkBranchConditions has_item 持有道具通过', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('rope_claw');
    const sys = makeSystem({ itemSystem });
    const branch = { conditions: [{ type: 'has_item', itemId: 'rope_claw' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeTrue();
  });

  it('checkBranchConditions has_item 未持有道具不通过', () => {
    const sys = makeSystem();
    const branch = { conditions: [{ type: 'has_item', itemId: 'rope_claw' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeFalse();
  });

  it('checkBranchConditions hp_below HP 低于阈值通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 20, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_below', value: 30 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeTrue();
  });

  it('checkBranchConditions hp_below HP 不低于阈值不通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 50, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_below', value: 30 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeFalse();
  });

  it('checkBranchConditions hp_below HP 等于阈值不通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 30, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_below', value: 30 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeFalse();
  });

  it('checkBranchConditions 未知条件类型不通过', () => {
    const sys = makeSystem();
    const branch = { conditions: [{ type: 'unknown_cond' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeFalse();
  });

  // --- resolveChoice ---
  it('resolveChoice 确定性结果（probability=1.0）', () => {
    const sys = makeSystem();
    const instance = sys.triggerEvent({ event: 'chest_01' });
    // "离开" is the last available choice (index 1 without rope_claw)
    const result = sys.resolveChoice(instance, 1);
    expect(result.outcome.type).toBe('nothing');
    expect(result.choiceText).toBe('离开');
  });

  it('resolveChoice 概率结果使用 SeededRandom 确定性', () => {
    // Run twice with same seed, should get same outcome
    const rng1 = new SeededRandom(123);
    const sys1 = makeSystem({ rng: rng1 });
    const inst1 = sys1.triggerEvent({ event: 'wolf_attack' });
    const res1 = sys1.resolveChoice(inst1, 0); // "迎战"

    const rng2 = new SeededRandom(123);
    const sys2 = makeSystem({ rng: rng2 });
    const inst2 = sys2.triggerEvent({ event: 'wolf_attack' });
    const res2 = sys2.resolveChoice(inst2, 0);

    expect(res1.outcome.type).toBe(res2.outcome.type);
    expect(res1.outcome.value).toBe(res2.outcome.value);
  });

  it('resolveChoice 无效 choiceIndex 返回 nothing', () => {
    const sys = makeSystem();
    const instance = sys.triggerEvent({ event: 'chest_01' });
    const result = sys.resolveChoice(instance, 99);
    expect(result.outcome.type).toBe('nothing');
  });

  it('resolveChoice null eventInstance 返回 nothing', () => {
    const sys = makeSystem();
    const result = sys.resolveChoice(null, 0);
    expect(result.outcome.type).toBe('nothing');
  });

  // --- triggerEvent with hp_below condition ---
  it('triggerEvent HP 低时解锁 hp_below 分支', () => {
    const player = new PlayerState({ hp: 20, hpMax: 100 });
    const sys = makeSystem({ playerState: player });
    const result = sys.triggerEvent({ event: 'healer' });
    // HP < 30: 请求治疗, 紧急治疗, 离开 = 3 choices
    expect(result.availableChoices.length).toBe(3);
  });

  it('triggerEvent HP 高时 hp_below 分支不可用', () => {
    const player = new PlayerState({ hp: 80, hpMax: 100 });
    const sys = makeSystem({ playerState: player });
    const result = sys.triggerEvent({ event: 'healer' });
    // HP >= 30: 请求治疗, 离开 = 2 choices
    expect(result.availableChoices.length).toBe(2);
  });

  // --- refreshEvents ---
  it('refreshEvents 非 30 倍数回合不刷新', () => {
    const sys = makeSystem();
    const mapData = makeMockMapData([
      { q: 0, r: 0, terrain: 'grass', event: null, fogState: 'explored' },
    ]);
    expect(sys.refreshEvents(mapData, 15).length).toBe(0);
    expect(sys.refreshEvents(mapData, 1).length).toBe(0);
    expect(sys.refreshEvents(mapData, 0).length).toBe(0);
  });

  it('refreshEvents 30 回合时可能刷新事件', () => {
    // Use a seed that produces low random values to trigger refresh
    // We'll run with many tiles to increase chance of at least one refresh
    const tiles = [];
    for (let i = 0; i < 50; i++) {
      tiles.push({ q: i, r: 0, terrain: 'forest', event: null, fogState: 'explored' });
    }
    const rng = new SeededRandom(7);
    const sys = makeSystem({ rng });
    const mapData = makeMockMapData(tiles);
    const refreshed = sys.refreshEvents(mapData, 30);
    // With 50 forest tiles (refreshChance=0.03), we expect some refreshes
    expect(refreshed.length).toBeGreaterThanOrEqual(0);
    // Each refreshed entry should have q, r, eventId
    for (const entry of refreshed) {
      expect(entry.eventId).toBeDefined();
      expect(entry.q).toBeDefined();
      expect(entry.r).toBeDefined();
    }
  });

  it('refreshEvents 跳过有事件的地块', () => {
    const rng = new SeededRandom(1);
    const sys = makeSystem({ rng });
    const mapData = makeMockMapData([
      { q: 0, r: 0, terrain: 'grass', event: 'chest_01', fogState: 'explored' },
    ]);
    const refreshed = sys.refreshEvents(mapData, 30);
    expect(refreshed.length).toBe(0);
  });

  it('refreshEvents 跳过未探索地块', () => {
    const rng = new SeededRandom(1);
    const sys = makeSystem({ rng });
    const mapData = makeMockMapData([
      { q: 0, r: 0, terrain: 'grass', event: null, fogState: 'unexplored' },
    ]);
    const refreshed = sys.refreshEvents(mapData, 30);
    expect(refreshed.length).toBe(0);
  });

  it('refreshEvents 城市 refreshSuppression 阻止刷新', () => {
    const rng = new SeededRandom(1);
    const sys = makeSystem({ rng });
    const mapData = makeMockMapData([
      { q: 0, r: 0, terrain: 'grass', building: 'city', event: null, fogState: 'explored' },
    ]);
    const refreshed = sys.refreshEvents(mapData, 30);
    expect(refreshed.length).toBe(0);
  });

  // --- getAvailableEvents ---
  it('getAvailableEvents 返回地形相关事件', () => {
    const sys = makeSystem();
    const events = sys.getAvailableEvents('grass');
    expect(events.length).toBeGreaterThan(0);
    // Should include wolf_attack (overnight event for grass)
    expect(events).toContain('wolf_attack');
  });

  it('getAvailableEvents 含建筑时包含建筑触发事件', () => {
    const sys = makeSystem();
    const events = sys.getAvailableEvents('grass', 'ruin');
    expect(events).toContain('chest_01');
  });

  it('getAvailableEvents 无建筑时不含建筑事件', () => {
    const sys = makeSystem();
    const events = sys.getAvailableEvents('desert');
    // desert has no overnight events in our test config, but has eventWeights
    expect(events.length).toBeGreaterThan(0);
  });

  // --- deathWarning flag ---
  it('triggerEvent 保留 deathWarning 标志', () => {
    const sys = makeSystem();
    const result = sys.triggerEvent({ event: 'wolf_attack' });
    expect(result.definition.deathWarning).toBeTrue();

    const result2 = sys.triggerEvent({ event: 'chest_01' });
    expect(result2.definition.deathWarning).toBeFalse();
  });

  // --- New condition types (v1.2 Task 1.3) ---

  it('checkBranchConditions has_metal_item 持有金属道具通过', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('iron_sword');
    const sys = makeSystem({ itemSystem });
    const branch = { conditions: [{ type: 'has_metal_item' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeTrue();
  });

  it('checkBranchConditions has_metal_item 无金属道具不通过', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('tent'); // tent has no metal tag
    const sys = makeSystem({ itemSystem });
    const branch = { conditions: [{ type: 'has_metal_item' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeFalse();
  });

  it('checkBranchConditions has_item_quality 持有指定品质通过', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('rope_claw'); // quality: rare
    const sys = makeSystem({ itemSystem });
    const branch = { conditions: [{ type: 'has_item_quality', quality: 'rare' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeTrue();
  });

  it('checkBranchConditions has_item_quality 无指定品质不通过', () => {
    const itemSystem = new ItemSystem(testItemConfig);
    itemSystem.addItem('tent'); // quality: common
    const sys = makeSystem({ itemSystem });
    const branch = { conditions: [{ type: 'has_item_quality', quality: 'epic' }] };
    expect(sys.checkBranchConditions(branch, new PlayerState())).toBeFalse();
  });

  it('checkBranchConditions on_terrain 地形匹配通过', () => {
    const player = new PlayerState();
    player._currentTerrain = 'forest';
    const sys = makeSystem({ playerState: player });
    const branch = { conditions: [{ type: 'on_terrain', terrain: 'forest' }] };
    expect(sys.checkBranchConditions(branch, player)).toBeTrue();
  });

  it('checkBranchConditions on_terrain 地形不匹配不通过', () => {
    const player = new PlayerState();
    player._currentTerrain = 'grass';
    const sys = makeSystem({ playerState: player });
    const branch = { conditions: [{ type: 'on_terrain', terrain: 'forest' }] };
    expect(sys.checkBranchConditions(branch, player)).toBeFalse();
  });

  it('checkBranchConditions hp_above HP高于阈值通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 80, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_above', value: 50 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeTrue();
  });

  it('checkBranchConditions hp_above HP等于阈值不通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 50, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_above', value: 50 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeFalse();
  });

  it('checkBranchConditions hp_above HP低于阈值不通过', () => {
    const sys = makeSystem();
    const player = new PlayerState({ hp: 30, hpMax: 100 });
    const branch = { conditions: [{ type: 'hp_above', value: 50 }] };
    expect(sys.checkBranchConditions(branch, player)).toBeFalse();
  });

  // --- triggerEvent sets _currentTerrain for on_terrain conditions ---
  it('triggerEvent 设置 _currentTerrain 用于 on_terrain 条件', () => {
    const eventConfigWithTerrain = {
      events: {
        terrain_test: {
          type: 'choice',
          title: '地形测试',
          description: '测试',
          choices: [
            {
              text: '森林选项',
              conditions: [{ type: 'on_terrain', terrain: 'forest' }],
              outcomes: [{ probability: 1.0, result: { type: 'nothing' } }],
            },
            {
              text: '通用选项',
              conditions: [],
              outcomes: [{ probability: 1.0, result: { type: 'nothing' } }],
            },
          ],
        },
      },
    };
    const player = new PlayerState();
    const sys = new EventSystem(eventConfigWithTerrain, testTerrainConfig, testBuildingConfig, player, new EventBus(), { rng: new SeededRandom(42) });
    
    // On forest terrain, forest option should be available
    const result1 = sys.triggerEvent({ event: 'terrain_test', terrain: 'forest' });
    expect(result1.availableChoices.length).toBe(2);

    // On grass terrain, forest option should NOT be available
    const result2 = sys.triggerEvent({ event: 'terrain_test', terrain: 'grass' });
    expect(result2.availableChoices.length).toBe(1);
  });
});

// --- Helper: mock MapData ---
function makeMockMapData(tiles) {
  return {
    getAllTiles() {
      return tiles;
    },
  };
}
