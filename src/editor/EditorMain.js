/**
 * EditorMain — 地图编辑器入口
 * 初始化 PixiJS、加载配置、创建默认地图、启动渲染
 * 集成所有编辑器模块：EditorState, EditorTools, CommandHistory, EditorUI,
 * MapValidator, MapLibrary。处理画布输入、键盘快捷键、文件导入导出、
 * 网格线渲染、编辑器高亮、适应窗口等功能。
 */
import { ConfigLoader } from '../core/ConfigLoader.js';
import { EventBus } from '../core/EventBus.js';
import { MapData } from '../map/MapData.js';
import { MapGenerator } from '../map/MapGenerator.js';
import { HexGrid } from '../map/HexGrid.js';
import { RenderEngine } from '../render/RenderEngine.js';
import { EditorState } from './EditorState.js';
import { EditorTools } from './EditorTools.js';
import { CommandHistory, TileEditCommand } from './CommandHistory.js';
import { EditorUI } from './EditorUI.js';
import { MapValidator } from './MapValidator.js';
import { MapLibrary } from './MapLibrary.js';

const SQRT3 = Math.sqrt(3);

/** Editor singleton state, exported for other modules */
export const editor = {
  /** @type {PIXI.Application|null} */
  app: null,
  /** @type {RenderEngine|null} */
  renderEngine: null,
  /** @type {EventBus|null} */
  eventBus: null,
  /** @type {MapData|null} */
  mapData: null,
  /** @type {object|null} */
  configs: null,
  /** @type {EditorState|null} */
  editorState: null,
  /** @type {EditorTools|null} */
  editorTools: null,
  /** @type {CommandHistory|null} */
  commandHistory: null,
  /** @type {EditorUI|null} */
  editorUI: null,
  /** @type {MapValidator|null} */
  mapValidator: null,
  /** @type {MapLibrary|null} */
  mapLibrary: null,
};

// ── Drag paint state ──────────────────────────────────────────
let _isDragging = false;
let _dragChanges = [];       // accumulated changes during drag
let _dragVisited = new Set(); // tiles already painted in this drag
let _pointerDown = false;
let _pointerStartX = 0;
let _pointerStartY = 0;
let _didDragMove = false;    // distinguish click vs drag

// ── Hover state ───────────────────────────────────────────────
let _hoverTile = null;       // { col, row }

// ── Editor overlay graphics ───────────────────────────────────
let _gridGraphics = null;
let _highlightGraphics = null;

// ── Touch state ───────────────────────────────────────────────
let _activeTouchCount = 0;
let _isPinching = false;

// ── File input element ────────────────────────────────────────
let _fileInput = null;


/**
 * Initialize the map editor.
 * Called automatically when this module is imported by editor.html.
 */
async function initEditor() {
  const canvasArea = document.getElementById('editor-canvas-area');
  if (!canvasArea) {
    throw new Error('Missing #editor-canvas-area container');
  }

  const setStatus = (msg) => {
    if (typeof window.setEditorLoadStatus === 'function') {
      window.setEditorLoadStatus(msg);
    }
  };

  // 1. Load all JSON configs
  setStatus('加载配置文件...');
  const loader = new ConfigLoader();
  const configs = await loader.loadAll();
  editor.configs = configs;

  // 2. Show editor root so canvas container has real dimensions
  //    (PixiJS resizeTo needs a non-zero container)
  const editorRoot = document.getElementById('editor-root');
  if (editorRoot) editorRoot.style.display = '';

  setStatus('初始化渲染引擎...');
  const app = new PIXI.Application({
    resizeTo: canvasArea,
    backgroundColor: 0x1a1a2e,
    antialias: true,
  });
  canvasArea.appendChild(app.view);
  app.view.style.display = 'block';
  editor.app = app;

  // 3. Initialize RenderEngine with fogEnabled=false
  const renderEngine = new RenderEngine(app, { hexSize: 18 });
  renderEngine.fogEnabled = false;
  await renderEngine.init(configs.terrain, configs.building, null, configs.item);
  renderEngine.setEventConfig(configs.event);
  editor.renderEngine = renderEngine;

  // 4. Create EventBus
  const eventBus = new EventBus();
  editor.eventBus = eventBus;

  // 5. Create EditorState
  const editorState = new EditorState(eventBus);
  editor.editorState = editorState;

  // 6. Create CommandHistory
  const commandHistory = new CommandHistory(50);
  editor.commandHistory = commandHistory;

  // 7. Create default 25×25 map with all grass, elevation 5
  setStatus('创建默认地图...');
  const mapData = createDefaultMap(25, 25);
  editor.mapData = mapData;

  // 8. Create EditorTools
  const editorTools = new EditorTools(editorState, mapData, configs);
  editor.editorTools = editorTools;

  // 9. Create MapValidator and MapLibrary
  const mapValidator = new MapValidator(configs);
  editor.mapValidator = mapValidator;
  const mapLibrary = new MapLibrary();
  editor.mapLibrary = mapLibrary;

  // 10. Create EditorUI
  const editorUI = new EditorUI(
    document.getElementById('editor-root'),
    editorState,
    eventBus,
    configs
  );
  editorUI.init();
  editor.editorUI = editorUI;

  // 11. Render the initial map
  renderEngine.setMap(mapData);

  // 12. Center camera on map middle
  const centerCol = Math.floor(mapData.width / 2);
  const centerRow = Math.floor(mapData.height / 2);
  renderEngine.centerOnTileInstant(centerCol, centerRow);

  // 13. Draw initial grid and update stats
  _renderGridLines();
  editorUI.updateStats(mapData);

  // 14. Bind all input handlers
  _bindCanvasInput(app.view, renderEngine, editorState, editorTools, commandHistory, eventBus);
  _bindKeyboardShortcuts(commandHistory, renderEngine, eventBus);
  _bindEditorEvents(eventBus, editorState, editorTools, commandHistory, renderEngine, editorUI, mapValidator, mapLibrary, mapData, configs);

  // 15. Listen for window resize
  window.addEventListener('resize', () => {
    renderEngine.camera.resize(app.view.width, app.view.height);
  });

  // 16. Hide loading screen, show editor UI
  if (typeof window.hideLoading === 'function') {
    window.hideLoading();
  }

  // 17. Force resize to ensure camera has correct viewport dimensions
  //     (needed because the container may not have had final layout when app was created)
  app.resize();
  renderEngine.camera.resize(app.view.width, app.view.height);
  renderEngine.centerOnTileInstant(centerCol, centerRow);
}

/**
 * Create a default MapData with all tiles set to grass terrain and elevation 5.
 * @param {number} width
 * @param {number} height
 * @returns {MapData}
 */
export function createDefaultMap(width, height) {
  const map = new MapData(width, height);
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      map.setTile(q, r, {
        terrain: 'grass',
        elevation: 5,
        building: null,
        event: null,
        fogState: 'unexplored',
      });
    }
  }
  return map;
}


// ══════════════════════════════════════════════════════════════
// TASK 7.1-7.5: Canvas Input Handling
// ══════════════════════════════════════════════════════════════

/**
 * Bind pointer events on the canvas for painting, hover, and touch.
 * Camera.bindInput() already handles drag-to-pan and pinch-zoom.
 * We layer editor-specific input on top, distinguishing:
 *   - Single click → apply tool at tile
 *   - Drag paint → collect changes, merge on pointerup
 *   - Hover → update info panel
 *   - Touch: 1 finger = paint (when paint tool), 2 fingers = pan/zoom
 */
function _bindCanvasInput(canvas, renderEngine, editorState, editorTools, commandHistory, eventBus) {
  // Camera.bindInput is already called in RenderEngine.init().
  // We add our own listeners that check tool state.

  // ── Pointer Down ──
  canvas.addEventListener('pointerdown', (e) => {
    _pointerDown = true;
    _pointerStartX = e.clientX;
    _pointerStartY = e.clientY;
    _didDragMove = false;
    _dragChanges = [];
    _dragVisited = new Set();

    // Check if this is a paint tool (not pan)
    if (_shouldPaint(editorState) && !_isPinching && _activeTouchCount <= 1) {
      _isDragging = true;
      // Stop propagation to prevent Camera from starting a drag-pan
      e.stopPropagation();
      // Apply tool at initial tile
      const tile = _screenToTile(e, canvas, renderEngine);
      if (tile) {
        _applyToolAtTile(tile.col, tile.row, editorState, editorTools, commandHistory, renderEngine, eventBus, true);
      }
    }

    // Spawn tool: click to set spawn position
    if (editorState.currentTool === 'spawn' && !_isPinching && _activeTouchCount <= 1) {
      const tile = _screenToTile(e, canvas, renderEngine);
      if (tile) {
        editorState.setSpawnPosition(tile.col, tile.row);
        editor.editorUI.showToast(`起始位置设为 (${tile.col}, ${tile.row})`, 'info');
        _renderEditorHighlights();
      }
    }

    // Select tool: click to show tile info
    if (editorState.currentTool === 'select' && !_isPinching && _activeTouchCount <= 1) {
      const tile = _screenToTile(e, canvas, renderEngine);
      if (tile) {
        const tileData = editor.mapData.getTile(tile.col, tile.row);
        if (tileData && editor.editorUI) {
          editor.editorUI.updateInfoPanel({
            q: tile.col, r: tile.row,
            terrain: tileData.terrain,
            elevation: tileData.elevation,
            building: tileData.building || null,
            event: tileData.event || null,
          });
        }
      }
    }
  }, { capture: true });

  // ── Pointer Move ──
  canvas.addEventListener('pointermove', (e) => {
    // Update hover info (Task 7.4)
    const tile = _screenToTile(e, canvas, renderEngine);
    _updateHoverInfo(tile, renderEngine, editorState);

    if (!_pointerDown) return;

    // Check if moved enough to be a drag
    const dx = e.clientX - _pointerStartX;
    const dy = e.clientY - _pointerStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      _didDragMove = true;
    }

    // Drag paint (Task 7.2)
    if (_isDragging && _didDragMove && !_isPinching && _activeTouchCount <= 1) {
      if (tile) {
        const key = `${tile.col},${tile.row}`;
        if (!_dragVisited.has(key)) {
          _dragVisited.add(key);
          _applyToolAtTile(tile.col, tile.row, editorState, editorTools, commandHistory, renderEngine, eventBus, false);
        }
      }
    }
  });

  // ── Pointer Up ──
  canvas.addEventListener('pointerup', () => {
    if (_isDragging && _dragChanges.length > 0) {
      // Merge all drag changes into a single TileEditCommand (Task 7.2)
      const cmd = new TileEditCommand(editor.mapData, _dragChanges);
      // Changes already applied during drag, just push to history
      commandHistory._undoStack.push(cmd);
      if (commandHistory._undoStack.length > 50) {
        commandHistory._undoStack.shift();
      }
      commandHistory._redoStack.length = 0;
    }
    _isDragging = false;
    _pointerDown = false;
    _dragChanges = [];
    _dragVisited = new Set();
  });

  // ── Touch tracking (Task 7.5) ──
  canvas.addEventListener('touchstart', (e) => {
    _activeTouchCount = e.touches.length;
    if (_activeTouchCount >= 2) {
      _isPinching = true;
      _isDragging = false; // cancel paint on multi-touch
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    _activeTouchCount = e.touches.length;
    if (_activeTouchCount < 2) {
      _isPinching = false;
    }
  }, { passive: true });

  canvas.addEventListener('touchcancel', (e) => {
    _activeTouchCount = e.touches.length;
    if (_activeTouchCount < 2) {
      _isPinching = false;
    }
  }, { passive: true });
}

/**
 * Check if the current tool should paint on canvas interaction.
 */
function _shouldPaint(editorState) {
  const tool = editorState.currentTool;
  return ['terrain', 'elevation_up', 'elevation_down', 'elevation_set',
          'building', 'event', 'eraser', 'fill'].includes(tool);
}

/**
 * Convert a pointer event to tile coordinates.
 * @returns {{ col: number, row: number }|null}
 */
function _screenToTile(e, canvas, renderEngine) {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const tile = renderEngine.screenToTile(screenX, screenY);
  if (!tile) return null;
  const { width, height } = editor.mapData.getSize();
  if (tile.col < 0 || tile.col >= width || tile.row < 0 || tile.row >= height) return null;
  return tile;
}

/**
 * Apply the current tool at a tile coordinate.
 * During drag, changes are accumulated in _dragChanges.
 * On single click (not drag), changes are committed immediately.
 * @param {boolean} isInitial - true for pointerdown (first tile)
 */
function _applyToolAtTile(col, row, editorState, editorTools, commandHistory, renderEngine, eventBus, isInitial) {
  const tool = editorState.currentTool;
  const mapData = editor.mapData;
  let changes = [];
  let warnings = [];

  switch (tool) {
    case 'terrain': {
      changes = editorTools.paintTerrain(col, row);
      break;
    }
    case 'elevation_up': {
      changes = editorTools.adjustElevation(col, row, 1);
      break;
    }
    case 'elevation_down': {
      changes = editorTools.adjustElevation(col, row, -1);
      break;
    }
    case 'elevation_set': {
      changes = editorTools.setElevation(col, row, editorState.elevationValue);
      break;
    }
    case 'building': {
      if (!editorState.selectedBuilding) return;
      const result = editorTools.placeBuilding(col, row, editorState.selectedBuilding);
      changes = result.changes;
      warnings = result.warnings;
      break;
    }
    case 'event': {
      if (!editorState.selectedEvent) return;
      changes = editorTools.placeEvent(col, row, editorState.selectedEvent);
      break;
    }
    case 'eraser': {
      const tile = mapData.getTile(col, row);
      if (!tile) return;
      if (tile.building) {
        changes = editorTools.eraseBuilding(col, row);
      } else if (tile.event) {
        changes = editorTools.eraseEvent(col, row);
      }
      break;
    }
    case 'fill': {
      if (isInitial) {
        changes = editorTools.floodFill(col, row, editorState.selectedTerrain);
      }
      break;
    }
  }

  // Show warnings
  if (warnings.length > 0 && editor.editorUI) {
    for (const w of warnings) {
      editor.editorUI.showToast(w, 'warning');
    }
  }

  if (changes.length === 0) return;

  if (_isDragging) {
    // During drag: apply changes directly, accumulate for merge
    for (const c of changes) {
      mapData.setTile(c.q, c.r, c.after);
    }
    _dragChanges.push(...changes);
  } else {
    // Single click: commit as a command
    const cmd = new TileEditCommand(mapData, changes);
    commandHistory.execute(cmd);
  }

  // Re-render
  _refreshAfterEdit(renderEngine);
}

/**
 * Re-render map and update UI after an edit.
 */
function _refreshAfterEdit(renderEngine) {
  renderEngine.renderFullMap();
  _renderGridLines();
  _renderEditorHighlights();
  if (editor.editorUI) {
    editor.editorUI.updateStats(editor.mapData);
  }
}


// ══════════════════════════════════════════════════════════════
// TASK 7.3: Keyboard Shortcuts
// ══════════════════════════════════════════════════════════════

function _bindKeyboardShortcuts(commandHistory, renderEngine, eventBus) {
  window.addEventListener('keydown', (e) => {
    // Ctrl+Z → Undo
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      const cmd = commandHistory.undo();
      if (cmd) {
        _refreshAfterEdit(renderEngine);
        eventBus.emit('editor:toast', { message: '已撤销', type: 'info' });
      }
      return;
    }
    // Ctrl+Shift+Z → Redo
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      const cmd = commandHistory.redo();
      if (cmd) {
        _refreshAfterEdit(renderEngine);
        eventBus.emit('editor:toast', { message: '已重做', type: 'info' });
      }
      return;
    }
    // Ctrl+Shift+Z alternative: Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      const cmd = commandHistory.redo();
      if (cmd) {
        _refreshAfterEdit(renderEngine);
        eventBus.emit('editor:toast', { message: '已重做', type: 'info' });
      }
      return;
    }
  });
}

// ══════════════════════════════════════════════════════════════
// TASK 7.4: Hover Info Update
// ══════════════════════════════════════════════════════════════

function _updateHoverInfo(tile, renderEngine, editorState) {
  if (!tile) {
    _hoverTile = null;
    if (editor.editorUI) editor.editorUI.updateInfoPanel(null);
    _renderEditorHighlights();
    return;
  }

  const { col, row } = tile;
  if (_hoverTile && _hoverTile.col === col && _hoverTile.row === row) return;
  _hoverTile = { col, row };

  const tileData = editor.mapData.getTile(col, row);
  if (tileData && editor.editorUI) {
    editor.editorUI.updateInfoPanel({
      q: col,
      r: row,
      terrain: tileData.terrain,
      elevation: tileData.elevation,
      building: tileData.building || null,
      event: tileData.event || null,
    });
  }

  _renderEditorHighlights();
}


// ══════════════════════════════════════════════════════════════
// TASK 8.1: Grid Line Rendering
// ══════════════════════════════════════════════════════════════

function _renderGridLines() {
  const re = editor.renderEngine;
  if (!re || !editor.mapData) return;

  // Remove old grid graphics
  if (_gridGraphics) {
    _gridGraphics.destroy();
    _gridGraphics = null;
  }

  if (!editor.editorState || !editor.editorState.gridVisible) return;

  const g = new PIXI.Graphics();
  const hr = re.hexRenderer;
  const mapData = editor.mapData;
  const { width, height } = mapData.getSize();

  g.lineStyle(0.8, 0xffffff, 0.15);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const tile = mapData.getTile(col, row);
      if (!tile) continue;
      const pos = hr.offsetToPixel(col, row, tile.elevation);
      g.drawPolygon(hr.hexPoints(pos.x, pos.y, hr.hexSize));
    }
  }

  _gridGraphics = g;
  re.layers.decoration.addChild(g);
}

// ══════════════════════════════════════════════════════════════
// TASK 8.2: Editor Highlights (hover, validation, relics)
// ══════════════════════════════════════════════════════════════

/** @type {Array<{q:number,r:number}>} validation issue tiles */
let _validationIssueTiles = [];

function _renderEditorHighlights() {
  const re = editor.renderEngine;
  if (!re || !editor.mapData) return;

  // Remove old highlights
  if (_highlightGraphics) {
    _highlightGraphics.destroy();
    _highlightGraphics = null;
  }

  const g = new PIXI.Graphics();
  const hr = re.hexRenderer;
  const mapData = editor.mapData;

  // Hover highlight (semi-transparent blue)
  if (_hoverTile) {
    const tile = mapData.getTile(_hoverTile.col, _hoverTile.row);
    if (tile) {
      const pos = hr.offsetToPixel(_hoverTile.col, _hoverTile.row, tile.elevation);
      g.beginFill(0x4fc3f7, 0.25);
      g.lineStyle(1.5, 0x4fc3f7, 0.6);
      g.drawPolygon(hr.hexPoints(pos.x, pos.y, hr.hexSize));
      g.endFill();
    }
  }

  // Validation issue tiles (red)
  if (_validationIssueTiles.length > 0) {
    for (const t of _validationIssueTiles) {
      const tile = mapData.getTile(t.q, t.r);
      if (!tile) continue;
      const pos = hr.offsetToPixel(t.q, t.r, tile.elevation);
      g.beginFill(0xe53935, 0.2);
      g.lineStyle(1.5, 0xe53935, 0.6);
      g.drawPolygon(hr.hexPoints(pos.x, pos.y, hr.hexSize));
      g.endFill();
    }
  }

  // Relic event markers (scan tiles for relic_ events)
  const relicTex = re.assetLoader.getTexture('assets/ui/relic.png');
  const relicContainer = new PIXI.Container();
  const allTiles = mapData.getAllTiles();
  for (const t of allTiles) {
    if (!t.event || !t.event.startsWith('relic_')) continue;
    const tile = mapData.getTile(t.q, t.r);
    if (!tile) continue;
    const pos = hr.offsetToPixel(t.q, t.r, tile.elevation);
    if (relicTex) {
      const sprite = new PIXI.Sprite(relicTex);
      sprite.anchor.set(0.5);
      sprite.width = hr.hexSize * 1.2;
      sprite.height = hr.hexSize * 1.2;
      sprite.x = pos.x;
      sprite.y = pos.y;
      sprite.alpha = 0.8;
      relicContainer.addChild(sprite);
    } else {
      g.beginFill(0xffd700, 0.5);
      g.lineStyle(1, 0xffd700, 0.8);
      g.drawPolygon([pos.x, pos.y - 6, pos.x + 5, pos.y, pos.x, pos.y + 6, pos.x - 5, pos.y]);
      g.endFill();
    }
  }

  _highlightGraphics = new PIXI.Container();
  _highlightGraphics.addChild(g);
  _highlightGraphics.addChild(relicContainer);

  // Spawn position marker
  const editorState = editor.editorState;
  const spawnPos = editorState?.spawnPosition || {
    q: Math.floor(mapData.width / 2),
    r: Math.floor(mapData.height / 2),
  };
  const spawnTile = mapData.getTile(spawnPos.q, spawnPos.r);
  if (spawnTile) {
    const spawnPixel = hr.offsetToPixel(spawnPos.q, spawnPos.r, spawnTile.elevation);
    const playerTex = re.assetLoader.getTexture('assets/ui/player.png');
    if (playerTex) {
      const spawnSprite = new PIXI.Sprite(playerTex);
      spawnSprite.anchor.set(0.5);
      spawnSprite.width = hr.hexSize * 1.4;
      spawnSprite.height = hr.hexSize * 1.4;
      spawnSprite.x = spawnPixel.x;
      spawnSprite.y = spawnPixel.y;
      spawnSprite.alpha = 0.7;
      _highlightGraphics.addChild(spawnSprite);
    } else {
      g.beginFill(0x4fc3f7, 0.4);
      g.lineStyle(2, 0x4fc3f7, 0.8);
      g.drawCircle(spawnPixel.x, spawnPixel.y, hr.hexSize * 0.5);
      g.endFill();
    }
  }

  re.layers.decoration.addChild(_highlightGraphics);
}

// ══════════════════════════════════════════════════════════════
// TASK 8.3: Fit-to-Window
// ══════════════════════════════════════════════════════════════

function _fitToWindow() {
  const re = editor.renderEngine;
  if (!re || !editor.mapData) return;

  const hr = re.hexRenderer;
  const { width, height } = editor.mapData.getSize();
  const hexSize = hr.hexSize;

  // Calculate map pixel bounds
  const mapPixelW = hr.padX * 2 + SQRT3 * hexSize * width;
  const mapPixelH = hr.padY * 2 + 1.5 * hexSize * height;

  // Calculate scale to fit
  const camera = re.camera;
  const scaleX = camera.viewportWidth / mapPixelW;
  const scaleY = camera.viewportHeight / mapPixelH;
  const scale = Math.min(scaleX, scaleY) * 0.95; // 5% margin

  camera.scale = Math.max(camera.minScale, Math.min(camera.maxScale, scale));

  // Center on map middle
  const centerX = mapPixelW / 2;
  const centerY = mapPixelH / 2;
  camera.centerOn(centerX, centerY);
}


// ══════════════════════════════════════════════════════════════
// TASK 9.1-9.2: File Import/Export
// ══════════════════════════════════════════════════════════════

/**
 * Export current map as .hexmap.json file download.
 */
function _exportMap() {
  const mapData = editor.mapData;
  if (!mapData) return;

  const meta = editor.editorState?.mapMeta || {};
  const now = new Date().toISOString();

  const mapFile = {
    version: '1.0',
    meta: {
      name: meta.name || '未命名地图',
      author: meta.author || '',
      description: meta.description || '',
      createdAt: now,
      updatedAt: now,
    },
    mapData: mapData.toJSON(),
  };

  mapFile.eventConfig = editor.editorState.eventConfig;
  mapFile.spawnPosition = editor.editorState.spawnPosition || null;

  const json = JSON.stringify(mapFile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${(meta.name || 'map').replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_')}.hexmap.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (editor.editorUI) {
    editor.editorUI.showToast('地图已导出', 'success');
  }
}

/**
 * Import a .hexmap.json file.
 */
function _importMap() {
  if (!_fileInput) {
    _fileInput = document.createElement('input');
    _fileInput.type = 'file';
    _fileInput.accept = '.hexmap.json,.json';
    _fileInput.style.display = 'none';
    document.body.appendChild(_fileInput);

    _fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      _readImportFile(file);
      _fileInput.value = ''; // reset for re-import
    });
  }
  _fileInput.click();
}

function _readImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const parsed = JSON.parse(text);

      // Validate required fields
      const mapJSON = parsed.mapData || parsed;
      if (!mapJSON.width || !mapJSON.height || !mapJSON.tiles) {
        throw new Error('缺少必要字段 (width, height, tiles)');
      }

      const newMap = MapData.fromJSON(mapJSON);
      _loadMapIntoEditor(newMap);

      // Restore meta if present
      if (parsed.meta && editor.editorState) {
        editor.editorState.setMapMeta({
          name: parsed.meta.name || '',
          author: parsed.meta.author || '',
          description: parsed.meta.description || '',
        });
      }

      // Restore eventConfig if present
      if (parsed.eventConfig && editor.editorState) {
        editor.editorState.setEventConfig(parsed.eventConfig);
      }

      // Restore spawnPosition if present
      if (parsed.spawnPosition && editor.editorState) {
        editor.editorState.setSpawnPosition(parsed.spawnPosition.q, parsed.spawnPosition.r);
      } else if (editor.editorState) {
        editor.editorState.spawnPosition = null;
      }

      if (editor.editorUI) {
        editor.editorUI.showToast('地图导入成功', 'success');
      }
    } catch (err) {
      console.error('Import failed:', err);
      if (editor.editorUI) {
        editor.editorUI.showToast(`导入失败: ${err.message}`, 'error');
      }
    }
  };
  reader.onerror = () => {
    if (editor.editorUI) {
      editor.editorUI.showToast('文件读取失败', 'error');
    }
  };
  reader.readAsText(file);
}


// ══════════════════════════════════════════════════════════════
// TASK 10.1: Random Generation
// ══════════════════════════════════════════════════════════════

function _randomGenerate(seed, size) {
  const configs = editor.configs;
  if (!configs) return;

  const gen = new MapGenerator(seed, size, configs.terrain, configs.building, configs.item, configs.event);
  const newMap = gen.generate();
  _loadMapIntoEditor(newMap);

  if (editor.editorUI) {
    editor.editorUI.showToast(`随机地图已生成 (seed: ${seed})`, 'success');
  }
}

// ══════════════════════════════════════════════════════════════
// Shared: Load a new map into the editor
// ══════════════════════════════════════════════════════════════

function _loadMapIntoEditor(newMap) {
  editor.mapData = newMap;

  // Update EditorTools reference
  if (editor.editorTools) {
    editor.editorTools.mapData = newMap;
  }

  // Clear command history
  if (editor.commandHistory) {
    editor.commandHistory.clear();
  }

  // Clear validation highlights
  _validationIssueTiles = [];

  // Re-render
  const re = editor.renderEngine;
  if (re) {
    re.setMap(newMap);
    _renderGridLines();
    _renderEditorHighlights();
    _fitToWindow();
  }

  // Update stats
  if (editor.editorUI) {
    editor.editorUI.updateStats(newMap);
  }
}


// ══════════════════════════════════════════════════════════════
// Event Wiring: Connect all UI events to editor logic
// ══════════════════════════════════════════════════════════════

function _bindEditorEvents(eventBus, editorState, editorTools, commandHistory, renderEngine, editorUI, mapValidator, mapLibrary, mapData, configs) {

  // ── New Map ──
  eventBus.on('editor:new-map', ({ width, height }) => {
    const newMap = createDefaultMap(width, height);
    _loadMapIntoEditor(newMap);
    editorUI.showToast(`新建 ${width}×${height} 地图`, 'success');
  });

  // ── Random Generate (Task 10.1) ──
  eventBus.on('editor:random-generate', ({ seed, size }) => {
    _randomGenerate(seed, size);
  });

  // ── Save to Library ──
  eventBus.on('editor:save-to-library', () => {
    const id = mapLibrary.generateId();
    const meta = {
      name: editorState.mapMeta.name || '未命名地图',
      author: editorState.mapMeta.author || '',
      description: editorState.mapMeta.description || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: `${editor.mapData.width}×${editor.mapData.height}`,
    };
    const customMap = {
      id,
      meta,
      mapJSON: editor.mapData.toJSON(),
      eventConfig: editor.editorState.eventConfig,
      spawnPosition: editor.editorState.spawnPosition || null,
    };
    const result = mapLibrary.save(id, customMap);
    if (result.success) {
      editorUI.showToast('已保存到地图库', 'success');
    } else {
      editorUI.showToast(`保存失败: ${result.error}`, 'error');
    }
  });

  // ── Open Library ──
  eventBus.on('editor:open-library', () => {
    const maps = mapLibrary.list();
    editorUI.showMapLibrary(maps);
  });

  // ── Load from Library ──
  eventBus.on('editor:load-from-library', ({ id }) => {
    const customMap = mapLibrary.load(id);
    if (!customMap || !customMap.mapJSON) {
      editorUI.showToast('加载失败: 地图数据无效', 'error');
      return;
    }
    try {
      const newMap = MapData.fromJSON(customMap.mapJSON);
      _loadMapIntoEditor(newMap);
      if (customMap.meta) {
        editorState.setMapMeta({
          name: customMap.meta.name || '',
          author: customMap.meta.author || '',
          description: customMap.meta.description || '',
        });
      }
      // Restore spawnPosition if present
      if (customMap.spawnPosition) {
        editorState.setSpawnPosition(customMap.spawnPosition.q, customMap.spawnPosition.r);
      } else {
        editorState.spawnPosition = null;
      }
      editorUI.showToast('地图已加载', 'success');
    } catch (err) {
      editorUI.showToast(`加载失败: ${err.message}`, 'error');
    }
  });

  // ── Delete from Library ──
  eventBus.on('editor:delete-from-library', ({ id }) => {
    mapLibrary.delete(id);
    editorUI.showToast('地图已删除', 'info');
  });

  // ── Export File (Task 9.1) ──
  eventBus.on('editor:export-file', () => {
    _exportMap();
  });

  // ── Import File (Task 9.2) ──
  eventBus.on('editor:import-file', () => {
    _importMap();
  });

  // ── Validate Map ──
  eventBus.on('editor:validate-map', () => {
    const results = mapValidator.validate(editor.mapData);
    editorUI.showValidationResults(results);

    // Collect all issue tiles for highlighting
    _validationIssueTiles = [];
    for (const issue of results.issues) {
      if (issue.tiles) {
        _validationIssueTiles.push(...issue.tiles);
      }
    }
    _renderEditorHighlights();

    if (results.valid && results.issues.length === 0) {
      editorUI.showToast('地图验证通过 ✅', 'success');
    } else {
      const errorCount = results.issues.filter(i => i.severity === 'error').length;
      const warnCount = results.issues.filter(i => i.severity === 'warning').length;
      editorUI.showToast(`验证完成: ${errorCount} 错误, ${warnCount} 警告`, errorCount > 0 ? 'error' : 'warning');
    }
  });

  // ── Undo / Redo ──
  eventBus.on('editor:undo', () => {
    const cmd = commandHistory.undo();
    if (cmd) {
      _refreshAfterEdit(renderEngine);
      editorUI.showToast('已撤销', 'info');
    }
  });

  eventBus.on('editor:redo', () => {
    const cmd = commandHistory.redo();
    if (cmd) {
      _refreshAfterEdit(renderEngine);
      editorUI.showToast('已重做', 'info');
    }
  });

  // ── Grid Toggle (Task 8.1) ──
  eventBus.on('editor:toggle-grid', () => {
    editorState.toggleGrid();
    _renderGridLines();
  });

  // ── Fit Window (Task 8.3) ──
  eventBus.on('editor:fit-window', () => {
    _fitToWindow();
  });

  // ── Relics Needed Changed ──
  eventBus.on('editor:relics-needed-changed', ({ value }) => {
    if (editor.mapData) {
      editor.mapData.relicsNeeded = value;
    }
  });

  // ── Event Config Changed ──
  eventBus.on('editor:event-config-changed', () => {
    if (editorUI && editor.mapData) {
      editorUI.updateStats(editor.mapData);
    }
  });
}


// ══════════════════════════════════════════════════════════════
// Auto Place Events (reuses MapGenerator's event placement logic)
// ══════════════════════════════════════════════════════════════
// Boot
// ══════════════════════════════════════════════════════════════

// Boot the editor — catch errors and display on loading screen
initEditor().catch((e) => {
  console.error('Editor init failed:', e);
  const loadStatus = document.getElementById('editor-load-status');
  if (loadStatus) {
    loadStatus.textContent = '加载失败: ' + e.message;
    loadStatus.style.color = '#e53935';
  }
});
