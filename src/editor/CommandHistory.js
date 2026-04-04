/**
 * CommandHistory — 撤销/重做命令栈
 * 基于命令模式，管理编辑操作的历史记录。
 * 每个 Command 对象需实现 execute() 和 undo() 方法（鸭子类型）。
 */
export class CommandHistory {
  /**
   * @param {number} [maxSize=50] - 撤销栈最大容量
   */
  constructor(maxSize = 50) {
    /** @type {Array<{execute: Function, undo: Function}>} */
    this._undoStack = [];
    /** @type {Array<{execute: Function, undo: Function}>} */
    this._redoStack = [];
    /** @type {number} */
    this._maxSize = maxSize;
  }

  /**
   * 执行命令并压入撤销栈，清空重做栈。
   * 如果撤销栈超过 maxSize，移除最旧的条目。
   * @param {{execute: Function, undo: Function}} command
   */
  execute(command) {
    command.execute();
    this._undoStack.push(command);
    if (this._undoStack.length > this._maxSize) {
      this._undoStack.shift();
    }
    this._redoStack.length = 0;
  }

  /**
   * 撤销最近一次操作。
   * @returns {{execute: Function, undo: Function}|null} 被撤销的命令，或 null
   */
  undo() {
    if (!this.canUndo()) return null;
    const command = this._undoStack.pop();
    command.undo();
    this._redoStack.push(command);
    return command;
  }

  /**
   * 重做最近一次被撤销的操作。
   * @returns {{execute: Function, undo: Function}|null} 被重做的命令，或 null
   */
  redo() {
    if (!this.canRedo()) return null;
    const command = this._redoStack.pop();
    command.execute();
    this._undoStack.push(command);
    return command;
  }

  /**
   * @returns {boolean} 是否可以撤销
   */
  canUndo() {
    return this._undoStack.length > 0;
  }

  /**
   * @returns {boolean} 是否可以重做
   */
  canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * 清空撤销和重做栈。
   */
  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }
}

/**
 * TileEditCommand — 地块编辑命令
 * 记录一组 tile 变更的前后状态快照，支持 execute/undo。
 */
export class TileEditCommand {
  /**
   * @param {import('../map/MapData.js').MapData} mapData - 地图数据实例
   * @param {Array<{q: number, r: number, before: object, after: object}>} changes
   *   before/after 是 tile 属性的浅拷贝（terrain, elevation, building, event）
   */
  constructor(mapData, changes) {
    this._mapData = mapData;
    this._changes = changes;
  }

  /**
   * 应用 after 状态到地图
   */
  execute() {
    for (const { q, r, after } of this._changes) {
      this._mapData.setTile(q, r, after);
    }
  }

  /**
   * 恢复 before 状态到地图
   */
  undo() {
    for (const { q, r, before } of this._changes) {
      this._mapData.setTile(q, r, before);
    }
  }
}
