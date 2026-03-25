/**
 * DialogManager — 事件弹窗 / 结算界面 / 失败界面
 * HTML + Tailwind overlay on top of the map. Blocks game interaction until dismissed.
 */
export class DialogManager {
  /**
   * @param {HTMLElement} container - Parent element (e.g. #game-container)
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this._overlay = null;
    this._isOpen = false;
  }

  init() {
    // Shared overlay backdrop
    this._overlay = document.createElement('div');
    this._overlay.id = 'dialog-overlay';
    this._overlay.className = [
      'absolute', 'inset-0', 'z-50',
      'flex', 'items-center', 'justify-center',
      'bg-black/60', 'backdrop-blur-sm',
      'hidden',
    ].join(' ');
    this.container.appendChild(this._overlay);
  }

  /** Whether a dialog is currently open */
  get isOpen() { return this._isOpen; }

  // ── Event dialog ────────────────────────────────────────────

  /**
   * Show an event dialog with title, description, choices, and optional death warning.
   * Returns a Promise that resolves with the chosen index.
   *
   * @param {{ title: string, description: string, deathWarning?: boolean, choices: Array<{ text: string, disabled?: boolean }> }} eventData
   * @returns {Promise<number>} Index of the chosen option
   */
  showEvent(eventData) {
    return new Promise((resolve) => {
      this._open();
      const { title, description, deathWarning, choices } = eventData;

      let choicesHtml = '';
      choices.forEach((c, i) => {
        const disabled = c.disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-indigo-600 cursor-pointer';
        choicesHtml += `
          <button class="dialog-choice w-full text-left px-3 py-2 rounded bg-indigo-500/80 text-white text-sm ${disabled} transition-colors"
            data-index="${i}" ${c.disabled ? 'disabled' : ''}>${c.text}</button>`;
      });

      const warningHtml = deathWarning
        ? `<div class="flex items-center gap-1 text-red-400 text-xs mt-1">⚠️ 此事件可能导致死亡</div>`
        : '';

      this._overlay.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5 animate-fade-in">
          <h2 class="text-lg font-bold text-yellow-300 mb-1">${title}</h2>
          ${warningHtml}
          <p class="text-gray-300 text-sm mb-4 leading-relaxed">${description}</p>
          <div class="flex flex-col gap-2">${choicesHtml}</div>
        </div>`;

      this._overlay.querySelectorAll('.dialog-choice:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index, 10);
          this._close();
          resolve(idx);
        });
      });
    });
  }

  // ── Event result display ────────────────────────────────────

  /**
   * Show the result of an event choice.
   * @param {{ message: string, effects?: string[] }} result
   * @returns {Promise<void>}
   */
  showResult(result) {
    return new Promise((resolve) => {
      this._open();

      let effectsHtml = '';
      if (result.effects && result.effects.length > 0) {
        effectsHtml = `<div class="flex flex-col gap-1 mt-2">` +
          result.effects.map(e => `<span class="text-xs text-gray-400">• ${e}</span>`).join('') +
          `</div>`;
      }

      this._overlay.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5">
          <p class="text-gray-200 text-sm leading-relaxed">${result.message}</p>
          ${effectsHtml}
          <button class="dialog-ok mt-4 w-full px-3 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm cursor-pointer transition-colors">
            确定
          </button>
        </div>`;

      this._overlay.querySelector('.dialog-ok').addEventListener('click', () => {
        this._close();
        resolve();
      });
    });
  }

  // ── Victory screen ──────────────────────────────────────────

  /**
   * Show victory screen with stats.
   * @param {{ turns: number, tilesExplored: number }} stats
   * @returns {Promise<string>} 'restart' or 'new_map'
   */
  showVictory(stats) {
    return new Promise((resolve) => {
      this._open();

      this._overlay.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 text-center">
          <div class="text-4xl mb-2">🏆</div>
          <h2 class="text-xl font-bold text-yellow-300 mb-3">通关成功！</h2>
          <div class="text-gray-300 text-sm space-y-1 mb-5">
            <div>🔄 总回合数: <span class="text-white font-bold">${stats.turns}</span></div>
            <div>🗺️ 探索地块: <span class="text-white font-bold">${stats.tilesExplored}</span></div>
          </div>
          <div class="flex flex-col gap-2">
            <button class="dialog-btn px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold text-sm cursor-pointer transition-colors" data-action="restart">
              重新开始
            </button>
            <button class="dialog-btn px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-400 text-white text-sm cursor-pointer transition-colors" data-action="new_map">
              下一张随机地图
            </button>
          </div>
        </div>`;

      this._overlay.querySelectorAll('.dialog-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this._close();
          resolve(btn.dataset.action);
        });
      });
    });
  }

  // ── Defeat screen ───────────────────────────────────────────

  /**
   * Show defeat screen with option to restore from save.
   * @param {{ hasSave: boolean }} options
   * @returns {Promise<string>} 'restore' or 'restart'
   */
  showDefeat(options = {}) {
    return new Promise((resolve) => {
      this._open();

      const restoreBtn = options.hasSave
        ? `<button class="dialog-btn px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm cursor-pointer transition-colors" data-action="restore">
            从存档恢复
          </button>`
        : '';

      this._overlay.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 text-center">
          <div class="text-4xl mb-2">💀</div>
          <h2 class="text-xl font-bold text-red-400 mb-3">游戏失败</h2>
          <p class="text-gray-400 text-sm mb-5">你的生命值降至 0...</p>
          <div class="flex flex-col gap-2">
            ${restoreBtn}
            <button class="dialog-btn px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm cursor-pointer transition-colors" data-action="restart">
              重新开始
            </button>
          </div>
        </div>`;

      this._overlay.querySelectorAll('.dialog-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this._close();
          resolve(btn.dataset.action);
        });
      });
    });
  }

  // ── Generic confirm dialog ──────────────────────────────────

  /**
   * Show a simple confirm/cancel dialog.
   * @param {{ title: string, message: string, confirmText?: string, cancelText?: string }} opts
   * @returns {Promise<boolean>}
   */
  confirm(opts) {
    return new Promise((resolve) => {
      this._open();

      this._overlay.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-5">
          <h2 class="text-lg font-bold text-white mb-2">${opts.title}</h2>
          <p class="text-gray-300 text-sm mb-4">${opts.message}</p>
          <div class="flex gap-2">
            <button class="dialog-confirm flex-1 px-3 py-2 rounded bg-indigo-500 hover:bg-indigo-400 text-white text-sm cursor-pointer transition-colors">
              ${opts.confirmText || '确定'}
            </button>
            <button class="dialog-cancel flex-1 px-3 py-2 rounded bg-gray-600 hover:bg-gray-500 text-white text-sm cursor-pointer transition-colors">
              ${opts.cancelText || '取消'}
            </button>
          </div>
        </div>`;

      this._overlay.querySelector('.dialog-confirm').addEventListener('click', () => {
        this._close();
        resolve(true);
      });
      this._overlay.querySelector('.dialog-cancel').addEventListener('click', () => {
        this._close();
        resolve(false);
      });
    });
  }

  // ── Internal helpers ────────────────────────────────────────

  _open() {
    this._isOpen = true;
    this._overlay.classList.remove('hidden');
    this.eventBus.emit('dialog:opened');
  }

  _close() {
    this._isOpen = false;
    this._overlay.classList.add('hidden');
    this._overlay.innerHTML = '';
    this.eventBus.emit('dialog:closed');
  }

  destroy() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    this._isOpen = false;
  }
}
