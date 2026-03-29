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

  /** Generate inline item icon HTML for choice text */
  _itemIcon(itemId, size = 24) {
    if (!this._itemSystem) return '';
    const defs = this._itemSystem._itemDefs ?? {};
    const def = defs[itemId];
    if (def?.sprite) {
      return `<img src="${def.sprite}" style="width:${size}px;height:${size}px;vertical-align:middle;display:inline-block;margin:0 2px;">`;
    }
    return '';
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

    // Temporarily set current terrain on playerState for on_terrain condition checks
    const prevTerrain = this._playerState._currentTerrain;
    this._playerState._currentTerrain = tileData?.terrain ?? null;

    // Filter choices by branch conditions
    const availableChoices = (def.choices ?? []).map((choice, index) => {
      const conditionsMet = this.checkBranchConditions(choice, this._playerState);
      return { ...choice, originalIndex: index, conditionsMet };
    }).filter(c => c.conditionsMet);

    // Append item icons to choices unlocked by has_item conditions
    for (const choice of availableChoices) {
      const conditions = choice.conditions ?? [];
      for (const cond of conditions) {
        if (cond.type === 'has_item' && cond.itemId) {
          const icon = this._itemIcon(cond.itemId);
          if (icon && !choice.text.includes(cond.itemId)) {
            choice.text = choice.text + ' ' + icon;
          }
        }
      }
    }

    // Hide trade choices where all items in pool are already owned/blocked
    if (this._itemSystem) {
      for (let i = availableChoices.length - 1; i >= 0; i--) {
        const choice = availableChoices[i];
        const outcomes = choice.outcomes ?? [];
        const tradeOutcome = outcomes.find(o => o.result?.type === 'trade' && o.result?.itemPool);
        if (tradeOutcome) {
          const pool = tradeOutcome.result.itemPool;
          const hasAcquirable = pool.some(id => this._itemSystem.canAcquire(id));
          if (!hasAcquirable) {
            availableChoices.splice(i, 1);
          }
        }
      }
    }

    // Restore previous terrain
    this._playerState._currentTerrain = prevTerrain;

    // Ruin loot upgrade (drill): upgrade common itemPools in ruin/cave/mine events (deep clone to avoid mutating originals)
    if (this._itemSystem) {
      const ruinUpgrade = this._itemSystem.getActiveEffects().ruinLootUpgrade;
      if (ruinUpgrade) {
        const upgradeEvents = ['ruin_explore', 'cave_explore', 'mine_explore'];
        if (upgradeEvents.includes(eventId)) {
          const rarePool = ['telescope', 'rope_claw', 'fire_boots', 'compass', 'boat', 'sword', 'shield', 'whip'];
          for (const choice of availableChoices) {
            if (!choice.outcomes) continue;
            choice.outcomes = choice.outcomes.map(o => {
              const r = o.result;
              if (!r) return o;
              if (r.type === 'item_reward' && r.itemPool) {
                return { ...o, result: { ...r, itemPool: r.itemPool.map(id => {
                  const d = (this._itemSystem._itemDefs ?? {})[id];
                  return (d && d.quality === 'common') ? rarePool[Math.floor(this._random() * rarePool.length)] : id;
                })}};
              }
              if (r.type === 'multi' && Array.isArray(r.results)) {
                return { ...o, result: { ...r, results: r.results.map(sub => {
                  if (sub.type === 'item_reward' && sub.itemPool) {
                    return { ...sub, itemPool: sub.itemPool.map(id => {
                      const d = (this._itemSystem._itemDefs ?? {})[id];
                      return (d && d.quality === 'common') ? rarePool[Math.floor(this._random() * rarePool.length)] : id;
                    })};
                  }
                  return sub;
                })}};
              }
              return o;
            });
          }
        }
      }
    }

    // Beast flute: inject "召唤动物伙伴" option into combat events
    if (def.type === 'combat' && this._itemSystem && this._itemSystem.hasActiveItem('beast_flute')) {
      // Find the first "fight" choice and create a beast-assisted version
      const fightChoice = availableChoices.find(c => c.originalIndex === 0);
      if (fightChoice) {
        // Clone the fight outcomes but improve them (less damage, more gold)
        const beastOutcomes = (fightChoice.outcomes ?? []).map(o => {
          const r = o.result;
          if (!r) return o;
          const improved = { ...r };
          // Reduce HP loss by ~40%
          if (r.type === 'hp_change' && (r.value ?? 0) < 0) {
            improved.value = Math.ceil(r.value * 0.6);
          }
          if (r.type === 'multi' && Array.isArray(r.results)) {
            improved.results = r.results.map(sub => {
              if (sub.type === 'hp_change' && (sub.value ?? 0) < 0) {
                return { ...sub, value: Math.ceil(sub.value * 0.6) };
              }
              return sub;
            });
          }
          return { ...o, result: improved };
        });
        // Shift probabilities toward better outcomes
        if (beastOutcomes.length >= 2) {
          beastOutcomes[0].probability = Math.min(1, (beastOutcomes[0].probability ?? 0.5) + 0.2);
          const remaining = 1 - beastOutcomes[0].probability;
          const otherTotal = beastOutcomes.slice(1).reduce((s, o) => s + (o.probability ?? 0), 0);
          if (otherTotal > 0) {
            for (let i = 1; i < beastOutcomes.length; i++) {
              beastOutcomes[i].probability = (beastOutcomes[i].probability ?? 0) / otherTotal * remaining;
            }
          }
        }
        availableChoices.push({
          text: `吹响唤兽笛召唤伙伴助战 ${this._itemIcon('beast_flute')}`,
          conditions: [],
          outcomes: beastOutcomes,
          originalIndex: availableChoices.length,
          conditionsMet: true,
        });
      }
    }

    // Scare mechanic: straw_doll (permanent) and balloon (consumable)
    if (def.type === 'combat' && this._itemSystem) {
      const effects = this._itemSystem.getActiveEffects();
      const scareChance = effects.scareChance ?? 0;
      const difficultyMod = def.deathWarning ? 0.5 : 1.0;
      const hasBalloon = this._itemSystem.hasActiveItem('balloon');
      const hasStrawDoll = this._itemSystem.hasActiveItem('straw_doll');

      if (scareChance > 0 && (hasBalloon || hasStrawDoll) && this._random() < scareChance * difficultyMod) {
        // Calculate rewards/penalties from fight outcomes
        const fightChoice = availableChoices.find(c => c.originalIndex === 0);
        let goldReward = 15;
        let worstHpLoss = -20;
        if (fightChoice) {
          for (const o of (fightChoice.outcomes ?? [])) {
            const r = o.result;
            if (r?.type === 'gold_change' && (r.value ?? 0) > goldReward) goldReward = r.value;
            if (r?.type === 'hp_change' && (r.value ?? 0) < worstHpLoss) worstHpLoss = r.value;
            if (r?.type === 'multi' && Array.isArray(r.results)) {
              for (const sub of r.results) {
                if (sub.type === 'gold_change' && (sub.value ?? 0) > goldReward) goldReward = sub.value;
                if (sub.type === 'hp_change' && (sub.value ?? 0) < worstHpLoss) worstHpLoss = sub.value;
              }
            }
          }
        }

        // Straw doll: permanent scare (no consume, 80% success)
        if (hasStrawDoll) {
          availableChoices.push({
            text: `举起稻草人吓唬敌人 ${this._itemIcon('straw_doll')}`,
            conditions: [],
            outcomes: [
              { probability: 0.8, result: { type: 'gold_change', value: goldReward, message: `稻草人的诡异外表吓跑了敌人！你捡起了它们掉落的金币。+${goldReward} 金币` } },
              { probability: 0.2, result: { type: 'hp_change', value: Math.floor(worstHpLoss * 0.5), message: `敌人没被吓到，反而被激怒了！${Math.floor(worstHpLoss * 0.5)} HP` } },
            ],
            originalIndex: availableChoices.length,
            conditionsMet: true,
          });
        }

        // Balloon: consumable scare (70% success, stronger penalty on fail)
        if (hasBalloon) {
          availableChoices.push({
            text: `扎破气球吓唬敌人（消耗气球） ${this._itemIcon('balloon')}`,
            conditions: [],
            outcomes: [
              { probability: 0.7, result: { type: 'multi', results: [{ type: 'consume_item', itemId: 'balloon' }, { type: 'gold_change', value: goldReward }], message: `砰！巨大的爆炸声把敌人吓跑了！你捡起了它们掉落的金币。+${goldReward} 金币` } },
              { probability: 0.3, result: { type: 'multi', results: [{ type: 'consume_item', itemId: 'balloon' }, { type: 'hp_change', value: Math.floor(worstHpLoss * 1.3) }], message: `砰！爆炸声激怒了敌人！它们发狂般地攻击你！${Math.floor(worstHpLoss * 1.3)} HP` } },
            ],
            originalIndex: availableChoices.length,
            conditionsMet: true,
          });
        }
      }
    }

    // Pharaoh codex: inject "劝降" option into combat events (30% chance to appear)
    if (def.type === 'combat' && this._itemSystem) {
      const effects = this._itemSystem.getActiveEffects();
      if (effects.combatSurrenderChance > 0 && this._random() < effects.combatSurrenderChance) {
        const fightChoice = availableChoices.find(c => c.originalIndex === 0);
        let goldReward = 20;
        let worstHpLoss = -25;
        if (fightChoice) {
          for (const o of (fightChoice.outcomes ?? [])) {
            const r = o.result;
            if (r?.type === 'gold_change' && (r.value ?? 0) > goldReward) goldReward = r.value;
            if (r?.type === 'hp_change' && (r.value ?? 0) < worstHpLoss) worstHpLoss = r.value;
            if (r?.type === 'multi' && Array.isArray(r.results)) {
              for (const sub of r.results) {
                if (sub.type === 'gold_change' && (sub.value ?? 0) > goldReward) goldReward = sub.value;
                if (sub.type === 'hp_change' && (sub.value ?? 0) < worstHpLoss) worstHpLoss = sub.value;
              }
            }
          }
        }
        availableChoices.push({
          text: `以法老之名劝降 ${this._itemIcon('pharaoh_codex')}`,
          conditions: [],
          outcomes: [
            { probability: 0.7, result: { type: 'gold_change', value: goldReward, message: `敌人被法老法典的威严所震慑，放下武器投降了！你获得了它们的财物。+${goldReward} 金币` } },
            { probability: 0.3, result: { type: 'hp_change', value: Math.floor(worstHpLoss * 1.5), message: `敌人不吃这一套！被激怒后发起了猛攻！${Math.floor(worstHpLoss * 1.5)} HP` } },
          ],
          originalIndex: availableChoices.length,
          conditionsMet: true,
        });
      }
    }

    // Bribe: inject "花钱打发" option into bandit/combat events
    if (def.type === 'combat' && this._itemSystem) {
      const hasBribe = this._itemSystem.getActiveEffects().eventOptionUnlocks?.includes('bribe');
      if (hasBribe) {
        const bribeCost = def.deathWarning ? 40 : 20;
        if ((this._playerState.gold ?? 0) >= bribeCost) {
          availableChoices.push({
            text: `花 ${bribeCost} 金币贿赂对方 ${this._itemIcon('diplomat_kit') || this._itemIcon('briefcase')}`,
            conditions: [],
            outcomes: [
              { probability: 0.85, result: { type: 'gold_change', value: -bribeCost, message: `你掏出金币递了过去，对方收下后放你离开了。-${bribeCost} 金币` } },
              { probability: 0.15, result: { type: 'multi', results: [{ type: 'gold_change', value: -bribeCost }, { type: 'hp_change', value: -10 }], message: `对方收了钱还是打了你一顿！-${bribeCost} 金币，-10 HP` } },
            ],
            originalIndex: availableChoices.length,
            conditionsMet: true,
          });
        }
      }
    }

    // Earphone hint: small chance to mark a positive option (Task 8.4)
    if (this._itemSystem) {
      const effects = this._itemSystem.getActiveEffects();
      if (effects.earphoneHintChance > 0 && this._random() < effects.earphoneHintChance) {
        const earphoneIcon = this._itemIcon('earphone') || '🎧';
        // Find a choice with positive outcomes and mark it
        for (const choice of availableChoices) {
          const outcomes = choice.outcomes ?? [];
          const hasPositive = outcomes.some(o => {
            const r = o.result;
            return r && (r.type === 'item_reward' || r.type === 'relic_fragment' ||
              (r.type === 'hp_change' && (r.value ?? 0) > 0) ||
              (r.type === 'gold_change' && (r.value ?? 0) > 0) ||
              r.type === 'nothing');
          });
          if (hasPositive && !choice.text.includes('🎧') && !choice.text.includes('earphone')) {
            choice.text = choice.text + ' ' + earphoneIcon;
            break;
          }
        }
      }
    }

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

    // Luck modifier: shift probability toward first (usually best) outcome
    let luckMod = this._itemSystem ? (this._itemSystem.getActiveEffects().luckModifier ?? 0) : 0;
    // NPC friendly: extra luck for non-combat events
    if (this._itemSystem && this._itemSystem.getActiveEffects().npcFriendly && eventInstance.definition?.type !== 'combat') {
      luckMod += 0.15;
    }
    let adjustedOutcomes = outcomes;
    if (luckMod !== 0 && outcomes.length >= 2) {
      adjustedOutcomes = outcomes.map((o, i) => {
        const p = o.probability ?? 0;
        if (i === 0) return { ...o, probability: Math.min(1, p + luckMod) };
        return { ...o, probability: Math.max(0, p - luckMod / (outcomes.length - 1)) };
      });
    }

    // Roll probability
    const roll = this._random();
    let cumulative = 0;
    for (const entry of adjustedOutcomes) {
      cumulative += entry.probability ?? 0;
      if (roll < cumulative) {
        return { outcome: entry.result, choiceText: choice.text ?? '' };
      }
    }

    // Fallback to last outcome
    return { outcome: adjustedOutcomes[adjustedOutcomes.length - 1].result, choiceText: choice.text ?? '' };
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
        case 'gold_cost': {
          if ((playerState.gold ?? 0) < (cond.value ?? 0)) return false;
          break;
        }
        case 'has_metal_item': {
          // Check if player has any item tagged as "metal" in item config
          if (!this._itemSystem) return false;
          const inventory = this._itemSystem.getInventory();
          const itemDefs = this._itemSystem._itemDefs ?? {};
          const hasMetal = inventory.some(item => {
            const def = itemDefs[item.itemId];
            return def?.tags?.includes('metal');
          });
          if (!hasMetal) return false;
          break;
        }
        case 'has_item_quality': {
          // Check if player has any item of specified quality
          if (!this._itemSystem) return false;
          const inv = this._itemSystem.getInventory();
          const hasQuality = inv.some(item => item.quality === cond.quality);
          if (!hasQuality) return false;
          break;
        }
        case 'on_terrain': {
          // Check current tile terrain — uses tileData passed via playerState._currentTerrain
          // or via the branch's _tileData context
          const currentTerrain = playerState._currentTerrain ?? null;
          if (!currentTerrain || currentTerrain !== cond.terrain) return false;
          break;
        }
        case 'hp_above': {
          if (playerState.hp <= (cond.value ?? 0)) return false;
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
        // Skip all building tiles — buildings have their own event system
        continue;
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
