/**
 * HexRenderer — 六边形绘制工具
 * Pointy-top hex drawing, sprite clipping, variant selection,
 * elevation shadow edges, elevation Y-offset for 2.5D effect.
 *
 * Coordinate system: even-r offset (col, row) matching map-preview.html.
 * Hex size default = 18.
 */

const SQRT3 = Math.sqrt(3);

export class HexRenderer {
  /**
   * @param {PIXI.Application} app - PixiJS application (needed for generateTexture)
   * @param {number} [hexSize=18]
   */
  constructor(app, hexSize = 18) {
    this.app = app;
    this.hexSize = hexSize;

    // Padding so row=0/col=0 hex centers are fully inside the render area
    this.padX = SQRT3 * hexSize;
    this.padY = hexSize * 1.5;

    /** @type {Map<string, PIXI.Texture>} hex-clipped texture cache */
    this._clippedCache = new Map();
  }

  // ── coordinate conversion ───────────────────────────────────

  /**
   * Offset (col, row) → pixel position (pointy-top, even-r).
   * Includes elevation Y-offset for 2.5D effect.
   * @param {number} col
   * @param {number} row
   * @param {number} [elevation=5] - tile elevation (higher = shift up)
   * @returns {{ x: number, y: number }}
   */
  offsetToPixel(col, row, elevation = 5) {
    const size = this.hexSize;
    const w = SQRT3 * size;
    const h = 2 * size;
    const x = this.padX + col * w + (row % 2 === 1 ? w / 2 : 0);
    const baseY = this.padY + row * h * 0.75;
    const elevOffset = -(elevation - 5) * 2;
    return { x, y: baseY + elevOffset };
  }

  /**
   * Pixel → offset (col, row). Uses base Y without elevation offset
   * so click detection works regardless of elevation rendering.
   */
  pixelToOffset(px, py) {
    const size = this.hexSize;
    const w = SQRT3 * size;
    const h = 2 * size;
    const approxRow = Math.round((py - this.padY) / (h * 0.75));
    let bestDist = Infinity, bestCol = 0, bestRow = 0;
    for (let dr = -1; dr <= 1; dr++) {
      const row = approxRow + dr;
      const xOffset = (row % 2 === 1) ? w / 2 : 0;
      const col = Math.round((px - this.padX - xOffset) / w);
      const hx = this.padX + col * w + xOffset;
      const hy = this.padY + row * h * 0.75;
      const dist = (px - hx) ** 2 + (py - hy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
        bestRow = row;
      }
    }
    return { col: bestCol, row: bestRow };
  }

  // ── hex geometry ────────────────────────────────────────────

  /**
   * Generate pointy-top hex vertex positions centered at (cx, cy).
   * @returns {number[]} flat array [x0,y0, x1,y1, ...]
   */
  hexPoints(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
    }
    return pts;
  }

  // ── color helpers ───────────────────────────────────────────

  /**
   * Tint a base color by elevation (darker at low, brighter at high).
   */
  elevColor(baseColor, elevation) {
    const factor = 0.5 + (elevation / 10) * 0.6;
    const r = Math.min(255, ((baseColor >> 16) & 0xff) * factor) | 0;
    const g = Math.min(255, ((baseColor >> 8) & 0xff) * factor) | 0;
    const b = Math.min(255, (baseColor & 0xff) * factor) | 0;
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Compute a white-channel tint value for sprite brightness by elevation.
   */
  elevTint(elevation) {
    const factor = 0.55 + (elevation / 10) * 0.5;
    const v = Math.min(255, (factor * 255) | 0);
    return (v << 16) | (v << 8) | v;
  }

  // ── hex-clipped sprite textures ─────────────────────────────

  /**
   * Create a hex-clipped RenderTexture from a source texture.
   * Cached by cacheKey so each terrain+elevation combo is only generated once.
   *
   * @param {PIXI.Texture} sourceTexture
   * @param {number} tint - 0xRRGGBB tint applied to sprite
   * @param {string} cacheKey
   * @returns {PIXI.Texture}
   */
  getClippedTexture(sourceTexture, tint, cacheKey) {
    if (this._clippedCache.has(cacheKey)) {
      return this._clippedCache.get(cacheKey);
    }

    const size = this.hexSize;
    const container = new PIXI.Container();

    // Hex mask
    const maskG = new PIXI.Graphics();
    maskG.beginFill(0xffffff);
    maskG.drawPolygon(this.hexPoints(size, size, size));
    maskG.endFill();
    container.addChild(maskG);

    // Sprite
    const sprite = new PIXI.Sprite(sourceTexture);
    sprite.anchor.set(0.5);
    sprite.x = size;
    sprite.y = size;
    sprite.width = size * 2;
    sprite.height = size * 2;
    if (tint !== undefined) sprite.tint = tint;
    sprite.mask = maskG;
    container.addChild(sprite);

    const tex = this.app.renderer.generateTexture(container, {
      resolution: 2,
      region: new PIXI.Rectangle(0, 0, size * 2, size * 2),
    });
    container.destroy({ children: true });

    this._clippedCache.set(cacheKey, tex);
    return tex;
  }

  /**
   * Build the full hex-clipped texture cache for all terrain sprites.
   * Call once after AssetLoader.preload() completes.
   *
   * @param {object} terrainConfig - parsed terrain.json
   * @param {import('./AssetLoader.js').AssetLoader} assetLoader
   */
  buildTextureCache(terrainConfig, assetLoader) {
    if (!terrainConfig?.terrainTypes) return;

    for (const [terrainKey, tc] of Object.entries(terrainConfig.terrainTypes)) {
      const sprites = tc.sprites;
      if (!sprites) continue;

      // Collect all variant paths for this terrain
      const allPaths = new Set();
      if (sprites.variants) sprites.variants.forEach(p => allPaths.add(p));
      if (sprites.default) allPaths.add(sprites.default);
      if (sprites.highElevation?.variants) {
        sprites.highElevation.variants.forEach(p => allPaths.add(p));
      }

      for (const path of allPaths) {
        const tex = assetLoader.getTexture(path);
        if (!tex) continue;
        // Pre-generate for each elevation level 0-10
        for (let elev = 0; elev <= 10; elev++) {
          const tint = this.elevTint(elev);
          const key = `${path}_e${elev}`;
          this.getClippedTexture(tex, tint, key);
        }
      }
    }
  }

  /**
   * Get a cached hex-clipped texture for a resolved sprite path + elevation.
   * @returns {PIXI.Texture|null}
   */
  getCachedTexture(spritePath, elevation) {
    if (!spritePath) return null;
    const key = `${spritePath}_e${elevation}`;
    return this._clippedCache.get(key) ?? null;
  }

  // ── drawing primitives ──────────────────────────────────────

  /**
   * Draw a single hex tile onto a Graphics object (color fallback).
   * @param {PIXI.Graphics} g
   * @param {number} cx - pixel center x
   * @param {number} cy - pixel center y
   * @param {number} color - 0xRRGGBB fill
   */
  drawHexColor(g, cx, cy, color) {
    g.beginFill(color);
    g.lineStyle(0.5, 0x1a1a2e, 0.3);
    g.drawPolygon(this.hexPoints(cx, cy, this.hexSize));
    g.endFill();
  }

  /**
   * Draw elevation shadow edges on hex borders where this tile is higher
   * than its neighbor.
   *
   * @param {PIXI.Graphics} shadowG - graphics layer for shadows
   * @param {number} cx - pixel center x
   * @param {number} cy - pixel center y
   * @param {number} tileElevation
   * @param {Array<{col:number,row:number}>} neighbors - 6 neighbor coords
   * @param {function} getTile - (col,row) => tileData|null
   */
  drawElevationShadow(shadowG, cx, cy, tileElevation, neighbors, getTile) {
    const size = this.hexSize;
    for (let dir = 0; dir < 6; dir++) {
      const nb = neighbors[dir];
      const nbTile = getTile(nb.col, nb.row);
      if (!nbTile) continue;
      const elevDiff = tileElevation - nbTile.elevation;
      if (elevDiff > 0) {
        const alpha = Math.min(0.6, elevDiff * 0.12);
        const thickness = Math.min(2.5, elevDiff * 0.5);
        shadowG.lineStyle(thickness, 0x000000, alpha);
        const a1 = (Math.PI / 180) * (60 * dir - 30);
        const a2 = (Math.PI / 180) * (60 * (dir + 1) - 30);
        shadowG.moveTo(cx + size * Math.cos(a1), cy + size * Math.sin(a1));
        shadowG.lineTo(cx + size * Math.cos(a2), cy + size * Math.sin(a2));
      }
    }
  }

  /**
   * Draw a fog hex (slightly larger than normal hex).
   * @param {PIXI.Graphics} fogG
   * @param {number} cx
   * @param {number} cy
   * @param {'unexplored'|'explored'} state
   */
  drawFogHex(fogG, cx, cy, state) {
    const fogSize = this.hexSize + 1;
    const alpha = state === 'unexplored' ? 1.0 : 0.5;
    fogG.beginFill(0x0f0f23, alpha);
    fogG.lineStyle(0);
    fogG.drawPolygon(this.hexPoints(cx, cy, fogSize));
    fogG.endFill();
  }

  /**
   * Draw a highlight ring around a hex.
   * @param {PIXI.Graphics} g
   * @param {number} cx
   * @param {number} cy
   * @param {number} [color=0xffeb3b]
   * @param {number} [alpha=0.8]
   */
  drawHighlight(g, cx, cy, color = 0xffeb3b, alpha = 0.8) {
    g.lineStyle(2, color, alpha);
    g.drawPolygon(this.hexPoints(cx, cy, this.hexSize));
  }

  // ── offset neighbor helper ──────────────────────────────────

  /**
   * Get 6 neighbors in even-r offset coordinates.
   * Matches map-preview.html offsetNeighbors().
   */
  static offsetNeighbors(col, row) {
    if (row % 2 === 1) {
      return [
        { col: col + 1, row },
        { col, row: row - 1 },
        { col: col + 1, row: row - 1 },
        { col: col - 1, row },
        { col, row: row + 1 },
        { col: col + 1, row: row + 1 },
      ];
    }
    return [
      { col: col + 1, row },
      { col: col - 1, row: row - 1 },
      { col, row: row - 1 },
      { col: col - 1, row },
      { col: col - 1, row: row + 1 },
      { col, row: row + 1 },
    ];
  }

  // ── cleanup ─────────────────────────────────────────────────

  /** Destroy all cached clipped textures */
  clearCache() {
    for (const tex of this._clippedCache.values()) {
      tex.destroy(true);
    }
    this._clippedCache.clear();
  }
}
