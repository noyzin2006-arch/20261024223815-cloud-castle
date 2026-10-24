/**
 * AETHERKEEP 状态仓库（规划案 §5.2 / T03）
 *
 * 纯 reducer：同样的 (state, action) 永远得到同样的新状态，便于单测。
 * URL 深链、localStorage 容错、并发 last-write-wins 都在这一层解决。
 */

import { STORAGE_KEY, STORAGE_SCHEMA_VERSION } from '../config/visual.js';

/**
 * @typedef {'dawn'|'noon'|'sunset'|'night'} Time
 * @typedef {'clear'|'mist'|'storm'} Weather
 * @typedef {'low'|'balanced'|'ultra'} Tier
 * @typedef {'hero'|'side'|'detail'|'rock'} View
 * @typedef {'boot'|'ready'|'degraded'|'error'} Phase
 * @typedef {'playing'|'skipped'|'complete'} Intro
 */

/**
 * @typedef {Object} AppState
 * @property {Time} time
 * @property {Weather} weather
 * @property {Tier} tier
 * @property {boolean} manualTier 用户是否手动锁定画质
 * @property {View} view
 * @property {boolean} photoMode
 * @property {boolean} mute
 * @property {boolean} reducedMotion
 * @property {Phase} phase
 * @property {number} progress 0..1
 * @property {Intro} intro
 * @property {null|'help'} dialog
 * @property {null|string} error
 */

/** @type {Readonly<AppState>} */
export const INITIAL_STATE = Object.freeze({
  time: 'dawn',
  weather: 'clear',
  tier: 'balanced',
  manualTier: false,
  view: 'hero',
  photoMode: false,
  mute: true,
  reducedMotion: false,
  phase: 'boot',
  progress: 0,
  intro: 'playing',
  dialog: null,
  error: null,
});

export const TIMES = Object.freeze(['dawn', 'noon', 'sunset', 'night']);
export const WEATHERS = Object.freeze(['clear', 'mist', 'storm']);
export const TIERS = Object.freeze(['low', 'balanced', 'ultra']);
export const VIEWS = Object.freeze(['hero', 'side', 'detail', 'rock']);

/** 允许出现在 URL 上的参数白名单 */
export const QUERY_KEYS = Object.freeze({
  view: VIEWS,
  time: TIMES,
  weather: WEATHERS,
  tier: TIERS,
  intro: ['0', '1'],
});

/**
 * 纯 reducer。
 * @param {AppState} state
 * @param {{type: string, [k: string]: any}} action
 * @returns {AppState}
 */
export function reducer(state, action) {
  if (!action || typeof action.type !== 'string') return state;

  switch (action.type) {
    case 'SET_TIME':
      return TIMES.includes(action.value) ? { ...state, time: action.value } : state;

    case 'SET_WEATHER':
      return WEATHERS.includes(action.value) ? { ...state, weather: action.value } : state;

    case 'SET_TIER':
      if (!TIERS.includes(action.value)) return state;
      // 用户手动选档 → 锁定；调速器仍可在同档内缩放，但不得换档
      return { ...state, tier: action.value, manualTier: true };

    case 'AUTO_SCALE':
      // 调速器降级/恢复：不改档位，只改 manualTier 与 phase
      if (!TIERS.includes(action.value)) return state;
      if (state.tier === action.value) return state;
      return { ...state, tier: action.value, manualTier: false };

    case 'SET_VIEW':
      return VIEWS.includes(action.value) ? { ...state, view: action.value } : state;

    case 'RESET_VIEW':
      return { ...state, view: 'hero' };

    case 'PHOTO_ENTER':
      return state.photoMode ? state : { ...state, photoMode: true };

    case 'PHOTO_EXIT':
      return state.photoMode ? { ...state, photoMode: false } : state;

    case 'LOAD_PROGRESS': {
      const value = Number(action.value);
      if (!Number.isFinite(value)) return state;
      const progress = Math.min(1, Math.max(0, value));
      return { ...state, progress, phase: state.phase === 'boot' ? 'boot' : state.phase };
    }

    case 'LOAD_DONE':
      return { ...state, progress: 1, phase: action.degraded ? 'degraded' : 'ready', error: null };

    case 'LOAD_ERROR':
      return { ...state, phase: 'error', error: String(action.error ?? '未知错误') };

    case 'INTERRUPT_INTRO':
      return state.intro === 'playing' ? { ...state, intro: 'skipped' } : state;

    case 'SET_REDUCED_MOTION':
      return { ...state, reducedMotion: Boolean(action.value) };

    case 'SET_MUTE':
      return { ...state, mute: Boolean(action.value) };

    case 'DIALOG_OPEN':
      return action.value === 'help' ? { ...state, dialog: 'help' } : state;

    case 'DIALOG_CLOSE':
      return state.dialog === null ? state : { ...state, dialog: null };

    default:
      return state;
  }
}

/**
 * 极简 store：getState / dispatch / subscribe / destroy。
 * @param {Partial<AppState>} [initial]
 */
export function createStore(initial = INITIAL_STATE) {
  let state = Object.freeze({ ...INITIAL_STATE, ...initial });
  /** @type {Set<(s: AppState, prev: AppState) => void>} */
  const listeners = new Set();

  function getState() {
    return state;
  }

  function dispatch(action) {
    const prev = state;
    const next = reducer(prev, action);
    if (next === prev) return prev;
    state = Object.freeze(next);
    for (const fn of [...listeners]) fn(state, prev);
    return state;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    listeners.clear();
  }

  return { getState, dispatch, subscribe, destroy };
}

/**
 * 解析深链。未知参数一律忽略并回退默认值，**绝不因为坏 URL 白屏**。
 * @param {string} search
 * @returns {{state: Partial<AppState>, warnings: string[]}}
 */
export function parseQuery(search) {
  const warnings = [];
  const params = new URLSearchParams(search || '');
  /** @type {Partial<AppState>} */
  const state = {};

  for (const [key, allowed] of Object.entries(QUERY_KEYS)) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (!allowed.includes(raw)) {
      warnings.push(`忽略未知参数 ${key}=${raw}`);
      continue;
    }
    if (key === 'intro') {
      state.intro = raw === '0' ? 'skipped' : 'playing';
    } else if (key === 'tier') {
      state.tier = /** @type {Tier} */ (raw);
      state.manualTier = true;
    } else {
      state[key] = raw;
    }
  }

  // 未知但存在的参数：记录警告，不影响状态
  for (const key of params.keys()) {
    if (!(key in QUERY_KEYS)) warnings.push(`忽略未知参数 ${key}`);
  }

  return { state, warnings };
}

/**
 * 序列化为稳定的 URL 查询串。相机交互用 replaceState，不污染返回历史。
 * @param {AppState} state
 * @returns {string}
 */
export function serializeQuery(state) {
  const params = new URLSearchParams();
  params.set('view', state.view);
  params.set('time', state.time);
  params.set('weather', state.weather);
  params.set('tier', state.tier);
  params.set('intro', state.intro === 'playing' ? '1' : '0');
  return `?${params.toString()}`;
}

/**
 * 读取 localStorage 偏好。任何异常（禁用/损坏/版本不符）都静默回默认。
 * @returns {{tier?: Tier, mute?: boolean}}
 */
export function readPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed.v !== STORAGE_SCHEMA_VERSION) return {};
    /** @type {{tier?: Tier, mute?: boolean}} */
    const out = {};
    if (TIERS.includes(parsed.tier)) out.tier = parsed.tier;
    if (typeof parsed.mute === 'boolean') out.mute = parsed.mute;
    return out;
  } catch {
    return {};
  }
}

/**
 * 写入 localStorage 偏好。失败静默忽略（静态降级）。
 * @param {{tier?: Tier, mute?: boolean}} prefs
 */
export function writePrefs(prefs) {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_SCHEMA_VERSION, tier: prefs.tier, mute: prefs.mute }),
    );
  } catch {
    /* 存储不可用：静默降级，不影响主流程 */
  }
}
