/**
 * HUD — 状态栏
 * AP/HP/回合数/圣物碎片/道具图标
 * HTML + Tailwind overlay, compact layout that doesn't block the map.
 *
 * Optimized: item icons are only rebuilt when inventory changes (not every tick).
 * Item sprite images are cached as DOM elements to avoid re-loading.
 */
export class HUD {
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this._el = null;
    this._tooltipEl = null;
    this._statsEl = null;
    this._debuffsEl = null;
    this._itemsEl = null;
    this._lastItemKey = '';   // fingerprint to detect inventory changes
    this._lastDebuffKey = ''; // fingerprint to detect debuff changes
    this._state = {
      ap: 5, apMax: 5, hp: 100, hpMax: 100,
      turn: 1, relics: 0, gold: 0,
      items: [], statusEffects: [],
    };
  }

  init() {
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

    // Stats section (updates every tick)
    this._statsEl = document.createElement('div');
    this._el.appendChild(this._statsEl);

    // Debuffs section (updates only when debuffs change)
    this._debuffsEl = document.createElement('div');
    this._el.appendChild(this._debuffsEl);

    // Items section (updates only when inventory changes)
    this._itemsEl = document.createElement('div');
    this._el.appendChild(this._itemsEl);

    this.container.appendChild(this._el);

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

  _listen() {
    this.eventBus.on('hud:update', (data) => {
      Object.assign(this._state, data);
      this._render();
    });
  }

  _render() {
    const s = this._state;

    // 1. Stats — always update (cheap text changes)
    const apPct = s.apMax > 0 ? (s.ap / s.apMax) * 100 : 0;
    const hpPct = s.hpMax > 0 ? (s.hp / s.hpMax) * 100 : 0;
    const hpColor = hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500';
    this._statsEl.innerHTML = `
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
        <span>${HUD._uiIcon('relic')} ${s.relics}/3</span>
        <span>${HUD._uiIcon('gold')} ${s.gold}</span>
      </div>`;

    // 2. Debuffs — only rebuild when changed
    const debuffKey = (s.statusEffects || []).map(se => `${se.id}:${se.duration}`).join(',');
    if (debuffKey !== this._lastDebuffKey) {
      this._lastDebuffKey = debuffKey;
      if (s.statusEffects && s.statusEffects.length > 0) {
        let dhtml = `<div class="flex flex-wrap gap-1 mt-1 border-t border-gray-700 pt-1">`;
        for (const se of s.statusEffects) {
          dhtml += `<span class="hud-debuff px-1 rounded bg-gray-700/60 text-xs cursor-default flex items-center gap-0.5" data-debuff-id="${se.id}" title="${HUD._debuffName(se.id)} (${se.duration}回合)">${HUD._debuffIconHtml(se.id)}${se.duration}</span>`;
        }
        dhtml += `</div>`;
        this._debuffsEl.innerHTML = dhtml;
        this._debuffsEl.querySelectorAll('.hud-debuff').forEach((el) => {
          el.addEventListener('pointerenter', (e) => this._showDebuffTooltip(e, el.dataset.debuffId));
          el.addEventListener('pointerleave', () => this._hideTooltip());
        });
      } else {
        this._debuffsEl.innerHTML = '';
      }
    }

    // 3. Items — only rebuild when inventory changes (avoids image reload flicker)
    const itemKey = s.items.map(i => `${i.itemId}:${i.enabled ? 1 : 0}`).join(',');
    if (itemKey !== this._lastItemKey) {
      this._lastItemKey = itemKey;
      if (s.items.length > 0) {
        let ihtml = `<div class="flex flex-wrap gap-1 mt-1 border-t border-gray-700 pt-1">`;
        for (const item of s.items) {
          const opacity = item.enabled ? '' : 'opacity-40 grayscale';
          if (item.sprite) {
            ihtml += `<div class="hud-item w-6 h-6 flex items-center justify-center rounded cursor-pointer bg-gray-700/60 hover:bg-gray-600 ${opacity}" data-item-id="${item.itemId}" title="${item.name}"><img src="${item.sprite}" style="width:20px;height:20px;object-fit:contain;" onerror="this.parentElement.textContent='📦'"></div>`;
          } else {
            ihtml += `<div class="hud-item w-6 h-6 flex items-center justify-center rounded cursor-pointer bg-gray-700/60 hover:bg-gray-600 text-sm ${opacity}" data-item-id="${item.itemId}" title="${item.name}">${HUD._itemEmoji(item.itemId)}</div>`;
          }
        }
        ihtml += `</div>`;
        this._itemsEl.innerHTML = ihtml;
        this._itemsEl.querySelectorAll('.hud-item').forEach((el) => {
          el.addEventListener('pointerenter', (e) => this._showTooltip(e, el.dataset.itemId));
          el.addEventListener('pointerleave', () => this._hideTooltip());
          el.addEventListener('click', () => {
            this.eventBus.emit('hud:item-click', { itemId: el.dataset.itemId });
          });
        });
      } else {
        this._itemsEl.innerHTML = '';
      }
    }
  }

  _showTooltip(e, itemId) {
    const item = this._state.items.find(i => i.itemId === itemId);
    if (!item) return;
    const qc = { common: 'text-gray-300', uncommon: 'text-green-400', rare: 'text-blue-400', epic: 'text-purple-400' }[item.quality] || 'text-gray-300';
    this._tooltipEl.innerHTML = `
      <div class="font-bold ${qc}">${item.name}</div>
      <div class="text-gray-400 mt-0.5">${item.description || ''}</div>
      <div class="text-gray-500 mt-0.5">${item.enabled ? '✅ 已启用' : '❌ 已禁用'}</div>`;
    const rect = e.target.getBoundingClientRect();
    const cr = this.container.getBoundingClientRect();
    this._tooltipEl.style.left = `${rect.right - cr.left + 4}px`;
    this._tooltipEl.style.top = `${rect.top - cr.top}px`;
    this._tooltipEl.classList.remove('hidden');
  }

  _hideTooltip() { this._tooltipEl.classList.add('hidden'); }

  _showDebuffTooltip(e, debuffId) {
    const se = this._state.statusEffects.find(s => s.id === debuffId);
    if (!se) return;
    const descMap = { poison: '每回合损失5%最大HP', frostbite: 'AP消耗+1，每回合-3HP', curse: '战斗伤害翻倍', bleed: '移动时-5HP', vision_override: '视野被限制' };
    this._tooltipEl.innerHTML = `
      <div class="font-bold text-red-400">${HUD._debuffIconHtml(debuffId)} ${HUD._debuffName(debuffId)}</div>
      <div class="text-gray-400 mt-0.5">${descMap[debuffId] || ''}</div>
      <div class="text-gray-500 mt-0.5">剩余 ${se.duration} 回合</div>`;
    const rect = e.target.getBoundingClientRect();
    const cr = this.container.getBoundingClientRect();
    this._tooltipEl.style.left = `${rect.right - cr.left + 4}px`;
    this._tooltipEl.style.top = `${rect.top - cr.top}px`;
    this._tooltipEl.classList.remove('hidden');
  }

  update(data) {
    Object.assign(this._state, data);
    this._render();
  }

  static _itemEmoji(itemId) {
    return { rope_claw: '🪝', parachute: '🪂', boat: '⛵', fire_boots: '🥾', telescope: '🔭', leather_shoes: '👟', tent: '⛺', four_leaf_clover: '🍀', antidote: '💊' }[itemId] || '📦';
  }

  static _debuffIcon(statusId) {
    return { poison: '☠️', frostbite: '🥶', curse: '💀', bleed: '🩸', vision_override: '👁️' }[statusId] || '⚠️';
  }

  /** Debuff icon as HTML img (with emoji fallback) */
  static _debuffIconHtml(statusId) {
    const spriteMap = {
      poison: 'assets/ui/debuff_poison.png',
      frostbite: 'assets/ui/debuff_frostbite.png',
      curse: 'assets/ui/debuff_curse.png',
      bleed: 'assets/ui/debuff_bleed.png',
      vision_override: 'assets/ui/debuff_vision.png',
    };
    const src = spriteMap[statusId];
    if (src) {
      return `<img src="${src}" style="width:14px;height:14px;vertical-align:middle;display:inline-block;" onerror="this.outerHTML='${HUD._debuffIcon(statusId)}'">`;
    }
    return HUD._debuffIcon(statusId);
  }

  /** UI icon as inline HTML img */
  static _uiIcon(type, size = 14) {
    const map = { relic: 'assets/ui/relic.png', gold: 'assets/ui/gold.png' };
    const src = map[type];
    if (src) {
      const fallback = type === 'relic' ? '💎' : '🪙';
      return `<img src="${src}" style="width:${size}px;height:${size}px;vertical-align:middle;display:inline-block;" onerror="this.outerHTML='${fallback}'">`;
    }
    return type === 'relic' ? '💎' : '🪙';
  }

  static _debuffName(statusId) {
    return { poison: '中毒', frostbite: '冻伤', curse: '诅咒', bleed: '流血', vision_override: '视障' }[statusId] || statusId;
  }

  destroy() {
    if (this._el) { this._el.remove(); this._el = null; }
    if (this._tooltipEl) { this._tooltipEl.remove(); this._tooltipEl = null; }
  }
}
