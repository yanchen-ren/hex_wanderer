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
   * Apply debuff tick effects (poison, frostbite) at turn end.
   * @param {object} tileData - Current tile { terrain, elevation, building, ... }
   * @returns {{ restEffect: object, apCarryOver: number, hpChange: number, debuffDamage: number }}
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

    // City/Castle rest: clear all debuffs
    if ((tileData.building === 'city' || tileData.building === 'castle') && this._player.clearAllDebuffs) {
      this._player.clearAllDebuffs();
    }

    // Elixir: status cleanse on turn end
    const effects = this._itemSystem.getActiveEffects();
    if (effects.statusCleanseOnTurnEnd && this._player.clearAllDebuffs) {
      this._player.clearAllDebuffs();
    }

    // Item synergy: marigold gold bonus on rest (9.2)
    let goldFromRest = 0;
    for (const gb of (effects.goldBonuses ?? [])) {
      if (gb.source === 'rest') {
        let bonus = gb.value ?? 0;
        // Water_cup + marigold synergy: double gold if both active
        if (this._itemSystem.hasActiveItem('water_cup') || this._itemSystem.hasActiveItem('elixir')) {
          bonus *= 2;
        }
        goldFromRest += bonus;
      }
    }
    if (goldFromRest > 0) {
      this._player.gold = (this._player.gold ?? 0) + goldFromRest;
    }

    // Apply debuff tick effects at turn end (before adding new status effects)
    let debuffDamage = 0;
    for (const se of this._player.statusEffects) {
      // Poison: lose 5% of current HP
      if (se.id === 'poison' && se.effect?.hpLossPercent) {
        const loss = Math.max(1, Math.floor(this._player.hp * se.effect.hpLossPercent));
        const { actualDamage } = this._player.applyDamage(loss, 'poison');
        debuffDamage += actualDamage;
      }
      // Frostbite: lose flat HP per turn
      if (se.id === 'frostbite' && se.effect?.hpLossPerTurn) {
        const { actualDamage } = this._player.applyDamage(se.effect.hpLossPerTurn, 'frostbite');
        debuffDamage += actualDamage;
      }
    }

    // Apply status effects from rest (e.g., swamp poison) — after debuff tick
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
      debuffDamage,
      overnightEvents,
    });

    return {
      restEffect,
      apCarryOver: apResult.apCarried ?? 0,
      hpChange,
      debuffDamage,
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

    // Add building rest bonus (city, camp, village etc.)
    if (tileData?.buildingEffect) {
      hpChange += tileData.buildingEffect.restHpBonus ?? 0;
    }

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
   * Roll for overnight events using priority system.
   * Priority: building events > item events > terrain events > generic events.
   * Only ONE overnight event triggers per turn (highest priority that passes its roll).
   * @param {object} tileData - { terrain, elevation, building }
   * @returns {Array} overnight event ids (0 or 1 element)
   * @private
   */
  _rollOvernightEvents(tileData) {
    const terrainType = tileData?.terrain;
    const terrainDef = this._terrainConfig?.terrainTypes?.[terrainType];
    const effects = this._itemSystem.getActiveEffects();

    // Overnight safety from items (camper_van) reduces all encounter chances
    const safetyReduction = effects.overnightSafety > 0 ? (1 - effects.overnightSafety) : 1;

    // --- Priority 1: Building events ---
    const buildingEvent = this._rollBuildingOvernightEvent(tileData, safetyReduction);
    if (buildingEvent) return [buildingEvent];

    // --- Priority 2: Item events ---
    const itemEvent = this._rollItemOvernightEvent(tileData, effects, safetyReduction);
    if (itemEvent) return [itemEvent];

    // --- Priority 3: Terrain events ---
    const terrainEvent = this._rollTerrainOvernightEvent(terrainDef, safetyReduction);
    if (terrainEvent) return [terrainEvent];

    // --- Priority 4: Generic events ---
    const genericEvent = this._rollGenericOvernightEvent(tileData, effects, safetyReduction);
    if (genericEvent) return [genericEvent];

    return [];
  }

  /**
   * Roll building overnight events (highest priority).
   * @param {object} tileData
   * @param {number} safetyReduction - multiplier from overnight safety items
   * @returns {string|null} event id or null
   * @private
   */
  _rollBuildingOvernightEvent(tileData, safetyReduction) {
    const building = tileData?.building;
    if (!building) return null;

    if (building === 'city') {
      // Thief medal → 30% chance of being caught
      if (this._itemSystem.hasActiveItem('thief_medal')) {
        if (Math.random() < 0.3 * safetyReduction) {
          return 'overnight_city_thief';
        }
      }
      // Sheriff badge → bonus event
      if (this._itemSystem.hasActiveItem('sheriff_badge')) {
        return 'overnight_city_rest_sheriff';
      }
      // Default city rest
      return 'overnight_city_rest';
    }

    if (building === 'camp') {
      // 20% chance of trade event
      if (Math.random() < 0.2 * safetyReduction) {
        return 'overnight_camp_trade';
      }
      return null;
    }

    if (building === 'farm') {
      // Sickle → always harvest
      if (this._itemSystem.hasActiveItem('sickle')) {
        return 'overnight_farm_harvest';
      }
      return null;
    }

    if (building === 'village') {
      // Village overnight: small chance of trade event
      if (Math.random() < 0.15 * safetyReduction) {
        return 'overnight_camp_trade';
      }
      return null;
    }

    if (building === 'castle') {
      // Castle: same rest as city but no trade/thief events
      return 'overnight_castle_rest';
    }

    return null;
  }

  /**
   * Roll item overnight events (second priority).
   * @param {object} tileData
   * @param {object} effects - aggregated item effects
   * @param {number} safetyReduction
   * @returns {string|null} event id or null
   * @private
   */
  _rollItemOvernightEvent(tileData, effects, safetyReduction) {
    const terrainType = tileData?.terrain;

    // Accordion + torch → campfire party (40% chance)
    const hasAccordion = this._itemSystem.hasActiveItem('accordion');
    const hasTorch = this._itemSystem.hasActiveItem('torch') || this._itemSystem.hasActiveItem('mega_torch');

    if (hasAccordion && hasTorch) {
      if (Math.random() < 0.4) {
        return 'overnight_campfire';
      }
    } else if (hasAccordion) {
      // Accordion only → party (30% chance)
      if (Math.random() < 0.3) {
        return 'overnight_accordion';
      }
    }

    // Shovel dig event (not on water, 25% chance)
    if (this._itemSystem.hasActiveItem('shovel') && terrainType !== 'water') {
      if (Math.random() < 0.25) {
        return 'overnight_dig';
      }
    }

    // Mystery egg is handled separately in GameLoop (already exists)

    return null;
  }

  /**
   * Roll terrain overnight events (third priority).
   * Uses overnightEvents arrays and overnightEventChance from terrain.json.
   * @param {object} terrainDef - terrain definition from config
   * @param {number} safetyReduction
   * @returns {string|null} event id or null
   * @private
   */
  _rollTerrainOvernightEvent(terrainDef, safetyReduction) {
    if (!terrainDef) return null;

    const chance = (terrainDef.overnightEventChance ?? 0) * safetyReduction;
    const terrainEvents = terrainDef.overnightEvents ?? [];

    if (terrainEvents.length > 0 && chance > 0) {
      if (Math.random() < chance) {
        const idx = Math.floor(Math.random() * terrainEvents.length);
        return terrainEvents[idx];
      }
    }

    return null;
  }

  /**
   * Roll generic overnight events (lowest priority, any terrain).
   * Events: insomnia, sick, undead, bandit.
   * @param {object} tileData
   * @param {object} effects - aggregated item effects
   * @param {number} safetyReduction
   * @returns {string|null} event id or null
   * @private
   */
  _rollGenericOvernightEvent(tileData, effects, safetyReduction) {
    const terrainType = tileData?.terrain;
    const elevation = tileData?.elevation ?? 5;

    // Insomnia: 5% chance, -1~2 AP
    if (Math.random() < 0.05 * safetyReduction) {
      return 'overnight_insomnia';
    }

    // Sick: 3% base chance, higher on ice/water/high elevation, tent reduces
    let sickChance = 0.03;
    if (terrainType === 'ice' || terrainType === 'water') sickChance += 0.05;
    if (elevation >= 8) sickChance += 0.03;
    // Tent reduces sick chance by half
    if (this._itemSystem.hasActiveItem('tent') || this._itemSystem.hasActiveItem('camper_van')) {
      sickChance *= 0.5;
    }
    if (Math.random() < sickChance * safetyReduction) {
      return 'overnight_sick';
    }

    // Undead: 2% chance (reduced from 5%)
    if (Math.random() < 0.02 * safetyReduction) {
      return 'overnight_undead';
    }

    // Bandit: 2% chance (reduced from 5%, thief_medal immune, skip if no gold)
    if (!this._itemSystem.hasActiveItem('thief_medal') && (this._player.gold ?? 0) > 0) {
      if (Math.random() < 0.02 * safetyReduction) {
        return 'overnight_bandit';
      }
    }

    return null;
  }
}
