/**
 * ItemSystem — 道具系统
 * 道具持有、启用/禁用、效果查询
 */
export class ItemSystem {
  /**
   * @param {object} itemConfig - Parsed item.json config ({ items: { ... } })
   */
  constructor(itemConfig) {
    /** @type {object} item definitions keyed by itemId */
    this._itemDefs = itemConfig?.items ?? {};
    /** @type {Array<{materialA: string, materialB: string, result: string}>} combination recipes */
    this._combinations = itemConfig?.combinations ?? [];
    /** @type {Map<string, { enabled: boolean }>} player inventory */
    this._inventory = new Map();
  }

  /**
   * Add an item to the player's inventory. Items default to enabled.
   * Returns false if item already owned or not defined in config.
   * @param {string} itemId
   * @returns {boolean}
   */
  addItem(itemId) {
    if (this._inventory.has(itemId)) return false;
    if (!this._itemDefs[itemId]) return false;
    this._inventory.set(itemId, { enabled: true });
    return true;
  }

  /**
   * Check if the player owns an item (regardless of enabled state).
   * @param {string} itemId
   * @returns {boolean}
   */
  hasItem(itemId) {
    return this._inventory.has(itemId);
  }

  /**
   * Check if the player owns an item AND it is enabled.
   * @param {string} itemId
   * @returns {boolean}
   */
  hasActiveItem(itemId) {
    const entry = this._inventory.get(itemId);
    return entry != null && entry.enabled;
  }

  /**
   * Toggle an item's enabled/disabled state.
   * Returns the new enabled state, or false if item not owned.
   * @param {string} itemId
   * @returns {boolean} New enabled state
   */
  toggleItem(itemId) {
    const entry = this._inventory.get(itemId);
    if (!entry) return false;
    entry.enabled = !entry.enabled;
    return entry.enabled;
  }

  /**
   * Exchange one item for another (used in events).
   * Removes giveId and adds receiveId.
   * Returns false if player doesn't own giveId or receiveId is not in config.
   * @param {string} giveId
   * @param {string} receiveId
   * @returns {boolean}
   */
  exchangeItem(giveId, receiveId) {
    if (!this._inventory.has(giveId)) return false;
    if (!this._itemDefs[receiveId]) return false;
    this._inventory.delete(giveId);
    this._inventory.set(receiveId, { enabled: true });
    return true;
  }

  /**
   * Remove an item from the player's inventory (consume it).
   * Returns true if item was owned and removed, false otherwise.
   * @param {string} itemId
   * @returns {boolean}
   */
  consumeItem(itemId) {
    if (!this._inventory.has(itemId)) return false;
    this._inventory.delete(itemId);
    return true;
  }

  /**
   * Check if an item is consumable (reads "consumable" field from config).
   * @param {string} itemId
   * @returns {boolean}
   */
  isConsumable(itemId) {
    const def = this._itemDefs[itemId];
    return def?.consumable === true;
  }

  /**
   * Check all combination recipes. If both materials are present,
   * remove both and add the result item.
   * @returns {{ combined: boolean, result?: string, consumed?: [string, string] }}
   */
  checkCombinations() {
    const combinations = this._combinations ?? [];
    for (const recipe of combinations) {
      const { materialA, materialB, result } = recipe;
      if (this._inventory.has(materialA) && this._inventory.has(materialB)) {
        // Remove both materials
        this._inventory.delete(materialA);
        this._inventory.delete(materialB);
        // Add result item (must be defined in config)
        if (this._itemDefs[result]) {
          this._inventory.set(result, { enabled: true });
        }
        return { combined: true, result, consumed: [materialA, materialB] };
      }
    }
    return { combined: false };
  }

  /**
   * Get aggregated effects from all enabled items.
   * @returns {{ terrainPass: Array, apBonus: number, visionBonus: number, restHpBonus: number, fallImmunity: boolean, statusImmunities: string[] }}
   */
  getActiveEffects() {
    const result = {
      terrainPass: [],
      apBonus: 0,
      visionBonus: 0,
      restHpBonus: 0,
      fallImmunity: false,
      statusImmunities: [],
      combatDamageReduction: 0,
      curseImmunity: false,
      overnightSafety: 0,
      apCostModifiers: [],
      combatBonuses: [],
      goldBonuses: [],
      eventOptionUnlocks: [],
    };

    for (const [itemId, entry] of this._inventory) {
      if (!entry.enabled) continue;
      const def = this._itemDefs[itemId];
      if (!def || !def.effects) continue;

      for (const eff of def.effects) {
        switch (eff.type) {
          case 'terrain_pass':
            result.terrainPass.push(eff);
            break;
          case 'ap_max_bonus':
            result.apBonus += eff.value ?? 0;
            break;
          case 'vision_bonus':
            result.visionBonus += eff.value ?? 0;
            break;
          case 'rest_hp_bonus':
            result.restHpBonus += eff.value ?? 0;
            break;
          case 'fall_immunity':
            result.fallImmunity = true;
            break;
          case 'status_immunity':
            if (eff.statusId) result.statusImmunities.push(eff.statusId);
            break;
          case 'enter_damage_immunity':
            result.terrainPass.push(eff);
            break;
          case 'damage_immunity_chance':
            // Store formula for later evaluation by combat/damage system
            result.damageImmunityFormula = eff.formula;
            break;
          case 'combat_damage_reduction':
            result.combatDamageReduction += eff.value ?? 0;
            break;
          case 'ap_cost_modifier':
            result.apCostModifiers.push(eff);
            break;
          case 'curse_immunity':
            result.curseImmunity = true;
            break;
          case 'overnight_safety':
            result.overnightSafety += eff.encounterReduction ?? 0;
            break;
          case 'combat_bonus':
            result.combatBonuses.push({ ...eff, itemId });
            break;
          case 'gold_bonus':
            result.goldBonuses.push(eff);
            break;
          case 'event_option_unlock':
            result.eventOptionUnlocks.push(eff.optionTag);
            break;
          case 'escape_guarantee':
            result.escapeGuarantee = true;
            break;
          case 'escape_bonus':
            result.escapeBonus = (result.escapeBonus ?? 0) + (eff.value ?? 0);
            break;
          case 'overnight_party':
            result.overnightParty = eff;
            break;
          case 'earphone_hint':
            result.earphoneHintChance = eff.chance ?? 0;
            break;
          case 'lethal_save':
            if (!result.lethalSaves) result.lethalSaves = [];
            result.lethalSaves.push(eff);
            break;
          case 'hourglass_retry':
            result.hourglassRetry = true;
            break;
          case 'mystery_egg_timer':
            result.mysteryEggTimer = eff.turns ?? 5;
            break;
          case 'sell_in_city':
            // Passive — handled by city event logic
            break;
          case 'scare_chance':
            result.scareChance = (result.scareChance ?? 0) + (eff.value ?? 0);
            break;
          case 'luck_modifier':
            result.luckModifier = (result.luckModifier ?? 0) + (eff.value ?? 0);
            break;
          case 'reveal_portal':
            result.revealPortal = true;
            break;
          case 'reveal_relics':
            result.revealRelics = true;
            break;
          case 'npc_friendly':
            result.npcFriendly = true;
            break;
          case 'combat_no_damage_on_win':
            result.combatNoDamageOnWin = true;
            break;
          case 'combat_surrender_chance':
            result.combatSurrenderChance = eff.value ?? 0;
            break;
          case 'ruin_loot_upgrade':
            result.ruinLootUpgrade = eff.minQuality ?? 'rare';
            break;
          case 'cold_area_immunity':
            result.coldAreaImmunityRadius = eff.radius ?? 0;
            break;
          case 'status_cleanse_on_turn_end':
            result.statusCleanseOnTurnEnd = true;
            break;
          case 'trap_immunity':
            result.trapImmunity = true;
            break;
        }
      }
    }

    return result;
  }

  /**
   * Get the full inventory list with item details.
   * @returns {Array<{ itemId: string, name: string, quality: string, enabled: boolean, effects: Array }>}
   */
  getInventory() {
    const list = [];
    for (const [itemId, entry] of this._inventory) {
      const def = this._itemDefs[itemId];
      list.push({
        itemId,
        name: def?.name ?? itemId,
        quality: def?.quality ?? 'common',
        enabled: entry.enabled,
        effects: def?.effects ?? [],
      });
    }
    return list;
  }

  /**
   * Serialize inventory state for save system.
   * @returns {Array<{ itemId: string, enabled: boolean }>}
   */
  toJSON() {
    const items = [];
    for (const [itemId, entry] of this._inventory) {
      items.push({ itemId, enabled: entry.enabled });
    }
    return items;
  }

  /**
   * Restore inventory from saved data.
   * @param {Array<{ itemId: string, enabled: boolean }>} data
   */
  loadFromJSON(data) {
    this._inventory.clear();
    if (!Array.isArray(data)) return;
    for (const item of data) {
      if (this._itemDefs[item.itemId]) {
        this._inventory.set(item.itemId, { enabled: item.enabled ?? true });
      }
    }
  }
}
