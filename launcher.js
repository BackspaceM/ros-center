'use strict';
/* ROS Center 桌面版监管进程（由 Start.command / Start.bat / .app / NSIS 快捷方式调用）
   职责：
     1. 启动 app/server.js，转发退出信号；
     2. server 以退出码 75 退出 = 应用内更新已就绪 → 此时进程已结束、文件句柄已释放，
        由 launcher 原子替换 app/（旧目录备份到 data/app-backups/）并自动重启；
     3. 新版本若启动失败，自动回滚到备份，避免更新后起不来；
     4. 全程不触碰 data/，设备、拓扑、图标、配置都保留。
   这样桌面版更新只需在网页里点一次，无需重新下载安装包装载。 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const APP_DIR = __dirname;
const BASE_DIR = process.env.ROS_BASE_DIR ? path.resolve(process.env.ROS_BASE_DIR) : path.dirname(APP_DIR);
const DATA_DIR = path.join(BASE_DIR, 'data');
const RUNTIME_FILE = path.join(DATA_DIR, 'app-runtime.json');
const SERVER = path.join(APP_DIR, 'server.js');
const RESTART_CODE = 75;

process.env.ROS_LAUNCHER = '1';
process.env.ROS_DESKTOP = '1';
process.title = 'ROS Center launcher';

let child = null;
let stopping = false;
let crashes = 0;

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }

function selfupdate() {
  try { return require('./selfupdate'); } catch (e) { console.error('[launcher] selfupdate module unavailable:', e.message); return null; }
}

function run() {
  if (stopping) return;
  if (!fs.existsSync(SERVER)) {
    console.error('[launcher] server.js 不存在，尝试回滚到上一版本…');
    const su = selfupdate();
    if (su && su.rollbackDesktop({ dataDir: DATA_DIR, appDir: APP_DIR })) {
      crashes = 0;
      setTimeout(run, 800);
      return;
    }
    console.error('[launcher] 无法启动：' + SERVER);
    return;
  }
  child = spawn(process.execPath, [SERVER], {
    cwd: APP_DIR,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('error', (e) => console.error('[launcher] spawn error:', e.message));
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    /* 用户按 Ctrl+C / 终端关闭：干净退出 */
    if (signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGHUP') { process.exit(0); return; }

    if (code === RESTART_CODE) {
      const su = selfupdate();
      const r = su ? su.applyDesktopPending({ dataDir: DATA_DIR, appDir: APP_DIR })
        : { ok: false, error: '缺少 selfupdate.js' };
      if (!r.ok) console.error('[launcher] 更新应用失败:', r.error || 'unknown');
      else console.log('[launcher] 已更新到', r.version || '新版本', '，正在重启…');
      crashes = 0;
      setTimeout(run, 900);
      return;
    }
    if (code === 0) return;   /* 主动退出（例如关闭） */

    /* 非正常退出：若刚应用了未验证的更新，先回滚再重启 */
    crashes += 1;
    const su = selfupdate();
    if (su && crashes <= 2 && su.rollbackDesktop({ dataDir: DATA_DIR, appDir: APP_DIR })) {
      console.warn('[launcher] 新版本启动失败，已回滚到上一版本');
      setTimeout(run, 1200);
      return;
    }
    if (crashes <= 5) {
      console.error(`[launcher] server 异常退出 (code=${code})，${crashes}/5 次后重启…`);
      setTimeout(run, Math.min(5000, 800 * crashes));
    } else {
      console.error('[launcher] 连续崩溃，已停止自动重启。请查看上方错误或删除 data/ 后重试。');
    }
  });
}

function forward(sig) {
  stopping = true;
  try { if (child) child.kill(sig); } catch (e) { /* ignore */ }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGHUP', () => forward('SIGHUP'));

/* 再次双击 App / 快捷方式时：若已有实例在运行，只在真实端口上打开 WebUI，
   不再启动第二个服务（否则端口顺延，用户会打开到另一个实例） */
function readRuntime() {
  try {
    const r = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    return r && r.app === 'ros-center' && Number(r.port) > 0 ? r : null;
  } catch (e) { return null; }
}
function ping(port) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { req.destroy(); } catch (e) { /* ignore */ } resolve(v); };
    const req = http.get({ host: '127.0.0.1', port: Number(port), path: '/api/health', timeout: 1500 }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => { try { const j = JSON.parse(s); finish(!!(j.ok && j.app === 'ros-center')); } catch (e) { finish(false); } });
    });
    req.on('timeout', () => finish(false));
    req.on('error', () => finish(false));
  });
}
function openBrowser(url) {
  if (process.env.ROS_NO_BROWSER === '1') return;
  try {
    const cmd = process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* 打不开浏览器不影响服务 */ }
}
async function bootstrap() {
  const rt = readRuntime();
  if (rt && await ping(rt.port)) {
    const url = rt.url || ('http://localhost:' + rt.port);
    console.log('[launcher] 已有实例运行在 ' + rt.port + '，打开 ' + url);
    openBrowser(url);
    process.exit(0);
    return;
  }
  console.log('[launcher] ROS Center starting (app=' + APP_DIR + ', data=' + DATA_DIR + ')');
  run();
}
bootstrap();
