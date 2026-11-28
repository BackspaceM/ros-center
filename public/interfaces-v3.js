'use strict';
/* ============================================================
   Interfaces v3 · 接口与地址（设计稿 interfaces.html 卡片）
   - 接口列表卡片：接口 / 桥接（桥接只列 bridge 及成员）
   - 地址列表卡片：IPv4 / IPv6 / ARP / 邻居 / IPv6 邻居 / 地址池
   - 右侧栏：WAN 连接 / 错误与丢包
   全部数据来自真实 API：/api/snapshot（实时速率）+ /api/config?section=...
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const ex = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = ex;
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d == null ? 0 : d); };
  /* L(zh,en) 复用 app.js 顶层定义；此处不再遮蔽它 */
  function relTime(ts) { if (!ts) return '—'; const s = Math.floor((Date.now() - ts) / 1000); if (s < 2) return L('刚刚', 'just now'); if (s < 60) return s + ' ' + L('秒前', 's ago'); return Math.round(s / 60) + ' ' + L('分钟前', 'min ago'); }

  /* ---------- 页签：接口卡片与地址卡片各自独立 ---------- */
  const IFACE_TABS = [['ifaces', '接口', 'Interfaces'], ['bridge', '桥接', 'Bridge']];
  const ADDR_TABS = [
    ['addrs', 'IPv4', 'IPv4'], ['ipv6', 'IPv6', 'IPv6'],
    ['arp', 'ARP', 'ARP'], ['neighbors', '邻居', 'Neighbors'],
    ['ipv6n', 'IPv6 邻居', 'IPv6 neighbors'], ['pools', '地址池', 'Pools'],
    ['addrlists', '地址列表', 'Address list'], ['addrlists6', 'IPv6 地址列表', 'IPv6 address list'],
  ];
  const TABS = IFACE_TABS.concat(ADDR_TABS);
  const ADDR_SECTIONS = {
    addrs: 'ipAddresses', ipv6: 'ipv6Addresses', arp: 'arp', neighbors: 'neighbors', ipv6n: 'ipv6Neighbors',
    pools: 'pools', addrlists: 'addressLists', addrlists6: 'addressLists6',
  };
  const SEC_OF = { ifaces: 'interfaces', bridge: 'bridgePorts' };
  ADDR_TABS.forEach((t) => { SEC_OF[t[0]] = ADDR_SECTIONS[t[0]]; });
  function sectionOf(tab) { return SEC_OF[tab] || 'interfaces'; }
  const READONLY_TABS = ['arp', 'neighbors', 'ipv6n'];
  const ALL_SECTIONS = ['interfaces', 'bridgePorts', 'ipAddresses', 'ipv6Addresses', 'arp', 'neighbors', 'ipv6Neighbors', 'pools', 'addressLists', 'addressLists6'];
  const KEY_LABELS = { running: ['状态', 'Status'], disabled: ['禁用', 'Disabled'], dynamic: ['动态', 'Dynamic'], address: ['地址', 'Address'] };
  const FALLBACK_COLS = {
    addrs: [['address', '地址', 'Address'], ['interface', '接口', 'Interface'], ['network', '网络', 'Network'], ['comment', '备注', 'Comment']],
    ipv6: [['address', 'IPv6 地址', 'IPv6 address'], ['interface', '接口', 'Interface'], ['advertise', 'SLAAC', 'SLAAC'], ['comment', '备注', 'Comment']],
    bridge: [['interface', '端口', 'Port'], ['bridge', '桥接', 'Bridge'], ['role', '角色', 'Role'], ['state', '状态', 'State'], ['path-cost', '路径开销', 'Path cost'], ['edge', '边缘', 'Edge']],
    arp: [['address', 'IP 地址', 'IP'], ['mac-address', 'MAC', 'MAC'], ['interface', '接口', 'Interface'], ['dynamic', '动态', 'Dynamic'], ['complete', '完成', 'Complete']],
    neighbors: [['identity', '设备名', 'Identity'], ['address', '地址', 'Address'], ['mac-address', 'MAC', 'MAC'], ['interface', '接口', 'Interface'], ['platform', '平台', 'Platform']],
    ipv6n: [['address', 'IPv6 地址', 'IPv6'], ['mac-address', 'MAC', 'MAC'], ['interface', '接口', 'Interface'], ['status', '状态', 'Status']],
    pools: [['name', '名称', 'Name'], ['ranges', '范围', 'Ranges'], ['comment', '备注', 'Comment']],
    addrlists: [['list', '列表名', 'List'], ['address', '地址', 'Address'], ['timeout', '超时', 'Timeout'], ['comment', '备注', 'Comment']],
    addrlists6: [['list', '列表名', 'List'], ['address', 'IPv6 地址', 'IPv6 address'], ['timeout', '超时', 'Timeout'], ['comment', '备注', 'Comment']],
  };

  const IV = {
    tab: 'ifaces', addrTab: 'addrs', q: '', aq: '', filter: 'all',
    data: {}, loadedAt: 0, ifLoadedAt: 0, loading: false, pending: false, err: '', ipRates: [],
  };

  /* ---------- 加载：接口优先出，其余 section 并行 ---------- */
  async function loadAll(force) {
    if (IV.loading) { if (force) IV.pending = true; return; }
    if (!force && IV.loadedAt && Date.now() - IV.loadedAt < 8000) { paint(); return; }
    IV.loading = true;
    const firstLoad = !IV.ifLoadedAt;
    const req = (s) => api('/api/config?section=' + s).catch(() => null);
    /* 接口单独优先，且立刻并发发起其余请求，不串行等待 */
    const prio = req('interfaces');
    const rest = Promise.all(ALL_SECTIONS.slice(1).map(req));
    const ipr = api('/api/ip-rates').catch(() => null);
    try {
      const r = await prio;
      if (r && Array.isArray(r.rows)) { IV.data.interfaces = r.rows; IV.ifLoadedAt = Date.now(); }
      IV.err = '';
      if (firstLoad && state.section === 'interfacesCenter') paint(); /* 接口数据先渲染 */
      const [results, ipd] = await Promise.all([rest, ipr]);
      ALL_SECTIONS.slice(1).forEach((s, i) => { IV.data[s] = (results[i] && results[i].rows) || []; });
      if (ipd && Array.isArray(ipd.rows)) IV.ipRates = ipd.rows;
      IV.loadedAt = Date.now();
      if (state.section === 'interfacesCenter') paint();
    } catch (e) { IV.err = (e && e.message) || '加载失败'; }
    IV.loading = false;
    if (state.section === 'interfacesCenter') { paint(); updateLive(); }
    if (IV.pending) { IV.pending = false; loadAll(true); }
  }

  /* ---------- schema 动态列 ---------- */
  function schemaSection(id) {
    const list = (state.schema && state.schema.sections) || [];
    return list.find((s) => s.id === id) || null;
  }
  function columnsFor(tab) {
    const sec = schemaSection(sectionOf(tab));
    const out = [];
    if (sec && Array.isArray(sec.columns)) {
      sec.columns.forEach((k) => {
        if (k === '.id') return;
        const f = (sec.fields || []).find((x) => x.key === k);
        const kl = KEY_LABELS[k];
        out.push([k, f && f.label ? L(f.label.zh, f.label.en) : (kl ? L(kl[0], kl[1]) : k)]);
      });
    }
    if (out.length) return out;
    return (FALLBACK_COLS[tab] || [['name', 'Name', 'Name']]).map(([k, zh, en]) => [k, L(zh, en)]);
  }

  /* ---------- 数据辅助 ---------- */
  function ifaceBadge(name, type) {
    const s = String(name || '');
    let k = 'eth', t = 'eth';
    if (/^bridge|^br/i.test(s) || /bridge/i.test(String(type || ''))) { k = 'br'; t = 'br'; }
    else if (/ppp|pppoe/i.test(s)) { k = 'ppp'; t = 'ppp'; }
    else if (/^wg|wireguard/i.test(s)) { k = 'wg'; t = 'wg'; }
    else if (/^lo$/i.test(s)) { k = 'lo'; t = 'lo'; }
    else if (/vlan/i.test(s)) { k = 'vlan'; t = 'vlan'; }
    else if (/ether|ethernet/i.test(s + ' ' + String(type || ''))) { k = 'eth'; t = 'eth'; }
    return `<span class="if-badge ${k}">${t}</span>`;
  }
  function fmtRate(bps) {
    const n = num(bps), u = ['bps', 'Kbps', 'Mbps', 'Gbps']; let i = 0, v = n;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
  }
  function fmtBytes(b) {
    const n = num(b), u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
  }
  function ifaceState(i) {
    const hasR = i && (i.running === 'true' || i.running === false || i.running === true || i.running === 'false');
    if (i && (i.disabled === 'true' || i.disabled === true)) return { t: L('禁用', 'Disabled'), d: 'is-muted' };
    if (!hasR) return { t: L('未知', 'Unknown'), d: 'is-amber' };
    return (i.running === 'true' || i.running === true) ? { t: 'UP', d: 'is-green' } : { t: 'DOWN', d: 'is-red' };
  }
  function liveIfaces() { return (state.latest && state.latest.ifaces) || []; }
  function ifaceRaw(name) { return liveIfaces().find((i) => i.name === name) || {}; }
  function addrsFor(name) {
    return {
      v4: (IV.data.ipAddresses || []).filter((a) => a.interface === name),
      v6: (IV.data.ipv6Addresses || []).filter((a) => a.interface === name),
    };
  }
  function isLinkLocal(a) { return /^fe[89ab][0-9a-f]:/i.test(String(a || '')); }
  function isPrivateIp(ip) {
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.64\.)/.test(String(ip || ''))
      || /^fe[89ab]/i.test(String(ip || '')) || /^(::1|fc|fd)/i.test(String(ip || ''));
  }

  /* 实时速率：下方所有接口 rx/tx 之和；snapshot 无数据时回退 /api/ip-rates 汇总 */
  function rateSources() {
    const ifaces = liveIfaces();
    if (ifaces.length) {
      return {
        rx: ifaces.reduce((s, i) => s + num(i.rxBps), 0),
        tx: ifaces.reduce((s, i) => s + num(i.txBps), 0),
      };
    }
    const rows = IV.ipRates || [];
    return {
      rx: rows.reduce((s, r) => s + num(r.rxBps), 0),
      tx: rows.reduce((s, r) => s + num(r.txBps), 0),
    };
  }
  function wanName() {
    try { const c = JSON.parse(localStorage.getItem('ros-center-wan') || 'null'); if (c && c.name) return c.name; } catch (e) { /* ignore */ }
    const wan = liveIfaces().find((i) => /pppoe|ether1|wan/i.test(i.name + ' ' + (i.comment || '')));
    return wan ? wan.name : '—';
  }
  function wanSpeed(name) {
    try { const c = JSON.parse(localStorage.getItem('ros-center-wan-speeds') || '{}'); return num(c[name], 0) || Math.round(num(ifaceRaw(name).linkBps) / 1e6) || 1000; } catch (e) { return 1000; }
  }
  function saveWanSpeed(name, mbps) {
    try { const c = JSON.parse(localStorage.getItem('ros-center-wan-speeds') || '{}'); c[name] = mbps; localStorage.setItem('ros-center-wan-speeds', JSON.stringify(c)); } catch (e) { /* ignore */ }
  }

  /* ---------- 行过滤 ---------- */
  function queryFor(tab) {
    return (IFACE_TABS.some((t) => t[0] === tab) ? IV.q : IV.aq).trim().toLowerCase();
  }
  function matchQuery(r, q) {
    return !q || Object.values(r).some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0);
  }
  function ifaceBase() {
    const cfg = IV.data.interfaces || [];
    return cfg.length ? cfg : liveIfaces();
  }
  function ifaceRows() {
    let rows = ifaceBase().slice();
    if (IV.filter === 'physical') rows = rows.filter((r) => /ether|ethernet/i.test(r.type || r.name || ''));
    else if (IV.filter === 'logical') rows = rows.filter((r) => /bridge|pppoe|wireguard|vlan|loopback|^lo$/i.test((r.type || '') + ' ' + r.name));
    const q = IV.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => [r.name, r.type, r.comment, r['mac-address']].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0));
    return rows;
  }
  /* 桥接分页列 /interface/bridge/port：端口、角色、状态、路径开销、边缘 */
  function bridgePortRows() {
    const q = queryFor('bridge');
    return (IV.data.bridgePorts || []).filter((r) => matchQuery(r, q));
  }
  function bridgeIfaces() {
    return ifaceBase().filter((r) => /bridge/i.test(String(r.type || '')) || /^bridge/i.test(String(r.name || '')));
  }
  function portStatus(p) {
    const state = String(p.state || '').toLowerCase();
    const st = String(p.status || '').toLowerCase();
    if (p.disabled === 'true' || p.disabled === true) return { t: L('已禁用', 'Disabled'), d: 'is-muted' };
    if (state === 'forwarding' || (!state && st === 'in-bridge')) return { t: L('转发', 'Forwarding'), d: 'is-green' };
    if (state === 'blocking' || state === 'discarding') return { t: L('阻塞', 'Blocking'), d: 'is-amber' };
    if (state === 'learning') return { t: L('学习', 'Learning'), d: 'is-amber' };
    if (state === 'listening') return { t: L('侦听', 'Listening'), d: 'is-amber' };
    if (state === 'disabled' || st === 'inactive') return { t: L('未启用', 'Inactive'), d: 'is-red' };
    return { t: L('未知', 'Unknown'), d: 'is-muted' };
  }
  function portRateText(p) {
    const live = ifaceRaw(p.interface);
    const rate = p.rate ? String(p.rate) : (live.linkBps ? fmtRate(live.linkBps) : '');
    const duplex = p['full-duplex'] === 'true' ? L('全双工', 'full-duplex')
      : p['full-duplex'] === 'false' ? L('半双工', 'half-duplex') : '';
    return [rate, duplex].filter(Boolean).join(' · ');
  }
  function edgeLabel(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'yes' || s === 'true') return L('是', 'Yes');
    if (s === 'no' || s === 'false') return L('否', 'No');
    if (s === 'auto') return L('自动', 'Auto');
    return v || '—';
  }
  function genericRows(tab) {
    return (IV.data[sectionOf(tab)] || []).slice().filter((r) => matchQuery(r, queryFor(tab)));
  }

  /* ---------- 骨架屏 ---------- */
  function skeletonRows(n, cols) {
    let out = '';
    for (let i = 0; i < n; i++) {
      let cells = '';
      for (let j = 0; j < cols; j++) cells += `<td><span class="sk sk-line w${[55, 40, 70][j % 3]}"></span></td>`;
      out += `<tr class="iv-skel">${cells}<td></td></tr>`;
    }
    return out;
  }

  /* ---------- 工具栏 ---------- */
  function toolbarHtml(scope) {
    if (scope === 'addr') {
      const arpN = (IV.data.arp || []).length, nbN = (IV.data.neighbors || []).length;
      return `<div class="toolbar">
        <label class="field">${ic('search')}<input id="ivAddrSearch" placeholder="${esc(L('搜索地址、接口或 MAC…', 'Search address, interface or MAC…'))}" value="${ex(IV.aq)}"></label>
        <span class="toolbar-note">ARP <b>${arpN}</b> · ${esc(L('邻居', 'Neighbors'))} <b>${nbN}</b></span>
        <span class="spacer"></span>
        ${canEditNow() ? `<button class="btn" type="button" data-act="iv-add" data-scope="addr">${ic('plus')}${esc(L('新增', 'Add'))}</button>` : ''}
      </div>`;
    }
    const chips = IV.tab === 'ifaces'
      ? `<div class="chips">
        <button class="chip ${IV.filter === 'all' ? 'on' : ''}" type="button" data-act="iv-filter" data-filter="all">${esc(L('全部', 'All'))}</button>
        <button class="chip ${IV.filter === 'physical' ? 'on' : ''}" type="button" data-act="iv-filter" data-filter="physical">${esc(L('物理', 'Physical'))}</button>
        <button class="chip ${IV.filter === 'logical' ? 'on' : ''}" type="button" data-act="iv-filter" data-filter="logical">${esc(L('逻辑', 'Logical'))}</button>
      </div>`
      : `<div class="chips"><span class="chain">${esc(L('桥接端口', 'Bridge ports'))}</span></div>`;
    return `<div class="toolbar">
      <label class="field">${ic('search')}<input id="ivSearch" placeholder="${esc(L('搜索接口、地址或类型…', 'Search interface, address or type…'))}" value="${ex(IV.q)}"></label>
      ${chips}
      <span class="spacer"></span>
      ${canEditNow() ? `<button class="btn" type="button" data-act="iv-add" data-scope="if">${ic('plus')}${esc(L('新增', 'Add'))}</button>` : ''}
    </div>`;
  }

  /* 设计稿风格表尾：左侧统计摘要，右侧上下文操作链接 */
  function footFor(tab, rows) {
    const ifTab = tab === 'ifaces' || tab === 'bridge';
    const time = esc(relTime(ifTab ? IV.ifLoadedAt : IV.loadedAt));
    if (tab === 'ifaces') {
      return `<div class="table-foot"><span>${esc(L('显示', 'Showing'))} ${rows.length} / ${ifaceBase().length} · ${time}</span>
        <button class="link" type="button" data-act="iv-goto-logs">${esc(L('接口日志', 'Interface log'))}${ic('chevron')}</button></div>`;
    }
    if (tab === 'bridge') {
      const total = rows.length;
      const up = rows.filter((r) => portStatus(r).d === 'is-green').length;
      const summary = `${total} ${L('个端口', 'ports')} · ${up === total ? L('全部转发', 'All forwarding') : L(`${up} 个转发`, `${up} forwarding`)}`;
      const br = bridgeIfaces()[0] || {};
      return `<div class="table-foot"><span>${esc(summary)} · ${time}</span>
        ${br.name && canEditNow() ? `<button class="link" type="button" data-act="iv-row-edit" data-tab="ifaces" data-id="${ex(br['.id'] || '')}" data-name="${ex(br.name)}">${esc(L('STP 设置', 'STP settings'))}${ic('chevron')}</button>` : ''}</div>`;
    }
    const countText = `${rows.length} ${tab === 'addrs' ? L('个地址', 'addresses') : L('条记录', 'entries')}`
      + (tab === 'addrs' ? ` · ${(IV.data.ipv6 || []).length ? 'IPv6 ' + (IV.data.ipv6 || []).length : L('IPv6 未配置', 'IPv6 not configured')}` : '');
    const canAdd = canEditNow() && ['addrs', 'ipv6', 'pools', 'addrlists', 'addrlists6'].includes(tab);
    const label = tab === 'addrs' ? L('添加地址', 'Add address') : L('新增', 'Add');
    return `<div class="table-foot"><span>${esc(countText)} · ${time}</span>
      ${canAdd ? `<button class="link" type="button" data-act="iv-add" data-scope="addr">${esc(label)}${ic('chevron')}</button>` : ''}</div>`;
  }

  /* ---------- 面板 ---------- */
  function ifacesPanel() {
    if (!IV.ifLoadedAt && !(IV.data.interfaces || []).length && !liveIfaces().length) {
      const head = `<colgroup><col style="width:25%"><col style="width:9%"><col style="width:21%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col></colgroup>
        <thead><tr><th>${esc(L('接口', 'Interface'))}</th><th>${esc(L('状态', 'Status'))}</th><th>${esc(L('地址', 'Address'))}</th><th class="r">${esc(L('下行', 'RX'))}</th><th class="r">${esc(L('上行', 'TX'))}</th><th class="r">${esc(L('累计', 'Total'))}</th><th></th></tr></thead>`;
      return `<div class="table-scroll"><table class="dt">${head}<tbody>${skeletonRows(6, 6)}</tbody></table></div>`;
    }
    const rows = ifaceRows();
    const body = rows.map((r) => {
      const name = r.name || '—';
      const live = ifaceRaw(name), st = ifaceState(Object.assign({}, r, live));
      const a = addrsFor(name);
      const addr = a.v4[0] ? a.v4[0].address : (a.v6[0] ? a.v6[0].address : '—');
      const addrSub = a.v4.length + a.v6.length ? (a.v4.length + a.v6.length) + ' ' + L('个地址', 'addresses') : (r.comment || r.type || '');
      const rx = fmtRate(live.rxBps), tx = fmtRate(live.txBps);
      const total = (live.rxBytes == null && live.txBytes == null) ? '—' : fmtBytes(num(live.rxBytes) + num(live.txBytes));
      return `<tr>
        <td><div class="if-name">${ifaceBadge(name, r.type)}<div><b>${ex(name)}</b><small>${ex(r.type || 'Ethernet')} · MTU ${ex(r.mtu || '1500')}</small></div></div></td>
        <td><span class="status"><span class="dot ${st.d}"></span>${st.t}</span></td>
        <td><div class="cell"><b class="addr">${ex(addr)}</b><small>${ex(addrSub)}</small></div></td>
        <td class="r num" data-iv-rx="${ex(name)}">${ex(rx)}</td><td class="r num" data-iv-tx="${ex(name)}">${ex(tx)}</td><td class="r num" data-iv-total="${ex(name)}">${ex(total)}</td>
        <td><button class="row-more" type="button" data-act="iv-more" data-tab="ifaces" data-id="${ex(r['.id'] || '')}" data-name="${ex(name)}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:25%"><col style="width:9%"><col style="width:21%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col></colgroup>
      <thead><tr><th>${esc(L('接口', 'Interface'))}</th><th>${esc(L('状态', 'Status'))}</th><th>${esc(L('地址', 'Address'))}</th><th class="r">${esc(L('下行', 'RX'))}</th><th class="r">${esc(L('上行', 'TX'))}</th><th class="r">${esc(L('累计', 'Total'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="7" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无接口', 'No interfaces'))}</td></tr>`}</tbody></table></div>
      ${footFor('ifaces', rows)}`;
  }
  function bridgePanel(rows) {
    if (!IV.loadedAt && !rows.length) {
      const head = `<thead><tr><th>${esc(L('端口', 'Port'))}</th><th>${esc(L('角色', 'Role'))}</th><th>${esc(L('状态', 'State'))}</th><th>${esc(L('路径开销', 'Path cost'))}</th><th>${esc(L('边缘', 'Edge'))}</th><th></th></tr></thead>`;
      return `<div class="table-scroll"><table class="dt"><colgroup><col style="width:34%"><col style="width:14%"><col style="width:16%"><col style="width:14%"><col style="width:10%"><col></colgroup>${head}<tbody>${skeletonRows(5, 5)}</tbody></table></div>`;
    }
    const body = rows.map((p) => {
      const name = p.interface || p.name || '—';
      const rate = portRateText(p);
      const st = portStatus(p);
      const cost = String(p['path-cost'] || '');
      const costTxt = /^\d+$/.test(cost) ? Number(cost).toLocaleString('en-US') : (cost || L('自动', 'Auto'));
      return `<tr>
        <td><div class="if-name">${ifaceBadge(name, 'ether')}<div><b>${ex(name)}</b><small>${esc(rate || ('bridge ' + (p.bridge || '—')))}</small></div></div></td>
        <td><span class="chain">${esc(p.role || '—')}</span></td>
        <td><span class="status"><span class="dot ${st.d}"></span>${esc(st.t)}</span></td>
        <td class="num">${esc(costTxt)}</td>
        <td>${esc(edgeLabel(p.edge))}</td>
        <td><button class="row-more" type="button" data-act="iv-more" data-tab="bridge" data-id="${ex(p['.id'] || '')}" data-name="${ex(name)}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt">
      <colgroup><col style="width:34%"><col style="width:14%"><col style="width:16%"><col style="width:14%"><col style="width:10%"><col></colgroup>
      <thead><tr><th>${esc(L('端口', 'Port'))}</th><th>${esc(L('角色', 'Role'))}</th><th>${esc(L('状态', 'State'))}</th><th>${esc(L('路径开销', 'Path cost'))}</th><th>${esc(L('边缘', 'Edge'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无桥接端口', 'No bridge ports'))}</td></tr>`}</tbody></table></div>
      ${footFor('bridge', rows)}`;
  }
  /* 地址列表：与接口卡片一致的富单元格（地址 / 接口 / 类别 / 状态 / 备注） */
  function addrRichPanel(tab) {
    const rows = genericRows(tab);
    if (!IV.loadedAt && !rows.length) {
      return `<div class="table-scroll"><table class="dt"><thead><tr><th>${esc(L('地址', 'Address'))}</th><th>${esc(L('接口', 'Interface'))}</th><th>${esc(L('类别', 'Type'))}</th><th>${esc(L('状态', 'Status'))}</th><th>${esc(L('备注', 'Comment'))}</th><th></th></tr></thead><tbody>${skeletonRows(5, 5)}</tbody></table></div>`;
    }
    const body = rows.map((r) => {
      const dynamic = r.dynamic === 'true' || r.dynamic === true;
      const disabled = r.disabled === 'true' || r.disabled === true;
      return `<tr>
        <td><span class="addr mono">${esc(r.address || '—')}</span></td>
        <td><span class="chain">${esc(r.interface || '—')}</span></td>
        <td><span class="badge ${dynamic ? 'teal' : 'info'}">${esc(dynamic ? L('动态', 'Dynamic') : L('静态', 'Static'))}</span></td>
        <td><span class="status"><span class="dot ${disabled ? 'is-muted' : 'is-green'}"></span>${esc(disabled ? L('已禁用', 'Disabled') : L('已启用', 'Enabled'))}</span></td>
        <td class="note">${esc(r.comment || (tab === 'ipv6' && (r.advertise === 'true' || r.advertise === true) ? 'SLAAC' : '—'))}</td>
        <td><button class="row-more" type="button" data-act="iv-more" data-tab="${esc(tab)}" data-id="${ex(r['.id'] || '')}" data-name="${ex(r.address || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="dt">
      <thead><tr><th>${esc(L('地址', 'Address'))}</th><th>${esc(L('接口', 'Interface'))}</th><th>${esc(L('类别', 'Type'))}</th><th>${esc(L('状态', 'Status'))}</th><th>${esc(L('备注', 'Comment'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`}</tbody></table></div>
      ${footFor(tab, rows)}`;
  }
  function genericPanel(tab, rowsOverride) {
    const rows = rowsOverride || genericRows(tab);
    const cols = columnsFor(tab);
    if (!IV.loadedAt && !rows.length) {
      return `<div class="table-scroll"><table class="dt"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${skeletonRows(5, cols.length)}</tbody></table></div>`;
    }
    const body = rows.map((r) => `<tr>${cols.map(([k]) => {
      let v = r[k];
      if (v === 'true') v = L('是', 'Yes'); else if (v === 'false') v = L('否', 'No');
      return `<td data-label="${esc(k)}"><span class="${k === 'address' || k === 'mac-address' ? 'mono' : ''}">${ex(v == null || v === '' ? '—' : v)}</span></td>`;
    }).join('')}<td><button class="row-more" type="button" data-act="iv-more" data-tab="${esc(tab)}" data-id="${ex(r['.id'] || '')}" data-name="${ex(r.name || r.address || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td></tr>`).join('');
    return `<div class="table-scroll"><table class="dt"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`}</tbody></table></div>
      ${footFor(tab, rows)}`;
  }

  /* ---------- KPI ---------- */
  function kpiRate(r) {
    const f = fmtRate(r.rx + r.tx);
    return `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico teal">${ic('pulse')}</span>${esc(L('实时速率', 'Live rate'))}</div>
      <div class="kpi-main"><div class="kpi-num"><span id="ivRateMain">${f.split(' ')[0]}</span><span class="u" id="ivRateUnit">${f.split(' ')[1]}</span></div></div>
      <div class="kpi-foot"><span id="ivRateFoot">RX ${fmtRate(r.rx)} · TX ${fmtRate(r.tx)}</span><span>${esc(L('全部接口', 'All interfaces'))}</span></div></article>`;
  }
  function kpisHtml(r) {
    const ifs = ifaceBase(), v4 = IV.data.ipAddresses || [], v6 = IV.data.ipv6Addresses || [];
    const online = ifs.filter((x) => { const l = ifaceRaw(x.name); return (x.running === 'true' || (l && l.running === 'true')) && x.disabled !== 'true'; }).length;
    const totalBytes = liveIfaces().reduce((s, i) => s + num(i.rxBytes) + num(i.txBytes), 0);
    return `<section class="kpis">
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico blue">${ic('layers')}</span>${esc(L('接口总数', 'Interfaces'))}</div>
        <div class="kpi-main"><div class="kpi-num">${ifs.length}<span class="of">/ ${ifs.length}</span></div><span class="status"><span class="dot is-green"></span>${online} ${esc(L('在线', 'online'))}</span></div>
        <div class="kpi-foot"><span>${ifs.filter((x) => /ether|ethernet/i.test(x.type || '')).length} Ethernet</span><span>${ifs.filter((x) => /bridge|pppoe|wireguard|vlan/i.test(x.type || '')).length} ${esc(L('逻辑', 'Logical'))}</span></div></article>
      ${kpiRate(r)}
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico violet">${ic('chart')}</span>${esc(L('累计流量', 'Total traffic'))}</div>
        <div class="kpi-main"><div class="kpi-num">${fmtBytes(totalBytes).split(' ')[0]}<span class="u">${fmtBytes(totalBytes).split(' ')[1]}</span></div></div>
        <div class="kpi-foot"><span>${esc(L('所有接口累计', 'All interfaces'))}</span><span>${ifs.length} ${esc(L('个接口', 'interfaces'))}</span></div></article>
      <article class="card kpi"><div class="kpi-top"><span class="kpi-ico green">${ic('globe')}</span>${esc(L('IP 地址', 'IP addresses'))}</div>
        <div class="kpi-main"><div class="kpi-num">${v4.length + v6.length}</div><span class="status"><span class="dot is-green"></span>${esc(L('正常', 'OK'))}</span></div>
        <div class="kpi-foot"><span>IPv4 ${v4.length}</span><span>IPv6 ${v6.length}</span></div></article>
    </section>`;
  }

  /* ---------- 右侧卡片：WAN 连接 / 错误与丢包 ---------- */
  function wanCard() {
    const name = wanName();
    const row = (IV.data.interfaces || []).find((r) => r.name === name) || {};
    const live = ifaceRaw(name);
    const st = ifaceState(Object.assign({}, row, live));
    const addrRow = (IV.data.ipAddresses || []).find((a) => a.interface === name)
      || (IV.data.ipv6Addresses || []).find((a) => a.interface === name) || {};
    const full = String(addrRow.address || '');
    const slash = full.indexOf('/');
    const ip = slash >= 0 ? full.slice(0, slash) : (full || '—');
    const prefix = slash >= 0 ? full.slice(slash) : '';
    const connected = st.d === 'is-green';
    const stTxt = connected ? L('已连接', 'Connected') : (st.d === 'is-muted' ? L('已禁用', 'Disabled') : L('未连接', 'Disconnected'));
    const dynamic = /pppoe|dhcp/i.test(String(row.type || '')) || addrRow.dynamic === 'true';
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${esc(L('WAN 连接', 'WAN connection'))}</h2>
        <div class="card-sub">${ex(name)} · ${esc(dynamic ? L('动态获取', 'Dynamic') : L('静态配置', 'Static'))}</div></div>
        <span class="status"><span class="dot ${connected ? 'is-green' : 'is-muted'}"></span>${esc(stTxt)}</span></div>
      <div class="rail-body">
        <div class="ip-big">${ex(ip)}${prefix ? `<span style="font:500 11px var(--v2-font);color:var(--v2-faint);margin-left:6px">${ex(prefix)}</span>` : ''}</div>
        <div class="sub-note" style="margin-top:3px">${esc(isPrivateIp(ip) ? L('私网地址', 'Private address') : L('公网地址', 'Public address'))} · ${esc(String(row.type || '—'))}</div>
        <div style="height:10px"></div>
        <div class="kv"><span>${esc(L('下行', 'RX'))}</span><b class="mono" id="ivWanRx">${fmtRate(live.rxBps)}</b></div>
        <div class="kv"><span>${esc(L('上行', 'TX'))}</span><b class="mono" id="ivWanTx">${fmtRate(live.txBps)}</b></div>
        <div class="kv"><span>${esc(L('接口', 'Interface'))}</span><b class="mono">${ex(name)}</b></div>
        <div class="kv"><span>MTU</span><b>${ex(row.mtu || '—')}</b></div>
        <button class="link" type="button" data-act="iv-wan">${esc(L('WAN 设置', 'WAN settings'))}${ic('chevron')}</button>
      </div></section>`;
  }
  function errCard() {
    let rxErr = 0, txErr = 0, rxDrop = 0, txDrop = 0, coll = 0, hasField = false;
    const rows = IV.data.interfaces || [];
    rows.forEach((r) => {
      if ('rx-error' in r || 'rxErrors' in r || 'rx-drop' in r || 'rxDrops' in r) hasField = true;
      rxErr += num(r['rx-error'] != null ? r['rx-error'] : r.rxErrors);
      txErr += num(r['tx-error'] != null ? r['tx-error'] : r.txErrors);
      rxDrop += num(r['rx-drop'] != null ? r['rx-drop'] : r.rxDrops);
      txDrop += num(r['tx-drop'] != null ? r['tx-drop'] : r.txDrops);
      coll += num(r.collisions != null ? r.collisions : r.collision);
    });
    /* 演示/旧固件下 config 行无错误字段时，回退到 snapshot 真实计数器 */
    if (!hasField && rows.length) liveIfaces().forEach((i) => {
      rxErr += num(i.rxErrors); txErr += num(i.txErrors); rxDrop += num(i.rxDrops); txDrop += num(i.txDrops);
    });
    const drops = rxDrop + txDrop;
    const bad = rxErr + txErr + drops + coll;
    return `<section class="card">
      <div class="card-head"><div><h2 class="card-title">${esc(L('错误与丢包', 'Errors & drops'))}</h2>
        <div class="card-sub">${esc(L('所有接口 · 自上次启动', 'All interfaces · since boot'))}</div></div>
        <span class="status"><span class="dot ${bad ? 'is-amber' : 'is-green'}"></span>${esc(bad ? L('有异常', 'Attention') : L('正常', 'OK'))}</span></div>
      <div class="rail-body"><div class="mini-stats">
        <div class="mini-stat"><small>${esc(L('RX 错误', 'RX errors'))}</small><b>${rxErr}</b></div>
        <div class="mini-stat"><small>${esc(L('TX 错误', 'TX errors'))}</small><b>${txErr}</b></div>
        <div class="mini-stat"><small>${esc(L('丢包', 'Drops'))}</small><b style="color:${drops ? 'var(--v2-amber)' : ''}">${drops}</b></div>
        <div class="mini-stat"><small>${esc(L('冲突', 'Collisions'))}</small><b>${coll}</b></div>
      </div></div></section>`;
  }

  /* ---------- 页签 HTML ---------- */
  function ifaceTabsHtml() {
    return IFACE_TABS.map(([k, zh, en]) => {
      const n = k === 'ifaces' ? ifaceBase().length : bridgePortRows().length;
      return `<button class="panel-tab ${k === IV.tab ? 'on' : ''}" type="button" data-act="iv-tab" data-tab="${k}">${esc(L(zh, en))}<span class="pt-count">${n}</span></button>`;
    }).join('');
  }
  function addrTabsHtml() {
    return ADDR_TABS.map(([k, zh, en]) => {
      const n = (IV.data[sectionOf(k)] || []).length;
      return `<button class="panel-tab ${k === IV.addrTab ? 'on' : ''}" type="button" data-act="iv-atab" data-tab="${k}">${esc(L(zh, en))}<span class="pt-count">${n}</span></button>`;
    }).join('');
  }

  function html() {
    const r = rateSources();
    return `<div class="page-head"><div><h1>${esc(L('接口与地址', 'Interfaces & addresses'))}</h1>
      <div class="meta">${ifaceBase().length} ${esc(L('个接口', 'interfaces'))}<span class="sep"></span>${esc(wanName())} WAN<span class="sep"></span>${esc(relTime(IV.loadedAt || IV.ifLoadedAt))}</div></div>
      <div class="actions"><button class="btn ghost" type="button" data-act="iv-wan">${ic('globe')}${esc(L('WAN 设置', 'WAN settings'))}</button></div></div>
    ${IV.err ? `<div class="notice" style="color:var(--v2-red)">${ex(IV.err)}</div>` : ''}
    <div class="grid align-start">
      ${kpisHtml(r)}
      <div class="span8 iv-main-col">
        <section class="card iv-card-ifaces"><div class="card-head"><div><h2 class="card-title">${esc(L('接口列表', 'Interface list'))}</h2>
          <div class="card-sub">${esc(L('接口 / 桥接', 'Interfaces / bridge'))}</div></div>
          <button class="btn icon-only" type="button" data-act="iv-menu" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}">${ic('more')}</button></div>
          <div class="panel-tabs" data-tabs>${ifaceTabsHtml()}</div>
          <div class="tab-panel on">${toolbarHtml('if')}${IV.tab === 'ifaces' ? ifacesPanel() : bridgePanel(bridgePortRows())}</div>
        </section>
        <section class="card iv-card-addrs"><div class="card-head"><div><h2 class="card-title">${esc(L('地址列表', 'Address list'))}</h2>
          <div class="card-sub">${esc(L('IPv4 / IPv6 / ARP / 邻居 / 地址池 / 地址列表', 'IPv4 / IPv6 / ARP / neighbors / pools / address lists'))}</div></div></div>
          <div class="panel-tabs" data-tabs>${addrTabsHtml()}</div>
          <div class="tab-panel on">${toolbarHtml('addr')}${['addrs', 'ipv6'].indexOf(IV.addrTab) >= 0 ? addrRichPanel(IV.addrTab) : genericPanel(IV.addrTab)}</div>
        </section>
      </div>
      <div class="span4 rail">${wanCard()}${errCard()}</div>
    </div>`;
  }

  /* ---------- 渲染 ---------- */
  function setText(id, t) { const n = $(id); if (n && n.textContent !== t) n.textContent = t; }
  function updateLive() {
    if (state.section !== 'interfacesCenter' || !$('ivRateMain')) return;
    const r = rateSources();
    const f = fmtRate(r.rx + r.tx);
    setText('ivRateMain', f.split(' ')[0]);
    setText('ivRateUnit', f.split(' ')[1]);
    setText('ivRateFoot', 'RX ' + fmtRate(r.rx) + ' · TX ' + fmtRate(r.tx));
    /* 表格内每个接口的下行 / 上行 / 累计跟随快照逐帧刷新，不必等整表重绘 */
    const byName = new Map(liveIfaces().map((i) => [i.name, i]));
    document.querySelectorAll('[data-iv-rx]').forEach((td) => {
      const i = byName.get(td.dataset.ivRx);
      if (i) td.textContent = fmtRate(i.rxBps);
    });
    document.querySelectorAll('[data-iv-tx]').forEach((td) => {
      const i = byName.get(td.dataset.ivTx);
      if (i) td.textContent = fmtRate(i.txBps);
    });
    document.querySelectorAll('[data-iv-total]').forEach((td) => {
      const i = byName.get(td.dataset.ivTotal);
      if (i) td.textContent = (i.rxBytes == null && i.txBytes == null) ? '—' : fmtBytes(num(i.rxBytes) + num(i.txBytes));
    });
    const name = wanName(), li = liveIfaces().find((i) => i.name === name);
    setText('ivWanRx', fmtRate(li ? li.rxBps : 0));
    setText('ivWanTx', fmtRate(li ? li.txBps : 0));
  }
  function focusInput(id) { const n = $(id); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }
  function bindSearch() {
    const s = $('ivSearch');
    if (s) s.oninput = () => { IV.q = s.value; repaintCard('.iv-card-ifaces'); focusInput('ivSearch'); };
    const a = $('ivAddrSearch');
    if (a) a.oninput = () => { IV.aq = a.value; repaintCard('.iv-card-addrs'); focusInput('ivAddrSearch'); };
  }
  function paint() {
    const c = $('content'); if (!c || state.section !== 'interfacesCenter') return;
    const active = document.activeElement;
    const fid = active && (active.id === 'ivSearch' || active.id === 'ivAddrSearch') ? active.id : null;
    const pos = fid ? active.selectionStart : 0;
    c.className = 'content dash pg-interfaces';
    c.innerHTML = html();
    bindSearch();
    if (fid) { const n = $(fid); if (n) { try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } n.focus(); } }
  }
  function repaintCard(cls) {
    const card = document.querySelector('.pg-interfaces ' + cls); if (!card) return;
    const tabs = card.querySelector('.panel-tabs'), panel = card.querySelector('.tab-panel');
    if (cls === '.iv-card-ifaces') {
      if (tabs) tabs.innerHTML = ifaceTabsHtml();
      if (panel) panel.innerHTML = toolbarHtml('if') + (IV.tab === 'ifaces' ? ifacesPanel() : bridgePanel(bridgePortRows()));
    } else {
      if (tabs) tabs.innerHTML = addrTabsHtml();
      if (panel) panel.innerHTML = toolbarHtml('addr') + (['addrs', 'ipv6'].indexOf(IV.addrTab) >= 0 ? addrRichPanel(IV.addrTab) : genericPanel(IV.addrTab));
    }
    bindSearch();
  }

  /* ---------- 弹窗：查看 / 复制摘要 / 编辑 / 删除 ---------- */
  function rowMenu(id, name, anchor, tab) {
    tab = tab || IV.tab;
    const head = `<div class="ui-menu-head"><b>${esc(name)}</b><small>${esc(rowSectionLabel(tab))}</small></div>`;
    /* ARP / 邻居 / IPv6 邻居为只读表格：三点菜单仅有「复制摘要」 */
    if (READONLY_TABS.indexOf(tab) >= 0) {
      UI.openMenu(anchor, [{ label: L('复制摘要', 'Copy summary'), checkSlot: true, action: () => copySummary(id, name, tab) }], { head });
      return;
    }
    UI.openMenu(anchor, [
      { label: L('查看', 'View'), checkSlot: true, action: () => openView(id, name, tab) },
      { label: L('复制摘要', 'Copy summary'), checkSlot: true, action: () => copySummary(id, name, tab) },
      ...(canEditNow() ? [
        { label: L('编辑', 'Edit'), checkSlot: true, action: () => openEdit(id, name, tab) },
        { sep: true },
        { label: L('删除', 'Delete'), checkSlot: true, danger: true, action: () => openDelete(id, name, tab) },
      ] : []),
    ], { head });
  }
  function rowSectionLabel(tab) {
    const t = TABS.find((x) => x[0] === tab);
    return t ? L(t[1], t[2]) : L('接口', 'Interface');
  }
  function currentRow(id, name, tab) {
    const base = tab === 'bridge' ? (IV.data.bridgePorts || []) : tab === 'ifaces' ? ifaceBase() : (IV.data[sectionOf(tab)] || []);
    return base.find((r) => r['.id'] === id) || base.find((r) => (r.name || r.address || r.interface) === name) || {};
  }
  function yesNo(v) { return (v === true || v === 'true') ? L('是', 'Yes') : (v === false || v === 'false') ? L('否', 'No') : '—'; }
  function summarize(id, name, tab) {
    const r = currentRow(id, name, tab);
    if (tab === 'arp') return [
      [L('IP 地址', 'IP'), r.address || name], ['MAC', r['mac-address'] || '—'],
      [L('接口', 'Interface'), r.interface || '—'], [L('动态', 'Dynamic'), yesNo(r.dynamic)],
      [L('完成', 'Complete'), yesNo(r.complete)],
    ];
    if (tab === 'neighbors') return [
      [L('设备名', 'Identity'), r.identity || '—'], [L('地址', 'Address'), r.address || name],
      ['MAC', r['mac-address'] || '—'], [L('接口', 'Interface'), r.interface || '—'],
      [L('平台', 'Platform'), r.platform || '—'], [L('版本', 'Version'), r.version || '—'],
    ];
    if (tab === 'ipv6n') return [
      [L('IPv6 地址', 'IPv6'), r.address || name], ['MAC', r['mac-address'] || '—'],
      [L('接口', 'Interface'), r.interface || '—'], [L('状态', 'Status'), r.status || '—'],
    ];
    if (tab === 'addrlists' || tab === 'addrlists6') return [
      [L('列表名', 'List'), r.list || '—'], [L('地址', 'Address'), r.address || name],
      [L('超时', 'Timeout'), r.timeout || '—'], [L('禁用', 'Disabled'), yesNo(r.disabled)],
      [L('备注', 'Comment'), r.comment || '—'],
    ];
    if (tab === 'pools') return [
      [L('名称', 'Name'), r.name || name], [L('范围', 'Ranges'), r.ranges || '—'],
      [L('备注', 'Comment'), r.comment || '—'],
    ];
    if (tab === 'addrs' || tab === 'ipv6') return [
      [L('地址', 'Address'), r.address || name], [L('接口', 'Interface'), r.interface || '—'],
      [tab === 'addrs' ? L('网络', 'Network') : 'SLAAC', tab === 'addrs' ? (r.network || '—') : yesNo(r.advertise)],
      [L('禁用', 'Disabled'), yesNo(r.disabled)], [L('备注', 'Comment'), r.comment || '—'],
    ];
    if (tab === 'bridge') {
      const st = portStatus(r);
      return [
        [L('端口', 'Port'), r.interface || name], [L('桥接', 'Bridge'), r.bridge || '—'],
        [L('角色', 'Role'), r.role || '—'], [L('状态', 'State'), st.t],
        [L('路径开销', 'Path cost'), r['path-cost'] || L('自动', 'Auto')],
        [L('边缘端口', 'Edge'), edgeLabel(r.edge)], ['PVID', r.pvid || '—'],
        [L('优先级', 'Priority'), r.priority || '—'], [L('备注', 'Comment'), r.comment || '—'],
      ];
    }
    const a = addrsFor(name);
    const live = ifaceRaw(name);
    return [
      [L('名称', 'Name'), r.name || name],
      [L('类型', 'Type'), r.type || '—'],
      [L('状态', 'Status'), ifaceState(Object.assign({}, r, live)).t],
      [L('MAC', 'MAC'), r['mac-address'] || '—'],
      [L('MTU', 'MTU'), r.mtu || '—'],
      [L('IPv4 地址', 'IPv4'), a.v4.map((x) => x.address).join(', ') || '—'],
      [L('IPv6 本地', 'IPv6 link-local'), a.v6.filter((x) => isLinkLocal(x.address)).map((x) => x.address).join(', ') || '—'],
      [L('IPv6 GUA', 'IPv6 GUA'), a.v6.filter((x) => !isLinkLocal(x.address)).map((x) => x.address).join(', ') || '—'],
      [L('速率', 'Speed'), live.linkBps ? fmtRate(live.linkBps) : '—'],
      [L('备注', 'Comment'), r.comment || '—'],
    ];
  }
  function openView(id, name, tab) {
    const rows = summarize(id, name, tab);
    UI.openModal({ title: name, sub: L('接口详情 · 真实数据', 'Interface details · live'),
      body: `<div class="ui-detail">${rows.map(([k, v]) => `<div class="ui-detail-row"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`,
      actions: [
        { label: L('复制摘要', 'Copy summary'), onClick: () => v2Copy(rows.map(([k, v]) => k + '：' + v).join('\n'), L('已复制摘要', 'Summary copied')) },
        { label: L('编辑', 'Edit'), cls: 'primary', onClick: () => openEdit(id, name, tab) },
        { label: L('删除', 'Delete'), cls: 'danger', onClick: () => openDelete(id, name, tab) },
        { label: L('关闭', 'Close') },
      ] });
  }
  function v2Copy(text, tip) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => UI.toast(tip, 'ok')).catch(() => fallback());
    else fallback();
    function fallback() { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); UI.toast(tip, 'ok'); } catch (e) { UI.toast(L('复制失败', 'Copy failed'), 'err'); } t.remove(); }
  }
  function copySummary(id, name, tab) { const rows = summarize(id, name, tab); v2Copy(rows.map(([k, v]) => k + '：' + v).join('\n'), L('已复制摘要', 'Summary copied')); }
  function openEdit(id, name, tab) {
    const r = currentRow(id, name, tab);
    const isIface = tab === 'ifaces';
    const fields = [];
    if (tab === 'bridge') {
      const ifs = ifaceBase().map((i) => i.name).filter(Boolean);
      const brs = bridgeIfaces().map((i) => i.name).filter(Boolean);
      fields.push({ key: 'interface', label: L('端口', 'Port'), type: 'select', value: r.interface || name, options: ifs, required: true });
      fields.push({ key: 'bridge', label: L('桥接', 'Bridge'), type: 'select', value: r.bridge || (brs[0] || ''), options: brs, required: true });
      fields.push({ key: 'priority', label: L('优先级', 'Priority'), value: r.priority || '0x80', placeholder: '0x80' });
      fields.push({ key: 'edge', label: L('边缘端口', 'Edge'), type: 'select', value: String(r.edge || 'auto'), options: ['auto', 'yes', 'no'] });
      fields.push({ key: 'pvid', label: 'PVID', type: 'number', value: num(r.pvid, 1) });
      fields.push({ key: 'frame-types', label: L('帧类型', 'Frame types'), type: 'select', value: r['frame-types'] || 'admit-all',
        options: ['admit-all', 'admit-only-untagged-and-priority-tagged', 'admit-only-vlan-tagged'] });
      fields.push({ key: 'path-cost', label: L('路径开销', 'Path cost'), value: r['path-cost'] || '', placeholder: L('留空为自动', 'Blank = auto') });
      fields.push({ key: 'ingress-filtering', label: L('入口过滤', 'Ingress filtering'), type: 'switch', value: r['ingress-filtering'] !== 'false' && r['ingress-filtering'] !== false });
      fields.push({ key: 'bpdu-guard', label: 'BPDU Guard', type: 'switch', value: r['bpdu-guard'] === 'true' || r['bpdu-guard'] === true });
      fields.push({ key: 'hw', label: L('硬件卸载', 'Hardware offload'), type: 'switch', value: r.hw === 'true' || r.hw === true });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
      fields.push({ key: 'disabled', label: L('禁用', 'Disabled'), type: 'switch', value: r.disabled === 'true' || r.disabled === true });
    } else if (isIface) {
      fields.push({ key: 'name', label: L('名称', 'Name'), value: r.name || name, required: true });
      fields.push({ key: 'mtu', label: 'MTU', type: 'number', value: num(r.mtu, 1500) });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
      fields.push({ key: 'disabled', label: L('禁用', 'Disabled'), type: 'switch', value: r.disabled === 'true' || r.disabled === true });
      fields.push({ key: 'speed', label: L('链路带宽 (Mbps)', 'Link speed (Mbps)'), type: 'number', value: wanSpeed(name), hint: L('自动获取不到时可手动设定，用于利用率计算', 'Set manually when auto-detection fails') });
    } else if (tab === 'addrs') {
      fields.push({ key: 'address', label: L('IPv4 地址', 'IPv4 address'), value: r.address || '', required: true, placeholder: '10.0.0.1/24' });
      fields.push({ key: 'interface', label: L('接口', 'Interface'), type: 'select', value: r.interface || '', options: liveIfaces().map((i) => i.name) });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
    } else if (tab === 'ipv6') {
      fields.push({ key: 'address', label: L('IPv6 地址', 'IPv6 address'), value: r.address || '', required: true, placeholder: '2001:db8::1/64' });
      fields.push({ key: 'interface', label: L('接口', 'Interface'), type: 'select', value: r.interface || '', options: liveIfaces().map((i) => i.name) });
      fields.push({ key: 'advertise', label: L('SLAAC 发布', 'SLAAC advertise'), type: 'switch', value: r.advertise === 'true' || r.advertise === true });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
    } else if (tab === 'addrlists' || tab === 'addrlists6') {
      fields.push({ key: 'list', label: L('列表名', 'List'), value: r.list || '', required: true });
      fields.push({ key: 'address', label: tab === 'addrlists6' ? L('IPv6 地址', 'IPv6 address') : L('IP 地址', 'IP address'), value: r.address || '', required: true });
      fields.push({ key: 'timeout', label: L('超时（留空为永久）', 'Timeout (blank = never)'), value: r.timeout || '' });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
      fields.push({ key: 'disabled', label: L('禁用', 'Disabled'), type: 'switch', value: r.disabled === 'true' || r.disabled === true });
    } else if (tab === 'pools') {
      fields.push({ key: 'name', label: L('名称', 'Name'), value: r.name || name, required: true });
      fields.push({ key: 'ranges', label: L('范围', 'Ranges'), value: r.ranges || '', required: true });
      fields.push({ key: 'comment', label: L('备注', 'Comment'), value: r.comment || '' });
    } else {
      UI.toast(L('此表为只读', 'Read-only table'), 'info'); return;
    }
    UI.openForm({ title: L('编辑', 'Edit') + ' · ' + name, sub: L('修改后写入 RouterOS', 'Changes are written to RouterOS'), fields,
      note: L('IPv6 地址在「IPv6」页签管理；查看可同时看到本地链路与 GUA 地址。', 'IPv6 addresses are managed under the IPv6 tab; View shows both link-local and GUA.'),
      onSubmit: async (v) => {
        try {
          if (isIface && v.speed) saveWanSpeed(name, Number(v.speed));
          const values = Object.assign({}, v); delete values.speed;
          await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: sectionOf(tab), action: 'set', ids: [id], values }) });
          UI.toast(L('已保存', 'Saved'), 'ok'); loadAll(true);
        } catch (e) { UI.toast(e.message, 'err'); }
      } });
  }
  function openDelete(id, name, tab) {
    if (READONLY_TABS.indexOf(tab) >= 0) { UI.toast(L('此表为只读，不能删除', 'Read-only, cannot delete'), 'warn'); return; }
    UI.openConfirm({ title: L('删除记录', 'Delete record'), warningTitle: L('确认删除？', 'Delete this record?'),
      message: `<b>${esc(name)}</b> ${L('将从 RouterOS 删除，此操作不可恢复。', 'will be removed from RouterOS. This cannot be undone.')}`,
      danger: true, confirmLabel: L('删除', 'Delete'), onConfirm: async () => {
        try { await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: sectionOf(tab), action: 'remove', ids: [id] }) });
          UI.toast(L('已删除', 'Deleted'), 'ok'); loadAll(true);
        } catch (e) { UI.toast(e.message, 'err'); }
      } });
  }
  const IFACE_ADD_SECTION = { bridge: 'bridgeIfaces', vlan: 'vlanIfaces', veth: 'vethIfaces', wireguard: 'wireguard' };
  const IFACE_ADD_KEYS = {
    bridge: ['name', 'mtu', 'comment', 'disabled', 'protocol-mode', 'vlan-filtering', 'ageing-time', 'priority', 'arp', 'auto-mac', 'admin-mac', 'igmp-snooping', 'dhcp-snooping'],
    vlan: ['name', 'mtu', 'comment', 'disabled', 'arp', 'interface', 'vlan-id', 'use-service-tag'],
    veth: ['name', 'comment', 'disabled', 'address', 'gateway'],
    wireguard: ['name', 'mtu', 'comment', 'disabled', 'listen-port'],
  };
  function ifaceAddFields() {
    const ifs = ifaceBase().map((i) => i.name).filter(Boolean);
    return [
      { key: 'type', label: L('接口类型', 'Interface type'), type: 'select', value: 'bridge', options: ['bridge', 'vlan', 'veth', 'wireguard'], hint: L('不同类型对应 RouterOS 不同菜单，按需填写下方字段', 'Each type maps to a RouterOS menu; fill the fields that apply') },
      { key: 'name', label: L('名称', 'Name'), required: true, placeholder: 'bridge-lan / vlan100 / wg1' },
      { key: 'mtu', label: 'MTU', type: 'number', value: 1500 },
      { key: 'arp', label: 'ARP', type: 'select', value: 'enabled', options: ['enabled', 'disabled', 'proxy-arp', 'reply-only', 'local-proxy-arp'], hint: L('桥接 / VLAN', 'Bridge / VLAN') },
      { key: 'protocol-mode', label: L('STP 协议模式', 'STP protocol mode'), type: 'select', value: 'rstp', options: ['rstp', 'stp', 'mstp', 'none'], hint: L('仅桥接', 'Bridge only') },
      { key: 'vlan-filtering', label: L('VLAN 过滤', 'VLAN filtering'), type: 'switch', value: false, hint: L('仅桥接', 'Bridge only') },
      { key: 'ageing-time', label: L('MAC 老化时间', 'Ageing time'), value: '5m', hint: L('仅桥接，例如 5m', 'Bridge only, e.g. 5m') },
      { key: 'priority', label: L('桥优先级', 'Bridge priority'), value: '0x8000', hint: L('仅桥接', 'Bridge only') },
      { key: 'auto-mac', label: L('自动 MAC', 'Auto MAC'), type: 'switch', value: true, hint: L('仅桥接', 'Bridge only') },
      { key: 'admin-mac', label: L('管理 MAC', 'Admin MAC'), placeholder: 'AA:BB:CC:DD:EE:FF', hint: L('仅桥接，关闭自动 MAC 时使用', 'Bridge only, used when auto MAC is off') },
      { key: 'igmp-snooping', label: 'IGMP Snooping', type: 'switch', value: false, hint: L('仅桥接', 'Bridge only') },
      { key: 'dhcp-snooping', label: 'DHCP Snooping', type: 'switch', value: false, hint: L('仅桥接', 'Bridge only') },
      { key: 'interface', label: L('父接口（VLAN）', 'Parent interface (VLAN)'), type: 'select', value: (ifs[0] || ''), options: ifs, hint: L('仅 VLAN', 'VLAN only') },
      { key: 'vlan-id', label: 'VLAN ID', type: 'number', hint: L('仅 VLAN，1-4094', 'VLAN only, 1-4094') },
      { key: 'use-service-tag', label: 'Service Tag', type: 'switch', value: false, hint: L('仅 VLAN', 'VLAN only') },
      { key: 'listen-port', label: L('监听端口', 'Listen port'), type: 'number', value: 51820, hint: L('仅 WireGuard', 'WireGuard only') },
      { key: 'address', label: L('容器地址', 'VETH address'), placeholder: '172.17.0.2/24', hint: L('仅 VETH', 'VETH only') },
      { key: 'gateway', label: L('容器网关', 'VETH gateway'), placeholder: '172.17.0.1', hint: L('仅 VETH', 'VETH only') },
      { key: 'comment', label: L('备注', 'Comment') },
      { key: 'disabled', label: L('禁用', 'Disabled'), type: 'switch', value: false },
    ];
  }
  function bridgePortAddFields() {
    const ifs = ifaceBase().map((i) => i.name).filter(Boolean);
    const brs = bridgeIfaces().map((i) => i.name).filter(Boolean);
    return [
      { key: 'interface', label: L('端口', 'Port'), type: 'select', value: (ifs.filter((n) => brs.indexOf(n) < 0)[0] || ifs[0] || ''), options: ifs, required: true },
      brs.length
        ? { key: 'bridge', label: L('桥接', 'Bridge'), type: 'select', value: brs[0], options: brs, required: true }
        : { key: 'bridge', label: L('桥接', 'Bridge'), value: 'bridge-lan', required: true, placeholder: 'bridge-lan' },
      { key: 'priority', label: L('优先级', 'Priority'), value: '0x80', placeholder: '0x80' },
      { key: 'edge', label: L('边缘端口', 'Edge'), type: 'select', value: 'auto', options: ['auto', 'yes', 'no'] },
      { key: 'pvid', label: 'PVID', type: 'number', value: 1 },
      { key: 'frame-types', label: L('帧类型', 'Frame types'), type: 'select', value: 'admit-all',
        options: ['admit-all', 'admit-only-untagged-and-priority-tagged', 'admit-only-vlan-tagged'] },
      { key: 'path-cost', label: L('路径开销', 'Path cost'), placeholder: L('留空为自动', 'Blank = auto') },
      { key: 'ingress-filtering', label: L('入口过滤', 'Ingress filtering'), type: 'switch', value: true },
      { key: 'bpdu-guard', label: 'BPDU Guard', type: 'switch', value: false },
      { key: 'hw', label: L('硬件卸载', 'Hardware offload'), type: 'switch', value: true },
      { key: 'comment', label: L('备注', 'Comment') },
      { key: 'disabled', label: L('禁用', 'Disabled'), type: 'switch', value: false },
    ];
  }
  function openAdd(scope) {
    const tab = scope === 'addr' ? IV.addrTab : IV.tab;
    if (!['ifaces', 'bridge', 'addrs', 'ipv6', 'pools', 'addrlists', 'addrlists6'].includes(tab)) { UI.toast(L('此表不支持新增', 'Cannot add here'), 'warn'); return; }
    if (tab === 'bridge') {
      UI.openForm({ title: L('新增桥接端口', 'Add bridge port'), sub: '/interface/bridge/port', fields: bridgePortAddFields(), onSubmit: async (v) => {
        try { await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'bridgePorts', action: 'add', values: v }) }); UI.toast(L('已添加', 'Added'), 'ok'); loadAll(true); }
        catch (e) { UI.toast(e.message, 'err'); }
      } });
      return;
    }
    if (tab === 'ifaces') {
      UI.openForm({ title: L('新增接口', 'Add interface'), sub: L('按类型写入对应 RouterOS 菜单', 'Written to the matching RouterOS menu'), fields: ifaceAddFields(), note: L('RouterOS 的 /interface 本身没有 add 命令：桥接、VLAN、VETH、WireGuard 分别写入各自菜单。', 'RouterOS /interface has no add command: bridge, VLAN, VETH and WireGuard each live in their own menu.'),
        onSubmit: async (v) => {
          try {
            const type = String(v.type || 'bridge');
            const section = IFACE_ADD_SECTION[type] || 'bridgeIfaces';
            const keep = IFACE_ADD_KEYS[type] || IFACE_ADD_KEYS.bridge;
            const values = {};
            keep.forEach((k) => { if (v[k] !== undefined && v[k] !== '' && v[k] !== null) values[k] = v[k]; });
            await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, action: 'add', values }) });
            UI.toast(L('已添加', 'Added'), 'ok'); loadAll(true);
          } catch (e) { UI.toast(e.message, 'err'); }
        } });
      return;
    }
    let fields;
    if (tab === 'addrs') fields = [{ key: 'address', label: L('IPv4 地址', 'IPv4 address'), required: true, placeholder: '10.0.0.1/24' }, { key: 'interface', label: L('接口', 'Interface'), type: 'select', options: liveIfaces().map((i) => i.name) }, { key: 'comment', label: L('备注', 'Comment') }];
    else if (tab === 'ipv6') fields = [{ key: 'address', label: L('IPv6 地址', 'IPv6 address'), required: true, placeholder: '2001:db8::1/64' }, { key: 'interface', label: L('接口', 'Interface'), type: 'select', options: liveIfaces().map((i) => i.name) }];
    else if (tab === 'addrlists' || tab === 'addrlists6') fields = [{ key: 'list', label: L('列表名', 'List'), required: true }, { key: 'address', label: tab === 'addrlists6' ? L('IPv6 地址', 'IPv6 address') : L('IP 地址', 'IP address'), required: true, placeholder: tab === 'addrlists6' ? '2001:db8::/32' : '203.0.113.10/32' }, { key: 'timeout', label: L('超时（留空为永久）', 'Timeout (blank = never)') }, { key: 'comment', label: L('备注', 'Comment') }];
    else fields = [{ key: 'name', label: L('名称', 'Name'), required: true }, { key: 'ranges', label: L('范围', 'Ranges'), required: true, placeholder: '10.0.0.100-10.0.0.200' }];
    UI.openForm({ title: L('新增', 'Add'), fields, onSubmit: async (v) => {
      try { await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: sectionOf(tab), action: 'add', values: v }) }); UI.toast(L('已添加', 'Added'), 'ok'); loadAll(true); }
      catch (e) { UI.toast(e.message, 'err'); }
    } });
  }
  function openWanSettings() {
    const ifs = liveIfaces();
    const cur = wanName();
    UI.openForm({ title: L('WAN 口设置', 'WAN settings'), sub: L('用于流量统计与峰值计算', 'Used for traffic stats and peak calculation'),
      fields: [
        { key: 'name', label: L('WAN 接口', 'WAN interface'), type: 'select', value: cur, options: ifs.map((i) => i.name) },
        { key: 'capMbps', label: L('线路带宽 (Mbps)', 'Line speed (Mbps)'), type: 'number', value: (() => { try { const c = JSON.parse(localStorage.getItem('ros-center-wan') || 'null'); return c && c.capMbps ? c.capMbps : 100; } catch (e) { return 100; } })(), hint: L('100 / 1000 / 2500 / 10000 等；显示时自动换算为 100M / 1G / 2.5G / 10G', '100 / 1000 / 2500 / 10000 etc.') },
      ],
      onSubmit: (v) => { localStorage.setItem('ros-center-wan', JSON.stringify({ name: v.name, capMbps: Number(v.capMbps) || 100 })); UI.toast(L('WAN 设置已保存', 'WAN settings saved'), 'ok'); paint(); }
    });
  }

  /* ---------- 卡片表格菜单 ---------- */
  function visibleRowsFor(tab) { return tab === 'bridge' ? bridgePortRows() : ifaceBase(); }
  function exportIfaceCsv() {
    const tab = IV.tab;
    const rows = visibleRowsFor(tab);
    const fs = tab === 'bridge'
      ? [['interface', '端口'], ['bridge', '桥接'], ['role', '角色'], ['state', '状态'], ['rate', '速率'], ['full-duplex', '双工'], ['priority', '优先级'], ['pvid', 'PVID'], ['edge', '边缘'], ['path-cost', '路径开销'], ['comment', '备注']]
      : [['name', '接口'], ['type', '类型'], ['mtu', 'MTU'], ['mac-address', 'MAC'], ['comment', '备注'], ['disabled', '禁用']];
    const lines = [fs.map((f) => f[1]).join(',')];
    rows.forEach((r) => lines.push(fs.map((f) => '"' + String(r[f[0]] == null ? '' : r[f[0]]).replace(/"/g, '""') + '"').join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ros-' + (tab === 'bridge' ? 'bridge-ports' : 'interfaces') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast(L('已导出当前表格', 'Current table exported'), 'ok');
  }
  function toggleCompact() {
    const on = !document.body.classList.contains('ui-compact');
    document.body.classList.toggle('ui-compact', on);
    try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
    UI.toast(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
  }
  function openIfaceMenu(anchor) {
    if (!UI || !UI.openMenu) return;
    const compact = document.body.classList.contains('ui-compact');
    UI.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前筛选结果', 'CSV · current filter'), icon: 'i-download', action: () => exportIfaceCsv() },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => toggleCompact() },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(rowSectionLabel(IV.tab))}</small></div>` });
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const el = e.target.closest('[data-act]'); if (!el || state.section !== 'interfacesCenter') return;
    const a = el.dataset.act;
    if (a === 'iv-tab') { IV.tab = el.dataset.tab; IV.q = ''; repaintCard('.iv-card-ifaces'); return; }
    if (a === 'iv-atab') { IV.addrTab = el.dataset.tab; IV.aq = ''; repaintCard('.iv-card-addrs'); return; }
    if (a === 'iv-menu') { openIfaceMenu(el); return; }
    if (a === 'iv-add') { openAdd(el.dataset.scope); return; }
    if (a === 'iv-row-edit') { openEdit(el.dataset.id, el.dataset.name, el.dataset.tab || IV.tab); return; }
    if (a === 'iv-goto-logs') { navigate('logsCenter'); return; }
    if (a === 'iv-wan') { openWanSettings(); return; }
    if (a === 'iv-more') { rowMenu(el.dataset.id, el.dataset.name, el, el.dataset.tab || IV.tab); return; }
    if (a === 'iv-filter') { IV.filter = el.dataset.filter; repaintCard('.iv-card-ifaces'); return; }
  }
  function onInput(e) { /* 搜索在 paint 中通过 oninput 绑定 */ }

  function render() {
    const c = $('content'); if (!c) return;
    paint();
    if (!IV.ifLoadedAt && !IV.loading) loadAll(false);
  }

  function install() {
    const content = $('content');
    if (content) { content.addEventListener('click', onClick); content.addEventListener('input', onInput); }
    if (typeof window.renderPage === 'function') {
      const orig = window.renderPage;
      window.renderPage = function () { const r = orig.apply(this, arguments); if (state.section === 'interfacesCenter') render(); return r; };
    }
    setInterval(() => { if (state.section === 'interfacesCenter') loadAll(true); }, 8000);
    setInterval(updateLive, 1000); /* 实时速率每秒刷新，贴近 RouterOS 实时监控 */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
