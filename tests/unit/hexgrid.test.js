/**
 * HexMath + HexGrid 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { HexMath } from '../../src/utils/HexMath.js';
import { HexGrid } from '../../src/map/HexGrid.js';

describe('HexMath', () => {
  it('hexToPixel 原点 (0,0) 返回 (0,0)', () => {
    const p = HexMath.hexToPixel(0, 0, 32);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('hexToPixel pointy-top 公式正确', () => {
    const size = 10;
    const p = HexMath.hexToPixel(1, 0, size);
    const expected = size * Math.sqrt(3);
    // x = size * sqrt(3) * 1 + 0 = size * sqrt(3)
    expect(Math.abs(p.x - expected) < 0.001).toBeTrue();
    expect(p.y).toBe(0);
  });

  it('hexToPixel r=1 gives correct y offset', () => {
    const size = 10;
    const p = HexMath.hexToPixel(0, 1, size);
    // x = size * sqrt(3)/2 * 1
    expect(Math.abs(p.x - size * Math.sqrt(3) / 2) < 0.001).toBeTrue();
    // y = size * 3/2
    expect(p.y).toBe(15);
  });

  it('pixelToHex 往返一致 (roundtrip)', () => {
    const size = 32;
    const testCoords = [
      { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 },
      { q: -1, r: 2 }, { q: 3, r: -2 }, { q: -5, r: 5 },
    ];
    for (const { q, r } of testCoords) {
      const px = HexMath.hexToPixel(q, r, size);
      const hex = HexMath.pixelToHex(px.x, px.y, size);
      expect(hex.q).toBe(q);
      expect(hex.r).toBe(r);
    }
  });

  it('distance 自身到自身为 0', () => {
    expect(HexMath.distance(3, 4, 3, 4)).toBe(0);
  });

  it('distance 相邻格为 1', () => {
    expect(HexMath.distance(0, 0, 1, 0)).toBe(1);
    expect(HexMath.distance(0, 0, 0, 1)).toBe(1);
    expect(HexMath.distance(0, 0, -1, 1)).toBe(1);
  });

  it('distance 对称性', () => {
    expect(HexMath.distance(0, 0, 3, -2)).toBe(HexMath.distance(3, -2, 0, 0));
  });
});

describe('HexGrid', () => {
  it('neighbors 返回 6 个相邻坐标', () => {
    const n = HexGrid.neighbors(0, 0);
    expect(n.length).toBe(6);
  });

  it('neighbors 所有邻居距离为 1', () => {
    const n = HexGrid.neighbors(2, 3);
    for (const nb of n) {
      expect(HexGrid.distance(2, 3, nb.q, nb.r)).toBe(1);
    }
  });

  it('neighbors 包含正确的方向向量', () => {
    const n = HexGrid.neighbors(0, 0);
    const coords = n.map(h => `${h.q},${h.r}`);
    expect(coords).toContain('1,0');
    expect(coords).toContain('1,-1');
    expect(coords).toContain('0,-1');
    expect(coords).toContain('-1,0');
    expect(coords).toContain('-1,1');
    expect(coords).toContain('0,1');
  });

  it('hexToPixel / pixelToHex 委托给 HexMath', () => {
    const size = 20;
    const px = HexGrid.hexToPixel(2, 3, size);
    const hex = HexGrid.pixelToHex(px.x, px.y, size);
    expect(hex.q).toBe(2);
    expect(hex.r).toBe(3);
  });

  it('hexesInRange radius=0 只返回中心', () => {
    const hexes = HexGrid.hexesInRange(5, 5, 0);
    expect(hexes.length).toBe(1);
    expect(hexes[0].q).toBe(5);
    expect(hexes[0].r).toBe(5);
  });

  it('hexesInRange radius=1 返回 7 个 (中心+6邻居)', () => {
    const hexes = HexGrid.hexesInRange(0, 0, 1);
    expect(hexes.length).toBe(7);
  });

  it('hexesInRange radius=2 返回 19 个', () => {
    // Formula: 3*r*(r+1)+1 = 3*2*3+1 = 19
    const hexes = HexGrid.hexesInRange(0, 0, 2);
    expect(hexes.length).toBe(19);
  });

  it('hexesInRange 所有结果在半径内', () => {
    const cq = 3, cr = -2, radius = 3;
    const hexes = HexGrid.hexesInRange(cq, cr, radius);
    for (const h of hexes) {
      expect(HexGrid.distance(cq, cr, h.q, h.r) <= radius).toBeTrue();
    }
  });

  it('isInBounds 边界内返回 true', () => {
    expect(HexGrid.isInBounds(0, 0, 10, 10)).toBeTrue();
    expect(HexGrid.isInBounds(9, 9, 10, 10)).toBeTrue();
  });

  it('isInBounds 边界外返回 false', () => {
    expect(HexGrid.isInBounds(-1, 0, 10, 10)).toBeFalse();
    expect(HexGrid.isInBounds(0, -1, 10, 10)).toBeFalse();
    expect(HexGrid.isInBounds(10, 0, 10, 10)).toBeFalse();
    expect(HexGrid.isInBounds(0, 10, 10, 10)).toBeFalse();
  });
});
