'use strict';
/* 构建 macOS / Windows 免安装绿色版 ZIP。
   staging 内容由 build/stage.js 统一生成，安装包构建脚本复用同一份内容。
   用法：npm run build:desktop  （或 node build/desktop.js --mac-only） */
const fs = require('fs');
const path = require('path');
const { DIST, TARGETS, stage, sha256 } = require('./stage');
const { writeZip } = require('./zip');

function collectEntries(dir, prefix, launcherName, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = prefix + e.name;
    if (e.isDirectory()) collectEntries(full, rel + '/', launcherName, out);
    else if (e.isFile()) {
      const executable = e.name === launcherName || e.name === 'node' || e.name === 'node.exe';
      out.push({ name: rel, data: fs.readFileSync(full), mode: executable ? 0o755 : 0o644 });
    }
  }
}

function build(t) {
  console.log('\n=== ' + t.label + ' (portable zip) ===');
  const dir = stage(t, path.join(DIST, 'stage', t.key + '-portable'));
  const entries = [];
  collectEntries(dir, 'ros-center/', t.launcherName, entries);
  const zip = path.join(DIST, t.zip);
  writeZip(zip, entries);
  const hex = sha256(zip);
  console.log('zip:', path.relative(path.join(__dirname, '..'), zip),
    (fs.statSync(zip).size / 1024 / 1024).toFixed(1) + ' MB', 'sha256:', hex.slice(0, 12) + '…');
}

const onlyMac = process.argv.includes('--mac-only');
for (const t of TARGETS.filter((x) => !onlyMac || x.key === 'mac')) build(t);
console.log('\n完成，产物在 dist/');
