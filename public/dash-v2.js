'use strict';
/* ============================================================
   ROS Center · Dashboard v2
   把 dashboard.html 设计稿的模块用真实数据渲染。
   本文件在 views.js 之后加载，覆盖全局 renderDashboard()。
   所有数据来自 app.js 的 state（WebSocket + REST）。
   ============================================================ */

const V2NS = 'http://www.w3.org/2000/svg';

/* ---------- 工具 ---------- */
function v2Num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function v2Int(v) { return Math.round(v2Num(v)).toLocaleString('en-US'); }
function v2Mbps(bps) {
  /* 返回 {v, u}：按量级自适应，速率单位 */
  const b = v2Num(bps);
  if (b >= 1e9) return { v: (b / 1e9).toFixed(2), u: 'Gbps' };
  if (b >= 1e6) return { v: (b / 1e6).toFixed(2), u: 'Mbps' };
  if (b >= 1e3) return { v: (b / 1e3).toFixed(1), u: 'Kbps' };
  return { v: b.toFixed(0), u: 'bps' };
}
function v2Bytes(b) {
  const n = v2Num(b);
  const p = [{ u: 'TB', d: 1e12 }, { u: 'GB', d: 1e9 }, { u: 'MB', d: 1e6 }, { u: 'KB', d: 1e3 }];
  for (const x of p) if (n >= x.d) return { v: (n / x.d).toFixed(n / x.d >= 100 ? 0 : 1), u: x.u };
  return { v: n.toFixed(0), u: 'B' };
}
function v2Rate(bps) {
  const r = v2Mbps(bps);
  return r.v + ' ' + r.u;
}
/* 接口运行状态：RouterOS 的 disabled / running 两字段组合出 4 种真实状态。
   - 已禁用 disabled=true          → 灰色「禁用」
   - 运行中 running=true           → 绿色「UP」
   - 未接线/未运行 running=false   → 红色「DOWN」
   - 字段缺失（设备未上报）        → 琥珀色「未知」 */
function v2IfaceState(i) {
  const hasRunning = i && (i.running === 'true' || i.running === 'false' || i.running === true || i.running === false);
  const disabled = !!(i && (i.disabled === 'true' || i.disabled === true));
  const running = !!(i && (i.running === 'true' || i.running === true));
  if (disabled) return { text: '禁用', dot: 'is-muted', en: 'Disabled' };
  if (!hasRunning) return { text: '未知', dot: 'is-amber', en: 'Unknown' };
  return running ? { text: 'UP', dot: 'is-green', en: 'UP' } : { text: 'DOWN', dot: 'is-red', en: 'DOWN' };
}
function v2Pct(part, total) { return total > 0 ? (part / total) * 100 : 0; }
function v2BytePair(used, total) {
  if (!total) return '—';
  const a = v2Bytes(used), b = v2Bytes(total);
  return a.u === b.u ? `${a.v} / ${b.v} ${b.u}` : `${a.v} ${a.u} / ${b.v} ${b.u}`;
}

/* ---------- SVG 迷你趋势 ---------- */
function v2Spark(el, data) {
  if (!el || !data || data.length < 2) return;
  const w = 96, h = 34, pad = 3, n = data.length;
  const lo = Math.min(...data), hi = Math.max(...data);
  const span = Math.max(0.001, hi - lo);
  const x = i => pad + i * (w - pad * 2) / (n - 1);
  const y = v => h - pad - ((v - lo + span * 0.18) / (span * 1.36)) * (h - pad * 2);
  let line = '';
  data.forEach((v, i) => { line += (i ? 'L' : 'M') + x(i).toFixed(2) + ' ' + y(v).toFixed(2) + ' '; });
  const area = line + `L${x(n - 1).toFixed(2)} ${h - pad} L${pad} ${h - pad} Z`;
  const fill = document.createElementNS(V2NS, 'path');
  fill.setAttribute('d', area); fill.setAttribute('fill', 'currentColor'); fill.setAttribute('opacity', '0.10');
  const path = document.createElementNS(V2NS, 'path');
  path.setAttribute('d', line); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-linecap', 'round');
  el.appendChild(fill); el.appendChild(path);
}

/* ---------- 实时流量折线图 ---------- */
let v2Range = '6m';                 /* 6m | 1h | 24h */
let v2Hist = { range: '', at: 0, points: null, busy: false };
const V2_RANGE_META = {
  '6m': { title: '最近 6 分钟', sub: '每秒采样', unit: 'second' },
  '1h': { title: '最近 1 小时', sub: '每分钟平均', unit: 'minute' },
  '24h': { title: '最近 24 小时', sub: '每小时平均', unit: 'hour' },
};

function v2ChartPoints() {
  if (v2Range === '6m') return (state.points || []).slice(-61).map((p) => ({ ts: v2Num(p.ts), rx: v2Num(p.rx), tx: v2Num(p.tx) }));
  if (v2Hist.range === v2Range && Array.isArray(v2Hist.points)) return v2Hist.points;
  return [];
}
function v2EnsureHistory() {
  if (v2Range === '6m') return;
  if (v2Hist.busy) return;
  if (v2Hist.range === v2Range && Date.now() - v2Hist.at < 60000) return;
  const range = v2Range;
  v2Hist.busy = true;
  api('/api/history?range=' + encodeURIComponent(range)).then((d) => {
    v2Hist = { range, at: Date.now(), points: Array.isArray(d.points) ? d.points : [], busy: false };
    if (v2Range === range) v2Chart();
  }).catch(() => { v2Hist.busy = false; });
}

function v2Chart() {
  const wrap = document.getElementById('chartWrapV2');
  const svg = document.getElementById('chartV2');
  if (!wrap || !svg) return;
  v2EnsureHistory();
  const points = v2ChartPoints();
  if (points.length < 2) {
    svg.setAttribute('viewBox', '0 0 600 200');
    const msg = v2Range === '6m' ? '等待采样数据…' : '正在汇总历史采样…';
    svg.innerHTML = `<text x="300" y="100" text-anchor="middle" class="axis-t" style="fill:var(--v2-faint)">${msg}</text>`;
    return;
  }
  const rx = points.map(p => v2Num(p.rx) / 1e6);
  const tx = points.map(p => v2Num(p.tx) / 1e6);
  const W = Math.max(280, wrap.clientWidth), H = wrap.clientHeight;
  const mobile = W < 520;
  const padL = mobile ? 34 : 40, padR = 8, padT = 10, padB = 24;
  const dataMax = Math.max(10, ...rx, ...tx);
  const max = Math.ceil(dataMax / 10) * 10 || 40;
  const n = rx.length;
  const x = i => padL + i * (W - padL - padR) / (n - 1);
  const y = v => padT + (1 - v / max) * (H - padT - padB);

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.innerHTML = '';

  const defs = document.createElementNS(V2NS, 'defs');
  defs.innerHTML = `
    <linearGradient id="gRxV2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:var(--v2-accent);stop-opacity:.20"/>
      <stop offset="100%" style="stop-color:var(--v2-accent);stop-opacity:0"/>
    </linearGradient>
    <linearGradient id="gTxV2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:var(--v2-teal);stop-opacity:.16"/>
      <stop offset="100%" style="stop-color:var(--v2-teal);stop-opacity:0"/>
    </linearGradient>`;
  svg.appendChild(defs);

  const step = max <= 20 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  for (let v = 0; v <= max; v += step) {
    const gy = y(v);
    const line = document.createElementNS(V2NS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
    line.setAttribute('y1', gy); line.setAttribute('y2', gy);
    line.setAttribute('class', 'grid-line');
    svg.appendChild(line);
    const t = document.createElementNS(V2NS, 'text');
    t.setAttribute('x', padL - 7); t.setAttribute('y', gy + 3);
    t.setAttribute('text-anchor', 'end'); t.setAttribute('class', 'axis-t');
    t.textContent = v;
    svg.appendChild(t);
  }

  const line = d => d.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const area = d => line(d) + ` L${x(n - 1).toFixed(2)} ${H - padB} L${padL} ${H - padB} Z`;

  [['gRxV2', rx], ['gTxV2', tx]].forEach(([id, d]) => {
    const a = document.createElementNS(V2NS, 'path');
    a.setAttribute('d', area(d)); a.setAttribute('fill', `url(#${id})`);
    svg.appendChild(a);
  });
  [['var(--v2-accent)', rx], ['var(--v2-teal)', tx]].forEach(([color, d]) => {
    const p = document.createElementNS(V2NS, 'path');
    p.setAttribute('d', line(d)); p.setAttribute('fill', 'none');
    p.style.stroke = color; p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    const last = document.createElementNS(V2NS, 'circle');
    last.setAttribute('cx', x(n - 1)); last.setAttribute('cy', y(d[n - 1]));
    last.setAttribute('r', '3.2'); last.style.fill = color;
    last.style.stroke = 'var(--v2-surface)'; last.setAttribute('stroke-width', '2');
    svg.appendChild(last);
  });

  /* 6m 点距约 1 秒；1h/24h 由服务端按分钟/小时聚合，直接使用时间戳刻度。 */
  let stepSec = v2Range === '24h' ? 3600 : v2Range === '1h' ? 60 : 1;
  if (n > 4) {
    const gaps = [];
    for (let i = 1; i < n; i++) {
      const g = (v2Num(points[i].ts) - v2Num(points[i - 1].ts)) / 1000;
      if (g > 0 && g < 30 * 86400) gaps.push(g);
    }
    if (gaps.length) {
      gaps.sort((a, b) => a - b);
      stepSec = gaps[Math.floor(gaps.length / 2)] || stepSec;
    }
  }
  const fmtAgo = (secs) => {
    if (secs < 2) return '现在';
    if (secs < 60) return '-' + Math.round(secs) + '秒';
    if (secs < 3600) return '-' + Math.round(secs / 60) + '分';
    return '-' + Math.round(secs / 3600) + '小时';
  };
  const clock = (ts) => {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const chartLabel = (i) => (v2Range === '24h' ? clock(points[i].ts) : fmtAgo(Math.round((n - 1 - i) * stepSec)));
  const labels = mobile
    ? [[0, chartLabel(0)], [Math.floor(n / 2), chartLabel(Math.floor(n / 2))], [n - 1, v2Range === '24h' ? chartLabel(n - 1) : '现在']]
    : [[0, chartLabel(0)], [Math.floor(n / 4), chartLabel(Math.floor(n / 4))],
       [Math.floor(n / 2), chartLabel(Math.floor(n / 2))], [Math.floor(n * 3 / 4), chartLabel(Math.floor(n * 3 / 4))], [n - 1, v2Range === '24h' ? chartLabel(n - 1) : '现在']];
  labels.forEach(([i, label]) => {
    const t = document.createElementNS(V2NS, 'text');
    t.setAttribute('x', x(i)); t.setAttribute('y', H - 6);
    t.setAttribute('text-anchor', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
    t.setAttribute('class', 'axis-t'); t.textContent = label;
    svg.appendChild(t);
  });

  /* ---- 悬停十字线 + 数值提示 ---- */
  const mk = (tag, attrs) => {
    const el = document.createElementNS(V2NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    el.style.display = 'none'; el.style.pointerEvents = 'none';
    svg.appendChild(el); return el;
  };
  const cross = mk('line', { x1: 0, x2: 0, y1: padT, y2: H - padB, class: 'v2-cross' });
  const dotRx = mk('circle', { r: 4, fill: 'var(--v2-accent)', stroke: 'var(--v2-surface)', 'stroke-width': 2 });
  const dotTx = mk('circle', { r: 4, fill: 'var(--v2-teal)', stroke: 'var(--v2-surface)', 'stroke-width': 2 });
  const overlay = document.createElementNS(V2NS, 'rect');
  overlay.setAttribute('x', padL); overlay.setAttribute('y', padT);
  overlay.setAttribute('width', Math.max(0, W - padL - padR));
  overlay.setAttribute('height', Math.max(0, H - padT - padB));
  overlay.setAttribute('fill', 'transparent');
  overlay.style.cursor = 'crosshair';
  svg.appendChild(overlay);

  let tip = wrap.querySelector('.v2-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'v2-tip';
    wrap.appendChild(tip);
  }
  const timeLabel = (i) => {
    const ts = v2Num(points[i] && points[i].ts);
    const secs = Math.round((n - 1 - i) * stepSec);
    if (v2Range === '24h') {
      const d = new Date(ts);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    }
    if (v2Range === '1h') return `${clock(ts)} · ${fmtAgo(secs).replace('-', '')}前`;
    if (secs < 2) return '现在';
    if (secs < 60) return secs + ' 秒前';
    return Math.round(secs / 60) + ' 分钟前';
  };
  const hide = () => {
    cross.style.display = dotRx.style.display = dotTx.style.display = 'none';
    tip.style.display = 'none';
  };
  const move = (ev) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const px = (ev.clientX - box.left) * (W / box.width);
    const i = Math.max(0, Math.min(n - 1, Math.round((px - padL) / ((W - padL - padR) / (n - 1)))));
    const cx = x(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.style.display = '';
    dotRx.setAttribute('cx', cx); dotRx.setAttribute('cy', y(rx[i])); dotRx.style.display = '';
    dotTx.setAttribute('cx', cx); dotTx.setAttribute('cy', y(tx[i])); dotTx.style.display = '';
    const r = v2Mbps(v2Num(points[i].rx)), t = v2Mbps(v2Num(points[i].tx));
    tip.innerHTML = `<div class="tt">${timeLabel(i)}</div>
      <div class="tr"><i class="rx"></i>下载 <b>${r.v} ${r.u}</b></div>
      <div class="tr"><i class="tx"></i>上传 <b>${t.v} ${t.u}</b></div>`;
    tip.style.display = 'block';
    const tipW = tip.offsetWidth || 120;
    const left = Math.max(tipW / 2 + 4, Math.min(W - tipW / 2 - 4, cx));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(4, Math.min(padT, y(Math.max(rx[i], tx[i])) - tip.offsetHeight - 8)) + 'px';
  };
  overlay.addEventListener('mousemove', move);
  overlay.addEventListener('mouseleave', hide);
}

/* ---------- 环形图（连接状态） ---------- */
function v2Donut(v4, v6) {
  const total = v4 + v6 || 1;
  const r = 52, c = 2 * Math.PI * r;
  const a4 = c * (v4 / total);
  return `<circle cx="62" cy="62" r="${r}" fill="none" style="stroke:var(--v2-surface-3)" stroke-width="11"/>
    <circle cx="62" cy="62" r="${r}" fill="none" style="stroke:var(--v2-accent)" stroke-width="11"
      stroke-dasharray="${a4.toFixed(1)} ${(c - a4).toFixed(1)}" transform="rotate(-90 62 62)"/>
    <circle cx="62" cy="62" r="${r}" fill="none" style="stroke:var(--v2-teal)" stroke-width="11"
      stroke-dasharray="${(c - a4).toFixed(1)} ${a4.toFixed(1)}" stroke-dashoffset="${(-a4).toFixed(1)}" transform="rotate(-90 62 62)"/>`;
}

/* ---------- 侧栏设备卡片同步（沿用现有 #deviceSelect，不改数据逻辑） ---------- */
function v2DevName() {
  return String((state.deviceName && state.deviceName.trim()) || '').replace(/\s*\(.*$/g, '') || '主路由';
}

/* ---------- 右上角「布局」：设计稿表格密度菜单 ---------- */
function v2IsCompact() { return document.body.classList.contains('ui-compact'); }
function v2SetDensity(mode, silent) {
  const compact = mode === 'compact';
  document.body.classList.toggle('ui-compact', compact);
  try { localStorage.setItem('ros-density', compact ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
  if (!silent && typeof UI !== 'undefined' && UI.toast) {
    UI.toast(compact ? '紧凑布局已开启' : '舒适布局已恢复', '表格行高和卡片间距已调整，并记住本次选择。', 'success');
  }
}
function v2OpenLayoutMenu(btn) {
  if (document.querySelector('.ui-menu[data-v2-layout="1"]')) { UI.closeMenu(); return; }
  const compact = v2IsCompact();
  UI.openMenu(btn, [
    { label: '舒适布局', checkSlot: true, checked: !compact, current: !compact, key: '默认', action: () => v2SetDensity('comfort') },
    { label: '紧凑布局', checkSlot: true, checked: compact, current: compact, key: '更多行', action: () => v2SetDensity('compact') },
    { sep: true },
    { label: '恢复默认密度', action: () => v2SetDensity('comfort') },
  ], {
    head: '<div class="ui-menu-head"><b>表格密度</b><small>只影响当前浏览器的显示</small></div>',
    onMount: (menu) => { menu.dataset.v2Layout = '1'; },
  });
}

/* ---------- 右上角「全部接口」：设计稿 ui-menu 同款下拉 ---------- */
function v2OpenIfaceMenu(btn) {
  if (document.querySelector('.ui-menu[data-v2-iface="1"]')) { UI.closeMenu(); return; }
  const ifaces = (state.latest && state.latest.ifaces) || [];
  const cur = state.selectedIface;
  const allOn = cur === '__all__';
  const items = [
    {
      label: '全部接口', checkSlot: true, checked: allOn, current: allOn, key: '默认',
      action: () => setDashIface('__all__'),
    },
    ...ifaces.map((i) => {
      const name = String(i.name || '');
      const on = cur === name;
      return {
        label: name, checkSlot: true, checked: on, current: on, key: '接口',
        action: () => setDashIface(name),
      };
    }),
    { sep: true },
    { label: '打开接口与地址', key: '↗', action: () => navigate('interfacesCenter') },
  ];
  UI.openMenu(btn, items, {
    alignLeft: true,
    head: `<div class="ui-menu-head"><b>选择接口</b><small>当前上下文：${esc(v2DevName())}</small></div>`,
    onMount: (menu) => { menu.dataset.v2Iface = '1'; },
  });
}

/* ---------- 链路质量检测：复用设计稿 link-quality 表单（检测目标为文本框） ---------- */
const QUALITY_TH_KEY = () => 'rosCenter.qualityThresholds.' + (state.deviceId || '');
/* 拓扑页独立配置的探测目标：保存仪表盘目标时一并提交，避免后端把拓扑目标当作“已删除”移除。
   与仪表盘相同 IP 的目标只保留一条（仪表盘在前，术语沿用仪表盘设置）。 */
function v2ActiveTopoTargets() {
  try {
    const p = JSON.parse(localStorage.getItem('rosCenter.topologyQuality.' + (state.deviceId || '')));
    const list = p && Array.isArray(p.targets) ? p.targets : [];
    return list.map((t) => ({ host: String((t && t.host) || '').trim(), label: String((t && t.label) || '').trim() }))
      .filter((t) => t.host);
  } catch (e) { return []; }
}
function qualityThresholds() {
  try {
    const p = JSON.parse(localStorage.getItem(QUALITY_TH_KEY()));
    if (p && Number(p.warn) > 0 && Number(p.critical) > 0) return { warn: Number(p.warn), critical: Number(p.critical) };
  } catch (e) { /* ignore */ }
  return { warn: 180, critical: 260 };
}
function v2OpenProbeModal() {
  if (typeof qualityPrefs !== 'function' || !window.UI) return;
  if (state.authRole === 'read') { UI.toast('只读账户无法修改链路质量配置', 'warn'); return; }
  const prefs = qualityPrefs();
  const th = qualityThresholds();
  const target = (prefs.targets && prefs.targets[0] && prefs.targets[0].host) || '';
  const intervalOpts = [
    { value: '5s', label: '5 秒' }, { value: '10s', label: '10 秒' },
    { value: '30s', label: '30 秒' }, { value: '1m', label: '60 秒' },
  ];
  UI.openForm({
    title: '链路质量检测',
    sub: '仪表盘 · WAN 链路健康阈值',
    submitLabel: '保存阈值',
    note: '保存后按目标地址持续探测；Netwatch 模式会把目标写入路由器 /tool/netwatch，不会修改其它配置。',
    fields: [
      { key: 'warn', label: '延迟告警（ms）', type: 'number', value: String(th.warn), required: true },
      { key: 'critical', label: '严重阈值（ms）', type: 'number', value: String(th.critical), required: true },
      { key: 'interval', label: '检测间隔', type: 'select', value: prefs.interval || '10s', options: intervalOpts },
      { key: 'target', label: '检测目标', type: 'text', value: target, required: true, placeholder: '1.1.1.1 或 dns.example.com' },
      { key: 'enabled', label: '启用主动探测', type: 'switch', value: prefs.enabled !== false, hint: '关闭后停止探测并移除已同步的 Netwatch 目标' },
    ],
    onSubmit: async (values, m) => {
      const warn = Number(values.warn), critical = Number(values.critical);
      if (!Number.isFinite(warn) || warn <= 0 || !Number.isFinite(critical) || critical <= 0) {
        UI.toast('阈值需为正数', 'warn'); return;
      }
      const host = String(values.target || '').trim();
      if (!/^[a-zA-Z0-9_.:-]+$/.test(host)) { UI.toast('检测目标格式不正确', 'warn'); return; }
      const enabled = values.enabled !== false;
      const targets = enabled ? [{ host, label: '' }] : [];
      const next = { mode: prefs.mode === 'netwatch' ? 'netwatch' : 'icmp', interval: values.interval || '10s', targets, enabled };
      const btn = m.querySelector('.ui-btn.primary');
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
      try {
        if (next.mode === 'netwatch') {
          const merged = [], seen = new Set();
          [...targets, ...v2ActiveTopoTargets()].forEach((t) => {
            if (!t.host || seen.has(t.host)) return;
            seen.add(t.host); merged.push(t);
          });
          await api('/api/link-quality/netwatch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targets: merged, interval: next.interval }) });
        }
        localStorage.setItem(QUALITY_TH_KEY(), JSON.stringify({ warn, critical }));
        localStorage.setItem(QUALITY_KEY(), JSON.stringify(next));
        state.quality = null; state.qualityAt = 0;
        UI.closeModal();
        if (typeof refreshDashExtras === 'function') refreshDashExtras();
        renderDashboard();
        UI.toast('链路质量阈值已更新', 'success');
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = '保存阈值'; }
        UI.toast(e.message, 'danger');
      }
    },
  });
}

/* ---------- 关键链路利用率：就地设置带宽 ---------- */
/* ---------- 接口行操作：真实复制 / 编辑 / 删除（不跳转页面） ----------
   实时帧的 ifaces 只有 name 没有 .id，编辑/删除前按 name 从 /api/config 取真实 id 与当前值。 */
async function v2IfaceRow(name) {
  try {
    const r = await api('/api/config?section=interfaces');
    return ((r && r.rows) || []).find((x) => x && x.name === name) || null;
  } catch (e) { return null; }
}
function v2CopyText(text, tip) {
  const done = () => UI.toast(tip || '已复制到剪贴板', 'success');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    if (ok) done(); else UI.toast(text);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else fallback();
}
function v2OpenIfaceEdit(name, onDone) {
  v2IfaceRow(name).then((row) => {
    if (!row) { UI.toast('未找到该接口的 RouterOS 配置，无法编辑', 'warn'); return; }
    UI.openForm({
      title: '编辑接口 · ' + name,
      sub: 'RouterOS /interface · 保存后直接写入当前路由器',
      note: '仅可修改名称、MTU、备注与禁用状态；MAC 地址与接口类型由路由器决定，不可修改。',
      fields: [
        { key: 'name', label: '名称', type: 'text', value: row.name || name, required: true },
        { key: 'mtu', label: 'MTU', type: 'number', value: row.mtu || '1500' },
        { key: 'comment', label: '备注', type: 'text', value: row.comment || '' },
        { key: 'disabled', label: '禁用接口', type: 'switch', value: row.disabled === 'true' },
      ],
      submitLabel: '保存接口',
      onSubmit: async (v, m) => {
        const btn = m.querySelector('.ui-btn.primary');
        if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
        try {
          await api('/api/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'interfaces', action: 'set', ids: [row['.id']], values: {
              name: String(v.name || '').trim(), mtu: String(v.mtu || '1500'),
              comment: String(v.comment || ''), disabled: v.disabled ? 'true' : 'false',
            } }),
          });
          UI.closeModal();
          UI.toast('接口已保存', 'success');
          if (typeof onDone === 'function') onDone();
        } catch (e) {
          if (btn) { btn.disabled = false; btn.textContent = '保存接口'; }
          UI.toast(e.message, 'danger');
        }
      },
    });
  });
}
function v2OpenIfaceDelete(name, onDone) {
  v2IfaceRow(name).then((row) => {
    if (!row) { UI.toast('未找到该接口的 RouterOS 配置，无法删除', 'warn'); return; }
    UI.openConfirm({
      title: '删除接口？',
      sub: 'RouterOS /interface · ' + name,
      warningTitle: '此操作会直接修改当前路由器',
      message: '接口 ' + name + ' 将从路由器配置中移除，依赖该接口的 IP、路由、DHCP 等配置可能失效。请确认不再使用后继续。',
      confirmLabel: '删除接口', danger: true,
      onConfirm: async () => {
        try {
          await api('/api/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'interfaces', action: 'remove', ids: [row['.id']] }),
          });
          UI.toast('接口已删除', 'success');
          if (typeof onDone === 'function') onDone();
        } catch (e) { UI.toast(e.message, 'danger'); }
      },
    });
  });
}
function v2LinkCaps() {
  const prefs = (typeof linkPrefs === 'function') ? linkPrefs() : [];
  const map = new Map();
  prefs.forEach((p) => map.set(p.name, Math.max(1, Number(p.capMbps) || 1000)));
  return map;
}
function v2OpenLinkModal() {
  if (!window.UI) return;
  const ifaces = ((state.latest && state.latest.ifaces) || []).filter((i) => i.running === 'true');
  const prefs = (typeof linkPrefs === 'function') ? linkPrefs() : [];
  const saved = new Set(prefs.map((p) => p.name));
  const auto = !saved.size;
  const ranked = ifaces.slice().sort((a, b) => (v2Num(b.rxBps) + v2Num(b.txBps)) - (v2Num(a.rxBps) + v2Num(a.txBps)));
  const defaultPick = new Set(ranked.slice(0, 4).map((i) => i.name));
  const rows = ranked.map((i) => {
    const cap = prefs.find((p) => p.name === i.name);
    const capMbps = cap ? cap.capMbps : (v2Num(i.linkBps) ? Math.round(v2Num(i.linkBps) / 1e6) : 1000);
    const checked = auto ? defaultPick.has(i.name) : saved.has(i.name);
    return `<label class="ui-list-row">
      <input type="checkbox" data-link="${UI.esc(i.name)}" ${checked ? 'checked' : ''}>
      <span class="grow"><b>${UI.esc(i.name)}</b><small>${UI.esc(i.type || 'Ethernet')} · 协商 ${v2Num(i.linkBps) ? v2Rate(v2Num(i.linkBps)) : '未知'}</small></span>
      <input type="number" min="1" max="400000" step="1" value="${Number(capMbps) || 1000}" data-cap="${UI.esc(i.name)}">
      <small style="width:34px;color:var(--v2-faint);font-size:10px">Mbps</small>
    </label>`;
  }).join('');
  UI.openModal({
    title: '关键链路利用率',
    sub: '系统状态 · 选择链路并设置用于计算利用率的带宽',
    wide: true,
    body: `<div class="ui-form-note">利用率 =（下行 + 上行实时速率）÷ 链路带宽；带宽默认取接口协商速率，可手动设定。阈值 60% 提醒 / 85% 警告 / 95% 严重，仅影响本页展示。</div>
      <div class="ui-fields"><div class="ui-field full">
        <span>运行中的接口 <em>*</em></span>
        <div class="ui-list-box">${rows || '<div class="ui-empty-box">暂无运行中的接口</div>'}</div>
        <small>最多选择 4 条 · 带宽单位 Mbps</small>
      </div></div>`,
    buttons: [
      { label: '取消' },
      { label: '恢复自动', onClick: () => { localStorage.removeItem(LINKS_KEY()); renderDashboard(); UI.toast('已恢复自动选择', 'success'); } },
      { label: '保存设置', kind: 'primary', keepOpen: true, onClick: (m) => {
        const chosen = [];
        m.querySelectorAll('[data-link]').forEach((c) => {
          if (!c.checked) return;
          const name = c.dataset.link;
          const cap = Math.max(1, Number(m.querySelector(`[data-cap="${CSS.escape(name)}"]`).value) || 1000);
          chosen.push({ name, capMbps: cap });
        });
        if (!chosen.length) { UI.toast('请至少选择一条链路', 'warn'); return; }
        if (chosen.length > 4) { UI.toast('最多选择 4 条链路', 'warn'); return; }
        localStorage.setItem(LINKS_KEY(), JSON.stringify(chosen.slice(0, 4)));
        UI.closeModal();
        renderDashboard();
        UI.toast('链路设置已保存', 'success');
      } },
    ],
  });
}
window.openLinkProbeSettings = v2OpenProbeModal;
window.openLinkSettingsV2 = v2OpenLinkModal;
function v2SyncSideDevice() {
  const name = $('sideDevName'), sub = $('sideDevSub');
  if (!name || !sub) return;
  name.textContent = v2DevName();
  const r = (state.latest && state.latest.resource) || {};
  const board = String(r['board-name'] || '').trim();
  const ver = String(r.version || '').replace(/\s*\(.*$/g, '').trim();
  sub.textContent = [board, ver && ('RouterOS ' + ver)].filter(Boolean).join(' · ') || 'RouterOS';
}

/* ---------- 主渲染（覆盖 views.js 的 renderDashboard） ---------- */
function renderDashboard() {
  const d = state.latest || {};
  const r = d.resource || {};
  const ifaces = d.ifaces || [];
  const cn = d.connections || { v4: 0, v6: 0, total: 0, tcp: 0, udp: 0 };
  const sel = state.selectedIface;

  /* 速率（按所选接口） */
  let rxBps = v2Num(d.totalRx), txBps = v2Num(d.totalTx);
  if (sel !== '__all__') {
    const f = ifaces.find(i => i.name === sel);
    rxBps = f ? v2Num(f.rxBps) : 0; txBps = f ? v2Num(f.txBps) : 0;
  }
  const rx = v2Mbps(rxBps), tx = v2Mbps(txBps);

  /* 峰值 */
  let peakRx = 0, peakTx = 0;
  for (const p of (state.points || [])) { peakRx = Math.max(peakRx, v2Num(p.rx)); peakTx = Math.max(peakTx, v2Num(p.tx)); }
  const pkRx = v2Mbps(peakRx), pkTx = v2Mbps(peakTx);

  /* 接口统计 */
  const online = ifaces.filter(i => i.running === 'true' && i.disabled !== 'true').length;
  const totalIf = ifaces.length;
  const sortedIf = ifaces.slice().sort((a, b) => (v2Num(b.rxBytes) + v2Num(b.txBytes)) - (v2Num(a.rxBytes) + v2Num(a.txBytes)));
  const linkCaps = v2LinkCaps();
  const linkCapBps = (i) => (linkCaps.has(i.name) ? linkCaps.get(i.name) * 1e6 : v2Num(i.linkBps));

  /* 资源 */
  const cpu = v2Num(r['cpu-load']);
  const cpuCount = v2Num(r['cpu-count']);
  const cpuMHz = v2Num(r['cpu-frequency']);
  const cpuText = [cpuCount ? cpuCount + ' 核' : '', cpuMHz ? (cpuMHz >= 1000 ? (cpuMHz / 1000).toFixed(1) + ' GHz' : cpuMHz + ' MHz') : ''].filter(Boolean).join(' · ') || '处理器负载';
  const totalMem = v2Num(r['total-memory']), freeMem = v2Num(r['free-memory']);
  const totalDisk = v2Num(r['total-hdd-space']), freeDisk = v2Num(r['free-hdd-space']);
  const memPct = totalMem ? Math.round((1 - freeMem / totalMem) * 100) : 0;
  const diskPct = totalDisk ? Math.round((1 - freeDisk / totalDisk) * 100) : 0;
  const memPair = v2BytePair(Math.max(0, totalMem - freeMem), totalMem);
  const diskPair = v2BytePair(Math.max(0, totalDisk - freeDisk), totalDisk);
  const gaugeCls = (p) => p >= 85 ? ' high' : p >= 65 ? ' warn' : '';

  /* 连接协议占比 */
  const tcp = v2Num(cn.tcp), udp = v2Num(cn.udp), connTotal = v2Num(cn.total) || 1;
  const tcpPct = (tcp / connTotal) * 100, udpPct = (udp / connTotal) * 100;
  const othPct = Math.max(0, 100 - tcpPct - udpPct);
  const v4 = v2Num(cn.v4), v6 = v2Num(cn.v6);

  /* 接口结构：归一到设计稿 4 类（Ethernet / Bridge / PPPoE / 其他），颜色对应 b1~b4 */
  const mixGroups = [
    { key: 'ether', label: 'Ethernet', cls: '' },
    { key: 'bridge', label: 'Bridge', cls: 'b2' },
    { key: 'pppoe', label: 'PPPoE', cls: 'b3' },
    { key: 'other', label: '其他', cls: 'b4' },
  ];
  const normIfType = (t) => {
    const s = String(t || '').toLowerCase();
    if (/bridge/.test(s)) return 'bridge';
    if (/pppoe|ppp|l2tp|pptp|ovpn|vpn|tunnel/.test(s)) return 'pppoe';
    if (/ether|^eth[0-9]?$|sfp/.test(s)) return 'ether';
    return 'other';
  };
  const typeCount = { ether: 0, bridge: 0, pppoe: 0, other: 0 };
  ifaces.forEach(i => { typeCount[normIfType(i.type)]++; });
  const typeArr = mixGroups.map(g => ({ t: g.key, n: typeCount[g.key], label: g.label, cls: g.cls }));

  /* 连接流量 TOP5：真实模式取 state.connRows */
  const connRows = (state.connRows || []).slice().sort((a, b) =>
    (v2Num(b.bytes) + v2Num(b['bytes-out'])) - (v2Num(a.bytes) + v2Num(a['bytes-out'])));
  const top5 = connRows.slice(0, 5);
  const top5Max = top5.length ? (v2Num(top5[0].bytes) + v2Num(top5[0]['bytes-out'])) || 1 : 1;

  /* WAN / PPPoE */
  const pppoe = ifaces.find(i => String(i.name).indexOf('pppoe') === 0 || String(i.type).toLowerCase() === 'pppoe');
  const pppoeUp = pppoe && pppoe.running === 'true';

  /* 链路质量（真实探测结果，无数据显示配置引导） */
  const qPrefs = (typeof qualityPrefs === 'function') ? qualityPrefs() : { mode: 'icmp', targets: [] };
  const qRows = ((state.quality && state.quality.rows) || []).slice(0, 3);
  const qModeLabel = qPrefs.mode === 'netwatch' ? 'Netwatch' : 'ICMP';
  const qDot = (r) => (r.state === 'bad' ? 'is-red' : r.state === 'warn' ? 'is-amber' : r.state === 'ok' ? 'is-green' : 'is-muted');
  const qOnline = (r) => (r.state === 'bad' ? '离线' : r.state === 'warn' ? '异常' : r.state === 'ok' ? '在线' : '未知');
  const qLatency = (r) => {
    const ms = r.avg == null || r.avg === '' ? null : Number(r.avg);
    if (!Number.isFinite(ms)) return '—';
    if (ms > 0 && ms < 1) return Math.round(ms * 1000) + ' µs';   // 局域网微秒级延迟，避免显示 0.0 ms
    return ms.toFixed(ms < 10 ? 1 : 0) + ' ms';
  };
  const qLoss = (r) => (r.loss == null || r.loss === '' ? '—' : Number(r.loss).toFixed(0) + '%');
  const qualityBody = qRows.length
    ? `<div class="qtable">
        <div class="qhead"><span>IP 地址</span><span>在线状态</span><span>延迟</span><span>丢包</span></div>
        ${qRows.map((r) => `<div class="qrow">
          <span class="qip">${esc(r.host)}</span>
          <span class="qstate"><span class="dot ${qDot(r)}"></span>${qOnline(r)}</span>
          <span class="qms">${qLatency(r)}</span>
          <span class="qloss">${qLoss(r)}</span>
        </div>`).join('')}
      </div>
      <div class="quality-foot"><span>${qModeLabel} · ${qRows.length} 个目标</span>${state.authRole === 'read' ? '' : `<button class="quality-cfg" id="v2QualityBtn" type="button">配置</button>`}</div>`
    : `<div class="probe-empty">
        <svg class="i"><use href="#i-pulse"/></svg>
        <p>尚未配置探测目标<br><span>${state.quality && state.quality.error ? esc(state.quality.error) : '填写 IP 或域名即可查看延迟、抖动与丢包'}</span></p>
        ${state.authRole === 'read' ? '' : `<button class="btn-xs" id="v2QualityBtn" type="button">配置</button>`}
      </div>`;

  const isLive = state.mode === 'live';
  const statusDot = isLive ? 'is-green' : state.mode === 'demo' ? 'is-amber' : '';
  const modeLabel = state.mode === 'live' ? '在线' : state.mode === 'demo' ? '演示' : state.mode === 'offline' ? '离线' : '连接中';

  /* 状态判定标准（取四项里最严重的一项作为整体）
     系统状态：CPU / 内存 / 存储 / 链路质量
       - 严重 is-red   ：任一资源占用 ≥ 90%，或链路质量有目标离线(bad)
       - 警告 is-amber ：任一资源占用 ≥ 75%，或链路质量有目标异常(warn)
       - 注意 is-blue  ：任一资源占用 ≥ 60%
       - 正常 is-green ：全部 < 60% 且链路质量无异常
     关键链路利用率（只看利用率，不涉及 CPU/内存/存储）
       - 严重 is-red   ：任一链路 ≥ 95%
       - 警告 is-amber ：任一链路 ≥ 85%
       - 注意 is-blue  ：任一链路 ≥ 60%
       - 正常 is-green ：全部 < 60% */
  const levelMeta = {
    severe: { dot: 'is-red', text: '严重' },
    warn:   { dot: 'is-amber', text: '警告' },
    notice: { dot: 'is-blue', text: '注意' },
    normal: { dot: 'is-green', text: '正常' },
  };
  const resWorst = Math.max(cpu, memPct, diskPct);
  const qWorst = qRows.some(r => r.state === 'bad') ? 'severe' : qRows.some(r => r.state === 'warn') ? 'warn' : null;
  const rank = { normal: 0, notice: 1, warn: 2, severe: 3 };
  const sysLevel = resWorst >= 90 ? 'severe' : resWorst >= 75 ? 'warn' : resWorst >= 60 ? 'notice' : 'normal';
  const sysFinal = (qWorst && rank[qWorst] > rank[sysLevel]) ? qWorst : sysLevel;
  const sysStatus = (state.mode === 'offline') ? { dot: '', text: '离线' } : levelMeta[sysFinal];

  /* 关键链路（供利用率状态与列表共用） */
  const linkRows = (() => {
    const picked = [...linkCaps.keys()].map(name => ifaces.find(i => i.name === name)).filter(i => i && i.running === 'true');
    return (picked.length ? picked : sortedIf.filter(i => i.running === 'true')).slice(0, 4);
  })();
  const linkUtils = linkRows.map(i => linkCapBps(i) > 0 ? Math.min(100, ((v2Num(i.rxBps) + v2Num(i.txBps)) / linkCapBps(i)) * 100) : 0);
  const utilWorst = linkUtils.length ? Math.max(...linkUtils) : 0;
  const utilLevel = utilWorst >= 95 ? 'severe' : utilWorst >= 85 ? 'warn' : utilWorst >= 60 ? 'notice' : 'normal';
  const utilStatus = linkRows.length ? levelMeta[utilLevel] : { dot: '', text: '无链路' };

  const content = $('content');
  content.className = 'content dash';

  content.innerHTML = `
  <div class="page-head">
    <div>
      <h1>仪表盘</h1>
      <div class="meta">
        <span>${esc(v2DevName())}</span><span class="sep"></span>
        <span class="hide-sm">${esc(r['board-name'] || 'RouterOS')}</span><span class="sep hide-sm"></span>
        <span>RouterOS ${esc(String(r.version || '').replace(/\s*\(.*$/g, ''))}</span><span class="sep"></span>
        <span>已运行 ${fmtUptime(d.uptime)}</span>
      </div>
    </div>
    <div class="actions">
      <button class="btn" id="v2IfaceBtn" type="button" title="选择速率统计接口">
        <svg class="i"><use href="#i-ethernet"/></svg>${esc(sel === '__all__' ? '全部接口' : sel)}
        <svg class="i chev"><use href="#i-chev-down"/></svg>
      </button>
      <button class="btn ghost" id="v2LayoutBtn" type="button" title="表格密度">
        <svg class="i"><use href="#i-layout"/></svg>${esc('布局')}
      </button>
    </div>
  </div>

  <div class="grid">
    <section class="kpis">
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico blue"><svg class="i"><use href="#i-down"/></svg></span>下行速率</div>
        <div class="kpi-main">
          <div class="kpi-num">${rx.v}<span class="u">${rx.u}</span></div>
          <svg class="spark" data-spark="rx" viewBox="0 0 96 34" preserveAspectRatio="none"></svg>
        </div>
        <div class="kpi-foot"><span>峰值 ${pkRx.v} ${pkRx.u}</span><span>RX</span></div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico teal"><svg class="i"><use href="#i-up"/></svg></span>上行速率</div>
        <div class="kpi-main">
          <div class="kpi-num">${tx.v}<span class="u">${tx.u}</span></div>
          <svg class="spark teal" data-spark="tx" viewBox="0 0 96 34" preserveAspectRatio="none"></svg>
        </div>
        <div class="kpi-foot"><span>峰值 ${pkTx.v} ${pkTx.u}</span><span>TX</span></div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico violet"><svg class="i"><use href="#i-conn"/></svg></span>活跃连接</div>
        <div class="kpi-main">
          <div class="kpi-num">${v2Int(cn.total)}</div>
          ${isLive ? '' : `<span class="status"><span class="dot ${statusDot}"></span>${modeLabel}</span>`}
        </div>
        <div class="kpi-foot">
          <span>IPv4 ${v2Int(v4)} · IPv6 ${v2Int(v6)}</span>
          <span class="mini-bar"><i class="ipv4" style="width:${v2Pct(v4, v4 + v6).toFixed(1)}%"></i><i class="ipv6" style="width:${v2Pct(v6, v4 + v6).toFixed(1)}%"></i></span>
        </div>
      </article>
      <article class="card kpi">
        <div class="kpi-top"><span class="kpi-ico green"><svg class="i"><use href="#i-ifaces"/></svg></span>在线接口</div>
        <div class="kpi-main">
          <div class="kpi-num">${online}<span class="of">/ ${totalIf}</span></div>
          <span class="if-dots">${ifaces.slice(0, 9).map(() => '<i></i>').join('')}</span>
        </div>
        <div class="kpi-foot"><span>${online === totalIf ? '全部接口运行正常' : (totalIf - online) + ' 个接口离线'}</span><span>${totalIf - online} 离线</span></div>
      </article>
    </section>

    <section class="card chart-card span8">
      <div class="card-head">
        <div><h2 class="card-title">实时流量</h2><div class="card-sub" id="v2ChartSub" title="${v2Range === '6m' ? `当前保留 ${(state.points || []).length} 个采样点` : '服务端聚合历史'}">${V2_RANGE_META[v2Range].title} · ${V2_RANGE_META[v2Range].sub}</div></div>
        <div class="seg" role="tablist">
          <button type="button" class="${v2Range === '6m' ? 'on' : ''}" data-range="6m">6 分钟</button>
          <button type="button" class="${v2Range === '1h' ? 'on' : ''}" data-range="1h">1 小时</button>
          <button type="button" class="${v2Range === '24h' ? 'on' : ''}" data-range="24h">24 小时</button>
        </div>
      </div>
      <div class="chart-head">
        <div class="legend">
          <span><i class="rx"></i>下载 RX <b>${rx.v}</b> ${rx.u}</span>
          <span><i class="tx"></i>上传 TX <b>${tx.v}</b> ${tx.u}</span>
        </div>
        <span class="status auto" style="font-size:10.5px">自动缩放</span>
      </div>
      <div class="chart-wrap" id="chartWrapV2"><svg class="chart" id="chartV2" aria-label="实时流量趋势"></svg></div>
    </section>

    <section class="card status-card span4">
      <div class="card-head">
        <div><h2 class="card-title">系统状态</h2><div class="card-sub">资源占用与链路</div></div>
        <span class="status" title="依据 CPU / 内存 / 存储 / 链路质量综合判定"><span class="dot ${sysStatus.dot}"></span>${sysStatus.text}</span>
      </div>
      <div class="status-body">
        <div class="gauges">
          <div class="gauge cpu${gaugeCls(cpu)}" title="CPU ${cpu}% · ${esc(cpuText)}">
            <div class="gauge-ring" style="--p:${Math.max(0, Math.min(100, cpu))}%"><span class="gauge-num"><b>${cpu}</b><i>%</i></span></div>
            <div class="gauge-title">CPU</div>
            <div class="gauge-sub">${esc(cpuText)}</div>
          </div>
          <div class="gauge mem${gaugeCls(memPct)}" title="内存 ${memPct}% · ${esc(memPair)}">
            <div class="gauge-ring" style="--p:${Math.max(0, Math.min(100, memPct))}%"><span class="gauge-num"><b>${memPct}</b><i>%</i></span></div>
            <div class="gauge-title">内存</div>
            <div class="gauge-sub" title="${esc(memPair)}">${esc(memPair)}</div>
          </div>
          <div class="gauge disk${gaugeCls(diskPct)}" title="存储 ${diskPct}% · ${esc(diskPair)}">
            <div class="gauge-ring" style="--p:${Math.max(0, Math.min(100, diskPct))}%"><span class="gauge-num"><b>${diskPct}</b><i>%</i></span></div>
            <div class="gauge-title">存储</div>
            <div class="gauge-sub" title="${esc(diskPair)}">${esc(diskPair)}</div>
          </div>
        </div>
        <div class="hairline"></div>
        <div class="done-block">
          <div class="block-label">WAN</div>
          ${pppoe
            ? `<div class="wan-row"><span class="dot ${pppoeUp ? 'is-green' : 'is-amber'}"></span>PPPoE ${pppoeUp ? '已连接' : '未连接'}<span class="right">${fmtUptime(d.uptime)}</span></div>
               <div class="wan-sub"><span>${esc(pppoe.name)}</span><span class="num">↓ ${v2Rate(pppoe.rxBps)} &nbsp; ↑ ${v2Rate(pppoe.txBps)}</span></div>`
            : `<div class="wan-row"><span class="dot is-amber"></span>未检测到 PPPoE<span class="right">${fmtUptime(d.uptime)}</span></div>
               <div class="wan-sub"><span>—</span><span class="num">↓ ${v2Rate(rxBps)} &nbsp; ↑ ${v2Rate(txBps)}</span></div>`}
        </div>
        <div class="hairline" style="margin:13px 0"></div>
        <div class="quality-head"><span class="block-label">链路质量</span><span class="quality-mode">${qModeLabel}</span></div>
        ${qualityBody}
      </div>
    </section>

    <section class="card if-card span8">
      <div class="card-head">
        <div><h2 class="card-title">接口流量排行</h2><div class="card-sub">按累计流量排序 · 共 ${totalIf} 个接口</div></div>
        <a class="link" href="#" data-nav="interfacesCenter">查看全部<svg class="i"><use href="#i-chevron"/></svg></a>
      </div>
      <table class="if-table">
        <colgroup><col style="width:30%"><col style="width:11%"><col style="width:13.5%"><col style="width:13.5%"><col style="width:14%"><col><col style="width:32px"></colgroup>
        <thead><tr><th>接口</th><th>状态</th><th class="r">下行</th><th class="r">上行</th><th>利用率</th><th class="r">累计流量</th><th></th></tr></thead>
        <tbody>
          ${sortedIf.slice(0, 8).map(i => {
            const ist = v2IfaceState(i);
            const rxr = v2Mbps(i.rxBps), txr = v2Mbps(i.txBps);
            const totalB = v2Num(i.rxBytes) + v2Num(i.txBytes);
            const bf = v2Bytes(totalB);
            const linkBps = linkCapBps(i);
            const util = linkBps > 0 ? Math.min(100, ((v2Num(i.rxBps) + v2Num(i.txBps)) / linkBps) * 100) : 0;
            const typ = String(i.type || 'ethernet').toLowerCase();
            const badge = typ.indexOf('bridge') >= 0 ? ['br', 'br'] : typ.indexOf('pppoe') >= 0 ? ['ppp', 'ppp'] : typ.indexOf('wireguard') >= 0 ? ['wg', 'wg'] : typ.indexOf('lo') >= 0 ? ['lo', 'lo'] : ['eth', 'eth'];
            return `<tr>
              <td><div class="if-name"><span class="if-badge ${badge[0]}">${badge[1]}</span><span><b>${esc(i.name)}</b><small>${esc(i.type || 'Ethernet')}</small></span></div></td>
              <td><span class="status" title="RouterOS: disabled=${esc(String(i.disabled || 'false'))} · running=${esc(String(i.running || 'false'))}"><span class="dot ${ist.dot}"></span>${ist.text}</span></td>
              <td class="r"><span class="num">${rxr.v}<span class="u">${rxr.u}</span></span></td>
              <td class="r"><span class="num">${txr.v}<span class="u">${txr.u}</span></span></td>
              <td><span class="util-cell"><span class="bar"><i style="width:${util.toFixed(0)}%"></i></span><span>${util.toFixed(0)}%</span></span></td>
              <td class="r"><span class="num">${bf.v} <span class="u">${bf.u}</span></span></td>
              <td><button class="row-more" type="button" data-if="${esc(i.name)}" title="${esc(i.name)}"><svg class="i" style="width:14px;height:14px"><use href="#i-more"/></svg></button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="if-mobile">
        ${sortedIf.slice(0, 8).map(i => {
          const rxr = v2Mbps(i.rxBps), txr = v2Mbps(i.txBps);
          const bf = v2Bytes(v2Num(i.rxBytes) + v2Num(i.txBytes));
          const typ = String(i.type || 'ethernet').toLowerCase();
          const badge = typ.indexOf('bridge') >= 0 ? ['br', 'br'] : typ.indexOf('pppoe') >= 0 ? ['ppp', 'ppp'] : typ.indexOf('wireguard') >= 0 ? ['wg', 'wg'] : ['eth', 'eth'];
          return `<div class="if-row">
            <div class="if-name"><span class="if-badge ${badge[0]}">${badge[1]}</span><span><b>${esc(i.name)}</b><small>${esc(i.type || 'Ethernet')} · ${bf.v} ${bf.u}</small></span></div>
            <div class="if-rates"><b>↓ ${rxr.v}</b> <b>↑ ${txr.v}</b><br>${rxr.u}</div>
          </div>`;
        }).join('')}
      </div>
    </section>

    <div class="span4 stack">
      <section class="card conn-card">
        <div class="card-head">
          <div><h2 class="card-title">连接状态</h2><div class="card-sub">来自路由器连接表</div></div>
        </div>
        <div class="conn-body">
          <div class="conn-top">
            <svg class="donut" viewBox="0 0 124 124" aria-label="连接分布">
              ${v2Donut(v4, v6)}
              <text x="62" y="59" text-anchor="middle" font-size="20" font-weight="650" style="fill:var(--v2-ink);font-variant-numeric:tabular-nums">${v2Int(cn.total)}</text>
              <text x="62" y="76" text-anchor="middle" font-size="10" style="fill:var(--v2-faint)">活跃连接</text>
            </svg>
            <div class="conn-legend">
              <div class="row"><i class="dot" style="background:var(--v2-accent);box-shadow:none"></i>IPv4<b>${v2Int(v4)}</b><small>${v2Pct(v4, v4 + v6).toFixed(1)}%</small></div>
              <div class="row"><i class="dot" style="background:var(--v2-teal);box-shadow:none"></i>IPv6<b>${v2Int(v6)}</b><small>${v2Pct(v6, v4 + v6).toFixed(1)}%</small></div>
            </div>
          </div>
          <div class="proto">
            <div class="proto-head"><span>协议分布</span><span>TCP ${tcpPct.toFixed(1)}% · UDP ${udpPct.toFixed(1)}% · 其他 ${othPct.toFixed(1)}%</span></div>
            <div class="proto-bar"><i class="tcp" style="width:${tcpPct.toFixed(1)}%"></i><i class="udp" style="width:${udpPct.toFixed(1)}%"></i><i class="oth" style="width:${othPct.toFixed(1)}%"></i></div>
            <div class="proto-legend"><span>TCP <b>${v2Int(tcp)}</b></span><span>UDP <b>${v2Int(udp)}</b></span><span>其他 <b>${v2Int(connTotal - tcp - udp)}</b></span></div>
          </div>
        </div>
      </section>

      <section class="card mix-card">
        <div class="card-head" style="padding-bottom:0">
          <div><h2 class="card-title">接口结构</h2><div class="card-sub">按实际接口类型统计</div></div>
          <span class="status"><span class="dot ${statusDot}"></span>${online} 在线</span>
        </div>
        <div class="mix-body">
          <div class="mix-bar">${typeArr.filter(x => x.n > 0).map(x => `<i class="${x.cls}" style="width:${(x.n / (totalIf || 1) * 100).toFixed(1)}%"></i>`).join('')}</div>
          <div class="mix-legend">${typeArr.map(x => `<span><i class="${x.cls}"></i>${x.label}<b>${x.n}</b></span>`).join('')}</div>
        </div>
      </section>
    </div>

    <section class="card flow-card span7">
      <div class="card-head">
        <div><h2 class="card-title">连接流量 TOP 5</h2><div class="card-sub">按连接累计字节数排序</div></div>
        <a class="link" href="#" data-nav="connectionStats">全部连接<svg class="i"><use href="#i-chevron"/></svg></a>
      </div>
      <table class="flow-table">
        <colgroup><col style="width:45%"><col style="width:13%"><col style="width:20%"><col style="width:22%"></colgroup>
        <thead><tr><th>连接</th><th>协议</th><th class="r">流量</th><th class="r">占比</th></tr></thead>
        <tbody>
          ${top5.length ? top5.map(row => {
            const src = row['src-address'] || row.src || '—';
            const dst = row['dst-address'] || row.dst || '—';
            const proto = String(row.protocol || '').toLowerCase();
            const bytes = v2Num(row.bytes) + v2Num(row['bytes-out']);
            const bf = v2Bytes(bytes);
            const pct = (bytes / top5Max) * 100;
            return `<tr>
              <td><div class="flow-conn"><b>${esc(src)}</b><span class="arrow">→</span><span>${esc(dst)}</span></div></td>
              <td><span class="proto-tag">${esc(proto || '—')}</span></td>
              <td class="r num" style="font-weight:550;color:var(--v2-ink)">${bf.v} ${bf.u}</td>
              <td><div class="share"><span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span><span>${pct.toFixed(pct < 10 ? 1 : 0)}%</span></div></td>
            </tr>`;
          }).join('') : `<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--v2-faint)">${state.mode === 'live' ? '暂无连接行数据' : '演示模式暂无连接明细'}</td></tr>`}
        </tbody>
      </table>
    </section>

    <section class="card link-card span5">
      <div class="card-head">
        <div><h2 class="card-title">关键链路利用率</h2><div class="card-sub">基于接口真实速率与链路带宽</div></div>
        <span class="status" title="依据所选关键链路的最高利用率判定"><span class="dot ${utilStatus.dot}"></span>${utilStatus.text}</span>
      </div>
      <div class="link-list">
        ${linkRows.map((i, idx) => {
          const util = linkUtils[idx];
          const lv = util >= 95 ? '严重' : util >= 85 ? '警告' : util >= 60 ? '注意' : '正常';
          const rxr = v2Mbps(i.rxBps), txr = v2Mbps(i.txBps);
          return `<div class="link-row">
            <div><div class="name">${esc(i.name)}</div><div class="rates">↓ ${rxr.v} · ↑ ${txr.v} ${rxr.u}</div></div>
            <div class="meter"><i style="width:${util.toFixed(1)}%;background:${util >= 85 ? 'var(--v2-red)' : util >= 60 ? 'var(--v2-amber)' : 'var(--v2-green)'}"></i>
              <span class="tick" style="left:60%"></span><span class="tick" style="left:85%"></span><span class="tick" style="left:95%"></span></div>
            <div class="val">${util.toFixed(0)}%<small>${lv}</small></div>
          </div>`;
        }).join('') || '<div style="padding:20px;color:var(--v2-faint);font-size:11px">暂无运行中的接口</div>'}
      </div>
      <div class="link-note"><span>阈值 60 / 85 / 95% · 链路带宽在「接口与地址」中配置</span></div>
    </section>
  </div>`;

  /* 迷你趋势：用真实采样点 */
  document.querySelectorAll('[data-spark]').forEach(el => {
    const key = el.dataset.spark;
    const data = (state.points || []).slice(-61).map(p => v2Num(p[key]) / 1e6);
    if (data.length >= 2) v2Spark(el, data);
  });
  v2Chart();

  /* 事件绑定 */
  const ib = $('v2IfaceBtn');
  if (ib) ib.onclick = (e) => { e.stopPropagation(); v2OpenIfaceMenu(ib); };
  const lb = $('v2LayoutBtn');
  if (lb) lb.onclick = (e) => { e.stopPropagation(); v2OpenLayoutMenu(lb); };
  const qb = $('v2QualityBtn');
  if (qb) qb.onclick = v2OpenProbeModal;
  content.querySelectorAll('.seg [data-range]').forEach(btn => {
    btn.onclick = () => {
      v2Range = btn.dataset.range;
      content.querySelectorAll('.seg [data-range]').forEach(b => b.classList.toggle('on', b === btn));
      const sub = $('v2ChartSub');
      if (sub) {
        const meta = V2_RANGE_META[v2Range];
        sub.textContent = meta.title + ' · ' + meta.sub;
        sub.title = v2Range === '6m' ? '当前保留 ' + (state.points || []).length + ' 个采样点' : '服务端聚合历史';
      }
      v2Chart();
    };
  });
  content.querySelectorAll('.row-more[data-if]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const name = btn.dataset.if;
      const iface = ifaces.find((i) => i.name === name) || {};
      const cap = linkCapBps(iface);
      const util = cap > 0 ? Math.min(100, ((v2Num(iface.rxBps) + v2Num(iface.txBps)) / cap) * 100) : 0;
      const rxr = v2Mbps(iface.rxBps), txr = v2Mbps(iface.txBps);
      const bf = v2Bytes(v2Num(iface.rxBytes) + v2Num(iface.txBytes));
      /* 设计稿 rowData()：按表头逐列取真实字段，生成详情与摘要 */
      const refresh = () => {
        if (typeof refreshDashExtras === 'function') refreshDashExtras();
        renderDashboard();
      };
      const afterWrite = () => { refresh(); };
      /* MAC 取自后端实时帧的 mac-address（proplist 已补），缺字段时显示占位 */
      const mac = iface['mac-address'] || iface.macAddress || '—';
      const detail = [
        ['接口', name], ['类型', iface.type || 'Ethernet'],
        ['状态', iface.running === 'true' && iface.disabled !== 'true' ? 'UP' : 'DOWN'],
        ['MAC 地址', mac],
        ['下行', rxr.v + ' ' + rxr.u], ['上行', txr.v + ' ' + txr.u],
        ['利用率', util.toFixed(0) + '%'], ['带宽', cap > 0 ? v2Rate(cap) : '未知'],
        ['累计流量', bf.v + ' ' + bf.u],
      ];
      const summary = name + '\n' + detail.map((p) => p[0] + '：' + p[1]).join('\n');
      const copy = (text, tip) => v2CopyText(text, tip);
      UI.openMenu(btn, [
        { label: '查看', checkSlot: true, action: () => UI.openModal({
          title: name, sub: '行详情 · 接口实时数据',
          body: `<div class="ui-detail">${detail.map((p) => `<div class="ui-detail-row"><small>${esc(p[0])}</small><b>${esc(p[1])}</b></div>`).join('')}</div>`,
          actions: [
            { label: '复制摘要', onClick: () => copy(summary, '已复制摘要') },
            { label: '编辑', cls: 'primary', onClick: () => v2OpenIfaceEdit(name, afterWrite) },
            { label: '删除', cls: 'danger', onClick: () => v2OpenIfaceDelete(name, afterWrite) },
            { label: '关闭' },
          ],
        }) },
        { label: '复制摘要', checkSlot: true, action: () => copy(summary, '已复制摘要') },
        { label: '编辑', checkSlot: true, action: () => v2OpenIfaceEdit(name, afterWrite) },
        { sep: true },
        { label: '删除', checkSlot: true, danger: true, action: () => v2OpenIfaceDelete(name, afterWrite) },
      ], { head: `<div class="ui-menu-head"><b>${esc(name)}</b><small>行操作 · mac ${esc(mac)}</small></div>` });
    };
  });
  content.querySelectorAll('[data-nav]').forEach(a => a.onclick = (e) => {
    e.preventDefault(); if (typeof navigate === 'function') navigate(a.dataset.nav);
  });
  v2SyncSideDevice();
  if (typeof refreshDashExtras === 'function') refreshDashExtras();
}

/* resize 只绑定一次，避免每秒重绘时累积监听器 */
if (!window._v2ResizeBound) {
  window.addEventListener('resize', () => { if (state.section === 'dashboard') v2Chart(); });
  window._v2ResizeBound = true;
}

/* 恢复上次保存的表格密度（设计稿：只影响当前浏览器显示） */
try { if (localStorage.getItem('ros-density') === 'compact') document.body.classList.add('ui-compact'); } catch (e) { /* ignore */ }

/* 暴露给 app.js 的主题/语言切换重绘：它们调用全局 renderDashboard，已被本函数覆盖 */
window.renderDashboard = renderDashboard;
