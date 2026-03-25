/**
 * PlayerState — 玩家状态
 * 集中管理玩家所有状态数据：位置、HP、AP、回合、圣物、状态效果
 */
export class PlayerState {
  /**
   * @param {object} [options]
   * @param {{q:number, r:number}} [options.position]
   * @param {number} [options.hp]
   * @param {number} [options.hpMax]
   * @param {number} [options.ap]
   * @param {number} [options.apMax]
   * @param {number} [options.turnNumber]
   * @param {number} [options.relicsCollected]
   * @param {Array} [options.statusEffects]
   */
  constructor(options = {}) {
    this.position = options.position ?? { q: 0, r: 0 };
    this.hpMax = options.hpMax ?? 100;
    this.hp = this._clampHP(options.hp ?? this.hpMax);
    this.apMax = options.apMax ?? 5;
    this.ap = options.ap ?? this.apMax;
    this.turnNumber = options.turnNumber ?? 1;
    this.relicsCollected = options.relicsCollected ?? 0;
    // Each status effect: { id: string, duration: number, effect: object }
    this.statusEffects = options.statusEffects
      ? options.statusEffects.map(e => ({ ...e }))
      : [];
  }

  /**
   * Clamp HP to [0, hpMax]
   * @param {number} value
   * @returns {number}
   */
  _clampHP(value) {
    return Math.max(0, Math.min(value, this.hpMax));
  }

  /**
   * Apply damage to the player.
   * HP is clamped to [0, hpMax].
   * @param {number} amount - Raw damage amount (positive number)
   * @param {string} [source] - Damage source identifier (e.g. 'fall', 'combat', 'terrain')
   * @returns {{ actualDamage: number, immunized: boolean }}
   */
  applyDamage(amount, source) {
    if (amount <= 0) {
      return { actualDamage: 0, immunized: false };
    }
    const before = this.hp;
    this.hp = this._clampHP(this.hp - amount);
    const actualDamage = before - this.hp;
    return { actualDamage, immunized: false };
  }

  /**
   * Heal the player. HP is clamped to hpMax.
   * @param {number} amount - Heal amount (positive number)
   * @returns {number} Actual HP restored
   */
  heal(amount) {
    if (amount <= 0) return 0;
    const before = this.hp;
    this.hp = this._clampHP(this.hp + amount);
    return this.hp - before;
  }

  /**
   * Add a status effect.
   * @param {{ id: string, duration: number, effect: object }} effect
   */
  addStatusEffect(effect) {
    this.statusEffects.push({ ...effect });
  }

  /**
   * Tick all status effects at turn start: decrement duration, remove expired.
   * @returns {Array<{ expired: string }>} List of expired effect ids
   */
  tickStatusEffects() {
    const expired = [];
    this.statusEffects = this.statusEffects.filter(se => {
      se.duration -= 1;
      if (se.duration <= 0) {
        expired.push({ expired: se.id });
        return false;
      }
      return true;
    });
    return expired;
  }

  /**
   * Serialize to a plain JSON-safe object.
   * @returns {object}
   */
  toJSON() {
    return {
      position: { ...this.position },
      hp: this.hp,
      hpMax: this.hpMax,
      ap: this.ap,
      apMax: this.apMax,
      turnNumber: this.turnNumber,
      relicsCollected: this.relicsCollected,
      statusEffects: this.statusEffects.map(e => ({ ...e, effect: { ...e.effect } })),
    };
  }

  /**
   * Restore a PlayerState from a plain object.
   * @param {object} data
   * @returns {PlayerState}
   */
  static fromJSON(data) {
    return new PlayerState({
      position: data.position,
      hp: data.hp,
      hpMax: data.hpMax,
      ap: data.ap,
      apMax: data.apMax,
      turnNumber: data.turnNumber,
      relicsCollected: data.relicsCollected,
      statusEffects: data.statusEffects,
    });
  }
}
