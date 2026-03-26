/**
 * TurnSystem 单元测试
 */
import { describe, it, expect, beforeEach } from '../test-runner.js';
import { TurnSystem } from '../../src/systems/TurnSystem.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { ItemSystem } from '../../src/systems/ItemSystem.js';
import { EventBus } from '../../src/core/EventBus.js';

// --- Test configs ---

const terrainConfig = {
  terrainTypes: {
    grass: {
      name: '草地',
      baseCost: 1,
      restEffect: { hpChange: 5, apBonus: 0 },
      overnightEventChance: 0.05,
      overnightEvents: ['wolf_attack', 'stargazing'],
    },
    forest: {
      name: '森林',
      baseCost: 1.5,
      restEffect: { hpChange: 8, apBonus: 0 },
      overnightEventChance: 0.12,
      overnightEvents: ['wolf_attack', 'forest_spirit'],
    },
    desert: {
      name: '荒漠',
      baseCost: 1.5,
      restEffect: { hpChange: 0, apBonus: 0 },
      overnightEventChance: 0.08,
      overnightEvents: ['sandstorm'],
    },
    swamp: {
      name: '沼泽',
      baseCost: 2,
      restEffect: { hpChange: -5, apBonus: 0, statusEffect: 'poison' },
      overnightEventChance: 0.15,
      overnightEvents: ['swamp_creature'],
    },
    lava: {
      name: '熔岩',
      baseCost: 2,
      restEffect: { hpChange: -15, apBonus: 0 },
      overnightEventChance: 0.2,
      overnightEvents: ['lava_eruption'],
    },
    water: {
      name: '水域',
      baseCost: 1,
      restEffect: { hpChange: 2, apBonus: 0 },
      overnightEventChance: 0.1,
      overnightEvents: ['sea_storm'],
    },
    ice: {
      name: '浮冰',
      baseCost: 1,
      restEffect: { hpChange: -3, apBonus: 0 },
      overnightEventChance: 0.1,
      overnightEvents: ['blizzard'],
    },
  },
};

const itemConfig = {
  items: {
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
    antidote: {
      name: '解毒药',
      quality: 'common',
      effects: [{ type: 'status_immunity', statusId: 'poison' }],
    },
    telescope: {
      name: '望远镜',
      quality: 'uncommon',
      effects: [{ type: 'vision_bonus', value: 2, permanent: true }],
    },
  },
};

/** Helper: create tile data */
function tile(terrain) {
  return { terrain, elevation: 3, building: null, event: null };
}

/** Helper: create a fresh TurnSystem with options */
function createSystem({ hp, hpMax, ap, apMax, items, statusEffects } = {}) {
  const player = new PlayerState({
    hp: hp ?? 80,
    hpMax: hpMax ?? 100,
    ap: ap ?? 5,
    apMax: apMax ?? 5,
    turnNumber: 1,
    statusEffects: statusEffects ?? [],
  });
  const itemSys = new ItemSystem(itemConfig);
  if (items) items.forEach(id => itemSys.addItem(id));
  const eventBus = new EventBus();
  const sys = new TurnSystem(player, terrainConfig, itemSys, eventBus);
  return { sys, player, itemSys, eventBus };
}

// ============================================================
// getEffectiveAPMax
// ============================================================
describe('TurnSystem — getEffectiveAPMax', () => {
  it('无道具无状态: 返回基础 apMax', () => {
    const { sys } = createSystem({ apMax: 5 });
    expect(sys.getEffectiveAPMax()).toBe(5);
  });

  it('皮靴 +1 AP 上限', () => {
    const { sys } = createSystem({ apMax: 5, items: ['leather_shoes'] });
    expect(sys.getEffectiveAPMax()).toBe(6);
  });

  it('负面状态降低 AP 上限', () => {
    const { sys } = createSystem({
      apMax: 5,
      statusEffects: [{ id: 'curse', duration: 2, effect: { apMaxModifier: -2 } }],
    });
    expect(sys.getEffectiveAPMax()).toBe(3);
  });

  it('道具 + 状态叠加', () => {
    const { sys } = createSystem({
      apMax: 5,
      items: ['leather_shoes'],
      statusEffects: [{ id: 'curse', duration: 2, effect: { apMaxModifier: -1 } }],
    });
    // 5 + 1 (shoes) - 1 (curse) = 5
    expect(sys.getEffectiveAPMax()).toBe(5);
  });

  it('AP 上限不低于 0', () => {
    const { sys } = createSystem({
      apMax: 1,
      statusEffects: [{ id: 'curse', duration: 2, effect: { apMaxModifier: -5 } }],
    });
    expect(sys.getEffectiveAPMax()).toBe(0);
  });
});

// ============================================================
// startNewTurn
// ============================================================
describe('TurnSystem — startNewTurn', () => {
  it('恢复 AP 至有效上限', () => {
    const { sys, player } = createSystem({ ap: 0, apMax: 5 });
    const result = sys.startNewTurn();
    expect(player.ap).toBe(5);
    expect(result.apRestored).toBe(5);
  });

  it('回合数递增', () => {
    const { sys, player } = createSystem();
    expect(player.turnNumber).toBe(1);
    sys.startNewTurn();
    expect(player.turnNumber).toBe(2);
    sys.startNewTurn();
    expect(player.turnNumber).toBe(3);
  });

  it('恢复 AP 含道具加成', () => {
    const { sys, player } = createSystem({ ap: 0, apMax: 5, items: ['leather_shoes'] });
    sys.startNewTurn();
    expect(player.ap).toBe(6); // 5 + 1
  });

  it('状态效果在新回合开始时 tick', () => {
    const { sys, player } = createSystem({
      ap: 0,
      apMax: 5,
      statusEffects: [{ id: 'poison', duration: 1, effect: { apCostModifier: 1 } }],
    });
    expect(player.statusEffects.length).toBe(1);
    sys.startNewTurn();
    // duration was 1, after tick it's 0 → removed
    expect(player.statusEffects.length).toBe(0);
  });

  it('多回合状态效果持续存在', () => {
    const { sys, player } = createSystem({
      ap: 0,
      apMax: 5,
      statusEffects: [{ id: 'poison', duration: 3, effect: { apCostModifier: 1 } }],
    });
    sys.startNewTurn();
    expect(player.statusEffects.length).toBe(1);
    expect(player.statusEffects[0].duration).toBe(2);
  });

  it('触发 turn:start 事件', () => {
    const { sys, eventBus } = createSystem({ ap: 0, apMax: 5 });
    let emitted = null;
    eventBus.on('turn:start', data => { emitted = data; });
    sys.startNewTurn();
    expect(emitted !== null).toBeTrue();
    expect(emitted.turnNumber).toBe(2);
    expect(emitted.apRestored).toBe(5);
  });
});

// ============================================================
// calculateRestEffect
// ============================================================
describe('TurnSystem — calculateRestEffect', () => {
  it('草地: +5 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('grass'));
    expect(result.hpChange).toBe(5);
    expect(result.apBonus).toBe(0);
    expect(result.statusEffects.length).toBe(0);
  });

  it('森林: +8 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('forest'));
    expect(result.hpChange).toBe(8);
  });

  it('荒漠: 0 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('desert'));
    expect(result.hpChange).toBe(0);
  });

  it('沼泽: -5 HP + poison 状态', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('swamp'));
    expect(result.hpChange).toBe(-5);
    expect(result.statusEffects.length).toBe(1);
    expect(result.statusEffects[0].id).toBe('poison');
  });

  it('熔岩: -15 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('lava'));
    expect(result.hpChange).toBe(-15);
  });

  it('帐篷增加休息 HP 回复', () => {
    const { sys } = createSystem({ items: ['tent'] });
    const result = sys.calculateRestEffect(tile('grass'));
    // grass +5 + tent +10 = +15
    expect(result.hpChange).toBe(15);
  });

  it('帐篷 + 熔岩: -15 + 10 = -5', () => {
    const { sys } = createSystem({ items: ['tent'] });
    const result = sys.calculateRestEffect(tile('lava'));
    expect(result.hpChange).toBe(-5);
  });

  it('解毒药抵消沼泽中毒 + 负面 HP', () => {
    const { sys } = createSystem({ items: ['antidote'] });
    const result = sys.calculateRestEffect(tile('swamp'));
    // Antidote blocks poison status AND associated negative HP
    expect(result.statusEffects.length).toBe(0);
    expect(result.hpChange).toBe(0); // -5 negated, no item rest bonus
  });

  it('水域: +2 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('water'));
    expect(result.hpChange).toBe(2);
  });

  it('浮冰: -3 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('ice'));
    expect(result.hpChange).toBe(-3);
  });

  it('未知地形: 默认 0 HP', () => {
    const { sys } = createSystem();
    const result = sys.calculateRestEffect(tile('unknown_terrain'));
    expect(result.hpChange).toBe(0);
    expect(result.apBonus).toBe(0);
  });
});

// ============================================================
// endTurn
// ============================================================
describe('TurnSystem — endTurn', () => {
  it('草地休息回复 HP', () => {
    const { sys, player } = createSystem({ hp: 80, hpMax: 100, ap: 0 });
    const result = sys.endTurn(tile('grass'));
    expect(result.hpChange).toBe(5);
    expect(player.hp).toBe(85);
  });

  it('HP 不超过上限 (cap)', () => {
    const { sys, player } = createSystem({ hp: 98, hpMax: 100, ap: 0 });
    const result = sys.endTurn(tile('grass'));
    // grass +5 but capped at 100
    expect(result.hpChange).toBe(2);
    expect(player.hp).toBe(100);
  });

  it('HP 已满时不再增加', () => {
    const { sys, player } = createSystem({ hp: 100, hpMax: 100, ap: 0 });
    const result = sys.endTurn(tile('grass'));
    expect(result.hpChange).toBe(0);
    expect(player.hp).toBe(100);
  });

  it('沼泽负面效果扣 HP', () => {
    const { sys, player } = createSystem({ hp: 80, hpMax: 100, ap: 0 });
    const result = sys.endTurn(tile('swamp'));
    expect(result.hpChange).toBe(-5);
    expect(player.hp).toBe(75);
  });

  it('熔岩负面效果扣 HP', () => {
    const { sys, player } = createSystem({ hp: 80, hpMax: 100, ap: 0 });
    const result = sys.endTurn(tile('lava'));
    expect(result.hpChange).toBe(-15);
    expect(player.hp).toBe(65);
  });

  it('剩余 AP 默认丢弃', () => {
    const { sys, player } = createSystem({ hp: 80, ap: 3, apMax: 5 });
    sys.endTurn(tile('grass'));
    expect(player.ap).toBe(0);
  });

  it('触发 turn:end 事件', () => {
    const { sys, eventBus } = createSystem({ hp: 80, ap: 0 });
    let emitted = null;
    eventBus.on('turn:end', data => { emitted = data; });
    sys.endTurn(tile('grass'));
    expect(emitted !== null).toBeTrue();
    expect(emitted.hpChange).toBe(5);
  });

  it('沼泽休息添加 poison 状态', () => {
    const { sys, player } = createSystem({ hp: 80, ap: 0 });
    sys.endTurn(tile('swamp'));
    expect(player.statusEffects.length).toBe(1);
    expect(player.statusEffects[0].id).toBe('poison');
  });
});

// ============================================================
// handleRemainingAP
// ============================================================
describe('TurnSystem — handleRemainingAP', () => {
  it('无特殊道具: 丢弃剩余 AP', () => {
    const { sys } = createSystem({ ap: 3 });
    const result = sys.handleRemainingAP(3);
    expect(result.converted).toBeFalse();
    expect(result.apCarried).toBe(0);
  });

  it('AP 为 0: 无操作', () => {
    const { sys } = createSystem({ ap: 0 });
    const result = sys.handleRemainingAP(0);
    expect(result.converted).toBeFalse();
    expect(result.apCarried).toBe(0);
  });

  it('负 AP: 无操作', () => {
    const { sys } = createSystem();
    const result = sys.handleRemainingAP(-1);
    expect(result.converted).toBeFalse();
    expect(result.apCarried).toBe(0);
  });
});

// ============================================================
// Full turn cycle
// ============================================================
describe('TurnSystem — 完整回合流程', () => {
  it('endTurn → startNewTurn 完整循环', () => {
    const { sys, player } = createSystem({ hp: 80, hpMax: 100, ap: 2, apMax: 5 });

    // End turn on grass
    sys.endTurn(tile('grass'));
    expect(player.hp).toBe(85); // +5 from grass
    expect(player.ap).toBe(0);  // remaining AP discarded

    // Start new turn
    const result = sys.startNewTurn();
    expect(player.ap).toBe(5);  // restored to apMax
    expect(player.turnNumber).toBe(2);
    expect(result.apRestored).toBe(5);
  });

  it('道具加成贯穿回合', () => {
    const { sys, player } = createSystem({
      hp: 70, hpMax: 100, ap: 1, apMax: 5,
      items: ['leather_shoes', 'tent'],
    });

    // End turn on forest: +8 (forest) + 10 (tent) = +18
    sys.endTurn(tile('forest'));
    expect(player.hp).toBe(88);
    expect(player.ap).toBe(0);

    // Start new turn: AP restored to 5 + 1 (shoes) = 6
    sys.startNewTurn();
    expect(player.ap).toBe(6);
  });

  it('状态效果跨回合递减', () => {
    const { sys, player } = createSystem({
      hp: 80, ap: 0, apMax: 5,
      statusEffects: [{ id: 'poison', duration: 2, effect: { apCostModifier: 1 } }],
    });

    // Turn 2: tick → duration 2→1
    sys.startNewTurn();
    expect(player.statusEffects.length).toBe(1);
    expect(player.statusEffects[0].duration).toBe(1);

    // Turn 3: tick → duration 1→0 → removed
    sys.startNewTurn();
    expect(player.statusEffects.length).toBe(0);
  });
});


// ============================================================
// _rollOvernightEvents — Priority system (Task 2)
// ============================================================
describe('TurnSystem — _rollOvernightEvents priority system', () => {
  // Helper: create system with extended item config for overnight events
  const overnightItemConfig = {
    items: {
      ...itemConfig.items,
      thief_medal: {
        name: '盗贼勋章',
        quality: 'uncommon',
        effects: [
          { type: 'gold_bonus', source: 'combat', value: 10 },
          { type: 'event_option_unlock', optionTag: 'thief_immunity' },
        ],
      },
      sheriff_badge: {
        name: '警长勋章',
        quality: 'uncommon',
        effects: [
          { type: 'event_option_unlock', optionTag: 'arrest' },
          { type: 'gold_bonus', source: 'city_rest', value: 15 },
        ],
      },
      accordion: {
        name: '手风琴',
        quality: 'uncommon',
        effects: [
          { type: 'overnight_party', hpBonus: 10, chance: 0.3 },
        ],
      },
      torch: {
        name: '火把',
        quality: 'uncommon',
        effects: [
          { type: 'status_immunity', statusId: 'frostbite' },
        ],
      },
      shovel: {
        name: '铲子',
        quality: 'uncommon',
        effects: [
          { type: 'event_option_unlock', optionTag: 'dig' },
        ],
      },
      hoe: {
        name: '锄头',
        quality: 'common',
        effects: [
          { type: 'event_option_unlock', optionTag: 'clear_path' },
        ],
      },
      sickle: {
        name: '镰刀',
        quality: 'common',
        effects: [
          { type: 'farm_rest_bonus', value: 20 },
        ],
      },
      camper_van: {
        name: '房车',
        quality: 'legendary',
        effects: [
          { type: 'overnight_safety', encounterReduction: 0.5 },
          { type: 'rest_hp_bonus', value: 20 },
        ],
      },
    },
  };

  function createOvernightSystem({ items, hp, ap } = {}) {
    const player = new PlayerState({
      hp: hp ?? 80,
      hpMax: 100,
      ap: ap ?? 5,
      apMax: 5,
      turnNumber: 1,
    });
    const itemSys = new ItemSystem(overnightItemConfig);
    if (items) items.forEach(id => itemSys.addItem(id));
    const eventBus = new EventBus();
    const sys = new TurnSystem(player, terrainConfig, itemSys, eventBus);
    return { sys, player, itemSys };
  }

  it('城市过夜: 默认返回 overnight_city_rest', () => {
    const { sys } = createOvernightSystem();
    // Run many times to confirm city always returns a city event
    let gotCityRest = false;
    for (let i = 0; i < 50; i++) {
      const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3, building: 'city' });
      if (events.length > 0 && events[0] === 'overnight_city_rest') {
        gotCityRest = true;
        break;
      }
    }
    expect(gotCityRest).toBeTrue();
  });

  it('城市 + 警长勋章: 返回 overnight_city_rest_sheriff', () => {
    const { sys } = createOvernightSystem({ items: ['sheriff_badge'] });
    const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3, building: 'city' });
    expect(events.length).toBe(1);
    expect(events[0]).toBe('overnight_city_rest_sheriff');
  });

  it('农田 + 镰刀: 返回 overnight_farm_harvest', () => {
    const { sys } = createOvernightSystem({ items: ['sickle'] });
    const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3, building: 'farm' });
    expect(events.length).toBe(1);
    expect(events[0]).toBe('overnight_farm_harvest');
  });

  it('农田无镰刀: 不触发农田收获', () => {
    const { sys } = createOvernightSystem();
    const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3, building: 'farm' });
    // Farm without hoe returns null from building, falls through to other priorities
    expect(events.length <= 1).toBeTrue();
    if (events.length === 1) {
      expect(events[0] !== 'overnight_farm_harvest').toBeTrue();
    }
  });

  it('只返回最多一个过夜事件', () => {
    const { sys } = createOvernightSystem({ items: ['accordion', 'torch', 'shovel'] });
    for (let i = 0; i < 100; i++) {
      const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3 });
      expect(events.length <= 1).toBeTrue();
    }
  });

  it('建筑事件优先于道具事件', () => {
    const { sys } = createOvernightSystem({ items: ['accordion', 'torch', 'sheriff_badge'] });
    // City + sheriff badge should always return city event, not accordion event
    const events = sys._rollOvernightEvents({ terrain: 'grass', elevation: 3, building: 'city' });
    expect(events.length).toBe(1);
    // Should be a city event, not an accordion event
    expect(events[0].startsWith('overnight_city') || events[0] === 'overnight_city_rest_sheriff').toBeTrue();
  });

  it('铲子在水域不触发挖掘', () => {
    const { sys } = createOvernightSystem({ items: ['shovel'] });
    let gotDig = false;
    for (let i = 0; i < 200; i++) {
      const events = sys._rollOvernightEvents({ terrain: 'water', elevation: 3 });
      if (events.length > 0 && events[0] === 'overnight_dig') {
        gotDig = true;
        break;
      }
    }
    expect(gotDig).toBeFalse();
  });

  it('房车降低过夜事件概率', () => {
    // With camper_van (50% reduction), generic events should be less frequent
    const { sys: sysNormal } = createOvernightSystem();
    const { sys: sysSafe } = createOvernightSystem({ items: ['camper_van'] });

    let normalCount = 0;
    let safeCount = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const e1 = sysNormal._rollOvernightEvents({ terrain: 'grass', elevation: 3 });
      if (e1.length > 0) normalCount++;
      const e2 = sysSafe._rollOvernightEvents({ terrain: 'grass', elevation: 3 });
      if (e2.length > 0) safeCount++;
    }

    // Safe count should be noticeably lower than normal count
    // (not a strict test due to randomness, but with 1000 runs it should be clear)
    expect(safeCount < normalCount).toBeTrue();
  });
});

// ============================================================
// _rollBuildingOvernightEvent
// ============================================================
describe('TurnSystem — _rollBuildingOvernightEvent', () => {
  const overnightItemConfig2 = {
    items: {
      ...itemConfig.items,
      thief_medal: {
        name: '盗贼勋章',
        quality: 'uncommon',
        effects: [{ type: 'event_option_unlock', optionTag: 'thief_immunity' }],
      },
      sheriff_badge: {
        name: '警长勋章',
        quality: 'uncommon',
        effects: [{ type: 'event_option_unlock', optionTag: 'arrest' }],
      },
      hoe: {
        name: '锄头',
        quality: 'common',
        effects: [{ type: 'event_option_unlock', optionTag: 'clear_path' }],
      },
    },
  };

  function createSys2(items) {
    const player = new PlayerState({ hp: 80, hpMax: 100, ap: 5, apMax: 5, turnNumber: 1 });
    const itemSys = new ItemSystem(overnightItemConfig2);
    if (items) items.forEach(id => itemSys.addItem(id));
    const eventBus = new EventBus();
    return new TurnSystem(player, terrainConfig, itemSys, eventBus);
  }

  it('无建筑返回 null', () => {
    const sys = createSys2();
    const result = sys._rollBuildingOvernightEvent({ terrain: 'grass' }, 1);
    expect(result === null).toBeTrue();
  });

  it('未知建筑返回 null', () => {
    const sys = createSys2();
    const result = sys._rollBuildingOvernightEvent({ terrain: 'grass', building: 'unknown' }, 1);
    expect(result === null).toBeTrue();
  });

  it('城市 + 盗贼勋章: 概率返回 overnight_city_thief', () => {
    const sys = createSys2(['thief_medal']);
    let gotThief = false;
    let gotOther = false;
    for (let i = 0; i < 200; i++) {
      const result = sys._rollBuildingOvernightEvent({ terrain: 'grass', building: 'city' }, 1);
      if (result === 'overnight_city_thief') gotThief = true;
      else gotOther = true;
    }
    // Should sometimes get thief (30%) and sometimes not
    expect(gotThief).toBeTrue();
    expect(gotOther).toBeTrue();
  });
});

// ============================================================
// _rollGenericOvernightEvent
// ============================================================
describe('TurnSystem — _rollGenericOvernightEvent', () => {
  it('高海拔/浮冰增加生病概率', () => {
    const { sys: sysNormal } = createSystem();
    const { sys: sysIce } = createSystem();

    let normalSick = 0;
    let iceSick = 0;
    const runs = 5000;

    for (let i = 0; i < runs; i++) {
      const e1 = sysNormal._rollGenericOvernightEvent({ terrain: 'grass', elevation: 3 }, {}, 1);
      if (e1 === 'overnight_sick') normalSick++;
      const e2 = sysIce._rollGenericOvernightEvent({ terrain: 'ice', elevation: 9 }, {}, 1);
      if (e2 === 'overnight_sick') iceSick++;
    }

    // Ice + high elevation should have more sick events
    expect(iceSick > normalSick).toBeTrue();
  });
});