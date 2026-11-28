'use strict';
/* ============================================================
   系统管理 v3 · DHCP & DNS 租约/解析卡片风格
   - 覆盖 section：identity / clock / ntp / cloud / schedulers /
     scripts / services / systemPackage
   - 数据全部来自 /api/config?section=<id>，写入 /api/config（POST）
   - 结构：page-head + 4 KPI + span8 主卡片（tab/toolbar/dt/table-foot）
           + span4 rail（时钟 / NTP / 云服务 / 软件包）
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ex = esc;
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const boolOn = (v) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d == null ? 0 : d); };

  const SECTIONS = ['identity', 'clock', 'ntp', 'cloud', 'schedulers', 'scripts', 'services', 'systemPackage'];
  const SINGLETON = new Set(['identity', 'clock', 'ntp', 'cloud']);
  const TABS = [
    ['identity', '设备标识', 'Identity'],
    ['clock', '系统时钟', 'Clock'],
    ['ntp', 'NTP 客户端', 'NTP client'],
    ['cloud', '云服务 / DDNS', 'Cloud / DDNS'],
    ['schedulers', '计划任务', 'Schedules'],
    ['scripts', '脚本', 'Scripts'],
    ['services', '系统服务', 'Services'],
    ['systemPackage', '软件包', 'Packages'],
  ];
  const FALLBACK = {
    identity: ['设备标识', 'Identity'], clock: ['系统时钟', 'Clock'],
    ntp: ['NTP 客户端', 'NTP client'], cloud: ['云服务 / DDNS', 'Cloud / DDNS'],
    schedulers: ['计划任务', 'Schedules'], scripts: ['脚本', 'Scripts'],
    services: ['系统服务', 'Services'], systemPackage: ['软件包', 'Packages'],
  };
  const PAGE_SIZE = 12;

  const R = { section: 'identity', q: '', chip: 'all', page: 1, data: {}, err: {}, loadedAt: 0, loading: false, interfaces: [] };

  /* ---------- 基础工具 ---------- */
  function sectionDef(sec) { return ((state.schema && state.schema.sections) || []).find((s) => s.id === sec) || null; }
  function fieldsOf(sec) { const d = sectionDef(sec); return (d && Array.isArray(d.fields)) ? d.fields : []; }
  function secTitle(sec) {
    const d = sectionDef(sec), f = FALLBACK[sec] || [sec, sec];
    return d && d.title ? L(d.title.zh, d.title.en) : L(f[0], f[1]);
  }
  function secPath(sec) { const d = sectionDef(sec); return d && d.path || ''; }
  function canWrite(sec) { const d = sectionDef(sec); return !!d && d.writable !== false && !d.readonly; }
  function canToggle(sec) { return canWrite(sec) && fieldsOf(sec).some((f) => f.key === 'disabled'); }
  function rows(sec) { return R.data[sec] || []; }
  function findRow(sec, id) { return rows(sec).find((r) => String(r['.id']) === String(id)) || null; }
  function isOn(r) { return !boolOn(r && r.disabled); }
  function tabLabel(sec) { const t = TABS.find((x) => x[0] === sec); return t ? L(t[1], t[2]) : secTitle(sec); }
  function relTime(ts) {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 2) return L('刚刚', 'just now');
    if (s < 60) return s + L(' 秒前', 's ago');
    return Math.round(s / 60) + L(' 分钟前', 'min ago');
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
  function miniCard(title, sub, body, badge) {
    return `<section class="card"><div class="card-head"><div><h2 class="card-title">${esc(title)}</h2><div class="card-sub">${esc(sub)}</div></div>${badge || ''}</div><div class="rail-body">${body}</div></section>`;
  }
  function deviceLabel() {
    const id = rows('identity')[0];
    return String((id && id.name) || (state.deviceName || '主路由')).replace(/\s*\(.*$/, '');
  }

  /* ---------- 真实数据读取 ---------- */
  async function loadAll(force) {
    if (R.loading) return;
    if (!force && R.loadedAt && Date.now() - R.loadedAt < 8000) { safePaint(); return; }
    R.loading = true;
    const results = await Promise.all(SECTIONS.map((s) => api('/api/config?section=' + encodeURIComponent(s)).then((d) => {
      const list = (d && d.rows) || [];
      const err = (d && d.offline && !list.length) ? L('路由器未连接，未读取到真实配置', 'Router offline - no live configuration') : '';
      return { rows: list, err, ok: true };
    }).catch((e) => ({ rows: null, err: (e && e.message) || L('加载失败', 'Load failed'), ok: false }))));
    SECTIONS.forEach((s, i) => {
      const res = results[i];
      if (res && res.rows) R.data[s] = res.rows;
      if (res && res.err) R.err[s] = res.err; else delete R.err[s];
    });
    R.loadedAt = Date.now();
    R.loading = false;
    if (SECTIONS.indexOf(state.section) >= 0) safePaint();
  }
  function safePaint() {
    const ae = document.activeElement, c = $('content');
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
      else if (f.type === 'number') type = 'number';
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
      if (adding && type === 'select' && !field.value && options && options.length) field.value = options[0];
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

  /* ---------- 弹窗操作 ---------- */
  function detailRows(sec, r) {
    return fieldsOf(sec).filter((f) => f.key !== '.id').map((f) => [L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key), displayValue(f, r ? r[f.key] : '')]);
  }
  function rowLabel(sec, r) {
    if (!r) return secTitle(sec);
    return String(r.comment || r.name || r['.id'] || secTitle(sec));
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
    if (sectionDef(sec) && sectionDef(sec).runPath) actions.push({ label: L('运行', 'Run'), onClick: () => runRow(sec, id) });
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
    u.openForm({
      title: L('编辑', 'Edit') + ' · ' + rowLabel(sec, r), sub: secTitle(sec) + ' · ' + secPath(sec),
      fields: formFields(sec, r, false),
      onSubmit: async (v) => {
        try { await write(sec, 'set', id ? [id] : [], submitValues(sec, v)); say(L('已保存', 'Saved'), 'ok'); loadAll(true); }
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
  function runRow(sec, id) {
    write(sec, 'run', [id]).then(() => { say(L('脚本已运行', 'Script started'), 'ok'); loadAll(true); })
      .catch((e) => say((e && e.message) || L('运行失败', 'Run failed'), 'err'));
  }
  function rowMenu(sec, id, anchor) {
    const r = findRow(sec, id);
    if (!r) return;
    const items = [{ label: L('查看', 'View'), action: () => openView(sec, id) }];
    if (canWrite(sec)) {
      items.push({ label: L('编辑', 'Edit'), action: () => openEdit(sec, id) });
      if (canToggle(sec)) items.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), action: () => toggleRow(sec, id, !isOn(r)) });
      if (sectionDef(sec) && sectionDef(sec).runPath) items.push({ label: L('运行脚本', 'Run script'), action: () => runRow(sec, id) });
      items.push({ sep: true }, { label: L('删除', 'Delete'), danger: true, action: () => openDelete(sec, id) });
    }
    const u = window.UI;
    if (!u || !u.openMenu) return;
    u.openMenu(anchor, items, { head: `<div class="ui-menu-head"><b>${esc(rowLabel(sec, r))}</b><small>${esc(secTitle(sec))}</small></div>` });
  }

  /* ---------- 表格列与单元格 ---------- */
  const COLUMNS = {
    schedulers: [
      ['name', 'host', '名称', 'Name'], ['start-date', 'plain', '开始日期', 'Start date'],
      ['start-time', 'plain', '开始时间', 'Start time'], ['interval', 'plain', '间隔', 'Interval'],
      ['comment', 'plain', '备注', 'Comment'], ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    scripts: [
      ['name', 'host', '名称', 'Name'], ['owner', 'plain', '所有者', 'Owner'],
      ['run-count', 'num', '运行次数', 'Runs'], ['last-started', 'plain', '上次运行', 'Last started'],
      ['comment', 'plain', '备注', 'Comment'],
    ],
    services: [
      ['name', 'host', '服务', 'Service'], ['port', 'num', '端口', 'Port'],
      ['protocol', 'plain', '协议', 'Protocol'], ['available-from', 'plain', '允许来源', 'Available from'],
      ['disabled', 'enabled', '启用', 'Enabled'],
    ],
    systemPackage: [
      ['name', 'host', '软件包', 'Package'], ['version', 'plain', '版本', 'Version'],
      ['enabled', 'bool', '启用', 'Enabled'], ['scheduled', 'bool', '计划', 'Scheduled'],
    ],
  };
  const COL_WIDTHS = {
    schedulers: ['20%', '14%', '12%', '12%', '26%', '16%'],
    scripts: ['22%', '14%', '12%', '20%', '32%'],
    services: ['18%', '12%', '10%', '34%', '26%'],
    systemPackage: ['34%', '22%', '22%', '22%'],
  };
  function colLabel(sec, key, zh, en) {
    const f = fieldsOf(sec).find((x) => x.key === key);
    return f && f.label ? L(f.label.zh, f.label.en) : L(zh, en);
  }
  function columnsFor(sec) {
    return (COLUMNS[sec] || []).map(([k, render, zh, en]) => ({
      k, render, l: k === 'disabled' ? L('状态', 'Status') : colLabel(sec, k, zh, en),
    }));
  }
  function cellHtml(sec, c, r) {
    const v = r[c.k];
    const empty = v == null || v === '' ? '—' : v;
    if (c.render === 'host') {
      const sub = r.comment || r.protocol || secTitle(sec);
      return `<div class="cell"><b>${ex(empty === '—' ? (r['.id'] || '—') : empty)}</b><small>${ex(sub)}</small></div>`;
    }
    if (c.render === 'num') return `<span class="num">${ex(empty)}</span>`;
    if (c.render === 'bool') return `<span class="badge ${boolOn(v) ? 'teal' : 'neutral'}">${esc(boolOn(v) ? L('是', 'Yes') : L('否', 'No'))}</span>`;
    if (c.render === 'enabled') return `<span class="status"><span class="dot ${isOn(r) ? 'is-green' : 'is-muted'}"></span>${esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled'))}</span>`;
    return `<span class="dh-cell">${ex(empty)}</span>`;
  }

  /* ---------- 筛选 / chips / 分页 ---------- */
  function enabledState(r) {
    if (fieldsOf(R.section).some((f) => f.key === 'disabled')) return isOn(r);
    if ('enabled' in r) return boolOn(r.enabled);
    return true;
  }
  function chipsFor(sec) {
    const rs = rows(sec), out = [['all', L('全部', 'All'), rs.length]];
    if (canToggle(sec) || (sec === 'systemPackage' && fieldsOf(sec).some((f) => f.key === 'enabled'))) {
      out.push(['on', L('已启用', 'Enabled'), rs.filter(enabledState).length]);
      out.push(['off', L('已禁用', 'Disabled'), rs.filter((r) => !enabledState(r)).length]);
    }
    return out;
  }
  function filteredRows(sec) {
    let rs = rows(sec).slice();
    if (R.chip === 'on') rs = rs.filter(enabledState);
    else if (R.chip === 'off') rs = rs.filter((r) => !enabledState(r));
    const q = R.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => Object.keys(r).some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function noteFor(sec) {
    if (sec === 'identity') return L('RouterOS 系统名称', 'RouterOS system name');
    if (sec === 'clock') { const c = rows('clock')[0] || {}; return (c.date || '—') + ' · ' + (c.time || '—'); }
    if (sec === 'ntp') { const n = rows('ntp')[0] || {}; return boolOn(n.enabled) ? L('已启用 · ', 'Enabled · ') + (n.server || '—') : L('未启用', 'Inactive'); }
    if (sec === 'cloud') { const c = rows('cloud')[0] || {}; return boolOn(c['ddns-enabled']) ? (c['dns-name'] || L('DDNS 已启用', 'DDNS enabled')) : L('DDNS 未启用', 'DDNS disabled'); }
    if (sec === 'services') return rows(sec).filter(isOn).length + ' / ' + rows(sec).length + L(' 个服务启用', ' enabled');
    if (sec === 'systemPackage') { const p = rows('systemPackage').find((x) => String(x.name || '') === 'routeros') || {}; return 'RouterOS ' + (p.version || '—'); }
    return L('共', 'Total') + ' ' + rows(sec).length + ' ' + L('条', 'entries');
  }

  /* ---------- 面板渲染 ---------- */
  function toolbarHtml(sec) {
    const chips = chipsFor(sec).map(([v, label, count]) => `<button class="chip ${v === R.chip ? 'on' : ''}" type="button" data-act="sys-chip" data-chip="${ex(v)}">${esc(label)} <b>${count}</b></button>`).join('');
    const add = canWrite(sec) && !SINGLETON.has(sec)
      ? `<button class="btn" type="button" data-act="sys-add">${ic('plus')}${esc(L('新增', 'Add'))}</button>` : '';
    return `<div class="toolbar">
      <label class="field">${ic('search')}<input id="sysSearch" placeholder="${esc(L('搜索名称、备注或端口…', 'Search name, comment or port…'))}" aria-label="${esc(L('搜索', 'Search'))}"></label>
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
    const body = rs.map((r) => `<tr>${cols.map((c) => `<td class="${c.render === 'num' ? 'r num' : ''}" data-label="${esc(c.l)}">${cellHtml(sec, c, r)}</td>`).join('')}
      <td><button class="row-more" type="button" data-act="sys-more" data-sec="${sec}" data-id="${ex(r['.id'] || '')}" title="${esc(L('更多', 'More'))}">${ic('more')}</button></td></tr>`).join('');
    const emptyRow = `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`;
    const pager = pages > 1
      ? `<span class="dh-pager"><button class="btn icon-only dh-prev" type="button" data-act="sys-page" data-page="${R.page - 1}" ${R.page <= 1 ? 'disabled' : ''} title="${esc(L('上一页', 'Previous'))}">${ic('chevron')}</button><span class="mono">${R.page} / ${pages}</span><button class="btn icon-only" type="button" data-act="sys-page" data-page="${R.page + 1}" ${R.page >= pages ? 'disabled' : ''} title="${esc(L('下一页', 'Next'))}">${ic('chevron')}</button></span>`
      : '';
    const foot = `<div class="table-foot"><span>${esc(L('显示', 'Showing'))} ${all.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, all.length)} / ${esc(L('共', 'Total'))} ${all.length} ${esc(L('条', 'entries'))}</span>${pager}</div>`;
    const group = `<colgroup>${(COL_WIDTHS[sec] || []).map((w) => `<col style="width:${w}">`).join('')}<col style="width:34px"></colgroup>`;
    return `<div class="table-scroll"><table class="dt">${group}<thead><tr>${head}</tr></thead><tbody>${body || emptyRow}</tbody></table></div>${foot}`;
  }
  /* 单例分区：属性 / 当前值 两列表格（与 DNS 服务卡片一致的信息密度） */
  function singletonHtml(sec) {
    const r = rows(sec)[0] || {};
    const fs = fieldsOf(sec).filter((f) => f.key !== '.id');
    const body = fs.map((f) => `<tr>
      <td data-label="${esc(L('属性', 'Setting'))}"><span class="dh-cell">${esc(L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key))}</span></td>
      <td data-label="${esc(L('当前值', 'Value'))}"><span class="mono dh-mono">${esc(displayValue(f, r[f.key]))}</span></td></tr>`).join('');
    const foot = `<div class="table-foot"><span>${esc(L('单例配置 · ', 'Singleton · ') + relTime(R.loadedAt))}</span>${canWrite(sec)
      ? `<a class="link" href="javascript:void(0)" data-act="sys-edit" data-sec="${sec}" data-id="${ex(r['.id'] || '')}">${esc(L('编辑', 'Edit'))}${ic('chevron')}</a>` : ''}</div>`;
    return `<div class="table-scroll"><table class="dt"><colgroup><col style="width:32%"><col></colgroup>
      <thead><tr><th>${esc(L('属性', 'Setting'))}</th><th>${esc(L('当前值', 'Value'))}</th></tr></thead>
      <tbody>${body || `<tr><td colspan="2" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`}</tbody></table></div>${foot}`;
  }
  function panelBody(sec) {
    const notice = R.err[sec]
      ? `<div class="notice dh-notice">${ex(R.err[sec])} <button class="btn" type="button" data-act="sys-refresh">${esc(L('重试', 'Retry'))}</button></div>` : '';
    if (R.err[sec] && !rows(sec).length) return notice;
    if (!R.loadedAt && !rows(sec).length) {
      return notice + `<div class="table-scroll"><table class="dt"><tbody>${Array.from({ length: 4 }, () => `<tr>${Array.from({ length: 4 }, () => '<td><span class="skeleton" style="display:block;height:12px"></span></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (SINGLETON.has(sec)) return notice + singletonHtml(sec);
    return notice + toolbarHtml(sec) + tableHtml(sec);
  }

  /* ---------- KPI ---------- */
  function kpiCard(iconName, color, title, value, statusHtml, footLeft, footRight) {
    return `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico ${color}">${ic(iconName)}</span>${esc(title)}</div>
      <div class="kpi-main"><div class="kpi-num">${value}</div>${statusHtml ? `<span class="status">${statusHtml}</span>` : ''}</div>
      <div class="kpi-foot"><span>${footLeft}</span><span>${footRight}</span></div></article>`;
  }
  function kpisHtml() {
    const idr = rows('identity')[0] || {};
    const c = rows('clock')[0] || {};
    const n = rows('ntp')[0] || {};
    const svc = rows('services');
    const onSvc = svc.filter(isOn).length;
    const tasks = rows('schedulers');
    const scripts = rows('scripts');
    return [
      kpiCard('router', 'blue', L('设备标识', 'Identity'), `<span class="sys-kpi-txt">${esc(String(idr.name || '—'))}</span>`,
        statusDot(!!idr.name, L('已命名', 'Named')),
        L('时区', 'Time zone') + ' ' + esc(String(c['time-zone-name'] || '—')),
        L('主路由', 'Main router')),
      kpiCard('clock', 'teal', L('系统时间', 'System time'), esc(String(c.time || '—')),
        statusDot(boolOn(n.enabled), L('NTP 已启用', 'NTP on'), L('未启用', 'Inactive')),
        esc(String(c.date || '—')), esc(String(c['time-zone-name'] || '—'))),
      kpiCard('clockSync', 'violet', L('NTP 客户端', 'NTP client'), `<span class="sys-kpi-txt">${esc(String(n.server || '—'))}</span>`,
        statusDot(boolOn(n.enabled), L('同步中', 'Syncing'), L('未启用', 'Inactive')),
        esc(L('备用', 'Backup') + ' ' + String(n.server2 || '—')), esc(L('频率', 'Frequency') + ' ' + String(n.frequency || '—'))),
      kpiCard('layers', 'green', L('系统服务', 'Services'), String(svc.length),
        statusDot(onSvc > 0, L('运行中', 'Running')),
        onSvc + ' ' + L('启用', 'enabled') + ' · ' + (svc.length - onSvc) + ' ' + L('禁用', 'disabled'),
        tasks.length + ' ' + L('任务', 'tasks') + ' · ' + scripts.length + ' ' + L('脚本', 'scripts')),
    ].join('');
  }

  /* ---------- rail 卡片 ---------- */
  function railHtml() {
    const c = rows('clock')[0] || {};
    const n = rows('ntp')[0] || {};
    const cloud = rows('cloud')[0] || {};
    const pkg = rows('systemPackage');
    const ros = pkg.find((x) => String(x.name || '') === 'routeros') || {};
    const ddnsOn = boolOn(cloud['ddns-enabled']);
    const ntpOn = boolOn(n.enabled);
    const clockBody = `${kvRow(L('日期', 'Date'), c.date || '—')}
      ${kvRow(L('时间', 'Time'), c.time || '—', 'mono')}
      ${kvRow(L('时区', 'Time zone'), c['time-zone-name'] || '—')}
      <a class="link" href="javascript:void(0)" data-act="sys-goto" data-sec="clock">${esc(L('编辑系统时钟', 'Edit clock'))}${ic('chevron')}</a>`;
    const ntpBody = `${kvRow(L('主服务器', 'Primary'), n.server || '—', 'mono')}
      ${kvRow(L('备用服务器', 'Secondary'), n.server2 || '—', 'mono')}
      ${kvRow(L('同步频率', 'Frequency'), n.frequency || '—')}
      <a class="link" href="javascript:void(0)" data-act="sys-goto" data-sec="ntp">${esc(L('编辑 NTP 配置', 'Edit NTP'))}${ic('chevron')}</a>`;
    const cloudBody = `${kvRow(L('DDNS 域名', 'DDNS name'), cloud['dns-name'] || '—', 'mono')}
      ${kvRow(L('公网地址', 'Public address'), cloud['public-address'] || '—', 'mono')}
      ${kvRow(L('上次更新', 'Last update'), cloud['update-time'] || '—')}
      <a class="link" href="javascript:void(0)" data-act="sys-goto" data-sec="cloud">${esc(L('编辑云服务', 'Edit cloud'))}${ic('chevron')}</a>`;
    const pkgRows = pkg.slice(0, 4).map((p) => `<div class="kv"><span class="mono">${ex(p.name || '—')}</span><b class="mono">${ex(p.version || '—')}</b></div>`).join('');
    const pkgBody = pkgRows + `<a class="link" href="javascript:void(0)" data-act="sys-goto" data-sec="systemPackage">${esc(L('查看全部软件包', 'All packages'))}${ic('chevron')}</a>`;
    return [
      miniCard(L('时钟与时区', 'Clock & time zone'), L('RouterOS 本地时间', 'RouterOS local time'), clockBody),
      miniCard(L('NTP 同步', 'NTP sync'), L('客户端时间源', 'Client time source'), ntpBody,
        `<span class="badge ${ntpOn ? 'teal' : 'neutral'}">${esc(ntpOn ? L('已启用', 'Enabled') : L('未启用', 'Inactive'))}</span>`),
      miniCard(L('云服务 / DDNS', 'Cloud / DDNS'), L('MikroTik DDNS', 'MikroTik DDNS'), cloudBody,
        `<span class="badge ${ddnsOn ? 'teal' : 'neutral'}">${esc(ddnsOn ? L('已启用', 'Enabled') : L('未启用', 'Inactive'))}</span>`),
      miniCard(L('软件包', 'Packages'), 'RouterOS ' + String(ros.version || '—'), pkgBody),
    ].join('');
  }

  /* ---------- 页面骨架 ---------- */
  function tabsHtml() {
    return `<div class="panel-tabs" data-tabs>${SECTIONS.map((s) => {
      const count = SINGLETON.has(s) ? (rows(s).length ? 1 : 0) : rows(s).length;
      return `<button class="panel-tab ${s === R.section ? 'on' : ''}" type="button" data-act="sys-tab" data-tab="${s}">${esc(tabLabel(s))}<span class="pt-count">${count}</span></button>`;
    }).join('')}</div>`;
  }
  function pageHead() {
    const addLabel = L('新增', 'Add') + ' · ' + tabLabel(R.section);
    const meta = [
      deviceLabel(), 'RouterOS',
      rows('services').length + ' ' + L('个服务', 'services'),
      rows('schedulers').length + ' ' + L('个任务', 'tasks'),
      rows('scripts').length + ' ' + L('个脚本', 'scripts'),
    ];
    return `<div class="page-head"><div><h1>${esc(L('系统管理', 'System'))}</h1>
      <div class="meta">${meta.map((m, i) => (i ? '<span class="sep"></span>' : '') + `<span${i >= 2 ? ' class="hide-sm"' : ''}>${esc(m)}</span>`).join('')}</div></div>
      <div class="actions"><span class="live"><span class="dot"></span>${esc(relTime(R.loadedAt))}</span>
        ${canWrite(R.section) ? `<button class="btn primary" type="button" data-act="sys-add">${ic('plus')}${esc(addLabel)}</button>` : ''}
      </div></div>`;
  }
  function html() {
    return `${pageHead()}
      <div class="grid align-start">
        <div class="kpis">${kpisHtml()}</div>
        <section class="card span8"><div class="card-head"><div><h2 class="card-title">${esc(L('设备与系统服务', 'Device & system services'))}</h2>
          <div class="card-sub">${esc(secTitle(R.section) + ' · ' + (secPath(R.section) || '—'))}</div></div>
          <button class="btn icon-only" type="button" data-act="sys-menu" title="${esc(L('更多', 'More'))}" aria-label="${esc(L('更多', 'More'))}">${ic('more')}</button></div>
          ${tabsHtml()}
          <div class="tab-panel on" data-panel="${R.section}">${panelBody(R.section)}</div>
        </section>
        <div class="span4 rail">${railHtml()}</div>
      </div>`;
  }

  /* ---------- 重绘与事件 ---------- */
  function bindSearch() {
    const s = $('sysSearch');
    if (!s) return;
    s.value = R.q;
    s.oninput = () => {
      R.q = s.value;
      R.page = 1;
      repaintPanel();
      const n = $('sysSearch');
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    };
  }
  function repaintPanel() {
    const host = document.querySelector('.ui-v2 .content.pg-sys .tab-panel');
    if (!host) return;
    host.innerHTML = panelBody(R.section);
    bindSearch();
  }
  function scrollActiveTab() {
    const bar = document.querySelector('.ui-v2 .content.pg-sys .panel-tabs');
    const on = bar && bar.querySelector('.panel-tab.on');
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth || R.scrolledTab === R.section) return;
    R.scrolledTab = R.section;
    const br = bar.getBoundingClientRect(), or = on.getBoundingClientRect();
    bar.scrollLeft = Math.max(0, bar.scrollLeft + (or.left - br.left) - (br.width - or.width) / 2);
  }
  function paint() {
    const c = $('content');
    if (!c || SECTIONS.indexOf(state.section) < 0) return;
    c.className = 'content dash pg-dhcp pg-sys';
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
    if (a === 'sys-tab') { if (el.dataset.tab !== R.section) goSection(el.dataset.tab); return; }
    if (a === 'sys-goto') { goSection(el.dataset.sec); return; }
    if (a === 'sys-chip') { R.chip = el.dataset.chip || 'all'; R.page = 1; repaintPanel(); return; }
    if (a === 'sys-page') { R.page = num(el.dataset.page, 1); repaintPanel(); return; }
    if (a === 'sys-refresh') { loadAll(true); return; }
    if (a === 'sys-add') { openAdd(R.section); return; }
    if (a === 'sys-edit') { openEdit(el.dataset.sec || R.section, el.dataset.id || ''); return; }
    if (a === 'sys-more') { rowMenu(el.dataset.sec || R.section, el.dataset.id, el); return; }
    if (a === 'sys-menu') { openCardMenu(el); return; }
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
  function openCardMenu(anchor) {
    const u = window.UI;
    if (!u || !u.openMenu) return;
    u.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前筛选结果', 'CSV · current filter'), icon: 'i-download', action: () => exportCsv() },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: document.body.classList.contains('ui-compact') ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: document.body.classList.contains('ui-compact'), action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        say(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(tabLabel(R.section))}</small></div>` });
  }

  function install() {
    if (window.__systemV3Installed) return;
    window.__systemV3Installed = true;
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
