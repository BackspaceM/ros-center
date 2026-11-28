'use strict';
/* IP 流量监控：按设计稿 ip-traffic.html 复刻的仪表盘页。
   数据全部来自真实接口：
     /api/ip-rates              按 IP 测速的主机（速率 / 累计字节 / 连接数）
     state.latest (WS/snapshot) conntrack 计数、接口总速率、历史趋势
     /api/config?section=connections  conntrack 连接行（应用 / 外部目标按真实端口与地址归类）
     /api/link-quality          外网时延（Netwatch / ping 探测）
   应用 / 外部目标均由 conntrack 真实连接的端口与地址归类，不伪造精确数字。 */
(function () {
  let rateTimer = null, connTimer = null, qualityTimer = null;
  let rows = [];                 // /api/ip-rates 的主机行，按总速率降序
  let connRows = [];             // conntrack 连接行
  let quality = null;            // /api/link-quality
  let history = new Map();       // ip -> 总速率历史（用于 mini-spark）
  let iconById = new Map(), iconByIp = new Map();
  let activeTab = 'hosts', activeChip = 'all', query = '';

  const n2 = (v) => Number(v) || 0;
  const el = (id) => document.getElementById(id);

  function stopTimers() {
    if (rateTimer) { clearInterval(rateTimer); rateTimer = null; }
    if (connTimer) { clearInterval(connTimer); connTimer = null; }
    if (qualityTimer) { clearInterval(qualityTimer); qualityTimer = null; }
  }
  function startTimers() {
    stopTimers();
    rateTimer = setInterval(refreshRates, 1000);
    connTimer = setInterval(loadConns, 5000);
    qualityTimer = setInterval(loadQuality, 30000);
  }

  /* ---------- 格式化 ---------- */
  function mbps(bps) {
    const v = n2(bps) / 1e6;
    if (v <= 0) return '0';
    if (v >= 10) return v.toFixed(1);
    if (v >= 0.1) return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    if (v >= 0.001) return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return '<0.001';
  }
  function bytes(n) {
    n = n2(n);
    if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }
  function int(n) { return Math.round(n2(n)).toLocaleString('en-US'); }

  /* ---------- 迷你趋势 ---------- */
  function sparkPoints(vals, w, h) {
    const a = (vals && vals.length) ? vals.slice(-40) : [];
    if (!a.length) return '';
    const seq = a.length === 1 ? [a[0], a[0]] : a;
    const max = Math.max(1, ...seq);
    return seq.map((v, i) => {
      const x = (i / (seq.length - 1)) * w;
      const y = h - 2 - (n2(v) / max) * (h - 4);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  }
  function miniSpark(vals, color) {
    const d = sparkPoints(vals, 72, 20);
    if (!d) return '<svg class="mini-spark" viewBox="0 0 72 20"></svg>';
    return `<svg class="mini-spark" viewBox="0 0 72 20" preserveAspectRatio="none" style="color:${color}"><path d="${d}"/></svg>`;
  }
  function kpiSpark(vals, color) {
    const d = sparkPoints(vals, 96, 34);
    if (!d) return '';
    return `<svg class="spark" viewBox="0 0 96 34" preserveAspectRatio="none" style="color:${color}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function rateChart() {
    const pts = (state.points || []).slice(-40).map((p) => n2(p.rx) + n2(p.tx));
    const d = sparkPoints(pts, 280, 92);
    if (!d) return '<svg viewBox="0 0 280 96" preserveAspectRatio="none"><text x="140" y="50" text-anchor="middle" style="fill:var(--v2-faint);font-size:10px">暂无趋势数据</text></svg>';
    return `<svg viewBox="0 0 280 96" preserveAspectRatio="none" aria-label="${esc(L('总速率趋势', 'Total rate trend'))}">
      <path d="${d}" fill="none" style="stroke:var(--v2-accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  /* ---------- 拓扑图标 ---------- */
  async function loadIcons() {
    try {
      const d = await api('/api/topology');
      const all = new Map();
      for (const n of (d.auto || [])) all.set(n.id, n);
      for (const n of (d.custom || [])) { if (n.deleted) all.delete(n.id); else all.set(n.id, n); }
      iconById = new Map(); iconByIp = new Map();
      for (const n of all.values()) {
        if (!n.icon) continue;
        iconById.set(n.id, n.icon);
        if (n.ip) iconByIp.set(String(n.ip).trim(), n.icon);
      }
    } catch (e) { iconById = new Map(); iconByIp = new Map(); }
  }
  function iconFor(r) { return iconById.get(r.id) || iconByIp.get(r.ip) || ''; }

  /* ---------- 主机徽标（按名称归类，仅做视觉分组） ---------- */
  const BADGES = [
    [/nas|ugreen|syno|ds\d/i, 'wg', 'nas'],
    [/macbook|mbp|imac/i, 'eth', 'mbp'],
    [/tv|电视|google.?tv|apple.?tv/i, 'br', 'tv'],
    [/laptop|notebook|work|台式/i, 'eth', 'wlp'],
    [/iphone|phone/i, 'br', 'iph'],
    [/ipad|pad|tablet/i, 'br', 'ipd'],
    [/printer|print|打印机/i, 'prn', 'prn'],
    [/esp|sensor|iot|cam|摄像头/i, 'iot', 'iot'],
  ];
  function badgeFor(name) {
    for (const [re, cls, txt] of BADGES) if (re.test(String(name || ''))) return { cls, txt };
    const txt = String(name || '').replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').slice(0, 3).toLowerCase() || 'dev';
    return { cls: 'ap', txt };
  }

  /* ---------- 连接行工具 ---------- */
  function connBytes(r) { return n2(r && (r.bytes != null ? r.bytes : (n2(r['orig-bytes']) + n2(r['repl-bytes'])))); }
  function hostOf(addr) {
    const s = String(addr || '').trim();
    if (s.startsWith('[')) { const i = s.indexOf(']'); return i > 0 ? s.slice(1, i) : s.slice(1); }
    const i = s.lastIndexOf(':');
    return i > 0 ? s.slice(0, i) : s;
  }
  function portOf(addr) {
    const s = String(addr || '');
    const i = s.lastIndexOf(':');
    if (i < 0) return '';
    const p = s.slice(i + 1).replace(/\]/g, '');
    return /^\d+$/.test(p) ? p : '';
  }
  function isPrivate(ip) {
    const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (s === '::1' || s === 'localhost' || s === '0.0.0.0') return true;
    if (/^127\./.test(s) || /^10\./.test(s) || /^192\.168\./.test(s) || /^169\.254\./.test(s)) return true;
    const m = s.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
    if (/^(fc|fd)[0-9a-f]/.test(s) || /^fe[89ab][0-9a-f]/.test(s) || /^ff[0-9a-f]/.test(s)) return true;
    return false;
  }
  const SERVICE = { '443': 'HTTPS', '80': 'HTTP', '8080': 'HTTP', '53': 'DNS', '22': 'SSH', '1883': 'MQTT', '8883': 'MQTT', '3389': 'RDP', '3306': 'MySQL', '5432': 'Postgres' };
  function serviceOf(port, proto) {
    if (proto === 'udp' && port === '443') return 'QUIC';
    return SERVICE[port] || '';
  }
  function stateBadge(state) {
    const s = String(state || '').toLowerCase();
    if (/established|established\/related/.test(s)) return { cls: 'allow', txt: L('已建立', 'Established') };
    if (/time.wait|close|fin.wait/.test(s)) return { cls: 'neutral', txt: s.includes('time') ? 'TIME_WAIT' : L('已关闭', 'Closed') };
    if (/syn.sent|new|unreplied/.test(s)) return { cls: 'info', txt: L('活跃', 'Active') };
    if (/drop|reject|invalid/.test(s)) return { cls: 'drop', txt: L('阻断', 'Blocked') };
    return { cls: 'info', txt: s || '—' };
  }
  /* 协议配色：沿用设计稿 TCP=蓝 / UDP=橙，ICMP 用紫做第三种明显区分色 */
  const PROTO_COLORS = { tcp: 'var(--v2-accent)', udp: 'var(--v2-amber)', icmp: 'var(--v2-violet)' };
  function protoKey(proto) {
    const p = String(proto || '').toLowerCase().trim().split(/[\s/]/)[0];
    return /^(tcp|udp|icmp)$/.test(p) ? p : '';
  }
  function protoColor(proto) { return PROTO_COLORS[protoKey(proto)] || 'var(--v2-faint)'; }
  function protoTag(proto) {
    const p = String(proto || '').toLowerCase().trim();
    const k = protoKey(p) || 'other';
    return `<span class="proto-tag ipm-proto ipm-proto-${k}">${esc(p || '—')}</span>`;
  }

  /* ---------- 数据加载 ---------- */
  function sortRows(list) {
    return list.slice().sort((a, b) => (n2(b.rxBps) + n2(b.txBps)) - (n2(a.rxBps) + n2(a.txBps)));
  }
  function pushHistory(list) {
    for (const r of list) {
      const k = r.ip;
      const h = history.get(k) || [];
      h.push(n2(r.rxBps) + n2(r.txBps));
      if (h.length > 60) h.shift();
      history.set(k, h);
    }
    const alive = new Set(list.map((r) => r.ip));
    for (const k of [...history.keys()]) if (!alive.has(k)) history.delete(k);
  }
  function offPage() {
    if (state.section !== 'ipMonitor') { stopTimers(); return true; }
    return false;
  }
  async function refreshRates() {
    if (offPage()) return;
    let d;
    try { d = await api('/api/ip-rates'); }
    catch (e) {
      const st = el('ipmConnStatus');
      if (st) st.innerHTML = '<span class="dot is-red"></span>' + esc(e.message || L('获取失败', 'Failed'));
      return;
    }
    if (offPage()) return;
    rows = sortRows((d && d.rows) || []);
    pushHistory(rows);
    paintKpis(d);
    paintMeta(d);
    paintHosts();
    paintRail();
  }
  async function loadConns() {
    if (offPage()) return;
    try {
      const d = await api('/api/config?section=connections');
      connRows = (d && Array.isArray(d.rows)) ? d.rows : [];
    } catch (e) { connRows = []; }
    if (offPage()) return;
    paintConns();
    paintApps();
    paintRail();
  }
  async function loadQuality() {
    if (offPage()) return;
    try {
      const d = (state.quality && state.quality.rows) ? state.quality : await api('/api/link-quality?mode=netwatch');
      quality = d || null;
    } catch (e) { quality = null; }
    if (!offPage()) paintKpis();
  }
  function externalQuality() {
    const list = ((quality && quality.rows) || []).filter((r) => r && Number.isFinite(Number(r.avg)) && !isPrivate(r.host));
    return list;
  }

  /* ---------- 页面骨架 ---------- */
  window.renderIpMonitorPage = function renderIpMonitorPage() {
    stopTimers();
    const c = el('content');
    if (!c) return;
    c.classList.add('dash', 'pg-ipmonitor');   // 复用 design.css 的组件样式，并限定本页样式作用域
    c.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${esc(L('IP 流量监控', 'IP traffic monitor'))}</h1>
          <div class="meta" id="ipmMeta"></div>
        </div>
      </div>
      <div class="grid align-start">
        <div class="kpis" id="ipmKpis"></div>

        <section class="card span8">
          <div class="card-head">
            <div><h2 class="card-title">${esc(L('实时流量', 'Live traffic'))}</h2>
              <div class="card-sub">${esc(L('连接跟踪 · 主机聚合 · 5 秒采样', 'Conntrack · host aggregation · 5s sampling'))}</div></div>
            <div style="display:flex;align-items:center;gap:10px"><span class="status" id="ipmConnStatus"><span class="dot is-green"></span>conntrack ${esc(L('正常', 'OK'))}</span><button class="btn icon-only" id="ipmMenu" type="button" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}"><svg class="i"><use href="#i-more"/></svg></button></div>
          </div>
          <div class="panel-tabs" data-tabs>
            <button class="panel-tab on" data-tab="hosts" type="button">${esc(L('主机', 'Hosts'))}<span class="pt-count" id="ipmTabHosts">0</span></button>
            <button class="panel-tab" data-tab="conns" type="button">${esc(L('连接', 'Connections'))}<span class="pt-count" id="ipmTabConns">0</span></button>
            <button class="panel-tab" data-tab="apps" type="button">${esc(L('应用', 'Apps'))}<span class="pt-count">6</span></button>
          </div>
          <div class="toolbar">
            <label class="field"><svg class="i"><use href="#i-search"/></svg><input id="ipmSearch" type="search" placeholder="${esc(L('搜索主机、IP 或目标…', 'Search host, IP or destination…'))}" aria-label="${esc(L('搜索流量', 'Search traffic'))}"></label>
            <div class="chips">
              <button class="chip on" data-chip="all" type="button">${esc(L('全部', 'All'))} <b id="ipmChipAll">0</b></button>
              <button class="chip" data-chip="high" type="button">${esc(L('高流量', 'Heavy'))} <b id="ipmChipHigh">0</b></button>
              <button class="chip" data-chip="idle" type="button">${esc(L('空闲', 'Idle'))} <b id="ipmChipIdle">0</b></button>
            </div>
            <span class="spacer"></span>
            <span class="toolbar-note">${esc(L('采样 5 秒 · 仅统计已建立会话', '5s sampling · established sessions only'))}</span>
          </div>

          <div class="tab-panel on" data-panel="hosts">
            <div class="table-scroll"><table class="dt">
              <colgroup><col style="width:23%"><col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:13%"><col style="width:15%"><col style="width:10%"><col></colgroup>
              <thead><tr><th>${esc(L('主机', 'Host'))}</th><th class="r">${esc(L('连接', 'Conns'))}</th><th class="r">${esc(L('下行', 'Down'))}</th><th class="r">${esc(L('上行', 'Up'))}</th><th class="r">${esc(L('总速率', 'Total'))}</th><th>${esc(L('占比', 'Share'))}</th><th>${esc(L('趋势', 'Trend'))}</th><th></th></tr></thead>
              <tbody id="ipmHostBody"></tbody>
            </table></div>
            <div class="table-foot" id="ipmHostFoot"></div>
          </div>

          <div class="tab-panel" data-panel="conns">
            <div class="table-scroll"><table class="dt dense">
              <colgroup><col style="width:42%"><col style="width:10%"><col style="width:15%"><col style="width:16%"><col style="width:17%"></colgroup>
              <thead><tr><th>${esc(L('连接', 'Connection'))}</th><th>${esc(L('协议', 'Proto'))}</th><th>${esc(L('状态', 'State'))}</th><th class="r">${esc(L('流量', 'Traffic'))}</th><th>${esc(L('主机', 'Host'))}</th></tr></thead>
              <tbody id="ipmConnBody"></tbody>
            </table></div>
            <div class="table-foot" id="ipmConnFoot"></div>
          </div>

          <div class="tab-panel" data-panel="apps">
            <div class="table-scroll"><table class="dt">
              <colgroup><col style="width:28%"><col style="width:13%"><col style="width:13%"><col style="width:18%"><col style="width:28%"></colgroup>
              <thead><tr><th>${esc(L('应用', 'App'))}</th><th>${esc(L('协议', 'Proto'))}</th><th class="r">${esc(L('连接', 'Conns'))}</th><th class="r">${esc(L('累计流量', 'Bytes'))}</th><th>${esc(L('占比', 'Share'))}</th></tr></thead>
              <tbody id="ipmAppBody"></tbody>
            </table></div>
            <div class="table-foot">
              <span>${esc(L('按目标端口归类（非 DPI 应用识别）· 数据来自 conntrack', 'Grouped by destination port (no DPI) · from conntrack'))}</span>
              <span class="mono">${esc(L('最近 5 分钟', 'Last 5 min'))}</span>
            </div>
          </div>
        </section>

        <div class="span4 rail" id="ipmRail"></div>
      </div>`;
    bindShell();
    loadIcons().then(refreshRates);
    loadConns();
    loadQuality();
    startTimers();
  };

  function bindShell() {
    const c = el('content');
    if (c && !c._ipmNavBound) {
      c._ipmNavBound = true;
      c.addEventListener('click', (e) => {
        if (state.section !== 'ipMonitor') return;
        const a = e.target.closest('[data-nav]');
        if (!a || !c.contains(a)) return;
        e.preventDefault();
        navigate(a.dataset.nav);
      });
    }
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach((b) => {
      b.onclick = () => {
        activeTab = b.dataset.tab;
        tabs.forEach((x) => x.classList.toggle('on', x === b));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === activeTab));
      };
    });
    document.querySelectorAll('.chip').forEach((b) => {
      b.onclick = () => {
        activeChip = b.dataset.chip;
        document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
        paintHosts();
      };
    });
    const s = el('ipmSearch');
    if (s) { s.value = query; s.oninput = () => { query = s.value.trim().toLowerCase(); paintHosts(); }; }
    const menu = el('ipmMenu');
    if (menu) menu.onclick = () => openCardMenu(menu);
    const body = el('ipmHostBody');
    if (body) body.onclick = (e) => {
      const b = e.target.closest('[data-edit]');
      if (!b) return;
      navigate('topology');
      setTimeout(() => { if (typeof window.openTopologyEditorById === 'function') window.openTopologyEditorById(b.dataset.edit); }, 250);
    };
  }
  function openCardMenu(anchor) {
    const compact = document.body.classList.contains('ui-compact');
    UI.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 主机流量', 'CSV · host traffic'), icon: 'i-download', action: exportCsv },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        toast(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'));
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(L('IP 流量监控', 'IP traffic monitor'))}</small></div>` });
  }
  function exportCsv() {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [[L('主机', 'Host'), 'IP', L('连接', 'Conns'), L('下行(bps)', 'Down(bps)'), L('上行(bps)', 'Up(bps)'), L('累计下行(B)', 'Total down(B)'), L('累计上行(B)', 'Total up(B)')].map(cell).join(',')];
    for (const r of rows) lines.push([r.name || r.ip, r.ip, r.connections, n2(r.rxBps), n2(r.txBps), n2(r.rxBytes), n2(r.txBytes)].map(cell).join(','));
    try {
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'ip-traffic.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message || L('导出失败', 'Export failed')); }
  }

  /* ---------- 绘制：KPI ---------- */
  function paintKpis(d) {
    const box = el('ipmKpis'); if (!box) return;
    const latest = state.latest || {};
    const conn = latest.connections || {};
    const totalConn = n2(conn.total);
    const rx = n2(latest.totalRx), tx = n2(latest.totalTx);
    const total = rx + tx;
    const q = externalQuality();
    const avg = q.length ? q.reduce((s, r) => s + n2(r.avg), 0) / q.length : null;
    const jitter = q.length ? q.reduce((s, r) => s + n2(r.jitter), 0) / q.length : null;
    const peak = Math.max(0, ...(state.points || []).slice(-60).map((p) => n2(p.rx) + n2(p.tx)));
    const trend = (state.points || []).slice(-20).map((p) => n2(p.rx) + n2(p.tx));
    const qState = avg == null ? { dot: 'is-muted', txt: L('未探测', 'No probe') }
      : avg <= 50 ? { dot: 'is-green', txt: L('稳定', 'Stable') }
        : avg <= 120 ? { dot: 'is-amber', txt: L('一般', 'Fair') }
          : { dot: 'is-red', txt: L('较高', 'High') };

    box.innerHTML = `
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico blue"><svg class="i"><use href="#i-conn"/></svg></span>${esc(L('活跃连接', 'Active connections'))}</div>
        <div class="kpi-main"><div class="kpi-num">${int(totalConn)}</div><span class="status"><span class="dot ${totalConn ? 'is-green' : 'is-muted'}"></span>${esc(totalConn ? L('实时', 'Live') : L('无数据', 'No data'))}</span></div>
        <div class="kpi-foot"><span>${esc(L('TCP', 'TCP'))} ${int(conn.tcp)} · ${esc(L('UDP', 'UDP'))} ${int(conn.udp)}</span><span>${esc(L('IPv4', 'IPv4'))} ${int(conn.v4)}</span></div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico teal"><svg class="i"><use href="#i-users"/></svg></span>${esc(L('在线主机', 'Online hosts'))}</div>
        <div class="kpi-main"><div class="kpi-num">${rows.length}</div><span class="status"><span class="dot ${rows.length ? 'is-green' : 'is-muted'}"></span>${esc(rows.length ? L('正常', 'Normal') : L('未开启', 'None'))}</span></div>
        <div class="kpi-foot"><span>${esc(L('测速主机', 'Monitored'))} ${rows.length}</span><span>${rows.length ? esc(L('近 5 分钟活跃', 'Active in 5 min')) : '—'}</span></div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico violet"><svg class="i"><use href="#i-pulse"/></svg></span>${esc(L('总速率', 'Total rate'))}</div>
        <div class="kpi-main"><div class="kpi-num">${mbps(total)}<span class="u">Mbps</span></div>${kpiSpark(trend, 'var(--v2-violet)')}</div>
        <div class="kpi-foot">
          <span class="ipm-rate-line" title="${esc(L('下行', 'Down'))} ${mbps(rx)} / ${esc(L('上行', 'Up'))} ${mbps(tx)} Mbps">↓ ${mbps(rx)} · ↑ ${mbps(tx)} Mbps</span>
          <span class="ipm-peak-line" title="${esc(L('峰值', 'Peak'))} ${mbps(peak)} Mbps">${esc(L('峰值', 'Peak'))} ${mbps(peak)}</span>
        </div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico green"><svg class="i"><use href="#i-clock"/></svg></span>${esc(L('外网时延', 'WAN latency'))}</div>
        <div class="kpi-main"><div class="kpi-num">${avg == null ? '—' : Math.round(avg)}<span class="u">ms</span></div><span class="status"><span class="dot ${qState.dot}"></span>${esc(qState.txt)}</span></div>
        <div class="kpi-foot"><span>${q.length ? esc(q.slice(0, 2).map((r) => r.label || r.host).join(' · ')) : esc(L('未配置探测目标', 'No probe target'))}</span><span>${jitter == null ? '—' : esc(L('抖动', 'Jitter')) + ' ' + (Math.round(jitter * 10) / 10) + ' ms'}</span></div>
      </article>`;
  }
  function paintMeta(d) {
    const m = el('ipmMeta'); if (!m) return;
    const name = (d && d.deviceName) || (state.latest && state.latest.deviceName) || '';
    const conn = (state.latest && state.latest.connections) || {};
    m.innerHTML = `${esc(name)}<span class="sep"></span>${int(conn.total)} ${esc(L('活跃连接', 'active connections'))}<span class="sep"></span>${rows.length} ${esc(L('台在线主机', 'online hosts'))}${d && d.error ? '<span class="sep"></span><span style="color:var(--v2-red)">' + esc(d.error) + '</span>' : ''}`;
  }

  /* ---------- 绘制：主机表 ---------- */
  function paintHosts() {
    const body = el('ipmHostBody'); if (!body) return;
    const sum = rows.reduce((s, r) => s + n2(r.rxBps) + n2(r.txBps), 0) || 1;
    const heavy = rows.filter((r) => (n2(r.rxBps) + n2(r.txBps)) >= 5e5).length;
    const tHost = el('ipmTabHosts'), cAll = el('ipmChipAll'), cHigh = el('ipmChipHigh'), cIdle = el('ipmChipIdle');
    if (tHost) tHost.textContent = String(rows.length);
    if (cAll) cAll.textContent = String(rows.length);
    if (cHigh) cHigh.textContent = String(heavy);
    if (cIdle) cIdle.textContent = String(Math.max(0, rows.length - heavy));

    const shown = rows.filter((r) => {
      if (activeChip === 'high' && (n2(r.rxBps) + n2(r.txBps)) < 5e5) return false;
      if (activeChip === 'idle' && (n2(r.rxBps) + n2(r.txBps)) >= 5e5) return false;
      if (query && !(`${r.name || ''} ${r.ip || ''}`.toLowerCase().includes(query))) return false;
      return true;
    }).slice(0, 30);

    if (!shown.length) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--v2-faint);height:56px">${esc(rows.length ? L('没有匹配的主机', 'No matching host') : L('暂无设备开启 IP 测速。请到网络拓扑中编辑设备，填写 IP 并勾选「按 IP 实时测速」。', 'No devices with IP monitoring yet. Enable "Live rate by IP" in topology.'))}</td></tr>`;
      const foot = el('ipmHostFoot'); if (foot) foot.textContent = '';
      return;
    }
    body.innerHTML = shown.map((r) => {
      const totalBps = n2(r.rxBps) + n2(r.txBps);
      const pct = Math.min(100, (totalBps / sum) * 100);
      const badge = badgeFor(r.name || r.ip);
      const icon = iconFor(r);
      const h = history.get(r.ip) || [];
      return `<tr>
        <td><div class="if-name"><span class="if-badge ${badge.cls}">${esc(badge.txt)}</span><span><b>${icon ? `<img class="ipm-icon" src="${esc(icon)}" alt="" loading="lazy">` : ''}${esc(r.name || r.ip)}</b><small class="mono">${esc(r.ip)}</small></span></div></td>
        <td class="r"><span class="num">${int(r.connections)}</span></td>
        <td class="r"><span class="cell-num"><b>${mbps(r.rxBps)} Mbps</b><small>${esc(L('下行', 'Down'))}</small></span></td>
        <td class="r"><span class="cell-num"><b>${mbps(r.txBps)} Mbps</b><small>${esc(L('上行', 'Up'))}</small></span></td>
        <td class="r"><span class="cell-num"><b>${mbps(totalBps)} Mbps</b><small>${esc(L('合计', 'Total'))}</small></span></td>
        <td><div class="share"><span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span><span>${pct.toFixed(1)}%</span></div></td>
        <td class="r">${miniSpark(h, 'var(--v2-accent)')}</td>
        <td>${state.authRole === 'read' ? '' : `<button class="row-more" type="button" data-edit="${esc(r.id)}" title="${esc(L('在网络拓扑中编辑', 'Edit in topology'))}"><svg class="i" style="width:14px;height:14px"><use href="#i-more"/></svg></button>`}</td>
      </tr>`;
    }).join('');
    const rest = Math.max(0, rows.length - shown.length);
    const foot = el('ipmHostFoot');
    if (foot) foot.innerHTML = `<span>${esc(L('显示', 'Showing'))} ${shown.length} / ${rows.length} ${esc(L('台', 'hosts'))}${rest ? ' · ' + esc(L('其余', 'others')) + ' ' + rest : ''}</span><span class="mono">${esc(L('按总速率排序', 'Sorted by total rate'))}</span>`;
  }

  /* ---------- 绘制：连接表 ---------- */
  function paintConns() {
    const body = el('ipmConnBody'); if (!body) return;
    const conn = (state.latest && state.latest.connections) || {};
    const tab = el('ipmTabConns'); if (tab) tab.textContent = int(conn.total || connRows.length);
    const list = connRows.slice().sort((a, b) => connBytes(b) - connBytes(a)).slice(0, 12);
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--v2-faint);height:56px">${esc(L('暂无连接数据（/api/config?section=connections）', 'No connection data (/api/config?section=connections)'))}</td></tr>`;
    } else {
      body.innerHTML = list.map((r) => {
        const src = String(r['src-address'] || ''), dst = String(r['dst-address'] || '');
        const proto = String(r.protocol || '').toLowerCase();
        const st = stateBadge(r['connection-state']);
        const host = rows.find((x) => String(x.ip) === hostOf(src));
        return `<tr>
          <td><div class="flow-conn"><b>${esc(src)}</b><span class="arrow">→</span><span>${esc(dst)}</span></div></td>
          <td>${protoTag(proto)}</td>
          <td><span class="badge ${st.cls}">${esc(st.txt)}</span></td>
          <td class="r"><span class="num">${esc(bytes(connBytes(r)))}</span></td>
          <td><span class="cell"><b>${esc(host ? (host.name || host.ip) : L('未知主机', 'Unknown'))}</b><small>${esc(host ? L('内网主机', 'LAN host') : hostOf(src))}</small></span></td>
        </tr>`;
      }).join('');
    }
    const foot = el('ipmConnFoot');
    if (foot) foot.innerHTML = `<span>${esc(L('显示', 'Showing'))} ${list.length} / ${int(conn.total || connRows.length)} ${esc(L('条连接', 'connections'))} · ${esc(L('TCP', 'TCP'))} ${int(conn.tcp)} · ${esc(L('UDP', 'UDP'))} ${int(conn.udp)}</span><span class="mono">${esc(L('实时', 'Live'))}</span>`;
  }

  /* ---------- 绘制：应用表（按 conntrack 端口归类） ---------- */
  function appAgg() {
    const map = new Map();
    let total = 0;
    for (const r of connRows) {
      const port = portOf(r['dst-address']);
      const proto = String(r.protocol || '').toLowerCase();
      const name = serviceOf(port, proto) || L('其他', 'Other');
      const key = proto + '|' + name;
      const cur = map.get(key) || { name, proto, count: 0, bytes: 0 };
      cur.count++; cur.bytes += connBytes(r); total++;
      map.set(key, cur);
    }
    const order = ['HTTPS', 'QUIC', 'DNS', L('其他', 'Other'), 'HTTP', 'MQTT', 'SSH'];
    const list = [...map.values()].sort((a, b) => {
      const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || b.count - a.count;
    });
    return { list, total };
  }
  function paintApps() {
    const body = el('ipmAppBody'); if (!body) return;
    const { list, total } = appAgg();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--v2-faint);height:56px">${esc(L('暂无应用数据', 'No app data'))}</td></tr>`;
      return;
    }
    body.innerHTML = list.map((a) => {
      const pct = total ? (a.count / total) * 100 : 0;
      const color = protoColor(a.proto);
      return `<tr>
        <td><div class="cell"><b>${esc(a.name)}</b><small>${esc(L('端口归类', 'By port'))}</small></div></td>
        <td>${protoTag(a.proto)}</td>
        <td class="r"><span class="num">${int(a.count)}</span></td>
        <td class="r"><span class="num">${esc(bytes(a.bytes))}</span></td>
        <td><div class="share"><span class="bar"><i style="width:${Math.round(pct)}%;background:${color}"></i></span><span>${Math.round(pct)}%</span></div></td>
      </tr>`;
    }).join('');
  }

  /* ---------- 绘制：右栏 ---------- */
  function paintRail() {
    const rail = el('ipmRail'); if (!rail) return;
    const latest = state.latest || {};
    const conn = latest.connections || {};
    const v4 = n2(conn.v4), v6 = n2(conn.v6), tcp = n2(conn.tcp), udp = n2(conn.udp);
    const total = n2(conn.total) || v4 + v6;
    const C = 2 * Math.PI * 52;
    const len4 = total ? (C * v4 / total).toFixed(1) : '0';
    const len6 = total ? (C * v6 / total).toFixed(1) : '0';
    const off6 = total ? (-C * v4 / total).toFixed(1) : '0';
    const pct4 = total ? ((v4 / total) * 100).toFixed(1) : '0';
    const pct6 = total ? ((v6 / total) * 100).toFixed(1) : '0';
    const tcpPct = total ? Math.min(100, (tcp / total) * 100) : 0;
    const udpPct = total ? Math.min(100, (udp / total) * 100) : 0;
    const othPct = Math.max(0, 100 - tcpPct - udpPct);

    /* 外部目标 TOP5：按 conntrack 中外网目标的真实累计字节统计 */
    const dest = new Map();
    for (const r of connRows) {
      const host = hostOf(r['dst-address']);
      if (!host || isPrivate(host)) continue;
      const port = portOf(r['dst-address']);
      const cur = dest.get(host) || { host, bytes: 0, svc: '' };
      cur.bytes += connBytes(r);
      if (!cur.svc) cur.svc = serviceOf(port, String(r.protocol || '').toLowerCase());
      dest.set(host, cur);
    }
    const top = [...dest.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    const maxBytes = top.length ? top[0].bytes : 1;
    const rx = n2(latest.totalRx), tx = n2(latest.totalTx);
    const peakRx = Math.max(0, ...(state.points || []).slice(-60).map((p) => n2(p.rx)));
    const peakTx = Math.max(0, ...(state.points || []).slice(-60).map((p) => n2(p.tx)));

    rail.innerHTML = `
      <section class="card conn-card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('协议分布', 'Protocol mix'))}</h2><div class="card-sub">${int(total)} ${esc(L('条活跃连接', 'active connections'))}</div></div><span class="status">${esc(L('实时', 'Live'))}</span></div>
        <div class="conn-body">
          <div class="conn-top">
            <svg class="donut" viewBox="0 0 124 124" aria-label="${esc(L('连接地址族分布', 'Address family distribution'))}">
              <circle cx="62" cy="62" r="52" fill="none" style="stroke:var(--v2-surface-3)" stroke-width="11"/>
              <circle cx="62" cy="62" r="52" fill="none" style="stroke:var(--v2-accent)" stroke-width="11" stroke-dasharray="${len4} ${(C - n2(len4)).toFixed(1)}" transform="rotate(-90 62 62)"/>
              <circle cx="62" cy="62" r="52" fill="none" style="stroke:var(--v2-teal)" stroke-width="11" stroke-dasharray="${len6} ${(C - n2(len6)).toFixed(1)}" stroke-dashoffset="${off6}" transform="rotate(-90 62 62)"/>
              <text x="62" y="59" text-anchor="middle" font-size="20" font-weight="650" style="fill:var(--v2-ink);font-variant-numeric:tabular-nums">${int(total)}</text>
              <text x="62" y="76" text-anchor="middle" font-size="10" style="fill:var(--v2-faint)">${esc(L('活跃连接', 'Active'))}</text>
            </svg>
            <div class="conn-legend">
              <div class="row"><i class="dot" style="background:var(--v2-accent);box-shadow:none"></i>IPv4<b>${int(v4)}</b><small>${pct4}%</small></div>
              <div class="row"><i class="dot" style="background:var(--v2-teal);box-shadow:none"></i>IPv6<b>${int(v6)}</b><small>${pct6}%</small></div>
            </div>
          </div>
          <div class="proto">
            <div class="proto-head"><span>${esc(L('传输协议', 'Transport'))}</span><span>${esc(L('TCP', 'TCP'))} ${tcpPct.toFixed(1)}% · ${esc(L('UDP', 'UDP'))} ${udpPct.toFixed(1)}%</span></div>
            <div class="proto-bar"><i class="tcp" style="width:${tcpPct}%"></i><i class="udp" style="width:${udpPct}%"></i><i class="oth" style="width:${othPct}%"></i></div>
            <div class="proto-legend"><span>${esc(L('TCP', 'TCP'))} <b>${int(tcp)}</b></span><span>${esc(L('UDP', 'UDP'))} <b>${int(udp)}</b></span><span>${esc(L('其他', 'Other'))} <b>${int(Math.max(0, total - tcp - udp))}</b></span></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('总速率', 'Total rate'))}</h2><div class="card-sub">${esc(L('最近 5 分钟', 'Last 5 min'))}</div></div><span class="badge teal">${mbps(rx + tx)} Mbps</span></div>
        <div class="rail-body">
          <div class="rate-pair">
            <div class="rate-k"><small><svg class="i" style="color:var(--v2-accent)"><use href="#i-down"/></svg>${esc(L('下行', 'Down'))}</small><b>${mbps(rx)}<span>Mbps</span></b><em>${esc(L('峰值', 'Peak'))} ${mbps(peakRx)}</em></div>
            <div class="rate-k"><small><svg class="i" style="color:var(--v2-teal)"><use href="#i-up"/></svg>${esc(L('上行', 'Up'))}</small><b>${mbps(tx)}<span>Mbps</span></b><em>${esc(L('峰值', 'Peak'))} ${mbps(peakTx)}</em></div>
          </div>
          <div class="rate-chart">${rateChart()}</div>
          <div class="kv" style="margin-top:6px"><span>${esc(L('测速主机', 'Monitored hosts'))}</span><b>${rows.length} / ${rows.length}</b></div>
          <div class="kv"><span>${esc(L('连接总数', 'Total connections'))}</span><b>${int(total)}</b></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2 class="card-title">${esc(L('外部目标 TOP 5', 'Top 5 external destinations'))}</h2><div class="card-sub">${esc(L('按 conntrack 累计字节', 'By conntrack bytes'))}</div></div><span class="status">${esc(L('实时', 'Live'))}</span></div>
        <div class="rail-body tight">
          <div class="rank">
            ${top.length ? top.map((r) => `<div class="rank-row"><span class="lbl">${esc(r.host)} <span class="mono" style="color:var(--v2-faint);font-size:9.5px">${esc(r.svc || L('未知端口', 'Unknown'))}</span></span><span class="val">${esc(bytes(r.bytes))}</span><span class="bar"><i style="width:${Math.max(2, (r.bytes / maxBytes) * 100).toFixed(0)}%"></i></span></div>`).join('')
              : `<div style="color:var(--v2-faint);font-size:11px;padding:6px 0">${esc(L('暂无外网连接数据', 'No external connection data'))}</div>`}
          </div>
          <div class="table-foot ipm-top5-foot"><span>${esc(L('仅统计外网目标', 'External destinations only'))}</span><span class="mono">${esc(L('实时', 'Live'))}</span></div>
        </div>
      </section>`;
  }

  /* 离开页面时停止轮询 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimers();
    else if (state.section === 'ipMonitor') {
      refreshRates(); loadConns(); loadQuality(); startTimers();
    }
  });
})();
