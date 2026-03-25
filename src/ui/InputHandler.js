/**
 * InputHandler — 输入事件处理
 * 鼠标 + 触屏统一处理，发布事件到 EventBus
 *
 * Click detection uses RenderEngine.screenToTile for coordinate conversion.
 * Drag/zoom is handled by Camera.bindInput — InputHandler only needs to
 * distinguish click vs drag via Camera.didDrag.
 */
export class InputHandler {
  /**
   * @param {import('../render/RenderEngine.js').RenderEngine} renderEngine
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(renderEngine, eventBus) {
    this.renderEngine = renderEngine;
    this.eventBus = eventBus;
    this._bound = false;
  }

  /**
   * Bind click listener to the PixiJS canvas.
   * Camera.bindInput already handles drag and zoom — we only emit hex:click
   * when the pointer-up was NOT a drag.
   */
  init() {
    if (this._bound) return;
    this._bound = true;

    const canvas = this.renderEngine.app.view;

    canvas.addEventListener('pointerup', (e) => {
      // If the camera detected a drag, skip the click
      if (this.renderEngine.camera.didDrag) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const tile = this.renderEngine.screenToTile(screenX, screenY);
      if (tile) {
        this.eventBus.emit('hex:click', { col: tile.col, row: tile.row });
      }
    });
  }

  /**
   * Clean up (currently a no-op since we don't store the handler ref,
   * but provided for interface completeness).
   */
  destroy() {
    this._bound = false;
  }
}
