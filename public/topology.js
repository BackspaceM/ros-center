'use strict';
/* 网络拓扑独立页
   - 层级完全由 parent 关系推导（根之上还能挂上级设备），同层不重叠
   - 上下 / 左右两种布局；左右时最上级在左、下级在右、同级竖排一列
   - 滚轮缩放、拖拽平移、透明画布；所有节点可自由拖动，只要不与其它节点重叠
   - 双击设备 = 编辑该设备本身（同 id 覆盖，绝不会新增副本）；编辑弹窗可填「本层排序」
   - 点击设备播放其绑定的动画（节点脉冲/链路流动/涟漪扩散），显示实时上下行速率 */
(function () {
  const TYPES = ['router', 'switch', 'ap', 'nas', 'client', 'other'];
  const TYPE_ZH = { router: '路由器', switch: '交换机', ap: '无线 AP', nas: 'NAS / 存储', client: '终端', other: '其它' };
  const TYPE_EN = { router: 'Router', switch: 'Switch', ap: 'Access point', nas: 'NAS / storage', client: 'Client', other: 'Other' };
  const BADGE = { router: 'R', switch: 'S', ap: 'A', nas: 'N', client: 'C', other: '?' };
  const IPV4_TEST = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
  const ANIMS = ['none', 'pulse', 'flow', 'ripple'];
  const ANIM_ZH = { none: '无（只选中）', pulse: '节点脉冲', flow: '链路流动', ripple: '涟漪扩散' };
  const ANIM_EN = { none: 'None (select only)', pulse: 'Node pulse', flow: 'Link flow', ripple: 'Ripple' };
  /* 紧凑三段式：icon（最早 26px，等比略放大到 32px）| 名称/IP/MAC | 实时速率/空闲 */
  const NODE_W = 190, NODE_H = 62, ICON_W = 40, ICON_SZ = 32, RATE_W = 46, PORT_W = 30, PORT_H = 24, GAP = 32, LEVEL_GAP = 156, MARGIN = 90;
  let data = null, loading = false, iconUrl = '', iconLib = [], iconLabel = '';
  let direction = 'tb';
  let zoom = 1, panX = 0, panY = 0, baseW = 1000, baseH = 600;
  let selectedId = null, drag = null, panDrag = null, rates = new Map(), ipRates = new Map(), rateTimer = null;
  let activeFx = null;

  const typeLabel = (tp) => L(TYPE_ZH[tp] || TYPE_ZH.other, TYPE_EN[tp] || TYPE_EN.other);
  const animLabel = (a) => L(ANIM_ZH[a] || ANIM_ZH.none, ANIM_EN[a] || ANIM_EN.none);
  const currentDeviceId = () => (($('deviceSelect') && $('deviceSelect').value) || state.deviceId || '');
  const isCustom = (id) => !!((data && data.custom) || []).find((n) => n.id === id);
  const fmtRate = (b) => {
    const v = Number(b) || 0;
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'G';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return Math.round(v) + '';
  };

  window.renderTopologyPage = function renderTopologyPage() {
    $('content').innerHTML = `    <div class="page-head">
      <div><h1>${esc(L('网络拓扑', 'Network topology'))}</h1>
        <div class="topo-meta" id="topoMeta"></div>
      </div>
      <div class="page-actions">
        <button class="btn btn-sm" type="button" id="topoIpAll" title="${esc(L('把当前所有填写了 IP 的设备一次性开启按 IP 实时测速', 'Enable live per-IP rates for every device that has an IP'))}">◎ ${esc(L('全部按 IP 测速', 'Monitor all by IP'))}</button>
        <button class="btn btn-sm" type="button" id="topoAnimBtn">✦ ${esc(L('动画设置', 'Animations'))}</button>
        <button class="btn btn-sm" type="button" id="topoRefresh">${esc(L('重新发现', 'Rediscover'))}</button>
        <button class="btn btn-sm primary" type="button" id="topoAdd">+ ${esc(L('添加设备', 'Add device'))}</button>
        <button class="btn btn-sm ghost-danger" type="button" id="topoDelete">− ${esc(L('删除设备', 'Delete device'))}</button>
      </div>
    </div>
    <div class="topo-panel">
      <div class="topo-canvas-wrap">
      <div class="topo-controls">
        <button class="topo-ctrl" id="topoZoomIn" type="button" title="${esc(L('放大', 'Zoom in'))}">+</button>
        <span class="topo-zoom" id="topoZoomLabel">100%</span>
        <button class="topo-ctrl" id="topoZoomOut" type="button" title="${esc(L('缩小', 'Zoom out'))}">−</button>
        <button class="topo-ctrl" id="topoFit" type="button" title="${esc(L('适应视图', 'Fit view'))}">⤢</button>
        <span class="topo-ctrl-sep"></span>
        <button class="topo-ctrl topo-dir" id="topoDir" type="button" title="${esc(L('切换上下 / 左右视图', 'Switch vertical / horizontal view'))}">${direction === 'tb' ? '↕ ' + esc(L('上下', 'Vertical')) : '↔ ' + esc(L('左右', 'Horizontal'))}</button>
        <span class="topo-ctrl-sep"></span>
        <span class="topo-hint">${esc(L('滚轮缩放 · 空白处拖动平移 · 双击设备编辑 · 选中后点删除移除', 'Scroll to zoom · drag to pan · double-click a device to edit · select then Delete to remove'))}</span>
        <div class="topo-legend" id="topoLegend"></div>
      </div>
      <div class="topo-stage" id="topoStage"><div class="topo-empty">${esc(L('正在加载拓扑…', 'Loading topology…'))}</div></div>
      </div>
    </div>`;
    $('topoZoomIn').onclick = () => zoomAt(1.08);
    $('topoZoomOut').onclick = () => zoomAt(1 / 1.08);
    $('topoFit').onclick = () => { fitView(); draw(); };
    $('topoDir').onclick = () => {
      direction = direction === 'tb' ? 'lr' : 'tb';
      $('topoDir').innerHTML = direction === 'tb' ? '↕ ' + esc(L('上下', 'Vertical')) : '↔ ' + esc(L('左右', 'Horizontal'));
      buildLayout(); fitView(); draw();
    };
    $('topoAdd').onclick = () => openEditor(null);
    $('topoDelete').onclick = () => deleteSelected();
    $('topoAnimBtn').onclick = () => openAnimSettings();
    $('topoIpAll').onclick = () => {
      const targets = (data ? allNodes() : []).filter((n) => n.ip && IPV4_TEST.test(String(n.ip).trim()));
      if (!targets.length) { toast(L('没有填写有效 IPv4 地址的设备', 'No devices with a valid IPv4 address'), 'err'); return; }
      const already = targets.filter((n) => n.ipRate).length;
      confirmModal(L('批量开启按 IP 测速', 'Enable per-IP monitoring'),
        L('将对 ', 'Enable for ') + targets.length + L(' 台已填 IP 的设备开启连接表聚合测速（默认关闭，只读取、不改路由器配置）。', ' devices with an IP. Connection-table aggregation is read-only and does not change router config.')
        + (already ? '<br>' + L('其中部分设备已开启，重复设置不会改变速率。', 'Some are already enabled; no rate change for them.') : ''),
        false, async () => {
          const list = ((data && data.custom) || []).slice();
          for (const n of targets) {
            const idx = list.findIndex((x) => x.id === n.id);
            const item = idx >= 0 ? { ...list[idx] } : overrideOf(n);
            item.ipRate = true;
            if (idx >= 0) list[idx] = item; else list.push(item);
          }
          const ok = await saveCustom(list);
          if (ok) toast(L('已开启 ', 'Enabled for ') + targets.length + L(' 台设备', ' devices'), 'ok');
        });
    };
    window.openTopologyAnimSettings = openAnimSettings;
    /* 供「IP 流量监控」页跳转过来直接编辑指定节点 */
    window.openTopologyEditorById = (id) => { const n = map.get(String(id || '')); if (n) openEditor(n); };
    $('topoRefresh').onclick = () => load(true);
    const stage = $('topoStage');
    if (data && data.deviceId === currentDeviceId() && stage.dataset.loaded === '1') { buildLayout(); fitView(); draw(); return; }
    load(false);
  };

  async function load(force) {
    const stage = $('topoStage'); if (!stage || loading) return;
    loading = true;
    if (force || !data) stage.innerHTML = '<div class="topo-empty">' + esc(L('正在加载拓扑…', 'Loading topology…')) + '</div>';
    try {
      data = await api('/api/topology');
      stage.dataset.loaded = '1';
      buildLayout(); fitView(); draw(); startRates();
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
    /* 上下：同层横排、跨层纵向；左右：最上级在左、下级在右、同层竖排一列 */
    const crossStep = direction === 'tb' ? NODE_W + GAP : NODE_H + GAP;
    const depthStep = direction === 'tb' ? LEVEL_GAP : NODE_W + GAP * 2;
    const crossSize = Math.max(760, maxRow * crossStep + MARGIN * 2);
    const depthSize = Math.max(360, levels.length * depthStep + MARGIN * 2);
    baseW = direction === 'tb' ? crossSize : depthSize;
    baseH = direction === 'tb' ? depthSize : crossSize;
    pos = new Map();
    levels.forEach((arr, l) => {
      if (!arr) return;
      const nodeCross = direction === 'tb' ? NODE_W : NODE_H;
      const rowSize = (arr.length - 1) * crossStep + nodeCross;
      const start = (crossSize - rowSize) / 2 + nodeCross / 2;
      const depth = MARGIN / 2 + 26 + l * depthStep;
      arr.forEach((n, i) => {
        const cross = start + i * crossStep;
        pos.set(n.id, direction === 'tb' ? { x: cross, y: depth } : { x: depth, y: cross });
      });
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

  /* 点击节点：只播放该节点绑定的效果，且一直持续到用户点击另一台设备 */
  function triggerAnim(n) {
    const kind = ANIMS.includes(n.anim) ? n.anim : 'none';
    activeFx = (kind === 'none' || document.documentElement.dataset.motion === 'off') ? null
      : { id: n.id, type: kind };
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
    if (n && n.ipRate && n.ip) {
      /* 已开启按 IP 测速就只用连接表数据。采集失败时显示 0，
         绝不回退到接口总速率 —— 否则所有设备都会显示同一串数字，掩盖问题。 */
      return ipRates.get(String(n.ip).trim()) || zeroRate;
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
      const fx = activeFx && activeFx.id === parent.id && activeFx.type === 'flow' ? ' fx-flow' : '';
      links.push(`<path class="topo-link${n.auto ? '' : ' manual'}${dur ? ' flowing' : ''}${fx}" data-from="${esc(parent.id)}" data-to="${esc(n.id)}" style="--flow-dur:${dur || 2}s" d="${curve(from, to)}"/>`);
    }
    for (const n of nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const name = String(n.name || '').slice(0, 9);
      /* icon 等比略放大：26 → 32，垂直居中，不拉伸 */
      const ix = -NODE_W / 2 + (ICON_W - ICON_SZ) / 2, iy = -ICON_SZ / 2;
      const icon = n.icon
        ? `<image class="topo-icon-img" href="${esc(n.icon)}" x="${ix}" y="${iy}" width="${ICON_SZ}" height="${ICON_SZ}" preserveAspectRatio="xMidYMid meet" clip-path="url(#topoIconClip)"/>`
        : `<rect class="topo-icon-bg type-${esc(n.type)}" x="${ix}" y="${iy}" width="${ICON_SZ}" height="${ICON_SZ}" rx="7"/><text class="topo-icon-t" x="${ix + ICON_SZ / 2}" y="4" text-anchor="middle">${BADGE[n.type] || '?'}</text>`;
      const rate = effectiveRate(n.id);
      const hasRate = !!(rate.rxBps || rate.txBps);
      const upText = hasRate ? '↑' + fmtRate(rate.txBps) : '';
      const downText = hasRate ? '↓' + fmtRate(rate.rxBps) : '';
      /* 无流量用灰色「空闲」小标签，比空白更容易判断设备是否在线 */
      const idleLabel = hasRate ? '' : `<g class="topo-idle"><rect x="${NODE_W / 2 - RATE_W + 6}" y="-8" width="28" height="16" rx="8"/><text x="${NODE_W / 2 - RATE_W + 20}" y="3" text-anchor="middle">${esc(L('空闲', 'Idle'))}</text></g>`;
      const cx = (-NODE_W / 2 + ICON_W) + (NODE_W - ICON_W - RATE_W) / 2;
      const mac = String(n.mac || '').toUpperCase().slice(0, 15) || typeLabel(n.type);
      const fx = activeFx && activeFx.id === n.id ? ' fx-' + activeFx.type : '';
      nodeHtml.push(`<g class="topo-node type-${esc(n.type)} ${n.auto ? 'auto' : 'custom'}${selectedId === n.id ? ' selected' : ''}${fx}" data-id="${esc(n.id)}" transform="translate(${p.x},${p.y})">
        ${activeFx && activeFx.id === n.id && activeFx.type === 'ripple' ? '<circle class="topo-ripple" r="24"/>' : ''}
        <rect class="node-card" x="${-NODE_W / 2}" y="${-NODE_H / 2}" width="${NODE_W}" height="${NODE_H}" rx="8"/>
        <rect class="topo-type-bar type-${esc(n.type)}" x="${-NODE_W / 2}" y="${-NODE_H / 2 + 8}" width="3" height="${NODE_H - 16}" rx="1.5"/>
        ${icon}
        <rect class="topo-rate-divider" x="${NODE_W / 2 - RATE_W - 2}" y="${-NODE_H / 2 + 10}" width="1" height="${NODE_H - 20}"/>
        <text class="topo-name" x="${cx}" y="-16" text-anchor="middle">${esc(name)}</text>
        <text class="topo-sub" x="${cx}" y="-2" text-anchor="middle">${esc(String(n.ip || typeLabel(n.type)).slice(0, 12))}</text>
        <text class="topo-mac" x="${cx}" y="14" text-anchor="middle">${esc(mac)}</text>
        <text class="topo-rate up" x="${NODE_W / 2 - 7}" y="-12" text-anchor="end">${esc(upText)}</text>
        <text class="topo-rate down" x="${NODE_W / 2 - 7}" y="16" text-anchor="end">${esc(downText)}</text>
        ${idleLabel}
      </g>`);
    }
    const svg = `<svg class="topo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseW} ${baseH}" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="topoIconClip"><rect x="${-NODE_W / 2 + (ICON_W - ICON_SZ) / 2}" y="${-ICON_SZ / 2}" width="${ICON_SZ}" height="${ICON_SZ}" rx="7"/></clipPath></defs>
      <g class="topo-layer-links">${links.join('')}</g>
      <g class="topo-layer-nodes">${nodeHtml.join('')}</g>
    </svg>`;
    stage.innerHTML = svg;
    applyView(stage.querySelector('svg'));
    bindSvg(stage.querySelector('svg'));
    renderFoot();
    paintRates(); /* 重绘后立即回填速率，避免出现 2.5 秒空白 */
  }

  function renderFoot() {
    const meta = $('topoMeta'), legendBox = $('topoLegend'); if (!meta || !data) return;
    const sel = selectedId && map.get(selectedId);
    const counts = (data.discovery || {}).counts || {};
    const legend = ['router', 'switch', 'ap', 'nas', 'client'].map((tp) => `<span><i class="lg-${tp}"></i>${esc(typeLabel(tp))}</span>`).join('');
    if (legendBox) legendBox.innerHTML = legend;
    meta.innerHTML = `<span>${esc(L('自动发现', 'Discovered'))} ${Number(counts.neighbors) || 0} ${esc(L('邻居', 'nb'))} · ${Number(counts.leases) || 0} ${esc(L('租约', 'leases'))}</span>
      <span>${esc(L('自定义', 'Custom'))} ${(data.custom || []).filter((n) => !n.deleted).length}</span>
      ${sel ? `<span class="topo-fx-name">${esc(L('点击动画', 'Click fx'))}: ${esc(animLabel(sel.anim || 'none'))}</span>` : ''}
      ${((data.discovery || {}).notes || []).length ? `<span class="topo-warn" title="${esc(data.discovery.notes.join('; '))}">${esc(L('部分自动发现不可用', 'Some discovery unavailable'))}</span>` : ''}`;
  }

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
        triggerAnim(n);
        draw();
      });
      g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openEditor(n); });
      /* 所有设备都可自由拖动（x / y 双向），唯一约束是不与其它设备卡片重叠 */
      g.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
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
        ipRates = new Map((ipd.rows || []).map((r) => [r.ip, { rxBps: r.rxBps || 0, txBps: r.txBps || 0 }]));
        paintRates();
      } catch (e) { /* ignore */ }
    };
    tick(); rateTimer = setInterval(tick, 2500);
  }
  function paintRates() {
    const stage = $('topoStage'); if (!stage) return;
    stage.querySelectorAll('.topo-node').forEach((g) => {
      const n = map.get(g.dataset.id); if (!n) return;
      const up = g.querySelector('.topo-rate.up'), down = g.querySelector('.topo-rate.down');
      const r = effectiveRate(n.id);
      const has = !!(r.rxBps || r.txBps);
      if (up) up.textContent = has ? '↑' + fmtRate(r.txBps) : '';
      if (down) down.textContent = has ? '↓' + fmtRate(r.rxBps) : '';
    });
    /* 连线流速由下级设备的下行速率决定，与父节点是否新增无关 */
    stage.querySelectorAll('.topo-link[data-to]').forEach((path) => {
      const dur = flowDuration(path.dataset.to);
      path.classList.toggle('flowing', dur > 0);
      path.style.setProperty('--flow-dur', (dur || 2) + 's');
    });
  }

  async function saveCustom(list) {
    const nodes2 = list || (data && data.custom) || [];
    try {
      const d = await api('/api/topology', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: nodes2 }) });
      if (data) { data.custom = d.nodes || nodes2; data.updatedAt = d.updatedAt; }
      buildLayout(); draw();
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
      iface: n.iface || '', icon: n.icon || '', note: n.note || '', anim: n.anim || 'none',
      ipRate: !!n.ipRate,
      calcFrom: Array.isArray(n.calcFrom) ? n.calcFrom.slice() : [],
      order: Number(n.order) || 0,
      deleted: false, x: n.x || 0, y: n.y || 0 };
  }

  /* 动画设置：为每个设备单独指定「点击时播放什么」，未指定则只选中、不弹端口 */
  function openAnimSettings() {
    if (!data) {
      load(false).then(() => { if (data && nodes.length) openAnimSettings(); });
      return;
    }
    if (!nodes.length) { toast(L('请先加载拓扑', 'Load the topology first'), 'err'); return; }
    const rows = nodes.map((n, i) => `<div class="anim-row">
      <div class="anim-row-name"><i class="lg-${esc(n.type)}"></i><span>${esc(n.name)}</span><small>${esc(typeLabel(n.type))}</small></div>
      <select id="fx_${i}" data-id="${esc(n.id)}">${ANIMS.map((a) => `<option value="${a}"${(n.anim || 'none') === a ? ' selected' : ''}>${esc(animLabel(a))}</option>`).join('')}</select>
    </div>`).join('');
    const body = `<div class="note-card">${esc(L('点击设备时只触发它自己绑定的动画。总开关为顶栏 ✦（关闭后所有动画停用）。', 'Clicking a device plays only its own effect. The ✦ button in the top bar is the global master switch.'))}</div>
      <div class="anim-list">${rows}</div>`;
    const foot = `<button class="btn" data-close type="button">${esc(L('取消', 'Cancel'))}</button><button class="btn primary" id="fxSave" type="button">${esc(L('保存', 'Save'))}</button>`;
    openModal(L('拓扑动画设置', 'Topology animation settings'), body, foot, () => {
      $('fxSave').onclick = async () => {
        const custom = ((data && data.custom) || []).slice();
        nodes.forEach((n, i) => {
          const el = $('fx_' + i); if (!el) return;
          const anim = el.value;
          if ((n.anim || 'none') === anim) return;
          const idx = custom.findIndex((x) => x.id === n.id);
          if (idx >= 0) custom[idx] = { ...custom[idx], anim };
          else custom.push({ ...overrideOf(n), anim });
        });
        if (await saveCustom(custom)) { closeModal(); toast(L('动画设置已保存', 'Animation settings saved'), 'ok'); }
      };
    });
  }
  window.openTopologyAnimSettings = openAnimSettings;

  function openEditor(node) {
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
    const body = `<div class="topo-editor">
      ${section('1', L('基本信息', 'Basic info'), L('名称、类型与地址', 'Name, type and address'), `
        ${field(L('名称', 'Name') + ' *', `<input id="tnName" type="text" maxlength="48" value="${esc(node ? node.name : '')}" placeholder="${esc(L('设备名称', 'Device name'))}">`)}
        <div class="te-grid-2">
          ${field(L('类型', 'Type'), `<select id="tnType">${TYPES.map((tp) => `<option value="${tp}"${node && node.type === tp ? ' selected' : ''}>${esc(typeLabel(tp))}</option>`).join('')}</select>`)}
          ${field(L('IP / 地址', 'IP / address'), `<input id="tnIp" type="text" maxlength="64" value="${esc(node ? node.ip : '')}" placeholder="192.168.1.1">`)}
        </div>
        ${field(L('MAC 地址（可选）', 'MAC address (optional)'), `<input id="tnMac" type="text" maxlength="32" value="${esc(node ? node.mac || '' : '')}" placeholder="AA:BB:CC:DD:EE:FF">`, L('用于在接口、租约、邻居等表格中复用本设备上传的图标；自动发现的设备会自动带出', 'Used to reuse this device icon in interface/lease/neighbour tables; auto-discovered devices fill this in'))}`)}
      ${section('2', L('层级与连接', 'Hierarchy & links'), L('决定设备在拓扑中的位置与连线', 'Where the device sits and how it connects'), `
        ${field(L('层级关系', 'Hierarchy'), `<select id="tnRelation">
          <option value="child"${relationDefault === 'child' ? ' selected' : ''}>${esc(L('作为目标设备的下级', 'Child of selected device'))}</option>
          <option value="parent"${relationDefault === 'parent' ? ' selected' : ''}>${esc(L('作为目标设备的上级', 'Parent of selected device'))}</option>
          <option value="top"${relationDefault === 'top' ? ' selected' : ''}>${esc(L('独立顶层', 'Standalone top level'))}</option>
        </select>`, L('选择「上级」可把现有设备挂到新设备下面，例如给主路由加光猫', 'Choose "Parent" to put a device under this one (e.g. ONT above router)'))}
        <div class="te-grid-2">
          ${field(L('目标设备', 'Target device'), `<select id="tnParent">${parentOpts}</select>`)}
          ${field(L('上级端口', 'Parent port'), `<input id="tnParentPort" type="text" maxlength="32" list="tnKnownPorts" value="${esc(node ? node.parentPort || '' : '')}" placeholder="${esc(L('接在上级的哪个口', 'Upstream port'))}"><datalist id="tnKnownPorts">${((parentNode && parentNode.ports) || []).map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>`)}
        </div>
        <div class="te-grid-2">
          ${field(L('本机网口', 'Local ports'), `<input id="tnPorts" type="text" maxlength="400" value="${esc(portsText)}" placeholder="ether1, ether2, ...">`, L('逗号分隔，用于登记端口与下挂连接', 'Comma-separated port list'))}
          ${field(L('本层排序', 'Order in level'), `<input id="tnOrder" type="number" min="1" max="999" value="${node && Number(node.order) > 0 ? Number(node.order) : ''}" placeholder="1">`, L('同层左右顺序，留空排最后', 'Left-to-right order; blank sorts last'))}
        </div>`)}
      ${section('3', L('流量与动画', 'Traffic & animation'), L('无法直采时可用下级速率求和', 'Sum downstream rates when direct measurement is unavailable'), `
        ${field(L('按 IP 实时测速', 'Live rate by IP'), `<label class="qs-check"><input type="checkbox" id="tnIpRate"${node && node.ipRate ? ' checked' : ''}><span>${esc(L('从连接表按此设备的 IP 聚合上下行速率（默认关闭）', 'Aggregate up/down rate by this device IP from the connection table (off by default)'))}</span></label>`, L('需在上方填写有效 IP；开启后优先于接口与下级求和，仅每秒读取连接表，不改路由器配置', 'Requires a valid IP above; takes priority over interface/child sums; reads connection table once per second without changing router config'))}
        ${field(L('流量计算模式', 'Traffic calculation'), `<div class="calc-list">${calcRows || `<div class="form-hint">${esc(L('该设备暂无下级设备', 'No downstream devices yet'))}</div>`}</div>`, L('多选下级设备按其速率之和显示；有包含关系的勾选会自动互斥', 'Select downstream devices to sum their rates; overlapping picks are mutually exclusive'))}
        ${field(L('点击动画', 'Click animation'), `<select id="tnAnim">${ANIMS.map((a) => `<option value="${a}"${(node && (node.anim || 'none') || 'none') === a ? ' selected' : ''}>${esc(animLabel(a))}</option>`).join('')}</select>`, L('点击此设备时触发；「无」表示只选中', 'Played on click; None selects only'))}`)}
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
    const foot = `<button class="btn" data-close type="button">${esc(L('取消', 'Cancel'))}</button><button class="btn primary" id="tnSave" type="button">${esc(L('保存', 'Save'))}</button>`;
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
          anim: $('tnAnim').value,
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
              iface: target.iface || '', icon: target.icon || '', note: target.note || '', anim: target.anim || 'none',
              calcFrom: Array.isArray(target.calcFrom) ? target.calcFrom.slice() : [], order: Number(target.order) || 0,
              deleted: false, x: target.x || 0, y: target.y || 0 };
            const ti = custom.findIndex((n) => n.id === targetId);
            if (ti >= 0) custom[ti] = { ...custom[ti], parent: item.id }; else custom.push(override);
          }
        }
        if (await saveCustom(custom)) { closeModal(); selectedId = item.id; toast(L('已保存', 'Saved'), 'ok'); }
      };
      setTimeout(() => { const el = $('tnName'); if (el) el.focus(); }, 40);
    });
  }

  function deleteSelected() {
    const node = selectedId && map.get(selectedId);
    if (!node) { toast(L('请先点选要删除的设备', 'Select a device to delete first'), 'err'); return; }
    const wasAuto = ((data && data.auto) || []).some((x) => x.id === node.id);
    const body = `<div class="modal-note">${esc(L('确定删除设备', 'Delete this device?'))} <b>${esc(node.name)}</b> ? ${wasAuto ? esc(L('该设备由自动发现生成，将从视图中隐藏（重新发现不会再出现）；删除覆盖版本即可恢复。', 'This device is auto-discovered and will be hidden until you remove its override.')) : ''}</div>`;
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
          closeModal(); selectedId = null; if (activeFx && activeFx.id === node.id) activeFx = null;
          toast(L('已删除', 'Deleted'), 'ok');
        }
      };
    });
  }
})();
