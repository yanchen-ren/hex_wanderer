/**
 * HexMath — 六边形坐标数学
 * Axial (q, r) 坐标系辅助计算
 * 尖顶六边形（pointy-top）布局
 */

const SQRT3 = Math.sqrt(3);

/**
 * Cube coordinates for rounding: convert axial (q, r) → cube (x, y, z)
 */
function axialToCube(q, r) {
  return { x: q, y: -q - r, z: r };
}

/**
 * Round fractional cube coordinates to nearest hex
 */
function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

export class HexMath {
  /**
   * Axial → Pixel (pointy-top)
   * x = size * (√3 * q + √3/2 * r)
   * y = size * (3/2 * r)
   */
  static hexToPixel(q, r, size) {
    const x = size * (SQRT3 * q + (SQRT3 / 2) * r);
    const y = size * (1.5 * r);
    return { x, y };
  }

  /**
   * Pixel → Axial (pointy-top), inverse of hexToPixel then round
   */
  static pixelToHex(x, y, size) {
    const r = (2 / 3) * y / size;
    const q = (x / size - r * (SQRT3 / 2)) / SQRT3;
    // Convert fractional axial to cube, round, convert back
    const cube = axialToCube(q, r);
    return cubeRound(cube.x, cube.y, cube.z);
  }

  /**
   * Hex distance using cube coordinates: max(|dx|, |dy|, |dz|)
   */
  static distance(q1, r1, q2, r2) {
    const a = axialToCube(q1, r1);
    const b = axialToCube(q2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }
}
