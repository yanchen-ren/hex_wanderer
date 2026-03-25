/**
 * EventSystem — 事件系统
 * 事件触发、分支选择、事件刷新
 */
export class EventSystem {
  /**
   * @param {object} eventConfig - Parsed event.json config ({ events: { ... } })
   * @param {object} terrainConfig - Parsed terrain.json config ({ terrainTypes: { ... } })
   * @param {object} buildingConfig - Parsed building.json config ({ buildingTypes: { ... } })
   * @param {import('./PlayerState.js').PlayerState} playerState
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {object} [deps] - Optional dependency overrides
   * @param {import('./ItemSystem.js').ItemSystem} [deps.itemSystem]
   * @param {import('../utils/SeededRandom.js').SeededRandom} [deps.rng]
   */
  constructor(eventConfig, terrainConfig, buildingConfig, playerState, eventBus, deps = {}) {
    this._events = eventConfig?.events ?? {};
    this._terrainTypes = terrainConfig?.terrainTypes ?? {};
    this._buildingTypes = buildingConfig?.buildingTypes ?? {};
    this._playerState = playerState;
    this._eventBus = eventBus;
    this._itemSystem = deps.itemSystem ?? null;
    this._rng = deps.rng ?? null;
  }

  /**
   * Generate a random number in [0, 1). Uses SeededRandom if available, else Math.random.
   * @returns {number}
   */
  _random() {
    return this._rng ? this._rng.next() : Math.random();
  }

  /**
   * Trigger the event on a tile. Returns an EventInstance with available choices
   * filtered by branch conditions, or null if no event.
   * @param {object} tileData - { terrain, elevation, building, event, ... }
   * @returns {object|null} EventInstance { eventId, definition, availableChoices } or null
   */
  triggerEvent(tileData) {
    const eventId = tileData?.event;
    if (!eventId) return null;

    const def = this._events[eventId];
    if (!def) return null;

    // Filter choices by branch conditions
    const availableChoices = (def.choices ?? []).map((choice, index) => {
      const conditionsMet = this.checkBranchConditions(choice, this._playerState);
      return { ...choice, originalIndex: index, conditionsMet };
    }).filter(c => c.conditionsMet);

    return {
      eventId,
      definition: def,
      availableChoices,
    };
  }

  /**
   * Resolve a player's choice within an event instance.
   * Picks an outcome based on probability roll.
   * @param {object} eventInstance - from triggerEvent()
   * @param {number} choiceIndex - index into eventInstance.availableChoices
   * @returns {object} EventResult { outcome, choiceText }
   */
  resolveChoice(eventInstance, choiceIndex) {
    if (!eventInstance || !eventInstance.availableChoices) {
      return { outcome: { type: 'nothing' }, choiceText: '' };
    }

    const choice = eventInstance.availableChoices[choiceIndex];
    if (!choice) {
      return { outcome: { type: 'nothing' }, choiceText: '' };
    }

    const outcomes = choice.outcomes ?? [];
    if (outcomes.length === 0) {
      return { outcome: { type: 'nothing' }, choiceText: choice.text ?? '' };
    }

    // Roll probability
    const roll = this._random();
    let cumulative = 0;
    for (const entry of outcomes) {
      cumulative += entry.probability ?? 0;
      if (roll < cumulative) {
        return { outcome: entry.result, choiceText: choice.text ?? '' };
      }
    }

    // Fallback to last outcome (handles floating point edge cases)
    return { outcome: outcomes[outcomes.length - 1].result, choiceText: choice.text ?? '' };
  }

  /**
   * Check whether all conditions on a branch/choice are met.
   * Supported condition types: has_item, hp_below
   * @param {object} branch - A choice object with a `conditions` array
   * @param {object} playerState - PlayerState instance
   * @returns {boolean}
   */
  checkBranchConditions(branch, playerState) {
    const conditions = branch?.conditions;
    if (!conditions || conditions.length === 0) return true;

    for (const cond of conditions) {
      switch (cond.type) {
        case 'has_item': {
          // Check via itemSystem if available, otherwise check playerState inventory
          if (this._itemSystem) {
            if (!this._itemSystem.hasItem(cond.itemId)) return false;
          }
          break;
        }
        case 'hp_below': {
          if (playerState.hp >= cond.value) return false;
          break;
        }
        default:
          // Unknown condition type — treat as not met for safety
          return false;
      }
    }
    return true;
  }

  /**
   * Refresh events on explored empty tiles every 30 turns.
   * Low probability refresh influenced by terrain and building config.
   * @param {object} mapData - MapData instance with getAllTiles()
   * @param {number} currentTurn - Current turn number
   * @returns {Array<{q: number, r: number, eventId: string}>} Newly placed events
   */
  refreshEvents(mapData, currentTurn) {
    const refreshed = [];

    // Only refresh on multiples of 30
    if (currentTurn <= 0 || currentTurn % 30 !== 0) return refreshed;

    const allTiles = mapData.getAllTiles ? mapData.getAllTiles() : [];

    for (const tile of allTiles) {
      // Only refresh explored empty tiles (no existing event)
      if (tile.event) continue;
      if (tile.fogState === 'unexplored') continue;

      const terrainDef = this._terrainTypes[tile.terrain];
      if (!terrainDef) continue;

      // Base refresh chance from terrain config
      let refreshChance = terrainDef.refreshChance ?? 0;

      // Building influence on refresh chance
      if (tile.building) {
        const buildingDef = this._buildingTypes[tile.building];
        if (buildingDef?.effect?.eventRefreshBonus) {
          refreshChance += buildingDef.effect.eventRefreshBonus;
        }
        // Cities suppress event refresh
        if (buildingDef?.effect?.refreshSuppression) {
          continue;
        }
      }

      if (refreshChance <= 0) continue;

      const roll = this._random();
      if (roll < refreshChance) {
        // Pick an event based on terrain type
        const eventId = this._pickEventForTerrain(tile.terrain, tile.building);
        if (eventId) {
          refreshed.push({ q: tile.q, r: tile.r, eventId });
        }
      }
    }

    return refreshed;
  }

  /**
   * Get available event IDs for a given terrain type and optional building type.
   * Uses terrain eventWeights and building triggerEvent config.
   * @param {string} terrainType
   * @param {string} [buildingType]
   * @returns {string[]} Array of event IDs
   */
  getAvailableEvents(terrainType, buildingType) {
    const available = [];

    // If building has a trigger event, include it
    if (buildingType) {
      const buildingDef = this._buildingTypes[buildingType];
      if (buildingDef?.triggerEvent) {
        available.push(buildingDef.triggerEvent);
      }
    }

    // Get terrain overnight events as candidates
    const terrainDef = this._terrainTypes[terrainType];
    if (terrainDef?.overnightEvents) {
      for (const evtId of terrainDef.overnightEvents) {
        if (this._events[evtId] && !available.includes(evtId)) {
          available.push(evtId);
        }
      }
    }

    // Also include events matching terrain event weight categories
    const weights = terrainDef?.eventWeights;
    if (weights) {
      for (const [eventId, def] of Object.entries(this._events)) {
        if (def.type && weights[def.type] != null && weights[def.type] > 0) {
          if (!available.includes(eventId)) {
            available.push(eventId);
          }
        }
      }
    }

    return available;
  }

  /**
   * Pick a random event for a terrain type, weighted by event type weights.
   * @param {string} terrainType
   * @param {string} [buildingType]
   * @returns {string|null}
   * @private
   */
  _pickEventForTerrain(terrainType, buildingType) {
    // If building has a specific trigger event, use that
    if (buildingType) {
      const buildingDef = this._buildingTypes[buildingType];
      if (buildingDef?.triggerEvent) {
        return buildingDef.triggerEvent;
      }
    }

    const terrainDef = this._terrainTypes[terrainType];
    if (!terrainDef) return null;

    const weights = terrainDef.eventWeights;
    if (!weights) return null;

    // Build weighted pool of event types
    const typeEntries = Object.entries(weights).filter(([, w]) => w > 0);
    if (typeEntries.length === 0) return null;

    // Roll for event type
    const totalWeight = typeEntries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this._random() * totalWeight;
    let selectedType = typeEntries[typeEntries.length - 1][0];
    for (const [type, weight] of typeEntries) {
      roll -= weight;
      if (roll <= 0) {
        selectedType = type;
        break;
      }
    }

    // Find events matching the selected type
    const candidates = Object.entries(this._events)
      .filter(([, def]) => def.type === selectedType);

    if (candidates.length === 0) return null;

    // Pick a random candidate
    const idx = Math.floor(this._random() * candidates.length);
    return candidates[idx][0];
  }
}
