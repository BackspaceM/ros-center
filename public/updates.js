'use strict';
/* 检查更新：一屏总览（状态 + 操作 + 进度）、按运行方式收敛内容 */
(function () {
  const MARK_KEY = 'ros-self-updating';
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  let applyingTimer = null;
  let runCheck = null;   // 由 renderUpdatesPage 注入，paint 重写 DOM 后重新绑定「立即检查」

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
  function scanRow(label, value, tag) {
    return `<div class="ui-scan-row"><span>${esc(label)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : `<b>${esc(value)}</b>`}</div>`;
  }

  /* ---------- 检查更新弹窗：复刻「设备与固件 · 检查更新」的扫描卡设计 ---------- */
  async function checkUpdatesModal() {
    if (!window.UI || !UI.openModal) return;
    const cache = window.__updCache || {};
    const rt = cache.runtime || {}, cfg = cache.config || {};
    const src = (cache.limits && cache.limits.source) || cfg.source || 'github';
    const srcLabel = src === 'dockerhub' ? 'Docker Hub' : 'GitHub Releases';
    const curVer = rt.version || '—';
    const kind = rt.selfUpdate || (cache.limits && cache.limits.selfUpdateKind) || rt.runtime || 'source';
    const modal = UI.openModal({
      title: L('检查更新', 'Check updates'), sub: L('ROS Center · 扫描控制台版本', 'ROS Center · scan console version'),
      body: `<div class="ui-scan"><div class="ui-scan-head"><b>${esc(L('正在连接更新服务并扫描版本…', 'Connecting to update service and scanning…'))}</b><span>live</span></div>
        <div class="ui-scan-bar"><i></i></div>
        <div class="ui-scan-results">
          ${scanRow(L('当前版本', 'Current version'), curVer)}
          ${scanRow(L('检测源', 'Source'), srcLabel)}
        </div></div>`,
      actions: [{ label: L('关闭', 'Close') }]
    });
    let r = null, err = '';
    try { r = await api('/api/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    catch (e) { err = (e && e.message) || L('检查失败', 'Check failed'); }
    if (!document.body.contains(modal.overlay)) return;
    const st = (r && r.status) || {};
    const latest = st.latest || {};
    const hasUp = !!st.hasUpdate;
    const latestV = latest.version || '—';
    modal.body.innerHTML = `<div class="ui-statline">
        <span><b>${esc(latestV)}</b>${esc(L('最新版本', 'Latest version'))}</span>
        <span><b>${hasUp ? '1' : '0'}</b>${esc(L('控制台更新', 'Console update'))}</span>
        <span><b>${esc(kindLabel(kind))}</b>${esc(L('运行方式', 'Runtime'))}</span>
      </div>
      <div class="ui-scan-results">
        ${scanRow(L('当前版本', 'Current version'), curVer)}
        ${scanRow(L('最新版本', 'Latest version'), latestV, hasUp ? L('可更新', 'Update') : L('已是最新', 'Up to date'))}
        ${scanRow(L('检测源', 'Source'), srcLabel)}
        ${st.checkedAt ? scanRow(L('检查时间', 'Checked'), fmtTime(st.checkedAt)) : ''}
      </div>
      ${err ? `<div class="ui-warning" style="margin-top:13px"><b>${esc(L('检查未完全成功', 'Check incomplete'))}</b>${esc(err)}</div>`
        : `<div class="ui-warning" style="margin-top:13px"><b>${esc(L('说明', 'Note'))}</b>${esc(L('更新只替换程序文件，配置与数据完整保留，失败自动回滚。可在下方「更新设置」配置自动检查与检测源。', 'Updates only swap program files; config and data are kept, with rollback on failure. Configure auto-check and source below.'))}</div>`}`;
    toast(L('版本检查完成', 'Version check complete'), 'ok');
    if (r) {
      window.__updCache = { ...(window.__updCache || {}), config: r.config, status: st };
      paint(window.__updCache);
      await loadSelf();
    }
  }

  /* ---------- 进度条：与「设备与固件 · 检查更新」弹窗一致的扫描卡样式 ---------- */
  function progressHtml(p) {
    if (!p || !p.stage) return '';
    const stage = String(p.stage);
    const busy = ['download', 'pull', 'prepare', 'restart', 'switch'].includes(stage);
    if (!busy && stage !== 'error') {
      return `<div class="notice green" style="margin-top:12px">${ic('check')}<div>${esc(stage)} · ${esc(p.message || '')} · ${esc(fmtTime(p.at))}</div></div>`;
    }
    const pct = Number(p.percent);
    const known = Number.isFinite(pct) && pct >= 0 && (stage === 'download' || stage === 'pull');
    const width = known ? Math.max(2, Math.min(100, pct)) : 38;
    const label = stage === 'error' ? L('更新失败', 'Update failed')
      : stage === 'download' || stage === 'pull' ? L('下载更新', 'Downloading') : stage === 'prepare' || stage === 'switch' ? L('切换版本', 'Switching') : L('等待服务恢复', 'Waiting for restart');
    const detail = known && Number(p.total) > 0
      ? `${fmtSize(p.loaded)} / ${fmtSize(p.total)} · ${pct}%`
      : (Number(p.loaded) > 0 ? fmtSize(p.loaded) : '');
    return `<div class="ui-scan" style="margin-top:12px">
      <div class="ui-scan-head"><b>${esc(label)}${p.layer ? ' · ' + esc(String(p.layer).slice(0, 14)) : ''}</b><span>${esc(detail || (stage === 'error' ? '' : p.message || ''))}</span></div>
      <div class="ui-scan-bar"><i style="width:${width}%${known ? ';animation:none' : ''}"></i></div>
      <div class="ui-scan-results"><div class="ui-scan-row"><span>${esc(p.message || '')}${p.at ? ' · ' + esc(fmtTime(p.at)) : ''}</span>${known ? `<b>${pct}%</b>` : ''}</div></div>
    </div>`;
  }
  function setSelfProgress(text, kind, p) {
    const el = $('updSelfProgress');
    if (!el) return;
    el.innerHTML = progressHtml(p || { stage: kind === 'bad' ? 'error' : 'restart', message: text, percent: -1 });
  }

  /* ---------- 状态焦点卡 ---------- */
  function stateIcon(kind) {
    const p = {
      ok: '<path d="M20 6 9 17l-5-5"/>',
      new: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/>',
      bad: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3h.01"/>',
      idle: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>'
    }[kind] || '<circle cx="12" cy="12" r="9"/>';
    return `<svg class="upd-sic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }
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

    let st = 'idle', title = '', desc = '';
    if (!s.checkedAt) {
      st = 'idle'; title = L('尚未检查', 'Not checked');
      desc = L('点击「立即检查」查看是否有新版本。', 'Click "Check now" to look for a new version.');
    } else if (!s.ok) {
      st = 'bad'; title = L('检查失败', 'Check failed');
      desc = s.error || '';
    } else if (s.hasUpdate) {
      st = 'new'; title = L('发现新版本', 'Update available');
      desc = L('发布于', 'Published') + ' ' + fmtTime(s.latest && s.latest.publishedAt);
    } else {
      st = 'ok'; title = L('已是最新版本', 'You are up to date');
      desc = L('当前运行的就是最新版本。', 'This is the newest available release.');
    }
    const badge = $('updStateBadge');
    if (badge) {
      badge.className = 'badge ' + ({ ok: 'allow', new: 'reject', bad: 'drop', idle: 'neutral' }[st] || 'neutral');
      badge.textContent = { ok: L('最新', 'Latest'), new: L('有更新', 'Update'), bad: L('检查失败', 'Failed'), idle: L('未检查', 'Not checked') }[st] || st;
    }
    const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setTxt('updMetaVer', rt.version || '—');
    setTxt('updMetaKind', kindLabel(rt.runtime));
    setTxt('updMetaSrc', srcLabel);
    setTxt('updFootLeft', s.checkedAt ? L('上次检查', 'Last check') + ' ' + fmtTime(s.checkedAt) : L('尚未检查', 'Not checked yet'));
    box.innerHTML = `
      <div class="upd-hero ${st}">
        <span class="upd-hero-ico ${st}">${stateIcon(st)}</span>
        <div class="upd-hero-copy">
          <b>${esc(title)}</b>
          <small class="${st === 'bad' ? 'is-err' : ''}">${esc(desc)}</small>
        </div>
        <button class="btn primary" id="updCta" type="button" hidden>${esc(L('立即更新', 'Update now'))}</button>
      </div>
      <div class="kv"><span>${esc(L('当前版本', 'Current version'))}</span><b class="mono">${esc(rt.version || '—')}</b></div>
      <div class="kv"><span>${esc(L('最新版本', 'Latest version'))}</span><b class="mono${s.hasUpdate ? ' upd-new' : ''}">${esc(latestV)}</b></div>
      ${s.hasUpdate && s.latest && s.latest.publishedAt ? `<div class="kv"><span>${esc(L('发布时间', 'Published'))}</span><b>${esc(fmtTime(s.latest.publishedAt))}</b></div>` : ''}
      <div class="kv"><span>${esc(L('运行方式', 'Runtime'))}</span><b>${esc(kindLabel(rt.runtime))}</b></div>
      <div class="kv"><span>${esc(L('检测源', 'Source'))}</span><b>${esc(srcLabel)}</b></div>
      <div class="kv"><span>${esc(L('上次检查', 'Last check'))}</span><b>${esc(fmtTime(s.checkedAt))}</b></div>
      ${s.proxyUsed ? `<div class="kv"><span>${esc(L('网络', 'Network'))}</span><b>${esc(L('经代理', 'via proxy'))}</b></div>` : ''}
      ${s.downloaded ? `<div class="notice blue">${ic('download')}<div>${esc(L('已下载', 'Downloaded'))}: <b>${esc(s.downloaded.name)}</b> · ${esc(fmtSize(s.downloaded.size))}</div></div>` : ''}
      ${st === 'bad' ? `<div class="notice">${ic('alert')}<div>${esc(L('网络受限时，可在「网络与高级选项」填写代理或镜像源后重试。', 'If network is blocked, set a proxy or mirror under "Network & advanced" and retry.'))}</div></div>` : ''}`;

    const cta = $('updCta');
    if (cta) {
      cta.onclick = applySelf;   // 可用性由 paintSelf 统一控制
      if (state.authRole === 'read') cta.hidden = true;
    }
    const chk = $('updCheck');
    if (chk && runCheck) chk.onclick = () => runCheck(chk);
    const cmd = $('updDockerCmd');
    if (cmd) cmd.textContent = (d.limits && d.limits.dockerCommand) || '';
  }

  /* ---------- 更新能力：只控制焦点卡的「立即更新」按钮 + 一行自检说明 + 进度 ---------- */
  function paintSelf(d) {
    window.__updSelfCache = d;
    const dk = d.docker || {};
    const kind = d.kind || 'source';
    const r = d.result;

    /* 唯一的更新入口：源码运行隐藏；桌面/Docker 可用即显示，忙时禁用 */
    const cta = $('updCta');
    if (cta) {
      cta.hidden = state.authRole === 'read' || kind === 'source' || !d.available;
      cta.disabled = !d.available || !!d.busy;
      cta.textContent = kind === 'docker' ? L('拉取并重建', 'Pull & recreate') : L('立即更新', 'Update now');
      const why = !d.available
        ? ((d.reason || '').split('\n')[0] || L('当前环境不支持一键更新', 'Auto-update unavailable here'))
        : (d.busy ? L('正在更新…', 'Updating…') : L('下载更新包并自动重启，配置与数据保留', 'Download the bundle and restart; config and data are kept'));
      cta.title = why;
    }

    /* 自检说明：不可用时给原因，有结果时给上次结果 */
    const note = $('updSelfNote');
    if (note) {
      let html = '';
      if (!d.available) {
        const reason = (d.reason || '').split('\n')[0] || L('当前环境不支持一键更新', 'Auto-update unavailable here');
        html = `<div class="notice">${ic('alert')}<div><b>${esc(L('一键更新不可用', 'Auto-update unavailable'))}</b>：${esc(reason)}${kind === 'docker' && dk.socketExists ? `<br><span class="mono" style="font-size:10px">socket ${esc(dk.socket)} · gid=${dk.socketGid} · uid/gid ${dk.processUid}/${dk.processGid}${dk.accessible === false ? ' · ' + esc(L('无权访问', 'no access')) : ''}</span>` : ''}</div></div>`;
      } else if (r) {
        html = r.ok && !r.rolledBack
          ? `<div class="notice green">${ic('check')}<div><b>${esc(L('上次更新成功', 'Last update succeeded'))}</b> · ${esc(r.version || '')} · ${esc(fmtTime(r.finishedAt || r.verifiedAt || r.at))}</div></div>`
          : `<div class="notice">${ic('alert')}<div><b>${esc(L('上次更新失败', 'Last update failed'))}</b> · ${esc(r.error || (r.rolledBack ? 'rolled back' : ''))}</div></div>`;
      }
      note.innerHTML = html;
    }

    /* 运行环境 rail：与 DHCP/DNS 卡片一致的 kv 行 */
    const env = $('updEnvBody');
    if (env) {
      env.innerHTML = `
        <div class="kv"><span>${esc(L('运行方式', 'Runtime'))}</span><b>${esc(kindLabel(kind))}</b></div>
        <div class="kv"><span>${esc(L('一键更新', 'Auto-update'))}</span><b>${d.available ? esc(L('可用', 'Available')) : esc(L('不可用', 'Unavailable'))}</b></div>
        ${kind === 'docker' ? `<div class="kv"><span>Docker socket</span><b class="mono">${dk.socketExists ? esc(L('已映射', 'Mounted')) : esc(L('未映射', 'Missing'))}</b></div>` : ''}
        <div class="kv"><span>${esc(L('数据目录', 'Data directory'))}</span><b class="mono">/data</b></div>
        <div class="kv"><span>${esc(L('配置与数据', 'Config & data'))}</span><b>${esc(L('更新时保留', 'Kept on update'))}</b></div>`;
    }

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
      setSelfProgress('', 'ok', { stage: 'done', message: L('更新完成，正在刷新页面…', 'Update finished — refreshing…') });
      /* 更新完成后整页刷新：确保前端静态资源也换到新版本，而不只是数据重载 */
      setTimeout(() => location.reload(), 400);
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
    const btn = $('updCta'); if (btn) btn.disabled = true;
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
    const note = $('updSourceNote');
    if (note) {
      const src = cfg.configSource === 'webui' ? L('WebUI（当前生效）', 'WebUI (active)')
        : cfg.configSource === 'env' ? L('部署环境变量（WebUI 保存后将被覆盖）', 'Deployment env (overridden once saved in WebUI)')
        : L('默认值', 'Default');
      const ep = cfg.effectiveEndpoint || (cfg.endpoint || '');
      note.innerHTML = `<b>${esc(L('配置来源', 'Config source'))}：</b>${esc(src)}<br><b>${esc(L('生效端点', 'Active endpoint'))}：</b>${esc(ep || '—')}`;
    }
    toggleSource();
  }
  function toggleSource() {
    const hub = !!($('updSource') && $('updSource').value === 'dockerhub');
    const row = $('updHubRow'); if (row) row.style.display = hub ? '' : 'none';
    const ch = $('updChannelRow'); if (ch) ch.style.display = hub ? 'none' : '';
  }

  window.renderUpdatesPage = function renderUpdatesPage() {
    $('content').className = 'content dash pg-updates';
    $('content').innerHTML = `
      <div class="page-head" id="updPage" data-kind="source">
        <div><h1>${esc(L('检查更新', 'Updates'))}</h1>
          <div class="meta"><span>ROS Center <b class="mono" id="updMetaVer">—</b></span><span class="sep"></span><span id="updMetaKind">—</span><span class="sep"></span><span id="updMetaSrc">—</span></div></div>
        <div class="actions">
          ${canEditNow() ? `<button class="btn ghost" id="updCheck" type="button">${ic('refresh')}${esc(L('立即检查', 'Check now'))}</button>` : ''}
        </div>
      </div>

      <div class="grid align-start">
        <section class="card span8">
          <div class="card-head"><div><h2 class="card-title">${esc(L('版本状态', 'Version status'))}</h2><div class="card-sub">${esc(L('当前版本 · 最新版本 · 自检结果', 'Current, latest and self-check'))}</div></div><span class="badge neutral" id="updStateBadge">${esc(L('加载中', 'Loading'))}</span></div>
          <div class="rail-body" id="updStatus"><div class="pg-empty">${esc(L('加载中…', 'Loading…'))}</div></div>
          <div class="pg-upd-note" id="updSelfNote"></div>
          <div class="pg-upd-note" id="updSelfProgress"></div>
          <div class="table-foot"><span id="updFootLeft">—</span><span class="mono">/api/update/status</span></div>
        </section>

        <div class="span4 rail">
          <section class="card">
            <div class="card-head"><div><h2 class="card-title">${esc(L('运行环境', 'Runtime'))}</h2><div class="card-sub">${esc(L('运行方式与自更新能力', 'Runtime and self-update capability'))}</div></div></div>
            <div class="rail-body" id="updEnvBody"><div class="kv"><span>${esc(L('运行方式', 'Runtime'))}</span><b>—</b></div></div>
          </section>
          <section class="card">
            <div class="card-head"><div><h2 class="card-title">${esc(L('更新方式', 'How updates work'))}</h2><div class="card-sub">${esc(L('Docker · 桌面版 · 源码运行', 'Docker, desktop, source'))}</div></div></div>
            <div class="rail-body">
              <div class="notice blue">${ic('shield')}<div>${esc(L('更新只替换程序文件，配置与数据完整保留；失败自动回滚。', 'Updates only swap program files; config and data are kept, with rollback on failure.'))}</div></div>
              <div class="kv"><span>${esc(L('需重启服务', 'Restart required'))}</span><b>${esc(L('是', 'Yes'))}</b></div>
              <div class="kv"><span>${esc(L('页面自动重连', 'Auto reconnect'))}</span><b>${esc(L('是', 'Yes'))}</b></div>
              <div class="kv"><span>${esc(L('手动命令', 'Manual command'))}</span><b class="mono">git pull && restart</b></div>
            </div>
          </section>
        </div>

        ${canEditNow() ? `<section class="card span8">
          <div class="card-head"><div><h2 class="card-title">${esc(L('更新设置', 'Update settings'))}</h2><div class="card-sub">${esc(L('自动检查 · 检测源 · 网络与高级选项', 'Auto-check, source, network & advanced'))}</div></div><span class="badge info">SELF-UPDATE</span></div>
          <div class="rail-body">
            <div class="kv"><span>${esc(L('自动检查', 'Auto-check'))}<small>${esc(L('服务端定时检查，无需保持浏览器打开', 'Server-side schedule; no browser needed'))}</small></span>
              <b style="display:flex;align-items:center;gap:8px">
                <label class="upd-switch"><input type="checkbox" id="updEnabled"><i></i></label>
                <select id="updInterval" class="upd-inline-sel" aria-label="${esc(L('检查周期', 'Interval'))}">
                  <option value="1">1 ${esc(L('小时', 'h'))}</option><option value="6">6 ${esc(L('小时', 'h'))}</option>
                  <option value="12">12 ${esc(L('小时', 'h'))}</option><option value="24">24 ${esc(L('小时', 'h'))}</option>
                  <option value="168">7 ${esc(L('天', 'd'))}</option><option value="720">30 ${esc(L('天', 'd'))}</option></select>
              </b></div>
            <div class="kv upd-only-desktop"><span>${esc(L('自动下载安装包', 'Auto-download'))}<small>${esc(L('发现新版本时提前下载', 'Download the installer when a new version appears'))}</small></span>
              <b><label class="upd-switch"><input type="checkbox" id="updAutoDownload"><i></i></label></b></div>
            <div class="kv" id="updAutoApplyRow"><span><b id="updAutoApplyLabel" style="font-size:11px;color:var(--v2-ink-2)">${esc(L('自动更新', 'Auto-update'))}</b><small>${esc(L('发现新版本时自动应用', 'Apply new versions automatically'))}</small></span>
              <b><label class="upd-switch"><input type="checkbox" id="updAutoApply"><i></i></label></b></div>
            <div class="kv"><span>${esc(L('检测源', 'Source'))}<small>${esc(L('随运行方式固定', 'Fixed by runtime'))}</small></span>
              <b><select id="updSource" class="upd-inline-sel" disabled><option value="github">GitHub Releases</option><option value="dockerhub">Docker Hub</option></select></b></div>
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
              <div class="upd-source-note" id="updSourceNote"></div>
              <div class="form-row"><label>${esc(L('HTTP 代理', 'HTTP proxy'))}</label><div>
                <input type="text" id="updProxy" placeholder="http://[user:pass@]host:port" autocomplete="off">
                <div class="form-hint">${esc(L('服务端检查请求经此 CONNECT 代理；密码读取时以 *** 显示。', 'Server checks via this CONNECT proxy; stored password is masked on read.'))}</div></div></div>
            </details>
            <div class="pg-btn-row"><button class="btn primary" id="updSave" type="button">${esc(L('保存设置', 'Save'))}</button>
              <button class="btn" id="updCheck2" type="button">${esc(L('保存并检查', 'Save & check'))}</button></div>
          </div>
        </section>` : ''}

        <section class="card span4">
          <div class="card-head"><div><h2 class="card-title">${esc(L('工作原理与安全', 'How it works & safety'))}</h2><div class="card-sub">${esc(L('Docker 手动更新命令', 'Manual Docker command'))}</div></div></div>
          <div class="rail-body">
            <div class="notice">${ic('device')}<div><b>Docker</b>：${esc(L('映射 /var/run/docker.sock 后可一键拉取并重建；/app/data 未挂载时会拒绝执行。映射 socket 等同宿主机 root 级权限。', 'With docker.sock mounted the app pulls and recreates the container; refused when /app/data is not mounted. Socket access is host-root-equivalent.'))}</div></div>
            <pre class="upd-cmd" id="updDockerCmd"></pre>
            <div class="notice">${ic('code')}<div><b>${esc(L('源码运行', 'Source'))}</b>：${esc(L('无需自更新，git pull 后重启进程即可；data/ 目录不受影响。', 'No self-update; git pull and restart the process. data/ is untouched.'))}</div></div>
          </div>
        </section>
      </div>`;

    const srcSel = $('updSource');
    if (srcSel) srcSel.onchange = toggleSource;
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
      try { await checkUpdatesModal(); }
      catch (e) { toast((e && e.message) || L('检查失败', 'Check failed'), 'err'); await reload(); }
      if (btn) btn.disabled = false;
    };
    runCheck = check;
    const saveBtn = $('updSave');
    if (saveBtn) saveBtn.onclick = async () => { try { await save(); toast(L('设置已保存', 'Settings saved'), 'ok'); } catch (e) { toast(e.message, 'err'); } };
    const check2Btn = $('updCheck2');
    if (check2Btn) check2Btn.onclick = async () => { try { await save(); await check(check2Btn, true); } catch (e) { toast(e.message, 'err'); } };
    reload(true).then(loadSelf);
    checkResume();
  };
})();
