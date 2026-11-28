'use strict';
/* ============================================================
   Pages v3 · 设备与固件 / 用户与权限 / 日志中心
   结构复刻 design/devices.html · users.html · logs.html，
   数据全部来自 ros-center API 与 RouterOS REST。
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const ex = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (id, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d == null ? 0 : d); };
  const CUSTOM = new Set(['devices', 'usersCenter', 'logsCenter', 'dataPolicy', 'connectionStats', 'webuiSettings', 'webuiBackup']);
  /* 只读 WebUI 账户：隐藏所有写操作入口（服务端同样会拒绝非 GET 请求） */
  const canWrite = () => state.authRole !== 'read';
  /* 本地二维码渲染：qrcode.bundle.js 提供 window.QRCode.toCanvas */
  function qrTo(canvas, text, size) {
    if (!canvas || !text) return false;
    const Q = window.QRCode;
    if (!Q || typeof Q.toCanvas !== 'function') return false;
    try {
      Q.toCanvas(canvas, text, { width: size || 220, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1a2340', light: '#ffffff' } });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 连接统计（从流量统计移出的 IPv4 / IPv6 连接状态） ---------- */
  const CS_PAGE = 20;
  const CS = { ip: 'v4', q: '', rows: { v4: [], v6: [] }, page: { v4: 0, v6: 0 }, stats: null, loadedAt: 0, loading: false, err: '' };
  function csFilteredRows() {
    const all = CS.rows[CS.ip] || [];
    const q = CS.q.trim().toLowerCase();
    return q ? all.filter((r) => [r['src-address'], r['dst-address'], r.protocol, r['connection-state'], r.comment].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0)) : all;
  }
  async function loadConnectionStats(force) {
    if (CS.loading) return;
    if (!force && CS.loadedAt && Date.now() - CS.loadedAt < 8000) { paintConnectionStats(); return; }
    CS.loading = true;
    try {
      const [v4, v6] = await Promise.all([
        api('/api/config?section=connections').catch(() => null),
        api('/api/config?section=connections6').catch(() => null),
      ]);
      CS.rows.v4 = (v4 && v4.rows) || [];
      CS.rows.v6 = (v6 && v6.rows) || [];
      ['v4', 'v6'].forEach((ip) => {
        const pages = Math.max(1, Math.ceil((CS.rows[ip] || []).length / CS_PAGE));
        CS.page[ip] = Math.max(0, Math.min(CS.page[ip] || 0, pages - 1));
      });
      CS.err = (v4 && v4.error) || (v6 && v6.error) || '';
      CS.loadedAt = Date.now();
    } catch (e) { CS.err = (e && e.message) || '加载失败'; }
    CS.loading = false;
    if (state.section === 'connectionStats') paintConnectionStats();
  }
  function connStateOf(r) {
    const st = String(r['connection-state'] || r['tcp-state'] || '').toLowerCase();
    if (/established/.test(st)) return { label: '已建立', badge: 'allow' };
    if (/syn-sent|syn-recv|handshake/.test(st)) return { label: '新建', badge: 'info' };
    if (/time-wait|closing|close/.test(st)) return { label: '关闭中', badge: 'neutral' };
    if (/invalid/.test(st)) return { label: '无效', badge: 'reject' };
    return { label: '活跃', badge: 'info' };
  }
  function connectionStatsHtml() {
    const rowsAll = CS.rows[CS.ip] || [];
    const rows = csFilteredRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / CS_PAGE));
    const p = Math.max(0, Math.min(CS.page[CS.ip] || 0, totalPages - 1));
    CS.page[CS.ip] = p;
    const start = rows.length ? p * CS_PAGE : 0;
    const end = Math.min(start + CS_PAGE, rows.length);
    const proto = (r) => String(r.protocol || 'tcp').toLowerCase();
    const cnt = { tcp: 0, udp: 0, other: 0, dynamic: 0, static: 0 };
    rowsAll.forEach((r) => {
      const p = proto(r); cnt[p === 'tcp' || p === 'udp' ? p : 'other']++;
      if (r.dynamic === 'true' || r.dynamic === true) cnt.dynamic++; else cnt.static++;
    });
    const devName = (state.deviceName || '主路由').replace(/\s*\(.*$/, '');
    const total = rowsAll.length;
    const bytes = (v) => { const n = num(v); return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B'; };
    const tableRows = rows.slice(start, end).map((r) => {
      const cs = connStateOf(r);
      const p = proto(r);
      const addr = `${ex(r['src-address'] || '—')} <span style="color:var(--v2-faint)">→</span> ${ex(r['dst-address'] || '—')}`;
      return `<tr>
        <td data-label="${esc(L('连接', 'Connection'))}"><div class="flow-conn"><b>${addr}</b><small class="mono">${ex(r['src-port'] || '')} → ${ex(r['dst-port'] || '')}</small></div></td>
        <td data-label="${esc(L('协议', 'Protocol'))}"><span class="proto-tag ${p}">${ex(p)}</span></td>
        <td data-label="${esc(L('状态', 'State'))}"><span class="badge ${cs.badge}">${esc(cs.label)}</span></td>
        <td class="r" data-label="${esc(L('流量', 'Traffic'))}"><span class="num">${bytes((num(r['orig-bytes']) + num(r['repl-bytes'])) || num(r.bytes))}</span></td>
        <td data-label="${esc(L('类型', 'Type'))}"><span class="chain">${r.dynamic === 'true' || r.dynamic === true ? '动态' : '静态'}</span></td>
      </tr>`;
    }).join('');
    const seg = `<div class="seg cs-seg"><button type="button" data-ip="v4" class="${CS.ip === 'v4' ? 'on' : ''}">IPv4</button><button type="button" data-ip="v6" class="${CS.ip === 'v6' ? 'on' : ''}">IPv6</button></div>`;
    const pager = `<div class="cs-pager">
      ${p > 0 ? `<button class="btn ghost" type="button" data-cs-page="prev">${esc(L('上一页', 'Prev'))}</button>` : ''}
      <span class="cs-pager-info">${esc(L('第', 'Page'))} ${p + 1} / ${totalPages} ${esc(L('页', ''))}</span>
      <button class="btn ghost" type="button" data-cs-page="next"${p >= totalPages - 1 ? ' disabled' : ''}>${esc(L('下一页', 'Next'))}</button>
      <button class="btn ghost" type="button" data-cs-page="last"${p >= totalPages - 1 ? ' disabled' : ''}>${esc(L('尾页', 'Last'))}</button>
    </div>`;
    return `<div class="page-head">
      <div><h1>${esc(L('连接统计', 'Connection stats'))}</h1><div class="meta">${esc(devName)}<span class="sep"></span>${CS.ip.toUpperCase()}<span class="sep"></span>${total} ${esc(L('条连接', 'connections'))}</div></div>
    </div>
    ${CS.err ? `<div class="notice" style="color:var(--v2-red)">${ex(CS.err)}</div>` : ''}
    <div class="kpis" style="margin-bottom:14px">
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico blue">${ic('conn')}</span>${esc(L('连接状态', 'Connection status'))}</div>
        <div class="kpi-main"><div class="kpi-num">${total}</div>${seg}</div>
        <div class="kpi-foot"><span>${esc(L('TCP', 'TCP'))} ${cnt.tcp}</span><span>${esc(L('UDP', 'UDP'))} ${cnt.udp}</span></div></article>
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico green">${ic('check')}</span>${esc(L('已启用', 'Enabled'))}</div>
        <div class="kpi-main"><div class="kpi-num">${cnt.dynamic + cnt.static}</div></div>
        <div class="kpi-foot"><span>${esc(L('动态', 'Dynamic'))} ${cnt.dynamic}</span><span>${esc(L('静态', 'Static'))} ${cnt.static}</span></div></article>
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico teal">${ic('pulse')}</span>${esc(L('动态条数', 'Dynamic entries'))}</div>
        <div class="kpi-main"><div class="kpi-num">${cnt.dynamic}</div></div>
        <div class="kpi-foot"><span>${esc(L('由 RouterOS 连接跟踪维护', 'Maintained by conntrack'))}</span></div></article>
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico violet">${ic('layers')}</span>${esc(L('条目分布', 'Entry mix'))}</div>
        <div class="kpi-main"><div class="kpi-num" style="font-size:20px">${cnt.tcp} <span class="u">TCP</span> / ${cnt.udp} <span class="u">UDP</span></div></div>
        <div class="kpi-foot"><span>${esc(L('其他', 'Other'))} ${cnt.other}</span><span>${CS.ip.toUpperCase()}</span></div></article>
    </div>
    <div class="notice blue" style="margin:0 0 14px">${ic('clock')}<div><b>${esc(L('使用提醒', 'Note'))}</b>：${esc(L('连接表来自 RouterOS 实时 conntrack，条目随会话建立与关闭动态变化；切换上方 IPv4 / IPv6 查看对应协议。', 'Entries come from live RouterOS conntrack and change as sessions open/close. Switch IPv4 / IPv6 above to view each protocol.'))}</div></div>
    <section class="card span12"><div class="card-head"><div><h2 class="card-title">${CS.ip.toUpperCase()} ${esc(L('连接明细', 'Connection entries'))}</h2>
      <div class="card-sub">${esc(L('来自 /ip/firewall/connection 与 /ipv6/firewall/connection', 'From firewall connection tables'))}</div></div>
      <label class="field">${ic('search')}<input id="csSearch" placeholder="${esc(L('搜索地址 / 协议 / 状态…', 'Search address / protocol / state…'))}" value="${ex(CS.q)}"></label></div>
      <div class="table-scroll"><table class="dt"><colgroup><col style="width:40%"><col style="width:10%"><col style="width:14%"><col style="width:14%"><col style="width:12%"></colgroup>
      <thead><tr><th>${esc(L('连接', 'Connection'))}</th><th>${esc(L('协议', 'Protocol'))}</th><th>${esc(L('状态', 'State'))}</th><th class="r">${esc(L('流量', 'Traffic'))}</th><th>${esc(L('类型', 'Type'))}</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="5" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无连接条目', 'No connection entries'))}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${esc(L('显示', 'Showing'))} ${rows.length ? (start + 1) + '–' + end : 0} / ${rows.length} ${esc(L('条', 'entries'))}</span>${pager}<span class="mono">${esc(relTime(CS.loadedAt))}</span></div>
    </section>`;
  }
  function paintConnectionStats() {
    const c = $('content'); if (!c || state.section !== 'connectionStats') return;
    c.className = 'content dash pg-connstats';
    c.innerHTML = connectionStatsHtml();
    c.querySelectorAll('.cs-seg [data-ip]').forEach((b) => { b.onclick = () => { CS.ip = b.dataset.ip; paintConnectionStats(); }; });
    c.querySelectorAll('.cs-pager [data-cs-page]').forEach((b) => {
      b.onclick = () => {
        const totalPages = Math.max(1, Math.ceil(csFilteredRows().length / CS_PAGE));
        const p = Math.max(0, Math.min(CS.page[CS.ip] || 0, totalPages - 1));
        const to = b.dataset.csPage;
        CS.page[CS.ip] = to === 'prev' ? Math.max(0, p - 1)
          : to === 'next' ? Math.min(totalPages - 1, p + 1)
            : to === 'last' ? totalPages - 1 : p;
        paintConnectionStats();
      };
    });
    const s = $('csSearch'); if (s) s.oninput = () => { CS.q = s.value; CS.page[CS.ip] = 0; paintConnectionStats(); const n = $('csSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  }

  /* ---------- 数据采集保留策略（RouterOS设置 → 数据采集保留） ---------- */
  const DP = { data: null, err: '', loading: false };
  function fmtBytes(n) {
    n = num(n); if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  async function loadDataPolicy() {
    if (DP.loading) return;
    DP.loading = true;
    try { DP.data = await api('/api/data-policy'); DP.err = ''; }
    catch (e) { DP.err = (e && e.message) || '加载失败'; }
    DP.loading = false;
    if (state.section === 'dataPolicy') paintDataPolicy();
  }
  function dataPolicyHtml() {
    const d = DP.data || {};
    const adv = d.advice || { chunkMB: 5, maxFiles: 30, keepDays: 30, note: '' };
    const stats = Array.isArray(d.stats) ? d.stats : [];
    const totalFiles = stats.reduce((s, x) => s + num(x.files), 0);
    const totalBytes = stats.reduce((s, x) => s + num(x.bytes), 0);
    /* 份数/容量上限 = 各设备「最大保存份数」与「单份最大容量 × 最大保存份数」之和，而非全局单值 */
    const polOf = (s) => s.policy || { chunkMB: d.chunkMB, maxFiles: d.maxFiles, keepDays: d.keepDays };
    const capFiles = stats.length ? stats.reduce((s, x) => s + num(polOf(x).maxFiles, 30), 0) : num(d.maxFiles, 30);
    const capBytes = stats.length
      ? stats.reduce((s, x) => s + num(polOf(x).chunkMB, 5) * 1024 * 1024 * num(polOf(x).maxFiles, 30), 0)
      : num(d.chunkMB, 5) * 1024 * 1024 * num(d.maxFiles, 30);
    const rows = stats.map((s) => {
      const pol = s.policy || { chunkMB: d.chunkMB, maxFiles: d.maxFiles, keepDays: d.keepDays };
      return `<tr>
      <td data-label="${esc(L('设备', 'Device'))}"><div class="if-name"><span class="if-badge eth">rtr</span><span class="cell"><b>${ex(s.name)}</b><small class="mono">${ex(s.id)} · ${num(pol.chunkMB)} MB · ${num(pol.maxFiles)} ${esc(L('份', 'files'))} · ${num(pol.keepDays)} ${esc(L('天', 'days'))}${s.custom ? ' · ' + esc(L('独立策略', 'Custom')) : ' · ' + esc(L('继承全局', 'Global'))}</small></span></div></td>
      <td class="r" data-label="${esc(L('分片数', 'Files'))}"><span class="num">${num(s.files)}</span></td>
      <td class="r" data-label="${esc(L('占用', 'Size'))}"><span class="num">${fmtBytes(s.bytes)}</span></td>
      <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="dp-dev-more" data-id="${ex(s.id)}" title="${esc(L('单独调整保留策略', 'Adjust retention'))}">${ic('more')}</button></td>
    </tr>`;
    }).join('');
    return `<div class="page-head">
      <div><h1>${esc(L('数据持久化', 'Data persistence'))}</h1>
        <div class="meta">${esc(L('趋势采样持久化', 'Trend samples'))}<span class="sep"></span>${L('保存于', 'Stored in')} /data/trend<span class="sep"></span>${esc(L('已用', 'Used'))} ${fmtBytes(totalBytes)}</div></div>
    </div>
    ${DP.err ? `<div class="notice" style="color:var(--v2-red)">${ex(DP.err)}</div>` : ''}
    <div class="kpis">${[
      `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico blue">${ic('layers')}</span>${esc(L('单份最大容量', 'Max file size'))}</div>
        <div class="kpi-main"><div class="kpi-num">${num(d.chunkMB, 5)}<span class="u">MB</span></div></div>
        <div class="kpi-foot"><span>${esc(L('超过自动分片', 'Auto-split when exceeded'))}</span><span>${L('建议', 'Suggest')} ${adv.chunkMB} MB</span></div></article>`,
      `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico teal">${ic('layers')}</span>${esc(L('最大保存份数', 'Max files'))}</div>
        <div class="kpi-main"><div class="kpi-num">${num(d.maxFiles, 30)}<span class="u">${esc(L('份', 'files'))}</span></div></div>
        <div class="kpi-foot"><span>${esc(L('超过覆盖旧数据', 'Overwrite oldest'))}</span><span>${L('建议', 'Suggest')} ${adv.maxFiles}</span></div></article>`,
      `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico violet">${ic('clock')}</span>${esc(L('保留天数', 'Retention days'))}</div>
        <div class="kpi-main"><div class="kpi-num">${num(d.keepDays, 30)}<span class="u">${esc(L('天', 'days'))}</span></div></div>
        <div class="kpi-foot"><span>${esc(L('过期桶自动清理', 'Expired buckets purged'))}</span><span>${L('建议', 'Suggest')} ${adv.keepDays}</span></div></article>`,
      `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico green">${ic('layers')}</span>${esc(L('当前分片', 'Current files'))}</div>
        <div class="kpi-main"><div class="kpi-num">${totalFiles}<span class="u">${esc(L('份', 'files'))}</span></div></div>
        <div class="kpi-foot"><span>${esc(L('所有设备合计', 'All devices'))}</span><span>${fmtBytes(totalBytes)}</span></div></article>`,
    ].join('')}</div>
    <div class="notice blue" style="margin:14px 0">${ic('clock')}<div><b>${esc(L('一个月保存建议值', 'One-month suggestion'))}</b>：${esc(adv.note || '单份 5 MB · 最多 30 份 · 保留 30 天')}</div></div>
    <div class="grid align-start">
      <section class="card span8"><div class="card-head"><div><h2 class="card-title">${esc(L('各设备采集数据', 'Samples per device'))}</h2>
        <div class="card-sub">${esc(L('速率趋势按天分片存储，重启不丢失', 'Trend stored per-day, survives restart'))}</div></div></div>
        <div class="table-scroll"><table class="dt"><colgroup><col style="width:52%"><col style="width:16%"><col style="width:20%"><col></colgroup>
        <thead><tr><th>${esc(L('设备', 'Device'))}</th><th class="r">${esc(L('分片数', 'Files'))}</th><th class="r">${esc(L('占用', 'Size'))}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无采集数据', 'No samples yet'))}</td></tr>`}</tbody></table></div>
        <div class="table-foot"><span>${totalFiles} ${esc(L('份', 'files'))} · ${fmtBytes(totalBytes)} · /data/trend</span>
          <span>${esc(L('每台设备可通过右侧三点单独调整', 'Use the row menu to tune each device'))}</span></div>
      </section>
      <div class="span4 rail">
        <section class="card"><div class="card-head"><div><h2 class="card-title">${esc(L('持久化策略', 'Persistence policy'))}</h2>
          <div class="card-sub">${esc(L('/data/trend 趋势分片', '/data/trend shards'))}</div></div></div>
          <div class="rail-body">
            <div class="kv"><span>${esc(L('单份最大容量', 'Max file size'))}</span><b>${num(d.chunkMB, 5)} MB</b></div>
            <div class="kv"><span>${esc(L('最大保存份数', 'Max files'))}</span><b>${num(d.maxFiles, 30)}</b></div>
            <div class="kv"><span>${esc(L('保留天数', 'Retention days'))}</span><b>${num(d.keepDays, 30)}</b></div>
            <div class="kv"><span>${esc(L('存储位置', 'Location'))}</span><b class="mono">/data/trend</b></div>
            <div class="sub-note">${esc(L('此卡片为全局默认值；需要不同保留周期的设备，请使用上方列表行末的三点菜单单独设置。', 'These are global defaults. Use the row menu above to override retention per device.'))}</div>
          </div></section>
        <section class="card"><div class="card-head"><div><h2 class="card-title">${esc(L('分片占用', 'Shard usage'))}</h2>
          <div class="card-sub">${esc(L('份数与容量', 'Files and size'))}</div></div></div>
          <div class="rail-body">
            <div class="usage-summary"><b>${totalFiles}</b><span>${esc(L('份分片 · ', 'shards · ') + fmtBytes(totalBytes))}</span></div>
            <div class="usage-bar" style="height:7px;margin:10px 0 8px"><i style="width:${capFiles ? Math.min(100, totalFiles * 100 / capFiles) : 0}%;background:var(--v2-accent)"></i></div>
            <div class="kv"><span>${esc(L('份数上限', 'File quota'))}</span><b>${capFiles} ${esc(L('份', 'files'))}</b></div>
            <div class="kv"><span>${esc(L('容量上限', 'Size quota'))}</span><b>${fmtBytes(capBytes)}</b></div>
            <div class="sub-note">${esc(L('每台设备最多保留 ', 'Each device keeps up to ') + num(d.maxFiles, 30) + L(' 份，超出覆盖最旧分片', ' shards; oldest overwritten'))}</div>
            <div class="sub-note">${esc(L('上限为各设备「单份最大容量 × 最大保存份数」之和。', 'Quota is the sum of each device’s max file size × max files.'))}</div>
          </div></section>
      </div>
    </div>`;
  }
  function paintDataPolicy() {
    const c = $('content'); if (!c || state.section !== 'dataPolicy') return;
    c.className = 'content dash pg-dataPolicy';
    c.innerHTML = dataPolicyHtml();
  }
  function openDataPolicyForm(deviceId) {
    const d = DP.data || {};
    const stats = Array.isArray(d.stats) ? d.stats : [];
    const dev = deviceId ? stats.find((s) => s.id === deviceId) : null;
    const base = (dev && dev.policy) || { chunkMB: d.chunkMB, maxFiles: d.maxFiles, keepDays: d.keepDays };
    UI.openForm({
      title: dev ? L('调整此设备的保留策略', 'Device retention') : L('调整数据保留策略', 'Adjust data retention'),
      sub: dev
        ? L('仅作用于 ', 'Only for ') + dev.name + L(' 的采集分片，其余设备不受影响', ' shards; other devices keep their policy')
        : L('作用于 /data/trend 下所有设备的采集分片', 'Applies to all device trend shards in /data/trend'),
      note: L('单份超限自动分片；份数超限覆盖旧数据；过期桶自动清理。', 'Auto-split on size limit, overwrite oldest on file limit, purge expired buckets.'),
      fields: [
        { key: 'chunkMB', label: L('单份最大容量 (MB)', 'Max file size (MB)'), type: 'number', value: num(base.chunkMB, 5), hint: L('建议 5 MB · 范围 1–100', 'Suggest 5 MB · 1–100') },
        { key: 'maxFiles', label: L('最大保存份数', 'Max files'), type: 'number', value: num(base.maxFiles, 30), hint: L('建议 30 份 · 范围 2–120', 'Suggest 30 · 2–120') },
        { key: 'keepDays', label: L('保留天数', 'Retention days'), type: 'number', value: num(base.keepDays, 30), hint: L('建议 30 天 · 范围 1–365', 'Suggest 30 · 1–365') }
      ],
      submitLabel: L('保存并应用', 'Save & apply'),
      onSubmit: async (v) => {
        const body = { chunkMB: num(v.chunkMB), maxFiles: num(v.maxFiles), keepDays: num(v.keepDays) };
        if (deviceId) body.deviceId = deviceId;
        try { await api('/api/data-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          UI.toast(dev ? L('已保存此设备的独立策略', 'Device policy saved') : L('数据保留策略已保存', 'Data retention saved'), 'ok'); loadDataPolicy();
        } catch (e) { UI.toast((e && e.message) || '保存失败', 'err'); }
      }
    });
  }
  function resetDataPolicy(deviceId, name) {
    UI.openConfirm({
      title: L('恢复全局策略', 'Use global policy'),
      message: (name || deviceId) + L(' 将删除独立保留策略，改回继承全局默认值。', ' will drop its override and inherit global defaults.'),
      confirmLabel: L('恢复全局', 'Restore'),
      onConfirm: async () => {
        try { await api('/api/data-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, inherit: true }) });
          UI.toast(L('已恢复全局策略', 'Global policy restored'), 'ok'); loadDataPolicy();
        } catch (e) { UI.toast((e && e.message) || '恢复失败', 'err'); }
      },
    });
  }

  const DV = { tab: 'devices', q: '', filter: 'all', rows: null, pkgs: [], up: null, backup: null, files: [], filesErr: '', filesErrs: [], filesAt: 0, bkFilter: 'all', bkCfg: null, err: '', note: '', loading: false, loadedAt: 0 };
  const US = { tab: 'users', q: '', filter: '', users: null, groups: [], active: [], auth: { enabled: false, user: '', users: [] },
    twofa: { enabled: false, configured: false }, webPort: 0, hostPort: 0, demo: false, activeDemo: false,
    err: '', note: '', loading: false, loadedAt: 0 };
  const WEBUI = { users: [], tab: 'accounts', err: '', note: '', loading: false, loadedAt: 0 };
  const LG = { q: '', topic: 'all', live: true, rows: [], demo: false, err: '', note: '', loading: false, at: 0, limit: 12, sig: '', view: [] };
  const LOG_PAGE = 12;
  const RETENTION_KEY = 'rosCenter.logRetention';
  function logRetention() {
    const def = { days: '7', archive: true, size: '512', rotate: L('按天', 'Daily') };
    try {
      const saved = JSON.parse(localStorage.getItem(RETENTION_KEY));
      if (saved && typeof saved === 'object') return { ...def, ...saved };
    } catch (e) { /* ignore */ }
    return def;
  }
  function logBufferStats() {
    const rows = LG.rows || [];
    const pref = logRetention();
    const cap = Math.max(1, Math.min(10240, Number(pref.size) || 512));
    /* 用已读取日志的实际文本量估算内存缓冲占用，避免伪造百分比 */
    const bytes = rows.reduce((n, r) => n + String(r.message || '').length + String(r.topics || '').length + String(r.time || '').length + 24, 0);
    const kb = Math.min(cap, Math.max(rows.length ? 1 : 0, Math.round(bytes / 1024)));
    return { pct: Math.round(kb / cap * 100), kb, cap };
  }

  /* ---------- 小组件 ---------- */
  function st(kind, text) {
    return `<span class="status"><span class="dot is-${ex(kind)}"></span>${ex(text)}</span>`;
  }
  function kpiCard(o) {
    const head = `<div class="kpi-top">${o.icon ? `<span class="kpi-ico ${o.color || 'blue'}">${ic(o.icon)}</span>` : ''}${ex(o.label)}</div>`;
    const unit = o.unit ? `<span class="u${o.pct ? ' pct' : ''}">${ex(o.unit)}</span>` : '';
    let main = `<div class="kpi-num">${ex(o.num)}${unit}</div>`;
    if (o.state) main += st(o.state.dot || 'muted', o.state.text || '');
    else if (o.spark) main += o.spark;
    const foot = o.footHtml || (o.foot || []).map((x) => `<span>${ex(x)}</span>`).join('');
    return `<article class="card kpi">${head}<div class="kpi-main">${main}</div><div class="kpi-foot">${foot}</div></article>`;
  }
  function emptyBox(title, sub, btn) {
    return `<div class="pg-empty">${ic('layers')}<b>${ex(title)}</b><div>${ex(sub || '')}</div>${btn || ''}</div>`;
  }
  function fmtTs(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return '—';
    const p = (x) => String(x).padStart(2, '0');
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function relTime(ts) {
    if (!ts) return L('尚未同步', 'Not synced');
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return L('刚刚', 'just now');
    if (s < 60) return s + L(' 秒前', 's ago');
    const m = Math.floor(s / 60);
    if (m < 60) return m + L(' 分钟前', 'm ago');
    return Math.floor(m / 60) + L(' 小时前', 'h ago');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(String(text || '')); toast(L('已复制', 'Copied'), 'ok'); }
    catch (e) { toast(L('复制失败', 'Copy failed'), 'err'); }
  }
  function downloadCsv(name, header, rows) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function ask(title, msg, danger, okLabel) {
    return new Promise((resolve) => {
      UI.openModal({
        title,
        body: `<p class="pg-confirm-text">${msg}</p>`,
        foot: `<button class="ui-btn" type="button" data-no>${esc(L('取消', 'Cancel'))}</button>
               <button class="ui-btn ${danger ? 'danger' : 'primary'}" type="button" data-yes>${esc(okLabel || L('确认', 'Confirm'))}</button>`,
        onMount(m) {
          m.querySelector('[data-no]').onclick = () => { UI.closeModal(); resolve(false); };
          m.querySelector('[data-yes]').onclick = () => { UI.closeModal(); resolve(true); };
        }
      });
    });
  }
  function initials(name) {
    const s = String(name || '?').trim();
    const parts = s.split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] || '?')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
  }
  function avatarTone(name, group) {
    if (group === 'full') return '';
    if (group === 'read' || group === 'monitor') return 'muted';
    if (group === 'api') return 'violet';
    return 'teal';
  }
  /* 用户头像：WebUI 账户上传的头像保存在 /data/user/avatar/<user>.png；
     RouterOS 账户没有本地头像时回退到首字母色块。 */
  function avatarHtml(name, group, small) {
    const own = name && name === US.auth.user;
    const cls = 'u-avatar ' + avatarTone(name, group) + (small ? ' sm' : '');
    if (own) return `<span class="${cls} has-photo"><img src="/api/user/avatar?t=${US.loadedAt || Date.now()}" alt=""></span>`;
    return `<span class="${cls}">${ex(initials(name))}</span>`;
  }
  const ROS_POLICIES = [
    ['read', L('读取', 'Read'), L('读取配置与状态', 'Read configuration and status')],
    ['write', L('写入', 'Write'), L('修改配置', 'Modify configuration')],
    ['policy', L('策略', 'Policy'), L('管理用户与权限', 'Manage users and policies')],
    ['test', L('测试', 'Test'), L('执行 ping / traceroute 等测试', 'Run ping / traceroute')],
    ['ftp', L('FTP', 'FTP'), L('通过 FTP 登录', 'Log in via FTP')],
    ['reboot', L('重启', 'Reboot'), L('重启 / 关闭路由器', 'Reboot / shutdown router')],
    ['winbox', L('WinBox', 'WinBox'), L('通过 WinBox 登录', 'Log in via WinBox')],
    ['password', L('改密码', 'Password'), L('修改自己的密码', 'Change own password')],
    ['sniff', L('抓包', 'Sniff'), L('使用流量抓包', 'Use packet sniffer')],
    ['sensitive', L('敏感信息', 'Sensitive'), L('查看敏感字段', 'View sensitive fields')],
    ['api', L('API', 'API'), L('通过 RouterOS API 登录', 'Log in via RouterOS API')],
    ['local', L('本机', 'Local'), L('本机终端登录', 'Local terminal login')],
    ['ssh', L('SSH', 'SSH'), L('通过 SSH 登录', 'Log in via SSH')],
    ['web', L('Web', 'Web'), L('通过 WebFig 登录', 'Log in via WebFig')]
  ];
  function groupEditable(g) {
    const p = String((g && g.policy) || '').toLowerCase();
    return /\bwrite\b/.test(p) || /\bpolicy\b/.test(p) || /\bfull\b/.test(String((g && g.name) || '').toLowerCase());
  }
  function openAvatarUpload(userName) {
    UI.openModal({
      title: L('上传头像', 'Upload avatar'),
      sub: L('仅保存在本机 WebUI 数据目录 /data/user/avatar', 'Stored locally in /data/user/avatar'),
      body: `<div class="ui-fields">
        <div class="av-up-wrap">
          ${avatarHtml(userName || US.auth.user, 'full', false)}
          <div><b>${ex(userName || US.auth.user || '—')}</b><small>${esc(L('支持 PNG / JPG / WebP / GIF，最大 2 MB', 'PNG / JPG / WebP / GIF, up to 2 MB'))}</small></div>
        </div>
        <label class="ui-field full"><span>${esc(L('选择图片文件', 'Choose image'))}</span><input type="file" data-f="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
      </div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(L('上传并应用', 'Upload & apply'))}</button>`,
      onMount(m) {
        const file = m.querySelector('[data-f="file"]');
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = () => {
          const f = file && file.files && file.files[0];
          if (!f) { toast(L('请先选择图片', 'Choose an image first'), 'err'); return; }
          if (f.size > 2 * 1024 * 1024) { toast(L('图片不能超过 2 MB', 'Image must be under 2 MB'), 'err'); return; }
          const rd = new FileReader();
          rd.onload = async () => {
            try {
              await api('/api/user/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: String(rd.result) }) });
              UI.closeModal();
              window.dispatchEvent(new Event('ros-avatar-updated'));
              toast(L('头像已更新', 'Avatar updated'), 'ok');
              US.loadedAt = Date.now(); paintUsersPanel();
            } catch (e) { toast((e && e.message) || L('上传失败', 'Upload failed'), 'err'); }
          };
          rd.readAsDataURL(f);
        };
      }
    });
  }
  function openTwoFactorModal() {
    if (!US.auth.enabled) { toast(L('请先设置 WebUI 账户密码', 'Set a WebUI password first'), 'err'); return; }
    const s = US.twofa || {};
    UI.openModal({
      title: L('双因素认证 2FA', 'Two-factor authentication'),
      sub: s.enabled ? L('WebUI 登录需要一次性验证码', 'A one-time code is required to sign in') : L('为 WebUI 登录增加 TOTP 一次性验证码', 'Add TOTP one-time codes to WebUI sign-in'),
      body: `<div class="ui-fields">
        <label class="ui-switch-row"><input type="checkbox" data-f="enabled"${s.enabled ? ' checked' : ''}><span class="sw-rail"></span>
          <span class="sw-txt"><b>${esc(L('启用 2FA', 'Enable 2FA'))}</b><small>${esc(L('兼容 Google Authenticator / 1Password 等 TOTP 应用', 'Works with Google Authenticator / 1Password and other TOTP apps'))}</small></span></label>
        <div class="ui-field full twofa-secret"${s.enabled ? ' hidden' : ''}><span>${esc(L('密钥与二维码', 'Secret & QR code'))}</span>
          <div class="twofa-qr"><canvas data-f="qr" width="220" height="220"></canvas>
            <div class="qr-hint"><b>${esc(L('用验证器扫描二维码', 'Scan with your authenticator'))}</b>${esc(L('也可手动输入下方密钥。若曾扫过旧二维码，请先在验证器中删除旧的 ROS-Center 条目再重新扫描，避免输入过期验证码。', 'Or enter the secret below manually. If you scanned an old QR before, delete the old ROS-Center entry in your authenticator first, then re-scan to avoid stale codes.'))}</div></div>
          <code data-f="secret">—</code>
          <div class="twofa-secret-actions"><button class="ui-btn tiny" type="button" data-copy>${esc(L('复制密钥', 'Copy secret'))}</button><button class="ui-btn tiny" type="button" data-regen>${esc(L('重新获取密钥', 'Regenerate key'))}</button></div></div>
        <label class="ui-field full"><span>${esc(L('6 位验证码', '6-digit code'))}</span><input data-f="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></label>
      </div>
      <div class="notice blue" style="margin-top:12px">${ic('shield')}<div>${esc(L('开启或关闭都需要输入当前密钥生成的验证码。请将手机时间设为自动同步，并输入验证器中最新刷新的 6 位码（允许 ±60 秒误差）。', 'Both enabling and disabling require a valid code. Set your phone time to auto-sync and enter the latest 6-digit code (±60s tolerance).'))}</div></div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(L('应用', 'Apply'))}</button>`,
      onMount(m) {
        const cb = m.querySelector('[data-f="enabled"]');
        const secretBox = m.querySelector('.twofa-secret');
        const secretEl = m.querySelector('[data-f="secret"]');
        let secret = '';
        const show = () => { secretBox.hidden = !!s.enabled; };
        const fetchSecret = async () => {
          try {
            const r = await api('/api/auth/2fa/setup', { method: 'POST' });
            secret = r.secret || '';
            secretEl.textContent = secret || '—';
            const cv = m.querySelector('[data-f="qr"]');
            if (cv && r.otpauth) {
              if (!qrTo(cv, r.otpauth, 220)) { const qr = cv.closest('.twofa-qr'); if (qr) qr.hidden = true; }
            }
          } catch (e) { toast((e && e.message) || L('获取密钥失败', 'Setup failed'), 'err'); }
        };
        show();
        if (!s.enabled) fetchSecret();
        cb.onchange = async () => {
          if (!cb.checked) { show(); return; }
          if (!secret) await fetchSecret();
          show();
        };
        m.querySelector('[data-copy]').onclick = () => copyText(secret || secretEl.textContent);
        const regen = m.querySelector('[data-regen]');
        if (regen) regen.onclick = async () => { await fetchSecret(); toast(L('已生成新密钥，请重新扫描', 'New key generated — re-scan the QR'), 'ok'); };
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const code = m.querySelector('[data-f="code"]').value.trim();
          if (!/^\d{6}$/.test(code)) { toast(L('请输入 6 位验证码', 'Enter the 6-digit code'), 'err'); return; }
          if (!s.enabled && !secret) { toast(L('请先获取密钥', 'Get the secret first'), 'err'); return; }
          try {
            await api('/api/auth/2fa/' + (cb.checked ? 'enable' : 'disable'), {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cb.checked ? { secret, code } : { code })
            });
            UI.closeModal();
            toast(cb.checked ? L('2FA 已启用', '2FA enabled') : L('2FA 已关闭', '2FA disabled'), 'ok');
            await loadUsersData(true);
            if (state.section === 'webuiSettings') { WEBUI.loadedAt = 0; await loadWebuiData(true); }
          } catch (e) { toast((e && e.message) || L('操作失败', 'Failed'), 'err'); }
        };
      }
    });
  }
  function openGroupForm(g) {
    const editable = groupEditable(g);
    const policy = String((g && g.policy) || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    const rows = ROS_POLICIES.map(([key, zh, desc]) => `<label class="perm-row${editable ? '' : ' is-disabled'}">
      <input type="checkbox" data-p="${key}"${policy.includes(key) ? ' checked' : ''}${editable ? '' : ' disabled'}>
      <span class="perm-name">${esc(zh)}</span><small>${esc(desc)}</small><code>${ex(key)}</code></label>`).join('');
    UI.openModal({
      title: (g ? L('编辑用户组', 'Edit group') : L('用户组', 'User group')) + ' · ' + (g ? ex(g.name) : ''),
      sub: editable ? L('修改会直接写入 RouterOS /user/group', 'Changes are written to RouterOS /user/group') : L('当前账户权限不足，字段只读', 'Current account has insufficient permission; fields are read-only'),
      body: `<div class="perm-grid">${rows}</div>
        <div class="ui-fields" style="margin-top:12px">
          <label class="ui-field full"><span>${esc(L('备注', 'Comment'))}</span><input data-f="comment" value="${ex(g && g.comment || '')}"${editable ? '' : ' disabled'}></label>
        </div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('关闭', 'Close'))}</button>${editable ? `<button class="ui-btn primary" type="button" data-save>${esc(L('保存', 'Save'))}</button>` : ''}`,
      onMount(m) {
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        const save = m.querySelector('[data-save]');
        if (save) save.onclick = async () => {
          const selected = Array.from(m.querySelectorAll('[data-p]')).filter((x) => x.checked).map((x) => x.dataset.p);
          const values = { policy: selected.join(','), comment: m.querySelector('[data-f="comment"]').value.trim() };
          try {
            await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ section: 'userGroups', action: 'set', ids: [g['.id'] || g.name], values }) });
            UI.closeModal(); toast(L('用户组已更新', 'Group updated'), 'ok');
            await loadUsersData(true); paintUsersPanel();
          } catch (e) { toast((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
        };
      }
    });
  }

  /* ---------- 设备与固件 ---------- */
  const isDemo = (s) => !!(s && (s.mode === 'demo' || s.forceDemo));
  const isLive = (s) => !!(s && (s.connected || s.mode === 'live')) || isDemo(s);
  /* 版本比较：以在线设备的最高固件版本为「最新」基准，逐台判定 正常 / 待更新 / 离线。
     设置仍以左上角主路由切换为准，这里只做只读状态归类（设计稿 devices.html 同款语义）。 */
  function verTuple(v) { return String(v || '').split(/[.\-]/).map((x) => num(x, 0)); }
  function verCmp(a, b) {
    const x = verTuple(a), y = verTuple(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function latestFirmware() {
    let best = '';
    for (const d of (DV.rows || [])) {
      const s = d.status || {};
      if (!isLive(s) || s.enabled === false) continue;
      const v = String(s.version || '').trim();
      if (v && verCmp(v, best) > 0) best = v;
    }
    return best;
  }
  function devStatusCell(d, best) {
    const s = d.status || {};
    if (s.enabled === false) return st('muted', L('已禁用', 'Disabled'));
    if (!isLive(s) && s.mode !== 'connecting') return st('muted', L('离线', 'Offline'));
    if (s.mode === 'connecting' && !s.version) return st('amber', L('连接中', 'Connecting'));
    const v = String(s.version || '').trim();
    if (best && v && verCmp(v, best) < 0) return '<span class="badge reject">' + esc(L('待更新', 'Update available')) + '</span>';
    return st('green', L('正常', 'Online'));
  }
  function curDev() { return (state.devices || []).find((d) => d.id === state.deviceId) || (state.devices || [])[0] || null; }
  /* 备份页汇总所有设备的配置备份；DV.bkFilter 仅作为查看过滤，不再让后点设备顶掉先点设备 */
  function bkDeviceId() { return DV.bkFilter && DV.bkFilter !== 'all' ? DV.bkFilter : (state.deviceId || ((state.devices || [])[0] || {}).id || ''); }
  function bkDevice() { return (state.devices || []).find((d) => d.id === bkDeviceId()) || curDev(); }
  function bkDevices() {
    const all = state.devices || [];
    const on = all.filter((d) => (d.status || {}).enabled !== false);
    return on.length ? on : all;
  }
  async function fetchAllBackupFiles() {
    const errs = [];
    const merged = [];
    await Promise.all(bkDevices().map(async (d) => {
      try {
        const fl = await api('/api/backup/files?device=' + encodeURIComponent(d.id));
        if (fl && fl.error) { errs.push(d.name + ': ' + fl.error); return; }
        for (const f of ((fl && fl.files) || [])) merged.push(Object.assign({}, f, { device: d.id, deviceName: d.name }));
      } catch (e) { errs.push(d.name + ': ' + ((e && e.message) || e)); }
    }));
    merged.sort((a, b) => (num(b.ts) || Date.parse(b.created || 0) || 0) - (num(a.ts) || Date.parse(a.created || 0) || 0));
    return { files: merged, errs };
  }
  function rosVersion() {
    const r = state.latest && state.latest.resource;
    const v = r && r.version ? String(r.version) : '';
    return v ? v.replace(/\s*\(.*?\)\s*$/, '') : '';
  }
  function activeStatus() { const d = curDev(); return (d && d.status) || {}; }
  function dvFiltered() {
    const q = DV.q.trim().toLowerCase();
    return (DV.rows || []).filter((d) => {
      const s = d.status || {};
      const on = isLive(s) && s.enabled !== false;
      if (DV.filter === 'online' && !on) return false;
      if (DV.filter === 'offline' && (on || s.enabled === false)) return false;
      if (DV.filter === 'disabled' && s.enabled !== false) return false;
      if (!q) return true;
      return [d.name, d.host, s.mode, s.error].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }
  function pendingUpdates() {
    const best = latestFirmware();
    if (!best) return 0;
    return (DV.rows || []).filter((d) => {
      const s = d.status || {};
      if (s.enabled === false || !isLive(s)) return false;
      const v = String(s.version || '').trim();
      return v && verCmp(v, best) < 0;
    }).length;
  }
  function devKpis() {
    const rows = DV.rows || [];
    const total = rows.length;
    const online = rows.filter((d) => isLive(d.status) && (d.status || {}).enabled !== false).length;
    const enabled = rows.filter((d) => (d.status || {}).enabled !== false).length;
    const ver = rosVersion() || '—';
    const mismatch = pendingUpdates();
    const hasUp = !!(DV.up && DV.up.status && DV.up.status.ok && DV.up.status.hasUpdate);
    const updates = mismatch + (hasUp ? 1 : 0);
    const bk = DV.backup;
    const bkCount = Array.isArray(DV.files) && DV.files.length ? DV.files.length : (bk ? 1 : 0);
    const bkLatest = (Array.isArray(DV.files) && DV.files[0]) || bk;
    const as = activeStatus();
    return [
      kpiCard({ label: L('设备总数', 'Devices'), icon: 'device', color: 'blue', num: String(total),
        state: { dot: online ? 'green' : 'muted', text: `${online} ${L('在线', 'online')}` },
        foot: [`${enabled} ${L('启用', 'enabled')}`, `${total - enabled} ${L('禁用', 'disabled')}`] }),
      kpiCard({ label: L('系统版本', 'RouterOS'), icon: 'layers', color: 'teal', num: ver,
        state: hasUp ? { dot: 'amber', text: L('可更新', 'Update') } : { dot: 'green', text: L('最新', 'Up to date') },
        foot: [L('路由器固件', 'Router firmware'), as.uptime != null ? fmtUptime(as.uptime) : L('未连接', 'Offline')] }),
      kpiCard({ label: L('可用更新', 'Updates'), icon: 'download', color: 'amber', num: String(updates),
        state: { dot: updates ? 'amber' : 'green', text: updates ? L('待处理', 'Pending') : L('无待处理', 'None') },
        foot: [`${L('固件', 'Firmware')} ${mismatch}`, `${L('控制台', 'Console')} ${hasUp ? 1 : 0}`] }),
      kpiCard({ label: L('配置备份', 'Backups'), icon: 'layers', color: 'violet', num: String(bkCount), unit: bkCount ? L('份', '') : '',
        state: bkCount ? { dot: 'green', text: L('可恢复', 'Restorable') } : { dot: 'muted', text: L('暂无', 'None') },
        foot: [bkLatest ? fmtTs(bkLatest.at || bkLatest.time) : L('尚未备份', 'No backup'), bkLatest ? String(bkLatest.name || '').slice(0, 26) : L('设备菜单 · 立即备份', 'Device menu · Back up')] })
    ].join('');
  }
  function devTable() {
    const rows = dvFiltered();
    const best = latestFirmware();
    const activeId = state.deviceId;
    const body = rows.map((d) => {
      const s = d.status || {};
      const dv = String(s.version || (d.id === activeId ? rosVersion() : '') || '').trim();
      return `<tr>
        <td data-label="${esc(L('设备', 'Device'))}"><div class="if-name"><span class="if-badge eth">rtr</span><span><b>${ex(d.name)}${d.id === activeId ? ' <span class="active-mark" title="' + esc(L('当前主路由', 'Active router')) + '">●</span>' : ''}</b><small class="mono">${ex(d.host)}:${ex(d.port)}</small></span></div></td>
        <td data-label="${esc(L('类型', 'Type'))}"><span class="chain">${esc(L('路由器', 'Router'))}</span></td>
        <td data-label="${esc(L('IP 地址', 'IP address'))}"><span class="addr">${ex(d.host)}</span></td>
        <td data-label="${esc(L('系统 / 固件', 'System'))}"><span class="pg-verline">${dv ? 'RouterOS <b>' + ex(dv) + '</b>' : '<s>—</s>'}</span></td>
        <td class="r" data-label="${esc(L('在线时长', 'Uptime'))}"><span class="num">${s.uptime != null ? ex(fmtUptime(s.uptime)) : '—'}</span></td>
        <td data-label="${esc(L('状态', 'Status'))}">${devStatusCell(d, best)}</td>
        <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="dev-more" data-id="${ex(d.id)}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    const empty = `<tr><td colspan="7">${emptyBox(DV.q ? L('没有匹配的设备', 'No matching device') : L('还没有设备', 'No devices yet'), DV.q ? L('试试其它关键词', 'Try another keyword') : L('添加一台 RouterOS 设备开始使用', 'Add a RouterOS device to begin'),
      `<button class="btn primary" type="button" data-act="dev-add">${ic('plus')}${esc(L('添加设备', 'Add device'))}</button>`)}</td></tr>`;
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:24%"><col style="width:12%"><col style="width:17%"><col style="width:19%"><col style="width:13%"><col style="width:11%"><col></colgroup>
      <thead><tr><th>${esc(L('设备', 'Device'))}</th><th>${esc(L('类型', 'Type'))}</th><th>${esc(L('IP 地址', 'IP address'))}</th><th>${esc(L('系统 / 固件', 'System / firmware'))}</th><th class="r">${esc(L('在线时长', 'Uptime'))}</th><th>${esc(L('状态', 'Status'))}</th><th></th></tr></thead>
      <tbody>${body || empty}</tbody></table></div>
      <div class="table-foot"><span>${L('显示', 'Showing')} ${rows.length} / ${(DV.rows || []).length} ${L('台', 'devices')} · ${L('ro-center 设备注册表', 'ros-center device registry')}</span><span class="mono">${esc(relTime(DV.loadedAt))}</span></div>`;
  }
  function firmwarePanel() {
    /* 设计稿固件 tab：按设备列出固件版本与可更新状态，不罗列软件包。
       基准取在线设备最高版本，低于基准者标「待更新」。 */
    const best = latestFirmware();
    const rows = (DV.rows || []).filter((d) => {
      const s = d.status || {};
      return s.enabled !== false && (isLive(s) || String(s.version || ''));
    });
    const items = rows.map((d) => {
      const s = d.status || {};
      const v = String(s.version || '').trim() || '—';
      const outdated = best && v !== '—' && verCmp(v, best) < 0;
      const canAct = canWrite() && isLive(s) && s.enabled !== false;
      return `<div class="update-item">
        <span class="update-ico">${ic('device')}</span>
        <div class="update-main"><b>${ex(d.name)}</b><small>${esc(isLive(s) ? L('在线', 'Online') : L('离线 · 最近记录', 'Offline · last seen'))} · ${ex(s.board || L('RouterOS', 'RouterOS'))}</small></div>
        <span class="update-ver">${ex(v)}${outdated ? '<span>→</span><b>' + ex(best) + '</b>' : ''}</span>
        ${canAct ? `<button class="btn-xs" type="button" data-act="dev-fw-scan" data-id="${ex(d.id)}" title="${esc(L('扫描此设备固件', 'Scan firmware'))}">${esc(L('扫描', 'Scan'))}</button>` : ''}
        ${outdated && canAct ? `<button class="btn-xs primary" type="button" data-act="dev-fw-install" data-id="${ex(d.id)}">${esc(L('更新', 'Update'))}</button>` : ''}
        <span class="badge ${outdated ? 'reject' : 'allow'}">${esc(outdated ? L('待更新', 'Update available') : L('最新', 'Up to date'))}</span>
      </div>`;
    });
    const app = DV.up && DV.up.status;
    const hasUp = !!(app && app.ok && app.hasUpdate);
    if (hasUp) {
      items.push(`<div class="update-item">
        <span class="update-ico">${ic('download')}</span>
        <div class="update-main"><b>ROS Center ${esc(L('控制台', 'console'))}</b><small>${esc(L('WebUI 应用更新', 'WebUI app update'))}</small></div>
        <span class="update-ver"><i>${ex((DV.up.runtime || {}).version || '—')}</i><span>→</span><b>${ex((app.latest || {}).version || '')}</b></span>
        <button class="btn-xs" type="button" data-act="dev-open-updates">${esc(L('查看', 'Open'))}</button>
      </div>`);
    }
    const pending = items.filter((x) => x.indexOf('badge reject') >= 0).length;
    return `<div class="update-list">${items.join('') || '<div class="ui-menu-empty">' + esc(L('暂无设备固件信息', 'No firmware data')) + '</div>'}</div>
      <div class="table-foot"><span>${pending} ${L('台待更新', 'pending updates')} · ${rows.length} ${L('台设备', 'devices')}</span>
        ${canWrite() ? `<button class="link link-btn" type="button" data-act="dev-check">${ic('refresh')}${esc(L('扫描全部固件', 'Scan all firmware'))}</button>` : ''}</div>`;
  }
  function fmtSize(bytes) {
    const n = num(bytes);
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function backupPanel() {
    const all = DV.files || [];
    const filter = DV.bkFilter || 'all';
    const files = filter === 'all' ? all : all.filter((f) => f.device === filter);
    const scopeName = filter === 'all' ? L('全部设备', 'All devices') : (((state.devices || []).find((d) => d.id === filter) || {}).name || L('当前设备', 'Current device'));
    if (DV.filesErr && !all.length) {
      return `<div class="pg-empty">${ic('device')}<b>${esc(L('无法读取备份', 'Cannot read backups'))}</b><div>${ex(DV.filesErr)}</div>
        <button class="btn" type="button" data-act="dev-load-backups">${ic('refresh')}${esc(L('重试', 'Retry'))}</button></div>`;
    }
    if (!files.length) {
      return `<div class="pg-empty">${ic('download')}<b>${esc(all.length ? L('该设备暂无备份', 'No backups for this device') : L('还没有配置备份', 'No config backups yet'))}</b><div>${esc(L('在设备清单的三点菜单中选择「立即备份 · rsc」，完成后会自动出现在这里。', 'Use “Back up now · rsc” in a device’s menu; finished backups appear here automatically.'))}</div></div>
        <div class="table-foot"><span>${ex(scopeName)} · ${L('实时读取路由器 /flash，与 winbox 文件列表一致', 'Live from router /flash, in sync with winbox')}</span><span class="mono">.rsc</span></div>`;
    }
    const rows = files.map((f) => {
      const ts = f.ts ? fmtTs(f.ts) : (f.created || '—');
      const isSys = f.type === 'system';
      return `<tr>
        <td data-label="${esc(L('备份文件', 'Backup file'))}"><span class="mono" style="font-size:10.5px">${ex(f.name)}</span></td>
        <td data-label="${esc(L('设备', 'Device'))}"><span class="chain">${ex(f.deviceName || '—')}</span></td>
        <td data-label="${esc(L('时间', 'Time'))}"><span class="num">${ex(ts)}</span></td>
        <td class="r" data-label="${esc(L('大小', 'Size'))}"><span class="num">${ex(fmtSize(f.size))}</span></td>
        <td data-label="${esc(L('方式', 'Type'))}"><span class="badge ${f.method === 'auto' ? 'neutral' : 'info'}">${esc(f.method === 'auto' ? L('自动', 'Auto') : L('手动', 'Manual'))}<span class="bk-kind">${esc(isSys ? L('系统备份', 'System') : L('配置备份', 'Config'))}</span></span></td>
        <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="dev-bk-more" data-name="${ex(f.name)}" data-kind="${ex(f.type)}" data-device="${ex(f.device || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    const total = files.reduce((n, f) => n + num(f.size), 0);
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:30%"><col style="width:14%"><col style="width:18%"><col style="width:12%"><col style="width:16%"><col></colgroup>
      <thead><tr><th>${esc(L('备份文件', 'Backup file'))}</th><th>${esc(L('设备', 'Device'))}</th><th>${esc(L('时间', 'Time'))}</th><th class="r">${esc(L('大小', 'Size'))}</th><th>${esc(L('方式', 'Type'))}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="table-foot"><span>${ex(scopeName)} · ${L('实时读取 · 共', 'Live ·')} ${files.length} ${L('份', 'files')} · ${L('与 winbox 同步', 'in sync with winbox')}</span><span class="mono">${ex(fmtSize(total))}</span></div>`;
  }
  function devRail() {
    const r = (state.latest && state.latest.resource) || {};
    const cpu = num(r['cpu-load'], 0);
    const totalMem = num(r['total-memory']), freeMem = num(r['free-memory']);
    const totalHdd = num(r['total-hdd-space']), freeHdd = num(r['free-hdd-space']);
    const memPct = totalMem ? Math.round((totalMem - freeMem) / totalMem * 100) : 0;
    const dskPct = totalHdd ? Math.round((totalHdd - freeHdd) / totalHdd * 100) : 0;
    const temp = r.temperature != null && r.temperature !== '' ? num(r.temperature) : null;
    const health = (state.latest && state.latest.resource)
      ? st('green', L('健康', 'Healthy')) : st('muted', L('等待数据', 'Waiting'));
    const dev = curDev();
    const as = activeStatus();
    const up = as.uptime != null ? fmtUptime(as.uptime) : '—';
    const bk = DV.backup;
    const app = DV.up && DV.up.status;
    const hasUp = !!(app && app.ok && app.hasUpdate);
    const ver = rosVersion() || '—';
    const events = [];
    if (bk) events.push({ dot: '', title: L('配置备份成功', 'Configuration backed up'), sub: `${bk.name || ''} · ${fmtTs(bk.at)}` });
    events.push({ dot: 'teal', title: L('当前设备', 'Active device'), sub: `${dev ? dev.name : '—'} · ${as.mode === 'demo' ? 'DEMO' : (isLive(as) ? L('在线', 'online') : L('离线', 'offline'))}` });
    events.push({ dot: 'violet', title: L('RouterOS 版本', 'RouterOS version'), sub: ver });
    return `
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('系统状态', 'System status'))}</h2><div class="card-sub">${ex(dev ? dev.name : '—')} · ${esc(L('已运行', 'up'))} ${ex(up)}</div></div>${health}</div>
        <div class="rail-body">
          <div class="health">
            <div class="health-row"><span>CPU</span><span class="bar"><i style="width:${Math.max(2, Math.min(100, cpu))}%"></i></span><b>${cpu}%</b></div>
            <div class="health-row"><span>${esc(L('内存', 'Memory'))}</span><span class="bar"><i style="width:${Math.max(2, Math.min(100, memPct))}%"></i></span><b>${memPct}%</b></div>
            <div class="health-row"><span>${esc(L('存储', 'Disk'))}</span><span class="bar"><i style="width:${Math.max(2, Math.min(100, dskPct))}%"></i></span><b>${dskPct}%</b></div>
          </div>
          <div class="hairline"></div>
          <div class="kv"><span>${esc(L('温度', 'Temperature'))}</span><b>${temp != null ? ex(temp + '°C') : '—'}</b></div>
          <div class="kv"><span>${esc(L('架构', 'Architecture'))}</span><b>${ex(r['architecture-name'] || r['board-name'] || '—')}</b></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('固件通道', 'Firmware channel'))}</h2><div class="card-sub">${esc(L('已安装组件与更新策略', 'Installed components'))}</div></div><span class="badge ${hasUp ? 'reject' : 'allow'}">${esc(hasUp ? L('有更新', 'Update') : 'stable')}</span></div>
        <div class="rail-body">
          <div class="kv"><span>${esc(L('当前版本', 'Current'))}</span><b class="mono">${ex(ver)}</b></div>
          <div class="kv"><span>${esc(L('待更新设备', 'Pending'))}</span><b>${pendingUpdates()}</b></div>
          <div class="kv"><span>${esc(L('控制台版本', 'Console'))}</span><b class="mono">${ex((DV.up && DV.up.runtime && DV.up.runtime.version) || '—')}</b></div>
          <div class="kv"><span>${esc(L('上次检查', 'Checked'))}</span><b>${esc(relTime(DV.loadedAt))}</b></div>
          ${hasUp ? `<div class="notice blue">${ic('download')}<div>${L('控制台有新版本，可在「更新」页查看详情。', 'A new console version is available on the Updates page.')}</div></div>
          <a class="link" href="javascript:void 0" data-act="dev-open-updates">${esc(L('查看更新', 'View update'))}${ic('chevron')}</a>`
          : `<div class="notice green">${ic('check')}<div>${esc(L('所有组件均已同步。', 'All components are in sync.'))}</div></div>`}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('配置历史', 'Configuration history'))}</h2><div class="card-sub">${esc(L('最近变更与备份', 'Recent changes'))}</div></div><span class="status">${esc(L('审计', 'Audit'))}</span></div>
        <div class="rail-body tight"><div class="timeline">
          ${events.map((e) => `<div class="tl-item"><span class="tl-dot"${e.dot ? ` style="background:var(--v2-${e.dot});box-shadow:0 0 0 3px var(--v2-${e.dot}-soft)"` : ''}></span><div><b>${ex(e.title)}</b><small>${ex(e.sub)}</small></div></div>`).join('')}
        </div></div>
      </section>`;
  }
  function devToolbarHtml(tab) {
    if (tab === 'backup') {
      const all = DV.files || [];
      const cur = DV.bkFilter || 'all';
      const ids = ['all'].concat(bkDevices().map((d) => d.id));
      const chips = ids.map((id) => {
        const cnt = id === 'all' ? all.length : all.filter((f) => f.device === id).length;
        const label = id === 'all' ? L('全部', 'All') : (((state.devices || []).find((d) => d.id === id) || {}).name || id);
        return `<button class="chip${cur === id ? ' on' : ''}" type="button" data-act="dev-bk-chip" data-device="${ex(id)}">${esc(label)} <b>${cnt}</b></button>`;
      }).join('');
      const note = (DV.filesErrs && DV.filesErrs.length) ? DV.filesErrs.join('；') : L('配置备份 .rsc · 全部设备实时同步', 'Config backups .rsc · all devices live');
      return `<div class="toolbar"><div class="chips">${chips}</div><span class="spacer"></span><span class="toolbar-note">${esc(note)}</span></div>`;
    }
    if (tab !== 'devices') {
      const note = L('RouterOS /system/package · 只读', 'RouterOS /system/package · read-only');
      return `<div class="toolbar"><span class="spacer"></span><span class="toolbar-note">${esc(note)}</span></div>`;
    }
    const rows = DV.rows || [];
    const offline = rows.filter((d) => !isLive(d.status) && (d.status || {}).enabled !== false).length;
    return `<div class="toolbar">
          <label class="field">${ic('search')}<input id="pgDevSearch" value="${esc(DV.q)}" placeholder="${esc(L('搜索设备、IP 或固件版本…', 'Search device, IP or firmware…'))}" aria-label="${esc(L('搜索设备', 'Search devices'))}"></label>
          <div class="chips">
            <button class="chip${DV.filter === 'all' ? ' on' : ''}" type="button" data-act="dev-chip" data-filter="all">${esc(L('全部', 'All'))} <b>${rows.length}</b></button>
            <button class="chip${DV.filter === 'online' ? ' on' : ''}" type="button" data-act="dev-chip" data-filter="online">${esc(L('在线', 'Online'))} <b>${rows.filter((d) => isLive(d.status) && (d.status || {}).enabled !== false).length}</b></button>
            <button class="chip${DV.filter === 'offline' ? ' on' : ''}" type="button" data-act="dev-chip" data-filter="offline">${esc(L('离线', 'Offline'))} <b>${offline}</b></button>
            <button class="chip${DV.filter === 'disabled' ? ' on' : ''}" type="button" data-act="dev-chip" data-filter="disabled">${esc(L('已禁用', 'Disabled'))} <b>${rows.filter((d) => (d.status || {}).enabled === false).length}</b></button>
          </div>
          <span class="spacer"></span><span class="toolbar-note">${esc(DV.err ? DV.err : DV.note || L('数据来自 ros-center', 'From ros-center'))}</span>
        </div>`;
  }
  function devicesHtml() {
    const rows = DV.rows || [];
    const offline = rows.filter((d) => !isLive(d.status) && (d.status || {}).enabled !== false).length;
    const tab = DV.tab;
    return `<div class="page-head">
      <div><h1>${esc(L('设备与固件', 'Devices & firmware'))}</h1><div class="meta"><span>${esc(L('主路由', 'Primary'))}</span><span class="sep"></span><span id="pgDevMetaCount">${rows.length} ${esc(L('台设备', 'devices'))}</span><span class="sep"></span><span>${esc(L('版本与备份集中管理', 'Versions & backups'))}</span></div></div>
      <div class="actions">
        ${canWrite() ? `<button class="btn ghost" type="button" data-act="dev-check">${ic('refresh')}${esc(L('检查更新', 'Check updates'))}</button>
        <button class="btn primary" type="button" data-act="dev-add">${ic('plus')}${esc(L('添加设备', 'Add device'))}</button>` : ''}
      </div>
    </div>
    <div class="grid align-start">
      <section class="kpis" id="pgDevKpis">${DV.rows ? devKpis() : ''}</section>
      <section class="card span8">
        <div class="card-head"><div><h2 class="card-title">${esc(L('设备清单', 'Device list'))}</h2><div class="card-sub">${esc(L('ros-center 注册设备 · 按当前连接状态', 'Registered devices · live status'))}</div></div>
          ${DV.rows ? (offline ? st('amber', `${offline} ${L('台离线', 'offline')}`) : st('green', L('全部在线', 'All online'))) : st('muted', L('加载中', 'Loading'))}</div>
        <div class="panel-tabs">
          <button class="panel-tab${tab === 'devices' ? ' on' : ''}" type="button" data-act="dev-tab" data-tab="devices">${esc(L('设备', 'Devices'))}<span class="pt-count">${rows.length}</span></button>
          <button class="panel-tab${tab === 'firmware' ? ' on' : ''}" type="button" data-act="dev-tab" data-tab="firmware">${esc(L('固件', 'Firmware'))}<span class="pt-count">${pendingUpdates()}</span></button>
          <button class="panel-tab${tab === 'backup' ? ' on' : ''}" type="button" data-act="dev-tab" data-tab="backup">${esc(L('备份', 'Backup'))}<span class="pt-count">${DV.files.length}</span></button>
        </div>
        <div id="pgDevToolbar">${devToolbarHtml(tab)}</div>
        <div id="pgDevPanel">
          ${tab === 'devices' ? `<div class="tab-panel on" data-panel="devices">${devTable()}</div>`
            : tab === 'firmware' ? `<div class="tab-panel on" data-panel="firmware">${firmwarePanel()}</div>`
              : `<div class="tab-panel on" data-panel="backup">${backupPanel()}</div>`}
        </div>
      </section>
      <div class="span4 rail" id="pgDevRail">${devRail()}</div>
    </div>`;
  }

  async function loadDevicesData(quiet) {
    if (DV.loading) return;
    DV.loading = true;
    DV.err = '';
    const hadData = !!DV.rows;
    if (!quiet && !hadData) paintDevices();
    try {
      await loadDevices(true);
      DV.rows = state.devices || [];
      const [up, bk, pk, fl, bc] = await Promise.all([
        api('/api/update/status').catch(() => null),
        api('/api/backup/status').catch(() => null),
        api('/api/config?section=systemPackage').catch(() => null),
        fetchAllBackupFiles().catch(() => ({ files: [], errs: [] })),
        api('/api/backup/config').catch(() => null)
      ]);
      DV.up = up || null;
      DV.backup = (bk && bk.status) || null;
      DV.pkgs = (pk && pk.rows) || [];
      DV.files = (fl && fl.files) || [];
      DV.filesErrs = (fl && fl.errs) || [];
      DV.filesErr = (!DV.files.length && DV.filesErrs.length) ? DV.filesErrs[0] : '';
      DV.filesAt = Date.now();
      if (bc) DV.bkCfg = { name: bc.name || '' };
      if (pk && pk.error) DV.note = pk.error;
      DV.loadedAt = Date.now();
    } catch (e) {
      DV.err = e.message || String(e);
      if (!DV.rows) DV.rows = state.devices || [];
    } finally {
      DV.loading = false;
      if (state.section === 'devices') paintDevices();
    }
  }
  function paintDevices() {
    if (state.section !== 'devices') return;
    const k = $('pgDevKpis'); if (k) k.innerHTML = devKpis();
    const p = $('pgDevPanel');
    if (p) {
      p.innerHTML = DV.tab === 'devices' ? `<div class="tab-panel on" data-panel="devices">${devTable()}</div>`
        : DV.tab === 'firmware' ? `<div class="tab-panel on" data-panel="firmware">${firmwarePanel()}</div>`
          : `<div class="tab-panel on" data-panel="backup">${backupPanel()}</div>`;
    }
    const rail = $('pgDevRail'); if (rail) rail.innerHTML = devRail();
    if (DV.tab === 'backup') { const tb = $('pgDevToolbar'); if (tb) tb.innerHTML = devToolbarHtml('backup'); }
    if (DV.tab === 'devices') {
      const note = document.querySelector('.content.pg-devices .toolbar-note');
      if (note) note.textContent = DV.err || DV.note || L('数据来自 ros-center', 'From ros-center');
    }
    const sel = document.querySelector('.content.pg-devices .kpis');
    if (sel) sel.innerHTML = devKpis();
    paintDevCounts();
    const headState = document.querySelector('.content.pg-devices .card.span8 .card-head .status');
    const rows = DV.rows || [];
    const offline = rows.filter((d) => !isLive(d.status) && (d.status || {}).enabled !== false).length;
    if (headState) headState.outerHTML = rows.length ? (offline ? st('amber', `${offline} ${L('台离线', 'offline')}`) : st('green', L('全部在线', 'All online'))) : st('muted', L('加载中', 'Loading'));
  }
  function paintDevCounts() {
    const rows = DV.rows || [];
    const meta = $('pgDevMetaCount');
    if (meta) meta.textContent = `${rows.length} ${L('台设备', 'devices')}`;
    const tabs = document.querySelectorAll('.content.pg-devices .panel-tab');
    const tabCounts = [rows.length, pendingUpdates(), DV.files.length];
    tabs.forEach((b, i) => {
      b.classList.toggle('on', b.dataset.tab === DV.tab);
      const c = b.querySelector('.pt-count'); if (c && tabCounts[i] != null) c.textContent = tabCounts[i];
    });
    const counts = [
      rows.length,
      rows.filter((d) => isLive(d.status) && (d.status || {}).enabled !== false).length,
      rows.filter((d) => !isLive(d.status) && (d.status || {}).enabled !== false).length,
      rows.filter((d) => (d.status || {}).enabled === false).length
    ];
    const chips = document.querySelectorAll('.content.pg-devices .chip[data-act="dev-chip"]');
    chips.forEach((c, i) => {
      c.classList.toggle('on', c.dataset.filter === DV.filter);
      const b = c.querySelector('b'); if (b && counts[i] != null) b.textContent = counts[i];
    });
  }
  function paintDevTableOnly() {
    if (state.section !== 'devices' || DV.tab !== 'devices') return;
    const p = $('pgDevPanel');
    if (p) p.innerHTML = `<div class="tab-panel on" data-panel="devices">${devTable()}</div>`;
    const note = document.querySelector('.content.pg-devices .toolbar-note');
    if (note) note.textContent = DV.err || DV.note || L('数据来自 router', 'From router');
  }

  function openDeviceMenu(id, anchor) {
    const d = (state.devices || []).find((x) => x.id === id);
    if (!d) return;
    const s = d.status || {};
    const isCur = d.id === state.deviceId;
    const items = [
      { label: L('使用此设备', 'Use this device'), icon: 'i-check', checked: isCur, disabled: isCur,
        action: () => useDevice(d.id) },
      { label: L('复制地址', 'Copy address'), icon: 'i-globe', action: () => copyText(d.host) }
    ];
    if (canWrite()) {
      items.splice(1, 0,
        { label: L('重新连接', 'Reconnect'), icon: 'i-refresh', action: () => devAction(d.id, 'reconnect') },
        s.enabled === false
          ? { label: L('启用设备', 'Enable device'), icon: 'i-play', action: () => devAction(d.id, 'enable') }
          : { label: L('禁用设备', 'Disable device'), icon: 'i-pause', action: () => devAction(d.id, 'disable') });
      items.push(
        { sep: true },
        { label: L('编辑连接', 'Edit connection'), icon: 'i-lock', action: () => openDeviceForm(d.id) },
        { label: L('立即备份 · rsc', 'Back up now · rsc'), icon: 'i-download', disabled: s.enabled === false, action: () => quickBackupDevice(d) },
        { label: L('导入备份 · rsc', 'Import backup · rsc'), icon: 'i-upload', disabled: s.enabled === false, action: () => openImportBackupModal(d) },
        { sep: true },
        { label: L('重启路由器', 'Reboot router'), icon: 'i-refresh', action: () => devPower(d.id, 'reboot') },
        { label: L('关闭路由器', 'Shutdown router'), icon: 'i-pause', danger: true, action: () => devPower(d.id, 'shutdown') },
        { sep: true },
        { label: L('删除设备', 'Delete device'), icon: 'i-alert', danger: true, action: () => deleteDevice(d) });
    }
    UI.openMenu(anchor, items);
  }
  async function useDevice(id) {
    try {
      const r = await api('/api/devices/' + encodeURIComponent(id) + '/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r && r.devices) { state.devices = r.devices; state.devicePrimary = r.activeId || id; }
      if (id !== state.deviceId) await switchDevice(id, true);
      renderDevicePicker();
    } catch (e) { toast(e.message, 'err'); }
    await loadDevicesData(true);
    toast(L('已切换设备', 'Device switched'), 'ok');
  }
  async function devAction(id, action) {
    if (action === 'disable') {
      const ok = await ask(L('禁用设备', 'Disable device'), esc(L('禁用后将停止连接与采集，可在设备菜单中重新启用。', 'The connection and polling will stop; re-enable later from the menu.')), true, L('禁用', 'Disable'));
      if (!ok) return;
    }
    try {
      const r = await api('/api/devices/' + encodeURIComponent(id) + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r && r.devices) { state.devices = r.devices; state.devicePrimary = r.activeId || state.devicePrimary; renderDevicePicker(); }
      toast(action === 'reconnect' ? L('正在重连…', 'Reconnecting…') : action === 'enable' ? L('已启用', 'Enabled') : L('已禁用', 'Disabled'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
    await loadDevicesData(true);
  }
  async function devPower(id, action) {
    const d = (state.devices || []).find((x) => x.id === id);
    const isReboot = action === 'reboot';
    const ok = await ask(
      isReboot ? L('重启路由器', 'Reboot router') : L('关闭路由器', 'Shutdown router'),
      `<b>${ex(d ? d.name : id)}</b> ${isReboot
        ? L('将立即重启，连接会短暂中断，约 1–3 分钟后恢复。确认继续？', 'will reboot now. The connection drops briefly and returns in ~1–3 minutes. Continue?')
        : L('将立即关机，设备会离线且需要手动加电才能恢复。确认继续？', 'will shut down now. The device goes offline and needs a manual power-on to return. Continue?')}`,
      true, isReboot ? L('重启', 'Reboot') : L('关机', 'Shutdown'));
    if (!ok) return;
    try {
      await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, device: id }) });
      toast(isReboot ? L('已下发重启指令', 'Reboot command sent') : L('已下发关机指令', 'Shutdown command sent'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
  async function devFwScan(id) {
    const d = (state.devices || []).find((x) => x.id === id);
    toast(L('正在扫描固件…', 'Scanning firmware…'));
    try {
      const r = await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fwCheck', device: id }) });
      const avail = !!(r && r.available);
      UI.openModal({
        title: L('固件扫描结果', 'Firmware scan result'), sub: ex(d ? d.name : id),
        body: `<div class="ui-detail">
          <div class="ui-detail-row"><small>${esc(L('已安装版本', 'Installed version'))}</small><b>${ex((r && r.installedVersion) || '—')}</b></div>
          <div class="ui-detail-row"><small>${esc(L('最新版本', 'Latest version'))}</small><b>${ex((r && r.latestVersion) || '—')}</b></div>
          <div class="ui-detail-row"><small>${esc(L('状态', 'Status'))}</small><b>${ex((r && r.status) || (avail ? L('有可用更新', 'Update available') : L('已是最新', 'Up to date')))}</b></div>
        </div>`,
        actions: [{ label: L('关闭', 'Close') }]
      });
    } catch (e) { toast(e.message, 'err'); }
  }
  async function devFwInstall(id) {
    const d = (state.devices || []).find((x) => x.id === id);
    const ok = await ask(L('更新固件', 'Update firmware'), `<b>${ex(d ? d.name : id)}</b> ${L('将从 RouterOS 官方源下载并安装最新固件，完成后路由器会重启、连接短暂中断。确认继续？', 'will download and install the latest firmware from RouterOS, then reboot. The connection drops briefly. Continue?')}`, true, L('更新并重启', 'Update & reboot'));
    if (!ok) return;
    try {
      await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fwInstall', device: id }) });
      toast(L('已下发固件更新指令，路由器即将重启', 'Firmware update sent; router will reboot'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
  async function deleteDevice(d) {
    const ok = await ask(L('删除设备', 'Delete device'), `${L('将从 ros-center 移除', 'Remove from ros-center')} <b>${ex(d.name)}</b> ${L('及其历史统计，不会修改路由器本身。', 'and its statistics. The router itself is not changed.')}`, true, L('删除', 'Delete'));
    if (!ok) return;
    try {
      await api('/api/devices/' + encodeURIComponent(d.id), { method: 'DELETE' });
      toast(L('设备已删除', 'Device deleted'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
    await loadDevicesData(true);
  }
  function openDeviceForm(id) {
    const d = id ? (state.devices || []).find((x) => x.id === id) : null;
    const s = d ? (d.status || {}) : {};
    const isDemoDev = isDemo(s);
    const f = (key, label, val, ph, type) => `<label class="ui-field"><span>${esc(label)}</span><input data-f="${key}" type="${type || 'text'}" value="${ex(val == null ? '' : val)}" placeholder="${esc(ph || '')}" autocomplete="off"></label>`;
    UI.openModal({
      title: d ? L('编辑设备', 'Edit device') : L('添加设备', 'Add device'),
      sub: L('连接参数只保存在本机 data 目录，不会上传。', 'Connection settings stay in the local data directory.'),
      body: `<div class="ui-fields">
        ${f('name', L('显示名称', 'Name'), d ? d.name : '', L('主路由', 'Primary router'))}
        ${f('host', L('地址', 'Host'), d ? d.host : '', '10.0.0.1')}
        ${f('port', L('API 端口', 'API port'), d ? d.port : 8728, '8728', 'number')}
        ${f('user', L('账号', 'User'), d ? d.user : '', 'admin')}
        ${f('password', L('密码', 'Password'), '', d ? L('留空保持不变', 'Leave blank to keep') : '', 'password')}
        <label class="ui-switch-row"><input type="checkbox" data-f="tls"${s.tls ? ' checked' : ''}><span class="sw-rail"></span><span class="sw-txt"><b>TLS / API-SSL</b><small>${esc(L('通常端口 8729', 'Usually port 8729'))}</small></span></label>
        <label class="ui-switch-row"><input type="checkbox" data-f="demo"${isDemoDev ? ' checked' : ''}><span class="sw-rail"></span><span class="sw-txt"><b>${esc(L('演示模式', 'Demo mode'))}</b><small>${esc(L('不连接真实路由器，使用模拟数据', 'Simulated data, no router connection'))}</small></span></label>
        <label class="ui-switch-row"><input type="checkbox" data-f="enabled"${d ? (s.enabled !== false ? ' checked' : '') : ''}><span class="sw-rail"></span><span class="sw-txt"><b>${esc(L('启用设备', 'Enable device'))}</b><small>${esc(L('保存后立即建立连接', 'Connect immediately after saving'))}</small></span></label>
      </div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(d ? L('保存', 'Save') : L('添加', 'Add'))}</button>`,
      onMount(m) {
        const val = (k) => { const el = m.querySelector('[data-f="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const body = { name: val('name'), host: val('host'), port: Number(val('port')), user: val('user'), tls: val('tls'), demo: val('demo'), enabled: val('enabled') };
          const pwd = val('password'); if (pwd) body.password = pwd;
          if (!body.name || !body.host || !body.user) { toast(L('名称、地址和账号不能为空', 'Name, host and user are required'), 'err'); return; }
          if (!(body.port >= 1 && body.port <= 65535)) { toast(L('端口不正确', 'Invalid port'), 'err'); return; }
          try {
            const url = d ? '/api/devices/' + encodeURIComponent(d.id) + '/edit' : '/api/devices';
            const r = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r && r.devices) { state.devices = r.devices; state.devicePrimary = r.activeId || state.devicePrimary; renderDevicePicker(); }
            UI.closeModal();
            toast(d ? L('设备已更新', 'Device updated') : L('设备已添加', 'Device added'), 'ok');
            await loadDevicesData(true);
          } catch (e) { toast(e.message, 'err'); }
        };
      }
    });
  }
  /* 备份文件名 = 设备名 + 备份名 + 时间戳，保证多次备份各自独立、不会互相覆盖 */
  function backupNameBase() {
    const stem = (DV.bkCfg && DV.bkCfg.name) || 'backup';
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return stem + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function backupNamePreview(dev, ext) {
    const stem = String((dev && dev.name) || L('设备', 'device'));
    return (stem + '-' + backupNameBase()).replace(/[^\p{L}\p{N}_\-]/gu, '') + ext;
  }
  async function refreshBackupFiles(repaint) {
    try {
      const r = await fetchAllBackupFiles();
      DV.files = r.files;
      DV.filesErrs = r.errs;
      DV.filesErr = (!r.files.length && r.errs.length) ? r.errs[0] : '';
    } catch (e) { DV.filesErr = (e && e.message) || L('读取失败', 'Load failed'); }
    DV.filesAt = Date.now();
    if (state.section !== 'devices') return;
    if (repaint && DV.tab === 'backup') paintDevices();
    else paintDevCounts();
  }
  async function createBackup(kind, deviceId) {
    const dev = (state.devices || []).find((x) => x.id === (deviceId || state.deviceId)) || curDev();
    if (!dev) { toast(L('没有可用设备', 'No device'), 'err'); return; }
    const name = String(dev.name) + '-' + backupNameBase();
    toast(L('正在生成配置备份…', 'Creating config backup…'));
    try {
      const r = await api('/api/backup/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'config', name, device: dev.id }),
      });
      const fname = (r && r.fileName) || (name + '.rsc');
      toast(L('配置备份已生成', 'Config backup created') + ' · ' + fname, 'ok');
      if (window.UI) UI.closeModal();
      /* 备份完成后切到备份页并汇总全部设备，使新备份与既有备份同时出现在设备清单卡片 */
      DV.tab = 'backup';
      DV.bkFilter = 'all';
      await refreshBackupFiles(true);
      await loadDevicesData(true);
    } catch (e) { toast(e.message, 'err'); }
  }
  async function quickBackupDevice(d) {
    if (!d) return;
    const ok = await ask(L('立即备份此设备', 'Back up this device'),
      `<b>${ex(d.name)}</b> ${L('将导出配置备份，最终文件名为', 'will export a config backup as')} <span class="mono">${ex(backupNamePreview(d, '.rsc'))}</span>。${L('确认继续？', ' Continue?')}`,
      false, L('立即备份', 'Back up now'));
    if (!ok) return;
    await createBackup('config', d.id);
  }
  async function openImportBackupModal(d) {
    if (!d) return;
    const modal = UI.openModal({
      title: L('导入备份 · rsc', 'Import backup · rsc'),
      sub: d.name + ' · ' + L('仅支持 .rsc 文本配置，.backup 不支持在线导入', 'Only .rsc text config; .backup cannot be imported online'),
      body: `<div class="ui-form-note">${esc(L('从路由器的备份列表中选择 .rsc 文件，导入前会自动生成一份 .backup 回滚点。', 'Pick a .rsc file from the router. A rollback .backup is created before importing.'))}</div>
        <div id="impBkList"><div class="bk-dl-empty">${esc(L('正在读取路由器文件…', 'Reading router files…'))}</div></div>`,
      actions: [{ label: L('关闭', 'Close') }],
    });
    let files = [];
    try {
      const fl = await api('/api/backup/files?device=' + encodeURIComponent(d.id));
      files = (fl && fl.files) || [];
      if (fl && fl.error) throw new Error(fl.error);
    } catch (e) {
      const box = modal.querySelector('#impBkList');
      if (box) box.innerHTML = `<div class="bk-dl-empty">${ex((e && e.message) || L('读取失败', 'Load failed'))}</div>`;
      return;
    }
    const rsc = files.filter((f) => f.type === 'config' && /\.rsc$/i.test(f.name));
    const box = modal.querySelector('#impBkList');
    if (!box) return;
    if (!rsc.length) { box.innerHTML = `<div class="bk-dl-empty">${esc(L('路由器上没有 .rsc 备份文件', 'No .rsc backup on the router'))}</div>`; return; }
    box.innerHTML = `<div class="bk-download-list">${rsc.map((f) => `<div class="bk-dl-item" data-imp="${ex(f.name)}">${ic('file')}<span class="mono">${ex(f.name)}</span><small>${ex(fmtSize(f.size))}</small><button type="button" class="btn-xs primary" data-imp-go="${ex(f.name)}">${esc(L('导入', 'Import'))}</button></div>`).join('')}</div>`;
    box.querySelectorAll('[data-imp-go]').forEach((btn) => {
      btn.onclick = () => importRouterFile(btn.dataset.impGo, d);
    });
  }
  async function importRouterFile(file, d) {
    if (!file || !d) return;
    const ok = await ask(L('导入 RouterOS 配置', 'Import RouterOS config'),
      `<b>${ex(file)}</b> ${L('将逐条执行其中的配置命令，可能覆盖现有配置；导入前会自动生成回滚备份。确认继续？', 'will run its commands and may overwrite configuration. A rollback backup is created first. Continue?')}`,
      true, L('继续导入', 'Import'));
    if (!ok) return;
    try {
      const r = await api('/api/routeros/import-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, device: d.id }) });
      toast(L('导入完成', 'Import complete') + ' · ' + (r && r.file) + (r && r.rollback ? ' · ' + L('回滚', 'Rollback') + ' ' + r.rollback : ''), 'ok');
      UI.closeModal();
      await refreshBackupFiles(true);
    } catch (e) { toast((e && e.message) || L('导入失败', 'Import failed'), 'err'); }
  }
  function downloadBackup(name, deviceId) {
    if (!name) { toast(L('没有可下载的备份', 'No backup to download'), 'err'); return; }
    const url = '/api/backup/download?name=' + encodeURIComponent(name) + '&device=' + encodeURIComponent(deviceId || bkDeviceId());
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast(L('已开始下载', 'Download started') + ' · ' + name, 'ok');
  }
  async function deleteBackup(name, deviceId) {
    if (!name) return;
    const ok = await ask(L('删除此备份', 'Delete this backup'), `${L('将从路由器 /flash 永久删除', 'Permanently delete from router /flash')} <b>${ex(name)}</b> ${L('，此操作不可恢复。确认继续？', '. This cannot be undone. Continue?')}`, true, L('删除', 'Delete'));
    if (!ok) return;
    try {
      await api('/api/backup/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, device: deviceId || bkDeviceId() }) });
      toast(L('备份已删除', 'Backup deleted') + ' · ' + name, 'ok');
    } catch (e) {
      toast((e && e.message) || L('删除失败', 'Delete failed'), 'err');
    }
    await refreshBackupFiles(true);
  }
  function scanRow(label, value, tag) {
    return `<div class="ui-scan-row"><span>${esc(label)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : `<b>${esc(value)}</b>`}</div>`;
  }
  async function checkUpdates() {
    const devCount = (state.devices || []).filter((d) => (d.status || {}).enabled !== false).length;
    const curVer = rosVersion() || '—';
    const modal = UI.openModal({
      title: L('检查更新', 'Check updates'), sub: L('设备与固件 · 扫描固件与控制台版本', 'Devices & firmware · scan firmware and console version'),
      body: `<div class="ui-scan"><div class="ui-scan-head"><b>${esc(L('正在连接更新服务并扫描设备…', 'Connecting to update service and scanning devices…'))}</b><span>live</span></div>
        <div class="ui-scan-bar"><i></i></div>
        <div class="ui-scan-results">
          ${scanRow(L('当前版本', 'Current version'), 'RouterOS ' + curVer)}
          ${scanRow(L('检查范围', 'Scope'), devCount + ' ' + L('台设备', 'devices'))}
        </div></div>`,
      actions: [{ label: L('关闭', 'Close') }]
    });
    let r = null, err = '';
    try { r = await api('/api/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    catch (e) { err = (e && e.message) || '检查失败'; }
    if (!document.body.contains(modal.overlay)) return;
    const st = (r && r.status) || {};
    const latest = st.latest || {};
    const hasUp = !!(st.hasUpdate);
    const bestFw = latestFirmware();
    const onlineRows = (state.devices || []).filter((d) => (d.status || {}).enabled !== false).map((d) => {
      const s = d.status || {}; const v = String(s.version || '').trim();
      const behind = !!(bestFw && v && verCmp(v, bestFw) < 0);
      return scanRow(ex(d.name), v ? 'RouterOS ' + v : '—', behind ? L('可更新', 'Update') : (v ? L('已是最新', 'Up to date') : L('未连接', 'Offline')));
    }).join('');
    const latestVer = bestFw || latest.version || (DV.up && DV.up.runtime && DV.up.runtime.version) || '—';
    modal.body.innerHTML = `<div class="ui-statline">
        <span><b>${ex(bestFw || '—')}</b>${esc(L('最新固件', 'Latest firmware'))}</span>
        <span><b>${hasUp ? '1' : '0'}</b>${esc(L('控制台更新', 'Console update'))}</span>
        <span><b>${devCount}</b>${esc(L('台设备', 'devices'))}</span>
      </div>
      <div class="ui-scan-results">${onlineRows || `<div class="ui-scan-row"><span>${esc(L('无在线设备', 'No online devices'))}</span></div>`}</div>
      ${err ? `<div class="ui-warning" style="margin-top:13px"><b>${esc(L('检查未完全成功', 'Check incomplete'))}</b>${esc(err)}</div>`
        : `<div class="ui-warning" style="margin-top:13px"><b>${esc(L('说明', 'Note'))}</b>${esc(L('固件版本由路由器实时上报；升级固件请在路由器 System → Packages 执行，本页仅报告与提示。', 'Firmware versions are reported live by each router. Upgrade runs on the router (System → Packages); this page only reports.'))}</div>`}`;
    toast(L('固件检查完成', 'Firmware check complete'), 'ok');
    if (r) { DV.up = { status: st, runtime: (DV.up && DV.up.runtime) || null }; await loadDevicesData(true); }
  }

  /* ---------- 用户与权限 ---------- */
  function usFiltered() {
    const q = US.q.trim().toLowerCase();
    let list = US.users || [];
    if (US.filter === 'full') list = list.filter((u) => u.group === 'full');
    if (US.filter === 'enabled') list = list.filter((u) => u.disabled !== 'true');
    if (!q) return list;
    return list.filter((u) => [u.name, u.group, u.address, u.comment, u['last-logged-in']].some((x) => String(x || '').toLowerCase().includes(q)));
  }
  function usKpis() {
    const users = US.users || [];
    const enabled = users.filter((u) => u.disabled !== 'true').length;
    const admins = users.filter((u) => u.group === 'full').length;
    const groups = {};
    users.forEach((u) => { groups[u.group || '—'] = (groups[u.group || '—'] || 0) + 1; });
    const groupOrder = ['full', 'write', 'read', 'monitor', 'api'];
    const groupText = (key) => L(({ full: '管理员', write: '运维', read: '只读', api: 'API', monitor: '监控' })[key] || key,
      ({ full: 'Admin', write: 'Operator', read: 'Read-only', api: 'API', monitor: 'Monitor' })[key] || key);
    const groupsTxt = groupOrder.filter((g) => groups[g]).slice(0, 2).map((g) => `${groupText(g)} ${groups[g]}`).join(' · ') || L('暂无账户', 'No accounts');
    const sessions = sessionsRows();
    const sources = new Set(sessions.map((a) => String(a.address || '').split(':')[0]).filter(Boolean));
    const adminNames = users.filter((u) => u.group === 'full').map((u) => u.name).slice(0, 3).join(' · ') || '—';
    const lastLogin = users.filter((u) => u.group === 'full').map(lastLoginOf).find((x) => x && x !== '—') || '—';
    const adminEnabled = users.filter((u) => u.group === 'full' && u.disabled !== 'true').length;
    return [
      kpiCard({ label: L('账户', 'Accounts'), icon: 'users', color: 'blue', num: String(users.length),
        state: { dot: enabled ? 'green' : 'muted', text: `${enabled} ${L('启用', 'enabled')}` },
        foot: [groupsTxt, groupOrder.filter((g) => groups[g]).slice(2, 4).map((g) => `${groupText(g)} ${groups[g]}`).join(' · ') || '—'] }),
      kpiCard({ label: L('管理员', 'Administrators'), icon: 'shield', color: 'violet', num: String(admins),
        state: { dot: adminEnabled ? 'green' : 'amber', text: adminEnabled ? L('全部启用', 'All enabled') : L('存在禁用', 'Disabled') },
        foot: [adminNames, L('最近登录', 'Last') + ' ' + lastLogin] }),
      kpiCard({ label: L('今日登录', 'Logins today'), icon: 'conn', color: 'teal', num: String(sessions.length),
        state: { dot: 'green', text: L('全部成功', 'All succeeded') },
        foot: [`${sources.size} ${L('个来源 IP', 'source IPs')}`, L('失败', 'Failed') + ' 0'] }),
      kpiCard({ label: L('用户组', 'Groups'), icon: 'layers', color: 'green', num: String((US.groups || []).length),
        state: { dot: (US.groups || []).length ? 'green' : 'muted', text: L('角色级访问', 'Role-based') },
        foot: [(US.groups || []).map((g) => String(g.name || '')).filter(Boolean).slice(0, 2).join(' · ') || L('暂无用户组', 'No groups'), L('权限矩阵', 'RBAC matrix')] })
    ].join('');
  }
  function usersTable() {
    const rows = usFiltered();
    const body = rows.map((u) => {
      const disabled = u.disabled === 'true';
      const isWeb = u.name === US.auth.user && US.auth.enabled;
      return `<tr>
        <td data-label="${esc(L('用户', 'User'))}"><div class="user-cell">${avatarHtml(u.name, u.group)}<span class="cell"><b>${ex(u.name)}</b><small>${ex(u.comment || L('无备注', 'No comment'))}</small></span></div></td>
        <td data-label="${esc(L('角色', 'Role'))}"><span class="chain">${ex(u.group || '—')}</span></td>
        <td data-label="${esc(L('来源', 'Source'))}"><span class="addr">${ex(u.address || L('任意来源', 'Any'))}</span></td>
        <td data-label="${esc(L('最近登录', 'Last login'))}"><span class="num">${ex(lastLoginOf(u))}</span></td>
        <td data-label="2FA">${isWeb ? (((US.twofa || {}).enabled) ? '<span class="badge allow">' + esc(L('已启用', 'Enabled')) + '</span>' : '<span class="badge neutral">' + esc(L('未启用', 'Off')) + '</span>') : '<span class="badge neutral">—</span>'}</td>
        <td data-label="${esc(L('状态', 'Status'))}">${disabled ? st('muted', L('已禁用', 'Disabled')) : st('green', L('启用', 'Enabled'))}</td>
        <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="usr-more" data-kind="users" data-id="${ex(u['.id'] || u.name)}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:24%"><col style="width:14%"><col style="width:20%"><col style="width:18%"><col style="width:10%"><col style="width:8%"><col></colgroup>
      <thead><tr><th>${esc(L('用户', 'User'))}</th><th>${esc(L('角色', 'Role'))}</th><th>${esc(L('来源', 'Source'))}</th><th>${esc(L('最近登录', 'Last login'))}</th><th>2FA</th><th>${esc(L('状态', 'Status'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="7">${emptyBox(L('没有匹配的用户', 'No matching users'), L('调整搜索关键词', 'Adjust your search'))}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${(US.users || []).length} ${L('个账户', 'accounts')} · ${L('最小权限', 'Least privilege')}</span><span class="mono">${esc(relTime(US.loadedAt))}</span></div>`;
  }
  function rolesTable() {
    const groups = US.groups || [];
    const body = groups.map((g) => {
      const members = (US.users || []).filter((u) => u.group === g.name).length;
      const policy = String(g.policy || '').split(',').filter(Boolean);
      return `<tr>
        <td data-label="${esc(L('用户组', 'Group'))}"><div class="cell"><b>${ex(g.name || '—')}</b><small>${ex(g.comment || L('用户组', 'User group'))}</small></div></td>
        <td data-label="${esc(L('权限策略', 'Policy'))}"><div class="pg-policy">${policy.slice(0, 8).map((p) => `<span>${ex(p)}</span>`).join('')}${policy.length > 8 ? `<span>+${policy.length - 8}</span>` : ''}${policy.length ? '' : '<span>—</span>'}</div></td>
        <td data-label="${esc(L('成员', 'Members'))}"><span class="num">${members}</span></td>
        <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="usr-more" data-kind="groups" data-id="${ex(g.name)}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:22%"><col><col style="width:12%"><col></colgroup>
      <thead><tr><th>${esc(L('用户组', 'Group'))}</th><th>${esc(L('权限策略', 'Policy'))}</th><th class="r">${esc(L('成员', 'Members'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="4">${emptyBox(L('没有用户组数据', 'No groups'), '')}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${groups.length} ${L('个用户组 · 权限策略来自 RouterOS', 'groups · policy from RouterOS')}</span><span class="mono">/user/group</span></div>`;
  }
  function sessionsRows() {
    let list = US.active || [];
    if (!list.length && US.activeDemo) list = demoActive();
    return list;
  }
  function demoActive() {
    const users = US.users || [];
    const hh = String(new Date().getHours()).padStart(2, '0');
    const mm = (i) => String((new Date().getMinutes() + 52 - i * 9 + 60) % 60).padStart(2, '0');
    return users.slice(0, 4).map((u, i) => ({
      name: u.name,
      address: ['10.0.0.101', '10.0.0.120', '10.0.0.23', '10.0.0.104'][i % 4],
      via: i === 2 ? 'api' : 'web-ssl',
      group: u.group || 'full',
      when: `${hh}:${mm(i)}`
    }));
  }
  function lastLoginOf(u) {
    if (u['last-logged-in']) return u['last-logged-in'];
    if (!US.activeDemo) return '—';
    const hit = demoActive().find((a) => a.name === u.name);
    if (!hit) return '—';
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hit.when}`;
  }
  function sessionsTable() {
    const list = sessionsRows();
    const body = list.map((a) => `<tr>
      <td data-label="${esc(L('用户', 'User'))}"><div class="user-cell"><span class="u-avatar ${avatarTone(a.name, a.group)}">${ex(initials(a.name))}</span><b>${ex(a.name || '—')}</b></div></td>
      <td data-label="${esc(L('来源', 'Address'))}"><span class="addr">${ex(a.address || '—')}</span></td>
      <td data-label="${esc(L('类型', 'Via'))}"><span class="chain">${ex(a.via || '—')}</span></td>
      <td data-label="${esc(L('登录时间', 'When'))}"><span class="num">${ex(a.when || '—')}</span></td>
      <td data-label="${esc(L('状态', 'Status'))}">${st('green', L('活跃', 'Active'))}</td>
      <td class="row-actions-cell" data-label="${esc(L('操作', 'Actions'))}"><button class="row-more" type="button" data-act="usr-more" data-kind="active" data-id="${ex(a.name || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
    </tr>`).join('');
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:24%"><col style="width:20%"><col style="width:14%"><col style="width:22%"><col style="width:14%"><col></colgroup>
      <thead><tr><th>${esc(L('用户', 'User'))}</th><th>${esc(L('来源', 'Address'))}</th><th>${esc(L('类型', 'Via'))}</th><th>${esc(L('登录时间', 'When'))}</th><th>${esc(L('状态', 'Status'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="6">${emptyBox(L('暂无活动会话', 'No active sessions'), L('RouterOS 中当前没有已登录用户', 'No one is signed in on RouterOS'))}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${list.length} ${L('个会话', 'sessions')}${US.activeDemo ? ' · ' + L('演示数据', 'demo data') : ''}</span><span class="mono">/user/active</span></div>`;
  }
  function usersRail() {
    const users = US.users || [];
    const groups = {};
    users.forEach((u) => { groups[u.group || '—'] = (groups[u.group || '—'] || 0) + 1; });
    const list = sessionsRows();
    return `
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('最近登录', 'Recent logins'))}</h2><div class="card-sub">${esc(L('会话审计', 'Session audit'))}</div></div></div>
        <div class="rail-body tight">${list.length ? `<div class="timeline">${list.slice(0, 4).map((a, i) => `<div class="tl-item"><span class="tl-dot"${i ? ` style="background:var(--v2-${i % 2 ? 'teal' : 'violet'});box-shadow:0 0 0 3px var(--v2-${i % 2 ? 'teal' : 'violet'}-soft)"` : ''}></span><div><b>${ex(a.name || '—')} ${esc(L('登录', 'signed in'))}</b><small>${ex(a.address || '—')} · ${ex(a.via || '—')} · ${ex(a.when || '—')}</small></div></div>`).join('')}</div>`
            : `<div class="pg-empty" style="padding:18px 0">${ic('clock')}<div>${esc(L('暂无会话审计数据', 'No session data'))}</div></div>`}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('账户概览', 'Account overview'))}</h2><div class="card-sub">${users.length} ${esc(L('个账户', 'accounts'))}</div></div><span class="status">${esc(L('启用', 'On'))}</span></div>
        <div class="rail-body">
          ${Object.keys(groups).length ? Object.keys(groups).map((g) => `<div class="kv"><span>${ex(g)}</span><b>${groups[g]}</b></div>`).join('') : '<div class="kv"><span>—</span><b>0</b></div>'}
        </div>
      </section>`;
  }
  function usToolbarHtml(tab) {
    const users = US.users || [];
    if (tab !== 'users') {
      return `<div class="toolbar"><span class="spacer"></span><span class="toolbar-note">${esc(tab === 'roles' ? L('遵循最小权限原则 · 只有管理员可修改用户', 'Least privilege · only admins can manage users') : L('空闲 30 分钟后自动注销 · 仅显示最近会话', 'Auto sign-out after 30 minutes of inactivity'))}</span></div>`;
    }
    return `<div class="toolbar">
          <label class="field">${ic('search')}<input id="pgUsrSearch" value="${esc(US.q)}" placeholder="${esc(L('搜索用户、用户组或来源…', 'Search users, groups or source…'))}" aria-label="${esc(L('搜索用户', 'Search users'))}"></label>
          <div class="chips">
            <button class="chip${US.filter ? '' : ' on'}" type="button" data-act="usr-chip" data-filter="">${esc(L('全部', 'All'))} <b>${users.length}</b></button>
            <button class="chip${US.filter === 'full' ? ' on' : ''}" type="button" data-act="usr-chip" data-filter="full">${esc(L('管理员', 'Admins'))} <b>${users.filter((u) => u.group === 'full').length}</b></button>
            <button class="chip${US.filter === 'enabled' ? ' on' : ''}" type="button" data-act="usr-chip" data-filter="enabled">${esc(L('已启用', 'Enabled'))} <b>${users.filter((u) => u.disabled !== 'true').length}</b></button>
          </div>
          <span class="spacer"></span><span class="toolbar-note">${esc(US.err || US.note || L('最后审计 · 会话 30 分钟超时', 'Last audit · 30-minute session timeout'))}</span>
        </div>`;
  }
  function exportUsersAudit() {
    const rows = (US.users || []).map((u) => [u.name || '', u.group || '', u.address || '', u.comment || '', u.disabled === 'true' ? L('已禁用', 'disabled') : L('启用', 'enabled')]);
    if (!rows.length) { toast(L('没有用户可导出', 'No users to export'), 'err'); return; }
    downloadCsv('ros-users-' + new Date().toISOString().slice(0, 10) + '.csv',
      [L('用户名', 'User'), L('用户组', 'Group'), L('允许来源', 'Address'), L('备注', 'Comment'), L('状态', 'Status')], rows);
    toast(L('已导出', 'Exported'), 'ok');
  }
  function openUsersCardMenu(anchor) {
    const compact = document.body.classList.contains('ui-compact');
    UI.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 用户与权限', 'CSV · users & access'), icon: 'i-download', action: exportUsersAudit },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        toast(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(L('用户与权限', 'Users & access'))}</small></div>` });
  }
  function usersHtml() {
    const tab = US.tab;
    const users = US.users || [];
    return `<div class="page-head">
      <div><h1>${esc(L('用户与权限', 'Users & access'))}</h1><div class="meta"><span>${esc(L('主路由', 'Primary'))}</span><span class="sep"></span><span>${users.length} ${esc(L('个账户', 'accounts'))}</span><span class="sep"></span><span>${US.groups.length} ${esc(L('个用户组', 'groups'))}</span></div></div>
      <div class="actions">
        <button class="btn primary" type="button" data-act="usr-add">${ic('plus')}${esc(L('添加用户', 'Add user'))}</button>
      </div>
    </div>
    <div class="grid align-start">
      <section class="kpis" id="pgUsrKpis">${US.users ? usKpis() : ''}</section>
      <div class="span8 col-stack">
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(L('用户与权限', 'Users & access'))}</h2><div class="card-sub">${esc(L('账户 · 角色 · 会话审计', 'Accounts · roles · session audit'))}</div></div><div style="display:flex;align-items:center;gap:10px">${US.auth.enabled ? st('green', L('安全', 'Secure')) : st('amber', L('未设密码', 'No password'))}<button class="btn icon-only" type="button" data-act="usr-menu" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}">${ic('more')}</button></div></div>
          <div class="panel-tabs">
            <button class="panel-tab${tab === 'users' ? ' on' : ''}" type="button" data-act="usr-tab" data-tab="users">${esc(L('用户', 'Users'))}<span class="pt-count">${users.length}</span></button>
            <button class="panel-tab${tab === 'roles' ? ' on' : ''}" type="button" data-act="usr-tab" data-tab="roles">${esc(L('用户组', 'Groups'))}<span class="pt-count">${US.groups.length}</span></button>
            <button class="panel-tab${tab === 'sessions' ? ' on' : ''}" type="button" data-act="usr-tab" data-tab="sessions">${esc(L('会话', 'Sessions'))}<span class="pt-count">${sessionsRows().length}</span></button>
          </div>
          <div id="pgUsrToolbar">${usToolbarHtml(tab)}</div>
          <div id="pgUsrPanel">
            ${tab === 'users' ? `<div class="tab-panel on" data-panel="users">${usersTable()}</div>`
              : tab === 'roles' ? `<div class="tab-panel on" data-panel="roles">${rolesTable()}</div>`
                : `<div class="tab-panel on" data-panel="sessions">${sessionsTable()}</div>`}
          </div>
        </section>
        ${loginPolicyCard()}
        ${permissionMatrixCard()}
      </div>
      <div class="span4 rail" id="pgUsrRail">${usersRail()}</div>
    </div>`;
  }
  function loginPolicyCard() {
    const two = US.twofa || {};
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${esc(L('登录策略', 'Login policy'))}</h2><div class="card-sub">${esc(L('密码、2FA 与会话', 'Password, 2FA and sessions'))}</div></div>
        <button class="link" type="button" data-act="webui-2fa">${esc(L('2FA 设置', '2FA settings'))}${ic('chevron')}</button></div>
      <div class="rail-body">
        <div class="kv"><span>${esc(L('密码最小长度', 'Minimum password length'))}</span><b>${esc(L('6 位', '6 characters'))}</b></div>
        <div class="kv"><span>${esc(L('失败锁定', 'Failed login lockout'))}</span><b>${esc(L('仅校验密码', 'Password check only'))}</b></div>
        <div class="kv"><span>${esc(L('会话超时', 'Session timeout'))}</span><b>${esc(L('7 天（浏览器会话）', '7 days (browser session)'))}</b></div>
        <div class="kv"><span>${esc(L('双因素认证', 'Two-factor authentication'))}</span><b>${two.enabled ? esc(L('已启用 · TOTP', 'Enabled · TOTP')) : esc(L('未启用', 'Disabled'))}</b></div>
        <div class="notice ${two.enabled ? 'green' : 'blue'}">${ic(two.enabled ? 'check' : 'shield')}<div>${esc(two.enabled ? L('WebUI 登录已启用 2FA；验证码每 30 秒更新。', '2FA is on for WebUI sign-in; codes rotate every 30 seconds.') : L('建议为 WebUI 账户启用 2FA，防止弱口令直接暴露管理界面。', 'Enable 2FA to protect the management UI from weak passwords.'))}</div></div>
      </div>
    </section>`;
  }
  function permissionMatrixCard() {
    const roles = ['full', 'write', 'read', 'api'];
    const label = (k) => L(({ full: '管理员', write: '运维', read: '只读', api: 'API' })[k], ({ full: 'Admin', write: 'Operator', read: 'Read-only', api: 'API' })[k]);
    const rows = [
      [L('系统设置', 'System settings'), ['allow', 'allow', 'neutral', 'neutral']],
      [L('防火墙', 'Firewall'), ['allow', 'allow', 'neutral', 'neutral']],
      [L('用户管理', 'User management'), ['allow', 'neutral', 'neutral', 'neutral']],
      [L('日志审计', 'Log audit'), ['allow', 'allow', 'allow', 'neutral']]
    ];
    const txt = { allow: L('允许', 'Allow'), neutral: L('—', '—') };
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${esc(L('权限矩阵', 'Permission matrix'))}</h2><div class="card-sub">${esc(L('角色级访问控制', 'Role-based access control'))}</div></div><span class="badge info">RBAC</span></div>
      <div class="table-scroll"><table class="dt dense"><colgroup><col style="width:28%">${roles.map(() => '<col style="width:18%">').join('')}</colgroup>
        <thead><tr><th>${esc(L('权限', 'Permission'))}</th>${roles.map((r) => `<th>${esc(label(r))}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([name, cells]) => `<tr><td><b>${ex(name)}</b></td>${cells.map((c) => `<td><span class="badge ${c}">${esc(txt[c])}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="table-foot"><span>${esc(L('角色权限不可绕过 · 变更需管理员确认', 'Roles cannot be bypassed · changes require an admin'))}</span><span class="mono">${roles.length} ${esc(L('角色', 'roles'))}</span></div>
    </section>`;
  }
  async function loadUsersData(quiet) {
    if (US.loading) return;
    US.loading = true;
    US.err = '';
    try {
      const [u, g, a, auth, dev, two] = await Promise.all([
        api('/api/config?section=users').catch((e) => ({ error: e.message, rows: [] })),
        api('/api/config?section=userGroups').catch((e) => ({ error: e.message, rows: [] })),
        api('/api/config?section=activeUsers').catch((e) => ({ error: e.message, rows: [] })),
        api('/api/auth').catch(() => null),
        api('/api/devices').catch(() => null),
        api('/api/auth/2fa/status').catch(() => null)
      ]);
      US.users = (u && u.rows) || [];
      US.groups = (g && g.rows) || [];
      US.active = (a && a.rows) || [];
      US.demo = !!(u && u.demo);
      US.activeDemo = !!(u && u.demo) && !US.active.length;
      US.err = (u && u.error) || (g && g.error) || '';
      US.note = (a && a.error) ? L('会话接口不可用', 'Session API unavailable') : '';
      if (auth) US.auth = { enabled: !!auth.enabled, user: auth.user || state.authUser || '', users: auth.users || [] };
      if (two) US.twofa = { enabled: !!two.enabled, configured: !!two.configured };
      state.authEnabled = US.auth.enabled; state.authUser = US.auth.user;
      US.webPort = (dev && dev.webPort) || state.webPort || 0;
      US.hostPort = (dev && dev.hostPort) || state.hostPort || 0;
      US.loadedAt = Date.now();
    } catch (e) {
      US.err = e.message || String(e);
    } finally {
      US.loading = false;
      if (state.section === 'usersCenter') paintUsers();
    }
  }
  function paintUsers() {
    if (state.section !== 'usersCenter') return;
    const c = $('content'); if (!c) return;
    const scrollTop = window.scrollY;
    c.innerHTML = usersHtml();
    window.scrollTo(0, scrollTop);
  }
  function paintUsersPanel() {
    if (state.section !== 'usersCenter') return;
    const p = $('pgUsrPanel'); if (!p) return;
    p.innerHTML = US.tab === 'users' ? `<div class="tab-panel on" data-panel="users">${usersTable()}</div>`
      : US.tab === 'roles' ? `<div class="tab-panel on" data-panel="roles">${rolesTable()}</div>`
        : `<div class="tab-panel on" data-panel="sessions">${sessionsTable()}</div>`;
    document.querySelectorAll('.content.pg-users .panel-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === US.tab));
    const rail = $('pgUsrRail'); if (rail) rail.innerHTML = usersRail();
    const k = $('pgUsrKpis'); if (k) k.innerHTML = usKpis();
  }

  function openUserForm(id) {
    const u = id ? (US.users || []).find((x) => (x['.id'] || x.name) === id) : null;
    const groups = (US.groups || []).map((g) => `<option value="${ex(g.name)}"${u && u.group === g.name ? ' selected' : ''}>${ex(g.name)}</option>`).join('');
    UI.openModal({
      title: u ? L('编辑用户', 'Edit user') : L('添加用户', 'Add user'),
      sub: L('直接写入 RouterOS /user', 'Written to RouterOS /user'),
      body: `<div class="ui-fields">
        <label class="ui-field"><span>${esc(L('用户名', 'User'))}<em>*</em></span><input data-f="name" value="${ex(u ? u.name : '')}" autocomplete="off"></label>
        <label class="ui-field"><span>${esc(L('用户组', 'Group'))}</span><select data-f="group">${groups || '<option value="read">read</option>'}</select></label>
        <label class="ui-field"><span>${esc(L('允许来源', 'Allowed address'))}</span><input data-f="address" value="${ex(u ? u.address : '')}" placeholder="10.0.0.0/24"></label>
        <label class="ui-field"><span>${esc(L('备注', 'Comment'))}</span><input data-f="comment" value="${ex(u ? u.comment : '')}"></label>
        <label class="ui-field full"><span>${esc(u ? L('重置密码（留空不修改）', 'New password (blank = keep)') : L('密码', 'Password'))}</span><input data-f="password" type="password" autocomplete="new-password" placeholder="${esc(u ? L('留空保持不变', 'Leave blank to keep') : L('至少 8 位', 'At least 8 characters'))}"></label>
        ${u ? `<label class="ui-switch-row"><input type="checkbox" data-f="disabled"${u.disabled === 'true' ? ' checked' : ''}><span class="sw-rail"></span><span class="sw-txt"><b>${esc(L('禁用账户', 'Disable account'))}</b><small>${esc(L('禁用后无法登录 RouterOS', 'Cannot sign in to RouterOS'))}</small></span></label>` : ''}
      </div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(u ? L('保存', 'Save') : L('添加', 'Add'))}</button>`,
      onMount(m) {
        const v = (k) => { const el = m.querySelector('[data-f="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const name = v('name'), pwd = v('password');
          if (!name) { toast(L('用户名不能为空', 'User name is required'), 'err'); return; }
          if (!u && pwd.length < 8) { toast(L('密码至少 8 位', 'Password must be at least 8 characters'), 'err'); return; }
          if (pwd && pwd.length < 8) { toast(L('密码至少 8 位', 'Password must be at least 8 characters'), 'err'); return; }
          const values = { name, group: v('group') || 'read', address: v('address'), comment: v('comment') };
          if (pwd) values.password = pwd;
          try {
            await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u ? { section: 'users', action: 'set', ids: [u['.id']], values } : { section: 'users', action: 'add', values }) });
            if (u) {
              const wantDisabled = v('disabled');
              const isDisabled = u.disabled === 'true';
              if (wantDisabled !== isDisabled) {
                await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'users', action: wantDisabled ? 'disable' : 'enable', ids: [u['.id']] }) });
              }
            }
            UI.closeModal();
            toast(u ? L('用户已更新', 'User updated') : L('用户已添加', 'User added'), 'ok');
            await loadUsersData(true);
            paintUsersPanel();
          } catch (e) { toast(e.message, 'err'); }
        };
      }
    });
  }
  async function userAction(u, action) {
    if (action === 'delete') {
      const ok = await ask(L('删除用户', 'Delete user'), `${L('将从 RouterOS 删除账户', 'Delete account from RouterOS')} <b>${ex(u.name)}</b>。`, true, L('删除', 'Delete'));
      if (!ok) return;
    }
    try {
      await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'users', action, ids: [u['.id']] }) });
      toast(action === 'remove' ? L('用户已删除', 'User deleted') : action === 'enable' ? L('已启用', 'Enabled') : L('已禁用', 'Disabled'), 'ok');
      await loadUsersData(true);
      paintUsersPanel();
    } catch (e) { toast(e.message, 'err'); }
  }
  function userMenu(kind, id, anchor) {
    if (kind === 'groups') {
      const g = (US.groups || []).find((x) => x.name === id);
      if (!g) return;
      const canEdit = groupEditable(g);
      UI.openMenu(anchor, [
        { label: L('编辑用户组', 'Edit group'), icon: 'i-gear', disabled: !canEdit,
          sub: canEdit ? '' : L('当前账户无写入权限', 'No write permission'), action: () => openGroupForm(g) },
        { label: L('查看权限策略', 'View policy'), icon: 'i-shield', action: () => openGroupForm(g) },
        { label: L('复制策略', 'Copy policy'), icon: 'i-download', action: () => copyText(g.policy || '') }
      ]);
      return;
    }
    if (kind === 'active') {
      const a = sessionsRows().find((x) => x.name === id);
      if (!a) return;
      UI.openMenu(anchor, [
        { label: L('复制来源地址', 'Copy address'), icon: 'i-globe', action: () => copyText(a.address || '') },
        { label: L('查看该用户', 'Find this user'), icon: 'i-users', action: () => { US.tab = 'users'; US.filter = ''; US.q = String(a.name || ''); paintUsers(); } }
      ]);
      return;
    }
    const u = (US.users || []).find((x) => (x['.id'] || x.name) === id);
    if (!u) return;
    UI.openMenu(anchor, [
      { label: L('编辑用户', 'Edit user'), icon: 'i-lock', action: () => openUserForm(id) },
      { label: L('创建 WebUI 账户', 'Create WebUI account'), icon: 'i-users', action: () => openWebuiAccountForUser(u) },
      { label: L('上传头像', 'Upload avatar'), icon: 'i-upload', action: () => openAvatarUpload(u.name) },
      { label: L('复制用户名', 'Copy user name'), icon: 'i-users', action: () => copyText(u.name) },
      u.disabled === 'true'
        ? { label: L('启用账户', 'Enable account'), icon: 'i-play', action: () => userAction(u, 'enable') }
        : { label: L('禁用账户', 'Disable account'), icon: 'i-pause', action: () => userAction(u, 'disable') },
      { sep: true },
      { label: L('删除用户', 'Delete user'), icon: 'i-alert', danger: true, action: () => userAction(u, 'remove') }
    ]);
  }
  /* RouterOS 用户组 → WebUI 角色：full=管理员，write=可写，其余=只读 */
  function webuiRoleForGroup(g) {
    const name = String(g || '').toLowerCase();
    if (name === 'full') return 'admin';
    if (name === 'write') return 'write';
    return 'read';
  }
  function openWebuiAccountForUser(u) {
    const role = webuiRoleForGroup(u.group);
    const roleLabel = role === 'admin' ? L('管理员', 'Administrator') : role === 'write' ? L('可写', 'Write') : L('只读', 'Read-only');
    UI.openModal({
      title: L('创建 WebUI 账户', 'Create WebUI account'),
      sub: L('账户名与 RouterOS 用户名一致，权限跟随该用户的角色', 'Same name as the RouterOS user; role follows its group'),
      body: `<div class="ui-fields">
        <label class="ui-field"><span>${esc(L('用户名', 'User'))}</span><input value="${ex(u.name || '')}" readonly></label>
        <label class="ui-field"><span>${esc(L('权限角色', 'Role'))}</span><input value="${ex(roleLabel + ' · ' + (u.group || 'read'))}" readonly></label>
        <label class="ui-field full"><span>${esc(L('密码（留空即为空密码）', 'Password (blank = empty)'))}</span><input data-f="pass" type="password" autocomplete="new-password" placeholder="${esc(L('留空则密码为空', 'Leave blank for an empty password'))}"></label>
      </div>
      <div class="notice blue" style="margin-top:12px">${ic('shield')}<div>${L('创建后即可用该 RouterOS 用户名登录 WebUI；只读账户只能查看，不能编辑。', 'After creation, sign in with this RouterOS user name. Read-only accounts can view but not edit.')}</div></div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(L('创建账户', 'Create account'))}</button>`,
      onMount(m) {
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const pwd = m.querySelector('[data-f="pass"]').value;
          try {
            await api('/api/webui/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user: u.name, password: pwd, blank: pwd === '', role }) });
            UI.closeModal();
            toast(L('WebUI 账户已创建', 'WebUI account created'), L('登录名与 RouterOS 账户一致。', 'Sign in with the same user name.'), 'ok');
            if (state.section === 'usersCenter') { await loadUsersData(true); paintUsersPanel(); }
          } catch (e) { toast(e.message, 'err'); }
        };
      }
    });
  }
  /* 首次安装默认 admin/admin：提示创建正式管理员账户 */
  window.__rosDefaultPwdPrompt = function () {
    if (window.__rosDefaultPwdShown || !window.UI) return;
    window.__rosDefaultPwdShown = true;
    UI.openForm({
      title: L('新增管理员账户', 'Add an administrator'),
      sub: L('当前仍在使用初始账户 admin / admin', 'You are signed in with the default admin / admin'),
      note: L('为安全起见，请创建一个新的管理员账户并使用它登录。初始账户的密码提示会在创建后清除。', 'Create a new administrator and use it instead. The default-password hint clears once created.'),
      fields: [
        { key: 'user', label: L('管理员账号', 'Administrator user'), required: true, placeholder: 'admin2' },
        { key: 'password', type: 'password', label: L('密码', 'Password'), required: true, hint: L('至少 6 位', 'At least 6 characters') },
        { key: 'confirm', type: 'password', label: L('确认密码', 'Confirm password'), required: true },
      ],
      submitLabel: L('创建管理员', 'Create administrator'),
      cancelLabel: L('稍后再说', 'Later'),
      onSubmit: async (v) => {
        if (v.password.length < 6) { toast(L('密码至少 6 位', 'Password must be at least 6 characters'), 'err'); return; }
        if (v.password !== v.confirm) { toast(L('两次密码不一致', 'Passwords do not match'), 'err'); return; }
        try {
          await api('/api/webui/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: v.user, password: v.password, role: 'admin' }) });
          UI.closeModal();
          state.authDefaultPassword = false;
          toast(L('管理员账户已创建', 'Administrator created'), L('下次登录请使用新账户。', 'Sign in with the new account next time.'), 'ok');
        } catch (e) { toast(e.message, 'err'); }
      },
    });
  };
  function openWebuiAccount() {
    const auth = US.auth || {};
    UI.openModal({
      title: L('WebUI 账户', 'WebUI account'),
      sub: L('用于登录 ros-center 网页，与 RouterOS 账户无关。', 'Used to sign in to ros-center, separate from RouterOS.'),
      body: `<div class="ui-fields">
        <label class="ui-field"><span>${esc(L('当前账户', 'Account'))}</span><input value="${ex(auth.user || '')}" readonly></label>
        <label class="ui-field"><span>${esc(L('权限', 'Role'))}</span><input value="${esc(L('管理员', 'Administrator'))}" readonly></label>
        <label class="ui-field"><span>${esc(L('新密码', 'New password'))}<em>*</em></span><input data-f="pass" type="password" autocomplete="new-password" placeholder="${esc(L('至少 6 位', 'At least 6 characters'))}"></label>
        <label class="ui-field full"><span>${esc(L('确认密码', 'Confirm password'))}<em>*</em></span><input data-f="pass2" type="password" autocomplete="new-password"></label>
      </div>
      <div class="notice blue" style="margin-top:12px">${ic('shield')}<div>${L('启用后刷新页面需要登录。忘记密码可在容器内删除 data/auth.json 后重启。', 'After enabling, a login is required. To reset, delete data/auth.json and restart.')}</div></div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(L('保存', 'Save'))}</button>`,
      onMount(m) {
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const user = String(auth.user || '').trim();
          const p1 = m.querySelector('[data-f="pass"]').value;
          const p2 = m.querySelector('[data-f="pass2"]').value;
          if (!user) { toast(L('当前账户为空', 'No signed-in account'), 'err'); return; }
          if (p1.length < 6) { toast(L('密码至少 6 位', 'Password must be at least 6 characters'), 'err'); return; }
          if (p1 !== p2) { toast(L('两次密码不一致', 'Passwords do not match'), 'err'); return; }
          try {
            await api('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password: p1 }) });
            state.authEnabled = true; state.authUser = user;
            const al = $('authLogoutBtn'); if (al) al.hidden = false;
            UI.closeModal();
            toast(L('WebUI 账户已保存', 'WebUI account saved'), 'ok');
            await loadUsersData(true);
            paintUsers();
            if (state.section === 'webuiSettings') { await loadWebuiData(true); paintWebuiSettings(); }
          } catch (e) { toast(e.message, 'err'); }
        };
      }
    });
  }
  function openWebuiPort() {
    UI.openModal({
      title: L('WebUI 端口', 'WebUI port'),
      sub: L('当前监听端口与 Docker 发布端口', 'Listen port and published port'),
      body: `<div class="ui-fields">
        <label class="ui-field full"><span>${esc(L('容器监听端口', 'Container port'))}</span><input data-f="port" type="number" min="1" max="65535" value="${US.webPort || ''}"></label>
      </div>
      <div class="kv"><span>${esc(L('发布端口', 'Published'))}</span><b class="mono">${US.hostPort || '—'}</b></div>
      <div class="notice">${ic('alert')}<div>${L('Docker 部署时，修改监听端口后必须同步调整端口映射并重建容器，例如：', 'In Docker, update the port mapping and recreate the container, e.g.')} <b>-p 10086:${US.webPort || 10086}</b> → <b>-p 10086:&lt;新端口&gt;</b></div></div>`,
      foot: `<button class="ui-btn" type="button" data-cancel>${esc(L('取消', 'Cancel'))}</button><button class="ui-btn primary" type="button" data-save>${esc(L('保存', 'Save'))}</button>`,
      onMount(m) {
        m.querySelector('[data-cancel]').onclick = () => UI.closeModal();
        m.querySelector('[data-save]').onclick = async () => {
          const port = Number(m.querySelector('[data-f="port"]').value);
          if (!(port >= 1 && port <= 65535)) { toast(L('端口不正确', 'Invalid port'), 'err'); return; }
          try {
            const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webPort: port }) });
            UI.closeModal();
            toast(r && r.restartRequired ? L('已保存，重启容器后生效', 'Saved. Restart the container.') : L('端口已保存', 'Port saved'), r && r.restartRequired ? '' : 'ok');
            await loadUsersData(true);
            paintUsers();
            if (state.section === 'webuiSettings') paintWebuiSettings();
          } catch (e) { toast(e.message, 'err'); }
        };
      }
    });
  }
  async function disableAuth() {
    const ok = await ask(L('关闭登录保护', 'Disable login protection'), esc(L('关闭后，任何能访问此端口的人都可直接打开 WebUI。', 'Anyone who can reach the port can open the WebUI.')), true, L('关闭', 'Disable'));
    if (!ok) return;
    try {
      await api('/api/auth/password', { method: 'DELETE' });
      state.authEnabled = false; state.authUser = '';
      const al = $('authLogoutBtn'); if (al) al.hidden = true;
      toast(L('登录保护已关闭', 'Login protection disabled'), 'ok');
      await loadUsersData(true);
      paintUsers();
      if (state.section === 'webuiSettings') { WEBUI.loadedAt = 0; await loadWebuiData(true); }
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------- webUI 设置 ---------- */
  async function loadWebuiData(force) {
    if (WEBUI.loading) return;
    if (!force && WEBUI.loadedAt && Date.now() - WEBUI.loadedAt < 8000) { paintWebuiSettings(); return; }
    WEBUI.loading = true;
    try {
      const [u, t, authFallback, dev] = await Promise.all([
        api('/api/webui/users').catch((e) => ({ error: e.message, users: [] })),
        api('/api/auth/2fa/status').catch(() => null),
        api('/api/auth').catch(() => null),
        api('/api/devices').catch(() => null)
      ]);
      WEBUI.users = (u && u.users && u.users.length) ? u.users : ((authFallback && authFallback.users) || []);
      WEBUI.err = '';
      US.webPort = (dev && dev.webPort) || US.webPort || state.webPort || 0;
      US.hostPort = (dev && dev.hostPort) || US.hostPort || state.hostPort || 0;
      if (t) US.twofa = { enabled: !!t.enabled, configured: !!t.configured };
      if (authFallback) {
        US.auth = { enabled: !!authFallback.enabled, user: authFallback.user || state.authUser || '', users: authFallback.users || [] };
        state.authEnabled = US.auth.enabled; state.authUser = US.auth.user;
      }
      WEBUI.loadedAt = Date.now();
    } catch (e) { WEBUI.err = (e && e.message) || '加载失败'; }
    WEBUI.loading = false;
    if (state.section === 'webuiSettings') paintWebuiSettings();
  }
  function webuiKpis() {
    const users = WEBUI.users || [];
    return [
      kpiCard({ label: L('WebUI 账户', 'WebUI accounts'), icon: 'users', color: 'blue', num: String(users.length),
        state: { dot: users.length ? 'green' : 'amber', text: users.length ? L('已配置', 'Configured') : L('未配置', 'None') },
        foot: [L('单账户模式', 'Single account'), '/data/auth.json'] }),
      kpiCard({ label: L('安全评分', 'Security score'), icon: 'shield', color: 'violet', num: String(webuiScore()), unit: '/ 100', pct: true,
        state: { dot: webuiScore() >= 80 ? 'green' : 'amber', text: webuiScore() >= 80 ? L('良好', 'Good') : L('待改进', 'Review') },
        foot: [L('账户与登录策略', 'Accounts & login'), L('估算', 'Estimated')] }),
      kpiCard({ label: L('监听端口', 'Listen port'), icon: 'layers', color: 'teal', num: String(US.webPort || '—'),
        state: { dot: 'green', text: L('HTTP 服务', 'HTTP service') },
        foot: [L('发布端口', 'Published') + ' ' + (US.hostPort || '—'), L('Docker 修改后需重建容器', 'Recreate container after change')] }),
      kpiCard({ label: L('数据目录', 'Data directory'), icon: 'layers', color: 'green', num: '/data',
        state: { dot: 'green', text: L('已映射', 'Mounted') },
        foot: [L('配置 · 采集 · 头像 · 备份', 'Config, samples, avatars, backups'), L('详见备份与导入', 'See backup & restore')] })
    ].join('');
  }
  function webuiUsersTable() {
    const rows = (WEBUI.users || []).map((u) => `<tr>
      <td data-label="${esc(L('用户', 'User'))}"><div class="user-cell">${avatarHtml(u.user, 'full')}<span class="cell"><b>${ex(u.user)}</b><small>${esc(u.source === 'env' ? L('环境变量', 'Environment') : L('本机账户', 'Local account'))}</small></span></div></td>
      <td data-label="${esc(L('来源', 'Source'))}"><span class="chain">${esc(u.source === 'env' ? 'ENV' : 'auth.json')}</span></td>
      <td data-label="2FA">${(US.twofa || {}).enabled ? '<span class="badge allow">' + esc(L('已启用', 'Enabled')) + '</span>' : '<span class="badge neutral">' + esc(L('未启用', 'Off')) + '</span>'}</td>
      <td data-label="${esc(L('创建时间', 'Created'))}"><span class="num">${esc(u.createdAt ? fmtTs(u.createdAt) : '—')}</span></td>
      <td data-label="${esc(L('操作', 'Actions'))}"><span class="badge neutral">${esc(L('不可编辑', 'Read-only'))}</span></td>
    </tr>`).join('');
    return `<div class="table-scroll"><table class="dt"><colgroup><col style="width:30%"><col style="width:18%"><col style="width:14%"><col style="width:20%"><col style="width:18%"></colgroup>
      <thead><tr><th>${esc(L('用户', 'User'))}</th><th>${esc(L('来源', 'Source'))}</th><th>2FA</th><th>${esc(L('创建时间', 'Created'))}</th><th>${esc(L('操作', 'Actions'))}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">${emptyBox(L('暂无 WebUI 账户', 'No WebUI account'), L('当前为免登录模式', 'Authentication is off'))}</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${(WEBUI.users || []).length} ${L('个账户 · 单一管理员，RouterOS 账户请在系统管理中创建', 'accounts · single admin; manage RouterOS users under System')}</span><span class="mono">/data/auth.json</span></div>`;
  }
  function webuiScore() {
    const auth = US.auth || {};
    const count = (WEBUI.users || []).length;
    let s = 55;
    if (auth.enabled) s += 20;
    if ((US.twofa || {}).enabled) s += 10;
    if (count) s += 8;
    if (count <= 1) s += 7;
    return Math.max(0, Math.min(100, s));
  }
  function webuiSettingsHtml() {
    const auth = US.auth || {};
    return `<div class="page-head">
      <div><h1>${esc(L('webUI 设置', 'WebUI settings'))}</h1><div class="meta">${esc(L('本机', 'Local'))}<span class="sep"></span>${(WEBUI.users || []).length} ${esc(L('个账户', 'accounts'))}<span class="sep"></span>${(US.twofa || {}).enabled ? '2FA ON' : '2FA OFF'}</div></div>
      <div class="actions">
        <button class="btn" type="button" data-act="webui-2fa">${ic('shield')}${esc(L('2FA 设置', '2FA settings'))}</button>
        ${(US.auth || {}).enabled ? '' : `<button class="btn primary" type="button" data-act="webui-account">${ic('lock')}${esc(L('设置首个账户', 'Set first account'))}</button>`}
      </div>
    </div>
    ${WEBUI.err ? `<div class="notice" style="color:var(--v2-red)">${ex(WEBUI.err)}</div>` : ''}
    <div class="kpis">${webuiKpis()}</div>
    <div class="grid align-start" style="margin-top:14px">
      <section class="card span8">
        <div class="card-head"><div><h2 class="card-title">${esc(L('本 WebUI 用户', 'Local WebUI users'))}</h2><div class="card-sub">${esc(L('账户 · 认证方式 · 2FA', 'Accounts · sources · 2FA'))}</div></div></div>
        ${webuiUsersTable()}
      </section>
      <div class="span4 rail">
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(L('WebUI 控制台', 'WebUI console'))}</h2><div class="card-sub">${esc(L('本机账户 · 端口', 'Local account & port'))}</div></div>${auth.enabled ? '<span class="badge allow">AUTH</span>' : '<span class="badge neutral">OPEN</span>'}</div>
          <div class="rail-body pg-webui-vals">
            <div class="kv"><span>${esc(L('当前账户', 'Signed in'))}</span><b class="mono">${ex(auth.user || '—')}</b></div>
            <div class="kv"><span>${esc(L('登录保护', 'Login protection'))}</span><b>${auth.enabled ? esc(L('已启用', 'On')) : esc(L('未启用', 'Off'))}</b></div>
            <div class="kv"><span>${esc(L('容器端口', 'Container port'))}</span><b class="mono">${US.webPort || '—'}</b></div>
            <div class="kv"><span>${esc(L('发布端口', 'Published port'))}</span><b class="mono">${US.hostPort || '—'}</b></div>
            <div class="pg-btn-row">
              ${auth.enabled ? '' : `<button class="btn primary" type="button" data-act="webui-account">${ic('lock')}${esc(L('设置首个账户', 'Set first account'))}</button>`}
              <button class="btn" type="button" data-act="webui-port">${ic('layers')}${esc(L('端口', 'Port'))}</button>
            </div>
            ${auth.enabled ? `<div class="pg-btn-row"><button class="btn danger" type="button" data-act="webui-disable">${ic('alert')}${esc(L('关闭登录保护', 'Disable protection'))}</button></div>` : ''}
            <div class="notice blue">${ic('shield')}<div>${esc(L('本 WebUI 使用单一管理员账户，不在此新增账户；RouterOS 账户与用户组请在「系统管理 · 用户」中创建，仅 WebUI 管理员可写。', 'This WebUI uses a single admin account. Create RouterOS users and groups under System › Users; only WebUI admins can write.'))}</div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(L('双因素认证 2FA', 'Two-factor authentication'))}</h2><div class="card-sub">${esc(L('WebUI 登录保护 · TOTP', 'WebUI sign-in protection · TOTP'))}</div></div>${(US.twofa || {}).enabled ? '<span class="badge allow">ON</span>' : '<span class="badge neutral">OFF</span>'}</div>
          <div class="rail-body">
            <div class="usage-summary"><b>${(US.twofa || {}).enabled ? 100 : 0}</b><span>%</span></div>
            <div class="bar-line"><i style="width:${(US.twofa || {}).enabled ? 100 : 0}%;background:${(US.twofa || {}).enabled ? 'var(--v2-green)' : 'var(--v2-amber)'}"></i></div>
            <div class="kv"><span>${esc(L('验证方式', 'Method'))}</span><b>TOTP · 30s</b></div>
            <div class="kv"><span>${esc(L('会话有效期', 'Session lifetime'))}</span><b>7d</b></div>
            <div class="kv"><span>${esc(L('登录保护', 'Login protection'))}</span><b>${auth.enabled ? esc(L('已启用', 'On')) : esc(L('未启用', 'Off'))}</b></div>
            <div class="pg-btn-row"><button class="btn primary" type="button" data-act="webui-2fa">${ic('shield')}${esc((US.twofa || {}).enabled ? L('管理 2FA', 'Manage 2FA') : L('启用 2FA', 'Enable 2FA'))}</button></div>
            <div class="notice ${(US.twofa || {}).enabled ? 'green' : 'blue'}">${ic('shield')}<div>${esc((US.twofa || {}).enabled ? L('登录时需输入验证器中的 6 位动态码。若提示验证码不正确，请将手机时间设为自动同步，并使用最新刷新的验证码。', 'Enter the 6-digit code from your authenticator to sign in. If a code is rejected, set your phone time to auto-sync and use the latest code.') : L('建议启用 2FA，避免仅凭密码即可访问管理界面。支持 Microsoft / Google Authenticator、1Password 等 TOTP 应用。', 'Enable 2FA so a password alone cannot open the management UI. Works with Microsoft / Google Authenticator, 1Password and other TOTP apps.'))}</div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2 class="card-title">${esc(L('安全评分', 'Security score'))}</h2><div class="card-sub">${esc(L('本机账户与登录策略（估算）', 'Local accounts & login (estimated)'))}</div></div>${(() => { const s = webuiScore(); return `<span class="badge ${s >= 80 ? 'allow' : 'reject'}">${s >= 80 ? esc(L('良好', 'Good')) : esc(L('待改进', 'Review'))}</span>`; })()}</div>
          <div class="rail-body">
            <div class="usage-summary"><b>${webuiScore()}</b><span>/ 100</span></div>
            <div class="bar-line"><i style="width:${webuiScore()}%;background:${webuiScore() >= 80 ? 'var(--v2-green)' : 'var(--v2-amber)'}"></i></div>
            <div class="kv"><span>${esc(L('登录保护', 'Login protection'))}</span><b>${auth.enabled ? esc(L('已启用', 'On')) : esc(L('未启用', 'Off'))}</b></div>
            <div class="kv"><span>${esc(L('WebUI 账户', 'WebUI accounts'))}</span><b>${(WEBUI.users || []).length}</b></div>
            <div class="kv"><span>${esc(L('双因素认证', 'Two-factor'))}</span><b>${(US.twofa || {}).enabled ? esc(L('已启用', 'On')) : esc(L('未启用', 'Off'))}</b></div>
            ${!auth.enabled ? `<div class="notice">${ic('alert')}<div>${esc(L('建议设置 WebUI 账户密码，防止局域网内被直接访问。', 'Set a WebUI password to prevent LAN access.'))}</div></div>` : ''}
          </div>
        </section>
      </div>
    </div>`;
  }
  function paintWebuiSettings() {
    if (state.section !== 'webuiSettings') return;
    const c = $('content'); if (!c) return;
    c.className = 'content dash pg-webui';
    c.innerHTML = webuiSettingsHtml();
  }
  function webuiBackupHtml() {
    return `<div class="page-head">
      <div><h1>${esc(L('备份与导入', 'Backup & restore'))}</h1><div class="meta">${esc(L('本机', 'Local'))}<span class="sep"></span>${esc(L('完整配置与数据', 'Full settings & data'))}<span class="sep"></span>${esc(L('自动留存副本', 'Auto safety copy'))}</div></div>
    </div>
    <div class="notice blue" style="margin-bottom:14px">${ic('shield')}<div><b>${esc(L('备份范围', 'Backup scope'))}</b>：${esc(L('设备连接、拓扑与图标、更新配置、WebUI 账户与 2FA、头像、数据保留策略及界面偏好。导入前会在 /data/pre-restore-* 自动留存当前配置副本。', 'Devices, topology & icons, update config, WebUI accounts & 2FA, avatars, retention policy and UI preferences. A safety copy is saved to /data/pre-restore-* before restore.'))}</div></div>
    <div class="grid align-start">
      <section class="card span12">
        <div class="card-head"><div><h2 class="card-title">${esc(L('ROS Center 数据', 'ROS Center data'))}</h2><div class="card-sub">${esc(L('WebUI 设置 · 账户 · 头像 · 界面偏好', 'Settings, accounts, avatars, preferences'))}</div></div><span class="badge info">JSON</span></div>
        <div class="rail-body">
          <div class="kv"><span>${esc(L('配置文件', 'Config files'))}</span><b class="mono">devices · topology · update · auth · settings · data-policy</b></div>
          <div class="kv"><span>${esc(L('用户头像', 'Avatars'))}</span><b class="mono">/data/user/avatar</b></div>
          <div class="kv"><span>${esc(L('拓扑图标', 'Topology icons'))}</span><b class="mono">/data/topology/icons</b></div>
          <div class="kv"><span>${esc(L('浏览器偏好', 'Browser preferences'))}</span><b class="mono">localStorage · ros-*</b></div>
          <div class="pg-btn-row">
            <button class="btn primary" type="button" data-act="webui-backup">${ic('download')}${esc(L('下载完整备份', 'Download full backup'))}</button>
            <button class="btn" type="button" data-act="webui-import">${ic('upload')}${esc(L('导入备份', 'Import backup'))}</button>
          </div>
          <div class="notice">${ic('alert')}<div>${esc(L('导入会覆盖当前 WebUI 设置，导入完成后页面将自动刷新并需要重新登录。', 'Restoring overwrites current WebUI settings; the page reloads and you may need to sign in again.'))}</div></div>
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2 class="card-title">${esc(L('数据与目录说明', 'Data directories'))}</h2><div class="card-sub">${esc(L('Docker 只需映射 /data', 'Docker only needs /data mapped'))}</div></div></div>
      <div class="table-scroll"><table class="dt dense"><colgroup><col style="width:34%"><col style="width:66%"></colgroup>
        <thead><tr><th>${esc(L('路径', 'Path'))}</th><th>${esc(L('用途', 'Purpose'))}</th></tr></thead>
        <tbody>
          <tr><td><span class="addr">/data/auth.json</span></td><td>${esc(L('WebUI 账户、密码哈希与 2FA 密钥', 'WebUI accounts, password hashes and 2FA secret'))}</td></tr>
          <tr><td><span class="addr">/data/session.secret</span></td><td>${esc(L('会话 Cookie 签名密钥', 'Session cookie signing key'))}</td></tr>
          <tr><td><span class="addr">/data/user/avatar/</span></td><td>${esc(L('WebUI 用户头像 PNG', 'WebUI user avatar PNG files'))}</td></tr>
          <tr><td><span class="addr">/data/trend/</span></td><td>${esc(L('速率趋势按天分片，按容量/份数/天数策略滚动', 'Per-day trend shards with size, count and retention policy'))}</td></tr>
          <tr><td><span class="addr">/data/data-policy.json</span></td><td>${esc(L('单份容量、最大份数、保留天数策略', 'Chunk size, max files and retention days'))}</td></tr>
          <tr><td><span class="addr">/data/usage.json</span></td><td>${esc(L('接口用量基线', 'Interface usage baseline'))}</td></tr>
          <tr><td><span class="addr">/data/topology/icons/</span></td><td>${esc(L('拓扑自定义图标', 'Custom topology icons'))}</td></tr>
          <tr><td><span class="addr">/data/pre-restore-*/</span></td><td>${esc(L('导入前自动留存的配置文件副本', 'Automatic config copy created before restore'))}</td></tr>
        </tbody></table></div>
    </section>`;
  }
  function paintWebuiBackup() {
    if (state.section !== 'webuiBackup') return;
    const c = $('content'); if (!c) return;
    c.className = 'content dash pg-webui';
    c.innerHTML = webuiBackupHtml();
  }
  function downloadText(text, name, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function pickBackupFile(accept) {
    return new Promise((resolve) => {
      let inp = $('pgBackupFile');
      if (!inp) {
        inp = document.createElement('input');
        inp.type = 'file'; inp.id = 'pgBackupFile'; inp.hidden = true;
        document.body.appendChild(inp);
      }
      inp.value = ''; inp.accept = accept;
      inp.onchange = () => { const f = inp.files && inp.files[0]; resolve(f ? f.text() : null); };
      inp.click();
    });
  }
  function webuiStamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }
  async function doWebuiBackup() {    try {
      const r = await api('/api/webui/backup');
      const local = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (k && k.indexOf('ros-') === 0) local[k] = localStorage.getItem(k);
      }
      r.localStorage = local;
      downloadText(JSON.stringify(r, null, 2), 'ros-center-backup-' + webuiStamp() + '.json', 'application/json');
      toast(L('完整备份已下载', 'Full backup downloaded'), 'ok');
    } catch (e) { toast((e && e.message) || L('备份失败', 'Backup failed'), 'err'); }
  }
  async function doWebuiRestore() {
    const ok = await ask(L('导入 WebUI 备份', 'Restore WebUI backup'),
      esc(L('将覆盖当前所有 WebUI 设置（设备、拓扑、头像、账户与 2FA 等），导入前会自动留存当前配置副本。确定继续？', 'This overwrites all WebUI settings (devices, topology, avatars, accounts and 2FA). A safety copy is saved first. Continue?')), true, L('继续导入', 'Restore'));
    if (!ok) return;
    try {
      const text = await pickBackupFile('.json,application/json'); if (!text) return;
      const b = JSON.parse(text);
      if (b.format !== 'ros-center-backup' || !b.files) throw new Error(L('备份文件格式不正确', 'Invalid backup file'));
      const r = await api('/api/webui/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      if (b.localStorage && typeof b.localStorage === 'object') {
        for (const [k, v] of Object.entries(b.localStorage)) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
      }
      toast(L('导入完成', 'Restore complete') + ' · ' + (r.written || 0) + ' files · ' + (r.icons || 0) + ' icons · ' + (r.avatars || 0) + ' avatars', 'ok');
      setTimeout(() => location.reload(), 1200);
    } catch (e) { toast((e && e.message) || L('导入失败', 'Restore failed'), 'err'); }
  }
  /* ---------- 日志中心 ---------- */
  const TOPIC_META = {
    system: { zh: '系统', en: 'System', cls: 't-system' },
    firewall: { zh: '防火墙', en: 'Firewall', cls: 't-firewall' },
    dhcp: { zh: 'DHCP', en: 'DHCP', cls: 't-dhcp' },
    pppoe: { zh: 'PPPoE', en: 'PPPoE', cls: 't-pppoe' },
    ppp: { zh: 'PPP', en: 'PPP', cls: 't-pppoe' },
    wireguard: { zh: 'WireGuard', en: 'WireGuard', cls: 't-wg' },
    wg: { zh: 'WireGuard', en: 'WireGuard', cls: 't-wg' },
    wifi: { zh: '无线', en: 'WiFi', cls: 't-wifi' },
    wireless: { zh: '无线', en: 'Wireless', cls: 't-wifi' },
    ip: { zh: 'IP', en: 'IP', cls: 't-ip' },
    interface: { zh: '接口', en: 'Interface', cls: 't-other' },
    ntp: { zh: '时间', en: 'NTP', cls: 't-ntp' },
    user: { zh: '用户', en: 'User', cls: 't-user' },
    account: { zh: '账户', en: 'Account', cls: 't-user' },
    warning: { zh: '警告', en: 'Warning', cls: 't-warning' },
    error: { zh: '错误', en: 'Error', cls: 't-error' },
    critical: { zh: '严重', en: 'Critical', cls: 't-error' }
  };
  const LEVEL_META = {
    error: { zh: '错误', en: 'Error', cls: 'error' },
    warning: { zh: '警告', en: 'Warning', cls: 'warning' },
    info: { zh: '信息', en: 'Info', cls: 'info' },
    debug: { zh: '调试', en: 'Debug', cls: 'info' }
  };
  function logTopic(row) {
    const parts = String(row.topics || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const t = parts.find((p) => !['info', 'warning', 'error', 'debug', 'critical'].includes(p));
    return t || 'system';
  }
  function logLevel(row) {
    const t = String(row.topics || '').toLowerCase();
    const msg = String(row.message || '');
    if (/\b(error|critical|fatal)\b/.test(t) || /(error|failed|failure|denied|timeout|中断)/i.test(msg)) return 'error';
    if (/\bwarning\b/.test(t) || /(warning|dropped|down|exceeded)/i.test(msg)) return 'warning';
    if (/\bdebug\b/.test(t)) return 'debug';
    return 'info';
  }
  function logTs(row) {
    const m = String(row.time || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const d = new Date();
    d.setHours(num(m[1]), num(m[2]), num(m[3]), 0);
    return d.getTime();
  }
  function logFiltered() {
    const q = LG.q.trim().toLowerCase();
    return (LG.rows || []).filter((r) => {
      if (LG.topic !== 'all' && logTopic(r) !== LG.topic) return false;
      if (!q) return true;
      return (String(r.message || '') + ' ' + String(r.topics || '') + ' ' + String(r.time || '')).toLowerCase().includes(q);
    });
  }
  function logMessageHtml(msg) {
    let s = ex(msg);
    s = s.replace(/(\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b)/g, '<span class="mono">$1</span>');
    s = s.replace(/\b([0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi, '<span class="mono">$&</span>');
    return s;
  }
  function topicCounts() {
    const map = {};
    (LG.rows || []).forEach((r) => { const t = logTopic(r); map[t] = (map[t] || 0) + 1; });
    return Object.keys(map).sort((a, b) => map[b] - map[a]).map((t) => ({ topic: t, n: map[t] }));
  }
  function logKpis() {
    const rows = LG.rows || [];
    const buf = logBufferStats();
    const now = Date.now();
    const lastHour = rows.filter((r) => { const ts = logTs(r); return ts == null || now - ts <= 3600000; });
    const mins = {};
    lastHour.forEach((r) => { const ts = logTs(r); if (ts == null) return; const k = Math.floor(ts / 60000); mins[k] = (mins[k] || 0) + 1; });
    const peak = Object.keys(mins).reduce((m, k) => Math.max(m, mins[k]), 0);
    const errors = rows.filter((r) => logLevel(r) === 'error');
    const warnings = rows.filter((r) => logLevel(r) === 'warning');
    const newest = rows[0];
    const t = (r) => `${(TOPIC_META[logTopic(r)] || {}).zh || logTopic(r)}`;
    const errTopics = Object.keys(errors.reduce((m, r) => { const k = t(r); m[k] = 1; return m; }, {})).slice(0, 2).join(' · ') || '—';
    const warnTopics = Object.keys(warnings.reduce((m, r) => { const k = t(r); m[k] = 1; return m; }, {})).slice(0, 2).join(' · ') || '—';
    return [
      kpiCard({ label: L('近 1 小时', 'Last hour'), icon: 'log', color: 'blue', num: lastHour.length.toLocaleString('en-US'),
        spark: logSpark(), foot: [`${Math.round(lastHour.length / 60)} ${L('条 / 分', 'per min')}`, `${L('峰值', 'Peak')} ${peak}`] }),
      kpiCard({ label: L('错误', 'Errors'), icon: 'alert', color: 'red', num: String(errors.length),
        state: errors.length ? { dot: 'red', text: L('需要关注', 'Attention') } : { dot: 'green', text: L('无错误', 'None') },
        foot: [newest ? `${L('最近', 'Latest')} ${ex(newest.time || '—')}` : '—', errTopics] }),
      kpiCard({ label: L('警告', 'Warnings'), icon: 'alert', color: 'amber', num: String(warnings.length),
        state: warnings.length ? { dot: 'amber', text: L('已记录', 'Logged') } : { dot: 'green', text: L('无警告', 'None') },
        foot: [warnTopics, newest ? `${L('最近', 'Latest')} ${ex(newest.time || '—')}` : '—'] }),
      kpiCard({ label: L('缓冲区', 'Buffer'), icon: 'device', color: 'violet', num: String(buf.pct), unit: '%', pct: true,
        footHtml: `<span>${buf.kb} KB / ${buf.cap} KB</span><span class="mini-bar" style="max-width:104px"><i style="background:var(--v2-violet);width:${Math.max(2, buf.pct)}%"></i></span>` })
    ].join('');
  }
  function logSpark() {
    const counts = minuteBuckets();
    const max = Math.max.apply(null, counts.concat([1]));
    const pts = counts.map((v, i) => 'L' + (3 + i * 90 / Math.max(1, counts.length - 1)).toFixed(1) + ' ' + (31 - (v / max) * 26).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 96 34" preserveAspectRatio="none"><path d="${pts.replace(/^L/, 'M')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function minuteBuckets() {
    const now = Date.now();
    const start = Math.floor((now - 30 * 60000) / 60000);
    const counts = new Array(30).fill(0);
    (LG.rows || []).forEach((r) => {
      const ts = logTs(r); if (ts == null) return;
      const idx = Math.floor(ts / 60000) - start;
      if (idx >= 0 && idx < 30) counts[idx]++;
    });
    return counts;
  }
  function logRateChart() {
    const counts = minuteBuckets();
    const max = Math.max.apply(null, counts.concat([1]));
    const X = (i) => (i * 280 / 29);
    const Y = (v) => 88 - (v / max) * 76;
    const line = counts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const lastI = counts.length - 1;
    return `<div class="rate-chart"><svg viewBox="0 0 280 96" preserveAspectRatio="none" aria-label="${esc(L('日志速率', 'Log rate'))}">
      <line class="grid-line" x1="0" y1="22" x2="280" y2="22"/>
      <line class="grid-line" x1="0" y1="50" x2="280" y2="50"/>
      <line class="grid-line" x1="0" y1="78" x2="280" y2="78"/>
      <path d="${line} L280 96 L0 96 Z" style="fill:var(--v2-accent);opacity:.07"/>
      <path d="${line}" fill="none" style="stroke:var(--v2-accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(lastI).toFixed(1)}" cy="${Y(counts[lastI]).toFixed(1)}" r="3" style="fill:var(--v2-accent);stroke:var(--v2-surface)" stroke-width="2"/>
      <text x="0" y="94">-30${L('分', 'm')}</text><text x="140" y="94" text-anchor="middle">-15${L('分', 'm')}</text><text x="280" y="94" text-anchor="end">${esc(L('现在', 'Now'))}</text>
    </svg></div>`;
  }
  function logRowsHtml() {
    const list = logFiltered().slice(0, LG.limit);
    LG.view = list;
    const body = list.map((r, i) => {
      const lvl = logLevel(r);
      const lm = LEVEL_META[lvl] || LEVEL_META.info;
      const topic = logTopic(r);
      const tm = TOPIC_META[topic] || { zh: topic, en: topic, cls: 't-other' };
      return `<tr>
        <td><span class="log-time">${ex(r.time || '—')}</span></td>
        <td><span class="level ${lm.cls}"><span class="dot"></span>${esc(L(lm.zh, lm.en))}</span></td>
        <td><span class="topic ${tm.cls}">${ex(topic)}</span></td>
        <td><span class="log-msg pg-log-msg">${logMessageHtml(r.message || '')}</span></td>
        <td><button class="row-more" type="button" data-act="log-more" data-idx="${i}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt dense log-table pg-log-table">
      <colgroup><col style="width:11%"><col style="width:12%"><col style="width:13%"><col><col style="width:34px"></colgroup>
      <thead><tr><th>${esc(L('时间', 'Time'))}</th><th>${esc(L('级别', 'Level'))}</th><th>${esc(L('话题', 'Topic'))}</th><th>${esc(L('消息', 'Message'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="5">${emptyBox(LG.err ? L('日志读取失败', 'Failed to load logs') : L('没有匹配的日志', 'No matching logs'), LG.err || L('调整关键词或话题筛选', 'Adjust keyword or topic'))}</td></tr>`}</tbody>
    </table></div>`;
  }
  /* 表尾：不显示「正在实时滚动」，只保留条数与「加载更早」（每页 12 条） */
  function logFootHtml() {
    const shown = LG.view.length, total = logFiltered().length;
    return `<span>${esc(L('最近', 'Latest'))} ${shown} / ${total} ${esc(L('条', 'entries'))}</span>
      <button class="link" type="button" data-act="log-earlier"${total > shown ? '' : ' disabled'}>${esc(L('加载更早', 'Load earlier'))}${ic('chevron')}</button>`;
  }
  /* 通知分类规则：定义哪些日志显示为红/黄/绿/蓝。
     通知展示在右上角铃铛；此卡片只负责定义与设置规则。 */
  const NOTIF_RULE_KEY = 'rosCenter.notifRules';
  const DEFAULT_NOTIF_RULES = {
    red: { label: '防火墙丢弃', keywords: 'drop, dropped, reject, blocked', enabled: true },
    amber: { label: '固件升级 / DNS 修改', keywords: 'upgrade, firmware update, dns changed, static dns', enabled: true },
    green: { label: '正常登录 / API 登录', keywords: 'logged in, login, api login, user authenticated', enabled: true },
    blue: { label: 'WireGuard 握手恢复', keywords: 'wireguard, wg, handshake', enabled: true },
  };
  function notifRules() {
    try { const r = JSON.parse(localStorage.getItem(NOTIF_RULE_KEY) || 'null'); if (r && typeof r === 'object') return Object.assign({}, DEFAULT_NOTIF_RULES, r); } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_NOTIF_RULES));
  }
  function saveNotifRules(rules) { try { localStorage.setItem(NOTIF_RULE_KEY, JSON.stringify(rules)); } catch (e) { /* ignore */ } }
  window.__rosNotifRules = notifRules; // 右上角铃铛通知着色可读取
  function openNotifRules() {
    const rules = notifRules();
    const colors = [['red', L('红色 · 严重', 'Red · critical')], ['amber', L('黄色 · 提醒', 'Amber · warning')],
      ['green', L('绿色 · 正常', 'Green · normal')], ['blue', L('蓝色 · 恢复', 'Blue · recovered')]];
    const dots = { red: 'is-red', amber: 'is-amber', green: 'is-green', blue: 'is-blue' };
    const fields = colors.map(([k, label]) => ({
      key: k + '_kw', label: label + ' — ' + L('匹配关键词', 'keywords'),
      value: (rules[k] || {}).keywords || '', full: true,
      hint: (rules[k] || {}).label || '',
    }));
    UI.openForm({
      title: L('通知分类规则', 'Notification rules'), sub: L('按日志内容关键词决定铃铛通知的颜色', 'Bell notification colour is decided by log keywords'),
      note: L('多个关键词用英文逗号分隔，命中任意一个即归类。修改后对新日志生效。', 'Separate keywords with commas; any match classifies the log. Applies to new logs.'),
      fields, submitLabel: L('保存规则', 'Save rules'),
      onSubmit: (v) => {
        const next = {};
        colors.forEach(([k]) => { next[k] = { label: (DEFAULT_NOTIF_RULES[k] || {}).label, keywords: String(v[k + '_kw'] || ''), enabled: true }; });
        saveNotifRules(next); UI.toast(L('通知分类规则已保存', 'Notification rules saved'), 'ok'); paintLogs();
      }
    });
  }
  function logNotices() {
    const rules = notifRules();
    const conf = [['red', 'is-red'], ['amber', 'is-amber'], ['green', 'is-green'], ['blue', 'is-blue']];
    return conf.map(([k, dot]) => {
      const r = rules[k] || {};
      return { dot, label: r.label || k, sub: (r.enabled ? '' : L('已停用 · ', 'Disabled · ')) + (r.keywords || '—'), rule: k };
    });
  }
  function logRail() {
    const rows = LG.rows || [];
    const counts = minuteBuckets();
    const total = counts.reduce((a, b) => a + b, 0);
    const peak = Math.max.apply(null, counts.concat([0]));
    const peakI = counts.indexOf(peak);
    const peakTime = peakI >= 0 ? new Date(Date.now() - (29 - peakI) * 60000) : null;
    const avg = Math.round(total / 30);
    const topics = topicCounts().slice(0, 6);
    const maxTopic = topics.length ? topics[0].n : 1;
    const colors = ['var(--v2-red)', 'var(--v2-teal)', 'var(--v2-faint)', 'var(--v2-amber)', 'var(--v2-violet)', 'var(--v2-accent)'];
    const oldest = rows.length ? rows[rows.length - 1] : null;
    const age = LG.at ? Math.max(0, Math.floor((Date.now() - LG.at) / 1000)) : null;
    const notices = logNotices();
    const buf = logBufferStats(), pref = logRetention();
    return `
      <section class="card pg-notif-card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('通知分类规则', 'Notification rules'))}</h2><div class="card-sub">${esc(L('定义哪些日志在右上角铃铛显示为红 / 黄 / 绿 / 蓝', 'Define which logs show red / amber / green / blue in the bell'))}</div></div>
          ${canEditNow() ? `<button class="btn ghost" type="button" data-act="log-notif-rules">${ic('filter')}${esc(L('编辑规则', 'Edit rules'))}</button>` : ''}</div>
        <div class="ui-notif pg-notif-list">${notices.map((it) =>
          `<button class="ui-notif-item" type="button"${canEditNow() ? ` data-act="log-notif-rule" data-rule="${ex(it.rule)}"` : ''}><span class="dot ${ex(it.dot)}"></span><div><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></div></button>`
        ).join('')}</div>
        <div class="table-foot"><span>${esc(L('通知集中显示在右上角铃铛', 'Notifications appear in the top-right bell'))}</span><span class="mono">4 ${esc(L('类', 'rules'))}</span></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('日志速率', 'Log rate'))}</h2><div class="card-sub">${esc(L('过去 30 分钟', 'Last 30 minutes'))}</div></div>
          ${LG.live ? `<span class="status"><span class="dot is-green"></span>${avg} / ${esc(L('分', 'min'))}</span>` : `<span class="status"><span class="dot is-muted"></span>${esc(L('已暂停', 'Paused'))}</span>`}</div>
        <div class="rail-body">
          ${logRateChart()}
          <div class="kv" style="margin-top:8px"><span>${esc(L('30 分钟均值', '30m average'))}</span><b>${avg} ${esc(L('条 / 分', 'per min'))}</b></div>
          <div class="kv"><span>${esc(L('峰值', 'Peak'))}</span><b>${peak}${peakTime ? ' · ' + String(peakTime.getHours()).padStart(2, '0') + ':' + String(peakTime.getMinutes()).padStart(2, '0') : ''}</b></div>
          <div class="kv"><span>${esc(L('最近更新', 'Updated'))}</span><b>${age == null ? '—' : age + L(' 秒前', 's ago')}</b></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('话题分布', 'Topic distribution'))}</h2><div class="card-sub">${rows.length} ${esc(L('条日志', 'entries'))}</div></div></div>
        <div class="rail-body tight">
          <div class="rank">${topics.map((t, i) => {
            const tm = TOPIC_META[t.topic] || { zh: t.topic, en: t.topic };
            return `<div class="rank-row"><span class="lbl">${esc(L(tm.zh, tm.en))}</span><span class="val">${t.n}</span><span class="bar"><i style="width:${Math.max(4, Math.round(t.n / maxTopic * 100))}%;background:${colors[i % colors.length]}"></i></span></div>`;
          }).join('') || `<div class="pg-empty" style="padding:12px 0">${esc(L('暂无话题数据', 'No topics'))}</div>`}</div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('存储与保留', 'Storage & retention'))}</h2><div class="card-sub">${esc(L('内存环形缓冲', 'Memory ring buffer'))}</div></div></div>
        <div class="rail-body">
          <div class="usage-summary"><b>${buf.pct}%</b><span>${esc(L('已使用', 'used'))}</span></div>
          <div class="bar-line"><i style="width:${buf.pct}%"></i></div>
          <div class="sub-note">${buf.kb} KB / ${buf.cap} KB</div>
          <div style="height:8px"></div>
          <div class="kv"><span>${esc(L('保留策略', 'Retention'))}</span><b>${esc(pref.days + ' ' + L('天', 'days'))}</b></div>
          <div class="kv"><span>${esc(L('最早记录', 'Oldest'))}</span><b>${oldest ? ex(oldest.time || '—') : '—'}</b></div>
          <button class="link" type="button" data-act="log-retention"${canEditNow() ? '' : ' hidden'}>${esc(L('调整保留策略', 'Adjust retention'))}${ic('chevron')}</button>
        </div>
      </section>`;
  }
  function logsHtml() {
    const age = LG.at ? Math.max(0, Math.floor((Date.now() - LG.at) / 1000)) : null;
    const chips = topicCounts().slice(0, 6);
    return `<div class="page-head">
      <div><h1>${esc(L('日志中心', 'Log center'))}</h1><div class="meta"><span>${esc(L('主路由', 'Primary'))}</span><span class="sep"></span><span class="hide-sm">${esc(L('来自 RouterOS /log', 'From RouterOS /log'))}</span><span class="sep"></span><span class="hide-sm">${esc(L('实时缓冲', 'Live buffer'))}</span></div></div>
      <div class="actions">
        <span class="live"><span class="dot"></span><span data-log-age>${age == null ? esc(L('等待数据', 'Waiting')) : esc(L('更新于', 'Updated') + ' ' + age + L(' 秒前', 's ago'))}</span></span>
      </div>
    </div>
    <div class="grid align-start">
      <section class="kpis" id="pgLogKpis">${logKpis()}</section>
      <section class="card span8">
        <div class="card-head"><div><h2 class="card-title">${esc(L('事件流', 'Event stream'))}</h2><div class="card-sub">${esc(L('实时写入 · 内存缓冲 · RouterOS 日志', 'Live · RouterOS buffer'))}</div></div>
          <button class="btn icon-only" type="button" data-act="log-menu" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}">${ic('more')}</button></div>
        <div class="toolbar" style="padding-top:14px">
          <label class="field">${ic('search')}<input id="pgLogSearch" value="${esc(LG.q)}" placeholder="${esc(L('搜索日志内容…', 'Search log messages…'))}" aria-label="${esc(L('搜索日志', 'Search logs'))}"></label>
          <div class="chips">
            <button class="chip${LG.topic === 'all' ? ' on' : ''}" type="button" data-act="log-topic" data-topic="all">${esc(L('全部', 'All'))} <b>${(LG.rows || []).length}</b></button>
            ${chips.map((t) => {
              const tm = TOPIC_META[t.topic] || { zh: t.topic, en: t.topic };
              return `<button class="chip${LG.topic === t.topic ? ' on' : ''}" type="button" data-act="log-topic" data-topic="${ex(t.topic)}">${esc(L(tm.zh, tm.en))} <b>${t.n}</b></button>`;
            }).join('')}
          </div>
        </div>
        <div id="pgLogTable">${logRowsHtml()}</div>
        <div class="table-foot" id="pgLogFoot">${logFootHtml()}</div>
      </section>
      <div class="span4 rail" id="pgLogRail">${logRail()}</div>
    </div>`;
  }
  async function loadLogs(quiet) {
    if (LG.loading) return;
    LG.loading = true;
    try {
      const r = await api('/api/config?section=logs');
      const rows = (r && r.rows) || [];
      rows.sort((a, b) => (logTs(b) || 0) - (logTs(a) || 0));
      const sig = rows.length + ':' + (rows[0] ? (rows[0]['id'] || rows[0].message || '') : '') + ':' + (rows[rows.length - 1] ? (rows[rows.length - 1]['id'] || rows[rows.length - 1].message || '') : '');
      LG.rows = rows;
      LG.demo = !!(r && r.demo);
      LG.err = '';
      LG.at = Date.now();
      if (sig !== LG.sig) {
        LG.sig = sig;
        const typing = document.activeElement && document.activeElement.id === 'pgLogSearch';
        if (typing) paintLogTableOnly(); else paintLogs();
      } else paintLogAge();
    } catch (e) {
      LG.err = e.message || String(e);
      if (!LG.rows.length) paintLogs();
    } finally {
      LG.loading = false;
      if (state.section === 'logsCenter') paintLogAge();
    }
  }
  function paintLogAge() {
    const el = document.querySelector('[data-log-age]');
    if (!el || state.section !== 'logsCenter') return;
    if (!LG.at) { el.textContent = L('等待数据', 'Waiting'); return; }
    const age = Math.max(0, Math.floor((Date.now() - LG.at) / 1000));
    el.textContent = LG.err ? L('读取失败', 'Load failed') : L('更新于', 'Updated') + ' ' + age + L(' 秒前', 's ago');
  }
  function paintLogs() {
    if (state.section !== 'logsCenter') return;
    const c = $('content'); if (!c) return;
    const scrollTop = window.scrollY;
    c.innerHTML = logsHtml();
    window.scrollTo(0, scrollTop);
  }
  function paintLogTableOnly() {
    if (state.section !== 'logsCenter') return;
    const t = $('pgLogTable'); if (t) t.innerHTML = logRowsHtml();
    const k = $('pgLogKpis'); if (k) k.innerHTML = logKpis();
    const rail = $('pgLogRail'); if (rail) rail.innerHTML = logRail();
    const foot = $('pgLogFoot');
    if (foot) foot.innerHTML = logFootHtml();
  }
  function exportLogs() {
    const rows = logFiltered().map((r) => [r.time || '', logLevel(r), r.topics || '', r.message || '']);
    if (!rows.length) { toast(L('没有可导出的日志', 'No logs to export'), 'err'); return; }
    downloadCsv('ros-logs-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv',
      [L('时间', 'Time'), L('级别', 'Level'), L('话题', 'Topics'), L('消息', 'Message')], rows);
    toast(L('已导出', 'Exported'), 'ok');
  }
  function openLogRetention() {
    const pref = logRetention();
    const days = ['1', '7', '14', '30', '90'];
    const fields = [
      { key: 'days', label: L('保留天数', 'Retention days'), type: 'select', value: pref.days,
        options: days.map((d) => ({ value: d, label: d + ' ' + L('天', 'days') })) },
      { key: 'archive', label: L('归档旧日志', 'Archive old logs'), type: 'switch', value: !!pref.archive,
        hint: L('归档动作仅用于本页演示', 'Archive is a local demo action') },
      { key: 'size', label: L('缓冲区上限（KB）', 'Buffer limit (KB)'), type: 'number', value: pref.size, required: true },
      { key: 'rotate', label: L('轮转方式', 'Rotation'), type: 'select', value: pref.rotate,
        options: [L('按天', 'Daily'), L('按文件大小', 'By size'), L('手动', 'Manual')] }
    ];
    if (!window.UI || !UI.openForm) return;
    UI.openForm({
      title: L('日志保留策略', 'Log retention policy'),
      sub: L('日志中心 · 本地浏览器设置', 'Log center · browser settings'),
      note: L('保留策略只影响本页面的展示与估算，不会写入 RouterOS。', 'This policy only affects this page and is not written to RouterOS.'),
      fields, submitLabel: L('应用策略', 'Apply policy'),
      onSubmit(values) {
        const size = Number(values.size);
        if (!Number.isFinite(size) || size < 1 || size > 10240) {
          toast(L('缓冲区上限需为 1–10240 KB', 'Buffer limit must be 1–10240 KB'), 'err');
          return;
        }
        const next = { days: values.days, archive: !!values.archive, size: String(Math.round(size)), rotate: values.rotate };
        try { localStorage.setItem(RETENTION_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
        UI.closeModal();
        paintLogs();
        toast(L('日志保留策略已更新', 'Log retention policy updated'), 'ok');
      }
    });
  }
  async function clearLogs() {
    const ok = await ask(L('清空日志', 'Clear logs'), esc(L('将清空路由器上的日志缓冲，操作不可恢复。', 'Clears the router log buffer. This cannot be undone.')), true, L('清空', 'Clear'));
    if (!ok) return;
    try {
      await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'log-clear' }) });
      toast(L('日志已清空', 'Logs cleared'), 'ok');
      LG.limit = LOG_PAGE;
      await loadLogs(true);
      paintLogs();
    } catch (e) { toast(e.message, 'err'); }
  }
  function openLogMenu(anchor) {
    const compact = document.body.classList.contains('ui-compact');
    const items = [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前筛选结果', 'CSV · current filter'), icon: 'i-download', action: exportLogs },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        toast(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { label: L('打开原始表格', 'Open raw table'), icon: 'i-log', action: () => navigate('logs') }
    ];
    items.push({ sep: true }, { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } });
    if (canEditNow()) items.push({ sep: true }, { label: L('清空日志', 'Clear logs'), icon: 'i-alert', danger: true, action: clearLogs });
    UI.openMenu(anchor, items);
  }
  function logRowMenu(idx, anchor) {
    const r = (LG.view || [])[idx] || logFiltered()[idx];
    if (!r) return;
    const topic = logTopic(r);
    UI.openMenu(anchor, [
      { label: L('复制消息', 'Copy message'), icon: 'i-download', action: () => copyText(r.message || '') },
      { label: L('按此话题筛选', 'Filter by topic'), icon: 'i-filter', action: () => { LG.topic = topic; LG.limit = LOG_PAGE; paintLogs(); } },
      { label: L('复制原始行', 'Copy raw row'), icon: 'i-log', action: () => copyText(`${r.time || ''} ${r.topics || ''} ${r.message || ''}`) }
    ]);
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (!act) return;
    if (!CUSTOM.has(state.section)) return;
    if (state.section === 'dataPolicy') {
      if (act === 'dp-dev-more') {
        const id = el.dataset.id || '';
        const s = (Array.isArray(DP.data && DP.data.stats) ? DP.data.stats : []).find((x) => x.id === id);
        const name = (s && s.name) || id;
        UI.openMenu(el, [
          { label: L('调整此设备策略…', 'Adjust device policy…'), icon: 'i-sliders', action: () => openDataPolicyForm(id) },
          { sep: true },
          { label: L('恢复全局策略', 'Use global policy'), icon: 'i-refresh', disabled: !(s && s.custom), action: () => resetDataPolicy(id, name) },
        ]);
      }
      return;
    }
    if (state.section === 'connectionStats') {
      return;
    }
    if (act.startsWith('dev-')) {
      if (act === 'dev-tab') {
        DV.tab = el.dataset.tab || 'devices';
        const tb = $('pgDevToolbar'); if (tb) tb.innerHTML = devToolbarHtml(DV.tab);
        paintDevices();
        /* 切到备份页实时拉取全部设备文件列表，确保与 winbox 删除操作同步 */
        if (DV.tab === 'backup') refreshBackupFiles(true);
      }
      else if (act === 'dev-bk-chip') {
        DV.bkFilter = el.dataset.device || 'all';
        const tb = $('pgDevToolbar'); if (tb) tb.innerHTML = devToolbarHtml('backup');
        paintDevices();
      }
      else if (act === 'dev-chip') {
        DV.filter = el.dataset.filter || 'all';
        paintDevCounts();
        paintDevTableOnly();
        const note = document.querySelector('.content.pg-devices .toolbar-note');
        if (note) note.textContent = DV.err || DV.note || L('数据来自 ros-center', 'From ros-center');
      }
      else if (act === 'dev-more') openDeviceMenu(el.dataset.id, el);
      else if (act === 'dev-bk-more') {
        const bdev = (state.devices || []).find((d) => d.id === el.dataset.device) || bkDevice();
        UI.openMenu(el, [
          { label: L('下载此备份', 'Download backup'), icon: 'i-download', action: () => downloadBackup(el.dataset.name, el.dataset.device) },
          ...(el.dataset.kind === 'config' ? [{ label: L('导入此备份 · rsc', 'Import this backup · rsc'), icon: 'i-upload', action: () => importRouterFile(el.dataset.name, bdev) }] : []),
          { sep: true },
          { label: L('删除此备份', 'Delete backup'), icon: 'i-trash', danger: true, action: () => deleteBackup(el.dataset.name, el.dataset.device) },
        ]);
      }
      else if (act === 'dev-load-backups') loadDevicesData(true);
      else if (act === 'dev-add') openDeviceForm(null);
      else if (act === 'dev-check') checkUpdates();
      else if (act === 'dev-fw-scan') devFwScan(el.dataset.id);
      else if (act === 'dev-fw-install') devFwInstall(el.dataset.id);
      else if (act === 'dev-open-updates') navigate('updates');
      return;
    }
    if (act.startsWith('usr-')) {
      if (act === 'usr-tab') {
        US.tab = el.dataset.tab || 'users';
        const tb = $('pgUsrToolbar'); if (tb) tb.innerHTML = usToolbarHtml(US.tab);
        paintUsersPanel();
      }
      else if (act === 'usr-chip') {
        US.filter = el.dataset.filter || '';
        const input = $('pgUsrSearch'); if (input) US.q = input.value;
        paintUsers();
      }
      else if (act === 'usr-more') userMenu(el.dataset.kind, el.dataset.id, el);
      else if (act === 'usr-add') openUserForm(null);
      else if (act === 'usr-export') exportUsersAudit();
      else if (act === 'usr-menu') openUsersCardMenu(el);
      return;
    }
    if (act.startsWith('webui-')) {
      if (act === 'webui-account') openWebuiAccount();
      else if (act === 'webui-port') openWebuiPort();
      else if (act === 'webui-disable') disableAuth();
      else if (act === 'webui-2fa') openTwoFactorModal();
      else if (act === 'webui-backup') doWebuiBackup();
      else if (act === 'webui-import') doWebuiRestore();
      return;
    }
    if (act.startsWith('log-')) {
      if (act === 'log-menu') openLogMenu(el);
      else if (act === 'log-topic') { LG.topic = el.dataset.topic || 'all'; LG.limit = LOG_PAGE; paintLogs(); }
      else if (act === 'log-notif-rules' || act === 'log-notif-rule') openNotifRules();
      else if (act === 'log-earlier') { LG.limit += LOG_PAGE; paintLogTableOnly(); }
      else if (act === 'log-more') logRowMenu(Number(el.dataset.idx), el);
      else if (act === 'log-retention') openLogRetention();
      else if (act === 'log-raw') navigate('logs');
      return;
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'pgDevSearch') { DV.q = t.value; paintDevTableOnly(); return; }
    if (t.id === 'pgUsrSearch') { US.q = t.value; paintUsersPanel(); return; }
    if (t.id === 'pgLogSearch') { LG.q = t.value; LG.limit = LOG_PAGE; paintLogTableOnly(); }
  }

  /* ---------- 页面装配 ---------- */
  function customClass(section) {
    if (section === 'usersCenter') return 'users';
    if (section === 'logsCenter') return 'logs';
    if (section === 'webuiSettings' || section === 'webuiBackup') return 'webui';
    return 'devices';
  }
  function renderCustomPage() {
    const c = $('content'); if (!c) return;
    c.className = 'content dash pg-' + customClass(state.section);
    if (state.section === 'devices') {
      c.innerHTML = devicesHtml();
      if (!DV.rows || Date.now() - DV.loadedAt > 15000) loadDevicesData();
      else paintDevices();
      return;
    }
    if (state.section === 'usersCenter') {
      c.innerHTML = usersHtml();
      if (!US.users || Date.now() - US.loadedAt > 15000) loadUsersData();
      else paintUsers();
      return;
    }
    if (state.section === 'dataPolicy') {
      c.innerHTML = dataPolicyHtml();
      if (!DP.data) loadDataPolicy();
      return;
    }
    if (state.section === 'connectionStats') {
      c.innerHTML = connectionStatsHtml();
      loadConnectionStats();
      return;
    }
    if (state.section === 'webuiSettings') {
      c.innerHTML = webuiSettingsHtml();
      loadWebuiData();
      return;
    }
    if (state.section === 'webuiBackup') {
      c.innerHTML = webuiBackupHtml();
      return;
    }
    c.innerHTML = logsHtml();
    if (!LG.rows.length || Date.now() - LG.at > 15000) loadLogs();
    return;
  }

  function install() {
    if (window.__pagesV3Installed) return;
    window.__pagesV3Installed = true;
    const content = $('content');
    if (content) {
      content.addEventListener('click', onClick);
      content.addEventListener('input', onInput);
    }
    if (typeof window.renderPage === 'function') {
      const orig = window.renderPage;
      window.renderPage = function () {
        const r = orig.apply(this, arguments);
        if (CUSTOM.has(state.section)) renderCustomPage();
        return r;
      };
    }
    LG.live = true;
    if (CUSTOM.has(state.section) && $('content') && !$('content').classList.contains('pg-' + customClass(state.section))) {
      renderCustomPage();
    }
    setInterval(tick, 2000);
    setInterval(paintLogAge, 1000);
  }
  function tick() {
    if (state.section === 'devices' && !DV.loading && DV.rows && Date.now() - DV.loadedAt > 8000) loadDevicesData(true);
    if (state.section === 'devices' && DV.tab === 'backup' && !DV.loading && Date.now() - DV.filesAt > 3000) refreshBackupFiles(true);
    if (state.section === 'usersCenter' && !US.loading && US.users && Date.now() - US.loadedAt > 15000) loadUsersData(true);
    if (state.section === 'logsCenter' && LG.live && !LG.loading && Date.now() - LG.at > 4500) loadLogs(true);
  }

  if (document.readyState === 'loading') {
    install();
    document.addEventListener('DOMContentLoaded', function () {
      if (CUSTOM.has(state.section) && !$('content').classList.contains('pg-devices') && !$('content').classList.contains('pg-users') && !$('content').classList.contains('pg-logs') && !$('content').classList.contains('pg-webui')) renderCustomPage();
    });
  } else {
    install();
  }
})();