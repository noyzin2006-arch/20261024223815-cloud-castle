#!/usr/bin/env node
/**
 * 对比度校验（规划案 §3.1「对比度铁律」/ §8.4 A2 / T02）
 *
 * 直接读 src/ui/tokens.css 的令牌，**不另建一份色表** ——
 * 校验的就是真实在用的那些值。
 *
 * 判定门槛（WCAG 2.2）：
 *   正文文字 vs 背景        ≥ 4.5:1
 *   大字 / 控件边框 / 图标  ≥ 3:1
 *   禁用态文字 vs 背景      ≥ 2:1
 *
 * 用法：node scripts/check-contrast.mjs [--report reports/contrast.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** 读取 tokens.css 里的 --name: value */
function readTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
  /** @type {Record<string, string>} */
  const tokens = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = re.exec(css)) !== null) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** #rrggbb → [r,g,b] */
function parseHex(value) {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6) throw new Error(`不是合法的 hex：${value}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 需要校验的组合 */
const PAIRS = [
  { fg: 'fg0', bg: 'bg0', min: 4.5, label: '主文字 / 页面底色' },
  { fg: 'fg1', bg: 'bg0', min: 4.5, label: '正文 / 页面底色' },
  { fg: 'fg1', bg: 'bg1', min: 4.5, label: '正文 / 面板底色' },
  { fg: 'fg1', bg: 'bg3', min: 4.5, label: '正文 / 对话框底色' },
  { fg: 'fg2', bg: 'bg1', min: 4.5, label: '次要文字 / 面板底色' },
  { fg: 'fg2', bg: 'bg3', min: 4.5, label: '次要文字 / 对话框底色' },
  { fg: 'fg-inverse', bg: 'accent', min: 4.5, label: '金底按钮文字 / 金色底' },
  { fg: 'line', bg: 'bg0', min: 3.0, label: '控件边框 / 页面底色' },
  { fg: 'line', bg: 'bg1', min: 3.0, label: '控件边框 / 面板底色' },
  { fg: 'line-strong', bg: 'bg1', min: 3.0, label: '强边框 / 面板底色' },
  { fg: 'focus', bg: 'bg1', min: 3.0, label: '焦点环 / 面板底色' },
  { fg: 'fg1', bg: 'bg2', min: 3.0, label: '图标 / 悬停底色' },
  { fg: 'ok', bg: 'bg3', min: 3.0, label: '成功语义色 / 对话框底色' },
  { fg: 'warn', bg: 'bg3', min: 3.0, label: '警告语义色 / 对话框底色' },
  { fg: 'error', bg: 'bg3', min: 3.0, label: '错误语义色 / 对话框底色' },
  { fg: 'info', bg: 'bg3', min: 3.0, label: '信息语义色 / 对话框底色' },
  { fg: 'accent', bg: 'bg0', min: 3.0, label: '强调色 / 页面底色' },
  { fg: 'light-fg', bg: 'bg-light', min: 4.5, label: '浅色页正文 / 浅色底' },
  { fg: 'light-secondary', bg: 'bg-light', min: 4.5, label: '浅色页次文 / 浅色底' },
  { fg: 'light-accent', bg: 'bg-light', min: 4.5, label: '浅色页强调 / 浅色底' },
  { fg: 'light-line', bg: 'bg-light', min: 3.0, label: '浅色页边框 / 浅色底' },
  // 禁用态：允许降到 2:1，但必须仍可辨认
  { fg: 'fg2', bg: 'bg2', min: 2.0, label: '禁用态文字 / 控件底色' },
];

function main() {
  const tokens = readTokens();
  const results = [];
  let failed = 0;

  for (const pair of PAIRS) {
    const fgRaw = tokens[pair.fg];
    const bgRaw = tokens[pair.bg];
    if (!fgRaw || !bgRaw) {
      results.push({ ...pair, pass: false, ratio: 0, note: `令牌缺失：${pair.fg}=${fgRaw} ${pair.bg}=${bgRaw}` });
      failed += 1;
      continue;
    }
    const ratio = contrast(parseHex(fgRaw), parseHex(bgRaw));
    const pass = ratio >= pair.min;
    if (!pass) failed += 1;
    results.push({ ...pair, fgValue: fgRaw, bgValue: bgRaw, ratio: Number(ratio.toFixed(3)), pass });
  }

  const reportIndex = process.argv.indexOf('--report');
  const reportPath = reportIndex > -1
    ? path.resolve(ROOT, process.argv[reportIndex + 1])
    : path.join(ROOT, 'reports', 'contrast.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf8');

  console.log('══════ 对比度校验 ══════');
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label}：${r.ratio?.toFixed(2) ?? '—'} / 阈值 ${r.min}${r.note ? `（${r.note}）` : ''}`);
  }
  console.log(`  → ${results.length - failed}/${results.length} 通过，报告：${path.relative(ROOT, reportPath)}`);

  process.exit(failed === 0 ? 0 : 3);
}

main();
