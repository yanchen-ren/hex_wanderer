/**
 * BuildingSystem — 建筑系统
 * 建筑效果触发、传送阵逻辑、区域效果
 *
 * 需求 14: 建筑与设施系统
 */
import { HexGrid } from '../map/HexGrid.js';

/**
 * @typedef {object} BuildingResult
 * @property {string} type - Effect type (e.g. 'rest_bonus', 'teleport', 'trigger_event', 'win_condition', 'vision_bonus')
 * @property {object} [effect] - Effect details
 * @property {string} [eventId] - Event to trigger (for trigger_event type)
 * @property {{q:number, r:number}} [teleportTarget] - Teleport destination
 * @property {string} [message] - Description message
 */

export class BuildingSystem {
  /**
   * @param {object} buildingConfig - Parsed building.json ({ buildingTypes: { ... } })
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(buildingConfig, eventBus) {
    this._buildingTypes = buildingConfig?.buildingTypes ?? {};
    this._eventBus = eventBus;
  }

  /**
   * Trigger a building's effect when the player enters its tile.
   * Buildings auto-trigger on entry (需求 14.3).
   *
   * @param {object} buildingData - { buildingId: string, position: {q, r}, ...tileData }
   * @param {import('./PlayerState.js').PlayerState} playerState
   * @param {import('../map/MapData.js').MapData} [mapData] - Needed for teleport resolution
   * @returns {BuildingResult}
   */
  triggerBuildingEffect(buildingData, playerState, mapData) {
    const buildingId = buildingData.buildingId ?? buildingData.building ?? buildingData;
    const def = this._buildingTypes[buildingId];
    if (!def) {
      return { type: 'unknown', message: `Unknown building: ${buildingId}` };
    }

    const effect = def.effect ?? {};
    const result = { type: 'none', buildingId, buildingName: def.name };

    // --- Teleporter ---
    if (effect.type === 'teleport') {
      const target = this.getTeleportTarget(buildingId, mapData, buildingData.position);
      if (target) {
        result.type = 'teleport';
        result.teleportTarget = target;
        result.message = `传送至 (${target.q}, ${target.r})`;
        if (this._eventBus) {
          this._eventBus.emit('building:teleport', { from: buildingData.position, to: target });
        }
      } else {
        result.type = 'teleport_failed';
        result.message = '传送阵没有配对目标';
      }
      return result;
    }

    // --- Win condition (portal) ---
    if (effect.type === 'win_condition') {
      result.type = 'win_condition';
      result.message = '传送门';
      if (this._eventBus) {
        this._eventBus.emit('building:portal', { position: buildingData.position, playerState });
      }
      return result;
    }

    // --- Trigger event ---
    if (effect.type === 'trigger_event' || def.triggerEvent) {
      result.type = 'trigger_event';
      result.eventId = def.triggerEvent;
      result.message = def.description;
      if (this._eventBus) {
        this._eventBus.emit('building:event', { eventId: def.triggerEvent, position: buildingData.position });
      }
      return result;
    }

    // --- Rest bonuses (camp, city, farm, etc.) ---
    if (effect.restApBonus || effect.restHpBonus) {
      result.type = 'rest_bonus';
      result.effect = {
        restApBonus: effect.restApBonus ?? 0,
        restHpBonus: effect.restHpBonus ?? 0,
      };
      result.message = def.description;
      return result;
    }

    // --- Vision bonus (lighthouse) ---
    if (effect.visionBonus) {
      result.type = 'vision_bonus';
      result.effect = {
        visionBonus: effect.visionBonus,
        areaRadius: effect.areaRadius ?? 0,
      };
      result.message = def.description;
      return result;
    }

    // --- Random teleport (whirlpool) ---
    if (effect.type === 'random_teleport_water') {
      result.type = 'random_teleport_water';
      result.message = def.description;
      return result;
    }

    // Fallback
    result.type = 'passive';
    result.effect = effect;
    result.message = def.description;
    return result;
  }

  /**
   * Get the paired teleporter target for a teleporter building.
   * Looks up mapData.teleportPairs to find the partner.
   *
   * @param {string} buildingId - The building type ID (should be 'teleporter')
   * @param {import('../map/MapData.js').MapData} mapData
   * @param {{q:number, r:number}} [currentPos] - Current teleporter position
   * @returns {{q:number, r:number}|null}
   */
  getTeleportTarget(buildingId, mapData, currentPos) {
    if (!mapData || !mapData.teleportPairs || !currentPos) return null;

    for (const pair of mapData.teleportPairs) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.q === currentPos.q && a.r === currentPos.r) {
        return { q: b.q, r: b.r };
      }
      if (b.q === currentPos.q && b.r === currentPos.r) {
        return { q: a.q, r: a.r };
      }
    }

    return null;
  }

  /**
   * Get the area effect of a building (e.g. lighthouse vision bonus in radius).
   *
   * @param {object} buildingData - { buildingId, position: {q, r} } or building config object
   * @param {number} [radius] - Override radius (defaults to effect.areaRadius)
   * @returns {{ affectedTiles: Array<{q:number, r:number}>, effect: object }}
   */
  getAreaEffect(buildingData, radius) {
    const buildingId = buildingData.buildingId ?? buildingData.building ?? buildingData;
    const def = typeof buildingId === 'string' ? this._buildingTypes[buildingId] : null;
    const effect = def?.effect ?? buildingData.effect ?? {};
    const pos = buildingData.position ?? { q: 0, r: 0 };
    const effectRadius = radius ?? effect.areaRadius ?? 0;

    const affectedTiles = HexGrid.hexesInRange(pos.q, pos.r, effectRadius);

    // Build the effect object to return
    const areaEffect = {};
    if (effect.visionBonus) areaEffect.visionBonus = effect.visionBonus;
    if (effect.restApBonus) areaEffect.restApBonus = effect.restApBonus;
    if (effect.restHpBonus) areaEffect.restHpBonus = effect.restHpBonus;
    if (effect.eventRefreshBonus) areaEffect.eventRefreshBonus = effect.eventRefreshBonus;
    if (effect.refreshSuppression) areaEffect.refreshSuppression = effect.refreshSuppression;

    return { affectedTiles, effect: areaEffect };
  }

  /**
   * Get building definition by ID.
   * @param {string} buildingId
   * @returns {object|undefined}
   */
  getBuildingDef(buildingId) {
    return this._buildingTypes[buildingId];
  }
}
