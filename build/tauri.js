'use strict';
/* 构建 Tauri 2 桌面版（真 GUI 窗口 + 托盘，无浏览器/无 CMD 黑框）。
   流程：准备资源（内置 Node + app 源码 + 图标）→ tauri build → 输出安装包。
   用法：
     node build/tauri.js --arch=arm64|x64|win      准备资源并编译
   依赖：Rust 工具链（cargo）+ 目标平台系统工具链（macOS Xcode / Windows MSVC + NSIS）。
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, DIST, VERSION, sha256 } = require('./stage');
const { build: prepareAssets } = require('./tauri-assets');

const arg = (process.argv.find((a) => a.startsWith('--arch=')) || '').split('=')[1] || 'arm64';
const arch = ['arm64', 'x64', 'win'].includes(arg) ? arg : 'arm64';
const TAURI_DIR = path.join(ROOT, 'src-tauri');

function run(cmd, args, opts) {
  console.log('+', cmd, args.join(' '));
  execFileSync(cmd, args, { cwd: TAURI_DIR, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
}

function build() {
  console.log('\n=== Tauri 2 桌面版 (' + arch + ') ===');
  prepareAssets();

  /* 同步版本号到 Tauri 配置 */
  const cfgPath = path.join(TAURI_DIR, 'tauri.conf.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.version = VERSION;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  const cargoPath = path.join(TAURI_DIR, 'Cargo.toml');
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${VERSION}"`);
  fs.writeFileSync(cargoPath, cargo);

  /* cargo tauri build：优先用 tauri CLI，无则 cargo build（产物为裸二进制，CI 仍可打包） */
  const target = arch === 'win' ? 'x86_64-pc-windows-msvc'
    : arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin';
  let hasCli = false;
  try { execFileSync('cargo', ['tauri', '--version'], { stdio: 'pipe' }); hasCli = true; } catch (e) { /* no cli */ }
  if (hasCli) {
    run('cargo', ['tauri', 'build', '--target', target]);
  } else {
    console.warn('cargo-tauri CLI 未安装，使用 cargo build（不生成安装包）');
    run('cargo', ['build', '--release', '--target', target]);
  }

  /* 收集产物并生成 sha256 */
  const bundleDir = path.join(TAURI_DIR, 'target', target, 'release', 'bundle');
  if (fs.existsSync(bundleDir)) {
    const walk = (dir, out) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(dmg|app\.tar\.gz|msi|exe|AppImage|deb)$/.test(e.name)) out.push(p);
      }
    };
    const bins = []; walk(bundleDir, bins);
    for (const b of bins) {
      const dest = path.join(DIST, 'tauri-' + path.basename(b));
      fs.copyFileSync(b, dest);
      fs.writeFileSync(dest + '.sha256', sha256(dest) + '  ' + path.basename(dest) + '\n');
      console.log('产物:', dest, (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + ' MB');
    }
  } else {
    console.log('未找到 bundle 目录，裸二进制在', path.join(TAURI_DIR, 'target', target, 'release'));
  }
}

if (require.main === module) build();
module.exports = { build };
