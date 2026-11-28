'use strict';
/* ============================================================
   DHCP & DNS v3 · 设计稿 dhcp-dns.html 复刻
   - 覆盖 section：dhcpLeases / dhcpNetworks / dhcpServers / dhcpClients /
     dhcpOptions / dhcpOptionSets / dnsStatic / dns
   - 数据全部来自 /api/config?section=<id>，写入 /api/config（POST）
   - 表单字段由 state.schema.sections[*].fields 动态生成（只读字段不可编辑）
   - 结构：page-head + 4 KPI + span8 主卡片（tab/toolbar/dt/table-foot）
           + span4 rail（地址池 / DNS 服务 / 静态 DNS）
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ex = esc;
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const boolOn = (v) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
  const uniq = (arr) => arr.filter((x, i) => x && arr.indexOf(x) === i);
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d == null ? 0 : d); };
  /* L(zh,en) 复用 app.js 顶层定义；此处不遮蔽 */

  const SECTIONS = [
    'dhcpLeases', 'dhcpNetworks', 'dhcpServers', 'dhcpClients',
    'dhcpOptions', 'dhcpOptionSets', 'dnsStatic', 'dns',
  ];
  const TABS = [
    ['dhcpLeases', '租约', 'Leases'],
    ['dhcpNetworks', '网络', 'Networks'],
    ['dhcpServers', '服务端', 'Servers'],
    ['dhcpClients', '客户端', 'Clients'],
    ['dhcpOptions', '选项', 'Options'],
    ['dhcpOptionSets', '选项集', 'Option sets'],
    ['dnsStatic', '静态 DNS', 'Static DNS'],
    ['dns', 'DNS 服务', 'DNS service'],
  ];
  const FALLBACK = {
    dhcpLeases: ['DHCP 租约', 'DHCP leases'], dhcpNetworks: ['DHCP 网络', 'DHCP networks'],
    dhcpServers: ['DHCP 服务端', 'DHCP servers'], dhcpClients: ['DHCP 客户端', 'DHCP clients'],
    dhcpOptions: ['DHCP 选项', 'DHCP options'], dhcpOptionSets: ['DHCP 选项集', 'DHCP option sets'],
    dnsStatic: ['静态 DNS', 'Static DNS'], dns: ['DNS 服务', 'DNS service'],
  };
  const LEASE_SECS = ['dhcpLeases', 'dhcpClients'];
  const PAGE_SIZE = 12;

  const R = {
    section: 'dhcpLeases', q: '', chip: 'all', page: 1,
    data: {}, err: {}, loadedAt: 0, loading: false,
    interfaces: [], pools: [],
  };

  /* ---------- 基础工具 ---------- */
  function sectionDef(sec) {
    return (state.schema && state.schema.sections || []).find((s) => s.id === sec) || null;
  }
  function fieldsOf(sec) {
    const d = sectionDef(sec);
    return (d && Array.isArray(d.fields)) ? d.fields : [];
  }
  function secTitle(sec) {
    const d = sectionDef(sec), f = FALLBACK[sec] || [sec, sec];
    return d && d.title ? L(d.title.zh, d.title.en) : L(f[0], f[1]);
  }
  function secPath(sec) { const d = sectionDef(sec); return d && d.path || ''; }
  function canWrite(sec) { const d = sectionDef(sec); return !!d && d.writable !== false && !d.readonly; }
  function canToggle(sec) { const d = sectionDef(sec); return canWrite(sec) && !!d && d.toggle !== false; }
  function rows(sec) { return R.data[sec] || []; }
  function findRow(sec, id) { return rows(sec).find((r) => String(r['.id']) === String(id)) || null; }
  function isOn(r) { return !boolOn(r && r.disabled); }
  function tabLabel(sec) {
    const t = TABS.find((x) => x[0] === sec);
    return t ? L(t[1], t[2]) : secTitle(sec);
  }
  function relTime(ts) {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 2) return L('刚刚', 'just now');
    if (s < 60) return s + L(' 秒前', 's ago');
    return Math.round(s / 60) + L(' 分钟前', ' min ago');
  }
  function say(msg, kind) {
    const u = window.UI;
    if (u && typeof u.toast === 'function') u.toast(msg, kind || 'ok');
    else if (typeof toast === 'function') toast(msg, kind || 'ok');
  }
  function write(sec, action, ids, values) {
    const body = { section: sec, action };
    if (ids && ids.length) body.ids = ids;
    if (values) body.values = values;
    return api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function statusDot(on, zh, en, offZh, offEn) {
    return `<span class="dot ${on ? 'is-green' : 'is-muted'}"></span>${esc(on ? L(zh, en) : L(offZh || '未启用', offEn || 'Inactive'))}`;
  }
  function kvRow(k, v, cls) {
    return `<div class="kv"><span>${esc(k)}</span><b class="${cls || ''}">${esc(v == null || v === '' ? '—' : v)}</b></div>`;
  }
  function miniCard(title, sub, body) {
    return `<section class="card"><div class="card-head"><div><h2 class="card-title">${esc(title)}</h2><div class="card-sub">${esc(sub)}</div></div></div><div class="rail-body">${body}</div></section>`;
  }

  /* ---------- 地址池工具（真实 pools 数据，用于 KPI / rail） ---------- */
  function ipToLong(ip) {
    const p = String(ip || '').trim().split('.').map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
  }
  function rangeBounds(range) {
    const s = String(range || '').trim();
    let m = s.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (m) {
      const base = ipToLong(m[1]), bits = Number(m[2]);
      if (base == null || bits < 0 || bits > 32) return null;
      const size = Math.pow(2, 32 - bits);
      return [base, ((base + size - 1) >>> 0)];
    }
    m = s.match(/^(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)$/);
    if (m) {
      const a = ipToLong(m[1]), b = ipToLong(m[2]);
      return (a == null || b == null || b < a) ? null : [a, b];
    }
    const ip = ipToLong(s);
    return ip == null ? null : [ip, ip];
  }
  function poolStats() {
    const bounds = [];
    let total = 0;
    R.pools.forEach((p) => {
      String(p.ranges || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((rg) => {
        const b = rangeBounds(rg);
        if (b) { bounds.push(b); total += (b[1] >= b[0] ? (b[1] - b[0] + 1) : 0); }
      });
    });
    let used = 0, reserved = 0;
    rows('dhcpLeases').forEach((l) => {
      const ip = ipToLong(l.address);
      if (ip == null || !bounds.some((b) => ip >= b[0] && ip <= b[1])) return;
      /* 静态租约（dynamic=false）在 RouterOS /ip/pool/used 中记为 reserved */
      if ('dynamic' in l && !boolOn(l.dynamic)) reserved++;
      else used++;
    });
    const free = Math.max(0, total - used - reserved);
    return {
      total: total, used: used, reserved: reserved, free: free,
      pct: total ? (used * 100 / total) : 0,
      reservedPct: total ? (reserved * 100 / total) : 0,
      freePct: total ? (free * 100 / total) : 0,
      hasPool: total > 0,
    };
  }
  function dnsRow() { return rows('dns')[0] || {}; }
  /* RouterOS 的 cache-size / cache-used 以 KiB 字符串返回（如 "4096KiB"），统一换算成 KiB */
  function kib(v) {
    if (v == null || v === '') return null;
    const m = String(v).trim().match(/^([\d.]+)\s*(KiB|MiB|GiB|B)?/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    const unit = (m[2] || 'KiB').toLowerCase();
    if (unit === 'b') return n / 1024;
    if (unit === 'mib') return n * 1024;
    if (unit === 'gib') return n * 1024 * 1024;
    return n;
  }
  function dnsCache() {
    const d = dnsRow();
    const total = kib(d['cache-size']);
    const used = kib(d['cache-used']);
    return {
      total, used,
      pct: total > 0 && used != null ? Math.min(100, used * 100 / total) : null,
      totalLabel: d['cache-size'] ? String(d['cache-size']) : '—',
      usedLabel: d['cache-used'] ? String(d['cache-used']) : '—',
    };
  }
  /* /ip/dns 的 servers 同时承载 IPv4 / IPv6；按地址形态拆分，仅用于展示与编辑 */
  function splitDnsServers(v) {
    const parts = String(v == null ? '' : v).split(/[,\s]+/).filter(Boolean);
    return {
      v4: parts.filter((x) => x.indexOf(':') < 0).join(', '),
      v6: parts.filter((x) => x.indexOf(':') >= 0).join(', '),
    };
  }
  function poolLabel() {
    const p = R.pools[0];
    if (!p) return L('未配置地址池', 'No pool configured');
    return String(p.name || '') + ' · ' + String(p.ranges || '');
  }

  /* ---------- 真实数据读取 ---------- */
  async function loadAll(force) {
    if (R.loading) return;
    if (!force && R.loadedAt && Date.now() - R.loadedAt < 8000) { safePaint(); return; }
    R.loading = true;
    const all = SECTIONS.concat(['pools']);
    const results = await Promise.all(all.map((s) => api('/api/config?section=' + encodeURIComponent(s)).then((d) => {
      const list = (d && d.rows) || [];
      const err = (d && d.offline && !list.length) ? L('路由器未连接，未读取到真实配置', 'Router offline - no live configuration') : '';
      return { rows: list, err, ok: true };
    }).catch((e) => ({ rows: null, err: (e && e.message) || L('加载失败', 'Load failed'), ok: false }))));
    all.forEach((s, i) => {
      const res = results[i];
      if (res && res.rows) R.data[s] = res.rows;
      if (res && res.err) R.err[s] = res.err;
      else delete R.err[s];
    });
    R.pools = R.data.pools || [];
    delete R.data.pools;
    R.loadedAt = Date.now();
    R.loading = false;
    /* 接口名仅用于 interface 字段下拉，失败不影响页面 */
    try {
      const d = await api('/api/config?section=interfaces');
      R.interfaces = uniq(((d && d.rows) || []).map((r) => r.name));
    } catch (e) { /* ignore */ }
    if (SECTIONS.indexOf(state.section) >= 0) safePaint();
  }
  function safePaint() {
    const ae = document.activeElement, c = $('content');
    /* 自动刷新不打断用户正在输入的搜索框 */
    if (ae && c && c.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    paint();
  }

  /* ---------- schema 字段 → 表单 ---------- */
  function editableFields(sec) {
    return fieldsOf(sec).filter((f) => f && f.key !== '.id' && f.type !== 'id' && f.type !== 'readonly');
  }
  function displayValue(f, v) {
    if (v == null || v === '') return '—';
    if (f && (f.type === 'bool' || f.type === 'bool-invert')) return boolOn(v) ? L('是', 'Yes') : L('否', 'No');
    return String(v);
  }
  function formFields(sec, row, adding) {
    return editableFields(sec).map((f) => {
      const raw = row ? row[f.key] : (f.default != null ? f.default : '');
      let type = 'text', options = null;
      if (f.type === 'bool' || f.type === 'bool-invert') type = 'switch';
      else if (f.type === 'select') { type = 'select'; options = (f.options || []).slice(); }
      else if (f.type === 'interface') {
        type = 'select';
        options = R.interfaces.slice();
        if (raw && options.indexOf(String(raw)) < 0) options.unshift(String(raw));
      } else if (f.type === 'number') type = 'number';
      else if (f.type === 'password') type = 'password';
      else if (f.type === 'textarea') type = 'textarea';
      const field = {
        key: f.key,
        label: L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key),
        type,
        value: type === 'switch' ? (f.type === 'bool-invert' ? !boolOn(raw) : boolOn(raw)) : (raw == null ? '' : raw),
        required: !!f.required,
        placeholder: f.placeholder || '',
        full: type === 'textarea',
      };
      if (options) field.options = options;
      if (adding && type === 'select' && !field.value && options && options.length && f.type !== 'interface') field.value = options[0];
      return field;
    });
  }
  function submitValues(sec, values) {
    const out = {};
    editableFields(sec).forEach((f) => {
      if (!(f.key in values)) return;
      const v = values[f.key];
      if (f.type === 'bool') out[f.key] = v ? 'true' : 'false';
      else if (f.type === 'bool-invert') out[f.key] = !!v;
      else if (typeof v === 'string') out[f.key] = v.trim();
      else out[f.key] = v;
    });
    return out;
  }
  /* DNS 编辑表单：把真实字段 servers 拆成 IPv4 / IPv6 两个文本框 */
  function dnsFormFields(row) {
    const sp = splitDnsServers(row ? row.servers : '');
    const v4 = {
      key: '__dnsV4', label: L('IPv4 上游服务器', 'IPv4 upstream servers'), type: 'text',
      value: sp.v4, placeholder: '223.5.5.5,119.29.29.29',
    };
    const v6 = {
      key: '__dnsV6', label: L('IPv6 上游服务器', 'IPv6 upstream servers'), type: 'text',
      value: sp.v6, placeholder: '2400:3200::1',
    };
    const out = [];
    const cache = dnsCache();
    const cacheField = {
      key: '__dnsCache', label: L('缓存使用率', 'Cache usage'), type: 'static',
      value: cache.pct == null ? '—' : cache.pct.toFixed(1) + '%  ·  ' + cache.usedLabel + ' / ' + cache.totalLabel,
      hint: L('RouterOS 未提供命中计数，此处为 cache-used / cache-size 的真实占用', 'RouterOS exposes no hit counters; this is real cache-used / cache-size'),
    };
    formFields('dns', row, false).forEach((f) => {
      if (f.key === 'servers') out.push(v4, v6);
      else if (f.key === 'cache-max-ttl') out.push(cacheField);
      else out.push(f);
    });
    return out;
  }
  function dnsSubmitValues(values) {
    const out = submitValues('dns', values);
    out.servers = [String(values.__dnsV4 || '').trim(), String(values.__dnsV6 || '').trim()].filter(Boolean).join(',');
    return out;
  }

  /* ---------- 弹窗操作 ---------- */
  function detailRows(sec, r) {
    return fieldsOf(sec).map((f) => [L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key), displayValue(f, r ? r[f.key] : '')]);
  }
  function rowLabel(sec, r) {
    if (!r) return secTitle(sec);
    return String(r.comment || r['host-name'] || r.name || r.address || r.interface || r['.id'] || secTitle(sec));
  }
  function openView(sec, id) {
    const r = findRow(sec, id);
    const u = window.UI; if (!u || !u.openModal) return;
    const actions = [];
    if (canWrite(sec)) {
      actions.push({ label: L('编辑', 'Edit'), cls: 'primary', onClick: () => openEdit(sec, id) });
      if (canToggle(sec) && r) actions.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), onClick: () => toggleRow(sec, id, !isOn(r)) });
      actions.push({ label: L('删除', 'Delete'), cls: 'danger', onClick: () => openDelete(sec, id) });
    }
    actions.push({ label: L('关闭', 'Close') });
    u.openModal({
      title: rowLabel(sec, r), sub: secTitle(sec) + ' · ' + L('真实配置', 'live configuration'),
      body: `<div class="ui-detail">${detailRows(sec, r).map(([k, v]) => `<div class="ui-detail-row"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`,
      actions,
    });
  }
  function openEdit(sec, id) {
    if (!canWrite(sec)) return say(L('此分类为只读', 'Read-only section'), 'warn');
    const r = findRow(sec, id) || (sectionDef(sec) && sectionDef(sec).singleton ? rows(sec)[0] : null);
    const u = window.UI; if (!u || !u.openForm) return;
    const isDns = sec === 'dns';
    u.openForm({
      title: L('编辑', 'Edit') + ' · ' + rowLabel(sec, r), sub: secTitle(sec) + ' · ' + secPath(sec),
      fields: isDns ? dnsFormFields(r) : formFields(sec, r, false),
      onSubmit: async (v) => {
        const values = isDns ? dnsSubmitValues(v) : submitValues(sec, v);
        try { await write(sec, 'set', id ? [id] : [], values); say(L('已保存', 'Saved'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
      },
    });
  }
  function openAdd(sec) {
    if (!canWrite(sec)) return say(L('此分类为只读', 'Read-only section'), 'warn');
    if (sectionDef(sec) && sectionDef(sec).singleton) return say(L('此配置为单例，请直接编辑', 'Singleton - edit directly'), 'info');
    const u = window.UI; if (!u || !u.openForm) return;
    u.openForm({
      title: L('新增', 'Add') + ' · ' + secTitle(sec), sub: secPath(sec),
      fields: formFields(sec, null, true),
      onSubmit: async (v) => {
        try { await write(sec, 'add', [], submitValues(sec, v)); say(L('已添加', 'Added'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('添加失败', 'Add failed'), 'err'); }
      },
    });
  }
  function openDelete(sec, id) {
    if (!canWrite(sec)) return;
    const r = findRow(sec, id);
    if (!r) return;
    const u = window.UI;
    if (!u || !u.openConfirm) {
      if (!window.confirm(L('确认删除此记录？', 'Delete this record?'))) return;
      return write(sec, 'remove', [id]).then(() => { say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }).catch((e) => say(e.message, 'err'));
    }
    u.openConfirm({
      title: L('删除记录', 'Delete record'), warningTitle: L('确认删除？', 'Delete this record?'),
      message: `<b>${esc(rowLabel(sec, r))}</b> ${L('将从 RouterOS 删除，此操作不可恢复。', 'will be removed from RouterOS. This cannot be undone.')}`,
      danger: true, confirmLabel: L('删除', 'Delete'),
      onConfirm: async () => {
        try { await write(sec, 'remove', [id]); say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('删除失败', 'Delete failed'), 'err'); }
      },
    });
  }
  function toggleRow(sec, id, enable) {
    if (!canToggle(sec)) return say(L('此分类不支持启用/禁用', 'Toggle not supported'), 'warn');
    write(sec, enable ? 'enable' : 'disable', [id]).then(() => {
      say(enable ? L('已启用', 'Enabled') : L('已禁用', 'Disabled'), 'ok');
      loadAll(true);
    }).catch((e) => say((e && e.message) || L('操作失败', 'Action failed'), 'err'));
  }
  function rowMenu(sec, id, anchor) {
    const r = findRow(sec, id);
    if (!r) return;
    const items = [{ label: L('查看', 'View'), action: () => openView(sec, id) }];
    if (canWrite(sec)) {
      items.push({ label: L('编辑', 'Edit'), action: () => openEdit(sec, id) });
      if (canToggle(sec)) items.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), action: () => toggleRow(sec, id, !isOn(r)) });
      items.push({ sep: true }, { label: L('删除', 'Delete'), danger: true, action: () => openDelete(sec, id) });
    }
    const u = window.UI;
    if (!u || !u.openMenu) return;
    u.openMenu(anchor, items, { head: `<div class="ui-menu-head"><b>${esc(rowLabel(sec, r))}</b><small>${esc(secTitle(sec))}</small></div>` });
  }

  /* ---------- 表格列与单元格 ---------- */
  /* [key, 渲染方式, 中文表头回退, 英文表头回退] */
  const COLUMNS = {
    dhcpLeases: [
      ['host-name', 'host', '主机名', 'Host name'], ['address', 'addr', 'IP 地址', 'IP address'],
      ['mac-address', 'mac', 'MAC 地址', 'MAC address'], ['status', 'lease-status', '状态', 'Status'],
      ['expires-after', 'plain', '到期', 'Expires'],
    ],
    dhcpNetworks: [
      ['address', 'addr', '网段', 'Network'], ['gateway', 'addr', '网关', 'Gateway'],
      ['dns-server', 'plain', 'DNS', 'DNS server'], ['domain', 'plain', '域名', 'Domain'],
      ['comment', 'plain', '备注', 'Comment'], ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    dhcpServers: [
      ['name', 'host', '名称', 'Name'], ['interface', 'plain', '接口', 'Interface'],
      ['address-pool', 'plain', '地址池', 'Address pool'], ['lease-time', 'plain', '租期', 'Lease time'],
      ['dhcp-option-set', 'plain', '选项集', 'Option set'], ['comment', 'plain', '备注', 'Comment'],
      ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    dhcpClients: [
      ['interface', 'host', '接口', 'Interface'], ['dhcp-options', 'plain', '选项', 'Options'],
      ['status', 'plain', '状态', 'Status'], ['use-peer-dns', 'bool', '对端 DNS', 'Peer DNS'],
      ['add-default-route', 'bool', '默认路由', 'Default route'], ['comment', 'plain', '备注', 'Comment'],
      ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    dhcpOptions: [
      ['name', 'host', '名称', 'Name'], ['code', 'num', '选项号', 'Code'],
      ['value', 'plain', '值', 'Value'], ['raw-value', 'mono', '原始值', 'Raw value'],
      ['force', 'bool', '强制', 'Force'], ['comment', 'plain', '备注', 'Comment'],
    ],
    dhcpOptionSets: [
      ['name', 'host', '名称', 'Name'], ['options', 'plain', '包含选项', 'Options'],
      ['comment', 'plain', '备注', 'Comment'],
    ],
    dnsStatic: [
      ['name', 'host', '域名', 'Name'], ['address', 'addr', '指向 IP', 'Address'],
      ['ttl', 'plain', 'TTL', 'TTL'], ['comment', 'plain', '备注', 'Comment'],
      ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    dns: [
      ['servers', 'plain', '上游 DNS', 'Upstream servers'], ['dynamic-servers', 'plain', '动态下发', 'Dynamic servers'],
      ['allow-remote-requests', 'bool', '远程查询', 'Remote queries'], ['cache-size', 'num', '缓存大小', 'Cache size'],
      ['cache-max-ttl', 'plain', '最大 TTL', 'Max TTL'],
    ],
  };
  /* 列宽（对齐设计稿 colgroup，最后一列为行操作按钮） */
  const COL_WIDTHS = {
    dhcpLeases: ['22%', '15%', '20%', '12%', '18%'],
    dhcpNetworks: ['20%', '14%', '18%', '14%', '22%', '12%'],
    dhcpServers: ['16%', '14%', '16%', '14%', '16%', '14%', '10%'],
    dhcpClients: ['14%', '14%', '14%', '13%', '14%', '17%', '14%'],
    dhcpOptions: ['18%', '10%', '22%', '18%', '10%', '22%'],
    dhcpOptionSets: ['24%', '46%', '30%'],
    dnsStatic: ['24%', '20%', '12%', '32%', '12%'],
    dns: ['26%', '20%', '14%', '12%', '28%'],
  };
  function colLabel(sec, key, zh, en) {
    const f = fieldsOf(sec).find((x) => x.key === key);
    return f && f.label ? L(f.label.zh, f.label.en) : L(zh, en);
  }
  function columnsFor(sec) {
    return (COLUMNS[sec] || []).map(([k, render, zh, en]) => ({ k, render, l: colLabel(sec, k, zh, en) }));
  }
  function leaseStatusHtml(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'bound') return `<span class="status"><span class="dot is-green"></span>${esc(L('已绑定', 'Bound'))}</span>`;
    if (s === 'waiting') return `<span class="status"><span class="dot is-amber"></span>${esc(L('待分配', 'Waiting'))}</span>`;
    if (s === 'expired') return `<span class="status"><span class="dot is-muted"></span>${esc(L('已过期', 'Expired'))}</span>`;
    if (s === 'disabled') return `<span class="status"><span class="dot is-muted"></span>${esc(L('已禁用', 'Disabled'))}</span>`;
    return `<span class="status"><span class="dot is-amber"></span>${ex(v || L('未知', 'Unknown'))}</span>`;
  }
  function cellHtml(sec, c, r) {
    const v = r[c.k];
    const empty = v == null || v === '' ? '—' : v;
    if (c.render === 'host') {
      const sub = r.comment || r.server || r['mac-address'] || secTitle(sec);
      return `<div class="cell"><b>${ex(empty === '—' ? (r['.id'] || '—') : empty)}</b><small>${ex(sub)}</small></div>`;
    }
    if (c.render === 'addr') return `<span class="addr">${ex(empty)}</span>`;
    if (c.render === 'mac') return `<span class="mono dh-mac">${ex(empty)}</span>`;
    if (c.render === 'num') return `<span class="num">${ex(empty)}</span>`;
    if (c.render === 'mono') return `<span class="mono dh-mono">${ex(empty)}</span>`;
    if (c.render === 'bool') return `<span class="badge ${boolOn(v) ? 'teal' : 'neutral'}">${esc(boolOn(v) ? L('是', 'Yes') : L('否', 'No'))}</span>`;
    if (c.render === 'enabled') return `<span class="status"><span class="dot ${isOn(r) ? 'is-green' : 'is-muted'}"></span>${esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled'))}</span>`;
    if (c.render === 'lease-status') return leaseStatusHtml(v);
    return `<span class="dh-cell">${ex(empty)}</span>`;
  }

  /* ---------- 筛选 / chips / 分页 ---------- */
  function expiresSoon(r) {
    const v = String((r && r['expires-after']) || '');
    if (!v) return false;
    let m = v.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m && (m[1] || m[2] || m[3] || m[4])) {
      const mins = Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
      return mins > 0 && mins <= 60;
    }
    const t = Date.parse(v);
    if (Number.isFinite(t)) { const diff = t - Date.now(); return diff > 0 && diff <= 3600000; }
    return false;
  }
  function chipsFor(sec) {
    const rs = rows(sec), out = [['all', L('全部', 'All'), rs.length]];
    if (sec === 'dhcpLeases') {
      out.push(['bound', L('已绑定', 'Bound'), rs.filter((r) => String(r.status || '').toLowerCase() === 'bound').length]);
      out.push(['soon', L('即将到期', 'Expiring soon'), rs.filter(expiresSoon).length]);
    } else if (fieldsOf(sec).some((f) => f.key === 'disabled')) {
      out.push(['on', L('已启用', 'Enabled'), rs.filter(isOn).length]);
      out.push(['off', L('已禁用', 'Disabled'), rs.filter((r) => !isOn(r)).length]);
    }
    return out;
  }
  function filteredRows(sec) {
    let rs = rows(sec).slice();
    if (R.chip === 'bound') rs = rs.filter((r) => String(r.status || '').toLowerCase() === 'bound');
    else if (R.chip === 'soon') rs = rs.filter(expiresSoon);
    else if (R.chip === 'on') rs = rs.filter(isOn);
    else if (R.chip === 'off') rs = rs.filter((r) => !isOn(r));
    const q = R.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => Object.keys(r).some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function noteFor(sec) {
    if (sec === 'dhcpLeases') {
      const srv = rows('dhcpServers')[0];
      return L('租期', 'Lease') + ' ' + (srv && srv['lease-time'] ? srv['lease-time'] : '—');
    }
    if (sec === 'dnsStatic') {
      const d = dnsRow();
      return L('上游 DNS', 'Upstream') + ' ' + (d.servers || '—');
    }
    if (sec === 'dns') return L('单例配置 · 真实数据', 'Singleton · live');
    return L('共', 'Total') + ' ' + rows(sec).length + ' ' + L('条', 'entries');
  }

  /* ---------- 面板渲染 ---------- */
  function toolbarHtml(sec) {
    const chips = chipsFor(sec).map(([v, label, count]) => `<button class="chip ${v === R.chip ? 'on' : ''}" type="button" data-act="dh-chip" data-chip="${ex(v)}">${esc(label)} <b>${count}</b></button>`).join('');
    const add = canWrite(sec) && !(sectionDef(sec) && sectionDef(sec).singleton)
      ? `<button class="btn" type="button" data-act="dh-add">${ic('plus')}${esc(L('新增', 'Add'))}</button>` : '';
    return `<div class="toolbar">
      <label class="field">${ic('search')}<input id="dhSearch" placeholder="${esc(L('搜索主机名、IP 或地址…', 'Search host, IP or address…'))}" aria-label="${esc(L('搜索', 'Search'))}"></label>
      <div class="chips">${chips}</div>
      <span class="spacer"></span>
      <span class="toolbar-note">${esc(noteFor(sec))}</span>
      ${add}
    </div>`;
  }
  function tableHtml(sec) {
    const all = filteredRows(sec);
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    R.page = Math.max(1, Math.min(R.page, pages));
    const start = (R.page - 1) * PAGE_SIZE;
    const rs = all.slice(start, start + PAGE_SIZE);
    const cols = columnsFor(sec);
    const head = cols.map((c) => `<th${c.render === 'num' ? ' class="r"' : ''}>${esc(c.l)}</th>`).join('') + '<th></th>';
    const body = rs.map((r) => `<tr>${cols.map((c) => `<td class="${c.render === 'num' ? 'r num' : (c.render === 'mac' || c.render === 'mono' ? 'mono' : '')}" data-label="${esc(c.l)}">${cellHtml(sec, c, r)}</td>`).join('')}
      <td><button class="row-more" type="button" data-act="dh-more" data-sec="${sec}" data-id="${ex(r['.id'] || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td></tr>`).join('');
    const emptyRow = `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`;
    const pager = pages > 1
      ? `<span class="dh-pager"><button class="btn icon-only dh-prev" type="button" data-act="dh-page" data-page="${R.page - 1}" ${R.page <= 1 ? 'disabled' : ''} title="${esc(L('上一页', 'Previous'))}">${ic('chevron')}</button><span class="mono">${R.page} / ${pages}</span><button class="btn icon-only" type="button" data-act="dh-page" data-page="${R.page + 1}" ${R.page >= pages ? 'disabled' : ''} title="${esc(L('下一页', 'Next'))}">${ic('chevron')}</button></span>`
      : '';
    const foot = `<div class="table-foot"><span>${esc(L('显示', 'Showing'))} ${all.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, all.length)} / ${esc(L('共', 'Total'))} ${all.length} ${esc(L('条', 'entries'))}</span>${pager}</div>`;
    const group = `<colgroup>${(COL_WIDTHS[sec] || []).map((w) => `<col style="width:${w}">`).join('')}<col style="width:34px"></colgroup>`;
    return `<div class="table-scroll"><table class="dt">${group}<thead><tr>${head}</tr></thead><tbody>${body || emptyRow}</tbody></table></div>${foot}`;
  }
  function panelBody(sec) {
    const notice = R.err[sec]
      ? `<div class="notice dh-notice">${ex(R.err[sec])} <button class="btn" type="button" data-act="dh-refresh">${esc(L('重试', 'Retry'))}</button></div>` : '';
    if (R.err[sec] && !rows(sec).length) return notice;
    return notice + toolbarHtml(sec) + tableHtml(sec);
  }

  /* ---------- KPI ---------- */
  function kpiCard(iconName, color, title, value, statusHtml, footLeft, footRight) {
    /* footLeft / footRight 由调用处负责转义动态值（地址池迷你条需要保留 HTML） */
    return `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico ${color}">${ic(iconName)}</span>${esc(title)}</div>
      <div class="kpi-main"><div class="kpi-num">${value}</div>${statusHtml ? `<span class="status">${statusHtml}</span>` : ''}</div>
      <div class="kpi-foot"><span>${footLeft}</span><span>${footRight}</span></div></article>`;
  }
  function kpisHtml() {
    const leases = rows('dhcpLeases');
    const hasDynamic = leases.some((r) => 'dynamic' in r);
    const dynamic = hasDynamic ? leases.filter((r) => boolOn(r.dynamic)).length : 0;
    const staticCount = hasDynamic ? (leases.length - dynamic) : leases.length;
    const bound = leases.filter((r) => String(r.status || '').toLowerCase() === 'bound').length;
    const pool = poolStats();
    const servers = rows('dhcpServers');
    const onServers = servers.filter(isOn).length;
    const srv = servers[0] || {};
    const d = dnsRow();
    const cache = dnsCache();
    return [
      kpiCard('dhcp', 'blue', L('DHCP 租约', 'DHCP leases'), String(leases.length),
        statusDot(leases.length > 0, L('正常', 'OK')),
        L('动态', 'Dynamic') + ' ' + dynamic + ' · ' + L('静态', 'Static') + ' ' + staticCount,
        bound + ' ' + L('在线', 'online')),
      kpiCard('layers', 'teal', L('地址池使用', 'Pool usage'),
        (pool.hasPool ? pool.pct.toFixed(1) : '—') + (pool.hasPool ? '<span class="u pct">%</span>' : ''),
        '', pool.used + ' / ' + (pool.hasPool ? pool.total : '—') + ' ' + L('个地址', 'addresses'),
        `<span class="mini-bar"><i style="background:var(--v2-teal);width:${pool.hasPool ? Math.min(100, pool.pct) : 0}%"></i></span>`),
      kpiCard('pulse', 'violet', L('DNS 缓存使用率', 'DNS cache usage'),
        (cache.pct == null ? '—' : cache.pct.toFixed(1)) + (cache.pct == null ? '' : '<span class="u pct">%</span>'),
        statusDot(boolOn(d['allow-remote-requests']), L('已启用', 'Enabled')),
        L('静态记录', 'Static records') + ' ' + rows('dnsStatic').length,
        L('已用', 'Used') + ' ' + ex(cache.usedLabel) + ' / ' + ex(cache.totalLabel)),
      kpiCard('globe', 'green', L('DHCP 服务器', 'DHCP servers'), String(servers.length),
        statusDot(onServers > 0, L('运行中', 'Running')),
        ex(String(srv.name || '—')) + ' · ' + ex(String(srv.interface || '—')),
        L('租期', 'Lease') + ' ' + ex(String(srv['lease-time'] || '—'))),
    ].join('');
  }

  /* ---------- rail 卡片 ---------- */
  function railHtml() {
    const pool = poolStats();
    const fp = (n) => pool.hasPool ? n.toFixed(1) + '%' : '—';
    const usedBar = pool.hasPool ? Math.min(100, pool.pct) : 0;
    const reservedBar = pool.hasPool ? Math.min(100 - usedBar, pool.reservedPct) : 0;
    const usage = `<div class="usage-summary"><b>${fp(pool.pct)}</b><span>${esc(L('已使用', 'used'))}</span></div>
      <div class="usage-bar" style="height:7px;margin:10px 0 6px"><i style="width:${usedBar}%;background:var(--v2-accent)"></i><i style="width:${reservedBar}%;background:var(--v2-amber)"></i></div>
      <div class="sub-note">${esc((pool.used + pool.reserved) + ' ' + L('个占用 /', 'occupied /') + ' ' + (pool.hasPool ? pool.total : '—') + ' ' + L('个可用地址', 'addresses'))}</div>
      <div class="usage-legend">
        <div class="row"><i style="background:var(--v2-accent)"></i>${esc(L('已分配', 'Allocated'))}<b>${pool.used}</b><small>${fp(pool.pct)}</small></div>
        <div class="row"><i style="background:var(--v2-amber)"></i>${esc(L('保留', 'Reserved'))}<b>${pool.reserved}</b><small>${fp(pool.reservedPct)}</small></div>
        <div class="row"><i style="background:var(--v2-line)"></i>${esc(L('空闲', 'Free'))}<b>${pool.free}</b><small>${fp(pool.freePct)}</small></div>
      </div>`;

    const d = dnsRow();
    const cache = dnsCache();
    const dnsOn = boolOn(d['allow-remote-requests']);
    const sp = splitDnsServers(d.servers);
    const upstreamHtml = [sp.v4, sp.v6].filter(Boolean).map(ex).join('<br>') || '—';
    const hasDoh = Object.prototype.hasOwnProperty.call(d, 'use-doh-server');
    const dohVal = hasDoh ? String(d['use-doh-server'] || '').trim() : '';
    /* RouterOS 中 use-doh-server 为 DoH URL：非空即启用；空/否值视为未启用 */
    const dohOn = !!dohVal && !/^(false|no|off|0|none|-)$/i.test(dohVal);
    const dohHtml = !hasDoh
      ? '—'
      : (dohOn
        ? `<b class="dh-doh on">${esc(L('已启用', 'Enabled'))}</b>`
        : `<b class="dh-doh">${esc(L('未启用', 'Inactive'))}</b>`);
    const dnsBody = `<div class="kv"><span>${esc(L('上游服务器', 'Upstream servers'))}</span><b class="mono dh-upstream">${upstreamHtml}</b></div>
      ${kvRow(L('缓存容量', 'Cache size'), d['cache-size'] || '—')}
      <div class="kv" title="${esc(L('RouterOS 未提供命中计数，此处为 cache-used / cache-size 的真实占用', 'RouterOS exposes no hit counters; this is real cache-used / cache-size'))}"><span>${esc(L('缓存使用率', 'Cache usage'))}</span><b>${cache.pct == null ? '—' : cache.pct.toFixed(1) + '%'}</b></div>
      <div class="kv"><span>DoH</span>${dohHtml}</div>
      <a class="link" href="javascript:void(0)" data-act="dh-edit-dns">${esc(L('编辑 DNS 配置', 'Edit DNS config'))}${ic('chevron')}</a>`;

    const statics = rows('dnsStatic').slice(0, 4);
    const staticBody = statics.length
      ? statics.map((r) => `<div class="kv"><span class="mono">${ex(r.name || '—')}</span><b class="mono">${ex(r.address || '—')}</b></div>`).join('') +
        `<a class="link" href="javascript:void(0)" data-act="dh-goto" data-sec="dnsStatic">${esc(L('全部静态记录', 'All static records'))}${ic('chevron')}</a>`
      : `<div class="pg-empty">${ic('globe')}<div>${esc(L('暂无静态记录', 'No static records'))}</div></div>`;

    return [
      miniCard(L('地址池使用率', 'Pool usage'), poolLabel(), usage),
      `<section class="card"><div class="card-head"><div><h2 class="card-title">${esc(L('DNS 服务', 'DNS service'))}</h2><div class="card-sub">${esc(L('缓存 DNS · 本地解析', 'Caching DNS · local resolve'))}</div></div><span class="badge ${dnsOn ? 'teal' : 'neutral'}">${esc(dnsOn ? L('已启用', 'Enabled') : L('未启用', 'Inactive'))}</span></div><div class="rail-body">${dnsBody}</div></section>`,
      miniCard(L('静态 DNS', 'Static DNS'), L('本地域名映射', 'Local name mapping'), staticBody),
    ].join('');
  }

  /* ---------- 页面骨架 ---------- */
  function tabsHtml() {
    return `<div class="panel-tabs" data-tabs>${SECTIONS.map((s) => {
      const count = s === 'dns' ? (rows('dns').length ? 1 : 0) : rows(s).length;
      return `<button class="panel-tab ${s === R.section ? 'on' : ''}" type="button" data-act="dh-tab" data-tab="${s}">${esc(tabLabel(s))}<span class="pt-count">${count}</span></button>`;
    }).join('')}</div>`;
  }
  function pageHead() {
    const addLabel = R.section === 'dhcpLeases' ? L('添加租约', 'Add lease') : L('新增', 'Add') + ' · ' + tabLabel(R.section);
    const meta = [
      L('主路由', 'Main router'), 'RouterOS',
      rows('dhcpLeases').length + ' ' + L('条租约', 'leases'),
      poolStats().hasPool ? L('地址池', 'Pool') + ' ' + poolStats().pct.toFixed(1) + '%' : L('未配置地址池', 'No pool'),
      boolOn(dnsRow()['allow-remote-requests']) ? L('DNS 缓存已启用', 'DNS cache enabled') : L('DNS 缓存未启用', 'DNS cache off'),
    ];
    return `<div class="page-head"><div><h1>${esc(L('DHCP 与 DNS', 'DHCP & DNS'))}</h1>
      <div class="meta">${meta.map((m, i) => (i ? '<span class="sep"></span>' : '') + `<span${i >= 2 ? ' class="hide-sm"' : ''}>${esc(m)}</span>`).join('')}</div></div>
      <div class="actions"><span class="live"><span class="dot"></span>${esc(relTime(R.loadedAt))}</span>
        ${canWrite(R.section) ? `<button class="btn primary" type="button" data-act="dh-add">${ic('plus')}${esc(addLabel)}</button>` : ''}
      </div></div>`;
  }
  function html() {
    return `${pageHead()}
      <div class="grid align-start">
        <div class="kpis">${kpisHtml()}</div>
        <section class="card span8"><div class="card-head"><div><h2 class="card-title">${esc(L('租约与解析', 'Leases & resolution'))}</h2>
          <div class="card-sub">${esc(secTitle(R.section) + ' · ' + (secPath(R.section) || '—'))}</div></div>
          <button class="btn icon-only" type="button" data-act="dh-menu" title="${esc(L('更多', 'More'))}" aria-label="${esc(L('更多', 'More'))}">${ic('more')}</button></div>
          ${tabsHtml()}
          <div class="tab-panel on" data-panel="${R.section}">${panelBody(R.section)}</div>
        </section>
        <div class="span4 rail">${railHtml()}</div>
      </div>`;
  }

  /* ---------- 重绘与事件 ---------- */
  function bindSearch() {
    const s = $('dhSearch');
    if (!s) return;
    s.value = R.q;
    s.oninput = () => {
      R.q = s.value;
      R.page = 1;
      repaintPanel();
      const n = $('dhSearch');
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    };
  }
  function repaintPanel() {
    const host = document.querySelector('.ui-v2 .content.pg-dhcp .tab-panel');
    if (!host) return;
    host.innerHTML = panelBody(R.section);
    bindSearch();
  }
  function scrollActiveTab() {
    const bar = document.querySelector('.ui-v2 .content.pg-dhcp .panel-tabs');
    const on = bar && bar.querySelector('.panel-tab.on');
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth || R.scrolledTab === R.section) return;
    /* 当前分类变化时居中（如选项集），后面的静态 DNS / DNS 服务随之进入可视区；
       自动刷新不重复滚动，避免打断用户手动滑动 */
    R.scrolledTab = R.section;
    const br = bar.getBoundingClientRect(), or = on.getBoundingClientRect();
    bar.scrollLeft = Math.max(0, bar.scrollLeft + (or.left - br.left) - (br.width - or.width) / 2);
  }
  function paint() {
    const c = $('content');
    if (!c || SECTIONS.indexOf(state.section) < 0) return;
    c.className = 'content dash pg-dhcp';
    c.innerHTML = html();
    bindSearch();
    scrollActiveTab();
  }
  function goSection(sec) {
    if (SECTIONS.indexOf(sec) < 0) return;
    if (typeof window.navigate === 'function') {
      window.navigate(sec);
    } else {
      state.section = sec; R.section = sec; R.q = ''; R.chip = 'all'; R.page = 1; R.scrolledTab = null;
      paint(); loadAll(false);
    }
  }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || SECTIONS.indexOf(state.section) < 0) return;
    const a = el.dataset.act;
    if (a === 'dh-tab') { if (el.dataset.tab !== R.section) goSection(el.dataset.tab); return; }
    if (a === 'dh-goto') { goSection(el.dataset.sec); return; }
    if (a === 'dh-chip') { R.chip = el.dataset.chip || 'all'; R.page = 1; repaintPanel(); return; }
    if (a === 'dh-page') { R.page = num(el.dataset.page, 1); repaintPanel(); return; }
    if (a === 'dh-refresh') { loadAll(true); return; }
    if (a === 'dh-add') { openAdd(R.section); return; }
    if (a === 'dh-edit-dns') { openEdit('dns', dnsRow()['.id'] || ''); return; }
    if (a === 'dh-more') { rowMenu(el.dataset.sec || R.section, el.dataset.id, el); return; }
    if (a === 'dh-menu') { openCardMenu(el); return; }
  }
  function exportCsv() {
    const sec = R.section;
    const fs = fieldsOf(sec).filter((f) => f.key !== '.id');
    const lines = [];
    lines.push('# ' + secTitle(sec) + ' (' + secPath(sec) + ')');
    lines.push(fs.map((f) => L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key)).join(','));
    filteredRows(sec).forEach((r) => lines.push(fs.map((f) => '"' + String(r[f.key] == null ? '' : r[f.key]).replace(/"/g, '""') + '"').join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ros-' + sec + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(L('已导出当前分类数据', 'Exported current section'), 'ok');
  }
  function toggleCompact() {
    const on = !document.body.classList.contains('ui-compact');
    document.body.classList.toggle('ui-compact', on);
    try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
    say(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
  }
  function openCardMenu(anchor) {
    const u = window.UI;
    if (!u || !u.openMenu) return;
    const compact = document.body.classList.contains('ui-compact');
    u.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前筛选结果', 'CSV · current filter'), icon: 'i-download', action: () => exportCsv() },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => toggleCompact() },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(tabLabel(R.section))}</small></div>` });
  }

  function install() {
    if (window.__dhcpDnsV3Installed) return;
    window.__dhcpDnsV3Installed = true;
    const content = $('content');
    if (content) content.addEventListener('click', onClick);
    if (typeof window.renderPage === 'function') {
      const orig = window.renderPage;
      window.renderPage = function () {
        const r = orig.apply(this, arguments);
        if (SECTIONS.indexOf(state.section) >= 0) {
          if (R.section !== state.section) { R.section = state.section; R.q = ''; R.chip = 'all'; R.page = 1; R.scrolledTab = null; }
          paint();
          loadAll(false);
        }
        return r;
      };
    }
    if (SECTIONS.indexOf(state.section) >= 0 && $('content')) { R.section = state.section; paint(); loadAll(false); }
    setInterval(() => { if (SECTIONS.indexOf(state.section) >= 0 && !document.hidden) loadAll(true); }, 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
