/**
 * PlayerState 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { PlayerState } from '../../src/systems/PlayerState.js';

describe('PlayerState', () => {
  // --- 默认初始化 ---
  it('默认初始化 HP=100, AP=5, 位置(0,0)', () => {
    const p = new PlayerState();
    expect(p.hp).toBe(100);
    expect(p.hpMax).toBe(100);
    expect(p.ap).toBe(5);
    expect(p.apMax).toBe(5);
    expect(p.position.q).toBe(0);
    expect(p.position.r).toBe(0);
    expect(p.turnNumber).toBe(1);
    expect(p.relicsCollected).toBe(0);
    expect(p.statusEffects.length).toBe(0);
  });

  // --- HP 边界 ---
  it('HP 不能超过 hpMax', () => {
    const p = new PlayerState({ hp: 200, hpMax: 100 });
    expect(p.hp).toBe(100);
  });

  it('HP 不能低于 0', () => {
    const p = new PlayerState({ hp: -10, hpMax: 100 });
    expect(p.hp).toBe(0);
  });

  // --- applyDamage ---
  it('applyDamage 正常扣减 HP', () => {
    const p = new PlayerState();
    const result = p.applyDamage(30, 'combat');
    expect(result.actualDamage).toBe(30);
    expect(result.immunized).toBeFalse();
    expect(p.hp).toBe(70);
  });

  it('applyDamage 不会让 HP 低于 0', () => {
    const p = new PlayerState({ hp: 20 });
    const result = p.applyDamage(50, 'fall');
    expect(result.actualDamage).toBe(20);
    expect(p.hp).toBe(0);
  });

  it('applyDamage 0 或负数不造成伤害', () => {
    const p = new PlayerState();
    const r1 = p.applyDamage(0, 'test');
    expect(r1.actualDamage).toBe(0);
    expect(p.hp).toBe(100);
    const r2 = p.applyDamage(-5, 'test');
    expect(r2.actualDamage).toBe(0);
    expect(p.hp).toBe(100);
  });

  // --- heal ---
  it('heal 正常回复 HP', () => {
    const p = new PlayerState({ hp: 50 });
    const healed = p.heal(30);
    expect(healed).toBe(30);
    expect(p.hp).toBe(80);
  });

  it('heal 不会超过 hpMax', () => {
    const p = new PlayerState({ hp: 90 });
    const healed = p.heal(20);
    expect(healed).toBe(10);
    expect(p.hp).toBe(100);
  });

  it('heal 0 或负数不回复', () => {
    const p = new PlayerState({ hp: 50 });
    expect(p.heal(0)).toBe(0);
    expect(p.heal(-10)).toBe(0);
    expect(p.hp).toBe(50);
  });

  // --- 状态效果生命周期 ---
  it('addStatusEffect 添加状态效果', () => {
    const p = new PlayerState();
    p.addStatusEffect({ id: 'poison', duration: 3, effect: { apCostModifier: 1 } });
    expect(p.statusEffects.length).toBe(1);
    expect(p.statusEffects[0].id).toBe('poison');
    expect(p.statusEffects[0].duration).toBe(3);
  });

  it('tickStatusEffects 减少持续时间并移除过期效果', () => {
    const p = new PlayerState();
    p.addStatusEffect({ id: 'poison', duration: 2, effect: {} });
    p.addStatusEffect({ id: 'bless', duration: 1, effect: {} });

    const expired1 = p.tickStatusEffects();
    // bless (duration was 1) should expire, poison (duration was 2 → 1) stays
    expect(expired1.length).toBe(1);
    expect(expired1[0].expired).toBe('bless');
    expect(p.statusEffects.length).toBe(1);
    expect(p.statusEffects[0].id).toBe('poison');

    const expired2 = p.tickStatusEffects();
    // poison (duration was 1 → 0) should expire
    expect(expired2.length).toBe(1);
    expect(expired2[0].expired).toBe('poison');
    expect(p.statusEffects.length).toBe(0);
  });

  it('tickStatusEffects 无效果时返回空数组', () => {
    const p = new PlayerState();
    const expired = p.tickStatusEffects();
    expect(expired.length).toBe(0);
  });

  // --- toJSON / fromJSON 往返一致性 ---
  it('toJSON/fromJSON 往返一致', () => {
    const original = new PlayerState({
      position: { q: 5, r: -3 },
      hp: 72,
      hpMax: 100,
      ap: 3,
      apMax: 6,
      turnNumber: 15,
      relicsCollected: 2,
      statusEffects: [
        { id: 'poison', duration: 2, effect: { apCostModifier: 1 } },
      ],
    });

    const json = original.toJSON();
    const restored = PlayerState.fromJSON(json);

    expect(restored.position.q).toBe(5);
    expect(restored.position.r).toBe(-3);
    expect(restored.hp).toBe(72);
    expect(restored.hpMax).toBe(100);
    expect(restored.ap).toBe(3);
    expect(restored.apMax).toBe(6);
    expect(restored.turnNumber).toBe(15);
    expect(restored.relicsCollected).toBe(2);
    expect(restored.statusEffects.length).toBe(1);
    expect(restored.statusEffects[0].id).toBe('poison');
    expect(restored.statusEffects[0].duration).toBe(2);
  });

  it('toJSON 返回的是独立副本（修改不影响原对象）', () => {
    const p = new PlayerState({ position: { q: 1, r: 2 } });
    const json = p.toJSON();
    json.position.q = 999;
    expect(p.position.q).toBe(1);
  });
});
