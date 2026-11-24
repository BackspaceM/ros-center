'use strict';
/* 检查更新 / 自动更新设置页（含 Docker / 桌面版应用内自动更新） */
(function () {
  const MARK_KEY = 'ros-self-updating';
  function fmtTime(s) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }
  function fmtSize(n) {
    const v = Number(n) || 0;
    return v > 1024 * 1024 ? (v / 1024 / 1024).toFixed(1) + ' MB' : (v / 1024).toFixed(0) + ' KB';
  }
  function badge(text, kind) {
    return `<span class="upd-badge ${kind || ''}">${esc(text)}</span>`;
  }
  function paint(d) {
    window.__updCache = d;
    const s = d.status || {}, cfg = d.config || {}, rt = d.runtime || {};
    const box = $('updStatus');
    if (!box) return;
    let stateHtml;
    if (!s.checkedAt) {
      stateHtml = `<div class="upd-state empty">${esc(L('尚未检查，点击右上角「立即检查」。', 'No check yet — click "Check now".'))}</div>`;
    } else if (!s.ok) {
      stateHtml = `<div class="upd-state bad">${badge(L('检查失败', 'Check failed'), 'bad')}
        <div class="upd-err">${esc(s.error || '')}</div>
        <div class="topo-hint">${esc(L('若为网络不通，请填写下方代理或镜像源后重试。', 'If the network is blocked, set a proxy or mirror endpoint below.'))}</div></div>`;
    } else if (s.hasUpdate) {
      stateHtml = `<div class="upd-state new">${badge(L('发现新版本', 'Update available'), 'new')}
        <div class="upd-big">${esc((s.latest && s.latest.version) || '')}</div>
        <div class="topo-hint">${esc(L('发布于', 'Published'))} ${esc(fmtTime(s.latest && s.latest.publishedAt))} · ${esc(L('检测原因', 'reason'))} ${esc(s.reason || '')}</div></div>`;
    } else {
      stateHtml = `<div class="upd-state ok">${badge(L('已是最新', 'Up to date'), 'ok')}
        <div class="topo-hint">${esc(L('最新版本', 'Latest'))} ${esc((s.latest && s.latest.version) || '—')} · ${esc(s.reason || '')}</div></div>`;
    }
    box.innerHTML = `
      <div class="upd-meta">
        <div><small>${esc(L('当前版本', 'Current version'))}</small><b>${esc(rt.version || '—')}</b></div>
        <div><small>${esc(L('运行方式', 'Runtime'))}</small><b>${esc({ desktop: L('桌面版', 'Desktop'), docker: 'Docker', source: L('源码', 'Source') }[rt.runtime] || rt.runtime || '—')}</b></div>
        <div><small>${esc(L('检测源', 'Source'))}</small><b>${esc(s.source === 'dockerhub' ? 'Docker Hub' : 'GitHub Releases')}</b></div>
        <div><small>${esc(L('上次检查', 'Last check'))}</small><b>${esc(fmtTime(s.checkedAt))}</b></div>
      </div>
      ${stateHtml}
      <div class="topo-hint" style="margin-top:8px;word-break:break-all">${esc(L('请求地址', 'Endpoint'))}: ${esc(s.endpoint || (cfg.endpoint || (cfg.source === 'dockerhub' ? 'https://hub.docker.com/v2/...' : 'https://api.github.com/repos/BackspaceM/ros-center/releases/latest')))}
        ${s.proxyUsed ? ' · ' + esc(L('经代理', 'via proxy')) : ''}</div>
      ${s.downloaded ? `<div class="upd-downloaded">${esc(L('已下载', 'Downloaded'))}: <b>${esc(s.downloaded.name)}</b> · ${esc(fmtSize(s.downloaded.size))}<br><span class="topo-hint" style="word-break:break-all">${esc(s.downloaded.path)}</span></div>` : ''}`;

    const assets = (s.latest && s.latest.assets) || [];
    const ab = $('updAssets');
    if (ab) {
      ab.innerHTML = assets.length ? assets.map((a) => `
        <div class="upd-asset"><span class="upd-asset-name" title="${esc(a.name)}">${esc(a.name)}</span>
          <span class="topo-hint">${esc(fmtSize(a.size))}</span>
          <button class="btn" data-upd-dl="${esc(a.name)}" type="button">${esc(L('下载', 'Download'))}</button></div>`).join('')
        : `<div class="empty" style="padding:18px;text-align:center;color:var(--muted)">${esc(L('检查更新后显示可下载资产', 'Assets appear after a successful check'))}</div>`;
      ab.querySelectorAll('[data-upd-dl]').forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            const r = await api('/api/update/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: btn.dataset.updDl }) });
            toast(L('已下载到数据目录 updates/：', 'Saved to data/updates/: ') + r.downloaded.name, 'ok');
            await reload();
          } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
        };
      });
    }
    const notes = $('updNotes');
    if (notes) notes.innerHTML = s.latest && s.latest.notes
      ? `<pre class="upd-notes">${esc(s.latest.notes)}</pre>` : `<div class="topo-hint">—</div>`;
    const url = $('updReleaseLink');
    if (url) {
      const href = s.latest && s.latest.url;
      url.innerHTML = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(L('打开发布页', 'Open release page'))} ↗</a>` : '';
    }
    const dockerCmd = $('updDockerCmd');
    if (dockerCmd) dockerCmd.textContent = (d.limits && d.limits.dockerCommand) || '';
  }

  /* ---------- 应用内自动更新 ---------- */
  function setSelfProgress(text, kind) {
    const el = $('updSelfProgress');
    if (el) el.innerHTML = `<div class="upd-self-progress ${kind || ''}">${esc(text)}</div>`;
  }
  function paintSelf(d) {
    window.__updSelfCache = d;
    const box = $('updSelfBox'); if (!box) return;
    const kindLabel = { docker: 'Docker', desktop: L('桌面版', 'Desktop app'), source: L('源码运行', 'Source') }[d.kind] || d.kind;
    const rt = d.runtime || {}, dk = d.docker || {}, ds = d.desktop || {};
    const cells = [
      `<div><small>${esc(L('运行方式', 'Runtime'))}</small><b>${esc(kindLabel)}</b></div>`,
      `<div><small>${esc(L('当前版本', 'Current version'))}</small><b>${esc(rt.version || '—')}</b></div>`,
    ];
    if (d.kind === 'docker') {
      cells.push(`<div><small>${esc(L('容器 / 镜像', 'Container / image'))}</small><b>${esc(dk.containerName || '—')} · ${esc(dk.image || '—')}</b></div>`);
      cells.push(`<div><small>Docker socket</small><b>${esc(dk.socket || '—')}</b></div>`);
    } else if (d.kind === 'desktop') {
      cells.push(`<div><small>${esc(L('应用目录', 'App directory'))}</small><b title="${esc(ds.appDir || '')}">${esc(ds.appDir || '—')}</b></div>`);
      cells.push(`<div><small>${esc(L('更新包', 'Update bundle'))}</small><b>${d.bundle ? esc(d.bundle.name) + ' · ' + esc(fmtSize(d.bundle.size)) : '—'}</b></div>`);
    }
    let state, help = '';
    if (!d.available) {
      state = `<div class="upd-state bad">${badge(L('不可用', 'Unavailable'), 'bad')}<div class="upd-err">${esc(d.reason || '')}</div></div>`;
      if (d.kind === 'docker') {
        help = `<pre class="upd-cmd"># docker-compose.yml 的 volumes: 里增加一行（会赋予容器宿主机 Docker 权限，请自行评估）
    volumes:
      - ./data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
# 然后 docker compose up -d 重建一次</pre>`;
      } else if (d.kind === 'desktop') {
        help = `<div class="upd-self-help">${esc(L('只需重新安装一次最新安装包（pkg/dmg/exe），之后所有更新都能在网页里一键完成。绿色版用户重新解压新版 ZIP 即可。', 'Reinstall the latest installer once (pkg/dmg/exe); from then on every update happens in the browser. Portable users just unzip the new ZIP once.'))}</div>`;
      }
    } else {
      const note = d.kind === 'docker'
        ? L('将拉取新镜像、按原配置重建容器，服务短暂中断后自动恢复。', 'Pulls the new image and recreates the container with the same config; the page reconnects automatically.')
        : L('下载轻量更新包后替换程序文件并自动重启，数据目录完全不动，无需重新下载安装包装载。', 'Downloads a small bundle, swaps program files and restarts. Your data folder is untouched — no reinstall.');
      state = `<div class="upd-state ok">${badge(L('可用', 'Available'), 'ok')}<div class="topo-hint">${esc(note)}</div></div>`;
    }
    let resultHtml = '';
    const r = d.result;
    if (r) {
      if (r.ok && !r.rolledBack) {
        resultHtml = `<div class="upd-self-result ok">${esc(L('上次更新成功', 'Last update succeeded'))} · ${esc(r.version || '')} · ${esc(fmtTime(r.finishedAt || r.verifiedAt || r.at))}</div>`;
      } else {
        resultHtml = `<div class="upd-self-result bad">${esc(L('上次更新失败', 'Last update failed'))} · ${esc(r.error || (r.rolledBack ? 'rolled back' : ''))} ${r.rolledBack ? esc(L('（已回滚到上一版本）', '(rolled back)')) : ''}</div>`;
      }
    }
    const prog = d.progress && d.progress.stage !== 'restart'
      ? `<div class="upd-self-result">${esc(d.progress.stage)} · ${esc(d.progress.message)} · ${esc(fmtTime(d.progress.at))}</div>` : '';
    box.innerHTML = `<div class="upd-meta upd-self-meta">${cells.join('')}</div>${state}${resultHtml}${prog}${help}`;
    const btn = $('updSelfApply');
    if (btn) {
      btn.disabled = !d.available || !!d.busy;
      btn.textContent = d.kind === 'docker'
        ? L('拉取新镜像并重建容器', 'Pull & recreate container')
        : L('一键更新并自动重启', 'Update & restart');
    }
    const reset = $('updSelfReset');
    if (reset) reset.hidden = !d.busy && !d.result && !d.progress;
  }
  async function loadSelf() {
    try { paintSelf(await api('/api/update/self/status')); }
    catch (e) { setSelfProgress(e.message, 'bad'); }
  }

  async function reload(fillForm = false) {
    try {
      const d = await api('/api/update/status');
      paint(d);
      if (fillForm) fill(d.config);   // 首次进入用服务端配置填表，后续刷新不覆盖正在编辑的内容
    } catch (e) { toast(e.message, 'err'); }
  }

  async function waitReconnect(mark) {
    const t0 = Date.now();
    let back = false;
    setSelfProgress(L('正在重启，页面会自动重连…', 'Restarting — reconnecting automatically…'));
    while (Date.now() - t0 < 150000) {
      await new Promise((r) => setTimeout(r, 1600));
      try { if ((await fetch('/api/health', { cache: 'no-store' })).ok) { back = true; break; } } catch (e) { /* 服务还没起来 */ }
      setSelfProgress(L('正在重启…', 'Restarting…') + ' ' + Math.round((Date.now() - t0) / 1000) + 's');
    }
    if (!back) { setSelfProgress(L('等待超时，请手动刷新页面或检查容器/程序状态', 'Timed out — refresh manually and check the service'), 'bad'); return; }
    try { localStorage.removeItem(MARK_KEY); } catch (e) { /* ignore */ }
    try {
      await reload(true);
      await loadSelf();
      setSelfProgress(L('更新完成，服务已恢复', 'Update finished — service is back'), 'ok');
      toast(L('已更新并自动重启完成', 'Updated and restarted'), 'ok');
    } catch (e) { location.reload(); }
  }
  function checkResume() {
    let mark = null;
    try { mark = JSON.parse(localStorage.getItem(MARK_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!mark) return;
    if (Date.now() - mark.at > 180000) { try { localStorage.removeItem(MARK_KEY); } catch (e) { /* ignore */ } return; }
    setSelfProgress(L('检测到未完成的更新，正在等待服务恢复…', 'Resuming a pending update — waiting for the service…'));
    waitReconnect(mark);
  }
  async function applySelf() {
    const d = window.__updSelfCache || {};
    if (!d.available) { toast(d.reason || L('当前环境不支持', 'Not available here'), 'err'); return; }
    const s = (window.__updCache && window.__updCache.status) || {};
    const force = !s.hasUpdate;
    const msg = d.kind === 'docker'
      ? L('将拉取最新镜像并按原配置重建容器，服务会中断约 10~30 秒，页面会自动重连。继续？', 'Pulls the new image and recreates the container. The service will be down ~10–30s; the page reconnects automatically. Continue?')
      : L('将下载更新包、替换程序文件并自动重启，服务中断几秒，配置与数据完全保留。继续？', 'Downloads the bundle, swaps program files and restarts. A few seconds of downtime; config and data are kept. Continue?');
    const text = force ? L('当前未检测到新版本，仍要重新应用该版本吗？', 'No newer version detected — re-apply the current release anyway?') + '\n' + msg : msg;
    if (!window.confirm(text)) return;
    const btn = $('updSelfApply'); if (btn) btn.disabled = true;
    try {
      const r = await api('/api/update/self/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      try { localStorage.setItem(MARK_KEY, JSON.stringify({ mode: r.mode, version: r.version, at: Date.now() })); } catch (e) { /* ignore */ }
      setSelfProgress(L('更新已提交，服务即将重启…', 'Update submitted — the service will restart shortly…'));
      await waitReconnect({ mode: r.mode, version: r.version, at: Date.now() });
    } catch (e) {
      toast(e.message, 'err');
      setSelfProgress(e.message, 'bad');
      if (btn) btn.disabled = false;
      try { localStorage.removeItem(MARK_KEY); } catch (x) { /* ignore */ }
    }
  }

  function fill(cfg) {
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    const chk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    chk('updEnabled', cfg.enabled);
    chk('updAutoDownload', cfg.autoDownload);
    chk('updAutoApply', cfg.autoApply);
    set('updSource', cfg.source || 'github');
    set('updInterval', String(cfg.intervalHours || 24));
    set('updChannel', cfg.channel || 'stable');
    set('updEndpoint', cfg.endpoint || '');
    set('updProxy', cfg.proxy || '');
    set('updImage', cfg.image || '');
    set('updTag', cfg.tag || 'latest');
    toggleSource();
  }
  function toggleSource() {
    const hub = $('updSource') && $('updSource').value === 'dockerhub';
    const row = $('updHubRow');
    if (row) row.style.display = hub ? '' : 'none';
    const ch = $('updChannelRow');
    if (ch) ch.style.display = hub ? 'none' : '';
  }

  window.renderUpdatesPage = function renderUpdatesPage() {
    $('content').innerHTML = `
      <div class="page-head">
        <div><h1>${esc(L('检查更新', 'Updates'))}</h1>
          <p>${esc(L('检测 GitHub Releases 或 Docker Hub 是否有新版本；支持代理、镜像源、自动检查与自动下载安装包。', 'Check GitHub Releases or Docker Hub for new versions, with proxy, mirror, auto-check and asset download.'))}</p></div>
        <button class="btn primary" id="updCheck" type="button">${esc(L('立即检查', 'Check now'))}</button>
      </div>

      <div class="panel"><div class="panel-head"><div><h2>${esc(L('更新状态', 'Update status'))}</h2>
        <p class="sub">${esc(L('服务端定时检查，结果保存在数据目录，不依赖浏览器常开。', 'Server-side scheduled checks; results persist in the data directory.'))}</p></div></div>
        <div class="panel-body" id="updStatus"><div class="empty">${esc(L('加载中…', 'Loading…'))}</div></div></div>

      <div class="grid-2" style="margin-top:14px">
        <div class="panel"><div class="panel-head"><div><h2>${esc(L('检查与自动更新选项', 'Check & auto-update options'))}</h2></div></div>
          <div class="panel-body">
            <label class="upd-check"><input type="checkbox" id="updEnabled"><span>${esc(L('自动检查更新（服务端定时）', 'Auto-check on schedule (server-side)'))}</span></label>
            <label class="upd-check"><input type="checkbox" id="updAutoDownload"><span>${esc(L('发现新版本时自动下载匹配的安装包（仅桌面版）', 'Auto-download matching installer when an update is found (desktop only)'))}</span></label>
            <label class="upd-check"><input type="checkbox" id="updAutoApply"><span>${esc(L('发现新版本时自动应用更新（Docker 重建容器 / 桌面替换程序并重启，无需人工安装）', 'Auto-apply updates (Docker: recreate container / Desktop: swap files and restart — no manual install)'))}</span></label>
            <div class="form-row"><label>${esc(L('检测来源', 'Source'))}</label><div><select id="updSource">
              <option value="github">GitHub Releases</option><option value="dockerhub">Docker Hub</option></select></div></div>
            <div class="form-row" id="updChannelRow"><label>${esc(L('发布通道', 'Channel'))}</label><div><select id="updChannel">
              <option value="stable">${esc(L('正式版', 'Stable'))}</option><option value="all">${esc(L('包含预发布', 'Include pre-releases'))}</option></select></div></div>
            <div class="form-row"><label>${esc(L('检查周期', 'Interval'))}</label><div><select id="updInterval">
              <option value="1">1 ${esc(L('小时', 'hour'))}</option><option value="6">6 ${esc(L('小时', 'hours'))}</option>
              <option value="12">12 ${esc(L('小时', 'hours'))}</option><option value="24">24 ${esc(L('小时', 'hours'))}</option>
              <option value="168">7 ${esc(L('天', 'days'))}</option><option value="720">30 ${esc(L('天', 'days'))}</option></select></div></div>
            <div class="form-row" id="updHubRow"><label>${esc(L('镜像仓库 / 标签', 'Image / tag'))}</label><div class="upd-inline">
              <input type="text" id="updImage" placeholder="backspacem/ros-center" style="flex:2;min-width:0">
              <input type="text" id="updTag" placeholder="latest" style="flex:1;min-width:0"></div></div>
            <div class="form-row"><label>${esc(L('镜像源 / 自定义 API 端点', 'Mirror / custom API endpoint'))}</label><div>
              <input type="text" id="updEndpoint" placeholder="https://mirror.example.com/v2/repositories/backspacem/ros-center/tags/latest" autocomplete="off">
              <div class="form-hint">${esc(L('留空用官方接口。Docker Hub 检测若被墙，可填镜像站反代的完整 API 地址；GitHub 源同理。', 'Leave blank for the official API. If Docker Hub is blocked, point this at a mirror/proxy exposing the same API.'))}</div></div></div>
            <div class="form-row"><label>${esc(L('HTTP 代理', 'HTTP proxy'))}</label><div>
              <input type="text" id="updProxy" placeholder="http://[user:pass@]127.0.0.1:7890" autocomplete="off">
              <div class="form-hint">${esc(L('服务端发起的检查请求经此 HTTP CONNECT 代理；密码保存后以 *** 显示，不会回显。', 'Server-side checks go through this HTTP CONNECT proxy; stored credentials are masked on read.'))}</div></div></div>
            <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="updSave" type="button">${esc(L('保存设置', 'Save settings'))}</button>
              <button class="btn" id="updCheck2" type="button">${esc(L('保存并立即检查', 'Save & check now'))}</button></div>
          </div></div>

        <div class="panel"><div class="panel-head"><div><h2>${esc(L('最新版本', 'Latest release'))}</h2>
          <p class="sub" id="updReleaseLink"></p></div></div>
          <div class="panel-body">
            <div id="updNotes" style="max-height:150px;overflow:auto"></div>
            <div class="form-row" style="margin-top:12px"><label>${esc(L('发布资产', 'Assets'))}</label></div>
            <div id="updAssets" class="upd-assets"></div>
          </div></div>
      </div>

      <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>${esc(L('应用内自动更新', 'Apply update in place'))}</h2>
        <p class="sub">${esc(L('不重新下载安装包装载：Docker 重建容器，桌面版只替换程序文件并自动重启。', 'No reinstall: Docker recreates the container, desktop swaps program files and restarts.'))}</p></div>
        <div class="upd-self-actions"><button class="btn" id="updSelfReset" type="button" hidden>${esc(L('重置状态', 'Reset state'))}</button>
        <button class="btn primary" id="updSelfApply" type="button">${esc(L('一键更新并重启', 'Update & restart'))}</button></div></div>
        <div class="panel-body"><div id="updSelfBox"><div class="empty">${esc(L('加载中…', 'Loading…'))}</div></div><div id="updSelfProgress"></div></div></div>

      <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>${esc(L('工作原理与安全', 'How it works & safety'))}</h2></div></div>
        <div class="panel-body">
          <div class="modal-note" style="font-size:11.5px;color:var(--muted);line-height:1.8">
            <b>Docker</b> · ${esc(L('映射 /var/run/docker.sock 后，程序经 Docker Engine API 拉取新镜像、读取自身配置，再由一次性助手容器完成「停旧 → 删旧 → 以原名称/端口/卷/环境变量重建 → 启动」。仅 restart 不会换镜像，必须重建。数据目录 /app/data 未挂载到宿主机时会拒绝执行，避免删容器丢配置。注意：映射 docker.sock 等同于赋予容器宿主机 root 级权限，请自行评估。', 'With /var/run/docker.sock mounted, the app pulls the new image over the Docker Engine API, reads its own config, and a one-shot helper container stops/removes/recreates/starts it with the same name, ports, volumes and env. A plain restart keeps the old image. Self-update is refused when /app/data is not mounted. Note: mounting docker.sock grants host-root-equivalent access.'))}
            <br><b>${esc(L('桌面版', 'Desktop'))}</b> · ${esc(L('launcher.js 监管进程负责：网页点一次更新 → 下载几百 KB 的 app 更新包（仅源码、不含 Node 运行时）→ 校验 SHA256 与逐文件清单 → 程序主动退出 → launcher 在文件句柄释放后替换 app/ 并自动重启；新版本启动失败会自动回滚到备份。data/ 全程不动。首次装好带 launcher 的版本后，以后都不需要再下载 pkg/dmg/exe。', 'launcher.js supervises the app: click once in the browser → download a small app bundle (source only) → verify SHA256 and per-file manifest → the process exits → the launcher swaps app/ and restarts, rolling back automatically if the new build fails to boot. data/ is never touched. After installing the launcher-enabled build once, no more pkg/dmg/exe downloads.'))}
            <br>${esc(L('若不映射 socket 或想手动更新，仍可在宿主机执行：', 'Without the socket, or for a manual update, run on the host:'))}
            <pre class="upd-cmd" id="updDockerCmd"></pre>
            ${esc(L('Docker Hub 检测默认比对镜像 digest；可用 ROS_CENTER_DIGEST 环境变量传入当前 digest，否则以上次构建时间变化判定。重建容器时会自动把新的 digest / 版本写进环境变量，避免反复触发更新。', 'Docker Hub checks compare the image digest; pass the current one via ROS_CENTER_DIGEST, otherwise build-time changes are used. The recreated container gets the new digest/version in its env to avoid repeated update loops.'))}
          </div>
        </div></div>`;

    $('updSource').onchange = toggleSource;
    const collect = () => ({
      enabled: $('updEnabled').checked,
      autoDownload: $('updAutoDownload').checked,
      autoApply: $('updAutoApply') ? $('updAutoApply').checked : false,
      source: $('updSource').value,
      intervalHours: Number($('updInterval').value),
      channel: $('updChannel').value,
      endpoint: $('updEndpoint').value.trim(),
      proxy: $('updProxy').value.trim(),
      image: $('updImage').value.trim(),
      tag: $('updTag').value.trim(),
    });
    const save = async () => {
      const r = await api('/api/update/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
      fill(r.config);
      return r;
    };
    const check = async (btn) => {
      if (btn) btn.disabled = true;
      const box = $('updStatus');
      if (box) box.innerHTML = `<div class="empty">${esc(L('正在检查…', 'Checking…'))}</div>`;
      try {
        const r = await api('/api/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        paint({ ...(window.__updCache || {}), config: r.config, status: r.status });
        await loadSelf();
        toast(r.status && r.status.ok
          ? (r.status.hasUpdate ? L('发现新版本 ', 'Update available ') + r.status.latest.version : L('已是最新版本', 'Already up to date'))
          : (r.status && r.status.error) || L('检查完成', 'Check finished'), r.status && r.status.ok ? 'ok' : 'err');
      } catch (e) { toast(e.message, 'err'); await reload(); }
      if (btn) btn.disabled = false;
    };
    $('updCheck').onclick = () => check($('updCheck'));
    $('updSave').onclick = async () => { try { await save(); toast(L('设置已保存', 'Settings saved'), 'ok'); } catch (e) { toast(e.message, 'err'); } };
    $('updCheck2').onclick = async () => {
      try { await save(); await check($('updCheck2')); } catch (e) { toast(e.message, 'err'); }
    };
    $('updSelfApply').onclick = applySelf;
    $('updSelfReset').onclick = async () => {
      try {
        await api('/api/update/self/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const prog = $('updSelfProgress'); if (prog) prog.innerHTML = '';
        await loadSelf();
        toast(L('状态已重置', 'State reset'), 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
    reload(true);
    loadSelf();
    checkResume();
  };
})();
