/**
 * SimplexNoise — 2D Simplex Noise
 * 基于种子的噪声算法，用于自然地形生成
 * noise2D(x, y) → [-1, 1]
 *
 * Implementation based on the Simplex Noise algorithm by Ken Perlin.
 */

// Gradients for 2D simplex noise
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Skewing / unskewing factors for 2D
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class SimplexNoise {
  /**
   * @param {number} seed - integer seed for deterministic noise
   */
  constructor(seed) {
    this._perm = new Uint8Array(512);
    this._grad = new Array(512);
    this._buildPermutation(seed);
  }

  /**
   * Build a seeded permutation table (0-255 shuffled deterministically).
   */
  _buildPermutation(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates shuffle with simple mulberry32-style PRNG
    let s = seed | 0;
    const rand = () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    for (let i = 0; i < 512; i++) {
      this._perm[i] = p[i & 255];
      this._grad[i] = GRAD2[this._perm[i] % GRAD2.length];
    }
  }

  /**
   * 2D Simplex Noise
   * @param {number} x
   * @param {number} y
   * @returns {number} value in [-1, 1]
   */
  noise2D(x, y) {
    // Skew input space to determine simplex cell
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex we are in
    let i1, j1;
    if (x0 > y0) {
      i1 = 1; j1 = 0; // lower triangle
    } else {
      i1 = 0; j1 = 1; // upper triangle
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    // Calculate contributions from the three corners
    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g0 = this._grad[ii + this._perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g1 = this._grad[ii + i1 + this._perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g2 = this._grad[ii + 1 + this._perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2);
    }

    // Scale to [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }
}
