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
   * @param {number} [options.gold]
   * @param {Array} [options.statusEffects]
   */
  constructor(options = {}) {
    this.position = options.position ?? { q: 0, r: 0 };
    this.hpMax = options.hpMax ?? 100;
    this.hp = this._clampHP(options.hp ?? this.hpMax);
    this.apMax = options.apMax ?? 8;
    this.ap = options.ap ?? this.apMax;
    this.turnNumber = options.turnNumber ?? 1;
    this.relicsCollected = options.relicsCollected ?? 0;
    this.gold = options.gold ?? 0;
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
   * Debuff definitions with default effects.
   * @type {Object<string, {defaultDuration: number, effect: object}>}
   */
  static DEBUFF_DEFS = {
    poison: { defaultDuration: 3, effect: { hpLossPercent: 0.05 } },
    frostbite: { defaultDuration: 2, effect: { apCostModifier: 1, hpLossPerTurn: 3 } },
    curse: { defaultDuration: 5, effect: { combatDamageMultiplier: 2 } },
    bleed: { defaultDuration: 1, effect: { moveHpLoss: 5 } },
  };

  /**
   * Add a status effect. If the effect id matches a known debuff, merge default effect values.
   * @param {{ id: string, duration: number, effect?: object }} effect
   */
  addStatusEffect(effect) {
    // Dedup: if same status already exists, refresh duration instead of stacking
    const existing = this.statusEffects.find(se => se.id === effect.id);
    if (existing) {
      const debufDef = PlayerState.DEBUFF_DEFS[effect.id];
      const newDuration = effect.duration ?? debufDef?.defaultDuration ?? 3;
      existing.duration = Math.max(existing.duration, newDuration);
      return;
    }

    const debufDef = PlayerState.DEBUFF_DEFS[effect.id];
    const merged = { ...effect };
    if (debufDef) {
      merged.duration = effect.duration ?? debufDef.defaultDuration;
      merged.effect = { ...debufDef.effect, ...(effect.effect ?? {}) };
    } else {
      merged.effect = effect.effect ?? {};
    }
    this.statusEffects.push({ ...merged });
  }

  /**
   * Check if the player has a specific status effect.
   * @param {string} statusId
   * @returns {boolean}
   */
  hasStatusEffect(statusId) {
    return this.statusEffects.some(se => se.id === statusId);
  }

  /**
   * Get a specific status effect by id.
   * @param {string} statusId
   * @returns {object|null}
   */
  getStatusEffect(statusId) {
    return this.statusEffects.find(se => se.id === statusId) ?? null;
  }

  /**
   * Remove a specific status effect by id.
   * @param {string} statusId
   * @returns {boolean} true if removed
   */
  removeStatusEffect(statusId) {
    const idx = this.statusEffects.findIndex(se => se.id === statusId);
    if (idx >= 0) {
      this.statusEffects.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Remove all debuff status effects.
   */
  clearAllDebuffs() {
    this.statusEffects = this.statusEffects.filter(se => !PlayerState.DEBUFF_DEFS[se.id]);
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
      gold: this.gold,
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
      gold: data.gold,
      statusEffects: data.statusEffects,
    });
  }
}
