/** RenderEngine - PixiJS render controller */
import { AssetLoader } from './AssetLoader.js';
import { Camera } from './Camera.js';
import { HexRenderer } from './HexRenderer.js';
import { LayerManager } from './LayerManager.js';
const SQRT3 = Math.sqrt(3);
export class RenderEngine {
  constructor(pixiApp, opts = {}) {
    this.app = pixiApp;
    this.hexSize = opts.hexSize ?? 18;
    this.assetLoader = new AssetLoader();
    this.camera = new Camera(pixiApp.view.width, pixiApp.view.height);
    this.hexRenderer = new HexRenderer(pixiApp, this.hexSize);
    this.worldContainer = new PIXI.Container();
    pixiApp.stage.addChild(this.worldContainer);
    this.layers = new LayerManager(this.worldContainer);
    this.terrainConfig = null;
    this.buildingConfig = null;
    this.eventConfig = null;
    this.mapData = null;
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.playerPos = { col: 0, row: 0 };
    this._playerMarker = null;
    this._selectedTile = null;
    this._playerFacing = 1; // 1 = facing right (default), -1 = facing left
    this.getFogState = null;
    this._resizeHandler = null;
    this.fogEnabled = true;
    this._bakedTerrainTexture = null;
  }
  async init(tc, bc, onProgress, itemConfig) {
    this.terrainConfig = tc;
    this.buildingConfig = bc;
    const paths = AssetLoader.collectAssetPaths(tc, bc, itemConfig);
    await this.assetLoader.preload(paths, onProgress);
    this.hexRenderer.buildTextureCache(tc, this.assetLoader);
    this.camera.bindInput(this.app.view);
    // Remove previous resize listener to prevent accumulation on game restart
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    this._resizeHandler = () => {
      this.camera.resize(this.app.view.width, this.app.view.height);
      // Re-center camera on player after orientation/resize change
      if (this.mapData && this.playerPos) {
        const tile = this.mapData.getTile(this.playerPos.col, this.playerPos.row);
        if (tile) {
          const pos = this.hexRenderer.offsetToPixel(this.playerPos.col, this.playerPos.row, tile.elevation);
          this.camera.centerOn(pos.x, pos.y);
        }
      }
    };
    window.addEventListener('resize', this._resizeHandler);
    this.app.ticker.add(() => this.camera.applyTo(this.worldContainer));
  }
  setMap(md) {
    this.mapData = md;
    const s = md.getSize();
    this.mapWidth = s.width;
    this.mapHeight = s.height;
    this.renderFullMap();
  }
  /** Set event config for marker type detection */
  setEventConfig(ec) {
    this.eventConfig = ec;
  }
  renderFullMap() {
    if (!this.mapData) return;
    this.layers.clearAll();
    this._bakeTerrainLayer();
    this._renderMarkers();
    this._renderFogLayer();
  }
  renderVisibleTiles() {
    if (!this.mapData) return;
    this._renderMarkers();
    this._renderFogLayer();
  }
  _bakeTerrainLayer() {
    this.layers.clearLayer('terrain');
    if (this._bakedTerrainTexture) {
      this._bakedTerrainTexture.destroy(true);
      this._bakedTerrainTexture = null;
    }
    const hr = this.hexRenderer;
    const tmp = new PIXI.Container();
    const cg = new PIXI.Graphics();
    tmp.addChild(cg);
    const sl = new PIXI.Container();
    tmp.addChild(sl);
    const sg = new PIXI.Graphics();
    tmp.addChild(sg);
    const gt = (c, r) => this.mapData.getTile(c, r);
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (!tile) continue;
        // Skip void tiles — no terrain rendering
        if (tile.terrain === 'void') continue;
        const pos = hr.offsetToPixel(col, row, tile.elevation);
        const tt = this.terrainConfig?.terrainTypes?.[tile.terrain];
        const sp = this.assetLoader.resolveTerrainSprite(tt, tile.elevation, col, row);
        const ct = hr.getCachedTexture(sp, tile.elevation);
        if (ct) {
          const s = new PIXI.Sprite(ct);
          s.anchor.set(0.5);
          s.x = pos.x;
          s.y = pos.y;
          sl.addChild(s);
          cg.lineStyle(0.5, 0x1a1a2e, 0.2);
          cg.beginFill(0, 0);
          cg.drawPolygon(hr.hexPoints(pos.x, pos.y, this.hexSize));
          cg.endFill();
        } else {
          const base = AssetLoader.getTerrainColor(tile.terrain);
          const color = hr.elevColor(base, tile.elevation);
          hr.drawHexColor(cg, pos.x, pos.y, color);
        }
        const nbs = HexRenderer.offsetNeighbors(col, row);
        hr.drawElevationShadow(sg, pos.x, pos.y, tile.elevation, nbs, gt);
      }
    }
    const mw = hr.padX * 2 + SQRT3 * this.hexSize * this.mapWidth;
    const mh = hr.padY * 2 + 1.5 * this.hexSize * this.mapHeight;
    // Clamp resolution so texture doesn't exceed GPU max texture size (mobile often 4096)
    const gl = this.app.renderer.gl;
    const maxTexSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
    let res = 2;
    while (res > 1 && (mw * res > maxTexSize || mh * res > maxTexSize)) {
      res -= 0.5;
    }
    const rt = PIXI.RenderTexture.create({ width: mw, height: mh, resolution: res });
    this.app.renderer.render(tmp, { renderTexture: rt });
    tmp.destroy({ children: true });
    this._bakedTerrainTexture = rt;
    this.layers.terrain.addChild(new PIXI.Sprite(rt));
  }
  /** @type {Map<string, PIXI.Texture>} Pre-rendered emoji textures */
  _emojiCache = new Map();

  /**
   * Get or create a cached texture for an emoji string at a given font size.
   * Much faster than creating PIXI.Text per tile.
   */
  _getEmojiTexture(emoji, fontSize) {
    const key = `${emoji}_${fontSize}`;
    if (this._emojiCache.has(key)) return this._emojiCache.get(key);
    const t = new PIXI.Text(emoji, { fontSize });
    const tex = this.app.renderer.generateTexture(t, { resolution: 2 });
    t.destroy();
    this._emojiCache.set(key, tex);
    return tex;
  }

  _renderMarkers() {
    this.layers.clearLayer('building');
    this.layers.clearLayer('entities');
    if (!this.mapData) return;
    const hr = this.hexRenderer;
    const markerSize = this.hexSize * 1.6;
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (!tile) continue;
        const vis = (this.fogEnabled && this.getFogState) ? this.getFogState(col, row) : 'visible';
        if (vis === 'unexplored') continue;
        const pos = hr.offsetToPixel(col, row, tile.elevation);
        if (tile.building) {
          const isExplored = vis === 'explored';
          // Try building sprite from config, fall back to emoji
          const bDef = this.buildingConfig?.buildingTypes?.[tile.building];
          // Teleporter: use variant sprite based on pair index
          let bSpritePath = bDef?.sprite;
          if (tile.building === 'teleporter' && bDef?.spriteVariants && tile.teleporterPairIndex != null) {
            const idx = tile.teleporterPairIndex % bDef.spriteVariants.length;
            bSpritePath = bDef.spriteVariants[idx];
          }
          const bTex = bSpritePath ? this.assetLoader.getTexture(bSpritePath) : null;
          if (bTex) {
            const s = new PIXI.Sprite(bTex);
            s.anchor.set(0.5);
            s.width = markerSize;
            s.height = markerSize;
            s.x = pos.x;
            s.y = pos.y - 2;
            if (isExplored) s.alpha = 0.6;
            this.layers.building.addChild(s);
          } else {
            const emoji = AssetLoader.getBuildingEmoji(tile.building);
            const tex = this._getEmojiTexture(emoji, this.hexSize * 0.7);
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.x = pos.x;
            s.y = pos.y - 2;
            if (isExplored) s.alpha = 0.6;
            this.layers.building.addChild(s);
          }
        }
        if (tile.event && !tile.building && vis === 'visible') {
          // Determine marker type based on event config
          let markerType = 'event';
          if (typeof tile.event === 'string') {
            if (tile.event.startsWith('item_pickup_')) {
              markerType = 'treasure';
            } else {
              // Look up event definition from eventConfig
              const evtDef = this.eventConfig?.events?.[tile.event];
              if (evtDef) {
                // Mimic: show as treasure (disguise!)
                if (tile.event === 'mimic') markerType = 'treasure';
                else if (evtDef.type === 'combat') markerType = 'monster';
                else if (evtDef.type === 'treasure') markerType = 'treasure';
              }
            }
          }
          const mPath = AssetLoader.getMarkerPath(markerType);
          const mTex = mPath ? this.assetLoader.getTexture(mPath) : null;
          const isWater = tile.terrain === 'water' || tile.terrain === 'ice';
          const markerYOff = isWater ? -this.hexSize * 0.05 : this.hexSize * 0.3;
          if (mTex) {
            const s = new PIXI.Sprite(mTex);
            s.anchor.set(0.5);
            s.width = markerSize * 0.7;
            s.height = markerSize * 0.7;
            s.x = pos.x;
            s.y = pos.y + markerYOff;
            this.layers.entities.addChild(s);
          } else {
            let emoji = '❓';
            if (markerType === 'treasure') emoji = '📦';
            else if (markerType === 'monster') emoji = '⚔️';
            const tex = this._getEmojiTexture(emoji, this.hexSize * 0.5);
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.x = pos.x;
            s.y = pos.y + markerYOff;
            this.layers.entities.addChild(s);
          }
        }
      }
    }
    this._renderPlayerMarker();
    if (this._selectedTile) this._renderSelectionHighlight();
  }
  _renderPlayerMarker() {
    const tile = this.mapData?.getTile(this.playerPos.col, this.playerPos.row);
    if (!tile) return;
    const pos = this.hexRenderer.offsetToPixel(this.playerPos.col, this.playerPos.row, tile.elevation);
    const pPath = AssetLoader.getMarkerPath('player');
    const pTex = pPath ? this.assetLoader.getTexture(pPath) : null;
    if (pTex) {
      const m = new PIXI.Sprite(pTex);
      m.anchor.set(0.5);
      m.width = this.hexSize * 1.4;
      m.height = this.hexSize * 1.4;
      // Flip horizontally based on facing direction
      m.scale.x = Math.abs(m.scale.x) * this._playerFacing;
      m.x = pos.x;
      m.y = pos.y;
      this._playerMarker = m;
      this.layers.entities.addChild(m);
    } else {
      const tex = this._getEmojiTexture('🧑', this.hexSize * 1.1);
      const m = new PIXI.Sprite(tex);
      m.anchor.set(0.5);
      m.x = pos.x;
      m.y = pos.y;
      this._playerMarker = m;
      this.layers.entities.addChild(m);
    }
  }
  _renderSelectionHighlight() {
    const { col, row } = this._selectedTile;
    const tile = this.mapData?.getTile(col, row);
    if (!tile) return;
    const pos = this.hexRenderer.offsetToPixel(col, row, tile.elevation);
    const g = new PIXI.Graphics();
    this.hexRenderer.drawHighlight(g, pos.x, pos.y);
    this.layers.entities.addChild(g);
  }
  _renderFogLayer() {
    this.layers.clearLayer('fog');
    if (!this.fogEnabled || !this.getFogState || !this.mapData) return;
    const hr = this.hexRenderer;

    // Collect explored building tile positions
    const exploredBuildingKeys = new Set();
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (tile && tile.building && this.getFogState(col, row) === 'explored') {
          exploredBuildingKeys.add(`${col},${row}`);
        }
      }
    }

    // Draw fog, skipping explored building tiles
    const fg = new PIXI.Graphics();
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (!tile) continue;
        const vis = this.getFogState(col, row);
        if (vis === 'visible') continue;
        if (exploredBuildingKeys.has(`${col},${row}`)) continue;
        const pos = hr.offsetToPixel(col, row, tile.elevation);
        hr.drawFogHex(fg, pos.x, pos.y, vis);
      }
    }
    this.layers.fog.addChild(fg);

    // Draw building icons on top of fog for explored building tiles
    const markerSize = this.hexSize * 1.6;
    for (const key of exploredBuildingKeys) {
      const [col, row] = key.split(',').map(Number);
      const tile = this.mapData.getTile(col, row);
      if (!tile) continue;
      const pos = hr.offsetToPixel(col, row, tile.elevation);
      const bDef = this.buildingConfig?.buildingTypes?.[tile.building];
      let bSpritePath = bDef?.sprite;
      if (tile.building === 'teleporter' && bDef?.spriteVariants && tile.teleporterPairIndex != null) {
        bSpritePath = bDef.spriteVariants[tile.teleporterPairIndex % bDef.spriteVariants.length];
      }
      const bTex = bSpritePath ? this.assetLoader.getTexture(bSpritePath) : null;
      if (bTex) {
        const s = new PIXI.Sprite(bTex);
        s.anchor.set(0.5);
        s.width = markerSize;
        s.height = markerSize;
        s.x = pos.x;
        s.y = pos.y - 2;
        s.alpha = 0.65;
        this.layers.fog.addChild(s);
      } else {
        const emoji = AssetLoader.getBuildingEmoji(tile.building);
        const tex = this._getEmojiTexture(emoji, this.hexSize * 0.7);
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5);
        s.x = pos.x;
        s.y = pos.y - 2;
        s.alpha = 0.65;
        this.layers.fog.addChild(s);
      }
    }
  }
  updatePlayerPosition(col, row) {
    // Determine facing direction based on movement
    const prevCol = this.playerPos.col;
    const prevRow = this.playerPos.row;
    if (col !== prevCol || row !== prevRow) {
      // Use pixel positions to determine left/right
      const prevPos = this.hexRenderer.offsetToPixel(prevCol, prevRow, 5);
      const newPos = this.hexRenderer.offsetToPixel(col, row, 5);
      if (newPos.x > prevPos.x) this._playerFacing = 1;   // moving right
      else if (newPos.x < prevPos.x) this._playerFacing = -1; // moving left
      // If same x (pure vertical), keep current facing
    }
    this.playerPos = { col, row };
    this._renderMarkers();
    this._renderFogLayer();
  }
  updateFogLayer() {
    this._renderMarkers();
    this._renderFogLayer();
  }
  highlightTile(col, row) {
    this._selectedTile = { col, row };
    this._renderMarkers();
    this._renderFogLayer();
  }
  clearHighlight() {
    this._selectedTile = null;
    this._renderMarkers();
    this._renderFogLayer();
  }
  showTileInfo(col, row) {
    const tile = this.mapData?.getTile(col, row);
    if (!tile) return null;
    return { col, row, terrain: tile.terrain, elevation: tile.elevation, building: tile.building || null, event: tile.event || null };
  }
  async centerOnTile(col, row, duration = 300) {
    const tile = this.mapData?.getTile(col, row);
    const pos = this.hexRenderer.offsetToPixel(col, row, tile?.elevation);
    await this.camera.panTo(pos.x, pos.y, duration);
  }
  centerOnTileInstant(col, row) {
    const tile = this.mapData?.getTile(col, row);
    const pos = this.hexRenderer.offsetToPixel(col, row, tile?.elevation);
    this.camera.centerOn(pos.x, pos.y);
  }
  screenToTile(screenX, screenY) {
    const world = this.camera.screenToWorld(screenX, screenY);
    return this.hexRenderer.pixelToOffset(world.x, world.y);
  }
  toggleFog(enabled) {
    this.fogEnabled = enabled;
    this._renderMarkers();
    this._renderFogLayer();
  }

  /**
   * Render path highlight on the decoration layer.
   * @param {Array<{q:number, r:number}>} path - path nodes (excluding start)
   * @param {number[]} stepCosts - AP cost per step
   * @param {number} currentAP - player's current AP
   */
  renderPath(path, stepCosts, currentAP) {
    this.clearPath();
    if (!path || path.length === 0 || !this.mapData) return;

    const g = new PIXI.Graphics();
    const hr = this.hexRenderer;
    let apLeft = currentAP;

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const tile = this.mapData.getTile(node.q, node.r);
      if (!tile) continue;
      const pos = hr.offsetToPixel(node.q, node.r, tile.elevation);
      const cost = stepCosts[i] ?? 0;
      const isLast = i === path.length - 1;

      if (apLeft >= cost) {
        // Reachable this turn — brighter cyan fill
        g.beginFill(0x00bcd4, 0.4);
        g.lineStyle(isLast ? 2 : 0, 0x00bcd4, isLast ? 0.9 : 0);
        g.drawPolygon(hr.hexPoints(pos.x, pos.y, this.hexSize));
        g.endFill();
        apLeft -= cost;
      } else {
        // Beyond current AP — dimmer
        g.beginFill(0x00bcd4, 0.15);
        g.lineStyle(isLast ? 2 : 0, 0x00bcd4, isLast ? 0.6 : 0);
        g.drawPolygon(hr.hexPoints(pos.x, pos.y, this.hexSize));
        g.endFill();
      }
    }

    this._pathGraphics = g;
    this.layers.decoration.addChild(g);
  }

  /** Clear path highlight */
  clearPath() {
    if (this._pathGraphics) {
      this._pathGraphics.destroy();
      this._pathGraphics = null;
    }
  }
  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this.layers.destroy();
    this.hexRenderer.clearCache();
    this.assetLoader.clear();
    for (const tex of this._emojiCache.values()) tex.destroy(true);
    this._emojiCache.clear();
    if (this._bakedTerrainTexture) this._bakedTerrainTexture.destroy(true);
    this.worldContainer.destroy({ children: true });
  }
}
