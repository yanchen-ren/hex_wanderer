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
    this.mapData = null;
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.playerPos = { col: 0, row: 0 };
    this._playerMarker = null;
    this._selectedTile = null;
    this.getFogState = null;
    this.fogEnabled = true;
    this._bakedTerrainTexture = null;
  }
  async init(tc, bc, onProgress) {
    this.terrainConfig = tc;
    this.buildingConfig = bc;
    const paths = AssetLoader.collectAssetPaths(tc, bc);
    await this.assetLoader.preload(paths, onProgress);
    this.hexRenderer.buildTextureCache(tc, this.assetLoader);
    this.camera.bindInput(this.app.view);
    window.addEventListener('resize', () => {
      this.camera.resize(this.app.view.width, this.app.view.height);
    });
    this.app.ticker.add(() => this.camera.applyTo(this.worldContainer));
  }
  setMap(md) {
    this.mapData = md;
    const s = md.getSize();
    this.mapWidth = s.width;
    this.mapHeight = s.height;
    this.renderFullMap();
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
    const rt = PIXI.RenderTexture.create({ width: mw, height: mh, resolution: 2 });
    this.app.renderer.render(tmp, { renderTexture: rt });
    tmp.destroy({ children: true });
    this._bakedTerrainTexture = rt;
    this.layers.terrain.addChild(new PIXI.Sprite(rt));
  }
  _renderMarkers() {
    this.layers.clearLayer('building');
    this.layers.clearLayer('entities');
    if (!this.mapData) return;
    const hr = this.hexRenderer;
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (!tile) continue;
        if (this.fogEnabled && this.getFogState) {
          if (this.getFogState(col, row) !== 'visible') continue;
        }
        const pos = hr.offsetToPixel(col, row, tile.elevation);
        if (tile.building) {
          const emoji = AssetLoader.getBuildingEmoji(tile.building);
          const t = new PIXI.Text(emoji, { fontSize: this.hexSize * 0.7 });
          t.anchor.set(0.5);
          t.x = pos.x;
          t.y = pos.y - 2;
          this.layers.building.addChild(t);
        }
        if (tile.event) {
          let emoji = '❓';
          if (typeof tile.event === 'string' && tile.event.startsWith('item_pickup_')) emoji = '🎁';
          const t = new PIXI.Text(emoji, { fontSize: this.hexSize * 0.5 });
          t.anchor.set(0.5);
          t.x = pos.x;
          t.y = pos.y + this.hexSize * 0.3;
          this.layers.entities.addChild(t);
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
    const m = new PIXI.Text('🧑', { fontSize: this.hexSize * 1.1 });
    m.anchor.set(0.5);
    m.x = pos.x;
    m.y = pos.y;
    this._playerMarker = m;
    this.layers.entities.addChild(m);
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
    const fg = new PIXI.Graphics();
    const hr = this.hexRenderer;
    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const tile = this.mapData.getTile(col, row);
        if (!tile) continue;
        const vis = this.getFogState(col, row);
        if (vis === 'visible') continue;
        const pos = hr.offsetToPixel(col, row, tile.elevation);
        hr.drawFogHex(fg, pos.x, pos.y, vis);
      }
    }
    this.layers.fog.addChild(fg);
  }
  updatePlayerPosition(col, row) {
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
  destroy() {
    this.layers.destroy();
    this.hexRenderer.clearCache();
    this.assetLoader.clear();
    if (this._bakedTerrainTexture) this._bakedTerrainTexture.destroy(true);
    this.worldContainer.destroy({ children: true });
  }
}
