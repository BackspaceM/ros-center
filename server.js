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
const { GROUPS, SECTIONS, SECTION_MAP, PATH_MAP, seed, makeLog } = require('./catalog');

let PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const INTERVAL = Math.max(500, Number(process.env.POLL_INTERVAL_MS || 2000));
const HISTORY = Math.max(30, Number(process.env.HISTORY_POINTS || 180));
const PUBLIC_DIR = path.join(__dirname, 'public');

const ROS = {
  host: process.env.ROS_HOST || '192.168.88.1',
  port: Number(process.env.ROS_PORT || (process.env.ROS_TLS === '1' ? 8729 : 8728)),
  user: process.env.ROS_USER || 'monitor',
  password: process.env.ROS_PASSWORD || '',
  tls: process.env.ROS_TLS === '1',
  reconnectMs: Math.max(2000, Number(process.env.ROS_RECONNECT_MS || 10000)),
};
/* WebUI 保存的连接设置优先级高于 .env / 环境变量，便于不会写配置文件的使用者 */
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
function loadSavedSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveSettings(obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch (e) { console.error('[settings] save failed:', e.message); return false; }
}
const savedSettings = loadSavedSettings();
if (savedSettings.host) ROS.host = String(savedSettings.host);
if (savedSettings.port) ROS.port = Number(savedSettings.port);
if (savedSettings.user) ROS.user = String(savedSettings.user);
if (typeof savedSettings.password === 'string') ROS.password = savedSettings.password;
if (typeof savedSettings.tls === 'boolean') ROS.tls = savedSettings.tls;
if (validPort(savedSettings.webPort)) PORT = Number(savedSettings.webPort);
let FORCE_DEMO = typeof savedSettings.demo === 'boolean' ? savedSettings.demo : process.env.DEMO_MODE === '1';

function validHost(h) { return typeof h === 'string' && h.length > 0 && h.length <= 253 && /^[A-Za-z0-9._:\-\[\]]+$/.test(h); }
function validPort(p) { const n = Number(p); return Number.isInteger(n) && n >= 1 && n <= 65535; }
function publicSettings() {
  return { host: ROS.host, port: ROS.port, user: ROS.user, tls: ROS.tls, demo: FORCE_DEMO, passwordSet: !!ROS.password, mode, connected: !!(api && api.connected), error: lastError, webPort: PORT, hostPort: Number(process.env.WEB_PORT || 0) || PORT };
}
function persistSettings() {
  return saveSettings({ host: ROS.host, port: ROS.port, user: ROS.user, password: ROS.password, tls: ROS.tls, demo: FORCE_DEMO, webPort: PORT });
}
function reconnectNow() {
  if (api) { api.close(); api = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  lastError = ''; mode = FORCE_DEMO ? 'demo' : 'connecting';
  ensureConnection();
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const bool = (v) => v === 'true' || v === true || v === 'yes' || v === 1 || v === '1';
const rosBool = (v) => (bool(v) ? 'true' : 'false');
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/* ================= RouterOS binary API ================= */
function encodeLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x4000) { const b = Buffer.alloc(2); b.writeUInt16BE(n | 0x8000); return b; }
  if (n < 0x200000) { const b = Buffer.alloc(3); b[0] = 0xC0 | ((n >> 16) & 0x1F); b.writeUInt16BE(n & 0xFFFF, 1); return b; }
  if (n < 0x10000000) { const b = Buffer.alloc(4); b[0] = 0xE0 | ((n >> 24) & 0x0F); b.writeUIntBE(n & 0xFFFFFF, 1, 3); return b; }
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
  exec(words) {
    return new Promise((resolve, reject) => { this.queue.push({ words, resolve, reject }); this._pump(); });
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
    if (words[0] === '!re') { (this.current.re = this.current.re || []).push(parseWords(words)); return; }
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

/* ================= 演示内存数据库 ================= */
const demoDB = {};
for (const [k, v] of Object.entries(seed)) demoDB[k] = v.map((r) => ({ ...r }));
let demoIdSeq = 100;
const nextDemoId = () => '*D' + (++demoIdSeq);

function demoPrint(sectionId) {
  return (demoDB[sectionId] || []).map((r) => ({ ...r }));
}
function demoAdd(sectionId, values) {
  const arr = demoDB[sectionId] || (demoDB[sectionId] = []);
  const row = { '.id': nextDemoId(), ...values };
  if (sectionId === 'interfaces') { row.running = bool(row.disabled) ? 'false' : 'true'; row.type = row.type || 'ether'; }
  arr.push(row);
  return row;
}
function demoSet(sectionId, id, values) {
  const arr = demoDB[sectionId] || [];
  const row = arr.find((r) => r['.id'] === id);
  if (!row) throw new Error('找不到该条目: ' + id);
  Object.assign(row, values);
  if (sectionId === 'interfaces' && 'disabled' in values) row.running = bool(row.disabled) ? 'false' : 'true';
  return row;
}
function demoToggle(sectionId, ids, enable) {
  const arr = demoDB[sectionId] || [];
  let n = 0;
  for (const id of ids) {
    const row = arr.find((r) => r['.id'] === id);
    if (row) { row.disabled = enable ? 'false' : 'true'; if (sectionId === 'interfaces') row.running = enable ? 'true' : 'false'; n++; }
  }
  return n;
}
function demoRemove(sectionId, ids) {
  const arr = demoDB[sectionId] || [];
  let n = 0;
  for (const id of ids) { const i = arr.findIndex((r) => r['.id'] === id); if (i >= 0) { arr.splice(i, 1); n++; } }
  return n;
}

/* ================= 配置读写代理 ================= */
function wordsFromValues(fields, values) {
  const allowed = new Set(fields.map((f) => f.key));
  const out = [];
  for (const [k, v] of Object.entries(values || {})) {
    if (!allowed.has(k) || k === '.id') continue;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'boolean') out.push(`=${k}=${rosBool(v)}`);
    else out.push(`=${k}=${v}`);
  }
  return out;
}

async function rosPrint(section) {
  if (FORCE_DEMO || !(api && api.connected)) return demoPrint(section.id);
  const r = await api.exec([`${section.path}/print`]);
  if (r.status.type === 'trap') throw new Error(r.status.message || '读取失败');
  return r.re;
}
async function rosWrite(section, action, payload) {
  const { ids = [], values = {} } = payload || {};
  if (FORCE_DEMO || !(api && api.connected)) {
    switch (action) {
      case 'add': return { changed: 1, row: demoAdd(section.id, values) };
      case 'set': { if (!ids[0]) throw new Error('缺少 .id'); return { changed: 1, row: demoSet(section.id, ids[0], values) }; }
      case 'enable': return { changed: demoToggle(section.id, ids, true) };
      case 'disable': return { changed: demoToggle(section.id, ids, false) };
      case 'remove': return { changed: demoRemove(section.id, ids) };
      default: throw new Error('不支持的操作');
    }
  }
  const cmds = [];
  const wv = wordsFromValues(section.fields, values);
  switch (action) {
    case 'add': cmds.push([`${section.path}/add`, ...wv]); break;
    case 'set': if (!ids[0]) throw new Error('缺少 .id'); cmds.push([`${section.path}/set`, `=.id=${ids[0]}`, ...wv]); break;
    case 'enable': case 'disable':
      for (const id of ids) cmds.push([`${section.path}/${action}`, `=.id=${id}`]);
      break;
    case 'remove': for (const id of ids) cmds.push([`${section.path}/remove`, `=.id=${id}`]); break;
    default: throw new Error('不支持的操作');
  }
  let changed = 0;
  for (const cmd of cmds) { const r = await api.exec(cmd); if (r.status.type === 'trap') throw new Error(r.status.message || '操作失败'); changed++; }
  return { changed };
}

const SPECIAL = {
  reboot: async () => { if (!FORCE_DEMO && api && api.connected) { const r = await api.exec(['/system/reboot']); if (r.status.type === 'trap') throw new Error(r.status.message); } return { ok: true, demo: FORCE_DEMO }; },
  backup: async (p) => {
    const name = String((p && p.name) || ('backup-' + new Date().toISOString().slice(0, 10))).replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!FORCE_DEMO && api && api.connected) { const r = await api.exec(['/system/backup/save', `=name=${name}`]); if (r.status.type === 'trap') throw new Error(r.status.message); }
    return { ok: true, name, demo: FORCE_DEMO };
  },
  ping: async (p) => {
    const address = String((p && p.address) || '10.0.0.1').trim();
    if (!/^[a-zA-Z0-9_.:-]+$/.test(address)) throw new Error('地址格式不正确');
    if (!FORCE_DEMO && api && api.connected) {
      const r = await api.exec(['/ping', `=address=${address}`, '=count=5']);
      return { ok: true, rows: r.re };
    }
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ seq: String(i), host: address, 'time': (1 + Math.random() * 3).toFixed(2) + 'ms', ttl: '64', size: '56' });
    return { ok: true, rows, demo: true };
  },
  'log-clear': async () => {
    if (!FORCE_DEMO && api && api.connected) { const r = await api.exec(['/log/clear']); if (r.status.type === 'trap') throw new Error(r.status.message); }
    else demoDB.logs.length = 0;
    return { ok: true };
  },
};

/* ================= 采集 ================= */
const startedAt = Date.now();
let mode = FORCE_DEMO ? 'demo' : 'connecting';
let api = null; let reconnectTimer = null; let polling = false;
let lastError = ''; let lastPacket = null;
const ifaceTotals = new Map(); const demoTotal = new Map(); const history = [];
const resourceHistory = [];

function demoResource() {
  const cpu = Math.max(3, Math.min(78, 12 + Math.round(Math.sin(Date.now() / 23000) * 9 + (Math.random() - 0.5) * 6)));
  return {
    'cpu-load': String(cpu),
    'total-memory': '1073741824', 'free-memory': String(Math.round(1073741824 * (0.32 + Math.random() * 0.08))),
    'total-hdd-space': '16777216', 'free-hdd-space': String(Math.round(16777216 * 0.71)),
    uptime: fmtDuration((Date.now() - startedAt) / 1000), 'board-name': 'RB5009UG+S+', version: '7.15.2 (stable)',
    'build-time': '2024-06-18 12:34:56',
  };
}
function fmtDuration(s) {
  s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return (d ? d + 'd' : '') + (h ? h + 'h' : '') + (m ? m + 'm' : '') + sec + 's';
}

function demoSnapshot() {
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
    const prev = demoTotal.get(name) || { rx: base * 18, tx: base * 9 };
    const next = { rx: prev.rx + rxBps * INTERVAL / 8000, tx: prev.tx + txBps * INTERVAL / 8000 };
    demoTotal.set(name, next);
    return {
      name, type, comment, running: enabled ? 'true' : 'false', disabled: enabled ? 'false' : 'true',
      rxBps, txBps, rxPps: Math.round(rxBps / 8200 + Math.random() * 20), txPps: Math.round(txBps / 9100),
      rxBytes: Math.round(next.rx), txBytes: Math.round(next.tx), rxErrors: 0, txErrors: 0,
      rxDrops: idx === 3 && Math.random() > 0.85 ? 1 : 0, txDrops: 0,
    };
  });
}

async function collectLive(client) {
  const list = await client.exec(['/interface/print', '=.proplist=name,type,comment,disabled,running,rx-byte,tx-byte,rx-packet,tx-packet,rx-error,tx-error,rx-drop,tx-drop']);
  if (list.status.type === 'trap') throw new Error('interface print: ' + (list.status.message || 'trap'));
  const out = [];
  for (const row of list.re) {
    if (!row.name || row.disabled === 'true') continue;
    let tr = {};
    try { const r = await client.exec(['/interface/monitor-traffic', `=interface=${row.name}`, '=once=']); if (r.re.length) tr = r.re[0]; } catch (e) { /* ignore */ }
    const rxBps = num(tr['rx-bits-per-second']), txBps = num(tr['tx-bits-per-second']);
    const prev = ifaceTotals.get(row.name) || { rx: num(row['rx-byte']), tx: num(row['tx-byte']) };
    const next = { rx: num(row['rx-byte']) > 0 ? num(row['rx-byte']) : prev.rx + rxBps * INTERVAL / 8000, tx: num(row['tx-byte']) > 0 ? num(row['tx-byte']) : prev.tx + txBps * INTERVAL / 8000 };
    ifaceTotals.set(row.name, next);
    out.push({
      name: row.name, type: row.type || '', comment: row.comment || '', running: row.running || 'false', disabled: 'false',
      rxBps, txBps, rxPps: num(tr['rx-packets-per-second']), txPps: num(tr['tx-packets-per-second']),
      rxBytes: Math.round(next.rx), txBytes: Math.round(next.tx),
      rxErrors: num(row['rx-error']), txErrors: num(row['tx-error']), rxDrops: num(row['rx-drop']), txDrops: num(row['tx-drop']),
    });
  }
  return out;
}

async function collectResource(client) {
  const r = await client.exec(['/system/resource/print']);
  return r.re[0] || {};
}

function ensureConnection() {
  if (FORCE_DEMO) return;
  if (api && api.connected) return;
  if (reconnectTimer) return;
  mode = 'connecting';
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (api) { api.close(); api = null; }
    const client = new RouterOSAPI(ROS);
    try { await client.connect(); api = client; mode = 'live'; lastError = ''; console.log(`[ros] connected ${ROS.host}:${ROS.port}`); }
    catch (e) { client.close(); mode = 'demo'; lastError = e.message || String(e); console.log(`[ros] demo fallback: ${lastError}`); }
  }, api ? ROS.reconnectMs : 300);
}

async function poll() {
  if (polling) return;
  polling = true;
  const wasLive = !FORCE_DEMO && api && api.connected;
  let ifaces, resource;
  if (wasLive) {
    try {
      [ifaces, resource] = await Promise.all([collectLive(api), collectResource(api)]);
      mode = 'live'; lastError = '';
    } catch (e) {
      lastError = e.message || String(e); api.close(); api = null; mode = 'demo'; ensureConnection();
    }
  }
  if (!ifaces) { if (!FORCE_DEMO) ensureConnection(); ifaces = demoSnapshot(); }
  if (!resource) { resource = demoResource(); if (!FORCE_DEMO && !(api && api.connected)) mode = 'demo'; }
  if (!FORCE_DEMO && !wasLive) mode = 'demo';

  const totalRx = ifaces.reduce((s, i) => s + i.rxBps, 0), totalTx = ifaces.reduce((s, i) => s + i.txBps, 0);
  const packet = {
    ts: Date.now(), mode, host: ROS.host, interval: INTERVAL,
    uptime: Math.floor((Date.now() - startedAt) / 1000), error: lastError,
    totalRx, totalTx, ifaces, resource,
  };
  history.push({ ts: packet.ts, rx: totalRx, tx: totalTx });
  if (history.length > HISTORY) history.shift();
  resourceHistory.push({ ts: packet.ts, cpu: num(resource['cpu-load']), free: num(resource['free-memory']), total: num(resource['total-memory']) });
  if (resourceHistory.length > HISTORY) resourceHistory.shift();
  const logTick = Math.floor(Date.now() / 1000 / 8);
  if (FORCE_DEMO && logTick !== demoLogTick) {
    demoLogTick = logTick;
    const row = makeLog(Date.now()); row['.id'] = '*L' + (++serverLogSeq);
    demoDB.logs.unshift(row);
    if (demoDB.logs.length > 200) demoDB.logs.pop();
  }
  lastPacket = packet;
  broadcast(packet);
  polling = false;
}
let demoLogTick = -1;
let serverLogSeq = 1000;

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
function broadcast(obj) { const text = JSON.stringify(obj); for (const c of clients) sendFrame(c, text); }
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

/* 可选的 HTTP Basic 认证：设置 WEB_USER / WEB_PASSWORD 后开启，未设置则保持免登录 */
const WEB_USER = process.env.WEB_USER || '';
const WEB_PASSWORD = process.env.WEB_PASSWORD || '';
function authorized(req) {
  if (!WEB_USER || !WEB_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!/^Basic\s+/i.test(header)) return false;
  try { return Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8') === WEB_USER + ':' + WEB_PASSWORD; }
  catch (e) { return false; }
}
function deny(res) {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="RouterOS Control Center"', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Unauthorized');
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return deny(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (p === '/api/status') return json(res, 200, {
    mode, host: ROS.host, port: ROS.port, tls: ROS.tls, interval: INTERVAL,
    connected: !!(api && api.connected), clients: clients.size,
    uptime: Math.floor((Date.now() - startedAt) / 1000), error: lastError,
    points: history.length, forceDemo: FORCE_DEMO, user: ROS.user,
  });
  if (p === '/api/schema') return json(res, 200, { groups: GROUPS, sections: SECTIONS });
  if (p === '/api/snapshot') return json(res, 200, lastPacket ? { ...lastPacket, history, resourceHistory } : { ifaces: [], history, resourceHistory });
  if (p === '/api/history') return json(res, 200, { points: history, resource: resourceHistory });

  if (p === '/api/settings' && req.method === 'GET') return json(res, 200, publicSettings());

  if (p === '/api/settings/test' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const host = b.host !== undefined ? b.host : ROS.host;
      const port = b.port !== undefined ? b.port : ROS.port;
      const user = b.user !== undefined ? b.user : ROS.user;
      const password = b.password ? b.password : ROS.password;
      const tls = b.tls !== undefined ? !!b.tls : ROS.tls;
      if (!validHost(host)) throw new Error('地址格式不正确');
      if (!validPort(port)) throw new Error('端口必须在 1-65535 之间');
      if (!user || typeof user !== 'string') throw new Error('账号不能为空');
      const client = new RouterOSAPI({ host, port: Number(port), user, password: String(password), tls, reconnectMs: 2000 });
      let check;
      try { await client.connect(); check = await client.exec(['/system/resource/print']); if (check.status.type === 'trap') throw new Error(check.status.message || '读取系统信息失败'); }
      finally { client.close(); }
      console.log(`[settings] test ok ${host}:${port} user=${user} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, version: (check.re[0] || {}).version || '' });
    } catch (e) { return json(res, 400, { error: e.message || String(e) }); }
  }

  if (p === '/api/settings' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      if (b.host !== undefined) { if (!validHost(b.host)) throw new Error('地址格式不正确'); ROS.host = String(b.host).trim(); }
      if (b.port !== undefined) { if (!validPort(b.port)) throw new Error('端口必须在 1-65535 之间'); ROS.port = Number(b.port); }
      if (b.user !== undefined) { if (!b.user || typeof b.user !== 'string') throw new Error('账号不能为空'); ROS.user = String(b.user).trim(); }
      if (b.password !== undefined && b.password !== '') ROS.password = String(b.password);
      if (b.tls !== undefined) ROS.tls = !!b.tls;
      if (b.demo !== undefined) FORCE_DEMO = !!b.demo;
      let restartRequired = false;
      if (b.webPort !== undefined) {
        if (!validPort(b.webPort)) throw new Error('WebUI 端口必须在 1-65535 之间');
        if (Number(b.webPort) !== PORT) { PORT = Number(b.webPort); restartRequired = true; }
      }
      if (!persistSettings()) throw new Error('设置已应用，但写入 data/settings.json 失败（请检查目录权限）');
      reconnectNow();
      console.log(`[settings] updated ${ROS.host}:${ROS.port} user=${ROS.user} demo=${FORCE_DEMO} webPort=${PORT} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, restartRequired, ...publicSettings() });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (p === '/api/config' && req.method === 'GET') {
    const sectionId = url.searchParams.get('section');
    const section = SECTION_MAP[sectionId];
    if (!section || !section.path) return json(res, 400, { error: '未知配置分类' });
    try { return json(res, 200, { rows: await rosPrint(section), demo: FORCE_DEMO || !(api && api.connected) }); }
    catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (p === '/api/config' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const section = SECTION_MAP[body.section];
      if (!section || !section.path) throw new Error('未知配置分类');
      if (!section.writable) throw new Error('该分类为只读');
      if (!['add', 'set', 'enable', 'disable', 'remove'].includes(body.action)) throw new Error('不支持的操作');
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 200) : [];
      if (['set', 'enable', 'disable', 'remove'].includes(body.action) && !ids.length) throw new Error('请至少选择一条记录');
      if (body.values && typeof body.values !== 'object') throw new Error('参数格式错误');
      const result = await rosWrite(section, body.action, { ids, values: body.values || {} });
      console.log(`[write] ${body.action} ${section.path} ids=${ids.join(',')} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (p === '/api/action' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const fn = SPECIAL[body.action];
      if (!fn) throw new Error('不支持的操作');
      const result = await fn(body.params || {});
      console.log(`[action] ${body.action} by=${req.socket.remoteAddress}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  let rel = decodeURIComponent(p);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  if (!authorized(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="RouterOS Control Center"\r\nContent-Length: 0\r\n\r\n');
    socket.destroy(); return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${wsAccept(key)}`, '\r\n'].join('\r\n'));
  socket.setNoDelay(true); clients.add(socket);
  socket.on('data', (b) => handleClientData(socket, b));
  const cleanup = () => clients.delete(socket);
  socket.on('close', cleanup); socket.on('error', cleanup);
  if (lastPacket) sendFrame(socket, JSON.stringify({ ...lastPacket, history, resourceHistory }));
});

server.listen(PORT, HOST, () => {
  console.log(`[ui] http://localhost:${PORT}`);
  console.log(FORCE_DEMO ? '[ui] DEMO_MODE=1' : `[ui] RouterOS ${ROS.host}:${ROS.port} user=${ROS.user}`);
});
ensureConnection(); poll();
setInterval(poll, INTERVAL);
process.on('SIGINT', () => { if (api) api.close(); server.close(() => process.exit(0)); });
