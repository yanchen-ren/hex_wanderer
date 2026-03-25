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

    // Fall damage notification
    if (result.damage > 0) {
      this.eventBus.emit('ui:toast', `⚠️ 摔伤 -${result.damage} HP`);
    }

    // Terrain enter damage
    this._applyTerrainEnterEffects(toTile);

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
    if (tile.building) {
      await this._handleBuilding(tile, col, row);
      if (this.state !== STATES.PLAYING) return;
    }

    // Check tile event
    if (tile.event) {
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
            duration: 3,
            effect: { apCostModifier: 1 },
          });
          this.eventBus.emit('ui:toast', `☠️ 获得状态: ${tc.statusOnEnter}`);
        }
      }
    }
  }

  // ── Building handling ───────────────────────────────────────

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

    if (result.message && result.type !== 'win_condition' && result.type !== 'teleport' && result.type !== 'trigger_event') {
      this.eventBus.emit('ui:toast', `🏗️ ${result.message}`);
    }
  }

  // ── Event handling ──────────────────────────────────────────

  async _handleTileEvent(tile, col, row) {
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

    // Show result
    const resultMsg = outcome.message || '事件结束';
    await this.uiManager.dialog.showResult({
      message: resultMsg,
      effects: effectMessages,
    });

    // Remove event from tile (one-time)
    const actualTile = this.mapData.getTile(col, row);
    if (actualTile) actualTile.event = null;

    // Refresh render to remove event marker
    this.renderEngine.updateFogLayer();

    this.state = STATES.PLAYING;
    this._updateHUD();

    // Check death after event
    if (this.playerState.hp <= 0) {
      await this._onDeath();
    }
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
          duration: outcome.duration || 3,
          effect: { apCostModifier: 1 },
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

    // Check death after rest
    if (this.playerState.hp <= 0) {
      await this._onDeath();
      return;
    }

    // Overnight events
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

    // Start new turn
    const turnResult = this.turnSystem.startNewTurn();

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

    // Use FogSystem's internal state via its methods
    // First demote old visible to explored
    const allTiles = this.mapData.getAllTiles();
    for (const t of allTiles) {
      const key = `${t.q},${t.r}`;
      if (this.fogSystem.getTileVisibility(t.q, t.r) === 'visible' && !newVisibleKeys.has(key)) {
        // Demote to explored — access internal state
        this.fogSystem._fogState.set(key, 'explored');
      }
    }

    // Set new visible
    for (const h of visibleTiles) {
      this.fogSystem._fogState.set(`${h.col},${h.row}`, 'visible');
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
      items,
    });
  }
}
