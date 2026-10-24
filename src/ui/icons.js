/**
 * 原创内联图标（规划案 §3.1 / C08）
 *
 * 统一 viewBox 24×24、stroke 1.75、round join/cap。禁止 emoji 当界面图标。
 */

const PATHS = Object.freeze({
  camera: 'M3 8.5h3.2l1.6-2.4h8.4l1.6 2.4H21v10.5H3z M12 16.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7.5V12l3.2 2',
  cloud: 'M7.5 18h9.2a4.3 4.3 0 0 0 .6-8.55A6 6 0 0 0 6.2 10.9 3.6 3.6 0 0 0 7.5 18',
  sliders: 'M4 8h9 M17 8h3 M4 16h3 M11 16h9 M15 5.6v4.8 M7 13.6v4.8',
  reset: 'M20 12a8 8 0 1 1-2.6-5.9 M20 4v4.4h-4.4',
  orbit: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8 M3.6 9.5h16.8 M3.6 14.5h16.8',
  mute: 'M11 6 7.4 9H4.4v6h3l3.6 3z M15.5 9.5l4 5 M19.5 9.5l-4 5',
  sound: 'M11 6 7.4 9H4.4v6h3l3.6 3z M15 9.2a4 4 0 0 1 0 5.6 M17.8 6.4a8 8 0 0 1 0 11.2',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 4 M12 17.2h.01',
  close: 'M6 6l12 12 M18 6 6 18',
  check: 'M4.5 12.5l5 5 10-11',
  warn: 'M12 4 2.8 20h18.4z M12 10v4.6 M12 17.6h.01',
  chevron: 'M8 10l4 4 4-4',
  aperture: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 3v6 M12 15v6 M3 12h6 M15 12h6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5.5 M12 7.6h.01',
});

/**
 * 生成图标 SVG 字符串。
 * @param {keyof typeof PATHS} name
 * @returns {string}
 */
export function icon(name) {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/** 把页面上所有 [data-icon] 占位替换为真实 SVG */
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = /** @type {keyof typeof PATHS} */ (node.getAttribute('data-icon'));
    node.innerHTML = icon(name);
  });
}

export { PATHS };
