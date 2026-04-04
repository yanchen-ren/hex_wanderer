/**
 * EditorState — 编辑器状态管理
 * 管理当前工具、笔刷大小、选中项等编辑器全局状态。
 * 所有 setter 通过 EventBus 发布变更事件，实现 UI 与逻辑解耦。
 */
export class EditorState {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(eventBus) {
    this.eventBus = eventBus;

    /** @type {'terrain'|'elevation_up'|'elevation_down'|'elevation_set'|'building'|'event'|'eraser'|'fill'} */
    this.currentTool = 'terrain';

    /** @type {1|2|3} */
    this.brushSize = 1;

    /** @type {string} */
    this.selectedTerrain = 'grass';

    /** @type {string|null} */
    this.selectedBuilding = null;

    /** @type {string|null} */
    this.selectedEvent = null;

    /** @type {number} 0-10 */
    this.elevationValue = 5;

    /** @type {boolean} */
    this.gridVisible = true;

    /** @type {boolean} reserved for future use */
    this.previewMode = false;

    /** @type {{ name: string, author: string, description: string }} */
    this.mapMeta = { name: '', author: '', description: '' };

    /** @type {{ enabled: boolean, treasureDensity: number, eventDensity: number }} */
    this.eventConfig = { enabled: true, treasureDensity: 0.20, eventDensity: 0.35 };

    /** @type {{ q: number, r: number }|null} Player spawn position (null = map center) */
    this.spawnPosition = null;
  }

  /**
   * Switch the active tool.
   * @param {'terrain'|'elevation_up'|'elevation_down'|'elevation_set'|'building'|'event'|'eraser'|'fill'} tool
   */
  setTool(tool) {
    this.currentTool = tool;
    this.eventBus.emit('editor:tool-changed', { tool });
  }

  /**
   * Set brush size.
   * @param {1|2|3} size
   */
  setBrushSize(size) {
    this.brushSize = size;
    this.eventBus.emit('editor:brush-changed', { size });
  }

  /**
   * Set the selected terrain type.
   * @param {string} terrain
   */
  setSelectedTerrain(terrain) {
    this.selectedTerrain = terrain;
    this.eventBus.emit('editor:terrain-changed', { terrain });
  }

  /**
   * Set the selected building type.
   * @param {string|null} building
   */
  setSelectedBuilding(building) {
    this.selectedBuilding = building;
    this.eventBus.emit('editor:building-changed', { building });
  }

  /**
   * Set the selected event type.
   * @param {string|null} event
   */
  setSelectedEvent(event) {
    this.selectedEvent = event;
    this.eventBus.emit('editor:event-changed', { event });
  }

  /**
   * Set the elevation value (clamped to 0-10).
   * @param {number} value
   */
  setElevationValue(value) {
    this.elevationValue = Math.max(0, Math.min(10, value));
    this.eventBus.emit('editor:elevation-changed', { value: this.elevationValue });
  }

  /**
   * Toggle grid visibility.
   */
  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this.eventBus.emit('editor:grid-toggled', { visible: this.gridVisible });
  }

  /**
   * Toggle preview mode (reserved for future use).
   */
  togglePreview() {
    this.previewMode = !this.previewMode;
    this.eventBus.emit('editor:preview-toggled', { active: this.previewMode });
  }

  /**
   * Update map metadata.
   * @param {{ name?: string, author?: string, description?: string }} meta
   */
  setMapMeta(meta) {
    this.mapMeta = { ...this.mapMeta, ...meta };
    this.eventBus.emit('editor:meta-changed', { meta: this.mapMeta });
  }

  /**
   * Update event generation config.
   * @param {{ enabled?: boolean, treasureDensity?: number, eventDensity?: number }} config
   */
  setEventConfig(config) {
    this.eventConfig = { ...this.eventConfig, ...config };
    this.eventBus.emit('editor:event-config-changed', { config: this.eventConfig });
  }

  /**
   * Set the player spawn position.
   * @param {number} q
   * @param {number} r
   */
  setSpawnPosition(q, r) {
    this.spawnPosition = { q, r };
    this.eventBus.emit('editor:spawn-changed', { q, r });
  }
}
