'use strict';

const connOther = (a, b, c) => Math.max(0, (Number(a) || 0) - (Number(b) || 0) - (Number(c) || 0)).toLocaleString();

/* 只有演示模式才显示 DEMO 提示；实时状态不再挂 LIVE 徽标 */
function demoBadge(id) {
  return `<span class="badge-demo"${id ? ` id="${id}"` : ''}${state.mode === 'demo' ? '' : ' hidden'}><span class="d"></span>${esc(t('demo_only'))}</span>`;
}

/* ================= 概览仪表盘 ================= */
function renderDashboard() {
  const topoKeep = document.getElementById('topoPanel'); // 拓扑面板保持 DOM，避免每秒重绘打断拖拽
  const d = state.latest || {};
  const r = d.resource || {};
  const active = (d.ifaces || []).filter((i) => i.running === 'true' && i.disabled !== 'true').length;
  const sel = state.selectedIface;
  const selIface = sel !== '__all__' ? (d.ifaces || []).find((i) => i.name === sel) : null;
  const rx = fmtRate(sel === '__all__' ? (d.totalRx || 0) : (selIface ? selIface.rxBps || 0 : 0));
  const tx = fmtRate(sel === '__all__' ? (d.totalTx || 0) : (selIface ? selIface.txBps || 0 : 0));
  const scopeTag = sel === '__all__' ? '' : `<span class="card-scope">${esc(sel)}</span>`;
  const rxFoot = esc(sel === '__all__' ? t('rx_hint') : t('rx_hint_one'));
  const txFoot = esc(sel === '__all__' ? t('tx_hint') : t('tx_hint_one'));
  const cn = d.connections || { v4: 0, v6: 0, total: 0, tcp4: 0, tcp6: 0, udp4: 0, udp6: 0, tcp: 0, udp: 0 };
  let peak = 0, peakTx = 0;
  for (const p of state.points) { peak = Math.max(peak, p.rx || 0); peakTx = Math.max(peakTx, p.tx || 0); }
  const pk = fmtRate(peak), pkt = fmtRate(peakTx);

  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${t('overview_title') || '系统概览'}</h1><p>${esc(r['board-name'] || 'RouterOS')} · RouterOS ${esc(r.version || '')} · ${t('uptime')} ${fmtUptime(d.uptime)}</p></div>
      <div class="page-actions">
        <button class="dash-iface-btn${sel === '__all__' ? '' : ' custom'}" id="dashIfaceBtn" type="button" title="${esc(t('dash_iface_title'))}">
          <span class="dash-iface-ic">⇅</span>
          <span class="dash-iface-txt"><small>${esc(t('dash_iface'))}</small><b class="dash-iface-name">${esc(dashIfaceLabel())}</b></span>
          <span class="dash-iface-caret">⌄</span>
        </button>
        <button class="btn" id="dashBlocksBtn" type="button" title="${esc(L('拖动块排序，或显示/隐藏块', 'Drag to reorder or show/hide blocks'))}">▦ ${esc(L('块设置', 'Blocks'))}</button>
        ${demoBadge()}
      </div>
    </div>
    <div class="cards">
      <div class="card rx" data-block="rx"><div class="card-label">${t('total_rx')}${scopeTag}</div><div class="card-value">${rx.v}<small>${rx.u}</small></div><div class="card-foot">${rxFoot}</div></div>
      <div class="card tx" data-block="tx"><div class="card-label">${t('total_tx')}${scopeTag}</div><div class="card-value">${tx.v}<small>${tx.u}</small></div><div class="card-foot">${txFoot}</div></div>
      <div class="card ok" data-block="active"><div class="card-label">${t('active_if')}</div><div class="card-value">${active}<small>/ ${(d.ifaces || []).length}</small></div><div class="card-foot">${t('if_hint')}</div></div>
      <div class="card warn" data-block="peak_rx"><div class="card-label">${t('peak_rx')}${scopeTag}</div><div class="card-value">${pk.v}<small>${pk.u}</small></div><div class="card-foot">${t('uptime')} ${fmtUptime(d.uptime)}</div></div>
      <div class="card warn" data-block="peak_tx"><div class="card-label">${t('peak_tx')}${scopeTag}</div><div class="card-value">${pkt.v}<small>${pkt.u}</small></div><div class="card-foot">${t('uptime')} ${fmtUptime(d.uptime)}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel" data-block="trend">
        <div class="panel-head"><div><h2>${t('trend_title')}</h2><p class="sub">${t('trend_sub')}</p></div>
          <div class="legend"><span><i style="background:var(--blue)"></i>${t('legend_rx')}</span><span><i style="background:var(--violet)"></i>${t('legend_tx')}</span></div></div>
        <div class="chart-wrap"><canvas id="dashChart"></canvas><div class="tooltip" id="dashTip" hidden></div></div>
      </div>
      <div class="panel" data-block="health">
        <div class="panel-head"><div><h2>${t('health_title')}</h2><p class="sub">${t('health_sub')}</p></div></div>
        <div class="chart-wrap"><canvas id="healthChart"></canvas><div class="tooltip" id="healthTip" hidden></div></div>
      </div>
    </div>
    <div class="grid-32">
      <div class="panel conn-panel" data-block="connections">
        <div class="panel-head"><div><h2>${t('conn_title')}</h2><p class="sub">${t('conn_sub')}${d.connectionsReal === false ? ' · ' + L('非实时，显示上次真实值', 'Not live, showing last real values') : ''}</p></div></div>
        <div class="conn-total">
          <div class="conn-total-main"><small>${t('conn_total_hint')}</small><b>${String((cn.total || 0).toLocaleString())}</b></div>
          <div class="conn-split"><span><i class="v4"></i>IPv4 <b>${String((cn.v4 || 0).toLocaleString())}</b></span><span><i class="v6"></i>IPv6 <b>${String((cn.v6 || 0).toLocaleString())}</b></span></div>
        </div>
        <div class="conn-compact">
          <div class="conn-row head"><span></span><b>${t('conn_group_all')}</b><b>${t('conn_tcp')}</b><b>${t('conn_udp')}</b><b>${t('conn_other')}</b></div>
          <div class="conn-row v4"><span>IPv4</span><b>${num(cn.v4).toLocaleString()}</b><b>${num(cn.tcp4).toLocaleString()}</b><b>${num(cn.udp4).toLocaleString()}</b><b>${connOther(cn.v4, cn.tcp4, cn.udp4)}</b></div>
          <div class="conn-row v6"><span>IPv6</span><b>${num(cn.v6).toLocaleString()}</b><b>${num(cn.tcp6).toLocaleString()}</b><b>${num(cn.udp6).toLocaleString()}</b><b>${connOther(cn.v6, cn.tcp6, cn.udp6)}</b></div>
        </div>
        <div class="panel-body conn-spark"><div id="connSpark"></div></div>
      </div>
      <div class="panel" data-block="iftypes">
        <div class="panel-head"><div><h2>${t('ifdist_title') || L('接口类型分布', 'Interface types')}</h2><p class="sub">${t('ifdist_sub') || L('按实际接口类型统计', 'Counted by real interface type')}</p></div></div>
        ${ifTypeDonutHtml(d.ifaces || [], active)}
      </div>
    </div>
    <div class="grid-2 dash-extra">
      ${topTablePanel('topIfPanel', t('top_if'), t('top_if_sub'), [t('seq'), t('iface'), t('rate_rx'), t('rate_tx'), t('total')], 'topif')}
      ${topTablePanel('topConnPanel', t('top_conn'), t('top_conn_sub'), [t('seq'), L('源地址', 'Source'), L('目标地址', 'Destination'), L('协议', 'Protocol'), L('流量', 'Bytes')], 'topconn')}
    </div>
    <div class="grid-2 dash-extra">
      ${dashLinksBlock(d)}
      ${dashQualityBlock()}
    </div>`;
  if (topoKeep) topoKeep.remove();

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
  applyDashboardLayout();
  const lb = $('linkCfgBtn');
  if (lb) lb.onclick = (e) => { e.stopPropagation(); openLinkSettings(d); };
  const qb = $('qualityCfgBtn');
  if (qb) qb.onclick = (e) => { e.stopPropagation(); openQualityTargets(); };
  if (window.paintDashIfacePop) window.paintDashIfacePop();
  refreshDashExtras();
}
/* ---------- 仪表盘可选块：全部来自真实接口速率 / Netwatch / 防火墙计数器 ---------- */
const LINKS_KEY = () => 'rosCenter.links.' + (state.deviceId || '');
const QUALITY_KEY = () => 'rosCenter.qualityTargets.' + (state.deviceId || '');
/* 目标设置：{ mode: 'icmp'|'netwatch', interval, targets: [{host,label}] }
   兼容旧版纯数组（默认 ICMP 模式）。 */
function qualityPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(QUALITY_KEY())); } catch (e) { /* ignore */ }
  if (Array.isArray(p)) return { mode: 'icmp', interval: '1m', targets: p, enabled: true };
  if (p && Array.isArray(p.targets)) {
    return { mode: p.mode === 'netwatch' ? 'netwatch' : 'icmp',
      interval: p.interval || '1m', targets: p.targets, enabled: p.enabled !== false };
  }
  return { mode: 'icmp', interval: '1m', targets: [], enabled: true };
}
function qualityTargets() { return qualityPrefs().targets; }
function qualityMode() { return qualityPrefs().mode; }
function linkPrefs() {
  try { const p = JSON.parse(localStorage.getItem(LINKS_KEY())); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}
function gaugeSvg(pct) {
  const c = 2 * Math.PI * 38;
  const color = pct >= 95 ? 'var(--red)' : pct >= 85 ? 'var(--amber)' : pct >= 60 ? 'var(--blue)' : 'var(--green)';
  return `<svg class="dash-gauge-svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="38" fill="none" stroke="var(--grid)" stroke-width="8"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * Math.min(100, Math.max(0, pct)) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>
    <text x="50" y="55" text-anchor="middle" class="dash-gauge-val">${Math.round(pct)}%</text></svg>`;
}
function dashLinksBlock(d) {
  const ifaces = (d.ifaces || []).filter((i) => i.running === 'true' && i.disabled !== 'true');
  let picked = linkPrefs().map((p) => { const i = ifaces.find((x) => x.name === p.name); return i ? { i, cap: Number(p.capMbps) || 0 } : null; }).filter(Boolean);
  if (!picked.length) {
    picked = ifaces.slice().sort((a, b) =>
      ((num(b.rxBps) + num(b.txBps)) / (num(b.linkBps) || 1e9)) - ((num(a.rxBps) + num(a.txBps)) / (num(a.linkBps) || 1e9)))
      .slice(0, 3).map((i) => ({ i, cap: num(i.linkBps) ? Math.round(num(i.linkBps) / 1e6) : 1000 }));
  }
  picked = picked.slice(0, 4);
  const cards = picked.map(({ i, cap }) => {
    const pct = cap > 0 ? (num(i.rxBps) + num(i.txBps)) / (cap * 1e6) * 100 : 0;
    const lvl = pct >= 95 ? 'critical' : pct >= 85 ? 'warning_level' : 'normal';
    return `<div class="dash-gauge"><div class="dash-gauge-wrap">${gaugeSvg(pct)}</div>
      <b title="${esc(i.comment || i.name)}">${esc(i.name)}</b>
      <small>↓${esc(fmtRate(i.rxBps).v)} ↑${esc(fmtRate(i.txBps).v)}</small>
      <span class="tag ${pct >= 95 ? 'red' : pct >= 85 ? 'amber' : 'green'}">${t(lvl)}</span></div>`;
  }).join('');
  return `<div class="panel" data-block="links">
    <div class="panel-head"><div><h2>${t('link_util_title')}</h2><p class="sub">${t('link_util_sub')}</p></div>
      <button class="btn btn-sm" id="linkCfgBtn" type="button">⚙ ${t('link_settings')}</button></div>
    <div class="panel-body dash-gauges">${cards || `<div class="empty">${t('no_data')}</div>`}</div>
  </div>`;
}
function openLinkSettings(d) {
  const ifaces = (d.ifaces || []).filter((i) => i.running === 'true');
  const prefs = linkPrefs();
  const rows = ifaces.map((i) => {
    const saved = prefs.find((p) => p.name === i.name);
    const cap = saved ? saved.capMbps : (num(i.linkBps) ? Math.round(num(i.linkBps) / 1e6) : 1000);
    return `<label class="ui-row"><input type="checkbox" data-link="${esc(i.name)}" ${saved ? 'checked' : ''}>
      <span class="ui-row-main"><b>${esc(i.name)}</b><small>${esc(i.comment || i.type)}</small></span>
      <input type="number" min="1" max="100000" step="1" value="${cap}" data-cap="${esc(i.name)}" style="width:92px"> <small>${t('link_capacity')}</small></label>`;
  }).join('');
  openModal(t('link_settings'), `<div class="ui-intro"><div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h16M4 8h10M4 16h10"/></svg></div>
      <div><b>${esc(L('链路利用率', 'Link utilization'))}</b><p>${esc(L('勾选要显示的链路并填写带宽（最多 4 条），带宽默认取路由器协商速率。', 'Pick up to 4 links and set their capacity (defaults to the negotiated interface speed).'))}</p></div></div>
    <div class="ui-list">${rows || `<div class="empty">${t('no_data')}</div>`}</div>`,
    `<span class="ui-summary">${esc(L('最多 ', 'Up to '))}4 ${esc(L('条', 'links'))}</span>
     <button class="btn" data-close type="button">${t('cancel')}</button><button class="btn primary" data-save type="button">${t('confirm')}</button>`,
    (m) => {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-save]').onclick = () => {
        const chosen = [...m.querySelectorAll('[data-link]')].filter((c) => c.checked)
          .slice(0, 4).map((c) => ({ name: c.dataset.link,
            capMbps: Math.max(1, Number(m.querySelector(`[data-cap="${c.dataset.link}"]`)?.value) || 1000) }));
        localStorage.setItem(LINKS_KEY(), JSON.stringify(chosen));
        closeModal(); renderDashboard();
      };
    });
}
function dashQualityBlock() {
  const rows = (state.quality && state.quality.rows) || [];
  const mode = qualityMode();
  const modeTag = `<span class="tag ${mode === 'netwatch' ? 'violet' : ''}" title="${esc(L('当前探测模式', 'Active probe mode'))}">${esc(mode === 'netwatch' ? L('Netwatch 探针', 'Netwatch') : L('ICMP 探测', 'ICMP'))}</span>`;
  const body = !state.quality ? `<div class="empty">${t('loading')}</div>` : `<div class="table-scroll"><table class="mini-table">
    <thead><tr><th>${t('th_target')}</th><th class="num">${t('th_delay')}</th><th class="num">${t('th_jitter')}</th><th class="num">${t('th_loss')}</th><th>${L('状态', 'Status')}</th></tr></thead>
    <tbody>${rows.map((r) => {
      const loss = num(r.loss), avg = num(r.avg), jit = num(r.jitter);
      const st = r.state || (r.error || r.loss == null ? 'unknown'
        : (loss >= 10 || avg >= 100 ? 'bad' : (loss > 0 || jit >= 10 || avg >= 50 ? 'warn' : 'ok')));
      const cls = st === 'ok' ? 'green' : st === 'warn' ? 'amber' : st === 'bad' ? 'red' : '';
      const label = st === 'ok' ? t('normal') : st === 'warn' ? t('warning_level') : st === 'bad' ? t('critical') : t('unknown_status');
      const src = r.source === 'netwatch' ? L('Netwatch 探针', 'Netwatch') : L('ICMP 探测', 'ICMP');
      const tip = r.error ? `${src} · ${r.error}` : (r.source === 'netwatch' ? `${src}${r.since ? ' · ' + L('自', 'since') + ' ' + esc(r.since) : ''}` : src);
      return `<tr><td><b>${esc(r.label || r.host)}</b><small>${esc(r.host)} · ${esc(src)}</small></td>
        <td class="num">${avg ? (avg > 0 && avg < 1 ? Math.round(avg * 1000) + ' µs' : avg.toFixed(1) + ' ms') : '—'}</td><td class="num">${jit ? (jit > 0 && jit < 1 ? Math.round(jit * 1000) + ' µs' : jit.toFixed(1) + ' ms') : '—'}</td>
        <td class="num">${r.loss == null ? '—' : loss + '%'}</td>
        <td><span class="tag ${cls}" title="${esc(tip)}">${label}</span></td></tr>`;
    }).join('') || `<tr><td colspan="5" class="empty">${t('no_data')}</td></tr>`}</tbody></table></div>`;
  return `<div class="panel" data-block="quality">
    <div class="panel-head"><div><h2>${t('link_quality_title')}</h2><p class="sub">${t('link_quality_sub')}</p></div>
      <div style="display:flex;align-items:center;gap:8px">${modeTag}<button class="btn btn-sm" id="qualityCfgBtn" type="button">⚙ ${t('quality_targets')}</button></div></div>
    <div class="panel-body dash-mini-body">${body}</div></div>`;
}
function qtRow(host, label, mode) {
  const netwatch = mode === 'netwatch';
  return `<div class="lease-card qt-card" data-name="${esc((host || '') + ' ' + (label || '')).toLowerCase()}">
    <label>${esc(L('目标地址', 'Host'))} <small>host</small></label>
    <input type="text" class="qt-host" placeholder="1.1.1.1" value="${esc(host || '')}" autocomplete="off">
    <label>${esc(netwatch ? L('备注 / WinBox 名称', 'Comment / WinBox name') : L('显示名称', 'Label'))} <small>${netwatch ? 'comment' : 'label'}</small></label>
    <div class="qt-field-row"><input type="text" class="qt-label" placeholder="${esc(L('名称', 'Label'))}" value="${esc(label || '')}" autocomplete="off">
      <button class="btn btn-sm qt-del" type="button" data-qt-del title="${esc(t('delete'))}">×</button></div>
  </div>`;
}
function openQualityTargets() {
  /* 统一复用设计稿 link-quality 表单（检测目标为文本框） */
  if (typeof v2OpenProbeModal === 'function') { v2OpenProbeModal(); return; }
  const prefs = qualityPrefs();
  const modeInput = (value, title, desc, icon) => `<label class="qt-mode-card lease-card${prefs.mode === value ? ' selected' : ''}" data-mode="${value}">
    <input type="radio" name="qtMode" value="${value}" ${prefs.mode === value ? 'checked' : ''}>
    <span class="qt-mode-ic">${icon}</span>
    <span class="qt-mode-copy"><b>${esc(title)}</b><small>${esc(desc)}</small></span>
    <span class="qt-mode-check">✓</span></label>`;
  const body = `
    <div class="lease-intro ui-intro">
      <div class="lease-intro-icon ui-intro-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 6 16 3-8h4"/></svg></div>
      <div><b>${esc(L('链路质量探测', 'Link quality probes'))}</b>
        <p>${esc(L('选择探测模式，填写要探测的地址与名称（最多 5 个）；Netwatch 模式会把目标写入路由器的 /Tool/Netwatch，WinBox 中可见。', 'Pick a probe mode and up to 5 targets. Netwatch mode writes targets into RouterOS /Tool/Netwatch so they show up in WinBox.'))}</p></div>
    </div>
    <div class="lease-form-wrap">
      <div class="lease-group">
        <div class="lease-group-title"><i style="background:var(--blue)"></i>${esc(L('探测模式', 'Probe mode'))} <small>${esc(L('决定状态来源', 'Status source'))}</small></div>
        <div class="qt-mode-grid">
          ${modeInput('icmp', L('ICMP 探测', 'ICMP ping'), L('由路由器实时 ping：延迟 / 抖动 / 丢包', 'Live ping from the router: latency / jitter / loss'),
            `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`)}
          ${modeInput('netwatch', L('Netwatch 探针', 'Netwatch probe'), L('写入路由器 Netwatch，状态取自主机持续探测', 'Written to RouterOS Netwatch; status from continuous probing'),
            `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18h16M6 18V9m6 9V5m6 13v-6"/><circle cx="6" cy="7" r="2"/><circle cx="12" cy="3" r="2"/><circle cx="18" cy="11" r="2"/></svg>`)}
        </div>
        <div class="qt-netwatch-opts" id="qtNwOpts" ${prefs.mode === 'netwatch' ? '' : 'hidden'}>
          <div class="lease-card"><label>${esc(L('检测间隔', 'Interval'))} <small>interval</small></label>
            <select id="qtInterval">
              ${['10s', '30s', '1m', '5m'].map((v) => `<option value="${v}" ${prefs.interval === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
          <p class="qt-hint">${esc(L('保存时自动在路由器的 /Tool/Netwatch 新增或更新对应条目；从列表移除目标会删除由本程序创建的 Netwatch 条目（手工创建的不会动）。状态由 Netwatch 持续探测提供，延迟 / 抖动 / 丢包仍由 ICMP 补充。', 'On save, matching /Tool/Netwatch entries are added or updated. Removed targets delete entries created by ROS Center; manually created ones are left alone. Status comes from Netwatch, latency / jitter / loss from ICMP.'))}</p>
        </div>
      </div>
      <div class="lease-group">
        <div class="lease-group-title"><i style="background:var(--green)"></i>${esc(L('探测目标', 'Probe targets'))} <small>${esc(L('最多 5 个', 'Up to 5'))}</small></div>
        <div class="ui-toolbar"><span class="ui-summary">${esc(L('留空时自动使用网关与外部 DNS', 'Leave empty to use gateway and public DNS'))}</span>
          <div class="ui-quick"><button class="btn btn-sm" id="qtAdd" type="button">+ ${esc(t('add'))}</button></div></div>
        <div class="lease-grid qt-list" id="qtList">${prefs.targets.map((r) => qtRow(r.host, r.label, prefs.mode)).join('') || qtRow('', '', prefs.mode)}</div>
      </div>
    </div>`;
  openModal(t('quality_targets'), body,
    `<span class="ui-summary" id="qtFootHint">${esc(L('最多 ', 'Up to '))}5 ${esc(L('个目标', 'targets'))}</span>
     <button class="btn" data-close type="button">${t('cancel')}</button><button class="btn primary" data-save type="button">${t('confirm')}</button>`,
    (m) => {
      const list = m.querySelector('#qtList');
      const nwOpts = m.querySelector('#qtNwOpts');
      const hint = m.querySelector('#qtFootHint');
      let currentMode = prefs.mode;
      const syncModeUI = () => {
        nwOpts.hidden = currentMode !== 'netwatch';
        hint.textContent = currentMode === 'netwatch'
          ? L('Netwatch 模式 · 保存后写入路由器', 'Netwatch mode · written to the router on save')
          : L('ICMP 模式 · 实时 ping', 'ICMP mode · live ping');
        list.querySelectorAll('.qt-card').forEach((c) => {
          const l = c.querySelector('.qt-label');
          l.placeholder = currentMode === 'netwatch' ? L('WinBox 备注', 'WinBox comment') : L('名称', 'Label');
        });
      };
      const bindDel = () => list.querySelectorAll('[data-qt-del]').forEach((b) => {
        b.onclick = () => { b.closest('.qt-card').remove(); };
      });
      bindDel();
      m.querySelectorAll('input[name="qtMode"]').forEach((r) => {
        r.onchange = () => {
          if (!r.checked) return;
          currentMode = r.value;
          m.querySelectorAll('.qt-mode-card').forEach((c) => c.classList.toggle('selected', c.dataset.mode === currentMode));
          syncModeUI();
        };
      });
      m.querySelector('#qtAdd').onclick = () => {
        list.insertAdjacentHTML('beforeend', qtRow('', '', currentMode)); bindDel();
      };
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-save]').onclick = async () => {
        const targets = [...list.querySelectorAll('.qt-card')].map((r) => ({
          host: r.querySelector('.qt-host').value.trim(), label: r.querySelector('.qt-label').value.trim(),
        })).filter((r) => /^[a-zA-Z0-9_.:-]+$/.test(r.host)).slice(0, 5);
        const next = { mode: currentMode, interval: m.querySelector('#qtInterval').value || '1m', targets };
        try {
          if (next.mode === 'netwatch') {
            /* 先把目标写入 RouterOS Netwatch，成功后再落到本地设置，避免配置不一致 */
            toast(L('正在同步 Netwatch 条目…', 'Syncing Netwatch entries…'));
            await api('/api/link-quality/netwatch', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targets, interval: next.interval }),
            });
          }
          localStorage.setItem(QUALITY_KEY(), JSON.stringify(next));
          state.quality = null; state.qualityAt = 0;
          closeModal(); renderDashboard();
          toast(t('saved_ok'), 'ok');
        } catch (e) { toast(e.message, 'err'); }
      };
      syncModeUI();
    });
}
async function refreshDashExtras() {
  const now = Date.now();
  if (!state.qualityLoading && now - state.qualityAt > 30000) {
    state.qualityLoading = true;
    const p = qualityPrefs();
    const qs = p.targets.map((r) => encodeURIComponent(r.host + '|' + r.label)).join(',');
    try { state.quality = await api('/api/link-quality?mode=' + encodeURIComponent(p.mode) + (qs ? '&targets=' + qs : '')); }
    catch (e) { state.quality = { error: e.message, rows: [] }; }
    state.qualityAt = Date.now(); state.qualityLoading = false;
    if (state.section === 'dashboard') renderDashboard();
  }
}

const DASH_BLOCKS = [
  ['rx', () => L('下行速率', 'Download')], ['tx', () => L('上行速率', 'Upload')],
  ['active', () => L('活跃接口', 'Active interfaces')], ['peak_rx', () => L('峰值下行速率', 'Peak download')],
  ['peak_tx', () => L('峰值上行速率', 'Peak upload')], ['trend', () => L('流量趋势', 'Traffic trend')],
  ['health', () => L('设备健康', 'Device health')], ['connections', () => L('连接状态', 'Connections')],
  ['iftypes', () => L('接口类型分布', 'Interface types')], ['topif', () => L('接口流量排行', 'Interface ranking')],
  ['topconn', () => L('连接流量排行', 'Connection ranking')],
  ['links', () => L('关键链路利用率', 'Link utilization')], ['quality', () => L('链路质量', 'Link quality')],
];
const dashPrefsKey = () => 'rosCenter.dash.' + (state.deviceId || '');
function dashPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(dashPrefsKey()));
    if (p && Array.isArray(p.order)) return { order: p.order, hidden: Array.isArray(p.hidden) ? p.hidden : [] };
  } catch (e) { /* ignore */ }
  return { order: DASH_BLOCKS.map((x) => x[0]), hidden: [] };
}
function applyDashboardLayout() {
  const root = $('content'); if (!root) return;
  const prefs = dashPrefs(), hidden = new Set(prefs.hidden);
  const blocks = [...root.querySelectorAll('[data-block]')];
  let dragId = '';
  const save = () => {
    const order = [...root.querySelectorAll('[data-block]')].map((b) => b.dataset.block);
    const hide = [...root.querySelectorAll('[data-block]')].filter((b) => b.hidden).map((b) => b.dataset.block);
    localStorage.setItem(dashPrefsKey(), JSON.stringify({ order, hidden: hide }));
  };
  for (const b of blocks) {
    b.classList.add('dash-block');
    b.hidden = hidden.has(b.dataset.block);
    const handle = b.querySelector('.panel-head') || b;
    handle.classList.add('dash-drag-handle');
    handle.draggable = true;
    handle.ondragstart = (e) => { dragId = b.dataset.block; e.dataTransfer.effectAllowed = 'move'; b.classList.add('dragging'); };
    handle.ondragend = () => { dragId = ''; root.querySelectorAll('.dragging,.dash-over').forEach((x) => x.classList.remove('dragging', 'dash-over')); };
    b.ondragover = (e) => { if (!dragId || dragId === b.dataset.block) return; e.preventDefault(); b.classList.add('dash-over'); };
    b.ondragleave = () => b.classList.remove('dash-over');
    b.ondrop = (e) => {
      e.preventDefault(); b.classList.remove('dash-over');
      if (!dragId || dragId === b.dataset.block) return;
      const src = root.querySelector(`[data-block="${dragId}"]`);
      if (!src || src.parentElement !== b.parentElement) return;
      const kids = [...b.parentElement.children];
      if (kids.indexOf(src) < kids.indexOf(b)) b.parentElement.insertBefore(src, b.nextSibling);
      else b.parentElement.insertBefore(src, b);
      dragId = ''; save();
    };
  }
  for (const parent of new Set(blocks.map((b) => b.parentElement))) {
    const order = prefs.order;
    [...parent.children].filter((x) => x.dataset && x.dataset.block)
      .sort((a, b) => { const ia = order.indexOf(a.dataset.block), ib = order.indexOf(b.dataset.block); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); })
      .forEach((x) => parent.appendChild(x));
  }
  const btn = $('dashBlocksBtn');
  if (btn) btn.onclick = openDashboardBlocks;
}
function openDashboardBlocks() {
  const prefs = dashPrefs(), hidden = new Set(prefs.hidden);
  const rows = DASH_BLOCKS.map(([id, label]) => `<label class="ui-row"><input type="checkbox" data-block-toggle="${id}" ${hidden.has(id) ? '' : 'checked'}><span class="ui-row-main"><b>${esc(label())}</b><small>${esc(id)}</small></span></label>`).join('');
  openModal(L('仪表盘块', 'Dashboard blocks'),
    `<div class="ui-intro"><div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
       <div><b>${esc(L('选择要显示的块', 'Choose dashboard blocks'))}</b><p>${esc(L('勾选要显示的块；拖动画面中的块可调整顺序。设置按设备保存。', 'Pick visible blocks; drag blocks on the dashboard to reorder. Saved per device.'))}</p></div></div>
     <div class="ui-list">${rows}</div>`,
    `<span class="ui-summary">${esc(L('共 ', ''))}${DASH_BLOCKS.length}${esc(L(' 个块', ' blocks'))}</span>
     <button class="btn" data-close type="button">${esc(t('cancel'))}</button><button class="btn primary" data-save type="button">${esc(t('confirm'))}</button>`,
    (m) => {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-save]').onclick = () => {
        const hide = [...m.querySelectorAll('[data-block-toggle]')].filter((c) => !c.checked).map((c) => c.dataset.blockToggle);
        const order = [...document.querySelectorAll('[data-block]')].map((b) => b.dataset.block);
        localStorage.setItem(dashPrefsKey(), JSON.stringify({ order, hidden: hide }));
        closeModal(); renderDashboard();
      };
    });
}

function emptyRow(cols) { return `<tr><td colspan="${cols}" style="text-align:center;padding:36px;color:var(--muted)">${t('no_data')}</td></tr>`; }
function topTablePanel(id, title, sub, heads, block) {
  const numeric = new Set([t('rate_rx'), t('rate_tx'), t('total'), t('th_bytes'), L('流量', 'Bytes')]);
  return `<div class="panel"${block ? ` data-block="${esc(block)}"` : ''}><div class="panel-head"><div><h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p></div></div>
    <div class="table-scroll"><table><thead><tr>${heads.map((h, i) => `<th class="${numeric.has(h) || i === 0 ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody id="${id}Body"></tbody></table></div></div>`;
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
    <td><span class="tag blue">${esc(c.protocol)}</span></td><td class="num" title="${fmtBytes(c.bytes)}">${fmtBytesExact(c.bytes)}</td></tr>`).join('') || emptyRow(5);
}
function drawConnSpark() {
  const host = $('connSpark'); if (!host) return;
  if (!host.querySelector('#connCv')) host.innerHTML = '<canvas id="connCv"></canvas>';
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
      <div><h1>${t('stats_title')}</h1><p>${t('stats_sub')}</p></div>
      <div class="page-actions">${demoBadge('statsBadge')}</div>
    </div>
    <div class="stats-toolbar">
      <div class="stats-tool-row">
        <div class="tabs stats-tabs" id="statsTabs">
          ${Object.keys(STATS_RANGES).map((k) => `<button class="tab ${k === state.usageRange ? 'active' : ''}" data-range="${k}">${esc(STATS_RANGES[k].label())}</button>`).join('')}
        </div>
        <span class="stats-spacer"></span>
        <button class="btn btn-sm" id="statsCustomBtn">+ ${t('stats_custom_btn')}</button>
      </div>
      <div class="stats-tool-row">
        <span class="stats-label">${t('stats_scope')}</span>
        <div class="iface-chips" id="statsIfaceChips"></div>
      </div>
      <div class="stats-hint" id="statsScopeHint"></div>
    </div>
    <div class="iface-custom" id="statsCustom" hidden>
      <input type="text" id="statsCustomInput" placeholder="pppoe-*, vlan??">
      <span class="form-hint">${t('stats_iface_manual_hint')}</span>
      <button class="btn btn-sm primary" id="statsCustomSave">${t('save')}</button>
    </div>
    <div class="cards" id="statCards"></div>
    <div class="data-source" id="statsSource"></div>
    <div class="panel">
      <div class="panel-head"><div><h2>${t('stats_chart')}</h2><p class="sub" id="statsRangeLabel"></p></div>
        <div class="legend"><span><i style="background:var(--blue)"></i>${t('legend_rx')}</span><span><i style="background:var(--violet)"></i>${t('legend_tx')}</span></div></div>
      <div class="chart-wrap stats-chart"><canvas id="statsChart"></canvas><div class="tooltip" id="statsTip" hidden></div></div>
    </div>`;
  $('statsTabs').querySelectorAll('.tab').forEach((b) => b.onclick = () => {
    if (state.usageRange === b.dataset.range) return;
    state.usageRange = b.dataset.range;
    b.parentElement.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.range === state.usageRange));
    $('statsRangeLabel').textContent = STATS_RANGES[state.usageRange].series();
    refreshUsageData();   /* 按当前范围 + 当前网口重新取真实序列 */
  });
  $('statsCustomBtn').onclick = () => { const c = $('statsCustom'); c.hidden = !c.hidden; if (!c.hidden) $('statsCustomInput').focus(); };
  $('statsCustomSave').onclick = () => {
    const raw = $('statsCustomInput').value || '';
    const extra = raw.split(/[\n,，;；]+/).map((x) => x.trim()).filter(Boolean);
    const cur = (state.usageData && state.usageData.interfaces) || [];
    const names = [...new Set([...cur, ...extra])];
    if (!names.length && !(state.usageData && state.usageData.scope === 'all')) { toast(t('stats_iface_need_one'), 'err'); return; }
    saveUsageInterfaces(names);
  };
  $('statsRangeLabel').textContent = STATS_RANGES[state.usageRange].series();
  if (state.usageData && state.usageData.detailRange === state.usageRange) paintTrafficStats(state.usageData);
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
  paintUsageChips(d);
  const card = (label, bytes, cls, foot) => {
    const f = splitBytes(bytes);
    return `<div class="card ${cls}"><div class="card-label">${esc(label)}</div><div class="card-value">${f.v}<small>${f.u}</small></div><div class="card-foot">${esc(foot)}</div></div>`;
  };
  const rr = fmtRate(rate.rx), rt = fmtRate(rate.tx), rsum = fmtRate(rate.rx + rate.tx);
  cards.innerHTML =
    card(STATS_RANGES[range].label() + ' · ' + t('stats_card_rx'), val.rx, 'rx', t('stats_from_router'))
    + card(STATS_RANGES[range].label() + ' · ' + t('stats_card_tx'), val.tx, 'tx', t('stats_from_router'))
    + card(t('stats_card_sum'), val.rx + val.tx, 'ok', t('stats_from_router'))
    + `<div class="card warn"><div class="card-label">${t('stats_card_rate')}</div>
        <div class="card-value">${rate.real ? rsum.v : '—'}<small>${rate.real ? rsum.u : ''}</small></div>
        <div class="card-foot">${rate.real ? '↓ ' + rr.v + ' ' + rr.u + ' · ↑ ' + rt.v + ' ' + rt.u : esc(t('stats_source_fake'))}</div></div>`;
  const src = $('statsSource');
  if (src) {
    const real = !!d.dataReal, info = (k, n) => esc(t(k).replace('{n}', String(n)));
    src.className = 'data-source ' + (real ? 'real' : 'fake');
    src.innerHTML = `<span class="d"></span><b>${esc(real ? t('stats_source_real') : t('stats_source_fake'))}</b>
      <span>${esc(t('stats_updated'))} ${esc(fmtTime(d.ts))} · ${esc(t('stats_sample'))} ${d.sampleTs ? esc(fmtTime(d.sampleTs)) : esc(t('stats_no_sample'))}</span>
      ${d.resetNotice ? '<em>' + esc(t('stats_reset_notice')) + '</em>' : ''}
      ${d.migrated ? '<em>' + esc(t('stats_migrated')) + '</em>' : ''}
      ${d.resets ? '<em>' + info('stats_reset_info', d.resets) + '</em>' : ''}
      ${d.gaps ? '<em>' + info('stats_gap_info', d.gaps) + '</em>' : ''}`;
  }
  /* 趋势图严格取「当前范围」的序列；后端序列已按所选网口过滤 */
  const buckets = (d.series && d.series[range]) || [];
  const names = (d.interfaces || []).filter(Boolean);
  const scopeText = d.scope === 'custom' && names.length ? names.join(' / ') : t('stats_iface_all_short');
  $('statsRangeLabel').textContent = STATS_RANGES[range].series() + ' · ' + scopeText
    + (d.scope === 'custom' ? ' · ' + (Number(d.matched) || 0) + ' ' + t('stats_iface_unit') : '');
  drawBarChart('statsChart', 'statsTip', buckets, fmtBytes);
}
/* 统计网口多选：真实网口 + 自定义通配符，点击即时保存，无需弹窗 */
function paintUsageChips(d) {
  const box = $('statsIfaceChips'), hint = $('statsScopeHint');
  if (!box) return;
  const avail = d.available || [], sel = d.interfaces || [], all = d.scope !== 'custom';
  const sig = avail.map((i) => i.name).join('|') + '##' + sel.join('|') + '##' + (all ? '1' : '0');
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    const known = new Set(avail.map((i) => i.name));
    const manual = sel.filter((x) => /[*?]/.test(x) || !known.has(x));
    const chips = [`<button class="iface-chip${all ? ' active' : ''}" data-all="1" title="${esc(t('stats_iface_all'))}">${esc(t('stats_iface_all'))}</button>`];
    if (!avail.length) chips.push(`<span class="scope-meta">${esc(t('stats_iface_no_list'))}</span>`);
    for (const i of avail) {
      const on = sel.includes(i.name);
      chips.push(`<label class="iface-chip${on ? ' active' : ''}" title="${esc(i.comment || i.name)}${i.type ? ' · ' + esc(i.type) : ''}">
        <input type="checkbox" data-name="${esc(i.name)}" ${on ? 'checked' : ''}><span>${esc(i.name)}</span></label>`);
    }
    for (const x of manual) chips.push(`<button class="iface-chip active custom" data-remove="${esc(x)}" title="${esc(t('stats_iface_manual'))}">${esc(x)} ✕</button>`);
    box.innerHTML = chips.join('');
    box.querySelectorAll('[data-all]').forEach((el) => el.onclick = () => saveUsageInterfaces([]));
    box.querySelectorAll('[data-remove]').forEach((el) => el.onclick = () => saveUsageInterfaces(sel.filter((x) => x !== el.dataset.remove)));
    box.querySelectorAll('input[data-name]').forEach((el) => el.onchange = () => {
      const name = el.dataset.name;
      const next = el.checked ? [...sel.filter((x) => x !== name), name] : sel.filter((x) => x !== name);
      saveUsageInterfaces(next);
    });
  }
  if (hint) hint.innerHTML = `<span>${esc(t('stats_iface_tip'))}</span>
    <span class="tag">${esc(t('stats_iface_matched'))} ${Number(d.matched) || 0} ${esc(t('stats_iface_unit'))}</span>
    ${all ? '' : `<span class="tag">${esc(t('stats_iface_custom'))}</span>`}`;
}
async function saveUsageInterfaces(names) {
  const seq = ++state.usageSeq;
  try {
    const r = await api('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interfaces: names, range: state.usageRange }) });
    if (seq !== state.usageSeq) return;
    state.usageData = r;
    if (state.section === 'trafficStats') paintTrafficStats(r);
    const c = $('statsCustomInput'); if (c) c.value = '';
    toast(t('stats_iface_saved'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
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
      ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.textBaseline = 'top';
      ctx.textAlign = cx < pad.l + 28 ? 'left' : cx > pad.l + pw - 28 ? 'right' : 'center';
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
  /* 悬停重绘时只在尺寸真正变化时才改画布位图，固定 CSS 尺寸，避免整块图抖动 */
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  /* CSS 尺寸交给样式表的 100% 控制，绝不写死像素：自适应高度的容器（连接线图）
     写死像素会被 canvas 反向撑大，悬停/滚动重绘时形成反馈循环导致图片被不断拉长。 */
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
  ctx.textBaseline = 'top';
  const labels = Math.min(5, data.length);
  for (let i = 0; i < labels; i++) {
    const idx = Math.round(i / Math.max(1, labels - 1) * (data.length - 1));
    const x = pad.l + pw * idx / Math.max(1, data.length - 1);
    ctx.textAlign = i === 0 ? 'left' : i === labels - 1 ? 'right' : 'center';
    ctx.fillStyle = cssVar('--axis', '#9aa5bd'); ctx.fillText(fmtTime(data[idx].ts), x, pad.t + ph + 7);
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
