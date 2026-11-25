'use strict';

/* 单文件/绿色桌面版把 .env / data 放在启动目录；源码与 Docker 仍用项目目录 */
const DESKTOP = process.pkg || process.env.ROS_DESKTOP === '1';
/* 本次进程启动时刻：用来区分「本次更新中」与「上次容器/进程遗留」的进度状态 */
const BOOT_AT = Date.now();
const APP_DIR = process.env.ROS_BASE_DIR ? require('path').resolve(process.env.ROS_BASE_DIR)
  : (process.pkg ? require('path').dirname(process.execPath) : __dirname);

/* 读取同目录 .env（零依赖），已存在的环境变量优先 */
try {
  const envPath = require('path').join(APP_DIR, '.env');
  if (require('fs').existsSync(envPath)) {
    for (const line of require('fs').readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (e) { /* ignore */ }

const http = require('http');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GROUPS, SECTIONS, SECTION_MAP, seed, makeLog } = require('./catalog');
const updates = require('./updates');
const quicksetup = require('./quicksetup');
const selfupdate = require('./selfupdate');

const HOST = process.env.HOST || (DESKTOP ? '127.0.0.1' : '0.0.0.0');
const INTERVAL = Math.max(500, Number(process.env.POLL_INTERVAL_MS || 1000));
/* 连接表计数较重：独立低频采集（默认 5 秒），不跟随每秒的流量轮询 */
const CONN_INTERVAL = Math.max(3000, Number(envNum('CONN_POLL_INTERVAL_MS', 5000)));
const HISTORY = Math.max(30, Number(envNum('HISTORY_POINTS', 180)));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(APP_DIR, 'data');
const APP_RUNTIME_FILE = path.join(DATA_DIR, 'app-runtime.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const TOPOLOGY_FILE = path.join(DATA_DIR, 'topology.json');
const TOPO_ICON_DIR = path.join(DATA_DIR, 'topology-icons');
const LEGACY_SETTINGS = path.join(DATA_DIR, 'settings.json');
let PORT = envNum('PORT', 10086);
function envNum(key, d) { const n = Number(process.env[key]); return Number.isFinite(n) && n > 0 ? n : d; }

/* ================= 设备凭据加密（AES-256-GCM） =================
   落盘的 devices.json 只保存密文；密钥来自 ROS_CENTER_KEY（环境变量，推荐在容器部署时设置），
   否则使用 data/secret.key（首次启动随机生成，权限 0600）。
   内存中的 Device.cfg 保留明文供 RouterOS 登录使用，不写磁盘、不通过任何 API 返回。 */
const SECRET_KEY_FILE = path.join(DATA_DIR, 'secret.key');
const CRED_AAD = Buffer.from('ros-center-device-credentials-v1', 'utf8');
let CRED_KEY = null;
function credentialKey() {
  if (CRED_KEY) return CRED_KEY;
  const env = String(process.env.ROS_CENTER_KEY || '').trim();
  if (env) {
    CRED_KEY = /^[0-9a-fA-F]{64}$/.test(env) ? Buffer.from(env, 'hex')
      : crypto.scryptSync(env, 'ros-center-credential-key-v1', 32);
  } else {
    let raw = '';
    try { raw = fs.readFileSync(SECRET_KEY_FILE, 'utf8').trim(); } catch (e) { /* 首次启动 */ }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) CRED_KEY = Buffer.from(raw, 'hex');
    else {
      CRED_KEY = crypto.randomBytes(32);
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SECRET_KEY_FILE, CRED_KEY.toString('hex') + '\n', { mode: 0o600 });
      } catch (e) { console.warn('[credentials] cannot persist key file - set ROS_CENTER_KEY to keep credentials decryptable after a volume reset'); }
    }
  }
  return CRED_KEY;
}
function encryptCredential(text) {
  const s = String(text == null ? '' : text);
  if (!s) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', credentialKey(), iv);
  c.setAAD(CRED_AAD);
  const enc = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return 'enc:v1:' + iv.toString('base64url') + ':' + c.getAuthTag().toString('base64url') + ':' + enc.toString('base64url');
}
function decryptCredential(value) {
  if (typeof value !== 'string' || !value) return '';
  if (!value.startsWith('enc:v1:')) return value;   // 兼容旧版明文，启动时自动迁移为密文
  try {
    const parts = value.split(':');
    const iv = parts[2], tag = parts[3], data = parts[4];
    const d = crypto.createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(iv, 'base64url'));
    d.setAAD(CRED_AAD); d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch (e) { console.warn('[credentials] failed to decrypt a device field - please re-enter the password in the UI'); return ''; }
}
function scrubLegacySettings() {
  try {
    const s = JSON.parse(fs.readFileSync(LEGACY_SETTINGS, 'utf8'));
    if (s && typeof s === 'object' && 'password' in s && s.password) {
      delete s.password;
      fs.writeFileSync(LEGACY_SETTINGS, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
      console.log('[credentials] removed plaintext password from legacy settings.json');
    }
  } catch (e) { /* 文件不存在或格式错误 */ }
}

/* ================= RouterOS binary API ================= */
function encodeLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x4000) { const b = Buffer.alloc(2); b.writeUInt16BE(n | 0x8000); return b; }
  if (n < 0x200000) { const b = Buffer.alloc(3); b[0] = 0xC0 | ((n >> 16) & 0x1F); b.writeUInt16BE(n & 0xFFFF, 1); return b; }
  if (n < 0x10000000) { const b = Buffer.from([0xE0 | ((n >> 24) & 0x0F)]); const b2 = Buffer.alloc(3); b2.writeUIntBE(n & 0xFFFFFF, 0, 3); return Buffer.concat([b, b2]); }
  const b = Buffer.alloc(5); b[0] = 0xF0; b.writeUInt32BE(n, 1); return b;
}
function sentence(words) {
  const parts = words.map((w) => { const b = Buffer.from(String(w), 'utf8'); return Buffer.concat([encodeLength(b.length), b]); });
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}
function parseWords(sw) {
  const out = {};
  for (const raw of sw) {
    if (!raw || raw[0] !== '=') continue;
    const body = raw.slice(1); const i = body.indexOf('=');
    out[i < 0 ? body : body.slice(0, i)] = i < 0 ? '' : body.slice(i + 1);
  }
  return out;
}
class RouterOSAPI {
  constructor(cfg) {
    this.cfg = cfg; this.socket = null; this.buffer = Buffer.alloc(0);
    this.queue = []; this.current = null; this.connected = false; this.sentences = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const opts = { host: this.cfg.host, port: this.cfg.port };
      const sock = this.cfg.tls ? tls.connect(opts, { rejectUnauthorized: false }) : net.connect(opts);
      this.socket = sock;
      let settled = false;
      const onErr = (e) => { if (!settled) { settled = true; reject(e); } this._failAll(e); };
      sock.once('error', onErr);
      sock.on('data', (c) => this._onData(c));
      sock.on('close', () => { this.connected = false; this._failAll(new Error('RouterOS connection closed')); });
      const ready = () => {
        if (settled) return;
        settled = true;
        sock.removeListener('error', onErr);
        sock.on('error', (e) => this._failAll(e));
        this.login().then(resolve, reject);
      };
      if (this.cfg.tls) sock.once('secureConnect', ready); else sock.once('connect', ready);
    });
  }
  _failAll(err) {
    if (this.current) { const c = this.current; this.current = null; c.reject(err); }
    while (this.queue.length) this.queue.shift().reject(err);
  }
  async login() {
    const { user, password } = this.cfg;
    let r = await this.exec(['/login', `=name=${user}`, `=password=${password}`]);
    if (r.status.type === 'done' && !r.status.ret) { this.connected = true; return; }
    let ret = r.status.ret;
    if (!ret) { r = await this.exec(['/login', `=name=${user}`]); ret = r.status.ret; }
    if (!ret) throw new Error('RouterOS login failed: no challenge');
    const hash = crypto.createHash('md5').update(Buffer.concat([
      Buffer.from([0]), Buffer.from(password, 'utf8'), Buffer.from(ret, 'hex'),
    ])).digest('hex');
    const r2 = await this.exec(['/login', `=name=${user}`, `=response=00${hash}`]);
    if (r2.status.type === 'trap') throw new Error('RouterOS login failed: ' + (r2.status.message || 'rejected'));
    this.connected = true;
  }
  exec(words, opts = {}) {
    return new Promise((resolve, reject) => { this.queue.push({ words, resolve, reject, onRecord: opts.onRecord || null }); this._pump(); });
  }
  _pump() {
    if (this.current || !this.queue.length || !this.socket || this.socket.destroyed) return;
    this.current = this.queue.shift(); this.sentences = [];
    this.socket.write(sentence(this.current.words));
  }
  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let off = 0;
    while (off < this.buffer.length) {
      const first = this.buffer[off]; let len, lb;
      if ((first & 0x80) === 0) { len = first; lb = 1; }
      else if ((first & 0xC0) === 0x80) { if (this.buffer.length - off < 2) break; len = ((first & 0x3F) << 8) | this.buffer[off + 1]; lb = 2; }
      else if ((first & 0xE0) === 0xC0) { if (this.buffer.length - off < 3) break; len = ((first & 0x1F) << 16) | this.buffer.readUInt16BE(off + 1); lb = 3; }
      else if ((first & 0xF0) === 0xE0) { if (this.buffer.length - off < 4) break; len = ((first & 0x0F) << 24) | this.buffer.readUIntBE(off + 1, 3); lb = 4; }
      else { if (this.buffer.length - off < 5) break; len = this.buffer.readUInt32BE(off + 1); lb = 5; }
      if (len === 0) { off += lb; this._endSentence(); continue; }
      if (this.buffer.length - off - lb < len) break;
      this.sentences.push(this.buffer.toString('utf8', off + lb, off + lb + len)); off += lb + len;
    }
    if (off > 0) this.buffer = this.buffer.slice(off);
  }
  _endSentence() {
    const words = this.sentences; this.sentences = [];
    if (!this.current || !words.length) return;
    if (words[0] === '!re') {
      const rec = parseWords(words);
      if (this.current.onRecord) { try { this.current.onRecord(rec); } catch (e) { /* ignore */ } return; }
      (this.current.re = this.current.re || []).push(rec); return;
    }
    const status = { type: words[0].replace('!', ''), ...parseWords(words.slice(1)) };
    const task = this.current; this.current = null;
    task.resolve({ re: task.re || [], status });
    setImmediate(() => this._pump());
  }
  close() {
    this.connected = false;
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
    this._failAll(new Error('client closed'));
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const bool = (v) => v === 'true' || v === true || v === 'yes' || v === 1 || v === '1';
const rosBool = (v) => (bool(v) ? 'true' : 'false');
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const validHost = (h) => typeof h === 'string' && h.length > 0 && h.length <= 253 && /^[A-Za-z0-9._:\-\[\]]+$/.test(h.trim());
const validPort = (p) => { const n = Number(p); return Number.isInteger(n) && n >= 1 && n <= 65535; };
const validName = (n) => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 60;
function fmtDuration(s) {
  s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return (d ? d + 'd' : '') + (h ? h + 'h' : '') + (m ? m + 'm' : '') + sec + 's';
}
/* 把 RouterOS 的 uptime 字符串（如 "1d00:00:00" / "2w3d4h" / "00:05:13"）解析成秒 */
function parseRouterUptime(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0, matched = false;
  const w = s.match(/(\d+)\s*w/i); if (w) { total += Number(w[1]) * 604800; matched = true; }
  const d = s.match(/(\d+)\s*d/i); if (d) { total += Number(d[1]) * 86400; matched = true; }
  const colon = s.match(/(\d{1,3}):(\d{1,2}):(\d{1,2})/);
  if (colon) { total += Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]); matched = true; }
  else {
    const h = s.match(/(\d+)\s*h/i); if (h) { total += Number(h[1]) * 3600; matched = true; }
    const m = s.match(/(\d+)\s*m(?!s)/i); if (m) { total += Number(m[1]) * 60; matched = true; }
    const sec = s.match(/(\d+)\s*s/i); if (sec) { total += Number(sec[1]); matched = true; }
  }
  return matched ? total : null;
}

/* ================= 流量统计 =================
   唯一数据源：RouterOS /interface/print 的 rx-byte / tx-byte 真实累计字节计数器。
   每秒采样一次，对「每个接口分别」求差分（本次值 - 上次值），同时写入
     · hours[YYYY-MM-DDTHH][接口]  —— 今日按小时的明细 / 趋势
     · days[YYYY-MM-DD][接口]      —— 每日每网口真实用量（日/周/月/累计的唯一依据）
   PPPoE 重拨、接口重建、路由器重启都会把计数器清零：计数器下降时不再丢弃采样，
   而是把「清零后的计数器值」作为自清零以来的真实字节计入（并记一次 reset），
   这样重拨后当天/当月的流量继续累计，不会归零也不会停记。
   32 位计数器回绕单独识别（仅在该设备从未出现 64 位数值时启用）。
   服务长时间停机的断档：差分仍是真实字节，计入当天日合计，但不虚构到某个小时。
   演示模式 / 离线 / 采不到计数器时绝不写历史；无速率积分、无估算、无假数据。 */
const USAGE_VERSION = 3;
const USAGE_KEEP_HOURS = 24 * 400;
const USAGE_KEEP_DAYS = 400;
const USAGE_GAP_MS = 10 * 60 * 1000;
let usageResetNotice = false;
let usageMigrated = false;
let usageDirty = false;
let usageStore = loadUsage();
function emptyUsageStore() { return { version: USAGE_VERSION, devices: {} }; }
function loadUsage() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch (e) { return emptyUsageStore(); }
  if (!raw || typeof raw !== 'object' || !raw.devices || typeof raw.devices !== 'object') return emptyUsageStore();
  if (raw.version === USAGE_VERSION) return raw;
  if (raw.version === 2) {
    /* v2 已有「接口 × 小时」桶：沿用并补出每日桶，不清零、不丢历史 */
    usageMigrated = true;
    for (const d of Object.values(raw.devices)) {
      if (!d || typeof d !== 'object') continue;
      d.days = d.days || {};
      for (const [hk, slots] of Object.entries(d.hours || {})) {
        const dk = String(hk).slice(0, 10), day = d.days[dk] || (d.days[dk] = {});
        for (const [name, v] of Object.entries(slots || {})) {
          const s = day[name] || (day[name] = { rx: 0, tx: 0 });
          s.rx += num(v.rx); s.tx += num(v.tx);
        }
      }
      for (const [name, v] of Object.entries(d.perIface || {})) {
        d.perIface[name] = { rx: num(v.rx), tx: num(v.tx), ts: num(d.lastTs) };
      }
      delete d.minutes;
      d.bit64 = false; d.gaps = 0; d.resetLog = []; d.resets = num(d.resets);
    }
    raw.version = USAGE_VERSION;
    usageDirty = true;
    console.log('[usage] v2 history migrated into per-day buckets without data loss');
    return raw;
  }
  usageResetNotice = true;
  console.warn('[usage] legacy mixed-interface history cleared; new history is exact per interface');
  return emptyUsageStore();
}
function saveUsage(force) {
  if (!usageDirty && !force) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usageStore) + '\n', { mode: 0o600 });
    usageDirty = false;
    usageResetNotice = false;
  } catch (e) { /* ignore */ }
}

/* ================= 网络拓扑：用户自定义节点（按设备隔离） =================
   自动发现的节点不落盘，每次实时从 RouterOS 邻居表 / DHCP 租约读取；
   这里只保存用户手工添加的节点，避免把可能过期的发现结果固化。 */
let topoStore = loadTopology();
function emptyTopology() { return { v: 1, devices: {} }; }
function loadTopology() {
  try {
    const raw = JSON.parse(fs.readFileSync(TOPOLOGY_FILE, 'utf8'));
    if (raw && raw.v === 1 && raw.devices && typeof raw.devices === 'object') return raw;
  } catch (e) { /* 首次启动 */ }
  return emptyTopology();
}
function saveTopology() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TOPOLOGY_FILE, JSON.stringify(topoStore, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch (e) { console.warn('[topology] cannot save topology.json:', e.message); return false; }
}
function customTopology(dev) {
  if (!dev || !topoStore.devices[dev.id]) return [];
  const v = topoStore.devices[dev.id].nodes;
  return Array.isArray(v) ? v : [];
}

/* ================= 拓扑图标库 =================
   图标统一放在 data/topology-icons/：WebUI 上传，或直接把图片拷进该目录也会被识别。
   index.json 存显示名与内容哈希；上传按 sha256 去重，多台设备可复用同一个图标文件。 */
const ICON_INDEX_FILE = path.join(TOPO_ICON_DIR, 'index.json');
/* 允许中文/空格等可读文件名（手动拷入即可被识别），但禁止路径分隔符与控制字符，防目录穿越 */
const ICON_NAME_RE = /^[^\\/:*?"<>|\x00-\x1f]{1,120}\.(png|jpe?g|webp|gif|svg)$/i;
function readIconIndex() {
  try {
    const d = JSON.parse(fs.readFileSync(ICON_INDEX_FILE, 'utf8'));
    return d && d.icons && typeof d.icons === 'object' ? d : { icons: {} };
  } catch (e) { return { icons: {} }; }
}
function saveIconIndex(idx) {
  try {
    fs.mkdirSync(TOPO_ICON_DIR, { recursive: true });
    const tmp = ICON_INDEX_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, ICON_INDEX_FILE);
    return true;
  } catch (e) { console.warn('[topology] cannot save icon index:', e.message); return false; }
}
function iconLabel(v, fallback) {
  const s = String(v == null ? '' : v).replace(/[\r\n\t\0-\x1f]/g, ' ').trim().slice(0, 40);
  return s || fallback;
}
/* 把用户命名转成安全文件名：保留中文/空格，去掉路径分隔符与控制字符，留出扩展名与冲突后缀空间 */
function iconSafeBase(v, fallback) {
  const s = String(v == null ? '' : v).replace(/\.[^.]*$/, '') // 去扩展名
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '').trim().slice(0, 60);
  return s || fallback;
}
/* SVG 作为 <img>/<image> 加载时浏览器已禁脚本，这里再做一次净化，移除显式脚本与危险属性 */
function sanitizeSvg(buf) {
  let s = buf.toString('utf8');
  s = s.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*(['"])[^'"]*\1/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return Buffer.from(s, 'utf8');
}
function iconUsage() {
  const used = {};
  for (const store of Object.values(topoStore.devices || {})) {
    for (const n of (store && store.nodes) || []) {
      const url = String((n && n.icon) || '');
      if (!url) continue;
      const name = url.split('/').pop();
      (used[name] = used[name] || []).push(String((n && n.name) || (n && n.id) || ''));
    }
  }
  return used;
}
function listTopoIcons() {
  const idx = readIconIndex(), used = iconUsage();
  let files = [];
  try { files = fs.readdirSync(TOPO_ICON_DIR).filter((f) => ICON_NAME_RE.test(f)); } catch (e) { /* 目录尚未创建 */ }
  return files.map((name) => {
    let st;
    try { st = fs.statSync(path.join(TOPO_ICON_DIR, name)); } catch (e) { return null; }
    const meta = idx.icons[name] || {};
    return {
      name, url: '/api/topology/icon/' + name,
      label: iconLabel(meta.label, name.replace(/\.[^.]+$/, '')),
      sha256: String(meta.sha256 || ''),
      size: st.size, mtime: st.mtime.toISOString(),
      usedBy: used[name] || [], managed: !!(meta.sha256 || meta.label),
    };
  }).filter(Boolean).sort((a, b) => (b.usedBy.length - a.usedBy.length) || b.mtime.localeCompare(a.mtime));
}

function usageBucket(dev) {
  if (!usageStore.devices[dev.id]) usageStore.devices[dev.id] = {
    interfaces: [], perIface: {}, lastTs: 0, bit64: false,
    hours: {}, days: {}, resets: 0, resetLog: [], gaps: 0,
  };
  const b = usageStore.devices[dev.id];
  if (!Array.isArray(b.interfaces)) b.interfaces = [];
  if (!b.hours || typeof b.hours !== 'object') b.hours = {};
  if (!b.days || typeof b.days !== 'object') b.days = {};
  if (!b.perIface || typeof b.perIface !== 'object') b.perIface = {};
  if (!Array.isArray(b.resetLog)) b.resetLog = [];
  return b;
}
const pad2 = (n) => String(n).padStart(2, '0');
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hourKey(ts) { const d = new Date(ts); return dayKey(ts) + 'T' + pad2(d.getHours()); }
/* 接口名匹配：精确匹配 + * / ? 通配符（RouterOS 接口名如 ether1、vlan-20、pppoe-out1） */
function matchIface(name, pattern) {
  if (name === pattern) return true;
  if (!/[*?]/.test(pattern)) return false;
  const src = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  try { return new RegExp(src, 'i').test(name); } catch (e) { return false; }
}
function ifaceSelected(name, patterns) {
  return !patterns.length || patterns.some((p) => matchIface(name, p));
}
/* 计数器差分：
   - 正常递增：本次 - 上次
   - 32 位回绕（仅在设备从未出现 64 位数值时）：2^32 - 上次 + 本次
   - 清零（PPPoE 重拨 / 接口重建 / 路由重启）：本次值就是清零以来的真实字节，照实计入
   绝不按速率补值、绝不把清零后的流量丢掉。 */
function counterDelta(prev, cur, bit64) {
  if (cur >= prev) return { d: cur - prev, reset: false };
  if (!bit64 && prev > 0xFF000000 && cur < 0x10000000) return { d: 0x100000000 - prev + cur, reset: false };
  return { d: cur, reset: true };
}
/* 记录一次真实采样。real=false（演示模式 / 离线 / 采不到计数器）时绝不写历史 */
function recordUsage(dev, ifaces, real) {
  const b = usageBucket(dev);
  if (!real || !Array.isArray(ifaces) || !ifaces.length) return;
  const now = Date.now(), prevTs = num(b.lastTs), prev = b.perIface || {};
  const cur = {};
  for (const i of ifaces) {
    if (!i || !i.name || i.rxBytes == null || i.txBytes == null) continue;
    const rx = Number(i.rxBytes), tx = Number(i.txBytes);
    if (!Number.isFinite(rx) || !Number.isFinite(tx) || rx < 0 || tx < 0) continue;
    cur[i.name] = { rx, tx };
    if (rx > 0xFFFFFFFF || tx > 0xFFFFFFFF) b.bit64 = true;
  }
  /* 接口短暂消失时保留旧计数器（7 天），重拨后重新出现才能识别清零并继续累计 */
  const nextPer = {};
  for (const [name, p] of Object.entries(prev)) {
    if (now - num(p.ts, prevTs) < 7 * 86400000) nextPer[name] = p;
  }
  for (const [name, c] of Object.entries(cur)) nextPer[name] = { rx: c.rx, tx: c.tx, ts: now };
  b.perIface = nextPer; b.lastTs = now;
  if (!Object.keys(cur).length) { usageDirty = true; return; }
  const longGap = prevTs > 0 && now - prevTs > USAGE_GAP_MS;
  if (longGap) b.gaps = num(b.gaps) + 1;
  const hour = hourKey(now), day = dayKey(now);
  for (const [name, c] of Object.entries(cur)) {
    const p = prev[name];
    if (!p) continue;                                   // 首次见到该接口：只建基线
    const a = counterDelta(num(p.rx), c.rx, b.bit64), z = counterDelta(num(p.tx), c.tx, b.bit64);
    if (a.reset || z.reset) {
      b.resets = num(b.resets) + 1;
      b.resetLog.push({ ts: now, iface: name, rx: c.rx, tx: c.tx });
      if (b.resetLog.length > 30) b.resetLog.shift();
    }
    const drx = a.d, dtx = z.d;
    if (drx < 0 || dtx < 0 || drx > 1e12 || dtx > 1e12) continue;   // 明显异常值：跳过
    if (!drx && !dtx) continue;
    if (!longGap) {                                     // 长时间停机不虚构小时分布
      const slot = b.hours[hour] || (b.hours[hour] = {});
      const hs = slot[name] || (slot[name] = { rx: 0, tx: 0 });
      hs.rx += drx; hs.tx += dtx;
    }
    const daySlot = b.days[day] || (b.days[day] = {});  // 日合计始终是完整真实差分
    const ds = daySlot[name] || (daySlot[name] = { rx: 0, tx: 0 });
    ds.rx += drx; ds.tx += dtx;
  }
  usageDirty = true;
  const hk = Object.keys(b.hours).sort();
  while (hk.length > USAGE_KEEP_HOURS) { delete b.hours[hk.shift()]; }
  const dk = Object.keys(b.days).sort();
  while (dk.length > USAGE_KEEP_DAYS) { delete b.days[dk.shift()]; }
}
/* 可选接口清单：只取真实接口元数据；仅显式演示模式才用演示接口 */
function usageAvailable(dev) {
  let src = dev.lastPacket && dev.lastPacket.ifaces;
  if (!src || !src.length) src = dev.ifaceMeta.size ? ifacesFromCache(dev) : [];
  if ((!src || !src.length) && dev.forceDemo) src = demoSnapshot(dev);
  return (src || []).map((i) => ({ name: i.name, type: i.type || '', comment: i.comment || '', running: i.running === 'true' }));
}
function emptyUsageResponse() {
  return { deviceId: '', ts: Date.now(), mode: 'offline', demo: false, dataReal: false, source: '', interval: INTERVAL,
    sampleTs: 0, resets: 0, resetLog: [], gaps: 0, migrated: false, resetNotice: false,
    today: { rx: 0, tx: 0 }, week: { rx: 0, tx: 0 },
    month: { rx: 0, tx: 0 }, total: { rx: 0, tx: 0 }, rate: { rx: 0, tx: 0, real: false },
    series: { today: [], week: [], month: [], total: [] }, detail: [], detailRange: 'today',
    interfaces: [], scope: 'all', available: [], matched: 0, hours: 0, days: 0 };
}
/* 汇总：按「日 × 网口」真实累计；opts.range 决定明细粒度（今日按小时，其余按天/月） */
function usageSummary(dev, opts = {}) {
  const b = usageStore.devices[dev.id] || { hours: {}, days: {}, interfaces: [] };
  const sel = Array.isArray(b.interfaces) ? b.interfaces.slice() : [];
  const patterns = sel;
  const range = ['today', 'week', 'month', 'total'].includes(opts.range) ? opts.range : 'today';
  const available = usageAvailable(dev);
  const now = new Date(), nowMs = now.getTime(), todayStr = dayKey(nowMs);
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); monthStart.setHours(0, 0, 0, 0);

  /* 每日总量 + 每日每网口明细（唯一日/周/月/累计依据） */
  const dayTotals = new Map(), dayIfaces = new Map();
  for (const [dk, slots] of Object.entries(b.days || {})) {
    const acc = { rx: 0, tx: 0 }, per = new Map();
    for (const [name, v] of Object.entries(slots || {})) {
      if (!ifaceSelected(name, patterns)) continue;
      const rx = num(v.rx), tx = num(v.tx);
      acc.rx += rx; acc.tx += tx;
      const c = per.get(name) || { rx: 0, tx: 0 }; c.rx += rx; c.tx += tx; per.set(name, c);
    }
    dayTotals.set(dk, acc); dayIfaces.set(dk, per);
  }
  const sumDays = (from) => {
    const acc = { rx: 0, tx: 0 };
    for (const [dk, v] of dayTotals) if (dk >= from && dk <= todayStr) { acc.rx += v.rx; acc.tx += v.tx; }
    return { rx: Math.round(acc.rx), tx: Math.round(acc.tx) };
  };
  const today = sumDays(todayStr), week = sumDays(dayKey(monday.getTime()));
  const month = sumDays(dayKey(monthStart.getTime())), total = sumDays('0000-00-00');

  /* 今日每小时总量 + 每小时每网口明细（小时桶只含连续采样区间） */
  const hourTotals = new Map(), hourIfaces = new Map();
  for (const [hk, slots] of Object.entries(b.hours || {})) {
    if (!String(hk).startsWith(todayStr)) continue;
    const hh = String(hk).slice(11), acc = { rx: 0, tx: 0 }, per = new Map();
    for (const [name, v] of Object.entries(slots || {})) {
      if (!ifaceSelected(name, patterns)) continue;
      const rx = num(v.rx), tx = num(v.tx);
      acc.rx += rx; acc.tx += tx;
      const c = per.get(name) || { rx: 0, tx: 0 }; c.rx += rx; c.tx += tx; per.set(name, c);
    }
    hourTotals.set(hh, acc); hourIfaces.set(hh, per);
  }
  /* 图表序列：今日按小时 / 本周按天 / 本月按天 / 累计按月 */
  const series = { today: [], week: [], month: [], total: [] };
  for (let h = 0; h <= now.getHours(); h++) {
    const hh = pad2(h), v = hourTotals.get(hh) || { rx: 0, tx: 0 };
    series.today.push({ label: hh + ':00', rx: Math.round(v.rx), tx: Math.round(v.tx) });
  }
  const daySeries = (from, count) => {
    const out = [], base = new Date(from); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      if (d.getTime() > nowMs) break;
      const k = dayKey(d.getTime()), v = dayTotals.get(k) || { rx: 0, tx: 0 };
      out.push({ label: k.slice(5), rx: Math.round(v.rx), tx: Math.round(v.tx) });
    }
    return out;
  };
  series.week = daySeries(monday, Math.max(1, Math.min(7, Math.floor((nowMs - monday) / 86400000) + 1)));
  series.month = daySeries(monthStart, Math.max(1, Math.floor((nowMs - monthStart) / 86400000) + 1));
  const perMonth = new Map(), monthIfaces = new Map();
  for (const [dk, per] of dayIfaces) {
    const k = dk.slice(0, 7), c = perMonth.get(k) || { rx: 0, tx: 0 }, v = dayTotals.get(dk);
    c.rx += v.rx; c.tx += v.tx; perMonth.set(k, c);
    const mi = monthIfaces.get(k) || new Map();
    for (const [name, x] of per) {
      const y = mi.get(name) || { rx: 0, tx: 0 }; y.rx += x.rx; y.tx += x.tx; mi.set(name, y);
    }
    monthIfaces.set(k, mi);
  }
  series.total = [...perMonth.entries()].sort().slice(-24)
    .map(([k, v]) => ({ label: k, rx: Math.round(v.rx), tx: Math.round(v.tx) }));

  /* 明细行：每个时间段先一行「全部接口」小计，再逐网口列出真实用量（最新在前） */
  const entries = [];
  if (range === 'today') {
    for (const [hh, per] of [...hourIfaces.entries()].sort()) {
      const t = hourTotals.get(hh) || { rx: 0, tx: 0 };
      if (!t.rx && !t.tx) continue;
      entries.push({ label: todayStr + ' ' + hh + ':00', total: t, per });
    }
  } else if (range === 'total') {
    for (const [k, per] of [...monthIfaces.entries()].sort()) {
      entries.push({ label: k, total: perMonth.get(k) || { rx: 0, tx: 0 }, per });
    }
  } else {
    const from = range === 'week' ? dayKey(monday.getTime()) : dayKey(monthStart.getTime());
    for (const dk of [...dayTotals.keys()].sort()) {
      if (dk < from || dk > todayStr) continue;
      const v = dayTotals.get(dk); if (!v.rx && !v.tx) continue;
      entries.push({ label: dk, total: v, per: dayIfaces.get(dk) || new Map() });
    }
  }
  entries.reverse();
  const detail = [];
  for (const e of entries.slice(0, 400)) {
    detail.push({ label: e.label, iface: '', rx: Math.round(e.total.rx), tx: Math.round(e.total.tx) });
    const per = [...e.per.entries()].sort((a, c) => (c[1].rx + c[1].tx) - (a[1].rx + a[1].tx));
    for (const [name, v] of per) detail.push({ label: e.label, iface: name, rx: Math.round(v.rx), tx: Math.round(v.tx) });
  }
  /* 当前速率：monitor-traffic 的真实 bps，不做任何推算 */
  let rate = { rx: 0, tx: 0, real: false };
  if (!dev.forceDemo && dev.mode === 'live' && dev.lastRates && dev.lastRates.size) {
    const acc = { rx: 0, tx: 0 }; let found = false;
    for (const [name, r] of dev.lastRates) {
      if (!ifaceSelected(name, patterns)) continue;
      acc.rx += num(r.rxBps); acc.tx += num(r.txBps); found = true;
    }
    if (found) rate = { rx: Math.round(acc.rx), tx: Math.round(acc.tx), real: true };
  }
  return {
    deviceId: dev.id, ts: Date.now(), mode: dev.mode, demo: dev.forceDemo,
    dataReal: !dev.forceDemo && dev.mode === 'live',
    source: 'RouterOS /interface/print rx-byte / tx-byte per-interface counter deltas; redial resets counted, no estimation',
    interval: INTERVAL, sampleTs: num(b.lastTs), resets: num(b.resets),
    resetLog: (b.resetLog || []).slice(-5), gaps: num(b.gaps),
    migrated: usageMigrated, resetNotice: usageResetNotice,
    today, week, month, total, series, detail, detailRange: range, rate,
    interfaces: sel, scope: sel.length ? 'custom' : 'all', available,
    matched: available.filter((i) => ifaceSelected(i.name, patterns)).length,
    hours: Object.keys(b.hours || {}).length, days: Object.keys(b.days || {}).length,
  };
}

/* 运行时间只取 RouterOS /system/resource/print 的 uptime；取不到就返回 null（显示未知），绝不拿进程时间冒充 */
function packetUptime(dev) {
  return parseRouterUptime(dev.lastResource && dev.lastResource.uptime);
}

/* ================= 设备注册表 ================= */
function freshDemoDB() {
  const db = {};
  for (const [k, v] of Object.entries(seed)) db[k] = v.map((r) => ({ ...r }));
  return db;
}
function newId() { return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

class Device {
  constructor(cfg) {
    this.cfg = cfg;                 // { id, name, host, port, user, password, tls, demo }
    this.api = null;
    this.reconnectTimer = null;
    this.monitorApi = null;       // 专用于 /interface/monitor-traffic 流式监听的连接
    this.monitorRetry = null;
    this.streamFlush = null;
    this.streamActive = false;
    this.monitorFails = 0;        // 连续失败次数：退避重试 + 日志去重
    this.lastStreamError = '';
    this.ifaceMeta = new Map();   // name -> { type, comment, running, disabled }
    this.lastRates = new Map();   // name -> { rxBps, txBps, rxPps, txPps }
    this.lastResource = null;
    this.connections = { v4: 0, v6: 0, total: 0, tcp4: 0, udp4: 0, tcp6: 0, udp6: 0, tcp: 0, udp: 0 };
    this.connectionsReal = false; this.connectionsAt = 0;
    this.lastConnPoll = 0;
    this.polling = false;
    this.mode = cfg.demo ? 'demo' : 'connecting';
    this.lastError = '';
    this.lastPacket = null;
    this.history = [];
    this.resourceHistory = [];
    this.ifaceTotals = new Map();
    this.demoTotal = new Map();
    this.demoDB = freshDemoDB();
    this.demoIdSeq = 100;
    this.demoLogTick = -1;
    this.logSeq = 1000;
    this.startedAt = Date.now();
  }
  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get forceDemo() { return !!this.cfg.demo; }
  snapshotCfg() {
    return { id: this.cfg.id, name: this.cfg.name, host: this.cfg.host, port: this.cfg.port,
      user: this.cfg.user, tls: !!this.cfg.tls, demo: !!this.cfg.demo, passwordSet: !!this.cfg.password };
  }
  publicStatus() {
    return { id: this.id, name: this.name, mode: this.mode, host: this.cfg.host, port: this.cfg.port,
      tls: !!this.cfg.tls, user: this.cfg.user, connected: !!(this.api && this.api.connected),
      error: this.lastError, points: this.history.length, forceDemo: this.forceDemo,
      uptime: packetUptime(this), interval: INTERVAL, dataReal: this.mode === 'live' && !this.forceDemo };
  }
  stopTrafficStream() {
    if (this.monitorRetry) { clearTimeout(this.monitorRetry); this.monitorRetry = null; }
    if (this.streamFlush) { clearTimeout(this.streamFlush); this.streamFlush = null; }
    if (this.monitorApi) { this.monitorApi.close(); this.monitorApi = null; }
    this.streamActive = false;
  }
  reconnectNow() {
    this.stopTrafficStream();
    if (this.api) { this.api.close(); this.api = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.lastError = ''; this.mode = this.forceDemo ? 'demo' : 'connecting';
    this.ifaceTotals.clear(); this.history.length = 0; this.resourceHistory.length = 0;
    this.ifaceMeta.clear(); this.lastRates.clear(); this.lastResource = null;
    this.monitorFails = 0; this.lastStreamError = '';
    this.ensureConnection();
  }
  ensureConnection() {
    if (this.forceDemo || (this.api && this.api.connected) || this.reconnectTimer) return;
    this.mode = 'connecting';
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.api) { this.api.close(); this.api = null; }
      const client = new RouterOSAPI({ ...this.cfg, reconnectMs: 2000 });
      try {
        await client.connect();
        const check = await client.exec(['/system/resource/print']);
        if (check.status.type === 'trap') throw new Error(check.status.message || '读取系统信息失败');
        this.api = client; this.mode = 'live'; this.lastError = '';
        console.log(`[ros] ${this.name} connected ${this.cfg.host}:${this.cfg.port}`);
        startTrafficStream(this);
      } catch (e) {
        client.close(); this.stopTrafficStream(); this.mode = 'offline'; this.lastError = e.message || String(e);
        console.log(`[ros] ${this.name} connection failed: ${this.lastError}`);
      }
    }, this.api ? Math.max(2000, envNum('ROS_RECONNECT_MS', 10000)) : 300);
  }
}

const devices = new Map();
let activeId = '';

/* 旧版本默认监听 3000，升级到新默认 10086 时不能被持久化值覆盖；
   只有非旧默认值才视为用户显式配置。 */
function savedListenPort(value) {
  const n = Number(value);
  if (n === 3000 || !validPort(n)) return null;
  return n;
}

function loadDeviceRegistry() {
  let reg = null;
  try { reg = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8')); } catch (e) { reg = null; }
  let needsMigration = false;
  if (!reg || !Array.isArray(reg.devices) || !reg.devices.length) {
    /* 迁移旧的单设备 settings.json / 环境变量 */
    let old = {};
    try { old = JSON.parse(fs.readFileSync(LEGACY_SETTINGS, 'utf8')); } catch (e) { old = {}; }
    scrubLegacySettings();
    const seeded = {
      id: newId(),
      name: old.name || '主路由',
      host: old.host || process.env.ROS_HOST || '10.0.0.1',
      port: Number(old.port || process.env.ROS_PORT || (process.env.ROS_TLS === '1' ? 8729 : 8728)),
      user: old.user || process.env.ROS_USER || 'admin',
      password: typeof old.password === 'string' ? old.password : (process.env.ROS_PASSWORD || ''),
      tls: typeof old.tls === 'boolean' ? old.tls : process.env.ROS_TLS === '1',
      demo: typeof old.demo === 'boolean' ? old.demo : process.env.DEMO_MODE === '1',
    };
    reg = { devices: [seeded], activeId: seeded.id, webPort: savedListenPort(old.webPort) || PORT, hostPort: Number(process.env.WEB_PORT || 0) || 0 };
    if (validPort(reg.webPort)) PORT = Number(reg.webPort);
    devices.set(seeded.id, new Device({ ...seeded }));
    activeId = seeded.id;
    saveDeviceRegistry();
    return;
  }
  const persistedPort = savedListenPort(reg.webPort);
  const portMigrated = !persistedPort && Number(reg.webPort) !== PORT;
  if (persistedPort) PORT = persistedPort;
  for (const d of reg.devices) {
    if (!d.id || !validHost(d.host) || !validPort(d.port) || !validName(d.name)) continue;
    if (typeof d.password === 'string' && d.password && !d.password.startsWith('enc:v1:')) needsMigration = true;
    if (typeof d.user === 'string' && d.user && !d.user.startsWith('enc:v1:')) needsMigration = true;
    devices.set(String(d.id), new Device({
      id: String(d.id), name: String(d.name).trim(), host: String(d.host).trim(), port: Number(d.port),
      user: decryptCredential(d.user) || 'admin', password: decryptCredential(d.password), tls: !!d.tls, demo: !!d.demo,
    }));
  }
  if (!devices.size) {
    const fallback = { id: newId(), name: '主路由', host: '10.0.0.1', port: 8728, user: 'admin', password: '', tls: false, demo: true };
    devices.set(fallback.id, new Device(fallback));
    activeId = fallback.id;
    saveDeviceRegistry();
  } else activeId = devices.has(reg.activeId) ? reg.activeId : devices.keys().next().value;
  if (portMigrated || needsMigration) saveDeviceRegistry(); // 明文凭据就地升级为密文
  if (needsMigration) console.log('[credentials] migrated plaintext device credentials to AES-256-GCM');
}
function saveDeviceRegistry() {
  const reg = {
    devices: [...devices.values()].map((d) => ({ ...d.cfg,
      user: encryptCredential(d.cfg.user), password: encryptCredential(d.cfg.password) })),
    activeId, webPort: PORT, hostPort: Number(process.env.WEB_PORT || 0) || 0,
  };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(reg, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch (e) { console.error('[devices] save failed:', e.message); return false; }
}
function activeDevice() { return devices.get(activeId) || devices.values().next().value || null; }
function deviceById(id) { return devices.get(id) || activeDevice(); }

loadDeviceRegistry();
/* 启动清理：删除已不存在设备的统计桶，避免残留历史占用并让「删除设备清历史」保持一致 */
for (const id of Object.keys(usageStore.devices)) {
  if (!devices.has(id)) { delete usageStore.devices[id]; usageDirty = true; }
}
if (usageDirty) saveUsage(true);

/* ================= 演示数据（每设备独立） ================= */
/* DEMO 连接表：字节数随实时帧递增，模拟真实连接表的累计流量。
   否则 demoDB 是静态 seed，连接页字节永远不变、仪表盘 TOP10 也不动。 */
function demoConnectionsRows(dev, sectionId) {
  const base = (dev.demoDB[sectionId] || []).map((r) => ({ ...r }));
  const t = Date.now() / 1000;
  return base.map((r, i) => {
    const speed = 1800 + ((i * 3719) % 9000);           // 每条连接一个稳定的伪速率
    const add = Math.round(speed * (t % 3600) + i * 530);
    const orig = num(r['orig-bytes']) + add, repl = num(r['repl-bytes']) + Math.round(add * 0.6);
    if (r['orig-bytes'] !== undefined || r['repl-bytes'] !== undefined) {
      r['orig-bytes'] = String(orig); r['repl-bytes'] = String(repl);
    } else {
      r.bytes = String(num(r.bytes) + add);
    }
    return normalizeConnectionRow(r);
  });
}
function demoPrint(dev, sectionId) {
  if (sectionId === 'connections' || sectionId === 'connections6') return demoConnectionsRows(dev, sectionId);
  return (dev.demoDB[sectionId] || []).map((r) => ({ ...r }));
}
function demoAdd(dev, sectionId, values) {
  const arr = dev.demoDB[sectionId] || (dev.demoDB[sectionId] = []);
  const row = { '.id': '*D' + (++dev.demoIdSeq), ...values };
  if (sectionId === 'interfaces') { row.running = bool(row.disabled) ? 'false' : 'true'; row.type = row.type || 'ether'; }
  arr.push(row); return row;
}
function demoSet(dev, sectionId, id, values) {
  const arr = dev.demoDB[sectionId] || [];
  const row = arr.find((r) => r['.id'] === id);
  if (!row) throw new Error('找不到该条目: ' + id);
  Object.assign(row, values);
  if (sectionId === 'interfaces' && 'disabled' in values) row.running = bool(row.disabled) ? 'false' : 'true';
  return row;
}
function demoToggle(dev, sectionId, ids, enable) {
  const arr = dev.demoDB[sectionId] || []; let n = 0;
  for (const id of ids) {
    const row = arr.find((r) => r['.id'] === id);
    if (row) { row.disabled = enable ? 'false' : 'true'; if (sectionId === 'interfaces') row.running = enable ? 'true' : 'false'; n++; }
  }
  return n;
}
function demoRemove(dev, sectionId, ids) {
  const arr = dev.demoDB[sectionId] || []; let n = 0;
  for (const id of ids) { const i = arr.findIndex((r) => r['.id'] === id); if (i >= 0) { arr.splice(i, 1); n++; } }
  return n;
}

function wordsFromValues(fields, values) {
  const allowed = new Set(fields.map((f) => f.key)); const out = [];
  for (const [k, v] of Object.entries(values || {})) {
    if (!allowed.has(k) || k === '.id') continue;
    if (v === null || v === undefined || v === '') continue;
    out.push(typeof v === 'boolean' ? `=${k}=${rosBool(v)}` : `=${k}=${v}`);
  }
  return out;
}
/* RouterOS v7 连接表用 orig-bytes / repl-bytes + tcp-state，v6 用 bytes / connection-state。
   统一成前端表格使用的字段名，避免真实设备里出现「状态 —」「字节 0」。 */
function normalizeConnectionRow(row) {
  const out = { ...row };
  const sum = (v) => String(v == null ? '' : v).split('/')
    .reduce((s, x) => s + (Number(String(x).trim()) || 0), 0);
  const raw = row.bytes;
  out.bytes = String(raw != null && raw !== '' ? sum(raw) : sum(row['orig-bytes']) + sum(row['repl-bytes']));
  if (!out['connection-state']) {
    const tcp = String(row['tcp-state'] || '').trim();
    const flags = String(row.flags || row['.id'] || '').toUpperCase();
    const replied = /^(true|yes|1)$/i.test(String(row['seen-reply'] || ''));
    out['connection-state'] = tcp || (replied || /[SA]/.test(flags) ? 'established'
      : /D/.test(flags) ? 'time-wait' : 'new');
  }
  return out;
}
async function rosPrint(dev, section) {
  if (dev.forceDemo) return demoPrint(dev, section.id);   // 仅用户显式开启的演示模式
  if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，无法读取真实配置 / Router offline - no real data available');
  const r = await dev.api.exec([`${section.path}/print`]);
  if (r.status.type === 'trap') throw new Error(r.status.message || '读取失败');
  const rows = r.re || [];
  return (section.id === 'connections' || section.id === 'connections6')
    ? rows.map(normalizeConnectionRow) : rows;
}
async function rosWrite(dev, section, action, payload) {
  const { ids = [], values = {} } = payload || {};
  if (dev.forceDemo) {
    switch (action) {
      case 'add': return { changed: 1, row: demoAdd(dev, section.id, values) };
      case 'set': {
        if (section.singleton && !ids.length) {
          const arr = dev.demoDB[section.id] || (dev.demoDB[section.id] = []);
          if (!arr.length) arr.push({ '.id': '*1' });
          return { changed: 1, row: demoSet(dev, section.id, arr[0]['.id'], values) };
        }
        if (!ids[0]) throw new Error('缺少 .id');
        return { changed: 1, row: demoSet(dev, section.id, ids[0], values) };
      }
      case 'enable': return { changed: demoToggle(dev, section.id, ids, true) };
      case 'disable': return { changed: demoToggle(dev, section.id, ids, false) };
      case 'remove': return { changed: demoRemove(dev, section.id, ids) };
      case 'run': throw new Error('演示模式不能运行脚本 / Demo mode cannot run scripts');
      default: throw new Error('不支持的操作');
    }
  }
  if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，未写入任何配置 / Router offline - nothing was changed');
  const cmds = []; const wv = wordsFromValues(section.fields, values);
  switch (action) {
    case 'add': cmds.push([`${section.path}/add`, ...wv]); break;
    case 'set':
      if (section.singleton && !ids.length) { cmds.push([`${section.path}/set`, ...wv]); break; }
      if (!ids[0]) throw new Error('缺少 .id');
      cmds.push([`${section.path}/set`, `=.id=${ids[0]}`, ...wv]); break;
    case 'enable': case 'disable': for (const id of ids) cmds.push([`${section.path}/${action}`, `=.id=${id}`]); break;
    case 'remove': for (const id of ids) cmds.push([`${section.path}/remove`, `=.id=${id}`]); break;
    /* /system/script 没有 enabled/disabled 字段，只有 run 命令（官方文档 Scripting → Script repository） */
    case 'run':
      if (!section.runPath) throw new Error('该分类不支持运行');
      for (const id of ids) cmds.push([section.runPath, `=.id=${id}`]);
      break;
    default: throw new Error('不支持的操作');
  }
  let changed = 0;
  for (const cmd of cmds) { const r = await dev.api.exec(cmd); if (r.status.type === 'trap') throw new Error(r.status.message || '操作失败'); changed++; }
  return { changed };
}
const SPECIAL = {
  reboot: async (dev) => {
    if (dev.forceDemo) return { ok: true, demo: true, simulated: true };
    if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，未执行重启 / Router offline - reboot not executed');
    const r = await dev.api.exec(['/system/reboot']); if (r.status.type === 'trap') throw new Error(r.status.message);
    return { ok: true };
  },
  backup: async (dev, p) => {
    const name = String((p && p.name) || ('backup-' + new Date().toISOString().slice(0, 10))).replace(/[^a-zA-Z0-9_\-]/g, '');
    if (dev.forceDemo) return { ok: true, name, demo: true, simulated: true };
    if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，未生成备份 / Router offline - backup not created');
    const r = await dev.api.exec(['/system/backup/save', `=name=${name}`]); if (r.status.type === 'trap') throw new Error(r.status.message);
    return { ok: true, name };
  },
  ping: async (dev, p) => {
    const address = String((p && p.address) || dev.cfg.host).trim();
    if (!/^[a-zA-Z0-9_.:-]+$/.test(address)) throw new Error('地址格式不正确');
    if (dev.forceDemo) {
      const rows = [];
      for (let i = 1; i <= 5; i++) rows.push({ seq: String(i), host: address, time: (1 + Math.random() * 3).toFixed(2) + 'ms', ttl: '64', size: '56' });
      return { ok: true, rows, demo: true, simulated: true };
    }
    if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，无法执行真实 ping / Router offline - ping unavailable');
    const r = await dev.api.exec(['/ping', `=address=${address}`, '=count=5']);
    return { ok: true, rows: r.re };
  },
  'log-clear': async (dev) => {
    if (dev.forceDemo) { dev.demoDB.logs.length = 0; return { ok: true, demo: true, simulated: true }; }
    if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，未清除日志 / Router offline - logs not cleared');
    const r = await dev.api.exec(['/log/clear']); if (r.status.type === 'trap') throw new Error(r.status.message);
    return { ok: true };
  },
};

/* ================= 采集 ================= */
function demoResource(dev) {
  const cpu = Math.max(3, Math.min(78, 12 + Math.round(Math.sin(Date.now() / 23000 + dev.id.length) * 9 + (Math.random() - 0.5) * 6)));
  return {
    'cpu-load': String(cpu), 'total-memory': '1073741824',
    'free-memory': String(Math.round(1073741824 * (0.32 + Math.random() * 0.08))),
    'total-hdd-space': '16777216', 'free-hdd-space': String(Math.round(16777216 * 0.71)),
    /* 演示路由器的运行时间：用固定基准 + 进程存活时间递增，不随 WebUI 重启从 0 开始
       （原来是 Date.now()-startedAt，WebUI 刚起就显示"运行 4分"，明显不对）。 */
    uptime: fmtDuration(12 * 86400 + 7 * 3600 + 34 * 60 + (Date.now() - dev.startedAt) / 1000), 'board-name': 'RB5009UG+S+',
    version: '7.15.2 (stable)', 'build-time': '2024-06-18 12:34:56',
  };
}
function demoSnapshot(dev) {
  const t = Date.now() / 1000;
  const defs = [
    ['ether1', 'ether', 'WAN 上行', 1], ['ether2', 'ether', 'LAN 主网', 1], ['ether3', 'ether', 'NAS', 1],
    ['ether4', 'ether', 'AP 桥接', 1], ['ether5', 'ether', '备用', 0], ['bridge-lan', 'bridge', 'LAN 桥', 1],
    ['docker-br', 'bridge', '容器网', 1], ['wg1', 'wireguard', 'VPN', 1],
  ];
  return defs.map(([name, type, comment, enabled], idx) => {
    const base = [3.2e6, 1.4e6, 8.5e5, 6.0e5, 0, 4.0e5, 2.2e5, 1.1e5][idx];
    const wave = Math.sin(t / 11 + idx * 1.7) * 0.34 + Math.sin(t / 3.3 + idx) * 0.16;
    const jitter = (Math.random() - 0.5) * 0.12;
    const rxBps = enabled ? Math.round(base * Math.max(0.02, 0.72 + wave + jitter) * 3.4) : 0;
    const txBps = enabled ? Math.round(base * Math.max(0.01, 0.28 + Math.sin(t / 7 + idx * 2.1) * 0.12) * 2.2) : 0;
    const prev = dev.demoTotal.get(name) || { rx: base * 18, tx: base * 9 };
    const next = { rx: prev.rx + rxBps * INTERVAL / 8000, tx: prev.tx + txBps * INTERVAL / 8000 };
    dev.demoTotal.set(name, next);
    return {
      name, type, comment, running: enabled ? 'true' : 'false', disabled: enabled ? 'false' : 'true',
      rxBps, txBps, rxPps: Math.round(rxBps / 8200 + Math.random() * 20), txPps: Math.round(txBps / 9100),
      rxBytes: Math.round(next.rx), txBytes: Math.round(next.tx), rxErrors: 0, txErrors: 0,
      rxDrops: idx === 3 && Math.random() > 0.85 ? 1 : 0, txDrops: 0,
    };
  });
}
async function collectLive(dev, client, useStream) {
  const list = await client.exec(['/interface/print', '=.proplist=name,type,comment,disabled,running,rx-byte,tx-byte,rx-packet,tx-packet,rx-error,tx-error,rx-drop,tx-drop']);
  if (list.status.type === 'trap') throw new Error('interface print: ' + (list.status.message || 'trap'));
  dev.ifaceMeta.clear();
  for (const row of list.re) {
    if (!row.name) continue;
    dev.ifaceMeta.set(row.name, {
      type: row.type || '', comment: row.comment || '', running: row.running || 'false', disabled: row.disabled || 'false',
      rxErrors: num(row['rx-error']), txErrors: num(row['tx-error']), rxDrops: num(row['rx-drop']), txDrops: num(row['tx-drop']),
    });
  }
  const out = [];
  for (const row of list.re) {
    if (!row.name || row.disabled === 'true') continue;
    let rxBps = 0, txBps = 0, rxPps = 0, txPps = 0;
    if (useStream) {
      const cached = dev.lastRates.get(row.name) || {};
      rxBps = cached.rxBps || 0; txBps = cached.txBps || 0; rxPps = cached.rxPps || 0; txPps = cached.txPps || 0;
    } else {
      let tr = {};
      try { const r = await client.exec(['/interface/monitor-traffic', `=interface=${row.name}`, '=once=']); if (r.re.length) tr = r.re[0]; } catch (e) { /* ignore */ }
      rxBps = num(tr['rx-bits-per-second']); txBps = num(tr['tx-bits-per-second']);
      rxPps = num(tr['rx-packets-per-second']); txPps = num(tr['tx-packets-per-second']);
    }
    /* 累计字节只使用 RouterOS 的真实计数器；字段缺失时留空，绝不用「速率 × 时间」估算补值 */
    const hasCounters = row['rx-byte'] !== undefined && row['tx-byte'] !== undefined
      && Number.isFinite(Number(row['rx-byte'])) && Number.isFinite(Number(row['tx-byte']));
    if (hasCounters) dev.ifaceTotals.set(row.name, { rx: num(row['rx-byte']), tx: num(row['tx-byte']) });
    if (!useStream) dev.lastRates.set(row.name, { rxBps, txBps, rxPps, txPps }); // 轮询模式同样是 monitor-traffic 真实值
    out.push({
      name: row.name, type: row.type || '', comment: row.comment || '', running: row.running || 'false', disabled: 'false',
      rxBps, txBps, rxPps, txPps,
      rxBytes: hasCounters ? num(row['rx-byte']) : null, txBytes: hasCounters ? num(row['tx-byte']) : null,
      countersReal: hasCounters,
      rxErrors: num(row['rx-error']), txErrors: num(row['tx-error']), rxDrops: num(row['rx-drop']), txDrops: num(row['tx-drop']),
    });
  }
  return out;
}
async function collectResource(dev, client) {
  const r = await client.exec(['/system/resource/print']);
  return r.re[0] || {};
}

/* ---- 连接表计数：RouterOS count-only，IPv4/IPv6 分开取 ---- */
async function connCount(client, path, query) {
  const words = [path, '=count-only='];
  if (query) words.push(query);
  try {
    const r = await client.exec(words);
    if (r.status.type === 'trap') return -1;
    const n = Number(r.status.ret);
    return Number.isFinite(n) ? n : -1;
  } catch (e) { return -1; }
}
async function collectConnections(dev, client) {
  const P4 = '/ip/firewall/connection/print', P6 = '/ipv6/firewall/connection/print';
  const [v4, v6, tcp4, udp4, tcp6, udp6] = await Promise.all([
    connCount(client, P4), connCount(client, P6),
    connCount(client, P4, '?protocol=tcp'), connCount(client, P4, '?protocol=udp'),
    connCount(client, P6, '?protocol=tcp'), connCount(client, P6, '?protocol=udp'),
  ]);
  const n = (x) => (x >= 0 ? x : 0);
  return {
    v4: n(v4), v6: n(v6), total: n(v4) + n(v6),
    tcp4: n(tcp4), udp4: n(udp4), tcp6: n(tcp6), udp6: n(udp6),
    tcp: n(tcp4) + n(tcp6), udp: n(udp4) + n(udp6),
  };
}
function demoConnections(dev) {
  const t = Date.now() / 1000;
  const v4 = Math.round(1180 + Math.sin(t / 13) * 260 + Math.sin(t / 4.7) * 70 + (Math.random() - 0.5) * 24);
  const v6 = Math.round(96 + Math.sin(t / 19 + 1) * 34 + (Math.random() - 0.5) * 10);
  const tcp4 = Math.round(v4 * 0.61), udp4 = Math.round(v4 * 0.33);
  const tcp6 = Math.round(v6 * 0.58), udp6 = Math.round(v6 * 0.36);
  return { v4: Math.max(0, v4), v6: Math.max(0, v6), total: Math.max(0, v4) + Math.max(0, v6),
    tcp4, udp4, tcp6, udp6, tcp: tcp4 + tcp6, udp: udp4 + udp6 };
}
async function refreshConnections(dev, live) {
  if (Date.now() - dev.lastConnPoll < CONN_INTERVAL) return;
  dev.lastConnPoll = Date.now();
  if (live && dev.api && dev.api.connected) {
    try {
      const c = await collectConnections(dev, dev.api);
      if (c.v4 > 0 || c.v6 > 0) { dev.connections = c; dev.connectionsReal = true; dev.connectionsAt = Date.now(); return; }
    } catch (e) { /* 采集失败：保留上一次真实值 */ }
    dev.connectionsReal = false;
    return;
  }
  if (dev.forceDemo) { dev.connections = demoConnections(dev); dev.connectionsReal = false; }
  else dev.connectionsReal = false;   // 离线：保留上次真实值，不生成假数据
}

/* ---- 真·实时：RouterOS 原生 monitor-traffic 持续推送（每秒一次 !re） ---- */
function ifacesFromCache(dev) {
  const out = [];
  for (const [name, meta] of dev.ifaceMeta) {
    if (meta.disabled === 'true') continue;
    const rate = dev.lastRates.get(name) || {};
    const total = dev.ifaceTotals.get(name) || null;   // 只缓存真实计数器，没有就是未知
    out.push({
      name, type: meta.type, comment: meta.comment, running: meta.running, disabled: 'false',
      rxBps: rate.rxBps || 0, txBps: rate.txBps || 0, rxPps: rate.rxPps || 0, txPps: rate.txPps || 0,
      rxBytes: total ? Math.round(total.rx) : null, txBytes: total ? Math.round(total.tx) : null,
      countersReal: !!total,
      rxErrors: meta.rxErrors || 0, txErrors: meta.txErrors || 0, rxDrops: meta.rxDrops || 0, txDrops: meta.txDrops || 0,
    });
  }
  return out;
}
/* 历史点同时保留每个接口的速率，前端切换「仪表盘速率接口」后可重建该接口的趋势 */
function historyPoint(ts, ifaces, totalRx, totalTx) {
  const per = {};
  for (const i of ifaces || []) per[i.name] = { rx: i.rxBps || 0, tx: i.txBps || 0 };
  return { ts, rx: totalRx, tx: totalTx, per };
}
function emitStreamPacket(dev) {
  if (!dev.ifaceMeta.size) return;
  const ifaces = ifacesFromCache(dev);
  const totalRx = ifaces.reduce((s, i) => s + i.rxBps, 0), totalTx = ifaces.reduce((s, i) => s + i.txBps, 0);
  const packet = {
    deviceId: dev.id, deviceName: dev.name, ts: Date.now(), mode: dev.mode, host: dev.cfg.host,
    interval: INTERVAL, streaming: true, uptime: packetUptime(dev), error: dev.lastError,
    dataReal: !dev.forceDemo && dev.mode === 'live',
    totalRx, totalTx, ifaces, resource: dev.lastResource || {}, resourceHistory: dev.resourceHistory,
    connections: dev.connections, connectionsReal: dev.connectionsReal, connectionsAt: dev.connectionsAt,
    /* DEMO 模式随实时帧下发动态连接行，让连接页与仪表盘 TOP10 每秒变化（真实设备仍走 /api/config 拉取） */
    connRows: dev.forceDemo ? { connections: demoConnectionsRows(dev, 'connections'), connections6: demoConnectionsRows(dev, 'connections6') } : null,
  };
  dev.history.push(historyPoint(packet.ts, ifaces, totalRx, totalTx));
  if (dev.history.length > HISTORY) dev.history.shift();
  dev.lastPacket = packet;
  broadcast(dev.id, packet);
}
function streamFailed(dev, client, err) {
  if (dev.monitorApi === client) { client.close(); dev.monitorApi = null; }
  dev.streamActive = false;
  const msg = err && err.message ? err.message : String(err);
  dev.monitorFails = (dev.monitorFails || 0) + 1;
  const repeated = msg === dev.lastStreamError;
  dev.lastStreamError = msg;
  /* 同一错误只打印前两次、之后每 10 次打印一次，避免配置性错误每 10 秒刷屏 */
  if (!repeated || dev.monitorFails <= 2 || dev.monitorFails % 10 === 0) {
    console.warn(`[ros] ${dev.name} traffic stream unavailable: ${msg} - using polling${dev.monitorFails > 2 ? ` (${dev.monitorFails} failures)` : ''}`);
  }
  if (!dev.forceDemo && dev.api && dev.api.connected && !dev.monitorRetry) {
    /* 指数退避：10s → 20s → ... → 最长 10 分钟，轮询流量不受影响 */
    const base = envNum('TRAFFIC_STREAM_RETRY_MS', 10000);
    const delay = Math.min(600000, base * Math.pow(2, Math.min(5, dev.monitorFails - 1)));
    dev.monitorRetry = setTimeout(() => { dev.monitorRetry = null; startTrafficStream(dev); }, delay);
  }
}
async function startTrafficStream(dev) {
  if (dev.forceDemo || String(process.env.TRAFFIC_STREAM || '1') === '0' || !dev.api || !dev.api.connected || dev.monitorApi || dev.monitorRetry) return;
  const client = new RouterOSAPI({ ...dev.cfg });
  try {
    await client.connect();
    if (!dev.api || !dev.api.connected || dev.monitorApi) { client.close(); return; }
    dev.monitorApi = client; dev.streamActive = true;
    /* RouterOS 的 monitor-traffic 不接受 interface=all（部分版本报
       「input does not match any value of interface」），必须列出真实接口名。
       首次连接时缓存尚未填充，先用专用连接读取接口列表。 */
    let names = [...dev.ifaceMeta.entries()].filter(([, m]) => m.disabled !== 'true').map(([n]) => n);
    if (!names.length) {
      const ir = await client.exec(['/interface/print', '=.proplist=name,disabled']);
      if (ir.status.type === 'trap') throw new Error(ir.status.message || '读取接口列表失败');
      names = ir.re.filter((r) => r.name && r.disabled !== 'true').map((r) => r.name);
    }
    /* RouterOS 的 interface 参数最多 100 个元素，超过会被拒绝 */
    names = names.slice(0, 100);
    if (!names.length) throw new Error('没有可监控的接口');
    console.log(`[ros] ${dev.name} live traffic stream started (monitor-traffic: ${names.length} interfaces)`);
    const r = await client.exec(['/interface/monitor-traffic', '=interface=' + names.join(',')], {
      onRecord: (rec) => {
        const name = rec.name || rec.interface;
        if (!name) return;
        /* 收到真实推送才确认流可用，重置退避与错误去重状态 */
        if (dev.monitorFails || dev.lastStreamError) { dev.monitorFails = 0; dev.lastStreamError = ''; }
        dev.lastRates.set(name, {
          rxBps: num(rec['rx-bits-per-second']), txBps: num(rec['tx-bits-per-second']),
          rxPps: num(rec['rx-packets-per-second']), txPps: num(rec['tx-packets-per-second']),
        });
        // 同一秒的多接口记录合并成一次完整快照，避免前端看到半更新数据
        if (!dev.streamFlush) dev.streamFlush = setTimeout(() => { dev.streamFlush = null; emitStreamPacket(dev); }, 80);
      },
    });
    if (r.status.type === 'trap') throw new Error(r.status.message || 'monitor-traffic rejected');
    streamFailed(dev, client, new Error('monitor stream ended'));
  } catch (e) { streamFailed(dev, client, e); }
}

async function pollDevice(dev) {
  if (dev.polling) return;
  dev.polling = true;
  try {
    const wasLive = !dev.forceDemo && !!(dev.api && dev.api.connected);
    const useStream = !!(wasLive && dev.streamActive);
    let ifaces = null, resource = null, realSample = false;
    if (wasLive) {
      try {
        [ifaces, resource] = await Promise.all([collectLive(dev, dev.api, useStream), collectResource(dev, dev.api)]);
        dev.lastResource = resource;
        dev.mode = 'live'; dev.lastError = ''; realSample = true;
      } catch (e) {
        dev.lastError = e.message || String(e); dev.stopTrafficStream();
        dev.api.close(); dev.api = null; dev.mode = 'offline'; dev.ensureConnection();
      }
    }
    if (!ifaces) {
      if (dev.forceDemo) { ifaces = demoSnapshot(dev); dev.mode = 'demo'; }
      else {
        /* 未连接 / 断线：沿用最后一次真实接口快照并把速率清零，绝不注入演示数据 */
        ifaces = dev.lastPacket && dev.lastPacket.ifaces
          ? dev.lastPacket.ifaces.map((i) => ({ ...i, rxBps: 0, txBps: 0, rxPps: 0, txPps: 0 })) : [];
        dev.ensureConnection();
        if (dev.mode === 'demo') dev.mode = 'offline';
      }
    }
    if (!resource) {
      if (dev.forceDemo) { resource = demoResource(dev); dev.mode = 'demo'; }
      else resource = dev.lastResource || {};
    }
    /* 演示模式的 resource 也要落到 lastResource，否则 packetUptime 读不到，界面一直显示"运行 —" */
    if (!dev.lastResource || dev.forceDemo) dev.lastResource = resource;
    await refreshConnections(dev, realSample);

    const totalRx = ifaces.reduce((s, i) => s + i.rxBps, 0), totalTx = ifaces.reduce((s, i) => s + i.txBps, 0);
    recordUsage(dev, ifaces, realSample);   // 只有真实在线采样才写入统计历史
    const packet = {
      deviceId: dev.id, deviceName: dev.name, ts: Date.now(), mode: dev.mode, host: dev.cfg.host,
      interval: INTERVAL, uptime: packetUptime(dev), error: dev.lastError, dataReal: realSample,
      totalRx, totalTx, ifaces, resource, connections: dev.connections,
      connectionsReal: dev.connectionsReal, connectionsAt: dev.connectionsAt,
      /* DEMO 连接行随每次轮询动态生成，让连接页与仪表盘 TOP10 实时变化 */
      connRows: dev.forceDemo ? { connections: demoConnectionsRows(dev, 'connections'), connections6: demoConnectionsRows(dev, 'connections6') } : null,
    };
    dev.history.push(historyPoint(packet.ts, ifaces, totalRx, totalTx));
    if (dev.history.length > HISTORY) dev.history.shift();
    dev.resourceHistory.push({ ts: packet.ts, cpu: num(resource['cpu-load']), free: num(resource['free-memory']), total: num(resource['total-memory']) });
    if (dev.resourceHistory.length > HISTORY) dev.resourceHistory.shift();
    const logTick = Math.floor(Date.now() / 1000 / 8);
    if (dev.forceDemo && logTick !== dev.demoLogTick) {
      dev.demoLogTick = logTick;
      const row = makeLog(Date.now()); row['.id'] = '*L' + (++dev.logSeq);
      dev.demoDB.logs.unshift(row);
      if (dev.demoDB.logs.length > 200) dev.demoDB.logs.pop();
    }
    if (!useStream) { dev.lastPacket = packet; broadcast(dev.id, packet); }
    // 流式活跃时由 monitor 记录直接推送，轮询只刷新历史与缓存，不覆盖流式快照
  } catch (e) { console.error(`[poll] ${dev.name}:`, e.message); }
  finally { dev.polling = false; }
}
function snapshotOf(dev) {
  if (!dev) return { ifaces: [], history: [], resourceHistory: [] };
  return { ...(dev.lastPacket || { deviceId: dev.id, deviceName: dev.name, mode: dev.mode, host: dev.cfg.host, ifaces: [] }),
    history: dev.history, resourceHistory: dev.resourceHistory };
}

/* ================= WebSocket ================= */
const clients = new Set();
/* 自动发现：路由器本身 + LLDP/MNDP 邻居 + DHCP 租约。
   任一路读取失败只降级提示，不让整张拓扑图不可用。 */
async function autoTopology(dev) {
  if (!dev) return { nodes: [], ok: false, notes: ['没有可用设备'], counts: {} };
  const rootName = (dev.lastResource && dev.lastResource['board-name']) || dev.name || 'RouterOS';
  /* 根节点默认关联当前最忙的接口，使「上级 → 下级」连线能按实时流量变速 */
  const busiest = ((dev.lastPacket && dev.lastPacket.ifaces) || [])
    .slice().sort((a, b) => ((b.rxBps || 0) + (b.txBps || 0)) - ((a.rxBps || 0) + (a.txBps || 0)))[0];
  const rootIface = busiest ? String(busiest.name || '') : '';
  const nodes = [{ id: 'root', name: rootName, type: 'router', ip: String(dev.cfg.host || ''),
    parent: null, parentPort: '', ports: [], auto: true, note: dev.name || '', iface: rootIface }];
  const notes = [];
  let neighbors = [], leases = [], dhcpServers = [];
  try { neighbors = (await rosPrint(dev, SECTION_MAP.neighbors)) || []; }
  catch (e) { notes.push('邻居发现不可用：' + e.message); }
  try { leases = (await rosPrint(dev, SECTION_MAP.dhcpLeases)) || []; }
  catch (e) { notes.push('DHCP 租约不可用：' + e.message); }
  /* 租约本身不带接口名，从 DHCP 服务端配置把 server → interface 映射出来，
     让纯 DHCP 终端也能显示所在 LAN 接口的实时速率（与根节点一致的接口级数据） */
  try { dhcpServers = (await rosPrint(dev, SECTION_MAP.dhcpServers)) || []; }
  catch (e) { /* 可选增强，失败不影响拓扑 */ }
  const serverIface = new Map(dhcpServers.filter((s) => s && s.name && s.interface)
    .map((s) => [String(s.name), String(s.interface)]));

  const macKey = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^0-9a-f]/g, '');
  const byMac = new Map();
  for (const r of neighbors) {
    if (!r || typeof r !== 'object') continue;
    const mac = macKey(r['mac-address']);
    const name = String(r.identity || r.address || mac.slice(0, 8) || '邻居设备');
    const hint = name + ' ' + String(r.platform || '') + ' ' + String(r.interface || '');
    const type = /ap|wifi|wlan|cap|groove/i.test(hint) ? 'ap' : /nas|linux|server|storage/i.test(hint) ? 'nas' : 'switch';
    const node = { id: 'auto_n_' + (mac || encodeURIComponent(name)), name, type,
      ip: String(r.address || ''), parent: 'root', parentPort: String(r.interface || ''),
      ports: [], auto: true, note: String(r.platform || ''), iface: String(r.interface || '') };
    nodes.push(node);
    if (mac) byMac.set(mac, node.id);
  }
  for (const r of leases) {
    if (!r || typeof r !== 'object') continue;
    const status = String(r.status || '');
    if (status && !/^(bound|waiting)$/i.test(status)) continue;
    const mac = macKey(r['mac-address']);
    if (mac && byMac.has(mac)) continue;
    const name = String(r['host-name'] || r.address || mac.slice(0, 8) || '终端');
    const type = /ap|wifi|wlan/i.test(name) ? 'ap' : /nas|server|storage/i.test(name) ? 'nas' : 'client';
    nodes.push({ id: 'auto_l_' + (mac || encodeURIComponent(name)), name, type,
      ip: String(r.address || ''), mac: String(r['mac-address'] || ''),
      parent: (mac && byMac.get(mac)) || 'root', parentPort: '',
      iface: String(r.interface || serverIface.get(String(r.server || '')) || ''),
      ports: [], auto: true, note: status === 'waiting' ? '等待中' : '' });
  }
  return { nodes, ok: neighbors.length > 0 || leases.length > 0, notes,
    counts: { neighbors: neighbors.length, leases: leases.length } };
}

function wsAccept(key) { return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }
function sendFrame(socket, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text, 'utf8'); const len = payload.length; let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x81; socket.write(Buffer.concat([header, payload]));
}
function broadcast(deviceId, obj) {
  const text = JSON.stringify(obj);
  for (const c of clients) if (c.deviceId === deviceId || c.deviceId === '*') sendFrame(c, text);
}
function handleClientData(socket, buf) {
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1], opcode = b0 & 0x0F;
    let len = b1 & 0x7F; let pos = off + 2;
    if (len === 126) { if (pos + 2 > buf.length) return; len = buf.readUInt16BE(pos); pos += 2; }
    else if (len === 127) { if (pos + 8 > buf.length) return; len = Number(buf.readBigUInt64BE(pos)); pos += 8; }
    const masked = (b1 & 0x80) !== 0;
    if (masked) {
      if (pos + 4 > buf.length) return;
      const mask = buf.slice(pos, pos + 4); pos += 4;
      if (pos + len > buf.length) return;
      const data = Buffer.from(buf.slice(pos, pos + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      if (opcode === 0x8) socket.end();
      else if (opcode === 0x9) socket.write(Buffer.concat([Buffer.from([0x8A, data.length]), data]));
      else if (opcode === 0x1 && len < 2048) {
        try { const msg = JSON.parse(data.toString('utf8')); if (msg.device && devices.has(msg.device)) socket.deviceId = msg.device; } catch (e) { /* ignore */ }
      }
      pos += len;
    } else { if (pos + len > buf.length) return; if (opcode === 0x8) socket.end(); pos += len; }
    off = pos;
  }
}

/* ================= HTTP ================= */
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 128 * 1024) { reject(new Error('请求体过大')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('JSON 格式错误')); } });
  });
}
/* 图标上传单独放宽到 1.5MB（base64 膨胀约 1.33 倍），仍拒绝超大请求 */
function readBodyLimit(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > maxBytes) { reject(new Error('图片过大')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('JSON 格式错误')); } });
  });
}
/* ================= WebUI 登录：会话 Cookie（兼容原有 Basic Auth） ================= */
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session.secret');
const SESSION_COOKIE = 'ros_session';
const SESSION_MAX_AGE = 7 * 24 * 3600;

function loadAuthConfig() {
  try {
    const a = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (a && a.disabled === true) return null;                    // WebUI 明确关闭登录
    if (a && a.user && a.salt && a.hash) return { user: String(a.user), salt: String(a.salt), hash: String(a.hash), source: 'webui' };
  } catch (e) { /* 文件不存在或格式错误，回退到环境变量 */ }
  const u = process.env.WEB_USER || '', p = process.env.WEB_PASSWORD || '';
  if (!u || !p) return null;
  const salt = crypto.createHash('sha256').update('env:' + u + ':' + p).digest('hex').slice(0, 32);
  return { user: u, salt, hash: crypto.scryptSync(p, salt, 32).toString('hex'), source: 'env' };
}
let authCfg = loadAuthConfig();
function authEnabled() { return !!authCfg; }
function checkPassword(cfg, user, pass) {
  if (!cfg || user !== cfg.user || typeof pass !== 'string') return false;
  const h = crypto.scryptSync(pass, cfg.salt, 32), expect = Buffer.from(cfg.hash, 'hex');
  return h.length === expect.length && crypto.timingSafeEqual(h, expect);
}
function saveAuthConfig(user, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ user, salt, hash }, null, 2) + '\n', { mode: 0o600 });
  authCfg = { user, salt, hash, source: 'webui' };
}
function clearAuthConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ disabled: true }, null, 2) + '\n', { mode: 0o600 });
  authCfg = null;
}
function loadSessionSecret() {
  try { const s = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim(); if (s) return Buffer.from(s, 'hex'); } catch (e) { /* ignore */ }
  const b = crypto.randomBytes(32);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SESSION_SECRET_FILE, b.toString('hex') + '\n', { mode: 0o600 }); } catch (e) { /* ignore */ }
  return b;
}
const SESSION_SECRET = loadSessionSecret();
function signSession(user) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.'); if (parts.length !== 2) return null;
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return p.u && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function cookieOf(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
function sessionUser(req) {
  const p = verifySession(cookieOf(req, SESSION_COOKIE));
  return p && authCfg && p.u === authCfg.user ? p.u : null;
}
function authorized(req) {
  if (!authEnabled()) return true;
  if (sessionUser(req)) return true;
  const header = req.headers.authorization || '';
  if (/^Basic\s+/i.test(header)) {
    try {
      const plain = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
      const i = plain.indexOf(':');
      if (i >= 0 && checkPassword(authCfg, plain.slice(0, i), plain.slice(i + 1))) return true;
    } catch (e) { /* ignore */ }
  }
  return false;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`);
}
function deny(res, req, pathname) {
  const nav = /text\/html/i.test(req.headers.accept || '') && !/^\/api\//.test(pathname) && !req.headers['x-requested-with'];
  if (nav) {
    res.writeHead(302, { Location: '/login.html?next=' + encodeURIComponent(req.url || '/'), 'Cache-Control': 'no-store' });
    return res.end();
  }
  res.writeHead(401, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: 'Unauthorized', loginRequired: true }));
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
function reqDevice(req, url, body) {
  const id = url.searchParams.get('device') || (body && body.device) || '';
  return devices.get(id) || activeDevice();
}
function deviceList() {
  return [...devices.values()].map((d) => ({ ...d.snapshotCfg(), status: d.publicStatus() }));
}

/* ================= 检查更新 / 自动更新 =================
   配置与检查结果落盘 data/update.json，服务端定时检查（不依赖浏览器常开）。
   只做「检查 + 下载」，不替换自身进程或容器：桌面版需手动安装，Docker 版需外部 pull/recreate。 */
const UPDATE_FILE = path.join(DATA_DIR, 'update.json');
const UPDATE_DIR = path.join(DATA_DIR, 'updates');
const updateState = { config: updates.normalizeConfig({}), status: null };
try {
  const raw = JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8'));
  updateState.config = updates.normalizeConfig(raw.config || {});
  if (raw.status && typeof raw.status === 'object') updateState.status = raw.status;
} catch (e) { /* 首次启动使用默认配置 */ }
/* 部署时可用环境变量预设，Docker 场景便于直接指定代理 / 镜像源 */
try {
  const env = process.env;
  const cfg = { ...updateState.config };
  if (env.ROS_UPDATE_ENABLED !== undefined && env.ROS_UPDATE_ENABLED !== '') cfg.enabled = env.ROS_UPDATE_ENABLED === '1';
  if (env.ROS_UPDATE_SOURCE) cfg.source = String(env.ROS_UPDATE_SOURCE);
  if (env.ROS_UPDATE_PROXY) cfg.proxy = String(env.ROS_UPDATE_PROXY);
  if (env.ROS_UPDATE_ENDPOINT) cfg.endpoint = String(env.ROS_UPDATE_ENDPOINT);
  if (env.ROS_UPDATE_IMAGE) cfg.image = String(env.ROS_UPDATE_IMAGE);
  if (env.ROS_UPDATE_INTERVAL) cfg.intervalHours = Number(env.ROS_UPDATE_INTERVAL) || cfg.intervalHours;
  if (env.ROS_UPDATE_AUTO_APPLY !== undefined && env.ROS_UPDATE_AUTO_APPLY !== '') cfg.autoApply = env.ROS_UPDATE_AUTO_APPLY === '1';
  updateState.config = updates.normalizeConfig(cfg);
} catch (e) { /* 环境变量非法时保留默认 */ }

function saveUpdateState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(UPDATE_FILE, JSON.stringify(updateState, null, 2) + '\n', { mode: 0o600 });
  } catch (e) { console.warn('[updates] save failed:', e.message); }
}
function appliedVersion() {
  /* 桌面版：应用内更新成功后 launcher 写入结果文件，启动时以此为准，避免一直提示更新。
     Docker/源码：版本只以镜像/代码自带的 version.json 或 package.json 为准，
     绝不能被 data 卷里残留的 app-update-result.json 覆盖（否则升级后仍显示旧版本）。 */
  if (DESKTOP) {
    try {
      const r = selfupdate.readJson(path.join(DATA_DIR, selfupdate.APP_UPDATE_RESULT), null);
      if (r && r.ok && r.verified && !r.rolledBack && r.version) return String(r.version);
    } catch (e) { /* ignore */ }
  }
  try { return String(JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version || ''); } catch (e) { return ''; }
}
function runtimeInfo() {
  /* ROS_CENTER_VERSION 历史遗留可能是 "latest"（旧版自更新把 tag 当版本写入容器环境），
     它不是版本号，必须忽略，否则界面当前版本永远显示 latest。只接受 x.y.z 形态。 */
  let envVer = String(process.env.ROS_CENTER_VERSION || '').trim();
  if (!/^v?\d+(\.\d+){1,3}$/i.test(envVer)) envVer = '';
  let version = envVer || appliedVersion();
  if (!version) { try { version = String(require('./package.json').version || ''); } catch (e) { /* no package.json */ } }
  const docker = !DESKTOP && (!!process.env.DOCKER_IMAGE || fs.existsSync('/.dockerenv'));
  return {
    version: version || '0.0.0',
    digest: String(process.env.ROS_CENTER_DIGEST || '').trim(),
    runtime: DESKTOP ? 'desktop' : docker ? 'docker' : 'source',
    platform: process.platform, arch: process.arch,
    selfUpdate: DESKTOP ? 'desktop' : docker ? 'docker' : 'source',
  };
}
/* 检测源随运行方式固定：Docker 对 Docker Hub，桌面 / 源码对 GitHub Releases。
   镜像源端点与代理仍可自定义，但「检测哪一个源」不再让用户选错。 */
function derivedSource() { return runtimeInfo().selfUpdate === 'docker' ? 'dockerhub' : 'github'; }
function runtimeUpdateConfig() { return { ...updateState.config, source: derivedSource() }; }
function publicUpdateConfig() {
  const cfg = runtimeUpdateConfig();
  return { ...cfg, proxy: updates.maskProxy(cfg.proxy), proxySet: !!cfg.proxy };
}
let updateChecking = false, updateTimer = null;

async function downloadUpdateAsset(asset, automatic) {
  const name = String(asset.name || '').replace(/[^A-Za-z0-9_.\-]/g, '');
  if (!name || !asset.url) throw new Error('缺少可用资产 / no asset');
  /* 仅允许下载本次检查结果中的资产，避免把接口变成任意 URL 代理 */
  const listed = ((updateState.status && updateState.status.latest && updateState.status.latest.assets) || [])
    .some((a) => a.url === asset.url && a.name === asset.name);
  if (!listed) throw new Error('资产不在本次检查结果中，请重新检查更新');
  const buf = await updates.downloadBinary(asset.url, { proxy: updateState.config.proxy });
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  const dest = path.join(UPDATE_DIR, name);
  fs.writeFileSync(dest, buf);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const rec = { name, path: dest, size: buf.length, sha256, automatic: !!automatic, at: new Date().toISOString() };
  if (updateState.status) { updateState.status.downloaded = rec; saveUpdateState(); }
  console.log(`[updates] downloaded ${name} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  return rec;
}
/* 最近一次成功检查的缓存有效期：普通「检查」秒回缓存，避免每次都等 GitHub/Docker Hub；
   需要真正重新请求时用 force（前端「强制检查」或定时自动检查）。 */
const UPDATE_CACHE_MS = 60 * 1000;
async function performUpdateCheck(trigger, force = false) {
  if (updateChecking) return updateState.status;
  const st = updateState.status;
  if (!force && st && st.ok && st.checkedAt && Date.now() - Date.parse(st.checkedAt) < UPDATE_CACHE_MS) {
    return st;   // 缓存新鲜，直接返回，UI 秒开
  }
  updateChecking = true;
  const current = runtimeInfo();
  const prev = updateState.status && updateState.status.ok
    ? { lastUpdated: (updateState.status.latest || {}).publishedAt || '' } : {};
  try {
    const r = await updates.check(runtimeUpdateConfig(), current, prev);
    updateState.status = { ...r, trigger };
    if (updateState.config.autoDownload && r.hasUpdate && current.runtime === 'desktop' && r.source === 'github') {
      const asset = updates.chooseAsset(r.latest, current.platform, current.arch);
      if (asset) downloadUpdateAsset(asset, true).catch((e) => console.warn('[updates] auto download:', e.message));
    }
    if (updateState.config.autoApply && r.hasUpdate && lastAutoApplyKey !== (r.latest.version + '|' + (r.latest.digest || ''))) {
      lastAutoApplyKey = r.latest.version + '|' + (r.latest.digest || '');
      const t = setTimeout(() => applySelfUpdate({ trigger: 'auto' }).catch((e) => console.warn('[updates] auto apply:', e.message)), 6000);
      if (t.unref) t.unref();
    }
  } catch (e) {
    updateState.status = {
      ok: false, error: updates.friendlyError(e), checkedAt: new Date().toISOString(),
      source: derivedSource(),
      endpoint: updates.safeEndpoint(updates.endpointFor(runtimeUpdateConfig())),
      current, hasUpdate: false, trigger,
    };
  }
  updateChecking = false;
  saveUpdateState();
  return updateState.status;
}
/* ---------- 自更新：Docker 重建容器 / 桌面替换 app 并重启 ---------- */
const SELF_PROGRESS_FILE = path.join(DATA_DIR, 'self-update-progress.json');
let selfUpdateBusy = false, lastAutoApplyKey = '', selfUpdateStartedAt = 0, selfCapCache = { at: 0, value: null };

function selfProgress(stage, message, extra) {
  const rec = { stage, message, at: new Date().toISOString(), ...(extra && typeof extra === 'object' ? extra : {}) };
  try { selfupdate.writeJson(SELF_PROGRESS_FILE, rec); } catch (e) { /* ignore */ }
  console.log('[self-update]', stage, message);
  return rec;
}
function selfResult(kind) {
  const file = kind === 'docker' ? selfupdate.DOCKER_UPDATE_RESULT : selfupdate.APP_UPDATE_RESULT;
  return selfupdate.readJson(path.join(DATA_DIR, file), null);
}
/* 进度文件随 data 卷保留。容器/进程重建后，早于本次启动的「进行中」状态都是遗留，
   否则页面会永远停在「切换版本」。error / done 是结论，保留供查看。 */
const BUSY_PROGRESS = new Set(['download', 'pull', 'prepare', 'switch', 'restart']);
function currentProgress() {
  const p = selfupdate.readJson(SELF_PROGRESS_FILE, null);
  if (p && p.at && BUSY_PROGRESS.has(p.stage) && Date.parse(p.at) < BOOT_AT) return null;
  return p;
}
function clearStaleProgress() {
  try {
    const p = selfupdate.readJson(SELF_PROGRESS_FILE, null);
    if (p && p.at && BUSY_PROGRESS.has(p.stage) && Date.parse(p.at) < BOOT_AT) {
      fs.rmSync(SELF_PROGRESS_FILE, { force: true });
      console.log('[self-update] cleared stale progress from previous process:', p.stage);
    }
  } catch (e) { /* ignore */ }
}
function latestAssets() { return ((updateState.status && updateState.status.latest) || {}).assets || []; }
function latestVersion() {
  const v = String((updateState.status && updateState.status.latest && updateState.status.latest.version) || '');
  return v.replace(/^v/i, '');
}

async function selfCapabilities(force = false) {
  const rt = runtimeInfo();
  const kind = rt.selfUpdate;
  const desktop = selfupdate.desktopCapabilities({ appDir: __dirname, dataDir: DATA_DIR, desktop: !!DESKTOP });
  let docker = null;
  if (kind === 'docker') {
    if (!force && Date.now() - selfCapCache.at < 30000 && selfCapCache.value) docker = selfCapCache.value;
    else {
      docker = await selfupdate.dockerCapabilities();
      selfCapCache = { at: Date.now(), value: docker };
    }
  }
  const bundleInfo = updates.chooseAppBundle((updateState.status && updateState.status.latest) || {});
  const reason = kind === 'source' ? '源码运行无需自更新，直接 git pull 后重启即可'
    : kind === 'docker' ? (docker.canAutoUpdate ? '' : (docker.reason || 'Docker socket 不可用'))
      : (desktop.available ? '' : (desktop.reason || '当前安装方式不支持应用内更新'));
  return {
    kind, available: kind === 'docker' ? !!docker.canAutoUpdate : kind === 'desktop' ? desktop.available : false,
    reason, desktop, docker, busy: selfUpdateBusy,
    runtime: rt, autoApply: !!updateState.config.autoApply,
    bundle: bundleInfo ? { name: bundleInfo.zip.name, size: bundleInfo.zip.size, url: bundleInfo.zip.url, checksum: !!bundleInfo.checksum } : null,
    progress: currentProgress(),
    result: selfResult(kind === 'docker' ? 'docker' : 'desktop'),
  };
}

async function applySelfUpdate(o = {}) {
  /* 若上一个任务已超过 3 分钟仍卡住（helper 未能重建容器），视为陈旧并允许重试 */
  if (selfUpdateBusy && Date.now() - selfUpdateStartedAt < 180000) throw new Error('已有更新任务正在进行');
  selfUpdateBusy = false;
  const cap = await selfCapabilities();
  if (!cap.available) throw new Error(cap.reason || '当前环境不支持自动应用更新');
  const status = updateState.status;
  if (o.force !== true && !(status && status.ok && status.hasUpdate)) {
    throw new Error('当前没有检测到新版本，请先检查更新');
  }
  const ver = latestVersion();
  selfUpdateBusy = true;
  selfUpdateStartedAt = Date.now();
  /* 正常情况下容器/进程已被重建，这个定时器不会执行；仅用于异常时避免按钮永久禁用 */
  const stale = setTimeout(() => { selfUpdateBusy = false; }, 190000);
  if (stale.unref) stale.unref();
  try {
    if (cap.kind === 'desktop') {
      const picked = updates.chooseAppBundle((status && status.latest) || {});
      if (!picked) throw new Error('该版本未提供应用内更新包（ros-center-app-*.zip），请手动下载安装包');
      const dlMsg = '正在下载应用更新包 ' + picked.zip.name;
      selfProgress('download', dlMsg, { loaded: 0, total: Number(picked.zip.size) || 0, percent: 0 });
      const buf = await updates.downloadBinary(picked.zip.url, {
        proxy: updateState.config.proxy,
        onProgress: (p) => selfProgress('download', dlMsg, p),
      });
      let checksum = '';
      if (picked.checksum) {
        const r = await updates.httpGet(picked.checksum.url, { proxy: updateState.config.proxy, timeout: 30000 });
        if (r.status < 200 || r.status >= 300) throw new Error('校验和文件下载失败 HTTP ' + r.status);
        checksum = r.body.toString('utf8').trim();
      }
      selfProgress('verify', '正在校验并暂存更新包');
      const pending = selfupdate.stageDesktopBundle(buf, {
        dataDir: DATA_DIR, appDir: __dirname, expectedSha256: checksum, version: ver,
      });
      selfProgress('restart', `更新包已就绪（${pending.version}），服务即将自动重启`);
      const out = { ok: true, mode: 'desktop', version: pending.version, files: pending.files, restartInMs: 1500 };
      setTimeout(() => { try { process.exit(selfupdate.RESTART_CODE); } catch (e) { process.exit(0); } }, 1500);
      return out;
    }
    if (cap.kind === 'docker') {
      const cfg = runtimeUpdateConfig();
      const image = o.image || ((cfg.source === 'dockerhub')
        ? `${cfg.image}:${cfg.tag}` : cap.docker.image || 'backspacem/ros-center:latest');
      selfProgress('pull', '正在拉取最新镜像并准备重建容器');
      const r = await selfupdate.dockerApply({
        dataDir: DATA_DIR, image, tag: o.tag || '', version: ver,
        onProgress: (stage, message, extra) => selfProgress(stage, message, extra),
      });
      selfProgress('switch', '助手容器已接管，容器即将重建，服务短暂中断');
      return { ok: true, mode: 'docker', ...r };
    }
    throw new Error('源码运行请直接 git pull 后重启');
  } catch (e) {
    clearTimeout(stale);
    selfUpdateBusy = false;
    selfProgress('error', e.message || String(e));
    throw e;
  }
}

function scheduleUpdateChecks() {
  if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
  if (!updateState.config.enabled) return;
  const ms = updateState.config.intervalHours * 3600 * 1000;
  updateTimer = setInterval(() => { performUpdateCheck('auto').catch(() => {}); }, ms);
  if (updateTimer.unref) updateTimer.unref();
  const last = Date.parse((updateState.status || {}).checkedAt || '') || 0;
  if (Date.now() - last >= ms) {
    /* 启动即后台检查（1s 后），用户打开页面时通常已有结果，无需等待 */
    const t = setTimeout(() => { performUpdateCheck('startup').catch(() => {}); }, 1000);
    if (t.unref) t.unref();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  /* ---- 登录：无需鉴权 ---- */
  if (p === '/api/health') return json(res, 200, { ok: true, app: 'ros-center', pid: process.pid, port: PORT, ts: Date.now() });
  if (p === '/login' || p === '/login.html') return serveStatic(req, res, '/login.html');
  if (p === '/api/auth' && req.method === 'GET') {
    return json(res, 200, { enabled: authEnabled(), authenticated: !authEnabled() || !!sessionUser(req),
      user: authCfg ? authCfg.user : '', source: authCfg ? authCfg.source : '' });
  }
  if (p === '/api/login' && req.method === 'POST') {
    if (!authEnabled()) return json(res, 200, { ok: true, enabled: false });
    try {
      const b = await readBody(req);
      if (!checkPassword(authCfg, b.user, b.password)) return json(res, 401, { error: '用户名或密码不正确 / Invalid username or password' });
      setSessionCookie(res, signSession(authCfg.user));
      console.log(`[auth] login ok user=${authCfg.user} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, user: authCfg.user });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/logout' && req.method === 'POST') {
    setSessionCookie(res, '');
    return json(res, 200, { ok: true });
  }

  if (!authorized(req)) return deny(res, req, p);

  /* ---- WebUI 登录密码设置（需先登录） ---- */
  if (p === '/api/auth/password' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const user = String(b.user || '').trim(), password = String(b.password || '');
      if (!/^[A-Za-z0-9_.\-]{1,32}$/.test(user)) throw new Error('用户名需为 1-32 位字母/数字/_/./- (invalid username)');
      if (password.length < 6) throw new Error('密码至少 6 位 / password too short (min 6)');
      saveAuthConfig(user, password);
      setSessionCookie(res, signSession(user));
      console.log(`[auth] password changed user=${user} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, enabled: true, user });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/auth/password' && req.method === 'DELETE') {
    clearAuthConfig();
    console.log(`[auth] login disabled by=${req.socket.remoteAddress}`);
    return json(res, 200, { ok: true, enabled: false });
  }

  if (p === '/api/schema') return json(res, 200, { groups: GROUPS, sections: SECTIONS });

  /* ---- 设备列表 / 管理 ---- */
  if (p === '/api/devices' && req.method === 'GET') {
    return json(res, 200, { devices: deviceList(), activeId, webPort: PORT, hostPort: Number(process.env.WEB_PORT || 0) || PORT });
  }
  if (p === '/api/devices/test' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const host = b.host, port = b.port, user = b.user, password = b.password || '';
      if (!validHost(host)) throw new Error('地址格式不正确');
      if (!validPort(port)) throw new Error('端口必须在 1-65535 之间');
      if (!user || typeof user !== 'string') throw new Error('账号不能为空');
      const client = new RouterOSAPI({ host: String(host).trim(), port: Number(port), user: String(user).trim(), password: String(password), tls: !!b.tls, reconnectMs: 2000 });
      let check;
      try { await client.connect(); check = await client.exec(['/system/resource/print']); if (check.status.type === 'trap') throw new Error(check.status.message || '读取系统信息失败'); }
      finally { client.close(); }
      console.log(`[devices] test ok ${host}:${port} user=${user} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, version: (check.re[0] || {}).version || '' });
    } catch (e) { return json(res, 400, { error: e.message || String(e) }); }
  }
  if (p === '/api/devices' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      if (!validName(b.name)) throw new Error('设备名称不能为空且不能超过 60 字符');
      if (!validHost(b.host)) throw new Error('地址格式不正确');
      if (!validPort(b.port)) throw new Error('端口必须在 1-65535 之间');
      if (!b.user || typeof b.user !== 'string') throw new Error('账号不能为空');
      const id = newId();
      const dev = new Device({ id, name: String(b.name).trim(), host: String(b.host).trim(), port: Number(b.port), user: String(b.user).trim(), password: String(b.password || ''), tls: !!b.tls, demo: !!b.demo });
      devices.set(id, dev);
      if (!saveDeviceRegistry()) { devices.delete(id); throw new Error('写入 devices.json 失败（请检查 data 目录权限）'); }
      dev.ensureConnection();
      console.log(`[devices] added ${dev.name} (${dev.cfg.host}) by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, id, devices: deviceList(), activeId });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p.startsWith('/api/devices/') && req.method === 'POST') {
    try {
      const seg = p.split('/').filter(Boolean); // api devices id action
      const id = seg[2], action = seg[3];
      if (!id || !devices.has(id)) throw new Error('设备不存在');
      const dev = devices.get(id);
      if (action === 'active') {
        activeId = id;
        if (!saveDeviceRegistry()) throw new Error('写入 devices.json 失败');
        console.log(`[devices] active=${dev.name} by=${req.socket.remoteAddress}`);
        return json(res, 200, { ok: true, activeId, devices: deviceList() });
      }
      if (action === 'reconnect') {
        dev.reconnectNow();
        return json(res, 200, { ok: true, status: dev.publicStatus() });
      }
      if (action === 'edit') {
        const b = await readBody(req);
        if (b.name !== undefined) { if (!validName(b.name)) throw new Error('设备名称不正确'); dev.cfg.name = String(b.name).trim(); }
        if (b.host !== undefined) { if (!validHost(b.host)) throw new Error('地址格式不正确'); dev.cfg.host = String(b.host).trim(); }
        if (b.port !== undefined) { if (!validPort(b.port)) throw new Error('端口不正确'); dev.cfg.port = Number(b.port); }
        if (b.user !== undefined) { if (!b.user) throw new Error('账号不能为空'); dev.cfg.user = String(b.user).trim(); }
        if (b.password !== undefined && b.password !== '') dev.cfg.password = String(b.password);
        if (b.tls !== undefined) dev.cfg.tls = !!b.tls;
        if (b.demo !== undefined) dev.cfg.demo = !!b.demo;
        if (!saveDeviceRegistry()) throw new Error('写入 devices.json 失败');
        dev.reconnectNow();
        return json(res, 200, { ok: true, devices: deviceList(), activeId });
      }
      throw new Error('不支持的设备操作');
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p.startsWith('/api/devices/') && req.method === 'DELETE') {
    try {
      const id = p.split('/').filter(Boolean)[2];
      if (!devices.has(id)) throw new Error('设备不存在');
      if (devices.size === 1) throw new Error('至少保留一台设备');
      const dev = devices.get(id);
      if (dev.api) dev.api.close();
      if (dev.reconnectTimer) clearTimeout(dev.reconnectTimer);
      devices.delete(id);
      if (activeId === id) activeId = devices.keys().next().value;
      if (!saveDeviceRegistry()) throw new Error('写入 devices.json 失败');
      /* 设备管理页承诺「历史数据一并清除」：同步移除该设备的统计桶 */
      if (usageStore.devices[id]) { delete usageStore.devices[id]; usageDirty = true; saveUsage(true); }
      console.log(`[devices] removed ${dev.name} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, devices: deviceList(), activeId });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  /* ---- 旧接口兼容：默认指向当前设备 ---- */
  if (p === '/api/status') {
    const dev = reqDevice(req, url);
    return json(res, 200, { ...(dev ? dev.publicStatus() : {}), clients: clients.size, activeId,
      deviceCount: devices.size, deviceName: dev && dev.name });
  }
  if (p === '/api/snapshot') return json(res, 200, snapshotOf(reqDevice(req, url)));
  if (p === '/api/usage' && req.method === 'GET') {
    const dev = reqDevice(req, url);
    const range = String(url.searchParams.get('range') || '').trim();
    return json(res, 200, dev ? usageSummary(dev, { range }) : emptyUsageResponse());
  }
  /* 多选参与统计的网口：interfaces=[] 表示全部接口，元素支持 * / ? 通配符。
     历史按「日 × 网口」独立保存，切换范围无需重建基线、不会丢历史，也不会混入其他网口。 */
  if (p === '/api/usage' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const dev = reqDevice(req, url, body);
      if (!dev) throw new Error('没有可用设备');
      if (!Array.isArray(body.interfaces)) throw new Error('接口列表格式错误');
      const cleaned = [...new Set(body.interfaces.map((x) => String(x == null ? '' : x).trim()).filter(Boolean))]
        .filter((x) => x.length <= 64 && !/[\x00-\x1f]/.test(x)).slice(0, 64);
      usageBucket(dev).interfaces = cleaned;
      usageDirty = true; saveUsage(true);
      console.log(`[usage] ${dev.name} interfaces=${cleaned.length ? cleaned.join(',') : 'ALL'} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...usageSummary(dev, { range: String(body.range || '').trim() }) });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/history') {
    const dev = reqDevice(req, url);
    return json(res, 200, { points: dev ? dev.history : [], resource: dev ? dev.resourceHistory : [] });
  }
  /* 网络拓扑：自动发现 + 用户自定义节点（custom 按设备持久化） */
  if (p === '/api/topology') {
    const dev = reqDevice(req, url);
    if (req.method === 'GET') {
      try {
        const auto = await autoTopology(dev);
        const store = (dev && topoStore.devices[dev.id]) || {};
        return json(res, 200, { deviceId: dev && dev.id, auto: auto.nodes, custom: customTopology(dev),
          discovery: { ok: auto.ok, notes: auto.notes, counts: auto.counts },
          updatedAt: store.updatedAt || 0, demo: !!(dev && dev.forceDemo) });
      } catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const target = reqDevice(req, url, body);
        if (!target) throw new Error('没有可用设备');
        if (!Array.isArray(body.nodes)) throw new Error('节点格式错误');
        const allowed = new Set(['router', 'switch', 'ap', 'nas', 'client', 'other']);
        const clean = (n) => {
          const id = String((n && n.id) || '').slice(0, 80);
          const name = String((n && n.name) || '').trim().slice(0, 48);
          if (!id || !name) return null;
          return { id, name, type: allowed.has(n && n.type) ? n.type : 'other',
            ip: String((n && n.ip) || '').slice(0, 64),
            parent: n && n.parent == null ? null : String((n && n.parent) || '').slice(0, 80),
            parentPort: String((n && n.parentPort) || '').slice(0, 32),
            iface: String((n && n.iface) || '').slice(0, 64),
            /* 点击该节点触发的动画：none | ports | pulse | flow | ripple */
            anim: ['none', 'pulse', 'flow', 'ripple'].includes(n && n.anim) ? n.anim : 'none',
            /*  tombstone：隐藏自动发现的节点；calcFrom：按多选下级设备求和 */
            deleted: !!(n && n.deleted),
            calcFrom: Array.isArray(n && n.calcFrom)
              ? n.calcFrom.slice(0, 64).map((x) => String(x).slice(0, 80)).filter(Boolean) : [],
            ports: Array.isArray(n && n.ports)
              ? n.ports.slice(0, 64).map((p) => String(p).trim().slice(0, 32)).filter(Boolean) : [],
            /* 与图标库文件名规则一致：允许中文/空格与 svg；用 decodeURIComponent 兼容编码后的 URL */
            icon: (() => {
              const raw = String((n && n.icon) || ''), prefix = '/api/topology/icon/';
              if (!raw.startsWith(prefix)) return '';
              let name = raw.slice(prefix.length);
              try { name = decodeURIComponent(name); } catch (e) { /* 保留原值校验 */ }
              return ICON_NAME_RE.test(name) ? prefix + name : '';
            })(),
            note: String((n && n.note) || '').slice(0, 120),
            /* 同一层级从 1 开始的显示顺序 */
            order: n && Number.isFinite(Number(n.order)) ? Math.max(0, Math.min(999, Math.round(Number(n.order)))) : 0,
            x: n && Number.isFinite(n.x) ? Math.round(n.x) : 0,
            y: n && Number.isFinite(n.y) ? Math.round(n.y) : 0 };
        };
        const seen = new Set(); const nodes = [];
        for (const n of body.nodes.slice(0, 200).map(clean)) {
          if (!n || seen.has(n.id)) continue; seen.add(n.id); nodes.push(n);
        }
        topoStore.devices[target.id] = { nodes, updatedAt: Date.now() };
        if (!saveTopology()) throw new Error('写入 data/topology.json 失败');
        console.log(`[topology] ${target.name} custom nodes=${nodes.length} by=${req.socket.remoteAddress}`);
        return json(res, 200, { ok: true, nodes, updatedAt: topoStore.devices[target.id].updatedAt });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 405, { error: '不支持的请求方法' });
  }
  /* 设备图标：支持 PNG/JPEG/WebP/GIF/SVG；SVG 读取时强制图片 MIME + nosniff 且已净化脚本 */
  if (p === '/api/topology/icons' && req.method === 'GET') {
    return json(res, 200, { ok: true, icons: listTopoIcons(), dir: 'data/topology-icons/' });
  }
  if (p === '/api/topology/icon' && req.method === 'POST') {
    try {
      const b = await readBodyLimit(req, 2 * 1024 * 1024);
      const m = /^data:(image\/(png|jpe?g|webp|gif|svg\+xml));base64,([\s\S]+)$/i.exec(String(b.data || ''));
      if (!m) throw new Error('仅支持 PNG / JPEG / WebP / GIF / SVG 图片');
      const rawExt = m[2].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : rawExt;
      let buf = Buffer.from(m[3], 'base64');
      if (!buf.length || buf.length > 900 * 1024) throw new Error('图片大小需在 900KB 以内');
      if (ext === 'svg') buf = sanitizeSvg(buf);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      const label = iconLabel(b.label || b.fileName, '');
      fs.mkdirSync(TOPO_ICON_DIR, { recursive: true });
      const idx = readIconIndex();
      /* 1) 已登记图标按内容哈希去重：两部一样的手机只存一份 */
      for (const [name, meta] of Object.entries(idx.icons)) {
        if (meta && meta.sha256 === hash && fs.existsSync(path.join(TOPO_ICON_DIR, name))) {
          return json(res, 200, { ok: true, reused: true, name, url: '/api/topology/icon/' + name,
            label: iconLabel(meta.label, name), icons: listTopoIcons() });
        }
      }
      /* 2) 手动拷进目录的图片没有登记信息，补算哈希后再比对一次 */
      for (const it of listTopoIcons()) {
        if (idx.icons[it.name] && idx.icons[it.name].sha256) continue;
        const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(TOPO_ICON_DIR, it.name))).digest('hex');
        idx.icons[it.name] = { label: it.label, sha256: h, size: it.size, createdAt: it.mtime };
        if (h === hash) {
          saveIconIndex(idx);
          return json(res, 200, { ok: true, reused: true, name: it.name, url: it.url,
            label: it.label, icons: listTopoIcons() });
        }
      }
      /* 3) 新图标：用用户命名作为文件名（所见即所得），同名不同内容时加 -2/-3 后缀 */
      const base = iconSafeBase(label || b.fileName, 'icon');
      let name = base + '.' + ext, n = 2;
      while (fs.existsSync(path.join(TOPO_ICON_DIR, name))) name = base + '-' + (n++) + '.' + ext;
      fs.writeFileSync(path.join(TOPO_ICON_DIR, name), buf, { mode: 0o644 });
      idx.icons[name] = { label: label || iconLabel(base, 'Icon'),
        sha256: hash, size: buf.length, createdAt: new Date().toISOString() };
      saveIconIndex(idx);
      return json(res, 200, { ok: true, reused: false, name, url: '/api/topology/icon/' + name,
        label: idx.icons[name].label, icons: listTopoIcons() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/topology/icon/rename' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const name = String(b.name || '');
      if (!ICON_NAME_RE.test(name) || !fs.existsSync(path.join(TOPO_ICON_DIR, name))) throw new Error('图标不存在');
      const label = iconLabel(b.label, name);
      const idx = readIconIndex();
      idx.icons[name] = { ...(idx.icons[name] || {}), label };
      saveIconIndex(idx);
      return json(res, 200, { ok: true, icons: listTopoIcons() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/topology/icon/delete' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const name = String(b.name || '');
      if (!ICON_NAME_RE.test(name)) throw new Error('无效图标名');
      const usedBy = iconUsage()[name] || [];
      if (usedBy.length && !b.force) {
        return json(res, 409, { error: `还有 ${usedBy.length} 台设备在使用该图标：${usedBy.slice(0, 5).join('、')}`, usedBy });
      }
      const idx = readIconIndex();
      fs.rmSync(path.join(TOPO_ICON_DIR, name), { force: true });
      delete idx.icons[name];
      saveIconIndex(idx);
      if (b.force && usedBy.length) {
        const url = '/api/topology/icon/' + name;
        for (const store of Object.values(topoStore.devices || {})) {
          for (const n of (store && store.nodes) || []) if (n.icon === url) n.icon = '';
        }
        saveTopology();
      }
      return json(res, 200, { ok: true, clearedNodes: b.force ? usedBy.length : 0, icons: listTopoIcons() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p.startsWith('/api/topology/icon/') && req.method === 'GET') {
    const name = decodeURIComponent(p.slice('/api/topology/icon/'.length));
    if (!ICON_NAME_RE.test(name)) return json(res, 400, { error: '无效图标名' });
    try {
      const buf = fs.readFileSync(path.join(TOPO_ICON_DIR, name));
      const ext = name.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp'
        : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    } catch (e) { return json(res, 404, { error: '图标不存在' }); }
  }
  if (p === '/api/settings' && req.method === 'GET') {
    const dev = activeDevice();
    return json(res, 200, { ...(dev ? dev.snapshotCfg() : {}), mode: dev && dev.mode, connected: !!(dev && dev.api && dev.api.connected), error: dev && dev.lastError, hostPort: Number(process.env.WEB_PORT || 0) || PORT });
  }
  if (p === '/api/settings' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const dev = activeDevice(); if (!dev) throw new Error('没有可用设备');
      if (b.host !== undefined) { if (!validHost(b.host)) throw new Error('地址格式不正确'); dev.cfg.host = String(b.host).trim(); }
      if (b.port !== undefined) { if (!validPort(b.port)) throw new Error('端口不正确'); dev.cfg.port = Number(b.port); }
      if (b.user !== undefined) { if (!b.user) throw new Error('账号不能为空'); dev.cfg.user = String(b.user).trim(); }
      if (b.password !== undefined && b.password !== '') dev.cfg.password = String(b.password);
      if (b.tls !== undefined) dev.cfg.tls = !!b.tls;
      if (b.demo !== undefined) dev.cfg.demo = !!b.demo;
      let restartRequired = false;
      if (b.webPort !== undefined) {
        if (!validPort(b.webPort)) throw new Error('WebUI 端口不正确');
        if (Number(b.webPort) !== PORT) { PORT = Number(b.webPort); restartRequired = true; }
      }
      if (!saveDeviceRegistry()) throw new Error('设置已应用，但写入 data/devices.json 失败');
      dev.reconnectNow();
      return json(res, 200, { ok: true, restartRequired, ...dev.snapshotCfg() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (p === '/api/config' && req.method === 'GET') {
    const section = SECTION_MAP[url.searchParams.get('section')];
    if (!section || !section.path) return json(res, 400, { error: '未知配置分类' });
    try {
      const dev = reqDevice(req, url);
      return json(res, 200, { deviceId: dev && dev.id, rows: await rosPrint(dev, section),
        demo: !!(dev && dev.forceDemo), offline: !dev || !(dev.api && dev.api.connected) });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (p === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const section = SECTION_MAP[body.section];
      if (!section || !section.path) throw new Error('未知配置分类');
      if (!section.writable) throw new Error('该分类为只读');
      if (!['add', 'set', 'enable', 'disable', 'remove', 'run'].includes(body.action)) throw new Error('不支持的操作');
      if ((body.action === 'enable' || body.action === 'disable') && section.toggle === false) throw new Error('该分类不支持启用/禁用');
      if (body.action === 'run' && !section.runPath) throw new Error('该分类不支持运行');
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 200) : [];
      if (['set', 'enable', 'disable', 'remove', 'run'].includes(body.action) && !ids.length && !(body.action === 'set' && section.singleton)) throw new Error('请至少选择一条记录');
      if (body.values && typeof body.values !== 'object') throw new Error('参数格式错误');
      const dev = reqDevice(req, url, body);
      const result = await rosWrite(dev, section, body.action, { ids, values: body.values || {} });
      console.log(`[write] ${dev.name} ${body.action} ${section.path} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/ping/stream' && req.method === 'GET') {
    if (!authorized(req)) return json(res, 401, { error: 'Unauthorized', loginRequired: true });
    const address = String(url.searchParams.get('address') || '').trim();
    if (!address) return json(res, 400, { error: '请填写目标地址 / Address is required' });
    if (!/^[a-zA-Z0-9_.:-]+$/.test(address)) return json(res, 400, { error: '地址格式不正确' });
    const count = Math.max(1, Math.floor(Number(url.searchParams.get('count')) || 5));
    const dev = reqDevice(req, url);
    if (!dev) return json(res, 400, { error: '没有可用设备 / No device' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { /* ignore */ } };
    let closed = false, timer = null;
    const finish = () => { if (closed) return; closed = true; if (timer) clearInterval(timer); try { res.end(); } catch (e) { /* ignore */ } };
    req.on('close', finish);
    if (dev.forceDemo) {
      let i = 0;
      timer = setInterval(() => {
        if (closed) return;
        i++;
        send({ row: { seq: String(i), host: address, time: (1 + Math.random() * 3).toFixed(2) + 'ms', ttl: '64', size: '56' } });
        if (i >= count) { send({ done: true, demo: true }); finish(); }
      }, 650);
    } else {
      if (!(dev.api && dev.api.connected)) { send({ error: '路由器未连接，无法执行真实 ping / Router offline' }); finish(); return; }
      const client = new RouterOSAPI({ ...dev.cfg });
      client.connect().then(() => {
        if (closed) return null;
        /* onRecord 让每一条 ICMP 回复一到就立刻推送，前端逐格点亮 */
        return client.exec(['/ping', `=address=${address}`, `=count=${count}`], {
          onRecord: (rec) => { if (!closed && rec && (rec.seq !== undefined || rec.time !== undefined)) send({ row: rec }); },
        });
      }).then((r) => {
        if (r && r.status && r.status.type === 'trap') throw new Error(r.status.message || 'ping 失败');
        if (!closed) { send({ done: true }); finish(); }
      }).catch((e) => {
        if (!closed) { send({ error: e.message || String(e) }); finish(); }
      }).finally(() => { try { client.close(); } catch (e) { /* ignore */ } });
    }
    return;
  }

  /* 配置导出：返回纯文本，由浏览器生成文件下载到用户自己的设备 */
  if (p === '/api/export' && req.method === 'GET') {
    if (!authorized(req)) return json(res, 401, { error: 'Unauthorized', loginRequired: true });
    const dev = reqDevice(req, url);
    if (!dev) return json(res, 400, { error: '没有可用设备 / No device' });
    const raw = String(url.searchParams.get('name') || '').replace(/[^a-zA-Z0-9_\-]/g, '');
    const name = raw || ('config-' + new Date().toISOString().slice(0, 10));
    try {
      if (dev.forceDemo) {
        return json(res, 200, { name, demo: true, text: `# ROS Center DEMO export\n# device: ${dev.name}\n# 演示模式：以下为示例文本，不是真实配置\n/interface print\n/system resource print\n` });
      }
      if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，无法导出配置 / Router offline');
      const r = await dev.api.exec(['/export', '=hide-sensitive=yes']);
      if (r && r.status && r.status.type === 'trap') throw new Error(r.status.message || '导出失败');
      const lines = ((r && r.re) || []).map((x) => x && (x.output !== undefined ? x.output : x.ret !== undefined ? x.ret : x.line)).filter((v) => v !== undefined && v !== null).map(String);
      const text = (lines.length ? lines.join('\n') : '') + '\n';
      return json(res, 200, { name, text });
    } catch (e) { return json(res, 400, { error: e.message || String(e) }); }
  }

  if (p === '/api/action' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const fn = SPECIAL[body.action]; if (!fn) throw new Error('不支持的操作');
      const dev = reqDevice(req, url, body);
      const result = await fn(dev, body.params || {});
      console.log(`[action] ${dev.name} ${body.action} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  /* ---- 一键配置（预览 / 下载脚本 / 执行） ---- */
  if (p === '/api/quicksetup/preview' && req.method === 'POST') {
    try {
      const plan = quicksetup.buildPlan(await readBody(req), { preview: true });
      return json(res, 200, { ok: true, summary: plan.summary, warnings: plan.warnings,
        steps: plan.steps.length, script: plan.maskScript() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/quicksetup/script' && req.method === 'POST') {
    try {
      const plan = quicksetup.buildPlan(await readBody(req));
      return json(res, 200, { ok: true, name: 'ros-center-quicksetup', script: plan.script,
        warnings: plan.warnings });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/quicksetup/apply' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const plan = quicksetup.buildPlan(b);
      const dev = reqDevice(req, url, b);
      if (!dev) throw new Error('没有可用设备 / No device');
      if (dev.forceDemo) {
        return json(res, 200, { ok: true, demo: true, simulated: true, executed: 0, removed: 0,
          credentialsSynced: false, summary: plan.summary, script: plan.maskScript(),
          warnings: [...plan.warnings, '演示模式：仅生成脚本，不会对路由器写入任何配置'], errors: [] });
      }
      if (!(dev.api && dev.api.connected)) throw new Error('路由器未连接，未写入任何配置 / Router offline - nothing was changed');
      /* 预检：读取相关菜单现有条目，用于幂等更新与清理 */
      const prints = {};
      for (const path of plan.preflightPaths) {
        try {
          const r = await dev.api.exec([`${path}/print`]);
          if (r.status.type !== 'trap') prints[path] = r.re || [];
        } catch (e) { /* 某些菜单在 v6 / 精简权限下不存在，跳过即可 */ }
      }
      const ex = quicksetup.resolveExecution(plan, prints, { clean: !!b.clean });
      let executed = 0, removed = 0;
      const errors = [];
      for (const cmd of ex.removals) {
        const r = await dev.api.exec(cmd);
        if (r.status.type === 'trap') errors.push('删除旧配置失败: ' + (r.status.message || ''));
        else removed++;
      }
      for (const s of ex.commands) {
        const r = await dev.api.exec(s.cmd);
        if (r.status.type === 'trap') errors.push(`${s.cmd[0]}: ${r.status.message || '失败'}`);
        else executed++;
      }
      let credentialsSynced = false;
      if (plan.adminChange && plan.adminChange.syncCredentials && executed > 0 && !errors.length) {
        dev.cfg.user = plan.adminChange.newUser;
        dev.cfg.password = plan.adminChange.newPassword;
        saveDeviceRegistry();
        dev.reconnectNow();
        credentialsSynced = true;
      }
      console.log(`[quicksetup] ${dev.name} mode=${plan.mode} executed=${executed} removed=${removed} errors=${errors.length} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: errors.length === 0, executed, removed, skipped: ex.skipped.length,
        credentialsSynced, errors, warnings: [...plan.warnings, ...ex.warnings], summary: plan.summary });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  /* ---- 检查更新 / 自动更新 ---- */
  if (p === '/api/update/status' && req.method === 'GET') {
    return json(res, 200, {
      config: publicUpdateConfig(), status: updateState.status, runtime: runtimeInfo(),
      limits: {
        selfReplace: runtimeInfo().selfUpdate !== 'source',
        selfUpdateKind: runtimeInfo().selfUpdate,
        source: derivedSource(),
        dockerCommand: 'docker pull backspacem/ros-center:latest && docker compose up -d',
      },
    });
  }
  if (p === '/api/update/config' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const cur = updateState.config;
      const patch = { ...b };
      if (patch.proxy === undefined || patch.proxy === updates.maskProxy(cur.proxy)) patch.proxy = cur.proxy;
      updateState.config = updates.normalizeConfig({ ...cur, ...patch, source: derivedSource() });
      saveUpdateState();
      scheduleUpdateChecks();
      return json(res, 200, { ok: true, config: publicUpdateConfig() });
    } catch (e) { return json(res, 400, { error: updates.friendlyError(e) }); }
  }
  if (p === '/api/update/check' && req.method === 'POST') {
    let force = false;
    try { force = !!(await readBody(req)).force; } catch (e) { /* 空 body 视为普通检查 */ }
    const s = await performUpdateCheck('manual', force);
    return json(res, 200, { ok: true, status: s, config: publicUpdateConfig() });
  }
  if (p === '/api/update/download' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const latest = (updateState.status && updateState.status.latest) || {};
      const asset = b.name ? (latest.assets || []).find((a) => a.name === b.name)
        : updates.chooseAsset(latest, process.platform, process.arch);
      if (!asset) throw new Error('没有匹配的安装包资产 / no matching asset');
      if (runtimeInfo().runtime === 'docker') throw new Error('Docker 部署请直接拉取新镜像，无需下载安装包');
      const downloaded = await downloadUpdateAsset(asset, false);
      return json(res, 200, { ok: true, downloaded });
    } catch (e) { return json(res, 400, { error: updates.friendlyError(e) }); }
  }

  /* ---- 自更新：Docker 经 docker.sock 重建容器 / 桌面替换 app 并自动重启 ---- */
  if (p === '/api/update/self/status' && req.method === 'GET') {
    try {
      const force = url.searchParams.get('refresh') === '1';
      return json(res, 200, { ok: true, ...(await selfCapabilities(force)) });
    } catch (e) { return json(res, 200, { ok: false, kind: runtimeInfo().selfUpdate, available: false, reason: updates.friendlyError(e) }); }
  }
  if (p === '/api/update/self/apply' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      return json(res, 200, { ok: true, ...(await applySelfUpdate(b || {})) });
    } catch (e) { return json(res, 400, { error: updates.friendlyError(e) }); }
  }
  if (p === '/api/update/self/result' && req.method === 'GET') {
    const rt = runtimeInfo();
    return json(res, 200, { ok: true, kind: rt.selfUpdate, runtime: rt,
      progress: currentProgress(),
      result: selfResult(rt.selfUpdate === 'docker' ? 'docker' : 'desktop') });
  }
  if (p === '/api/update/self/clear' && req.method === 'POST') {
    try {
      for (const f of [SELF_PROGRESS_FILE, path.join(DATA_DIR, selfupdate.DOCKER_UPDATE_RESULT),
        path.join(DATA_DIR, selfupdate.DOCKER_UPDATE_PENDING)]) fs.rmSync(f, { force: true });
      selfUpdateBusy = false; selfUpdateStartedAt = 0; lastAutoApplyKey = '';
      selfCapCache = { at: 0, value: null };
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { error: updates.friendlyError(e) }); }
  }

  return serveStatic(req, res, p);
});

server.on('upgrade', (req, socket) => {
  if (!authorized(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
    socket.destroy(); return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${wsAccept(key)}`, '\r\n'].join('\r\n'));
  socket.setNoDelay(true);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const wanted = url.searchParams.get('device');
  socket.deviceId = devices.has(wanted) ? wanted : activeId;
  clients.add(socket);
  socket.on('data', (b) => handleClientData(socket, b));
  const cleanup = () => clients.delete(socket);
  socket.on('close', cleanup); socket.on('error', cleanup);
  const dev = devices.get(socket.deviceId);
  if (dev && dev.lastPacket) sendFrame(socket, JSON.stringify(snapshotOf(dev)));
});

/* 写运行态文件：launcher 再次被点击时据此找到已在运行的实例与真实端口
   （端口可能被用户改过，也可能因占用自动顺延） */
function writeAppRuntime() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const rec = { app: 'ros-center', pid: process.pid, port: PORT, url: `http://localhost:${PORT}`, at: new Date().toISOString() };
    const tmp = APP_RUNTIME_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec));
    fs.renameSync(tmp, APP_RUNTIME_FILE);
  } catch (e) { /* 写失败不影响服务 */ }
}
/* 桌面版双击后自动打开浏览器；ROS_NO_BROWSER=1 可关闭 */
function openBrowser(url) {
  try {
    const cp = require('child_process');
    const cmd = process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
    cp.spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* 打不开浏览器不影响服务 */ }
}
/* 桌面版端口被占用时自动顺延，避免双击后无声失败 */
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && DESKTOP && PORT < 10110) {
    PORT += 1;
    setTimeout(() => server.listen(PORT, HOST), 200);
    return;
  }
  console.error('[ui] listen failed:', e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`[ui] http://localhost:${PORT}`);
  console.log(`[ui] ${devices.size} device(s), active=${activeDevice() ? activeDevice().name : 'none'}`);
  clearStaleProgress();
  writeAppRuntime();
  if (DESKTOP && !process.env.ROS_NO_BROWSER) openBrowser(`http://localhost:${PORT}`);
  /* 服务成功起来后确认应用内更新，launcher 之后不会再按「启动失败」回滚 */
  setTimeout(() => {
    try {
      if (selfupdate.markDesktopVerified({ dataDir: DATA_DIR })) {
        const r = selfupdate.readJson(path.join(DATA_DIR, selfupdate.APP_UPDATE_RESULT), null);
        console.log('[self-update] app update verified:', r && r.version);
      }
    } catch (e) { /* ignore */ }
  }, 2500).unref?.();
});
for (const dev of devices.values()) { dev.ensureConnection(); pollDevice(dev); }
scheduleUpdateChecks();
setInterval(() => { for (const dev of devices.values()) pollDevice(dev); }, INTERVAL);
setInterval(() => { saveUsage(); }, 15000); // 每 15 秒把流量统计落盘
process.on('SIGINT', () => { saveUsage(true); for (const d of devices.values()) if (d.api) d.api.close(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { saveUsage(true); process.exit(0); });
