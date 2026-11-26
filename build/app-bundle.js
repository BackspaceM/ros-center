'use strict';
/* 生成「应用内更新包」：只包含 JS 源码（不含 Node 运行时），供桌面版免重装更新。
   产物 dist/ros-center-app-<version>.zip + .sha256，会作为 GitHub Release 资产上传。
   server 下载后用 .sha256 与包内 manifest.json 双重校验，由 launcher 替换 app/ 并重启。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PKG_VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = process.env.ROS_RELEASE_TAG || ('v' + PKG_VERSION);
/* CI 推送 tag 时以 tag 为准，避免 package.json 落后导致更新后版本显示不一致 */
const VERSION = process.env.ROS_RELEASE_TAG ? String(TAG).replace(/^v/i, '') : PKG_VERSION;

const ROOT_FILES = [
  'server.js', 'catalog.js', 'updates.js', 'quicksetup.js', 'selfupdate.js',
  'launcher.js', 'package.json',
];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function collect() {
  const entries = [];
  for (const f of ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) throw new Error('缺少源文件 ' + f);
    entries.push({ name: f, data: fs.readFileSync(p), mode: 0o644 });
  }
  const pub = path.join(ROOT, 'public');
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name), rel = prefix + e.name;
      if (e.isDirectory()) walk(full, rel + '/');
      else if (e.isFile()) entries.push({ name: rel, data: fs.readFileSync(full), mode: 0o644 });
    }
  };
  walk(pub, 'public/');
  const version = JSON.stringify({ version: VERSION, tag: TAG, builtAt: new Date().toISOString() }, null, 2) + '\n';
  entries.push({ name: 'version.json', data: Buffer.from(version), mode: 0o644 });
  const files = {};
  for (const e of entries) files[e.name] = sha256(e.data);
  const manifest = JSON.stringify({ version: VERSION, tag: TAG, builtAt: new Date().toISOString(), files }, null, 2) + '\n';
  entries.push({ name: 'manifest.json', data: Buffer.from(manifest), mode: 0o644 });
  return entries;
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });
  const entries = collect();
  const out = path.join(DIST, `ros-center-app-${VERSION}.zip`);
  /* 顺序固定便于复现：manifest 放最前，服务端解压后可先读 */
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writeZip(out, entries);
  const hex = sha256(fs.readFileSync(out));
  fs.writeFileSync(out + '.sha256', hex + '  ' + path.basename(out) + '\n');
  console.log('bundle:', out, (fs.statSync(out).size / 1024).toFixed(1) + ' KB', '| files:', entries.length);
  console.log('sha256:', hex);
  return out;
}
if (require.main === module) build();
module.exports = { build, VERSION, TAG, ROOT_FILES };
