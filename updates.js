'use strict';
/* ROS Center 更新检查：GitHub Releases / Docker Hub 双源。
   支持自定义镜像源端点（endpoint）与服务端 HTTP CONNECT 代理（proxy），零第三方依赖。
   仅做「检查 / 下载」，不替换正在运行的自身进程或 Docker 容器 —— 那需要外部编排。 */
const net = require('net');
const tls = require('tls');
const zlib = require('zlib');
const { URL } = require('url');

const REPO = 'BackspaceM/ros-center';
const DEFAULT_CONFIG = {
  enabled: true,
  autoDownload: false,
  autoApply: false,
  source: 'github',
  intervalHours: 24,
  endpoint: '',
  proxy: '',
  image: 'backspacem/ros-center',
  tag: 'latest',
  channel: 'stable',
};

function normalizeConfig(input) {
  const b = input && typeof input === 'object' ? input : {};
  const str = (k, def) => String(b[k] === undefined ? def : b[k]).trim().slice(0, 400);
  const validUrl = (v) => {
    try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch (e) { return false; }
  };
  const source = ['github', 'dockerhub'].includes(str('source', 'github')) ? str('source', 'github') : 'github';
  const endpoint = str('endpoint', '');
  const proxy = str('proxy', '');
  if (endpoint && !validUrl(endpoint)) throw new Error('镜像源地址必须是 http(s) URL / Mirror endpoint must be an http(s) URL');
  if (proxy && (!validUrl(proxy) || new URL(proxy).protocol !== 'http:')) {
    throw new Error('代理仅支持 HTTP CONNECT 格式 http://[user:pass@]host:port');
  }
  return {
    enabled: !!b.enabled,
    autoDownload: !!b.autoDownload,
    autoApply: !!b.autoApply,
    source,
    intervalHours: Math.min(720, Math.max(1, Math.floor(Number(b.intervalHours) || 24))),
    endpoint,
    proxy,
    image: str('image', DEFAULT_CONFIG.image).replace(/[^A-Za-z0-9_.\-/]/g, '') || DEFAULT_CONFIG.image,
    tag: str('tag', 'latest').replace(/[^A-Za-z0-9_.\-]/g, '') || 'latest',
    channel: ['stable', 'all'].includes(str('channel', 'stable')) ? str('channel', 'stable') : 'stable',
  };
}

function maskProxy(proxy) {
  if (!proxy) return '';
  return proxy.replace(/(\/\/[^/@:]+):[^@]*@/, '$1:***@');
}
function safeEndpoint(url) {
  return String(url || '').replace(/(\/\/[^/@:]+):[^@]*@/, '$1:***@');
}
/* Node 22 的 net/tls 在多地址全部连接失败时会抛 AggregateError，
   其 message 常为空，直接显示就是「AggregateError」。展开成可操作信息。 */
function friendlyError(e, depth = 0) {
  if (!e) return '未知错误';
  if (depth > 3) return '网络请求失败';
  if ((typeof AggregateError !== 'undefined' && e instanceof AggregateError) || (Array.isArray(e.errors) && e.errors.length)) {
    const parts = (e.errors || []).map((x) => {
      if (!x) return '';
      const code = x.code ? String(x.code) : '';
      const msg = x.message ? String(x.message) : '';
      return (code + (code && msg ? ': ' : '') + msg).trim();
    }).filter(Boolean);
    const uniq = [...new Set(parts)];
    return '网络连接失败' + (uniq.length ? '（' + uniq.slice(0, 3).join('；') + '）' : '')
      + ' · 请检查网络，或配置代理 / 镜像源';
  }
  if (e.cause && e.cause !== e) return friendlyError(e.cause, depth + 1);
  return e.message || String(e);
}

/* ---------- 极简 HTTP/1.1 客户端：直连或 HTTP CONNECT 代理、重定向、chunked、gzip ---------- */
function parseHead(head) {
  const lines = head.split('\r\n');
  const status = Number((lines[0].match(/^HTTP\/\S+\s+(\d+)/) || [])[1] || 0);
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const k = lines[i].indexOf(':');
    if (k > 0) headers[lines[i].slice(0, k).trim().toLowerCase()] = lines[i].slice(k + 1).trim();
  }
  return { status, headers };
}
function dechunk(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    const nl = buf.indexOf('\r\n', p);
    if (nl < 0) break;
    const size = parseInt(buf.toString('latin1', p, nl).split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    p = nl + 2;
    if (p + size > buf.length) break;
    out.push(buf.subarray(p, p + size));
    p += size + 2;
  }
  return Buffer.concat(out);
}
function basicAuth(u) {
  if (!u.username) return '';
  return Buffer.from(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password)).toString('base64');
}

function rawGet(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('URL 格式不正确')); }
    if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('仅支持 http/https'));
    const isTls = u.protocol === 'https:';
    const port = Number(u.port) || (isTls ? 443 : 80);
    const target = (u.pathname || '/') + (u.search || '');
    let proxy = null;
    if (opts.proxy) {
      try { proxy = new URL(opts.proxy); } catch (e) { return reject(new Error('代理地址无效')); }
    }
    const timeout = opts.timeout || 15000;
    const maxBytes = opts.maxBytes || 64 * 1024 * 1024;
    let socket = null, active = null, settled = false;
    const timer = setTimeout(() => finish(new Error('请求超时 / request timeout')), timeout);
    function finish(err, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (active) active.destroy(); else if (socket) socket.destroy(); } catch (e) { /* ignore */ }
      const isAgg = typeof AggregateError !== 'undefined' && err instanceof AggregateError;
      err ? reject((err instanceof Error && !isAgg) ? err : new Error(friendlyError(err))) : resolve(val);
    }
    function send(stream, requestTarget) {
      const h = [
        `GET ${requestTarget} HTTP/1.1`, `Host: ${u.host}`,
        'User-Agent: ros-center-updater/1.0',
        'Accept: application/json, */*',
        'Accept-Encoding: identity', 'Connection: close',
      ];
      const auth = basicAuth(u);
      if (auth) h.push('Authorization: Basic ' + auth);
      h.push('', '');
      stream.write(h.join('\r\n'));
    }
    function collect(stream) {
      let buf = Buffer.alloc(0);
      let bodyStart = -1, total = 0, lastAt = 0, lastLoaded = 0;
      function report(done) {
        if (typeof opts.onProgress !== 'function' || bodyStart < 0) return;
        const loaded = Math.max(0, buf.length - bodyStart);
        const now = Date.now();
        if (!done && (now - lastAt < 100 || loaded - lastLoaded < 16 * 1024)) return;
        lastAt = now; lastLoaded = loaded;
        try {
          opts.onProgress({ loaded, total: total || loaded, percent: done ? 100 : (total > 0 ? Math.min(99, Math.round(loaded * 100 / total)) : -1), done: !!done });
        } catch (e) { /* 进度回调失败不影响下载 */ }
      }
      stream.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
        if (bodyStart < 0) {
          const i = buf.indexOf('\r\n\r\n');
          if (i >= 0) {
            bodyStart = i + 4;
            const head = parseHead(buf.toString('latin1', 0, i));
            total = Number(head.headers['content-length']) || 0;
          }
        }
        report(false);
        if (buf.length > maxBytes) finish(new Error('响应超过大小限制 / response too large'));
      });
      stream.on('end', () => {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return finish(new Error('HTTP 响应格式错误'));
        const { status, headers } = parseHead(buf.toString('latin1', 0, i));
        let body = buf.subarray(i + 4);
        report(true);
        if (/chunked/i.test(headers['transfer-encoding'] || '')) body = dechunk(body);
        if (/gzip/i.test(headers['content-encoding'] || '')) {
          try { body = zlib.gunzipSync(body); } catch (e) { return finish(new Error('响应解压失败')); }
        }
        finish(null, { status, headers, body, url: urlStr });
      });
      stream.on('error', (e) => finish(e));
    }

    if (!proxy) {
      active = isTls ? tls.connect({ host: u.hostname, port, servername: u.hostname }) : net.connect(port, u.hostname);
      active.once(isTls ? 'secureConnect' : 'connect', () => { collect(active); send(active, target); });
      active.on('error', (e) => finish(e));
      return;
    }
    socket = net.connect(Number(proxy.port) || 80, proxy.hostname);
    socket.on('error', (e) => finish(e));
    socket.once('connect', () => {
      const pAuth = proxy.username ? 'Proxy-Authorization: Basic ' + basicAuth(proxy) + '\r\n' : '';
      if (!isTls) { collect(socket); send(socket, urlStr); return; }
      socket.write(`CONNECT ${u.hostname}:${port} HTTP/1.1\r\nHost: ${u.hostname}:${port}\r\n${pAuth}\r\n`);
      let hs = Buffer.alloc(0);
      const onHandshake = (chunk) => {
        hs = Buffer.concat([hs, chunk]);
        const idx = hs.indexOf('\r\n\r\n');
        if (idx < 0) return;
        socket.removeListener('data', onHandshake);
        const first = hs.toString('latin1', 0, hs.indexOf('\r\n')).trim();
        if (!/^HTTP\/1\.[01] 200/.test(first)) return finish(new Error('代理拒绝 CONNECT: ' + first));
        const rest = hs.subarray(idx + 4);
        const ts = tls.connect({ socket, servername: u.hostname }, () => {
          collect(ts);
          send(ts, target);
          if (rest.length) ts.emit('data', rest);
        });
        ts.on('error', (e) => finish(e));
        active = ts;
      };
      socket.on('data', onHandshake);
    });
  });
}

async function httpGet(url, opts = {}, redirects = 4) {
  const r = await rawGet(url, opts);
  if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location && redirects > 0) {
    const next = new URL(r.headers.location, url).toString();
    return httpGet(next, opts, redirects - 1);
  }
  return r;
}
async function fetchJson(url, opts) {
  const r = await httpGet(url, opts);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`HTTP ${r.status} · ${r.body.toString('utf8').slice(0, 160)}`);
  }
  try { return JSON.parse(r.body.toString('utf8')); } catch (e) { throw new Error('返回内容不是 JSON'); }
}
async function downloadBinary(url, opts = {}) {
  const r = await httpGet(url, {
    proxy: opts.proxy, timeout: 180000, maxBytes: 200 * 1024 * 1024, onProgress: opts.onProgress,
  });
  if (r.status < 200 || r.status >= 300) throw new Error('下载失败 HTTP ' + r.status);
  return r.body;
}

/* ---------- 版本 / 元数据 ---------- */
function compareVersion(a, b) {
  const parts = (v) => String(v || '').trim().replace(/^v/i, '').split(/[.\-+_]/)
    .map((x) => (/^\d+$/.test(x) ? Number(x) : NaN));
  const A = parts(a), B = parts(b);
  if (!A.length || !B.length || A.some(Number.isNaN) || B.some(Number.isNaN)) return null;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
function endpointFor(cfg) {
  if (cfg.endpoint) return cfg.endpoint;
  if (cfg.source === 'dockerhub') {
    return `https://hub.docker.com/v2/repositories/${cfg.image}/tags/${encodeURIComponent(cfg.tag)}`;
  }
  return cfg.channel === 'all'
    ? `https://api.github.com/repos/${REPO}/releases?per_page=10`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
}
function parseGithub(data, cfg) {
  let item = Array.isArray(data)
    ? (cfg.channel === 'all' ? data.find((r) => r && !r.draft) : data.find((r) => r && !r.draft && !r.prerelease)) || data[0]
    : data;
  if (!item || typeof item !== 'object') throw new Error('GitHub 返回数据格式异常');
  const assets = Array.isArray(item.assets) ? item.assets.map((a) => ({
    name: String(a.name || ''), size: Number(a.size) || 0, url: String(a.browser_download_url || ''),
  })) : [];
  return {
    version: String(item.tag_name || item.name || ''),
    publishedAt: item.published_at || item.created_at || '',
    url: String(item.html_url || ''),
    notes: String(item.body || '').slice(0, 4000),
    digest: '',
    assets,
  };
}
function parseDockerHub(data, cfg) {
  if (!data || typeof data !== 'object') throw new Error('Docker Hub 返回数据格式异常');
  return {
    version: String(data.name || cfg.tag),
    digest: String(data.digest || ''),
    publishedAt: String(data.last_updated || data.tag_last_pushed || ''),
    url: `https://hub.docker.com/r/${cfg.image}/tags?name=${encodeURIComponent(cfg.tag)}`,
    notes: '',
    assets: [],
  };
}
/* 按当前运行平台挑选一个安装包资产，供自动下载 */
function chooseAsset(latest, platform = process.platform, arch = process.arch) {
  const list = (latest && latest.assets) || [];
  if (!list.length) return null;
  const mac = platform === 'darwin' ? (arch === 'arm64' ? 'macos-arm64' : 'macos-x64') : '';
  const win = platform === 'win32' ? 'windows-x64-setup' : '';
  const key = mac || win;
  if (!key) return null;
  const wanted = platform === 'win32' ? /\.exe$/i : /\.pkg$/i;
  return list.find((a) => a.name.includes(key) && wanted.test(a.name) && a.url) || null;
}
/* 桌面「应用内更新包」（仅源码，几百 KB）及其校验和资产 */
function chooseAppBundle(latest) {
  const list = (latest && latest.assets) || [];
  const zip = list.find((a) => /^ros-center-app-[A-Za-z0-9_.\-]+\.zip$/i.test(a.name) && a.url);
  if (!zip) return null;
  return { zip, checksum: list.find((a) => a.name === zip.name + '.sha256' && a.url) || null };
}

async function check(cfg, current = {}, previous = {}) {
  const opts = { proxy: cfg.proxy, timeout: 15000 };
  const endpoint = endpointFor(cfg);
  const data = await fetchJson(endpoint, opts);
  let latest, hasUpdate, reason;
  if (cfg.source === 'dockerhub') {
    latest = parseDockerHub(data, cfg);
    if (current.digest && latest.digest) {
      hasUpdate = current.digest !== latest.digest;
      reason = hasUpdate ? 'new-digest' : 'same-digest';
    } else if (previous.lastUpdated && latest.publishedAt) {
      hasUpdate = previous.lastUpdated !== latest.publishedAt;
      reason = hasUpdate ? 'new-build' : 'same-build';
    } else {
      hasUpdate = false;
      reason = 'unknown-current';   // 未提供当前 digest，无法判定，只记录本次基线
    }
  } else {
    latest = parseGithub(data, cfg);
    const cmp = compareVersion(latest.version, current.version);
    hasUpdate = cmp === null ? false : cmp > 0;
    reason = cmp === null ? 'unparsable-version' : (hasUpdate ? 'new-version' : 'up-to-date');
  }
  return {
    ok: true, checkedAt: new Date().toISOString(),
    source: cfg.source, endpoint: safeEndpoint(endpoint),
    current, latest, hasUpdate, reason,
    proxyUsed: !!cfg.proxy,
  };
}

module.exports = {
  REPO, DEFAULT_CONFIG, normalizeConfig, maskProxy, safeEndpoint, friendlyError,
  httpGet, fetchJson, downloadBinary, compareVersion, endpointFor,
  parseGithub, parseDockerHub, chooseAsset, chooseAppBundle, check,
};
