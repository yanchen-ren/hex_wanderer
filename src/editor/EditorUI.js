/**
 * EditorUI — 编辑器 UI 面板管理
 * 管理工具面板、工具栏和信息面板。使用纯 CSS 样式，与游戏深色主题一致。
 * 所有 UI 交互通过 EventBus 发布事件，实现 UI 与逻辑解耦。
 */

// ── Theme colors ──────────────────────────────────────────────
const THEME = {
  bg: '#1a1a2e',
  panel: '#16213e',
  border: '#0f3460',
  accent: '#4fc3f7',
  text: '#eee',
  textDim: '#999',
  btnBg: '#1a1a2e',
  btnHover: '#0f3460',
  btnActive: '#0f3460',
  danger: '#e53935',
  success: '#43a047',
  warning: '#ffa726',
};

const TERRAIN_COLORS = {
  grass:  '#4a7c3f',
  desert: '#c4a35a',
  water:  '#3a7bd5',
  forest: '#2d5a1e',
  swamp:  '#5a6b3c',
  lava:   '#c44b2f',
  ice:    '#a8d8ea',
  void:   '#333',
};

const TERRAIN_LABELS = {
  grass: '草地', desert: '荒漠', water: '水域', forest: '森林',
  swamp: '沼泽', lava: '熔岩', ice: '浮冰', void: '虚空',
};

export class EditorUI {
  /**
   * @param {HTMLElement} container - Root editor element
   * @param {import('./EditorState.js').EditorState} editorState
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {{ terrain: object, building: object, event: object, item: object }} configs
   */
  constructor(container, editorState, eventBus, configs) {
    this.container = container;
    this.editorState = editorState;
    this.eventBus = eventBus;
    this.configs = configs;

    // DOM references
    this._toolbarEl = null;
    this._toolPanelEl = null;
    this._infoPanelEl = null;
    this._toastContainer = null;

    // Track active selections for highlighting
    this._activeTerrainBtn = null;
    this._activeBrushBtn = null;
    this._activeBuildingBtn = null;
    this._activeEventBtn = null;
    this._activeToolBtn = null;

    // Toast timer
    this._toastTimer = null;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  init() {
    this._toolbarEl = document.getElementById('editor-toolbar');
    this._toolPanelEl = document.getElementById('editor-tool-panel');
    this._infoPanelEl = document.getElementById('editor-info-panel');

    if (!this._toolbarEl || !this._toolPanelEl || !this._infoPanelEl) {
      throw new Error('EditorUI: Missing required DOM containers');
    }

    this._buildToolbar();
    this._buildToolPanel();
    this._buildInfoPanel();
    this._createToastContainer();
    this._listenEvents();
  }

  // ══════════════════════════════════════════════════════════════
  // TOOLBAR (Task 6.3)
  // ══════════════════════════════════════════════════════════════

  _buildToolbar() {
    const tb = this._toolbarEl;
    // Keep existing title + separator, append buttons after them
    const buttons = [
      { icon: '📄', label: '新建', action: () => this._showNewMapDialog() },
      { icon: '🎲', label: '随机生成', action: () => this._showRandomGenDialog() },
      { id: 'tb-sep-1', sep: true },
      { icon: '💾', label: '保存', action: () => this._showSaveDialog() },
      { icon: '📚', label: '地图库', action: () => this.eventBus.emit('editor:open-library') },
      { id: 'tb-sep-2', sep: true },
      { icon: '📤', label: '导出', action: () => this.eventBus.emit('editor:export-file') },
      { icon: '📥', label: '导入', action: () => this.eventBus.emit('editor:import-file') },
      { id: 'tb-sep-3', sep: true },
      { icon: '✅', label: '验证', action: () => this.eventBus.emit('editor:validate-map') },
      { id: 'tb-sep-4', sep: true },
      { icon: '↩️', label: '撤销', action: () => this.eventBus.emit('editor:undo'), id: 'tb-undo' },
      { icon: '↪️', label: '重做', action: () => this.eventBus.emit('editor:redo'), id: 'tb-redo' },
      { id: 'tb-sep-5', sep: true },
      { icon: '🔲', label: '网格', action: () => this.eventBus.emit('editor:toggle-grid'), id: 'tb-grid', toggle: true },
      { icon: '⊞', label: '适应窗口', action: () => this.eventBus.emit('editor:fit-window') },
    ];

    for (const b of buttons) {
      if (b.sep) {
        const sep = document.createElement('div');
        sep.className = 'editor-toolbar-sep';
        tb.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      if (b.id) btn.id = b.id;
      btn.innerHTML = `<span class="btn-icon">${b.icon}</span><span class="btn-label">${b.label}</span>`;
      btn.addEventListener('click', b.action);
      if (b.toggle) btn.classList.add('active'); // grid on by default
      tb.appendChild(btn);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TOOL PANEL (Task 6.2) — Tabbed layout
  // ══════════════════════════════════════════════════════════════

  _buildToolPanel() {
    const tp = this._toolPanelEl;

    // ── Tab Bar ──
    const tabBar = this._el('div', {
      style: 'display:flex;gap:0;border-bottom:1px solid #0f3460;margin-bottom:8px;',
    });
    const tabDefs = [
      { id: 'terrain', label: '🗺️ 地块' },
      { id: 'building', label: '🏠 建筑' },
      { id: 'event', label: '📋 事件' },
    ];
    const tabContainers = {};
    const tabButtons = {};
    const tabBtnStyle = 'flex:1;min-height:40px;background:transparent;border:none;border-bottom:2px solid transparent;color:#999;font-size:12px;cursor:pointer;';
    const tabBtnActiveStyle = 'border-bottom-color:#4fc3f7;color:#4fc3f7;';

    const switchTab = (activeId) => {
      for (const def of tabDefs) {
        const isActive = def.id === activeId;
        tabContainers[def.id].style.display = isActive ? 'flex' : 'none';
        tabButtons[def.id].style.cssText = tabBtnStyle + (isActive ? tabBtnActiveStyle : '');
      }
    };

    for (const def of tabDefs) {
      const btn = this._el('button', { textContent: def.label, style: tabBtnStyle });
      btn.addEventListener('click', () => switchTab(def.id));
      tabBar.appendChild(btn);
      tabButtons[def.id] = btn;
    }
    tp.appendChild(tabBar);

    // ── Tab Containers ──
    for (const def of tabDefs) {
      const container = this._el('div', {
        style: `display:${def.id === 'terrain' ? 'flex' : 'none'};flex-direction:column;gap:8px;`,
      });
      tabContainers[def.id] = container;
      tp.appendChild(container);
    }
    // Activate default tab styling
    tabButtons['terrain'].style.cssText = tabBtnStyle + tabBtnActiveStyle;

    // ════════════════════════════════════════
    // TAB 1: 地块 (Terrain)
    // ════════════════════════════════════════
    const terrainTab = tabContainers['terrain'];

    // ── Terrain Selector ──
    terrainTab.appendChild(this._createSectionTitle('地形'));
    const terrainGrid = this._el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;' });
    for (const [id, color] of Object.entries(TERRAIN_COLORS)) {
      const btn = this._el('button', {
        className: 'editor-btn',
        title: TERRAIN_LABELS[id] || id,
        style: `padding:4px;min-width:44px;min-height:44px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;`,
      });
      const swatch = this._el('div', {
        style: `width:24px;height:24px;border-radius:4px;background:${color};border:2px solid transparent;`,
      });
      const label = this._el('span', { textContent: TERRAIN_LABELS[id] || id, style: 'color:#ccc;' });
      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        this.editorState.setTool('terrain');
        this.editorState.setSelectedTerrain(id);
        this._setActiveBtn('terrain', btn);
      });
      terrainGrid.appendChild(btn);
      if (id === this.editorState.selectedTerrain) {
        setTimeout(() => this._setActiveBtn('terrain', btn), 0);
      }
    }
    terrainTab.appendChild(terrainGrid);

    // ── Brush Size ──
    terrainTab.appendChild(this._createSectionTitle('笔刷大小'));
    const brushRow = this._el('div', { style: 'display:flex;gap:4px;' });
    for (const size of [1, 2, 3]) {
      const btn = this._el('button', {
        className: 'editor-btn',
        textContent: `${size}`,
        style: 'flex:1;min-height:44px;font-size:14px;font-weight:bold;',
      });
      btn.addEventListener('click', () => {
        this.editorState.setBrushSize(size);
        this._setActiveBtn('brush', btn);
      });
      brushRow.appendChild(btn);
      if (size === this.editorState.brushSize) {
        setTimeout(() => this._setActiveBtn('brush', btn), 0);
      }
    }
    terrainTab.appendChild(brushRow);

    // ── Elevation Controls ──
    terrainTab.appendChild(this._createSectionTitle('海拔'));
    const elevBtnRow = this._el('div', { style: 'display:flex;gap:4px;align-items:center;' });

    const elevUpBtn = this._el('button', {
      className: 'editor-btn', textContent: '升高 +1',
      style: 'flex:1;min-height:44px;font-size:12px;',
    });
    elevUpBtn.addEventListener('click', () => {
      this.editorState.setTool('elevation_up');
      this._setActiveBtn('tool', elevUpBtn);
    });

    const elevDownBtn = this._el('button', {
      className: 'editor-btn', textContent: '降低 -1',
      style: 'flex:1;min-height:44px;font-size:12px;',
    });
    elevDownBtn.addEventListener('click', () => {
      this.editorState.setTool('elevation_down');
      this._setActiveBtn('tool', elevDownBtn);
    });

    const elevSetBtn = this._el('button', {
      className: 'editor-btn',
      style: 'flex:1;min-height:44px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;',
    });
    const elevSetLabel = document.createTextNode('设置为');
    const elevSelect = this._el('select', {
      style: 'background:#1a1a2e;color:#eee;border:1px solid #333;border-radius:4px;padding:2px;font-size:11px;cursor:pointer;',
    });
    for (let i = 0; i <= 10; i++) {
      const opt = this._el('option', { value: String(i), textContent: String(i) });
      if (i === 5) opt.selected = true;
      elevSelect.appendChild(opt);
    }
    elevSelect.addEventListener('change', () => {
      const v = parseInt(elevSelect.value, 10);
      this.editorState.setElevationValue(v);
      this.editorState.setTool('elevation_set');
      this._setActiveBtn('tool', elevSetBtn);
    });
    elevSetBtn.appendChild(elevSetLabel);
    elevSetBtn.appendChild(elevSelect);
    elevSetBtn.addEventListener('click', (e) => {
      if (e.target === elevSelect) return;
      this.editorState.setTool('elevation_set');
      this._setActiveBtn('tool', elevSetBtn);
    });

    elevBtnRow.appendChild(elevUpBtn);
    elevBtnRow.appendChild(elevDownBtn);
    elevBtnRow.appendChild(elevSetBtn);
    terrainTab.appendChild(elevBtnRow);

    // ── Special Tools Row (select, eraser, spawn) ──
    terrainTab.appendChild(this._createSectionTitle('特殊工具'));
    const specialRow = this._el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;' });

    const selectBtn = this._el('button', {
      className: 'editor-btn',
      innerHTML: '🔍 选择',
      style: 'flex:1;min-height:44px;font-size:11px;',
    });
    selectBtn.addEventListener('click', () => {
      this.editorState.setTool('select');
      this._setActiveBtn('tool', selectBtn);
    });
    specialRow.appendChild(selectBtn);

    const eraserBtn = this._el('button', {
      className: 'editor-btn',
      innerHTML: '🧹 橡皮擦',
      style: 'flex:1;min-height:44px;font-size:11px;',
    });
    eraserBtn.addEventListener('click', () => {
      this.editorState.setTool('eraser');
      this._setActiveBtn('tool', eraserBtn);
    });
    specialRow.appendChild(eraserBtn);

    const spawnBtn = this._el('button', {
      className: 'editor-btn',
      innerHTML: '🚶 起始位置',
      style: 'flex:1;min-height:44px;font-size:11px;',
    });
    spawnBtn.addEventListener('click', () => {
      this.editorState.setTool('spawn');
      this._setActiveBtn('tool', spawnBtn);
    });
    specialRow.appendChild(spawnBtn);

    terrainTab.appendChild(specialRow);

    // ════════════════════════════════════════
    // TAB 2: 建筑 (Building)
    // ════════════════════════════════════════
    const buildingTab = tabContainers['building'];

    buildingTab.appendChild(this._createSectionTitle('建筑'));
    const buildingContainer = this._el('div', {
      style: 'overflow-y:auto;display:flex;flex-direction:column;gap:2px;',
    });
    const buildingTypes = this.configs.building?.buildingTypes || {};
    for (const [id, cfg] of Object.entries(buildingTypes)) {
      const btn = this._el('button', {
        className: 'editor-btn',
        style: 'min-height:36px;justify-content:flex-start;gap:6px;font-size:11px;padding:4px 8px;width:100%;',
      });
      const spritePath = cfg.sprite || '';
      if (spritePath) {
        btn.innerHTML = `<img src="${spritePath}" style="width:20px;height:20px;image-rendering:pixelated;"> ${cfg.name || id}`;
      } else {
        btn.innerHTML = `<span style="font-size:14px;">🏠</span> ${cfg.name || id}`;
      }
      btn.title = cfg.description || id;
      btn.addEventListener('click', () => {
        this.editorState.setTool('building');
        this.editorState.setSelectedBuilding(id);
        this._setActiveBtn('building', btn);
      });
      buildingContainer.appendChild(btn);
    }
    buildingTab.appendChild(buildingContainer);

    // ════════════════════════════════════════
    // TAB 3: 事件 (Event)
    // ════════════════════════════════════════
    const eventTab = tabContainers['event'];

    // ── Event Config Section ──
    eventTab.appendChild(this._createSectionTitle('事件配置（游戏加载时生效）'));
    const eventConfigDiv = this._el('div', { style: 'display:flex;flex-direction:column;gap:6px;padding:4px 0;' });

    const enableRow = this._el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#ccc;' });
    const enableCheckbox = this._el('input', { type: 'checkbox' });
    enableCheckbox.checked = this.editorState.eventConfig.enabled;
    enableRow.appendChild(enableCheckbox);
    enableRow.appendChild(document.createTextNode('启用大世界事件自动生成'));
    eventConfigDiv.appendChild(enableRow);

    const treasureRow = this._el('div', { style: 'display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;' });
    const treasureLabel = this._el('span', { textContent: '宝箱比例:', style: 'min-width:60px;' });
    const treasureSlider = this._el('input', {
      type: 'range', min: '0', max: '100', value: String(Math.round(this.editorState.eventConfig.treasureDensity * 100)),
      style: 'flex:1;accent-color:#4fc3f7;cursor:pointer;',
    });
    const treasureValue = this._el('span', {
      textContent: `${Math.round(this.editorState.eventConfig.treasureDensity * 100)}%`,
      style: 'min-width:36px;text-align:right;color:#4fc3f7;font-weight:bold;',
    });
    treasureRow.appendChild(treasureLabel);
    treasureRow.appendChild(treasureSlider);
    treasureRow.appendChild(treasureValue);
    eventConfigDiv.appendChild(treasureRow);

    const eventDensityRow = this._el('div', { style: 'display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;' });
    const eventDensityLabel = this._el('span', { textContent: '事件比例:', style: 'min-width:60px;' });
    const eventDensitySlider = this._el('input', {
      type: 'range', min: '0', max: '100', value: String(Math.round(this.editorState.eventConfig.eventDensity * 100)),
      style: 'flex:1;accent-color:#4fc3f7;cursor:pointer;',
    });
    const eventDensityValue = this._el('span', {
      textContent: `${Math.round(this.editorState.eventConfig.eventDensity * 100)}%`,
      style: 'min-width:36px;text-align:right;color:#4fc3f7;font-weight:bold;',
    });
    eventDensityRow.appendChild(eventDensityLabel);
    eventDensityRow.appendChild(eventDensitySlider);
    eventDensityRow.appendChild(eventDensityValue);
    eventConfigDiv.appendChild(eventDensityRow);

    const emitEventConfig = () => {
      this.editorState.setEventConfig({
        enabled: enableCheckbox.checked,
        treasureDensity: parseInt(treasureSlider.value, 10) / 100,
        eventDensity: parseInt(eventDensitySlider.value, 10) / 100,
      });
    };
    enableCheckbox.addEventListener('change', emitEventConfig);
    treasureSlider.addEventListener('input', () => {
      treasureValue.textContent = `${treasureSlider.value}%`;
      emitEventConfig();
    });
    eventDensitySlider.addEventListener('input', () => {
      eventDensityValue.textContent = `${eventDensitySlider.value}%`;
      emitEventConfig();
    });

    eventTab.appendChild(eventConfigDiv);

    // ── Event Selector ──
    eventTab.appendChild(this._createSectionTitle('事件'));
    const eventContainer = this._el('div', {
      style: 'max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;',
    });
    const events = this.configs.event?.events || {};
    const excludePrefixes = ['overnight_'];
    const excludeIds = new Set([
      'lighthouse_event', 'camp_rest_event', 'church_prayer',
      'watchtower_event', 'reef_event', 'training_event', 'altar_event',
      'wishing_well_event', 'phone_booth_event', 'food_truck_event',
      'bonfire_event', 'hollow_tree_event', 'colossus_hand_event',
      'vending_machine_event', 'village_event', 'city_market', 'castle_event',
      'thief_city_arrest', 'sheriff_city_bonus', 'accordion_party',
      'campfire_party', 'mystery_egg_hatch', 'tutorial',
      'overnight_city_rest', 'overnight_castle_rest', 'overnight_city_rest_sheriff',
      'overnight_city_thief', 'overnight_camp_trade', 'overnight_farm_harvest',
    ]);
    const eventGroups = {};
    for (const [id, cfg] of Object.entries(events)) {
      if (excludeIds.has(id)) continue;
      if (excludePrefixes.some(p => id.startsWith(p))) continue;
      const type = cfg.type || 'other';
      if (!eventGroups[type]) eventGroups[type] = [];
      eventGroups[type].push({ id, cfg });
    }
    const typeLabels = { combat: '⚔️ 战斗', treasure: '💎 宝藏', choice: '🎭 选择', other: '📋 其他' };
    for (const [type, items] of Object.entries(eventGroups)) {
      const groupLabel = this._el('div', {
        textContent: typeLabels[type] || type,
        style: 'font-size:10px;font-weight:600;color:#4fc3f7;padding:4px 0 2px;',
      });
      eventContainer.appendChild(groupLabel);
      for (const { id, cfg } of items) {
        const btn = this._el('button', {
          className: 'editor-btn',
          style: 'min-height:32px;justify-content:flex-start;font-size:10px;padding:3px 6px;width:100%;',
        });
        btn.textContent = cfg.title || id;
        btn.title = id;
        btn.addEventListener('click', () => {
          this.editorState.setTool('event');
          this.editorState.setSelectedEvent(id);
          this._setActiveBtn('event', btn);
        });
        eventContainer.appendChild(btn);
      }
    }
    eventTab.appendChild(eventContainer);

    // ── Relic Event Selector ──
    eventTab.appendChild(this._createSectionTitle('圣物事件'));
    const relicEventRow = this._el('div', { style: 'display:flex;flex-direction:column;gap:2px;' });
    const relicEvents = [
      { id: 'relic_guardian', label: '圣物守护者' },
      { id: 'relic_shrine', label: '圣物祭坛' },
      { id: 'relic_trial', label: '圣物试炼' },
    ];
    for (const re of relicEvents) {
      const btn = this._el('button', {
        className: 'editor-btn',
        textContent: `${re.id} - ${re.label}`,
        style: 'min-height:32px;justify-content:flex-start;font-size:10px;padding:3px 6px;width:100%;',
      });
      btn.title = re.id;
      btn.addEventListener('click', () => {
        this.editorState.setTool('event');
        this.editorState.setSelectedEvent(re.id);
        this._setActiveBtn('event', btn);
      });
      relicEventRow.appendChild(btn);
    }
    eventTab.appendChild(relicEventRow);
  }

  // ══════════════════════════════════════════════════════════════
  // INFO PANEL (Task 6.4)
  // ══════════════════════════════════════════════════════════════

  _buildInfoPanel() {
    const ip = this._infoPanelEl;

    // ── Hover Tile Info ──
    ip.appendChild(this._createSectionTitle('地块信息'));
    const tileInfo = this._el('div', { id: 'tile-info-content' });
    tileInfo.innerHTML = `<span style="color:#999;">点击地块或悬停查看信息</span>`;
    ip.appendChild(tileInfo);

    // ── Map Stats ──
    ip.appendChild(this._createSectionTitle('地图统计'));
    const statsDiv = this._el('div', { id: 'map-stats-content' });
    statsDiv.innerHTML = `<span style="color:#999;">加载中...</span>`;
    ip.appendChild(statsDiv);

    // ── Relic Info ──
    ip.appendChild(this._createSectionTitle('圣物碎片'));
    const relicDiv = this._el('div', { id: 'relic-info-content', style: 'display:flex;flex-direction:column;gap:4px;' });
    const relicCountRow = this._el('div', { style: 'display:flex;align-items:center;gap:6px;' });
    relicCountRow.innerHTML = `<span>已放置: </span><span id="relic-count" style="font-weight:bold;color:#4fc3f7;">0</span>`;
    relicDiv.appendChild(relicCountRow);

    const relicNeededRow = this._el('div', { style: 'display:flex;align-items:center;gap:6px;' });
    relicNeededRow.innerHTML = `<span>通关需要: </span>`;
    const relicInput = this._el('input', {
      type: 'number', min: '1', max: '20', value: '3',
      id: 'relics-needed-input',
      style: 'width:50px;background:#1a1a2e;color:#eee;border:1px solid #333;border-radius:4px;padding:2px 4px;text-align:center;',
    });
    relicInput.addEventListener('change', () => {
      const val = Math.max(1, Math.min(20, parseInt(relicInput.value, 10) || 3));
      relicInput.value = val;
      this.eventBus.emit('editor:relics-needed-changed', { value: val });
    });
    relicNeededRow.appendChild(relicInput);
    relicDiv.appendChild(relicNeededRow);
    ip.appendChild(relicDiv);

    // ── Validation Results ──
    ip.appendChild(this._createSectionTitle('验证结果'));
    const validDiv = this._el('div', { id: 'validation-results-content' });
    validDiv.innerHTML = `<span style="color:#999;">点击"验证"按钮检查地图</span>`;
    ip.appendChild(validDiv);
  }

  // ── Info Panel Update Methods ──

  /**
   * Update the hover tile info display.
   * @param {{ q: number, r: number, terrain: string, elevation: number, building: string|null, event: string|null }|null} tileData
   */
  updateInfoPanel(tileData) {
    const el = document.getElementById('tile-info-content');
    if (!el) return;
    if (!tileData) {
      el.innerHTML = `<span style="color:#999;">悬停地块查看信息</span>`;
      return;
    }
    const terrainLabel = TERRAIN_LABELS[tileData.terrain] || tileData.terrain;
    const terrainColor = TERRAIN_COLORS[tileData.terrain] || '#666';
    const buildingName = tileData.building
      ? (this.configs.building?.buildingTypes?.[tileData.building]?.name || tileData.building)
      : '无';
    const eventName = tileData.event
      ? (this.configs.event?.events?.[tileData.event]?.title || tileData.event)
      : '无';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:3px;">
        <div><span style="color:#999;">坐标:</span> <b>(${tileData.q}, ${tileData.r})</b></div>
        <div><span style="color:#999;">地形:</span> <span style="color:${terrainColor};font-weight:bold;">${terrainLabel}</span></div>
        <div><span style="color:#999;">海拔:</span> <b>${tileData.elevation}</b></div>
        <div><span style="color:#999;">建筑:</span> ${buildingName}</div>
        <div><span style="color:#999;">事件:</span> <span style="font-size:10px;">${eventName}</span></div>
      </div>`;
  }

  /**
   * Update map statistics display.
   * @param {import('../map/MapData.js').MapData} mapData
   */
  updateStats(mapData) {
    const el = document.getElementById('map-stats-content');
    if (!el || !mapData) return;

    const { width, height } = mapData.getSize();
    const allTiles = mapData.getAllTiles();
    const total = allTiles.length;

    // Terrain distribution
    const terrainCounts = {};
    let buildingCount = 0;
    let eventCount = 0;
    for (const t of allTiles) {
      terrainCounts[t.terrain] = (terrainCounts[t.terrain] || 0) + 1;
      if (t.building) buildingCount++;
      if (t.event) eventCount++;
    }

    let terrainHtml = '';
    for (const [terrain, count] of Object.entries(terrainCounts)) {
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      const color = TERRAIN_COLORS[terrain] || '#666';
      const label = TERRAIN_LABELS[terrain] || terrain;
      terrainHtml += `<div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:2px;background:${color};"></div>
        <span>${label}</span>
        <span style="color:#999;margin-left:auto;">${count} (${pct}%)</span>
      </div>`;
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:3px;">
        <div><span style="color:#999;">尺寸:</span> <b>${width} × ${height}</b></div>
        <div><span style="color:#999;">地块总数:</span> <b>${total}</b></div>
        <div style="margin-top:4px;font-size:10px;font-weight:600;color:#4fc3f7;">地形分布</div>
        ${terrainHtml}
        <div style="margin-top:4px;"><span style="color:#999;">建筑数:</span> <b>${buildingCount}</b></div>
        <div><span style="color:#999;">事件数:</span> <b>${eventCount}</b></div>
      </div>`;

    // Update relic count (count tiles with relic_ events)
    const relicCountEl = document.getElementById('relic-count');
    if (relicCountEl) {
      const relicEventCount = mapData.getAllTiles().filter(t => t.event && t.event.startsWith('relic_')).length;
      relicCountEl.textContent = String(relicEventCount);
    }
    const relicInput = document.getElementById('relics-needed-input');
    if (relicInput) {
      relicInput.value = mapData.relicsNeeded;
    }
  }

  /**
   * Show validation results in the info panel.
   * @param {{ valid: boolean, issues: Array<{type: string, severity: string, message: string, tiles: Array}> }} results
   */
  showValidationResults(results) {
    const el = document.getElementById('validation-results-content');
    if (!el) return;

    if (results.valid && results.issues.length === 0) {
      el.innerHTML = `<div style="color:${THEME.success};font-weight:bold;">✅ 地图验证通过</div>`;
      return;
    }

    let html = '';
    for (const issue of results.issues) {
      const color = issue.severity === 'error' ? THEME.danger : THEME.warning;
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      html += `<div style="color:${color};font-size:11px;padding:2px 0;">${icon} ${issue.message}</div>`;
    }
    el.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════
  // DIALOGS (Task 6.6)
  // ══════════════════════════════════════════════════════════════

  /**
   * Show a modal dialog overlay.
   * @param {string} html - Inner HTML content
   * @returns {{ overlay: HTMLElement, card: HTMLElement, close: Function }}
   */
  _showDialog(html) {
    const overlay = this._el('div', {
      style: `position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;
              background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);`,
    });
    const card = this._el('div', {
      style: `background:${THEME.panel};border:1px solid ${THEME.border};border-radius:12px;
              padding:20px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;
              box-shadow:0 8px 32px rgba(0,0,0,0.5);`,
    });
    card.innerHTML = html;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    return { overlay, card, close };
  }

  /** New Map Dialog */
  _showNewMapDialog() {
    const { card, close } = this._showDialog(`
      <h3 style="color:${THEME.accent};margin-bottom:12px;font-size:16px;">新建地图</h3>
      <p style="color:${THEME.textDim};font-size:12px;margin-bottom:12px;">选择地图尺寸（当前编辑内容将被覆盖）</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="dialog-size-btn" data-size="small" style="${this._dialogBtnStyle()}">
          <b>小 (25×25)</b><span style="color:#999;font-size:11px;">625 地块</span>
        </button>
        <button class="dialog-size-btn" data-size="medium" style="${this._dialogBtnStyle()}">
          <b>中 (50×50)</b><span style="color:#999;font-size:11px;">2500 地块</span>
        </button>
        <button class="dialog-size-btn" data-size="large" style="${this._dialogBtnStyle()}">
          <b>大 (75×75)</b><span style="color:#999;font-size:11px;">5625 地块</span>
        </button>
        <button class="dialog-cancel-btn" style="${this._dialogBtnStyle('#333')}">取消</button>
      </div>
    `);

    card.querySelectorAll('.dialog-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sizes = { small: 25, medium: 50, large: 75 };
        const size = btn.dataset.size;
        const dim = sizes[size] || 25;
        close();
        this.eventBus.emit('editor:new-map', { size, width: dim, height: dim });
      });
    });
    card.querySelector('.dialog-cancel-btn').addEventListener('click', close);
  }

  /** Random Generate Dialog */
  _showRandomGenDialog() {
    const { card, close } = this._showDialog(`
      <h3 style="color:${THEME.accent};margin-bottom:12px;font-size:16px;">随机生成地图</h3>
      <p style="color:${THEME.textDim};font-size:12px;margin-bottom:12px;">当前编辑内容将被覆盖</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:#ccc;">种子 (Seed)</span>
          <input id="rng-seed" type="number" value="${Math.floor(Math.random() * 100000)}"
            style="background:${THEME.bg};color:${THEME.text};border:1px solid #333;border-radius:6px;padding:8px;font-size:13px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:#ccc;">地图尺寸</span>
          <select id="rng-size" style="background:${THEME.bg};color:${THEME.text};border:1px solid #333;border-radius:6px;padding:8px;font-size:13px;">
            <option value="small">小 (25×25)</option>
            <option value="medium" selected>中 (50×50)</option>
            <option value="large">大 (75×75)</option>
          </select>
        </label>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="rng-confirm" style="${this._dialogBtnStyle(THEME.accent)}color:#000;font-weight:bold;flex:1;">生成</button>
          <button id="rng-cancel" style="${this._dialogBtnStyle('#333')}flex:1;">取消</button>
        </div>
      </div>
    `);

    card.querySelector('#rng-confirm').addEventListener('click', () => {
      const seed = parseInt(card.querySelector('#rng-seed').value, 10) || 12345;
      const size = card.querySelector('#rng-size').value;
      close();
      this.eventBus.emit('editor:random-generate', { seed, size });
    });
    card.querySelector('#rng-cancel').addEventListener('click', close);
  }

  /** Save Dialog — prompts for map name before saving to library */
  _showSaveDialog() {
    const currentName = this.editorState.mapMeta.name || '';
    const currentDesc = this.editorState.mapMeta.description || '';
    const { card, close } = this._showDialog(`
      <h3 style="color:${THEME.accent};margin-bottom:12px;font-size:16px;">保存到地图库</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:#ccc;">地图名称</span>
          <input id="save-name" type="text" value="${currentName}" placeholder="输入地图名称"
            style="background:${THEME.bg};color:${THEME.text};border:1px solid #333;border-radius:6px;padding:8px;font-size:13px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:12px;color:#ccc;">描述（可选）</span>
          <input id="save-desc" type="text" value="${currentDesc}" placeholder="简短描述"
            style="background:${THEME.bg};color:${THEME.text};border:1px solid #333;border-radius:6px;padding:8px;font-size:13px;" />
        </label>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="save-confirm" style="${this._dialogBtnStyle(THEME.accent)}color:#000;font-weight:bold;flex:1;">保存</button>
          <button id="save-cancel" style="${this._dialogBtnStyle('#333')}flex:1;">取消</button>
        </div>
      </div>
    `);

    card.querySelector('#save-confirm').addEventListener('click', () => {
      const name = card.querySelector('#save-name').value.trim() || '未命名地图';
      const desc = card.querySelector('#save-desc').value.trim();
      this.editorState.setMapMeta({ name, description: desc });
      close();
      this.eventBus.emit('editor:save-to-library');
    });
    card.querySelector('#save-cancel').addEventListener('click', close);
  }

  /**
   * Show a confirm dialog.
   * @param {{ title: string, message: string, confirmText?: string, cancelText?: string }} opts
   * @returns {Promise<boolean>}
   */
  showConfirmDialog(opts) {
    return new Promise((resolve) => {
      const { card, close } = this._showDialog(`
        <h3 style="color:${THEME.accent};margin-bottom:8px;font-size:16px;">${opts.title}</h3>
        <p style="color:#ccc;font-size:13px;margin-bottom:16px;">${opts.message}</p>
        <div style="display:flex;gap:8px;">
          <button id="confirm-yes" style="${this._dialogBtnStyle(THEME.accent)}color:#000;font-weight:bold;flex:1;">
            ${opts.confirmText || '确定'}
          </button>
          <button id="confirm-no" style="${this._dialogBtnStyle('#333')}flex:1;">
            ${opts.cancelText || '取消'}
          </button>
        </div>
      `);
      card.querySelector('#confirm-yes').addEventListener('click', () => { close(); resolve(true); });
      card.querySelector('#confirm-no').addEventListener('click', () => { close(); resolve(false); });
    });
  }

  /**
   * Show the map library list dialog.
   * @param {Array<{ id: string, meta: { name: string, size: string, createdAt: number, description?: string } }>} maps
   */
  showMapLibrary(maps) {
    let listHtml = '';
    if (maps.length === 0) {
      listHtml = `<div style="color:#999;text-align:center;padding:20px;">地图库为空</div>`;
    } else {
      for (const m of maps) {
        const date = m.meta.createdAt ? new Date(m.meta.createdAt).toLocaleDateString() : '未知';
        listHtml += `
          <div class="lib-item" data-id="${m.id}" style="display:flex;align-items:center;justify-content:space-between;
            padding:8px;border:1px solid #333;border-radius:6px;cursor:pointer;transition:background 0.15s;">
            <div>
              <div style="font-weight:bold;font-size:13px;">${m.meta.name || '未命名'}</div>
              <div style="font-size:10px;color:#999;">${m.meta.size || '?'} · ${date}</div>
            </div>
            <button class="lib-delete" data-id="${m.id}" title="删除"
              style="background:none;border:none;color:${THEME.danger};cursor:pointer;font-size:16px;padding:4px 8px;">🗑</button>
          </div>`;
      }
    }

    const { card, close } = this._showDialog(`
      <h3 style="color:${THEME.accent};margin-bottom:12px;font-size:16px;">📚 地图库</h3>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;">
        ${listHtml}
      </div>
      <button class="lib-close" style="${this._dialogBtnStyle('#333')}margin-top:12px;width:100%;">关闭</button>
    `);

    card.querySelectorAll('.lib-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('lib-delete')) return;
        const id = item.dataset.id;
        close();
        this.eventBus.emit('editor:load-from-library', { id });
      });
      item.addEventListener('mouseenter', () => { item.style.background = THEME.btnHover; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
    });

    card.querySelectorAll('.lib-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.eventBus.emit('editor:delete-from-library', { id });
        btn.closest('.lib-item').remove();
      });
    });

    card.querySelector('.lib-close').addEventListener('click', close);
  }

  // ══════════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS (Task 6.7)
  // ══════════════════════════════════════════════════════════════

  _createToastContainer() {
    this._toastContainer = this._el('div', {
      id: 'editor-toast-container',
      style: `position:fixed;top:60px;right:12px;z-index:200;display:flex;flex-direction:column;gap:6px;
              pointer-events:none;max-width:320px;`,
    });
    document.body.appendChild(this._toastContainer);
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} [type='info']
   * @param {number} [duration=3000]
   */
  showToast(message, type = 'info', duration = 3000) {
    if (!this._toastContainer) return;

    const colors = {
      info: THEME.accent,
      success: THEME.success,
      warning: THEME.warning,
      error: THEME.danger,
    };
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    const borderColor = colors[type] || colors.info;

    const toast = this._el('div', {
      style: `background:${THEME.panel};border:1px solid ${borderColor};border-left:3px solid ${borderColor};
              border-radius:6px;padding:10px 14px;color:${THEME.text};font-size:12px;
              box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:auto;
              animation:toast-in 0.25s ease;display:flex;align-items:center;gap:8px;`,
    });
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    this._toastContainer.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ══════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ══════════════════════════════════════════════════════════════

  _listenEvents() {
    // Listen for toast events from other modules
    this.eventBus.on('ui:toast', (msg, type) => this.showToast(msg, type));
    this.eventBus.on('editor:toast', ({ message, type }) => this.showToast(message, type));

    // Update grid toggle button state
    this.eventBus.on('editor:grid-toggled', ({ visible }) => {
      const btn = document.getElementById('tb-grid');
      if (btn) {
        if (visible) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  /**
   * Create a DOM element with properties.
   * @param {string} tag
   * @param {object} props
   * @returns {HTMLElement}
   */
  _el(tag, props = {}) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (key === 'style' && typeof val === 'string') {
        el.style.cssText = val;
      } else if (key === 'className') {
        el.className = val;
      } else if (key === 'innerHTML') {
        el.innerHTML = val;
      } else if (key === 'textContent') {
        el.textContent = val;
      } else {
        el[key] = val;
      }
    }
    return el;
  }

  _createSectionTitle(text) {
    return this._el('div', { className: 'panel-section-title', textContent: text });
  }

  _dialogBtnStyle(bg = THEME.bg) {
    return `display:flex;align-items:center;justify-content:center;gap:4px;
            padding:10px 16px;background:${bg};color:${THEME.text};
            border:1px solid #333;border-radius:8px;cursor:pointer;font-size:13px;
            transition:opacity 0.15s;min-height:44px;`;
  }

  /**
   * Set the active button for a category, removing active from previous.
   * @param {'terrain'|'brush'|'building'|'event'|'tool'} category
   * @param {HTMLElement} btn
   */
  _setActiveBtn(category, btn) {
    const map = {
      terrain: '_activeTerrainBtn',
      brush: '_activeBrushBtn',
      building: '_activeBuildingBtn',
      event: '_activeEventBtn',
      tool: '_activeToolBtn',
    };
    const key = map[category];
    if (key && this[key]) {
      this[key].classList.remove('active');
    }
    btn.classList.add('active');
    if (key) this[key] = btn;
  }

  // ══════════════════════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════════════════════

  destroy() {
    if (this._toastContainer) {
      this._toastContainer.remove();
      this._toastContainer = null;
    }
  }
}
