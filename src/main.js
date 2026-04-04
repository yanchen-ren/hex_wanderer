/**
 * HexWanderer — 游戏入口
 * 初始化 PixiJS、加载配置、启动 GameLoop
 */
import { ConfigLoader } from './core/ConfigLoader.js';
import { EventBus } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { MapGenerator } from './map/MapGenerator.js';
import { MapData } from './map/MapData.js';
import { RenderEngine } from './render/RenderEngine.js';
import { InputHandler } from './ui/InputHandler.js';
import { UIManager } from './ui/UIManager.js';
import { PlayerState } from './systems/PlayerState.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { TurnSystem } from './systems/TurnSystem.js';
import { EventSystem } from './systems/EventSystem.js';
import { FogSystem } from './systems/FogSystem.js';
import { ItemSystem } from './systems/ItemSystem.js';
import { BuildingSystem } from './systems/BuildingSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { SeededRandom } from './utils/SeededRandom.js';
import { MapLibrary } from './editor/MapLibrary.js';

import { HexGrid } from './map/HexGrid.js';

const GAME_VERSION = '1.0.0';

/** @type {GameLoop|null} */
let gameLoop = null;
/** @type {PIXI.Application|null} */
let pixiApp = null;
/** @type {EventBus} */
let eventBus = null;
/** @type {RenderEngine|null} */
let renderEngine = null;
/** @type {UIManager|null} */
let uiManager = null;
/** @type {import('./ui/InputHandler.js').InputHandler|null} */
let inputHandler = null;
/** @type {object} configs */
let configs = null;

async function init() {
  const container = document.getElementById('game-container');
  if (!container) { console.error('Missing #game-container'); return; }

  const setProgress = (pct, msg) => {
    if (window.setLoadProgress) window.setLoadProgress(pct, msg);
  };

  setProgress(25, '初始化渲染引擎...');

  // 1. Create PixiJS Application
  pixiApp = new PIXI.Application({
    resizeTo: container,
    backgroundColor: 0x1a1a2e,
    antialias: true,
  });
  container.appendChild(pixiApp.view);
  pixiApp.view.style.display = 'block';

  setProgress(20, '加载配置文件...');

  // 2. Load all JSON configs
  const loader = new ConfigLoader();
  try {
    configs = await loader.loadAll();
  } catch (e) {
    console.error('Config load failed:', e);
    setProgress(100, `配置加载失败: ${e.message}`);
    return;
  }

  setProgress(40, '加载素材...');

  // 3. Create shared EventBus
  eventBus = new EventBus();

  // 4. Initialize RenderEngine
  renderEngine = new RenderEngine(pixiApp, { hexSize: 18 });
  await renderEngine.init(configs.terrain, configs.building, (loaded, total) => {
    const pct = 40 + Math.floor((loaded / Math.max(total, 1)) * 40);
    setProgress(pct, `加载素材 ${loaded}/${total}...`);
  }, configs.item);
  renderEngine.setEventConfig(configs.event);

  setProgress(85, '初始化界面...');

  // 5. Initialize UIManager
  uiManager = new UIManager(container, eventBus);
  uiManager.init();

  // 5.5 Initialize InputHandler (once, reused across game restarts)
  inputHandler = new InputHandler(renderEngine, eventBus);
  inputHandler.init();

  setProgress(95, '准备就绪...');

  // 6. Check for auto-save
  const saveSystem = new SaveSystem(GAME_VERSION);
  const savedState = saveSystem.loadAutoSave();

  // Hide loading screen
  setProgress(100, '加载完成');
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.transition = 'opacity 0.3s';
    loadingScreen.style.opacity = '0';
    setTimeout(() => loadingScreen.remove(), 300);
  }

  if (savedState) {
    // Prompt: continue or new game
    const doContinue = await uiManager.dialog.confirm({
      title: '发现存档',
      message: `回合 ${savedState.turnNumber}，HP ${savedState.player?.hp}/${savedState.player?.hpMax}。是否继续？`,
      confirmText: '继续游戏',
      cancelText: '新游戏',
    });

    if (doContinue) {
      await startFromSave(savedState, saveSystem);
      return;
    }
  }

  // 7. New game: prompt for seed and size
  await startNewGame(saveSystem);
}

/**
 * Start a new game with seed/size selection.
 * Task 11.1: Check MapLibrary for custom maps and offer option.
 */
async function startNewGame(saveSystem, forceSeed, forceSize) {
  let seed = forceSeed;
  let mapSize = forceSize || 'medium';
  let customMapData = null;
  let customEventConfig = null;

  if (seed === undefined) {
    // Task 11.1: Check for custom maps in MapLibrary
    const mapLibrary = new MapLibrary();
    const customMaps = mapLibrary.list();

    const choices = [
      { text: '🟢 小地图 (25×25) — 快速体验' },
      { text: '🟡 中地图 (50×50) — 推荐' },
      { text: '🔴 大地图 (75×75) — 史诗冒险' },
    ];

    // Always add file import option
    choices.push({ text: '📂 导入地图文件 (.hexmap.json)' });

    // Add custom map option if maps exist in library
    if (customMaps.length > 0) {
      choices.push({ text: `🗺️ 从地图库选择 (${customMaps.length} 张)` });
    }

    const choiceIdx = await uiManager.dialog.showEvent({
      title: '🗺️ 新游戏',
      description: '选择地图尺寸开始冒险！',
      choices,
    });

    // Handle choices by index
    const FILE_IMPORT_IDX = 3;
    const LIBRARY_IDX = customMaps.length > 0 ? 4 : -1;

    if (choiceIdx === FILE_IMPORT_IDX) {
      // Import from file
      customMapData = await _importMapFile();
      if (customMapData) {
        // extract eventConfig and spawnPosition from the parsed data
        customEventConfig = customMapData._eventConfig || null;
        delete customMapData._eventConfig;
      }
      if (!customMapData) {
        // User cancelled or import failed, restart selection
        await startNewGame(saveSystem);
        return;
      }
    } else if (choiceIdx === LIBRARY_IDX) {
      // Show custom map selection
      const mapChoices = customMaps.map(m => ({
        text: `📄 ${m.meta.name || '未命名'} (${m.meta.size || '?'})`,
      }));
      const mapIdx = await uiManager.dialog.showEvent({
        title: '🗺️ 选择自定义地图',
        description: '选择一张自定义地图开始游戏。',
        choices: mapChoices,
      });

      const selectedMap = customMaps[mapIdx];
      if (selectedMap) {
        const fullMap = mapLibrary.load(selectedMap.id);
        if (fullMap && fullMap.mapJSON) {
          try {
            customMapData = MapData.fromJSON(fullMap.mapJSON);
            customEventConfig = fullMap.eventConfig || null;
            // Restore spawnPosition if present
            if (fullMap.spawnPosition) {
              customMapData._customSpawnPosition = fullMap.spawnPosition;
            }
            // Validate portalPosition
            if (!customMapData.portalPosition) {
              // Check if any tile has a portal building
              const allTiles = customMapData.getAllTiles();
              const portalTile = allTiles.find(t => t.building === 'portal');
              if (portalTile) {
                customMapData.portalPosition = { q: portalTile.q, r: portalTile.r };
              } else {
                // No portal — warn and fallback
                console.warn('Custom map missing portalPosition, falling back to random generation');
                customMapData = null;
              }
            }
          } catch (err) {
            console.error('Failed to load custom map:', err);
            customMapData = null;
          }
        }
      }

      if (!customMapData) {
        // Fallback: generate random map
        seed = Math.floor(Math.random() * 100000);
      }
    } else {
      // Size selection (0, 1, 2)
      const sizes = ['small', 'medium', 'large'];
      mapSize = sizes[choiceIdx] || 'medium';
      seed = Math.floor(Math.random() * 100000);
    }
  }

  let mapData;
  let spawnCol, spawnRow;
  if (customMapData) {
    // Task 11.2: Use custom map, skip MapGenerator
    mapData = customMapData;
    seed = seed ?? Math.floor(Math.random() * 100000);
    // Use custom spawn position if available, otherwise map center
    if (customMapData._customSpawnPosition) {
      spawnCol = customMapData._customSpawnPosition.q;
      spawnRow = customMapData._customSpawnPosition.r;
      delete customMapData._customSpawnPosition;
    } else {
      spawnCol = Math.floor(mapData.width / 2);
      spawnRow = Math.floor(mapData.height / 2);
    }

    // Apply runtime event generation if eventConfig is present and enabled
    if (customEventConfig && customEventConfig.enabled) {
      _placeRuntimeEvents(mapData, configs, customEventConfig, new SeededRandom(seed));
    }
  } else {
    // Generate map
    const gen = new MapGenerator(seed, mapSize, configs.terrain, configs.building, configs.item, configs.event);
    mapData = gen.generate();
    spawnCol = Math.floor(gen.width / 2);
    spawnRow = Math.floor(gen.height / 2);
  }

  // Player starts at center

  const playerState = new PlayerState({
    position: { q: spawnCol, r: spawnRow },
    hp: 100, hpMax: 100,
    ap: 8, apMax: 8,
    turnNumber: 1,
    relicsCollected: 0,
  });

  const rng = new SeededRandom(seed);
  const itemSystem = new ItemSystem(configs.item);
  const movementSystem = new MovementSystem(configs.terrain, itemSystem, playerState, { rng });
  const turnSystem = new TurnSystem(playerState, configs.terrain, itemSystem, eventBus);
  const eventSystem = new EventSystem(configs.event, configs.terrain, configs.building, playerState, eventBus, { itemSystem, rng, difficultyConfig: configs.difficulty });
  const fogSystem = new FogSystem(configs.terrain, playerState, itemSystem);
  const buildingSystem = new BuildingSystem(configs.building, eventBus);

  // Create and start GameLoop (reuse module-level inputHandler)
  gameLoop = new GameLoop({
    eventBus, renderEngine, uiManager, inputHandler,
    playerState, movementSystem, turnSystem, eventSystem,
    fogSystem, itemSystem, buildingSystem, saveSystem,
    mapData, configs, seed, mapSize,
  });

  renderEngine.setEventConfig(configs.event);
  gameLoop.start();

  // Listen for restart/restore
  _wireGameEvents(saveSystem);
}

/**
 * Start from a saved state
 */
async function startFromSave(savedState, saveSystem) {
  const seed = savedState.seed ?? 0;
  const mapSize = savedState.mapSize ?? 'medium';

  // Restore map
  const mapData = MapData.fromJSON(savedState.map);

  // Restore player
  const playerState = PlayerState.fromJSON(savedState.player);

  // Restore items
  const rng = new SeededRandom(seed);
  const itemSystem = new ItemSystem(configs.item);
  if (savedState.player?.items) {
    itemSystem.loadFromJSON(savedState.player.items);
  }

  const movementSystem = new MovementSystem(configs.terrain, itemSystem, playerState, { rng });
  const turnSystem = new TurnSystem(playerState, configs.terrain, itemSystem, eventBus);
  const eventSystem = new EventSystem(configs.event, configs.terrain, configs.building, playerState, eventBus, { itemSystem, rng, difficultyConfig: configs.difficulty });
  const fogSystem = new FogSystem(configs.terrain, playerState, itemSystem);
  const buildingSystem = new BuildingSystem(configs.building, eventBus);

  // Restore fog
  if (savedState.fog) {
    fogSystem.loadFromJSON(savedState.fog);
  }

  gameLoop = new GameLoop({
    eventBus, renderEngine, uiManager, inputHandler,
    playerState, movementSystem, turnSystem, eventSystem,
    fogSystem, itemSystem, buildingSystem, saveSystem,
    mapData, configs, seed, mapSize,
  });

  // Restore permanently revealed tiles (lighthouse etc.)
  if (Array.isArray(savedState.permanentlyRevealed) && savedState.permanentlyRevealed.length > 0) {
    gameLoop._permanentlyRevealed = new Set(savedState.permanentlyRevealed);
  }

  // Restore path target
  if (savedState.pathTarget) {
    gameLoop._pathTarget = savedState.pathTarget;
  }

  gameLoop.start();

  _wireGameEvents(saveSystem);
}

/**
 * Show a file picker for .hexmap.json files and return a MapData object (or null).
 * @returns {Promise<MapData|null>}
 */
function _importMapFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hexmap.json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) { input.remove(); resolve(null); return; }

      const reader = new FileReader();
      reader.onload = (ev) => {
        input.remove();
        try {
          const parsed = JSON.parse(ev.target.result);
          const mapJSON = parsed.mapData || parsed;
          if (!mapJSON.width || !mapJSON.height || !mapJSON.tiles) {
            throw new Error('Invalid map file');
          }
          const mapData = MapData.fromJSON(mapJSON);

          // Attach eventConfig and spawnPosition as temp properties
          if (parsed.eventConfig) mapData._eventConfig = parsed.eventConfig;
          if (parsed.spawnPosition) mapData._customSpawnPosition = parsed.spawnPosition;

          // Validate portalPosition
          if (!mapData.portalPosition) {
            const allTiles = mapData.getAllTiles();
            const portalTile = allTiles.find(t => t.building === 'portal');
            if (portalTile) {
              mapData.portalPosition = { q: portalTile.q, r: portalTile.r };
            }
          }

          resolve(mapData);
        } catch (err) {
          console.error('Map import failed:', err);
          resolve(null);
        }
      };
      reader.onerror = () => { input.remove(); resolve(null); };
      reader.readAsText(file);
    });

    // Handle cancel (user closes file picker without selecting)
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });

    input.click();
  });
}

/**
 * Place events at runtime on a custom map using eventConfig densities.
 * Similar to MapGenerator._placeRandomEvents but uses custom densities.
 */
function _placeRuntimeEvents(mapData, configs, eventConfig, rng) {
  const terrainTypes = configs.terrain?.terrainTypes || {};
  const events = configs.event?.events || {};
  const eventDensity = eventConfig.eventDensity ?? 0.35;
  const treasureDensity = eventConfig.treasureDensity ?? 0.20;

  const excludePrefixes = ['overnight_'];
  const excludeIds = new Set([
    'lighthouse_event', 'camp_rest_event', 'church_prayer',
    'watchtower_event', 'reef_event', 'training_event', 'altar_event',
    'wishing_well_event', 'phone_booth_event', 'food_truck_event',
    'bonfire_event', 'hollow_tree_event', 'colossus_hand_event',
    'vending_machine_event', 'village_event', 'city_market', 'castle_event',
    'thief_city_arrest', 'sheriff_city_bonus', 'accordion_party',
    'campfire_party', 'mystery_egg_hatch', 'tutorial',
  ]);

  const eventsByType = { combat: [], treasure: [], choice: [] };
  for (const [eventId, def] of Object.entries(events)) {
    if (excludeIds.has(eventId)) continue;
    if (excludePrefixes.some(p => eventId.startsWith(p))) continue;
    const type = def.type;
    if (eventsByType[type]) {
      eventsByType[type].push({ id: eventId, allowedTerrains: def.allowedTerrains || ['any'] });
    }
  }

  const { width, height } = mapData.getSize();
  const spawnQ = Math.floor(width / 2);
  const spawnR = Math.floor(height / 2);
  const eventUsageCount = new Map();

  // Compute weights: treasure gets treasureDensity share, rest split between combat and choice
  const treasureWeight = treasureDensity;
  const remaining = 1 - treasureWeight;
  const combatWeight = remaining * 0.5;
  // choiceWeight = remaining * 0.5

  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const tile = mapData.getTile(q, r);
      if (!tile || tile.event || tile.building) continue;
      if (tile.terrain === 'void') continue;
      if (HexGrid.distance(q, r, spawnQ, spawnR) < 3) continue;
      if (rng.next() > eventDensity) continue;

      const tc = terrainTypes[tile.terrain];
      const weights = (tc && tc.eventWeights) || { combat: combatWeight, treasure: treasureWeight, choice: 1 - combatWeight - treasureWeight };
      const roll = rng.next();
      let eventType;
      if (roll < weights.combat) eventType = 'combat';
      else if (roll < weights.combat + weights.treasure) eventType = 'treasure';
      else eventType = 'choice';

      const pool = eventsByType[eventType] || [];
      const filtered = pool.filter(e => {
        const at = e.allowedTerrains;
        if (!at || at.length === 0 || at.includes('any')) return true;
        if (at.includes('any_land') && tile.terrain !== 'water' && tile.terrain !== 'void') return true;
        return at.includes(tile.terrain);
      });
      if (filtered.length > 0) {
        const minUsage = Math.min(...filtered.map(e => eventUsageCount.get(e.id) ?? 0));
        const leastUsed = filtered.filter(e => (eventUsageCount.get(e.id) ?? 0) === minUsage);
        const picked = leastUsed[rng.nextInt(0, leastUsed.length - 1)];
        tile.event = picked.id;
        eventUsageCount.set(picked.id, (eventUsageCount.get(picked.id) ?? 0) + 1);
      }
    }
  }
}

/**
 * Wire game-level events (restart, restore)
 */
function _wireGameEvents(saveSystem) {
  // Remove old listeners by creating fresh handlers
  const onRestart = async ({ newMap }) => {
    eventBus.off('game:restart', onRestart);
    eventBus.off('game:restore-save', onRestoreSave);
    eventBus.off('game:load-state', onLoadState);

    if (newMap) {
      await startNewGame(saveSystem);
    } else {
      await startNewGame(saveSystem, gameLoop?.seed, gameLoop?.mapSize);
    }
  };

  const onRestoreSave = async () => {
    eventBus.off('game:restart', onRestart);
    eventBus.off('game:restore-save', onRestoreSave);
    eventBus.off('game:load-state', onLoadState);

    const saved = saveSystem.loadAutoSave();
    if (saved) {
      await startFromSave(saved, saveSystem);
    } else {
      await startNewGame(saveSystem);
    }
  };

  const onLoadState = async (state) => {
    eventBus.off('game:restart', onRestart);
    eventBus.off('game:restore-save', onRestoreSave);
    eventBus.off('game:load-state', onLoadState);

    await startFromSave(state, saveSystem);
  };

  eventBus.on('game:restart', onRestart);
  eventBus.on('game:restore-save', onRestoreSave);
  eventBus.on('game:load-state', onLoadState);
}

// Boot
init().catch(e => console.error('HexWanderer init failed:', e));
