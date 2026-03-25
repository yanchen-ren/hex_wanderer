/**
 * TurnSystem — 回合系统
 * 回合流转、AP 回复、休息效果、剩余 AP 处理
 */
export class TurnSystem {
  /**
   * @param {import('./PlayerState.js').PlayerState} playerState
   * @param {object} terrainConfig - Parsed terrain.json
   * @param {import('./ItemSystem.js').ItemSystem} itemSystem
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(playerState, terrainConfig, itemSystem, eventBus) {
    this._player = playerState;
    this._terrainConfig = terrainConfig;
    this._itemSystem = itemSystem;
    this._eventBus = eventBus;
  }

  /**
   * Get the effective AP max (base apMax + item bonuses + status effect modifiers).
   * @returns {number}
   */
  getEffectiveAPMax() {
    let apMax = this._player.apMax;

    // Item AP bonuses
    const effects = this._itemSystem.getActiveEffects();
    apMax += effects.apBonus ?? 0;

    // Status effect modifiers on AP max
    for (const se of this._player.statusEffects) {
      if (se.effect && typeof se.effect.apMaxModifier === 'number') {
        apMax += se.effect.apMaxModifier;
      }
    }

    return Math.max(0, apMax);
  }

  /**
   * Start a new turn: restore AP to effective max, increment turn, tick status effects.
   * @returns {{ turnNumber: number, apRestored: number, overnightEvents: Array }}
   */
  startNewTurn() {
    // Increment turn number
    this._player.turnNumber += 1;

    // Tick status effects (decrement duration, remove expired)
    const expired = this._player.tickStatusEffects();

    // Restore AP to effective max
    const effectiveMax = this.getEffectiveAPMax();
    const apBefore = this._player.ap;
    this._player.ap = effectiveMax;
    const apRestored = this._player.ap - apBefore;

    this._eventBus.emit('turn:start', {
      turnNumber: this._player.turnNumber,
      apRestored,
      expiredEffects: expired,
    });

    return {
      turnNumber: this._player.turnNumber,
      apRestored,
      overnightEvents: [],
    };
  }

  /**
   * End the current turn: calculate rest effect, handle remaining AP,
   * trigger overnight events based on terrain config probability.
   * @param {object} tileData - Current tile { terrain, elevation, ... }
   * @returns {{ restEffect: object, apCarryOver: number, hpChange: number }}
   */
  endTurn(tileData) {
    // Handle remaining AP before rest
    const remainingAP = this._player.ap;
    const apResult = this.handleRemainingAP(remainingAP);

    // Calculate rest effect from terrain
    const restEffect = this.calculateRestEffect(tileData);

    // Apply HP change from rest (clamped to hpMax)
    let hpChange = 0;
    if (restEffect.hpChange > 0) {
      hpChange = this._player.heal(restEffect.hpChange);
    } else if (restEffect.hpChange < 0) {
      const result = this._player.applyDamage(Math.abs(restEffect.hpChange));
      hpChange = -result.actualDamage;
    }

    // Apply status effects from rest (e.g., swamp poison)
    if (restEffect.statusEffects && restEffect.statusEffects.length > 0) {
      for (const se of restEffect.statusEffects) {
        this._player.addStatusEffect(se);
      }
    }

    // Set AP to carry-over amount (default 0)
    this._player.ap = apResult.apCarried ?? 0;

    // Check overnight events
    const overnightEvents = this._rollOvernightEvents(tileData);

    this._eventBus.emit('turn:end', {
      restEffect,
      apCarryOver: apResult.apCarried ?? 0,
      hpChange,
      overnightEvents,
    });

    return {
      restEffect,
      apCarryOver: apResult.apCarried ?? 0,
      hpChange,
    };
  }

  /**
   * Calculate rest effect for the current tile.
   * Reads from terrainConfig.terrainTypes[terrain].restEffect, adds item rest bonuses.
   * Negative effects (poison, burn) can be blocked by item immunities.
   * @param {object} tileData - { terrain, ... }
   * @returns {{ hpChange: number, apBonus: number, statusEffects: Array }}
   */
  calculateRestEffect(tileData) {
    const terrainType = tileData?.terrain;
    const terrainDef = this._terrainConfig?.terrainTypes?.[terrainType];
    const restDef = terrainDef?.restEffect ?? { hpChange: 0, apBonus: 0 };

    const effects = this._itemSystem.getActiveEffects();
    const immunities = effects.statusImmunities ?? [];

    let hpChange = restDef.hpChange ?? 0;
    const apBonus = restDef.apBonus ?? 0;
    const statusEffects = [];

    // Add item rest HP bonus (tent etc.)
    hpChange += effects.restHpBonus ?? 0;

    // Handle status effect from rest (e.g., swamp poison)
    if (restDef.statusEffect) {
      // Check if player has immunity to this status
      if (!immunities.includes(restDef.statusEffect)) {
        statusEffects.push({
          id: restDef.statusEffect,
          duration: 3,
          effect: { apCostModifier: 1 },
        });
      } else {
        // Immunity blocks the negative status AND its associated HP damage
        // If the hpChange is negative and tied to a blocked status, negate it
        if (hpChange < 0) {
          // Restore the base negative HP (only the terrain part, keep item bonus)
          hpChange = hpChange - (restDef.hpChange ?? 0);
          // hpChange now only has item bonus
        }
      }
    }

    return { hpChange, apBonus, statusEffects };
  }

  /**
   * Handle remaining AP at end of turn.
   * Default: discard. Items can enable conversion to HP or carry-over.
   * @param {number} remainingAP
   * @returns {{ converted: boolean, hpGain?: number, apCarried?: number }}
   */
  handleRemainingAP(remainingAP) {
    if (remainingAP <= 0) {
      return { converted: false, apCarried: 0 };
    }

    const effects = this._itemSystem.getActiveEffects();

    // Check for AP carry-over item effect
    if (effects.apCarryOver) {
      const maxCarry = effects.apCarryOver.max ?? 0;
      const carried = Math.min(remainingAP, maxCarry);
      return { converted: true, apCarried: carried };
    }

    // Check for AP-to-HP conversion item effect
    if (effects.apToHpConversion) {
      const ratio = effects.apToHpConversion.ratio ?? 0;
      const hpGain = Math.floor(remainingAP * ratio);
      if (hpGain > 0) {
        this._player.heal(hpGain);
      }
      return { converted: true, hpGain, apCarried: 0 };
    }

    // Default: discard remaining AP
    return { converted: false, apCarried: 0 };
  }

  /**
   * Roll for overnight events based on terrain config probability.
   * @param {object} tileData
   * @returns {Array} overnight event ids
   * @private
   */
  _rollOvernightEvents(tileData) {
    const terrainType = tileData?.terrain;
    const terrainDef = this._terrainConfig?.terrainTypes?.[terrainType];
    if (!terrainDef) return [];

    const chance = terrainDef.overnightEventChance ?? 0;
    const events = terrainDef.overnightEvents ?? [];
    if (events.length === 0 || chance <= 0) return [];

    // Use Math.random for overnight event rolls (non-deterministic game events)
    if (Math.random() < chance) {
      const idx = Math.floor(Math.random() * events.length);
      return [events[idx]];
    }

    return [];
  }
}
