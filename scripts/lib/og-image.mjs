/**
 * 分享预览图生成器（1200×630 PNG），零依赖。
 *
 * 组成：纯色渐变底 + 站点标记（大写 Y）+ 三条项目横线 + 底部细线。
 * 按 tone（0-5）换配色，所以每个项目的预览图色系不同；
 * 想换成真实截图，把图放到 content/covers/<slug>.png 即可（构建脚本会优先用它）。
 */
import { deflateSync } from 'node:zlib';

const W = 1200;
const H = 630;

/** 6 组配色，与 styles.css 的 .tone-0 ~ .tone-5 对应 */
const TONES = [
  { bg: [[14, 44, 37], [26, 72, 58]], mark: [150, 214, 186] },   // 青
  { bg: [[20, 28, 52], [34, 46, 82]], mark: [170, 184, 236] },   // 靛
  { bg: [[46, 34, 15], [72, 54, 25]], mark: [226, 198, 142] },   // 琥珀
  { bg: [[44, 21, 29], [72, 35, 47]], mark: [232, 170, 184] },   // 玫瑰
  { bg: [[25, 33, 17], [43, 55, 31]], mark: [186, 206, 148] },   // 苔绿
  { bg: [[25, 31, 39], [43, 53, 65]], mark: [174, 190, 206] },   // 石板
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function renderOgImage({ tone = 0 } = {}) {
  const palette = TONES[((tone % 6) + 6) % 6];
  const px = new Uint8Array(W * H * 4);

  const over = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 4;
    const da = px[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    px[i] = Math.round((r * a + px[i] * da * (1 - a)) / oa);
    px[i + 1] = Math.round((g * a + px[i + 1] * da * (1 - a)) / oa);
    px[i + 2] = Math.round((b * a + px[i + 2] * da * (1 - a)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };

  const capsule = (x0, y0, x1, y1, width, color, alpha = 1) => {
    const [r, g, b] = color;
    const half = width / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y0, y1) - half - 2); y <= Math.ceil(Math.max(y0, y1) + half + 2); y += 1) {
      for (let x = Math.floor(Math.min(x0, x1) - half - 2); x <= Math.ceil(Math.max(x0, x1) + half + 2); x += 1) {
        const t = clamp01(((x - x0) * dx + (y - y0) * dy) / len2);
        const dist = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
        const cov = clamp01(half + 0.5 - dist);
        if (cov > 0) over(x, y, r, g, b, cov * alpha);
      }
    }
  };

  const roundRect = (x0, y0, w, h, radius, color, alpha = 1) => {
    const [r, g, b] = color;
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - 1 - radius));
        const dy = Math.max(y0 + radius - y, 0, y - (y0 + h - 1 - radius));
        const cov = clamp01(radius + 0.5 - Math.hypot(dx, dy));
        if (cov > 0) over(x, y, r, g, b, alpha * cov);
      }
    }
  };

  /* 1. 背景竖向渐变 */
  const [top, bottom] = palette.bg;
  for (let y = 0; y < H; y += 1) {
    const t = y / (H - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < W; x += 1) over(x, y, r, g, b, 1);
  }

  /* 2. 斜向亮带 */
  const mark = palette.mark;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const a = clamp01(1 - Math.abs((x * 0.55 + y) - 520) / 150) * 0.16;
      if (a > 0) over(x, y, mark[0], mark[1], mark[2], a);
    }
  }

  /* 3. 站点标记：大写 Y */
  const cx = 430;
  capsule(cx - 118, 196, cx, 330, 52, mark);
  capsule(cx + 118, 196, cx, 330, 52, mark);
  capsule(cx, 318, cx, 436, 52, mark);

  /* 4. 右侧三条横线（象征项目列表） */
  const white = [240, 238, 233];
  roundRect(640, 236, 340, 26, 13, white, 0.92);
  roundRect(640, 292, 250, 18, 9, white, 0.42);
  roundRect(640, 332, 300, 18, 9, white, 0.30);
  roundRect(640, 372, 190, 18, 9, white, 0.22);

  /* 5. 底部细线 + 左上角标 */
  roundRect(96, 576, 1008, 3, 2, mark, 0.45);
  roundRect(96, 96, 54, 8, 4, mark, 0.85);

  return encodePng(px);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y += 1) {
    const rowStart = y * (W * 4 + 1);
    raw[rowStart] = 0;
    for (let i = 0; i < W * 4; i += 1) raw[rowStart + 1 + i] = px[y * W * 4 + i];
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
