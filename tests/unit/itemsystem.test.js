/**
 * ItemSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { ItemSystem } from '../../src/systems/ItemSystem.js';

// Minimal item config for testing
const testConfig = {
  items: {
    boat: {
      name: '船只',
      quality: 'uncommon',
      effects: [{ type: 'terrain_pass', terrainType: 'water' }],
    },
    telescope: {
      name: '望远镜',
      quality: 'uncommon',
      effects: [{ type: 'vision_bonus', value: 2, permanent: true }],
    },
    leather_shoes: {
      name: '皮靴',
      quality: 'common',
      effects: [{ type: 'ap_max_bonus', value: 1, permanent: true }],
    },
    tent: {
      name: '帐篷',
      quality: 'common',
      effects: [{ type: 'rest_hp_bonus', value: 10 }],
    },
    parachute: {
      name: '降落伞',
      quality: 'rare',
      effects: [
        { type: 'fall_immunity' },
        { type: 'terrain_pass', condition: 'elevationDelta <= -4' },
      ],
    },
    antidote: {
      name: '解毒药',
      quality: 'common',
      effects: [{ type: 'status_immunity', statusId: 'poison' }],
    },
  },
};

describe('ItemSystem', () => {
  // --- addItem / hasItem ---
  it('addItem 添加道具成功', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.addItem('boat')).toBeTrue();
    expect(sys.hasItem('boat')).toBeTrue();
  });

  it('addItem 重复添加返回 false', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('boat');
    expect(sys.addItem('boat')).toBeFalse();
  });

  it('addItem 未定义道具返回 false', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.addItem('nonexistent')).toBeFalse();
  });

  it('hasItem 未持有返回 false', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.hasItem('boat')).toBeFalse();
  });

  // --- hasActiveItem ---
  it('hasActiveItem 默认启用', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('boat');
    expect(sys.hasActiveItem('boat')).toBeTrue();
  });

  it('hasActiveItem 禁用后返回 false', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('boat');
    sys.toggleItem('boat');
    expect(sys.hasActiveItem('boat')).toBeFalse();
    expect(sys.hasItem('boat')).toBeTrue();
  });

  // --- toggleItem ---
  it('toggleItem 切换启用/禁用', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('telescope');
    // enabled → disabled
    const state1 = sys.toggleItem('telescope');
    expect(state1).toBeFalse();
    expect(sys.hasActiveItem('telescope')).toBeFalse();
    // disabled → enabled
    const state2 = sys.toggleItem('telescope');
    expect(state2).toBeTrue();
    expect(sys.hasActiveItem('telescope')).toBeTrue();
  });

  it('toggleItem 未持有道具返回 false', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.toggleItem('boat')).toBeFalse();
  });

  // --- exchangeItem ---
  it('exchangeItem 正常交换', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('leather_shoes');
    expect(sys.exchangeItem('leather_shoes', 'telescope')).toBeTrue();
    expect(sys.hasItem('leather_shoes')).toBeFalse();
    expect(sys.hasItem('telescope')).toBeTrue();
  });

  it('exchangeItem 未持有 giveId 返回 false', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.exchangeItem('boat', 'telescope')).toBeFalse();
  });

  it('exchangeItem receiveId 不在配置中返回 false', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('boat');
    expect(sys.exchangeItem('boat', 'nonexistent')).toBeFalse();
    expect(sys.hasItem('boat')).toBeTrue();
  });

  // --- getActiveEffects ---
  it('getActiveEffects 汇总已启用道具效果', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('telescope');
    sys.addItem('leather_shoes');
    sys.addItem('tent');
    sys.addItem('parachute');
    sys.addItem('antidote');

    const effects = sys.getActiveEffects();
    expect(effects.visionBonus).toBe(2);
    expect(effects.apBonus).toBe(1);
    expect(effects.restHpBonus).toBe(10);
    expect(effects.fallImmunity).toBeTrue();
    expect(effects.statusImmunities.length).toBe(1);
    expect(effects.statusImmunities[0]).toBe('poison');
    // terrain_pass entries from parachute
    expect(effects.terrainPass.length).toBeGreaterThan(0);
  });

  it('getActiveEffects 禁用道具不产生效果', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('telescope');
    sys.addItem('leather_shoes');
    sys.toggleItem('telescope');
    sys.toggleItem('leather_shoes');

    const effects = sys.getActiveEffects();
    expect(effects.visionBonus).toBe(0);
    expect(effects.apBonus).toBe(0);
  });

  it('getActiveEffects 空背包返回零值', () => {
    const sys = new ItemSystem(testConfig);
    const effects = sys.getActiveEffects();
    expect(effects.visionBonus).toBe(0);
    expect(effects.apBonus).toBe(0);
    expect(effects.restHpBonus).toBe(0);
    expect(effects.fallImmunity).toBeFalse();
    expect(effects.terrainPass.length).toBe(0);
  });

  // --- getInventory ---
  it('getInventory 返回完整道具列表', () => {
    const sys = new ItemSystem(testConfig);
    sys.addItem('boat');
    sys.addItem('tent');
    sys.toggleItem('tent');

    const inv = sys.getInventory();
    expect(inv.length).toBe(2);

    const boatEntry = inv.find(i => i.itemId === 'boat');
    expect(boatEntry.name).toBe('船只');
    expect(boatEntry.enabled).toBeTrue();

    const tentEntry = inv.find(i => i.itemId === 'tent');
    expect(tentEntry.name).toBe('帐篷');
    expect(tentEntry.enabled).toBeFalse();
  });

  it('getInventory 空背包返回空数组', () => {
    const sys = new ItemSystem(testConfig);
    expect(sys.getInventory().length).toBe(0);
  });
});
