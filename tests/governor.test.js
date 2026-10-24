/**
 * 连续帧调速器单测（规划案 T13）
 * 运行：node --test tests/governor.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGovernor, DEGRADE_ORDER } from '../src/core/governor.js';
import { GOVERNOR, TIERS } from '../src/config/visual.js';

/** 用极小的窗口与暖机，便于快速测试 */
function fastGovernor(overrides = {}) {
  return createGovernor({
    windowFrames: 10,
    warmupFrames: 0,
    ...overrides,
  });
}

/**
 * 喂 n 帧，每帧 frameMs 毫秒。
 * 调速器每收满一个窗口（windowFrames 帧）才评估一次，
 * 所以这里用「连续喂」而不是按窗口切块。
 *
 * 时钟必须在所有调用之间**单调递增**：调速器用 now 判断冷却期，
 * 如果每次调用都从 0 开始，冷却期就永远不会结束。
 */
let clock = 0;
let frameId = 0;

function feed(governor, n, frameMs) {
  let last = { type: 'none' };
  for (let i = 0; i < n; i += 1) {
    clock += 16.67;
    frameId += 1;
    last = governor.observe(frameMs, frameId, clock);
  }
  return last;
}

/** 一直喂，直到出现非 none 的动作（或超过上限） */
function feedUntil(governor, frameMs, maxFrames = 600) {
  let last = { type: 'none' };
  for (let i = 0; i < maxFrames; i += 1) {
    clock += 16.67;
    frameId += 1;
    last = governor.observe(frameMs, frameId, clock);
    if (last.type !== 'none') return last;
  }
  return last;
}

test('窗口未填满时不做任何决策', () => {
  const g = fastGovernor();
  const action = feed(g, 5, 40);
  assert.equal(action.type, 'none');
});

test('连续 3 个过载窗口触发降倍率', () => {
  const g = fastGovernor();
  g.setTier('balanced', false);
  const start = g.scale;
  const action = feedUntil(g, 40);
  assert.equal(action.type, 'scale-down');
  assert.ok(g.scale < start, `倍率应下降，实际 ${g.scale}`);
  assert.ok(Math.abs(start - g.scale - GOVERNOR.scaleStepDown) < 1e-9);
});

test('单个过载窗口不足以降级（必须连续 3 个窗口）', () => {
  const g = fastGovernor();
  g.setTier('balanced', false);
  const start = g.scale;
  // 只喂 1 个窗口多一点
  feed(g, 12, 40);
  assert.equal(g.scale, start, '一个窗口不触发降级');
});

test('冷却期内不再重复降级', () => {
  const g = fastGovernor({ cooldownDownMs: 5000 });
  g.setTier('balanced', false);
  const start = g.scale;
  feedUntil(g, 40); // 第一次降级
  const after = g.scale;
  assert.ok(after < start);
  // 冷却期 5000ms ≈ 300 帧，这里只喂 100 帧（≈1667ms），必然还在冷却期内
  feed(g, 100, 40);
  assert.equal(g.scale, after, '冷却期内倍率不应继续下降');
});

test('倍率降到下限后按固定顺序降级能力', () => {
  const g = fastGovernor({ scaleStepDown: 10 }); // 一步就到底
  g.setTier('balanced', false);
  // 先把倍率降到底
  let action = feedUntil(g, 40);
  assert.equal(action.type, 'scale-down');
  // 再次过载 → 进入能力降级
  action = feedUntil(g, 40);
  assert.equal(action.type, 'degrade');
  assert.equal(action.degrade, DEGRADE_ORDER[0], '第一个被降级的必须是顺序表里的第一个');

  const seen = [action.degrade];
  for (let w = 0; w < 6; w += 1) {
    const next = feedUntil(g, 40);
    if (next.type === 'degrade') seen.push(next.degrade);
  }
  assert.ok(seen.length >= 3, `应依次降级多个能力，实际 ${seen.length}`);
  // 顺序必须与 DEGRADE_ORDER 一致
  const indices = seen.map((k) => DEGRADE_ORDER.indexOf(k));
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] >= indices[i - 1], `降级顺序错乱：${seen.join(' → ')}`);
  }
});

test('余量充足时缓慢升回被降过的倍率', () => {
  // 冷却期设为 0，让测试能在有限帧内走完「降 → 升」
  const g = fastGovernor({ cooldownDownMs: 0, cooldownUpMs: 0 });
  g.setTier('balanced', false);
  feedUntil(g, 40); // 先被过载压低倍率
  const low = g.scale;
  assert.ok(low < TIERS.balanced.scale, `倍率应先被压低，实际 ${low}`);
  const action = feedUntil(g, 8);
  assert.ok(action.type === 'scale-up' || action.type === 'restore', `应升回，实际 ${action.type}`);
  assert.ok(g.scale > low, `倍率应上升，实际 ${g.scale} ≤ ${low}`);
});

test('倍率不会升到档位上限之外', () => {
  const g = fastGovernor({ cooldownDownMs: 0, cooldownUpMs: 0 });
  g.setTier('balanced', false);
  feed(g, 300, 8); // 长时间宽裕
  assert.ok(g.scale <= TIERS.balanced.scale + 1e-9, `倍率 ${g.scale} 超过档位上限`);
});

test('手动锁档时调速器不换档', () => {
  const g = fastGovernor();
  g.setTier('ultra', true);
  feedUntil(g, 60);
  assert.equal(g.snapshot().tier, 'ultra', '手动锁档不得被调速器换掉');
  assert.equal(g.snapshot().manualLocked, true);
});

test('页面不可见时暂停观测并重置窗口', () => {
  const g = fastGovernor();
  g.setTier('balanced', false);
  feed(g, 5, 40);
  g.setPaused(true);
  const action = g.observe(40, 99, 10000);
  assert.equal(action.type, 'none');
  assert.equal(g.snapshot().sampleCount, 0, '暂停后窗口应被清空');
});

test('reset 会清空窗口与计数', () => {
  const g = fastGovernor();
  feed(g, 8, 40);
  g.reset();
  assert.equal(g.snapshot().sampleCount, 0);
});

test('切换档位会重置降级状态与倍率', () => {
  const g = fastGovernor();
  g.setTier('balanced', false);
  for (let w = 0; w < 4; w += 1) feed(g, 10, 40);
  g.setTier('ultra', false);
  assert.equal(g.snapshot().degraded && Object.keys(g.snapshot().degraded).length, 0);
  assert.equal(g.scale, TIERS.ultra.scale);
});

test('快照里不含 NaN', () => {
  const g = fastGovernor();
  feed(g, 10, 20);
  const snap = g.snapshot();
  for (const [key, value] of Object.entries(snap)) {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `快照字段 ${key} 非有限值：${value}`);
    }
  }
});
