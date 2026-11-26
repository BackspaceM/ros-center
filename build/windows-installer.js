'use strict';
/* 构建 Windows NSIS 安装程序：ROS-Center-<version>-windows-x64-setup.exe
   在 Windows 上运行（GitHub Actions windows-latest 已装/可装 NSIS）：
     node build/windows-installer.js
   生成的 .nsi 带 UTF-8 BOM，保证 NSIS 3 正确读取中文界面文本。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, DIST, VERSION, TARGETS, stage, sha256 } = require('./stage');

const WORK = path.join(DIST, 'stage', 'win-installer');
const OUT = path.join(DIST, `ROS-Center-${VERSION}-windows-x64-setup.exe`);
const ICON = path.join(DIST, 'icons', 'appicon.ico');
const NSI_TEMPLATE = path.join(__dirname, 'installer.nsi');

/* 安装版启动器：Program Files 只读，把 app 源码同步到 %LOCALAPPDATA% 后再启动，
   使网页里的「应用内更新」可以替换数据目录中的 app/ 并自动重启。 */
const START_BAT = [
  '@echo off',
  'setlocal',
  'set "ROSDATA=%LOCALAPPDATA%\\ROS Center"',
  'set "APPDIR=%ROSDATA%\\app"',
  'set "STAMP=%ROSDATA%\\.installed-app-stamp"',
  'if not exist "%ROSDATA%" mkdir "%ROSDATA%"',
  'if not exist "%ROSDATA%\\config.example.env" copy "%~dp0config.example.env" "%ROSDATA%\\config.example.env" >nul',
  'if not exist "%APPDIR%\\server.js" goto :sync',
  'fc /b "%~dp0app\\version.json" "%STAMP%" >nul 2>&1',
  'if not errorlevel 1 goto :run',
  ':sync',
  'if not exist "%APPDIR%" mkdir "%APPDIR%"',
  'xcopy /E /Y /I /Q "%~dp0app\\*" "%APPDIR%\\" >nul',
  'copy /Y "%~dp0app\\version.json" "%STAMP%" >nul',
  ':run',
  'set "ROS_BASE_DIR=%ROSDATA%"',
  'set "ROS_DESKTOP=1"',
  'set "HOST=127.0.0.1"',
  'cd /d "%APPDIR%"',
  '"%~dp0bin\\node.exe" "%APPDIR%\\launcher.js"',
  '',
].join('\r\n');

function ensureIcon() {
  /* 每次构建都重新生成，确保桌面图标跟随 make-favicon.js 的最新设计 */
  console.log('generating icons...');
  execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js')], { stdio: 'inherit' });
}

function findMakensis() {
  const candidates = [
    process.env.MAKENSIS,
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
    'makensis',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const v = execFileSync(c, ['/VERSION'], { stdio: 'pipe' }).toString().trim();
      console.log('makensis:', c, '|', v);
      return c;
    } catch (e) { /* try next */ }
  }
  return null;
}

function build() {
  fs.mkdirSync(WORK, { recursive: true });
  const staged = stage(TARGETS.find((t) => t.key === 'win'), path.join(WORK, 'portable'));
  /* 绿色版启动器会被安装版覆盖，先移除避免重复打包 */
  fs.rmSync(path.join(staged, 'Start.bat'), { force: true });

  const startBat = path.join(WORK, 'Start-installed.bat');
  fs.writeFileSync(startBat, START_BAT);
  ensureIcon();

  const tpl = fs.readFileSync(NSI_TEMPLATE, 'utf8');
  const nsi = '\uFEFF' + tpl
    .replace(/__VERSION__/g, VERSION)
    .replace(/__STAGEDIR__/g, staged)
    .replace(/__STARTBAT__/g, startBat)
    .replace(/__ICOFILE__/g, ICON)
    .replace(/__OUTFILE__/g, OUT);
  const nsiFile = path.join(WORK, 'installer.nsi');
  fs.writeFileSync(nsiFile, nsi, 'utf8');
  console.log('nsi:', nsiFile);

  if (process.platform !== 'win32') {
    console.error('\n需要 Windows 环境编译 NSIS 安装包（当前仅生成了 .nsi）。');
    console.error('在 GitHub Actions windows-latest 上运行本脚本即可得到 .exe。');
    process.exitCode = 2;
    return;
  }

  const makensis = findMakensis();
  if (!makensis) throw new Error('未找到 makensis，请先安装 NSIS（choco install nsis -y）');
  execFileSync(makensis, ['/V2', nsiFile], { stdio: 'inherit', cwd: ROOT });
  if (!fs.existsSync(OUT)) throw new Error('makensis 未生成产物: ' + OUT);
  const hex = sha256(OUT);
  console.log('exe:', path.relative(ROOT, OUT),
    (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' MB', 'sha256:', hex.slice(0, 12) + '…');
}

build();
