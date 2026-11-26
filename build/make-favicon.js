'use strict';
/* 由同一套图形生成 PNG favicon 与原始 RGBA 像素（无第三方依赖）。
   直接运行：生成 public/favicon.png / apple-touch-icon.png
   被 build/make-icons.js 复用：生成 macOS .icns 与 Windows .ico */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OUT = path.join(__dirname, '..', 'public');

function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function insideRound(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function blend(px, size, x, y, color, alpha) {
  const i = (y * size + x) * 4;
  for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - alpha) + color[k] * alpha);
  px[i + 3] = Math.max(px[i + 3], Math.round(alpha * 255));
}

/* 返回 RGBA 像素（size*size*4）
   与 public/favicon.svg 同源：中心节点 + 三向连线的网络拓扑造型。
   4x 超采样后降采样，保证小尺寸(16/32px)也清晰；桌面版 icns/ico 复用本函数。 */
function renderRaw(size) {
  const S = size * 4, sc = S / 64;
  const buf = new Float64Array(S * S * 4);
  const set = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) buf[i + k] = buf[i + k] * (1 - a) + c[k] * a;
    buf[i + 3] = Math.min(1, buf[i + 3] + a);
  };
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const inRoundRect = (x, y, r) => {
    const cx = Math.max(r, Math.min(S - r, x)), cy = Math.max(r, Math.min(S - r, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= S - r && y >= r && y <= S - r);
  };
  const C0 = [10, 132, 255], C1 = [0, 86, 210], WHITE = [255, 255, 255], BLUE = [4, 102, 232];
  /* 圆角矩形 + 对角渐变背景 */
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRoundRect(x + .5, y + .5, 16 * sc)) continue;
    set(x, y, lerp(C0, C1, (x / S + y / S) / 2), 1);
  }
  const line = (x1, y1, x2, y2, w) => {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
    for (let t = 0; t <= n; t++) {
      const px = x1 + (x2 - x1) * t / n, py = y1 + (y2 - y1) * t / n;
      for (let dy = -w * sc; dy <= w * sc; dy += sc) for (let dx = -w * sc; dx <= w * sc; dx += sc) {
        if (dx * dx + dy * dy <= (w * sc) ** 2) set(Math.round(px + dx), Math.round(py + dy), WHITE, .82);
      }
    }
  };
  const circle = (cx, cy, r, col) => {
    for (let y = Math.floor((cy - r) * sc); y <= Math.ceil((cy + r) * sc); y++)
      for (let x = Math.floor((cx - r) * sc); x <= Math.ceil((cx + r) * sc); x++) {
        const d = Math.hypot(x + .5 - cx * sc, y + .5 - cy * sc);
        if (d <= r * sc) set(x, y, col, Math.min(1, (r * sc - d) + .5));
      }
  };
  /* 三向连线 + 中心/卫星节点（坐标与 favicon.svg 一致） */
  line(32 * sc, 32 * sc, 32 * sc, 15 * sc, 1.3);
  line(32 * sc, 32 * sc, 15 * sc, 43 * sc, 1.3);
  line(32 * sc, 32 * sc, 49 * sc, 43 * sc, 1.3);
  circle(32, 14, 5, WHITE); circle(14, 44, 5, WHITE); circle(50, 44, 5, WHITE);
  circle(32, 32, 9, WHITE); circle(32, 32, 4, BLUE);
  /* 4x 降采样到目标尺寸 */
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const si = ((y * 4 + j) * S + (x * 4 + i)) * 4, alpha = buf[si + 3];
      r += buf[si] * alpha; g += buf[si + 1] * alpha; b += buf[si + 2] * alpha; a += alpha;
    }
    const di = (y * size + x) * 4;
    if (a > 0) { px[di] = Math.round(r / a); px[di + 1] = Math.round(g / a); px[di + 2] = Math.round(b / a); }
    px[di + 3] = Math.round(a / 16 * 255);
  }
  return px;
}

function renderPNG(size) {
  const px = renderRaw(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (require.main === module) {
  for (const [name, size] of [['favicon.png', 64], ['apple-touch-icon.png', 180]]) {
    fs.writeFileSync(path.join(OUT, name), renderPNG(size));
    console.log('generated', name, size + 'x' + size);
  }
}
module.exports = { renderPNG, renderRaw };
