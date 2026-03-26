/**
 * HUD — 状态栏
 * AP/HP/回合数/圣物碎片/道具图标
 * HTML + Tailwind overlay, compact layout that doesn't block the map.
 */
export class HUD {
  /**
   * @param {HTMLElement} container - Parent element (e.g. #game-container)
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this._el = null;
    this._tooltipEl = null;
    this._state = {
      ap: 5, apMax: 5,
      hp: 100, hpMax: 100,
      turn: 1,
      relics: 0,
      gold: 0,
      items: [], // [{ itemId, name, description, quality, enabled, sprite }]
      statusEffects: [], // [{ id, duration }]
    };
  }

  /** Create the HUD DOM and append to container */
  init() {
    // Main HUD bar
    this._el = document.createElement('div');
    this._el.id = 'hud';
    this._el.className = [
      'absolute', 'top-2', 'left-2', 'z-30',
      'flex', 'flex-col', 'gap-1',
      'bg-gray-900/80', 'backdrop-blur-sm',
      'rounded-lg', 'px-3', 'py-2',
      'text-xs', 'text-white', 'select-none',
      'pointer-events-auto', 'max-w-[220px]',
    ].join(' ');
    this.container.appendChild(this._el);

    // Tooltip (hidden by default)
    this._tooltipEl = document.createElement('div');
    this._tooltipEl.id = 'hud-tooltip';
    this._tooltipEl.className = [
      'absolute', 'z-40', 'hidden',
      'bg-gray-800/95', 'backdrop-blur-sm',
      'rounded', 'px-3', 'py-2',
      'text-xs', 'text-white', 'shadow-lg',
      'pointer-events-none', 'max-w-[200px]',
    ].join(' ');
    this.container.appendChild(this._tooltipEl);

    this._render();
    this._listen();
  }

  /** Subscribe to EventBus for state updates */
  _listen() {
    this.eventBus.on('hud:update', (data) => {
      Object.assign(this._state, data);
      this._render();
    });
  }

  /** Full re-render of HUD content */
  _render() {
    const s = this._state;
    const apPct = s.apMax > 0 ? (s.ap / s.apMax) * 100 : 0;
    const hpPct = s.hpMax > 0 ? (s.hp / s.hpMax) * 100 : 0;
    const hpColor = hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500';

    let html = `
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-yellow-300">⚡ AP</span>
        <div class="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
          <div class="bg-yellow-400 h-full rounded-full transition-all" style="width:${apPct}%"></div>
        </div>
        <span class="tabular-nums">${s.ap}/${s.apMax}</span>
      </div>
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-red-400">❤️ HP</span>
        <div class="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
          <div class="${hpColor} h-full rounded-full transition-all" style="width:${hpPct}%"></div>
        </div>
        <span class="tabular-nums">${s.hp}/${s.hpMax}</span>
      </div>
      <div class="flex items-center gap-3 text-gray-300">
        <span>🔄 回合 <span class="text-white font-bold">${s.turn}</span></span>
        <span>💎 ${s.relics}/3</span>
        <span>🪙 ${s.gold}</span>
      </div>`;

    // Active debuffs
    if (s.statusEffects && s.statusEffects.length > 0) {
      html += `<div class="flex flex-wrap gap-1 mt-1 border-t border-gray-700 pt-1">`;
      for (const se of s.statusEffects) {
        const icon = HUD._debuffIcon(se.id);
        html += `<span class="px-1 rounded bg-gray-700/60 text-xs" title="${se.id} (${se.duration}回合)">${icon}${se.duration}</span>`;
      }
      html += `</div>`;
    }

    // Item icons
    if (s.items.length > 0) {
      html += `<div class="flex flex-wrap gap-1 mt-1 border-t border-gray-700 pt-1">`;
      for (const item of s.items) {
        const opacity = item.enabled ? '' : 'opacity-40 grayscale';
        const emoji = HUD._itemEmoji(item.itemId);
        html += `<div class="hud-item w-6 h-6 flex items-center justify-center rounded cursor-pointer
          bg-gray-700/60 hover:bg-gray-600 text-sm ${opacity}"
          data-item-id="${item.itemId}"
          title="${item.name}">${emoji}</div>`;
      }
      html += `</div>`;
    }

    this._el.innerHTML = html;

    // Bind item icon click → tooltip
    this._el.querySelectorAll('.hud-item').forEach((el) => {
      el.addEventListener('pointerenter', (e) => this._showTooltip(e, el.dataset.itemId));
      el.addEventListener('pointerleave', () => this._hideTooltip());
      el.addEventListener('click', () => {
        this.eventBus.emit('hud:item-click', { itemId: el.dataset.itemId });
      });
    });
  }

  /** Show tooltip near the hovered item icon */
  _showTooltip(e, itemId) {
    const item = this._state.items.find(i => i.itemId === itemId);
    if (!item) return;
    const qualityColors = { common: 'text-gray-300', uncommon: 'text-green-400', rare: 'text-blue-400', epic: 'text-purple-400' };
    const qc = qualityColors[item.quality] || 'text-gray-300';
    this._tooltipEl.innerHTML = `
      <div class="font-bold ${qc}">${item.name}</div>
      <div class="text-gray-400 mt-0.5">${item.description || ''}</div>
      <div class="text-gray-500 mt-0.5">${item.enabled ? '✅ 已启用' : '❌ 已禁用'}</div>
    `;
    const rect = e.target.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    this._tooltipEl.style.left = `${rect.right - containerRect.left + 4}px`;
    this._tooltipEl.style.top = `${rect.top - containerRect.top}px`;
    this._tooltipEl.classList.remove('hidden');
  }

  _hideTooltip() {
    this._tooltipEl.classList.add('hidden');
  }

  /** Update HUD state programmatically */
  update(data) {
    Object.assign(this._state, data);
    this._render();
  }

  /** Map itemId to a fallback emoji */
  static _itemEmoji(itemId) {
    const map = {
      rope_claw: '🪝', parachute: '🪂', boat: '⛵',
      fire_boots: '🥾', telescope: '🔭', leather_shoes: '👟',
      tent: '⛺', four_leaf_clover: '🍀', antidote: '💊',
    };
    return map[itemId] || '📦';
  }

  /** Map debuff id to icon */
  static _debuffIcon(statusId) {
    const map = {
      poison: '☠️',
      frostbite: '🥶',
      curse: '💀',
      bleed: '🩸',
    };
    return map[statusId] || '⚠️';
  }

  destroy() {
    if (this._el) { this._el.remove(); this._el = null; }
    if (this._tooltipEl) { this._tooltipEl.remove(); this._tooltipEl = null; }
  }
}
