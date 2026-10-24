/**
 * 开场三幕（规划案 §4.2、T12）
 *
 * 6 秒镜头编排：云隙打开 → 远处塔楼显露 → 镜头轻推主塔 → 回到英雄机位。
 * 任意用户操作在 100ms 内终止 intro 并交还 OrbitControls。
 * prefers-reduced-motion 或 URL intro=0 时整段跳过。
 */

import * as THREE from 'three';

import { INTRO } from '../config/visual.js';

/** 关键帧：时间(ms) + 相机位置 + 目标 */
const KEYS = Object.freeze([
  { at: 0, position: [320, 168, 412], target: [0, 18, 0] },
  { at: 1400, position: [258, 132, 330], target: [0, 24, 0] },
  { at: 3100, position: [104, 78, 152], target: [0, 58, -6] },
  { at: 4800, position: [206, 108, 274], target: [0, 24, 0] },
  { at: 6000, position: [192, 102, 258], target: [0, 24, 0] },
]);

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createIntro({ camera, rig, onAct }) {
  let state = 'playing';
  let elapsed = 0;
  let lastActIndex = -1;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  /**
   * @param {number} dt
   * @returns {boolean} 是否仍在播放
   */
  function update(dt) {
    if (state !== 'playing') return false;
    elapsed += dt * 1000;

    // 当前所在的片段
    let index = 0;
    for (let i = 0; i < KEYS.length - 1; i += 1) {
      if (elapsed >= KEYS[i].at && elapsed < KEYS[i + 1].at) {
        index = i;
        break;
      }
      if (elapsed >= KEYS[KEYS.length - 1].at) index = KEYS.length - 2;
    }

    if (index !== lastActIndex) {
      lastActIndex = index;
      onAct?.(INTRO.acts[Math.min(index, INTRO.acts.length - 1)]?.label ?? '');
    }

    const a = KEYS[index];
    const b = KEYS[index + 1];
    const span = Math.max(1, b.at - a.at);
    const t = easeInOut(Math.min(1, Math.max(0, (elapsed - a.at) / span)));

    from.set(...a.position);
    to.set(...b.position);
    camera.position.lerpVectors(from, to, t);
    fromTarget.set(...a.target);
    toTarget.set(...b.target);
    rig.controls.target.lerpVectors(fromTarget, toTarget, t);
    rig.controls.update();

    if (elapsed >= INTRO.totalMs) {
      state = 'complete';
      return false;
    }
    return true;
  }

  /** 用户操作打断 */
  function interrupt() {
    if (state === 'playing') {
      state = 'skipped';
      return true;
    }
    return false;
  }

  function skip() {
    state = 'skipped';
  }

  return {
    update,
    interrupt,
    skip,
    get state() { return state; },
    get progress() { return Math.min(1, elapsed / INTRO.totalMs); },
  };
}
