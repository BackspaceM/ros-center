'use strict';
/* 为 Tauri 桌面壳准备资源：
   1) 复制内置 Node 运行时到 dist/tauri-assets/bin/
   2) 复制应用源码到 dist/tauri-assets/app/
   3) 生成 Tauri 所需图标（PNG/ICNS/ICO）到 src-tauri/icons/
   4) 建 dist/tauri-ui 占位（窗口实际加载本地服务 URL）
   用法：node build/tauri-assets.js [--arch=arm64|x64|win]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, DIST, BASE, TARGETS, VERSION, macTarget, download, extractNode } = require('./stage');
const { renderPNG, renderRaw } = require('./make-favicon');

const ICON_DIR = path.join(ROOT, 'src-tauri', 'icons');
const ASSETS = path.join(DIST, 'tauri-assets');
const UI = path.join(DIST, 'tauri-ui');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name), to = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(from, to);
    else if (e.isFile()) fs.copyFileSync(from, to);
  }
}

/* Tauri 需要：32/128/256 PNG + icon.icns + icon.ico */
function makeIcons() {
  fs.mkdirSync(ICON_DIR, { recursive: true });
  for (const size of [32, 128, 256]) {
    fs.writeFileSync(path.join(ICON_DIR, size === 128 ? '128x128.png' : `${size}x${size}.png`), renderPNG(size));
  }
  fs.writeFileSync(path.join(ICON_DIR, '128x128@2x.png'), renderPNG(256));
  /* ICNS / ICO 直接复用安装器生成好的 */
  const icns = path.join(DIST, 'icons', 'appicon.icns'), ico = path.join(DIST, 'icons', 'appicon.ico');
  if (fs.existsSync(icns)) fs.copyFileSync(icns, path.join(ICON_DIR, 'icon.icns'));
  if (fs.existsSync(ico)) fs.copyFileSync(ico, path.join(ICON_DIR, 'icon.ico'));
  if (!fs.existsSync(path.join(ICON_DIR, 'icon.icns')) || !fs.existsSync(path.join(ICON_DIR, 'icon.ico'))) {
    console.log('generating base icons...');
    execFileSync(process.execPath, [path.join(ROOT, 'build', 'make-icons.js')], { stdio: 'inherit' });
    if (fs.existsSync(icns)) fs.copyFileSync(icns, path.join(ICON_DIR, 'icon.icns'));
    if (fs.existsSync(ico)) fs.copyFileSync(ico, path.join(ICON_DIR, 'icon.ico'));
  }
}

function build() {
  const arg = (process.argv.find((a) => a.startsWith('--arch=')) || '').split('=')[1];
  const t = arg === 'win' ? TARGETS.find((x) => x.key === 'win')
    : arg === 'x64' ? macTarget('x64') : macTarget('arm64');
  console.log('Tauri assets target:', t.key);

  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(UI, { recursive: true });
  fs.writeFileSync(path.join(UI, 'index.html'), '<!doctype html><meta charset="utf-8"><title>ROS Center</title><body style="margin:0;background:#0b1220;color:#9aa;font:14px system-ui;display:grid;place-items:center;height:100vh">正在启动 ROS Center…</body>');

  /* 内置 Node 运行时 */
  const { tmp, nodeBin } = extractNode(t, download(t));
  const binDir = path.join(ASSETS, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(nodeBin, path.join(binDir, t.bin));
  fs.chmodSync(path.join(binDir, t.bin), 0o755);

  /* 应用源码（与 app-bundle.js 同源文件集） */
  const appDir = path.join(ASSETS, 'app');
  fs.mkdirSync(appDir, { recursive: true });
  const { ROOT_FILES } = require('./app-bundle');
  for (const f of ROOT_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(appDir, f));
  copyDir(path.join(ROOT, 'public'), path.join(appDir, 'public'));
  fs.writeFileSync(path.join(appDir, 'version.json'), JSON.stringify({ version: VERSION }) + '\n');

  makeIcons();
  console.log('Tauri assets ready:', ASSETS, '| icons:', ICON_DIR);
}

if (require.main === module) build();
module.exports = { build, ASSETS, ICON_DIR };
