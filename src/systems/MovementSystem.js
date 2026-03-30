/**
 * MovementSystem — 移动系统
 * AP 消耗计算、通行检查、摔伤判定
 *
 * from/to 参数为 tile 数据对象: { q, r, terrain, elevation, building, event, fogState }
 */
export class MovementSystem {
  /**
   * @param {object} terrainConfig - Parsed terrain.json ({ terrainTypes: { ... } })
   * @param {import('./ItemSystem.js').ItemSystem} itemSystem
   * @param {import('./PlayerState.js').PlayerState} playerState
   * @param {object} [options]
   * @param {import('../utils/SeededRandom.js').SeededRandom} [options.rng] - Optional RNG for deterministic fall damage
   */
  constructor(terrainConfig, itemSystem, playerState, options = {}) {
    this._terrainTypes = terrainConfig?.terrainTypes ?? {};
    this._itemSystem = itemSystem;
    this._playerState = playerState;
    this._rng = options.rng ?? null;
  }

  /**
   * Get a random number in [0, 1). Uses injected RNG if available, else Math.random.
   * @returns {number}
   */
  _random() {
    return this._rng ? this._rng.next() : Math.random();
  }

  /**
   * Get the elevation delta from → to.
   * Positive = uphill, negative = downhill.
   * @param {object} from - { elevation, ... }
   * @param {object} to   - { elevation, ... }
   * @returns {number}
   */
  getElevationDelta(from, to) {
    return (to.elevation ?? 0) - (from.elevation ?? 0);
  }

  /**
   * Get terrain base AP cost from config.
   * @param {string} terrainType
   * @returns {number}
   */
  getTerrainBaseCost(terrainType) {
    const cfg = this._terrainTypes[terrainType];
    return cfg?.baseCost ?? 1;
  }

  /**
   * Check if a terrain transition involves water entry or exit.
   * @param {object} from
   * @param {object} to
   * @returns {{ entering: boolean, exiting: boolean }}
   */
  _getWaterTransition(from, to) {
    const fromIsWater = from.terrain === 'water';
    const toIsWater = to.terrain === 'water';
    return {
      entering: !fromIsWater && toIsWater,
      exiting: fromIsWater && !toIsWater,
    };
  }


  /**
   * Calculate AP cost to move from → to.
   *
   * Rules (需求 2):
   * - Base = target terrain baseCost
   * - Δe = 0: cost = base
   * - Δe +1 to +3 (uphill): cost = base + Δe
   * - Δe < 0 (downhill): cost = 0.5 (fixed, ignores base)
   * - Water entry/exit: adds extra AP from water terrain config (waterExitCostExtra)
   *
   * Note: Δe > +3 or Δe ≤ -4 without items are blocked (handled by canMoveTo),
   * but we still compute a cost here for informational purposes.
   *
   * @param {object} from - tile data with terrain, elevation
   * @param {object} to   - tile data with terrain, elevation
   * @returns {number} AP cost
   */
  calculateAPCost(from, to) {
    const delta = this.getElevationDelta(from, to);
    let cost;

    if (delta < 0) {
      // Downhill: fixed 0.5 AP
      cost = 0.5;
    } else if (delta === 0) {
      // Flat: terrain base cost only
      cost = this.getTerrainBaseCost(to.terrain);
    } else {
      // Uphill (+1 to +3, or >+3 with rope_claw): base + Δe
      cost = this.getTerrainBaseCost(to.terrain) + delta;
    }

    // Water entry/exit extra cost
    const water = this._getWaterTransition(from, to);
    if (water.entering || water.exiting) {
      const waterCfg = this._terrainTypes['water'];
      const extra = waterCfg?.waterExitCostExtra ?? 1;
      cost += extra;
    }

    // Frostbite: all AP costs +1
    if (this._playerState.hasStatusEffect && this._playerState.hasStatusEffect('frostbite')) {
      const frostbite = this._playerState.getStatusEffect('frostbite');
      if (frostbite?.effect?.apCostModifier) {
        cost += frostbite.effect.apCostModifier;
      }
    }

    return cost;
  }

  /**
   * Check whether the player can move from → to.
   *
   * Checks in order:
   * 1. Terrain required item (water→boat, lava→fire_boots, etc.)
   * 2. Water elevation rule (entry/exit must be same elevation)
   * 3. Elevation blocks (Δe > +3 needs rope_claw, Δe ≤ -4 needs parachute)
   * 4. AP sufficiency
   *
   * @param {object} from - tile data { q, r, terrain, elevation, ... }
   * @param {object} to   - tile data { q, r, terrain, elevation, ... }
   * @returns {{ allowed: boolean, reason?: string, requiredItem?: string }}
   */
  canMoveTo(from, to) {
    const toCfg = this._terrainTypes[to.terrain];

    // 0. Void/impassable terrain — always blocked
    if (toCfg?.impassable) {
      return { allowed: false, reason: '无法通行' };
    }

    // 1. Terrain required item check (also accepts terrain_pass effect for that terrain)
    if (toCfg?.requiredItem) {
      const hasItem = this._itemSystem.hasActiveItem(toCfg.requiredItem);
      if (!hasItem) {
        const hasPass = this._itemSystem.getActiveEffects().terrainPass.some(
          e => e.type === 'terrain_pass' && e.terrainType === to.terrain
        );
        if (!hasPass) {
          return {
            allowed: false,
            reason: `需要 ${toCfg.requiredItem} 才能进入 ${toCfg.name ?? to.terrain}`,
            requiredItem: toCfg.requiredItem,
          };
        }
      }
    }

    // Also check from-terrain required item (exiting water needs boat)
    const fromCfg = this._terrainTypes[from.terrain];
    if (fromCfg?.requiredItem) {
      const hasItem = this._itemSystem.hasActiveItem(fromCfg.requiredItem);
      if (!hasItem) {
        const hasPass = this._itemSystem.getActiveEffects().terrainPass.some(
          e => e.type === 'terrain_pass' && e.terrainType === from.terrain
        );
        if (!hasPass) {
          return {
            allowed: false,
            reason: `需要 ${fromCfg.requiredItem} 才能离开 ${fromCfg.name ?? from.terrain}`,
            requiredItem: fromCfg.requiredItem,
          };
        }
      }
    }

    // 2. Water elevation rule: entry/exit must be same elevation
    const water = this._getWaterTransition(from, to);
    if (water.entering || water.exiting) {
      if (from.elevation !== to.elevation) {
        return {
          allowed: false,
          reason: '进出水域时出发地块与目标地块海拔必须相同',
        };
      }
    }

    // 3. Elevation checks
    const delta = this.getElevationDelta(from, to);

    // Δe > +3: needs rope_claw
    if (delta > 3) {
      if (!this._itemSystem.hasActiveItem('rope_claw')) {
        return {
          allowed: false,
          reason: '海拔差过大，需要钩爪才能攀爬',
          requiredItem: 'rope_claw',
        };
      }
    }

    // Δe ≤ -4: needs parachute
    if (delta <= -4) {
      if (!this._itemSystem.hasActiveItem('parachute')) {
        return {
          allowed: false,
          reason: '悬崖过高，需要降落伞才能安全下降',
          requiredItem: 'parachute',
        };
      }
    }

    // 4. AP check
    const cost = this.calculateAPCost(from, to);
    if (this._playerState.ap < cost) {
      return {
        allowed: false,
        reason: `AP 不足（需要 ${cost}，当前 ${this._playerState.ap}）`,
      };
    }

    return { allowed: true };
  }


  /**
   * Execute a move from → to.
   * Assumes canMoveTo has already been checked (or checks internally).
   *
   * Steps:
   * 1. Validate via canMoveTo
   * 2. Calculate & deduct AP
   * 3. Determine fall damage (downhill without parachute)
   * 4. Apply fall damage to playerState
   * 5. Update player position
   *
   * @param {object} from - tile data { q, r, terrain, elevation, ... }
   * @param {object} to   - tile data { q, r, terrain, elevation, ... }
   * @returns {{ success: boolean, apCost?: number, damage?: number, damageType?: string, reason?: string }}
   */
  executeMove(from, to) {
    // Validate
    const check = this.canMoveTo(from, to);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const apCost = this.calculateAPCost(from, to);
    const delta = this.getElevationDelta(from, to);

    // Deduct AP
    this._playerState.ap -= apCost;

    // Fall damage calculation (downhill) — returned as pending, NOT applied here
    let pendingFallDamage = 0;
    let fallDamageEvent = false;

    if (delta < 0) {
      const effects = this._itemSystem.getActiveEffects();
      const hasFallImmunity = effects.fallImmunity;

      if (!hasFallImmunity) {
        const roll = this._random();

        if (delta >= -2 && delta <= -1) {
          // Δe -1 to -2: 10% chance of 10 HP
          if (roll < 0.1) {
            pendingFallDamage = 10;
            fallDamageEvent = true;
          }
        } else if (delta === -3) {
          // Δe -3: 40% chance of 30 HP
          if (roll < 0.4) {
            pendingFallDamage = 30;
            fallDamageEvent = true;
          }
        }
        // Δe ≤ -4 with parachute: no damage (already checked in canMoveTo)
      }
    }

    // Apply bleed damage on move
    let bleedDamage = 0;
    if (this._playerState.hasStatusEffect && this._playerState.hasStatusEffect('bleed')) {
      const bleed = this._playerState.getStatusEffect('bleed');
      const bleedLoss = bleed?.effect?.moveHpLoss ?? 5;
      const { actualDamage } = this._playerState.applyDamage(bleedLoss, 'bleed');
      bleedDamage = actualDamage;
    }

    // Update player position
    if (to.q !== undefined && to.r !== undefined) {
      this._playerState.position = { q: to.q, r: to.r };
    }

    const result = { success: true, apCost };
    if (fallDamageEvent) {
      result.pendingFallDamage = pendingFallDamage;
      result.fallDamageEvent = true;
      // Keep legacy damage field for backward compat (set to 0 since not applied yet)
      result.damage = 0;
    }
    if (bleedDamage > 0) {
      result.bleedDamage = bleedDamage;
    }
    return result;
  }
}
