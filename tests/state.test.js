/**
 * 状态仓库单测（规划案 T03）
 * 运行：node --test tests/state.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_STATE,
  QUERY_KEYS,
  createStore,
  parseQuery,
  readPrefs,
  reducer,
  serializeQuery,
  writePrefs,
} from '../src/core/state.js';

test('初始状态完全符合规划案定义', () => {
  assert.equal(INITIAL_STATE.time, 'dawn');
  assert.equal(INITIAL_STATE.weather, 'clear');
  assert.equal(INITIAL_STATE.tier, 'balanced');
  assert.equal(INITIAL_STATE.manualTier, false);
  assert.equal(INITIAL_STATE.view, 'hero');
  assert.equal(INITIAL_STATE.photoMode, false);
  assert.equal(INITIAL_STATE.mute, true);
  assert.equal(INITIAL_STATE.phase, 'boot');
  assert.equal(INITIAL_STATE.progress, 0);
  assert.equal(INITIAL_STATE.intro, 'playing');
  assert.equal(INITIAL_STATE.dialog, null);
  assert.equal(INITIAL_STATE.error, null);
});

test('SET_TIME / SET_WEATHER / SET_TIER / SET_VIEW 只接受白名单值', () => {
  let s = INITIAL_STATE;
  s = reducer(s, { type: 'SET_TIME', value: 'night' });
  assert.equal(s.time, 'night');
  s = reducer(s, { type: 'SET_TIME', value: 'midnight' });
  assert.equal(s.time, 'night', '非法时刻必须被拒绝');

  s = reducer(s, { type: 'SET_WEATHER', value: 'storm' });
  assert.equal(s.weather, 'storm');
  s = reducer(s, { type: 'SET_WEATHER', value: 'rain' });
  assert.equal(s.weather, 'storm');

  s = reducer(s, { type: 'SET_TIER', value: 'ultra' });
  assert.equal(s.tier, 'ultra');
  assert.equal(s.manualTier, true, '手动选档必须锁定');

  s = reducer(s, { type: 'SET_VIEW', value: 'rock' });
  assert.equal(s.view, 'rock');
  s = reducer(s, { type: 'SET_VIEW', value: 'orbit' });
  assert.equal(s.view, 'rock');
});

test('AUTO_SCALE 不改变用户手动锁定', () => {
  const manual = reducer(INITIAL_STATE, { type: 'SET_TIER', value: 'ultra' });
  assert.equal(manual.manualTier, true);
  const auto = reducer(manual, { type: 'AUTO_SCALE', value: 'balanced' });
  assert.equal(auto.tier, 'balanced');
  assert.equal(auto.manualTier, false, '调速器换档后不再算手动锁定');
});

test('摄影模式与对话框互斥地进入/退出', () => {
  let s = reducer(INITIAL_STATE, { type: 'PHOTO_ENTER' });
  assert.equal(s.photoMode, true);
  s = reducer(s, { type: 'PHOTO_ENTER' });
  assert.equal(s.photoMode, true);
  s = reducer(s, { type: 'PHOTO_EXIT' });
  assert.equal(s.photoMode, false);

  s = reducer(INITIAL_STATE, { type: 'DIALOG_OPEN', value: 'help' });
  assert.equal(s.dialog, 'help');
  s = reducer(s, { type: 'DIALOG_OPEN', value: 'other' });
  assert.equal(s.dialog, 'help', '只允许 help 对话框');
  s = reducer(s, { type: 'DIALOG_CLOSE' });
  assert.equal(s.dialog, null);
});

test('加载进度被夹在 0..1，错误态记录错误文案', () => {
  let s = reducer(INITIAL_STATE, { type: 'LOAD_PROGRESS', value: 0.42 });
  assert.equal(s.progress, 0.42);
  s = reducer(s, { type: 'LOAD_PROGRESS', value: 5 });
  assert.equal(s.progress, 1);
  s = reducer(s, { type: 'LOAD_PROGRESS', value: -2 });
  assert.equal(s.progress, 0);
  s = reducer(s, { type: 'LOAD_PROGRESS', value: 'abc' });
  assert.equal(s.progress, 0, '非数字进度必须被忽略');

  s = reducer(s, { type: 'LOAD_ERROR', error: 'WebGL2 不可用' });
  assert.equal(s.phase, 'error');
  assert.equal(s.error, 'WebGL2 不可用');
});

test('LOAD_DONE 区分正常与降级', () => {
  const ok = reducer(INITIAL_STATE, { type: 'LOAD_DONE', degraded: false });
  assert.equal(ok.phase, 'ready');
  assert.equal(ok.progress, 1);
  const degraded = reducer(INITIAL_STATE, { type: 'LOAD_DONE', degraded: true });
  assert.equal(degraded.phase, 'degraded');
});

test('未知 action 与非法 action 保持原状态', () => {
  assert.equal(reducer(INITIAL_STATE, { type: 'NOPE' }), INITIAL_STATE);
  assert.equal(reducer(INITIAL_STATE, null), INITIAL_STATE);
  assert.equal(reducer(INITIAL_STATE, {}), INITIAL_STATE);
  assert.equal(reducer(INITIAL_STATE, { type: 123 }), INITIAL_STATE);
});

test('store 订阅与解除订阅', () => {
  const store = createStore();
  let calls = 0;
  let last = null;
  const off = store.subscribe((state) => {
    calls += 1;
    last = state;
  });
  store.dispatch({ type: 'SET_TIME', value: 'sunset' });
  assert.equal(calls, 1);
  assert.equal(last.time, 'sunset');
  off();
  store.dispatch({ type: 'SET_TIME', value: 'noon' });
  assert.equal(calls, 1, '解除订阅后不再收到通知');
  store.destroy();
});

test('store 连续多次 dispatch 只保留最后一次意图（last-write-wins）', () => {
  const store = createStore();
  store.dispatch({ type: 'SET_TIME', value: 'noon' });
  store.dispatch({ type: 'SET_TIME', value: 'sunset' });
  store.dispatch({ type: 'SET_TIME', value: 'night' });
  assert.equal(store.getState().time, 'night');
});

test('parseQuery 解析合法深链', () => {
  const { state, warnings } = parseQuery('?view=side&time=night&weather=storm&tier=ultra&intro=0');
  assert.equal(state.view, 'side');
  assert.equal(state.time, 'night');
  assert.equal(state.weather, 'storm');
  assert.equal(state.tier, 'ultra');
  assert.equal(state.manualTier, true);
  assert.equal(state.intro, 'skipped');
  assert.equal(warnings.length, 0);
});

test('parseQuery 忽略非法与未知参数，不抛错', () => {
  const { state, warnings } = parseQuery('?view=orbit&time=midnight&foo=1');
  assert.equal(state.view, undefined);
  assert.equal(state.time, undefined);
  assert.ok(warnings.length >= 2, '每个非法参数都要留下警告');
});

test('parseQuery 处理空串与空搜索', () => {
  const { state, warnings } = parseQuery('');
  assert.deepEqual(state, {});
  assert.equal(warnings.length, 0);
  assert.doesNotThrow(() => parseQuery('?'));
});

test('serializeQuery 输出稳定且可回读', () => {
  const state = { ...INITIAL_STATE, view: 'detail', time: 'noon', weather: 'mist', tier: 'low' };
  const query = serializeQuery(state);
  const { state: parsed } = parseQuery(query);
  assert.equal(parsed.view, 'detail');
  assert.equal(parsed.time, 'noon');
  assert.equal(parsed.weather, 'mist');
  assert.equal(parsed.tier, 'low');
});

test('URL 白名单只包含规划案允许的键', () => {
  assert.deepEqual(Object.keys(QUERY_KEYS).sort(), ['intro', 'tier', 'time', 'view', 'weather']);
});

test('localStorage 损坏时静默回默认', () => {
  const original = globalThis.localStorage;
  const store = new Map([['aetherkeep:prefs:v1', '{not json']]);
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.deepEqual(readPrefs(), {});
  writePrefs({ tier: 'ultra', mute: false });
  const saved = JSON.parse(store.get('aetherkeep:prefs:v1'));
  assert.equal(saved.tier, 'ultra');
  assert.equal(saved.mute, false);
  globalThis.localStorage = original;
});

test('localStorage 版本不符时回默认', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ v: 999, tier: 'ultra' }),
    setItem: () => {},
  };
  assert.deepEqual(readPrefs(), {});
  globalThis.localStorage = original;
});

test('localStorage 完全不可用时也不抛错', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = undefined;
  assert.doesNotThrow(() => readPrefs());
  assert.doesNotThrow(() => writePrefs({ tier: 'low' }));
  globalThis.localStorage = original;
});
