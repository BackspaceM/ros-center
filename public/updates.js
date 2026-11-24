'use strict';
/* 检查更新：一屏总览（状态 + 操作 + 进度）、按运行方式收敛内容 */
(function () {
  const MARK_KEY = 'ros-self-updating';
  let applyingTimer = null;

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
  function kindLabel(kind) {
    return { docker: 'Docker', desktop: L('桌面版', 'Desktop app'), source: L('源码运行', 'Source') }[kind] || kind || '—';
  }

  /* ---------- 进度条：下载字节数 / Docker 逐层百分比 / 重启等待 ---------- */
  function progressHtml(p) {
    if (!p || !p.stage) return '';
    const stage = String(p.stage);
    const busy = ['download', 'pull', 'prepare', 'restart', 'switch'].includes(stage);
    if (!busy && stage !== 'error') {
      return `<div class="upd-self-result">${esc(stage)} · ${esc(p.message || '')} · ${esc(fmtTime(p.at))}</div>`;
    }
    const pct = Number(p.percent);
    const known = Number.isFinite(pct) && pct >= 0 && (stage === 'download' || stage === 'pull');
    const width = known ? Math.max(2, Math.min(100, pct)) : 0;
    const label = stage === 'download' || stage === 'pull'
      ? L('下载更新', 'Downloading') : stage === 'prepare' || stage === 'switch'
        ? L('切换版本', 'Switching') : L('等待服务恢复', 'Waiting for restart');
    const detail = known && Number(p.total) > 0
      ? `${fmtSize(p.loaded)} / ${fmtSize(p.total)} · ${pct}%`
      : (Number(p.loaded) > 0 ? fmtSize(p.loaded) : '');
    const kind = stage === 'error' ? 'bad' : '';
    return `<div class="upd-progress ${kind}">
      <div class="upd-progress-top"><span>${esc(label)}${p.layer ? ' · ' + esc(String(p.layer).slice(0, 14)) : ''}</span>
        <b>${esc(detail || (stage === 'error' ? '' : p.message || ''))}</b></div>
      <div class="upd-bar"><i style="width:${width}%" class="${known ? '' : 'indet'}"></i></div>
      <div class="topo-hint">${esc(p.message || '')}${p.at ? ' · ' + esc(fmtTime(p.at)) : ''}</div>
    </div>`;
  }
  function setSelfProgress(text, kind, p) {
    const el = $('updSelfProgress');
    if (!el) return;
    el.innerHTML = progressHtml(p || { stage: kind === 'bad' ? 'error' : 'restart', message: text, percent: -1 });
  }

  /* ---------- 状态总览 ---------- */
  function paint(d) {
    window.__updCache = d;
    const s = d.status || {}, cfg = d.config || {}, rt = d.runtime || {};
    const box = $('updStatus');
    if (!box) return;
    const kind = rt.selfUpdate || (d.limits && d.limits.selfUpdateKind) || 'source';
    const page = $('updPage');
    if (page) page.dataset.kind = kind;
    const chip = $('updKindChip');
    if (chip) chip.textContent = kindLabel(kind);
    /* 源码运行不支持应用内更新，直接隐藏该项；Docker 用短文案 */
    const applyRow = $('updAutoApplyRow');
    if (applyRow) applyRow.style.display = kind === 'source' ? 'none' : '';
    const applyLabel = $('updAutoApplyLabel');
    if (applyLabel) applyLabel.textContent = kind === 'docker'
      ? L('自动更新', 'Auto-update')
      : L('发现新版本时自动应用（无需人工安装）', 'Auto-apply updates without manual install');
    const src = (d.limits && d.limits.source) || cfg.source || s.source || 'github';
    const srcLabel = src === 'dockerhub' ? 'Docker Hub' : 'GitHub Releases';
    const latestV = (s.latest && s.latest.version) || '—';
    let state;
    if (!s.checkedAt) {
      state = `<div class="upd-state empty">${badge(L('尚未检查', 'Not checked'))}<span>${esc(L('点「立即检查」开始', 'Click "Check now" to start'))}</span></div>`;
    } else if (!s.ok) {
      state = `<div class="upd-state bad">${badge(L('检查失败', 'Check failed'), 'bad')}<span class="upd-err">${esc(s.error || '')}</span></div>`;
    } else if (s.hasUpdate) {
      state = `<div class="upd-state new">${badge(L('发现新版本', 'Update available'), 'new')}<span>${esc(L('发布于', 'Published'))} ${esc(fmtTime(s.latest && s.latest.publishedAt))} · ${esc(s.reason || '')}</span></div>`;
    } else {
      state = `<div class="upd-state ok">${badge(L('已是最新', 'Up to date'), 'ok')}<span>${esc(s.reason || '')}</span></div>`;
    }
    box.innerHTML = `
      <div class="upd-ver"><span>${esc(L('当前', 'Current'))} <b>${esc(rt.version || '—')}</b></span>
        <i>→</i><span>${esc(L('最新', 'Latest'))} <b>${esc(latestV)}</b></span></div>
      ${state}
      <div class="upd-facts">
        <span>${esc(L('运行方式', 'Runtime'))} <b>${esc(kindLabel(rt.runtime))}</b></span>
        <span>${esc(L('检测源', 'Source'))} <b>${esc(srcLabel)}</b></span>
        <span>${esc(L('上次检查', 'Last check'))} <b>${esc(fmtTime(s.checkedAt))}</b></span>
        ${s.proxyUsed ? `<span>${esc(L('经代理', 'via proxy'))}</span>` : ''}
      </div>
      ${s.downloaded ? `<div class="upd-downloaded">${esc(L('已下载', 'Downloaded'))}: <b>${esc(s.downloaded.name)}</b> · ${esc(fmtSize(s.downloaded.size))}</div>` : ''}`;

    const cmd = $('updDockerCmd');
    if (cmd) cmd.textContent = (d.limits && d.limits.dockerCommand) || '';
  }

  /* ---------- 应用内更新能力卡（只显示对应运行方式的内容） ---------- */
  function paintSelf(d) {
    window.__updSelfCache = d;
    const box = $('updSelfBox'); if (!box) return;
    const rt = d.runtime || {}, dk = d.docker || {}, ds = d.desktop || {};
    const kind = d.kind || 'source';
    const facts = [];
    if (kind === 'docker') {
      facts.push([L('容器', 'Container'), dk.containerName || '—']);
      facts.push([L('镜像', 'Image'), dk.image || '—']);
      facts.push([L('数据卷', 'Data'), dk.dataMounted ? (dk.dataMount || L('已挂载', 'mounted')) : L('未挂载', 'not mounted')]);
    } else if (kind === 'desktop') {
      facts.push([L('监管', 'Supervisor'), ds.launchedByLauncher ? L('launcher（可自动重启）', 'launcher (auto-restart)') : L('直接运行', 'direct')]);
      if (d.bundle) facts.push([L('更新包', 'Bundle'), `${d.bundle.name} · ${fmtSize(d.bundle.size)}`]);
    }
    let state;
    if (!d.available) {
      const reason = d.reason || '';
      state = `<div class="upd-state bad">${badge(L('不可用', 'Unavailable'), 'bad')}
        ${reason.includes('\n') ? `<pre class="upd-cmd upd-self-diag">${esc(reason)}</pre>` : `<span class="upd-err">${esc(reason)}</span>`}</div>`;
      if (kind === 'docker' && dk.socketExists) {
        state += `<div class="topo-hint upd-diag">${esc(L('检测结果', 'Detection'))}: socket ${esc(dk.socket)} · mode=0${(Number(dk.socketMode) || 0).toString(8).padStart(3, '0')} · gid=${dk.socketGid} · ${esc(L('进程', 'process'))} ${dk.processUid}/${dk.processGid}${dk.accessible === false ? ' · ' + esc(L('当前用户无权访问', 'current user has no access')) : ''}</div>`;
      }
    } else {
      const note = kind === 'docker'
        ? L('拉取新镜像 → 助手容器按原配置重建 → 页面自动重连', 'Pull image → helper recreates container → page reconnects')
        : L('下载轻量更新包 → 替换程序文件 → 自动重启，数据不动', 'Download small bundle → swap files → restart; data untouched');
      state = `<div class="upd-state ok">${badge(L('可用', 'Ready'), 'ok')}<span>${esc(note)}</span></div>`;
    }
    const r = d.result;
    if (r) {
      state += r.ok && !r.rolledBack
        ? `<div class="upd-self-result ok">${esc(L('上次更新成功', 'Last update succeeded'))} · ${esc(r.version || '')} · ${esc(fmtTime(r.finishedAt || r.verifiedAt || r.at))}</div>`
        : `<div class="upd-self-result bad">${esc(L('上次更新失败', 'Last update failed'))} · ${esc(r.error || (r.rolledBack ? 'rolled back' : ''))}</div>`;
    }
    box.innerHTML = `${facts.length ? `<div class="upd-self-facts">${facts.map(([k, v]) => `<span>${esc(k)} <b title="${esc(v)}">${esc(v)}</b></span>`).join('')}</div>` : ''}${state}`;
    const btn = $('updSelfApply');
    if (btn) {
      btn.disabled = !d.available || !!d.busy;
      btn.textContent = kind === 'docker' ? L('拉取镜像并重建容器', 'Pull & recreate') : L('一键更新并重启', 'Update & restart');
      btn.title = !((window.__updCache && window.__updCache.status && window.__updCache.status.hasUpdate))
        ? L('当前没有新版本，仍可重新应用当前版本', 'No new version — re-apply current release anyway') : '';
    }
    const reset = $('updSelfReset');
    if (reset) reset.hidden = kind === 'source' || (!d.busy && !d.result && !d.progress);
    /* 旧的进度不要一直挂着：15 分钟以上，或已有更新的完成时间晚于进度时间，就忽略 */
    let progress = d.progress || null;
    if (progress && progress.at) {
      const age = Date.now() - Date.parse(progress.at);
      const doneAt = r && Date.parse(r.finishedAt || r.verifiedAt || r.at || '');
      if ((Number.isFinite(age) && age > 15 * 60 * 1000) || (Number.isFinite(doneAt) && doneAt > Date.parse(progress.at))) progress = null;
    }
    const prog = $('updSelfProgress');
    if (prog && !applyingTimer) prog.innerHTML = progressHtml(progress);
  }
  async function loadSelf(force = false) {
    try { paintSelf(await api('/api/update/self/status' + (force ? '?refresh=1' : ''))); }
    catch (e) { setSelfProgress(e.message, 'bad'); }
  }

  async function reload(fillForm = false) {
    try {
      const d = await api('/api/update/status');
      paint(d);
      if (fillForm) fill(d.config);
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------- 应用更新：前置进度轮询 + 完成后自动重连 ---------- */
  function startProgressPolling() {
    stopProgressPolling();
    applyingTimer = setInterval(async () => {
      try {
        const d = await api('/api/update/self/status');
        paintSelf(d);
        const el = $('updSelfProgress');
        if (el) el.innerHTML = progressHtml(d.progress);
      } catch (e) { /* 服务已停，等待重连 */ }
    }, 800);
  }
  function stopProgressPolling() {
    if (applyingTimer) { clearInterval(applyingTimer); applyingTimer = null; }
  }
  async function waitReconnect() {
    const t0 = Date.now();
    let back = false;
    setSelfProgress('', '', { stage: 'restart', message: L('服务重启中，页面自动重连…', 'Restarting — reconnecting…'), percent: -1 });
    while (Date.now() - t0 < 150000) {
      await new Promise((r) => setTimeout(r, 1600));
      try { if ((await fetch('/api/health', { cache: 'no-store' })).ok) { back = true; break; } } catch (e) { /* 还没起来 */ }
      setSelfProgress('', '', { stage: 'restart', message: L('正在重启…', 'Restarting…') + ' ' + Math.round((Date.now() - t0) / 1000) + 's', percent: -1 });
    }
    stopProgressPolling();
    if (!back) {
      setSelfProgress('', 'bad', { stage: 'error', message: L('等待超时，请手动刷新或检查程序/容器状态', 'Timed out — refresh manually or check the service') });
      return;
    }
    try { localStorage.removeItem(MARK_KEY); } catch (e) { /* ignore */ }
    try {
      await reload(true);
      await loadSelf();
      setSelfProgress('', 'ok', { stage: 'done', message: L('更新完成，服务已恢复', 'Update finished — service is back') });
      toast(L('已更新并自动重启完成', 'Updated and restarted'), 'ok');
    } catch (e) { location.reload(); }
  }
  function checkResume() {
    let mark = null;
    try { mark = JSON.parse(localStorage.getItem(MARK_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!mark) return;
    if (Date.now() - mark.at > 180000) { try { localStorage.removeItem(MARK_KEY); } catch (e) { /* ignore */ } return; }
    startProgressPolling();
    waitReconnect();
  }
  async function applySelf() {
    const d = window.__updSelfCache || {};
    if (!d.available) { toast(d.reason || L('当前环境不支持', 'Not available here'), 'err'); return; }
    const s = (window.__updCache && window.__updCache.status) || {};
    const force = !s.hasUpdate;
    const msg = d.kind === 'docker'
      ? L('将拉取最新镜像并按原配置重建容器，服务中断约 10~30 秒，页面会自动重连。继续？', 'Pull the new image and recreate the container (~10–30s downtime). Continue?')
      : L('将下载更新包、替换程序文件并自动重启，配置与数据完全保留。继续？', 'Download the bundle, swap files and restart. Config and data are kept. Continue?');
    if (!window.confirm((force ? L('当前未检测到新版本，仍要重新应用该版本吗？', 'No newer version detected — re-apply anyway?') + '\n' : '') + msg)) return;
    const btn = $('updSelfApply'); if (btn) btn.disabled = true;
    try {
      setSelfProgress('', '', { stage: 'download', message: L('正在准备更新…', 'Preparing…'), percent: -1 });
      startProgressPolling();
      const r = await api('/api/update/self/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      try { localStorage.setItem(MARK_KEY, JSON.stringify({ mode: r.mode, version: r.version, at: Date.now() })); } catch (e) { /* ignore */ }
      stopProgressPolling();
      await waitReconnect();
    } catch (e) {
      stopProgressPolling();
      toast(e.message, 'err');
      setSelfProgress('', 'bad', { stage: 'error', message: e.message });
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
    const hub = !!($('updSource') && $('updSource').value === 'dockerhub');
    const row = $('updHubRow'); if (row) row.style.display = hub ? '' : 'none';
    const ch = $('updChannelRow'); if (ch) ch.style.display = hub ? 'none' : '';
  }

  window.renderUpdatesPage = function renderUpdatesPage() {
    $('content').innerHTML = `
      <div class="page-head upd-page-head" id="updPage" data-kind="source">
        <div><h1>${esc(L('检查更新', 'Updates'))}</h1>
          <p>${esc(L('一处查看版本、下载进度与更新设置。', 'Version, progress and settings in one place.'))}</p></div>
        <div class="upd-head-actions">
          <span class="upd-kind-chip" id="updKindChip">${esc(kindLabel(window.__updCache && window.__updCache.runtime && window.__updCache.runtime.selfUpdate))}</span>
          <button class="btn primary" id="updCheck" type="button">${esc(L('立即检查', 'Check now'))}</button>
        </div></div>

      <div class="panel upd-hero">
        <div class="panel-body">
          <div class="upd-hero-grid">
            <div id="updStatus" class="upd-status"><div class="empty">${esc(L('加载中…', 'Loading…'))}</div></div>
            <div class="upd-apply">
              <div class="upd-apply-head"><h2>${esc(L('应用内更新', 'Apply update'))}</h2>
                <span class="topo-hint">${esc(L('无需重装', 'No reinstall'))}</span></div>
              <div id="updSelfBox"><div class="empty">${esc(L('检测中…', 'Detecting…'))}</div></div>
              <div class="upd-self-actions">
                <button class="btn" id="updSelfReset" type="button" hidden>${esc(L('重新检测', 'Re-detect'))}</button>
                <button class="btn primary" id="updSelfApply" type="button">${esc(L('一键更新并重启', 'Update & restart'))}</button>
              </div>
            </div>
          </div>
          <div id="updSelfProgress"></div>
        </div></div>

      <div class="upd-grid" style="margin-top:14px">
        <div class="panel"><div class="panel-head"><div><h2>${esc(L('更新设置', 'Settings'))}</h2>
          <p class="sub">${esc(L('服务端定时检查，结果不依赖浏览器常开。', 'Server-side schedule; no browser needed.'))}</p></div></div>
          <div class="panel-body">
            <div class="upd-row"><label class="upd-check"><input type="checkbox" id="updEnabled"><span>${esc(L('自动检查', 'Auto-check'))}</span></label>
              <select id="updInterval" class="upd-inline-sel" aria-label="${esc(L('检查周期', 'Interval'))}">
                <option value="1">1 ${esc(L('小时', 'h'))}</option><option value="6">6 ${esc(L('小时', 'h'))}</option>
                <option value="12">12 ${esc(L('小时', 'h'))}</option><option value="24">24 ${esc(L('小时', 'h'))}</option>
                <option value="168">7 ${esc(L('天', 'd'))}</option><option value="720">30 ${esc(L('天', 'd'))}</option></select></div>
            <label class="upd-check upd-only-desktop"><input type="checkbox" id="updAutoDownload"><span>${esc(L('发现新版本时自动下载安装包', 'Auto-download installer when available'))}</span></label>
            <label class="upd-check" id="updAutoApplyRow"><input type="checkbox" id="updAutoApply"><span id="updAutoApplyLabel">${esc(L('自动更新', 'Auto-update'))}</span></label>
            <div class="upd-row upd-source-row"><span>${esc(L('检测源', 'Source'))}</span>
              <select id="updSource" class="upd-inline-sel" disabled><option value="github">GitHub Releases</option><option value="dockerhub">Docker Hub</option></select>
              <span class="topo-hint">${esc(L('随运行方式固定', 'fixed by runtime'))}</span></div>
            <details class="upd-advanced">
              <summary>${esc(L('网络与高级选项', 'Network & advanced'))}</summary>
              <div class="form-row" id="updChannelRow"><label>${esc(L('发布通道', 'Channel'))}</label><div><select id="updChannel">
                <option value="stable">${esc(L('正式版', 'Stable'))}</option><option value="all">${esc(L('包含预发布', 'Include pre-releases'))}</option></select></div></div>
              <div class="form-row" id="updHubRow"><label>${esc(L('镜像仓库 / 标签', 'Image / tag'))}</label><div class="upd-inline">
                <input type="text" id="updImage" placeholder="backspacem/ros-center" style="flex:2;min-width:0">
                <input type="text" id="updTag" placeholder="latest" style="flex:1;min-width:0"></div></div>
              <div class="form-row"><label>${esc(L('镜像源 / API 端点', 'Mirror / endpoint'))}</label><div>
                <input type="text" id="updEndpoint" placeholder="https://mirror.example.com/..." autocomplete="off">
                <div class="form-hint">${esc(L('留空用官方接口；被墙时可填同结构 JSON 的反代地址。', 'Blank = official API; use a mirror returning the same JSON if blocked.'))}</div></div></div>
              <div class="form-row"><label>${esc(L('HTTP 代理', 'HTTP proxy'))}</label><div>
                <input type="text" id="updProxy" placeholder="http://[user:pass@]host:port" autocomplete="off">
                <div class="form-hint">${esc(L('服务端检查请求经此 CONNECT 代理；密码读取时以 *** 显示。', 'Server checks via this CONNECT proxy; stored password is masked on read.'))}</div></div></div>
            </details>
            <div class="upd-save-row"><button class="btn primary" id="updSave" type="button">${esc(L('保存设置', 'Save'))}</button>
              <button class="btn" id="updCheck2" type="button">${esc(L('保存并检查', 'Save & check'))}</button></div>
          </div></div>

      </div>

      <details class="panel upd-help"><summary>${esc(L('工作原理与安全', 'How it works & safety'))}</summary>
        <div class="panel-body modal-note">
          <div class="upd-docker-only"><b>Docker</b> · ${esc(L('映射 /var/run/docker.sock 后，程序经 Docker Engine API 拉取新镜像，由一次性助手容器完成「停旧 → 删旧 → 以原名称/端口/卷/环境变量重建 → 启动」；仅 restart 不会换镜像。/app/data 未挂载时会拒绝执行。映射 socket 等同宿主机 root 级权限。手动更新命令：', 'With docker.sock mounted, the app pulls the new image and a helper container stops/removes/recreates/starts it with the same config. A plain restart keeps the old image. Refused when /app/data is not mounted. Socket access is host-root-equivalent. Manual update command:'))}
            <pre class="upd-cmd" id="updDockerCmd"></pre></div>
          <div class="upd-desktop-only"><b>${esc(L('桌面版', 'Desktop'))}</b> · ${esc(L('launcher 监管进程在网页点一次后下载轻量 app 更新包（仅源码）→ 校验 SHA256 与逐文件清单 → 程序退出 → 替换 app/ 并自动重启；失败自动回滚。data/ 全程不动。再次点击 App 只会在当前真实端口打开 WebUI，不会启动第二个服务。', 'The launcher downloads a small source-only bundle, verifies SHA256 and per-file manifest, then swaps app/ and restarts with rollback. data/ is untouched. Clicking the app again opens the WebUI on the current port instead of starting a second service.'))}</div>
        </div></details>`;

    $('updSource').onchange = toggleSource;
    const collect = () => ({
      enabled: $('updEnabled').checked,
      autoDownload: $('updAutoDownload').checked,
      autoApply: $('updAutoApply').checked,
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
    $('updCheck2').onclick = async () => { try { await save(); await check($('updCheck2')); } catch (e) { toast(e.message, 'err'); } };
    $('updSelfApply').onclick = applySelf;
    $('updSelfReset').onclick = async () => {
      try {
        await api('/api/update/self/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const prog = $('updSelfProgress'); if (prog) prog.innerHTML = '';
        await loadSelf(true);
        toast(L('已重新检测', 'Re-detected'), 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
    reload(true).then(loadSelf);
    checkResume();
  };
})();
