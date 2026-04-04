/**
 * EditorState 单元测试
 */
import { describe, it, expect } from '../test-runner.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EditorState } from '../../src/editor/EditorState.js';

describe('EditorState', () => {
  it('default values are correct', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    expect(state.currentTool).toBe('terrain');
    expect(state.brushSize).toBe(1);
    expect(state.selectedTerrain).toBe('grass');
    expect(state.selectedBuilding).toBeNull();
    expect(state.selectedEvent).toBeNull();
    expect(state.elevationValue).toBe(5);
    expect(state.gridVisible).toBeTrue();
    expect(state.previewMode).toBeFalse();
    expect(state.mapMeta).toEqual({ name: '', author: '', description: '' });
  });

  it('setTool updates currentTool and emits event', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:tool-changed', (data) => { received = data; });
    state.setTool('building');
    expect(state.currentTool).toBe('building');
    expect(received).toEqual({ tool: 'building' });
  });

  it('setBrushSize updates brushSize and emits event', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:brush-changed', (data) => { received = data; });
    state.setBrushSize(3);
    expect(state.brushSize).toBe(3);
    expect(received).toEqual({ size: 3 });
  });

  it('setSelectedTerrain updates and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:terrain-changed', (data) => { received = data; });
    state.setSelectedTerrain('water');
    expect(state.selectedTerrain).toBe('water');
    expect(received).toEqual({ terrain: 'water' });
  });

  it('setSelectedBuilding updates and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:building-changed', (data) => { received = data; });
    state.setSelectedBuilding('portal');
    expect(state.selectedBuilding).toBe('portal');
    expect(received).toEqual({ building: 'portal' });
  });

  it('setSelectedEvent updates and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:event-changed', (data) => { received = data; });
    state.setSelectedEvent('combat_wolf');
    expect(state.selectedEvent).toBe('combat_wolf');
    expect(received).toEqual({ event: 'combat_wolf' });
  });

  it('setElevationValue updates and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:elevation-changed', (data) => { received = data; });
    state.setElevationValue(8);
    expect(state.elevationValue).toBe(8);
    expect(received).toEqual({ value: 8 });
  });

  it('setElevationValue clamps to 0-10', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    state.setElevationValue(-5);
    expect(state.elevationValue).toBe(0);
    state.setElevationValue(99);
    expect(state.elevationValue).toBe(10);
  });

  it('setElevationValue emits clamped value', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:elevation-changed', (data) => { received = data; });
    state.setElevationValue(15);
    expect(received).toEqual({ value: 10 });
  });

  it('toggleGrid flips gridVisible and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:grid-toggled', (data) => { received = data; });
    expect(state.gridVisible).toBeTrue();
    state.toggleGrid();
    expect(state.gridVisible).toBeFalse();
    expect(received).toEqual({ visible: false });
    state.toggleGrid();
    expect(state.gridVisible).toBeTrue();
    expect(received).toEqual({ visible: true });
  });

  it('togglePreview flips previewMode and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:preview-toggled', (data) => { received = data; });
    expect(state.previewMode).toBeFalse();
    state.togglePreview();
    expect(state.previewMode).toBeTrue();
    expect(received).toEqual({ active: true });
    state.togglePreview();
    expect(state.previewMode).toBeFalse();
    expect(received).toEqual({ active: false });
  });

  it('setMapMeta merges and emits', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    let received = null;
    bus.on('editor:meta-changed', (data) => { received = data; });
    state.setMapMeta({ name: 'Test Map' });
    expect(state.mapMeta).toEqual({ name: 'Test Map', author: '', description: '' });
    expect(received).toEqual({ meta: { name: 'Test Map', author: '', description: '' } });
  });

  it('setMapMeta partial update preserves other fields', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    state.setMapMeta({ name: 'Map1', author: 'Alice' });
    state.setMapMeta({ description: 'A cool map' });
    expect(state.mapMeta).toEqual({ name: 'Map1', author: 'Alice', description: 'A cool map' });
  });

  it('multiple tool switches emit correct events', () => {
    const bus = new EventBus();
    const state = new EditorState(bus);
    const tools = [];
    bus.on('editor:tool-changed', (data) => { tools.push(data.tool); });
    state.setTool('eraser');
    state.setTool('fill');
    state.setTool('relic');
    expect(tools).toEqual(['eraser', 'fill', 'relic']);
    expect(state.currentTool).toBe('relic');
  });
});
