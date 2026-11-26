'use strict';
/* 生成安装器图标：dist/icons/appicon.icns (macOS) 与 dist/icons/appicon.ico (Windows)。
   纯 Node 生成，无第三方依赖；ICNS 依赖系统 iconutil，只在 macOS 上生成。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { renderPNG, renderRaw } = require('./make-favicon');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(DIST, 'icons');
fs.mkdirSync(OUT, { recursive: true });

/* ---- Windows ICO：传统 BMP(DIB) 条目，兼容性优于 PNG 压缩条目 ---- */
function dib(size) {
  const px = renderRaw(size);
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;  // DIB 自下而上
    for (let x = 0; x < size; x++) {
      const i = src + x * 4, o = (y * size + x) * 4;
      xor[o] = px[i + 2]; xor[o + 1] = px[i + 1]; xor[o + 2] = px[i]; xor[o + 3] = px[i + 3];
    }
  }
  const rowBytes = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(rowBytes * size);  // 全 0 = 完全不透明
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0);
  hdr.writeInt32LE(size, 4);
  hdr.writeInt32LE(size * 2, 8);
  hdr.writeUInt16LE(1, 12);
  hdr.writeUInt16LE(32, 14);
  hdr.writeUInt32LE(xor.length + and.length, 20);
  return Buffer.concat([hdr, xor, and]);
}

function makeIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map(dib);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + sizes.length * 16;
  const entries = [];
  for (let i = 0; i < sizes.length; i++) {
    const e = Buffer.alloc(16);
    const s = sizes[i];
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(e);
  }
  const file = path.join(OUT, 'appicon.ico');
  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...images]));
  console.log('ico:', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

/* ---- macOS ICNS：构造 iconset 后交给 iconutil ---- */
function makeIcns() {
  if (process.platform !== 'darwin') {
    console.log('skip icns: not macOS');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ros-iconset-'));
  const set = path.join(tmp, 'AppIcon.iconset');
  fs.mkdirSync(set);
  const pairs = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
  ];
  for (const [size, name] of pairs) fs.writeFileSync(path.join(set, name), renderPNG(size));
  const file = path.join(OUT, 'appicon.icns');
  execFileSync('iconutil', ['-c', 'icns', set, '-o', file], { stdio: 'pipe' });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('icns:', file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}

makeIco();
makeIcns();
