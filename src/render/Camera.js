/**
 * Camera — 视口/相机控制
 * pan / zoom / panTo (smooth) / getVisibleHexRange / screenToWorld
 * Pointer drag + wheel zoom + pinch zoom
 *
 * The Camera manipulates a PIXI.Container (the "world" container)
 * to achieve panning and zooming. All world-space transforms are
 * stored as simple x, y, scale values and applied to the container
 * each frame.
 */

const SQRT3 = Math.sqrt(3);

export class Camera {
  /**
   * @param {number} viewportWidth  - canvas / screen width in px
   * @param {number} viewportHeight - canvas / screen height in px
   */
  constructor(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    /** World-space offset (top-left corner in world coords mapped to screen 0,0) */
    this.x = 0;
    this.y = 0;
    this.scale = 1;

    this.minScale = 0.1;
    this.maxScale = 3;

    // Smooth pan animation state
    this._panAnim = null;
  }

  // ── viewport helpers ────────────────────────────────────────

  /** Update viewport dimensions (e.g. on resize) */
  resize(w, h) {
    this.viewportWidth = w;
    this.viewportHeight = h;
  }

  // ── pan / zoom ──────────────────────────────────────────────

  /**
   * Translate the camera by (dx, dy) in screen pixels.
   */
  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  /**
   * Zoom around a screen-space center point.
   * @param {number} factor - multiplier (>1 zoom in, <1 zoom out)
   * @param {number} centerX - screen x
   * @param {number} centerY - screen y
   */
  zoom(factor, centerX, centerY) {
    const oldScale = this.scale;
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, oldScale * factor));
    // Adjust position so the point under the cursor stays fixed
    this.x = centerX - (centerX - this.x) * (newScale / oldScale);
    this.y = centerY - (centerY - this.y) * (newScale / oldScale);
    this.scale = newScale;
  }

  /**
   * Smoothly pan so that world point (wx, wy) is centered on screen.
   * @param {number} wx - world x
   * @param {number} wy - world y
   * @param {number} [duration=300] - ms
   * @returns {Promise<void>}
   */
  panTo(wx, wy, duration = 300) {
    return new Promise((resolve) => {
      const targetX = this.viewportWidth / 2 - wx * this.scale;
      const targetY = this.viewportHeight / 2 - wy * this.scale;
      const startX = this.x;
      const startY = this.y;
      const startTime = performance.now();

      // Cancel any in-flight animation
      if (this._panAnim) cancelAnimationFrame(this._panAnim);

      const step = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        // ease-out quad
        const ease = 1 - (1 - t) * (1 - t);
        this.x = startX + (targetX - startX) * ease;
        this.y = startY + (targetY - startY) * ease;
        if (t < 1) {
          this._panAnim = requestAnimationFrame(step);
        } else {
          this._panAnim = null;
          resolve();
        }
      };
      this._panAnim = requestAnimationFrame(step);
    });
  }

  /**
   * Instantly center on a world point (no animation).
   */
  centerOn(wx, wy) {
    this.x = this.viewportWidth / 2 - wx * this.scale;
    this.y = this.viewportHeight / 2 - wy * this.scale;
  }

  // ── coordinate conversion ───────────────────────────────────

  /**
   * Convert screen coordinates to world coordinates.
   */
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.x) / this.scale,
      y: (screenY - this.y) / this.scale,
    };
  }

  /**
   * Convert world coordinates to screen coordinates.
   */
  worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.x,
      y: wy * this.scale + this.y,
    };
  }

  // ── visible hex range ───────────────────────────────────────

  /**
   * Get the range of offset-coordinate hex tiles visible in the current viewport.
   * Uses pointy-top even-r offset layout matching map-preview.html.
   *
   * @param {number} hexSize - hex radius in world pixels
   * @returns {{ minCol: number, maxCol: number, minRow: number, maxRow: number }}
   */
  getVisibleHexRange(hexSize) {
    const padX = SQRT3 * hexSize;
    const padY = hexSize * 1.5;
    const w = SQRT3 * hexSize;
    const h = 2 * hexSize;

    // World-space bounds of the viewport
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.viewportWidth, this.viewportHeight);

    // Add generous margin (2 tiles) to avoid pop-in
    const margin = 2;

    const minRow = Math.max(0, Math.floor((topLeft.y - padY) / (h * 0.75)) - margin);
    const maxRow = Math.ceil((bottomRight.y - padY) / (h * 0.75)) + margin;
    const minCol = Math.max(0, Math.floor((topLeft.x - padX - w / 2) / w) - margin);
    const maxCol = Math.ceil((bottomRight.x - padX) / w) + margin;

    return { minCol, maxCol, minRow, maxRow };
  }

  // ── apply to PIXI container ─────────────────────────────────

  /**
   * Apply camera transform to a PIXI.Container.
   * Call this every frame (or after pan/zoom changes).
   * @param {PIXI.Container} container
   */
  applyTo(container) {
    container.x = this.x;
    container.y = this.y;
    container.scale.set(this.scale);
  }

  // ── input binding helpers ───────────────────────────────────

  /**
   * Bind pointer-drag and wheel-zoom to a canvas element.
   * Also supports pinch-zoom on touch devices.
   * @param {HTMLCanvasElement} canvas
   */
  bindInput(canvas) {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    /** Track whether a real drag happened (vs a click) */
    this._didDrag = false;

    // ── Pointer drag ──
    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      this._didDrag = false;
      dragStartX = e.clientX - this.x;
      dragStartY = e.clientY - this.y;
    });

    const onMove = (e) => {
      if (!isDragging) return;
      const nx = e.clientX - dragStartX;
      const ny = e.clientY - dragStartY;
      if (Math.abs(nx - this.x) > 3 || Math.abs(ny - this.y) > 3) {
        this._didDrag = true;
      }
      this.x = nx;
      this.y = ny;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => { isDragging = false; });

    // ── Wheel zoom ──
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      this.zoom(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // ── Pinch zoom ──
    let lastPinchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const factor = dist / lastPinchDist;
          const rect = canvas.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          this.zoom(factor, cx, cy);
        }
        lastPinchDist = dist;
      }
    }, { passive: true });

    canvas.addEventListener('touchend', () => { lastPinchDist = 0; }, { passive: true });
  }

  /** Whether the last pointer interaction was a drag (not a click) */
  get didDrag() { return this._didDrag; }
}
