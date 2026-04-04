/**
 * MapLibrary — localStorage 地图库管理
 * 管理自定义地图的 CRUD 操作
 *
 * CustomMap 结构:
 * {
 *   id: string,
 *   meta: { name, author, description, createdAt, updatedAt, size },
 *   mapJSON: object  // MapData.toJSON() 的输出
 * }
 */

export class MapLibrary {
  /**
   * @param {string} [storageKey='hexwanderer_map_library'] - localStorage key
   */
  constructor(storageKey = 'hexwanderer_map_library') {
    this._storageKey = storageKey;
  }

  /**
   * Save a CustomMap to localStorage.
   * @param {string} id - Map identifier
   * @param {object} customMap - { id, meta, mapJSON }
   * @returns {{ success: boolean, error?: string }}
   */
  save(id, customMap) {
    try {
      const library = this._readLibrary();
      library[id] = customMap;
      this._writeLibrary(library);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }

  /**
   * Load a CustomMap by id.
   * @param {string} id
   * @returns {object|null} The CustomMap, or null if not found
   */
  load(id) {
    try {
      const library = this._readLibrary();
      return library[id] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Delete a CustomMap by id.
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  delete(id) {
    try {
      const library = this._readLibrary();
      delete library[id];
      this._writeLibrary(library);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }

  /**
   * Return array of all saved maps' metadata (id + meta) without mapJSON.
   * @returns {Array<{ id: string, meta: object }>}
   */
  list() {
    try {
      const library = this._readLibrary();
      return Object.values(library).map(entry => ({
        id: entry.id,
        meta: entry.meta,
      }));
    } catch (e) {
      return [];
    }
  }

  /**
   * Generate a unique ID using Date.now() + random suffix.
   * @returns {string}
   */
  generateId() {
    const timestamp = Date.now();
    const suffix = Math.random().toString(36).substring(2, 8);
    return `map_${timestamp}_${suffix}`;
  }

  /**
   * Read the full library object from localStorage.
   * @returns {object} id → customMap mapping
   * @private
   */
  _readLibrary() {
    const raw = localStorage.getItem(this._storageKey);
    if (!raw) return {};
    return JSON.parse(raw);
  }

  /**
   * Write the full library object to localStorage.
   * @param {object} library
   * @private
   */
  _writeLibrary(library) {
    localStorage.setItem(this._storageKey, JSON.stringify(library));
  }
}
