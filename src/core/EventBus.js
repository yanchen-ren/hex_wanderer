/**
 * EventBus — 事件总线
 * 模块间解耦通信：on / off / emit / once
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {this} 支持链式调用
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return this;
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} [callback] - 要移除的回调。省略则移除该事件所有监听器
   * @returns {this}
   */
  off(event, callback) {
    if (!callback) {
      // Remove all listeners for this event
      this._listeners.delete(event);
      return this;
    }
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {...*} args - 传递给回调的参数
   * @returns {this}
   */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of set) {
        cb(...args);
      }
    }
    return this;
  }

  /**
   * 订阅事件，触发一次后自动取消
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {this}
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    // Store reference so off(event, callback) can also remove the wrapper
    wrapper._original = callback;
    return this.on(event, wrapper);
  }
}
