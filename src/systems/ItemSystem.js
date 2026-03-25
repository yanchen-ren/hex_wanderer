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
