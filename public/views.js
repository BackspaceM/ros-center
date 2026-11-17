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
  const cn = d.connections || { v4: 0, v6: 0, total: 0, tcp4: 0, tcp6: 0, udp4: 0, udp6: 0, tcp: 0, udp: 0 };
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
        <div class="panel-head"><div><h2>${t('conn_title')}</h2><p class="sub">${t('conn_sub')}${d.connectionsReal === false ? ' · ' + L('演示 / 离线：非实时，显示上次真实值', 'Demo / offline: not live, showing last real values') : ''}</p></div></div>
        <div class="stat-row">
          ${statBox(t('conn_total') || L('连接总数', 'Total connections'), String((cn.total || 0).toLocaleString()))}
          ${statBox('IPv4', String((cn.v4 || 0).toLocaleString()))}
          ${statBox('IPv6', String((cn.v6 || 0).toLocaleString()))}
        </div>
        <div class="stat-row" style="padding-top:0">
          ${statBox(L('TCP · IPv4', 'TCP · IPv4'), String((cn.tcp4 || 0).toLocaleString()))}
          ${statBox(L('TCP · IPv6', 'TCP · IPv6'), String((cn.tcp6 || 0).toLocaleString()))}
          ${statBox(L('UDP · IPv4', 'UDP · IPv4'), String((cn.udp4 || 0).toLocaleString()))}
          ${statBox(L('UDP · IPv6', 'UDP · IPv6'), String((cn.udp6 || 0).toLocaleString()))}
        </div>
        <div class="panel-body" style="padding-top:0"><div id="connSpark" style="height:96px"></div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>${t('ifdist_title') || L('接口类型分布', 'Interface types')}</h2><p class="sub">${t('ifdist_sub') || L('按实际接口类型统计', 'Counted by real interface type')}</p></div></div>
        ${ifTypeDonutHtml(d.ifaces || [], active)}
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
/* 接口类型分布：全部来自真实接口列表，不再编造 2.4G/5G/干扰/负载 等数据 */
function ifTypeDonutHtml(ifaces, active) {
  const groups = {};
  for (const i of ifaces) {
    const raw = String(i.type || 'other').toLowerCase();
    let key = 'other';
    if (/^(ether|sfp|sfpplus|vlan|bridge|bond|wireguard|wlan|wifi|pppoe|ipip|gre|veth|loop|tunnel|lte|modem)/.test(raw)) key = raw.match(/^(ether|sfpplus|sfp|vlan|bridge|bond|wireguard|wlan|wifi|pppoe|ipip|gre|veth|loop|tunnel|lte|modem)/)[1];
    const label = ({ ether: 'Ethernet', sfp: 'SFP', sfpplus: 'SFP+', vlan: 'VLAN', bridge: 'Bridge', bond: 'Bond', wireguard: 'WireGuard', wlan: 'WiFi', wifi: 'WiFi', pppoe: 'PPPoE', ipip: 'IPIP', gre: 'GRE', veth: 'veth', loop: 'Loop', tunnel: 'Tunnel', lte: 'LTE', modem: 'Modem', other: L('其他', 'Other') })[key] || key;
    groups[label] = (groups[label] || 0) + 1;
  }
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const idle = Math.max(0, ifaces.length - active);
  const c = 2 * Math.PI * 46, pct = (ifaces.length ? active / ifaces.length : 0);
  const colors = [cssVar('--blue', '#2563eb'), cssVar('--violet', '#7c5cff'), cssVar('--green', '#12a37f'), cssVar('--amber', '#dd8b10'), cssVar('--red', '#dc4c4c')];
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
      ${entries.slice(0, 4).map(([label, n], idx) => `<div class="mini-stat"><small><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${colors[idx % colors.length]};margin-right:5px"></i>${esc(label)}</small><b>${n}</b></div>`).join('')}
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
  if (state.connRows) conns = [...state.connRows].sort((a, b) => num(b.bytes) - num(a.bytes)).slice(0, 10);
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

/* ================= 流量统计（真实计数器差分 · 范围可切换 · 单接口可选） ================= */
const STATS_RANGES = {
  today: { label: () => t('stats_range_today'), series: () => t('stats_series_today') },
  week: { label: () => t('stats_range_week'), series: () => t('stats_series_week') },
  month: { label: () => t('stats_range_month'), series: () => t('stats_series_month') },
  total: { label: () => t('stats_range_total'), series: () => t('stats_series_total') },
};
function renderTrafficStats(range) {
  if (range) state.usageRange = range;
  if (!STATS_RANGES[state.usageRange]) state.usageRange = 'today';
  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${t('stats_title') || L('流量统计', 'Traffic statistics')}</h1><p>${t('stats_sub')}</p></div>
      <div class="page-actions">
        <span class="badge-live" id="statsBadge"><span class="d"></span>${esc(t(state.mode))}</span>
        <button class="btn" id="statsRefresh">${t('refresh')}</button>
      </div>
    </div>
    <div class="scope-bar" id="statsScope">
      <span class="tag blue">${t('stats_scope')}</span>
      <span class="scope-text" id="statsScopeText">${t('stats_scope_wait')}</span>
      <span class="scope-spacer"></span>
      <label class="scope-view" title="${esc(t('stats_view_hint'))}">${t('stats_view')}
        <select id="statsViewIface"><option value="">${esc(t('stats_view_scope'))}</option></select></label>
      <button class="btn btn-sm" id="statsIfaceBtn">⚙ ${t('stats_iface_btn')}</button>
    </div>
    <div class="tabs stats-tabs" id="statsTabs">
      ${Object.keys(STATS_RANGES).map((k) => `<button class="tab ${k === state.usageRange ? 'active' : ''}" data-range="${k}">${esc(STATS_RANGES[k].label())}</button>`).join('')}
    </div>
    <div class="cards" id="statCards"></div>
    <div class="data-source" id="statsSource"></div>
    <div class="panel">
      <div class="panel-head"><div><h2>${t('stats_chart')}</h2><p class="sub" id="statsRangeLabel"></p></div></div>
      <div class="chart-wrap"><canvas id="statsChart"></canvas><div class="tooltip" id="statsTip" hidden></div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2>${t('stats_detail')}</h2><p class="sub" id="statsDetailLabel"></p></div></div>
      <div class="table-scroll"><table><thead><tr><th>${t('time')}</th><th class="num">${t('legend_rx')}</th><th class="num">${t('legend_tx')}</th><th class="num">${t('total')}</th></tr></thead>
        <tbody id="statsBody"></tbody></table></div>
    </div>`;
  $('statsTabs').querySelectorAll('.tab').forEach((b) => b.onclick = () => {
    state.usageRange = b.dataset.range;
    $('statsTabs').querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.range === state.usageRange));
    if (state.usageData) paintTrafficStats(state.usageData);
  });
  $('statsRefresh').onclick = () => { state.usageData = null; refreshUsageData(); };
  $('statsViewIface').onchange = (e) => { state.usageViewIface = e.target.value; state.usageData = null; refreshUsageData(); };
  $('statsIfaceBtn').onclick = () => openUsageInterfaces(state.usageData || {});
  if (state.usageData) paintTrafficStats(state.usageData);
  else $('statCards').innerHTML = `<div class="empty" style="grid-column:1/-1">${t('loading')}</div>`;
  refreshUsageData();
  ensureUsageTimer(true);
}
function paintTrafficStats(d) {
  const cards = $('statCards'); if (!cards) return;
  const range = STATS_RANGES[state.usageRange] ? state.usageRange : 'today';
  const val = d[range] || { rx: 0, tx: 0 };
  const rate = d.rate || { rx: 0, tx: 0, real: false };
  updateStatsBadge(d);
  paintUsageScope(d);
  const card = (label, bytes, cls, foot) => {
    const f = splitBytes(bytes);
    return `<div class="card ${cls}"><div class="card-label">${esc(label)}</div><div class="card-value">${f.v}<small>${f.u}</small></div><div class="card-foot">${esc(foot)}</div></div>`;
  };
  const rr = fmtRate(rate.rx), rt = fmtRate(rate.tx);
  cards.innerHTML =
    card(STATS_RANGES[range].label() + ' · ' + t('stats_card_rx'), val.rx, 'rx', t('stats_from_router'))
    + card(STATS_RANGES[range].label() + ' · ' + t('stats_card_tx'), val.tx, 'tx', t('stats_from_router'))
    + card(t('stats_card_sum'), val.rx + val.tx, 'ok', t('stats_from_router'))
    + `<div class="card warn"><div class="card-label">${t('stats_card_rate')}</div>
        <div class="card-value">${rate.real ? rr.v : '—'}<small>${rate.real ? rr.u : ''}</small></div>
        <div class="card-foot">${rate.real ? '↓ ' + rr.v + ' ' + rr.u + ' · ↑ ' + rt.v + ' ' + rt.u : esc(t('stats_source_fake'))}</div></div>`;
  const src = $('statsSource');
  if (src) {
    const real = !!d.dataReal;
    src.className = 'data-source ' + (real ? 'real' : 'fake');
    src.innerHTML = `<span class="d"></span><b>${esc(real ? t('stats_source_real') : t('stats_source_fake'))}</b>
      <span>${esc(t('stats_updated'))} ${esc(fmtTime(d.ts))} · ${esc(t('stats_sample'))} ${d.sampleTs ? esc(fmtTime(d.sampleTs)) : esc(t('stats_no_sample'))}</span>
      ${d.resetNotice ? '<em>' + esc(t('stats_reset_notice')) + '</em>' : ''}
      ${d.resets ? '<em>' + esc(L('计数器重置跳过 ' + d.resets + ' 次采样', d.resets + ' counter resets skipped')) + '</em>' : ''}`;
  }
  const buckets = (d.series && d.series[range]) || [];
  const sub = STATS_RANGES[range].series();
  $('statsRangeLabel').textContent = sub;
  const dl = $('statsDetailLabel'); if (dl) dl.textContent = sub;
  drawBarChart('statsChart', 'statsTip', buckets, fmtBytes);
  $('statsBody').innerHTML = buckets.slice().reverse().map((b) => {
    const rx = splitBytes(b.rx), tx = splitBytes(b.tx);
    return `<tr><td>${esc(b.label)}</td><td class="num"><span class="rate rx">${rx.v}</span> <span class="tag">${rx.u}</span></td>
    <td class="num"><span class="rate tx">${tx.v}</span> <span class="tag">${tx.u}</span></td><td class="num">${fmtBytes(b.rx + b.tx)}</td></tr>`;
  }).join('') || emptyRow(4);
}
/* 范围条 + 查看接口下拉：只在接口清单变化时重建下拉，避免实时刷新打断用户选择 */
function paintUsageScope(d) {
  const box = $('statsScopeText'); if (!box) return;
  const custom = d.scope === 'custom';
  const names = (d.interfaces || []);
  const matched = Number(d.matched) || 0;
  const label = custom ? names.map((n) => esc(n)).join(' · ') : t('stats_scope_all');
  const viewTag = d.viewIface ? `<span class="tag blue">${esc(t('stats_view'))} · <b>${esc(d.viewIface)}</b></span>` : '';
  box.innerHTML = `<b title="${esc(names.join(', '))}">${label || t('stats_scope_custom')}</b>
      <span class="scope-meta">${t('stats_iface_matched')} ${matched} ${t('stats_iface_unit')}${custom && !matched ? ' · ' + t('stats_iface_none') : ''}</span>${viewTag}`;
  const sel = $('statsViewIface');
  if (sel) {
    const avail = d.available || [];
    const sig = avail.map((i) => i.name).join('|');
    if (sel.dataset.sig !== sig) {
      const cur = state.usageViewIface;
      sel.innerHTML = `<option value="">${esc(t('stats_view_scope'))}</option>`
        + avail.map((i) => `<option value="${esc(i.name)}">${esc(i.name)}${i.type ? ' (' + esc(i.type) + ')' : ''}</option>`).join('');
      sel.dataset.sig = sig;
      sel.value = avail.some((i) => i.name === cur) ? cur : '';
      state.usageViewIface = sel.value;
    }
  }
  const btn = $('statsIfaceBtn'); if (btn) btn.onclick = () => openUsageInterfaces(d);
}
/* 自定义参与统计的接口：全部 / 勾选真实接口 + 手动输入通配符 */
function openUsageInterfaces(d) {
  const custom = d.scope === 'custom';
  const sel = d.interfaces || [];
  const avail = d.available || [];
  const known = new Set(avail.map((i) => i.name));
  const manual = sel.filter((x) => /[*?]/.test(x) || !known.has(x));
  const listHtml = avail.length ? avail.map((i) =>
    `<label class="iface-opt" data-name="${esc(i.name.toLowerCase())}" title="${esc(i.comment || i.name)}">
      <input type="checkbox" class="iface-cb" value="${esc(i.name)}" ${sel.includes(i.name) ? 'checked' : ''}>
      <span class="iface-name">${esc(i.name)}</span><span class="tag">${esc(i.type || '-')}</span></label>`).join('')
    : `<div class="empty">${t('stats_iface_no_list') || L('暂时没有读取到接口，请手动填写', 'No interfaces available yet')}</div>`;
  openModal(t('stats_iface_title') || L('流量统计接口', 'Traffic statistics interfaces'), `
    <div class="note-card">${t('stats_iface_tip') || L('建议只选 WAN 口，避免内外网重复计入', 'Select only WAN interfaces to avoid double counting')}</div>
    <div class="form-row"><label>${t('stats_scope') || L('统计范围', 'Scope')}</label><div>
      <label class="form-check"><input type="radio" name="usageScope" value="all" ${custom ? '' : 'checked'}> ${t('stats_iface_all') || L('统计全部接口', 'Count all interfaces')}</label>
      <label class="form-check"><input type="radio" name="usageScope" value="custom" ${custom ? 'checked' : ''}> ${t('stats_iface_custom') || L('仅统计指定接口', 'Count only selected interfaces')}</label>
    </div></div>
    <div id="usageCustom" ${custom ? '' : 'hidden'}>
      <div class="form-row"><label>${t('stats_iface_list') || L('从路由器接口中选择', 'Pick from router interfaces')}</label><div>
        <input type="search" id="usageIfaceSearch" class="usage-search" placeholder="${t('stats_iface_search') || L('搜索接口…', 'Search interfaces…')}">
        <div class="iface-picker" id="usageIfaceList">${listHtml}</div></div></div>
      <div class="form-row"><label>${t('stats_iface_manual') || L('手动填写接口名 / 通配符', 'Manual names / wildcards')}</label><div>
        <textarea id="usageManual" placeholder="pppoe-*">${esc(manual.join('\n'))}</textarea>
        <p class="form-hint">${t('stats_iface_manual_hint') || L('支持 * 和 ? 通配符', 'Wildcards * and ? are supported')}</p></div></div>
    </div>
    <div class="modal-note">${t('stats_iface_reset') || L('切换范围会重建计数基线，历史数据保留。', 'Changing the scope resets the counter baseline; history is kept.')}</div>`,
    `<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${t('save')}</button>`,
    (m) => {
      const customBox = m.querySelector('#usageCustom');
      const sync = () => { customBox.hidden = m.querySelector('input[name="usageScope"]:checked').value !== 'custom'; };
      m.querySelectorAll('input[name="usageScope"]').forEach((r) => { r.onchange = sync; });
      sync();
      const search = m.querySelector('#usageIfaceSearch');
      if (search) search.oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        m.querySelectorAll('.iface-opt').forEach((el) => { el.hidden = !!(q && !el.dataset.name.includes(q)); });
      };
      const ok = m.querySelector('[data-ok]');
      ok.onclick = async () => {
        const scope = m.querySelector('input[name="usageScope"]:checked').value;
        let names = [];
        if (scope === 'custom') {
          m.querySelectorAll('.iface-cb:checked').forEach((cb) => names.push(cb.value));
          (m.querySelector('#usageManual').value || '').split(/[\n,，;；]+/).forEach((x) => { const v = x.trim(); if (v) names.push(v); });
          names = [...new Set(names)];
          if (!names.length) { toast(t('stats_iface_need_one') || L('请至少选择一个接口', 'Select at least one interface'), 'err'); return; }
        }
        ok.disabled = true;
        try {
          const r = await api('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interfaces: names, iface: state.usageViewIface }) });
          closeModal();
          state.usageData = r;
          if (state.section === 'trafficStats') paintTrafficStats(r);
          toast(t('stats_iface_saved'), 'ok');
        } catch (e) { toast(e.message, 'err'); ok.disabled = false; }
      };
    });
}
function aggregateUsage(daily, range) {
  if (range === 'day') return daily.slice(-30).map((x) => ({ label: x.day, rx: x.rx, tx: x.tx }));
  const keyOf = (day) => {
    const dt = new Date(day + 'T00:00:00');
    if (range === 'month') return day.slice(0, 7);
    // ISO 周：以周一为起始
    const d = new Date(dt); const dayNum = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dayNum);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-W' + p(d.getMonth() + 1) + '/' + p(d.getDate());
  };
  const map = new Map();
  for (const x of daily) {
    const k = keyOf(x.day); const cur = map.get(k) || { label: k, rx: 0, tx: 0 };
    cur.rx += x.rx; cur.tx += x.tx; map.set(k, cur);
  }
  return [...map.values()].slice(range === 'week' ? -12 : -12);
}
function drawBarChart(canvasId, tipId, buckets, fmt) {
  const cv = $(canvasId); if (!cv) return;
  const wrap = cv.parentElement, w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!buckets.length) return;
  const pad = { l: 62, r: 12, t: 12, b: 26 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  let max = 1; for (const b of buckets) max = Math.max(max, b.rx, b.tx);
  const steps = [1, 2, 5].map((n) => n); let top = 1;
  for (let e = 0; e < 18; e++) { for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= max * 1.15) { top = v; break; } } if (top > 1) break; }
  ctx.font = '10px -apple-system, "PingFang SC", sans-serif'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ph * i / 4;
    ctx.strokeStyle = cssVar('--grid', '#edf0f6'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.textAlign = 'right'; ctx.fillText(fmt(top * (1 - i / 4)), pad.l - 7, y);
  }
  const slot = pw / buckets.length, bw = Math.max(2, Math.min(18, slot * 0.32));
  const colors = { rx: cssVar('--blue', '#2563eb'), tx: cssVar('--violet', '#7c5cff') };
  buckets.forEach((b, i) => {
    const cx = pad.l + slot * (i + 0.5);
    const hRx = ph * Math.min(1, b.rx / top), hTx = ph * Math.min(1, b.tx / top);
    ctx.fillStyle = colors.rx; ctx.fillRect(cx - bw - 1, pad.t + ph - hRx, bw, hRx);
    ctx.fillStyle = colors.tx; ctx.fillRect(cx + 1, pad.t + ph - hTx, bw, hTx);
    if (i % Math.ceil(buckets.length / 8) === 0) {
      ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const lbl = String(b.label); ctx.fillText(lbl.length > 7 ? lbl.slice(-5) : lbl, cx, pad.t + ph + 7);
    }
  });
  const legend = [{ key: 'rx', label: t('legend_rx') }, { key: 'tx', label: t('legend_tx') }];
  if (tipId && $(tipId)) $(tipId).hidden = true;
  cv.onmousemove = (e) => {
    const rect = cv.getBoundingClientRect(), x = e.clientX - rect.left;
    if (!tipId || x < pad.l || x > pad.l + pw) { if (tipId && $(tipId)) $(tipId).hidden = true; return; }
    const idx = Math.max(0, Math.min(buckets.length - 1, Math.floor((x - pad.l) / slot)));
    const b = buckets[idx], tip = $(tipId);
    tip.innerHTML = `<div class="tt">${esc(b.label)}</div>` + legend.map((s) => `${esc(s.label)}: <b>${fmt(b[s.key])}</b>`).join('<br>');
    tip.hidden = false; tip.style.left = Math.max(70, Math.min(w - 70, pad.l + slot * (idx + 0.5))) + 'px';
    tip.style.top = Math.max(40, pad.t + ph - ph * Math.min(1, Math.max(b.rx, b.tx) / top) - 5) + 'px';
  };
  cv.onmouseleave = () => { if (tipId && $(tipId)) $(tipId).hidden = true; };
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
window.addEventListener('resize', () => { if (state.section === 'dashboard') renderDashboard(); if (state.section === 'trafficStats') renderTrafficStats(); });

/* 后续配置页函数在 config.js */
