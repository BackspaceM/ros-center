'use strict';

/* ================= 国际化 ================= */
const I18N = {
  zh: {
    page_title: 'ROS Center', brand: 'ROS', brand_sub: 'Center', search_menu: '搜索菜单…',
    cpu: 'CPU', mem: '内存', disk: '存储', uptime: '运行', export_hint: '导出配置快照',
    overview_title: '系统概览', if_title: '接口详情',
    total_rx: '总下载', total_tx: '总上传', active_if: '活跃接口', peak_rx: '峰值下载',
    rx_hint: '所有接口接收速率之和', tx_hint: '所有接口发送速率之和', if_hint: '已启用并运行的接口',
    trend_title: '实时流量趋势', trend_sub: '最近 6 分钟 · 每秒采样', conn_title: '连接状态',
    conn_sub: '当前活跃连接统计', health_title: '设备健康', health_sub: 'CPU 与内存占用',
    wlan_title: '终端概览', wlan_sub: '在线终端与接口分布', top_if: '接口流量排行 (TOP 10)',
    top_if_sub: '按累计流量排序', top_conn: '连接流量排行 (TOP 10)', top_conn_sub: '按连接字节数排序',
    all: '全部接口', legend_rx: '下载 RX', legend_tx: '上传 TX',
    live: '实时 LIVE', demo: '演示 DEMO', connecting: '连接中', reconnect: '重连中',
    add: '新增', refresh: '刷新', save: '保存', cancel: '取消', edit: '编辑', delete: '删除',
    enable: '启用', disable: '禁用', enabled: '已启用', disabled: '已禁用', yes: '是', no: '否',
    filter: '筛选', search: '搜索', clear: '清空', close: '关闭', confirm: '确认',
    no_data: '暂无数据', waiting: '等待数据…', loading: '加载中…', selected: '已选',
    row_one: '条记录', rows: '条记录', page: '页', of: '/', prev: '上一页', next: '下一页',
    edit_title: '编辑', add_title: '新增', readonly_tip: '该页面为只读视图',
    confirm_delete: '确认删除', confirm_delete_msg: '确定要删除选中的记录吗？此操作不可撤销。',
    confirm_action: '确认操作', reboot_title: '重启路由器', reboot_msg: '确定要立即重启路由器吗？重启期间网络将中断约 1-2 分钟。',
    backup_title: '备份配置', backup_msg: '将当前配置保存为备份文件。', backup_name: '备份文件名',
    ping_title: '网络诊断', ping_addr: '目标地址', ping_run: '开始测试', ping_result: '测试结果',
    tools_title: '快捷工具', tools_sub: '常用运维操作', system_title: '系统信息',
    resources: '系统资源', system: '系统', note: '说明', warning: '注意',
    write_warn: '所有修改将实时写入 RouterOS。建议先在演示模式熟悉操作，生产环境修改前请先备份配置。',
    demo_mode_tip: '当前为演示模式，修改仅作用于本地内存，不会影响真实路由器。',
    saved_ok: '保存成功', deleted_ok: '删除成功', action_ok: '操作成功', load_fail: '加载失败',
    selected_none: '请先选择记录', required: '请填写必填项', apply: '应用', running: '运行中', stopped: '已停止',
    traffic_title: '实时流量监控', traffic_sub: '接口速率与累计流量', iface: '接口', type: '类型',
    rate_rx: '下载速率', rate_tx: '上传速率', spark: '趋势', total: '累计流量', status: '状态',
    time: '时间', topics: '主题', message: '内容', clear_log: '清空日志',
    count: '数量', name: '名称', value: '值', group: '用户组', comment: '备注',
    devices: '设备管理', devices_sub: '集中管控多台 RouterOS，切换后所有页面自动跟随当前设备',
    device_name: '设备名称', device_primary: '设为主设备', device_active: '当前设备', device_add: '新增设备',
    device_edit: '编辑设备', device_del: '删除设备', device_del_msg: '确定删除该设备？其历史数据和演示配置将一并清除。',
    device_status: '状态', device_test: '测试连接', device_saved: '设备已保存', device_switch: '已切换到',
    device_current: '当前为主设备', device_count: '设备数量', device_hint: '点顶栏设备下拉即可切换；主设备决定默认显示哪台。',
    device_reconnect: '重新连接', device_no_password: '留空表示不修改', device_required: '请填写名称、地址、端口和账号',
    theme_system: '跟随系统', theme_light: '浅色', theme_dark: '深色', theme_glass: '毛玻璃', theme_porcelain: '青花瓷',
    theme_liquid: '液态玻璃', theme_aurora: '极光', theme_ocean: '深海', theme_sakura: '樱粉', theme_mono: '黑白极简',
    theme_title: '界面风格', conn_settings: '连接设置', conn_settings_sub: '直接在网页里填写 RouterOS 地址与账号，无需编辑 .env 文件',
    conn_host: 'RouterOS 地址', conn_port: 'API 端口', conn_user: '账号', conn_password: '密码',
    conn_tls: '使用 API-SSL (TLS)', conn_demo: '演示模式（不连接真实路由器）', conn_test: '测试连接',
    conn_save: '保存并连接', conn_saved: '连接设置已保存，正在重新连接', conn_test_ok: '连接成功', conn_test_fail: '连接失败',
    conn_tip: '填写后点"测试连接"验证，再点"保存并连接"。设置保存在容器的 /app/data/settings.json，重启不会丢失。首次使用演示模式可先熟悉界面。',
    conn_masked: '已保存密码（留空表示不修改）', conn_current: '当前状态', conn_security: '安全建议',
    conn_security_tip: '请在 RouterOS 上为 WebUI 单独建只读账号，并用防火墙限制 API 端口来源，切勿把服务暴露到公网。',
    sidebar_hint: '点击箭头折叠侧栏，拖动右侧边缘调整宽度',
    conn_web_port: 'WebUI 监听端口', conn_web_port_hint: '容器内监听端口；修改后需重启容器，并把 compose 的端口映射同步为「外部端口:此端口」',
    conn_host_port: '外部访问端口', conn_restart: '监听端口已保存，请重启容器后生效',
    wg_qr: '扫码添加', wg_qr_title: 'WireGuard 客户端配置', wg_qr_sub: '修改参数后扫描二维码，或在手机客户端导入 .conf 文件',
    wg_addr: '客户端地址', wg_priv: '客户端私钥', wg_dns: 'DNS', wg_pub: '服务端公钥', wg_endpoint: '服务端地址',
    wg_allowed: '允许 IP', wg_keepalive: '持久保活(秒)', wg_copy: '复制配置', wg_download: '下载 .conf',
    wg_qr_tip: '二维码等同于配置文件，客户端私钥请勿泄露。真实模式下请填写客户端生成的私钥，并把对应公钥加到 RouterOS 对端。',
  },
  en: {
    page_title: 'ROS Center', brand: 'ROS', brand_sub: 'Center', search_menu: 'Search menu…',
    cpu: 'CPU', mem: 'Memory', disk: 'Disk', uptime: 'Uptime', export_hint: 'Export config snapshot',
    overview_title: 'Dashboard', if_title: 'Interface details',
    total_rx: 'Total download', total_tx: 'Total upload', active_if: 'Active ports', peak_rx: 'Peak download',
    rx_hint: 'Sum of receive rates', tx_hint: 'Sum of transmit rates', if_hint: 'Enabled and running interfaces',
    trend_title: 'Live traffic trend', trend_sub: 'Last 6 minutes · 1s sampling', conn_title: 'Connection status',
    conn_sub: 'Active connection statistics', health_title: 'Device health', health_sub: 'CPU and memory usage',
    wlan_title: 'Client overview', wlan_sub: 'Online clients and interface distribution', top_if: 'Interface traffic (TOP 10)',
    top_if_sub: 'Sorted by total traffic', top_conn: 'Connection traffic (TOP 10)', top_conn_sub: 'Sorted by bytes',
    all: 'All interfaces', legend_rx: 'Download RX', legend_tx: 'Upload TX',
    live: 'LIVE', demo: 'DEMO', connecting: 'Connecting', reconnect: 'Reconnecting',
    add: 'Add', refresh: 'Refresh', save: 'Save', cancel: 'Cancel', edit: 'Edit', delete: 'Delete',
    enable: 'Enable', disable: 'Disable', enabled: 'Enabled', disabled: 'Disabled', yes: 'Yes', no: 'No',
    filter: 'Filter', search: 'Search', clear: 'Clear', close: 'Close', confirm: 'Confirm',
    no_data: 'No data', waiting: 'Waiting for data…', loading: 'Loading…', selected: 'selected',
    row_one: 'record', rows: 'records', page: 'Page', of: '/', prev: 'Prev', next: 'Next',
    edit_title: 'Edit', add_title: 'Add', readonly_tip: 'This page is read-only',
    confirm_delete: 'Confirm delete', confirm_delete_msg: 'Delete the selected records? This cannot be undone.',
    confirm_action: 'Confirm action', reboot_title: 'Reboot router', reboot_msg: 'Reboot the router now? Network will be down for 1-2 minutes.',
    backup_title: 'Backup configuration', backup_msg: 'Save current configuration to a backup file.', backup_name: 'Backup filename',
    ping_title: 'Network diagnostic', ping_addr: 'Target address', ping_run: 'Run test', ping_result: 'Result',
    tools_title: 'Quick tools', tools_sub: 'Common maintenance actions', system_title: 'System information',
    resources: 'System resources', system: 'System', note: 'Note', warning: 'Warning',
    write_warn: 'Changes are written to RouterOS immediately. Familiarize yourself in demo mode first and back up before production changes.',
    demo_mode_tip: 'Demo mode: changes only affect local memory and will not touch a real router.',
    saved_ok: 'Saved', deleted_ok: 'Deleted', action_ok: 'Done', load_fail: 'Load failed',
    selected_none: 'Select at least one record', required: 'Please fill required fields', apply: 'Apply', running: 'Running', stopped: 'Stopped',
    traffic_title: 'Live traffic monitor', traffic_sub: 'Interface rates and totals', iface: 'Interface', type: 'Type',
    rate_rx: 'Download rate', rate_tx: 'Upload rate', spark: 'Trend', total: 'Total traffic', status: 'Status',
    time: 'Time', topics: 'Topics', message: 'Message', clear_log: 'Clear log',
    count: 'Count', name: 'Name', value: 'Value', group: 'Group', comment: 'Comment',
    devices: 'Devices', devices_sub: 'Manage multiple RouterOS routers; every page follows the selected device',
    device_name: 'Device name', device_primary: 'Set primary', device_active: 'Current device', device_add: 'Add device',
    device_edit: 'Edit device', device_del: 'Delete device', device_del_msg: 'Delete this device? Its history and demo config will be removed.',
    device_status: 'Status', device_test: 'Test connection', device_saved: 'Device saved', device_switch: 'Switched to',
    device_current: 'Primary device', device_count: 'Devices', device_hint: 'Use the device dropdown in the top bar to switch; the primary device is shown by default.',
    device_reconnect: 'Reconnect', device_no_password: 'Leave blank to keep', device_required: 'Name, host, port and user are required',
    theme_system: 'System', theme_light: 'Light', theme_dark: 'Dark', theme_glass: 'Glass', theme_porcelain: 'Porcelain',
    theme_liquid: 'Liquid glass', theme_aurora: 'Aurora', theme_ocean: 'Deep sea', theme_sakura: 'Sakura', theme_mono: 'Mono',
    theme_title: 'Theme', conn_settings: 'Connection settings', conn_settings_sub: 'Set RouterOS address and credentials right in the web UI - no .env editing needed',
    conn_host: 'RouterOS address', conn_port: 'API port', conn_user: 'Username', conn_password: 'Password',
    conn_tls: 'Use API-SSL (TLS)', conn_demo: 'Demo mode (do not connect to a real router)', conn_test: 'Test connection',
    conn_save: 'Save & connect', conn_saved: 'Settings saved, reconnecting', conn_test_ok: 'Connection successful', conn_test_fail: 'Connection failed',
    conn_tip: 'Click "Test connection" to verify, then "Save & connect". Settings persist in /app/data/settings.json. Demo mode is handy for a first look.',
    conn_masked: 'Password saved (leave blank to keep)', conn_current: 'Current status', conn_security: 'Security tip',
    conn_security_tip: 'Create a dedicated read-only user on RouterOS and restrict the API port with firewall rules. Never expose this service to the internet.',
    sidebar_hint: 'Click the arrow to collapse; drag the right edge to resize',
    conn_web_port: 'WebUI listen port', conn_web_port_hint: 'Container listen port. Restart the container after changing it and update the compose mapping to "external:this port"',
    conn_host_port: 'External port', conn_restart: 'Port saved. Restart the container to apply',
    wg_qr: 'Scan to add', wg_qr_title: 'WireGuard client config', wg_qr_sub: 'Edit the fields, then scan the QR or import the .conf on your device',
    wg_addr: 'Client address', wg_priv: 'Client private key', wg_dns: 'DNS', wg_pub: 'Server public key', wg_endpoint: 'Server endpoint',
    wg_allowed: 'Allowed IPs', wg_keepalive: 'Persistent keepalive (s)', wg_copy: 'Copy config', wg_download: 'Download .conf',
    wg_qr_tip: 'The QR equals the config file - keep the client private key secret. In live mode, paste the private key generated on the client and add its public key to RouterOS.',
  },
};
const urlLang = new URLSearchParams(location.search).get('lang');
let lang = urlLang === 'en' || urlLang === 'zh' ? urlLang : (localStorage.getItem('ros-traffic-lang') === 'en' ? 'en' : 'zh');
const t = (k) => I18N[lang][k] || k;
const tx = (obj) => (obj && (obj[lang] || obj.zh)) || '';
const L = (zh, en) => (lang === 'zh' ? zh : en);

/* ================= 状态 ================= */
const state = {
  schema: null, section: 'dashboard', latest: null, points: [], ifHistory: new Map(),
  resourceHistory: [], rows: [], rowFilter: '', page: 1, pageSize: 15, selectedIds: new Set(),
  hoverIndex: -1, selectedIface: '__all__', mode: 'demo', configDemo: false,
  collapsedGroups: new Set(), devices: [], deviceId: '', devicePrimary: '', webPort: 10086, hostPort: 0,
};
try { JSON.parse(localStorage.getItem('ros-traffic-groups') || '[]').forEach((id) => state.collapsedGroups.add(id)); } catch (e) { /* ignore */ }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= 主题 ================= */
const THEMES = ['system', 'light', 'dark', 'glass', 'porcelain', 'liquid', 'aurora', 'ocean', 'sakura', 'mono'];
const urlTheme = new URLSearchParams(location.search).get('theme');
let theme = THEMES.includes(urlTheme) ? urlTheme : (localStorage.getItem('ros-traffic-theme') || 'system');
if (!THEMES.includes(theme)) theme = 'system';
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function themeFill(name, fallback, alpha) {
  const c = cssVar(name, fallback);
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    if (Number.isFinite(n)) return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  return c;
}
function applyTheme(persist) {
  document.documentElement.dataset.theme = theme;
  const sel = $('themeSelect'); if (sel) sel.value = theme;
  if (persist === false) return;
  try { localStorage.setItem('ros-traffic-theme', theme); } catch (e) { /* ignore */ }
}

/* ================= 工具 ================= */
function fmtRate(bps) {
  let v = Number(bps) || 0, i = 0; const u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  while (v >= 1000 && i < 3) { v /= 1000; i++; }
  return { v: v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2), u: u[i] };
}
const fmtRateStr = (b) => { const r = fmtRate(b); return r.v + ' ' + r.u; };
function fmtBytes(b) {
  b = Number(b) || 0; let i = 0; const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2) + ' ' + u[i];
}
function fmtUptime(s) {
  s = Number(s) || 0; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return lang === 'zh' ? (d ? d + '天' : '') + (h ? h + '时' : '') + m + '分' : (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm';
}
function fmtTime(ts) { const d = new Date(ts); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); }
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}
async function api(path, opts) {
  /* 所有配置类接口自动带上当前设备；设备管理/目录接口除外 */
  if (state.deviceId && /^\/api\/(config|action|snapshot|history|status)(\?|$)/.test(path)) {
    path += (path.includes('?') ? '&' : '?') + 'device=' + encodeURIComponent(state.deviceId);
  }
  const r = await fetch(path, opts);
  let d; try { d = await r.json(); } catch (e) { throw new Error('HTTP ' + r.status); }
  if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}

/* ================= 弹窗 ================= */
function openModal(title, bodyHtml, footHtml, onMount) {
  $('modal').innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button type="button" data-close>×</button></div>
    <div class="modal-body">${bodyHtml}</div><div class="modal-foot">${footHtml}</div>`;
  $('modalMask').hidden = false;
  $('modal').querySelector('[data-close]').onclick = closeModal;
  if (onMount) onMount($('modal'));
}
function closeModal() { $('modalMask').hidden = true; $('modal').innerHTML = ''; }
$('modalMask').addEventListener('click', (e) => { if (e.target === $('modalMask')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modalMask').hidden) closeModal(); });

function confirmModal(title, msg, danger, onConfirm) {
  openModal(title, `<div class="modal-note">${msg}</div>`,
    `<button class="btn" data-close>${t('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${t('confirm')}</button>`,
    (m) => {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-ok]').onclick = async () => { closeModal(); await onConfirm(); };
    });
}

/* ================= 导航 ================= */
function buildNav(filter = '') {
  const nav = $('sideNav'); const f = filter.trim().toLowerCase();
  const groups = state.schema.groups;
  nav.innerHTML = groups.map((g) => {
    const items = state.schema.sections.filter((s) => s.group === g.id && (!f || tx(s.title).toLowerCase().includes(f) || s.id.includes(f)));
    if (!items.length) return '';
    const activeHere = items.some((s) => s.id === state.section);
    const collapsed = !f && state.collapsedGroups.has(g.id);
    return `<div class="nav-group ${collapsed ? 'collapsed' : ''} ${activeHere ? 'has-active' : ''}">
      <button class="nav-group-title" data-group="${g.id}" title="${esc(tx(g))}">
        <span>${esc(tx(g))}</span><span class="group-chev">⌄</span><span class="group-count">${items.length}</span>
      </button>
      <div class="nav-items">${items.map((s) =>
        `<button class="nav-item ${s.id === state.section ? 'active' : ''}" data-section="${s.id}" title="${esc(tx(s.title))}">
          ${iconSvg(sectionIconName(s))}<span class="nav-label">${esc(tx(s.title))}</span></button>`).join('')}</div></div>`;
  }).join('');
  nav.querySelectorAll('.nav-item').forEach((b) => b.onclick = () => { navigate(b.dataset.section); });
  nav.querySelectorAll('.nav-group-title').forEach((b) => b.onclick = () => {
    const id = b.dataset.group;
    if (state.collapsedGroups.has(id)) state.collapsedGroups.delete(id); else state.collapsedGroups.add(id);
    saveCollapsedGroups(); buildNav($('navSearch').value);
  });
  const fold = $('foldAllBtn');
  if (fold) fold.textContent = groups.every((g) => state.collapsedGroups.has(g.id)) ? '+' : '−';
}
function saveCollapsedGroups() {
  try { localStorage.setItem('ros-traffic-groups', JSON.stringify([...state.collapsedGroups])); } catch (e) { /* ignore */ }
}
/* 按分类 id 匹配图标，未命中时按名称关键字兜底 */
const SECTION_ICONS = {
  dashboard: 'gauge', traffic: 'activity', systemTools: 'tools', connections: 'link',
  interfaces: 'ethernet', ipAddresses: 'ip', dhcpClients: 'monitor', dhcpServers: 'server',
  dhcpNetworks: 'subnet', dhcpLeases: 'clipboard', dns: 'globe', dnsStatic: 'pin',
  routes: 'route', pools: 'database', neighbors: 'radar',
  firewallFilter: 'filter', firewallNat: 'nat', firewallMangle: 'tag', addressLists: 'addressBook', servicePorts: 'ports',
  wifi: 'wifi', wirelessSec: 'lock',
  pppSecrets: 'key', pppProfiles: 'sliders', pppActive: 'userCheck', wireguard: 'tunnel', wgPeers: 'nodes',
  simpleQueues: 'speed', queueTree: 'tree',
  connectionSettings: 'plug', identity: 'router', clock: 'clock', ntp: 'clockSync', users: 'user', userGroups: 'users',
  services: 'toggle', schedulers: 'calendar', scripts: 'code', systemPackage: 'package', logs: 'log',
};
function sectionIconName(s) {
  if (SECTION_ICONS[s.id]) return SECTION_ICONS[s.id];
  const n = (s.id + ' ' + (typeof s.title === 'string' ? s.title : JSON.stringify(s.title || {}))).toLowerCase();
  if (/filter|firewall/.test(n)) return 'filter';
  if (/nat/.test(n)) return 'nat';
  if (/wireguard|tunnel|vpn|ppp/.test(n)) return 'tunnel';
  if (/queue|bandwidth|限速/.test(n)) return 'speed';
  if (/dns|domain/.test(n)) return 'globe';
  if (/user|account/.test(n)) return 'user';
  if (/log/.test(n)) return 'log';
  if (/route/.test(n)) return 'route';
  if (/dhcp|pool|address/.test(n)) return 'ip';
  if (/wifi|wireless/.test(n)) return 'wifi';
  if (/system|setting|config/.test(n)) return 'gear';
  return 'grid';
}
function iconSvg(name) {
  const p = {
    grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
    network: '<rect x="1" y="2" width="5" height="4" rx="1"/><rect x="10" y="2" width="5" height="4" rx="1"/><rect x="5.5" y="10" width="5" height="4" rx="1"/><path d="M3.5 6v2h9V6M8 8v2"/>',
    shield: '<path d="M8 1.5 14 4v4c0 3.5-2.5 5.5-6 6.5C4.5 13.5 2 11.5 2 8V4z"/>',
    wifi: '<path d="M1.5 5.5a10 10 0 0 1 13 0M4 8a6.5 6.5 0 0 1 8 0M6.5 10.5a3 3 0 0 1 3 0"/><circle cx="8" cy="13" r="1" fill="currentColor"/>',
    vpn: '<rect x="2" y="7" width="12" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
    queue: '<path d="M2 3h12M2 8h8M2 13h5"/>',
    gear: '<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M13 3l-1.5 1.5M4.5 11.5 3 13"/>',
    log: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 5h6M5 8h6M5 11h4"/>',
    gauge: '<path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 11.5 11 7"/><circle cx="8" cy="11.5" r="1" fill="currentColor"/>',
    activity: '<path d="M1 8h3l2-5 3 10 2-5h4"/>',
    tools: '<path d="M13.2 2.8a3.5 3.5 0 0 0-4.6 4.5L3.4 12.5a1.3 1.3 0 0 0 1.8 1.8l5.2-5.2a3.5 3.5 0 0 0 4.6-4.6l-2.4 2.4-2-.5-.6-1.8z"/>',
    link: '<path d="M6 10l4-4"/><path d="M7.5 4.5 9 3a3 3 0 0 1 4.2 4.2l-1.7 1.7"/><path d="M8.5 11.5 7 13a3 3 0 0 1-4.2-4.2l1.7-1.7"/>',
    ethernet: '<rect x="2" y="5" width="12" height="7" rx="1"/><path d="M5 2v3M8 2v3M11 2v3M5 12v2M8 12v2M11 12v2"/>',
    ip: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
    monitor: '<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M1 13h14M6 11h4"/>',
    server: '<rect x="2" y="2" width="12" height="5" rx="1"/><rect x="2" y="9" width="12" height="5" rx="1"/><circle cx="4" cy="4.5" r=".8" fill="currentColor"/><circle cx="4" cy="11.5" r=".8" fill="currentColor"/><path d="M7 4.5h4M7 11.5h4"/>',
    subnet: '<rect x="1.5" y="2" width="13" height="5" rx="1"/><path d="M4 10h9M4 13h6"/>',
    clipboard: '<rect x="3" y="3" width="10" height="12" rx="1"/><path d="M6 3V1.5h4V3M5.5 7h5M5.5 10h5"/>',
    globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2 2.2 10 0 12"/>',
    pin: '<path d="M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M8 9.5V14"/>',
    route: '<circle cx="3" cy="12.5" r="1.5"/><circle cx="13" cy="3.5" r="1.5"/><path d="M4.5 12.5h4a2.5 2.5 0 0 0 0-5h-1a2.5 2.5 0 0 1 0-5h4"/>',
    database: '<ellipse cx="8" cy="4" rx="5.5" ry="2"/><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>',
    radar: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/><path d="M8 8 12 4"/>',
    filter: '<path d="M2 3h12l-5 5.5V13l-2 1V8.5z"/>',
    nat: '<path d="M2 5h9M8 2l3 3-3 3M14 11H5M8 8l-3 3 3 3"/>',
    tag: '<path d="M8 2H3v5l6 6 5-5z"/><circle cx="5.5" cy="4.5" r=".9" fill="currentColor"/>',
    addressBook: '<rect x="3" y="2" width="11" height="12" rx="1"/><path d="M6 2v12M8 6h4M8 9h4"/>',
    ports: '<rect x="2" y="2" width="12" height="12" rx="1"/><rect x="4" y="4" width="3" height="2"/><rect x="9" y="4" width="3" height="2"/><rect x="4" y="10" width="3" height="2"/><rect x="9" y="10" width="3" height="2"/>',
    lock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    key: '<circle cx="5" cy="11" r="2.5"/><path d="M6.8 9.2 13 3M11 3h2v2"/>',
    sliders: '<path d="M2 4h12M2 8h12M2 12h12"/><circle cx="5" cy="4" r="1.5" fill="var(--side-2)"/><circle cx="11" cy="8" r="1.5" fill="var(--side-2)"/><circle cx="7" cy="12" r="1.5" fill="var(--side-2)"/>',
    users: '<circle cx="6" cy="5" r="2"/><path d="M2 13c0-2.5 1.8-4 4-4s4 1.5 4 4"/><path d="M11 4.5a2 2 0 0 1 0 4M12 9.5c1.5.6 2 1.9 2 3.5"/>',
    userCheck: '<circle cx="6" cy="5" r="2"/><path d="M2 13c0-2.5 1.8-4 4-4s4 1.5 4 4"/><path d="M10 12l2 2 3.5-4"/>',
    tunnel: '<path d="M2 12c3 0 3-8 6-8s3 8 6 8"/><path d="M2 8h12"/>',
    nodes: '<circle cx="3" cy="8" r="2"/><circle cx="13" cy="4" r="2"/><circle cx="13" cy="12" r="2"/><path d="M5 7l6-2M5 9l6 2"/>',
    speed: '<path d="M2 12a6 6 0 1 1 12 0"/><path d="M8 12l4-5M4 12h8"/>',
    tree: '<rect x="6" y="2" width="4" height="3" rx=".5"/><rect x="1" y="11" width="4" height="3" rx=".5"/><rect x="11" y="11" width="4" height="3" rx=".5"/><path d="M8 5v3M3 11V9h10v2"/>',
    plug: '<path d="M5 2v4M11 2v4"/><path d="M3 6h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5z"/><path d="M8 13v2"/>',
    router: '<rect x="1.5" y="6" width="13" height="6" rx="1"/><circle cx="4" cy="9" r=".9" fill="currentColor"/><circle cx="6.5" cy="9" r=".9" fill="currentColor"/><path d="M10 9h2M4 3v3M12 3v3"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
    clockSync: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2.5 1.5"/><path d="M12.5 3.5 14 5M3.5 12.5 2 11"/>',
    user: '<circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-3 2.2-5 5-5s5 2 5 5"/>',
    toggle: '<rect x="2" y="5" width="12" height="6" rx="3"/><circle cx="10.5" cy="8" r="1.6" fill="currentColor"/>',
    calendar: '<rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6h12M5 1.5v3M11 1.5v3M5 9h2M9 9h2M5 12h2"/>',
    code: '<path d="M6 4 2 8l4 4M10 4l4 4-4 4"/>',
    package: '<path d="M8 1.5 14 4.5v7L8 14.5 2 11.5v-7z"/><path d="M2 4.5 8 8l6-3.5M8 8v6.5"/>',
  };
  return `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${p[name] || p.grid}</svg>`;
}
/* ================= 多设备切换 ================= */
function renderDevicePicker() {
  const sel = $('deviceSelect'); if (!sel) return;
  sel.innerHTML = state.devices.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  sel.value = state.deviceId;
  const cur = state.devices.find((d) => d.id === state.deviceId);
  $('deviceDot').classList.toggle('live', !!(cur && (cur.status.mode === 'live' || cur.status.connected)));
}
async function loadDevices(keepLocal) {
  try {
    const d = await api('/api/devices');
    state.devices = d.devices || [];
    state.devicePrimary = d.activeId || '';
    state.webPort = d.webPort || 10086; state.hostPort = d.hostPort || 0;
    if (!keepLocal && !state.deviceId) {
      const urlDev = new URLSearchParams(location.search).get('device');
      const nameDev = new URLSearchParams(location.search).get('dev');
      const saved = localStorage.getItem('ros-traffic-device');
      const wanted = urlDev || (nameDev && (state.devices.find((x) => x.name === nameDev) || {}).id) || saved;
      state.deviceId = state.devices.some((x) => x.id === wanted) ? wanted : state.devicePrimary;
    }
    if (!state.devices.some((x) => x.id === state.deviceId)) state.deviceId = state.devicePrimary;
    renderDevicePicker();
    return d;
  } catch (e) { return null; }
}
async function switchDevice(id, silent) {
  if (!id || id === state.deviceId || !state.devices.some((d) => d.id === id)) return;
  state.deviceId = id;
  try { localStorage.setItem('ros-traffic-device', id); } catch (e) { /* ignore */ }
  state.points = []; state.resourceHistory = []; state.ifHistory.clear(); state.selectedIface = '__all__';
  state.latest = null; state.connRows = [];
  renderDevicePicker();
  const nowDev = state.devices.find((x) => x.id === id);
  if (nowDev && $('adminName')) $('adminName').textContent = nowDev.user || 'admin';
  if (socket) { const old = socket; socket = null; old.onclose = null; old.close(); }
  connect();
  await loadSnapshot();
  const sec = state.schema && state.schema.sections.find((s) => s.id === state.section);
  if (sec && sec.path && $('tbody')) { try { await loadRows(sec); } catch (e) { /* ignore */ } }
  try { state.connRows = (await api('/api/config?section=connections')).rows || []; } catch (e) { /* ignore */ }
  renderPage();
  if (!silent) { const d = state.devices.find((x) => x.id === id); toast(t('device_switch') + ' ' + (d ? d.name : ''), 'ok'); }
}

function navigate(id) {
  state.section = id; state.rows = []; state.selectedIds.clear(); state.rowFilter = ''; state.page = 1;
  const sec = state.schema.sections.find((s) => s.id === id);
  if (sec) { state.collapsedGroups.delete(sec.group); saveCollapsedGroups(); }
  buildNav(); renderPage();
  try { localStorage.setItem('ros-traffic-section', id); } catch (e) { /* ignore */ }
}

/* ================= 实时数据 ================= */
let socket = null, reconnectDelay = 1000;
async function loadSnapshot() {
  try {
    const d = await api('/api/snapshot');
    if (Array.isArray(d.history)) state.points = d.history.slice();
    if (Array.isArray(d.resourceHistory)) state.resourceHistory = d.resourceHistory.slice();
    for (const p of state.points) if (p.per) for (const [n, v] of Object.entries(p.per)) pushIfHist(n, p.ts, v);
    if (d.ifaces) applyData(d);
  } catch (e) { /* ws fallback */ }
}
function pushIfHist(name, ts, v) {
  if (!state.ifHistory.has(name)) state.ifHistory.set(name, []);
  const a = state.ifHistory.get(name); a.push({ ts, rx: v.rx, tx: v.tx }); if (a.length > 90) a.shift();
}
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(proto + '//' + location.host + '/?device=' + encodeURIComponent(state.deviceId || '*'));
  socket.onopen = () => { reconnectDelay = 1000; };
  socket.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (d.deviceId && state.deviceId && d.deviceId !== state.deviceId) return;
    applyData(d);
  };
  socket.onclose = () => { setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(10000, reconnectDelay * 1.6); };
  socket.onerror = () => socket.close();
}
function applyData(d) {
  if (d.deviceName) { const dev = state.devices.find((x) => x.id === (d.deviceId || state.deviceId)); if (dev) dev.status = dev.status || {}, dev.status.mode = d.mode; }
  state.latest = d; state.mode = d.mode === 'live' ? 'live' : 'demo';
  if (Array.isArray(d.resourceHistory) && d.resourceHistory.length) state.resourceHistory = d.resourceHistory.slice();
  let rxSel = d.totalRx || 0, txSel = d.totalTx || 0;
  if (state.selectedIface !== '__all__') {
    const f = (d.ifaces || []).find((i) => i.name === state.selectedIface);
    rxSel = f ? f.rxBps : 0; txSel = f ? f.txBps : 0;
  }
  const per = {}; for (const i of d.ifaces || []) per[i.name] = { rx: i.rxBps, tx: i.txBps };
  state.points.push({ ts: d.ts, rx: rxSel, tx: txSel, per });
  if (state.points.length > 360) state.points.shift();
  for (const [n, v] of Object.entries(per)) pushIfHist(n, d.ts, v);
  if (state.resourceHistory.length === 0 && d.resource) {
    state.resourceHistory.push({ ts: d.ts, cpu: num(d.resource['cpu-load']), free: num(d.resource['free-memory']), total: num(d.resource['total-memory']) });
  }
  updateTopbar(d);
  if (state.section === 'dashboard') renderDashboard();
  else if (state.section === 'traffic') renderTraffic();
  else if (state.section === 'connections') refreshRowsIfLoaded();
}
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function updateTopbar(d) {
  const devDot = $('deviceDot'); if (devDot) devDot.classList.toggle('live', d.mode === 'live');
  const pill = $('sideMode'); pill.textContent = t(state.mode);
  $('sideDot').parentElement.classList.toggle('live', state.mode === 'live');
  const r = d.resource || {};
  const cpu = num(r['cpu-load']), memPct = r['total-memory'] ? Math.round((1 - num(r['free-memory']) / num(r['total-memory'])) * 100) : 0;
  const diskPct = r['total-hdd-space'] ? Math.round((1 - num(r['free-hdd-space']) / num(r['total-hdd-space'])) * 100) : 0;
  $('cpuVal').textContent = cpu + '%'; $('memVal').textContent = memPct + '%'; $('diskVal').textContent = diskPct + '%';
  setBar('cpuBar', cpu); setBar('memBar', memPct); setBar('diskBar', diskPct);
  $('uptimeText').textContent = fmtUptime(d.uptime);
}
function setBar(id, pct) { const el = $(id); if (!el) return; el.style.width = Math.min(100, Math.max(0, pct)) + '%'; el.className = pct >= 85 ? 'high' : pct >= 65 ? 'warn' : ''; }

/* ================= 页面路由 ================= */
function renderPage() {
  const sec = state.schema.sections.find((s) => s.id === state.section);
  if (!sec) return;
  const g = state.schema.groups.find((x) => x.id === sec.group);
  $('crumbGroup').textContent = g ? tx(g) : ''; $('crumbSection').textContent = tx(sec.title);
  if (sec.id === 'dashboard') return renderDashboard();
  if (sec.id === 'traffic') return renderTraffic();
  if (sec.id === 'systemTools') return renderTools();
  if (sec.id === 'connectionSettings') return renderConnectionSettings();
  if (sec.path) return renderConfigPage(sec);
}
async function refreshRowsIfLoaded() {
  const sec = state.schema.sections.find((s) => s.id === state.section);
  if (sec && sec.path && $('tbody')) { try { await loadRows(sec); } catch (e) { /* ignore */ } }
}

function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $('langLabel').textContent = lang === 'zh' ? 'EN' : '中文';
  buildNav(); renderPage();
}

/* ================= 启动 ================= */
async function boot() {
  $('langBtn').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('ros-traffic-lang', lang);
    applyLang();
  };
  applyTheme(!urlTheme);
  $('themeSelect').onchange = (e) => { theme = e.target.value; applyTheme(); toast(t('theme_title') + ': ' + e.target.selectedOptions[0].textContent, 'ok'); };
  const urlCollapse = new URLSearchParams(location.search).get('collapse');
  const collapsed = urlCollapse === '1' || (urlCollapse !== '0' && localStorage.getItem('ros-traffic-collapsed') === '1');
  $('sidebar').classList.toggle('collapsed', collapsed);
  const urlWidth = Number(new URLSearchParams(location.search).get('sidebar'));
  const savedWidth = urlWidth >= 160 && urlWidth <= 360 ? urlWidth : Number(localStorage.getItem('ros-traffic-sidebar-w'));
  if (savedWidth >= 160 && savedWidth <= 360) document.documentElement.style.setProperty('--sidebar-w', savedWidth + 'px');
  $('collapseBtn').onclick = () => {
    const c = $('sidebar').classList.toggle('collapsed');
    try { localStorage.setItem('ros-traffic-collapsed', c ? '1' : '0'); } catch (e) { /* ignore */ }
    setTimeout(() => { if (state.section === 'dashboard') renderDashboard(); if (state.section === 'traffic') renderTraffic(); }, 200);
  };
  $('menuToggle').onclick = () => $('sidebar').classList.toggle('mobile-open');
  const rz = $('sideResize');
  rz.onmousedown = (e) => {
    e.preventDefault(); rz.classList.add('dragging');
    const move = (ev) => {
      const w = Math.max(160, Math.min(360, ev.clientX));
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    };
    const up = () => {
      rz.classList.remove('dragging');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 216;
      try { localStorage.setItem('ros-traffic-sidebar-w', String(w)); } catch (e) { /* ignore */ }
      if (state.section === 'dashboard') renderDashboard(); if (state.section === 'traffic') renderTraffic();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  $('navSearch').oninput = (e) => buildNav(e.target.value);
  $('foldAllBtn').onclick = () => {
    const allCollapsed = state.schema.groups.every((g) => state.collapsedGroups.has(g.id));
    state.collapsedGroups = allCollapsed ? new Set() : new Set(state.schema.groups.map((g) => g.id));
    saveCollapsedGroups(); buildNav($('navSearch').value);
  };
  $('settingsShortcut').onclick = () => navigate('connectionSettings');
  $('deviceSelect').onchange = (e) => switchDevice(e.target.value);
  $('logoutBtn').onclick = async () => {
    try {
      const d = await api('/api/status');
      openModal(t('export_hint'), `<div class="modal-note"><b>RouterOS:</b> ${esc(d.host)}:${esc(d.port)}<br><b>${t('status') || 'Status'}:</b> ${t(d.mode)}<br><b>${t('system')}:</b> ${esc(d.user)}</div>
        <pre class="code">${esc(JSON.stringify({ host: d.host, port: d.port, mode: d.mode, interval: d.interval, uptime: d.uptime }, null, 2))}</pre>`,
        `<button class="btn" data-close>${t('close')}</button>`, (m) => { m.querySelector('[data-close]').onclick = closeModal; });
    } catch (e) { toast(e.message, 'err'); }
  };
  $('adminBtn').onclick = () => navigate('connectionSettings');
  await loadDevices();
  const curDev = state.devices.find((d) => d.id === state.deviceId);
  if (curDev && curDev.user) $('adminName').textContent = curDev.user;
  try { state.schema = await api('/api/schema'); }
  catch (e) { document.body.innerHTML = '<div style="padding:40px;font:14px sans-serif">无法加载配置目录：' + esc(e.message) + '</div>'; return; }
  const urlSection = new URLSearchParams(location.search).get('section');
  const saved = urlSection || localStorage.getItem('ros-traffic-section');
  if (saved && state.schema.sections.some((s) => s.id === saved)) state.section = saved;
  if (!localStorage.getItem('ros-traffic-groups')) {
    state.collapsedGroups = new Set(state.schema.groups.filter((g) => g.id !== 'overview').map((g) => g.id));
    saveCollapsedGroups();
  }
  const current = state.schema.sections.find((s) => s.id === state.section);
  if (current) state.collapsedGroups.delete(current.group);
  applyLang();
  const wantAdd = new URLSearchParams(location.search).get('action') === 'add';
  if (wantAdd) {
    const sec = state.schema.sections.find((s) => s.id === state.section);
    if (sec && sec.writable && sec.path) setTimeout(() => openForm(sec, null), 800);
  }
  if (new URLSearchParams(location.search).get('action') === 'wgqr') setTimeout(() => openWireguardQr(), 800);
  if (new URLSearchParams(location.search).get('action') === 'deviceadd' && state.section === 'connectionSettings') {
    setTimeout(() => { $('devAdd').onclick(); }, 600);
  }
  loadSnapshot();
  connect();
  // 预加载连接数据供仪表盘 TOP 表格使用
  api('/api/config?section=connections').then((d) => { state.connRows = d.rows || []; if (state.section === 'dashboard') renderDashboard(); }).catch(() => {});
}

/* boot 由最后加载的 config.js 调用，确保所有函数已定义 */

