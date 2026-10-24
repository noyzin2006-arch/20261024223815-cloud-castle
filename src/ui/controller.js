/**
 * UI 控制器（规划案 §3.3 / §4、T02/T03/T12/T14）
 *
 * 职责：把状态仓库的变化投影到 DOM；把用户的操作翻译成 action。
 * 组件本身不存状态 —— 所有状态都在 store 里。
 */

import { mountIcons, icon } from './icons.js';
import { serializeQuery } from '../core/state.js';
import { PHOTO_FILENAME } from '../config/visual.js';

/** @param {string} selector */
const $ = (selector) => document.querySelector(selector);

/**
 * @param {Object} options
 * @param {import('../core/state.js').createStore extends (...a:any)=>infer S ? S : never} options.store
 * @param {(action: {type:string,value?:any}) => void} options.dispatch
 * @param {Object} options.actions 额外动作回调
 */
export function createUI({ store, dispatch, actions = {} }) {
  mountIcons(document);

  const boot = $('#boot');
  const bootFill = $('#boot-fill');
  const bootStage = $('#boot-stage');
  const bootCancel = $('#boot-cancel');
  const narrative = $('#narrative');
  const narrativeHint = $('#narrative-hint');
  const sceneStatus = $('#scene-status');
  const toasts = $('#toasts');
  const helpDialog = $('#help-dialog');
  const fallback = $('#fallback');
  const fallbackBody = $('#fallback-body');
  const tierMenu = $('#tier-menu');
  const viewMenu = $('#view-menu');
  const canvas = $('#scene');

  let lastToastText = '';
  let lastToastAt = 0;
  /** @type {HTMLElement | null} */
  let dialogTrigger = null;

  // ---------------------------------------------------------------- Toast
  /**
   * @param {string} text
   * @param {'info'|'success'|'warning'|'error'} tone
   */
  function toast(text, tone = 'info') {
    const now = performance.now();
    // 防同文案重复刷屏
    if (text === lastToastText && now - lastToastAt < 2500) return;
    lastToastText = text;
    lastToastAt = now;

    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.tone = tone;
    const iconName = tone === 'error' ? 'warn' : tone === 'success' ? 'check' : tone === 'warning' ? 'warn' : 'info';
    node.innerHTML = `<span class="toast__icon">${icon(iconName)}</span><span>${text}</span>`;
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toasts.append(node);

    window.setTimeout(() => {
      node.remove();
    }, tone === 'error' ? 8000 : 4200);
  }

  // ---------------------------------------------------------------- 浮层
  function closeMenus() {
    if (tierMenu && !tierMenu.hidden) {
      tierMenu.hidden = true;
      tierMenu.parentElement?.querySelector('[data-action="tier-menu"]')?.setAttribute('aria-expanded', 'false');
    }
    if (viewMenu && !viewMenu.hidden) {
      viewMenu.hidden = true;
      viewMenu.parentElement?.querySelector('[data-action="view-menu"]')?.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleMenu(menu, trigger) {
    const willOpen = menu.hidden;
    closeMenus();
    if (willOpen) {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      menu.querySelector('button')?.focus();
    } else {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  }

  // ---------------------------------------------------------------- 帮助
  function openHelp() {
    dialogTrigger = /** @type {HTMLElement} */ (document.activeElement);
    dispatch({ type: 'DIALOG_OPEN', value: 'help' });
    if (typeof helpDialog.showModal === 'function') helpDialog.showModal();
    else helpDialog.setAttribute('open', '');
  }

  function closeHelp() {
    if (typeof helpDialog.close === 'function') helpDialog.close();
    else helpDialog.removeAttribute('open');
    dispatch({ type: 'DIALOG_CLOSE' });
    dialogTrigger?.focus();
  }

  // ---------------------------------------------------------------- 事件绑定
  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const button = target.closest('[data-action]');
    if (!button) {
      // 点击空白处关闭浮层
      if (!target.closest('.menu')) closeMenus();
      return;
    }
    const action = button.getAttribute('data-action');
    const value = button.getAttribute('data-value') ?? undefined;

    switch (action) {
      case 'time':
        dispatch({ type: 'SET_TIME', value });
        toast(`当前时刻：${TIME_LABELS[value] ?? value}`, 'success');
        break;
      case 'weather':
        dispatch({ type: 'SET_WEATHER', value });
        toast(`天气：${WEATHER_LABELS[value] ?? value}`, 'success');
        break;
      case 'tier':
        dispatch({ type: 'SET_TIER', value });
        toast(`当前画质：${TIER_LABELS[value] ?? value}`, 'success');
        closeMenus();
        break;
      case 'tier-menu':
        toggleMenu(tierMenu, button);
        break;
      case 'view':
        dispatch({ type: 'SET_VIEW', value });
        closeMenus();
        break;
      case 'view-menu':
        toggleMenu(viewMenu, button);
        break;
      case 'reset':
        dispatch({ type: 'RESET_VIEW' });
        toast('视角已复位', 'success');
        break;
      case 'photo':
        dispatch({ type: 'PHOTO_ENTER' });
        break;
      case 'mute':
        actions.toggleMute?.();
        break;
      case 'help':
        openHelp();
        break;
      case 'close-help':
        closeHelp();
        break;
      case 'reload':
        globalThis.location.reload();
        break;
      case 'cancel-load':
        actions.cancelLoad?.();
        break;
      default:
        break;
    }
  });

  // 键盘
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (helpDialog.open) {
        closeHelp();
        event.preventDefault();
        return;
      }
      if (!tierMenu.hidden || !viewMenu.hidden) {
        closeMenus();
        event.preventDefault();
        return;
      }
      if (store.getState().photoMode) {
        dispatch({ type: 'PHOTO_EXIT' });
        event.preventDefault();
      }
      return;
    }

    // 只在没有文本输入焦点时处理单键快捷键
    const active = /** @type {HTMLElement} */ (document.activeElement);
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    const key = event.key.toLowerCase();
    if (key === 'r') {
      dispatch({ type: 'RESET_VIEW' });
      toast('视角已复位', 'success');
    } else if (key === 'h') {
      const state = store.getState();
      dispatch({ type: state.photoMode ? 'PHOTO_EXIT' : 'PHOTO_ENTER' });
    } else if (key === 's' && store.getState().photoMode) {
      actions.savePhoto?.();
    } else if (key === 'm') {
      actions.toggleMute?.();
    }
  });

  helpDialog.addEventListener('close', () => {
    dispatch({ type: 'DIALOG_CLOSE' });
  });

  // ---------------------------------------------------------------- 状态投影
  const TIME_LABELS = { dawn: '晨曦', noon: '正午', sunset: '日落', night: '星夜' };
  const WEATHER_LABELS = { clear: '晴朗', mist: '薄雾', storm: '风雨' };
  const TIER_LABELS = { low: '低', balanced: '均衡', ultra: '极致' };

  function render(state) {
    // 时刻 / 天气 / 画质 / 镜头 的选中态
    document.querySelectorAll('[data-action="time"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-value') === state.time));
    });
    document.querySelectorAll('[data-action="weather"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-value') === state.weather));
    });
    document.querySelectorAll('[data-action="tier"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-value') === state.tier));
    });

    // 静音按钮
    const muteBtn = document.querySelector('[data-action="mute"]');
    if (muteBtn) {
      muteBtn.setAttribute('aria-pressed', String(state.mute));
      muteBtn.setAttribute('aria-label', state.mute ? '开启环境声' : '静音环境声');
      const holder = muteBtn.querySelector('[data-icon]');
      if (holder) holder.innerHTML = icon(state.mute ? 'mute' : 'sound');
    }

    // 摄影模式：隐藏界面
    document.body.dataset.photo = String(state.photoMode);

    // 叙事标题：接管操作后淡出
    if (narrative) {
      narrative.dataset.hidden = String(state.intro !== 'playing' && state.phase === 'ready');
    }

    // 屏幕阅读器状态
    if (sceneStatus) {
      sceneStatus.textContent = `当前时刻 ${TIME_LABELS[state.time]}，天气 ${WEATHER_LABELS[state.weather]}，镜头 ${state.view}`;
    }

    // 启动屏
    if (boot) {
      const pct = Math.round(state.progress * 100);
      bootFill?.style.setProperty('width', `${pct}%`);
      bootBar?.setAttribute('aria-valuenow', String(pct));
      if (bootStage) bootStage.textContent = bootMessage(state);
      if (bootCancel) bootCancel.hidden = !(state.progress > 0 && state.progress < 1 && bootElapsed > 10);
    }

    // 错误态
    if (state.phase === 'error') {
      if (fallback) fallback.hidden = false;
      if (fallbackBody) {
        fallbackBody.textContent = state.error
          ? `${state.error}`
          : '当前设备无法显示实时云海。请启用浏览器图形加速或改用最新版 Chrome / Safari。';
      }
      boot?.setAttribute('data-done', 'true');
    }

    // 成功态
    if (state.phase === 'ready' || state.phase === 'degraded') {
      if (fallback) fallback.hidden = true;
    }
  }

  const bootBar = $('#boot-bar');
  let bootElapsed = 0;

  function bootMessage(state) {
    if (state.phase === 'error') return '图形初始化未完成，请开启图形加速后重试';
    if (state.phase === 'ready') return '云际圣堡已就绪';
    if (state.phase === 'degraded') return '云际圣堡已就绪（部分资源降级）';
    const pct = Math.round(state.progress * 100);
    if (pct < 34) return `正在编织云海 · ${pct}%`;
    if (pct < 62) return `正在装填高精材质 · ${pct}%`;
    if (pct < 86) return `正在整合光影 · ${pct}%`;
    return `交互即将就绪 · ${pct}%`;
  }

  // ---------------------------------------------------------------- 启动屏控制
  function showBoot() {
    if (boot) boot.dataset.done = 'false';
  }

  function hideBoot() {
    if (boot) boot.dataset.done = 'true';
  }

  function setBootElapsed(ms) {
    bootElapsed = ms / 1000;
  }

  /**
   * 保存摄影模式的 PNG。
   * @param {HTMLCanvasElement} canvasEl
   */
  async function savePhoto(canvasEl) {
    try {
      toast('正在保存 PNG', 'info');
      const blob = await new Promise((resolve, reject) => {
        canvasEl.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 返回空'))), 'image/png');
      });
      const state = store.getState();
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const filename = PHOTO_FILENAME
        .replace('{time}', state.time)
        .replace('{weather}', state.weather)
        .replace('{timestamp}', stamp);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('照片已保存', 'success');
    } catch (error) {
      toast(`照片无法保存，请检查下载权限（${error instanceof Error ? error.message : '未知原因'}）`, 'error');
    }
  }

  return {
    render,
    toast,
    showBoot,
    hideBoot,
    setBootElapsed,
    savePhoto,
    closeMenus,
    openHelp,
    closeHelp,
    dispose() {
      closeMenus();
    },
  };
}
