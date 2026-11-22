'use strict';
/* 构建 macOS 安装包：ROS-Center-<version>-macos-<arch>.pkg 与 .dmg
   用法：node build/macos-installer.js [--arch=arm64|x64|all]
   默认按本机架构；--arch=all 会同时产出 arm64 与 x64（CI 推荐）。
   .app 内只放只读程序文件；配置/数据写到 ~/Library/Application Support/ROS Center。 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { DIST, VERSION, macTarget, stage, copyDir, sha256 } = require('./stage');

if (process.platform !== 'darwin') {
  console.error('macOS installer must be built on macOS');
  process.exit(1);
}

const NAME = 'ROS Center';
const APP = NAME + '.app';
const WORK = path.join(DIST, 'stage', 'macos-installer');
const ICON_DIR = path.join(DIST, 'icons');
const arg = (process.argv.find((a) => a.startsWith('--arch=')) || '').split('=')[1];
const hostArch = execSync('uname -m').toString().trim() === 'arm64' ? 'arm64' : 'x64';
const ARCHES = arg === 'all' ? ['arm64', 'x64']
  : [arg || process.env.ROS_ARCH || hostArch];

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>${NAME}</string>
  <key>CFBundleIdentifier</key><string>cn.roscenter.desktop</string>
  <key>CFBundleExecutable</key><string>ros-center</string>
  <key>CFBundleIconFile</key><string>appicon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;

/* .app 主可执行文件：启动本地服务并打开浏览器 */
const LAUNCHER = `#!/bin/sh
set -eu
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
DATA="$HOME/Library/Application Support/ROS Center"
mkdir -p "$DATA"
if [ ! -f "$DATA/config.example.env" ]; then
  cp "$RES/config.example.env" "$DATA/config.example.env" 2>/dev/null || true
fi
export ROS_BASE_DIR="$DATA"
export ROS_DESKTOP=1
export HOST=127.0.0.1
cd "$RES"
exec "$RES/bin/node" "$RES/app/server.js"
`;

/* 终端里手动停止服务用（放在 Resources，便于排查） */
const STOP_COMMAND = `#!/bin/sh
PIDS=$(pgrep -f "[R]OS Center.app/Contents/Resources/bin/node" || true)
if [ -z "$PIDS" ]; then echo "ROS Center 未在运行"; exit 0; fi
echo "$PIDS" | xargs kill
echo "已停止 ROS Center (PID: $(echo "$PIDS" | tr '\\n' ' '))"
sleep 1
`;

const PKG_README = `ROS Center ${VERSION} — macOS 安装说明
==========================================

安装（任选其一）
  .pkg ：双击，按向导安装到 /Applications（可能需要右键 → 打开，因为未签名）
  .dmg ：双击挂载，把 "ROS Center.app" 拖进 Applications

请选择与芯片一致的版本：Apple Silicon 用 arm64，Intel Mac 用 x64。

启动
  打开「启动台 / Applications」里的 ROS Center，会自动打开浏览器访问
  http://localhost:10086 （端口被占用时自动顺延）。

停止
  在终端执行：
    pkill -f "[R]OS Center.app/Contents/Resources/bin/node"
  或用 App 内 Resources/Stop.command。

数据与配置
  ~/Library/Application Support/ROS Center/
    data/                 设备、流量统计、拓扑图标
    .env                  可选配置（把 config.example.env 复制为 .env）
  卸载 App 不会删除该目录；要彻底清理请手动删除。

未签名提示
  首次打开若提示「无法打开 / 来自 unidentified developer」：
  右键 App → 打开，或执行
    xattr -dr com.apple.quarantine "/Applications/ROS Center.app"
`;

function ensureIcons() {
  const icns = path.join(ICON_DIR, 'appicon.icns');
  if (!fs.existsSync(icns)) {
    console.log('generating icons...');
    execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js')], { stdio: 'inherit' });
  }
}

function buildApp(arch) {
  console.log('\n=== building .app for ' + arch + ' ===');
  const w = path.join(WORK, arch);
  const staged = stage(macTarget(arch), path.join(w, 'portable'));
  const appDir = path.join(w, 'app', APP);
  const contents = path.join(appDir, 'Contents');
  const res = path.join(contents, 'Resources');
  fs.rmSync(path.join(w, 'app'), { recursive: true, force: true });
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });

  copyDir(path.join(staged, 'app'), path.join(res, 'app'));
  copyDir(path.join(staged, 'bin'), path.join(res, 'bin'));
  fs.copyFileSync(path.join(staged, 'config.example.env'), path.join(res, 'config.example.env'));
  fs.copyFileSync(path.join(staged, 'README.txt'), path.join(res, 'README.txt'));
  fs.copyFileSync(path.join(ICON_DIR, 'appicon.icns'), path.join(res, 'appicon.icns'));

  fs.writeFileSync(path.join(contents, 'Info.plist'), INFO_PLIST);
  fs.writeFileSync(path.join(contents, 'MacOS', 'ros-center'), LAUNCHER, { mode: 0o755 });
  fs.writeFileSync(path.join(res, 'Stop.command'), STOP_COMMAND, { mode: 0o755 });
  console.log('app:', appDir);
  return appDir;
}

function buildPkg(appDir, arch) {
  const w = path.join(WORK, arch);
  const root = path.join(w, 'pkg-root');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(appDir, path.join(root, APP), { recursive: true });

  const scripts = path.join(w, 'pkg-scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, 'postinstall'), `#!/bin/sh
set -e
mkdir -p /usr/local/bin 2>/dev/null || true
ln -sf "/Applications/${APP}/Contents/MacOS/ros-center" /usr/local/bin/ros-center 2>/dev/null || true
exit 0
`, { mode: 0o755 });

  const component = path.join(w, 'component.pkg');
  execFileSync('pkgbuild', [
    '--root', root,
    '--identifier', 'cn.roscenter.desktop',
    '--version', VERSION,
    '--install-location', '/Applications',
    '--scripts', scripts,
    '--ownership', 'recommended',
    component,
  ], { stdio: 'inherit' });

  const out = path.join(DIST, `ROS-Center-${VERSION}-macos-${arch}.pkg`);
  execFileSync('productbuild', [
    '--package', component,
    '--identifier', 'cn.roscenter.desktop.product',
    '--version', VERSION,
    out,
  ], { stdio: 'inherit' });
  const hex = sha256(out);
  console.log('pkg:', path.relative(path.join(__dirname, '..'), out),
    (fs.statSync(out).size / 1024 / 1024).toFixed(1) + ' MB', 'sha256:', hex.slice(0, 12) + '…');
}

function buildDmg(appDir, arch) {
  const w = path.join(WORK, arch);
  const root = path.join(w, 'dmg-root');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(appDir, path.join(root, APP), { recursive: true });
  const apps = path.join(root, 'Applications');
  try { fs.unlinkSync(apps); } catch (e) { /* ignore */ }
  fs.symlinkSync('/Applications', apps);
  fs.writeFileSync(path.join(root, '安装说明.txt'), PKG_README);

  const out = path.join(DIST, `ROS-Center-${VERSION}-macos-${arch}.dmg`);
  execFileSync('hdiutil', ['create', '-volname', `ROS Center ${VERSION}`, '-srcfolder', root,
    '-ov', '-format', 'UDZO', '-fs', 'HFS+', out], { stdio: 'pipe' });
  const hex = sha256(out);
  console.log('dmg:', path.relative(path.join(__dirname, '..'), out),
    (fs.statSync(out).size / 1024 / 1024).toFixed(1) + ' MB', 'sha256:', hex.slice(0, 12) + '…');
}

ensureIcons();
for (const arch of ARCHES) {
  const appDir = buildApp(arch);
  buildPkg(appDir, arch);
  buildDmg(appDir, arch);
}
console.log('\nmacOS 安装包完成（' + ARCHES.join(', ') + '），产物在 dist/');
