/**
 * SimplexNoise 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { SimplexNoise } from '../../src/utils/SimplexNoise.js';

describe('SimplexNoise', () => {
  it('noise2D 返回 [-1, 1] 范围', () => {
    const noise = new SimplexNoise(42);
    for (let i = 0; i < 200; i++) {
      const x = (i - 100) * 0.1;
      const y = (i * 0.7 - 50) * 0.1;
      const v = noise.noise2D(x, y);
      expect(v >= -1).toBeTrue();
      expect(v <= 1).toBeTrue();
    }
  });

  it('相同种子相同坐标产生相同值', () => {
    const a = new SimplexNoise(123);
    const b = new SimplexNoise(123);
    for (let i = 0; i < 50; i++) {
      const x = i * 0.3;
      const y = i * 0.7;
      expect(a.noise2D(x, y)).toBe(b.noise2D(x, y));
    }
  });

  it('不同种子产生不同噪声', () => {
    const a = new SimplexNoise(1);
    const b = new SimplexNoise(999);
    let same = 0;
    for (let i = 0; i < 50; i++) {
      if (a.noise2D(i * 0.1, i * 0.2) === b.noise2D(i * 0.1, i * 0.2)) same++;
    }
    expect(same < 50).toBeTrue();
  });

  it('noise2D 不全为零（有变化）', () => {
    const noise = new SimplexNoise(7);
    let nonZero = 0;
    for (let i = 0; i < 100; i++) {
      if (noise.noise2D(i * 0.5, i * 0.3) !== 0) nonZero++;
    }
    expect(nonZero > 0).toBeTrue();
  });

  it('noise2D 在相邻坐标间平滑变化', () => {
    const noise = new SimplexNoise(42);
    const step = 0.01;
    let maxDiff = 0;
    for (let i = 0; i < 100; i++) {
      const x = i * step;
      const v1 = noise.noise2D(x, 0);
      const v2 = noise.noise2D(x + step, 0);
      const diff = Math.abs(v2 - v1);
      if (diff > maxDiff) maxDiff = diff;
    }
    // Very small steps should produce very small differences
    expect(maxDiff < 0.1).toBeTrue();
  });
});
