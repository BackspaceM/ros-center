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

/* 返回 RGBA 像素（size*size*4） */
function renderRaw(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 64;
  const bars = [
    [17, 36, 5, 12, 0.60], [25, 28, 5, 20, 0.78],
    [33, 32, 5, 16, 0.90], [41, 20, 5, 28, 1.00],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const vx = x / s, vy = y / s;
      if (insideRound(vx, vy, 0, 0, 64, 64, 14)) blend(px, size, x, y, [0, 111, 255], 1);
      for (const [bx, by, bw, bh, a] of bars) {
        if (insideRound(vx, vy, bx, by, bw, bh, 2.5)) blend(px, size, x, y, [255, 255, 255], a);
      }
    }
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
