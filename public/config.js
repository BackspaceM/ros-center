'use strict';

/* ================= 配置表格页 ================= */
async function loadRows(sec) {
  const d = await api('/api/config?section=' + encodeURIComponent(sec.id));
  state.rows = d.rows || []; state.configDemo = !!d.demo; state.configOffline = !!d.offline;
  if (sec.id === 'connections') state.connRows = state.rows;
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
  const cols = sec.columns || sec.fields.map((f) => f.key);
  const writable = sec.writable !== false;
  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${esc(tx(sec.title))}</h1><p>${esc(sec.path || '')}${!writable ? ' · ' + t('readonly_tip') : ''}</p></div>
      <div class="page-actions">
        ${writable ? `<button class="btn primary" id="btnAdd">+ ${t('add')}</button>` : ''}
        ${writable && sec.runAction ? `<button class="btn" id="btnRun">▶ ${t('run_script')}</button>` : ''}
        ${writable && !sec.runAction && sec.toggle !== false ? `<button class="btn" id="btnEnable">${t('enable')}</button><button class="btn" id="btnDisable">${t('disable')}</button>` : ''}
        ${writable ? `<button class="btn ghost-danger" id="btnDelete">${t('delete')}</button>` : ''}
      </div>
    </div>
    ${state.configDemo ? `<div class="card" style="border-left:3px solid var(--amber);margin-bottom:14px;padding:10px 14px;font-size:11.5px;color:#8a6514">${t('demo_mode_tip')}</div>` : ''}
    <div class="panel">
      <div class="table-tools">
        <input type="search" id="rowSearch" placeholder="${t('search')}…" value="${esc(state.rowFilter)}">
        <span class="tag" id="rowCount">0 ${t('rows')}</span>
        <span class="spacer"></span>
        ${demoBadge('cfgModeTag')}
      </div>
      <div class="table-scroll"><table><thead><tr>
        ${writable ? '<th style="width:36px"><input type="checkbox" class="check" id="checkAll"></th>' : ''}
        <th class="sortable" data-sort="#" style="width:52px" title="${t('sort_hint')}">#${sortMark('#')}</th>
        ${cols.filter((c) => c !== '.id').map((c) => `<th class="sortable${numCol(c, sec) ? ' num' : ''}" data-sort="${esc(c)}" title="${t('sort_hint')}">${esc(fieldLabel(sec, c))}${sortMark(c)}</th>`).join('')}
        ${writable ? `<th style="width:${sec.id === 'wireguard' || sec.id === 'wgPeers' ? 142 : 110}px"></th>` : ''}
      </tr></thead><tbody id="tbody"></tbody></table></div>
      <div class="pager"><span id="pageInfo"></span><button id="prevPage">${t('prev')}</button><button id="nextPage">${t('next')}</button></div>
    </div>`;

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
    ${state.configDemo ? `<div class="card" style="border-left:3px solid var(--amber);margin-bottom:14px;padding:10px 14px;font-size:11.5px;color:#8a6514">${t('demo_mode_tip')}</div>` : ''}
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

function numCol(key, sec) { return /bytes|port|mtu|distance|priority|time$|count/i.test(key) && sec.fields.find((f) => f.key === key)?.type !== 'bool'; }
function fieldLabel(sec, key) {
  if (key === 'running') return L('运行', 'Running');
  if (key === '.id') return 'ID';
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
  return s.key === key ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
}
function renderRows(sec) {
  const cols = (sec.columns || sec.fields.map((f) => f.key)).filter((c) => c !== '.id');
  const writable = sec.writable !== false;
  const rows = sortedRows(sec);
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('rowCount').textContent = rows.length + ' ' + t('rows');
  $('pageInfo').textContent = `${t('page')} ${state.page} ${t('of')} ${totalPages}`;
  $('prevPage').disabled = state.page <= 1; $('nextPage').disabled = state.page >= totalPages;
  const tb = $('tbody'); if (!tb) return;
  tb.innerHTML = pageRows.map((r) => {
    const nid = idNum(r['.id']);
    return `<tr data-id="${esc(r['.id'])}" title="RouterOS .id: ${esc(r['.id'])}" class="${state.selectedIds.has(r['.id']) ? 'selected' : ''}">
    ${writable ? `<td><input type="checkbox" class="check rowcheck" data-id="${esc(r['.id'])}" ${state.selectedIds.has(r['.id']) ? 'checked' : ''}></td>` : ''}
    <td class="num" style="color:var(--muted)">${Number.isFinite(nid) ? nid : esc(r['.id'] || '—')}</td>
    ${cols.map((c) => `<td${numCol(c, sec) ? ' class="num"' : ''}>${cellHtml(r, c, sec)}</td>`).join('')}
    ${writable ? `<td><div class="row-actions">
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
  if (/mac[-_]?address/i.test(key) && v) {
    /* MAC 厂商识别：内置 OUI 离线查表，知名厂商在 MAC 后附彩色小标 */
    const vendor = typeof ouiVendor === 'function' ? ouiVendor(v) : '';
    return `<span class="mac-cell" title="${esc(v)}${vendor ? ' · ' + esc(vendor) : ''}">${esc(v)}${vendor ? ` <em class="mac-vendor">${esc(vendor)}</em>` : ''}</span>`;
  }
  if (/bytes/i.test(key)) {
    /* 连接表：显示精确字节数，实时每秒递增可见；其余表格保留易读单位 */
    if (sec && (sec.id === 'connections' || sec.id === 'connections6')) {
      return `<span title="${fmtBytes(v)}">${fmtBytesExact(v)}</span>`;
    }
    return fmtBytes(v);
  }
  if (key === 'password' || key === 'private-key' || /pre-?shared-key/.test(key)) return '<span class="tag">••••••••</span>';
  const f = sec.fields.find((x) => x.key === key);
  if (f && f.type === 'bool') return boolOn(v) ? `<span class="tag blue">✓</span>` : '';
  if (key === 'chain') return `<span class="tag blue">${esc(v)}</span>`;
  if (key === 'action') return `<span class="tag ${/drop|reject/.test(v) ? 'red' : /accept|masquerade/.test(v) ? 'green' : ''}">${esc(v)}</span>`;
  return esc(v == null || v === '' ? '—' : v);
}

/* ================= 新增 / 编辑表单 ================= */
function openForm(sec, row) {
  const isEdit = !!row;
  const fields = sec.fields.filter((f) => f.key !== '.id' && f.type !== 'id');
  const opts = fieldOptions(sec);
  const body = fields.map((f) => {
    const val = row && row[f.key] != null ? row[f.key] : '';
    const label = esc(tx(f.label)) + (f.required ? ' <span class="req">*</span>' : '');
    let input;
    if (f.type === 'bool') input = `<div class="form-check"><input type="checkbox" id="f_${f.key}" ${boolOn(val) || (!isEdit && f.key === 'disabled' && false) ? 'checked' : ''}><label for="f_${f.key}" style="padding:0">${t('enabled')}</label></div>`;
    else if (f.type === 'select') input = `<select id="f_${f.key}">${['<option value=""></option>', ...(f.options || []).map((o) => `<option value="${esc(o)}" ${String(val) === o ? 'selected' : ''}>${esc(o || '—')}</option>`)].join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea id="f_${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
    else if (f.type === 'readonly') input = `<input type="text" id="f_${f.key}" value="${esc(val || '—')}" disabled>`;
    else if (f.type === 'interface') input = `<select id="f_${f.key}"><option value=""></option>${(opts.interfaces || []).map((n) => `<option value="${esc(n)}" ${val === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}${val && !(opts.interfaces || []).includes(val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ''}</select>`;
    else if (f.key === 'private-key' || f.key === 'preshared-key') input = `<div style="display:flex;gap:6px"><input type="text" id="f_${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}"><button type="button" class="btn" data-keygen="${f.key}" style="width:auto;flex:0 0 auto;margin:0">${t('wg_auto')}</button></div>`;
    else input = `<input type="${f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}" id="f_${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'data-required="1"' : ''}>`;
    return `<div class="form-row"><label>${label}</label><div>${input}${f.placeholder && f.type !== 'textarea' ? `<p class="form-hint">${esc(f.placeholder)}</p>` : ''}</div></div>`;
  }).join('');
  openModal((isEdit ? t('edit_title') : t('add_title')) + ' · ' + tx(sec.title), body,
    `<button class="btn" data-cancel>${t('cancel')}</button><button class="btn primary" data-save>${t('save')}</button>`,
    (m) => {
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
function renderTools() {
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('tools_title')}</h1><p>${t('tools_sub')}</p></div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>${t('system_title')}</h2></div></div>
        <div class="panel-body">
          <div class="card" style="border-left:3px solid var(--red);padding:12px 14px">
            <div style="font-weight:600;margin-bottom:6px">${t('reboot_title')}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">${t('reboot_msg')}</div>
            <button class="btn ghost-danger" id="rebootBtn">${t('reboot_title')}</button>
          </div>
          <div class="modal-note" style="margin-top:16px;font-size:11.5px;color:var(--muted)">
            <b>${t('note')}:</b> ${t('write_warn')}
          </div>
        </div></div>
      <div class="panel"><div class="panel-head"><div><h2>${t('backup_title')}</h2><p class="sub">${t('backup_msg')}</p></div></div>
        <div class="panel-body">
          <div class="form-row"><label>${t('backup_name')}</label><div><input type="text" id="backupName" value="auto-backup"></div></div>
          <button class="btn primary" id="backupRun">${t('backup_title')}</button>
        </div></div>
    </div>
    <div class="panel ping-panel" style="margin-top:14px"><div class="panel-head"><div><h2>${esc(L('网络诊断', 'Network diagnosis'))}</h2><p class="sub">ICMP echo · ${esc(L('逐条实时显示', 'results stream in real time'))}</p></div></div>
      <div class="panel-body">
        <div class="form-row"><label>${esc(L('目标地址', 'Target address'))}</label><div><input type="text" id="pingAddr" placeholder="${esc(L('填写 IP 或域名', 'Enter IP or hostname'))}" autocomplete="off" style="width:300px;max-width:100%"></div></div>
        <div class="form-row"><label>${esc(L('包数量', 'Packets'))}</label><div><input type="number" id="pingCount" min="1" value="5" style="width:110px"></div></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="pingRun" type="button">${esc(L('开始诊断', 'Start diagnosis'))}</button><button class="btn" id="pingStop" type="button">${esc(L('停止', 'Stop'))}</button><span id="pingStatus" class="topo-hint"></span></div>
        <div id="pingOut" class="ping-log"></div>
      </div></div>`;
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
    out.innerHTML = `<table><thead><tr><th>#</th><th>${esc(L('目标', 'Host'))}</th><th>${esc(L('时延', 'Time'))}</th><th>TTL</th><th>${esc(L('大小', 'Size'))}</th></tr></thead><tbody></tbody></table>`;
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
  /* 配置备份：导出为浏览器文件，下载到用户当前使用的设备 */
  $('backupRun').onclick = () => confirmModal(t('backup_title'), `${t('backup_msg')}<br><br>${t('backup_name')}: <b>${esc($('backupName').value)}</b><br><span class="form-hint">${esc(L('文件将下载到当前浏览器所在设备（电脑或手机），不会保存到 RouterOS。', 'The file is downloaded to the device running this browser, not stored on RouterOS.'))}</span>`, false, async () => {
    try {
      const name = ($('backupName').value.trim().replace(/[^a-zA-Z0-9_\-]/g, '') || 'config-backup');
      const qs = '?name=' + encodeURIComponent(name) + (state.deviceId ? '&device=' + encodeURIComponent(state.deviceId) : '');
      const r = await api('/api/export' + qs);
      const blob = new Blob([r.text || ''], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = href; a.download = name + '.rsc';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
    } catch (e) { toast(e.message, 'err'); }
  });
  $('rebootBtn').onclick = () => confirmModal(t('reboot_title'), `<b>${t('reboot_msg')}</b>`, true, async () => {
    try { await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reboot' }) }); toast(t('action_ok'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
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
    wgKeepalive: String(peer['persistent-keepalive'] || '25'), wgResponder: boolOn(peer.responder),
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
    `<div class="modal-note" style="margin-bottom:14px">${t('wg_qr_sub')}</div>
     <div class="wg-grid"><div class="wg-form">${form}</div>
       <div class="wg-qr-box"><canvas id="wgQrCanvas" width="220" height="220"></canvas>
         <div class="tag blue" style="margin-top:8px">WireGuard</div></div></div>
     <div class="modal-note" style="margin-top:8px;font-size:11px">${t('wg_qr_tip')}</div>
     <textarea id="wgConf" class="code" readonly style="width:100%;min-height:132px;margin-top:10px"></textarea>`,
    `<button class="btn" data-close>${t('cancel')}</button><button class="btn" id="wgSave">${t('wg_save_peer')}</button><button class="btn" id="wgCopy">${t('wg_copy')}</button><button class="btn primary" id="wgDownload">${t('wg_download')}</button>`,
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
    <div class="note-card">${t('device_hint')} · ${t('device_count')}: <b id="devCount">${state.devices.length}</b></div>
    <div class="panel" style="margin-top:14px"><div class="table-scroll"><table>
      <thead><tr><th>${t('device_name')}</th><th>${t('conn_host')}</th><th>${t('conn_port')}</th><th>${t('conn_user')}</th>
        <th>${t('device_status')}</th><th>${t('conn_demo')}</th><th style="width:270px"></th></tr></thead>
      <tbody id="devBody"></tbody></table></div></div>
    <div class="grid-2" style="margin-top:14px">
      <div class="panel"><div class="panel-head"><div><h2>${t('conn_web_port')}</h2><p class="sub">${t('conn_web_port_hint')}</p></div></div>
        <div class="panel-body"><div class="form-row"><label>${t('conn_web_port')}</label>
          <div><input type="number" id="cfgWebPort" min="1" max="65535" value="${esc(state.webPort || 10086)}">
          <p class="form-hint">${t('conn_host_port')}: ${esc(state.hostPort || state.webPort || 10086)}</p></div></div>
          <button class="btn primary" id="devSavePort">${t('save')}</button></div></div>
      <div class="panel"><div class="panel-head"><div><h2>${t('conn_security')}</h2><p class="sub">${esc(t('note'))}</p></div></div>
        <div class="panel-body"><div class="note-card warn">${t('conn_security_tip')}</div>
          <div class="modal-note"><b>RouterOS CLI:</b><pre class="code">/user group add name=webui policy=read,api
/user add name=webui group=webui password=${L('强密码', 'strong-password')}
/ip service set api address=10.0.0.0/24</pre></div>
          <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
            <div style="font-weight:600;margin-bottom:6px">${t('login_title')}</div>
            <div class="modal-note" style="font-size:11.5px;margin-bottom:10px">${t('login_hint')}</div>
            ${state.authEnabled ? `<div class="modal-note" style="margin-bottom:8px">${t('login_current')}: <b>${esc(state.authUser)}</b></div>` : ''}
            <div class="form-row"><label>${t('login_user')}</label><div><input id="authUser" value="${esc(state.authUser || 'admin')}" autocomplete="off"><p class="form-hint">${t('login_user_hint')}</p></div></div>
            <div class="form-row"><label>${t('login_pass')}</label><div><input type="password" id="authPass" autocomplete="new-password" placeholder="••••••"><p class="form-hint">${t('login_pass_hint')}</p></div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn primary" id="authSave">${t('login_enable')}</button>
              ${state.authEnabled ? `<button class="btn ghost-danger" id="authDisable">${t('login_disable')}</button>` : ''}
            </div>
            <div id="authResult" style="margin-top:10px"></div>
          </div>
        </div></div>
    </div>`;
  const renderRows = (force) => {
    const tb = $('devBody'); if (!tb) return;
    /* 状态签名去重：WS 每秒帧只在真正变化时重画，避免打断点击 */
    const sig = state.devices.map((d) => [d.id, d.status && d.status.mode, d.status && d.status.connected, d.demo,
      d.id === state.devicePrimary, d.id === state.deviceId].join(':')).join('|');
    if (!force && tb.dataset.sig === sig) return;
    tb.dataset.sig = sig;
    $('devCount').textContent = state.devices.length;
    tb.innerHTML = state.devices.map((d) => `<tr data-dev="${esc(d.id)}">
      <td><b>${esc(d.name)}</b>${d.id === state.devicePrimary ? ' <span class="tag blue">' + esc(t('device_current')) + '</span>' : ''}</td>
      <td>${esc(d.host)}</td><td>${esc(d.port)}</td><td>${esc(d.user)}</td>
      <td>${deviceStatusTag(d)}</td><td>${d.demo ? t('yes') : t('no')}</td>
      <td><div class="row-actions">
        ${d.id === state.deviceId ? '<span class="tag blue">' + esc(t('device_active')) + '</span>' : `<button class="icon-btn" data-act="use" title="${t('device_primary')}">✓</button>`}
        <button class="icon-btn" data-act="edit" title="${t('device_edit')}">✎</button>
        <button class="icon-btn" data-act="reconn" title="${t('device_reconnect')}">↻</button>
        <button class="icon-btn del" data-act="del" title="${t('device_del')}">✕</button>
      </div></td></tr>`).join('') || `<tr><td colspan="7" class="empty">${t('no_data')}</td></tr>`;
    tb.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
      const id = b.closest('tr').dataset.dev;
      const dev = state.devices.find((x) => x.id === id);
      const act = b.dataset.act;
      if (act === 'use') setPrimary(id);
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
    const body = `
      <div class="form-row"><label>${t('device_name')} <span class="req">*</span></label><div><input id="dvName" value="${esc(dev ? dev.name : '')}"></div></div>
      <div class="form-row"><label>${t('conn_host')} <span class="req">*</span></label><div><input id="dvHost" value="${esc(dev ? dev.host : '')}" placeholder="10.0.0.1"></div></div>
      <div class="form-row"><label>${t('conn_port')} <span class="req">*</span></label><div><input type="number" id="dvPort" min="1" max="65535" value="${esc(dev ? dev.port : 8728)}"></div></div>
      <div class="form-row"><label>${t('conn_user')} <span class="req">*</span></label><div><input id="dvUser" value="${esc(dev ? dev.user : '')}" autocomplete="off"></div></div>
      <div class="form-row"><label>${t('conn_password')}</label><div><input type="password" id="dvPass" autocomplete="new-password" placeholder="${esc(t('device_no_password'))}"></div></div>
      <div class="form-row"><label>${t('conn_tls')}</label><div class="form-check"><input type="checkbox" id="dvTls" ${dev && dev.tls ? 'checked' : ''}></div></div>
      <div class="form-row"><label>${t('conn_demo')}</label><div class="form-check"><input type="checkbox" id="dvDemo" ${dev && dev.demo ? 'checked' : ''}></div></div>
      <div id="dvResult" style="margin-top:10px"></div>`;
    openModal(isNew ? t('device_add') : t('device_edit'), body,
      `<button class="btn" data-close>${t('cancel')}</button><button class="btn" id="dvTest">${t('device_test')}</button><button class="btn primary" id="dvSave">${t('save')}</button>`,
      (m) => {
        m.querySelector('[data-close]').onclick = closeModal;
        const vals = () => ({ name: m.querySelector('#dvName').value.trim(), host: m.querySelector('#dvHost').value.trim(),
          port: Number(m.querySelector('#dvPort').value), user: m.querySelector('#dvUser').value.trim(),
          password: m.querySelector('#dvPass').value, tls: m.querySelector('#dvTls').checked, demo: m.querySelector('#dvDemo').checked });
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
