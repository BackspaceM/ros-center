'use strict';
/* IP 流量监控：展示拓扑中开启了「按 IP 实时测速」的节点，每秒刷新上下行速率。
   数据来自服务端连接表聚合（/api/ip-rates），不改路由器配置。 */
(function () {
  let timer = null, history = new Map(), lastRows = [];
  let iconById = new Map(), iconByIp = new Map();
  let order = [], dragIp = '', dragging = false;
  const orderKey = () => 'rosCenter.ipmOrder.' + (state.deviceId || '');
  function readOrder() { try { return JSON.parse(localStorage.getItem(orderKey())) || []; } catch (e) { return []; } }
  function saveOrder() { try { localStorage.setItem(orderKey(), JSON.stringify(order)); } catch (e) { /* ignore */ } }
  function ensureOrder(rows) {
    const known = new Set(order.map(String));
    for (const r of rows) { const k = String(r.ip); if (!known.has(k)) { order.push(k); known.add(k); } }
    order = order.filter((k) => rows.some((r) => String(r.ip) === String(k)));
  }
  function sortRows(rows) {
    const rank = new Map(order.map((k, i) => [String(k), i]));
    return rows.slice().sort((a, b) => {
      const ai = rank.has(String(a.ip)) ? rank.get(String(a.ip)) : 1e9;
      const bi = rank.has(String(b.ip)) ? rank.get(String(b.ip)) : 1e9;
      return ai - bi;
    });
  }

  /* 复用网络拓扑里上传的设备图标：优先按节点 id，再按 IP，避免 IP 写错时串台 */
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

  function rate(bps) {
    const r = typeof fmtBytesRate === 'function' ? fmtBytesRate(bps || 0) : { v: '0', u: 'B/s' };
    return { v: r.v, u: r.u };
  }
  function bytes(n) {
    n = Number(n) || 0;
    if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }
  function sparkline(vals, color) {
    if (!vals.length) return '';
    const max = Math.max(1, ...vals);
    const pts = vals.slice(-40).map((v, i, a) => {
      const x = 100 / Math.max(1, a.length - 1) * i;
      const y = 30 - (v / max) * 26;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return `<svg class="ipm-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }
  function card(r) {
    const key = r.ip, h = history.get(key) || { rx: [], tx: [] };
    const rx = rate(r.rxBps), tx = rate(r.txBps);
    const icon = iconFor(r);
    return `<article class="ipm-card" data-ip="${esc(r.ip)}">
      <div class="ipm-card-head">
        <span class="ipm-drag" draggable="true" data-drag-ip="${esc(r.ip)}" title="${esc(L('拖动排序', 'Drag to reorder'))}">⠿</span>
        <span class="ipm-dot${(r.rxBps || r.txBps) ? ' live' : ''}"></span>
        <div class="ipm-card-title"><b>${icon ? `<img class="ipm-icon" src="${esc(icon)}" alt="" loading="lazy">` : ''}${esc(r.name || r.ip)}</b><small>${esc(r.ip)}</small></div>
        <button class="ipm-edit" type="button" data-ip-edit="${esc(r.id)}" title="${esc(L('在网络拓扑中编辑', 'Edit in topology'))}">✎</button>
      </div>
      <div class="ipm-rates">
        <div class="ipm-rate down"><small>↓ ${esc(L('下行', 'Download'))}</small><strong>${esc(rx.v)}<em>${esc(rx.u)}</em></strong></div>
        <div class="ipm-rate up"><small>↑ ${esc(L('上行', 'Upload'))}</small><strong>${esc(tx.v)}<em>${esc(tx.u)}</em></strong></div>
      </div>
      <div class="ipm-sparks">
        <div>${sparkline(h.rx, 'var(--blue)')}</div>
        <div>${sparkline(h.tx, 'var(--violet)')}</div>
      </div>
      <div class="ipm-card-foot"><span>${esc(L('累计', 'Total'))} ↓ ${bytes(r.rxBytes)}</span><span>↑ ${bytes(r.txBytes)}</span></div>
    </article>`;
  }
  function bindCards(box) {
    box.querySelectorAll('.ipm-drag').forEach((h) => {
      h.ondragstart = (e) => {
        dragIp = String(h.dataset.dragIp || ''); dragging = true;
        e.dataTransfer.effectAllowed = 'move';
        h.closest('.ipm-card').classList.add('dragging');
      };
      h.ondragend = () => {
        dragging = false; dragIp = '';
        box.querySelectorAll('.ipm-card').forEach((c) => c.classList.remove('dragging', 'over'));
      };
    });
    box.querySelectorAll('.ipm-card').forEach((card) => {
      card.ondragover = (e) => { if (!dragIp) return; e.preventDefault(); card.classList.add('over'); };
      card.ondragleave = () => card.classList.remove('over');
      card.ondrop = (e) => {
        e.preventDefault(); card.classList.remove('over');
        const to = String(card.dataset.ip || '');
        const from = order.indexOf(dragIp), dest = order.indexOf(to);
        if (from >= 0 && dest >= 0 && from !== dest) {
          order.splice(from, 1); order.splice(dest, 0, dragIp); saveOrder();
          box.innerHTML = sortRows(lastRows).map(cardHtml).join('');
          bindCards(box);
        }
      };
    });
  }
  const cardHtml = card;
  function render(d) {
    const rows = (d && d.rows) || [];
    ensureOrder(rows);
    for (const r of rows) {
      const h = history.get(r.ip) || { rx: [], tx: [] };
      h.rx.push(Number(r.rxBps) || 0); h.tx.push(Number(r.txBps) || 0);
      if (h.rx.length > 60) h.rx.shift();
      if (h.tx.length > 60) h.tx.shift();
      history.set(r.ip, h);
    }
    const alive = new Set(rows.map((r) => r.ip));
    for (const k of [...history.keys()]) if (!alive.has(k)) history.delete(k);
    lastRows = rows;
    const box = $('ipmGrid'); if (!box) return;
    const empty = $('ipmEmpty'); if (empty) empty.hidden = rows.length > 0;
    box.innerHTML = sortRows(rows).map(cardHtml).join('');
    bindCards(box);
    box.querySelectorAll('[data-ip-edit]').forEach((b) => {
      b.onclick = () => { navigate('topology'); setTimeout(() => { if (typeof window.openTopologyEditorById === 'function') window.openTopologyEditorById(b.dataset.ipEdit); }, 250); };
    });
    const st = $('ipmStatus');
    if (st) {
      st.textContent = d && d.deviceName ? d.deviceName : '';
      st.classList.toggle('ipm-err', !!(d && d.error));
      st.title = d && d.error ? String(d.error) : '';
    }
    const eb = $('ipmError');
    if (eb) {
      eb.hidden = !(d && d.error);
      if (d && d.error) eb.textContent = String(d.error);
    }
  }
  async function refresh() {
    try { const d = await api('/api/ip-rates'); if (!dragging) render(d); }
    catch (e) { const st = $('ipmStatus'); if (st) st.textContent = e.message || ''; }
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  window.renderIpMonitorPage = function renderIpMonitorPage() {
    stop();
    $('content').innerHTML = `
      <div class="page-head">
        <div><h1>${esc(L('IP 流量监控', 'IP traffic monitor'))}</h1>
          <p>${esc(L('实时显示网络拓扑中开启了 IP 测速的设备上下行速率，每秒刷新。', 'Live up/down rates for topology devices with IP monitoring enabled, refreshed every second.'))}</p></div>
        <div class="page-actions"><span class="tag" id="ipmStatus">—</span>
          <button class="btn" id="ipmTopo" type="button">${esc(L('在网络拓扑中设置', 'Configure in topology'))}</button></div>
      </div>
      <div class="ipm-note">${esc(L('只有在网络拓扑的设备编辑里勾选「按 IP 实时测速」并填写 IP 才会显示在这里；默认全部关闭，不增加路由器配置负担。', 'Only devices with "Live rate by IP" enabled and a valid IP in the topology editor appear here. Off by default; no router configuration changes.'))}</div>
      <div class="ipm-error" id="ipmError" hidden></div>
      <div class="ipm-grid" id="ipmGrid"></div>
      <div class="empty" id="ipmEmpty" hidden>${esc(L('暂无设备开启 IP 测速。请到网络拓扑中编辑设备，填写 IP 并勾选「按 IP 实时测速」。', 'No devices with IP monitoring yet. Edit a device in the topology, enter its IP and enable "Live rate by IP".'))}</div>`;
    $('ipmTopo').onclick = () => navigate('topology');
    order = readOrder();
    loadIcons().then(refresh);
    timer = setInterval(refresh, 1000);
  };
  /* 离开页面时停止轮询 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (state.section === 'ipMonitor' && !timer) { refresh(); timer = setInterval(refresh, 1000); }
  });
})();
