'use strict';
/* 网络拓扑独立页
   - 层级完全由 parent 关系推导（根之上还能挂上级设备），同层不重叠
   - 上下 / 左右两种布局；左右时最上级在左、下级在右、同级竖排一列
   - 滚轮缩放、拖拽平移、透明画布；所有节点可自由拖动，只要不与其它节点重叠
   - 双击设备 = 编辑该设备本身（同 id 覆盖，绝不会新增副本）；编辑弹窗可填「本层排序」
   - 点击设备只选中并显示实时上下行速率；流量走向由链路动画线条呈现 */
(function () {
  const TYPES = ['router', 'switch', 'ap', 'nas', 'dns', 'proxy', 'client', 'other'];
  const TYPE_ZH = { router: '路由器', switch: '交换机', ap: '无线 AP', nas: 'NAS / 存储', dns: 'DNS 服务器', proxy: '代理服务器', client: '终端', other: '其它' };
  const TYPE_EN = { router: 'Router', switch: 'Switch', ap: 'Access point', nas: 'NAS / storage', dns: 'DNS server', proxy: 'Proxy server', client: 'Client', other: 'Other' };
  const TYPE_ICON = { router: 'i-gauge', switch: 'i-layers', ap: 'i-wifi', nas: 'i-device', dns: 'i-globe', proxy: 'i-conn', client: 'i-users', other: 'i-nodes' };
  const IPV4_TEST = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
  /* 紧凑三段式：icon（最早 26px，等比略放大到 32px）| 名称/IP/MAC | 实时速率/空闲 */
  const NODE_W = 208, NODE_H = 62, ICON_W = 40, ICON_SZ = 32, RATE_W = 64, PORT_W = 30, PORT_H = 24, GAP = 32;
  let data = null, loading = false, iconUrl = '', iconLib = [], iconLabel = '';
  let direction = 'tb';
  let zoom = 1, panX = 0, panY = 0, baseW = 1000, baseH = 600;
  let topoFilter = 'all', topoTab = 'map';
  let selectedId = null, drag = null, panDrag = null, rates = new Map(), ipRates = new Map(), rateTimer = null;
  let syncIpAllSwitch = () => {};  // 由 renderTopologyPage 注入，数据变更后同步「全部按 IP 测速」开关
  let leaseRows = [], leaseByMac = new Map(), leaseByIp = new Map();
  let leaseTimer = null, leaseBusy = false, leaseAt = 0, leaseError = '';
  let layoutStageW = 0, layoutResizeTimer = null;
  let quality = null, qualityAt = 0, qualityBusy = false, qualityTimer = null, qualityDevice = '';
  const QUALITY_TTL_MS = 45000;

  const typeLabel = (tp) => L(TYPE_ZH[tp] || TYPE_ZH.other, TYPE_EN[tp] || TYPE_EN.other);
  const currentDeviceId = () => (($('deviceSelect') && $('deviceSelect').value) || state.deviceId || '');
  const isCustom = (id) => !!((data && data.custom) || []).find((n) => n.id === id);
  /* 拓扑速率统一用字节单位（B/s、KB/s、MB/s、GB/s），与 BT 客户端口径一致 */
  const fmtRate = (b) => { const r = fmtBytesRate(b); return r.v + r.u; };

  /* ---------- 链路类型 / 统计分类 / 链路质量设置（设计稿复刻） ----------
     linkType / category 随 nodes 一起 POST 到 /api/topology。
     注意：后端 server.js 的 clean() 会丢弃未知字段（实测两个字段都不保存），
     所以同时按设备把这两个字段存进 localStorage 作回退：
     读取时节点字段优先，其次是本地映射，最后才按设备类型推断。 */
  const LINK_LOCAL_KEY = () => 'rosCenter.topologyLinkTypes.' + currentDeviceId();
  const CAT_LOCAL_KEY = () => 'rosCenter.topologyCategories.' + currentDeviceId();
  const LINK_TYPES = ['physical', 'wireless', 'tunnel'];
  const linkTypeLabel = (v) => v === 'wireless'
    ? L('无线链路', 'Wireless') : v === 'tunnel'
    ? L('代理隧道', 'Proxy tunnel') : L('物理链路', 'Physical');
  function readLocalMap(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function saveLocalMap(key, list, field) {
    const m = readLocalMap(key);
    (list || []).forEach((n) => { if (n && n[field]) m[n.id] = n[field]; });
    try { localStorage.setItem(key, JSON.stringify(m)); } catch (e) {}
  }
  function linkTypeOf(n, parent) {
    if (!n) return 'physical';
    /* 与代理服务器相连的链路固定为棕色代理隧道 */
    const up = parent || (n.parent && map.get(n.parent));
    if (n.type === 'proxy' || (up && up.type === 'proxy')) return 'tunnel';
    if (LINK_TYPES.includes(n.linkType)) return n.linkType;
    const saved = readLocalMap(LINK_LOCAL_KEY())[n.id];
    if (LINK_TYPES.includes(saved)) return saved;
    return (n.type === 'ap' || n.type === 'client') ? 'wireless' : 'physical';
  }
  /* 统计条分类：终端 / AP / 节点。编辑弹窗里可直接选择；旧数据按 type 推断。 */
  const CAT_ZH = { client: '终端', ap: 'AP', node: '节点' };
  const CAT_EN = { client: 'Client', ap: 'AP', node: 'Node' };
  function categoryOf(n) {
    if (!n) return 'node';
    if (n.category === 'client' || n.category === 'ap' || n.category === 'node') return n.category;
    const saved = readLocalMap(CAT_LOCAL_KEY())[n.id];
    if (saved === 'client' || saved === 'ap' || saved === 'node') return saved;
    return n.type === 'client' ? 'client' : n.type === 'ap' ? 'ap' : 'node';
  }
  const categoryLabel = (c) => L(CAT_ZH[c] || CAT_ZH.node, CAT_EN[c] || CAT_EN.node);
  /* 拓扑链路质量：独立配置最多 3 个目标（host + RouterOS comment 备注）。
     阈值与仪表盘共用同一 localStorage 键；目标存拓扑专用键，写 Netwatch 时与仪表盘目标合并去重。 */
  const TOPO_Q_KEY = () => 'rosCenter.topologyQuality.' + currentDeviceId();
  const QUALITY_TH_KEY = () => 'rosCenter.qualityThresholds.' + currentDeviceId();
  const QUALITY_HOST_RE = /^[a-zA-Z0-9_.:-]+$/;
  const QUALITY_IV_OPTS = [
    { value: '10s', label: L('10 秒', '10 s') },
    { value: '30s', label: L('30 秒', '30 s') },
    { value: '1m', label: L('60 秒', '60 s') },
    { value: '5m', label: L('5 分钟', '5 min') },
  ];
  function topoQualityPrefs() {
    let warn = 180, critical = 260, interval = '1m', targets = [];
    try {
      const th = JSON.parse(localStorage.getItem(QUALITY_TH_KEY()));
      if (th) {
        if (Number(th.warn) > 0) warn = Number(th.warn);
        if (Number(th.critical) > 0) critical = Number(th.critical);
      }
    } catch (e) {}
    try {
      const p = JSON.parse(localStorage.getItem(TOPO_Q_KEY()));
      if (p) {
        if (p.interval) interval = p.interval;
        targets = (Array.isArray(p) ? p : (p.targets || []))
          .map((t) => ({ host: String((t && t.host) || '').trim(), label: String((t && t.label) || '').trim() }))
          .filter((t) => t.host).slice(0, 3);
      }
    } catch (e) {}
    return { warn, critical, interval, targets };
  }
  function dashboardQualityTargets() {
    try {
      const p = typeof qualityPrefs === 'function' ? qualityPrefs() : null;
      return (p && Array.isArray(p.targets) ? p.targets : [])
        .map((t) => ({ host: String((t && t.host) || '').trim(), label: String((t && t.label) || '').trim() }))
        .filter((t) => t.host);
    } catch (e) { return []; }
  }
  /* 与仪表盘相同 IP 只保留一条（拓扑在前，备注以拓扑为准），避免 RouterOS 里出现重复 Netwatch */
  function mergedQualityTargets(topoTargets) {
    const out = [], seen = new Set();
    [...(topoTargets || []), ...dashboardQualityTargets()].forEach((t) => {
      if (!t.host || seen.has(t.host)) return;
      seen.add(t.host);
      out.push({ host: t.host, label: t.label || '' });
    });
    return out.slice(0, 5);
  }
  /* 与仪表盘查询同一批 Netwatch 结果：合并后的目标列表直接作为查询参数 */
  function qualityTargetQuery() {
    return mergedQualityTargets(topoQualityPrefs().targets)
      .map((r) => encodeURIComponent(r.host + '|' + (r.label || r.host))).join(',');
  }
  const INTERVAL_ZH = { '5s': '5 秒', '10s': '10 秒', '30s': '30 秒', '1m': '60 秒', '5m': '5 分钟' };
  function openQualitySettings() {
    if (!window.UI || typeof UI.openForm !== 'function') {
      toast(L('链路质量设置暂不可用', 'Quality settings unavailable'), 'err');
      return;
    }
    if (state.authRole === 'read') { toast(L('只读账户无法修改链路质量配置', 'Read-only account'), 'err'); return; }
    const qs = topoQualityPrefs();
    const rows = [0, 1, 2].map((i) => qs.targets[i] || { host: '', label: '' });
    const dashHost = (dashboardQualityTargets()[0] || {}).host || '';
    const fields = [
      { key: 'warn', label: L('延迟告警（ms）', 'Latency warning (ms)'), type: 'number', value: String(qs.warn), required: true },
      { key: 'critical', label: L('严重阈值（ms）', 'Critical threshold (ms)'), type: 'number', value: String(qs.critical), required: true },
      { key: 'interval', label: L('检测间隔', 'Probe interval'), type: 'select', value: qs.interval, options: QUALITY_IV_OPTS },
      { key: 'dash', label: L('仪表盘检测目标', 'Dashboard target'), type: 'static', value: dashHost || L('未配置', 'Not set'), hint: L('相同 IP 自动复用，不重复写入 Netwatch', 'Same IP is reused without a duplicate Netwatch entry') },
    ];
    rows.forEach((r, i) => {
      fields.push({ key: 't' + (i + 1), label: L(`检测目标 ${i + 1}`, `Target ${i + 1}`), type: 'text', value: r.host, placeholder: '114.114.114.114' });
      fields.push({ key: 'n' + (i + 1), label: L(`备注 ${i + 1}（RouterOS comment）`, `Note ${i + 1} (RouterOS comment)`), type: 'text', value: r.label, placeholder: L('如：114 网关', 'e.g. 114 gateway') });
    });
    UI.openForm({
      title: L('链路质量配置', 'Link quality settings'),
      sub: L('网络拓扑 · 最多 3 个探测目标', 'Topology · up to 3 probe targets'),
      submitLabel: L('保存配置', 'Save'),
      note: L('备注写入 RouterOS /tool/netwatch 的 comment 字段；卡片显示备注名、延迟条与毫秒值，丢包率与抖动取三个目标的平均值。',
        'Notes are stored in the RouterOS /tool/netwatch comment field. Cards show the note, latency bar and ms value; loss and jitter average all targets.'),
      fields,
      onSubmit: async (values, m) => {
        const warn = Number(values.warn), critical = Number(values.critical);
        if (!Number.isFinite(warn) || warn <= 0 || !Number.isFinite(critical) || critical <= 0) {
          UI.toast(L('阈值需为正数', 'Thresholds must be positive'), 'warn'); return;
        }
        const targets = [], seen = new Set(), bad = [];
        for (let i = 1; i <= 3; i++) {
          const host = String(values['t' + i] || '').trim();
          if (!host) continue;
          if (!QUALITY_HOST_RE.test(host)) { bad.push(host); continue; }
          if (seen.has(host)) { UI.toast(L('检测目标不能重复：', 'Duplicate target: ') + host, 'warn'); return; }
          seen.add(host);
          targets.push({ host, label: String(values['n' + i] || '').trim().slice(0, 100) });
        }
        if (bad.length) { UI.toast(L('检测目标格式不正确：', 'Invalid target: ') + bad[0], 'warn'); return; }
        if (!targets.length) { UI.toast(L('请至少填写一个检测目标', 'Enter at least one target'), 'warn'); return; }
        const interval = values.interval || qs.interval || '1m';
        const btn = m.querySelector('.ui-btn.primary');
        if (btn) { btn.disabled = true; btn.textContent = L('保存中…', 'Saving…'); }
        try {
          await api('/api/link-quality/netwatch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targets: mergedQualityTargets(targets), interval }),
          });
          localStorage.setItem(QUALITY_TH_KEY(), JSON.stringify({ warn, critical }));
          localStorage.setItem(TOPO_Q_KEY(), JSON.stringify({ interval, targets }));
          quality = null; qualityAt = 0;
          UI.closeModal();
          renderQualityRail();
          refreshQuality(true);
          toast(L('链路质量配置已保存', 'Link quality settings saved'), 'ok');
        } catch (e) {
          if (btn) { btn.disabled = false; btn.textContent = L('保存配置', 'Save'); }
          toast(e.message, 'err');
        }
      },
    });
  }
  /* 右栏只展示拓扑配置的目标（未配置时回退仪表盘目标），平均值与条形图口径一致 */
  function railQualityRows() {
    const all = qualityTargets();
    const topoHosts = topoQualityPrefs().targets.map((t) => t.host);
    if (!topoHosts.length) return all.slice(0, 3);
    const byHost = new Map(all.map((r) => [r.host, r]));
    return topoHosts.map((h) => byHost.get(h)).filter(Boolean).slice(0, 3);
  }
  /* 节点名可用宽度约 88px（11px 字号），按中英文字宽裁剪并加省略号 */
  const fitNodeName = (v) => {
    const s = String(v || '').trim();
    let out = '', w = 0;
    for (const ch of s) {
      const cw = /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 11 : 6.6;
      if (w + cw > 88) return out + '…';
      out += ch; w += cw;
    }
    return out;
  };

  function topoKpiCard(o) {
    const dot = o.dot ? `<span class="dot is-${esc(o.dot)}"></span>` : '';
    const state = o.state ? `<span class="status">${dot}${esc(o.state)}</span>` : '';
    const foot = (o.foot || []).map((x) => `<span>${esc(x)}</span>`).join('');
    return `<article class="card kpi" id="${esc(o.id || '')}">
      <div class="kpi-top"><span class="kpi-ico ${esc(o.color || 'blue')}"><svg class="i"><use href="#i-${esc(o.icon || 'nodes')}"/></svg></span>${esc(o.label)}</div>
      <div class="kpi-main"><div class="kpi-num">${esc(o.num)}${o.unit ? `<span class="u">${esc(o.unit)}</span>` : ''}</div>${state}</div>
      <div class="kpi-foot">${foot}</div>
    </article>`;
  }

  const qualityTargets = () => ((quality && quality.rows) || []).filter((r) => r && r.host);
  const qualityNum = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const qualityLatency = () => {
    const avgs = railQualityRows().map((r) => qualityNum(r.avg)).filter((v) => v != null);
    return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  };
  const qualityNums = (key) => railQualityRows().map((r) => qualityNum(r[key])).filter((v) => v != null);
  const qualityAvg = (key) => {
    const arr = qualityNums(key);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  };
  /* 与 dash-v2.js「系统状态」卡链路质量使用同一份 /api/link-quality(netwatch) 数据，
     显示口径也保持一致：微秒级延迟、整数丢包、同样的状态点/文案，不再单独配置探测目标。 */
  const qStateDot = (r) => r.state === 'bad' ? 'is-red' : r.state === 'warn' ? 'is-amber' : r.state === 'ok' ? 'is-green' : 'is-muted';
  const qStateText = (r) => r.state === 'bad' ? L('离线', 'Down') : r.state === 'warn' ? L('异常', 'Warn')
    : r.state === 'ok' ? L('在线', 'Up') : L('未知', 'Unknown');
  const qLatencyText = (r) => {
    const ms = qualityNum(r.avg);
    if (ms == null) return '—';
    if (ms > 0 && ms < 1) return Math.round(ms * 1000) + ' µs';
    return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
  };
  const qJitterText = (r) => { const v = qualityNum(r.jitter); return v == null ? '—' : v.toFixed(1) + ' ms'; };
  const qLossText = (r) => { const v = qualityNum(r.loss); return v == null ? '—' : v.toFixed(0) + '%'; };
  function parseSeenSec(v) {
    const s = String(v || '').trim();
    if (!s) return 1e9;
    const m = s.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
    if (!m) return 1e9;
    return (Number(m[1]) || 0) * 604800 + (Number(m[2]) || 0) * 86400 + (Number(m[3]) || 0) * 3600
      + (Number(m[4]) || 0) * 60 + (Number(m[5]) || 0);
  }
  function paintTopoKpis() {
    if (!data) return;
    const stats = leaseStats();
    const links = linkData();
    const online = nodes.filter((n) => { const l = leaseForNode(n); return l && l.status === 'bound'; }).length;
    const waiting = nodes.filter((n) => { const l = leaseForNode(n); return l && l.status === 'waiting'; }).length;
    const matched = nodes.filter((n) => !!leaseForNode(n)).length;
    const wireless = links.filter(({ child }) => ['ap', 'client'].includes(child.type)).length;
    const wired = Math.max(0, links.length - wireless);
    const types = new Set(nodes.map((n) => n.type));
    const pct = nodes.length ? Math.round(online / nodes.length * 100) : 0;
    const avg = qualityLatency();
    const jitter = qualityAvg('jitter');
    const loss = qualityAvg('loss');
    const probeRows = qualityTargets().filter((r) => r.state && r.state !== 'unknown');
    const hasBad = probeRows.some((r) => r.state === 'bad');
    const hasWarn = probeRows.some((r) => r.state === 'warn');
    const latencyState = !probeRows.length && avg == null ? { dot: 'muted', text: L('未探测', 'No probe') }
      : hasBad ? { dot: 'red', text: L('有目标离线', 'Target down') }
      : hasWarn ? { dot: 'amber', text: L('轻微波动', 'Minor jitter') }
      : avg == null ? { dot: 'green', text: L('探测正常', 'Probe healthy') }
      : avg <= 30 ? { dot: 'green', text: L('稳定', 'Stable') }
      : avg <= 80 ? { dot: 'amber', text: L('偏高', 'Elevated') } : { dot: 'red', text: L('较慢', 'Slow') };
    const box = $('topoKpis');
    if (!box) return;
    box.innerHTML = [
      topoKpiCard({ id: 'topoKpiDevices', icon: 'nodes', color: 'blue', label: L('设备总数', 'Devices'),
        num: String(nodes.length), dot: nodes.length ? 'green' : 'muted',
        state: L(`${online} 在线`, `${online} online`),
        foot: [L(`${nodes.length - matched} 台未匹配租约`, `${nodes.length - matched} unmatched`), L(`${types.size} 类角色`, `${types.size} roles`)] }),
      topoKpiCard({ id: 'topoKpiOnline', icon: 'check', color: 'green', label: L('在线设备', 'Online'),
        num: String(online), dot: online ? 'green' : 'amber',
        state: `${pct}%`,
        foot: [L(`已绑定 ${stats.bound} 条租约`, `${stats.bound} bound leases`), L(`${waiting} 台等待地址`, `${waiting} waiting`)] }),
      topoKpiCard({ id: 'topoKpiLinks', icon: 'conn', color: 'teal', label: L('链路总数', 'Links'),
        num: String(links.length), dot: links.length ? 'green' : 'muted', state: L('自动发现', 'Auto'),
        foot: [L(`有线 ${wired} · 无线 ${wireless}`, `Wired ${wired} · wireless ${wireless}`), L(`${matched} 台已联动`, `${matched} linked`)] }),
      topoKpiCard({ id: 'topoKpiLatency', icon: 'clock', color: 'violet', label: L('平均时延', 'Avg latency'),
        num: avg == null ? '—' : avg.toFixed(avg < 10 ? 1 : 0), unit: avg == null ? '' : 'ms',
        dot: latencyState.dot, state: latencyState.text,
        foot: [avg == null ? (probeRows.length ? L(`${probeRows.length} 个目标 · Netwatch`, `${probeRows.length} targets · Netwatch`) : L('未配置探测目标', 'No probe targets'))
          : L(`抖动 ${jitter == null ? '—' : jitter.toFixed(1)} ms`, `Jitter ${jitter == null ? '—' : jitter.toFixed(1)} ms`),
          avg == null ? L('右侧链路质量配置', 'Configure at right') : L(`丢包 ${loss == null ? '—' : loss.toFixed(1)}%`, `Loss ${loss == null ? '—' : loss.toFixed(1)}%`)] })
    ].join('');
    window.__topoQuality = { avg, jitter, loss, rows: qualityTargets(), updatedAt: qualityAt };
  }

  window.renderTopologyPage = function renderTopologyPage() {
    const staleKpis = document.getElementById('v2VirtualKpis');
    if (staleKpis) staleKpis.remove();
    $('content').innerHTML = `    <div class="page-head topo-page-head">
      <div>
        <h1>${esc(L('网络拓扑', 'Network topology'))}</h1>
        <div class="topo-meta" id="topoMeta"><span>${esc(L('正在读取拓扑…', 'Loading topology…'))}</span></div>
      </div>
      <div class="page-actions topo-page-actions">
        <span class="topo-live"><span class="dot"></span>${esc(L('自动同步 · 12 秒', 'Auto sync · 12s'))}</span>
        ${state.authRole === 'read' ? '' : `<button class="btn btn-sm topo-ipall-btn" type="button" id="topoIpAll" title="${esc(L('点选要为哪些设备开启实时测速', 'Pick which devices to monitor'))}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 6 16 3-8h4"/></svg>${esc(L('按 IP 测速', 'Monitor by IP'))}<span class="topo-ipall-count" id="topoIpAllCount">0</span>
        </button>`}
        <button class="btn btn-sm topo-dhcp-btn" type="button" id="topoDhcpBtn" title="${esc(L('查看 DHCP 租约与拓扑节点联动', 'DHCP leases linked to topology nodes'))}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#i-dhcp"/></svg>${esc(L('DHCP 联动', 'DHCP sync'))}<span class="topo-dhcp-count zero" id="topoDhcpCount">0</span></button>
        <button class="btn btn-sm" type="button" id="topoRefresh">${esc(L('重新发现', 'Rediscover'))}</button>
        ${state.authRole === 'read' ? '' : `<button class="btn btn-sm primary" type="button" id="topoAdd">+ ${esc(L('添加设备', 'Add device'))}</button>
        <button class="btn btn-sm ghost-danger" type="button" id="topoDelete">− ${esc(L('删除设备', 'Delete device'))}</button>`}
      </div>
    </div>
    <div class="kpis v2-vkpis topo-kpis" id="topoKpis">
      ${topoKpiCard({ icon: 'nodes', color: 'blue', label: L('设备总数', 'Devices'), num: '—', state: L('读取中', 'Loading'), foot: [L('自动发现', 'Auto discovery'), '—'] })}
      ${topoKpiCard({ icon: 'check', color: 'green', label: L('在线设备', 'Online'), num: '—', state: L('读取中', 'Loading'), foot: [L('DHCP 在线', 'DHCP online'), '—'] })}
      ${topoKpiCard({ icon: 'conn', color: 'teal', label: L('链路总数', 'Links'), num: '—', state: L('读取中', 'Loading'), foot: [L('物理 / 无线', 'Physical / wireless'), '—'] })}
      ${topoKpiCard({ icon: 'clock', color: 'violet', label: L('平均时延', 'Avg latency'), num: '—', unit: 'ms', state: L('探测中', 'Probing'), foot: [L('Netwatch / ICMP', 'Netwatch / ICMP'), '—'] })}
    </div>
    <div class="topo-grid">
      <section class="card topo-card">
        <div class="card-head topo-card-head">
          <div>
            <h2 class="card-title">${esc(L('实时拓扑', 'Live topology'))}</h2>
            <div class="card-sub">${esc(L('自动发现 · 物理链路与无线链路', 'Auto-discovery · physical and wireless links'))}</div>
          </div>
          <span class="status topo-card-status" id="topoCardStatus"><span class="dot is-green"></span>${esc(L('链路健康', 'Link health'))}</span>
        </div>
        <div class="panel-tabs topo-tabs" id="topoTabs" role="tablist">
          <button class="panel-tab on" type="button" role="tab" data-topo-tab="map">${esc(L('拓扑图', 'Topology'))}<span class="pt-count" id="topoTabMapCount">0</span></button>
          <button class="panel-tab" type="button" role="tab" data-topo-tab="links">${esc(L('链路列表', 'Link list'))}<span class="pt-count" id="topoTabLinkCount">0</span></button>
        </div>
        <div class="topo-tab-panel on" data-topo-panel="map">
          <div class="toolbar topo-toolbar">
            <div class="topo-zoom-dock" role="group" aria-label="${esc(L('视图控制', 'View controls'))}">
              <button class="topo-ctrl" id="topoZoomOut" type="button" title="${esc(L('缩小', 'Zoom out'))}">−</button>
              <span class="topo-zoom" id="topoZoomLabel">100%</span>
              <button class="topo-ctrl" id="topoZoomIn" type="button" title="${esc(L('放大', 'Zoom in'))}">+</button>
              <button class="topo-ctrl" id="topoFit" type="button" title="${esc(L('适应视图', 'Fit view'))}">⤢</button>
              <span class="topo-ctrl-sep"></span>
              <button class="topo-ctrl topo-dir" id="topoDir" type="button" title="${esc(L('切换上下 / 左右视图', 'Switch vertical / horizontal view'))}">${direction === 'tb' ? '↕ ' + esc(L('上下', 'Vertical')) : '↔ ' + esc(L('左右', 'Horizontal'))}</button>
            </div>
            <span class="toolbar-note" id="topoRefreshNote">${esc(L('租约 12 秒同步', 'Leases refresh 12s'))}</span>
          </div>
          <div class="topo-canvas-wrap">
            <div class="topo-stage" id="topoStage"><div class="topo-empty">${esc(L('正在加载拓扑…', 'Loading topology…'))}</div></div>
            <span class="topo-swipe-hint" id="topoSwipeHint" hidden>${esc(L('← 左右滑动查看完整拓扑 →', '← Swipe to explore →'))}</span>
            <div class="topo-dhcp-backdrop" id="topoDhcpBackdrop" hidden></div>
            <aside class="topo-dhcp-drawer" id="topoDhcpDrawer" hidden aria-label="${esc(L('DHCP 租约联动', 'DHCP lease sync'))}">
              <div class="dhcp-drawer-head">
                <span class="dhcp-drawer-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#i-dhcp"/></svg></span>
                <div><h3>${esc(L('DHCP 联动', 'DHCP sync'))}</h3><p>${esc(L('以 MAC 为锚点关联拓扑节点 · 12 秒自动刷新', 'Leases are matched to nodes by MAC · refresh every 12s'))}</p></div>
                <button class="dhcp-drawer-close" type="button" id="topoDhcpClose" aria-label="${esc(L('关闭', 'Close'))}">×</button>
              </div>
              <div class="dhcp-drawer-tools">
                <label class="dhcp-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><use href="#i-search"/></svg>
                  <input id="topoDhcpSearch" type="search" placeholder="${esc(L('搜索 IP / 主机名 / MAC', 'Search IP / host / MAC'))}" autocomplete="off"></label>
              </div>
              <div class="dhcp-drawer-stats" id="topoDhcpStats"></div>
              <div class="dhcp-list" id="topoDhcpList"></div>
              <div class="dhcp-drawer-foot"><span>${esc(L('仅同步 IPv4 · 拓扑图不改动租约', 'IPv4 only · topology never rewrites leases'))}</span><button type="button" id="topoDhcpOpenPage">${esc(L('打开租约页', 'Open leases'))} →</button></div>
            </aside>
          </div>
          <div class="topo-foot">
            <div class="topo-legend" id="topoLegend"></div>
            <span class="topo-foot-count" id="topoFootCount"></span>
          </div>
        </div>
        <div class="topo-tab-panel" data-topo-panel="links">
          <div class="table-scroll topo-link-scroll">
            <table class="topo-link-table">
              <thead><tr><th>${esc(L('链路', 'Link'))}</th><th>${esc(L('端点 / 类型', 'Endpoint / type'))}</th><th class="r">${esc(L('实时速率', 'Live rate'))}</th><th>${esc(L('DHCP', 'DHCP'))}</th><th></th></tr></thead>
              <tbody id="topoLinkRows"><tr><td colspan="5" class="topo-link-empty">${esc(L('正在读取链路…', 'Loading links…'))}</td></tr></tbody>
            </table>
          </div>
          <div class="table-foot topo-link-foot"><span id="topoLinkFoot">—</span><span class="mono">${esc(L('自动推导 · 12 秒', 'Auto-derived · 12s'))}</span></div>
        </div>
      </section>
      <aside class="topo-rail">
        <section class="card topo-rail-card">
          <div class="card-head">
            <div><h2 class="card-title">${esc(L('设备状态', 'Device status'))}</h2><div class="card-sub">${esc(L('按角色分组', 'By role'))}</div></div>
            <span class="badge neutral" id="topoRailDevBadge">—</span>
          </div>
          <div class="rail-body tight" id="topoRailDevices"><div class="topo-rail-empty">${esc(L('正在读取设备…', 'Loading devices…'))}</div></div>
        </section>
        <section class="card topo-rail-card">
          <div class="card-head">
            <div><h2 class="card-title">${esc(L('链路质量', 'Link quality'))}</h2><div class="card-sub">${esc(L('最近 5 分钟探测', 'Last 5 minutes'))}</div></div>
            <span class="badge neutral" id="topoRailQualityBadge">—</span>
          </div>
          <div class="rail-body tight" id="topoRailQuality"><div class="topo-rail-empty">${esc(L('正在读取探测结果…', 'Loading probe results…'))}</div></div>
        </section>
        <section class="card topo-rail-card">
          <div class="card-head">
            <div><h2 class="card-title">${esc(L('最近变更', 'Recent changes'))}</h2><div class="card-sub">${esc(L('来自拓扑发现', 'From topology discovery'))}</div></div>
            <span class="status">${esc(L('自动', 'Auto'))}</span>
          </div>
          <div class="rail-body tight" id="topoRailChanges"><div class="topo-rail-empty">${esc(L('正在读取变更…', 'Loading changes…'))}</div></div>
        </section>
      </aside>
    </div>`;
    $('topoZoomIn').onclick = () => zoomAt(1.08);
    $('topoZoomOut').onclick = () => zoomAt(1 / 1.08);
    $('topoFit').onclick = () => { fitView(); draw(); };
    $('topoDir').onclick = () => {
      direction = direction === 'tb' ? 'lr' : 'tb';
      $('topoDir').innerHTML = direction === 'tb' ? '↕ ' + esc(L('上下', 'Vertical')) : '↔ ' + esc(L('左右', 'Horizontal'));
      const st = $('topoStage'); if (st) delete st.dataset.centered;
      buildLayout(); fitView(); draw();
    };
    if ($('topoAdd')) $('topoAdd').onclick = () => openEditor(null);
    if ($('topoDelete')) $('topoDelete').onclick = () => deleteSelected();
    if ($('topoIpAll')) $('topoIpAll').onclick = () => openRatePicker();
    /* 按钮角标显示已开启测速的设备数 */
    syncIpAllSwitch = function () {
      const el = $('topoIpAllCount'); if (!el || !data) return;
      const on = allNodes().filter((n) => n.ipRate && !n.deleted).length;
      el.textContent = String(on);
      el.classList.toggle('zero', on === 0);
    };
    syncIpAllSwitch();
    /* 供「IP 流量监控」页跳转过来直接编辑指定节点 */
    window.openTopologyEditorById = (id) => { const n = map.get(String(id || '')); if (n) openEditor(n); };
    $('topoRefresh').onclick = () => load(true);
    $('topoDhcpBtn').onclick = () => openLeaseDrawer();
    $('topoDhcpClose').onclick = closeLeaseDrawer;
    $('topoDhcpBackdrop').onclick = closeLeaseDrawer;
    $('topoDhcpSearch').oninput = () => renderLeaseList();
    $('topoDhcpOpenPage').onclick = () => { closeLeaseDrawer(); navigate('dhcpLeases'); };
    document.querySelectorAll('#topoTabs [data-topo-tab]').forEach((btn) => {
      btn.onclick = () => showTopoTab(btn.dataset.topoTab);
    });
    const stage = $('topoStage');
    if (data && data.deviceId === currentDeviceId() && stage.dataset.loaded === '1') {
      buildLayout(); fitView(); draw(); syncDhcpChrome(); startLeasePolling(); showTopoTab(topoTab); return;
    }
    load(false);
  };

  function showTopoTab(name) {
    topoTab = name === 'links' ? 'links' : 'map';
    document.querySelectorAll('#topoTabs [data-topo-tab]').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.topoTab === topoTab);
      btn.setAttribute('aria-selected', btn.dataset.topoTab === topoTab ? 'true' : 'false');
    });
    document.querySelectorAll('.topo-tab-panel[data-topo-panel]').forEach((panel) => {
      panel.classList.toggle('on', panel.dataset.topoPanel === topoTab);
    });
    if (topoTab === 'links') closeLeaseDrawer();
    else {
      applyView($('topoStage') && $('topoStage').querySelector('svg'));
      renderLinkTable();
    }
  }

  function linkData() {
    return nodes
      .filter((n) => n.parent && map.has(n.parent))
      .map((child) => ({ child, parent: map.get(child.parent), lease: leaseForNode(child) }));
  }

  function updateFilterChips() { /* 旧筛选器已移除：拓扑始终展示全部节点 */ }

  function leaseRailState(lease) {
    if (!lease) return 'unmatched';
    return lease.status === 'bound' ? 'bound' : lease.status === 'waiting' ? 'waiting' : 'other';
  }

  function renderLinkTable() {
    const tbody = $('topoLinkRows'); if (!tbody) return;
    const rows = linkData();
    const foot = $('topoLinkFoot');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="topo-link-empty">${esc(L('尚未发现链路，重新发现或添加设备后显示。', 'No links discovered yet. Rediscover or add a device.'))}</td></tr>`;
      if (foot) foot.textContent = L('0 条链路', '0 links');
      return;
    }
    const scrollBox = tbody.closest('.table-scroll');
    const keepTop = scrollBox ? scrollBox.scrollTop : 0;
    const keepLeft = scrollBox ? scrollBox.scrollLeft : 0;
    tbody.innerHTML = rows.map(({ child, parent, lease }) => {
      const r = effectiveRate(child.id);
      const has = !!(r && (r.rxBps || r.txBps));
      const state = leaseRailState(lease);
      const stateLabel = lease ? leaseStatusLabel(lease.status) : L('未匹配', 'Unmatched');
      return `<tr data-node="${esc(child.id)}">
        <td><div class="topo-link-pair"><b>${esc(parent.name)}</b><span>→</span><b>${esc(child.name)}</b></div></td>
        <td><div class="topo-link-meta"><span>${esc(child.parentPort || child.iface || '—')}</span><small>${esc(typeLabel(parent.type))} → ${esc(typeLabel(child.type))} · ${esc(linkTypeLabel(linkTypeOf(child)))}</small></div></td>
        <td class="r"><div class="cell-num"><b data-link-rate="${esc(child.id)}">${has ? '↓ ' + fmtRate(r.rxBps) : '—'}</b><small data-link-up="${esc(child.id)}">${has ? '↑ ' + fmtRate(r.txBps) : ''}</small></div></td>
        <td><span class="topo-link-status ${state}"><i></i>${esc(stateLabel)}</span></td>
        <td class="topo-link-act"><button class="topo-locate" type="button" aria-label="${esc(L('定位节点', 'Locate node'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button></td>
      </tr>`;
    }).join('');
    if (scrollBox) { scrollBox.scrollTop = keepTop; scrollBox.scrollLeft = keepLeft; }
    tbody.querySelectorAll('tr[data-node]').forEach((tr) => {
      tr.onclick = () => {
        showTopoTab('map');
        focusNode(tr.dataset.node);
      };
    });
    if (foot) foot.textContent = L(`显示 ${rows.length} 条链路`, `${rows.length} links`);
  }

  function renderRail(stats) {
    const nodesNow = nodes;
    const links = linkData();
    const boundNodes = nodesNow.filter((n) => { const l = leaseForNode(n); return l && l.status === 'bound'; }).length;
    const waitingNodes = nodesNow.filter((n) => { const l = leaseForNode(n); return l && l.status === 'waiting'; }).length;
    const matchedNodes = nodesNow.filter((n) => !!leaseForNode(n)).length;
    const roleRows = ['router', 'switch', 'ap', 'nas', 'client', 'other'].map((type) => ({
      type, count: nodesNow.filter((n) => n.type === type).length,
    })).filter((r) => r.count);
    const devBox = $('topoRailDevices');
    if (devBox) {
      /* 状态摘要：像设计稿一样用一句话串联，不再分列，也不加绿色底纹 */
      const unmatchedNodes = Math.max(0, nodesNow.length - matchedNodes);
      const notes = ((data && data.discovery) || {}).notes || [];
      const parts = [];
      if (!leaseError) parts.push(L('所有核心链路正常', 'All core links healthy'));
      else parts.push(L('租约刷新失败', 'Lease refresh failed'));
      if (waitingNodes) parts.push(L(`${waitingNodes} 台等待 DHCP 地址`, `${waitingNodes} waiting for DHCP`));
      if (unmatchedNodes) parts.push(L(`${unmatchedNodes} 台未匹配租约`, `${unmatchedNodes} unmatched leases`));
      if (notes.length) parts.push(L('部分自动发现不可用', 'Some discovery APIs unavailable'));
      const statusDot = leaseError ? 'red' : (waitingNodes || unmatchedNodes || notes.length) ? 'amber' : 'green';
      const sep = L('；', '; ');
      devBox.innerHTML = (roleRows.length
        ? roleRows.map(({ type, count }) => `<div class="kv"><span><i class="topo-type-dot lg-${type}"></i>${esc(typeLabel(type))}</span><b>${count} ${esc(L('台', ''))}</b></div>`).join('')
        : `<div class="topo-rail-empty">${esc(L('尚未发现设备', 'No devices discovered'))}</div>`)
        + `<div class="topo-rail-split"></div>
        <div class="kv"><span>${esc(L('已联动 DHCP', 'DHCP linked'))}</span><b>${matchedNodes} / ${nodesNow.length}</b></div>
        <div class="kv"><span>${esc(L('已绑定租约', 'Bound leases'))}</span><b>${boundNodes}</b></div>
        <div class="topo-dev-status">
          <div class="topo-dev-status-line"><span class="dot is-${statusDot}"></span>${esc(parts.join(sep) + L('。', '.'))}</div>
        </div>`;
    }
    const devBadge = $('topoRailDevBadge');
    if (devBadge) {
      devBadge.textContent = `${boundNodes} ${L('在线', 'online')}`;
      devBadge.className = `badge ${boundNodes ? 'allow' : 'neutral'}`;
    }
    renderQualityRail();
    renderChangesRail();
    paintTopoKpis();
  }

  function renderQualityRail() {
    const box = $('topoRailQuality'); if (!box) return;
    /* 与仪表盘系统状态卡完全一致：同一份 netwatch 探测数据、同样取前 3 条，不重复配置探针 */
    const rows = railQualityRows();
    const bad = rows.some((r) => r.state === 'bad');
    const warn = rows.some((r) => r.state === 'warn');
    const badge = $('topoRailQualityBadge');
    if (badge) {
      badge.textContent = !rows.length ? L('未探测', 'No probe') : bad ? L('异常', 'Degraded') : warn ? L('注意', 'Attention') : L('良好', 'Good');
      badge.className = `badge ${!rows.length ? 'neutral' : bad ? 'drop' : warn ? 'reject' : 'allow'}`;
    }
    if (!rows.length) {
      const err = quality && quality.error;
      box.innerHTML = `<div class="topo-rail-empty">${esc(err ? L('探测暂不可用：', 'Probe unavailable: ') + err : L('尚未配置探测目标。配置后将显示延迟、抖动与丢包。', 'No probe targets yet. Configure them to see latency, jitter and loss.'))}</div>
        <button class="btn btn-sm topo-rail-btn" type="button" id="topoRailProbeCfg"><span>${esc(L('配置探测目标', 'Configure targets'))}</span><span>→</span></button>`;
      const cfg = $('topoRailProbeCfg');
      if (cfg) cfg.onclick = openQualitySettings;
      return;
    }
    const src = rows.some((r) => r.source === 'netwatch') ? 'Netwatch' : 'ICMP';
    const qs = topoQualityPrefs();
    const qScore = (r) => {
      const ms = qualityNum(r.avg);
      if (ms == null) return 0;
      const base = qs.critical || 260;
      return Math.max(6, Math.min(100, 100 - ms / base * 100));
    };
    const qTone = (r) => (r.state === 'bad' ? 'red' : r.state === 'warn' ? 'amber' : 'accent');
    const lossAvg = qualityAvg('loss');
    const jitterAvg = qualityAvg('jitter');
    box.innerHTML = `<div class="health">
        ${rows.map((r) => `<div class="health-row" title="${esc((r.label ? r.label + ' · ' : '') + r.host)}">
          <span>${esc(r.label || r.host)}</span>
          <span class="bar" style="background:${qTone(r) === 'accent' ? 'var(--v2-surface-3)' : `var(--v2-${qTone(r)}-soft)`}"><i style="width:${qScore(r).toFixed(0)}%;background:var(--v2-${qTone(r)})"></i></span>
          <b>${qLatencyText(r)}</b>
        </div>`).join('')}
      </div>
      <div class="hairline"></div>
      <div class="kv"><span>${esc(L('丢包率', 'Packet loss'))}</span><b>${lossAvg == null ? '—' : lossAvg.toFixed(1) + '%'}</b></div>
      <div class="kv"><span>${esc(L('抖动', 'Jitter'))}</span><b>${jitterAvg == null ? '—' : jitterAvg.toFixed(1) + ' ms'}</b></div>
      <div class="topo-qfoot"><span>${esc(src)} · ${rows.length} ${esc(L('个探测目标', 'probe targets'))}</span>${state.authRole === 'read' ? '' : `<button class="topo-quality-cfg" type="button" id="topoQualityCfg">${esc(L('配置', 'Configure'))}</button>`}</div>`;
    const cfg = $('topoQualityCfg');
    if (cfg) cfg.onclick = openQualitySettings;
  }

  function renderChangesRail() {
    const box = $('topoRailChanges'); if (!box) return;
    const notes = (data && data.discovery && data.discovery.notes) || [];
    const recent = leaseRows.slice()
      .filter((l) => l.status === 'bound' || l.status === 'waiting')
      .sort((a, b) => parseSeenSec(a.lastSeen) - parseSeenSec(b.lastSeen))
      .slice(0, 3);
    const items = recent.map((l) => {
      const bound = l.status === 'bound';
      const name = l.hostname || l.address || L('未知终端', 'Unknown device');
      const seen = l.lastSeen ? L(`${l.lastSeen} 前`, `${l.lastSeen} ago`) : L('刚刚同步', 'just synced');
      const color = bound ? 'var(--v2-green)' : 'var(--v2-amber)';
      const soft = bound ? 'var(--v2-green-soft)' : 'var(--v2-amber-soft)';
      const title = bound ? L('新设备接入：', 'New device: ') + name : L('等待地址：', 'Waiting for address: ') + name;
      return `<div class="tl-item"><span class="tl-dot" style="background:${color};box-shadow:0 0 0 3px ${soft}"></span>
        <div><b>${esc(title)}</b>
        <small>${esc((l.address || '—') + ' · ' + (l.server || 'DHCP') + ' · ' + seen)}</small></div></div>`;
    });
    if (!items.length) {
      const custom = (data && data.custom || []).filter((n) => !n.deleted).slice(-3).reverse();
      custom.forEach((n) => items.push(`<div class="tl-item"><span class="tl-dot"></span><div><b>${esc(L('新设备接入：', 'New device: ') + (n.name || n.id))}</b><small>${esc((n.ip || L('手动节点', 'Manual node')) + ' · ' + (n.type ? typeLabel(n.type) : ''))}</small></div></div>`));
    }
    if (!items.length) {
      const counts = (data && data.discovery && data.discovery.counts) || {};
      items.push(`<div class="tl-item"><span class="tl-dot"></span><div><b>${esc(L('自动发现运行中', 'Auto discovery is running'))}</b><small>${esc(L(`已发现 ${Number(counts.neighbors) || 0} 个邻居 · 等待 DHCP 租约`, `${Number(counts.neighbors) || 0} neighbors discovered · waiting for leases`))}</small></div></div>`);
    }
    if (notes.length) items.push(`<div class="tl-item"><span class="tl-dot" style="background:var(--v2-amber);box-shadow:0 0 0 3px var(--v2-amber-soft)"></span><div><b>${esc(L('部分发现接口不可用', 'Some discovery APIs unavailable'))}</b><small>${esc(notes.join('; '))}</small></div></div>`);
    box.innerHTML = `<div class="timeline">${items.join('')}</div>`;
  }

  async function refreshQuality(force) {
    if (!data || qualityBusy) return;
    if (!force && Date.now() - qualityAt < QUALITY_TTL_MS) return;
    qualityBusy = true;
    try {
      const qs = qualityTargetQuery();
      const r = await api('/api/link-quality?mode=netwatch&device=' + encodeURIComponent(currentDeviceId()) + (qs ? '&targets=' + qs : ''));
      quality = r || null;
      qualityAt = Date.now();
      if (quality && !quality.rows) quality.rows = [];
      renderQualityRail();
      paintTopoKpis();
    } catch (e) {
      quality = { rows: [], error: e.message };
      qualityAt = Date.now();
      renderQualityRail();
      paintTopoKpis();
    } finally { qualityBusy = false; }
  }

  async function load(force) {
    const stage = $('topoStage'); if (!stage || loading) return;
    loading = true;
    if (force || !data) stage.innerHTML = '<div class="topo-empty">' + esc(L('正在加载拓扑…', 'Loading topology…')) + '</div>';
    try {
      data = await api('/api/topology');
      if (qualityDevice !== currentDeviceId()) { quality = null; qualityAt = 0; qualityDevice = currentDeviceId(); }
      stage.dataset.loaded = '1';
      setLeaseRows(data.leases || []);
      leaseAt = Date.now();
      buildLayout(); fitView(); draw(); startRates(); syncIpAllSwitch();
      syncDhcpChrome(); startLeasePolling();
      refreshQuality(false);
      if (!qualityTimer) qualityTimer = setInterval(() => {
        if (document.body.classList.contains('topology-page') && data) refreshQuality(false);
      }, 60000);
    } catch (e) {
      stage.innerHTML = '<div class="topo-empty">' + esc(L('拓扑加载失败：', 'Topology load failed: ') + e.message) + '</div>';
    } finally { loading = false; }
  }

  function allNodes() {
    const customList = (data && data.custom) || [];
    const hidden = new Set(customList.filter((n) => n.deleted).map((n) => n.id));
    const map = new Map();
    for (const n of (data && data.auto) || []) if (!hidden.has(n.id)) map.set(n.id, { ...n, auto: true });
    for (const n of customList) if (!n.deleted) map.set(n.id, { ...n, auto: false });
    return [...map.values()];
  }

  let nodes = [], map = new Map(), levels = [], pos = new Map();
  /* 唯一的拖动约束：不与其它设备卡片重叠。层级由 parent 决定，位置可自由摆放 */
  function spotFree(n, x, y) {
    for (const other of nodes) {
      if (other.id === n.id) continue;
      const op = pos.get(other.id); if (!op) continue;
      if (Math.abs(op.x - x) < NODE_W + 12 && Math.abs(op.y - y) < NODE_H + 12) return false;
    }
    return true;
  }
  const clampPos = (x, y) => ({
    x: Math.max(NODE_W / 2 + 8, Math.min(baseW - NODE_W / 2 - 8, x)),
    y: Math.max(NODE_H / 2 + 8, Math.min(baseH - NODE_H / 2 - 8, y)),
  });
  function buildLayout() {
    nodes = allNodes();
    map = new Map(nodes.map((n) => [n.id, n]));
    const depthOf = new Map();
    const resolve = (n, seen) => {
      if (depthOf.has(n.id)) return depthOf.get(n.id);
      if (!n.parent || !map.has(n.parent) || seen.has(n.id)) { depthOf.set(n.id, 0); return 0; }
      seen.add(n.id);
      const d = resolve(map.get(n.parent), seen) + 1;
      depthOf.set(n.id, d);
      return d;
    };
    const originalIndex = new Map(nodes.map((n, i) => [n.id, i]));
    levels = [];
    for (const n of nodes) {
      const d = Math.min(resolve(n, new Set()), 12);
      (levels[d] || (levels[d] = [])).push(n);
    }
    /* 每层按用户填写的「本层排序」（从 1 开始）排列，未填写的保持发现顺序在后 */
    levels.forEach((arr) => {
      if (!arr) return;
      arr.sort((a, b) => {
        const ao = Number(a.order) || 0, bo = Number(b.order) || 0;
        if (ao !== bo) return (ao || 9999) - (bo || 9999);
        return (originalIndex.get(a.id) || 0) - (originalIndex.get(b.id) || 0);
      });
    });
    let maxRow = 1; levels.forEach((a) => { if (a) maxRow = Math.max(maxRow, a.length); });
    /* 上下：同层横排、跨层纵向；左右：最上级在左、下级在右、同层竖排一列。
       单层设备过多时换行，保证节点卡片和文字不被压得过小。 */
    const maxPerRow = direction === 'tb'
      ? (maxRow <= 4 ? 2 : maxRow <= 6 ? 3 : 4)
      : (maxRow <= 3 ? 3 : maxRow <= 5 ? 4 : 5);
    let bandCount = 0;
    levels.forEach((arr) => { if (arr && arr.length) bandCount += Math.ceil(arr.length / maxPerRow); });
    const crossStep = direction === 'tb' ? NODE_W + GAP : NODE_H + GAP;
    const crossSize = Math.max(direction === 'tb' ? 760 : 640, Math.min(maxRow, maxPerRow) * crossStep + 96);
    const stage = $('topoStage');
    const stageW = Math.max(320, (stage && stage.clientWidth) || 1000);
    const narrow = stageW < 560;
    layoutStageW = stageW;
    const minDepth = direction === 'tb'
      ? NODE_H + Math.max(0, bandCount - 1) * (NODE_H + 46) + 96
      : NODE_W + Math.max(0, bandCount - 1) * (NODE_W + 64) + 112;
    const designDepth = direction === 'tb' ? Math.max(minDepth, crossSize / 1.4) : Math.max(minDepth, crossSize * 1.4);
    baseW = direction === 'tb' ? crossSize : designDepth;
    baseH = direction === 'tb' ? designDepth : crossSize;
    stage.classList.toggle('narrow', narrow);
    const swipeHint = $('topoSwipeHint');
    if (swipeHint) swipeHint.hidden = !narrow;
    pos = new Map();
    let band = 0;
    levels.forEach((arr) => {
      if (!arr || !arr.length) return;
      const nodeCross = direction === 'tb' ? NODE_W : NODE_H;
      const rows = Math.ceil(arr.length / maxPerRow);
      for (let r = 0; r < rows; r++) {
        const chunk = arr.slice(r * maxPerRow, (r + 1) * maxPerRow);
        const rowSize = (chunk.length - 1) * crossStep + nodeCross;
        const start = (crossSize - rowSize) / 2 + nodeCross / 2;
        const b = band + r;
        const depth = direction === 'tb'
          ? (bandCount === 1 ? baseH / 2 : 48 + NODE_H / 2 + b * (baseH - 96 - NODE_H) / (bandCount - 1))
          : (bandCount === 1 ? baseW / 2 : 56 + NODE_W / 2 + b * (baseW - 112 - NODE_W) / (bandCount - 1));
        chunk.forEach((n, i) => {
          const cross = start + i * crossStep;
          pos.set(n.id, direction === 'tb' ? { x: cross, y: depth } : { x: depth, y: cross });
        });
      }
      band += rows;
    });
    /* 手动拖动的绝对坐标：与其它节点（含同样手动定位的节点）不重叠即可沿用 */
    const autoPos = new Map(pos);
    const saved = new Map();
    for (const n of nodes) {
      const sx = Number(n.x), sy = Number(n.y);
      if (sx && sy) saved.set(n.id, clampPos(sx, sy));
    }
    for (const [id, p] of saved) {
      let ok = true;
      for (const [otherId, auto] of autoPos) {
        if (otherId === id) continue;
        const op = saved.has(otherId) ? saved.get(otherId) : auto;
        if (Math.abs(op.x - p.x) < NODE_W + 12 && Math.abs(op.y - p.y) < NODE_H + 12) { ok = false; break; }
      }
      if (ok) pos.set(id, p);
    }
  }

  function fitView() { zoom = 1; panX = 0; panY = 0; }
  function applyView(svg) {
    if (!svg) return;
    svg.setAttribute('viewBox', `${panX} ${panY} ${baseW / zoom} ${baseH / zoom}`);
    const label = $('topoZoomLabel'); if (label) label.textContent = Math.round(zoom * 100) + '%';
  }
  function zoomAt(factor, cx, cy) {
    const next = Math.max(.25, Math.min(5, zoom * factor));
    const k = next / zoom;
    const fx = cx == null ? baseW / 2 : cx, fy = cy == null ? baseH / 2 : cy;
    panX = fx - (fx - panX) / k; panY = fy - (fy - panY) / k;
    zoom = next;
    applyView($('topoStage') && $('topoStage').querySelector('svg'));
  }

  function svgPoint(svg, clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: panX + (clientX - r.left) / r.width * (baseW / zoom), y: panY + (clientY - r.top) / r.height * (baseH / zoom) };
  }

  function portAnchor(parent, portIndex, total) {
    const p = pos.get(parent.id); if (!p) return null;
    const offset = (i) => (i - (total - 1) / 2) * (PORT_W + 7);
    const t = portIndex < 0 ? 0 : offset(portIndex);
    return direction === 'tb'
      ? { x: p.x + t, y: p.y + NODE_H / 2 + 16 + PORT_H }
      : { x: p.x + NODE_W / 2 + 16 + PORT_H, y: p.y + t };
  }

  function edgeOf(n, side) {
    const p = pos.get(n.id);
    if (direction === 'tb') return { x: p.x, y: p.y + (side === 'bottom' ? NODE_H / 2 : -NODE_H / 2) };
    return { x: p.x + (side === 'bottom' ? NODE_W / 2 : -NODE_W / 2), y: p.y };
  }

  function curve(a, b) {
    /* 连线形状只由两端实际坐标决定；上下/左右按钮只改变布局，不改连线规则 */
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (dy >= dx) {
      const mid = (a.y + b.y) / 2;
      return `M${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`;
    }
    const mid = (a.x + b.x) / 2;
    return `M${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
  }

  const zeroRate = { rxBps: 0, txBps: 0 };
  function isDescendantOf(childId, ancestorId) {
    let cur = map.get(childId); const guard = new Set();
    while (cur && cur.parent && !guard.has(cur.id)) {
      guard.add(cur.id);
      if (cur.parent === ancestorId) return true;
      cur = map.get(cur.parent);
    }
    return false;
  }
  function descendantsOf(id) {
    const out = [], visited = new Set();
    const walk = (pid, depth) => {
      for (const c of nodes) {
        if (c.parent !== pid || c.id === id || visited.has(c.id)) continue;
        visited.add(c.id); out.push({ node: c, depth }); walk(c.id, depth + 1);
      }
    };
    walk(id, 0);
    return out;
  }

  /* 速率来源优先级：① 节点开启的按 IP 测速（连接表聚合）② 关联接口 ③ 上级端口 */
  function directRate(n) {
    if (n && n.ipRate) {
      /* 已开启按 IP 测速就只用连接表数据。采集失败时显示 0，
         绝不回退到接口总速率 —— 否则所有设备都会显示同一串数字，掩盖问题。
         双栈节点按 MAC 聚合了多个 IP，服务端把汇总写在主地址并以 id 标识，优先按 id 取。 */
      return ipRates.get('id:' + n.id) || ipRates.get(String(n.ip || '').trim()) || zeroRate;
    }
    for (const key of [n.iface, n.parentPort]) {
      const k = String(key || '').trim(); if (!k) continue;
      const r = rates.get(k);
      if (r && (r.rxBps || r.txBps)) return r;
    }
    return zeroRate;
  }

  /* 计算模式：节点可多选若干下级设备，取其速率之和；嵌套自动去重，避免重复计数 */
  function effectiveRate(id, seen) {
    seen = seen || new Set();
    if (seen.has(id)) return zeroRate;
    seen.add(id);
    const n = map.get(id); if (!n) return zeroRate;
    const calc = (Array.isArray(n.calcFrom) ? n.calcFrom : []).filter((x) => map.has(x));
    if (!calc.length) return directRate(n);
    const keep = calc.filter((a) => !calc.some((b) => b !== a && isDescendantOf(a, b)));
    let rxBps = 0, txBps = 0;
    for (const cid of keep) {
      const r = effectiveRate(cid, new Set(seen));
      rxBps += r.rxBps; txBps += r.txBps;
    }
    return { rxBps, txBps };
  }

  /* 灯光强度：空闲 ~0.10（微微一束），有流量按对数映射到 0.42~1.0，
     把常见 10Kbps~100Mbps 区间拉满整段，强弱变化一眼可见 */
  function lightIntensity(rate) {
    const bps = Math.max(Number(rate && rate.rxBps) || 0, Number(rate && rate.txBps) || 0);
    if (bps < 4000) return 0.10;
    const norm = Math.min(1, Math.max(0, (Math.log10(bps) - 4) / 4)); // 10^4 ~ 10^8 bps
    return Math.round((0.42 + norm * 0.58) * 100) / 100;
  }

  function flowDuration(id) {
    /* 只取该节点的下行速率，并按对数比例映射到 3.6s~0.45s */
    const bps = effectiveRate(id).rxBps;
    if (bps < 8000) return 0;
    const dur = 3.6 - (Math.log10(bps) - 4) * 0.9;
    return Math.max(0.45, Math.min(3.6, dur));
  }

  function draw() {
    const stage = $('topoStage'); if (!stage || !data || !pos.size) return;
    const links = [], nodeHtml = [];
    for (const n of nodes) {
      const parent = n.parent && map.get(n.parent);
      if (!parent || !pos.has(n.id)) continue;
      const from = edgeOf(parent, 'bottom');
      const to = edgeOf(n, 'top');
      /* 涌动速度取决于本条链路的下级设备下行速率；上级设备后加也不影响 */
      const dur = flowDuration(n.id);
      const d = curve(from, to);
      /* 物理链路=蓝色实线、无线链路=紫色虚线、代理隧道=棕黄虚线（与图例 / 编辑选项一致） */
      const lt = linkTypeOf(n, parent);
      const linkCls = lt === 'tunnel' ? 'lnk-tunnel' : lt === 'wireless' ? 'lnk-wireless' : 'lnk-physical';
      links.push(`<path class="topo-link ${linkCls}${dur ? ' flowing' : ''}" data-from="${esc(parent.id)}" data-to="${esc(n.id)}" style="--flow-dur:${dur || 2}s" d="${d}"/>`);
      links.push(`<path class="topo-flow ${linkCls}${dur ? ' flowing' : ''}" data-to="${esc(n.id)}" style="--flow-dur:${dur || 2}s" d="${d}"/>`);
    }
    for (const n of nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const name = fitNodeName(n.name);
      /* icon 等比略放大：26 → 32，垂直居中，不拉伸 */
      const ix = -NODE_W / 2 + (ICON_W - ICON_SZ) / 2, iy = -ICON_SZ / 2;
      const icon = n.icon
        ? `<image class="topo-icon-img" href="${esc(n.icon)}" x="${ix}" y="${iy}" width="${ICON_SZ}" height="${ICON_SZ}" preserveAspectRatio="xMidYMid meet" clip-path="url(#topoIconClip)"/>`
        : `<rect class="topo-icon-bg type-${esc(n.type)}" x="${ix}" y="${iy}" width="${ICON_SZ}" height="${ICON_SZ}" rx="7"/><svg class="topo-icon-sym" x="${ix + 8}" y="${iy + 8}" width="${ICON_SZ - 16}" height="${ICON_SZ - 16}" viewBox="0 0 24 24"><use href="#${TYPE_ICON[n.type] || TYPE_ICON.other}"/></svg>`;
      const rate = effectiveRate(n.id);
      const hasRate = !!(rate.rxBps || rate.txBps);
      const upText = hasRate ? '↑' + fmtRate(rate.txBps) : '';
      const downText = hasRate ? '↓' + fmtRate(rate.rxBps) : '';
      /* 空闲标签始终渲染，由 paintRates() 按实时速率切换显隐（避免首次渲染后不再更新） */
      /* 速率段范围 x∈[NODE_W/2-RATE_W-2, NODE_W/2]，段中心 = NODE_W/2-RATE_W/2-1 */
      const rateMid = NODE_W / 2 - RATE_W / 2 - 1;
      const idleLabel = `<g class="topo-idle" style="display:${hasRate ? 'none' : ''}"><rect x="${rateMid - 14}" y="-8" width="28" height="16" rx="8"/><text x="${rateMid}" y="3" text-anchor="middle">${esc(L('空闲', 'Idle'))}</text></g>`;
      const cx = (-NODE_W / 2 + ICON_W) + (NODE_W - ICON_W - RATE_W) / 2;
      /* 类型色灯光：手电筒式——顶点在卡片顶部内侧、icon 水平中心，向下扩散到 icon 上方、
         底边宽度与 icon 一致；强度按实时速率在 paintRates() 里更新。 */
      const lightApexX = ix + ICON_SZ / 2, lightTop = -NODE_H / 2 + 1, lightBottom = -ICON_SZ / 2 + 1;
      const light = `<path class="topo-light" d="M ${lightApexX} ${lightTop} L ${lightApexX + ICON_SZ / 2} ${lightBottom} L ${lightApexX - ICON_SZ / 2} ${lightBottom} Z" fill="url(#topoLight-${esc(n.type)})" opacity="${lightIntensity(rate)}"/>`;
      const mac = String(n.mac || '').toUpperCase().slice(0, 15) || typeLabel(n.type);
      nodeHtml.push(`<g class="topo-node type-${esc(n.type)} ${n.auto ? 'auto' : 'custom'}${selectedId === n.id ? ' selected' : ''}" data-id="${esc(n.id)}" transform="translate(${p.x},${p.y})">
        <rect class="node-card type-${esc(n.type)}" x="${-NODE_W / 2}" y="${-NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="10"/>
        ${light}
        ${icon}
        <rect class="topo-rate-divider" x="${NODE_W / 2 - RATE_W - 2}" y="${-NODE_H / 2 + 10}" width="1" height="${NODE_H - 20}"/>
        <text class="topo-name" x="${cx}" y="-16" text-anchor="middle">${esc(name)}</text>
        <text class="topo-sub" x="${cx}" y="-2" text-anchor="middle">${esc(String(n.ip || typeLabel(n.type)).slice(0, 12))}</text>
        <text class="topo-mac" x="${cx}" y="14" text-anchor="middle">${esc(mac)}</text>
        <text class="topo-rate up" x="${NODE_W / 2 - 7}" y="-12" text-anchor="end">${esc(upText)}</text>
        <text class="topo-rate down" x="${NODE_W / 2 - 7}" y="16" text-anchor="end">${esc(downText)}</text>
        ${idleLabel}
        <circle class="topo-dhcp-dot" cx="${-NODE_W / 2 + 9}" cy="${-NODE_H / 2 + 9}" r="4"/>
      </g>`);
    }
    const svg = `<svg class="topo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="topoIconClip"><rect x="${-NODE_W / 2 + (ICON_W - ICON_SZ) / 2}" y="${-ICON_SZ / 2}" width="${ICON_SZ}" height="${ICON_SZ}" rx="7"/></clipPath>
        ${TYPES.map((tp) => `<linearGradient id="topoLight-${tp}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class="light-stop-${tp}" stop-opacity="1"/>
          <stop offset="55%" class="light-stop-${tp}" stop-opacity=".6"/>
          <stop offset="100%" class="light-stop-${tp}" stop-opacity="0"/>
        </linearGradient>`).join('')}
      </defs>
      <g class="topo-layer-links">${links.join('')}</g>
      <g class="topo-layer-nodes">${nodeHtml.join('')}</g>
    </svg>`;
    stage.innerHTML = svg;
    applyView(stage.querySelector('svg'));
    bindSvg(stage.querySelector('svg'));
    paintLeaseDots();
    renderFoot();
    paintRates(); /* 重绘后立即回填速率，避免出现 2.5 秒空白 */
    if (stage.classList.contains('narrow') && stage.dataset.centered !== '1') {
      stage.dataset.centered = '1';
      requestAnimationFrame(() => { stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2); });
    }
  }

  function renderFoot() {
    const meta = $('topoMeta'), legendBox = $('topoLegend'); if (!meta || !data) return;
    const sel = selectedId && map.get(selectedId);
    const counts = (data.discovery || {}).counts || {};
    const stats = leaseStats();
    const links = linkData();
    const boundNodes = nodes.filter((n) => { const l = leaseForNode(n); return l && l.status === 'bound'; }).length;
    const waitingNodes = nodes.filter((n) => { const l = leaseForNode(n); return l && l.status === 'waiting'; }).length;
    const matchedNodes = nodes.filter((n) => !!leaseForNode(n)).length;
    const notes = (data.discovery || {}).notes || [];
    const customCount = (data.custom || []).filter((n) => !n.deleted).length;
    const typeCount = {}, catCount = { client: 0, ap: 0, node: 0 }, linkTypeCount = { physical: 0, wireless: 0, tunnel: 0 };
    for (const n of nodes) {
      typeCount[n.type] = (typeCount[n.type] || 0) + 1;
      catCount[categoryOf(n)]++;
      if (n.parent) linkTypeCount[linkTypeOf(n)]++;
    }
    let legend = `<span class="lk-phys"><i></i>${esc(L('物理链路', 'Physical'))}</span><span class="lk-wifi"><i></i>${esc(L('无线链路', 'Wireless'))}</span><span class="lk-tunnel"><i></i>${esc(L('代理隧道', 'Proxy tunnel'))}</span>`;
    /* 设备类型图例：8 类全部列出，色块与射灯 / icon 配色一致 */
    const devLegend = TYPES.map((tp) => `<span class="dev-cat lg-${tp}" title="${esc(typeLabel(tp))}"><i></i>${esc(typeLabel(tp))}</span>`).join('');
    legend += `<span class="topo-legend-sep"></span>${devLegend}`;
    if (leaseRows.length) legend += `<span class="lg-dhcp" title="${esc(L('DHCP 已绑定租约', 'Bound DHCP lease'))}"><i></i>${esc(L('已绑定', 'Bound'))}</span><span class="lg-dhcp wait" title="${esc(L('DHCP 等待租约', 'Waiting DHCP lease'))}"><i></i>${esc(L('等待', 'Waiting'))}</span>`;
    if (legendBox) legendBox.innerHTML = legend;
    meta.innerHTML = `<span><b>${nodes.length}</b> ${esc(L('台设备', 'devices'))}</span>
      <span><b>${links.length}</b> ${esc(L('条链路', 'links'))}</span>
      <span>${esc(L('DHCP 在线', 'DHCP online'))} <b>${stats.bound}</b></span>
      <span class="topo-meta-soft">${esc(L('自动发现', 'Discovered'))} ${Number(counts.neighbors) || 0} ${esc(L('邻居', 'neighbors'))} · ${customCount} ${esc(L('自定义', 'custom'))}</span>
      ${leaseError ? `<span class="topo-warn" title="${esc(leaseError)}">${esc(L('租约刷新失败', 'Lease refresh failed'))}</span>` : ''}
      ${notes.length ? `<span class="topo-warn" title="${esc(notes.join('; '))}">${esc(L('部分自动发现不可用', 'Some discovery unavailable'))}</span>` : ''}`;
    const footCount = $('topoFootCount');
    /* 统计条改为设备类型数量（终端 / AP / 节点），分类来自双击编辑弹窗 */
    if (footCount) footCount.textContent = L(`${catCount.client} 台终端 · ${catCount.ap} 个 AP · ${catCount.node} 个节点`, `${catCount.client} clients · ${catCount.ap} APs · ${catCount.node} nodes`);
    const cardStatus = $('topoCardStatus');
    if (cardStatus) {
      const warn = leaseError || notes.length;
      cardStatus.innerHTML = `<span class="dot ${warn ? 'is-amber' : 'is-green'}"></span>${warn ? esc(L('部分数据不可用', 'Partial data')) : esc(L('链路健康', 'Link health'))}`;
    }
    const mapCount = $('topoTabMapCount'); if (mapCount) mapCount.textContent = String(nodes.length);
    const linkCount = $('topoTabLinkCount'); if (linkCount) linkCount.textContent = String(links.length);
    const note = $('topoRefreshNote');
    if (note && leaseAt) note.textContent = L(`租约 ${Math.max(0, Math.round((Date.now() - leaseAt) / 1000))} 秒前`, `leases ${Math.max(0, Math.round((Date.now() - leaseAt) / 1000))}s ago`);
    window.__topoSummary = {
      total: nodes.length,
      links: links.length,
      custom: customCount,
      manualLinks: links.filter((l) => !l.child.auto).length,
      typeCount,
      categoryCount: catCount,
      linkTypes: linkTypeCount,
      boundNodes,
      waitingNodes,
      matchedNodes,
      updatedAt: Date.now(),
    };
    renderRail(stats);
    renderLinkTable();
  }

  function leaseMacKey(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^0-9a-f]/g, ''); }
  function leaseIpKey(v) { return String(v == null ? '' : v).trim().split('/')[0]; }

  function setLeaseRows(rows) {
    leaseRows = (Array.isArray(rows) ? rows : []).filter((l) => l && (l.address || l.mac || l['mac-address'])).map((l) => ({
      ...l,
      address: String(l.address || ''),
      mac: String(l.mac || l['mac-address'] || ''),
      status: String(l.status || 'unknown').toLowerCase(),
      hostname: String(l.hostname || l['host-name'] || ''),
      dynamic: l.dynamic === true || String(l.dynamic).toLowerCase() === 'true',
      disabled: l.disabled === true || String(l.disabled).toLowerCase() === 'true',
    }));
    leaseByMac = new Map(); leaseByIp = new Map();
    for (const l of leaseRows) {
      const mk = leaseMacKey(l.mac); if (mk) leaseByMac.set(mk, l);
      const ip = leaseIpKey(l.address); if (ip) leaseByIp.set(ip, l);
    }
  }

  function leaseForNode(n) {
    if (!n) return null;
    const mk = leaseMacKey(n.mac);
    if (mk && leaseByMac.has(mk)) return leaseByMac.get(mk);
    const ip = leaseIpKey(n.ip);
    return ip ? (leaseByIp.get(ip) || null) : null;
  }

  function leaseNode(l) {
    if (!l) return null;
    if (l.nodeId && map.has(l.nodeId)) return map.get(l.nodeId);
    const mk = leaseMacKey(l.mac), ip = leaseIpKey(l.address);
    for (const n of nodes) {
      if (mk && leaseMacKey(n.mac) === mk) return n;
      if (ip && leaseIpKey(n.ip) === ip) return n;
    }
    return null;
  }

  function leaseStatusLabel(s) {
    if (s === 'bound') return L('已绑定', 'Bound');
    if (s === 'waiting') return L('等待中', 'Waiting');
    if (s === 'busy') return L('使用中', 'Busy');
    if (s === 'expired') return L('已过期', 'Expired');
    return s || L('未知', 'Unknown');
  }

  function leaseStats() {
    const total = leaseRows.length;
    const bound = leaseRows.filter((l) => l.status === 'bound').length;
    const waiting = leaseRows.filter((l) => l.status === 'waiting').length;
    const matched = leaseRows.filter((l) => !!leaseNode(l)).length;
    return { total, bound, waiting, matched };
  }

  function leaseDotTitle(l) {
    return `${l.hostname || l.address || L('未知终端', 'Unknown')} · ${leaseStatusLabel(l.status)}${l.dynamic ? L(' · 动态', ' · dynamic') : L(' · 静态', ' · static')}${l.disabled ? L(' · 已禁用', ' · disabled') : ''}`;
  }

  function paintLeaseDots() {
    const stage = $('topoStage'); if (!stage) return;
    stage.querySelectorAll('.topo-node').forEach((g) => {
      const dot = g.querySelector('.topo-dhcp-dot'); if (!dot) return;
      const n = map.get(g.dataset.id);
      const l = leaseForNode(n);
      const cls = l ? (l.status === 'bound' ? 'bound' : l.status === 'waiting' ? 'waiting' : 'other') : '';
      dot.setAttribute('class', 'topo-dhcp-dot' + (cls ? ' ' + cls : ''));
      const dim = topoFilter !== 'all' && cls !== topoFilter && selectedId !== g.dataset.id;
      g.classList.toggle('filter-dim', dim);
      let title = dot.querySelector('title');
      if (!l) { if (title) title.remove(); return; }
      if (!title) { title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); dot.appendChild(title); }
      title.textContent = leaseDotTitle(l);
    });
    stage.querySelectorAll('.topo-link[data-to]').forEach((path) => {
      const l = leaseForNode(map.get(path.dataset.to));
      const cls = l ? (l.status === 'bound' ? 'bound' : l.status === 'waiting' ? 'waiting' : 'other') : '';
      const dim = topoFilter !== 'all' && cls !== topoFilter;
      path.classList.toggle('filter-dim', dim);
      const flow = path.nextElementSibling && path.nextElementSibling.classList.contains('topo-flow') ? path.nextElementSibling : null;
      if (flow) flow.classList.toggle('filter-dim', dim);
    });
  }

  function syncDhcpChrome() {
    const countEl = $('topoDhcpCount');
    const st = leaseStats();
    if (countEl) {
      countEl.textContent = String(st.bound);
      countEl.classList.toggle('zero', !st.bound);
    }
    paintLeaseDots();
    if (data) renderFoot();
    renderLeaseStats();
    renderLeaseList();
    window.__topoDhcp = { ...st, updatedAt: leaseAt, error: leaseError };
    if (typeof window.__v2TopoKpiRefresh === 'function') window.__v2TopoKpiRefresh();
  }

  function renderLeaseStats() {
    const box = $('topoDhcpStats'); if (!box) return;
    const st = leaseStats();
    box.innerHTML = `<span class="dhcp-stat"><i></i><b>${st.bound}</b> ${esc(L('已绑定', 'bound'))}</span>
      <span class="dhcp-stat waiting"><i></i><b>${st.waiting}</b> ${esc(L('等待', 'waiting'))}</span>
      <span class="dhcp-stat matched"><i></i><b>${st.matched}</b>/${st.total} ${esc(L('已匹配拓扑', 'in topology'))}</span>
      ${leaseError ? `<span class="topo-warn" title="${esc(leaseError)}">${esc(L('刷新失败', 'refresh failed'))}</span>` : ''}`;
  }

  function renderLeaseList() {
    const list = $('topoDhcpList'); if (!list) return;
    const input = $('topoDhcpSearch');
    const q = String(input && input.value || '').trim().toLowerCase();
    const rank = (s) => s === 'bound' ? 0 : s === 'waiting' ? 1 : 2;
    const rows = leaseRows.filter((l) => !q || [l.hostname, l.address, l.mac, l.server, l.comment].join(' ').toLowerCase().includes(q))
      .slice().sort((a, b) => rank(a.status) - rank(b.status) || String(a.address || '').localeCompare(String(b.address || ''), 'en', { numeric: true }));
    if (!rows.length) {
      list.innerHTML = `<div class="dhcp-empty"><b>${esc(leaseRows.length ? L('没有匹配的租约', 'No matching lease') : L('暂无 DHCP 租约', 'No DHCP leases yet'))}</b><span>${esc(leaseError || (leaseRows.length ? L('换个关键词试试', 'Try another keyword') : L('可在「DHCP 与 DNS → DHCP 租约」中查看完整列表', 'Full list lives in DHCP & DNS → Leases')))}</span></div>`;
      return;
    }
    list.innerHTML = rows.map((l) => {
      const n = leaseNode(l);
      const cls = l.status === 'bound' ? 'bound' : l.status === 'waiting' ? 'waiting' : 'other';
      const status = leaseStatusLabel(l.status) + (l.disabled ? L(' · 已禁用', ' · disabled') : '');
      return `<button class="dhcp-row ${cls}${n && selectedId === n.id ? ' active' : ''}" type="button" data-node="${esc(n ? n.id : '')}" title="${esc([l.hostname || l.address, l.address, l.mac, status, l.server, l.comment, l.expires ? L('剩余 ', 'left ') + l.expires : ''].filter(Boolean).join(' · '))}">
        <span class="dhcp-dot"></span>
        <span class="dhcp-main"><b>${esc(l.hostname || l.address || L('未知终端', 'Unknown device'))}</b>
          <span>${esc(l.address || '—')}${l.mac ? ' · ' + esc(l.mac) : ''}${l.server ? ' · ' + esc(l.server) : ''}</span></span>
        <span class="dhcp-side"><em class="${n ? 'on' : ''}">${esc(n ? L('已联动', 'Linked') : L('未匹配', 'Unmatched'))}</em>
          <small>${esc(status)}${l.dynamic ? L(' · 动态', ' · DHCP') : L(' · 静态', ' · Static')}</small></span>
      </button>`;
    }).join('');
    list.querySelectorAll('.dhcp-row').forEach((row) => {
      row.onclick = () => {
        const nid = row.dataset.node;
        if (!nid) { toast(L('该租约尚未出现在拓扑中，可检查过滤条件或重新发现', 'This lease is not on the topology yet. Check filters or rediscover.'), 'warn'); return; }
        closeLeaseDrawer();
        focusNode(nid);
      };
    });
  }

  function openLeaseDrawer() {
    const drawer = $('topoDhcpDrawer'), backdrop = $('topoDhcpBackdrop');
    if (!drawer) return;
    if (topoTab !== 'map') showTopoTab('map');
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    const btn = $('topoDhcpBtn'); if (btn) btn.setAttribute('aria-expanded', 'true');
    renderLeaseStats(); renderLeaseList();
    refreshLeases(false);
    if (window.innerWidth > 720) {
      const inp = $('topoDhcpSearch');
      setTimeout(() => { if (inp && drawer && !drawer.hidden) inp.focus(); }, 30);
    }
  }

  function closeLeaseDrawer() {
    const drawer = $('topoDhcpDrawer'), backdrop = $('topoDhcpBackdrop');
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    const btn = $('topoDhcpBtn'); if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  async function refreshLeases(manual) {
    if (leaseBusy || !data || !document.body.classList.contains('topology-page')) return;
    leaseBusy = true;
    try {
      const r = await api('/api/dhcp/leases?device=' + encodeURIComponent(currentDeviceId()));
      if (!data || r.deviceId && r.deviceId !== currentDeviceId()) return;
      leaseAt = r.updatedAt || Date.now();
      leaseError = r.error || '';
      setLeaseRows(r.leases || []);
      syncDhcpChrome();
      if (manual && r.error) toast(L('租约刷新失败：', 'Lease refresh failed: ') + r.error, 'err');
    } catch (e) {
      leaseError = e.message;
      if (manual) toast(L('租约刷新失败：', 'Lease refresh failed: ') + e.message, 'err');
      syncDhcpChrome();
    } finally {
      leaseBusy = false;
      if (btn) btn.classList.remove('busy');
    }
  }

  function startLeasePolling() {
    if (leaseTimer) clearInterval(leaseTimer);
    leaseTimer = setInterval(() => {
      if (!document.body.classList.contains('topology-page')) { clearInterval(leaseTimer); leaseTimer = null; return; }
      if (document.visibilityState === 'hidden') return;
      refreshLeases(false);
    }, 12000);
  }

  function focusNode(id) {
    const n = map.get(id), p = pos.get(id);
    if (!n || !p) return;
    if (topoTab !== 'map') showTopoTab('map');
    selectedId = id;
    draw();
    if (zoom < 1) zoom = 1;
    const vw = baseW / zoom, vh = baseH / zoom;
    panX = Math.max(0, Math.min(baseW - vw, p.x - vw / 2));
    panY = Math.max(0, Math.min(baseH - vh, p.y - vh / 2));
    applyView($('topoStage') && $('topoStage').querySelector('svg'));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains('topology-page') && data) refreshLeases(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const drawer = $('topoDhcpDrawer');
    if (drawer && !drawer.hidden) closeLeaseDrawer();
  });

  function bindSvg(svg) {
    if (!svg) return;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pt = svgPoint(svg, e.clientX, e.clientY);
      /* 低灵敏度：普通滚轮一格约 4.5%，触控板按 delta 平滑缩放 */
      const step = Math.max(-1.5, Math.min(1.5, e.deltaY / 100));
      zoomAt(Math.pow(1.045, -step), pt.x, pt.y);
    }, { passive: false });
    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('.topo-node')) return;
      panDrag = { x: e.clientX, y: e.clientY, px: panX, py: panY, rect: svg.getBoundingClientRect() };
      svg.classList.add('panning');
    });
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', onPanUp);
    svg.querySelectorAll('.topo-node').forEach((g) => {
      const n = map.get(g.dataset.id); if (!n) return;
      g.addEventListener('click', (ev) => {
        if (drag && drag.moved) return;
        ev.stopPropagation();
        selectedId = n.id;
        draw();
      });
      g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openEditor(n); });
      /* 所有设备都可自由拖动（x / y 双向），唯一约束是不与其它设备卡片重叠 */
      g.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        if (state.authRole === 'read') return;
        ev.preventDefault(); ev.stopPropagation();
        const p0 = pos.get(n.id), rect = svg.getBoundingClientRect();
        drag = { moved: false, node: n, x: p0.x, y: p0.y, sx0: ev.clientX, sy0: ev.clientY };
        const move = (e) => {
          if (Math.abs(e.clientX - drag.sx0) + Math.abs(e.clientY - drag.sy0) > 3) drag.moved = true;
          const dx = (e.clientX - drag.sx0) / rect.width * (baseW / zoom);
          const dy = (e.clientY - drag.sy0) / rect.height * (baseH / zoom);
          const c = clampPos(p0.x + dx, p0.y + dy);
          if (!spotFree(n, c.x, c.y)) return;
          drag.x = c.x; drag.y = c.y;
          g.setAttribute('transform', `translate(${c.x},${c.y})`);
        };
        const up = () => {
          document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
          if (drag && drag.moved && (Math.abs(drag.x - p0.x) > 1 || Math.abs(drag.y - p0.y) > 1))
            savePosition(n, drag.x, drag.y);
          setTimeout(() => { drag = null; }, 0);
        };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      });
    });
  }
  function onPanMove(e) {
    if (!panDrag) return;
    panX = panDrag.px - (e.clientX - panDrag.x) / panDrag.rect.width * (baseW / zoom);
    panY = panDrag.py - (e.clientY - panDrag.y) / panDrag.rect.height * (baseH / zoom);
    applyView($('topoStage') && $('topoStage').querySelector('svg'));
  }
  function onPanUp() { panDrag = null; const s = $('topoStage') && $('topoStage').querySelector('svg'); if (s) s.classList.remove('panning'); }

  function startRates() {
    if (rateTimer) clearInterval(rateTimer);
    const tick = async () => {
      /* 预览面板 / 后台标签里 document.hidden 可能为 true，不能用它做守卫，否则速率永远不刷新 */
      if (!data || !$('topoStage')) return;
      try {
        const [snap, ipd] = await Promise.all([
          api('/api/snapshot'),
          api('/api/ip-rates').catch(() => ({ rows: [] })),
        ]);
        rates = new Map((snap.ifaces || []).map((i) => [i.name, { rxBps: i.rxBps || 0, txBps: i.txBps || 0 }]));
        ipRates = new Map();
        for (const r of (ipd.rows || [])) {
          const rate = { rxBps: r.rxBps || 0, txBps: r.txBps || 0 };
          if (r.id) ipRates.set('id:' + r.id, rate);
          if (r.ip) ipRates.set(String(r.ip), rate);
        }
        paintRates();
      } catch (e) { /* ignore */ }
    };
    /* 后端 600ms 采样，前端同频拉取，最快捕捉速率变化、降低显示延迟 */
    tick(); rateTimer = setInterval(tick, 600);
  }
  function paintRates() {
    const stage = $('topoStage'); if (!stage) return;
    stage.querySelectorAll('.topo-node').forEach((g) => {
      const n = map.get(g.dataset.id); if (!n) return;
      const up = g.querySelector('.topo-rate.up'), down = g.querySelector('.topo-rate.down');
      const light = g.querySelector('.topo-light'), idle = g.querySelector('.topo-idle');
      const r = effectiveRate(n.id);
      const has = !!(r.rxBps || r.txBps);
      if (up) up.textContent = has ? '↑' + fmtRate(r.txBps) : '';
      if (down) down.textContent = has ? '↓' + fmtRate(r.rxBps) : '';
      /* 空闲标签与速率文字同步切换：有流量隐藏空闲，无流量显示空闲并清空速率，避免空白或残留 */
      if (idle) idle.style.display = has ? 'none' : '';
      if (light) light.setAttribute('opacity', String(lightIntensity(r)));
    });
    /* 连线流速由下级设备的下行速率决定，与父节点是否新增无关 */
    stage.querySelectorAll('.topo-link[data-to]').forEach((path) => {
      const dur = flowDuration(path.dataset.to);
      path.classList.toggle('flowing', dur > 0);
      path.style.setProperty('--flow-dur', (dur || 2) + 's');
      const flow = path.nextElementSibling && path.nextElementSibling.classList.contains('topo-flow') ? path.nextElementSibling : null;
      if (flow) {
        flow.classList.toggle('flowing', dur > 0);
        flow.style.setProperty('--flow-dur', (dur || 2) + 's');
      }
    });
    const tbody = $('topoLinkRows');
    if (tbody) tbody.querySelectorAll('tr[data-node]').forEach((tr) => {
      const r = effectiveRate(tr.dataset.node);
      const has = !!(r.rxBps || r.txBps);
      const main = tr.querySelector('[data-link-rate]');
      const sub = tr.querySelector('[data-link-up]');
      if (main) main.textContent = has ? '↓ ' + fmtRate(r.rxBps) : '—';
      if (sub) sub.textContent = has ? '↑ ' + fmtRate(r.txBps) : '';
    });
  }

  async function saveCustom(list, syncLeases) {
    const nodes2 = list || (data && data.custom) || [];
    try {
      const d = await api('/api/topology', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: nodes2, syncLeases: !!syncLeases }) });
      if (data) { data.custom = d.nodes || nodes2; data.updatedAt = d.updatedAt; }
      /* linkType/category 已随 nodes 提交给 /api/topology；后端 clean() 会丢弃这两个字段，
         所以用提交前的 nodes2 另存本地映射，保证线型和统计分类能跨刷新保留 */
      saveLocalMap(LINK_LOCAL_KEY(), nodes2, 'linkType');
      saveLocalMap(CAT_LOCAL_KEY(), nodes2, 'category');
      buildLayout(); draw(); syncIpAllSwitch();
      if (typeof window.__v2TopoKpiRefresh === 'function') window.__v2TopoKpiRefresh();
      /* 租约同步结果提示：把新增/更新的静态租约数告诉用户 */
      const ls = d && d.leaseSync;
      if (ls && (ls.added || ls.updated || ls.noMac || ls.error)) {
        const parts = [];
        if (ls.added) parts.push(L(`已新增 ${ls.added} 条 DHCP 租约`, `${ls.added} DHCP lease(s) added`));
        if (ls.updated) parts.push(L(`补全 ${ls.updated} 条`, `${ls.updated} completed`));
        if (ls.noMac) parts.push(L(`${ls.noMac} 台未填 MAC 已跳过`, `${ls.noMac} without MAC skipped`));
        if (ls.error) parts.push(L('租约同步失败', 'Lease sync failed') + ': ' + String(ls.error).slice(0, 60));
        toast(parts.join(' · '), ls.error ? 'err' : 'ok');
      }
      return true;
    } catch (e) { toast(e.message, 'err'); return false; }
  }

  /* ---------- 图标库：列出已上传图标，点击即可复用（同图不重复上传） ---------- */
  async function loadIconLib() {
    try {
      const d = await api('/api/topology/icons');
      iconLib = Array.isArray(d.icons) ? d.icons : [];
      if (!iconLabel && iconUrl) {
        const hit = iconLib.find((x) => x.url === iconUrl);
        iconLabel = hit ? hit.label : '';
      }
    } catch (e) { iconLib = []; toast(e.message, 'err'); }
    renderIconLib();
  }
  function renderIconLib() {
    const box = $('tnIconLib'); if (!box) return;
    if (!iconLib.length) {
      box.innerHTML = `<div class="topo-icon-lib-empty">${esc(L('图标库为空。上传一张图片，或直接把 PNG/JPG/SVG 等图片放进 data/topology-icons/ 目录后点「刷新」。', 'Library is empty. Upload an image, or drop PNG/JPG/SVG files into data/topology-icons/ and click Refresh.'))}</div>`;
      return;
    }
    box.innerHTML = iconLib.map((it) => `
      <div class="topo-icon-item${it.url === iconUrl ? ' selected' : ''}" data-icon-url="${esc(it.url)}" data-icon-label="${esc(it.label)}" title="${esc(it.label + (it.usedBy.length ? ' · ' + it.usedBy.length + ' ' + L('台设备在用', 'devices') : ''))}">
        <img src="${esc(it.url)}" alt="" loading="lazy">
        <span class="topo-icon-item-label">${esc(it.label)}</span>
        ${it.usedBy.length ? `<span class="topo-icon-item-use">×${it.usedBy.length}</span>` : ''}
        <span class="topo-icon-item-ops">
          <button type="button" data-icon-rename="${esc(it.name)}" title="${esc(L('重命名', 'Rename'))}">✎</button>
          <button type="button" data-icon-del="${esc(it.name)}" title="${esc(L('删除', 'Delete'))}">×</button>
        </span>
      </div>`).join('');
  }
  function selectIcon(url, label) {
    iconUrl = url || ''; iconLabel = label || '';
    const img = $('tnIconPreview'), lab = $('tnIconLabel');
    if (img) { if (iconUrl) { img.src = iconUrl; img.hidden = false; } else img.hidden = true; }
    if (lab) lab.textContent = iconLabel || L('未选择（显示类型图标）', 'None (type badge shown)');
    renderIconLib();
  }
  async function uploadIcon(file) {
    if (!file) return;
    if (file.size > 900 * 1024) { toast(L('图片需小于 900KB', 'Image must be under 900KB'), 'err'); return; }
    const label = (($('tnIconName') && $('tnIconName').value) || '').trim();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = await api('/api/topology/icon', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: reader.result, label, fileName: file.name }) });
        iconLib = d.icons || iconLib;
        selectIcon(d.url, d.label);
        const n = $('tnIconName'); if (n) n.value = '';
        toast(d.reused
          ? L('内容相同，已复用图标库中的现有图标', 'Identical image — reused the existing icon')
          : L('图标已上传，可直接给其它设备复用', 'Icon uploaded — reusable by other devices'), 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
    reader.onerror = () => toast(L('读取图片失败', 'Cannot read image'), 'err');
    reader.readAsDataURL(file);
  }
  async function renameIcon(name, el) {
    const item = el.closest('.topo-icon-item');
    const old = (iconLib.find((x) => x.name === name) || {}).label || name;
    const span = item && item.querySelector('.topo-icon-item-label');
    if (!span) return;
    const input = document.createElement('input');
    input.className = 'topo-icon-rename-input';
    input.value = old; input.maxLength = 40;
    span.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      const value = input.value.trim();
      let text = old;
      if (save && value && value !== old) {
        try {
          const d = await api('/api/topology/icon/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, label: value }) });
          iconLib = d.icons || iconLib;
          const hit = iconLib.find((x) => x.name === name);
          text = hit ? hit.label : value;
          if (item) item.dataset.iconLabel = text;
          if (hit && hit.url === iconUrl) {
            iconLabel = hit.label;
            const lab = $('tnIconLabel'); if (lab) lab.textContent = hit.label;
          }
        } catch (e) { toast(e.message, 'err'); }
      }
      /* 只把输入框换回标签，不重建整个图标库 —— 否则会吞掉同一次点击（例如删除按钮） */
      const span = document.createElement('span');
      span.className = 'topo-icon-item-label';
      span.textContent = text;
      if (input.parentNode) input.replaceWith(span);
    };
    input.onblur = () => finish(true);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
  }
  async function deleteIcon(name) {
    const it = iconLib.find((x) => x.name === name) || {};
    const used = it.usedBy || [];
    let force = false;
    if (used.length) {
      if (!window.confirm(L('该图标正被以下设备使用：', 'Used by: ') + used.slice(0, 6).join('、') + '\n' +
        L('删除后会清空这些设备的图标，继续？', 'Deleting will clear the icon on those devices. Continue?'))) return;
      force = true;
    } else if (!window.confirm(L('从图标库删除这个图标？', 'Delete this icon from the library?'))) return;
    try {
      const d = await api('/api/topology/icon/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, force }) });
      iconLib = d.icons || [];
      if (iconUrl && iconUrl.endsWith('/' + name)) selectIcon('', '');
      else renderIconLib();
      toast(force ? L('图标已删除，相关设备已恢复默认图标', 'Icon deleted; devices reverted to default badge')
        : L('图标已删除', 'Icon deleted'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  /* 拖动落点持久化；自动节点会生成同 id 的 custom 覆盖版本 */
  function savePosition(n, x, y) {
    const list = ((data && data.custom) || []).slice();
    const idx = list.findIndex((c) => c.id === n.id);
    if (idx >= 0) list[idx] = { ...list[idx], x: Math.round(x), y: Math.round(y) };
    else list.push({ ...overrideOf(n), x: Math.round(x), y: Math.round(y) });
    saveCustom(list);
  }

  /* 为自动发现的节点建立可持久化的覆盖版本（同 id，custom 优先） */
  function overrideOf(n) {
    return { id: n.id, name: n.name, type: n.type, ip: n.ip || '', mac: n.mac || '', parent: n.parent || null,
      parentPort: n.parentPort || '', ports: Array.isArray(n.ports) ? n.ports.slice() : [],
      iface: n.iface || '', icon: n.icon || '', note: n.note || '',
      ipRate: !!n.ipRate,
      linkType: linkTypeOf(n), category: categoryOf(n),
      calcFrom: Array.isArray(n.calcFrom) ? n.calcFrom.slice() : [],
      order: Number(n.order) || 0,
      deleted: false, x: n.x || 0, y: n.y || 0 };
  }

  /* 批量测速点选面板：一屏勾选要为哪些设备开启按 IP 实时测速 */
  function openRatePicker() {
    if (!data) { load(false).then(() => { if (data) openRatePicker(); }); return; }
    const nodes = allNodes().filter((n) => !n.deleted);
    if (!nodes.length) { toast(L('请先加载拓扑', 'Load the topology first'), 'err'); return; }
    const eligible = (n) => (n.mac && String(n.mac).trim()) || (n.ip && /^[a-zA-Z0-9_.:-]+$/.test(String(n.ip).trim()));
    const body = `
      <div class="ui-intro">
        <div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 6 16 3-8h4"/></svg></div>
        <div><b>${esc(L('按 IP 实时测速', 'Live rate by IP'))}</b>
          <p>${esc(L('勾选要为哪些设备按 IP 测速；填了 IP 或 MAC 的设备才能开启。仅读连接表，不改路由器配置。', 'Pick devices to monitor by IP; devices with an IP or MAC are eligible. Reads connection tables only, no router changes.'))}</p></div>
      </div>
      <div class="ui-toolbar">
        <div class="ui-search"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="text" id="rateSearch" placeholder="${esc(L('搜索设备名 / IP / MAC…', 'Search name / IP / MAC…'))}"></div>
        <div class="ui-quick">
          <button class="btn btn-sm" type="button" id="rateAll">${esc(L('全选', 'All'))}</button>
          <button class="btn btn-sm" type="button" id="rateNone">${esc(L('全不选', 'None'))}</button>
        </div>
      </div>
      <div class="ui-list" id="rateList">
        ${nodes.map((n, i) => {
          const ok = eligible(n);
          return `<label class="ui-row${ok ? '' : ' disabled'}" data-name="${esc((n.name || '') + ' ' + (n.ip || '') + ' ' + (n.mac || '')).toLowerCase()}">
            ${n.icon ? `<img class="ui-row-ic" src="${esc(n.icon)}" alt="" loading="lazy">` : `<span class="ui-row-ic lg-${esc(n.type)}"></span>`}
            <span class="ui-row-main"><b>${esc(n.name || n.ip || n.id)}</b><small>${esc(n.ip || n.mac || L('未填地址', 'no address'))}${n.mac && n.ip ? ' · ' + esc(String(n.mac).slice(0, 8)) : ''} · ${esc(typeLabel(n.type))}</small></span>
            <span class="picker-tag">${ok ? '' : esc(L('需填 IP/MAC', 'needs IP/MAC'))}</span>
            <span class="upd-switch"><input type="checkbox" data-rate-id="${esc(n.id)}"${n.ipRate && ok ? ' checked' : ''}${ok ? '' : ' disabled'}><i></i></span>
          </label>`;
        }).join('')}
      </div>`;
    const foot = `<span class="ui-summary" id="rateSummary"></span>
      <button class="btn" data-close type="button">${esc(L('取消', 'Cancel'))}</button>
      <button class="btn primary" id="rateSave" type="button">${esc(L('保存', 'Save'))}</button>`;
    openModal(L('批量设置按 IP 测速', 'Batch set per-IP monitoring'), body, foot, (m) => {
      const boxes = [...m.querySelectorAll('[data-rate-id]')];
      const summary = m.querySelector('#rateSummary');
      const updateSummary = () => { summary.innerHTML = L('已选 <b>', 'Selected <b>') + boxes.filter((b) => b.checked).length + L('</b> 台设备', '</b> devices'); };
      updateSummary();
      boxes.forEach((b) => b.onchange = updateSummary);
      m.querySelector('#rateAll').onclick = () => { boxes.forEach((b) => { if (!b.disabled) b.checked = true; }); updateSummary(); };
      m.querySelector('#rateNone').onclick = () => { boxes.forEach((b) => b.checked = false); updateSummary(); };
      const search = m.querySelector('#rateSearch');
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        m.querySelectorAll('.ui-row').forEach((row) => { row.style.display = !q || row.dataset.name.includes(q) ? '' : 'none'; });
      };
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('#rateSave').onclick = async () => {
        const chosen = new Set(boxes.filter((b) => b.checked).map((b) => b.dataset.rateId));
        const list = ((data && data.custom) || []).slice();
        const all = allNodes();
        for (const n of all) {
          if (!eligible(n) && chosen.has(n.id)) continue;
          const want = chosen.has(n.id);
          if (!!n.ipRate === want) continue;
          const idx = list.findIndex((x) => x.id === n.id);
          const item = idx >= 0 ? { ...list[idx] } : overrideOf(n);
          item.ipRate = want;
          if (idx >= 0) list[idx] = item; else list.push(item);
        }
        if (await saveCustom(list)) { closeModal(); toast(L('测速设备已更新', 'Monitoring devices updated'), 'ok'); syncIpAllSwitch(); }
      };
      setTimeout(() => search.focus(), 50);
    });
  }

  function openEditor(node) {
    if (state.authRole === 'read') { toast(L('只读账户无法编辑网络设备', 'Read-only account'), 'err'); return; }
    /* 双击已有设备（包括自动发现的设备）永远是「编辑这个设备」，用同一个 id 覆盖，绝不新增副本 */
    const isNew = !node;
    const parentNode = node && map.get(node.parent);
    const others = nodes.filter((n) => (!node || n.id !== node.id));
    const parentOpts = others.map((n) => `<option value="${esc(n.id)}"${node && node.parent === n.id ? ' selected' : ''}>${esc(n.name)}</option>`).join('');
    iconUrl = (node && node.icon) || '';
    iconLabel = (iconLib.find((x) => x.url === iconUrl) || {}).label || '';
    const relationDefault = !node ? 'child' : (node.parent ? 'child' : 'top');
    const portsText = Array.isArray(node && node.ports) ? node.ports.join(', ') : '';
    const calcList = descendantsOf(node ? node.id : '');
    const calcSelected = Array.isArray(node && node.calcFrom) ? node.calcFrom : [];
    const calcRows = calcList.map(({ node: d, depth }) => `<label class="calc-opt" style="padding-left:${Math.min(depth, 6) * 12}px"><input type="checkbox" class="calc-chk" value="${esc(d.id)}"${calcSelected.includes(d.id) ? ' checked' : ''}><span>${esc(d.name)}</span><small>${esc(d.iface || typeLabel(d.type))}</small></label>`).join('');
    const section = (num, title, sub, inner) => `<section class="te-sec"><div class="te-sec-head"><span class="te-sec-num">${num}</span><div><h4>${esc(title)}</h4><p>${esc(sub)}</p></div></div><div class="te-sec-body">${inner}</div></section>`;
    const field = (label, ctrl, hint) => `<div class="te-field"><label>${esc(label)}</label>${ctrl}${hint ? `<div class="te-hint">${esc(hint)}</div>` : ''}</div>`;
    const introHtml = `<div class="ui-intro"><div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg></div>
      <div><b>${esc(isNew ? L('添加网络设备', 'Add network device') : L('编辑网络设备', 'Edit network device'))}</b><p>${esc(L('填写设备信息与层级关系；填 MAC + IPv4 时会联动 DHCP 租约。', 'Fill in device details and hierarchy; MAC + IPv4 syncs the DHCP lease.'))}</p></div></div>`;
    const body = introHtml + `<div class="topo-editor">
      ${section('1', L('基本信息', 'Basic info'), L('名称、类型与地址', 'Name, type and address'), `
        ${field(L('名称', 'Name') + ' *', `<input id="tnName" type="text" maxlength="48" value="${esc(node ? node.name : '')}" placeholder="${esc(L('设备名称', 'Device name'))}">`)}
        <div class="te-grid-2">
          ${field(L('类型', 'Type'), `<select id="tnType">${TYPES.map((tp) => `<option value="${tp}"${node && node.type === tp ? ' selected' : ''}>${esc(typeLabel(tp))}</option>`).join('')}</select>`)}
          ${field(L('IP / 地址', 'IP / address'), `<input id="tnIp" type="text" maxlength="64" value="${esc(node ? node.ip : '')}" placeholder="192.168.1.1">`, L('IPv4 地址，与下方 MAC 一起用于联动 DHCP 租约；这里的名称是设备名，与 RouterOS 租约备注相互独立', 'IPv4 address; used with MAC below to sync the DHCP lease. This name is the device name, independent of the RouterOS lease comment'))}
        </div>
        ${field(L('MAC 地址', 'MAC address'), `<input id="tnMac" type="text" maxlength="32" value="${esc(node ? node.mac || '' : '')}" placeholder="AA:BB:CC:DD:EE:FF">`, L('DHCP 租约以 MAC 为锚点：填写 MAC + IPv4 才会同步生成静态租约，租约修改后也会据此同步回本设备。同时用于表格图标复用；自动发现的设备会自动带出', 'DHCP leases are anchored by MAC: only with MAC + IPv4 is a static lease created, and lease edits sync back here. Also reuses table icons; auto-discovered devices fill this in'))}`)}
      ${section('2', L('层级与连接', 'Hierarchy & links'), L('决定设备在拓扑中的位置与连线', 'Where the device sits and how it connects'), `
        ${field(L('层级关系', 'Hierarchy'), `<select id="tnRelation">
          <option value="child"${relationDefault === 'child' ? ' selected' : ''}>${esc(L('作为目标设备的下级', 'Child of selected device'))}</option>
          <option value="parent"${relationDefault === 'parent' ? ' selected' : ''}>${esc(L('作为目标设备的上级', 'Parent of selected device'))}</option>
          <option value="top"${relationDefault === 'top' ? ' selected' : ''}>${esc(L('独立顶层', 'Standalone top level'))}</option>
        </select>`, L('选择「上级」可把现有设备挂到新设备下面，例如给主路由加光猫', 'Choose "Parent" to put a device under this one (e.g. ONT above router)'))}
        <div class="te-grid-2">
          ${field(L('链路类型', 'Link type'), `<select id="tnLinkType">
            <option value="physical"${linkTypeOf(node) === 'physical' ? ' selected' : ''}>${esc(L('物理链路（实线）', 'Physical (solid)'))}</option>
            <option value="wireless"${linkTypeOf(node) === 'wireless' ? ' selected' : ''}>${esc(L('无线链路（虚线）', 'Wireless (dashed)'))}</option>
            <option value="tunnel"${linkTypeOf(node) === 'tunnel' ? ' selected' : ''}>${esc(L('代理隧道（棕黄虚线）', 'Proxy tunnel (amber dashed)'))}</option>
          </select>`, L('决定与上级设备之间连线的样式与颜色', 'Sets the style and color of the line to the parent'))}
          ${field(L('统计分类', 'Category'), `<select id="tnCategory">
            ${['client', 'ap', 'node'].map((c) => `<option value="${c}"${categoryOf(node) === c ? ' selected' : ''}>${esc(categoryLabel(c))}</option>`).join('')}
          </select>`, L('用于拓扑图下方的终端 / AP / 节点数量统计', 'Used by the topology summary counts'))}
        </div>
        <div class="te-grid-2">
          ${field(L('目标设备', 'Target device'), `<select id="tnParent">${parentOpts}</select>`)}
          ${field(L('上级端口', 'Parent port'), `<input id="tnParentPort" type="text" maxlength="32" list="tnKnownPorts" value="${esc(node ? node.parentPort || '' : '')}" placeholder="${esc(L('接在上级的哪个口', 'Upstream port'))}"><datalist id="tnKnownPorts">${((parentNode && parentNode.ports) || []).map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>`)}
        </div>
        <div class="te-grid-2">
          ${field(L('本机网口', 'Local ports'), `<input id="tnPorts" type="text" maxlength="400" value="${esc(portsText)}" placeholder="ether1, ether2, ...">`, L('逗号分隔，用于登记端口与下挂连接', 'Comma-separated port list'))}
          ${field(L('本层排序', 'Order in level'), `<input id="tnOrder" type="number" min="1" max="999" value="${node && Number(node.order) > 0 ? Number(node.order) : ''}" placeholder="1">`, L('同层左右顺序，留空排最后', 'Left-to-right order; blank sorts last'))}
        </div>`)}
      ${section('3', L('流量', 'Traffic'), L('无法直采时可用下级速率求和', 'Sum downstream rates when direct measurement is unavailable'), `
        ${field(L('实时测速（双栈聚合）', 'Live rate (dual-stack)'), `<label class="te-switch-row"><span class="te-switch-text"><b>${esc(L('按 IP 测速', 'Monitor by IP'))}</b><small>${esc(L('开启后按此设备 IP/MAC 聚合上下行，自动含 IPv4 + IPv6', 'Aggregate up/down by this device IP/MAC, auto IPv4 + IPv6'))}</small></span><span class="upd-switch"><input type="checkbox" id="tnIpRate"${node && node.ipRate ? ' checked' : ''}><i></i></span></label>`, L('填 MAC 即可从 DHCP 租约与 IPv6 邻居表自动发现该设备所有地址（含会变的 SLAAC IPv6），IPv4/IPv6 速率相加；没填 MAC 则用上方 IP。仅每秒读取连接表，不改路由器配置', 'With a MAC, all device addresses are auto-discovered from DHCP leases and IPv6 neighbours (including changing SLAAC IPv6), and IPv4/IPv6 rates are summed; otherwise the IP above is used. Reads the connection table once per second without changing router config'))}
        ${field(L('流量计算模式', 'Traffic calculation'), `<div class="calc-list">${calcRows || `<div class="form-hint">${esc(L('该设备暂无下级设备', 'No downstream devices yet'))}</div>`}</div>`, L('多选下级设备按其速率之和显示；有包含关系的勾选会自动互斥', 'Select downstream devices to sum their rates; overlapping picks are mutually exclusive'))}
      `)}
      ${section('4', L('设备图标', 'Device icon'), L('可从图标库复用，或直接上传', 'Reuse from library or upload a new one'), `
        <div class="topo-icon-picker">
          <div class="topo-icon-current">
            <img id="tnIconPreview" class="topo-icon-preview" ${iconUrl ? `src="${esc(iconUrl)}"` : 'hidden'} alt="preview">
            <div class="topo-icon-current-txt"><b id="tnIconLabel">${esc(iconLabel || L('未选择（显示类型图标）', 'None (type badge shown)'))}</b>
              <small>${esc(L('同一个图标可给多台设备复用，无需重复上传', 'One icon can be reused by many devices'))}</small></div>
            <button class="btn btn-sm" id="tnIconClear" type="button">${esc(L('移除', 'Remove'))}</button>
          </div>
          <div class="topo-icon-lib-head"><span>${esc(L('图标库', 'Icon library'))}<small> · ${esc(L('点击选择，或把图片放进 data/topology-icons/ 后刷新', 'Click to pick; drop files into data/topology-icons/ then refresh'))}</small></span>
            <button class="btn btn-sm" id="tnIconRefresh" type="button">${esc(L('刷新', 'Refresh'))}</button></div>
          <div class="topo-icon-lib" id="tnIconLib"><div class="topo-icon-lib-empty">${esc(L('加载中…', 'Loading…'))}</div></div>
          <div class="topo-icon-upload">
            <input id="tnIconName" type="text" maxlength="40" placeholder="${esc(L('图标名称（可选，如 iPhone）', 'Icon name (optional, e.g. iPhone)'))}">
            <label class="btn btn-sm" for="tnIconFile">＋ ${esc(L('上传新图标', 'Upload new'))}</label>
            <input id="tnIconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>
            <span class="topo-hint">${esc(L('PNG/JPEG/WebP/GIF/SVG，<900KB；内容相同的图片自动复用', 'PNG/JPEG/WebP/GIF/SVG, <900KB; identical images are reused'))}</span>
          </div>
        </div>`)}
      ${section('5', L('备注', 'Note'), L('可选，方便自己识别', 'Optional, for your own reference'), `
        <input id="tnNote" type="text" maxlength="120" value="${esc(node ? node.note : '')}" placeholder="${esc(L('例如：放在客厅电视柜', 'e.g. living room TV cabinet'))}">
      `)}
    </div>`;
    const foot = `<span class="ui-summary">${esc(L('共 ', ''))}5 ${esc(L('个分区', ' sections'))}</span>
      <button class="btn" data-close type="button">${esc(L('取消', 'Cancel'))}</button><button class="btn primary" id="tnSave" type="button">${esc(L('保存', 'Save'))}</button>`;
    openModal(isNew ? L('添加网络设备', 'Add network device') : L('编辑网络设备', 'Edit network device'), body, foot, () => {
      document.querySelectorAll('.calc-chk').forEach((ch) => {
        ch.onchange = () => {
          if (!ch.checked) return;
          document.querySelectorAll('.calc-chk:checked').forEach((other) => {
            if (other !== ch && (isDescendantOf(other.value, ch.value) || isDescendantOf(ch.value, other.value))) other.checked = false;
          });
        };
      });
      $('tnIconFile').onchange = (e) => uploadIcon(e.target.files[0]);
      $('tnIconClear').onclick = () => selectIcon('', '');
      $('tnIconRefresh').onclick = () => loadIconLib();
      $('tnIconLib').onclick = (e) => {
        const ren = e.target.closest('[data-icon-rename]');
        if (ren) { e.stopPropagation(); renameIcon(ren.dataset.iconRename, ren); return; }
        const del = e.target.closest('[data-icon-del]');
        if (del) { e.stopPropagation(); deleteIcon(del.dataset.iconDel); return; }
        const item = e.target.closest('.topo-icon-item');
        if (item) selectIcon(item.dataset.iconUrl, item.dataset.iconLabel);
      };
      loadIconLib();
      $('tnParent').onchange = () => {
        const p = map.get($('tnParent').value);
        $('tnKnownPorts').innerHTML = ((p && p.ports) || []).map((x) => `<option value="${esc(x)}"></option>`).join('');
      };
      $('tnSave').onclick = async () => {
        const name = $('tnName').value.trim(); if (!name) { toast(L('请填写名称', 'Name is required'), 'err'); return; }
        const relation = $('tnRelation').value, targetId = $('tnParent').value;
        const myId = node ? node.id : 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        /* 编辑时保持原有上级，除非用户明确改了层级关系或目标设备 */
        let parent = node ? (node.parent || null) : null;
        if (relation === 'child') parent = targetId || null;
        else if (relation === 'top') parent = null;
        if (parent === myId || (parent && node && isDescendantOf(parent, myId))) {
          toast(L('该层级关系会形成循环', 'This hierarchy would create a cycle'), 'err'); return;
        }
        const item = {
          id: myId,
          name, type: $('tnType').value, ip: $('tnIp').value.trim(), mac: ($('tnMac') && $('tnMac').value.trim()) || '',
          parent, parentPort: $('tnParentPort').value.trim(),
          ports: $('tnPorts').value.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 64),
          iface: (node && node.iface) || '', icon: iconUrl, note: $('tnNote').value.trim(),
          ipRate: !!($('tnIpRate') && $('tnIpRate').checked),
          linkType: ($('tnLinkType') && $('tnLinkType').value) || linkTypeOf(node),
          category: ($('tnCategory') && $('tnCategory').value) || categoryOf(node),
          calcFrom: [...document.querySelectorAll('.calc-chk:checked')].map((x) => x.value),
          order: Math.max(0, Math.min(999, Math.round(Number($('tnOrder').value) || 0))),
          x: (node && Number(node.x)) || 0, y: (node && Number(node.y)) || 0,
          deleted: false,
        };
        const custom = ((data && data.custom) || []).slice();
        const idx = custom.findIndex((n) => n.id === item.id);
        if (idx >= 0) custom[idx] = item; else custom.push(item);
        /* 「作为上级」：把目标设备挂到本设备下；目标为自动节点时生成同 id 覆盖版本 */
        if (relation === 'parent' && targetId && targetId !== item.id) {
          const target = map.get(targetId);
          if (target && !(node && isDescendantOf(node.id, targetId))) {
            const override = { id: target.id, name: target.name, type: target.type, ip: target.ip || '',
              parent: item.id, parentPort: target.parentPort || '', ports: Array.isArray(target.ports) ? target.ports : [],
              iface: target.iface || '', icon: target.icon || '', note: target.note || '',
              linkType: linkTypeOf(target), category: categoryOf(target),
              calcFrom: Array.isArray(target.calcFrom) ? target.calcFrom.slice() : [], order: Number(target.order) || 0,
              deleted: false, x: target.x || 0, y: target.y || 0 };
            const ti = custom.findIndex((n) => n.id === targetId);
            if (ti >= 0) custom[ti] = { ...custom[ti], parent: item.id }; else custom.push(override);
          }
        }
        if (await saveCustom(custom, true)) { closeModal(); selectedId = item.id; toast(L('已保存', 'Saved'), 'ok'); }
      };
      setTimeout(() => { const el = $('tnName'); if (el) el.focus(); }, 40);
    });
  }

  function deleteSelected() {
    const node = selectedId && map.get(selectedId);
    if (!node) { toast(L('请先点选要删除的设备', 'Select a device to delete first'), 'err'); return; }
    const wasAuto = ((data && data.auto) || []).some((x) => x.id === node.id);
    const body = `<div class="ui-intro danger"><div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><b>${esc(L('删除网络设备', 'Delete network device'))}</b><div class="ui-intro-msg">${esc(L('确定删除设备', 'Delete this device?'))} <b>${esc(node.name)}</b>${wasAuto ? ' · ' + esc(L('自动发现的设备将从视图中隐藏，删除覆盖版本即可恢复。', 'Auto-discovered device will be hidden; remove its override to restore.')) : ''}</div></div></div>`;
    const foot = `<button class="btn" data-close type="button">${esc(L('取消', 'Cancel'))}</button><button class="btn danger" id="tnDel" type="button">${esc(L('删除', 'Delete'))}</button>`;
    openModal(L('删除网络设备', 'Delete network device'), body, foot, () => {
      $('tnDel').onclick = async () => {
        const list = ((data && data.custom) || []).slice();
        /* 下级设备改为挂到被删设备的上级，避免整棵子树消失 */
        for (const n of list) if (n.parent === node.id) n.parent = node.parent || null;
        if (wasAuto) {
          const tomb = { ...overrideOf(node), deleted: true, parent: node.parent || null };
          const idx = list.findIndex((n) => n.id === node.id);
          if (idx >= 0) list[idx] = { ...list[idx], ...tomb }; else list.push(tomb);
        } else {
          const idx = list.findIndex((n) => n.id === node.id);
          if (idx >= 0) list.splice(idx, 1);
        }
        /* 其它设备的计算模式不再引用已删除节点 */
        for (const n of list) if (Array.isArray(n.calcFrom)) n.calcFrom = n.calcFrom.filter((x) => x !== node.id);
        if (await saveCustom(list)) {
          closeModal(); selectedId = null;
          toast(L('已删除', 'Deleted'), 'ok');
        }
      };
    });
  }
/* 窗口宽度变化后按新画布宽度重排，避免手机/分屏时拓扑被整体压得过小 */
  window.addEventListener('resize', () => {
    if (state.section !== 'topology' || !data || !nodes.length) return;
    clearTimeout(layoutResizeTimer);
    layoutResizeTimer = setTimeout(() => {
      const stage = $('topoStage');
      if (!stage) return;
      const w = stage.clientWidth;
      if (!w || Math.abs(w - layoutStageW) < 24) return;
      delete stage.dataset.centered;
      buildLayout(); fitView(); draw();
    }, 180);
  });
})();
