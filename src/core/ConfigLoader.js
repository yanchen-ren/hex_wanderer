/**
 * ConfigLoader — 配置加载器
 * fetch 加载 JSON 配置文件，缓存结果
 */
export class ConfigLoader {
  constructor() {
    /** @type {Map<string, object>} */
    this.cache = new Map();
  }

  /**
   * 加载单个 JSON 配置文件，结果缓存
   * @param {string} path - JSON 文件路径
   * @returns {Promise<object>} 解析后的 JSON 对象
   */
  async load(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`ConfigLoader: failed to load ${path} (${response.status})`);
    }
    const data = await response.json();
    this.cache.set(path, data);
    return data;
  }

  /**
   * 批量加载所有核心配置文件
   * @returns {Promise<{terrain: object, building: object, item: object, event: object}>}
   */
  async loadAll() {
    const [terrain, building, item, event, difficulty] = await Promise.all([
      this.load('config/terrain.json'),
      this.load('config/building.json'),
      this.load('config/item.json'),
      this.load('config/event.json'),
      this.load('config/difficulty.json'),
    ]);
    return { terrain, building, item, event, difficulty };
  }
}
