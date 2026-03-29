/**
 * UIManager — UI 总管理
 * Coordinates HUD, DialogManager, and action buttons.
 * Action buttons: End Turn, Export Save, Import Save, Center on Player.
 * Layout: buttons at bottom, responsive.
 * Connects to EventBus for game state updates.
 */
import { HUD } from './HUD.js';
import { DialogManager } from './DialogManager.js';

export class UIManager {
  /**
   * @param {HTMLElement} container - Parent element (e.g. #game-container)
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(container, eventBus) {
    this.container = container;
    this.eventBus = eventBus;
    this.hud = new HUD(container, eventBus);
    this.dialog = new DialogManager(container, eventBus);
    this._btnBar = null;
    this._importInput = null;
    this._toastEl = null;
  }

  /** Initialize all UI sub-components */
  init() {
    this.hud.init();
    this.dialog.init();
    this._createButtonBar();
    this._createToast();
    this._listen();
  }

  // ── Button bar ──────────────────────────────────────────────

  _createButtonBar() {
    this._btnBar = document.createElement('div');
    this._btnBar.id = 'ui-buttons';
    this._btnBar.className = [
      'absolute', 'bottom-3', 'left-1/2', '-translate-x-1/2', 'z-30',
      'flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-2',
      'pointer-events-auto', 'select-none',
    ].join(' ');

    const btnClass = [
      'px-3', 'py-1.5', 'rounded-lg', 'text-xs', 'font-medium',
      'cursor-pointer', 'transition-colors', 'whitespace-nowrap',
    ].join(' ');

    const buttons = [
      { id: 'btn-end-turn', label: '⏭ 结束回合', extra: 'bg-yellow-600 hover:bg-yellow-500 text-white' },
      { id: 'btn-path-go', label: '🗺️ 出发', extra: 'bg-cyan-700 hover:bg-cyan-600 text-white hidden' },
      { id: 'btn-path-cancel', label: '✖ 取消寻路', extra: 'bg-red-700 hover:bg-red-600 text-white hidden' },
      { id: 'btn-export', label: '💾 导出存档', extra: 'bg-gray-700 hover:bg-gray-600 text-gray-200' },
      { id: 'btn-import', label: '📂 导入存档', extra: 'bg-gray-700 hover:bg-gray-600 text-gray-200' },
      { id: 'btn-center', label: '<img src="assets/ui/player.png" style="width:14px;height:14px;vertical-align:middle;display:inline-block;margin-right:2px;"> 居中玩家', extra: 'bg-gray-700 hover:bg-gray-600 text-gray-200' },
    ];

    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.id = b.id;
      btn.className = `${btnClass} ${b.extra}`;
      btn.innerHTML = b.label;
      this._btnBar.appendChild(btn);
    }

    // Hidden file input for import
    this._importInput = document.createElement('input');
    this._importInput.type = 'file';
    this._importInput.accept = '.json,application/json';
    this._importInput.className = 'hidden';
    this._btnBar.appendChild(this._importInput);

    this.container.appendChild(this._btnBar);
    this._bindButtons();
  }

  _bindButtons() {
    // End Turn
    this._btnBar.querySelector('#btn-end-turn').addEventListener('click', () => {
      if (this.dialog.isOpen) return;
      this.eventBus.emit('ui:end-turn');
    });

    // Export Save
    this._btnBar.querySelector('#btn-export').addEventListener('click', () => {
      if (this.dialog.isOpen) return;
      this._handleExport();
    });

    // Import Save
    this._btnBar.querySelector('#btn-import').addEventListener('click', () => {
      if (this.dialog.isOpen) return;
      this._handleImport();
    });

    // Center on Player
    this._btnBar.querySelector('#btn-center').addEventListener('click', () => {
      if (this.dialog.isOpen) return;
      this.eventBus.emit('ui:center-player');
    });

    // Pathfinding: Go
    this._btnBar.querySelector('#btn-path-go').addEventListener('click', () => {
      if (this.dialog.isOpen) return;
      this.eventBus.emit('ui:path-go');
    });

    // Pathfinding: Cancel
    this._btnBar.querySelector('#btn-path-cancel').addEventListener('click', () => {
      this.eventBus.emit('ui:path-cancel');
    });

    // File input change
    this._importInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.eventBus.emit('ui:import-save', { json: reader.result });
        this._importInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ── Export ──────────────────────────────────────────────────

  async _handleExport() {
    // Ask the game to provide the save JSON
    const result = await this._requestSaveData();
    if (!result) return;

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(result);
      this._showToast('存档已复制到剪贴板');
    } catch {
      this._showToast('剪贴板复制失败，已下载文件');
    }

    // Also download as file
    this._downloadFile(result, `hexwanderer_save_${Date.now()}.json`);
  }

  /**
   * Request save data from the game via EventBus.
   * The game should listen for 'ui:request-save' and call the provided callback.
   * @returns {Promise<string|null>}
   */
  _requestSaveData() {
    return new Promise((resolve) => {
      let resolved = false;
      const cb = (json) => { resolved = true; resolve(json); };
      this.eventBus.emit('ui:request-save', cb);
      // If nobody responds within 100ms, resolve null
      setTimeout(() => { if (!resolved) resolve(null); }, 100);
    });
  }

  _downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ──────────────────────────────────────────────────

  async _handleImport() {
    // Show a dialog with two options: paste or file
    const choice = await this.dialog.showEvent({
      title: '导入存档',
      description: '选择导入方式：',
      choices: [
        { text: '📋 从剪贴板粘贴' },
        { text: '📁 选择文件' },
        { text: '取消' },
      ],
    });

    if (choice === 0) {
      // Paste from clipboard
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          this.eventBus.emit('ui:import-save', { json: text });
        } else {
          this._showToast('剪贴板为空');
        }
      } catch {
        this._showToast('无法读取剪贴板');
      }
    } else if (choice === 1) {
      // File picker
      this._importInput.click();
    }
    // choice === 2 → cancel, do nothing
  }

  // ── Toast notification ──────────────────────────────────────

  _createToast() {
    this._toastEl = document.createElement('div');
    this._toastEl.id = 'ui-toast';
    this._toastEl.className = [
      'absolute', 'bottom-16', 'left-1/2', '-translate-x-1/2',
      'z-40', 'hidden',
      'bg-gray-800/90', 'backdrop-blur-sm',
      'rounded-lg', 'px-3', 'py-1.5',
      'text-xs', 'text-gray-200', 'shadow-md',
      'pointer-events-none', 'transition-opacity',
      'max-w-[80vw]', 'text-center',
    ].join(' ');
    this.container.appendChild(this._toastEl);
  }

  _showToast(message, duration = 2000) {
    if (!this._toastEl) return;
    this._toastEl.innerHTML = message;
    this._toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastEl.classList.add('hidden');
    }, duration);
  }

  // ── EventBus listeners ──────────────────────────────────────

  _listen() {
    // Forward toast messages from other systems
    this.eventBus.on('ui:toast', (msg) => this._showToast(msg));

    // Import result feedback
    this.eventBus.on('ui:import-result', (result) => {
      if (result.success) {
        this._showToast('存档导入成功');
      } else {
        this._showToast(`导入失败: ${result.error || '未知错误'}`);
      }
    });
  }

  /** Update HUD state (convenience passthrough) */
  updateHUD(data) {
    this.hud.update(data);

    // Show/hide pathfinding buttons based on state
    const goBtn = this._btnBar?.querySelector('#btn-path-go');
    const cancelBtn = this._btnBar?.querySelector('#btn-path-cancel');
    if (goBtn && cancelBtn) {
      if (data._hasPath && !data._autoMoving) {
        goBtn.classList.remove('hidden');
        goBtn.innerHTML = data._pathRetained ? '🗺️ 继续出发' : '🗺️ 出发';
        cancelBtn.classList.remove('hidden');
      } else if (data._autoMoving) {
        goBtn.classList.add('hidden');
        cancelBtn.classList.remove('hidden');
      } else {
        goBtn.classList.add('hidden');
        cancelBtn.classList.add('hidden');
      }
    }
  }

  destroy() {
    this.hud.destroy();
    this.dialog.destroy();
    if (this._btnBar) { this._btnBar.remove(); this._btnBar = null; }
    if (this._toastEl) { this._toastEl.remove(); this._toastEl = null; }
    if (this._importInput) { this._importInput.remove(); this._importInput = null; }
  }
}
