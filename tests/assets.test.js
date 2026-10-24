/**
 * 资产完整性与出处证据单测（规划案 §5.4 / T04）
 * 运行：node --test tests/assets.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { MATERIAL_FILES } from '../src/config/visual.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('资产清单存在且结构完整', () => {
  const manifest = readJson('public/assets/manifest.json');
  assert.ok(manifest, 'manifest.json 必须存在');
  assert.ok(Array.isArray(manifest.entries) && manifest.entries.length > 0,
    'manifest 的 entries 不能为空');
});

test('8 组材质 × 3 张贴图全部在仓内', () => {
  const names = Object.keys(MATERIAL_FILES);
  assert.equal(names.length, 8, '规划案要求 8 种材质');
  for (const name of names) {
    const spec = MATERIAL_FILES[name];
    for (const channel of ['albedo', 'normal', 'roughness']) {
      const rel = path.join('public', 'assets', 'materials', spec[channel]);
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `缺少 ${rel}`);
      assert.ok(fs.statSync(path.join(ROOT, rel)).size > 0, `${rel} 是空文件`);
    }
  }
});

test('海报存在且为 index.html 引用的文件名', () => {
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'poster', 'poster.jpg')),
    'public/assets/poster/poster.jpg 必须存在');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('./assets/poster/poster.jpg'), 'index.html 必须引用 poster.jpg');
});

test('本地字体齐备且带 OFL 许可证', () => {
  const fontDir = path.join(PUBLIC, 'assets', 'fonts');
  const files = fs.readdirSync(fontDir);
  assert.ok(files.some((f) => f.includes('noto-sans-sc')), '缺 Noto Sans SC');
  assert.ok(files.some((f) => f.includes('noto-serif-sc')), '缺 Noto Serif SC');
  assert.ok(files.some((f) => f.includes('inter')), '缺 Inter');
  assert.ok(files.some((f) => /ofl/i.test(f)), '缺 OFL 许可证文件');
  assert.ok(files.includes('fonts.css'), '缺 fonts.css');
});

test('index.html 不引用任何外部字体或 CDN', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/fonts\.googleapis\.com/.test(html), '不得引用 Google Fonts');
  assert.ok(!/cdn\./.test(html), '不得引用 CDN');
  assert.ok(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org/g, '')),
    'index.html 不得出现任何外部 URL');
});

test('出处的 sha256 与磁盘文件一致', () => {
  const manifest = readJson('public/assets/manifest.json');
  for (const entry of manifest.entries) {
    if (!entry.relativePath && !entry.file) continue;
    const rel = entry.relativePath ?? entry.file;
    const abs = path.join(ROOT, 'public', rel);
    if (!fs.existsSync(abs)) continue;
    if (entry.sha256) {
      assert.equal(sha256(abs), entry.sha256, `${rel} 的 sha256 与清单不一致`);
    }
  }
});

test('PROVENANCE 记录了每个 AI 素材的 prompt 与 node id', () => {
  const provenance = fs.readFileSync(path.join(PUBLIC, 'assets', 'PROVENANCE.md'), 'utf8');
  for (const name of Object.keys(MATERIAL_FILES)) {
    assert.ok(provenance.includes(name), `PROVENANCE 缺少 ${name}`);
  }
  // 必须有 node id（构建期可追溯）与提示词
  assert.ok(/\b455\d{12}\b/.test(provenance), 'PROVENANCE 必须记录 node id');
  assert.ok(provenance.includes('seamless tileable texture'), 'PROVENANCE 必须记录完整提示词');
  assert.ok(provenance.includes('OFL'), 'PROVENANCE 必须记录字体许可');
});

test('贴图体积在预算内', () => {
  const budgets = { albedo: 1.2 * 1024 * 1024, normal: 0.8 * 1024 * 1024, roughness: 0.35 * 1024 * 1024 };
  for (const [name, spec] of Object.entries(MATERIAL_FILES)) {
    for (const channel of ['albedo', 'normal', 'roughness']) {
      const size = fs.statSync(path.join(PUBLIC, 'assets', 'materials', spec[channel])).size;
      assert.ok(size <= budgets[channel],
        `${name}-${channel} 为 ${(size / 1024 / 1024).toFixed(2)}MB，超过预算 ${(budgets[channel] / 1024 / 1024).toFixed(2)}MB`);
    }
  }
});

test('全部运行时资产总量在 16MB 预算内', () => {
  let total = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) walk(abs);
      else total += stat.size;
    }
  };
  walk(path.join(PUBLIC, 'assets'));
  assert.ok(total <= 16 * 1024 * 1024,
    `运行时资产总量 ${(total / 1024 / 1024).toFixed(2)}MB，超过 16MB 预算`);
});
