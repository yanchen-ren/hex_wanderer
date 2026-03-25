/**
 * SeededRandom 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { SeededRandom } from '../../src/utils/SeededRandom.js';

describe('SeededRandom', () => {
  it('相同种子产生相同序列', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('不同种子产生不同序列', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      if (a.next() === b.next()) same++;
    }
    // Extremely unlikely all 20 match
    expect(same < 20).toBeTrue();
  });

  it('next() 返回 [0, 1) 范围', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v >= 0).toBeTrue();
      expect(v < 1).toBeTrue();
    }
  });

  it('nextInt(min, max) 返回 [min, max] 范围内整数', () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextInt(3, 7);
      expect(v >= 3).toBeTrue();
      expect(v <= 7).toBeTrue();
      expect(Math.floor(v)).toBe(v);
    }
  });

  it('nextFloat(min, max) 返回 [min, max) 范围', () => {
    const rng = new SeededRandom(77);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat(2.0, 5.0);
      expect(v >= 2.0).toBeTrue();
      expect(v < 5.0).toBeTrue();
    }
  });

  it('shuffle 是确定性的', () => {
    const a = new SeededRandom(55);
    const b = new SeededRandom(55);
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8];
    a.shuffle(arr1);
    b.shuffle(arr2);
    expect(arr1).toEqual(arr2);
  });

  it('shuffle 包含所有原始元素', () => {
    const rng = new SeededRandom(10);
    const arr = [10, 20, 30, 40, 50];
    rng.shuffle(arr);
    expect(arr.length).toBe(5);
    expect(arr.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
  });
});
