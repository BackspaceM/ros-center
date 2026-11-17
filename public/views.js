'use strict';

/* ================= 概览仪表盘 ================= */
function renderDashboard() {
  const d = state.latest || {};
  const r = d.resource || {};
  const cpu = num(r['cpu-load']);
  const memPct = r['total-memory'] ? Math.round((1 - num(r['free-memory']) / num(r['total-memory'])) * 100) : 0;
  const diskPct = r['total-hdd-space'] ? Math.round((1 - num(r['free-hdd-space']) / num(r['total-hdd-space'])) * 100) : 0;
  const active = (d.ifaces || []).filter((i) => i.running === 'true' && i.disabled !== 'true').length;
  const rx = fmtRate(d.totalRx || 0), tx = fmtRate(d.totalTx || 0);
  const cn = d.connections || { v4: 0, v6: 0, total: 0, tcp: 0, udp: 0 };
  let peak = 0; for (const p of state.points) peak = Math.max(peak, p.rx || 0);
  const pk = fmtRate(peak);

  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${t('overview_title') || '系统概览'}</h1><p>${esc(r['board-name'] || 'RouterOS')} · RouterOS ${esc(r.version || '')} · ${t('conn_sub')}</p></div>
      <div class="page-actions">
        <span class="badge-live ${state.mode === 'live' ? 'live' : ''}"><span class="d"></span>${t(state.mode)}</span>
        <button class="btn" id="dashRefresh">${t('refresh')}</button>
      </div>
    </div>
    <div class="cards">
      <div class="card rx"><div class="card-label">${t('total_rx')}</div><div class="card-value">${rx.v}<small>${rx.u}</small></div><div class="card-foot">${t('rx_hint')}</div></div>
      <div class="card tx"><div class="card-label">${t('total_tx')}</div><div class="card-value">${tx.v}<small>${tx.u}</small></div><div class="card-foot">${t('tx_hint')}</div></div>
      <div class="card ok"><div class="card-label">${t('active_if')}</div><div class="card-value">${active}<small>/ ${(d.ifaces || []).length}</small></div><div class="card-foot">${t('if_hint')}</div></div>
      <div class="card warn"><div class="card-label">${t('peak_rx')}</div><div class="card-value">${pk.v}<small>${pk.u}</small></div><div class="card-foot">${t('uptime')} ${fmtUptime(d.uptime)}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>${t('trend_title')}</h2><p class="sub">${t('trend_sub')}</p></div>
          <div class="legend"><span><i style="background:var(--blue)"></i>${t('legend_rx')}</span><span><i style="background:var(--violet)"></i>${t('legend_tx')}</span></div></div>
        <div class="chart-wrap"><canvas id="dashChart"></canvas><div class="tooltip" id="dashTip" hidden></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>${t('health_title')}</h2><p class="sub">${t('health_sub')}</p></div></div>
        <div class="chart-wrap"><canvas id="healthChart"></canvas><div class="tooltip" id="healthTip" hidden></div></div>
      </div>
    </div>
    <div class="grid-32">
      <div class="panel">
        <div class="panel-head"><div><h2>${t('conn_title')}</h2><p class="sub">${t('conn_sub')}</p></div></div>
        <div class="stat-row">
          ${statBox(t('conn_total') || L('连接总数', 'Total connections'), String(cn.total.toLocaleString()))}
          ${statBox('IPv4', String(cn.v4.toLocaleString()))}
          ${statBox('IPv6', String(cn.v6.toLocaleString()))}
          ${statBox('TCP / UDP', (cn.tcp || cn.udp) ? (cn.tcp.toLocaleString() + ' / ' + cn.udp.toLocaleString()) : '—')}
        </div>
        <div class="panel-body" style="padding-top:0"><div id="connSpark" style="height:96px"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>${t('wlan_title')}</h2><p class="sub">${t('wlan_sub')}</p></div></div>
        ${donutHtml(active, Math.max(0, (d.ifaces || []).length - active))}
      </div>
    </div>
    <div class="grid-2">
      ${topTablePanel('topIfPanel', t('top_if'), t('top_if_sub'), ['#', t('iface'), t('rate_rx'), t('rate_tx'), t('total')])}
      ${topTablePanel('topConnPanel', t('top_conn'), t('top_conn_sub'), ['#', L('源地址', 'Source'), L('目标地址', 'Destination'), L('协议', 'Protocol'), L('流量', 'Bytes')])}
    </div>`;

  $('dashRefresh').onclick = () => { renderDashboard(); toast(t('refresh') + ' OK', 'ok'); };
  drawLineChart('dashChart', 'dashTip', state.points, [
    { key: 'rx', color: cssVar('--blue', '#2563eb'), fill: themeFill('--blue', '#2563eb', .10), label: t('legend_rx') },
    { key: 'tx', color: cssVar('--violet', '#7c5cff'), fill: themeFill('--violet', '#7c5cff', .09), label: t('legend_tx') },
  ], fmtRateStr);
  drawLineChart('healthChart', 'healthTip', state.resourceHistory.map((p) => ({ ts: p.ts, cpu: p.cpu, mem: p.total ? (1 - p.free / p.total) * 100 : 0 })), [
    { key: 'cpu', color: cssVar('--green', '#12a37f'), fill: themeFill('--green', '#12a37f', .10), label: 'CPU %', suffix: '%' },
    { key: 'mem', color: cssVar('--amber', '#dd8b10'), fill: themeFill('--amber', '#dd8b10', .08), label: L('内存', 'Memory') + ' %', suffix: '%' },
  ], (v) => v.toFixed(1) + '%');
  drawConnSpark();
  renderTopTables(d);
}
function statBox(label, value) { return `<div class="stat-box"><small>${esc(label)}</small><b>${esc(value)}</b></div>`; }
function emptyRow(cols) { return `<tr><td colspan="${cols}" style="text-align:center;padding:36px;color:var(--muted)">${t('no_data')}</td></tr>`; }
function topTablePanel(id, title, sub, heads) {
  return `<div class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p></div></div>
    <div class="table-scroll"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody id="${id}Body"></tbody></table></div></div>`;
}
function donutHtml(active, idle) {
  const total = active + idle;
  const pct = total ? active / total : 0;
  const c = 2 * Math.PI * 46;
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="46" fill="none" stroke="${cssVar('--grid', '#eef2f8')}" stroke-width="14"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="${cssVar('--green', '#12a37f')}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text class="donut-center" x="60" y="58" text-anchor="middle" fill="${cssVar('--ink', '#1a2340')}">${active}</text>
      <text class="donut-sub" x="60" y="73" text-anchor="middle">${t('running')}</text>
    </svg>
    <div class="donut-legend">
      ${miniStat(L('在线接口', 'Online'), String(active))}
      ${miniStat(L('离线接口', 'Offline'), String(idle))}
      ${miniStat('2.4G', String(Math.max(0, active - 1)))}
      ${miniStat('5G', String(Math.max(0, active - 2)))}
      ${miniStat(L('高干扰 AP', 'High interference'), '0')}
      ${miniStat(L('高负载 AP', 'High load'), '0')}
    </div></div>`;
}
function miniStat(l, v) { return `<div class="mini-stat"><small>${esc(l)}</small><b>${esc(v)}</b></div>`; }
function renderTopTables(d) {
  const ifaces = [...(d.ifaces || [])].sort((a, b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes)).slice(0, 10);
  $('topIfPanelBody').innerHTML = ifaces.map((i, n) => `<tr><td class="num">${n + 1}</td><td><b>${esc(i.name)}</b> <span class="tag">${esc(i.type)}</span></td>
    <td class="num"><span class="rate rx">${fmtRate(i.rxBps).v}</span> <span class="tag">${fmtRate(i.rxBps).u}</span></td>
    <td class="num"><span class="rate tx">${fmtRate(i.txBps).v}</span> <span class="tag">${fmtRate(i.txBps).u}</span></td>
    <td class="num">${fmtBytes(i.rxBytes + i.txBytes)}</td></tr>`).join('') || emptyRow(5);
  let conns = [];
  const s = state.schema && state.schema.sections.find((x) => x.id === 'connections');
  if (s && state.connRows) conns = [...state.connRows].sort((a, b) => num(b.bytes) - num(a.bytes)).slice(0, 10);
  $('topConnPanelBody').innerHTML = conns.map((c, n) => `<tr><td class="num">${n + 1}</td><td>${esc(c['src-address'])}</td><td>${esc(c['dst-address'])}</td>
    <td><span class="tag blue">${esc(c.protocol)}</span></td><td class="num">${fmtBytes(c.bytes)}</td></tr>`).join('') || emptyRow(5);
}
function drawConnSpark() {
  const host = $('connSpark'); if (!host) return;
  host.innerHTML = '<canvas id="connCv" style="width:100%;height:100%"></canvas>';
  const hist = (state.connHistory || []).slice(-60);
  drawLineChart('connCv', null, hist.map((p) => ({ ts: p.ts, total: p.total, v4: p.v4, v6: p.v6 })),
    [
      { key: 'total', color: cssVar('--blue', '#2563eb'), fill: themeFill('--blue', '#2563eb', .10), label: L('连接总数', 'Total') },
      { key: 'v4', color: cssVar('--violet', '#7c5cff'), label: 'IPv4' },
      { key: 'v6', color: cssVar('--green', '#12a37f'), label: 'IPv6' },
    ], (v) => String(Math.round(v)));
}

/* ================= 实时流量页 ================= */
function renderTraffic() {
  const d = state.latest || {};
  const ifaces = d.ifaces || [];
  let rx = d.totalRx || 0, tx = d.totalTx || 0;
  if (state.selectedIface !== '__all__') {
    const f = ifaces.find((i) => i.name === state.selectedIface);
    rx = f ? f.rxBps : 0; tx = f ? f.txBps : 0;
  }
  const r = fmtRate(rx), w = fmtRate(tx);
  let peak = 0; for (const p of state.points) peak = Math.max(peak, p.rx || 0);
  const pk = fmtRate(peak);
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('traffic_title')}</h1><p>${t('traffic_sub')}</p></div>
      <div class="page-actions"><span class="badge-live ${state.mode === 'live' ? 'live' : ''}"><span class="d"></span>${t(state.mode)}</span></div></div>
    <div class="cards">
      <div class="card rx"><div class="card-label">${t('total_rx')}</div><div class="card-value">${r.v}<small>${r.u}</small></div><div class="card-foot">${t('rx_hint')}</div></div>
      <div class="card tx"><div class="card-label">${t('total_tx')}</div><div class="card-value">${w.v}<small>${w.u}</small></div><div class="card-foot">${t('tx_hint')}</div></div>
      <div class="card ok"><div class="card-label">${t('active_if')}</div><div class="card-value">${ifaces.filter((i) => i.running === 'true').length}<small>/ ${ifaces.length}</small></div><div class="card-foot">${t('if_hint')}</div></div>
      <div class="card warn"><div class="card-label">${t('peak_rx')}</div><div class="card-value">${pk.v}<small>${pk.u}</small></div><div class="card-foot">${t('uptime')} ${fmtUptime(d.uptime)}</div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2>${t('trend_title')}</h2><p class="sub">${t('trend_sub')}</p></div>
        <div class="legend"><span><i style="background:var(--blue)"></i>${t('legend_rx')}</span><span><i style="background:var(--violet)"></i>${t('legend_tx')}</span></div></div>
      <div class="tabs" id="ifTabs">${['__all__', ...ifaces.map((i) => i.name)].map((n) =>
        `<button class="tab ${n === state.selectedIface ? 'active' : ''}" data-if="${esc(n)}">${n === '__all__' ? t('all') : esc(n)}</button>`).join('')}</div>
      <div class="chart-wrap"><canvas id="trafficChart"></canvas><div class="tooltip" id="trafficTip" hidden></div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2>${t('if_title') || L('接口详情', 'Interface details')}</h2></div>
        <div class="count">${ifaces.length} ${t('rows')}</div></div>
      <div class="table-scroll"><table><thead><tr><th>${t('iface')}</th><th>${t('type')}</th><th>${t('status')}</th>
        <th class="num">${t('rate_rx')}</th><th class="num">${t('rate_tx')}</th><th>${t('spark')}</th><th class="num">${t('total')}</th></tr></thead>
        <tbody>${ifaces.map((i) => trafficRow(i)).join('')}</tbody></table></div>
    </div>`;
  $('ifTabs').querySelectorAll('.tab').forEach((b) => b.onclick = () => {
    state.selectedIface = b.dataset.if; state.points = state.points.filter((p) => !p.per);
    renderTraffic();
  });
  drawLineChart('trafficChart', 'trafficTip', state.points, [
    { key: 'rx', color: cssVar('--blue', '#2563eb'), fill: themeFill('--blue', '#2563eb', .10), label: t('legend_rx') },
    { key: 'tx', color: cssVar('--violet', '#7c5cff'), fill: themeFill('--violet', '#7c5cff', .09), label: t('legend_tx') },
  ], fmtRateStr);
}
function trafficRow(i) {
  const on = i.running === 'true' && i.disabled !== 'true';
  const a = fmtRate(i.rxBps), b = fmtRate(i.txBps);
  const hist = state.ifHistory.get(i.name) || [];
  return `<tr><td><button class="row-if" data-if="${esc(i.name)}" style="background:none;border:0;padding:0;font-weight:600;color:var(--ink)">
    <span class="tag ${on ? 'green' : ''}">●</span> ${esc(i.name)}</button></td>
    <td><span class="tag">${esc(i.type)}</span></td><td><span class="tag ${on ? 'green' : 'red'}">${on ? t('running') : t('stopped')}</span></td>
    <td class="num"><span class="rate rx">${a.v}</span> <span class="tag">${a.u}</span></td>
    <td class="num"><span class="rate tx">${b.v}</span> <span class="tag">${b.u}</span></td>
    <td>${sparkSvg(hist)}</td><td class="num">${fmtBytes(i.rxBytes + i.txBytes)}</td></tr>`;
}
function sparkSvg(arr) {
  if (!arr || arr.length < 2) return '<svg class="spark" viewBox="0 0 92 26"></svg>';
  const vals = arr.map((a) => a.rx || 0); const max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => (2 + i / (vals.length - 1) * 88).toFixed(1) + ',' + (24 - v / max * 21).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 92 26" preserveAspectRatio="none"><polygon points="${pts} 90,26 2,26" fill="${themeFill('--blue', '#2563eb', .10)}" stroke="none"/><polyline points="${pts}" fill="none" stroke="${cssVar('--blue', '#2563eb')}" stroke-width="1.6"/></svg>`;
}

/* ================= 通用折线图 ================= */
function drawLineChart(canvasId, tipId, data, series, fmt) {
  const cv = $(canvasId); if (!cv) return;
  const wrap = cv.parentElement; const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!data || data.length < 2) return;
  const pad = { l: 58, r: 12, t: 12, b: 24 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  let max = 1; for (const p of data) for (const s of series) max = Math.max(max, num(p[s.key]));
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9];
  const top = steps.find((s) => s >= max * 1.15) || Math.ceil(max * 1.15);
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ph * i / 4;
    ctx.strokeStyle = cssVar('--grid', '#edf0f6'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.textAlign = 'right'; ctx.fillText(fmt(top * (1 - i / 4)), pad.l - 7, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const labels = Math.min(5, data.length);
  for (let i = 0; i < labels; i++) {
    const idx = Math.round(i / Math.max(1, labels - 1) * (data.length - 1));
    ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.fillText(fmtTime(data[idx].ts), pad.l + pw * idx / Math.max(1, data.length - 1), pad.t + ph + 7);
  }
  const xAt = (i) => pad.l + pw * i / Math.max(1, data.length - 1);
  const yAt = (v) => pad.t + ph * (1 - Math.min(1, num(v) / top));
  for (const s of series) {
    ctx.beginPath(); data.forEach((p, i) => { i ? ctx.lineTo(xAt(i), yAt(p[s.key])) : ctx.moveTo(xAt(i), yAt(p[s.key])); });
    ctx.lineTo(xAt(data.length - 1), pad.t + ph); ctx.lineTo(pad.l, pad.t + ph); ctx.closePath();
    ctx.fillStyle = s.fill; ctx.fill();
    ctx.beginPath(); data.forEach((p, i) => { i ? ctx.lineTo(xAt(i), yAt(p[s.key])) : ctx.moveTo(xAt(i), yAt(p[s.key])); });
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
  }
  if (tipId && state.hoverIndex >= 0 && state.hoverIndex < data.length) {
    const i = state.hoverIndex, x = xAt(i), p = data[i], tip = $(tipId);
    ctx.strokeStyle = cssVar('--axis', '#9aa5bd'); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
    for (const s of series) { ctx.beginPath(); ctx.arc(x, yAt(p[s.key]), 3.4, 0, 7); ctx.fillStyle = s.color; ctx.fill(); ctx.strokeStyle = cssVar('--card', '#fff'); ctx.lineWidth = 1.4; ctx.stroke(); }
    tip.innerHTML = `<div class="tt">${fmtTime(p.ts)}</div>` + series.map((s) => `${esc(s.label)}: <b>${fmt(num(p[s.key]))}</b>`).join('<br>');
    tip.hidden = false; tip.style.left = Math.max(70, Math.min(w - 70, x)) + 'px';
    tip.style.top = Math.min(pad.t + ph, Math.min(...series.map((s) => yAt(p[s.key]))) - 5) + 'px';
  } else if (tipId && $(tipId)) $(tipId).hidden = true;
  cv.onmousemove = (e) => {
    const rect = cv.getBoundingClientRect(), x = e.clientX - rect.left;
    if (x < pad.l || x > pad.l + pw) { state.hoverIndex = -1; } else { state.hoverIndex = Math.max(0, Math.min(data.length - 1, Math.round((x - pad.l) / pw * (data.length - 1)))); }
    drawLineChart(canvasId, tipId, data, series, fmt);
  };
  cv.onmouseleave = () => { state.hoverIndex = -1; drawLineChart(canvasId, tipId, data, series, fmt); };
}
window.addEventListener('resize', () => { if (state.section === 'dashboard') renderDashboard(); if (state.section === 'traffic') renderTraffic(); });

/* 后续配置页函数在 config.js */
