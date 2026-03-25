/**
 * MovementSystem 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { MovementSystem } from '../../src/systems/MovementSystem.js';
import { ItemSystem } from '../../src/systems/ItemSystem.js';
import { PlayerState } from '../../src/systems/PlayerState.js';
import { SeededRandom } from '../../src/utils/SeededRandom.js';

// --- Test configs ---

const terrainConfig = {
  terrainTypes: {
    grass:  { name: '草地', baseCost: 1,   requiredItem: null },
    desert: { name: '荒漠', baseCost: 1.5, requiredItem: null },
    forest: { name: '森林', baseCost: 1.5, requiredItem: null },
    swamp:  { name: '沼泽', baseCost: 2,   requiredItem: null },
    water:  { name: '水域', baseCost: 1,   requiredItem: 'boat', waterExitCostExtra: 1 },
    lava:   { name: '熔岩', baseCost: 2,   requiredItem: 'fire_boots' },
    ice:    { name: '浮冰', baseCost: 1,   requiredItem: null },
  },
};

const itemConfig = {
  items: {
    rope_claw:  { name: '钩爪',   quality: 'rare',     effects: [{ type: 'terrain_pass', condition: 'elevationDelta > 3' }] },
    parachute:  { name: '降落伞', quality: 'rare',     effects: [{ type: 'fall_immunity' }, { type: 'terrain_pass', condition: 'elevationDelta <= -4' }] },
    boat:       { name: '船只',   quality: 'uncommon', effects: [{ type: 'terrain_pass', terrainType: 'water' }] },
    fire_boots: { name: '防火靴', quality: 'rare',     effects: [{ type: 'terrain_pass', terrainType: 'lava' }, { type: 'enter_damage_immunity', terrainType: 'lava' }] },
  },
};

/** Helper: create a tile object */
function tile(terrain, elevation, q = 0, r = 0) {
  return { q, r, terrain, elevation, building: null, event: null, fogState: 'visible' };
}

/** Helper: create a fresh system with given AP and optional items + seed */
function createSystem({ ap = 5, items = [], seed = 42 } = {}) {
  const player = new PlayerState({ ap, apMax: 10, hp: 100, hpMax: 100 });
  const itemSys = new ItemSystem(itemConfig);
  items.forEach(id => itemSys.addItem(id));
  const rng = new SeededRandom(seed);
  const sys = new MovementSystem(terrainConfig, itemSys, player, { rng });
  return { sys, player, itemSys, rng };
}


// ============================================================
// getTerrainBaseCost
// ============================================================
describe('MovementSystem — getTerrainBaseCost', () => {
  it('草地基础消耗为 1', () => {
    const { sys } = createSystem();
    expect(sys.getTerrainBaseCost('grass')).toBe(1);
  });

  it('沼泽基础消耗为 2', () => {
    const { sys } = createSystem();
    expect(sys.getTerrainBaseCost('swamp')).toBe(2);
  });

  it('荒漠基础消耗为 1.5', () => {
    const { sys } = createSystem();
    expect(sys.getTerrainBaseCost('desert')).toBe(1.5);
  });

  it('未知地形默认消耗为 1', () => {
    const { sys } = createSystem();
    expect(sys.getTerrainBaseCost('unknown')).toBe(1);
  });
});

// ============================================================
// getElevationDelta
// ============================================================
describe('MovementSystem — getElevationDelta', () => {
  it('同海拔 Δe = 0', () => {
    const { sys } = createSystem();
    expect(sys.getElevationDelta(tile('grass', 3), tile('grass', 3))).toBe(0);
  });

  it('上坡 Δe > 0', () => {
    const { sys } = createSystem();
    expect(sys.getElevationDelta(tile('grass', 2), tile('grass', 5))).toBe(3);
  });

  it('下坡 Δe < 0', () => {
    const { sys } = createSystem();
    expect(sys.getElevationDelta(tile('grass', 5), tile('grass', 2))).toBe(-3);
  });
});

// ============================================================
// calculateAPCost
// ============================================================
describe('MovementSystem — calculateAPCost', () => {
  it('Δe=0 草地: cost = 1 (base only)', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 3), tile('grass', 3))).toBe(1);
  });

  it('Δe=0 沼泽: cost = 2 (base only)', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 3), tile('swamp', 3))).toBe(2);
  });

  it('Δe=+1 草地: cost = 1 + 1 = 2', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 3), tile('grass', 4))).toBe(2);
  });

  it('Δe=+2 森林: cost = 1.5 + 2 = 3.5', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 3), tile('forest', 5))).toBe(3.5);
  });

  it('Δe=+3 草地: cost = 1 + 3 = 4', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 2), tile('grass', 5))).toBe(4);
  });

  it('下坡 Δe=-1: cost = 0.5 (fixed)', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 5), tile('grass', 4))).toBe(0.5);
  });

  it('下坡 Δe=-3: cost = 0.5 (fixed, ignores terrain)', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 5), tile('swamp', 2))).toBe(0.5);
  });

  it('下坡 Δe=-5: cost = 0.5 (fixed)', () => {
    const { sys } = createSystem();
    expect(sys.calculateAPCost(tile('grass', 8), tile('grass', 3))).toBe(0.5);
  });

  it('水域进入: 额外 +1 AP', () => {
    const { sys } = createSystem({ items: ['boat'] });
    // grass→water same elevation: base(1) + extra(1) = 2
    expect(sys.calculateAPCost(tile('grass', 3), tile('water', 3))).toBe(2);
  });

  it('水域离开: 额外 +1 AP', () => {
    const { sys } = createSystem({ items: ['boat'] });
    // water→grass same elevation: base(1) + extra(1) = 2
    expect(sys.calculateAPCost(tile('water', 3), tile('grass', 3))).toBe(2);
  });

  it('水域内部移动: 无额外 AP (同为水域)', () => {
    const { sys } = createSystem({ items: ['boat'] });
    // water→water same elevation: base(1), no entry/exit
    expect(sys.calculateAPCost(tile('water', 3), tile('water', 3))).toBe(1);
  });
});


// ============================================================
// canMoveTo — terrain required items
// ============================================================
describe('MovementSystem — canMoveTo (terrain items)', () => {
  it('水域无船只: 阻止', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 3), tile('water', 3));
    expect(result.allowed).toBeFalse();
    expect(result.requiredItem).toBe('boat');
  });

  it('水域有船只: 允许', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('grass', 3), tile('water', 3));
    expect(result.allowed).toBeTrue();
  });

  it('熔岩无防火靴: 阻止', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 3), tile('lava', 3));
    expect(result.allowed).toBeFalse();
    expect(result.requiredItem).toBe('fire_boots');
  });

  it('熔岩有防火靴: 允许', () => {
    const { sys } = createSystem({ items: ['fire_boots'] });
    const result = sys.canMoveTo(tile('grass', 3), tile('lava', 3));
    expect(result.allowed).toBeTrue();
  });

  it('普通地形无需道具: 允许', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 3), tile('forest', 3));
    expect(result.allowed).toBeTrue();
  });
});

// ============================================================
// canMoveTo — elevation blocks
// ============================================================
describe('MovementSystem — canMoveTo (elevation)', () => {
  it('Δe=+4 无钩爪: 阻止', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 1), tile('grass', 5));
    expect(result.allowed).toBeFalse();
    expect(result.requiredItem).toBe('rope_claw');
  });

  it('Δe=+4 有钩爪: 允许', () => {
    const { sys } = createSystem({ items: ['rope_claw'] });
    const result = sys.canMoveTo(tile('grass', 1), tile('grass', 5));
    expect(result.allowed).toBeTrue();
  });

  it('Δe=+5 有钩爪: 允许', () => {
    const { sys } = createSystem({ ap: 10, items: ['rope_claw'] });
    const result = sys.canMoveTo(tile('grass', 0), tile('grass', 5));
    expect(result.allowed).toBeTrue();
  });

  it('Δe=-4 无降落伞: 阻止', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 5), tile('grass', 1));
    expect(result.allowed).toBeFalse();
    expect(result.requiredItem).toBe('parachute');
  });

  it('Δe=-4 有降落伞: 允许', () => {
    const { sys } = createSystem({ items: ['parachute'] });
    const result = sys.canMoveTo(tile('grass', 5), tile('grass', 1));
    expect(result.allowed).toBeTrue();
  });

  it('Δe=-5 有降落伞: 允许', () => {
    const { sys } = createSystem({ items: ['parachute'] });
    const result = sys.canMoveTo(tile('grass', 8), tile('grass', 3));
    expect(result.allowed).toBeTrue();
  });

  it('Δe=+3 无钩爪: 允许 (不需要钩爪)', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 2), tile('grass', 5));
    expect(result.allowed).toBeTrue();
  });

  it('Δe=-3 无降落伞: 允许 (有摔伤风险但不阻止)', () => {
    const { sys } = createSystem();
    const result = sys.canMoveTo(tile('grass', 5), tile('grass', 2));
    expect(result.allowed).toBeTrue();
  });
});

// ============================================================
// canMoveTo — water elevation rule
// ============================================================
describe('MovementSystem — canMoveTo (water rules)', () => {
  it('进入水域海拔不同: 阻止', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('grass', 3), tile('water', 5));
    expect(result.allowed).toBeFalse();
    expect(result.reason).toContain('海拔');
  });

  it('进入水域海拔相同: 允许', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('grass', 3), tile('water', 3));
    expect(result.allowed).toBeTrue();
  });

  it('离开水域海拔不同: 阻止', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('water', 3), tile('grass', 5));
    expect(result.allowed).toBeFalse();
  });

  it('离开水域海拔相同: 允许', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('water', 3), tile('grass', 3));
    expect(result.allowed).toBeTrue();
  });

  it('水域内部移动 (water→water): 允许', () => {
    const { sys } = createSystem({ items: ['boat'] });
    const result = sys.canMoveTo(tile('water', 3), tile('water', 3));
    expect(result.allowed).toBeTrue();
  });
});

// ============================================================
// canMoveTo — AP insufficiency
// ============================================================
describe('MovementSystem — canMoveTo (AP check)', () => {
  it('AP 不足: 阻止', () => {
    const { sys } = createSystem({ ap: 0.4 });
    const result = sys.canMoveTo(tile('grass', 3), tile('grass', 3));
    expect(result.allowed).toBeFalse();
    expect(result.reason).toContain('AP');
  });

  it('AP 刚好足够: 允许', () => {
    const { sys } = createSystem({ ap: 1 });
    const result = sys.canMoveTo(tile('grass', 3), tile('grass', 3));
    expect(result.allowed).toBeTrue();
  });

  it('AP 不足以上坡: 阻止', () => {
    const { sys } = createSystem({ ap: 2 });
    // Δe=+2 grass: cost = 1 + 2 = 3
    const result = sys.canMoveTo(tile('grass', 3), tile('grass', 5));
    expect(result.allowed).toBeFalse();
  });
});


// ============================================================
// executeMove — basic movement
// ============================================================
describe('MovementSystem — executeMove (basic)', () => {
  it('平地移动: 扣减 AP, 成功', () => {
    const { sys, player } = createSystem({ ap: 5 });
    const result = sys.executeMove(tile('grass', 3, 0, 0), tile('grass', 3, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.apCost).toBe(1);
    expect(player.ap).toBe(4);
    expect(player.position.q).toBe(1);
    expect(player.position.r).toBe(0);
  });

  it('上坡移动: 扣减 base + Δe AP', () => {
    const { sys, player } = createSystem({ ap: 5 });
    const result = sys.executeMove(tile('grass', 3, 0, 0), tile('grass', 5, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.apCost).toBe(3); // 1 + 2
    expect(player.ap).toBe(2);
  });

  it('下坡移动: 扣减 0.5 AP', () => {
    const { sys, player } = createSystem({ ap: 5 });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 4, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.apCost).toBe(0.5);
    expect(player.ap).toBe(4.5);
  });

  it('AP 不足时 executeMove 失败', () => {
    const { sys, player } = createSystem({ ap: 0.3 });
    const result = sys.executeMove(tile('grass', 3, 0, 0), tile('grass', 3, 1, 0));
    expect(result.success).toBeFalse();
    expect(player.ap).toBe(0.3); // unchanged
  });
});

// ============================================================
// executeMove — fall damage (deterministic with SeededRandom)
// ============================================================
describe('MovementSystem — executeMove (fall damage)', () => {
  it('Δe=-1 无降落伞: 使用种子确定摔伤结果', () => {
    // We test multiple seeds to find one that triggers and one that doesn't
    // Seed 42: first random value determines if < 0.1
    const { sys, player, rng } = createSystem({ ap: 5, seed: 42 });
    const firstRoll = new SeededRandom(42).next();

    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 4, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.apCost).toBe(0.5);

    if (firstRoll < 0.1) {
      expect(result.damage).toBe(10);
      expect(result.damageType).toBe('fall');
      expect(player.hp).toBe(90);
    } else {
      // No damage
      expect(result.damage).toBeUndefined();
      expect(player.hp).toBe(100);
    }
  });

  it('Δe=-3 无降落伞: 40% 概率 30HP 摔伤', () => {
    const { sys, player } = createSystem({ ap: 5, seed: 100 });
    const firstRoll = new SeededRandom(100).next();

    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 2, 1, 0));
    expect(result.success).toBeTrue();

    if (firstRoll < 0.4) {
      expect(result.damage).toBe(30);
      expect(result.damageType).toBe('fall');
      expect(player.hp).toBe(70);
    } else {
      expect(result.damage).toBeUndefined();
      expect(player.hp).toBe(100);
    }
  });

  it('Δe=-2 有降落伞: 免疫摔伤', () => {
    const { sys, player } = createSystem({ ap: 5, items: ['parachute'], seed: 1 });
    // Even with a seed that would trigger damage, parachute prevents it
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 3, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });

  it('Δe=-4 有降落伞: 免疫摔伤且允许通行', () => {
    const { sys, player } = createSystem({ ap: 5, items: ['parachute'], seed: 1 });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 1, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });

  it('上坡移动: 无摔伤', () => {
    const { sys, player } = createSystem({ ap: 10, seed: 1 });
    const result = sys.executeMove(tile('grass', 3, 0, 0), tile('grass', 6, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });

  it('平地移动: 无摔伤', () => {
    const { sys, player } = createSystem({ ap: 5, seed: 1 });
    const result = sys.executeMove(tile('grass', 3, 0, 0), tile('grass', 3, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });
});

// ============================================================
// Deterministic fall damage with specific seeds
// ============================================================
describe('MovementSystem — deterministic fall damage', () => {
  it('找到触发 Δe=-1~-2 摔伤的种子', () => {
    // Search for a seed where first roll < 0.1
    let triggerSeed = null;
    for (let s = 0; s < 1000; s++) {
      const r = new SeededRandom(s).next();
      if (r < 0.1) { triggerSeed = s; break; }
    }
    // There must be at least one such seed in 0..999
    expect(triggerSeed !== null).toBeTrue();

    const { sys, player } = createSystem({ ap: 5, seed: triggerSeed });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 4, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBe(10);
    expect(result.damageType).toBe('fall');
    expect(player.hp).toBe(90);
  });

  it('找到不触发 Δe=-1~-2 摔伤的种子', () => {
    let safeSeed = null;
    for (let s = 0; s < 1000; s++) {
      const r = new SeededRandom(s).next();
      if (r >= 0.1) { safeSeed = s; break; }
    }
    expect(safeSeed !== null).toBeTrue();

    const { sys, player } = createSystem({ ap: 5, seed: safeSeed });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 4, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });

  it('找到触发 Δe=-3 摔伤的种子 (roll < 0.4)', () => {
    let triggerSeed = null;
    for (let s = 0; s < 1000; s++) {
      const r = new SeededRandom(s).next();
      if (r < 0.4) { triggerSeed = s; break; }
    }
    expect(triggerSeed !== null).toBeTrue();

    const { sys, player } = createSystem({ ap: 5, seed: triggerSeed });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 2, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBe(30);
    expect(result.damageType).toBe('fall');
    expect(player.hp).toBe(70);
  });

  it('找到不触发 Δe=-3 摔伤的种子 (roll >= 0.4)', () => {
    let safeSeed = null;
    for (let s = 0; s < 1000; s++) {
      const r = new SeededRandom(s).next();
      if (r >= 0.4) { safeSeed = s; break; }
    }
    expect(safeSeed !== null).toBeTrue();

    const { sys, player } = createSystem({ ap: 5, seed: safeSeed });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 2, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });

  it('降落伞免疫: 即使种子会触发摔伤也不受伤', () => {
    let triggerSeed = null;
    for (let s = 0; s < 1000; s++) {
      const r = new SeededRandom(s).next();
      if (r < 0.1) { triggerSeed = s; break; }
    }
    expect(triggerSeed !== null).toBeTrue();

    const { sys, player } = createSystem({ ap: 5, items: ['parachute'], seed: triggerSeed });
    const result = sys.executeMove(tile('grass', 5, 0, 0), tile('grass', 4, 1, 0));
    expect(result.success).toBeTrue();
    expect(result.damage).toBeUndefined();
    expect(player.hp).toBe(100);
  });
});