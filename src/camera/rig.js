/**
 * 相机装置（规划案 §4.4、T12）
 *
 * OrbitControls + 4 个预设机位 + 目标钳制 + 城堡碰撞球 + 窄屏自动退远 + 包围盒兜底。
 * 复位只回英雄机位（禁止把侧景存成默认）。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { CAMERA, WORLD } from '../config/visual.js';

export function createRig({ camera, canvas, onInteract }) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = CAMERA.controls.dampingFactor;
  controls.minDistance = CAMERA.controls.minDistance;
  controls.maxDistance = CAMERA.controls.maxDistance;
  controls.minPolarAngle = CAMERA.controls.minPolarAngle;
  controls.maxPolarAngle = CAMERA.controls.maxPolarAngle;
  controls.panSpeed = 0.7;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.85;
  controls.screenSpacePanning = false;

  const castleCenter = new THREE.Vector3(0, 20, 0);
  const target = new THREE.Vector3(...CAMERA.views.hero.target);
  const position = new THREE.Vector3(...CAMERA.views.hero.position);

  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
  controls.saveState();

  /** @type {{from: THREE.Vector3, to: THREE.Vector3, fromTarget: THREE.Vector3, toTarget: THREE.Vector3, start: number, duration: number} | null} */
  let tween = null;

  function notifyInteract() {
    onInteract?.();
  }

  controls.addEventListener('start', notifyInteract);
  canvas.addEventListener('wheel', notifyInteract, { passive: true });

  /**
   * 窄屏与构图兜底：保证主体永远完整在安全区内。
   * @param {THREE.Vector3[]} [subjectPoints] 主体的世界空间轮廓采样点
   */
  /** 主体缺省采样点（没有传真实轮廓时的兜底） */
  const DEFAULT_SUBJECT_POINTS = (() => {
    const list = [];
    for (let i = 0; i < 8; i += 1) {
      list.push(new THREE.Vector3(
        i & 1 ? 50 : -56,
        i & 2 ? 151.5 : 5,
        i & 4 ? 50 : -50,
      ));
    }
    return list;
  })();

  /** 最近一次取景计算的诊断数据 */
  const fitInfo = { spanX: 0, spanY: 0, halfY: 0, correction: 1, factor: 1 };

  function fitCamera(subjectPoints) {
    const aspect = camera.aspect;
    let factor = 1;

    if (aspect < CAMERA.narrowAspectThreshold) {
      factor *= CAMERA.narrowAspectDistanceFactor;
      controls.target.y = CAMERA.narrowAspectTargetY;
    }

    // 包围盒投影检查：超出视口就继续退远
    // 用**真实轮廓采样点**而不是包围盒角点：
    // 包围盒的角点包含「远侧高处」这类实际并不存在的组合，
    // 投影跨度会被严重高估，导致主体在画面里被压得过小。
    const points = subjectPoints ?? DEFAULT_SUBJECT_POINTS;

    let correction = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const probe = camera.clone();
      probe.aspect = aspect;
      probe.position.copy(controls.target).add(
        camera.position.clone().sub(controls.target).multiplyScalar(correction),
      );
      probe.lookAt(controls.target);
      probe.updateMatrixWorld();
      // probe 是 clone 出来的，matrixWorldInverse 还是原相机的逆矩阵，
      // 不更新的话 corner.project() 会用错误的视图变换。
      probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
      probe.updateProjectionMatrix();

      // 投影包围盒的 NDC 范围
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        const ndc = point.clone().project(probe);
        minX = Math.min(minX, ndc.x);
        maxX = Math.max(maxX, ndc.x);
        minY = Math.min(minY, ndc.y);
        maxY = Math.max(maxY, ndc.y);
      }
      const spanX = maxX - minX;
      const spanY = maxY - minY;

      // 两条硬规则同时成立：
      //  1) 主体必须**完整落在安全框内**（塔尖不能被切掉）
      //     —— 判据是投影边界到画面中心的距离，不是跨度
      //  2) 主体又不能小到不成立：规划案 §3.1 要求主体大致占
      //     x 34–70% / y 12–85%，所以跨度给一个下限
      const halfY = Math.max(Math.abs(maxY), Math.abs(minY));
      const halfX = Math.max(Math.abs(maxX), Math.abs(minX));

      let adjust = 1;
      if (halfY > CAMERA.subjectSafeHalfY) {
        // 超出安全框 → 退远。投影半跨度与相机距离成反比，所以乘以 halfY/safe。
        adjust = halfY / CAMERA.subjectSafeHalfY;
      } else if (spanY < CAMERA.subjectSpanTarget) {
        // 主体太小 → 拉近（距离乘以小于 1 的系数）
        adjust = spanY / CAMERA.subjectSpanTarget;
      }
      if (halfX > CAMERA.subjectSafeHalfX) {
        adjust = Math.max(adjust, halfX / CAMERA.subjectSafeHalfX);
      }

      fitInfo.spanX = spanX;
      fitInfo.spanY = spanY;
      fitInfo.halfY = halfY;
      if (Math.abs(adjust - 1) < 0.01) break;
      correction *= adjust;
      if (correction > CAMERA.maxFitCorrection) {
        correction = CAMERA.maxFitCorrection;
        break;
      }
      if (correction < CAMERA.minFitCorrection) {
        correction = CAMERA.minFitCorrection;
        break;
      }
    }
    factor *= correction;
    fitInfo.correction = correction;
    fitInfo.factor = factor;

    if (Math.abs(factor - 1) > 0.01) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).add(dir.multiplyScalar(dist * factor));
      controls.update();
    }
  }

  /** 目标钳制：X/Z ±65，Y -45..75 */
  function clampTarget() {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -WORLD.targetClampX, WORLD.targetClampX);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -WORLD.targetClampX, WORLD.targetClampX);
    controls.target.y = THREE.MathUtils.clamp(
      controls.target.y,
      WORLD.targetClampYMin,
      WORLD.targetClampYMax,
    );
  }

  /** 碰撞球：镜头不得进入围绕城堡的半径 65 球体 */
  function resolveCollision() {
    const offset = camera.position.clone().sub(castleCenter);
    const distance = offset.length();
    if (distance < WORLD.islandCollisionRadius) {
      const dir = distance > 1e-4 ? offset.normalize() : new THREE.Vector3(0, 0, 1);
      camera.position.copy(castleCenter).add(dir.multiplyScalar(WORLD.islandCollisionRadius));
    }
  }

  /**
   * 切换到预设机位。
   * @param {keyof typeof CAMERA.views} view
   * @param {number} [durationMs]
   */
  function goTo(view, durationMs = CAMERA.views[view]?.transitionMs ?? 900) {
    const preset = CAMERA.views[view];
    if (!preset) return;
    const to = new THREE.Vector3(...preset.position);
    const toTarget = new THREE.Vector3(...preset.target);

    if (durationMs <= 0) {
      camera.position.copy(to);
      controls.target.copy(toTarget);
      controls.update();
      return;
    }

    tween = {
      from: camera.position.clone(),
      to,
      fromTarget: controls.target.clone(),
      toTarget,
      start: performance.now(),
      duration: durationMs,
    };
  }

  /** 复位到英雄机位；复位完成后才允许 saveState */
  function reset() {
    tween = null;
    camera.position.set(...CAMERA.views.hero.position);
    controls.target.set(...CAMERA.views.hero.target);
    controls.update();
    controls.saveState();
    fitCamera();
  }

  /**
   * 每帧推进。
   * @param {number} dt
   */
  function update(dt) {
    if (tween) {
      const now = performance.now();
      const t = Math.min(1, (now - tween.start) / tween.duration);
      // cubic-bezier(.22,1,.36,1) 的近似缓动
      const eased = 1 - Math.pow(1 - t, 4);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      if (t >= 1) tween = null;
    }

    controls.update();
    clampTarget();
    resolveCollision();
  }

  function resize(width, height) {
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  return {
    controls,
    camera,
    goTo,
    reset,
    update,
    resize,
    fitCamera,
    get fitInfo() {
      return { ...fitInfo };
    },
    get isAnimating() {
      return tween !== null;
    },
    dispose() {
      controls.dispose();
    },
  };
}
