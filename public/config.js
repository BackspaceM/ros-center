'use strict';

/* ================= 配置表格页 ================= */
/* Tauri 桌面壳：通过底层 IPC 调用 Rust 命令（零 npm 依赖） */
function isTauriDesktop() { return !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke); }
function tauriInvoke(cmd, args) {
  if (!isTauriDesktop()) return Promise.reject(new Error('非桌面版环境'));
  return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
}
/* MAC 列不再做 OUI 厂商猜测：直接复用网络拓扑里给该设备上传的图标。
   按 MAC → IP → 名称 依次匹配，自动发现节点带出 MAC，手工节点可填 MAC。 */
const macKeyOf = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-F]/g, '');
const ipKeyOf = (v) => String(v == null ? '' : v).split('/')[0].trim();
const nameKeyOf = (v) => String(v == null ? '' : v).toLowerCase().trim();
let topoIconLookup = { device: '', at: 0, byMac: new Map(), byIp: new Map(), byName: new Map() };
/* DHCP 租约复用拓扑设备的实时上下行：按 IP / 接口建速率索引，随配置表自动刷新 */
let leaseRates = { device: '', at: 0, byIp: new Map(), byIface: new Map() };
/* DHCP 服务端下拉选项：从当前连接路由的 /ip/dhcp-server 读取 name，短缓存 */
let dhcpServerCache = { device: '', at: 0, names: [] };
async function loadDhcpServers() {
  const dev = state.deviceId || '';
  if (dhcpServerCache.device === dev && Date.now() - dhcpServerCache.at < 30000) return dhcpServerCache.names;
  try {
    const d = await api('/api/config?section=dhcpServers');
    dhcpServerCache = { device: dev, at: Date.now(), names: (d.rows || []).map((r) => String(r.name || '')).filter(Boolean) };
  } catch (e) { dhcpServerCache = { device: dev, at: Date.now(), names: [] }; }
  return dhcpServerCache.names;
}

async function loadTopoIcons(sec) {
  const need = (sec.fields || []).some((f) => /mac[-_]?address/i.test(f.key));
  if (!need) { topoIconLookup = { device: '', at: 0, byMac: new Map(), byIp: new Map(), byName: new Map() }; return; }
  const dev = state.deviceId || '';
  if (topoIconLookup.device === dev && Date.now() - topoIconLookup.at < 60000) return;
  const byMac = new Map(), byIp = new Map(), byName = new Map();
  try {
    const d = await api('/api/topology');
    const all = new Map();
    for (const n of (d.auto || [])) all.set(n.id, n);
    for (const n of (d.custom || [])) { if (n.deleted) all.delete(n.id); else all.set(n.id, n); }
    for (const n of all.values()) {
      /* 无论是否上传图标都建索引：设备名匹配只依赖节点，图标是独立的可选字段 */
      const mk = macKeyOf(n.mac); if (mk) byMac.set(mk, n);
      const ip = ipKeyOf(n.ip); if (ip) byIp.set(ip, n);
      const name = nameKeyOf(n.name); if (name) byName.set(name, n);
    }
  } catch (e) { /* 拓扑暂不可用：表格只显示纯 MAC，不影响配置页 */ }
  topoIconLookup = { device: dev, at: Date.now(), byMac, byIp, byName };
}

function topoNodeFor(row, mac) {
  const lk = topoIconLookup;
  let n = null;
  /* 拓扑里的 IP 是权威锚点：静态分配 / 无 MAC 的租约靠 IP 也能对上设备名 */
  if (row) {
    const ip = ipKeyOf(row.address || row['src-address'] || row.ip || row['dst-address']);
    if (ip) n = lk.byIp.get(ip);
  }
  if (!n) n = lk.byMac.get(macKeyOf(mac));
  if (!n && row) {
    for (const k of ['host-name', 'identity', 'name']) {
      const key = nameKeyOf(row[k]);
      if (key && lk.byName.has(key)) { n = lk.byName.get(key); break; }
    }
  }
  return n || null;
}
/* MAC 列的图标仍以 MAC 为第一优先，避免设备名列的 IP 优先策略把图标串到别的设备 */
function topoNodeForMac(row, mac) {
  const lk = topoIconLookup;
  let n = lk.byMac.get(macKeyOf(mac));
  if (!n && row) {
    const ip = ipKeyOf(row.address || row['src-address'] || row.ip);
    if (ip) n = lk.byIp.get(ip);
  }
  if (!n && row) {
    for (const k of ['host-name', 'identity', 'name']) {
      const key = nameKeyOf(row[k]);
      if (key && lk.byName.has(key)) { n = lk.byName.get(key); break; }
    }
  }
  return n || null;
}
function topoIconFor(row, mac) {
  const n = topoNodeForMac(row, mac);
  return n && n.icon ? { url: n.icon, name: n.name } : null;
}

/* ---------- 表头字段：可增删、排序、按分类+设备记忆 ---------- */
const DHCP_DNS_SECTIONS = new Set(['dhcpNetworks', 'dhcpLeases', 'dhcpServers', 'dhcpClients', 'dhcpOptions', 'dhcpOptionSets', 'dns', 'dnsStatic']);
const showRowNum = (sec) => !sec || !DHCP_DNS_SECTIONS.has(sec.id);
/* DHCP 租约列结构改为「设备 + 地址 + MAC + 状态 + 主机名」，用版本后缀作一次性迁移 */
const colsKey = (sec) => 'rosCenter.cols.' + (state.deviceId || '') + '.' + sec.id + (sec.id === 'dhcpLeases' ? '.v2' : '');
function availableColumns(sec) {
  const keys = (sec.fields || []).map((f) => f.key).filter((k) => k !== '.id');
  /* DHCP 租约首列直接用 RouterOS comment + 设备图标，不再提供「设备名」列 */
  if (sec.id !== 'dhcpLeases' && (sec.fields || []).some((f) => /mac[-_]?address/i.test(f.key)) && !keys.includes('topoName')) keys.push('topoName');
  /* DHCP 租约：可复用拓扑设备的实时上下行与设备类型（RouterOS 无此字段） */
  if (sec.id === 'dhcpLeases') for (const k of ['topoType', 'rateUp', 'rateDown']) if (!keys.includes(k)) keys.push(k);
  return keys;
}
function visibleColumns(sec) {
  const all = availableColumns(sec);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(colsKey(sec))); } catch (e) { /* ignore */ }
  /* 设计稿列顺序由前端兜底，服务端 catalog.js 尚未重启时也立即生效 */
  const fallback = sec.id === 'dhcpLeases' ? ['comment', 'address', 'mac-address', 'status', 'host-name'] : (sec.columns || all);
  const picked = (Array.isArray(saved) && saved.length ? saved : fallback)
    .filter((k) => all.includes(k));
  return picked.length ? picked : all.slice(0, 5);
}
function openColumnSettings(sec) {
  const all = availableColumns(sec), cur = visibleColumns(sec);
  const order = [...cur, ...all.filter((k) => !cur.includes(k))];
  let checked = new Set(cur);
  const isLease = sec && sec.id === 'dhcpLeases';
  const intro = `<div class="lease-intro ui-intro">
    <div class="lease-intro-icon ui-intro-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg></div>
    <div><b>${esc(L('表头字段', 'Table columns'))}</b><p>${esc(L('勾选要显示的字段；要调整顺序，请直接在表格上拖动表头。设置按当前设备与分类保存。', 'Pick visible columns; drag the table headers directly to reorder. Saved per device and section.'))}</p></div>
  </div>`;
  const toolbar = `<div class="picker-toolbar"><div class="picker-search"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input type="text" id="colSearch" placeholder="${esc(L('搜索字段…', 'Search fields…'))}"></div>
    <div class="picker-quick"><button class="btn btn-sm" type="button" id="colAll">${esc(L('全选', 'Select all'))}</button><button class="btn btn-sm" type="button" id="colNone">${esc(L('全不选', 'None'))}</button></div></div>`;
  const listHtml = isLease
    ? `<div class="col-gradio">${order.map((k) => `<label class="col-gcard ui-row${checked.has(k) ? ' checked' : ''}" data-name="${esc(fieldLabel(sec, k) + ' ' + k).toLowerCase()}"><input type="checkbox" class="col-chk" data-col="${esc(k)}" ${checked.has(k) ? 'checked' : ''}><span>${esc(fieldLabel(sec, k))}</span><small>${esc(k)}</small></label>`).join('')}</div>`
    : `<div class="col-editor-list">${order.map((k) => `<div class="col-editor-row ui-row" data-name="${esc(fieldLabel(sec, k) + ' ' + k).toLowerCase()}"><label><input type="checkbox" class="col-chk" data-col="${esc(k)}" ${checked.has(k) ? 'checked' : ''}><span>${esc(fieldLabel(sec, k))}</span><small>${esc(k)}</small></label></div>`).join('')}</div>`;
  const bodyHtml = isLease
    ? intro + toolbar + listHtml
    : `<div class="col-editor"><p class="col-editor-tip">${esc(L('勾选要显示的字段；要调整顺序，请直接在表格上拖动表头。设置按当前设备与分类保存。', 'Pick visible columns; drag the table headers directly to reorder. Saved per device and section.'))}</p>${toolbar}${listHtml}</div>`;
  openModal(L('表头字段', 'Table columns'), bodyHtml,
    `<button class="btn" data-reset type="button">${esc(L('恢复默认', 'Reset'))}</button><button class="btn" data-close type="button">${esc(t('cancel'))}</button><button class="btn primary" data-save type="button">${esc(t('confirm'))}</button>`,
    (m) => {
      m.querySelectorAll('[data-col]').forEach((c) => {
        c.onchange = () => { c.checked ? checked.add(c.dataset.col) : checked.delete(c.dataset.col); if (isLease) c.closest('.col-gcard').classList.toggle('checked', c.checked); };
      });
      const cs = m.querySelector('#colSearch');
      if (cs) cs.oninput = () => {
        const q = cs.value.trim().toLowerCase();
        m.querySelectorAll(isLease ? '.col-gcard' : '.col-editor-row').forEach((el) => { el.style.display = !q || el.dataset.name.includes(q) ? '' : 'none'; });
      };
      const ca = m.querySelector('#colAll'), cn = m.querySelector('#colNone');
      if (ca) ca.onclick = () => { m.querySelectorAll('[data-col]').forEach((c) => { c.checked = true; c.onchange(); }); };
      if (cn) cn.onclick = () => { m.querySelectorAll('[data-col]').forEach((c) => { c.checked = false; c.onchange(); }); };
      m.querySelector('[data-reset]').onclick = () => {
        localStorage.removeItem(colsKey(sec)); closeModal(); renderConfigPage(sec);
      };
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-save]').onclick = () => {
        const keys = order.filter((k) => checked.has(k));
        if (!keys.length) { toast(L('至少保留一列', 'Keep at least one column'), 'err'); return; }
        localStorage.setItem(colsKey(sec), JSON.stringify(keys));
        closeModal(); renderConfigPage(sec);
      };
    });
}

/* 表头直接拖动排序：所有配置表通用，顺序按设备+分类保存 */
function bindHeaderDrag(sec) {
  const head = document.querySelector('thead tr'); if (!head) return;
  let dragKey = '';
  const ths = [...head.querySelectorAll('th[data-sort]')].filter((th) => th.dataset.sort !== '#');
  ths.forEach((th) => {
    th.classList.add('th-draggable'); th.draggable = true;
    th.ondragstart = (e) => { dragKey = th.dataset.sort; e.dataTransfer.effectAllowed = 'move'; th.classList.add('dragging'); };
    th.ondragend = () => { dragKey = ''; document.querySelectorAll('th.dragging, th.th-over').forEach((x) => x.classList.remove('dragging', 'th-over')); };
    th.ondragover = (e) => { if (!dragKey || dragKey === th.dataset.sort) return; e.preventDefault(); th.classList.add('th-over'); };
    th.ondragleave = () => th.classList.remove('th-over');
    th.ondrop = (e) => {
      e.preventDefault(); th.classList.remove('th-over');
      const target = th.dataset.sort;
      if (!dragKey || dragKey === target) return;
      const cols = visibleColumns(sec).filter((k) => k !== '.id');
      const from = cols.indexOf(dragKey), to = cols.indexOf(target);
      if (from < 0 || to < 0) return;
      cols.splice(from, 1); cols.splice(to, 0, dragKey);
      localStorage.setItem(colsKey(sec), JSON.stringify(cols));
      dragKey = ''; renderConfigPage(sec);
    };
  });
}

/* DHCP 租约：拉取拓扑开启 IP 测速的节点速率 + 接口实时速率，供「上行/下行」列复用 */
async function loadLeaseRates(sec) {
  if (sec.id !== 'dhcpLeases') return;
  const dev = state.deviceId || '';
  if (leaseRates.device === dev && Date.now() - leaseRates.at < 1200) return;
  const [ipd, snap] = await Promise.all([
    api('/api/ip-rates').catch(() => ({ rows: [] })),
    api('/api/snapshot').catch(() => ({ ifaces: [] })),
  ]);
  const byIp = new Map(), byIface = new Map();
  for (const r of (ipd.rows || [])) byIp.set(ipKeyOf(r.ip), { rxBps: r.rxBps || 0, txBps: r.txBps || 0 });
  for (const i of (snap.ifaces || [])) byIface.set(String(i.name || ''), { rxBps: i.rxBps || 0, txBps: i.txBps || 0 });
  leaseRates = { device: dev, at: Date.now(), byIp, byIface };
}
function leaseRateFor(row) {
  const n = topoNodeFor(row, row['mac-address']);
  if (!n) return null;
  if (n.ipRate && n.ip) return leaseRates.byIp.get(ipKeyOf(n.ip)) || null;
  for (const k of [n.iface, n.parentPort]) {
    const key = String(k || '').trim(); if (!key) continue;
    const r = leaseRates.byIface.get(key);
    if (r && (r.rxBps || r.txBps)) return r;
  }
  return null;
}
async function loadRows(sec) {
  const d = await api('/api/config?section=' + encodeURIComponent(sec.id));
  state.rows = d.rows || []; state.configDemo = !!d.demo; state.configOffline = !!d.offline;
  if (sec.id === 'connections') state.connRows = state.rows;
  await Promise.all([loadTopoIcons(sec), loadLeaseRates(sec)]);
  return state.rows;
}
/* 只保留 demo 提示；LIVE / OFFLINE 徽标不再显示 */
function syncConfigTag() {
  const el = $('cfgModeTag') || $('sioModeTag'); if (!el) return;
  const demo = state.configDemo || state.mode === 'demo';
  el.hidden = !demo;
  el.textContent = t('demo_only');
  el.className = 'badge-demo';
}

function renderConfigPage(sec) {
  const cols = visibleColumns(sec).filter((c) => c !== '.id');
  const writable = sec.writable !== false;
  $('content').className = 'content cfg-page cfg-' + sec.id;
  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${esc(tx(sec.title))}</h1><p>${esc(sec.path || '')}${!writable ? ' · ' + t('readonly_tip') : ''}</p></div>
      <div class="page-actions">
        <button class="btn" id="btnCols" type="button" title="${esc(L('增删与排序表头字段', 'Add/remove and reorder table columns'))}">☷ ${esc(L('列设置', 'Columns'))}</button>
        ${writable ? `<button class="btn primary" id="btnAdd">+ ${t('add')}</button>` : ''}
        ${writable && sec.runAction ? `<button class="btn" id="btnRun">▶ ${t('run_script')}</button>` : ''}
        ${writable && !sec.runAction && sec.toggle !== false ? `<button class="btn" id="btnEnable">${t('enable')}</button><button class="btn" id="btnDisable">${t('disable')}</button>` : ''}
        ${writable ? `<button class="btn ghost-danger" id="btnDelete">${t('delete')}</button>` : ''}
      </div>
    </div>
    ${state.configDemo ? `<div class="card" style="margin-bottom:14px;padding:10px 14px;font-size:11.5px;color:var(--muted);background:var(--soft);border:1px solid var(--line)"><span class="tag amber" style="margin-right:8px">DEMO</span>${t('demo_mode_tip')}</div>` : ''}
    ${sec.id === 'dhcpLeases' ? `<div class="scope-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span>${esc(L('说明：此处速率仅统计经过路由器的外部流量；设备间二层内网直连（如本机 ↔ NAS）不经过路由器，因此不计入。', 'Note: the rates shown here cover only external traffic passing through the router. Layer-2 LAN transfers between devices (e.g. local ↔ NAS) bypass the router and are not counted.'))}</span></div>` : ''}
    <div class="panel">
      <div class="table-tools">
        <input type="search" id="rowSearch" placeholder="${t('search')}…" value="${esc(state.rowFilter)}">
        <span class="tag" id="rowCount">0 ${t('rows')}</span>
        <span class="spacer"></span>
        ${demoBadge('cfgModeTag')}
      </div>
      <div class="table-scroll"><table><thead><tr>
        ${writable ? '<th style="width:36px"><input type="checkbox" class="check" id="checkAll"></th>' : ''}
        ${showRowNum(sec) ? `<th class="sortable" data-sort="#" style="width:64px" title="${t('sort_hint')}">${t('seq')}</th>` : ''}
        ${cols.filter((c) => c !== '.id').map((c) => `<th class="sortable${numCol(c, sec) ? ' num' : ''}${(state.sort || {}).key === c ? ' sorted' : ''}" data-sort="${esc(c)}" title="${t('sort_hint')}">${esc(fieldLabel(sec, c))}${sortMark(c)}</th>`).join('')}
        ${writable ? `<th style="width:${sec.id === 'wireguard' || sec.id === 'wgPeers' ? 142 : 110}px"></th>` : ''}
      </tr></thead><tbody id="tbody"></tbody></table></div>
      <div class="pager"><span id="pageInfo"></span><button id="prevPage">${t('prev')}</button><button id="nextPage">${t('next')}</button></div>
    </div>`;

  $('btnCols').onclick = () => openColumnSettings(sec);
  if (writable) {
    $('btnAdd').onclick = () => openForm(sec, null);
    if (sec.runAction) {
      $('btnRun').onclick = () => {
        const ids = [...state.selectedIds];
        if (!ids.length) { toast(t('run_script_none'), 'err'); return; }
        confirmModal(t('run_script'), t('run_script_confirm').replace('{n}', String(ids.length)), true, () => bulk(sec, 'run'));
      };
    } else {
      if ($('btnEnable')) $('btnEnable').onclick = () => bulk(sec, 'enable');
      if ($('btnDisable')) $('btnDisable').onclick = () => bulk(sec, 'disable');
    }
    $('btnDelete').onclick = () => confirmModal(t('confirm_delete'), `<b>${t('confirm_delete_msg')}</b><br><br>${t('selected')}: <b>${state.selectedIds.size}</b> ${t('row_one')}`, true,
      () => bulk(sec, 'remove'));
  }
  $('rowSearch').oninput = (e) => { state.rowFilter = e.target.value; state.page = 1; renderRows(sec); };
  $('content').querySelectorAll('th[data-sort]').forEach((th) => th.onclick = () => {
    const key = th.dataset.sort;
    if (state.sort && state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { key, dir: 'asc' };
    state.page = 1; renderRows(sec);
  });
  bindHeaderDrag(sec);
  const ca = $('checkAll'); if (ca) ca.onchange = (e) => {
    const rows = sortedRows(sec);
    rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize).forEach((r) => e.target.checked ? state.selectedIds.add(r['.id']) : state.selectedIds.delete(r['.id']));
    renderRows(sec);
  };
  $('prevPage').onclick = () => { if (state.page > 1) { state.page--; renderRows(sec); } };
  $('nextPage').onclick = () => { if (state.page < Math.max(1, Math.ceil(sortedRows(sec).length / state.pageSize))) { state.page++; renderRows(sec); } };
  loadRows(sec).then(() => { syncConfigTag(); renderRows(sec); }).catch((e) => { $('tbody').innerHTML = `<tr><td colspan="20" class="empty">${t('load_fail')}: ${esc(e.message)}</td></tr>`; });
}

/* 单例配置（DNS / 设备标识 / 时钟 / NTP）：只展示一组参数，避免误用新增/删除 */
function renderSingletonPage(sec) {
  const writable = sec.writable !== false;
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${esc(tx(sec.title))}</h1><p>${esc(sec.path || '')}</p></div>
      <div class="page-actions">
        ${writable ? `<button class="btn primary" id="sioEdit">${t('edit')}</button>` : ''}
      </div></div>
    ${state.configDemo ? `<div class="card" style="margin-bottom:14px;padding:10px 14px;font-size:11.5px;color:var(--muted);background:var(--soft);border:1px solid var(--line)"><span class="tag amber" style="margin-right:8px">DEMO</span>${t('demo_mode_tip')}</div>` : ''}
    <div class="panel"><div class="panel-head"><div><h2>${esc(tx(sec.title))}</h2><p class="sub">${t('singleton_hint')}</p></div>
      ${demoBadge('sioModeTag')}</div>
      <div class="panel-body"><div class="kv-grid" id="sioBody"><div class="empty">${t('loading')}</div></div></div></div>`;
  const edit = $('sioEdit'); if (edit) edit.onclick = () => openForm(sec, state.rows[0] || null);
  loadRows(sec).then(() => { syncConfigTag(); paintSingletonBody(sec); })
    .catch((e) => { const box = $('sioBody'); if (box) box.innerHTML = `<div class="empty">${t('load_fail')}: ${esc(e.message)}</div>`; });
}
/* 自动刷新单例页时只重画键值区，不重建整页（不丢编辑焦点） */
function paintSingletonBody(sec) {
  const box = $('sioBody'); if (!box) return;
  const row = state.rows[0] || {};
  const fields = sec.fields.filter((f) => f.key !== '.id' && f.type !== 'id');
  box.innerHTML = fields.map((f) => {
    const v = row[f.key];
    let shown = v == null || v === '' ? '—' : String(v);
    if (f.type === 'password' || /key/i.test(f.key)) shown = '••••••••';
    else if (f.type === 'bool') shown = boolOn(v) ? t('enabled') : t('disabled');
    return `<div class="kv-item"><div class="kv-label">${esc(tx(f.label))}</div><div class="kv-value" title="${esc(shown)}">${esc(shown)}</div></div>`;
  }).join('');
}

function numCol(key, sec) { return /mac[-_]?address|bytes|port|mtu|distance|priority|time$|count|^rate(Up|Down)$/i.test(key) && sec.fields.find((f) => f.key === key)?.type !== 'bool'; }
function fieldLabel(sec, key) {
  if (key === 'running') return L('运行', 'Running');
  if (key === '.id') return 'ID';
  if (key === 'topoName') return L('设备名', 'Device name');
  if (key === 'comment' && sec && sec.id === 'dhcpLeases') return L('设备', 'Device');
  if (key === 'topoType') return L('设备类型', 'Device type');
  if (key === 'rateUp') return L('上行', 'Upload');
  if (key === 'rateDown') return L('下行', 'Download');
  const f = sec.fields.find((x) => x.key === key);
  return f ? tx(f.label) : key;
}
function filteredRows(sec) {
  const f = state.rowFilter.trim().toLowerCase();
  if (!f) return state.rows;
  return state.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(f)));
}
/* RouterOS 的 .id 是十六进制（*1、*A…），展示为十进制序号更易读 */
function idNum(v) {
  const s = String(v == null ? '' : v).replace(/^\*/, '');
  return /^[0-9a-fA-F]+$/.test(s) ? parseInt(s, 16) : NaN;
}
function cmpVal(a, b, key) {
  if (key === '#') {
    const x = idNum(a['.id']), y = idNum(b['.id']);
    if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
    return String(a['.id'] || '').localeCompare(String(b['.id'] || ''), undefined, { numeric: true });
  }
  const sx = String(a[key] == null ? '' : a[key]), sy = String(b[key] == null ? '' : b[key]);
  if (/^(true|false)$/.test(sx) || /^(true|false)$/.test(sy)) return Number(boolOn(sx)) - Number(boolOn(sy)) || sx.localeCompare(sy);
  if (/^-?\d+(\.\d+)?$/.test(sx) && /^-?\d+(\.\d+)?$/.test(sy)) return Number(sx) - Number(sy);
  return sx.localeCompare(sy, undefined, { numeric: true });
}
function sortedRows(sec) {
  const rows = filteredRows(sec).slice();
  const s = state.sort || { key: '#', dir: 'asc' };
  rows.sort((a, b) => { const c = cmpVal(a, b, s.key); return s.dir === 'asc' ? c : -c; });
  return rows;
}
function sortMark(key) {
  const s = state.sort || {};
  return s.key === key ? `<span class="sort-ind">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
}
function renderRows(sec) {
  const cols = visibleColumns(sec).filter((c) => c !== '.id');
  const writable = sec.writable !== false;
  const rows = sortedRows(sec);
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('rowCount').textContent = rows.length + ' ' + t('rows');
  $('pageInfo').textContent = `${t('page')} ${state.page} ${t('of')} ${totalPages}`;
  $('prevPage').disabled = state.page <= 1; $('nextPage').disabled = state.page >= totalPages;
  const tb = $('tbody'); if (!tb) return;
  tb.innerHTML = pageRows.map((r, ri) => {
    const rowno = (state.page - 1) * state.pageSize + ri + 1;
    return `<tr data-id="${esc(r['.id'])}" title="RouterOS .id: ${esc(r['.id'])}" class="${state.selectedIds.has(r['.id']) ? 'selected' : ''}">
    ${writable ? `<td><input type="checkbox" class="check rowcheck" data-id="${esc(r['.id'])}" ${state.selectedIds.has(r['.id']) ? 'checked' : ''}></td>` : ''}
    ${showRowNum(sec) ? `<td class="num rownum">${rowno}</td>` : ''}
    ${cols.map((c) => {
      const html = cellHtml(r, c, sec);
      const blank = html === '' || html === '—' || html === '<span class="muted-cell">—</span>';
      const cls = [numCol(c, sec) ? 'num' : '', blank ? 'is-empty' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''} data-label="${esc(fieldLabel(sec, c))}">${html}</td>`;
    }).join('')}
    ${writable ? `<td class="row-actions-cell"><div class="row-actions">
      ${sec.runAction ? `<button class="icon-btn run" data-act="run" title="${esc(t('run_script_row'))}">▶</button>` : ''}
      ${!sec.runAction && sec.toggle !== false ? `<button class="icon-btn" data-act="toggle" title="${boolOn(r.disabled) ? t('enable') : t('disable')}">${boolOn(r.disabled) ? '○' : '●'}</button>` : ''}
      ${sec.id === 'wireguard' || sec.id === 'wgPeers' ? `<button class="icon-btn qr" data-act="qr" title="${t('wg_qr')}">▣</button>` : ''}
      <button class="icon-btn" data-act="edit" title="${t('edit')}">✎</button>
      <button class="icon-btn del" data-act="del" title="${t('delete')}">✕</button>
    </div></td>` : ''}
  </tr>`;
  }).join('') || `<tr><td colspan="20" class="empty">${t('no_data')}</td></tr>`;
  tb.querySelectorAll('.rowcheck').forEach((c) => c.onchange = () => { c.checked ? state.selectedIds.add(c.dataset.id) : state.selectedIds.delete(c.dataset.id); c.closest('tr').classList.toggle('selected', c.checked); });
  tb.querySelectorAll('[data-act]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'edit') { const row = state.rows.find((x) => x['.id'] === id); openForm(sec, row); }
    else if (act === 'qr') { const row = state.rows.find((x) => x['.id'] === id); openWireguardQr(row, sec); }
    else if (act === 'run') confirmModal(t('run_script'), t('run_script_confirm').replace('{n}', '1'), true, () => bulk(sec, 'run', [id]));
    else if (act === 'toggle') bulk(sec, boolOn((state.rows.find((x) => x['.id'] === id) || {}).disabled) ? 'enable' : 'disable', [id]);
    else if (act === 'del') confirmModal(t('confirm_delete'), t('confirm_delete_msg'), true, () => bulk(sec, 'remove', [id]));
  });
}
function boolOn(v) { return v === 'true' || v === true || v === 'yes' || v === '1'; }
function cellHtml(row, key, sec) {
  const v = row[key];
  if (key === 'running') return `<span class="tag ${boolOn(v) ? 'green' : 'red'}">${boolOn(v) ? t('running') : t('stopped')}</span>`;
  if (key === 'disabled') return `<span class="tag ${boolOn(v) ? 'red' : 'green'}">${boolOn(v) ? t('disabled') : t('enabled')}</span>`;
  if (/\.id$/.test(key)) return `<span style="color:#9aa5bd">${esc(v)}</span>`;
  if (key === 'topoName') {
    const n = topoNodeFor(row, row['mac-address']);
    return n && n.name
      ? `<span class="topo-name-cell" title="${esc(n.name)}">${esc(n.name)}</span>`
      : '<span class="muted-cell">—</span>';
  }
  if (key === 'topoType') {
    const n = topoNodeFor(row, row['mac-address']);
    const map = { router: L('路由器', 'Router'), switch: L('交换机', 'Switch'), ap: L('无线 AP', 'Access point'),
      nas: L('NAS / 存储', 'NAS / storage'), dns: L('DNS 服务器', 'DNS server'), proxy: L('代理服务器', 'Proxy server'),
      client: L('终端', 'Client'), other: L('其它', 'Other') };
    return n && n.type
      ? `<span class="tag" title="${esc(n.type)}">${esc(map[n.type] || n.type)}</span>`
      : '<span class="muted-cell">—</span>';
  }
  if ((key === 'rateUp' || key === 'rateDown') && sec && sec.id === 'dhcpLeases') {
    const r = leaseRateFor(row);
    if (!r) return '<span class="muted-cell">—</span>';
    const bps = key === 'rateUp' ? r.txBps : r.rxBps;
    const f = typeof fmtBytesRate === 'function' ? fmtBytesRate(bps || 0) : { v: String(bps || 0), u: 'B/s' };
    const active = !!(bps && bps > 0);
    return `<span class="lease-rate ${active ? (key === 'rateUp' ? 'up' : 'down') : ''}">${esc(f.v)}<small>${esc(f.u)}</small></span>`;
  }
  if (key === 'status' && sec && sec.id === 'dhcpLeases') {
    const bound = /bound/i.test(String(v || ''));
    return `<span class="tag ${bound ? 'green' : 'amber'}">${esc(v || '—')}</span>`;
  }
  if (/mac[-_]?address/i.test(key) && v) {
    /* 复用拓扑设备图标；没有对应节点或没上传图标时只显示 MAC */
    const hit = topoIconFor(row, v);
    const icon = hit ? `<img class="mac-topo-icon" src="${esc(hit.url)}" alt="" title="${esc(hit.name || '')}" loading="lazy">` : '';
    return `<span class="mac-cell" title="${esc(v)}${hit && hit.name ? ' · ' + esc(hit.name) : ''}">${icon}${esc(v)}</span>`;
  }
  if (/bytes/i.test(key)) {
    /* 连接表：显示精确字节数，实时每秒递增可见；其余表格保留易读单位 */
    if (sec && (sec.id === 'connections' || sec.id === 'connections6')) {
      return `<span title="${fmtBytes(v)}">${fmtBytesExact(v)}</span>`;
    }
    return fmtBytes(v);
  }
  if (key === 'comment' && sec && sec.id === 'dhcpLeases') {
    /* 第一列：拓扑设备图标 + RouterOS 租约 comment，不再显示「拓扑同步」标签 */
    let legacy = '';
    if (String(v || '').startsWith('ROS-TOPO-v1:')) {
      try {
        let b = String(v).slice('ROS-TOPO-v1:'.length).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const m = JSON.parse(decodeURIComponent(escape(atob(b)))); legacy = m.uc || '';
      } catch (e) { /* ignore */ }
    }
    const hit = topoIconFor(row, row['mac-address']);
    const topo = topoNodeForMac(row, row['mac-address']);
    const label = legacy || String(v || '') || (topo && topo.name) || '';
    const icon = hit
      ? `<img class="mac-topo-icon" src="${esc(hit.url)}" alt="" loading="lazy">`
      : `<span class="lease-device-ico lg-${esc((topo && topo.type) || 'other')}"><svg class="i"><use href="#i-device"/></svg></span>`;
    return `<span class="lease-device-cell" title="${esc(label)}">${icon}<b>${label ? esc(label) : '<span class="muted-cell">—</span>'}</b></span>`;
  }
  if (key === 'password' || key === 'private-key' || /pre-?shared-key/.test(key)) return '<span class="tag">••••••••</span>';
  const f = sec.fields.find((x) => x.key === key);
  if (f && f.type === 'bool') return boolOn(v) ? `<span class="tag blue">✓</span>` : '';
  if (key === 'chain') return `<span class="tag blue">${esc(v)}</span>`;
  if (key === 'action') return `<span class="tag ${/drop|reject/.test(v) ? 'red' : /accept|masquerade/.test(v) ? 'green' : ''}">${esc(v)}</span>`;
  return esc(v == null || v === '' ? '—' : v);
}

/* ================= DHCP 租约专用编辑弹窗（分区卡片风格，与拓扑动画设置一致） ================= */
function openLeaseForm(sec, row) {
  const isEdit = !!row;
  const fields = sec.fields.filter((f) => f.key !== '.id' && f.type !== 'id');
  const val = (k) => (row && row[k] != null ? row[k] : '');
  /* 按 RouterOS 界面顺序分组，字段 key → 分组 */
  const GROUPS = [
    [L('基本信息', 'General'), 'blue', ['disabled', 'comment', 'address', 'mac-address', 'use-src-mac', 'client-id', 'agent-circuit-id', 'agent-remote-id']],
    [L('服务端与租期', 'Server & lease'), 'green', ['server', 'lease-time', 'blocked', 'always-broadcast']],
    [L('DHCP 选项', 'DHCP options'), 'violet', ['dhcp-option', 'dhcp-option-set', 'rate-limit', 'routes', 'address-list']],
    [L('队列与其它', 'Queue & more'), 'amber', ['allow-dual-stack-queue', 'insert-queue-before', 'host-name', 'status']],
  ];
  const fieldById = new Map(fields.map((f) => [f.key, f]));
  const inputFor = (f) => {
    const v = val(f.key), id = 'f_' + f.key;
    const label = esc(tx(f.label));
    if (f.type === 'bool' || f.type === 'bool-invert') {
      const on = f.type === 'bool-invert' ? !boolOn(v) : boolOn(v);
      return `<div class="lease-card" data-name="${esc(label + ' ' + f.key).toLowerCase()}">
        <div class="lease-switch"><span>${label}</span><label class="upd-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label></div>
      </div>`;
    }
    if (f.type === 'readonly') return `<div class="lease-card" data-name="${esc(label + ' ' + f.key).toLowerCase()}">
      <label>${label} <small>${esc(f.key)}</small></label><input type="text" id="${id}" value="${esc(v || '—')}" disabled></div>`;
    const opts = f.type === 'interface' ? (fieldOptions(sec).interfaces || []) : (f.options || []);
    let ctrl;
    if (f.key === 'server') {
      /* 服务端：下拉，选项来自当前连接路由的 DHCP 服务端列表 */
      ctrl = `<select id="${id}" data-dhcp-server-select><option value="${esc(v)}">${esc(v || L('加载中…', 'Loading…'))}</option></select>`;
    } else if (f.type === 'select' || f.type === 'interface') {
      ctrl = `<select id="${id}"><option value=""></option>${opts.map((o) => `<option value="${esc(o)}" ${String(v) === o ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')}</select>`;
    } else {
      ctrl = `<input type="text" id="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || f.key)}" ${f.required ? 'data-required="1"' : ''}>`;
    }
    return `<div class="lease-card" data-name="${esc(label + ' ' + f.key).toLowerCase()}">
      <label>${label}${f.required ? ' <span class="req">*</span>' : ''} <small>${esc(f.key)}</small></label>${ctrl}</div>`;
  };
  const body = `
    <div class="lease-intro ui-intro">
      <div class="lease-intro-icon ui-intro-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="var(--card)"/><circle cx="15" cy="12" r="2" fill="var(--card)"/><circle cx="11" cy="17" r="2" fill="var(--card)"/></svg></div>
      <div><b>${esc(isEdit ? L('编辑 DHCP 租约', 'Edit DHCP lease') : L('新增 DHCP 租约', 'Add DHCP lease'))} · ${esc(val('address') || L('新租约', 'New lease'))}</b>
        <p>${esc(L('字段与 RouterOS /DHCP Server/Leases 一致；修改后会自动同步到网络拓扑（以 MAC 为锚点）。', 'Fields match RouterOS /DHCP Server/Leases; changes sync back to the topology (anchored by MAC).'))}</p></div>
    </div>
    <div class="picker-toolbar">
      <div class="picker-search"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="text" id="leaseSearch" placeholder="${esc(L('搜索字段…', 'Search fields…'))}"></div>
    </div>
    <div class="lease-form-wrap">
      ${GROUPS.map(([title, color, keys]) => {
        const cards = keys.map((k) => fieldById.get(k)).filter(Boolean).map(inputFor).join('');
        if (!cards) return '';
        return `<div class="lease-group" data-group-name="${esc(title).toLowerCase()}"><div class="lease-group-title"><i style="background:var(--${color})"></i>${esc(title)} <small>${esc(L('RouterOS 字段', 'RouterOS fields'))}</small></div><div class="lease-grid">${cards}</div></div>`;
      }).join('')}
    </div>`;
  const foot = `<span class="picker-summary">${esc(L('共 ', ''))}${fields.length}${esc(L(' 个字段', ' fields'))}</span>
    <button class="btn" data-close type="button">${esc(t('cancel'))}</button><button class="btn primary" id="leaseSave" type="button">${esc(t('save'))}</button>`;
  openModal((isEdit ? t('edit_title') : t('add_title')) + ' · ' + tx(sec.title), body, foot, (m) => {
    /* 服务端下拉：从当前路由读取 DHCP 服务端列表 */
    loadDhcpServers().then((names) => {
      const sel = m.querySelector('[data-dhcp-server-select]');
      if (!sel || !m.isConnected) return;
      const current = sel.value;
      const opts = ['<option value=""></option>'];
      for (const nm of names) opts.push(`<option value="${esc(nm)}" ${nm === current ? 'selected' : ''}>${esc(nm)}</option>`);
      /* 若当前值不在列表里（历史租约指向已删除的服务端），保留它以免丢失 */
      if (current && !names.includes(current)) opts.push(`<option value="${esc(current)}" selected>${esc(current)} (${esc(L('当前', 'current'))})</option>`);
      sel.innerHTML = opts.join('');
    });
    const s = m.querySelector('#leaseSearch');
    s.oninput = () => {
      const q = s.value.trim().toLowerCase();
      m.querySelectorAll('.lease-card').forEach((c) => { c.style.display = !q || c.dataset.name.includes(q) ? '' : 'none'; });
    };
    m.querySelector('#leaseSave').onclick = async () => {
      const values = {};
      for (const f of fields) {
        if (f.type === 'readonly') continue;
        const el = m.querySelector('#f_' + f.key); if (!el) continue;
        if (f.required && !String(el.value).trim() && f.type !== 'bool' && f.type !== 'bool-invert') { toast(t('required'), 'err'); el.focus(); return; }
        if (f.type === 'bool') values[f.key] = el.checked ? 'true' : 'false';
        else if (f.type === 'bool-invert') values[f.key] = el.checked ? 'false' : 'true';
        else if (String(el.value).trim()) values[f.key] = el.value.trim();
        else if (isEdit) values[f.key] = '';
      }
      const payload = { section: sec.id, action: isEdit ? 'set' : 'add', values, syncTopology: true };
      if (isEdit) payload.ids = [row['.id']];
      try {
        const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        closeModal(); toast(`${t('saved_ok')} (${r.changed || 1})`, 'ok');
        await loadRows(sec); renderConfigPage(sec);
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}

/* ================= 新增 / 编辑表单 ================= */
function openForm(sec, row) {
  if (sec && sec.id === 'dhcpLeases') return openLeaseForm(sec, row);
  const isEdit = !!row;
  const fields = sec.fields.filter((f) => f.key !== '.id' && f.type !== 'id');
  const opts = fieldOptions(sec);
  /* 与 DHCP 租约同款：分区卡片 + 字段名标注 + 搜索。bool 用开关、textarea 跨整行。 */
  const inputFor = (f) => {
    const v = row && row[f.key] != null ? row[f.key] : '';
    const id = 'f_' + f.key;
    const label = esc(tx(f.label));
    const nameAttr = `data-name="${esc(label + ' ' + f.key).toLowerCase()}"`;
    const small = `<small>${esc(f.key)}</small>`;
    if (f.type === 'bool') return `<div class="lease-card" ${nameAttr}>
      <div class="lease-switch"><span>${label}</span><label class="upd-switch"><input type="checkbox" id="${id}" ${boolOn(v) ? 'checked' : ''}><i></i></label></div></div>`;
    let ctrl;
    if (f.type === 'select') ctrl = `<select id="${id}"><option value=""></option>${(f.options || []).map((o) => `<option value="${esc(o)}" ${String(v) === o ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')}</select>`;
    else if (f.type === 'interface') ctrl = `<select id="${id}"><option value=""></option>${(opts.interfaces || []).map((n) => `<option value="${esc(n)}" ${v === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}${v && !(opts.interfaces || []).includes(v) ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''}</select>`;
    else if (f.type === 'textarea') ctrl = `<textarea id="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    else if (f.type === 'readonly') ctrl = `<input type="text" id="${id}" value="${esc(v || '—')}" disabled>`;
    else if (f.key === 'private-key' || f.key === 'preshared-key') ctrl = `<div style="display:flex;gap:6px"><input type="text" id="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"><button type="button" class="btn" data-keygen="${f.key}" style="width:auto;flex:0 0 auto;margin:0">${t('wg_auto')}</button></div>`;
    else ctrl = `<input type="${f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}" id="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'data-required="1"' : ''}>`;
    const wide = f.type === 'textarea' || f.key === 'private-key' || f.key === 'preshared-key' || f.key === 'public-key' ? ' lease-card--wide' : '';
    return `<div class="lease-card${wide}" ${nameAttr}><label>${label}${f.required ? ' <span class="req">*</span>' : ''} ${small}</label>${ctrl}${f.placeholder && f.type !== 'textarea' ? `<p class="form-hint">${esc(f.placeholder)}</p>` : ''}</div>`;
  };
  const body = `
    <div class="lease-intro ui-intro">
      <div class="lease-intro-icon ui-intro-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9M4 20h4M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div>
      <div><b>${esc(isEdit ? t('edit_title') : t('add_title'))} · ${esc(tx(sec.title))}</b>
        <p>${esc(L('字段与 RouterOS 配置一一对应，保存后直接写入当前路由器。', 'Fields map directly to RouterOS config; saving writes to the current router.'))}</p></div>
    </div>
    <div class="picker-toolbar">
      <div class="picker-search"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="text" id="formSearch" placeholder="${esc(L('搜索字段…', 'Search fields…'))}"></div>
    </div>
    <div class="lease-form-wrap"><div class="lease-group"><div class="lease-group-title"><i style="background:var(--blue)"></i>${esc(L('配置字段', 'Configuration fields'))} <small>${esc(L('RouterOS 字段', 'RouterOS fields'))}</small></div>
      <div class="lease-grid" id="formGrid">${fields.map(inputFor).join('')}</div></div></div>`;
  const introHtml = body;
  openModal((isEdit ? t('edit_title') : t('add_title')) + ' · ' + tx(sec.title), introHtml,
    `<span class="ui-summary">${esc(L('共 ', ''))}${fields.length}${esc(L(' 个字段', ' fields'))}</span>
     <button class="btn" data-cancel>${t('cancel')}</button><button class="btn primary" data-save>${t('save')}</button>`,
    (m) => {
      const fs = m.querySelector('#formSearch');
      if (fs) fs.oninput = () => {
        const q = fs.value.trim().toLowerCase();
        m.querySelectorAll('#formGrid .lease-card').forEach((c) => { c.style.display = !q || (c.dataset.name || '').includes(q) ? '' : 'none'; });
      };
      m.querySelector('[data-cancel]').onclick = closeModal;
      m.querySelectorAll('[data-keygen]').forEach((b) => b.onclick = () => {
        if (!window.WGKey) { toast(L('密钥生成器未加载', 'Key generator unavailable'), 'err'); return; }
        const kp = WGKey.keypair();
        const target = m.querySelector('#f_' + b.dataset.keygen);
        if (target) target.value = kp.privateKey;
        const pub = m.querySelector('#f_public-key');
        if (pub) pub.value = kp.publicKey;
      });
      if ((sec.id === 'wireguard' || sec.id === 'wgPeers') && window.WGKey) {
        const pk = m.querySelector('#f_private-key');
        if (pk) pk.oninput = () => { const pub = WGKey.publicFromPrivate(pk.value); if (pub) { const el = m.querySelector('#f_public-key'); if (el) el.value = pub; } };
      }
      m.querySelector('[data-save]').onclick = async () => {
        const values = {};
        for (const f of fields) {
          if (f.type === 'readonly') continue;
          const el = m.querySelector('#f_' + f.key); if (!el) continue;
          if (f.required && !String(el.value).trim() && f.type !== 'bool') { toast(t('required'), 'err'); el.focus(); return; }
          if (f.type === 'bool') values[f.key] = el.checked ? 'true' : 'false';
          else if (String(el.value).trim()) values[f.key] = el.value.trim();
          else if (isEdit) values[f.key] = '';
        }
        const payload = { section: sec.id, action: isEdit ? 'set' : 'add', values };
        if (isEdit) payload.ids = [row['.id']];
        try { const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); closeModal(); toast(`${t('saved_ok')} (${r.changed || 1})`, 'ok'); await loadRows(sec); if (sec.singleton) renderSingletonPage(sec); else renderConfigPage(sec); }
        catch (e) { toast(e.message, 'err'); }
      };
    });
}
function fieldOptions(sec) {
  return { interfaces: (state.latest && state.latest.ifaces || []).map((i) => i.name) };
}
async function bulk(sec, action, ids) {
  const chosen = ids || [...state.selectedIds];
  if (!chosen.length) { toast(t('selected_none'), 'err'); return; }
  try {
    const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: sec.id, action, ids: chosen }) });
    toast(action === 'run' ? t('run_script_ok') : `${t('action_ok')} (${r.changed || 0})`, 'ok');
    state.selectedIds.clear(); await loadRows(sec); renderConfigPage(sec);
  } catch (e) { toast(e.message, 'err'); }
}

/* ================= 工具 / 系统操作 ================= */
/* 运维工具：备份状态 / 安全规则 / 链路探测与带宽配置摘要 */
let toolsTimer = null;
function toolSecurityHtml(data, countId) {
  const count = $(countId || 'toolSecurityCount');
  if (count) count.textContent = data ? num(data.total) + ' ' + L('条规则', 'rules') : '—';
  if (!data) return `<div class="empty">${t('loading')}</div>`;
  const rows = data.rows || [];
  return `<div class="table-scroll"><table class="mini-table">
    <thead><tr><th>${t('th_chain')}</th><th>${L('动作', 'Action')}</th><th>${t('th_rule')}</th><th class="num">${t('th_hits')}</th><th class="num">${t('th_bytes')}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td data-label="${esc(t('th_chain'))}">${esc(r.chain)}</td><td data-label="${esc(L('动作', 'Action'))}"><span class="tag ${r.action === 'reject' ? 'amber' : 'red'}">${esc(r.action)}</span></td>
      <td data-label="${esc(t('th_rule'))}">${esc(r.comment || r.interface || r.id)}</td><td class="num" data-label="${esc(t('th_hits'))}">${num(r.packets).toLocaleString()}</td><td class="num" data-label="${esc(t('th_bytes'))}">${fmtBytes(r.bytes)}</td></tr>`).join('')
      || `<tr><td colspan="5" class="empty">${t('no_data')}</td></tr>`}</tbody></table></div>`;
}
async function refreshSecurity() {
  const box = $('securityBody') || $('toolSecurityFeed');
  const countId = $('securityBody') ? 'securityCount' : 'toolSecurityCount';
  try {
    const d = await api('/api/security');
    if (box) box.innerHTML = toolSecurityHtml(d, countId);
  } catch (e) { if (box) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
/* 运维工具页的探测 / 链路配置摘要（数据来自 views.js 的本地偏好） */
function paintToolConfigMeta() {
  const q = $('toolQualityMeta'), l = $('toolLinkMeta');
  if (q && typeof qualityPrefs === 'function') {
    const p = qualityPrefs();
    const mode = p.mode === 'netwatch' ? L('Netwatch 探针', 'Netwatch probe') : L('ICMP 探测', 'ICMP ping');
    const targets = (p.targets || []).filter((t) => t && t.host);
    q.innerHTML = `<div class="tool-cfg-row"><span>${esc(L('当前模式', 'Mode'))}</span><b>${esc(mode)}</b></div>
      <div class="tool-cfg-row"><span>${esc(L('探测目标', 'Targets'))}</span><b>${targets.length} / 5</b></div>
      <div class="tool-cfg-tags">${targets.length
        ? targets.map((t) => `<span class="tag">${esc(t.label || t.host)}</span>`).join('')
        : `<span class="tool-cfg-empty">${esc(L('留空时自动使用网关与外部 DNS', 'Gateway and public DNS are used when empty'))}</span>`}</div>`;
  }
  if (l && typeof linkPrefs === 'function') {
    const names = linkPrefs().map((p) => p.name).filter(Boolean);
    l.innerHTML = `<div class="tool-cfg-row"><span>${esc(L('已选链路', 'Selected links'))}</span><b>${names.length} / 4</b></div>
      <div class="tool-cfg-tags">${names.length
        ? names.map((n) => `<span class="tag">${esc(n)}</span>`).join('')
        : `<span class="tool-cfg-empty">${esc(L('按接口协商速率自动计算', 'Calculated from negotiated interface speed'))}</span>`}</div>`;
  }
}
async function refreshToolsPanels() {
  paintToolConfigMeta();
  await refreshSecurity();
  try {
    const d = await api('/api/backup/status');
    const box = $('backupStatus');
    if (box) {
      const s = d.status;
      box.innerHTML = s
        ? `<b>${t('backup_status_title')}</b><span>${esc(new Date(s.at).toLocaleString())} · ${esc(s.name)}</span><small>${esc(s.location || '')}${s.demo ? ' · DEMO' : ''}</small>`
        : `<b>${t('backup_status_title')}</b><span>${t('no_data')}</span>`;
    }
  } catch (e) { /* 备份状态不可用时留空，不影响主流程 */ }
}
function renderTools() {
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('tools_title')}</h1><p>${t('tools_sub')}</p></div></div>
    <div class="grid-2">
      <div class="panel reboot-panel"><div class="panel-head"><div><h2>${t('reboot_title')}</h2><p class="sub">${t('reboot_msg')}</p></div></div>
        <div class="panel-body">
          <div class="reboot-actions">
            <span class="reboot-icon" aria-hidden="true">⟳</span>
            <div class="reboot-copy"><b>${t('reboot_title')}</b><small>${t('reboot_msg')}</small></div>
            <button class="btn ghost-danger" id="rebootBtn" type="button">${t('reboot_title')}</button>
          </div>
          <div class="modal-note" style="margin-top:16px;font-size:11.5px;color:var(--muted)">
            <b>${t('note')}:</b> ${t('write_warn')}
          </div>
        </div></div>
      <div class="panel"><div class="panel-head"><div><h2>${t('bak_tools_title')}</h2><p class="sub">${t('bak_tools_sub')}</p></div></div>
        <div class="panel-body backup-tools">
          <article class="bak-card bak-app">
            <div class="bak-card-main">
              <span class="bak-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg></span>
              <div class="bak-copy">
                <div class="bak-title-row"><b>${t('bak_webui_title')}</b><span class="bak-kind">${esc(L('WebUI 数据', 'WebUI data'))}</span></div>
                <p class="bak-desc">${t('bak_webui_sub')}</p>
              </div>
            </div>
            <div class="bak-actions">
              <button class="btn primary" id="webuiBackupBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>${t('bak_webui_export')}</button>
              <button class="btn" id="webuiImportBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 19h16"/></svg>${t('bak_webui_import')}</button>
            </div>
          </article>
          <article class="bak-card bak-router">
            <div class="bak-card-main">
              <span class="bak-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 17h4M14 17h4"/><path d="M12 13V9M9 6a5 5 0 0 1 6 0"/></svg></span>
              <div class="bak-copy">
                <div class="bak-title-row"><b>${t('bak_ros_title')}</b><span class="bak-kind">${esc(L('路由器配置', 'Router config'))}</span></div>
                <p class="bak-desc">${t('bak_ros_sub')}</p>
              </div>
            </div>
            <div class="bak-actions">
              <button class="btn bak-export" id="rosBackupBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>${t('bak_ros_export')}</button>
              <button class="btn ghost-danger" id="rosImportBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 19h16"/></svg>${t('bak_ros_import')}</button>
            </div>
          </article>
          <input type="file" id="bakFileInput" accept=".json,.rsc,.txt" hidden>
          <div class="backup-status" id="backupStatus"></div>
        </div></div>
    </div>
    <div class="panel ping-panel" style="margin-top:14px"><div class="panel-head"><div><h2>${esc(L('网络诊断', 'Network diagnosis'))}</h2><p class="sub">ICMP echo · ${esc(L('逐条实时显示', 'results stream in real time'))}</p></div></div>
      <div class="panel-body">
        <div class="form-row"><label>${esc(L('目标地址', 'Target address'))}</label><div><input type="text" id="pingAddr" placeholder="${esc(L('填写 IP 或域名', 'Enter IP or hostname'))}" autocomplete="off" style="width:300px;max-width:100%"></div></div>
        <div class="form-row"><label>${esc(L('包数量', 'Packets'))}</label><div><input type="number" id="pingCount" min="1" value="5" style="width:110px"></div></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="pingRun" type="button">${esc(L('开始诊断', 'Start diagnosis'))}</button><button class="btn" id="pingStop" type="button">${esc(L('停止', 'Stop'))}</button><span id="pingStatus" class="topo-hint"></span></div>
        <div id="pingOut" class="ping-log"></div>
      </div></div>
    <div class="grid-2" style="margin-top:14px">
      <div class="panel tool-cfg-panel"><div class="panel-head"><div><h2>${esc(L('链路质量探测', 'Link quality probes'))}</h2><p class="sub">${esc(L('系统工具 → Netwatch · RouterOS /Tool/Netwatch', 'System Tools → Netwatch · RouterOS /Tool/Netwatch'))}</p></div>
        <button class="btn btn-sm" id="toolQualityCfg" type="button">${esc(L('配置探测目标', 'Configure targets'))}</button></div>
        <div class="panel-body tool-cfg-body">
          <div class="tool-cfg-intro"><span class="tool-cfg-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 6 16 3-8h4"/></svg></span>
            <div><b>${esc(L('Netwatch 主机探测', 'Netwatch host probe'))}</b><p>${esc(L('在路由器的「系统工具 → Netwatch」添加目标地址后即可持续探测；这里的配置会同步到 /Tool/Netwatch，状态与延迟在仪表盘链路质量卡片展示。', 'Add targets under System Tools → Netwatch on the router for continuous probing. Settings here sync to /Tool/Netwatch; status and latency appear on the dashboard link-quality card.'))}</p></div></div>
          <div class="tool-cfg-meta" id="toolQualityMeta"></div>
        </div></div>
      <div class="panel tool-cfg-panel"><div class="panel-head"><div><h2>${esc(L('关键链路利用率', 'Link utilization'))}</h2><p class="sub">${esc(L('接口协商速率 · RouterOS /Interface', 'Interface link speed · RouterOS /Interface'))}</p></div>
        <button class="btn btn-sm" id="toolLinkCfg" type="button">${esc(t('link_settings'))}</button></div>
        <div class="panel-body tool-cfg-body">
          <div class="tool-cfg-intro"><span class="tool-cfg-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M6 18V9m6 9V5m6 13v-6"/></svg></span>
            <div><b>${esc(L('链路带宽', 'Link capacity'))}</b><p>${esc(L('为运行中的接口设置带宽阈值（默认取协商速率），超过 60% / 85% / 95% 时在仪表盘分级显示。', 'Set capacity for running interfaces (defaults to negotiated speed); 60% / 85% / 95% thresholds are shown on the dashboard.'))}</p></div></div>
          <div class="tool-cfg-meta" id="toolLinkMeta"></div>
        </div></div>
    </div>`;
  /* 链路质量探测 / 链路带宽：复用 views.js 配置弹窗，入口收敛到运维工具 */
  const qc = $('toolQualityCfg');
  if (qc) qc.onclick = () => { if (typeof openQualityTargets === 'function') openQualityTargets(); };
  const lc = $('toolLinkCfg');
  if (lc) lc.onclick = () => { if (typeof openLinkSettings === 'function') openLinkSettings(state.latest || {}); };
  /* ICMP 逐条流式诊断 */
  const stopPing = () => {
    if (window.__rosPingSource) { try { window.__rosPingSource.close(); } catch (e) { /* ignore */ } window.__rosPingSource = null; }
    if ($('pingStop')) $('pingStop').disabled = true;
  };
  $('pingStop').disabled = true;
  $('pingStop').onclick = () => { stopPing(); if ($('pingStatus')) $('pingStatus').textContent = L('已停止', 'Stopped'); };
  $('pingRun').onclick = () => {
    const address = $('pingAddr').value.trim();
    const count = Math.max(1, Math.floor(Number($('pingCount').value) || 5));
    if (!address) { toast(L('请先填写目标地址', 'Enter a target address first'), 'err'); $('pingAddr').focus(); return; }
    stopPing();
    const out = $('pingOut'), status = $('pingStatus');
    out.innerHTML = `<table><thead><tr><th>${t('seq')}</th><th>${esc(L('目标', 'Host'))}</th><th>${esc(L('时延', 'Time'))}</th><th>TTL</th><th>${esc(L('大小', 'Size'))}</th></tr></thead><tbody></tbody></table>`;
    status.textContent = L('正在诊断…', 'Running…');
    $('pingStop').disabled = false;
    let received = 0, lost = 0;
    const qs = 'address=' + encodeURIComponent(address) + '&count=' + count + (state.deviceId ? '&device=' + encodeURIComponent(state.deviceId) : '');
    const es = new EventSource('/api/ping/stream?' + qs);
    window.__rosPingSource = es;
    es.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.error) { status.textContent = d.error; toast(d.error, 'err'); stopPing(); return; }
      if (d.row) {
        received++;
        const ok = !!d.row.time;
        if (!ok) lost++;
        out.querySelector('tbody').insertAdjacentHTML('beforeend', `<tr class="${ok ? '' : 'row-fail'}"><td>${esc(d.row.seq || received)}</td><td>${esc(d.row.host || d.row.address || address)}</td><td>${esc(d.row.time || L('超时', 'timeout'))}</td><td>${esc(d.row.ttl || '')}</td><td>${esc(d.row.size || '')}</td></tr>`);
        out.scrollTop = out.scrollHeight;
        status.textContent = `${received}/${count} · ${L('已收到', 'received')} ${received - lost} · ${L('丢失', 'lost')} ${lost}`;
      }
      if (d.done) { status.textContent += d.demo ? ` · ${L('演示模式', 'DEMO')}` : ` · ${L('完成', 'Done')}`; stopPing(); }
    };
    es.onerror = () => { if (window.__rosPingSource === es) { status.textContent = L('诊断中断', 'Diagnosis interrupted'); stopPing(); } };
  };
  /* ---- 备份与导入 ---- */
  const downloadText = (text, name, mime) => {
    const href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  };
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const pickFile = (accept) => new Promise((resolve) => {
    const inp = $('bakFileInput'); inp.value = ''; inp.accept = accept;
    inp.onchange = () => { const f = inp.files && inp.files[0]; resolve(f ? f.text() : null); };
    inp.click();
  });
  /* ① ROS Center：服务端 data + 浏览器 localStorage 合并为一个 .json */
  $('webuiBackupBtn').onclick = () => confirmModal(t('bak_webui_export'), esc(t('bak_webui_sub')), false, async () => {
    try {
      const r = await api('/api/webui/backup');
      const local = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (k && k.startsWith('ros-')) local[k] = localStorage.getItem(k);
      }
      r.localStorage = local;
      downloadText(JSON.stringify(r, null, 2), 'ros-center-backup-' + stamp() + '.json', 'application/json');
      toast(t('bak_export_ok'), 'ok'); refreshToolsPanels();
    } catch (e) { toast(e.message, 'err'); }
  });
  $('webuiImportBtn').onclick = () => confirmModal(t('bak_webui_import'), esc(t('bak_import_webui_confirm')), true, async () => {
    try {
      const text = await pickFile('.json,application/json'); if (!text) return;
      const b = JSON.parse(text);
      if (b.format !== 'ros-center-backup' || !b.files) throw new Error(t('bad_file') || 'Invalid backup file');
      const r = await api('/api/webui/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      if (b.localStorage && typeof b.localStorage === 'object') {
        for (const [k, v] of Object.entries(b.localStorage)) { try { localStorage.setItem(k, v); } catch (e) {} }
      }
      toast(`${t('bak_import_ok')} · ${r.written} files · ${r.icons} icons`, 'ok');
      setTimeout(() => location.reload(), 1200);
    } catch (e) { toast(e.message, 'err'); }
  });
  /* ② RouterOS 完整配置导出 / 导入 */
  $('rosBackupBtn').onclick = () => confirmModal(t('bak_ros_export'), esc(t('bak_ros_sub')), false, async () => {
    try {
      const qs = '?name=routeros-full-' + stamp() + (state.deviceId ? '&device=' + encodeURIComponent(state.deviceId) : '');
      const r = await api('/api/routeros/export' + qs);
      downloadText(r.text || '', (r.name || 'routeros-full') + '.rsc');
      toast(t('bak_export_ok'), 'ok'); refreshToolsPanels();
    } catch (e) { toast(e.message, 'err'); }
  });
  $('rosImportBtn').onclick = () => confirmModal(t('bak_ros_import'), esc(t('bak_import_ros_confirm')), true, async () => {
    try {
      const text = await pickFile('.rsc,.txt,text/plain'); if (!text) return;
      if (!/^\s*#|^\s*\//m.test(text)) throw new Error(t('bad_file') || 'Invalid RouterOS config');
      const r = await api('/api/routeros/import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, device: state.deviceId || undefined }) });
      const msg = (t('bak_import_result') || 'Executed {n} commands, {f} failed, rollback: {r}')
        .replace('{n}', r.executed || 0).replace('{f}', (r.failed || []).length).replace('{r}', r.rollback || '-');
      toast(`${t('bak_import_ok')} · ${msg}`, (r.failed || []).length ? 'err' : 'ok');
      if ((r.failed || []).length) console.warn('[ros-import] failed lines', r.failed);
      refreshToolsPanels();
    } catch (e) { toast(e.message, 'err'); }
  });
  $('rebootBtn').onclick = () => confirmModal(t('reboot_title'), `<b>${t('reboot_msg')}</b>`, true, async () => {
    try { await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reboot' }) }); toast(t('action_ok'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  if (toolsTimer) { clearInterval(toolsTimer); toolsTimer = null; }
  refreshToolsPanels();
  toolsTimer = setInterval(() => {
    if (state.section !== 'systemTools') { clearInterval(toolsTimer); toolsTimer = null; return; }
    refreshToolsPanels();
  }, 15000);
}

/* ================= WireGuard 扫码添加 / 对端配置 ================= */
const WG_FIELDS = [
  ['wgName', 'wg_name'], ['wgIface', 'wg_iface'], ['wgAddr', 'wg_addr_label'],
  ['wgPriv', 'wg_priv'], ['wgClientPub', 'wg_client_pub'],
  ['wgServerPub', 'wg_server_pub'], ['wgEndpoint', 'wg_endpoint'], ['wgEndpointPort', 'wg_endpoint_port'],
  ['wgRoute', 'wg_route'], ['wgDns', 'wg_dns'], ['wgPsk', 'wg_psk'],
  ['wgKeepalive', 'wg_keepalive'], ['wgResponder', 'wg_responder'],
];
function wgConfigText(v) {
  let s = `[Interface]\nAddress = ${v.wgAddr}\nPrivateKey = ${v.wgPriv}\n`;
  if (v.wgDns) s += `DNS = ${v.wgDns}\n`;
  s += `\n[Peer]\nPublicKey = ${v.wgServerPub}\n`;
  if (v.wgPsk) s += `PresharedKey = ${v.wgPsk}\n`;
  s += `AllowedIPs = ${v.wgRoute || '0.0.0.0/0'}\n`;
  s += `Endpoint = ${v.wgEndpoint}${v.wgEndpointPort ? ':' + v.wgEndpointPort : ''}\n`;
  const ka = String(v.wgKeepalive || '').replace(/[^\d]/g, '');
  if (ka) s += `PersistentKeepalive = ${ka}\n`;
  return s;
}
async function openWireguardQr(row, sec) {
  let ifaces = [], peers = [];
  try { ifaces = (await api('/api/config?section=wireguard')).rows || []; } catch (e) { /* ignore */ }
  try { peers = (await api('/api/config?section=wgPeers')).rows || []; } catch (e) { /* ignore */ }
  const iface = ifaces.find((x) => x.name === (row && row.interface)) || ifaces[0] || {};
  const peer = (row && typeof row === 'object' ? row : null) || peers[0] || {};
  const host = (state.latest && state.latest.host) || '10.0.0.1';
  const ifaceNames = ifaces.map((i) => i.name).filter(Boolean);
  const defaults = {
    wgName: peer.name || ('client-' + String(peer['.id'] || '').replace(/[^\d]/g, '') || 'client-1'),
    wgIface: iface.name || ifaceNames[0] || 'wg1',
    wgAddr: String(peer['client-address'] || '').split(',')[0] || String(peer['allowed-address'] || '').split(',')[0] || '10.0.9.2/32',
    wgPriv: peer['private-key'] && peer['private-key'] !== 'auto' ? peer['private-key'] : '',
    wgClientPub: peer['public-key'] || '',
    wgServerPub: iface['public-key'] || '',
    wgEndpoint: host, wgEndpointPort: String(iface['listen-port'] || '13231'),
    wgRoute: '0.0.0.0/0', wgDns: '10.0.0.1',
    wgPsk: peer['preshared-key'] && peer['preshared-key'] !== 'auto' ? peer['preshared-key'] : '',
    wgKeepalive: (String(peer['persistent-keepalive'] || '').match(/\d+/) || ['25'])[0], wgResponder: boolOn(peer.responder),
  };
  if (window.WGKey) {
    if (!defaults.wgPriv) { const kp = WGKey.keypair(); defaults.wgPriv = kp.privateKey; defaults.wgClientPub = kp.publicKey; }
    else if (!defaults.wgClientPub) defaults.wgClientPub = WGKey.publicFromPrivate(defaults.wgPriv);
  }
  const field = (label, input) => `<div class="form-row"><label>${label}</label><div>${input}</div></div>`;
  const txt = (id, hint) => `<input type="text" id="${id}" value="${esc(defaults[id] || '')}" ${hint ? `placeholder="${esc(hint)}"` : ''}>`;
  const form = `
    <div class="wg-section">${t('wg_iface')}</div>
    ${field(t('wg_name'), txt('wgName', 'client-1'))}
    ${field(t('wg_iface'), `<select id="wgIface">${(ifaceNames.length ? ifaceNames : ['wg1']).map((n) => `<option value="${esc(n)}" ${n === defaults.wgIface ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}
    ${field(t('wg_addr_label'), txt('wgAddr', '10.0.9.2/32'))}
    ${field(t('wg_priv'), `<div style="display:flex;gap:6px">${txt('wgPriv', 'base64 / auto')}<button type="button" class="btn" id="wgAuto" style="width:auto;flex:0 0 auto;margin:0">${t('wg_auto')}</button></div>`)}
    ${field(t('wg_client_pub'), txt('wgClientPub'))}
    <div class="wg-section">${t('wg_qr_title')} · Peer</div>
    ${field(t('wg_server_pub'), txt('wgServerPub'))}
    ${field(t('wg_endpoint'), txt('wgEndpoint', host))}
    ${field(t('wg_endpoint_port'), txt('wgEndpointPort', '13231'))}
    ${field(t('wg_route'), txt('wgRoute', '0.0.0.0/0'))}
    ${field(t('wg_dns'), txt('wgDns', '10.0.0.1'))}
    ${field(t('wg_psk'), txt('wgPsk', L('可留空 / auto', 'optional / auto')))}
    ${field(t('wg_keepalive'), txt('wgKeepalive', '25'))}
    ${field(t('wg_responder'), `<div class="form-check"><input type="checkbox" id="wgResponder" ${defaults.wgResponder ? 'checked' : ''}></div>`)}`;
  openModal(t('wg_qr_title'),
    `<div class="ui-intro"><div class="ui-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2z"/></svg></div>
       <div><b>${esc(t('wg_qr_title'))}</b><p>${esc(t('wg_qr_sub'))}</p></div></div>
     <div class="wg-grid"><div class="wg-form">${form}</div>
       <div class="wg-qr-box"><canvas id="wgQrCanvas" width="220" height="220"></canvas>
         <div class="tag blue" style="margin-top:8px">WireGuard</div></div></div>
     <div class="modal-note" style="margin-top:8px;font-size:11px">${t('wg_qr_tip')}</div>
     <textarea id="wgConf" class="code" readonly style="width:100%;min-height:132px;margin-top:10px"></textarea>`,
    `<span class="ui-summary">${esc(L('扫码导入，或下载配置', 'Scan to import, or download'))}</span>
     <button class="btn" data-close>${t('cancel')}</button><button class="btn" id="wgSave">${t('wg_save_peer')}</button><button class="btn" id="wgCopy">${t('wg_copy')}</button><button class="btn primary" id="wgDownload">${t('wg_download')}</button>`,
    (m) => {
      m.style.width = 'min(900px, 100%)';
      const qr = window.QRCode || window.ROSQR;
      const val = (id) => { const el = m.querySelector('#' + id); return el ? (el.type === 'checkbox' ? el.checked : String(el.value).trim()) : ''; };
      const draw = () => {
        const v = {}; WG_FIELDS.forEach(([id]) => { v[id] = val(id); });
        const text = wgConfigText(v);
        m.querySelector('#wgConf').value = text;
        const cv = m.querySelector('#wgQrCanvas');
        if (!qr) { cv.style.display = 'none'; return; }
        qr.toCanvas(cv, text, { width: 220, margin: 1, color: { dark: cssVar('--ink', '#1a2340'), light: '#ffffff' } }, (e) => { if (e) console.warn('[wg] qr', e.message); });
      };
      WG_FIELDS.forEach(([id]) => { const el = m.querySelector('#' + id); if (el) el.oninput = draw; });
      m.querySelector('#wgPriv').oninput = () => {
        if (window.WGKey) { const pub = WGKey.publicFromPrivate(val('wgPriv')); if (pub) m.querySelector('#wgClientPub').value = pub; }
        draw();
      };
      m.querySelector('#wgAuto').onclick = () => {
        if (!window.WGKey) { toast(L('密钥生成器未加载', 'Key generator unavailable'), 'err'); return; }
        const kp = WGKey.keypair();
        m.querySelector('#wgPriv').value = kp.privateKey;
        m.querySelector('#wgClientPub').value = kp.publicKey;
        draw(); toast(t('wg_priv_auto') + ' OK', 'ok');
      };
      draw();
      m.querySelector('#wgCopy').onclick = async () => {
        const text = m.querySelector('#wgConf').value;
        try { await navigator.clipboard.writeText(text); toast(t('wg_copy') + ' OK', 'ok'); }
        catch (e) { m.querySelector('#wgConf').select(); document.execCommand('copy'); toast(t('wg_copy') + ' OK', 'ok'); }
      };
      m.querySelector('#wgDownload').onclick = () => {
        const blob = new Blob([m.querySelector('#wgConf').value], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = (val('wgName') || 'wg-client') + '.conf'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      m.querySelector('#wgSave').onclick = async () => {
        const values = {
          name: val('wgName'), interface: val('wgIface'), 'private-key': val('wgPriv') || 'auto',
          'public-key': val('wgClientPub'), endpoint: val('wgEndpoint'), 'endpoint-port': val('wgEndpointPort'),
          'allowed-address': val('wgAddr'), 'persistent-keepalive': val('wgKeepalive'),
          responder: val('wgResponder') ? 'true' : 'false', comment: val('wgName'),
        };
        if (val('wgPsk')) values['preshared-key'] = val('wgPsk');
        if (!values.interface || !values['allowed-address'] || !values['private-key']) { toast(t('wg_required_wg'), 'err'); return; }
        try {
          const payload = { section: 'wgPeers', action: row && row['.id'] ? 'set' : 'add', values };
          if (row && row['.id']) payload.ids = [row['.id']];
          await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          toast(t('wg_peer_saved'), 'ok');
          if (state.section === 'wgPeers' || state.section === 'wireguard') {
            const peerSec = state.schema.sections.find((s) => s.id === 'wgPeers');
            if (peerSec) { await loadRows(peerSec); if (state.section === 'wgPeers') renderConfigPage(peerSec); }
          }
        } catch (e) { toast(e.message, 'err'); }
      };
    });
}

/* ================= 多设备管理 ================= */
function deviceStatusTag(d) {
  const st = d.status || {};
  if (d.enabled === false || st.mode === 'disabled') return `<span class="tag">${esc(L('已禁用', 'Disabled'))}</span>`;
  const online = !!(st.connected || st.mode === 'live');
  const cls = online ? 'green' : (d.demo ? 'amber' : 'red');
  let label;
  if (online) label = t('device_online');
  else if (d.demo) label = t('demo_only');
  else if (st.mode === 'connecting') label = t('connecting');
  else if (st.mode === 'reconnect') label = t('reconnect');
  else label = t('device_offline');
  return `<span class="tag ${cls}">${esc(label)}</span>`;
}
function renderConnectionSettings() {
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('devices')}</h1><p>${t('devices_sub')}</p></div>
      <div class="page-actions">
        <span class="tag" id="devPortTag">${t('conn_web_port')}: ${esc(state.webPort || 10086)}</span>
        <button class="btn primary" id="devAdd">+ ${t('device_add')}</button>
      </div></div>

    <section class="dev-section">
      <div class="dev-section-head">
        <div class="dev-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M6 20h12M12 17v3"/><circle cx="6.5" cy="10.5" r="1" fill="currentColor"/><path d="M11 10.5h6"/></svg></div>
        <div><b>${esc(L('已连接设备', 'Connected devices'))}</b><p>${esc(t('device_hint'))}</p></div>
        <span class="dev-count"><b id="devCount">${state.devices.length}</b> ${esc(t('device_count'))}</span>
      </div>
      <div class="dev-grid" id="devBody"></div>
    </section>

    <div class="dev-settings-grid">
      <section class="dev-set-card">
        <div class="dev-set-head"><div class="dev-set-icon violet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="M9 12l2 2 4-4"/></svg></div>
          <div><b>${t('conn_login_card')}</b><small>${esc(t('login_hint'))}</small></div></div>
        <div class="dev-set-body">
          ${state.authEnabled ? `<div class="dev-warn">${t('login_current')}: <b>${esc(state.authUser)}</b></div>` : ''}
          <div class="form-row"><label>${t('login_user')}</label><div><input id="authUser" value="${esc(state.authUser || 'admin')}" autocomplete="off"><p class="form-hint">${t('login_user_hint')}</p></div></div>
          <div class="form-row"><label>${t('login_pass')}</label><div><input type="password" id="authPass" autocomplete="new-password" placeholder="••••••"><p class="form-hint">${t('login_pass_hint')}</p></div></div>
          <div class="dev-set-actions">
            <button class="btn primary" id="authSave">${t('login_enable')}</button>
            ${state.authEnabled ? `<button class="btn ghost-danger" id="authDisable">${t('login_disable')}</button>` : ''}
          </div>
          <div id="authResult"></div>
          <div class="dev-subhead dev-port-head">${esc(L('端口设置', 'Port settings'))}</div>
          <div class="form-row"><label>${t('conn_web_port')}</label>
            <div><input type="number" id="cfgWebPort" min="1" max="65535" value="${esc(state.webPort || 10086)}">
              <p class="form-hint">${t('conn_web_port_hint')} · ${t('conn_host_port')}: ${esc(state.hostPort || state.webPort || 10086)}</p></div></div>
          <button class="btn" id="devSavePort">${t('save')}</button>
        </div>
      </section>

      <section class="dev-set-card">
        <div class="dev-set-head"><div class="dev-set-icon amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
          <div><b>${t('conn_sec_title')}</b><small>${esc(t('conn_security'))}</small></div></div>
        <div class="dev-set-body">
          <div class="dev-warn">${t('conn_security_tip')}</div>
          <details class="dev-cli"><summary>${esc(t('conn_cli_title'))}</summary>
<pre class="code">/user group add name=webui policy=read,api
/user add name=webui group=webui password=${L('强密码', 'strong-password')}
/ip service set api address=10.0.0.0/24</pre></details>
        </div>
      </section>

      ${isTauriDesktop() ? `<section class="dev-set-card">
        <div class="dev-set-head"><div class="dev-set-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><path d="M12 7v5l3 2"/></svg></div>
          <div><b>${esc(L('桌面版设置', 'Desktop settings'))}</b><small>${esc(L('仅桌面版可见', 'Desktop app only'))}</small></div></div>
        <div class="dev-set-body">
          <div class="form-row"><label>${esc(L('关闭窗口', 'Close window'))}</label>
            <div><select id="deskCloseMode"><option value="tray">${esc(L('最小化到托盘（后台继续运行）', 'Minimize to tray (keep running)'))}</option><option value="quit">${esc(L('完全退出程序', 'Quit application'))}</option></select>
              <p class="form-hint">${esc(L('托盘图标右键可退出程序', 'Right-click the tray icon to quit'))}</p></div></div>
          <div id="deskUpdateNote" class="form-hint" style="margin-bottom:10px"></div>
          <button class="btn primary" id="deskSave">${esc(t('save'))}</button>
        </div></section>` : ''}
    </div>`;
  if (isTauriDesktop()) {
    tauriInvoke('get_close_to_tray').then((v) => {
      const s = $('deskCloseMode'); if (s) s.value = v ? 'tray' : 'quit';
    }).catch(() => {});
    const save = $('deskSave');
    if (save) save.onclick = async () => {
      const s = $('deskCloseMode'); if (!s) return;
      try { await tauriInvoke('set_close_to_tray', { value: s.value === 'tray' }); toast(t('saved_ok'), 'ok'); }
      catch (e) { toast(e.message || String(e), 'err'); }
    };
    const dn = $('deskUpdateNote');
    if (dn) tauriInvoke('get_server_port').then((p) => { dn.textContent = `${L('本地服务端口', 'Local service port')}: ${p || '10086'}`; }).catch(() => {});
  }
  const renderRows = (force) => {
    const tb = $('devBody'); if (!tb) return;
    /* 状态签名去重：WS 每秒帧只在真正变化时重画，避免打断点击 */
    const sig = state.devices.map((d) => [d.id, d.status && d.status.mode, d.status && d.status.connected, d.demo, d.enabled,
      d.id === state.devicePrimary, d.id === state.deviceId].join(':')).join('|');
    if (!force && tb.dataset.sig === sig) return;
    tb.dataset.sig = sig;
    $('devCount').textContent = state.devices.length;
    tb.innerHTML = state.devices.map((d) => {
      const primary = d.id === state.devicePrimary;
      const active = d.id === state.deviceId;
      return `<div class="dev-card${primary ? ' primary' : ''}${active ? ' active' : ''}" data-dev="${esc(d.id)}">
        <div class="dev-card-top">
          <div class="dev-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><path d="M13 12h4M6 3v3M18 3v3"/></svg></div>
          <div class="dev-card-id"><b>${esc(d.name)}</b><span class="dev-card-ip">${esc(d.host)}</span></div>
          <div class="dev-card-badges">${deviceStatusTag(d)}${primary ? `<span class="tag blue">${esc(t('device_current'))}</span>` : ''}${active ? `<span class="tag green">${esc(t('device_active'))}</span>` : ''}${d.demo ? `<span class="tag">${esc(t('conn_demo'))}</span>` : ''}</div>
        </div>
        <div class="dev-card-foot">
          <label class="dev-enable" title="${esc(L('禁用后不再自动连接该路由器', 'Disabled devices never auto-connect'))}">
            <span>${esc(d.enabled === false ? L('已禁用', 'Disabled') : L('已启用', 'Enabled'))}</span>
            <label class="upd-switch"><input type="checkbox" data-act="toggle" ${d.enabled !== false ? 'checked' : ''}><i></i></label>
          </label>
          <div class="dev-card-actions">
            <button class="icon-btn" data-act="edit" title="${t('device_edit')}">✎</button>
            <button class="icon-btn" data-act="reconn" title="${t('device_reconnect')}">↻</button>
            <button class="icon-btn del" data-act="del" title="${t('device_del')}">✕</button>
            ${active ? '<button class="icon-btn ph" type="button" aria-hidden="true"></button>' : `<button class="icon-btn use" data-act="use" title="${t('device_primary')}">✓</button>`}
          </div>
        </div>
      </div>`;
    }).join('') || `<div class="empty">${t('no_data')}</div>`;
    tb.querySelectorAll('[data-act]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const id = b.closest('.dev-card').dataset.dev;
      const dev = state.devices.find((x) => x.id === id);
      const act = b.dataset.act;
      if (act === 'toggle') {
        const on = b.checked;
        api('/api/devices/' + id + '/' + (on ? 'enable' : 'disable'), { method: 'POST' })
          .then(() => refresh()).catch((err) => { b.checked = !on; toast(err.message, 'err'); });
      }
      else if (act === 'use') setPrimary(id);
      else if (act === 'edit') openDeviceForm(dev);
      else if (act === 'reconn') api('/api/devices/' + id + '/reconnect', { method: 'POST' }).then(() => refresh()).catch((e) => toast(e.message, 'err'));
      else if (act === 'del') confirmModal(t('device_del'), t('device_del_msg'), true, () =>
        api('/api/devices/' + id, { method: 'DELETE' }).then(() => { if (state.deviceId === id) switchDevice(state.devices.find((x) => x.id !== id).id, true); refresh(); toast(t('deleted_ok'), 'ok'); }).catch((e) => toast(e.message, 'err')));
    });
  };
  window.paintDeviceRows = renderRows;
  const refresh = async () => { await loadDevices(true); renderRows(true); renderDevicePicker(); };
  async function setPrimary(id) {
    try { const d = await api('/api/devices/' + id + '/active', { method: 'POST' }); state.devicePrimary = d.activeId; await refresh(); toast(t('device_saved'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }
  function openDeviceForm(dev) {
    const isNew = !dev;
    const card = (label, key, ctrl, wide) => `<div class="lease-card${wide ? ' lease-card--wide' : ''}" data-name="${esc((label + ' ' + key).toLowerCase())}"><label>${label} <small>${esc(key)}</small></label>${ctrl}</div>`;
    const sw = (label, key, id, on) => `<div class="lease-card" data-name="${esc((label + ' ' + key).toLowerCase())}"><div class="lease-switch"><span>${label}</span><label class="upd-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label></div></div>`;
    const body = `
      <div class="lease-intro ui-intro">
        <div class="lease-intro-icon ui-intro-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M6 20h12M12 17v3"/><circle cx="6.5" cy="10.5" r="1" fill="currentColor"/><path d="M11 10.5h6"/></svg></div>
        <div><b>${esc(isNew ? t('device_add') : t('device_edit'))}${dev ? ' · ' + esc(dev.name) : ''}</b>
          <p>${esc(L('填写 RouterOS 的连接信息，可先测试连接再保存；新设备默认不启用，勾选「启用此设备」后才会连接。', 'Enter RouterOS connection details; test before saving. New devices stay disabled until you enable them.'))}</p></div>
      </div>
      <div class="picker-toolbar">
        <div class="picker-search"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="text" id="dvSearch" placeholder="${esc(L('搜索字段…', 'Search fields…'))}"></div>
      </div>
      <div class="lease-form-wrap">
        <div class="lease-group"><div class="lease-group-title"><i style="background:var(--blue)"></i>${esc(L('连接信息', 'Connection'))} <small>${esc(L('RouterOS 设备', 'RouterOS device'))}</small></div>
          <div class="lease-grid" id="dvGrid">
            ${card(L('设备名称', 'Device name'), 'name', `<input id="dvName" value="${esc(dev ? dev.name : '')}" placeholder="主路由">`)}
            ${card(L('主机地址', 'Host'), 'host', `<input id="dvHost" value="${esc(dev ? dev.host : '')}" placeholder="10.0.0.1">`)}
            ${card(L('API 端口', 'API port'), 'port', `<input type="number" id="dvPort" min="1" max="65535" value="${esc(dev ? dev.port : 8728)}">`)}
            ${card(L('用户名', 'User'), 'user', `<input id="dvUser" value="${esc(dev ? dev.user : '')}" autocomplete="off">`)}
            ${card(L('密码', 'Password'), 'password', `<input type="password" id="dvPass" autocomplete="new-password" placeholder="${esc(t('device_no_password'))}">`, true)}
          </div></div>
        <div class="lease-group"><div class="lease-group-title"><i style="background:var(--green)"></i>${esc(L('连接选项', 'Options'))}</div>
          <div class="lease-grid">
            ${sw(L('启用此设备', 'Enable device'), 'enabled', 'dvEnabled', dev ? dev.enabled !== false : false)}
            ${sw(L('使用 TLS 加密', 'Use TLS'), 'tls', 'dvTls', !!(dev && dev.tls))}
            ${sw(L('演示数据', 'Demo data'), 'demo', 'dvDemo', !!(dev && dev.demo))}
          </div></div>
      </div>
      <div id="dvResult"></div>`;
    openModal(isNew ? t('device_add') : t('device_edit'), body,
      `<span class="ui-summary" id="dvFootHint">${esc(L('未勾选启用时仅保存配置，不会连接', 'Disabled devices are saved without connecting'))}</span>
       <button class="btn" data-close>${t('cancel')}</button><button class="btn" id="dvTest">${t('device_test')}</button><button class="btn primary" id="dvSave">${t('save')}</button>`,
      (m) => {
        const fh = m.querySelector('#dvFootHint');
        const en = m.querySelector('#dvEnabled');
        const syncHint = () => { if (fh) fh.textContent = en.checked
          ? L('保存后即连接该设备', 'Connects on save')
          : L('未勾选启用时仅保存配置，不会连接', 'Disabled devices are saved without connecting'); };
        if (en) en.onchange = syncHint;
        const ds = m.querySelector('#dvSearch');
        if (ds) ds.oninput = () => {
          const q = ds.value.trim().toLowerCase();
          m.querySelectorAll('.lease-form-wrap .lease-card').forEach((c) => { c.style.display = !q || (c.dataset.name || '').includes(q) ? '' : 'none'; });
        };
        m.querySelector('[data-close]').onclick = closeModal;
        const vals = () => ({ name: m.querySelector('#dvName').value.trim(), host: m.querySelector('#dvHost').value.trim(),
          port: Number(m.querySelector('#dvPort').value), user: m.querySelector('#dvUser').value.trim(),
          password: m.querySelector('#dvPass').value, enabled: m.querySelector('#dvEnabled').checked,
          tls: m.querySelector('#dvTls').checked, demo: m.querySelector('#dvDemo').checked });
        m.querySelector('#dvTest').onclick = async () => {
          const btn = m.querySelector('#dvTest'); btn.disabled = true;
          m.querySelector('#dvResult').innerHTML = `<span class="tag amber">${t('loading')}</span>`;
          try { const r = await api('/api/devices/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals()) });
            m.querySelector('#dvResult').innerHTML = `<span class="tag green">✓ ${t('conn_test_ok')}${r.version ? ' · RouterOS ' + esc(r.version) : ''}</span>`; }
          catch (e) { m.querySelector('#dvResult').innerHTML = `<span class="tag red">✕ ${esc(e.message)}</span>`; }
          finally { btn.disabled = false; }
        };
        m.querySelector('#dvSave').onclick = async () => {
          const v = vals();
          if (!v.name || !v.host || !v.port || !v.user) { toast(t('device_required'), 'err'); return; }
          try {
            if (isNew) await api('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
            else await api('/api/devices/' + dev.id + '/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
            closeModal(); await refresh(); if (!isNew && dev.id === state.deviceId) switchDevice(dev.id, true);
            toast(t('device_saved'), 'ok');
            /* 新设备连上路由器需要几秒：保存后自动跟进状态，无需手动刷新 */
            [1200, 3000, 6000].forEach((ms) => setTimeout(async () => {
              if (state.section !== 'connectionSettings') return;
              try { await loadDevices(true); if (window.paintDeviceRows) window.paintDeviceRows(true); renderDevicePicker(); }
              catch (e) { /* 保留上次状态 */ }
            }, ms));
          } catch (e) { toast(e.message, 'err'); }
        };
      });
  }
  $('devAdd').onclick = () => openDeviceForm(null);
  $('devSavePort').onclick = async () => {
    try {
      const r = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webPort: Number($('cfgWebPort').value) }) });
      await loadDevices(true); toast(r.restartRequired ? t('conn_restart') : t('saved_ok'), r.restartRequired ? '' : 'ok');
      const tag = $('devPortTag'); if (tag) tag.textContent = t('conn_web_port') + ': ' + state.webPort;
    } catch (e) { toast(e.message, 'err'); }
  };
  $('authSave').onclick = async () => {
    const user = $('authUser').value.trim(), password = $('authPass').value;
    if (!user || password.length < 6) { toast(t('login_pass_hint'), 'err'); return; }
    try {
      await api('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) });
      state.authEnabled = true; state.authUser = user;
      const al = $('authLogoutBtn'); if (al) al.hidden = false;
      $('authResult').innerHTML = `<span class="tag green">✓ ${t('login_saved')}</span>`;
      toast(t('login_saved'), 'ok');
      renderConnectionSettings();
    } catch (e) { $('authResult').innerHTML = `<span class="tag red">✕ ${esc(e.message)}</span>`; }
  };
  const authDis = $('authDisable');
  if (authDis) authDis.onclick = () => confirmModal(t('login_disable'), t('login_hint'), true, async () => {
    try {
      await api('/api/auth/password', { method: 'DELETE' });
      state.authEnabled = false; state.authUser = '';
      const al = $('authLogoutBtn'); if (al) al.hidden = true;
      toast(t('login_disabled'), 'ok'); renderConnectionSettings();
    } catch (e) { toast(e.message, 'err'); }
  });
  renderRows(true);
}

/* ================= 全局自动刷新：按当前页面只更新数据区，不重建整页 ================= */
window.autoRefreshPage = async function () {
  const sec = state.schema && state.schema.sections.find((s) => s.id === state.section);
  if (!sec) return;
  if (state.section === 'connectionSettings') {
    try { await loadDevices(true); if (window.paintDeviceRows) window.paintDeviceRows(true); renderDevicePicker(); }
    catch (e) { /* 保留上次状态 */ }
    return;
  }
  if (!sec.path || state.section === 'trafficStats' || state.section === 'dashboard' || state.section === 'systemTools') return;
  try {
    await loadRows(sec);
    syncConfigTag();
    if (sec.singleton) paintSingletonBody(sec);
    else renderRows(sec);   /* 配置表格：只重画 tbody，搜索/排序/勾选状态不丢 */
  } catch (e) { /* 静默保留上一次真实数据 */ }
};

/* 所有脚本就绪后启动 */
boot();
