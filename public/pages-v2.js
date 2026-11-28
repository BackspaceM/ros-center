/* ============================================================
   ROS Center · 非仪表盘页按设计稿结构重写
   虚拟页（流量统计/IP监控/设备管理）完全重写接真实数据；
   配置表格页保留原 CRUD 事件，外层套设计稿 KPI + 主卡 + 侧栏结构。
   依赖：app.js 的 state/api/num/fmtBytes/fmtRate/fmtBytesRate/fmtTime/toast
   作用域样式来自 design.css（.ui-v2 .content.dash ...）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 基础工具 ---------- */
  function esc2(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function ic(id, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '"><use href="#i-' + id + '"/></svg>'; }
  function n2(v, d) { const x = Number(v); return Number.isFinite(x) ? x : (d || 0); }
  function bytes(v) {
    let b = n2(v), i = 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return { v: b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2), u: u[i] };
  }
  function rate(v) {
    let b = n2(v), i = 0; const u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return { v: b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2), u: u[i] };
  }
  function status(dot, text) {
    return '<span class="status">' + (dot ? '<span class="dot is-' + dot + '"></span>' : '') + esc2(text) + '</span>';
  }
  function kpiCard(o) {
    const ico = o.icon ? '<span class="kpi-ico ' + (o.color || 'blue') + '">' + ic(o.icon) + '</span>' : '';
    let main = '<div class="kpi-num">' + esc2(o.num) + (o.unit ? '<span class="u' + (o.pct ? ' pct' : '') + '">' + esc2(o.unit) + '</span>' : '') + '</div>';
    if (o.spark) main += o.spark;
    else if (o.state) main += status(o.state.dot, o.state.text);
    const foot = (o.foot || []).map((x) => '<span>' + esc2(x) + '</span>').join('');
    return '<article class="card kpi"><div class="kpi-top">' + ico + esc2(o.label) + '</div>' +
      '<div class="kpi-main">' + main + '</div><div class="kpi-foot">' + foot + '</div></article>';
  }
  function sparkSvg(vals, color) {
    vals = (vals || []).map((v) => n2(v));
    if (vals.length < 2) return '';
    const max = Math.max.apply(null, vals) || 1, W = 96, H = 34;
    const d = vals.map((v, i) => 'L' + (3 + i * (W - 6) / (vals.length - 1)).toFixed(1) + ' ' + (H - 3 - (v / max) * (H - 8)).toFixed(1)).join(' ');
    return '<svg class="spark' + (color ? ' ' + color : '') + '" viewBox="0 0 96 34" preserveAspectRatio="none"><path d="' + d.replace(/^L/, 'M') + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function areaSvg(series, gid) {
    const W = 900, H = 280, top = 16, bot = 256;
    series = series || [];
    if (!series.length) return '<svg class="area-chart" viewBox="0 0 900 280" preserveAspectRatio="none"><text x="450" y="140" text-anchor="middle" style="fill:var(--v2-faint);font-size:13px">等待采样数据…</text></svg>';
    const n = series.length;
    const max = Math.max(1, Math.max.apply(null, series.map((s) => n2(s.rx) + n2(s.tx))));
    const X = (i) => n <= 1 ? 0 : i * W / (n - 1);
    const Y = (v) => bot - (n2(v) / max) * (bot - top);
    const line = (k) => series.map((s, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s[k]).toFixed(1)).join(' ');
    const area = (k) => line(k) + ' L ' + W + ' ' + bot + ' L 0 ' + bot + ' Z';
    let peakI = 0;
    series.forEach((s, i) => { if (n2(s.rx) + n2(s.tx) > n2(series[peakI].rx) + n2(series[peakI].tx)) peakI = i; });
    const grid = [16, 76, 136, 196, 256].map((y) => '<line x1="0" y1="' + y + '" x2="900" y2="' + y + '" class="grid-line"/>').join('');
    const seriesData = esc2(JSON.stringify(series.map((s) => ({ label: s.label || '', rx: n2(s.rx), tx: n2(s.tx) }))));
    return '<svg class="area-chart" viewBox="0 0 900 280" preserveAspectRatio="none" role="img" aria-label="流量趋势图" data-series="' + seriesData + '">' +
      '<defs>' +
      '<linearGradient id="' + gid + 'd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v2-accent);stop-opacity:.20"/><stop offset="1" style="stop-color:var(--v2-accent);stop-opacity:0"/></linearGradient>' +
      '<linearGradient id="' + gid + 'u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v2-teal);stop-opacity:.15"/><stop offset="1" style="stop-color:var(--v2-teal);stop-opacity:0"/></linearGradient>' +
      '</defs>' + grid +
      '<path d="' + area('rx') + '" fill="url(#' + gid + 'd)"/>' +
      '<path d="' + area('tx') + '" fill="url(#' + gid + 'u)"/>' +
      '<path d="' + line('tx') + '" fill="none" style="stroke:var(--v2-teal)" stroke-width="1.7" vector-effect="non-scaling-stroke"/>' +
      '<path d="' + line('rx') + '" fill="none" style="stroke:var(--v2-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + X(peakI).toFixed(1) + '" cy="' + Y(n2(series[peakI].rx) + n2(series[peakI].tx)).toFixed(1) + '" r="4" style="fill:var(--v2-accent)" stroke="var(--v2-surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      '</svg>';
  }
  function ifBadge(name) {
    const s = String(name || '');
    let k = 'eth', t = 'eth';
    if (/^bridge|^br/i.test(s)) { k = 'br'; t = 'br'; }
    else if (/ppp|pppoe/i.test(s)) { k = 'ppp'; t = 'ppp'; }
    else if (/^wg|wireguard/i.test(s)) { k = 'wg'; t = 'wg'; }
    else if (/^lo$/i.test(s)) { k = 'lo'; t = 'lo'; }
    else if (/vlan/i.test(s)) { k = 'vlan'; t = 'vlan'; }
    else if (/^wifi|^wlan/i.test(s)) { k = 'wifi'; t = 'wifi'; }
    return '<span class="if-badge ' + k + '">' + t + '</span>';
  }
  function shareBar(pct) {
    const p = Math.max(0, Math.min(100, n2(pct)));
    return '<div class="share"><span class="bar"><i style="width:' + p.toFixed(0) + '%"></i></span><span>' + p.toFixed(0) + '%</span></div>';
  }

  /* ============================================================
     流量统计页（完全重写，接 /api/usage 真实数据）
     ============================================================ */
  const RANGE_TABS = [
    ['24h', () => L('24 小时', '24 hours'), 'today'],
    ['7d', () => L('7 天', '7 days'), 'week'],
    ['30d', () => L('30 天', '30 days'), 'month'],
  ];
  let v2StatsTab = '24h';
  /* KPI 只在首次拿到数据 / 切换时间范围时刷新一次，不随每 2 秒的统计轮询跳动 */
  let v2StatsKpiPending = true;
  /* 残留自定义统计范围的一次性恢复标记（每次进入页面重置） */
  let v2StatsScopeReset = false;
  /* 延迟求值：语言切换后重绘时取到当前语言的文案 */
  function rangeKpiLabels() {
    if (v2StatsTab === '7d') return [L('7 天总流量', '7-day total'), L('7 天下行', '7-day download'), L('7 天上行', '7-day upload')];
    if (v2StatsTab === '30d') return [L('30 天总流量', '30-day total'), L('30 天下行', '30-day download'), L('30 天上行', '30-day upload')];
    return [L('今日总流量', 'Today total'), L('今日下行', 'Today download'), L('今日上行', 'Today upload')];
  }
  function wanMbps(d) {
    /* WAN 口带宽：优先接口与地址页配置（localStorage ros-center-wan），其次接口协商速率，默认 100 Mbps */
    try {
      const c = JSON.parse(localStorage.getItem('ros-center-wan') || 'null');
      if (c && Number(c.capMbps) > 0) return Number(c.capMbps);
    } catch (e) { /* ignore */ }
    const ifaces = (state.latest && state.latest.ifaces) || [];
    const wanName = (() => { try { const c = JSON.parse(localStorage.getItem('ros-center-wan') || 'null'); return c && c.name; } catch (e) { return null; } })();
    const wan = ifaces.find((i) => i.name === wanName) || ifaces.find((i) => /pppoe|ether1|wan/i.test(i.name + ' ' + (i.comment || '')));
    if (wan && Number(wan.linkBps) > 0) return Math.round(Number(wan.linkBps) / 1e6);
    return 100;
  }
  function fmtWan(mbps) {
    if (mbps >= 1000) return (mbps / 1000) + 'G';
    return mbps + 'M';
  }
  function pctChange(cur, prev) {
    if (!prev) return cur ? '+100%' : '0%';
    const p = ((cur - prev) / prev) * 100;
    return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  }
  function statsKpis(d) {
    const range = ['today','week','month','total'].indexOf(state.usageRange) >= 0 ? state.usageRange : 'today';
    const v = (d && d[range]) || { rx: 0, tx: 0 };
    const totalB = n2(v.rx) + n2(v.tx);
    const total = bytes(totalB), rx = bytes(v.rx), tx = bytes(v.tx);
    const series = (d && d.series && d.series[range]) || [];
    const peak = (d && d.peak) || { rx: 0, tx: 0, total: 0, at: 0 };
    const yv = (d && d.yesterday) || { rx: 0, tx: 0 };
    const yTotal = n2(yv.rx) + n2(yv.tx);
    const kpiLabels = rangeKpiLabels();
    const rxPct = totalB > 0 ? (n2(v.rx) / totalB * 100).toFixed(1) : '0.0';
    const txPct = totalB > 0 ? (n2(v.tx) / totalB * 100).toFixed(1) : '0.0';
    /* 峰值也跟随所选范围：24h 用 API 的瞬时峰值，7d/30d 用该范围最大桶的真实均值（与速率趋势卡片一致） */
    let peakBps = n2(peak.total), peakTime = peak.at ? new Date(peak.at).toTimeString().slice(0, 5) : '—';
    if (range !== 'today' && series.length) {
      let pi = 0;
      series.forEach((s, i) => { if (n2(s.rx) + n2(s.tx) > n2(series[pi].rx) + n2(series[pi].tx)) pi = i; });
      peakBps = (n2(series[pi].rx) + n2(series[pi].tx)) * 8 / 3600;
      peakTime = series[pi].label || peakTime;
    }
    const peakR = rate(peakBps);
    const wan = fmtWan(wanMbps(d));
    /* 区间均速：由所选范围的累计值与时长计算，与 KPI 一起冻结，不随实时速率跳动 */
    const spanSec = { today: 86400, week: 7 * 86400, month: 30 * 86400, total: 0 }[range] || 86400;
    const avg = (bps) => rate(spanSec > 0 ? bps * 8 / spanSec : 0);
    const avgR = avg(n2(v.rx)), avgT = avg(n2(v.tx));
    const vsY = L('较昨日', 'vs yesterday'), share = L('占', 'Share');
    return [
      kpiCard({ label: kpiLabels[0], icon: 'chart', color: 'blue', num: total.v, unit: total.u,
        state: { dot: d && d.dataReal ? 'green' : 'amber', text: d && d.dataReal ? L('正常', 'OK') : L('演示', 'Demo') },
        foot: [vsY + ' ' + pctChange(totalB, yTotal), 'WAN ' + wan] }),
      kpiCard({ label: kpiLabels[1], icon: 'down', color: 'teal', num: rx.v, unit: rx.u,
        spark: sparkSvg(series.map((s) => s.rx), 'teal'), foot: [share + ' ' + rxPct + '%', L('均速', 'Avg') + ' ' + avgR.v + ' ' + avgR.u] }),
      kpiCard({ label: kpiLabels[2], icon: 'up', color: 'violet', num: tx.v, unit: tx.u,
        spark: sparkSvg(series.map((s) => s.tx), 'violet'), foot: [share + ' ' + txPct + '%', L('均速', 'Avg') + ' ' + avgT.v + ' ' + avgT.u] }),
      kpiCard({ label: L('峰值速率', 'Peak rate'), icon: 'pulse', color: 'amber', num: peakR.v, unit: peakR.u,
        state: { dot: 'green', text: peakTime }, foot: [L('所选范围峰值', 'Peak in range'), L('不随实时速率跳动', 'Fixed for range')] })
    ].join('');
  }

  function statsCharts(d) {
    const series = (d && d.series) || {};
    return RANGE_TABS.map(([key, label, sk]) => {
      const s = series[sk] || [];
      const cur = (d && d.rate) || { rx: 0, tx: 0 };
      const on = key === v2StatsTab ? ' on' : '';
      const maxV = s.reduce((a, x) => Math.max(a, n2(x.rx) + n2(x.tx)), 0);
      /* 横轴刻度按数据实际位置取标签：与折线 X(i)=i/(n-1) 及 space-between 布局对齐，
         避免固定 00/06/12/18 刻度与「只到当前小时」的序列错位（指着的时间对不上） */
      const TICKS = 5;
      const xs = s.length <= TICKS
        ? s.map((x) => x.label)
        : Array.from({ length: TICKS }, (_, j) => s[Math.round(j / (TICKS - 1) * (s.length - 1))].label);
      return '<div class="tab-panel' + on + '" data-panel="' + key + '">' +
        '<div class="chart-head"><div class="legend">' +
        '<span><i class="rx"></i>' + L('下行', 'RX') + '<b>' + rate(cur.rx).v + ' ' + rate(cur.rx).u + '</b></span>' +
        '<span><i class="tx"></i>' + L('上行', 'TX') + '<b>' + rate(cur.tx).v + ' ' + rate(cur.tx).u + '</b></span></div>' +
        '<span class="toolbar-note">' + L('峰值', 'Peak') + ' ' + rate(maxV * 8 / 3600).v + ' ' + rate(maxV * 8 / 3600).u + ' · ' + L('真实计数', 'real counters') + '</span></div>' +
        '<div class="chart-body"><div class="chart-wrap tall">' + areaSvg(s, 'st' + key) + '</div>' +
        '<div class="chart-x">' + xs.map((x) => '<span>' + esc2(x) + '</span>').join('') + '</div></div></div>';
    }).join('');
  }

  function statsHourBars(d) {
    const s = ((d && d.series && d.series.today) || []).slice(0, 24);
    if (!s.length) return '<div class="rail-body"><div class="empty">' + L('等待小时数据…', 'Waiting for hourly data…') + '</div></div>';
    const max = s.reduce((a, x) => Math.max(a, n2(x.rx) + n2(x.tx)), 0) || 1;
    let peakI = 0;
    s.forEach((x, i) => { if (n2(x.rx) + n2(x.tx) > n2(s[peakI].rx) + n2(s[peakI].tx)) peakI = i; });
    const bars = s.map((x, i) => {
      const h = Math.max(4, (n2(x.rx) + n2(x.tx)) / max * 100);
      const b = bytes(n2(x.rx) + n2(x.tx));
      return '<i' + (i === peakI ? ' class="peak"' : '') + ' style="height:' + h.toFixed(0) + '%" title="' + esc2(x.label) + ' · ' + b.v + ' ' + b.u + '"></i>';
    }).join('');
    const peakB = bytes(n2(s[peakI].rx) + n2(s[peakI].tx));
    return '<div class="rail-body" style="padding-top:13px">' +
      '<div class="hour-bars" aria-label="' + L('每小时流量分布', 'Hourly traffic distribution') + '">' + bars + '</div>' +
      '<div class="hour-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>' +
      '<div class="hour-facts"><div><small>' + L('峰值小时', 'Peak hour') + ' · ' + esc2(s[peakI].label) + '</small><b>' + peakB.v + ' ' + peakB.u + '</b></div>' +
      '<div><small>' + L('采样小时', 'Sampled hours') + '</small><b>' + s.length + L(' 个', '') + '</b></div>' +
      '<div><small>' + L('低峰小时', 'Lowest hour') + '</small><b>' + (function () { const lo = bytes(Math.min.apply(null, s.map((x) => n2(x.rx) + n2(x.tx)))); return lo.v + ' ' + lo.u; })() + '</b></div></div></div>';
  }

  /* 流量构成：基于 conntrack 真实连接的目标端口 + 字节/连接数归类，百分比由真实值计算，不写死 */
  function rosBytes(v) {
    const s = String(v == null ? '' : v).trim().replace(/[\s,]/g, '');
    const m = s.match(/^([\d.]+)([kmgt]?)i?b?$/i);
    if (!m) return 0;
    const mult = { k: 1024, m: 1048576, g: 1073741824, t: 1099511627776 }[(m[2] || '').toLowerCase()] || 1;
    return (Number(m[1]) || 0) * mult;
  }
  const TRAFFIC_CATEGORIES = [
    { label: () => L('HTTPS', 'HTTPS'), color: '', test: (p) => p === '443' || p === '8443' },
    { label: () => L('视频', 'Video'), color: ' b2', test: (p) => ['1935', '554', '1755', '8554', '5004', '5005'].indexOf(p) >= 0 },
    { label: () => L('游戏', 'Gaming'), color: ' b3', test: (p) => ['27015', '27005', '27016', '25565', '7777', '7778', '19132', '27036'].indexOf(p) >= 0 },
    { label: () => L('BT', 'BT'), color: ' b4', test: (p) => /^(688[1-9]|689[0-9]|69[0-9]{2}|51413)$/.test(p) },
    { label: () => L('其他', 'Other'), color: ' b5', test: () => true },
  ];
  function classifyTraffic() {
    const rows = (Array.isArray(state.connRows) ? state.connRows : [])
      .concat((state.latest && state.latest.connRows && state.latest.connRows.connections) || []).filter(Boolean);
    const vals = [0, 0, 0, 0, 0];
    const dstPort = (r) => {
      const direct = String(r['dst-port'] || r.dstPort || r.dport || '').trim();
      if (direct) return direct.split(/[,\s-]+/)[0];
      /* RouterOS 连接列表里目标地址常以 ip:port 形式返回，端口从末段取 */
      const dst = String(r['dst-address'] || r.dstAddress || r.dst || '').trim();
      const m = dst.match(/:(\d{1,5})$/);
      return m ? m[1] : '';
    };
    const rowBytes = (r) => {
      const split = rosBytes(r['orig-bytes']) + rosBytes(r['repl-bytes']) + rosBytes(r['orig-fasttrack-bytes']) + rosBytes(r['repl-fasttrack-bytes']);
      return split > 0 ? split : rosBytes(r.bytes);
    };
    const entries = rows.map((r) => ({ port: dstPort(r), bytes: rowBytes(r) }));
    const useBytes = entries.some((e) => e.bytes > 0);
    entries.forEach((e) => {
      let i = TRAFFIC_CATEGORIES.findIndex((c) => c.test(e.port));
      if (i < 0) i = TRAFFIC_CATEGORIES.length - 1;
      vals[i] += useBytes ? e.bytes : 1;
    });
    return { vals: vals, sum: vals.reduce((a, x) => a + x, 0), hasData: entries.length > 0 };
  }

  function statsSide(d) {
    const cur = (d && d.rate) || { rx: 0, tx: 0, real: false };
    const rr = rate(cur.rx), rt = rate(cur.tx);
    const ifaces = (d && d.available) || [];
    const total = n2(d && d.month && d.month.rx) + n2(d && d.month && d.month.tx);
    const tb = bytes(total);
    const now = new Date();
    const elapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAvg = bytes(elapsed > 0 ? total / elapsed : 0);
    const projected = bytes(elapsed > 0 ? total / elapsed * daysInMonth : 0);
    const monthPct = Math.max(0, Math.min(100, elapsed / daysInMonth * 100));
    // 流量构成：按 conntrack 连接特征归类，比例由真实字节/连接数计算
    const mix = classifyTraffic();
    const mixBar = mix.hasData && mix.sum > 0
      ? '<div class="mix-body"><div class="mix-bar">' + TRAFFIC_CATEGORIES.map((c, i) =>
          '<i class="' + c.color.trim() + '" style="width:' + (mix.vals[i] / mix.sum * 100).toFixed(1) + '%"></i>').join('') + '</div>' +
        '<div class="mix-legend">' + TRAFFIC_CATEGORIES.map((c, i) =>
          '<span><i class="' + c.color.trim() + '"></i>' + esc2(c.label()) + '<b>' + (mix.vals[i] / mix.sum * 100).toFixed(1) + '%</b></span>').join('') + '</div></div>'
      : '<div class="rail-body"><div class="empty">' + esc2(L('暂无连接特征数据', 'No connection data')) + '</div></div>';
    return '<section class="card"><div class="card-head"><div><h2 class="card-title">' + L('当前速率', 'Live rate') + '</h2><div class="card-sub">' + L('实时采样 · 全部接口', 'Live sampling · all interfaces') + '</div></div>' + status(cur.real ? 'green' : 'muted', cur.real ? L('在线', 'Online') : L('离线', 'Offline')) + '</div>' +
      '<div class="rail-body"><div class="rate-pair">' +
      '<div class="rate-k"><small>' + ic('down') + L('下行', 'RX') + '</small><b>' + rr.v + '<span>' + rr.u + '</span></b><em>' + L('今日', 'Today') + ' ' + bytes(d && d.today && d.today.rx).v + ' ' + bytes(d && d.today && d.today.rx).u + '</em></div>' +
      '<div class="rate-k"><small>' + ic('up') + L('上行', 'TX') + '</small><b>' + rt.v + '<span>' + rt.u + '</span></b><em>' + L('今日', 'Today') + ' ' + bytes(d && d.today && d.today.tx).v + ' ' + bytes(d && d.today && d.today.tx).u + '</em></div></div>' +
      '<div class="rate-chart">' + (function () {
        const pts = (state.points || []).slice(-40);
        if (pts.length < 2) return '';
        const mx = Math.max(1, Math.max.apply(null, pts.map((p) => n2(p.rx) + n2(p.tx))));
        const W = 280, H = 96;
        const mk = (key, mul) => pts.map((p, i) => (i ? 'L' : 'M') + (i * W / (pts.length - 1)).toFixed(1) + ' ' + (H - (n2(p[key]) * mul / mx) * (H - 8)).toFixed(1)).join(' ');
        return '<svg viewBox="0 0 280 96" preserveAspectRatio="none" aria-label="' + L('实时速率趋势', 'Live rate trend') + '"><path d="' + mk('rx', 1) + ' L280 96 L0 96 Z" style="fill:var(--v2-accent);opacity:.07"/>' +
          '<path d="' + mk('rx', 1) + '" fill="none" style="stroke:var(--v2-accent)" stroke-width="1.8" stroke-linejoin="round"/>' +
          '<path d="' + mk('tx', 1) + '" fill="none" style="stroke:var(--v2-teal)" stroke-width="1.4" stroke-linejoin="round" opacity=".85"/></svg>';
      })() + '</div>' +
      '<div class="kv" style="margin-top:6px"><span>' + L('接口数', 'Interfaces') + '</span><b>' + ifaces.length + '</b></div>' +
      '<div class="kv"><span>' + L('采样点数', 'Samples') + '</span><b>' + (state.points || []).length + '</b></div></div></section>' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">' + L('流量构成', 'Traffic mix') + '</h2><div class="card-sub">' + L('按应用类别归类', 'Classified by application') + '</div></div><span class="status">' + L('今日', 'Today') + '</span></div>' + mixBar + '</section>' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">' + L('本月用量', 'This month') + '</h2><div class="card-sub">' + L('按自然月累计', 'Calendar month total') + '</div></div><span class="badge info">' + L('本月', 'Month') + '</span></div>' +
      '<div class="rail-body"><div class="usage-summary"><b>' + tb.v + '</b><span>' + tb.u + '</span></div>' +
      '<div class="usage-bar" style="height:7px;margin:10px 0 6px"><i style="width:' + monthPct.toFixed(1) + '%;background:var(--v2-accent)"></i></div>' +
      '<div class="kv" style="margin-top:8px"><span>' + L('日均用量', 'Daily average') + '</span><b>' + dailyAvg.v + ' ' + dailyAvg.u + '</b></div>' +
      '<div class="kv"><span>' + L('预计月底', 'Projected month end') + '</span><b>' + projected.v + ' ' + projected.u + '</b></div></div></section>';
  }

  function statsIfacesTable(d) {
    const ifaces = (state.latest && state.latest.ifaces) || [];
    const agg = {};
    ((d && d.detail) || []).forEach((x) => { if (x.iface) agg[x.iface] = (agg[x.iface] || 0) + n2(x.rx) + n2(x.tx); });
    const sum = Object.keys(agg).reduce((a, k) => a + agg[k], 0) || 1;
    const rows = ifaces.slice().sort((a, b) => (n2(b.rxBps) + n2(b.txBps)) - (n2(a.rxBps) + n2(a.txBps))).map((i) => {
      const rx = rate(i.rxBps), tx = rate(i.txBps), tot = bytes(agg[i.name] || 0);
      const pct = (agg[i.name] || 0) / sum * 100;
      const type = i.type || 'Ethernet';
      return '<tr><td><div class="if-name">' + ifBadge(i.name) + '<span><b>' + esc2(i.name) + '</b><small>' + esc2(type) + '</small></span></div></td>' +
        '<td><span class="cell"><b>' + (i.running === 'true' ? L('运行中', 'Running') : L('空闲', 'Idle')) + '</b></span></td>' +
        '<td class="r"><span class="cell-num"><b>' + rx.v + ' ' + rx.u + '</b><small>↓ ' + L('实时', 'Live') + '</small></span></td>' +
        '<td class="r"><span class="cell-num"><b>' + tx.v + ' ' + tx.u + '</b><small>↑ ' + L('实时', 'Live') + '</small></span></td>' +
        '<td class="r"><span class="cell-num"><b>' + tot.v + ' ' + tot.u + '</b><small>' + L('今日累计', 'Today total') + '</small></span></td>' +
        '<td>' + shareBar(pct) + '</td><td><button class="row-more" title="' + L('更多', 'More') + '">' + ic('more') + '</button></td></tr>';
    }).join('');
    return '<section class="card span7"><div class="card-head"><div><h2 class="card-title">' + L('接口流量', 'Interface traffic') + '</h2><div class="card-sub">' + L('今日累计 · 按接口拆分', 'Today total · by interface') + '</div></div>' +
      '<a class="link" href="#" data-nav="interfacesCenter">' + L('接口详情', 'Interface details') + ic('chevron') + '</a></div>' +
      '<div class="table-scroll"><table class="dt"><colgroup><col style="width:19%"><col style="width:14%"><col style="width:13%"><col style="width:13%"><col style="width:15%"><col style="width:16%"><col></colgroup>' +
      '<thead><tr><th>' + L('接口', 'Interface') + '</th><th>' + L('状态', 'Status') + '</th><th class="r">' + L('下行', 'RX') + '</th><th class="r">' + L('上行', 'TX') + '</th><th class="r">' + L('今日总量', 'Today total') + '</th><th>' + L('占比', 'Share') + '</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="7" style="text-align:center;color:var(--v2-faint)">' + L('等待接口数据…', 'Waiting for interface data…') + '</td></tr>') + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + L('统计方式：接口计数差值（真实）', 'Method: real interface counter deltas') + '</span><span class="mono">' + L('计数差值', 'Counter delta') + '</span></div></section>';
  }

  function statsTopHosts(d) {
    const rows = (window.__v2IpRates || []).slice().sort((a, b) => (n2(b.rxBps) + n2(b.txBps)) - (n2(a.rxBps) + n2(a.txBps))).slice(0, 6);
    const max = rows.reduce((a, x) => Math.max(a, n2(x.rxBps) + n2(x.txBps)), 0) || 1;
    const body = rows.length ? rows.map((x) => {
      const b = rate(n2(x.rxBps) + n2(x.txBps));
      const label = x.name || x.ip || (L('主机', 'Host') + ' ' + (x.id || ''));
      return '<div class="rank-row"><span class="lbl">' + esc2(label) + ' <span class="mono" style="color:var(--v2-faint);font-size:9.5px">' + esc2(x.ip || '') + '</span></span>' +
        '<span class="val">' + b.v + ' ' + b.u + '</span><span class="bar"><i style="width:' + ((n2(x.rxBps) + n2(x.txBps)) / max * 100).toFixed(0) + '%"></i></span></div>';
    }).join('') : '<div class="empty">' + L('暂无主机速率数据（需在 IP 流量监控开启测速）', 'No host rate data (enable measurement in IP monitor)') + '</div>';
    return '<section class="card span5"><div class="card-head"><div><h2 class="card-title">' + L('实时速率 TOP 主机', 'Top hosts by live rate') + '</h2><div class="card-sub">' + L('按 IP 实时速率聚合', 'Aggregated by IP · live rate') + '</div></div>' +
      '<a class="link" href="#" data-nav="ipMonitor">' + L('全部', 'All') + ic('chevron') + '</a></div>' +
      '<div class="rail-body tight"><div class="rank">' + body + '</div></div>' +
      '<div class="table-foot"><span>' + L('来源：/api/ip-rates', 'Source: /api/ip-rates') + '</span><span class="mono">' + L('IP 测速', 'IP rates') + '</span></div></section>';
  }

  function openTrafficMenu(anchor) {
    const UIx = window.UI; if (!UIx || !UIx.openMenu) return;
    const compact = document.body.classList.contains('ui-compact');
    UIx.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 接口累计流量', 'CSV · interface traffic'), icon: 'i-download', action: exportTrafficCsv },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        if (typeof toast === 'function') toast(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: '<div class="ui-menu-head"><b>' + L('表格选项', 'Table options') + '</b><small>' + L('流量统计', 'Traffic stats') + '</small></div>' });
  }
  function exportTrafficCsv() {
    const d = state.usageData || {};
    const range = state.usageRange || 'today';
    const byIface = new Map();
    ((d.detail || []).filter((x) => x.iface)).forEach((x) => {
      const a = byIface.get(x.iface) || { rx: 0, tx: 0 };
      a.rx += n2(x.rx); a.tx += n2(x.tx); byIface.set(x.iface, a);
    });
    const ifaces = (state.latest && state.latest.ifaces) || [];
    const lines = ['接口,类型,累计接收(字节),累计发送(字节),合计(字节)'];
    const names = [...byIface.keys()].sort();
    if (!names.length && d.available) d.available.forEach((i) => names.push(i.name || i));
    names.forEach((name) => {
      const a = byIface.get(name) || { rx: 0, tx: 0 };
      const meta = ifaces.find((i) => i.name === name) || {};
      lines.push([csvCell(name), csvCell(meta.type || ''), Math.round(a.rx), Math.round(a.tx), Math.round(a.rx + a.tx)].join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'traffic-stats-' + range + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (window.UI && UI.toast) UI.toast(L('数据已导出', 'Data exported'), 'CSV · ' + names.length + ' ' + L('行', 'rows'), 'ok');
  }
  function csvCell(v) { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  function bindAreaHover(root) {
    if (!root) return;
    root.querySelectorAll('.area-chart[data-series]').forEach((svg) => {
      if (svg.__hoverBound) return;
      svg.__hoverBound = true;
      let data = [];
      try { data = JSON.parse(svg.getAttribute('data-series') || '[]'); } catch (e) { return; }
      if (!data.length) return;
      const W = 900;
      let tip = svg.parentNode.querySelector('.area-tip');
      if (!tip) { tip = document.createElement('div'); tip.className = 'area-tip'; svg.parentNode.appendChild(tip); }
      const move = (ev) => {
        const box = svg.getBoundingClientRect();
        if (!box.width) return;
        const px = (ev.clientX - box.left) * (W / box.width);
        const i = Math.max(0, Math.min(data.length - 1, Math.round(px / W * (data.length - 1))));
        const p = data[i];
        const rb = bytes(p.rx), tb = bytes(p.tx);
        tip.innerHTML = '<div class="tt">' + esc2(p.label || ('点 ' + (i + 1))) + '</div>' +
          '<div class="tr"><i class="rx"></i>下行 <b>' + rb.v + ' ' + rb.u + '</b></div>' +
          '<div class="tr"><i class="tx"></i>上行 <b>' + tb.v + ' ' + tb.u + '</b></div>';
        tip.style.display = 'block';
        const rel = (i / (data.length - 1 || 1)) * box.width;
        tip.style.left = Math.max(60, Math.min(box.width - 60, rel)) + 'px';
      };
      svg.addEventListener('mousemove', move);
      svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }
  function paintTrafficStatsV2(d, kpiNow) {
    const c = document.getElementById('content');
    if (!c || !c.classList.contains('dash') || state.section !== 'trafficStats') return;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    /* KPI 累计量随每 2 秒轮询实时增长（单调递增，不会跳变）；峰值仍按所选范围取真实最大值 */
    if (d && (d.today || d.week || d.month)) {
      set('v2StatsKpis', statsKpis(d));
      v2StatsKpiPending = false;
    }
    /* 旧版「统计网口」多选已移除：残留的自定义范围（如仅 pppoe-out1）会让其它接口今日总量恒为 0。
       进入本页时一次性恢复为全部接口，历史按网口独立保存，恢复后各接口真实计数立即显现。 */
    if (d && d.scope === 'custom' && !v2StatsScopeReset) {
      v2StatsScopeReset = true;
      api('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interfaces: [], range: state.usageRange }) })
        .then((r) => { if (state.section === 'trafficStats') { state.usageData = r; paintTrafficStatsV2(r); } })
        .catch(() => {});
    }
    set('v2StatsCharts', statsCharts(d));
    set('v2StatsHours', statsHourBars(d));
    set('v2StatsSide', statsSide(d));
    set('v2StatsIfaces', statsIfacesTable(d));
    set('v2StatsHosts', statsTopHosts(d));
    bindStatsTabs();
    bindNavLinks();
    bindAreaHover(document.getElementById('v2StatsCharts'));
    // 异步补主机速率
    if (!window.__v2IpRatesTs || Date.now() - window.__v2IpRatesTs > 8000) {
      window.__v2IpRatesTs = Date.now();
      api('/api/ip-rates').then((r) => { window.__v2IpRates = (r && r.rows) || []; if (state.section === 'trafficStats') set('v2StatsHosts', statsTopHosts(d)); }).catch(() => {});
    }
  }

  function bindStatsTabs() {
    const c = document.getElementById('content');
    if (!c) return;
    c.querySelectorAll('.panel-tabs [data-tab]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.tab;
        const map = { '24h': 'today', '7d': 'week', '30d': 'month' };
        v2StatsTab = key;
        if (map[key]) state.usageRange = map[key];
        c.querySelectorAll('.panel-tabs [data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        c.querySelectorAll('[data-panel]').forEach((x) => x.classList.toggle('on', x.dataset.panel === key));
        /* 切换时间范围：图表先切到对应面板，KPI 等新范围数据回来后再冻结刷新一次 */
        v2StatsKpiPending = true;
        if (typeof refreshUsageData === 'function') refreshUsageData();
      };
    });
  }
  function bindNavLinks() {
    const c = document.getElementById('content');
    if (!c) return;
    c.querySelectorAll('[data-nav]').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); if (typeof navigate === 'function') navigate(a.dataset.nav); };
    });
  }

  window.renderTrafficStats = function renderTrafficStatsV2(range) {
    if (range) state.usageRange = range;
    if (['today','week','month','total'].indexOf(state.usageRange) < 0) state.usageRange = 'today';
    v2StatsKpiPending = true;   // 每次进入页面（含语言切换重绘）重置，KPI 在首次数据到达时算一次
    v2StatsScopeReset = false;  // 允许本次进入时恢复残留的自定义统计范围
    const dd = state.usageData || {};
    const c = document.getElementById('content');
    c.className = 'content dash';
    c.innerHTML =
      '<div class="page-head"><div><h1>' + L('流量统计', 'Traffic stats') + '</h1><div class="meta">WAN ' + fmtWan(wanMbps(dd)) + '</div></div></div>' +
      '<div class="grid align-start"><div class="kpis" id="v2StatsKpis"></div>' +
      '<div class="span8" style="display:flex;flex-direction:column;gap:12px;min-width:0">' +
      '<section class="card chart-card"><div class="card-head"><div><h2 class="card-title">' + L('速率趋势', 'Rate trend') + '</h2><div class="card-sub">' + L('按时间范围聚合 · 真实计数差值 · 本地时区', 'Aggregated by range · real counter deltas · local time') + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' + status('green', L('数据正常', 'OK')) + '<button class="btn icon-only" id="v2StatsMenu" type="button" title="' + L('表格选项', 'Table options') + '" aria-label="' + L('表格选项', 'Table options') + '">' + ic('more') + '</button></div></div>' +
      '<div class="panel-tabs" data-tabs>' + RANGE_TABS.map(([k, label]) => '<button class="panel-tab' + (k === v2StatsTab ? ' on' : '') + '" data-tab="' + k + '">' + label() + '</button>').join('') + '</div>' +
      '<div id="v2StatsCharts"></div><div class="table-foot"><span>' + L('采样基于接口计数器差值 · 不估算', 'Sampled from interface counter deltas · no estimation') + '</span><span class="mono">' + L('计数差值', 'Counter delta') + '</span></div></section>' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">' + L('流量分布', 'Traffic distribution') + '</h2><div class="card-sub">' + L('今日每小时累计', 'Hourly total today') + '</div></div><span class="status">' + L('按小时', 'Hourly') + '</span></div><div id="v2StatsHours"></div></section></div>' +
      '<div class="span4 rail" id="v2StatsSide"></div>' +
      '<div class="span7" id="v2StatsIfaces"></div><div class="span5" id="v2StatsHosts"></div></div>';
    const menu = document.getElementById('v2StatsMenu');
    if (menu) menu.onclick = () => openTrafficMenu(menu);
    const d = state.usageData;
    if (d) paintTrafficStatsV2(d);
    if (typeof refreshUsageData === 'function') refreshUsageData();
    if (typeof ensureUsageTimer === 'function') ensureUsageTimer(true);
  };
  window.paintTrafficStats = paintTrafficStatsV2;

  /* ============================================================
     配置表格页：保留原 CRUD 事件，外层套设计稿结构
     ============================================================ */
  const CFG_KPI = {
    interfaces: { title: '接口与地址', icon: 'layers', group: 'network' },
    ipAddresses: { title: 'IP 地址', icon: 'globe', group: 'network' },
    routes: { title: '路由', icon: 'route', group: 'network' },
    firewallFilter: { title: '防火墙', icon: 'shield', group: 'firewall' },
    firewallNat: { title: 'NAT 规则', icon: 'ifaces', group: 'firewall' },
    dhcpLeases: { title: 'DHCP 租约', icon: 'dhcp', group: 'network' },
    dnsStatic: { title: '静态 DNS', icon: 'globe', group: 'network' },
    users: { title: '用户与权限', icon: 'users', group: 'system' },
    userGroups: { title: '用户组', icon: 'users', group: 'system' },
    logs: { title: '日志中心', icon: 'log', group: 'logs' },
    wifi: { title: '无线', icon: 'wifi', group: 'wireless' },
    wireguard: { title: 'VPN', icon: 'lock', group: 'vpn' },
    wgPeers: { title: 'WG 对端', icon: 'lock', group: 'vpn' },
    simpleQueues: { title: '带宽控制', icon: 'speed', group: 'queue' },
    queueTree: { title: '队列树', icon: 'speed', group: 'queue' },
    connections: { title: '连接状态', icon: 'conn', group: 'overview' },
  };
  const origRenderConfigPage = window.renderConfigPage;

  function cfgKpis(sec, rows) {
    const meta = CFG_KPI[sec.id] || { title: (sec.title && sec.title.zh) || sec.id, icon: 'layers' };
    const total = rows.length;
    let enabled = 0, disabled = 0;
    rows.forEach((r) => {
      const d = r.disabled === 'true' || r.disabled === true || r.enabled === 'false';
      if (d) disabled++; else enabled++;
    });
    let dynamic = 0;
    rows.forEach((r) => { if (r['dynamic'] === 'true' || r.dynamic === true) dynamic++; });
    return [
      kpiCard({ label: meta.title, icon: meta.icon, color: 'blue', num: String(total),
        state: state.configDemo ? { dot: 'amber', text: '演示' } : null, foot: ['当前配置页', '真实数据'] }),
      kpiCard({ label: '已启用', icon: 'check', color: 'green', num: String(enabled),
        state: { dot: 'green', text: '生效中' }, foot: ['禁用 ' + disabled + ' 条', '按 disabled 字段'] }),
      kpiCard({ label: '动态条目', icon: 'pulse', color: 'violet', num: String(dynamic),
        state: { dot: 'muted', text: '自动' }, foot: ['静态 ' + (total - dynamic) + ' 条', '由 RouterOS 维护'] }),
      kpiCard({ label: '数据来源', icon: 'device', color: 'teal', num: state.configDemo ? 'DEMO' : (state.configOffline ? '离线' : 'LIVE'),
        state: { dot: state.configDemo ? 'amber' : 'green', text: '已连接' }, foot: ['RouterOS API', (state.deviceName || '主路由').replace(/\s*\(.*$/, '')] })
    ].join('');
  }

  function cfgSide(sec, rows) {
    // 统计出现最多的字段作为分布（取前 4 个布尔/枚举型字段）
    const keys = Object.keys(rows[0] || {}).filter((k) => /^(disabled|dynamic|running|type|chain|action|proto|protocol|role|state)$/i.test(k));
    const dist = [];
    if (keys.length) {
      const k = keys[0], agg = {};
      rows.forEach((r) => { const v = String(r[k] == null ? '—' : r[k]); agg[v] = (agg[v] || 0) + 1; });
      Object.keys(agg).sort((a, b) => agg[b] - agg[a]).slice(0, 5).forEach((v) => dist.push([v, agg[v]]));
    }
    const max = dist.reduce((a, x) => a + x[1], 0) || 1;
    const bars = dist.length ? '<div class="rank">' + dist.map(([k, v]) =>
      '<div class="rank-row"><span class="lbl">' + esc2(k) + '</span><span class="val">' + v + '</span><span class="bar"><i style="width:' + (v / max * 100).toFixed(0) + '%"></i></span></div>').join('') + '</div>'
      : '<div class="empty">暂无可统计字段</div>';
    const path = sec.path || '虚拟页';
    return '<section class="card"><div class="card-head"><div><h2 class="card-title">条目分布</h2><div class="card-sub">按 ' + esc2(keys[0] || '字段') + ' 统计</div></div></div>' +
      '<div class="rail-body tight">' + bars + '</div></section>' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">页面信息</h2><div class="card-sub">当前配置节点</div></div>' + ic('layers') + '</div>' +
      '<div class="rail-body"><div class="kv"><span>路径</span><b class="mono" style="font-size:11px">' + esc2(path) + '</b></div>' +
      '<div class="kv"><span>条目</span><b>' + rows.length + '</b></div>' +
      '<div class="kv"><span>模式</span><b>' + (state.configDemo ? '演示' : state.configOffline ? '离线' : '在线') + '</b></div></div></section>' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">使用提示</h2><div class="card-sub">实时控制与监控</div></div>' + status('green', '已就绪') + '</div>' +
      '<div class="rail-body"><div class="notice blue">' + ic('globe') + '<p style="margin:0;flex:1">表格支持搜索、排序、批量启用/禁用与编辑。改动会直接写入 RouterOS。</p></div></div></section>';
  }

  window.renderConfigPage = function renderConfigPageV2(sec) {
    // DHCP 租约页默认 12 条（设计稿：租约与解析卡片默认显示 12 条）
    if (sec && (sec.id === 'dhcpLeases')) state.pageSize = 12;
    else if (typeof state !== 'undefined' && state.pageSize === 12) state.pageSize = 15;
    // 先调用原函数生成 DOM 并绑定全部 CRUD 事件、异步加载行
    if (typeof origRenderConfigPage === 'function') origRenderConfigPage(sec);
    const c = document.getElementById('content');
    if (!c) return;
    // 原结构：.page-head + [demo card] + .panel
    const head = c.querySelector('.page-head');
    const panel = c.querySelector('.panel');
    const demo = c.querySelector('.card.demo-note, .card.notice');
    if (!head || !panel) return;
    const grid = document.createElement('div');
    grid.className = 'grid align-start';
    const kpis = document.createElement('div');
    kpis.className = 'kpis'; kpis.id = 'v2CfgKpis';
    kpis.innerHTML = cfgKpis(sec, state.rows || []);
    const span8 = document.createElement('div');
    span8.className = 'span8';
    span8.appendChild(panel);
    const rail = document.createElement('div');
    rail.className = 'span4 rail'; rail.id = 'v2CfgSide';
    rail.innerHTML = cfgSide(sec, state.rows || []);
    grid.appendChild(kpis); grid.appendChild(span8); grid.appendChild(rail);
    // 保留 demo 提示在 page-head 之后
    if (demo && demo !== panel && !grid.contains(demo)) c.insertBefore(demo, head.nextSibling);
    c.appendChild(grid);
    c.classList.add('dash');   // 复用 design.css 设计稿组件样式
    // 数据加载完成后补充 KPI / 侧栏
    if (typeof window.renderRows === 'function' && !window.__v2RowsWrapped) {
      window.__v2RowsWrapped = true;
      const origRows = window.renderRows;
      window.renderRows = function (s) {
        const r = origRows.apply(this, arguments);
        const target = (s && s.id) ? s.id : state.section;
        const kk = document.getElementById('v2CfgKpis'), ss = document.getElementById('v2CfgSide');
        if (kk && ss) {
          const curSec = (state.schema && state.schema.sections || []).find((x) => x.id === target);
          if (curSec) {
            kk.innerHTML = cfgKpis(curSec, state.rows || []);
            ss.innerHTML = cfgSide(curSec, state.rows || []);
          }
        }
        return r;
      };
    }
  };

  /* ============================================================
     虚拟页 KPI 增强：拓扑 / IP 监控（保留原功能 DOM 与事件）
     ============================================================ */
  function topoKpis() {
    const latest = state.latest || {};
    const rr = rate(n2(latest.totalRx)), rt = rate(n2(latest.totalTx));
    const dhcp = window.__topoDhcp || null;
    const sum = window.__topoSummary || null;
    return [
      kpiCard({ label: '拓扑设备', icon: 'nodes', color: 'blue', num: sum ? String(n2(sum.total)) : '—',
        state: { dot: sum ? 'green' : 'muted', text: sum ? '自动发现' : '加载中' },
        foot: sum ? ['已联动 ' + n2(sum.matchedNodes) + ' 台', '自定义 ' + n2(sum.custom) + ' 台'] : ['等待拓扑数据', '自动 + 手动'] }),
      kpiCard({ label: '链路总数', icon: 'layers', color: 'teal', num: sum ? String(n2(sum.links)) : '—',
        state: { dot: sum ? 'green' : 'muted', text: sum ? '拓扑数据' : '加载中' },
        foot: sum ? ['自动 ' + (n2(sum.links) - n2(sum.manualLinks)), '手动 ' + n2(sum.manualLinks)] : ['物理 / 无线', '父子端点'] }),
      kpiCard({ label: 'DHCP 在线', icon: 'dhcp', color: 'green', num: dhcp ? String(n2(dhcp.bound)) : '—',
        state: { dot: dhcp ? (n2(dhcp.bound) ? 'green' : 'amber') : 'muted', text: dhcp ? '拓扑联动' : '加载中' },
        foot: dhcp ? ['租约共 ' + n2(dhcp.total), '已匹配 ' + n2(dhcp.matched)] : ['等待 DHCP 租约', 'MAC 双向锚定'] }),
      kpiCard({ label: '实时速率', icon: 'pulse', color: 'violet', num: rate(n2(latest.totalRx) + n2(latest.totalTx)).v, unit: rate(n2(latest.totalRx) + n2(latest.totalTx)).u,
        state: { dot: 'green', text: '监控中' }, foot: ['↓ ' + rr.v + ' ' + rr.u, '↑ ' + rt.v + ' ' + rt.u] })
    ].join('');
  }
  function ipKpis() {
    const latest = state.latest || {};
    const conn = latest.connections || {};
    const rows = window.__v2IpRates || [];
    const total = n2(conn.total);
    const rr = rate(n2(latest.totalRx)), rt = rate(n2(latest.totalTx));
    return [
      kpiCard({ label: '活跃连接', icon: 'conn', color: 'blue', num: String(total),
        foot: ['TCP ' + n2(conn.tcp), 'UDP ' + n2(conn.udp)] }),
      kpiCard({ label: 'IPv4 / IPv6', icon: 'globe', color: 'teal', num: String(n2(conn.v4)) + ' / ' + String(n2(conn.v6)),
        state: { dot: 'green', text: ' conntrack' }, foot: ['IPv4 连接', 'IPv6 连接'] }),
      kpiCard({ label: '总速率', icon: 'pulse', color: 'violet', num: rate(n2(latest.totalRx) + n2(latest.totalTx)).v, unit: rate(n2(latest.totalRx) + n2(latest.totalTx)).u,
        spark: sparkSvg((state.points || []).slice(-20).map((p) => n2(p.rx) + n2(p.tx)), 'violet'),
        foot: ['↓ ' + rr.v + ' ' + rr.u, '↑ ' + rt.v + ' ' + rt.u] }),
      kpiCard({ label: '测速主机', icon: 'users', color: 'amber', num: String(rows.length),
        state: { dot: rows.length ? 'green' : 'muted', text: rows.length ? '采集中' : '未开启' }, foot: ['按 IP 聚合', '/api/ip-rates'] })
    ].join('');
  }
  function injectVirtualKpis(secId) {
    /* IP 流量监控已改为设计稿完整布局（ipmonitor.js 自带 KPI 与 dash 样式），
       不再注入虚拟 KPI，否则会重复概览卡片并移除 content 的 dash 类导致样式失效 */
    if (secId === 'ipMonitor') return;
    const c = document.getElementById('content');
    if (!c) return;
    let box = document.getElementById('v2VirtualKpis');
    const html = secId === 'topology' ? topoKpis() : secId === 'ipMonitor' ? ipKpis() : null;
    if (!html) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'kpis v2-vkpis'; box.id = 'v2VirtualKpis';
      const head = c.querySelector('.page-head');
      if (head && head.nextSibling) c.insertBefore(box, head.nextSibling);
      else c.appendChild(box);
    }
    box.innerHTML = html;
    c.classList.remove('dash');   // 虚拟页原功能 DOM 依赖旧样式，不加 dash
    // 拉一次 ip-rates 供 IP 监控 KPI 用
    if (secId === 'ipMonitor' && (!window.__v2IpRatesTs || Date.now() - window.__v2IpRatesTs > 8000)) {
      window.__v2IpRatesTs = Date.now();
      api('/api/ip-rates').then((r) => { window.__v2IpRates = (r && r.rows) || []; if (state.section === 'ipMonitor') injectVirtualKpis('ipMonitor'); }).catch(() => {});
    }
  }
  window.__v2TopoKpiRefresh = function () { /* 拓扑页已使用原生 KPI 行，无需外部注入 */ };
  // 包装 renderPage，在虚拟页渲染后注入 KPI
  if (typeof window.renderPage === 'function' && !window.__v2PageWrapped) {
    window.__v2PageWrapped = true;
    const origPage = window.renderPage;
    window.renderPage = function () {
      const r = origPage.apply(this, arguments);
      if (state.section === 'ipMonitor') {
        // 原页面可能异步渲染，稍延迟注入
        setTimeout(() => injectVirtualKpis('ipMonitor'), 300);
      }
      return r;
    };
  }
  // WS 数据到达后刷新虚拟页 KPI
  if (typeof window.applyData === 'function') {
    const origApply = window.applyData;
    window.applyData = function (d) {
      const r = origApply.apply(this, arguments);
      if (state.section === 'ipMonitor') injectVirtualKpis('ipMonitor');
      return r;
    };
  }

  /* ============================================================
     设备管理页（connectionSettings）：保留原渲染，避免破坏连接配置
     ============================================================ */
})();
