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

  // 1. Create PixiJS Application
  pixiApp = new PIXI.Application({
    resizeTo: container,
    backgroundColor: 0x1a1a2e,
    antialias: true,
  });
  container.appendChild(pixiApp.view);
  // Ensure canvas fills container
  pixiApp.view.style.display = 'block';

  // 2. Load all JSON configs
  const loader = new ConfigLoader();
  try {
    configs = await loader.loadAll();
  } catch (e) {
    console.error('Config load failed:', e);
    container.innerHTML = `<div style="color:red;padding:20px;">配置加载失败: ${e.message}</div>`;
    return;
  }

  // 3. Create shared EventBus
  eventBus = new EventBus();

  // 4. Initialize RenderEngine
  renderEngine = new RenderEngine(pixiApp, { hexSize: 18 });
  await renderEngine.init(configs.terrain, configs.building);
  renderEngine.setEventConfig(configs.event);

  // 5. Initialize UIManager
  uiManager = new UIManager(container, eventBus);
  uiManager.init();

  // 5.5 Initialize InputHandler (once, reused across game restarts)
  inputHandler = new InputHandler(renderEngine, eventBus);
  inputHandler.init();

  // 6. Check for auto-save
  const saveSystem = new SaveSystem(GAME_VERSION);
  const savedState = saveSystem.loadAutoSave();

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
 * Start a new game with seed/size selection
 */
async function startNewGame(saveSystem, forceSeed, forceSize) {
  let seed = forceSeed;
  let mapSize = forceSize || 'medium';

  if (seed === undefined) {
    // Show a simple seed/size selection dialog
    const choiceIdx = await uiManager.dialog.showEvent({
      title: '🗺️ 新游戏',
      description: '选择地图尺寸开始冒险！种子将随机生成。',
      choices: [
        { text: '🟢 小地图 (25×25) — 快速体验' },
        { text: '🟡 中地图 (50×50) — 推荐' },
        { text: '🔴 大地图 (75×75) — 史诗冒险' },
      ],
    });

    const sizes = ['small', 'medium', 'large'];
    mapSize = sizes[choiceIdx] || 'medium';
    seed = Math.floor(Math.random() * 100000);
  }

  // Generate map
  const gen = new MapGenerator(seed, mapSize, configs.terrain, configs.building, configs.item, configs.event);
  const mapData = gen.generate();

  // Player starts at center
  const spawnCol = Math.floor(gen.width / 2);
  const spawnRow = Math.floor(gen.height / 2);

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
  const eventSystem = new EventSystem(configs.event, configs.terrain, configs.building, playerState, eventBus, { itemSystem, rng });
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
  const eventSystem = new EventSystem(configs.event, configs.terrain, configs.building, playerState, eventBus, { itemSystem, rng });
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
