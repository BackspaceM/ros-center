'use strict';
/* ROS Center 自更新引擎（零第三方依赖）
   A) Docker：经 /var/run/docker.sock 调用 Engine API，pull 新镜像后用原配置重建容器。
      主容器不自杀，改为创建一次性 helper 容器（复用新镜像）完成 stop → remove → create → start，
      避免请求中断；数据目录未挂载到宿主机时拒绝执行，防止删容器丢数据。
   B) 桌面：下载轻量 app bundle（仅 JS 源码），校验 SHA256 + 逐文件 manifest，
      解压到 staging 后写 pending 标记并让主进程以退出码 75 退出，由 launcher.js
      在进程已退出、文件句柄已释放时替换 app/ 并自动重启（失败自动回滚）。
   本文件同时被 server.js、launcher.js、helper 容器使用。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const DOCKER_SOCKET = process.env.ROS_DOCKER_SOCKET || '/var/run/docker.sock';
const APP_UPDATE_PENDING = 'app-update-pending.json';
const APP_UPDATE_RESULT = 'app-update-result.json';
const DOCKER_UPDATE_PENDING = 'docker-update-pending.json';
const DOCKER_UPDATE_RESULT = 'docker-update-result.json';
const RESTART_CODE = 75;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function pruneUndefined(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* ============ 纯 Node ZIP 解压（store / deflate，local header + central directory） ============ */
function unzipTo(buf, destDir, opts = {}) {
  const maxFiles = opts.maxFiles || 600;
  const maxTotal = opts.maxTotal || 40 * 1024 * 1024;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 结构无效（未找到 EOCD）');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > maxFiles) throw new Error('ZIP 文件数超过限制');
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP 中央目录损坏');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    /* 路径白名单：只允许相对路径、禁止 .. / 反斜杠 / 盘符 / 控制字符 */
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') ||
        name.split('/').some((s) => s === '..' || s === '.' ) || /[\0-\x1f]/.test(name)) {
      throw new Error('ZIP 包含非法路径: ' + name);
    }
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP 本地头损坏: ' + name);
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('不支持的 ZIP 压缩方式: ' + method);
    if (data.length !== usize) throw new Error('ZIP 文件大小不匹配: ' + name);
    total += data.length;
    if (total > maxTotal) throw new Error('ZIP 解压后体积超过限制');
    const dest = path.join(destDir, name);
    if (!path.resolve(dest).startsWith(path.resolve(destDir) + path.sep)) throw new Error('ZIP 路径越界: ' + name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    out.push({ name, size: data.length, sha256: sha256(data) });
  }
  return out;
}

/* ==================== Docker Engine API over Unix socket ==================== */
let dockerApiVersion = '';
function dockerRequest(method, apiPath, o = {}) {
  return new Promise((resolve, reject) => {
    const payload = o.body === undefined ? null : Buffer.from(JSON.stringify(o.body));
    const v = dockerApiVersion || '1.41';
    const req = http.request({
      socketPath: o.socket || DOCKER_SOCKET,
      path: '/v' + v + apiPath,
      method,
      headers: pruneUndefined({
        Host: 'docker',
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : undefined,
        'X-Registry-Auth': o.registryAuth || undefined,
      }),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString('utf8')); } catch (e) { /* NDJSON 流等 */ }
        resolve({ status: res.statusCode, raw, json, text: raw.toString('utf8') });
      });
    });
    req.setTimeout(o.timeout || 60000, () => req.destroy(new Error('Docker API 请求超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function assertOk(r, what) {
  if (r.status >= 400) {
    const msg = (r.json && (r.json.message || r.json.error)) || r.text.slice(0, 240);
    throw new Error(`${what} 失败 (HTTP ${r.status}): ${msg}`);
  }
  return r;
}

function selfContainerId() {
  const explicit = String(process.env.ROS_DOCKER_CONTAINER || '').trim();
  if (explicit) return explicit;
  const host = os.hostname();
  if (/^[0-9a-f]{12,64}$/i.test(host)) return host;
  try {
    const cg = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const m = cg.match(/(?:docker|cri-containerd|kubepods)[-/]([0-9a-f]{64})/i)
      || cg.match(/([0-9a-f]{64})(?:\.scope)?$/im);
    if (m) return m[1];
  } catch (e) { /* non-linux */ }
  return host;
}

async function dockerCapabilities() {
  const base = { available: false, socket: DOCKER_SOCKET, runtime: 'docker' };
  try { fs.accessSync(DOCKER_SOCKET, fs.constants.R_OK | fs.constants.W_OK); }
  catch (e) { return { ...base, reason: '未检测到可写的 ' + DOCKER_SOCKET + '（需在 compose 中映射 Docker socket）' }; }
  try {
    const ver = assertOk(await dockerRequest('GET', '/version', { timeout: 10000 }), '连接 Docker');
    dockerApiVersion = String((ver.json && ver.json.ApiVersion) || '1.41');
    const id = selfContainerId();
    let ins = await dockerRequest('GET', '/containers/' + encodeURIComponent(id) + '/json', { timeout: 10000 });
    if (ins.status === 404) {
      const list = assertOk(await dockerRequest('GET', '/containers/json?all=1', { timeout: 10000 }), '列举容器');
      const hit = (list.json || []).find((c) => (c.Id || '').startsWith(id) || (c.Names || []).includes('/' + id));
      if (!hit) return { ...base, reason: '无法定位当前容器，请设置 ROS_DOCKER_CONTAINER=<容器名或ID>' };
      ins = await dockerRequest('GET', '/containers/' + hit.Id + '/json', { timeout: 10000 });
    }
    assertOk(ins, '读取容器配置');
    const d = ins.json;
    const name = String(d.Name || '').replace(/^\//, '');
    const mounts = Array.isArray(d.Mounts) ? d.Mounts : [];
    const binds = (d.HostConfig && d.HostConfig.Binds) || [];
    const dataMounted = mounts.some((m) => m.Destination === '/app/data' && (m.Type === 'bind' || m.Type === 'volume'))
      || binds.some((b) => /(?:^|:)\/app\/data(?::|$)/.test(String(b)));
    return {
      available: true, socket: DOCKER_SOCKET, apiVersion: dockerApiVersion,
      containerId: d.Id, containerName: name,
      image: String((d.Config && d.Config.Image) || d.Image || ''),
      imageId: String(d.Image || ''),
      dataMounted, dataMount: (mounts.find((m) => m.Destination === '/app/data') || {}).Source || '',
      restartPolicy: (d.HostConfig && d.HostConfig.RestartPolicy && d.HostConfig.RestartPolicy.Name) || '',
      reason: dataMounted ? '' : '数据目录 /app/data 未挂载到宿主机，自动重建会丢失配置，请先添加 volume 映射',
      canAutoUpdate: dataMounted,
    };
  } catch (e) { return { ...base, reason: e.message }; }
}

function splitImageRef(ref) {
  const last = ref.lastIndexOf(':');
  const at = ref.lastIndexOf('@');
  if (at > last) return { repo: ref.slice(0, at), tag: '', digest: ref.slice(at + 1) };
  if (last > ref.lastIndexOf('/')) return { repo: ref.slice(0, last), tag: ref.slice(last + 1), digest: '' };
  return { repo: ref, tag: 'latest', digest: '' };
}

/* 由 inspect 结果构造 create 请求体：只保留可复用的配置，剔除身份类字段 */
function containerConfig(inspect, imageRef, opts = {}) {
  const c = inspect.Config || {}, hc = inspect.HostConfig || {};
  const binds = Array.isArray(hc.Binds) ? hc.Binds.slice() : [];
  for (const m of (inspect.Mounts || [])) {
    if ((m.Type === 'bind' || m.Type === 'volume') && m.Source && m.Destination) {
      const spec = `${m.Source}:${m.Destination}:${m.RW === false ? 'ro' : 'rw'}${m.Propagation ? ':' + m.Propagation : ''}`;
      if (!binds.some((b) => String(b).startsWith(m.Source + ':' + m.Destination))) binds.push(spec);
    }
  }
  /* 新容器不应继承旧容器 ID 形态的 hostname（默认 hostname 就是容器短 ID） */
  const hostname = c.Hostname && !/^[0-9a-f]{12,64}$/i.test(c.Hostname) ? c.Hostname : undefined;
  const env = (c.Env || []).slice();
  const setEnv = (key, value) => {
    if (!value) return;
    const i = env.findIndex((e) => String(e).startsWith(key + '='));
    if (i >= 0) env[i] = key + '=' + value; else env.push(key + '=' + value);
  };
  if (opts.digest) setEnv('ROS_CENTER_DIGEST', opts.digest);
  if (opts.version) setEnv('ROS_CENTER_VERSION', opts.version);

  const host = pruneUndefined({
    Binds: binds.length ? binds : undefined,
    PortBindings: hc.PortBindings || undefined,
    RestartPolicy: hc.RestartPolicy && hc.RestartPolicy.Name ? hc.RestartPolicy : { Name: 'unless-stopped' },
    NetworkMode: hc.NetworkMode || 'default',
    Dns: hc.Dns, DnsSearch: hc.DnsSearch, DnsOptions: hc.DnsOptions, ExtraHosts: hc.ExtraHosts,
    Privileged: hc.Privileged, CapAdd: hc.CapAdd, CapDrop: hc.CapDrop, Devices: hc.Devices,
    LogConfig: hc.LogConfig, ReadonlyRootfs: hc.ReadonlyRootfs, ShmSize: hc.ShmSize,
    Memory: hc.Memory, MemorySwap: hc.MemorySwap, NanoCpus: hc.NanoCpus,
    SecurityOpt: hc.SecurityOpt, GroupAdd: hc.GroupAdd, UsernsMode: hc.UsernsMode,
    Tmpfs: hc.Tmpfs, Sysctls: hc.Sysctls, PidMode: hc.PidMode,
  });
  const cfg = pruneUndefined({
    Image: imageRef,
    Hostname: hostname,
    Domainname: c.Domainname || undefined,
    User: c.User || undefined,
    Env: env.length ? env : undefined,
    Cmd: c.Cmd,
    Entrypoint: c.Entrypoint,
    WorkingDir: c.WorkingDir || undefined,
    Labels: c.Labels || undefined,
    ExposedPorts: c.ExposedPorts || undefined,
    Tty: c.Tty, OpenStdin: c.OpenStdin, StdinOnce: c.StdinOnce,
    Healthcheck: c.Healthcheck,
    StopSignal: c.StopSignal,
    StopTimeout: c.StopTimeout,
    HostConfig: host,
  });
  /* 保留自定义网络的别名（默认 bridge 的 alias 无需复制） */
  const nets = inspect.NetworkSettings && inspect.NetworkSettings.Networks;
  if (nets) {
    const ec = {};
    for (const [n, v] of Object.entries(nets)) {
      if (n === 'bridge' || n === 'host' || n === 'none') continue;
      if (v && Array.isArray(v.Aliases) && v.Aliases.length) ec[n] = { Aliases: v.Aliases };
    }
    if (Object.keys(ec).length) cfg.NetworkingConfig = { EndpointsConfig: ec };
  }
  return cfg;
}

async function dockerPull(repo, tag, onProgress) {
  const q = `?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag || 'latest')}`;
  const auth = String(process.env.DOCKER_REGISTRY_AUTH || '').trim();
  if (onProgress) onProgress('pull', `正在拉取 ${repo}:${tag || 'latest'}`);
  const r = await dockerRequest('POST', '/images/create' + q, {
    timeout: 600000, registryAuth: auth || undefined,
  });
  assertOk(r, '拉取镜像');
  /* NDJSON 进度里若包含 error 需抛出 */
  for (const line of r.text.split('\n')) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j.error) throw new Error('拉取镜像失败: ' + j.error); } catch (e) {
      if (e.message.startsWith('拉取镜像失败')) throw e;
    }
  }
  return true;
}

/* 主容器：准备重建计划 → 创建 helper 容器 → 由 helper 完成切换 */
async function dockerApply(o = {}) {
  const dataDir = o.dataDir;
  const cap = await dockerCapabilities();
  if (!cap.available) throw new Error(cap.reason || 'Docker socket 不可用');
  if (!cap.dataMounted) throw new Error(cap.reason);
  if (!cap.containerName) throw new Error('无法确定容器名称');
  const repo = o.image || cap.image || '';
  const parts = splitImageRef(repo);
  const targetRepo = o.repo || parts.repo;
  const targetTag = o.tag || parts.tag || 'latest';
  if (!targetRepo) throw new Error('未指定镜像仓库');
  const say = o.onProgress || (() => {});
  await dockerPull(targetRepo, targetTag, say);

  const ins = assertOk(await dockerRequest('GET', '/containers/' + cap.containerId + '/json'), '读取容器配置');
  const ref = `${targetRepo}:${targetTag}`;
  /* 用刚 pull 下来的镜像 ID 固定引用，避免 tag 在切换过程中漂移 */
  const imgInfo = await dockerRequest('GET', '/images/' + encodeURIComponent(ref) + '/json');
  const imageId = imgInfo.status === 200 && imgInfo.json ? imgInfo.json.Id : ref;
  const newDigest = (imgInfo.status === 200 && imgInfo.json && imgInfo.json.RepoDigests && imgInfo.json.RepoDigests[0])
    ? String(imgInfo.json.RepoDigests[0]).split('@')[1] : '';
  const cfg = containerConfig(ins.json, imageId, { digest: newDigest, version: o.version });
  const plan = {
    createdAt: new Date().toISOString(),
    name: cap.containerName, oldId: cap.containerId,
    /* 回滚必须用容器创建时的镜像 ID：tag 在 pull 之后已经指向新镜像了 */
    oldImageRef: String(ins.json.Image || '') || String((ins.json.Config && ins.json.Config.Image) || cap.image || ref),
    oldImageTag: String((ins.json.Config && ins.json.Config.Image) || cap.image || ref),
    newImageRef: imageId, newDigest, version: o.version || '',
    config: cfg, socket: DOCKER_SOCKET,
  };
  const pendingFile = path.join(dataDir, DOCKER_UPDATE_PENDING);
  writeJson(pendingFile, plan);
  /* 清掉上一次的结果，便于前端判断本次是否完成 */
  try { fs.rmSync(path.join(dataDir, DOCKER_UPDATE_RESULT), { force: true }); } catch (e) { /* ignore */ }
  say('prepare', '重建计划已生成，正在启动更新助手容器');

  const helperName = `ros-center-updater-${Date.now().toString(36)}`;
  const helperCfg = {
    Image: imageId,
    Entrypoint: [],
    Cmd: ['node', '/app/selfupdate.js', '--docker-helper'],
    WorkingDir: '/app',
    Env: [
      ...(plan.config.Env || []),
      'ROS_UPDATE_HELPER=1',
      'ROS_UPDATE_PENDING=' + pendingFile,
      'ROS_DOCKER_SOCKET=' + DOCKER_SOCKET,
    ],
    HostConfig: {
      Binds: (plan.config.HostConfig && plan.config.HostConfig.Binds) || [],
      AutoRemove: true,
      RestartPolicy: { Name: 'no' },
      NetworkMode: 'none',
    },
    Labels: { 'ros-center.updater': '1' },
  };
  const created = await dockerRequest('POST', '/containers/create?name=' + encodeURIComponent(helperName), { body: helperCfg, timeout: 60000 });
  assertOk(created, '创建更新助手容器');
  const started = await dockerRequest('POST', '/containers/' + created.json.Id + '/start', { timeout: 30000 });
  assertOk(started, '启动更新助手容器');
  say('switch', '助手容器已接管，即将重建并短暂中断服务');
  return { started: true, helperId: created.json.Id, helperName, containerName: cap.containerName, image: ref, version: o.version || '' };
}

async function dockerHelperRun() {
  const pendingFile = process.env.ROS_UPDATE_PENDING || '/app/data/' + DOCKER_UPDATE_PENDING;
  const resultFile = path.join(path.dirname(pendingFile), DOCKER_UPDATE_RESULT);
  const plan = readJson(pendingFile, null);
  if (!plan) { console.error('[updater] no pending plan'); return; }
  const log = [];
  const note = (s) => { log.push(new Date().toISOString() + ' ' + s); console.log('[updater]', s); };
  await sleep(3500);   /* 让主容器把 HTTP 响应发回浏览器 */
  let result;
  try {
    note('stopping old container ' + plan.oldId);
    const stop = await dockerRequest('POST', `/containers/${plan.oldId}/stop?t=15`, { timeout: 60000 });
    if (stop.status >= 400 && stop.status !== 304 && stop.status !== 404) assertOk(stop, '停止旧容器');
    note('removing old container');
    const rm = await dockerRequest('DELETE', `/containers/${plan.oldId}?force=1`, { timeout: 60000 });
    if (rm.status !== 204 && rm.status !== 404) assertOk(rm, '删除旧容器');
    note('creating new container ' + plan.name);
    const create = await dockerRequest('POST', '/containers/create?name=' + encodeURIComponent(plan.name), { body: plan.config, timeout: 60000 });
    assertOk(create, '创建新容器');
    note('starting new container ' + create.json.Id);
    const start = await dockerRequest('POST', `/containers/${create.json.Id}/start`, { timeout: 60000 });
    assertOk(start, '启动新容器');
    result = { ok: true, finishedAt: new Date().toISOString(), version: plan.version, image: plan.newImageRef, log };
    note('done');
  } catch (e) {
    note('FAILED: ' + e.message);
    let rolledBack = false, rollbackError = '';
    try {
      /* 先用旧镜像 ID（精确）；若旧镜像已被清理，再用 tag 兜底 */
      for (const imageRef of [plan.oldImageRef, plan.oldImageTag].filter(Boolean)) {
        const cfg = { ...plan.config, Image: imageRef };
        const c = await dockerRequest('POST', '/containers/create?name=' + encodeURIComponent(plan.name), { body: cfg, timeout: 60000 });
        if (c.status >= 400 || !c.json || !c.json.Id) { rollbackError = c.text; note('rollback create failed with ' + imageRef); continue; }
        const s = await dockerRequest('POST', `/containers/${c.json.Id}/start`, { timeout: 60000 });
        if (s.status < 400) { rolledBack = true; break; }
        rollbackError = s.text;
        note('rollback start failed with ' + imageRef);
      }
      note('rolled back to previous image: ' + rolledBack);
    } catch (e2) { rollbackError = e2.message; note('rollback failed: ' + e2.message); }
    result = { ok: false, finishedAt: new Date().toISOString(), error: e.message, rolledBack, rollbackError, log };
  }
  writeJson(resultFile, result);
  try { fs.rmSync(pendingFile, { force: true }); } catch (e) { /* ignore */ }
}

/* ==================== 桌面：应用内替换 app/ ==================== */
const BUNDLE_WHITELIST = /^(server\.js|catalog\.js|updates\.js|quicksetup\.js|selfupdate\.js|launcher\.js|package\.json|version\.json|manifest\.json|public\/[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)*)$/;

function desktopCapabilities(o = {}) {
  const appDir = o.appDir || __dirname;
  const dataDir = o.dataDir || path.join(path.dirname(appDir), 'data');
  const launcher = path.join(appDir, 'launcher.js');
  const isDesktop = o.desktop !== undefined ? o.desktop : (!!process.env.ROS_DESKTOP || process.env.ROS_DESKTOP === '1');
  const hasLauncher = fs.existsSync(launcher);
  let writable = false;
  try { fs.accessSync(appDir, fs.constants.W_OK); writable = true; } catch (e) { /* read-only install dir */ }
  let bundled = false;
  try { bundled = fs.existsSync(path.join(appDir, 'version.json')); } catch (e) { /* ignore */ }
  const available = !!(isDesktop && hasLauncher && writable && process.env.ROS_LAUNCHER === '1');
  let reason = '';
  if (!isDesktop) reason = '当前不是桌面版运行方式';
  else if (!hasLauncher) reason = '该版本缺少更新监管进程（launcher.js），请重新安装一次最新安装包，之后即可永久免重装更新';
  else if (!process.env.ROS_LAUNCHER) reason = '未通过 launcher.js 启动（直接运行 server.js 无法自动重启）';
  else if (!writable) reason = '应用目录不可写，请以管理员身份运行或改用绿色版';
  return {
    available, appDir, dataDir, desktop: isDesktop, launcher: hasLauncher,
    launchedByLauncher: process.env.ROS_LAUNCHER === '1', writable, bundled,
    reason, restartCode: RESTART_CODE,
  };
}

/* 下载并校验 bundle → 解压到 staging → 写 pending（主进程随后 exit(75)） */
function stageDesktopBundle(buf, o = {}) {
  const dataDir = o.dataDir;
  const appDir = o.appDir || __dirname;
  const expected = String(o.expectedSha256 || '').trim().toLowerCase();
  const actual = sha256(buf);
  if (expected) {
    const hex = expected.split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('校验和格式不正确');
    if (hex !== actual) throw new Error('更新包 SHA256 校验失败，已取消更新');
  }
  const stagingRoot = path.join(dataDir, 'updates', 'staging-' + Date.now().toString(36));
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });
  let files;
  try { files = unzipTo(buf, stagingRoot); }
  catch (e) { fs.rmSync(stagingRoot, { recursive: true, force: true }); throw e; }
  const bad = files.filter((f) => !BUNDLE_WHITELIST.test(f.name));
  if (bad.length) { fs.rmSync(stagingRoot, { recursive: true, force: true }); throw new Error('更新包包含非预期文件: ' + bad[0].name); }
  const manifest = readJson(path.join(stagingRoot, 'manifest.json'), null);
  if (!manifest || !manifest.version) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw new Error('更新包缺少 manifest.json');
  }
  for (const f of files) {
    if (f.name === 'manifest.json') continue;
    const want = manifest.files && manifest.files[f.name];
    if (want && want !== f.sha256) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      throw new Error('更新包文件校验失败: ' + f.name);
    }
  }
  /* 必备文件检查，避免半个包把服务起不来 */
  for (const must of ['server.js', 'launcher.js', 'package.json']) {
    if (!fs.existsSync(path.join(stagingRoot, must))) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      throw new Error('更新包缺少 ' + must);
    }
  }
  const pending = {
    createdAt: new Date().toISOString(), appDir, stagingRoot,
    version: String(manifest.version), tag: String(manifest.tag || ''),
    sha256: actual, files: files.length,
    requestedVersion: o.version || '',
  };
  writeJson(path.join(dataDir, APP_UPDATE_PENDING), pending);
  try { fs.rmSync(path.join(dataDir, APP_UPDATE_RESULT), { force: true }); } catch (e) { /* ignore */ }
  return pending;
}

/* launcher 专用：进程已退出时替换 app/，带备份 */
function applyDesktopPending(o = {}) {
  const dataDir = o.dataDir;
  const pendingFile = path.join(dataDir, APP_UPDATE_PENDING);
  const pending = readJson(pendingFile, null);
  if (!pending) return { ok: true, applied: false };
  const resultFile = path.join(dataDir, APP_UPDATE_RESULT);
  const appDir = pending.appDir || o.appDir || __dirname;
  const staging = pending.stagingRoot;
  if (!fs.existsSync(staging) || !fs.existsSync(path.join(staging, 'server.js'))) {
    writeJson(resultFile, { ok: false, verified: false, error: 'staging 目录不存在或内容不完整', version: pending.version });
    fs.rmSync(pendingFile, { force: true });
    return { ok: false, applied: false, error: 'staging 不完整' };
  }
  const backupRoot = path.join(dataDir, 'app-backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  const backup = path.join(backupRoot, 'app-' + Date.now().toString(36));
  try {
    fs.renameSync(appDir, backup);
    fs.renameSync(staging, appDir);
    writeJson(resultFile, {
      ok: true, verified: false, applied: true, version: pending.version, tag: pending.tag,
      sha256: pending.sha256, backupDir: backup, at: new Date().toISOString(),
    });
    fs.rmSync(pendingFile, { force: true });
    console.log('[launcher] app updated to', pending.version, '| backup:', backup);
    return { ok: true, applied: true, version: pending.version, backupDir: backup };
  } catch (e) {
    /* 尽量恢复原目录 */
    try {
      if (!fs.existsSync(appDir) && fs.existsSync(backup)) fs.renameSync(backup, appDir);
    } catch (e2) { console.error('[launcher] restore failed:', e2.message); }
    writeJson(resultFile, { ok: false, verified: false, error: e.message, version: pending.version });
    fs.rmSync(pendingFile, { force: true });
    console.error('[launcher] update failed:', e.message);
    return { ok: false, applied: false, error: e.message };
  }
}

/* launcher 专用：新版本崩溃时回滚到备份 */
function rollbackDesktop(o = {}) {
  const dataDir = o.dataDir;
  const resultFile = path.join(dataDir, APP_UPDATE_RESULT);
  const r = readJson(resultFile, null);
  if (!r || !r.ok || r.verified || !r.backupDir || !fs.existsSync(r.backupDir)) return false;
  const appDir = o.appDir || __dirname;
  try {
    const broken = path.join(dataDir, 'app-backups', 'broken-' + Date.now().toString(36));
    if (fs.existsSync(appDir)) fs.renameSync(appDir, broken);
    fs.renameSync(r.backupDir, appDir);
    r.rolledBack = true; r.rollbackAt = new Date().toISOString();
    writeJson(resultFile, r);
    console.warn('[launcher] rolled back to previous app after startup failure');
    return true;
  } catch (e) { console.error('[launcher] rollback error:', e.message); return false; }
}

/* 新 server 启动成功后确认版本，避免 launcher 误判为崩溃回滚 */
function markDesktopVerified(o = {}) {
  const resultFile = path.join(o.dataDir, APP_UPDATE_RESULT);
  const r = readJson(resultFile, null);
  if (!r || !r.ok || r.verified) return false;
  r.verified = true; r.verifiedAt = new Date().toISOString();
  writeJson(resultFile, r);
  return true;
}

module.exports = {
  DOCKER_SOCKET, RESTART_CODE, APP_UPDATE_PENDING, APP_UPDATE_RESULT,
  DOCKER_UPDATE_PENDING, DOCKER_UPDATE_RESULT,
  sha256, sleep, readJson, writeJson, unzipTo, BUNDLE_WHITELIST,
  dockerRequest, dockerCapabilities, splitImageRef, containerConfig, dockerPull, dockerApply, dockerHelperRun,
  desktopCapabilities, stageDesktopBundle, applyDesktopPending, rollbackDesktop, markDesktopVerified,
};

/* helper 容器入口：node /app/selfupdate.js --docker-helper */
if (require.main === module && process.argv.includes('--docker-helper')) {
  dockerHelperRun().then(() => process.exit(0)).catch((e) => {
    console.error('[updater] fatal:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
