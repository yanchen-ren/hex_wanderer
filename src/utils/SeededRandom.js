/**
 * SeededRandom — 种子随机数生成器
 * 确定性随机：next() / nextInt() / nextFloat() / shuffle()
 * 使用 mulberry32 PRNG 算法
 */
export class SeededRandom {
  /**
   * @param {number} seed - 整数种子
   */
  constructor(seed) {
    this._state = seed | 0;
  }

  /**
   * mulberry32: returns [0, 1)
   */
  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random integer in [min, max] (inclusive)
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Random float in [min, max)
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  /**
   * Fisher-Yates shuffle (in-place, deterministic)
   * @param {Array} array
   * @returns {Array} the same array, shuffled
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }
}
