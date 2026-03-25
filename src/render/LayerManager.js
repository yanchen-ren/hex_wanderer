/**
 * LayerManager — 五层渲染管理
 *
 * Layer 0: Terrain  — hex ground tiles (baked to RenderTexture for perf)
 * Layer 1: Decoration — terrain detail overlays
 * Layer 2: Building — building icons
 * Layer 3: Entities — player, monsters, event markers, selection highlight
 * Layer 4: Fog — war fog overlay (three states)
 *
 * All layers are PIXI.Containers added to a root container in order.
 * The root container is what the Camera transforms.
 */

export class LayerManager {
  /**
   * @param {PIXI.Container} root - the world container that Camera controls
   */
  constructor(root) {
    this.root = root;

    /** @type {PIXI.Container} L0 terrain */
    this.terrain = new PIXI.Container();
    this.terrain.label = 'L0_terrain';

    /** @type {PIXI.Container} L1 decoration */
    this.decoration = new PIXI.Container();
    this.decoration.label = 'L1_decoration';

    /** @type {PIXI.Container} L2 building */
    this.building = new PIXI.Container();
    this.building.label = 'L2_building';

    /** @type {PIXI.Container} L3 entities (player, events, highlight) */
    this.entities = new PIXI.Container();
    this.entities.label = 'L3_entities';

    /** @type {PIXI.Container} L4 fog */
    this.fog = new PIXI.Container();
    this.fog.label = 'L4_fog';

    // Add in render order (bottom → top)
    root.addChild(this.terrain);
    root.addChild(this.decoration);
    root.addChild(this.building);
    root.addChild(this.entities);
    root.addChild(this.fog);
  }

  /**
   * Get a layer by index (0-4) or name.
   * @param {number|string} id
   * @returns {PIXI.Container|null}
   */
  getLayer(id) {
    const byIndex = [this.terrain, this.decoration, this.building, this.entities, this.fog];
    if (typeof id === 'number') return byIndex[id] ?? null;
    const byName = {
      terrain: this.terrain,
      decoration: this.decoration,
      building: this.building,
      entities: this.entities,
      fog: this.fog,
    };
    return byName[id] ?? null;
  }

  /**
   * Clear all children from a specific layer.
   * @param {number|string} id
   */
  clearLayer(id) {
    const layer = this.getLayer(id);
    if (layer) layer.removeChildren();
  }

  /**
   * Clear all layers.
   */
  clearAll() {
    this.terrain.removeChildren();
    this.decoration.removeChildren();
    this.building.removeChildren();
    this.entities.removeChildren();
    this.fog.removeChildren();
  }

  /**
   * Destroy all layers and remove from root.
   */
  destroy() {
    this.clearAll();
    this.root.removeChild(this.terrain);
    this.root.removeChild(this.decoration);
    this.root.removeChild(this.building);
    this.root.removeChild(this.entities);
    this.root.removeChild(this.fog);
  }
}
