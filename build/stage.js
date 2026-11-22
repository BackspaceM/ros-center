'use strict';
/* 共用打包层：下载官方 Node.js 运行时 + 组装 ros-center 目录。
   build/desktop.js（绿色版 ZIP）、build/macos-installer.js、build/windows-installer.js 都基于本模块。
   零第三方依赖，可在 macOS / Linux / Windows runner 上运行。 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = path.join(DIST, 'base');
const NODE_V = '22.22.2';
const VERSION = require(path.join(ROOT, 'package.json')).version;

const README = `ROS Center 桌面版
================================

启动
  macOS   ：双击 Start.command（绿色版）或「启动台 / Applications 里的 ROS Center」
  Windows ：双击 Start.bat 或开始菜单 / 桌面快捷方式
程序会启动本地服务并自动打开浏览器（默认 http://localhost:10086）。
停止服务：关闭终端窗口、按 Ctrl+C，或结束 ROS Center 后台进程。

本包已内置 Node.js 运行时，目标机器不需要安装 Node.js，也不需要联网安装依赖。
目录结构：
  bin/node (bin/node.exe)   Node.js 运行时
  app/                      应用源码（server.js、catalog.js、public/）
  config.example.env        配置示例

连接路由器
  首次打开进入「系统管理 → 设备管理」添加 RouterOS 设备，
  API 端口 8728，建议使用只读账号。

配置
  把 config.example.env 复制为 .env（放在数据目录）即可覆盖默认值：
    PORT=10086                 服务端口（被占用时自动顺延到 10087...）
    ROS_HOST=192.168.88.1      路由器地址
    ROS_PORT=8728              RouterOS API 端口
    ROS_USER=monitor           只读账号
    ROS_PASSWORD=             密码
    DEMO_MODE=1                仅预览界面，不连真实路由器
    ROS_NO_BROWSER=1           不自动打开浏览器
    WEB_USER / WEB_PASSWORD    给 WebUI 加登录

数据目录
  绿色版：解压目录下的 data/
  macOS 安装版：~/Library/Application Support/ROS Center/
  Windows 安装版：%LOCALAPPDATA%\\ROS Center\\
  配置、设备、流量统计、拓扑图标都在数据目录；卸载程序不会删除这些数据。

常见提示
  macOS 若提示「无法打开」，右键 App 选「打开」，或执行：
    xattr -dr com.apple.quarantine "/Applications/ROS Center.app"
  Windows 若出现 SmartScreen，点「更多信息 → 仍要运行」（开源程序未签名）。
`;

const TARGETS = [
  {
    key: 'mac', label: 'macOS (Apple Silicon / arm64)',
    asset: `node-v${NODE_V}-darwin-arm64.tar.gz`,
    url: `https://nodejs.org/dist/v${NODE_V}/node-v${NODE_V}-darwin-arm64.tar.gz`,
    member: `node-v${NODE_V}-darwin-arm64/bin/node`,
    bin: 'node', launcherName: 'Start.command', zip: 'ros-center-macos-arm64.zip',
    launcher: '#!/bin/sh\ncd "$(dirname "$0")"\nexport ROS_BASE_DIR="$(pwd)"\nexport ROS_DESKTOP=1\nexport HOST=127.0.0.1\nexec ./bin/node ./app/server.js\n',
  },
  {
    key: 'win', label: 'Windows (x64)',
    asset: `node-v${NODE_V}-win-x64.zip`,
    url: `https://nodejs.org/dist/v${NODE_V}/node-v${NODE_V}-win-x64.zip`,
    member: `node-v${NODE_V}-win-x64/node.exe`,
    bin: 'node.exe', launcherName: 'Start.bat', zip: 'ros-center-windows-x64.zip',
    launcher: '@echo off\r\ncd /d "%~dp0"\r\nset ROS_BASE_DIR=%CD%\r\nset ROS_DESKTOP=1\r\nset HOST=127.0.0.1\r\nbin\\node.exe app\\server.js\r\n',
  },
];

function download(t) {
  fs.mkdirSync(BASE, { recursive: true });
  const dest = path.join(BASE, t.asset);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) {
    console.log('cache:', t.asset, (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + ' MB');
    return dest;
  }
  console.log('downloading', t.asset, '...');
  execFileSync('curl', ['-fL', '--retry', '3', '--retry-delay', '2', '--max-time', '900', '-sS', '-o', dest, t.url], { stdio: 'inherit' });
  console.log('downloaded', (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + ' MB');
  return dest;
}

/* 纯 Node 从 ZIP 中提取单个文件，作为 tar / unzip 都不可用时的兜底
   （GitHub Actions 的 Windows runner 上 unzip 不一定在 PATH 里） */
function unzipOne(archive, member, destDir) {
  const zlib = require('zlib');
  const buf = fs.readFileSync(archive);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP EOCD 未找到');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === member) {
      const lNameLen = buf.readUInt16LE(local + 26);
      const lExtraLen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + csize);
      const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
      const out = path.join(destDir, member);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data, { mode: 0o755 });
      return;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('ZIP 中找不到成员: ' + member);
}

function extractNode(t, archive) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ros-node-'));
  const isTarGz = t.asset.endsWith('.tar.gz');
  try {
    execFileSync('tar', isTarGz
      ? ['-xzf', archive, '-C', tmp, t.member]
      : ['-xf', archive, '-C', tmp, t.member], { stdio: 'pipe' });
  } catch (e) {
    try {
      execFileSync('unzip', ['-q', '-o', archive, t.member, '-d', tmp], { stdio: 'pipe' });
    } catch (e2) {
      try {
        unzipOne(archive, t.member, tmp);
      } catch (e3) {
        fs.rmSync(tmp, { recursive: true, force: true });
        throw new Error('解压 Node 运行时失败 (tar / unzip / 内置 ZIP): ' + e3.message);
      }
    }
  }
  const nodeBin = path.join(tmp, t.member);
  if (!fs.existsSync(nodeBin)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error('运行时解压失败: ' + t.member);
  }
  return { tmp, nodeBin };
}

function collectFiles(dir, prefix, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = prefix + e.name;
    if (e.isDirectory()) collectFiles(full, rel + '/', out);
    else if (e.isFile()) out.push([rel, fs.readFileSync(full)]);
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name), to = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(from, to);
    else if (e.isFile()) fs.copyFileSync(from, to);
  }
}

/* 组装 <stageDir>/ros-center/，返回该目录路径 */
function stage(t, stageDir) {
  console.log('\n=== staging ' + t.label + ' ===');
  fs.rmSync(stageDir, { recursive: true, force: true });
  const dir = path.join(stageDir, 'ros-center');
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });

  const { tmp, nodeBin } = extractNode(t, download(t));
  fs.copyFileSync(nodeBin, path.join(dir, 'bin', t.bin));
  fs.chmodSync(path.join(dir, 'bin', t.bin), 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });

  for (const f of ['server.js', 'catalog.js']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, 'app', f));
  }
  copyDir(path.join(ROOT, 'public'), path.join(dir, 'app', 'public'));

  fs.writeFileSync(path.join(dir, t.launcherName), t.launcher, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'README.txt'), README);
  const env = path.join(ROOT, '.env.example');
  if (fs.existsSync(env)) fs.copyFileSync(env, path.join(dir, 'config.example.env'));
  console.log('staged:', dir);
  return dir;
}

function sha256(file) {
  const { createHash } = require('crypto');
  const buf = fs.readFileSync(file);
  const hex = createHash('sha256').update(buf).digest('hex');
  fs.writeFileSync(file + '.sha256', hex + '  ' + path.basename(file) + '\n');
  return hex;
}

module.exports = { ROOT, DIST, BASE, NODE_V, VERSION, TARGETS, README, download, extractNode, unzipOne, collectFiles, copyDir, stage, sha256 };
