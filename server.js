'use strict';

/* 读取同目录 .env（零依赖），已存在的环境变量优先 */
try {
  const envPath = require('path').join(__dirname, '.env');
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

const HOST = process.env.HOST || '0.0.0.0';
const INTERVAL = Math.max(500, Number(process.env.POLL_INTERVAL_MS || 1000));
/* 连接表计数较重：独立低频采集（默认 5 秒），不跟随每秒的流量轮询 */
const CONN_INTERVAL = Math.max(3000, Number(envNum('CONN_POLL_INTERVAL_MS', 5000)));
const HISTORY = Math.max(30, Number(envNum('HISTORY_POINTS', 180)));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const LEGACY_SETTINGS = path.join(DATA_DIR, 'settings.json');
let PORT = envNum('PORT', 10086);
function envNum(key, d) { const n = Number(process.env[key]); return Number.isFinite(n) && n > 0 ? n : d; }

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
    this.ifaceMeta = new Map();   // name -> { type, comment, running, disabled }
    this.lastRates = new Map();   // name -> { rxBps, txBps, rxPps, txPps }
    this.lastResource = null;
    this.connections = { v4: 0, v6: 0, total: 0, tcp: 0, udp: 0 };
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
      uptime: Math.floor((Date.now() - this.startedAt) / 1000), interval: INTERVAL };
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
        client.close(); this.stopTrafficStream(); this.mode = 'demo'; this.lastError = e.message || String(e);
        console.log(`[ros] ${this.name} demo fallback: ${this.lastError}`);
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
  if (!reg || !Array.isArray(reg.devices) || !reg.devices.length) {
    /* 迁移旧的单设备 settings.json / 环境变量 */
    let old = {};
    try { old = JSON.parse(fs.readFileSync(LEGACY_SETTINGS, 'utf8')); } catch (e) { old = {}; }
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
    devices.set(String(d.id), new Device({
      id: String(d.id), name: String(d.name).trim(), host: String(d.host).trim(), port: Number(d.port),
      user: String(d.user || 'admin'), password: String(d.password || ''), tls: !!d.tls, demo: !!d.demo,
    }));
  }
  if (!devices.size) {
    const fallback = { id: newId(), name: '主路由', host: '10.0.0.1', port: 8728, user: 'admin', password: '', tls: false, demo: true };
    devices.set(fallback.id, new Device(fallback));
    activeId = fallback.id;
    saveDeviceRegistry();
  } else activeId = devices.has(reg.activeId) ? reg.activeId : devices.keys().next().value;
  if (portMigrated) saveDeviceRegistry(); // 设备已在内存中，安全落盘
}
function saveDeviceRegistry() {
  const reg = {
    devices: [...devices.values()].map((d) => ({ ...d.cfg })),
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

/* ================= 演示数据（每设备独立） ================= */
function demoPrint(dev, sectionId) { return (dev.demoDB[sectionId] || []).map((r) => ({ ...r })); }
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
async function rosPrint(dev, section) {
  if (dev.forceDemo || !(dev.api && dev.api.connected)) return demoPrint(dev, section.id);
  const r = await dev.api.exec([`${section.path}/print`]);
  if (r.status.type === 'trap') throw new Error(r.status.message || '读取失败');
  return r.re;
}
async function rosWrite(dev, section, action, payload) {
  const { ids = [], values = {} } = payload || {};
  if (dev.forceDemo || !(dev.api && dev.api.connected)) {
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
      default: throw new Error('不支持的操作');
    }
  }
  const cmds = []; const wv = wordsFromValues(section.fields, values);
  switch (action) {
    case 'add': cmds.push([`${section.path}/add`, ...wv]); break;
    case 'set':
      if (section.singleton && !ids.length) { cmds.push([`${section.path}/set`, ...wv]); break; }
      if (!ids[0]) throw new Error('缺少 .id');
      cmds.push([`${section.path}/set`, `=.id=${ids[0]}`, ...wv]); break;
    case 'enable': case 'disable': for (const id of ids) cmds.push([`${section.path}/${action}`, `=.id=${id}`]); break;
    case 'remove': for (const id of ids) cmds.push([`${section.path}/remove`, `=.id=${id}`]); break;
    default: throw new Error('不支持的操作');
  }
  let changed = 0;
  for (const cmd of cmds) { const r = await dev.api.exec(cmd); if (r.status.type === 'trap') throw new Error(r.status.message || '操作失败'); changed++; }
  return { changed };
}
const SPECIAL = {
  reboot: async (dev) => { if (!dev.forceDemo && dev.api && dev.api.connected) { const r = await dev.api.exec(['/system/reboot']); if (r.status.type === 'trap') throw new Error(r.status.message); } return { ok: true, demo: dev.forceDemo }; },
  backup: async (dev, p) => {
    const name = String((p && p.name) || ('backup-' + new Date().toISOString().slice(0, 10))).replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!dev.forceDemo && dev.api && dev.api.connected) { const r = await dev.api.exec(['/system/backup/save', `=name=${name}`]); if (r.status.type === 'trap') throw new Error(r.status.message); }
    return { ok: true, name, demo: dev.forceDemo };
  },
  ping: async (dev, p) => {
    const address = String((p && p.address) || dev.cfg.host).trim();
    if (!/^[a-zA-Z0-9_.:-]+$/.test(address)) throw new Error('地址格式不正确');
    if (!dev.forceDemo && dev.api && dev.api.connected) {
      const r = await dev.api.exec(['/ping', `=address=${address}`, '=count=5']);
      return { ok: true, rows: r.re };
    }
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ seq: String(i), host: address, time: (1 + Math.random() * 3).toFixed(2) + 'ms', ttl: '64', size: '56' });
    return { ok: true, rows, demo: true };
  },
  'log-clear': async (dev) => {
    if (!dev.forceDemo && dev.api && dev.api.connected) { const r = await dev.api.exec(['/log/clear']); if (r.status.type === 'trap') throw new Error(r.status.message); }
    else dev.demoDB.logs.length = 0;
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
    uptime: fmtDuration((Date.now() - dev.startedAt) / 1000), 'board-name': 'RB5009UG+S+',
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
    const prev = dev.ifaceTotals.get(row.name) || { rx: num(row['rx-byte']), tx: num(row['tx-byte']) };
    const next = { rx: num(row['rx-byte']) > 0 ? num(row['rx-byte']) : prev.rx + rxBps * INTERVAL / 8000, tx: num(row['tx-byte']) > 0 ? num(row['tx-byte']) : prev.tx + txBps * INTERVAL / 8000 };
    dev.ifaceTotals.set(row.name, next);
    out.push({
      name: row.name, type: row.type || '', comment: row.comment || '', running: row.running || 'false', disabled: 'false',
      rxBps, txBps, rxPps, txPps,
      rxBytes: Math.round(next.rx), txBytes: Math.round(next.tx),
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
  const [v4, v6, tcp, udp] = await Promise.all([
    connCount(client, '/ip/firewall/connection/print'),
    connCount(client, '/ipv6/firewall/connection/print'),
    connCount(client, '/ip/firewall/connection/print', '?protocol=tcp'),
    connCount(client, '/ip/firewall/connection/print', '?protocol=udp'),
  ]);
  return {
    v4: v4 >= 0 ? v4 : 0, v6: v6 >= 0 ? v6 : 0,
    tcp: tcp >= 0 ? tcp : 0, udp: udp >= 0 ? udp : 0,
    total: (v4 >= 0 ? v4 : 0) + (v6 >= 0 ? v6 : 0),
  };
}
function demoConnections(dev) {
  const t = Date.now() / 1000;
  const v4 = Math.round(1180 + Math.sin(t / 13) * 260 + Math.sin(t / 4.7) * 70 + (Math.random() - 0.5) * 24);
  const v6 = Math.round(96 + Math.sin(t / 19 + 1) * 34 + (Math.random() - 0.5) * 10);
  return { v4: Math.max(0, v4), v6: Math.max(0, v6), total: Math.max(0, v4) + Math.max(0, v6), tcp: Math.round(v4 * 0.61), udp: Math.round(v4 * 0.33) };
}
async function refreshConnections(dev, wasLive) {
  if (Date.now() - dev.lastConnPoll < CONN_INTERVAL) return;
  dev.lastConnPoll = Date.now();
  if (wasLive && dev.api && dev.api.connected) {
    try {
      const c = await collectConnections(dev, dev.api);
      if (c.v4 || c.v6) { dev.connections = c; return; }
    } catch (e) { /* 回退到演示/保留旧值 */ }
  }
  dev.connections = demoConnections(dev);
}

/* ---- 真·实时：RouterOS 原生 monitor-traffic 持续推送（每秒一次 !re） ---- */
function ifacesFromCache(dev) {
  const out = [];
  for (const [name, meta] of dev.ifaceMeta) {
    if (meta.disabled === 'true') continue;
    const rate = dev.lastRates.get(name) || {};
    const total = dev.ifaceTotals.get(name) || { rx: 0, tx: 0 };
    out.push({
      name, type: meta.type, comment: meta.comment, running: meta.running, disabled: 'false',
      rxBps: rate.rxBps || 0, txBps: rate.txBps || 0, rxPps: rate.rxPps || 0, txPps: rate.txPps || 0,
      rxBytes: Math.round(total.rx), txBytes: Math.round(total.tx),
      rxErrors: meta.rxErrors || 0, txErrors: meta.txErrors || 0, rxDrops: meta.rxDrops || 0, txDrops: meta.txDrops || 0,
    });
  }
  return out;
}
function emitStreamPacket(dev) {
  if (!dev.ifaceMeta.size) return;
  const ifaces = ifacesFromCache(dev);
  const totalRx = ifaces.reduce((s, i) => s + i.rxBps, 0), totalTx = ifaces.reduce((s, i) => s + i.txBps, 0);
  const packet = {
    deviceId: dev.id, deviceName: dev.name, ts: Date.now(), mode: dev.mode, host: dev.cfg.host,
    interval: INTERVAL, streaming: true, uptime: Math.floor((Date.now() - dev.startedAt) / 1000), error: dev.lastError,
    totalRx, totalTx, ifaces, resource: dev.lastResource || {}, resourceHistory: dev.resourceHistory,
    connections: dev.connections,
  };
  dev.history.push({ ts: packet.ts, rx: totalRx, tx: totalTx });
  if (dev.history.length > HISTORY) dev.history.shift();
  dev.lastPacket = packet;
  broadcast(dev.id, packet);
}
function streamFailed(dev, client, err) {
  if (dev.monitorApi === client) { client.close(); dev.monitorApi = null; }
  dev.streamActive = false;
  console.warn(`[ros] ${dev.name} traffic stream unavailable: ${err && err.message ? err.message : err} - using polling`);
  if (!dev.forceDemo && dev.api && dev.api.connected && !dev.monitorRetry) {
    dev.monitorRetry = setTimeout(() => { dev.monitorRetry = null; startTrafficStream(dev); }, envNum('TRAFFIC_STREAM_RETRY_MS', 10000));
  }
}
function startTrafficStream(dev) {
  if (dev.forceDemo || String(process.env.TRAFFIC_STREAM || '1') === '0' || !dev.api || !dev.api.connected || dev.monitorApi || dev.monitorRetry) return;
  const client = new RouterOSAPI({ ...dev.cfg });
  client.connect().then(() => {
    if (!dev.api || !dev.api.connected || dev.monitorApi) { client.close(); return; }
    dev.monitorApi = client; dev.streamActive = true;
    console.log(`[ros] ${dev.name} live traffic stream started (monitor-traffic)`);
    client.exec(['/interface/monitor-traffic', '=interface=all'], {
      onRecord: (rec) => {
        const name = rec.name || rec.interface;
        if (!name) return;
        dev.lastRates.set(name, {
          rxBps: num(rec['rx-bits-per-second']), txBps: num(rec['tx-bits-per-second']),
          rxPps: num(rec['rx-packets-per-second']), txPps: num(rec['tx-packets-per-second']),
        });
        // 同一秒的多接口记录合并成一次完整快照，避免前端看到半更新数据
        if (!dev.streamFlush) dev.streamFlush = setTimeout(() => { dev.streamFlush = null; emitStreamPacket(dev); }, 80);
      },
    }).then((r) => streamFailed(dev, client, new Error(r.status.type === 'trap' ? (r.status.message || 'monitor-traffic rejected') : 'monitor stream ended')))
      .catch((e) => streamFailed(dev, client, e));
  }).catch((e) => streamFailed(dev, client, e));
}

async function pollDevice(dev) {
  if (dev.polling) return;
  dev.polling = true;
  try {
    const wasLive = !dev.forceDemo && dev.api && dev.api.connected;
    const useStream = !!(wasLive && dev.streamActive);
    let ifaces, resource;
    if (wasLive) {
      try {
        [ifaces, resource] = await Promise.all([collectLive(dev, dev.api, useStream), collectResource(dev, dev.api)]);
        dev.lastResource = resource;
        dev.mode = 'live'; dev.lastError = '';
      } catch (e) {
        dev.lastError = e.message || String(e); dev.stopTrafficStream(); dev.api.close(); dev.api = null; dev.mode = 'demo'; dev.ensureConnection();
      }
    }
    if (!ifaces) { if (!dev.forceDemo) dev.ensureConnection(); ifaces = demoSnapshot(dev); }
    if (!resource) { resource = demoResource(dev); if (!dev.forceDemo && !(dev.api && dev.api.connected)) dev.mode = 'demo'; }
    if (!dev.forceDemo && !wasLive) dev.mode = 'demo';
    await refreshConnections(dev, wasLive);

    const totalRx = ifaces.reduce((s, i) => s + i.rxBps, 0), totalTx = ifaces.reduce((s, i) => s + i.txBps, 0);
    const packet = {
      deviceId: dev.id, deviceName: dev.name, ts: Date.now(), mode: dev.mode, host: dev.cfg.host,
      interval: INTERVAL, uptime: Math.floor((Date.now() - dev.startedAt) / 1000), error: dev.lastError,
      totalRx, totalTx, ifaces, resource, connections: dev.connections,
    };
    dev.history.push({ ts: packet.ts, rx: totalRx, tx: totalTx });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  /* ---- 登录：无需鉴权 ---- */
  if (p === '/api/health') return json(res, 200, { ok: true, ts: Date.now() });
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
  if (p === '/api/history') {
    const dev = reqDevice(req, url);
    return json(res, 200, { points: dev ? dev.history : [], resource: dev ? dev.resourceHistory : [] });
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
      return json(res, 200, { deviceId: dev && dev.id, rows: await rosPrint(dev, section), demo: !dev || dev.forceDemo || !(dev.api && dev.api.connected) });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (p === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const section = SECTION_MAP[body.section];
      if (!section || !section.path) throw new Error('未知配置分类');
      if (!section.writable) throw new Error('该分类为只读');
      if (!['add', 'set', 'enable', 'disable', 'remove'].includes(body.action)) throw new Error('不支持的操作');
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 200) : [];
      if (['set', 'enable', 'disable', 'remove'].includes(body.action) && !ids.length && !(body.action === 'set' && section.singleton)) throw new Error('请至少选择一条记录');
      if (body.values && typeof body.values !== 'object') throw new Error('参数格式错误');
      const dev = reqDevice(req, url, body);
      const result = await rosWrite(dev, section, body.action, { ids, values: body.values || {} });
      console.log(`[write] ${dev.name} ${body.action} ${section.path} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { error: e.message }); }
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

server.listen(PORT, HOST, () => {
  console.log(`[ui] http://localhost:${PORT}`);
  console.log(`[ui] ${devices.size} device(s), active=${activeDevice() ? activeDevice().name : 'none'}`);
});
for (const dev of devices.values()) { dev.ensureConnection(); pollDevice(dev); }
setInterval(() => { for (const dev of devices.values()) pollDevice(dev); }, INTERVAL);
process.on('SIGINT', () => { for (const d of devices.values()) if (d.api) d.api.close(); server.close(() => process.exit(0)); });
