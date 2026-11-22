'use strict';
/* 构建 macOS / Windows 免安装绿色版：官方 Node 运行时 + 应用源码 + 启动器，打成 zip。
   用法：npm run build:desktop  （或 node build/desktop.js --mac-only）
   首次构建会从 nodejs.org 下载运行时并缓存到 dist/base/，之后可离线复现。 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = path.join(DIST, 'base');
const NODE_V = '22.22.2';
fs.mkdirSync(BASE, { recursive: true });

const README = `ROS Center 桌面绿色版
================================

启动
  macOS   ：双击 Start.command
  Windows ：双击 Start.bat
程序会启动本地服务并自动打开浏览器（默认 http://localhost:10086）。
停止服务：关闭终端窗口，或在窗口里按 Ctrl+C。

本包已内置 Node.js 运行时，目标机器不需要安装 Node.js，也不需要联网安装依赖。
目录结构：
  bin/node (bin/node.exe)   Node.js 运行时
  app/                      应用源码（server.js、catalog.js、public/）
  data/                     配置、设备、流量统计、拓扑图标（首次启动自动创建）
  config.example.env        配置示例

连接路由器
  首次打开进入「系统管理 → 设备管理」添加 RouterOS 设备，
  API 端口 8728，建议使用只读账号。

配置
  把 config.example.env 复制为 .env（放在本目录）即可覆盖默认值：
    PORT=10086                 服务端口（被占用时自动顺延到 10087...）
    ROS_HOST=192.168.88.1      路由器地址
    ROS_PORT=8728              RouterOS API 端口
    ROS_USER=monitor           只读账号
    ROS_PASSWORD=             密码
    DEMO_MODE=1                仅预览界面，不连真实路由器
    ROS_NO_BROWSER=1           不自动打开浏览器
    WEB_USER / WEB_PASSWORD    给 WebUI 加登录

这是绿色版：不写注册表、不装服务，整个文件夹删掉即卸载。

常见提示
  macOS 若提示「无法打开」，右键 Start.command 选「打开」，或执行：
    xattr -d com.apple.quarantine ./Start.command ./bin/node
  Windows 若出现 SmartScreen，点「更多信息 → 仍要运行」（开源程序未签名）。
`;

const TARGETS = [
  {
    label: 'macOS (Apple Silicon / arm64)', key: 'mac',
    asset: `node-v${NODE_V}-darwin-arm64.tar.gz`,
    url: `https://nodejs.org/dist/v${NODE_V}/node-v${NODE_V}-darwin-arm64.tar.gz`,
    member: `node-v${NODE_V}-darwin-arm64/bin/node`,
    bin: 'node', launcherName: 'Start.command', zip: 'ros-center-macos-arm64.zip',
    launcher: '#!/bin/sh\ncd "$(dirname "$0")"\nexport ROS_BASE_DIR="$(pwd)"\nexport ROS_DESKTOP=1\nexport HOST=127.0.0.1\nexec ./bin/node ./app/server.js\n',
  },
  {
    label: 'Windows (x64)', key: 'win',
    asset: `node-v${NODE_V}-win-x64.zip`,
    url: `https://nodejs.org/dist/v${NODE_V}/node-v${NODE_V}-win-x64.zip`,
    member: `node-v${NODE_V}-win-x64/node.exe`,
    bin: 'node.exe', launcherName: 'Start.bat', zip: 'ros-center-windows-x64.zip',
    launcher: '@echo off\r\ncd /d "%~dp0"\r\nset ROS_BASE_DIR=%CD%\r\nset ROS_DESKTOP=1\r\nset HOST=127.0.0.1\r\nbin\\node.exe app\\server.js\r\n',
  },
];

function download(t) {
  const dest = path.join(BASE, t.asset);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) {
    console.log('cache:', t.asset, (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + ' MB');
    return dest;
  }
  console.log('downloading', t.asset, '...');
  execFileSync('curl', ['-fL', '--retry', '2', '--max-time', '600', '-sS', '-o', dest, t.url], { stdio: 'inherit' });
  console.log('downloaded', (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + ' MB');
  return dest;
}
function extractNode(t, archive) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ros-node-'));
  const isTarGz = t.asset.endsWith('.tar.gz');
  try {
    execFileSync('tar', isTarGz ? ['-xzf', archive, '-C', tmp, t.member] : ['-xf', archive, '-C', tmp, t.member], { stdio: 'inherit' });
  } catch (e) {
    if (isTarGz) throw e;
    execFileSync('unzip', ['-q', '-o', archive, t.member, '-d', tmp], { stdio: 'inherit' });
  }
  const nodeBin = path.join(tmp, t.member);
  if (!fs.existsSync(nodeBin)) throw new Error('运行时解压失败: ' + t.member);
  return { tmp, nodeBin };
}
function collectFiles(dir, prefix, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = prefix + e.name;
    if (e.isDirectory()) collectFiles(full, rel + '/', out);
    else if (e.isFile()) out.push([rel, fs.readFileSync(full)]);
  }
}

function build(t) {
  console.log('\n=== ' + t.label + ' ===');
  const { tmp, nodeBin } = extractNode(t, download(t));
  const entries = [];
  const add = (name, data, mode) => entries.push({ name: 'ros-center/' + name, data, mode: mode || 0o644 });
  for (const f of ['server.js', 'catalog.js']) add('app/' + f, fs.readFileSync(path.join(ROOT, f)));
  const assets = [];
  collectFiles(path.join(ROOT, 'public'), 'app/public/', assets);
  for (const [rel, buf] of assets) add(rel, buf);
  add('bin/' + t.bin, fs.readFileSync(nodeBin), 0o755);
  add(t.launcherName, Buffer.from(t.launcher, 'utf8'), 0o755);
  add('README.txt', Buffer.from(README, 'utf8'));
  const env = path.join(ROOT, '.env.example');
  if (fs.existsSync(env)) add('config.example.env', fs.readFileSync(env));

  const zip = path.join(DIST, t.zip);
  writeZip(zip, entries);
  fs.rmSync(tmp, { recursive: true, force: true });
  const buf = fs.readFileSync(zip);
  fs.writeFileSync(zip + '.sha256', crypto.createHash('sha256').update(buf).digest('hex') + '  ' + t.zip + '\n');
  console.log('zip:', path.relative(ROOT, zip), (buf.length / 1024 / 1024).toFixed(1) + ' MB',
    'sha256:', crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) + '…');
}

const onlyMac = process.argv.includes('--mac-only');
for (const t of TARGETS.filter((x) => !onlyMac || x.key === 'mac')) build(t);
console.log('\n完成，产物在 dist/');
