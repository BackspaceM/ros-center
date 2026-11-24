'use strict';
/* 检查更新 / 自动更新设置页 */
(function () {
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

  async function reload(fillForm = false) {
    try {
      const d = await api('/api/update/status');
      paint(d);
      if (fillForm) fill(d.config);   // 首次进入用服务端配置填表，后续刷新不覆盖正在编辑的内容
    } catch (e) { toast(e.message, 'err'); }
  }

  function fill(cfg) {
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    const chk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    chk('updEnabled', cfg.enabled);
    chk('updAutoDownload', cfg.autoDownload);
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

      <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>${esc(L('自动更新的边界', 'What auto-update can do'))}</h2></div></div>
        <div class="panel-body">
          <div class="modal-note" style="font-size:11.5px;color:var(--muted);line-height:1.8">
            ${esc(L('WebUI 无法替换正在运行的自身进程，也无法重建容器。这里的「自动更新」= 定时检查 +（可选）自动下载新安装包；安装动作仍需你完成。', 'The WebUI cannot replace its own running process or recreate its container. Auto-update here means scheduled checking plus optional asset download; installation is still a manual step.'))}
            <br>${esc(L('桌面版：下载的安装包保存在 数据目录/updates/，退出程序后手动安装覆盖即可。', 'Desktop: assets land in data/updates/; quit the app and install manually.'))}
            <br>${esc(L('Docker 版：直接拉取新镜像并重建容器：', 'Docker: pull the new image and recreate the container:'))}
            <pre class="upd-cmd" id="updDockerCmd"></pre>
            ${esc(L('Docker Hub 检测默认比对镜像 digest；可用 ROS_CENTER_DIGEST 环境变量传入当前 digest，否则以上次构建时间变化判定。', 'Docker Hub checks compare the image digest; pass the current digest via ROS_CENTER_DIGEST, otherwise build-time changes are used.'))}
          </div>
        </div></div>`;

    $('updSource').onchange = toggleSource;
    const collect = () => ({
      enabled: $('updEnabled').checked,
      autoDownload: $('updAutoDownload').checked,
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
    reload(true);
  };
})();
