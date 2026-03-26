/**
 * GameLoop — 游戏主循环 / 状态机
 * 状态：INIT → PLAYING → EVENT_DIALOG → GAME_OVER → VICTORY
 *
 * Wires all systems together via EventBus.
 * Uses OFFSET coordinates (col, row) throughout.
 */
import { HexRenderer } from '../render/HexRenderer.js';

const STATES = { INIT: 'INIT', PLAYING: 'PLAYING', EVENT_DIALOG: 'EVENT_DIALOG', GAME_OVER: 'GAME_OVER', VICTORY: 'VICTORY' };

export class GameLoop {
  /**
   * @param {object} opts
   * @param {import('./EventBus.js').EventBus} opts.eventBus
   * @param {import('../render/RenderEngine.js').RenderEngine} opts.renderEngine
   * @param {import('../ui/UIManager.js').UIManager} opts.uiManager
   * @param {import('../ui/InputHandler.js').InputHandler} opts.inputHandler
   * @param {import('../systems/PlayerState.js').PlayerState} opts.playerState
   * @param {import('../systems/MovementSystem.js').MovementSystem} opts.movementSystem
   * @param {import('../systems/TurnSystem.js').TurnSystem} opts.turnSystem
   * @param {import('../systems/EventSystem.js').EventSystem} opts.eventSystem
   * @param {import('../systems/FogSystem.js').FogSystem} opts.fogSystem
   * @param {import('../systems/ItemSystem.js').ItemSystem} opts.itemSystem
   * @param {import('../systems/BuildingSystem.js').BuildingSystem} opts.buildingSystem
   * @param {import('../systems/SaveSystem.js').SaveSystem} opts.saveSystem
   * @param {import('../map/MapData.js').MapData} opts.mapData
   * @param {object} opts.configs - { terrain, building, item, event }
   * @param {number} opts.seed
   * @param {string} opts.mapSize
   */
  constructor(opts) {
    this.state = STATES.INIT;
    this.eventBus = opts.eventBus;
    this.renderEngine = opts.renderEngine;
    this.uiManager = opts.uiManager;
    this.inputHandler = opts.inputHandler;
    this.playerState = opts.playerState;
    this.movementSystem = opts.movementSystem;
    this.turnSystem = opts.turnSystem;
    this.eventSystem = opts.eventSystem;
    this.fogSystem = opts.fogSystem;
    this.itemSystem = opts.itemSystem;
    this.buildingSystem = opts.buildingSystem;
    this.saveSystem = opts.saveSystem;
    this.mapData = opts.mapData;
    this.configs = opts.configs;
    this.seed = opts.seed;
    this.mapSize = opts.mapSize;

    /** Currently selected tile {col, row} or null */
    this._selectedTile = null;

    /** Mystery egg hatch tracking: turn number when egg was picked up */
    this._mysteryEggPickupTurn = null;

    /** Track building events triggered this turn to prevent re-trigger: Set of "col,row" */
    this._buildingEventsTriggeredThisTurn = new Set();
  }

  /** Start the game loop — wire events and transition to PLAYING */
  start() {
    this._wireEvents();
    this._initFog();
    this._syncRender();
    this._updateHUD();
    this._autoSave();
    this.state = STATES.PLAYING;
  }

  // ── Event wiring ────────────────────────────────────────────

  _wireEvents() {
    const eb = this.eventBus;

    // Remove any previous GameLoop listeners to prevent duplicates
    eb.off('hex:click');
    eb.off('ui:end-turn');
    eb.off('ui:center-player');
    eb.off('ui:request-save');
    eb.off('ui:import-save');
    eb.off('hud:item-click');

    // Hex click → select / move
    eb.on('hex:click', (data) => this._onHexClick(data));

    // UI buttons
    eb.on('ui:end-turn', () => this._onEndTurn());
    eb.on('ui:center-player', () => this._centerOnPlayer());
    eb.on('ui:request-save', (cb) => this._onExportSave(cb));
    eb.on('ui:import-save', (data) => this._onImportSave(data));

    // Item toggle from HUD
    eb.on('hud:item-click', ({ itemId }) => {
      if (this.state !== STATES.PLAYING) return;
      this.itemSystem.toggleItem(itemId);
      this._updateHUD();
    });
  }

  // ── Hex click handler ───────────────────────────────────────

  _onHexClick({ col, row }) {
    if (this.state !== STATES.PLAYING) return;

    const tile = this.mapData.getTile(col, row);
    if (!tile) return;

    // Only interact with visible/explored tiles
    const vis = this.fogSystem.getTileVisibility(col, row);
    if (vis === 'unexplored') return;

    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;

    // Check if this tile is adjacent to the player
    const isAdj = this._isAdjacent(pCol, pRow, col, row);

    // If clicking the already-selected adjacent tile → move
    if (this._selectedTile && this._selectedTile.col === col && this._selectedTile.row === row && isAdj) {
      this._tryMove(col, row);
      return;
    }

    // Otherwise select the tile and show info
    this._selectedTile = { col, row };
    this.renderEngine.highlightTile(col, row);

    // Show tile info via toast
    const info = this.renderEngine.showTileInfo(col, row);
    if (info) {
      let msg = `(${col},${row}) ${tile.terrain} 海拔${tile.elevation}`;
      if (tile.building) msg += ` 🏗️${tile.building}`;
      if (tile.event && vis === 'visible') msg += ` ❓事件`;
      if (isAdj) {
        // Show AP cost
        const fromTile = this._getPlayerTileData();
        const toTile = this._getTileData(col, row);
        const check = this.movementSystem.canMoveTo(fromTile, toTile);
        if (check.allowed) {
          const cost = this.movementSystem.calculateAPCost(fromTile, toTile);
          msg += ` | AP消耗: ${cost} 👆再次点击移动`;
        } else {
          msg += ` | ❌${check.reason}`;
        }
      }
      this.eventBus.emit('ui:toast', msg);
    }
  }

  // ── Movement ────────────────────────────────────────────────

  async _tryMove(col, row) {
    const fromTile = this._getPlayerTileData();
    const toTile = this._getTileData(col, row);

    const check = this.movementSystem.canMoveTo(fromTile, toTile);
    if (!check.allowed) {
      this.eventBus.emit('ui:toast', `❌ ${check.reason}`);
      return;
    }

    // Execute move
    const result = this.movementSystem.executeMove(fromTile, toTile);
    if (!result.success) {
      this.eventBus.emit('ui:toast', `❌ ${result.reason}`);
      return;
    }

    // Update player position (offset coords stored as q=col, r=row)
    this.playerState.position = { q: col, r: row };
    this._selectedTile = null;

    // Fall damage dialog (Task 5.2/5.3/5.4)
    if (result.fallDamageEvent && result.pendingFallDamage > 0) {
      await this._handleFallDamage(result.pendingFallDamage);
      if (this.state !== STATES.PLAYING) return;
    }

    // Bleed damage notification
    if (result.bleedDamage > 0) {
      this.eventBus.emit('ui:toast', `🩸 流血 -${result.bleedDamage} HP`);
    }

    // Terrain enter damage
    this._applyTerrainEnterEffects(toTile);

    // Desert thirst field effect
    this._applyFieldEffects(toTile);

    // Check death after move damage
    if (this.playerState.hp <= 0) {
      await this._onDeath();
      return;
    }

    // Update fog using offset-based BFS
    this._updateFogOffset(col, row);

    // Update render
    this.renderEngine.updatePlayerPosition(col, row);
    this.renderEngine.clearHighlight();
    await this.renderEngine.centerOnTile(col, row);

    // Check building effects
    const tile = this.mapData.getTile(col, row);
    let buildingHandledEvent = false;
    if (tile.building) {
      const bKey = `${col},${row}`;
      const bDef = this.buildingSystem.getBuildingDef(tile.building);
      // Skip building event if already triggered this turn (cooldown)
      if (bDef?.triggerEvent && this._buildingEventsTriggeredThisTurn.has(bKey)) {
        buildingHandledEvent = true; // skip both building and tile event
      } else {
        await this._handleBuilding(tile, col, row);
        if (this.state !== STATES.PLAYING) return;
        if (bDef?.triggerEvent) {
          buildingHandledEvent = true;
          this._buildingEventsTriggeredThisTurn.add(bKey);
        }
      }
    }

    // Check tile event (skip if building already handled it)
    if (tile.event && !buildingHandledEvent) {
      await this._handleTileEvent(tile, col, row);
      if (this.state !== STATES.PLAYING) return;
    }

    // Check death after events
    if (this.playerState.hp <= 0) {
      await this._onDeath();
      return;
    }

    // Auto end turn if AP depleted
    if (this.playerState.ap <= 0) {
      await this._onEndTurn();
      return;
    }

    this._updateHUD();
  }

  // ── Fall damage handling (Task 5) ─────────────────────────

  /**
   * Handle pending fall damage: show dialog, optionally use parachute, apply damage, 30% bleed.
   * @param {number} damage - Pending fall damage amount
   */
  async _handleFallDamage(damage) {
    const hasParachute = this.itemSystem.hasActiveItem('parachute')
      && this.itemSystem.isConsumable('parachute');

    if (hasParachute) {
      // Show parachute choice dialog (Task 5.3)
      const choiceIdx = await this.uiManager.dialog.showEvent({
        title: '⚠️ 即将摔伤！',
        description: `你从高处跌落，即将受到 ${damage} 点伤害！`,
        choices: [
          { text: '🪂 使用降落伞（消耗）' },
          { text: '💪 硬扛' },
        ],
      });

      if (choiceIdx === 0) {
        // Use parachute — immune to damage, consume it
        this.itemSystem.consumeItem('parachute');
        await this.uiManager.dialog.showResult({
          message: '🪂 降落伞展开，你安全着陆！',
          effects: ['降落伞已消耗'],
        });
        this._updateHUD();
        return;
      }
    }

    // Apply fall damage
    const { actualDamage } = this.playerState.applyDamage(damage, 'fall');

    // 30% chance to add bleed status (Task 5.4)
    let bleedApplied = false;
    if (Math.random() < 0.3) {
      const immunities = this.itemSystem.getActiveEffects().statusImmunities;
      if (!immunities.includes('bleed')) {
        this.playerState.addStatusEffect({ id: 'bleed' });
        bleedApplied = true;
      }
    }

    // Build effects list for dialog
    const effects = [`💔 HP -${actualDamage}`];
    if (bleedApplied) {
      effects.push('🩸 获得流血状态（1回合）');
    }

    // Show fall damage result dialog (Task 5.2)
    await this.uiManager.dialog.showResult({
      message: `⚠️ 摔伤！你从高处跌落，受到 ${actualDamage} 点伤害`,
      effects,
    });

    this._updateHUD();

    // Check death after fall damage
    if (this.playerState.hp <= 0) {
      await this._onDeath();
    }
  }

  // ── Terrain enter effects ───────────────────────────────────

  _applyTerrainEnterEffects(toTile) {
    const tc = this.configs.terrain?.terrainTypes?.[toTile.terrain];
    if (!tc) return;

    // Enter damage (e.g. lava)
    if (tc.enterDamage > 0 && tc.enterDamageChance > 0) {
      if (Math.random() < tc.enterDamageChance) {
        // Check item immunity
        const effects = this.itemSystem.getActiveEffects();
        const hasImmunity = effects.terrainPass.some(e => e.type === 'enter_damage_immunity' && e.terrainType === toTile.terrain);
        if (!hasImmunity) {
          this.playerState.applyDamage(tc.enterDamage, 'terrain');
          this.eventBus.emit('ui:toast', `🔥 ${tc.name}伤害 -${tc.enterDamage} HP`);
        }
      }
    }

    // Status on enter (e.g. swamp poison)
    if (tc.statusOnEnter && tc.statusOnEnterChance > 0) {
      if (Math.random() < tc.statusOnEnterChance) {
        const immunities = this.itemSystem.getActiveEffects().statusImmunities;
        if (!immunities.includes(tc.statusOnEnter)) {
          this.playerState.addStatusEffect({
            id: tc.statusOnEnter,
          });
          this.eventBus.emit('ui:toast', `☠️ 获得状态: ${tc.statusOnEnter}`);
        }
      }
    }
  }

  // ── Building handling ───────────────────────────────────────

  /**
   * Apply terrain field effects (e.g. desert thirst).
   * These are probabilistic effects triggered on move, not enter damage.
   */
  _applyFieldEffects(toTile) {
    const tc = this.configs.terrain?.terrainTypes?.[toTile.terrain];
    if (!tc?.fieldEffect) return;

    const fe = tc.fieldEffect;
    if (fe.type === 'thirst' && fe.chance > 0) {
      if (Math.random() < fe.chance) {
        // Check immunity via item
        if (fe.immuneItem) {
          const hasImmune = this.itemSystem.hasActiveItem(fe.immuneItem);
          // Also check elixir as immune
          const hasElixir = this.itemSystem.hasActiveItem('elixir');
          if (hasImmune || hasElixir) {
            return;
          }
        }
        // Apply thirst: lose AP and HP
        const apLoss = fe.apLoss ?? 0.5;
        const hpLoss = fe.hpLoss ?? 3;
        this.playerState.ap = Math.max(0, this.playerState.ap - apLoss);
        if (hpLoss > 0) {
          this.playerState.applyDamage(hpLoss, 'thirst');
        }
        this.eventBus.emit('ui:toast', `🏜️ 干渴 -${apLoss} AP -${hpLoss} HP`);
      }
    }
  }

  // ── Building handling (original) ────────────────────────────

  async _handleBuilding(tile, col, row) {
    const result = this.buildingSystem.triggerBuildingEffect(
      { buildingId: tile.building, position: { q: col, r: row } },
      this.playerState,
      this.mapData
    );

    if (result.type === 'win_condition') {
      await this._checkWinCondition(col, row);
      return;
    }

    if (result.type === 'teleport' && result.teleportTarget) {
      const target = result.teleportTarget;
      this.playerState.position = { q: target.q, r: target.r };
      this._updateFogOffset(target.q, target.r);
      this.renderEngine.updatePlayerPosition(target.q, target.r);
      await this.renderEngine.centerOnTile(target.q, target.r);
      this.eventBus.emit('ui:toast', `⚡ 传送至 (${target.q}, ${target.r})`);
    }

    if (result.type === 'trigger_event' && result.eventId) {
      const eventTile = { ...tile, event: result.eventId };
      await this._handleTileEvent(eventTile, col, row);
    }

    // --- Passive AP restore (spring) ---
    if (result.type === 'passive_ap_restore') {
      const apRestore = result.apRestore ?? 0;
      if (apRestore > 0) {
        if (result.fullRestore) {
          this.playerState.ap = this.playerState.apMax;
        } else {
          this.playerState.ap = Math.min(this.playerState.apMax, this.playerState.ap + apRestore);
        }
        this.eventBus.emit('ui:toast', `🌊 ${result.message}`);
        this._updateHUD();
      }
    }

    if (result.message && result.type !== 'win_condition' && result.type !== 'teleport' && result.type !== 'trigger_event') {
      this.eventBus.emit('ui:toast', `🏗️ ${result.message}`);
    }
  }

  // ── Event handling ──────────────────────────────────────────

  async _handleTileEvent(tile, col, row) {
    // Handle item pickup events (item_pickup_xxx format)
    if (typeof tile.event === 'string' && tile.event.startsWith('item_pickup_')) {
      const itemId = tile.event.replace('item_pickup_', '');
      await this._handleItemPickup(itemId, col, row);
      return;
    }

    const eventInstance = this.eventSystem.triggerEvent(tile);
    if (!eventInstance) return;

    this.state = STATES.EVENT_DIALOG;

    const def = eventInstance.definition;
    const choices = eventInstance.availableChoices.map(c => ({ text: c.text }));

    if (choices.length === 0) {
      this.state = STATES.PLAYING;
      return;
    }

    // Show event dialog
    const choiceIdx = await this.uiManager.dialog.showEvent({
      title: def.title || '事件',
      description: def.description || '',
      deathWarning: def.deathWarning || false,
      choices,
    });

    // Resolve choice
    const eventResult = this.eventSystem.resolveChoice(eventInstance, choiceIdx);
    const outcome = eventResult.outcome;

    // Apply outcome
    const effectMessages = await this._applyEventOutcome(outcome);

    // Show result dialog — skip for "nothing" outcomes with no message (v1.2 Task 1.4)
    const resultMsg = outcome.message || '';
    const hasEffects = effectMessages.length > 0;
    const isNothingWithNoMessage = outcome.type === 'nothing' && !resultMsg && !hasEffects;

    if (!isNothingWithNoMessage) {
      await this.uiManager.dialog.showResult({
        message: resultMsg || '事件结束',
        effects: effectMessages,
      });
    }

    // Show combination dialog if a combination happened during the event
    if (this._pendingCombination) {
      const combo = this._pendingCombination;
      this._pendingCombination = null;
      const resultDef = this.configs.item?.items?.[combo.result];
      const matADef = this.configs.item?.items?.[combo.consumed[0]];
      const matBDef = this.configs.item?.items?.[combo.consumed[1]];
      await this.uiManager.dialog.showResult({
        message: '🔀 道具组合！',
        effects: [
          `${matADef?.name || combo.consumed[0]} + ${matBDef?.name || combo.consumed[1]}`,
          `→ ${resultDef?.name || combo.result}`,
          resultDef?.description || '',
        ],
      });
    }

    // Remove event from tile — but keep if:
    // 1. Repeatable building event
    // 2. Relic events where player didn't get the fragment yet
    const actualTile = this.mapData.getTile(col, row);
    if (actualTile) {
      const buildingDef = actualTile.building
        ? this.buildingSystem.getBuildingDef(actualTile.building)
        : null;
      const isRepeatable = buildingDef && buildingDef.repeatable;
      const isRelicEvent = typeof actualTile.event === 'string' &&
        actualTile.event.startsWith('relic_');
      // For relic events: only clear if player got a fragment this interaction
      const gotFragment = effectMessages.some(m => m.includes('圣物碎片'));
      if (isRepeatable) {
        // Keep repeatable building events
      } else if (isRelicEvent && !gotFragment) {
        // Keep relic event — player can come back
      } else {
        actualTile.event = null;
      }
    }

    // Refresh render to remove event marker
    this.renderEngine.updateFogLayer();

    this.state = STATES.PLAYING;
    this._updateHUD();

    // Check death after event
    if (this.playerState.hp <= 0) {
      await this._onDeath();
      return;
    }

    // After teleport: check events/buildings at destination
    if (this._pendingTeleportTarget) {
      const tp = this._pendingTeleportTarget;
      this._pendingTeleportTarget = null;
      const destTile = this.mapData.getTile(tp.q, tp.r);
      if (destTile) {
        if (destTile.building) {
          await this._handleBuilding(destTile, tp.q, tp.r);
          if (this.state !== STATES.PLAYING) return;
        }
        if (destTile.event && !destTile.building) {
          await this._handleTileEvent(destTile, tp.q, tp.r);
          if (this.state !== STATES.PLAYING) return;
        }
      }
    }
  }

  /**
   * Handle item_pickup_xxx events: show dialog, give item to player.
   */
  async _handleItemPickup(itemId, col, row) {
    const def = this.configs.item?.items?.[itemId];
    const itemName = def?.name || itemId;

    this.state = STATES.EVENT_DIALOG;

    const choiceIdx = await this.uiManager.dialog.showEvent({
      title: '🎁 发现物品',
      description: `你发现了一件物品：${itemName}。${def?.description || ''}`,
      choices: [
        { text: `拾取 ${itemName}` },
        { text: '离开' },
      ],
    });

    if (choiceIdx === 0) {
      if (this.itemSystem.addItem(itemId)) {
        await this.uiManager.dialog.showResult({
          message: `获得了 ${itemName}！`,
          effects: [`🎁 ${itemName}: ${def?.description || ''}`],
        });

        // Check combinations
        const combo = this.itemSystem.checkCombinations();
        if (combo.combined) {
          const resultDef = this.configs.item?.items?.[combo.result];
          const matADef = this.configs.item?.items?.[combo.consumed[0]];
          const matBDef = this.configs.item?.items?.[combo.consumed[1]];
          await this.uiManager.dialog.showResult({
            message: '🔀 道具组合！',
            effects: [
              `${matADef?.name || combo.consumed[0]} + ${matBDef?.name || combo.consumed[1]}`,
              `→ ${resultDef?.name || combo.result}`,
              resultDef?.description || '',
            ],
          });
        }
      } else {
        await this.uiManager.dialog.showResult({
          message: `你已经拥有 ${itemName} 了`,
          effects: [],
        });
      }
    }

    // Remove item from tile
    const actualTile = this.mapData.getTile(col, row);
    if (actualTile && choiceIdx === 0) actualTile.event = null;

    // Refresh fog immediately (vision items like telescope take effect now)
    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;
    this._updateFogOffset(pCol, pRow);
    this.renderEngine.updateFogLayer();
    this.state = STATES.PLAYING;
    this._updateHUD();
  }

  async _applyEventOutcome(outcome) {
    const effects = [];
    if (!outcome || outcome.type === 'nothing') return effects;

    if (outcome.type === 'hp_change') {
      const val = outcome.value ?? 0;
      if (val > 0) {
        const healed = this.playerState.heal(val);
        effects.push(`❤️ HP +${healed}`);
      } else if (val < 0) {
        const { actualDamage } = this.playerState.applyDamage(Math.abs(val));
        effects.push(`💔 HP -${actualDamage}`);

        // Hunting dog death chance after combat damage (Task 9.5)
        if (actualDamage > 0 && this.itemSystem.hasItem('hunting_dog')) {
          const dogDef = this.configs.item?.items?.['hunting_dog'];
          const deathChance = dogDef?.deathChance ?? 0.2;
          if (Math.random() < deathChance) {
            this.itemSystem.consumeItem('hunting_dog');
            effects.push('🐕 猎犬在战斗中牺牲了…');
          }
        }
      }
    }

    if (outcome.type === 'ap_change') {
      const val = outcome.value ?? 0;
      this.playerState.ap = Math.max(0, this.playerState.ap + val);
      effects.push(`⚡ AP ${val > 0 ? '+' : ''}${val}`);
    }

    if (outcome.type === 'item_reward') {
      const pool = outcome.itemPool || [];
      for (const itemId of pool) {
        if (this.itemSystem.addItem(itemId)) {
          const def = this.configs.item?.items?.[itemId];
          effects.push(`🎁 获得: ${def?.name || itemId}`);

          // Check combinations after adding item
          const combo = this.itemSystem.checkCombinations();
          if (combo.combined) {
            const resultDef = this.configs.item?.items?.[combo.result];
            const matADef = this.configs.item?.items?.[combo.consumed[0]];
            const matBDef = this.configs.item?.items?.[combo.consumed[1]];
            effects.push(`🔀 ${matADef?.name || combo.consumed[0]} + ${matBDef?.name || combo.consumed[1]} → ${resultDef?.name || combo.result}`);
            this._pendingCombination = combo;
          }

          break; // Only give one item per reward
        }
      }
    }

    if (outcome.type === 'relic_fragment') {
      this.playerState.relicsCollected += 1;
      effects.push(`💎 圣物碎片 (${this.playerState.relicsCollected}/3)`);
    }

    if (outcome.type === 'status_effect') {
      const immunities = this.itemSystem.getActiveEffects().statusImmunities;
      if (!immunities.includes(outcome.statusId)) {
        this.playerState.addStatusEffect({
          id: outcome.statusId,
          duration: outcome.duration,
        });
        effects.push(`☠️ 状态: ${outcome.statusId} (${outcome.duration}回合)`);
      } else {
        effects.push(`🛡️ 免疫: ${outcome.statusId}`);
      }
    }

    if (outcome.type === 'reveal_map') {
      const radius = outcome.radius || 5;
      const pCol = this.playerState.position.q;
      const pRow = this.playerState.position.r;
      this._revealArea(pCol, pRow, radius);
      this.renderEngine.updateFogLayer();
      effects.push(`🗺️ 揭开了周围${radius}格的迷雾`);
    }

    if (outcome.type === 'multi' && Array.isArray(outcome.results)) {
      for (const sub of outcome.results) {
        const subEffects = await this._applyEventOutcome(sub);
        effects.push(...subEffects);
      }
    }

    if (outcome.type === 'hp_max_change') {
      const val = outcome.value ?? 0;
      this.playerState.hpMax += val;
      if (val > 0) this.playerState.heal(val);
      effects.push(`💪 HP上限 ${val > 0 ? '+' : ''}${val}`);
    }

    if (outcome.type === 'ap_max_change') {
      const val = outcome.value ?? 0;
      this.playerState.apMax += val;
      if (val > 0) this.playerState.ap = Math.min(this.playerState.apMax, this.playerState.ap + val);
      effects.push(`⚡ AP上限 ${val > 0 ? '+' : ''}${val}`);
    }

    if (outcome.type === 'gold_change') {
      const val = outcome.value ?? 0;
      if (val < 0 && this.playerState.gold <= 0) {
        effects.push('🪙 你身无分文，没有金币可以损失');
      } else {
        const before = this.playerState.gold;
        this.playerState.gold = Math.max(0, this.playerState.gold + val);
        const actual = this.playerState.gold - before;
        effects.push(`🪙 金币 ${actual >= 0 ? '+' : ''}${actual}`);
      }
    }

    // --- New result types (v1.2 Task 1.2) ---

    if (outcome.type === 'teleport_random') {
      const target = this._findRandomExploredTile();
      if (target) {
        this.playerState.position = { q: target.q, r: target.r };
        this._updateFogOffset(target.q, target.r);
        this.renderEngine.updatePlayerPosition(target.q, target.r);
        await this.renderEngine.centerOnTile(target.q, target.r);
        effects.push(`⚡ 随机传送至 (${target.q}, ${target.r})`);
        this._pendingTeleportTarget = target;
      } else {
        effects.push('⚡ 传送失败，无可用目标');
      }
    }

    if (outcome.type === 'teleport_building') {
      const buildingType = outcome.buildingType;
      const target = this._findRandomBuildingTile(buildingType);
      if (target) {
        this.playerState.position = { q: target.q, r: target.r };
        this._updateFogOffset(target.q, target.r);
        this.renderEngine.updatePlayerPosition(target.q, target.r);
        await this.renderEngine.centerOnTile(target.q, target.r);
        effects.push(`⚡ 传送至${buildingType} (${target.q}, ${target.r})`);
        this._pendingTeleportTarget = target;
      } else {
        effects.push('⚡ 传送失败，未找到目标建筑');
      }
    }

    if (outcome.type === 'consume_item') {
      const itemId = outcome.itemId;
      if (this.itemSystem.consumeItem(itemId)) {
        const def = this.configs.item?.items?.[itemId];
        effects.push(`🗑️ 消耗: ${def?.name || itemId}`);
      }
    }

    if (outcome.type === 'remove_status') {
      const statusId = outcome.statusId;
      if (this.playerState.removeStatusEffect(statusId)) {
        effects.push(`✨ 解除状态: ${statusId}`);
      } else {
        effects.push(`✨ 无需解除: ${statusId}`);
      }
    }

    if (outcome.type === 'vision_permanent') {
      const val = outcome.value ?? 1;
      this.playerState._permanentVisionBonus = (this.playerState._permanentVisionBonus ?? 0) + val;
      // Refresh fog immediately so new vision takes effect
      const vpCol = this.playerState.position.q;
      const vpRow = this.playerState.position.r;
      this._updateFogOffset(vpCol, vpRow);
      this.renderEngine.updateFogLayer();
      effects.push(`👁️ 永久视野 +${val}`);
    }

    if (outcome.type === 'reset_combat_events') {
      let resetCount = 0;
      const allTiles = this.mapData.getAllTiles();
      const eventDefs = this.configs.event?.events ?? {};
      for (const tile of allTiles) {
        if (!tile.event) {
          // Check if this tile originally had a combat event that was consumed
          // We can't restore consumed events, but we can re-place combat events on empty explored tiles
          continue;
        }
      }
      // Reset: re-enable combat events that were cleared (tile.event set to null)
      // Actually, we mark tiles that had combat events cleared — but we don't track that.
      // Instead, re-place some combat events on explored empty tiles
      for (const tile of allTiles) {
        if (tile.event || tile.building) continue;
        const vis = this.fogSystem.getTileVisibility(tile.q, tile.r);
        if (vis === 'unexplored') continue;
        // Small chance to place a combat event
        if (Math.random() < 0.1) {
          const terrainDef = this.configs.terrain?.terrainTypes?.[tile.terrain];
          const weights = terrainDef?.eventWeights;
          if (weights && weights.combat > 0) {
            // Pick a combat event
            const combatEvents = Object.entries(eventDefs)
              .filter(([, d]) => d.type === 'combat')
              .map(([id]) => id);
            if (combatEvents.length > 0) {
              tile.event = combatEvents[Math.floor(Math.random() * combatEvents.length)];
              resetCount++;
            }
          }
        }
      }
      this.renderEngine.updateFogLayer();
      effects.push(`🔄 重置了 ${resetCount} 个战斗事件`);
    }

    if (outcome.type === 'fog_reveal_random') {
      const count = outcome.count ?? 5;
      let revealed = 0;
      const allTiles = this.mapData.getAllTiles();
      const unexplored = allTiles.filter(t => this.fogSystem.getTileVisibility(t.q, t.r) === 'unexplored');
      // Shuffle and reveal up to count
      for (let i = unexplored.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unexplored[i], unexplored[j]] = [unexplored[j], unexplored[i]];
      }
      for (let i = 0; i < Math.min(count, unexplored.length); i++) {
        const t = unexplored[i];
        this.fogSystem._fogState.set(`${t.q},${t.r}`, 'explored');
        revealed++;
      }
      if (revealed > 0) this.renderEngine.updateFogLayer();
      effects.push(`🗺️ 随机揭开了 ${revealed} 格迷雾`);
    }

    if (outcome.type === 'trade') {
      const cost = outcome.goldCost ?? 0;
      const itemPool = outcome.itemPool ?? [];
      // Filter out items player already has
      const available = itemPool.filter(id => !this.itemSystem.hasItem(id));
      if (this.playerState.gold >= cost && available.length > 0) {
        this.playerState.gold -= cost;
        const itemId = available[Math.floor(Math.random() * available.length)];
        if (this.itemSystem.addItem(itemId)) {
          const def = this.configs.item?.items?.[itemId];
          effects.push(`🪙 -${cost} 金币`);
          effects.push(`🎁 获得: ${def?.name || itemId}`);
        }
      } else if (this.playerState.gold >= cost && available.length === 0) {
        // All items already owned — give gold bonus instead
        const bonus = Math.floor(cost * 0.5);
        effects.push(`商人没有你需要的东西。「下次再来吧！」`);
        if (bonus > 0) {
          this.playerState.gold += bonus;
          effects.push(`🪙 商人送了你 ${bonus} 金币作为补偿`);
        }
      } else if (this.playerState.gold < cost) {
        effects.push(`🪙 金币不足（需要 ${cost}）`);
      }
    }

    if (outcome.type === 'sacrifice_item') {
      const itemId = outcome.itemId;
      if (this.itemSystem.hasItem(itemId)) {
        const def = this.configs.item?.items?.[itemId];
        const quality = def?.quality ?? 'common';
        this.itemSystem.consumeItem(itemId);
        // Reward based on quality
        const qualityRewards = { common: 10, uncommon: 25, rare: 50, epic: 100, legendary: 200 };
        const goldReward = qualityRewards[quality] ?? 10;
        this.playerState.gold += goldReward;
        effects.push(`🗑️ 献祭: ${def?.name || itemId}`);
        effects.push(`🪙 获得 ${goldReward} 金币`);
      }
    }

    return effects;
  }

  // ── End turn ────────────────────────────────────────────────

  async _onEndTurn() {
    if (this.state !== STATES.PLAYING) return;

    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;
    const tile = this.mapData.getTile(pCol, pRow);
    const tileData = tile ? { terrain: tile.terrain, elevation: tile.elevation, building: tile.building } : { terrain: 'grass', elevation: 5 };

    // End turn: rest effect + overnight events
    const endResult = this.turnSystem.endTurn(tileData);

    // Show rest effect
    const restMsgs = [];
    if (endResult.hpChange !== 0) {
      restMsgs.push(`${endResult.hpChange > 0 ? '❤️' : '💔'} HP ${endResult.hpChange > 0 ? '+' : ''}${endResult.hpChange}`);
    }
    if (endResult.debuffDamage > 0) {
      restMsgs.push(`☠️ 状态伤害 -${endResult.debuffDamage}`);
    }

    // Check death after rest
    if (this.playerState.hp <= 0) {
      await this._onDeath();
      return;
    }

    // Overnight events — track AP changes to apply after AP restore
    const apBeforeOvernight = this.playerState.ap;
    const overnightEventIds = this.turnSystem._rollOvernightEvents ? this.turnSystem._rollOvernightEvents(tileData) : [];
    for (const evtId of overnightEventIds) {
      const overnightTile = { ...tileData, event: evtId };
      await this._handleTileEvent(overnightTile, pCol, pRow);
      if (this.state !== STATES.PLAYING) return;
      if (this.playerState.hp <= 0) {
        await this._onDeath();
        return;
      }
    }
    const overnightApLoss = apBeforeOvernight - this.playerState.ap;

    // Start new turn
    const turnResult = this.turnSystem.startNewTurn();
    this._buildingEventsTriggeredThisTurn.clear();

    // Apply overnight AP penalty after AP restore
    if (overnightApLoss > 0) {
      this.playerState.ap = Math.max(0, this.playerState.ap - overnightApLoss);
    }

    // Event refresh every 30 turns
    if (this.playerState.turnNumber % 30 === 0) {
      const refreshed = this.eventSystem.refreshEvents(this.mapData, this.playerState.turnNumber);
      for (const r of refreshed) {
        const t = this.mapData.getTile(r.q, r.r);
        if (t) t.event = r.eventId;
      }
      if (refreshed.length > 0) {
        this.renderEngine.updateFogLayer();
      }
    }

    // Mystery egg timer check (Task 9.6)
    if (this.itemSystem.hasItem('mystery_egg')) {
      if (this._mysteryEggPickupTurn === null) {
        this._mysteryEggPickupTurn = this.playerState.turnNumber;
      }
      const elapsed = this.playerState.turnNumber - this._mysteryEggPickupTurn;
      if (elapsed >= 5) {
        // Hatch the egg
        this.itemSystem.consumeItem('mystery_egg');
        this._mysteryEggPickupTurn = null;
        const hatchTile = { terrain: 'grass', event: 'mystery_egg_hatch' };
        await this._handleTileEvent(hatchTile, pCol, pRow);
        if (this.state !== STATES.PLAYING) return;
      }
    } else {
      this._mysteryEggPickupTurn = null;
    }

    // Show turn summary
    if (restMsgs.length > 0) {
      this.eventBus.emit('ui:toast', `🔄 回合 ${turnResult.turnNumber} | ${restMsgs.join(' ')}`);
    } else {
      this.eventBus.emit('ui:toast', `🔄 回合 ${turnResult.turnNumber} | AP 已恢复`);
    }

    this._updateHUD();
    this._autoSave();
  }

  // ── Win condition ───────────────────────────────────────────

  async _checkWinCondition(_col, _row) {
    if (this.playerState.relicsCollected < 3) {
      const remaining = 3 - this.playerState.relicsCollected;
      this.eventBus.emit('ui:toast', `🌀 传送门需要 ${remaining} 块圣物碎片才能激活`);
      return;
    }

    // Victory!
    this.state = STATES.VICTORY;

    // Count explored tiles
    let tilesExplored = 0;
    const allTiles = this.mapData.getAllTiles();
    for (const t of allTiles) {
      const vis = this.fogSystem.getTileVisibility(t.q, t.r);
      if (vis !== 'unexplored') tilesExplored++;
    }

    const action = await this.uiManager.dialog.showVictory({
      turns: this.playerState.turnNumber,
      tilesExplored,
    });

    if (action === 'restart' || action === 'new_map') {
      // Signal main.js to restart
      this.eventBus.emit('game:restart', { newMap: action === 'new_map' });
    }
  }

  // ── Death ───────────────────────────────────────────────────

  async _onDeath() {
    // Check lethal save items before actual death
    // Priority: helmet (save at 1HP) > resurrection_cross (full heal)
    if (this.itemSystem.hasItem('helmet') && this.itemSystem.isConsumable('helmet')) {
      this.playerState.hp = 1;
      this.itemSystem.consumeItem('helmet');
      await this.uiManager.dialog.showResult({
        message: '⛑️ 安全帽救了你一命！',
        effects: ['HP 保留 1', '安全帽已损坏'],
      });
      this.state = STATES.PLAYING;
      this._updateHUD();
      return;
    }

    if (this.itemSystem.hasItem('resurrection_cross') && this.itemSystem.isConsumable('resurrection_cross')) {
      this.playerState.hp = this.playerState.hpMax;
      this.itemSystem.consumeItem('resurrection_cross');
      await this.uiManager.dialog.showResult({
        message: '✝️ 重生十字架发出耀眼的光芒！',
        effects: ['HP 完全恢复', '重生十字架已消耗'],
      });
      this.state = STATES.PLAYING;
      this._updateHUD();
      return;
    }

    this.state = STATES.GAME_OVER;

    const hasSave = !!this.saveSystem.loadAutoSave();
    const action = await this.uiManager.dialog.showDefeat({ hasSave });

    if (action === 'restore' && hasSave) {
      this.eventBus.emit('game:restore-save');
    } else {
      this.eventBus.emit('game:restart', { newMap: false });
    }
  }

  // ── Save / Load ─────────────────────────────────────────────

  _onExportSave(cb) {
    const state = this._buildGameState();
    const json = this.saveSystem.serialize(state);
    if (typeof cb === 'function') cb(json);
  }

  _onImportSave({ json }) {
    const result = this.saveSystem.deserialize(json);
    if (result.success) {
      this.eventBus.emit('game:load-state', result.state);
      this.eventBus.emit('ui:import-result', { success: true });
    } else {
      this.eventBus.emit('ui:import-result', { success: false, error: result.error });
    }
  }

  _autoSave() {
    const state = this._buildGameState();
    this.saveSystem.autoSave(state);
  }

  _buildGameState() {
    return {
      seed: this.seed,
      mapSize: this.mapSize,
      turnNumber: this.playerState.turnNumber,
      player: {
        ...this.playerState.toJSON(),
        items: this.itemSystem.toJSON(),
      },
      map: this.mapData.toJSON(),
      fog: this.fogSystem.toJSON(),
    };
  }

  // ── Fog (offset-based BFS VP model) ─────────────────────────

  _initFog() {
    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;
    this._updateFogOffset(pCol, pRow);

    // Wire fog getter to RenderEngine
    this.renderEngine.getFogState = (col, row) => this.fogSystem.getTileVisibility(col, row);
  }

  /**
   * Update fog using offset-coordinate BFS VP model
   * (matches map-preview.html calculateVisibleTiles)
   */
  _updateFogOffset(col, row) {
    const visibleTiles = this._calculateVisibleTilesOffset(col, row);
    const newVisibleKeys = new Set(visibleTiles.map(h => `${h.col},${h.row}`));

    // Demote old visible to explored
    const allTiles = this.mapData.getAllTiles();
    for (const t of allTiles) {
      const key = `${t.q},${t.r}`;
      if (this.fogSystem.getTileVisibility(t.q, t.r) === 'visible' && !newVisibleKeys.has(key)) {
        this.fogSystem._fogState.set(key, 'explored');
      }
    }

    // Set new visible
    for (const h of visibleTiles) {
      this.fogSystem._fogState.set(`${h.col},${h.row}`, 'visible');
    }

    // Compass: always reveal portal tile
    if (this.itemSystem && this.itemSystem.hasActiveItem('compass')) {
      const portalPos = this.mapData.portalPosition;
      if (portalPos) {
        const pKey = `${portalPos.q},${portalPos.r}`;
        this.fogSystem._fogState.set(pKey, 'visible');
      }
    }

    // Treasure map: also reveal relic positions
    if (this.itemSystem && this.itemSystem.hasActiveItem('treasure_map')) {
      const portalPos = this.mapData.portalPosition;
      if (portalPos) {
        this.fogSystem._fogState.set(`${portalPos.q},${portalPos.r}`, 'visible');
      }
      const relicPositions = this.mapData.relicPositions ?? [];
      for (const rp of relicPositions) {
        this.fogSystem._fogState.set(`${rp.q},${rp.r}`, 'visible');
      }
    }
  }

  /**
   * BFS VP vision calculation using offset coordinates.
   * Matches the map-preview.html calculateVisibleTiles function.
   */
  _calculateVisibleTilesOffset(col, row) {
    const BASE_VP = 2;
    const tile = this.mapData.getTile(col, row);
    if (!tile) return [{ col, row }];
    const playerElev = tile.elevation;

    // Item vision bonus
    let vp = BASE_VP;
    if (this.itemSystem) {
      const effects = this.itemSystem.getActiveEffects();
      vp += effects.visionBonus ?? 0;
    }

    const visited = new Map();
    const result = [];
    visited.set(`${col},${row}`, vp);
    result.push({ col, row });

    // Direct neighbors always visible
    const directNbs = HexRenderer.offsetNeighbors(col, row);
    for (const nb of directNbs) {
      const nbTile = this.mapData.getTile(nb.col, nb.row);
      if (!nbTile) continue;
      const key = `${nb.col},${nb.row}`;
      const nbVP = vp - 1;
      visited.set(key, nbVP);
      result.push({ col: nb.col, row: nb.row });
    }

    // BFS from direct neighbors
    const queue = [];
    for (const nb of directNbs) {
      const nbTile = this.mapData.getTile(nb.col, nb.row);
      if (!nbTile) continue;
      const key = `${nb.col},${nb.row}`;
      const nbVP = visited.get(key);

      let passVP = nbVP;
      const elevDiff = nbTile.elevation - playerElev;
      if (elevDiff >= 3) passVP -= elevDiff;
      if (nbTile.terrain === 'forest') passVP -= 0.5;

      if (passVP > 0) {
        queue.push({ col: nb.col, row: nb.row, vp: passVP });
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.vp <= 0) continue;

      const nbs = HexRenderer.offsetNeighbors(cur.col, cur.row);
      for (const nb of nbs) {
        const nbTile = this.mapData.getTile(nb.col, nb.row);
        if (!nbTile) continue;
        const key = `${nb.col},${nb.row}`;

        const curTile = this.mapData.getTile(cur.col, cur.row);
        const localElevDiff = nbTile.elevation - (curTile ? curTile.elevation : playerElev);
        let seeVP;
        if (localElevDiff < 0) {
          seeVP = cur.vp - 0.5;
        } else {
          seeVP = cur.vp - 1;
        }
        if (seeVP < 0) continue;

        const prevVP = visited.get(key);
        if (prevVP !== undefined && prevVP >= seeVP) continue;

        visited.set(key, seeVP);
        result.push({ col: nb.col, row: nb.row });

        let passVP = seeVP;
        const cliffDiff = nbTile.elevation - playerElev;
        if (cliffDiff >= 3) passVP -= cliffDiff;
        if (nbTile.terrain === 'forest') passVP -= 0.5;

        if (passVP > 0) {
          queue.push({ col: nb.col, row: nb.row, vp: passVP });
        }
      }
    }

    return result;
  }

  /**
   * Find a random explored/visible tile for teleport_random.
   * @returns {{q: number, r: number}|null}
   */
  _findRandomExploredTile() {
    const allTiles = this.mapData.getAllTiles();
    const candidates = allTiles.filter(t => {
      const vis = this.fogSystem.getTileVisibility(t.q, t.r);
      return (vis === 'visible' || vis === 'explored') && t.terrain !== 'water';
    });
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return { q: pick.q, r: pick.r };
  }

  /**
   * Find a random tile with a specific building type for teleport_building.
   * @param {string} buildingType
   * @returns {{q: number, r: number}|null}
   */
  _findRandomBuildingTile(buildingType) {
    const allTiles = this.mapData.getAllTiles();
    const candidates = allTiles.filter(t => t.building === buildingType);
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return { q: pick.q, r: pick.r };
  }

  /**
   * Reveal an area around a position (for reveal_map event effect)
   */
  _revealArea(col, row, radius) {
    const queue = [{ col, row, dist: 0 }];
    const visited = new Set();
    visited.add(`${col},${row}`);

    while (queue.length > 0) {
      const cur = queue.shift();
      const tile = this.mapData.getTile(cur.col, cur.row);
      if (tile) {
        const key = `${cur.col},${cur.row}`;
        const current = this.fogSystem.getTileVisibility(cur.col, cur.row);
        if (current === 'unexplored') {
          this.fogSystem._fogState.set(key, 'explored');
        }
      }
      if (cur.dist < radius) {
        const nbs = HexRenderer.offsetNeighbors(cur.col, cur.row);
        for (const nb of nbs) {
          const k = `${nb.col},${nb.row}`;
          if (!visited.has(k)) {
            visited.add(k);
            queue.push({ col: nb.col, row: nb.row, dist: cur.dist + 1 });
          }
        }
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  _isAdjacent(col1, row1, col2, row2) {
    const nbs = HexRenderer.offsetNeighbors(col1, row1);
    return nbs.some(n => n.col === col2 && n.row === row2);
  }

  /** Build tile data object for MovementSystem (uses q=col, r=row) */
  _getTileData(col, row) {
    const tile = this.mapData.getTile(col, row);
    if (!tile) return { q: col, r: row, terrain: 'grass', elevation: 5 };
    return { q: col, r: row, terrain: tile.terrain, elevation: tile.elevation, building: tile.building, event: tile.event };
  }

  _getPlayerTileData() {
    return this._getTileData(this.playerState.position.q, this.playerState.position.r);
  }

  _syncRender() {
    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;
    this.renderEngine.setMap(this.mapData);
    this.renderEngine.updatePlayerPosition(pCol, pRow);
    this.renderEngine.centerOnTileInstant(pCol, pRow);
  }

  _centerOnPlayer() {
    const pCol = this.playerState.position.q;
    const pRow = this.playerState.position.r;
    this.renderEngine.centerOnTile(pCol, pRow);
  }

  _updateHUD() {
    const effectiveAPMax = this.turnSystem.getEffectiveAPMax();
    const items = this.itemSystem.getInventory().map(item => {
      const def = this.configs.item?.items?.[item.itemId];
      return {
        itemId: item.itemId,
        name: item.name,
        description: def?.description || '',
        quality: item.quality,
        enabled: item.enabled,
      };
    });

    this.uiManager.updateHUD({
      ap: this.playerState.ap,
      apMax: effectiveAPMax,
      hp: this.playerState.hp,
      hpMax: this.playerState.hpMax,
      turn: this.playerState.turnNumber,
      relics: this.playerState.relicsCollected,
      gold: this.playerState.gold,
      items,
      statusEffects: this.playerState.statusEffects.map(se => ({ id: se.id, duration: se.duration })),
    });
  }
}
