'use strict';

/* ================= 配置表格页 ================= */
async function loadRows(sec) {
  const d = await api('/api/config?section=' + encodeURIComponent(sec.id));
  state.rows = d.rows || []; state.configDemo = !!d.demo;
  if (sec.id === 'connections') state.connRows = state.rows;
  return state.rows;
}

function renderConfigPage(sec) {
  const cols = sec.columns || sec.fields.map((f) => f.key);
  const writable = sec.writable !== false;
  $('content').innerHTML = `
    <div class="page-head">
      <div><h1>${esc(tx(sec.title))}</h1><p>${esc(sec.path || '')}${!writable ? ' · ' + t('readonly_tip') : ''}</p></div>
      <div class="page-actions">
        ${writable ? `<button class="btn primary" id="btnAdd">+ ${t('add')}</button>` : ''}
        ${writable && sec.toggle !== false ? `<button class="btn" id="btnEnable">${t('enable')}</button><button class="btn" id="btnDisable">${t('disable')}</button>` : ''}
        ${writable ? `<button class="btn ghost-danger" id="btnDelete">${t('delete')}</button>` : ''}
        <button class="btn" id="btnRefresh">${t('refresh')}</button>
      </div>
    </div>
    ${state.configDemo ? `<div class="card" style="border-left:3px solid var(--amber);margin-bottom:14px;padding:10px 14px;font-size:11.5px;color:#8a6514">${t('demo_mode_tip')}</div>` : ''}
    <div class="panel">
      <div class="table-tools">
        <input type="search" id="rowSearch" placeholder="${t('search')}…" value="${esc(state.rowFilter)}">
        <span class="tag" id="rowCount">0 ${t('rows')}</span>
        <span class="spacer"></span>
        <span class="tag">${state.mode === 'live' && !state.configDemo ? 'LIVE' : 'DEMO'}</span>
      </div>
      <div class="table-scroll"><table><thead><tr>
        ${writable ? '<th style="width:36px"><input type="checkbox" class="check" id="checkAll"></th>' : ''}
        ${cols.map((c) => `<th${numCol(c, sec) ? ' class="num"' : ''}>${esc(fieldLabel(sec, c))}</th>`).join('')}
        ${writable ? `<th style="width:${sec.id === 'wireguard' || sec.id === 'wgPeers' ? 142 : 110}px"></th>` : ''}
      </tr></thead><tbody id="tbody"></tbody></table></div>
      <div class="pager"><span id="pageInfo"></span><button id="prevPage">${t('prev')}</button><button id="nextPage">${t('next')}</button></div>
    </div>`;

  $('btnRefresh').onclick = () => loadRows(sec).then(() => { renderConfigPage(sec); toast(t('refresh') + ' OK', 'ok'); }).catch((e) => toast(e.message, 'err'));
  if (writable) {
    $('btnAdd').onclick = () => openForm(sec, null);
    $('btnEnable').onclick = () => bulk(sec, 'enable');
    $('btnDisable').onclick = () => bulk(sec, 'disable');
    $('btnDelete').onclick = () => confirmModal(t('confirm_delete'), `<b>${t('confirm_delete_msg')}</b><br><br>${t('selected')}: <b>${state.selectedIds.size}</b> ${t('row_one')}`, true,
      () => bulk(sec, 'remove'));
  }
  $('rowSearch').oninput = (e) => { state.rowFilter = e.target.value; state.page = 1; renderRows(sec); };
  const ca = $('checkAll'); if (ca) ca.onchange = (e) => {
    const rows = filteredRows(sec);
    rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize).forEach((r) => e.target.checked ? state.selectedIds.add(r['.id']) : state.selectedIds.delete(r['.id']));
    renderRows(sec);
  };
  $('prevPage').onclick = () => { if (state.page > 1) { state.page--; renderRows(sec); } };
  $('nextPage').onclick = () => { if (state.page < Math.max(1, Math.ceil(filteredRows(sec).length / state.pageSize))) { state.page++; renderRows(sec); } };
  loadRows(sec).then(() => renderRows(sec)).catch((e) => { $('tbody').innerHTML = `<tr><td colspan="20" class="empty">${t('load_fail')}: ${esc(e.message)}</td></tr>`; });
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
function renderRows(sec) {
  const cols = sec.columns || sec.fields.map((f) => f.key);
  const writable = sec.writable !== false;
  const rows = filteredRows(sec);
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('rowCount').textContent = rows.length + ' ' + t('rows');
  $('pageInfo').textContent = `${t('page')} ${state.page} ${t('of')} ${totalPages}`;
  $('prevPage').disabled = state.page <= 1; $('nextPage').disabled = state.page >= totalPages;
  const tb = $('tbody'); if (!tb) return;
  tb.innerHTML = pageRows.map((r) => `<tr data-id="${esc(r['.id'])}" class="${state.selectedIds.has(r['.id']) ? 'selected' : ''}">
    ${writable ? `<td><input type="checkbox" class="check rowcheck" data-id="${esc(r['.id'])}" ${state.selectedIds.has(r['.id']) ? 'checked' : ''}></td>` : ''}
    ${cols.map((c) => `<td${numCol(c, sec) ? ' class="num"' : ''}>${cellHtml(r, c, sec)}</td>`).join('')}
    ${writable ? `<td><div class="row-actions">
      ${sec.toggle !== false ? `<button class="icon-btn" data-act="toggle" title="${boolOn(r.disabled) ? t('enable') : t('disable')}">${boolOn(r.disabled) ? '○' : '●'}</button>` : ''}
      ${sec.id === 'wireguard' || sec.id === 'wgPeers' ? `<button class="icon-btn qr" data-act="qr" title="${t('wg_qr')}">▣</button>` : ''}
      <button class="icon-btn" data-act="edit" title="${t('edit')}">✎</button>
      <button class="icon-btn del" data-act="del" title="${t('delete')}">✕</button>
    </div></td>` : ''}
  </tr>`).join('') || `<tr><td colspan="20" class="empty">${t('no_data')}</td></tr>`;
  tb.querySelectorAll('.rowcheck').forEach((c) => c.onchange = () => { c.checked ? state.selectedIds.add(c.dataset.id) : state.selectedIds.delete(c.dataset.id); c.closest('tr').classList.toggle('selected', c.checked); });
  tb.querySelectorAll('[data-act]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.closest('tr').dataset.id;
    const act = b.dataset.act;
    if (act === 'edit') { const row = state.rows.find((x) => x['.id'] === id); openForm(sec, row); }
    else if (act === 'qr') { const row = state.rows.find((x) => x['.id'] === id); openWireguardQr(row, sec); }
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
  if (/bytes/i.test(key)) return fmtBytes(v);
  if (key === 'password' || key === 'private-key' || /pre-shared-key/.test(key)) return '<span class="tag">••••••••</span>';
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
    else if (f.type === 'readonly') input = `<input type="text" value="${esc(val || '—')}" disabled>`;
    else if (f.type === 'interface') input = `<select id="f_${f.key}"><option value=""></option>${(opts.interfaces || []).map((n) => `<option value="${esc(n)}" ${val === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}${val && !(opts.interfaces || []).includes(val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ''}</select>`;
    else input = `<input type="${f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}" id="f_${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'data-required="1"' : ''}>`;
    return `<div class="form-row"><label>${label}</label><div>${input}${f.placeholder && f.type !== 'textarea' ? `<p class="form-hint">${esc(f.placeholder)}</p>` : ''}</div></div>`;
  }).join('');
  openModal((isEdit ? t('edit_title') : t('add_title')) + ' · ' + tx(sec.title), body,
    `<button class="btn" data-cancel>${t('cancel')}</button><button class="btn primary" data-save>${t('save')}</button>`,
    (m) => {
      m.querySelector('[data-cancel]').onclick = closeModal;
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
        try { const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); closeModal(); toast(`${t('saved_ok')} (${r.changed || 1})`, 'ok'); await loadRows(sec); renderConfigPage(sec); }
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
    toast(`${t('action_ok')} (${r.changed || 0})`, 'ok');
    state.selectedIds.clear(); await loadRows(sec); renderConfigPage(sec);
  } catch (e) { toast(e.message, 'err'); }
}

/* ================= 工具 / 系统操作 ================= */
function renderTools() {
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('tools_title')}</h1><p>${t('tools_sub')}</p></div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>${t('ping_title')}</h2><p class="sub">ICMP echo · 5 packets</p></div></div>
        <div class="panel-body">
          <div class="form-row"><label>${t('ping_addr')}</label><div><input type="text" id="pingAddr" value="10.0.0.1"></div></div>
          <button class="btn primary" id="pingRun">${t('ping_run')}</button>
          <div id="pingOut" style="margin-top:14px"></div>
        </div></div>
      <div class="panel"><div class="panel-head"><div><h2>${t('backup_title')}</h2><p class="sub">${t('backup_msg')}</p></div></div>
        <div class="panel-body">
          <div class="form-row"><label>${t('backup_name')}</label><div><input type="text" id="backupName" value="auto-backup"></div></div>
          <button class="btn primary" id="backupRun">${t('backup_title')}</button>
          <div id="backupOut" style="margin-top:14px"></div>
        </div></div>
    </div>
    <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>${t('system_title')}</h2></div></div>
      <div class="panel-body">
        <div class="card" style="border-left:3px solid var(--red);padding:12px 14px">
          <div style="font-weight:600;margin-bottom:6px">${t('reboot_title')}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">${t('reboot_msg')}</div>
          <button class="btn ghost-danger" id="rebootBtn">${t('reboot_title')}</button>
        </div>
        <div class="modal-note" style="margin-top:16px;font-size:11.5px;color:var(--muted)">
          <b>${t('note')}:</b> ${t('write_warn')}
        </div>
      </div></div>`;
  $('pingRun').onclick = async () => {
    try {
      const r = await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ping', params: { address: $('pingAddr').value } }) });
      $('pingOut').innerHTML = `<table><thead><tr><th>#</th><th>Host</th><th>Time</th><th>TTL</th><th>Size</th></tr></thead><tbody>${(r.rows || []).map((x) => `<tr><td>${esc(x.seq || x['.id'] || '')}</td><td>${esc(x.host || x.address || '')}</td><td>${esc(x.time || '')}</td><td>${esc(x.ttl || '')}</td><td>${esc(x['size'] || '')}</td></tr>`).join('')}</tbody></table>`;
    } catch (e) { toast(e.message, 'err'); }
  };
  $('backupRun').onclick = () => confirmModal(t('backup_title'), `${t('backup_msg')}<br><br>${t('backup_name')}: <b>${esc($('backupName').value)}</b>`, false, async () => {
    try { const r = await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'backup', params: { name: $('backupName').value } }) }); $('backupOut').innerHTML = `<div class="tag green">OK · ${esc(r.name)}.backup ${r.demo ? '(demo)' : ''}</div>`; toast(t('action_ok'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  $('rebootBtn').onclick = () => confirmModal(t('reboot_title'), `<b>${t('reboot_msg')}</b>`, true, async () => {
    try { await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reboot' }) }); toast(t('action_ok'), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
}

/* ================= WireGuard 扫码添加 ================= */
const WG_FIELDS = [
  ['wgAddr', 'wg_addr'], ['wgPriv', 'wg_priv'], ['wgDns', 'wg_dns'], ['wgPub', 'wg_pub'],
  ['wgEndpoint', 'wg_endpoint'], ['wgAllowed', 'wg_allowed'], ['wgKeepalive', 'wg_keepalive'],
];
function wgConfigText(v) {
  return `[Interface]\nAddress = ${v.wgAddr}\nPrivateKey = ${v.wgPriv}\nDNS = ${v.wgDns}\n\n[Peer]\nPublicKey = ${v.wgPub}\nAllowedIPs = ${v.wgAllowed}\nEndpoint = ${v.wgEndpoint}\nPersistentKeepalive = ${v.wgKeepalive}\n`;
}
async function openWireguardQr(row, sec) {
  let ifaces = [], peers = [];
  try { ifaces = (await api('/api/config?section=wireguard')).rows || []; } catch (e) { /* ignore */ }
  try { peers = (await api('/api/config?section=wgPeers')).rows || []; } catch (e) { /* ignore */ }
  const iface = ifaces.find((x) => x.name === (row && row.interface)) || ifaces[0] || {};
  const peer = (row && typeof row === 'object' ? row : null) || peers[0] || {};
  const host = (state.latest && state.latest.host) || '10.0.0.1';
  const defaults = {
    wgAddr: String(peer['allowed-address'] || '').split(',')[0] || '10.0.9.2/32',
    wgPriv: peer['private-key'] || 'oE7tM2QwX9vK4pL6nR8sY1aB3cD5eF7gH0jKlMnOpQ=',
    wgDns: '10.0.0.1',
    wgPub: peer['public-key'] || iface['public-key'] || '',
    wgEndpoint: peer.endpoint || host + ':' + (iface['listen-port'] || '13231'),
    wgAllowed: '0.0.0.0/0', wgKeepalive: String(peer['persistent-keepalive'] || '25'),
  };
  const form = WG_FIELDS.map(([id, key]) => `<div class="form-row"><label>${t(key)}</label><div><input type="text" id="${id}" value="${esc(defaults[id])}"></div></div>`).join('');
  openModal(t('wg_qr_title'),
    `<div class="modal-note" style="margin-bottom:14px">${t('wg_qr_sub')}</div>
     <div class="wg-grid"><div>${form}</div>
       <div class="wg-qr-box"><canvas id="wgQrCanvas" width="220" height="220"></canvas>
         <div class="tag blue" style="margin-top:8px">WireGuard</div></div></div>
     <div class="modal-note" style="margin-top:8px;font-size:11px">${t('wg_qr_tip')}</div>
     <textarea id="wgConf" class="code" readonly style="width:100%;min-height:132px;margin-top:10px"></textarea>`,
    `<button class="btn" data-close>${t('cancel')}</button><button class="btn" id="wgCopy">${t('wg_copy')}</button><button class="btn primary" id="wgDownload">${t('wg_download')}</button>`,
    (m) => {
      m.style.width = 'min(780px, 100%)';
      m.querySelector('[data-close]').onclick = closeModal;
      const qr = window.QRCode || window.ROSQR;
      const draw = () => {
        const v = {}; WG_FIELDS.forEach(([id]) => { v[id] = m.querySelector('#' + id).value.trim(); });
        const text = wgConfigText(v);
        m.querySelector('#wgConf').value = text;
        const cv = m.querySelector('#wgQrCanvas');
        if (!qr) { cv.style.display = 'none'; return; }
        qr.toCanvas(cv, text, { width: 220, margin: 1, color: { dark: cssVar('--ink', '#1a2340'), light: '#ffffff' } }, (e) => { if (e) console.warn('[wg] qr', e.message); });
      };
      WG_FIELDS.forEach(([id]) => { m.querySelector('#' + id).oninput = draw; });
      draw();
      m.querySelector('#wgCopy').onclick = async () => {
        const text = m.querySelector('#wgConf').value;
        try { await navigator.clipboard.writeText(text); toast(t('wg_copy') + ' OK', 'ok'); }
        catch (e) { m.querySelector('#wgConf').select(); document.execCommand('copy'); toast(t('wg_copy') + ' OK', 'ok'); }
      };
      m.querySelector('#wgDownload').onclick = () => {
        const blob = new Blob([m.querySelector('#wgConf').value], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wg-client.conf'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    });
}

/* ================= 连接设置（无需编辑 .env） ================= */
function renderConnectionSettings() {
  $('content').innerHTML = `
    <div class="page-head"><div><h1>${t('conn_settings')}</h1><p>${t('conn_settings_sub')}</p></div>
      <div class="page-actions"><button class="btn" id="connRefresh">${t('refresh')}</button></div></div>
    <div class="note-card"><b>${t('conn_current')}:</b> <span id="connCurrent">${t('loading')}</span><br>${t('conn_tip')}</div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>RouterOS API</h2><p class="sub">${esc(t('conn_settings'))}</p></div></div>
        <div class="panel-body">
          <div class="form-row"><label>${t('conn_host')} <span class="req">*</span></label><div><input type="text" id="cfgHost" placeholder="10.0.0.1"></div></div>
          <div class="form-row"><label>${t('conn_port')} <span class="req">*</span></label><div><input type="number" id="cfgPort" min="1" max="65535" value="8728"></div></div>
          <div class="form-row"><label>${t('conn_user')} <span class="req">*</span></label><div><input type="text" id="cfgUser" autocomplete="username"></div></div>
          <div class="form-row"><label>${t('conn_password')}</label><div><input type="password" id="cfgPass" autocomplete="current-password" placeholder="${esc(t('conn_masked'))}"></div></div>
          <div class="form-row"><label>${t('conn_tls')}</label><div class="form-check"><input type="checkbox" id="cfgTls"></div></div>
          <div class="form-row"><label>${t('conn_demo')}</label><div class="form-check"><input type="checkbox" id="cfgDemo"></div></div>
          <div class="form-row"><label>${t('conn_web_port')}</label><div><input type="number" id="cfgWebPort" min="1" max="65535" value="3000"><p class="form-hint">${t('conn_web_port_hint')}</p></div></div>
          <div style="display:flex;gap:8px;margin-top:18px">
            <button class="btn" id="connTest">${t('conn_test')}</button>
            <button class="btn primary" id="connSave">${t('conn_save')}</button>
          </div>
          <div id="connResult" style="margin-top:14px"></div>
        </div></div>
      <div class="panel"><div class="panel-head"><div><h2>${t('conn_security')}</h2><p class="sub">${esc(t('note'))}</p></div></div>
        <div class="panel-body">
          <div class="note-card warn">${t('conn_security_tip')}</div>
          <div class="modal-note"><b>RouterOS CLI:</b>
            <pre class="code">/user group add name=webui policy=read,api
/user add name=webui group=webui password=${L('强密码', 'strong-password')}
/ip service set api address=10.0.0.0/24</pre></div>
          <div class="modal-note" style="margin-top:14px"><b>${t('conn_current')}:</b>
            <div id="connDetail" style="margin-top:6px;color:var(--muted)">${t('loading')}</div></div>
        </div></div>
    </div>`;

  function values() {
    return {
      host: $('cfgHost').value.trim(), port: Number($('cfgPort').value),
      user: $('cfgUser').value.trim(), password: $('cfgPass').value,
      tls: $('cfgTls').checked, demo: $('cfgDemo').checked, webPort: Number($('cfgWebPort').value),
    };
  }
  function renderCurrent(s) {
    $('connCurrent').innerHTML = `<span class="tag ${s.connected ? 'green' : 'amber'}">${esc(s.connected ? t('live') : t(s.demo ? 'demo' : (s.mode || 'connecting')))}</span>
      &nbsp;${esc(s.host)}:${esc(s.port)} · ${esc(s.user)} · ${t('conn_web_port')} ${esc(s.webPort || 3000)}`;
    $('connDetail').innerHTML = `${esc(s.host)}:${esc(s.port)}<br>${t('conn_user')}: ${esc(s.user)}<br>${t('conn_password')}: ${s.passwordSet ? '••••••••' + ' (' + t('conn_masked') + ')' : '—'}<br>API-SSL: ${s.tls ? t('yes') : t('no')}<br>${t('conn_host_port')}: ${esc(s.hostPort || s.webPort || 3000)} · ${t('conn_web_port')}: ${esc(s.webPort || 3000)}`;
    if (s.user) $('adminName').textContent = s.user;
  }
  function load() {
    api('/api/settings').then((s) => {
      $('cfgHost').value = s.host || ''; $('cfgPort').value = s.port || 8728;
      $('cfgUser').value = s.user || ''; $('cfgTls').checked = !!s.tls; $('cfgDemo').checked = !!s.demo;
      $('cfgWebPort').value = s.webPort || 3000;
      $('cfgPass').placeholder = s.passwordSet ? t('conn_masked') : '—';
      renderCurrent(s);
    }).catch((e) => toast(e.message, 'err'));
  }
  $('connRefresh').onclick = load;
  $('connTest').onclick = async () => {
    const b = $('connTest'); b.disabled = true; $('connResult').innerHTML = `<span class="tag amber">${t('loading')}</span>`;
    try {
      const r = await api('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values()) });
      $('connResult').innerHTML = `<span class="tag green">✓ ${t('conn_test_ok')}${r.version ? ' · RouterOS ' + esc(r.version) : ''}</span>`;
      toast(t('conn_test_ok'), 'ok');
    } catch (e) { $('connResult').innerHTML = `<span class="tag red">✕ ${t('conn_test_fail')}: ${esc(e.message)}</span>`; toast(e.message, 'err'); }
    finally { b.disabled = false; }
  };
  $('connSave').onclick = () => confirmModal(t('conn_save'), `${t('conn_host')}: <b>${esc($('cfgHost').value)}</b><br>${t('conn_user')}: <b>${esc($('cfgUser').value)}</b><br>${t('conn_demo')}: <b>${$('cfgDemo').checked ? t('yes') : t('no')}</b>`, false, async () => {
    try {
      const s = await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values()) });
      toast(s.restartRequired ? t('conn_restart') : t('conn_saved'), s.restartRequired ? '' : 'ok'); renderCurrent(s);
      $('cfgPass').value = '';
      setTimeout(() => load(), 1500);
    } catch (e) { toast(e.message, 'err'); }
  });
  load();
}

/* 所有脚本就绪后启动 */
boot();
