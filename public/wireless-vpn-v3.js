'use strict';
/* ============================================================
   Wireless / VPN / Bandwidth v3
   复刻设计稿 wireless.html / vpn.html / bandwidth.html 的页面骨架：
   page-head + 4 KPI + span8 主卡片（panel-tabs / toolbar / dt / table-foot）
   + span4 rail + 底部补充卡片。
   数据全部来自 /api/config?section=<id>；写入 /api/config（POST）。
   表单字段由 state.schema.sections[*].fields 动态生成，不写死字段。
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ex = esc;
  const ic = (id) => '<svg class="i" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  const boolOn = (v) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
  const uniq = (arr) => arr.filter((x, i) => x && arr.indexOf(x) === i);

  /* ---------- 分组与 section ---------- */
  /* 顺序与设计稿一致：客户端 / SSID / 射频 在前，其余配置分类收进同一行 tab。 */
  const WIRELESS_SECS = ['wifiReg', 'wifiConfig', 'wifi', 'wirelessSec', 'capsmanCtl', 'wifiProv', 'wifiCap', 'wifiRemote'];
  const VPN_SECS = ['wireguard', 'wgPeers', 'pppSecrets', 'pppProfiles', 'pppActive'];
  const QUEUE_SECS = ['simpleQueues', 'queueTree', 'queueRules'];
  const ALL_SECS = WIRELESS_SECS.concat(VPN_SECS, QUEUE_SECS);
  const SINGLETONS = ['capsmanCtl', 'wifiCap'];
  const SECRET_KEYS = ['password', 'wpa2-pre-shared-key', 'wpa3-pre-shared-key', 'private-key', 'preshared-key'];
  const TAB_LABEL = {
    wifiReg: ['客户端', 'Clients'], wifiConfig: ['SSID', 'SSID'], wifi: ['射频', 'Radios'],
    wirelessSec: ['安全', 'Security'], capsmanCtl: ['AC', 'AC'], wifiProv: ['自动配置', 'Provisioning'],
    wifiCap: ['AP 设置', 'AP settings'], wifiRemote: ['在线 AP', 'Remote APs'],
    wireguard: ['隧道', 'Tunnels'], wgPeers: ['对端', 'Peers'], pppSecrets: ['PPP 账号', 'PPP accounts'],
    pppProfiles: ['PPP 配置', 'PPP profiles'], pppActive: ['在线用户', 'Active users'],
    simpleQueues: ['简单队列', 'Simple queues'], queueTree: ['队列树', 'Queue tree'], queueRules: ['规则', 'Rules'],
  };

  const FALLBACK = {
    wifi: ['WiFi 接口', 'WiFi interfaces'], wirelessSec: ['无线安全', 'Wireless security'],
    capsmanCtl: ['AC 控制器', 'AC controller'], wifiConfig: ['AC 配置模板', 'AC configurations'],
    wifiProv: ['AC 自动配置', 'AC provisioning'], wifiCap: ['AP 设置', 'AP settings'],
    wifiRemote: ['在线 AP', 'Remote APs'], wifiReg: ['AP 客户端', 'AP clients'],
    wireguard: ['WireGuard', 'WireGuard'], wgPeers: ['WG 对端', 'WG peers'],
    pppSecrets: ['PPP 账号', 'PPP secrets'], pppProfiles: ['PPP 配置', 'PPP profiles'],
    pppActive: ['在线 VPN 用户', 'Active VPN users'],
    simpleQueues: ['简单队列', 'Simple queues'], queueTree: ['队列树', 'Queue tree'], queueRules: ['规则', 'Rules'],
  };

  /* 每类页面的表格列（key + 样式类），列标签优先取 schema.fields[].label */
  const COLS = {
    wifi: [['name', 'chain'], ['ssid', 'badge'], ['band', 'chain'], ['mode', 'chain'], ['channel', 'mono'], ['comment', 'note'], ['disabled', 'status']],
    wirelessSec: [['name', 'chain'], ['authentication-types', 'note'], ['wpa2-pre-shared-key', 'mono'], ['wpa3-pre-shared-key', 'mono']],
    wifiConfig: [['name', 'chain'], ['ssid', 'badge'], ['mode', 'chain'], ['band', 'chain'], ['channel', 'mono'], ['security', 'note'], ['datapath', 'note'], ['disabled', 'status']],
    wifiProv: [['name', 'chain'], ['action', 'chain'], ['master-configuration', 'note'], ['slave-configurations', 'note'], ['supported-bands', 'note'], ['disabled', 'status']],
    wifiRemote: [['name', 'chain'], ['identity', 'note'], ['address', 'addr'], ['state', 'badge'], ['version', 'mono'], ['board', 'note']],
    wifiReg: [['interface', 'chain'], ['mac-address', 'addr'], ['ssid', 'badge'], ['signal', 'signal'], ['tx-rate', 'num'], ['rx-rate', 'num'], ['uptime', 'mono']],
    wireguard: [['name', 'chain'], ['listen-port', 'mono'], ['public-key', 'mono'], ['mtu', 'num'], ['comment', 'note'], ['disabled', 'status']],
    wgPeers: [['name', 'chain'], ['interface', 'chain'], ['allowed-address', 'addr'], ['endpoint', 'note'], ['endpoint-port', 'mono'], ['persistent-keepalive', 'mono'], ['responder', 'note'], ['disabled', 'status']],
    pppSecrets: [['name', 'chain'], ['service', 'chain'], ['profile', 'note'], ['local-address', 'addr'], ['remote-address', 'addr'], ['comment', 'note'], ['disabled', 'status']],
    pppProfiles: [['name', 'chain'], ['local-address', 'addr'], ['remote-address', 'addr'], ['dns-server', 'addr'], ['comment', 'note']],
    pppActive: [['name', 'chain'], ['service', 'chain'], ['address', 'addr'], ['caller-id', 'mono'], ['uptime', 'mono']],
    simpleQueues: [['name', 'chain'], ['target', 'addr'], ['max-limit', 'num'], ['limit-at', 'num'], ['priority', 'num'], ['comment', 'note'], ['disabled', 'status']],
    queueTree: [['name', 'chain'], ['parent', 'note'], ['packet-mark', 'note'], ['max-limit', 'num'], ['priority', 'num'], ['comment', 'note'], ['disabled', 'status']],
  };
  const KEYLABEL = {
    name: ['名称', 'Name'], ssid: ['SSID', 'SSID'], band: ['频段', 'Band'], mode: ['模式', 'Mode'],
    channel: ['信道', 'Channel'], comment: ['备注', 'Comment'], disabled: ['状态', 'Status'],
    'authentication-types': ['认证方式', 'Auth types'], 'wpa2-pre-shared-key': ['WPA2 密码', 'WPA2 password'],
    'wpa3-pre-shared-key': ['WPA3 密码', 'WPA3 password'], security: ['安全配置', 'Security'],
    datapath: ['数据转发', 'Datapath'], action: ['动作', 'Action'],
    'master-configuration': ['主配置', 'Master config'], 'slave-configurations': ['从配置', 'Slave configs'],
    'supported-bands': ['匹配频段', 'Bands'], identity: ['标识', 'Identity'], address: ['地址', 'Address'],
    state: ['状态', 'State'], version: ['版本', 'Version'], board: ['型号', 'Board'],
    interface: ['接口', 'Interface'], 'mac-address': ['MAC', 'MAC'], signal: ['信号', 'Signal'],
    'tx-rate': ['上行速率', 'TX rate'], 'rx-rate': ['下行速率', 'RX rate'], uptime: ['在线时长', 'Uptime'],
    'listen-port': ['监听端口', 'Listen port'], 'public-key': ['公钥', 'Public key'], mtu: ['MTU', 'MTU'],
    endpoint: ['对端地址', 'Endpoint'], 'endpoint-port': ['对端端口', 'Endpoint port'],
    'allowed-address': ['允许地址', 'Allowed address'], 'persistent-keepalive': ['持久保活', 'Keepalive'],
    responder: ['仅响应', 'Responder'], service: ['服务', 'Service'], profile: ['配置文件', 'Profile'],
    'local-address': ['本地地址', 'Local address'], 'remote-address': ['远端地址', 'Remote address'],
    'dns-server': ['DNS', 'DNS server'], target: ['目标', 'Target'], 'max-limit': ['最大速率', 'Max limit'],
    'limit-at': ['保障速率', 'Limit at'], priority: ['优先级', 'Priority'], parent: ['父级', 'Parent'],
    'packet-mark': ['包标记', 'Packet mark'], 'caller-id': ['呼叫方', 'Caller ID'],
  };

  const W = { group: '', section: '', q: '', chip: 'all', data: {}, err: {}, loadedAt: 0, loadedGroup: '', loading: false, interfaces: [], leases: [], scrolledTab: null };

  /* ---------- 基础工具 ---------- */
  function groupOf(sec) {
    if (WIRELESS_SECS.indexOf(sec) >= 0) return 'wireless';
    if (VPN_SECS.indexOf(sec) >= 0) return 'vpn';
    if (QUEUE_SECS.indexOf(sec) >= 0) return 'queue';
    return '';
  }
  function secsOf(g) { return g === 'wireless' ? WIRELESS_SECS : g === 'vpn' ? VPN_SECS : g === 'queue' ? QUEUE_SECS : []; }
  function sectionDef(sec) {
    const list = (state.schema && state.schema.sections) || [];
    return list.find((s) => s.id === sec) || null;
  }
  function fieldsOf(sec) {
    const d = sectionDef(sec);
    return d && Array.isArray(d.fields) ? d.fields : [];
  }
  function secTitle(sec) {
    const d = sectionDef(sec), f = FALLBACK[sec] || [sec, sec];
    return d && d.title ? L(d.title.zh, d.title.en) : L(f[0], f[1]);
  }
  function tabLabel(sec) {
    const t = TAB_LABEL[sec];
    return t ? L(t[0], t[1]) : secTitle(sec);
  }
  function secPath(sec) { const d = sectionDef(sec); return d && d.path || ''; }
  function canWrite(sec) { const d = sectionDef(sec); return !!d && d.writable !== false && !d.readonly; }
  function canToggle(sec) { return canWrite(sec) && !!sectionDef(sec) && sectionDef(sec).toggle !== false && hasDisabled(sec); }
  function hasDisabled(sec) { return fieldsOf(sec).some((f) => f.key === 'disabled'); }
  function isSingleton(sec) { return SINGLETONS.indexOf(sec) >= 0 || !!(sectionDef(sec) && sectionDef(sec).singleton); }
  function rows(sec) { return W.data[sec] || []; }
  function findRow(sec, id) { return rows(sec).find((r) => String(r['.id']) === String(id)) || null; }
  function isOn(r) { return !boolOn(r && r.disabled); }
  function rowLabel(sec, r) {
    if (!r) return secTitle(sec);
    return String(r.name || r.ssid || r.comment || r['.id'] || secTitle(sec));
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
  function copyText(text) {
    const s = String(text == null ? '' : text);
    const done = () => say(L('已复制', 'Copied'), 'ok');
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
      } catch (e) { say(L('复制失败', 'Copy failed'), 'err'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done).catch(fallback);
    else fallback();
  }
  function labelOf(sec, key) {
    const f = fieldsOf(sec).find((x) => x.key === key);
    if (f && f.label) return L(f.label.zh, f.label.en);
    const l = KEYLABEL[key];
    return l ? L(l[0], l[1]) : key;
  }
  function signalNum(v) {
    const m = String(v == null ? '' : v).match(/-?\d+/);
    return m ? Number(m[0]) : null;
  }
  function rateNum(v) {
    const m = String(v == null ? '' : v).match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : 0;
  }
  function isMac(s) { return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(String(s || '')); }
  function bandLabel(v) {
    const s = String(v == null ? '' : v).toLowerCase();
    if (/5g|5ghz|5\s*ghz/.test(s)) return '5 GHz';
    if (/2g|2\.4|24g/.test(s)) return '2.4 GHz';
    return s ? String(v) : '—';
  }
  function bandOfClient(r) {
    const iface = String(r.interface || '');
    const radio = rows('wifi').find((x) => String(x.name) === iface);
    if (radio && radio.band) return bandLabel(radio.band);
    if (/5g|5ghz/i.test(iface)) return '5 GHz';
    if (/2g|2\.4/i.test(iface)) return '2.4 GHz';
    const rate = Math.max(rateNum(r['tx-rate']), rateNum(r['rx-rate']));
    return rate >= 300 ? '5 GHz' : '2.4 GHz';
  }
  function leaseFor(mac) {
    const m = String(mac || '').toUpperCase();
    return (W.leases || []).find((l) => String(l['mac-address'] || '').toUpperCase() === m) || null;
  }
  function clientName(r) {
    const lease = leaseFor(r['mac-address']);
    return String((lease && (lease['host-name'] || lease.comment)) || r.comment || r['mac-address'] || '—');
  }
  function initialsOf(name, mac) {
    const s = String(name || '').trim();
    if (s && !isMac(s)) {
      const words = s.split(/[\s._-]+/).filter(Boolean);
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      if (s.length <= 3) return s.toUpperCase();
      return s.slice(0, 2).toUpperCase();
    }
    return String(mac || '').replace(/[^0-9a-f]/gi, '').slice(-2).toUpperCase() || 'AP';
  }
  function avatarClass(key) {
    const palette = ['eth', 'br', 'ap', 'iot'];
    let n = 0;
    String(key || '').split('').forEach((c) => { n += c.charCodeAt(0); });
    return palette[n % palette.length];
  }
  function uptimeHuman(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '—';
    const m = s.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!m || !m[0]) return s;
    const w = Number(m[1] || 0), d = Number(m[2] || 0), h = Number(m[3] || 0), mi = Number(m[4] || 0), se = Number(m[5] || 0);
    if (w) return w + L(' 周', 'w');
    if (d) return (d + Math.round(h / 24)) + L(' 天', 'd');
    if (h) return h + L(' 小时', 'h') + (mi ? ' ' + mi + L(' 分', 'm') : '');
    if (mi) return mi + L(' 分钟', 'min');
    return se + L(' 秒', 's');
  }
  function radioShort(name) {
    const s = String(name || '—');
    if (s.length <= 9) return s;
    return s.slice(0, 8) + '…';
  }
  function maxClientRate(r) {
    return Math.max(rateNum(r['tx-rate']), rateNum(r['rx-rate']));
  }
  function fmtRate(v) {
    return String(v == null ? '' : v).trim().replace(/\s*(Mbps|Gbps|Kbps)\s*$/i, ' $1');
  }
  function rateStr(bps) {
    if (typeof fmtRateStr === 'function') return fmtRateStr(bps);
    return Math.round(Number(bps) || 0) + ' bps';
  }
  function clientsOfBand(band) {
    return rows('wifiReg').filter((r) => bandOfClient(r) === band);
  }
  function clientsOnRadio(name) {
    return rows('wifiReg').filter((r) => String(r.interface) === String(name));
  }
  function bestRateFor(predicate) {
    return rows('wifiReg').filter(predicate).reduce((m, r) => Math.max(m, maxClientRate(r)), 0);
  }
  function authSummary() {
    const types = uniq(rows('wirelessSec').map((r) => String(r['authentication-types'] || '').split(',').map((x) => x.trim())).flat().filter(Boolean));
    return types.length ? types.join(' · ').toUpperCase() : '';
  }
  function statusDot(on, zh, en, offZh, offEn) {
    return '<span class="dot ' + (on ? 'is-green' : 'is-muted') + '"></span>' + esc(on ? L(zh, en) : L(offZh || '未启用', offEn || 'Inactive'));
  }
  function kvRow(k, v, cls) {
    return '<div class="kv"><span>' + esc(k) + '</span><b class="' + (cls || '') + '">' + esc(v == null || v === '' ? '—' : v) + '</b></div>';
  }
  function miniCard(title, sub, body, badge) {
    return '<section class="card"><div class="card-head"><div><h2 class="card-title">' + esc(title) + '</h2>' +
      '<div class="card-sub">' + esc(sub) + '</div></div>' + (badge || '') + '</div><div class="rail-body">' + body + '</div></section>';
  }
  function miniBar(pct, color) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return '<span class="wv-bar"><i style="width:' + p + '%' + (color ? ';background:' + color : '') + '"></i></span>';
  }
  function emptyBox(icon, text) {
    return '<div class="pg-empty">' + ic(icon) + '<div>' + esc(text) + '</div></div>';
  }

  /* ---------- 真实数据读取 / 写入 ---------- */
  async function loadAll(force) {
    const g = groupOf(state.section);
    if (!g || W.loading) return;
    if (!force && W.loadedGroup === g && W.loadedAt && Date.now() - W.loadedAt < 8000) { safePaint(); return; }
    W.loading = true;
    const secs = secsOf(g);
    /* 「规则」是组合视图：真实数据来自 /ip/firewall/mangle（无需单独接口） */
    const dataSecs = secs.map((s) => (s === 'queueRules' ? 'firewallMangle' : s));
    const results = await Promise.all(dataSecs.map((s) => api('/api/config?section=' + encodeURIComponent(s)).then((d) => {
      const list = (d && d.rows) || [];
      const err = (d && d.offline && !list.length) ? L('路由器未连接，未读取到真实配置', 'Router offline - no live configuration') : '';
      return { rows: list, err };
    }).catch((e) => ({ rows: null, err: (e && e.message) || L('加载失败', 'Load failed') }))));
    secs.forEach((s, i) => {
      const res = results[i];
      if (res && res.rows) W.data[dataSecs[i]] = res.rows;
      if (res && res.err) W.err[s] = res.err;
      else delete W.err[s];
    });
    W.loadedAt = Date.now();
    W.loadedGroup = g;
    W.loading = false;
    /* interface 类型字段的下拉选项；失败不影响主页面 */
    try {
      const d = await api('/api/config?section=interfaces');
      W.interfaces = uniq(((d && d.rows) || []).map((r) => r.name));
    } catch (e) { /* ignore */ }
    /* 无线客户端名称：注册表只有 MAC，用 DHCP 租约里的 host-name 补全（真实数据） */
    if (g === 'wireless') {
      try {
        const d = await api('/api/config?section=dhcpLeases');
        W.leases = (d && d.rows) || [];
      } catch (e) { W.leases = []; }
    }
    if (groupOf(state.section) === g) safePaint();
  }
  function safePaint() {
    const ae = document.activeElement, c = $('content');
    if (ae && c && c.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    paint();
  }
  async function write(sec, action, ids, values) {
    const body = { section: sec, action };
    if (ids && ids.length) body.ids = ids;
    if (values) body.values = values;
    return api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  /* ---------- schema 字段 → 表单（只读字段不可编辑） ---------- */
  function editableFields(sec) {
    return fieldsOf(sec).filter((f) => f && f.key !== '.id' && f.type !== 'id' && f.type !== 'readonly');
  }
  function displayValue(f, v) {
    if (v == null || v === '') return '—';
    if (f && (f.type === 'bool' || f.type === 'bool-invert')) return boolOn(v) ? L('是', 'Yes') : L('否', 'No');
    if (f && SECRET_KEYS.indexOf(f.key) >= 0) return '••••••••';
    return String(v);
  }
  function formFields(sec, row, adding) {
    return editableFields(sec).map((f) => {
      const raw = row ? row[f.key] : (f.default != null ? f.default : '');
      let type = 'text', options = null;
      if (f.type === 'bool' || f.type === 'bool-invert') type = 'switch';
      else if (f.type === 'select') { type = 'select'; options = (f.options || []).slice(); }
      else if (f.type === 'interface') {
        type = 'select'; options = W.interfaces.slice();
        if (raw && options.indexOf(String(raw)) < 0) options.unshift(String(raw));
      } else if (f.type === 'number') type = 'number';
      else if (f.type === 'password' || SECRET_KEYS.indexOf(f.key) >= 0) type = 'password';
      else if (f.type === 'textarea') type = 'textarea';
      const field = {
        key: f.key,
        label: L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key),
        type,
        value: type === 'switch' ? (f.type === 'bool-invert' ? !boolOn(raw) : boolOn(raw)) : (raw == null ? '' : raw),
        required: !!f.required,
        placeholder: f.placeholder || '',
        hint: f.hint || '',
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
  function detailRows(sec, r) {
    return fieldsOf(sec).map((f) => [L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key), displayValue(f, r[f.key])]);
  }

  /* ---------- 查看 / 编辑 / 新增 / 删除 / 启停 ---------- */
  function qrPaint(canvas, text, size) {
    const Q = window.QRCode;
    if (!canvas || !text || !Q || typeof Q.toCanvas !== 'function') return false;
    try {
      Q.toCanvas(canvas, text, { width: size || 200, margin: 1, color: { dark: '#1a2340', light: '#ffffff' } });
      return true;
    } catch (e) { return false; }
  }
  function wgPeerConfig(r) {
    const wg = rows('wireguard').find((w) => String(w.name) === String(r.interface)) || rows('wireguard')[0] || {};
    const dev = (state.devices || []).find((d) => d.id === state.deviceId) || {};
    const host = String(dev.host || '').replace(/^https?:\/\//, '');
    const port = String(wg['listen-port'] || '13231');
    const endpoint = host ? host + ':' + port : L('路由器公网地址', 'router public address') + ':' + port;
    let priv = String(r['private-key'] || '').trim();
    let generated = '';
    /* 对端私钥若未在 RouterOS 中保存（auto/空），生成新的客户端密钥对并在界面标明 */
    if (!/^[A-Za-z0-9+/]{43}=?$/.test(priv)) {
      W.wgQrKeys = W.wgQrKeys || {};
      const key = r['.id'] || r.name || 'peer';
      const cached = W.wgQrKeys[key] || (W.wgQrKeys[key] = (window.WGKey ? window.WGKey.keypair() : null));
      if (cached) { priv = cached.privateKey; generated = cached.publicKey; }
    }
    const ka = (String(r['persistent-keepalive'] || '').match(/\d+/) || [])[0] || '25';
    const lines = [
      '[Interface]',
      'PrivateKey = ' + (priv || '<' + L('客户端私钥', 'client private key') + '>'),
      'Address = ' + (r['allowed-address'] || '<' + L('客户端地址', 'client address') + '>'),
      '',
      '[Peer]',
      'PublicKey = ' + (wg['public-key'] || '<' + L('隧道公钥', 'tunnel public key') + '>'),
    ];
    if (r['preshared-key']) lines.push('PresharedKey = ' + r['preshared-key']);
    lines.push('Endpoint = ' + endpoint, 'AllowedIPs = 0.0.0.0/0, ::/0', 'PersistentKeepalive = ' + ka);
    return { text: lines.join('\n') + '\n', generated, endpoint, tunnel: String(wg.name || '') };
  }
  function openView(sec, id) {
    const r = findRow(sec, id);
    if (!r) return say(L('记录不存在', 'Record not found'), 'warn');
    const u = window.UI; if (!u || !u.openModal) return;
    const actions = [];
    if (canWrite(sec)) {
      actions.push({ label: L('编辑', 'Edit'), cls: 'primary', onClick: () => openEdit(sec, id) });
      if (canToggle(sec)) actions.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), onClick: () => toggleRow(sec, id, !isOn(r)) });
      actions.push({ label: L('删除', 'Delete'), cls: 'danger', onClick: () => openDelete(sec, id) });
    }
    actions.push({ label: L('关闭', 'Close') });
    let body = '<div class="ui-detail">' + detailRows(sec, r).map(([k, v]) => '<div class="ui-detail-row"><small>' + esc(k) + '</small><b>' + esc(v) + '</b></div>').join('') + '</div>';
    let wgQr = null;
    if (sec === 'wgPeers') {
      wgQr = wgPeerConfig(r);
      body += '<div class="wg-qr-card"><div class="wg-qr-head"><b>' + esc(L('WireGuard 客户端配置', 'WireGuard client config')) + '</b><span class="mono">' + esc(wgQr.endpoint) + '</span></div>'
        + '<div class="wg-qr-body"><canvas data-wg-qr width="200" height="200"></canvas><div class="wg-qr-side">'
        + '<p>' + esc(L('用 WireGuard App 扫描二维码即可导入；Endpoint 取当前设备地址，公网使用请改成公网 IP / DDNS。', 'Scan with the WireGuard app to import. Endpoint uses the current device address; change it to your public IP / DDNS for internet use.')) + '</p>'
        + (wgQr.generated ? '<p class="warn">' + esc(L('RouterOS 未保存该对端私钥，已生成新的客户端密钥。请将下方公钥添加到 RouterOS 该对端后再连接。', 'No peer private key on RouterOS; a new client key was generated. Add the public key below to the router peer before connecting.')) + '</p><code data-wg-pub>' + esc(wgQr.generated) + '</code>' : '')
        + '<div class="wg-qr-btns"><button class="btn-xs" type="button" data-wg-copy>' + esc(L('复制配置', 'Copy config')) + '</button><button class="btn-xs" type="button" data-wg-dl>' + esc(L('下载 .conf', 'Download .conf')) + '</button></div>'
        + '</div></div></div>';
    }
    u.openModal({
      title: rowLabel(sec, r), sub: secTitle(sec) + ' · ' + (secPath(sec) || L('真实配置', 'live configuration')),
      body, actions,
      onMount(m) {
        if (!wgQr) return;
        const cv = m.querySelector('[data-wg-qr]');
        if (cv && !qrPaint(cv, wgQr.text)) { const card = cv.closest('.wg-qr-card'); if (card) card.hidden = true; }
        const copy = m.querySelector('[data-wg-copy]'); if (copy) copy.onclick = () => copyText(wgQr.text);
        const dl = m.querySelector('[data-wg-dl]'); if (dl) dl.onclick = () => {
          const blob = new Blob([wgQr.text], { type: 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = String(rowLabel(sec, r) || 'wireguard').replace(/[^\w.\-]+/g, '_') + '.conf';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        };
      },
    });
  }
  function openEdit(sec, id) {
    const r = findRow(sec, id);
    if (!r || !canWrite(sec)) return;
    const u = window.UI; if (!u || !u.openForm) return;
    u.openForm({
      title: L('编辑', 'Edit') + ' · ' + rowLabel(sec, r), sub: secTitle(sec) + ' · ' + secPath(sec),
      fields: formFields(sec, r, false),
      note: L('标 * 为必填；私钥 / 口令不会在页面明文展示。', 'Required fields marked *. Keys and passwords are never shown in clear text.'),
      onSubmit: async (v) => {
        try { await write(sec, 'set', [id], submitValues(sec, v)); say(L('已保存', 'Saved'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
      },
    });
  }
  function openAdd(sec) {
    if (!canWrite(sec)) return say(L('此分类为只读', 'Read-only section'), 'warn');
    const u = window.UI; if (!u || !u.openForm) return;
    if (isSingleton(sec) && rows(sec).length) return openEdit(sec, rows(sec)[0]['.id']);
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
    const r = findRow(sec, id);
    if (!r || !canWrite(sec)) return;
    const u = window.UI;
    if (!u || !u.openConfirm) {
      if (!window.confirm(L('确认删除此记录？', 'Delete this record?'))) return;
      return write(sec, 'remove', [id]).then(() => { say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }).catch((e) => say(e.message, 'err'));
    }
    u.openConfirm({
      title: L('删除记录', 'Delete record'), warningTitle: L('确认删除？', 'Delete this record?'),
      message: '<b>' + esc(rowLabel(sec, r)) + '</b> ' + L('将从 RouterOS 删除，此操作不可恢复。', 'will be removed from RouterOS. This cannot be undone.'),
      danger: true, confirmLabel: L('删除', 'Delete'),
      onConfirm: async () => {
        try { await write(sec, 'remove', [id]); say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('删除失败', 'Delete failed'), 'err'); }
      },
    });
  }
  function toggleRow(sec, id, enable) {
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
    u.openMenu(anchor, items, { head: '<div class="ui-menu-head"><b>' + esc(rowLabel(sec, r)) + '</b><small>' + esc(secTitle(sec)) + '</small></div>' });
  }

  /* ---------- 表格 ---------- */
  function columnsFor(sec) {
    return (COLS[sec] || [['name', 'chain']]).map(([k, cls]) => ({ k, l: labelOf(sec, k), cls: cls || '' }));
  }
  function signalCell(v) {
    const n = signalNum(v);
    const bars = n == null ? 0 : n >= -60 ? 4 : n >= -68 ? 3 : 2;
    return '<div class="sig-cell"><span class="sig ' + (bars === 4 ? '' : bars === 3 ? 'warn' : 'low') + '">' +
      [0, 1, 2, 3].map((i) => '<i class="' + (i < bars ? 'on' : '') + '"></i>').join('') + '</span><span class="num">' + esc(v || '—') + '</span></div>';
  }
  function cellHtml(sec, c, r) {
    const v = r[c.k], k = c.k;
    if (k === 'disabled') return '<span class="status"><span class="dot ' + (isOn(r) ? 'is-green' : 'is-muted') + '"></span>' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span>';
    if (k === 'signal') return signalCell(v);
    if (SECRET_KEYS.indexOf(k) >= 0 || k === 'public-key') {
      const s = String(v == null ? '' : v);
      return '<span class="mono">' + esc(SECRET_KEYS.indexOf(k) >= 0 ? '••••••••' : (s.length > 14 ? s.slice(0, 6) + '…' + s.slice(-4) : s || '—')) + '</span>';
    }
    if (k === 'ssid' || k === 'state' || k === 'action' || k === 'mode') {
      const s = String(v == null ? '' : v);
      return '<span class="badge ' + (/down|error|disable|none/i.test(s) ? 'drop' : 'info') + '">' + esc(s || '—') + '</span>';
    }
    if (c.cls === 'addr') return '<span class="addr">' + esc(v == null || v === '' ? '—' : v) + '</span>';
    if (c.cls === 'num' || c.cls === 'r num') return '<span class="num">' + esc(v == null || v === '' ? '—' : v) + '</span>';
    if (c.cls === 'chain') return '<span class="cell"><b>' + esc(v == null || v === '' ? '—' : v) + '</b></span>';
    if (c.cls === 'mono') return '<span class="mono">' + esc(v == null || v === '' ? '—' : v) + '</span>';
    return '<span>' + esc(v == null || v === '' ? '—' : v) + '</span>';
  }
  function chipsFor(sec) {
    const rs = rows(sec), out = [['all', L('全部', 'All'), rs.length]];
    if (hasDisabled(sec)) {
      out.push(['on', L('启用', 'Enabled'), rs.filter(isOn).length]);
      out.push(['off', L('禁用', 'Disabled'), rs.filter((r) => !isOn(r)).length]);
    }
    return out;
  }
  function filteredRows(sec) {
    let rs = rows(sec).slice();
    if (W.chip === 'on' && hasDisabled(sec)) rs = rs.filter(isOn);
    else if (W.chip === 'off' && hasDisabled(sec)) rs = rs.filter((r) => !isOn(r));
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => Object.keys(r).some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function toolbarHtml(sec) {
    const chips = chipsFor(sec).map(([v, label, count]) =>
      '<button class="chip ' + (v === W.chip ? 'on' : '') + '" type="button" data-act="wv-chip" data-chip="' + ex(v) + '">' + esc(label) + ' <b>' + count + '</b></button>').join('');
    return '<div class="toolbar">' +
      '<label class="field">' + ic('search') + '<input id="wvSearch" placeholder="' + esc(L('搜索名称、地址或备注…', 'Search name, address or comment…')) + '" aria-label="' + esc(L('搜索', 'Search')) + '"></label>' +
      '<div class="chips">' + chips + '</div><span class="spacer"></span>' +
      '<span class="toolbar-note">' + esc(secPath(sec) || L('真实配置', 'live configuration')) + '</span>' +
      (canWrite(sec) ? '<button class="btn" type="button" data-act="wv-add">' + ic('plus') + esc(L('新增', 'Add')) + '</button>' : '') +
      '</div>';
  }
  /* 列宽参照设计稿：动作/认证方式等长文本列更宽，末列仅放行菜单 */
  const COLW = {
    wirelessSec: ['24%', '34%', '21%', '21%', '34px'],
    wifiProv: ['15%', '22%', '15%', '15%', '13%', '10%', '34px'],
    wifiRemote: ['20%', '14%', '14%', '11%', '10%', '12%', '34px'],
    pppSecrets: ['17%', '9%', '19%', '14%', '14%', '13%', '10%', '34px'],
    pppProfiles: ['22%', '16%', '20%', '16%', '26%', '34px'],
    pppActive: ['22%', '9%', '18%', '31%', '20%', '34px'],
  };
  function tableHtml(sec) {
    const rs = filteredRows(sec), cols = columnsFor(sec), widths = COLW[sec];
    /* td 类名统一加 td- 前缀：避免 .note/.match 等全局样式把单元格改成 block 导致垂直不居中 */
    const tdClass = (cls) => String(cls || '').split(' ').filter(Boolean)
      .map((c) => (c === 'r' ? 'r' : 'td-' + c)).join(' ');
    const colgroup = widths ? '<colgroup>' + widths.map((w) => '<col' + (w ? ' style="width:' + w + '"' : '') + '>').join('') + '</colgroup>' : '';
    const head = cols.map((c) => '<th class="' + (c.cls === 'r num' ? 'r' : '') + '">' + esc(c.l) + '</th>').join('') + '<th></th>';
    const body = rs.map((r) => '<tr>' + cols.map((c) => '<td class="' + ex(tdClass(c.cls)) + '" data-label="' + esc(c.l) + '">' + cellHtml(sec, c, r) + '</td>').join('') +
      '<td><button class="row-more" type="button" data-act="wv-more" data-sec="' + sec + '" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td></tr>').join('');
    const empty = '<tr><td colspan="' + (cols.length + 1) + '" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无数据', 'No data')) + '</td></tr>';
    return '<div class="table-scroll"><table class="dt">' + colgroup + '<thead><tr>' + head + '</tr></thead><tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(L('显示', 'Showing')) + ' ' + rs.length + ' / ' + rows(sec).length + ' ' + esc(L('条', 'entries')) + ' · ' + esc(secTitle(sec)) + '</span><span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function tableToolbar(sec, placeholder, chipsHtml, withAdd) {
    return '<div class="toolbar">' +
      '<label class="field">' + ic('search') + '<input id="wvSearch" placeholder="' + esc(placeholder) + '" aria-label="' + esc(L('搜索', 'Search')) + '"></label>' +
      (chipsHtml ? '<div class="chips">' + chipsHtml + '</div>' : '') +
      '<span class="spacer"></span><span class="toolbar-note">' + esc(L('每 6 秒刷新', 'Refreshes every 6s')) + '</span>' +
      (withAdd && canWrite(sec) ? '<button class="btn" type="button" data-act="wv-add">' + ic('plus') + esc(L('新增', 'Add')) + '</button>' : '') +
      '</div>';
  }
  function chipBtn(v, label, count) {
    return '<button class="chip ' + (v === W.chip ? 'on' : '') + '" type="button" data-act="wv-chip" data-chip="' + ex(v) + '">' + esc(label) + ' <b>' + count + '</b></button>';
  }

  /* ---------- 无线：客户端（设计稿客户端表） ---------- */
  function clientRows() {
    let rs = rows('wifiReg').slice();
    if (W.chip === '5g') rs = rs.filter((r) => bandOfClient(r) === '5 GHz');
    else if (W.chip === '24g') rs = rs.filter((r) => bandOfClient(r) === '2.4 GHz');
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [clientName(r), r['mac-address'], r.interface, r.ssid].some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function clientChipsHtml() {
    const all = rows('wifiReg'), n5 = clientsOfBand('5 GHz').length, n24 = clientsOfBand('2.4 GHz').length;
    return chipBtn('all', L('全部', 'All'), all.length) + chipBtn('5g', '5 GHz', n5) + chipBtn('24g', '2.4 GHz', n24);
  }
  function clientTable() {
    const rs = clientRows();
    const body = rs.map((r) => {
      const name = clientName(r), mac = String(r['mac-address'] || '');
      const band = bandOfClient(r), rate = maxClientRate(r);
      return '<tr>' +
        '<td><div class="if-name"><span class="if-badge ' + avatarClass(mac || name) + '">' + esc(initialsOf(name, mac)) + '</span>' +
        '<span><b title="' + esc(name) + '">' + esc(name) + '</b><small>' + esc([band, r.ssid].filter(Boolean).join(' · ') || '—') + '</small></span></div></td>' +
        '<td><span class="cell"><b>' + esc(r.interface || '—') + '</b><small>' + esc(r.ssid || '—') + '</small></span></td>' +
        '<td>' + signalCell(r.signal) + '</td>' +
        '<td class="r"><span class="cell-num"><b>' + (rate ? rate + ' Mbps' : '—') + '</b><small>' + esc('TX ' + fmtRate(r['tx-rate'] || '—') + ' · RX ' + fmtRate(r['rx-rate'] || '—')) + '</small></span></td>' +
        '<td><span class="status"><span class="dot is-green"></span>' + esc(uptimeHuman(r.uptime)) + '</span></td>' +
        '<td><button class="row-more" type="button" data-act="wv-more" data-sec="wifiReg" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td>' +
        '</tr>';
    }).join('');
    const empty = '<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无无线客户端', 'No wireless clients')) + '</td></tr>';
    const n5 = clientsOfBand('5 GHz').length, n24 = clientsOfBand('2.4 GHz').length;
    return '<div class="table-scroll"><table class="dt"><colgroup><col style="width:24%"><col style="width:18%"><col style="width:17%"><col style="width:18%"><col style="width:15%"><col></colgroup>' +
      '<thead><tr><th>' + esc(L('客户端', 'Client')) + '</th><th>' + esc(L('接入点', 'Access point')) + '</th><th>' + esc(L('信号', 'Signal')) + '</th>' +
      '<th class="r">' + esc(L('协商速率', 'Negotiated rate')) + '</th><th>' + esc(L('在线', 'Online')) + '</th><th></th></tr></thead>' +
      '<tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' ' + L('台客户端', 'clients') + ' · ' + n5 + ' ' + L('台 5 GHz', 'on 5 GHz') + ' · ' + n24 + ' ' + L('台 2.4 GHz', 'on 2.4 GHz')) + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function clientPanel() {
    return tableToolbar('wifiReg', L('搜索客户端、MAC 或 AP…', 'Search client, MAC or AP…'), clientChipsHtml(), false) + clientTable();
  }

  /* ---------- 无线：射频（设计稿射频表） ---------- */
  function radioRows() {
    let rs = rows('wifi').slice();
    if (W.chip === 'on') rs = rs.filter(isOn);
    else if (W.chip === 'off') rs = rs.filter((r) => !isOn(r));
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [r.name, r.ssid, r.band, r.channel, r.comment].some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function radioTable() {
    const rs = radioRows();
    const body = rs.map((r) => {
      const count = clientsOnRadio(r.name).length;
      const rate = bestRateFor((c) => String(c.interface) === String(r.name));
      return '<tr>' +
        '<td><div class="if-name"><span class="if-badge ap">' + ic('wifi') + '</span><span><b>' + esc(r.name || '—') + '</b><small>' + esc(r.ssid || '—') + '</small></span></div></td>' +
        '<td><span class="cell"><b>' + esc(r.channel || 'auto') + '</b><small>' + esc(bandLabel(r.band)) + ' · ' + esc(r.mode || 'ap') + '</small></span></td>' +
        '<td class="r"><span class="num">' + count + '</span></td>' +
        '<td class="r"><span class="cell-num"><b>' + (rate ? rate + ' Mbps' : '—') + '</b><small>' + esc(L('客户端峰值', 'client peak')) + '</small></span></td>' +
        '<td><span class="status"><span class="dot ' + (isOn(r) ? 'is-green' : 'is-muted') + '"></span>' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span></td>' +
        '<td><button class="row-more" type="button" data-act="wv-more" data-sec="wifi" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td>' +
        '</tr>';
    }).join('');
    const empty = '<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无射频', 'No radios')) + '</td></tr>';
    const n5 = rows('wifi').filter((r) => bandLabel(r.band) === '5 GHz').length;
    const n24 = rows('wifi').filter((r) => bandLabel(r.band) === '2.4 GHz').length;
    return '<div class="table-scroll"><table class="dt"><thead><tr><th>' + esc(L('射频', 'Radio')) + '</th><th>' + esc(L('信道 / 频段', 'Channel / band')) + '</th>' +
      '<th class="r">' + esc(L('客户端', 'Clients')) + '</th><th class="r">' + esc(L('峰值速率', 'Peak rate')) + '</th><th>' + esc(L('状态', 'Status')) + '</th><th></th></tr></thead>' +
      '<tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' ' + L('个射频', 'radios') + ' · ' + n5 + ' 5 GHz · ' + n24 + ' 2.4 GHz') + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function radioPanel() {
    const chips = chipsFor('wifi').map(([v, label, count]) => chipBtn(v, label, count)).join('');
    return tableToolbar('wifi', L('搜索射频、SSID 或信道…', 'Search radio, SSID or channel…'), chips, true) + radioTable();
  }

  /* ---------- 无线：SSID（设计稿 SSID 卡片） ---------- */
  function ssidRows() {
    let rs = rows('wifiConfig').slice();
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [r.ssid, r.name, r.security, r.comment].some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function ssidCards() {
    const rs = ssidRows();
    const cards = rs.map((r) => {
      const clients = rows('wifiReg').filter((c) => String(c.ssid) === String(r.ssid));
      const peak = bestRateFor((c) => String(c.ssid) === String(r.ssid));
      const radios = rows('wifi').filter((w) => String(w.ssid) === String(r.ssid));
      const avatars = clients.slice(0, 4).map((c) => '<i class="mini-av">' + esc(initialsOf(clientName(c), c['mac-address'])) + '</i>').join('');
      const sub = [authSummary() || r.security, bandLabel(r.band), radios.length ? radios.length + ' ' + L('个射频', 'radios') : ''].filter(Boolean).join(' · ');
      return '<div class="ssid-card"><div class="ssid-head"><span class="ssid-ico">' + ic('wifi') + '</span>' +
        '<div class="ssid-name"><b title="' + esc(r.ssid || r.name || '—') + '">' + esc(r.ssid || r.name || '—') + '</b><small>' + esc(sub || '—') + '</small></div>' +
        '<span class="ssid-tools"><span class="badge ' + (isOn(r) ? 'allow' : 'neutral') + '">' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span>' +
        '<button class="row-more" type="button" data-act="wv-more" data-sec="wifiConfig" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></span></div>' +
        '<div class="ssid-stats"><div><small>' + esc(L('客户端', 'Clients')) + '</small><b>' + clients.length + '</b></div>' +
        '<div><small>' + esc(L('峰值速率', 'Peak rate')) + '</small><b>' + (peak ? peak + ' Mbps' : '—') + '</b></div>' +
        '<div><small>' + esc(L('最大终端', 'Max stations')) + '</small><b>' + esc(r['max-station-count'] || '—') + '</b></div></div>' +
        '<div class="ssid-foot"><span class="clients">' + (avatars || esc(L('暂无客户端', 'No clients'))) + '</span>' +
        '<span>' + esc((radios.length ? radios.length + ' ' + L('个射频', 'radios') : (r.channel || '—'))) + '</span></div></div>';
    }).join('');
    const empty = '<div class="pg-empty" style="padding:24px">' + ic('wifi') + '<div>' + esc(L('暂无 SSID 模板', 'No SSID profiles')) + '</div></div>';
    return '<div class="ssid-grid">' + (cards || empty) + '</div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' / ' + rows('wifiConfig').length + ' ' + L('个 SSID 模板', 'SSID profiles')) + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function ssidPanel() {
    return tableToolbar('wifiConfig', L('搜索 SSID、安全配置…', 'Search SSID or security…'), '', true) + ssidCards();
  }

  /* ---------- VPN：隧道（设计稿主卡片表） ---------- */
  function peersOf(wgName) {
    return rows('wgPeers').filter((p) => String(p.interface) === String(wgName));
  }
  function endpointText(p) {
    if (!p) return '';
    return String(p.endpoint || '') + (p['endpoint-port'] ? ':' + p['endpoint-port'] : '');
  }
  function tunnelRows() {
    let rs = rows('wireguard').slice();
    if (W.chip === 'on') rs = rs.filter(isOn);
    else if (W.chip === 'off') rs = rs.filter((r) => !isOn(r));
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [r.name, r.listen_port || r['listen-port'], r.comment].some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function tunnelTable() {
    const rs = tunnelRows();
    const body = rs.map((r) => {
      const peers = peersOf(r.name);
      const firstPeer = peers[0];
      const eps = peers.map(endpointText).filter(Boolean);
      const allowed = uniq(peers.map((p) => String(p['allowed-address'] || '')).filter(Boolean));
      return '<tr>' +
        '<td><div class="if-name"><span class="if-badge wg">wg</span><span><b>' + esc(r.name || '—') + '</b><small>' + esc(r.comment || 'WireGuard') + '</small></span></div></td>' +
        '<td><span class="chain">WireGuard</span></td>' +
        '<td><span class="cell"><b class="mono" title="' + esc(eps[0] || '') + '">' + esc(eps[0] || L('无对端端点', 'No peer endpoint')) + '</b><small title="' + esc(allowed.join(' · ')) + '">' + esc(allowed.slice(0, 2).join(' · ') || (firstPeer ? firstPeer.name : '—')) + '</small></span></td>' +
        '<td><span class="cell"><b class="mono">' + esc((r['listen-port'] || '—') + ' / UDP') + '</b><small>MTU ' + esc(r.mtu || '—') + '</small></span></td>' +
        '<td class="r"><span class="num">' + peers.length + '</span></td>' +
        '<td><span class="status"><span class="dot ' + (isOn(r) ? 'is-green' : 'is-muted') + '"></span>' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span></td>' +
        '<td><button class="row-more" type="button" data-act="wv-more" data-sec="wireguard" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td>' +
        '</tr>';
    }).join('');
    const empty = '<tr><td colspan="7" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无 WireGuard 隧道', 'No WireGuard tunnels')) + '</td></tr>';
    const labels = [L('隧道', 'Tunnel'), L('类型', 'Type'), L('端点 / 允许网段', 'Endpoint / allowed'), L('监听端口', 'Listen'), L('对端', 'Peers'), L('状态', 'Status'), ''];
    return '<div class="table-scroll"><table class="dt"><colgroup><col style="width:20%"><col style="width:12%"><col style="width:26%"><col style="width:15%"><col style="width:8%"><col style="width:11%"><col></colgroup>' +
      '<thead><tr>' + labels.map((l, i) => '<th' + (i === 4 ? ' class="r"' : '') + '>' + esc(l) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' ' + L('条 WireGuard 隧道', 'WireGuard tunnels') + ' · ' + rows('wgPeers').length + ' ' + L('个对端', 'peers')) + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function tunnelPanel() {
    const chips = chipsFor('wireguard').map(([v, label, count]) => chipBtn(v, label, count)).join('');
    return tableToolbar('wireguard', L('搜索隧道、端点或备注…', 'Search tunnel, endpoint or comment…'), chips, true) + tunnelTable();
  }

  /* ---------- VPN：对端 ---------- */
  function peerRows() {
    let rs = rows('wgPeers').slice();
    if (W.chip === 'on') rs = rs.filter(isOn);
    else if (W.chip === 'off') rs = rs.filter((r) => !isOn(r));
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [r.name, r.interface, r['allowed-address'], r.endpoint].some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  /* RouterOS 返回的 persistent-keepalive 自带 "s" 单位（如 "25s"），统一提取纯秒数，避免再拼接单位出现 "25s s" */
  function kaSeconds(v) {
    const m = String(v == null ? '' : v).match(/\d+/);
    return m ? m[0] : '';
  }
  function peerTable() {
    const rs = peerRows();
    const body = rs.map((r) => {
      const ep = endpointText(r);
      return '<tr>' +
        '<td><div class="cell"><b>' + esc(r.name || '—') + '</b><small class="mono">' + esc(r['allowed-address'] || '—') + '</small></div></td>' +
        '<td><span class="cell"><b>' + esc(r.interface || '—') + '</b><small class="mono">' + esc(ep || '—') + '</small></span></td>' +
        '<td class="r"><span class="num">' + (kaSeconds(r['persistent-keepalive']) ? esc(kaSeconds(r['persistent-keepalive'])) + ' s' : '—') + '</span></td>' +
        '<td>' + (boolOn(r.responder) ? '<span class="badge neutral">' + esc(L('仅响应', 'Responder')) + '</span>' : '<span class="badge info">' + esc(L('主动', 'Active')) + '</span>') + '</td>' +
        '<td><span class="status"><span class="dot ' + (isOn(r) ? 'is-green' : 'is-muted') + '"></span>' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span></td>' +
        '<td><button class="row-more" type="button" data-act="wv-more" data-sec="wgPeers" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td>' +
        '</tr>';
    }).join('');
    const empty = '<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无对端', 'No peers')) + '</td></tr>';
    const labels = [L('对端', 'Peer'), L('隧道 / 端点', 'Tunnel / endpoint'), L('保活', 'Keepalive'), L('模式', 'Mode'), L('状态', 'Status'), ''];
    return '<div class="table-scroll"><table class="dt"><thead><tr>' + labels.map((l, i) => '<th' + (i === 2 ? ' class="r"' : '') + '>' + esc(l) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' ' + L('个对端', 'peers') + ' · ' + L('密钥不在页面展示', 'keys hidden')) + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function peerPanel() {
    const chips = chipsFor('wgPeers').map(([v, label, count]) => chipBtn(v, label, count)).join('');
    return tableToolbar('wgPeers', L('搜索对端、允许地址或端点…', 'Search peer, allowed address or endpoint…'), chips, true) + peerTable();
  }

  /* ---------- 带宽控制：队列（设计稿队列表，仅展示真实配置字段） ---------- */
  function queueLimitMbps(v) {
    let best = 0;
    String(v == null ? '' : v).split('/').forEach((part) => {
      const m = part.trim().toLowerCase().match(/^([\d.]+)\s*([kmg]?)(?:bps)?$/);
      if (!m) return;
      let n = Number(m[1]) || 0;
      if (m[2] === 'k') n /= 1000;
      else if (m[2] === 'g') n *= 1000;
      else if (!m[2] && n > 100000) n /= 1000000;
      best = Math.max(best, n);
    });
    return best;
  }
  function queueMaxLimit(all) {
    return all.reduce((m, r) => Math.max(m, queueLimitMbps(r['max-limit'])), 0);
  }
  /* WAN 实时速率（state.latest 由全局快照推送），用于带宽整形摘要的用量条 */
  function queueLiveMbps() {
    const list = (typeof state !== 'undefined' && state.latest && state.latest.ifaces) || [];
    if (!list.length) return null;
    let name = '';
    try { const c = JSON.parse(localStorage.getItem('ros-center-wan') || 'null'); name = c && c.name; } catch (e) { /* ignore */ }
    const pick = (name && list.find((i) => i.name === name)) ||
      list.find((i) => /pppoe|wan/i.test(String(i.name || ''))) ||
      list.find((i) => /^ether1$|^eth0$/i.test(String(i.name || ''))) || null;
    if (!pick) return null;
    return ((Number(pick.rxBps) || 0) + (Number(pick.txBps) || 0)) / 1e6;
  }
  function limitPairCell(v) {
    return '<span class="cell-num"><b>' + esc(v || L('未限速', 'Unlimited')) + '</b>' +
      (v && v.indexOf('/') >= 0 ? '<small>' + esc(L('双向', 'both directions')) + '</small>' : '') + '</span>';
  }
  function queueRows(sec) {
    let rs = rows(sec).slice();
    if (W.chip === 'on') rs = rs.filter(isOn);
    else if (W.chip === 'off') rs = rs.filter((r) => !isOn(r));
    const q = W.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => [r.name, r.target, r.parent, r['packet-mark'], r['max-limit'], r['limit-at'], r.comment]
      .some((v) => String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function queueTable(sec) {
    const rs = queueRows(sec), tree = sec === 'queueTree';
    const more = (r) => '<td><button class="row-more" type="button" data-act="wv-more" data-sec="' + sec + '" data-id="' + ex(r['.id'] || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td>';
    const body = rs.map((r) => {
      const sub = tree ? L('队列树', 'Queue tree') : L('简单队列', 'Simple queue');
      const head = '<td><div class="cell"><b>' + (tree ? '<span class="tree-indent"></span>' : '') + esc(r.name || '—') + '</b><small>' + esc(sub) + '</small></div></td>';
      const target = tree
        ? '<td><span class="addr">' + esc(r.parent || '—') + '</span></td><td><span class="badge info">' + esc(r['packet-mark'] || '—') + '</span></td>'
        : '<td><span class="cell"><b class="mono">' + esc(r.target || '—') + '</b><small>' + esc(r.comment || L('简单队列', 'Simple queue')) + '</small></span></td>';
      return '<tr>' + head + target +
        '<td class="r">' + limitPairCell(r['max-limit']) + '</td>' +
        '<td class="r"><span class="cell-num"><b>' + esc(r['limit-at'] || '—') + '</b>' +
        (r['limit-at'] && String(r['limit-at']).indexOf('/') >= 0 ? '<small>' + esc(L('双向', 'both directions')) + '</small>' : '') + '</span></td>' +
        '<td class="r"><span class="num">' + esc(r.priority || '—') + '</span></td>' +
        '<td><span class="status"><span class="dot ' + (isOn(r) ? 'is-green' : 'is-muted') + '"></span>' + esc(isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</span></td>' +
        more(r) + '</tr>';
    }).join('');
    const cols = tree ? 8 : 7;
    const empty = '<tr><td colspan="' + cols + '" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无队列', 'No queues')) + '</td></tr>';
    const labels = tree
      ? [L('队列', 'Queue'), L('父级', 'Parent'), L('包标记', 'Packet mark'), L('限速', 'Limit'), L('保障速率', 'Limit at'), L('优先级', 'Priority'), L('状态', 'Status'), '']
      : [L('队列', 'Queue'), L('目标', 'Target'), L('限速', 'Limit'), L('保障速率', 'Limit at'), L('优先级', 'Priority'), L('状态', 'Status'), ''];
    const colgroup = tree
      ? '<colgroup><col style="width:23%"><col style="width:15%"><col style="width:15%"><col style="width:16%"><col style="width:12%"><col style="width:9%"><col style="width:10%"><col></colgroup>'
      : '<colgroup><col style="width:23%"><col style="width:23%"><col style="width:16%"><col style="width:14%"><col style="width:8%"><col style="width:11%"><col></colgroup>';
    const rightFrom = tree ? 3 : 2, rightTo = tree ? 5 : 4;
    const on = rs.filter(isOn).length;
    return '<div class="table-scroll"><table class="dt">' + colgroup +
      '<thead><tr>' + labels.map((l, i) => '<th' + (i >= rightFrom && i <= rightTo ? ' class="r"' : '') + '>' + esc(l) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + (body || empty) + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(rs.length + ' ' + L('条队列', 'queues') + ' · ' + on + ' ' + L('启用', 'enabled') + ' · ' + (rs.length - on) + ' ' + L('禁用', 'disabled')) + '</span>' +
      '<span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function queuePanel(sec) {
    const chips = chipsFor(sec).map(([v, label, count]) => chipBtn(v, label, count)).join('');
    const ph = sec === 'queueTree' ? L('搜索队列、父级或包标记…', 'Search queue, parent or packet mark…') : L('搜索队列、目标或备注…', 'Search queue, target or comment…');
    return tableToolbar(sec, ph, chips, true) + queueTable(sec);
  }

  /* ---------- 带宽控制 · 规则：mangle 包标记 → 队列树，或从队列推导 ---------- */
  function queueRuleRows() {
    const qt = rows('queueTree'), sq = rows('simpleQueues');
    const marks = rows('firewallMangle').filter((r) => String(r.action || '') === 'mark-packet' || r['new-packet-mark']);
    if (marks.length) {
      return marks.map((r) => {
        const mark = String(r['new-packet-mark'] || '');
        const queue = mark ? qt.find((q) => String(q['packet-mark'] || '') === mark) : null;
        const hits = r.packets != null && r.packets !== ''
          ? fmtClock(r.packets) + ' ' + L('包', 'pkts') + (r.bytes ? ' · ' + fmtBytes(r.bytes) : '')
          : '—';
        return {
          rule: String(r.comment || mark || L('包标记规则', 'Packet mark rule')),
          sub: [r.chain, r.action].filter(Boolean).join(' · '),
          match: [r['src-address'], r['dst-address'], r.protocol, r['dst-port']].filter(Boolean).join(' · ') || '—',
          queue: queue ? String(queue.name || '') : (mark || '—'),
          policy: queue ? String(queue['max-limit'] || L('未限速', 'Unlimited')) : 'mark-packet',
          hits, sec: 'firewallMangle', id: r['.id'],
        };
      });
    }
    /* 无 mangle 包标记：按真实队列推导规则视图，命中计数无数据时显示 — */
    return sq.concat(qt).map((q) => {
      const tree = qt.indexOf(q) >= 0;
      return {
        rule: String(q.name || '—'),
        sub: tree ? L('队列树', 'Queue tree') : L('简单队列', 'Simple queue'),
        match: tree ? ([q.parent, q['packet-mark']].filter(Boolean).join(' · ') || '—') : (q.target || '—'),
        queue: tree ? String(q.parent || '—') : String(q.name || '—'),
        policy: String(q['max-limit'] || L('未限速', 'Unlimited')),
        hits: '—', sec: tree ? 'queueTree' : 'simpleQueues', id: q['.id'],
      };
    });
  }
  function fmtClock(v) {
    const n = Number(String(v == null ? '' : v).replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n.toLocaleString('en-US') : String(v == null ? '—' : v);
  }
  function queueRulesPanel() {
    const list = queueRuleRows();
    const body = list.map((r) => '<tr>' +
      '<td><div class="cell"><b>' + esc(r.rule) + '</b><small>' + esc(r.sub || '—') + '</small></div></td>' +
      '<td><span class="chain">' + esc(r.match) + '</span></td>' +
      '<td><span class="cell"><b class="mono">' + esc(r.queue) + '</b></span></td>' +
      '<td><span class="badge info">' + esc(r.policy) + '</span></td>' +
      '<td class="r"><span class="num">' + esc(r.hits) + '</span></td>' +
      '<td><button class="row-more" type="button" data-act="wv-rule-edit" data-sec="' + esc(r.sec) + '" data-id="' + esc(r.id || '') + '" title="' + esc(L('更多', 'More')) + '">' + ic('more') + '</button></td></tr>').join('');
    const hasMarks = rows('firewallMangle').some((r) => String(r.action || '') === 'mark-packet' || r['new-packet-mark']);
    return '<div class="toolbar"><span class="toolbar-note">' +
        esc(hasMarks ? L('来自 /ip/firewall/mangle · 与队列树 packet-mark 关联', 'From /ip/firewall/mangle · linked by packet mark')
          : L('来自队列配置 · 未发现 mangle 包标记规则', 'From queue config · no mangle packet-mark rules')) +
        '</span></div>' +
      '<div class="table-scroll"><table class="dt">' +
      '<colgroup><col style="width:30%"><col style="width:30%"><col style="width:12%"><col style="width:14%"><col style="width:14%"><col></colgroup>' +
      '<thead><tr><th>' + esc(L('规则', 'Rule')) + '</th><th>' + esc(L('匹配条件', 'Match')) + '</th><th>' + esc(L('队列', 'Queue')) + '</th><th>' + esc(L('策略', 'Policy')) + '</th><th class="r">' + esc(L('命中', 'Hits')) + '</th><th></th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="6" style="text-align:center;color:var(--v2-faint);padding:28px">' + esc(L('暂无规则', 'No rules')) + '</td></tr>') + '</tbody></table></div>' +
      '<div class="table-foot"><span>' + esc(L('规则按顺序匹配 · 无匹配流量进入默认队列', 'Rules match in order · unmatched traffic uses the default queue')) + '</span>' +
      '<span class="mono">' + esc(list.length + ' ' + L('条', 'rules')) + '</span></div>';
  }

  /* ---------- VPN：真实实时速率图（state.ifHistory 中的 WireGuard 接口） ---------- */
  function wgTraffic() {
    const names = rows('wireguard').map((r) => String(r.name || '')).filter(Boolean);
    const hist = (window.state && state.ifHistory) || null;
    if (!names.length || !hist || typeof hist.get !== 'function') return { names: names, points: [] };
    const map = new Map();
    names.forEach((n) => {
      (hist.get(n) || []).slice(-90).forEach((p) => {
        const row = map.get(p.ts) || { ts: p.ts, rx: 0, tx: 0 };
        row.rx += Number(p.rx) || 0;
        row.tx += Number(p.tx) || 0;
        map.set(p.ts, row);
      });
    });
    return { names: names, points: Array.from(map.values()).sort((a, b) => a.ts - b.ts).slice(-60) };
  }
  function vpnChart() {
    const data = wgTraffic();
    const pts = data.points;
    if (pts.length < 2) {
      return '<section class="card"><div class="card-head"><div><h2 class="card-title">' + esc(L('隧道流量 · 实时采样', 'Tunnel traffic · live')) + '</h2>' +
        '<div class="card-sub">' + esc(L('来自实时快照的 WireGuard 接口速率', 'WireGuard interface rates from live snapshots')) + '</div></div></div>' +
        '<div class="rail-body"><div class="notice blue">' + ic('pulse') + '<div>' + esc(L('正在采集接口速率，稍候即可看到会话内趋势。', 'Collecting interface rates; the session trend will appear shortly.')) + '</div></div></div></section>';
    }
    const WIDTH = 900, TOP = 16, BOTTOM = 256, HEIGHT = 280;
    const max = Math.max.apply(null, pts.map((p) => Math.max(p.rx, p.tx)).concat([1]));
    const x = (i) => (pts.length <= 1 ? 0 : (i * WIDTH) / (pts.length - 1));
    const y = (v) => BOTTOM - (Math.max(0, v) / max) * (BOTTOM - TOP);
    const line = (key) => pts.map((p, i) => (i ? 'L ' : 'M ') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
    const area = (key, fill) => '<path d="' + line(key) + ' L ' + WIDTH + ' ' + BOTTOM + ' L 0 ' + BOTTOM + ' Z" fill="url(#' + fill + ')"/>';
    const last = pts[pts.length - 1];
    const start = pts[0].ts, end = last.ts;
    const secs = Math.max(1, Math.round((end - start) / 1000));
    const labels = [0, 0.25, 0.5, 0.75, 1].map((f) => '-' + Math.round(secs * (1 - f)) + 's').map((s) => s === '-0s' ? L('现在', 'now') : s);
    const grid = [TOP, 76, 136, 196, BOTTOM].map((yy) => '<line x1="0" y1="' + yy + '" x2="' + WIDTH + '" y2="' + yy + '" class="grid-line"/>').join('');
    return '<section class="card"><div class="card-head"><div><h2 class="card-title">' + esc(L('隧道流量 · 实时采样', 'Tunnel traffic · live')) + '</h2>' +
      '<div class="card-sub">' + esc(data.names.join(' + ') + L(' 聚合 · 会话内 ', ' aggregate · session ') + secs + 's') + '</div></div>' +
      '<div class="legend"><span><i class="rx"></i>' + esc(L('下行', 'RX')) + '<b>' + esc(rateStr(last.rx)) + '</b></span><span><i class="tx"></i>' + esc(L('上行', 'TX')) + '<b>' + esc(rateStr(last.tx)) + '</b></span></div></div>' +
      '<div class="chart-body"><div class="chart-wrap tall"><svg class="area-chart" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" preserveAspectRatio="none" role="img" aria-label="' + esc(L('隧道实时速率', 'Live tunnel rates')) + '">' +
      '<defs><linearGradient id="wvpnrx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v2-accent);stop-opacity:.20"/><stop offset="1" style="stop-color:var(--v2-accent);stop-opacity:0"/></linearGradient>' +
      '<linearGradient id="wvpntx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--v2-teal);stop-opacity:.15"/><stop offset="1" style="stop-color:var(--v2-teal);stop-opacity:0"/></linearGradient></defs>' +
      grid + area('rx', 'wvpnrx') + area('tx', 'wvpntx') +
      '<path d="' + line('tx') + '" fill="none" stroke="var(--v2-teal)" stroke-width="1.7" vector-effect="non-scaling-stroke"/>' +
      '<path d="' + line('rx') + '" fill="none" stroke="var(--v2-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      '</svg></div><div class="chart-x">' + labels.map((l) => '<span>' + esc(l) + '</span>').join('') + '</div></div>' +
      '<div class="table-foot"><span>' + esc(L('峰值', 'Peak') + ' ' + rateStr(max) + ' · ' + pts.length + ' ' + L('个采样点', 'samples')) + '</span>' +
      '<span class="mono">' + esc(L('1 秒采样 · 最多 90 秒', '1s sampling · up to 90s')) + '</span></div></section>';
  }
  function singletonHtml(sec) {
    const r = rows(sec)[0] || null;
    const fs = fieldsOf(sec).filter((f) => f.key !== '.id');
    const body = fs.map((f) => kvRow(L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key), displayValue(f, r ? r[f.key] : ''))).join('');
    const btn = canWrite(sec)
      ? '<button class="btn" type="button" data-act="wv-singleton-edit" data-sec="' + sec + '">' + ic('gear') + esc(r ? L('编辑配置', 'Edit config') : L('初始化配置', 'Initialize')) + '</button>'
      : '';
    return '<div class="wv-singleton"><div class="wv-singleton-head"><span class="status"><span class="dot ' + (r && isOn(r) ? 'is-green' : 'is-amber') + '"></span>' +
      esc(r ? (isOn(r) ? L('已配置', 'Configured') : L('已禁用', 'Disabled')) : L('暂无配置', 'No configuration')) + '</span>' + btn + '</div>' +
      '<div class="wv-singleton-grid">' + body + '</div></div>' +
      '<div class="table-foot"><span>' + esc(secPath(sec)) + '</span><span class="mono">' + esc(relTime(W.loadedAt)) + '</span></div>';
  }
  function panelBody(sec) {
    const notice = W.err[sec]
      ? '<div class="notice wv-notice">' + ex(W.err[sec]) + ' <button class="btn" type="button" data-act="wv-refresh">' + esc(L('重试', 'Retry')) + '</button></div>'
      : '';
    if (W.err[sec] && !rows(sec).length) return notice;
    if (sec === 'wifiReg') return notice + clientPanel();
    if (sec === 'wifi') return notice + radioPanel();
    if (sec === 'wifiConfig') return notice + ssidPanel();
    if (sec === 'wireguard') return notice + tunnelPanel();
    if (sec === 'wgPeers') return notice + peerPanel();
    if (sec === 'simpleQueues' || sec === 'queueTree') return notice + queuePanel(sec);
    if (sec === 'queueRules') return notice + queueRulesPanel();
    return notice + (isSingleton(sec) ? singletonHtml(sec) : toolbarHtml(sec) + tableHtml(sec));
  }

  /* ---------- KPI（全部基于真实配置行计算） ---------- */
  function kpiCard(iconName, color, title, value, statusHtml, footLeft, footRight) {
    return '<article class="card kpi"><div class="kpi-top"><span class="kpi-ico ' + color + '">' + ic(iconName) + '</span>' + esc(title) + '</div>' +
      '<div class="kpi-main"><div class="kpi-num">' + value + '</div><span class="status">' + (statusHtml || '') + '</span></div>' +
      '<div class="kpi-foot"><span>' + esc(footLeft) + '</span><span>' + esc(footRight) + '</span></div></article>';
  }
  function wirelessKpis() {
    const aps = rows('wifi'), clients = rows('wifiReg'), remotes = rows('wifiRemote');
    const apOn = aps.filter(isOn).length;
    const sigs = clients.map((r) => signalNum(r.signal)).filter((n) => n != null);
    const avgSig = sigs.length ? Math.round(sigs.reduce((a, b) => a + b, 0) / sigs.length) : null;
    const rates = clients.map(maxClientRate).filter((n) => n > 0);
    const maxRate = rates.length ? Math.max.apply(null, rates) : 0;
    const bands = uniq(aps.map((r) => bandLabel(r.band)).filter((b) => b && b !== '—'));
    return [
      kpiCard('antenna', 'blue', L('接入点', 'Access points'), String(aps.length),
        statusDot(apOn > 0, L('在线', 'Online'), L('在线', 'Online')),
        bands.join(' · ') || L('来自 WiFi 接口', 'From WiFi interfaces'),
        apOn + ' / ' + aps.length + ' ' + L('启用', 'enabled')),
      kpiCard('users', 'green', L('无线客户端', 'Wireless clients'), String(clients.length),
        statusDot(clients.length > 0, L('在线', 'Online'), L('在线', 'Online')),
        clientsOfBand('5 GHz').length + ' ' + L('台 5 GHz', 'on 5 GHz') + ' · ' + clientsOfBand('2.4 GHz').length + ' ' + L('台 2.4 GHz', 'on 2.4 GHz'),
        remotes.length + ' ' + L('台在线 AP', 'live APs')),
      kpiCard('pulse', 'teal', L('平均信号', 'Avg. signal'),
        (avgSig == null ? '—' : avgSig + '<span class="u">dBm</span>'),
        statusDot(avgSig != null && avgSig >= -70, L('良好', 'Good'), L('良好', 'Good')),
        sigs.length ? L('最弱', 'Weakest') + ' ' + Math.min.apply(null, sigs) + ' dBm' : L('无信号数据', 'No signal data'),
        sigs.length + ' ' + L('个样本', 'samples')),
      kpiCard('speed', 'violet', L('协商速率', 'Negotiated rate'),
        (maxRate ? maxRate + '<span class="u">Mbps</span>' : '—'),
        statusDot(maxRate > 0, L('稳定', 'Stable'), L('稳定', 'Stable')),
        L('客户端峰值', 'Client peak'),
        clients.length + ' ' + L('台客户端', 'clients')),
    ].join('');
  }
  function vpnKpis() {
    const wg = rows('wireguard'), peers = rows('wgPeers'), secrets = rows('pppSecrets'), active = rows('pppActive'), profiles = rows('pppProfiles');
    const wgOn = wg.filter(isOn).length;
    return [
      kpiCard('lock', 'violet', L('隧道接口', 'Tunnels'), String(wg.length),
        statusDot(wgOn > 0, L('已启用', 'Enabled'), L('已启用', 'Enabled')),
        'WireGuard ' + wg.length,
        L('真实接口配置', 'Live interface config')),
      kpiCard('conn', 'green', L('对端', 'Peers'), String(peers.length),
        statusDot(peers.filter(isOn).length > 0, L('已配置', 'Configured'), L('已配置', 'Configured')),
        WG_PEER_LABEL(),
        L('来自 WG peers', 'From WG peers')),
      kpiCard('users', 'blue', L('PPP 账号', 'PPP secrets'), String(secrets.length),
        statusDot(secrets.filter(isOn).length > 0, L('已启用', 'Enabled'), L('已启用', 'Enabled')),
        L('配置模板', 'Profiles') + ' ' + profiles.length,
        L('来自 /ppp/secret', 'From /ppp/secret')),
      kpiCard('check', 'teal', L('在线用户', 'Active users'), String(active.length),
        statusDot(active.length > 0, L('在线', 'Online'), L('在线', 'Online')),
        L('实时拨号会话', 'Live sessions'),
        L('来自 /ppp/active', 'From /ppp/active')),
    ].join('');
  }
  function WG_PEER_LABEL() {
    const eps = rows('wgPeers').map((r) => r.endpoint).filter(Boolean);
    return eps.length ? eps.slice(0, 2).join(' · ') : L('未设置端点', 'No endpoints');
  }
  function queueKpis() {
    const sq = rows('simpleQueues'), qt = rows('queueTree'), all = sq.concat(qt);
    const on = all.filter(isOn).length;
    const off = all.length - on;
    const limited = all.filter((r) => !!r['max-limit']).length;
    const cap = queueMaxLimit(all);
    const avg = limited ? all.reduce((n, r) => n + queueLimitMbps(r['max-limit']), 0) / limited : 0;
    const unit = cap >= 1000 ? 'Gbps' : 'Mbps';
    const capValue = cap ? (cap >= 1000 ? Math.round(cap / 100) / 10 : Math.round(cap * 10) / 10) : '—';
    const avgLabel = avg ? (avg >= 1000 ? Math.round(avg / 100) / 10 + ' Gbps' : Math.round(avg * 10) / 10 + ' Mbps') : '—';
    return [
      kpiCard('speed', 'blue', L('队列', 'Queues'), String(all.length),
        statusDot(on > 0, on + ' ' + L('启用', 'enabled'), on + ' enabled', off + ' ' + L('禁用', 'disabled'), off + ' disabled'),
        L('简单队列', 'Simple') + ' ' + sq.length + ' · ' + L('队列树', 'Tree') + ' ' + qt.length,
        off + ' ' + L('个禁用', 'disabled')),
      kpiCard('users', 'teal', L('限速队列', 'Limited queues'), String(limited),
        statusDot(limited > 0, L('已限速', 'Limited'), L('已限速', 'Limited')),
        L('设置了 max-limit', 'max-limit configured'),
        all.length ? Math.round(limited * 100 / all.length) + '% ' + L('覆盖', 'coverage') : '0%'),
      kpiCard('pulse', 'violet', L('最高限速', 'Peak limit'), esc(String(capValue)) + '<span class="u">' + unit + '</span>',
        statusDot(cap > 0, L('配置上限', 'Configured'), L('配置上限', 'Configured')),
        limited + ' ' + L('条已限速', 'limited queues'),
        L('平均', 'avg') + ' ' + avgLabel),
      kpiCard('alert', 'amber', L('启用率', 'Enabled rate'), String(all.length ? Math.round(on * 100 / all.length) : 0) + '<span class="u pct">%</span>',
        statusDot(on > 0, L('策略生效', 'Active'), L('策略生效', 'Active')),
        on + ' / ' + all.length + ' ' + L('条队列', 'queues'),
        off + ' ' + L('条禁用', 'disabled')),
    ].join('');
  }

  /* ---------- rail 卡片（全部基于真实数据） ---------- */
  function sectionCountBody(secs) {
    const body = secs.map((s) => kvRow(secTitle(s), String(rows(s).length))).join('');
    return body + kvRow(L('最近刷新', 'Last refresh'), relTime(W.loadedAt));
  }
  function wirelessRail() {
    const aps = rows('wifi'), clients = rows('wifiReg');
    const maxLoad = Math.max(1, aps.reduce((m, r) => Math.max(m, clientsOnRadio(r.name).length), 0));
    const radioBody = aps.length
      ? '<div class="health">' + aps.slice(0, 5).map((r) => {
        const count = clientsOnRadio(r.name).length;
        return '<div class="health-row"><span title="' + esc(r.name || '') + '">' + esc(radioShort(r.name)) + '</span>' +
          '<span class="bar"><i style="width:' + Math.round(count * 100 / maxLoad) + '%"></i></span><b>' + esc(r.channel || 'auto') + '</b></div>';
      }).join('') + '</div>' +
      '<div class="hairline"></div>' + kvRow(L('射频 / 客户端', 'Radios / clients'), aps.length + ' / ' + clients.length)
      : emptyBox('wifi', L('暂无 WiFi 接口', 'No WiFi interfaces'));

    const sigs = clients.map((r) => signalNum(r.signal)).filter((n) => n != null);
    const good = sigs.filter((n) => n >= -60).length;
    const ok = sigs.filter((n) => n >= -68 && n < -60).length;
    const weak = sigs.filter((n) => n < -68).length;
    const max = Math.max(good, ok, weak, 1);
    const sigBody = sigs.length
      ? '<div class="rank">' +
        '<div class="rank-row"><span class="lbl">' + esc(L('优 ≥ -60 dBm', 'Excellent ≥ -60 dBm')) + '</span><span class="val">' + good + '</span><span class="bar"><i style="width:' + Math.round(good * 100 / max) + '%"></i></span></div>' +
        '<div class="rank-row"><span class="lbl">' + esc(L('良 -61 ~ -68 dBm', 'Good -61 ~ -68 dBm')) + '</span><span class="val">' + ok + '</span><span class="bar"><i style="width:' + Math.round(ok * 100 / max) + '%"></i></span></div>' +
        '<div class="rank-row"><span class="lbl">' + esc(L('弱 < -68 dBm', 'Weak < -68 dBm')) + '</span><span class="val">' + weak + '</span><span class="bar" style="background:var(--v2-amber-soft)"><i style="width:' + Math.round(weak * 100 / max) + '%;background:var(--v2-amber)"></i></span></div></div>' +
        '<div class="hairline"></div>' + kvRow(L('有信号样本', 'Samples'), String(sigs.length))
      : emptyBox('antenna', L('暂无信号数据', 'No signal data'));

    const tlBody = clients.length
      ? '<div class="timeline">' + clients.slice(0, 4).map((r) => {
        const sig = signalNum(r.signal);
        const dot = sig != null && sig < -70
          ? '<span class="tl-dot" style="background:var(--v2-amber);box-shadow:0 0 0 3px var(--v2-amber-soft)"></span>'
          : '<span class="tl-dot"></span>';
        const rate = maxClientRate(r);
        return '<div class="tl-item">' + dot + '<div><b>' + esc(clientName(r)) + ' · ' + esc(r.interface || '—') + '</b>' +
          '<small>' + esc([bandOfClient(r), rate ? rate + ' Mbps' : '', uptimeHuman(r.uptime)].filter(Boolean).join(' · ')) + '</small></div></div>';
      }).join('') + '</div>'
      : emptyBox('users', L('暂无在线客户端', 'No online clients'));

    return [
      miniCard(L('射频负载', 'Radio load'), L('按在线客户端 · 右侧为信道', 'Clients per radio · channel on right'), radioBody,
        '<span class="badge neutral">' + esc(aps.length + ' ' + L('射频', 'radios')) + '</span>'),
      miniCard(L('信号分布', 'Signal distribution'), L('客户端注册信号分级', 'RSSI buckets from registration table'), sigBody,
        '<span class="badge ' + (good ? 'allow' : 'neutral') + '">' + esc(good + ' ' + L('优', 'good')) + '</span>'),
      miniCard(L('在线客户端', 'Online clients'), L('注册表实时关联', 'Live registration entries'), tlBody,
        '<span class="status"><span class="dot ' + (clients.length ? 'is-green' : 'is-muted') + '"></span>' + esc(clients.length + ' ' + L('台', 'online')) + '</span>'),
    ].join('');
  }
  function vpnRail() {
    const wg = rows('wireguard'), peers = rows('wgPeers'), active = rows('pppActive'), secrets = rows('pppSecrets');
    const first = wg[0] || null;
    const firstPeers = first ? peersOf(first.name) : [];
    const spotPeer = firstPeers[0] || null;
    const spotBody = first
      ? '<div class="route-spot"><span class="route-ico" style="background:var(--v2-violet-soft);color:var(--v2-violet)">' + ic('lock') + '</span>' +
        '<div class="route-main"><b>' + esc(spotPeer ? (spotPeer['allowed-address'] || spotPeer.name) : first.name) + '</b>' +
        '<small>' + esc([spotPeer ? endpointText(spotPeer) : '', first.comment].filter(Boolean).join(' · ') || 'WireGuard') + '</small></div></div>' +
        '<div style="margin-top:8px">' + kvRow(L('监听端口', 'Listen port'), String(first['listen-port'] || '—'), 'mono') +
        kvRow('MTU', String(first.mtu || '—'), 'mono') +
        kvRow(L('对端', 'Peers'), String(firstPeers.length)) +
        kvRow(L('状态', 'Status'), isOn(first) ? L('启用', 'Enabled') : L('禁用', 'Disabled')) + '</div>'
      : emptyBox('lock', L('暂无 WireGuard 接口', 'No WireGuard interfaces'));

    const peerBody = peers.length
      ? peers.slice(0, 5).map((p) => kvRow(String(p.name || '—'), endpointText(p) || String(p['allowed-address'] || '—'), 'mono')).join('')
      : emptyBox('conn', L('暂无 WG 对端', 'No WG peers'));

    const tlBody = active.length
      ? '<div class="timeline">' + active.slice(0, 4).map((r) => '<div class="tl-item"><span class="tl-dot"></span><div><b>' +
        esc(String(r.name || '—') + (r.address ? ' · ' + r.address : '')) + '</b><small>' +
        esc([r.service, uptimeHuman(r.uptime)].filter(Boolean).join(' · ') || L('在线会话', 'Active session')) + '</small></div></div>').join('') + '</div>'
      : emptyBox('users', L('暂无在线会话', 'No active sessions'));

    const wgOn = wg.filter(isOn).length;
    const checkBody = kvRow(L('隧道启用', 'Tunnels enabled'), wgOn + ' / ' + wg.length) +
      kvRow(L('WG 对端', 'WG peers'), String(peers.length)) +
      kvRow(L('PPP 账号', 'PPP accounts'), String(secrets.length)) +
      kvRow(L('私钥展示', 'Private keys'), L('从不展示', 'Never shown')) +
      '<div class="notice ' + (wgOn && peers.length ? 'green' : 'blue') + '">' + ic(wgOn && peers.length ? 'check' : 'lock') +
      '<div>' + esc(L('配置来自 RouterOS 实时快照；私钥与口令不会在页面展示。', 'Configuration comes from live RouterOS snapshots; private keys and passwords are never shown.')) + '</div></div>';

    return [
      miniCard(first ? String(first.name || 'WireGuard') : L('WireGuard 隧道', 'WireGuard tunnel'),
        first && first.comment ? String(first.comment) : L('主用隧道接口', 'Primary tunnel'), spotBody,
        first ? '<span class="badge ' + (isOn(first) ? 'allow' : 'neutral') + '">' + esc(isOn(first) ? L('已启用', 'Enabled') : L('已禁用', 'Disabled')) + '</span>' : ''),
      miniCard(L('对端配置', 'Peer configuration'), L('端点 / 允许网段', 'Endpoint / allowed address'), peerBody,
        '<span class="badge neutral">' + esc(peers.length + ' ' + L('个对端', 'peers')) + '</span>'),
      miniCard(L('在线会话', 'Active sessions'), L('来自 /ppp/active', 'From /ppp/active'), tlBody,
        '<span class="status"><span class="dot ' + (active.length ? 'is-green' : 'is-muted') + '"></span>' + esc(active.length + ' ' + L('在线', 'online')) + '</span>'),
      miniCard(L('配置检查', 'Configuration check'), L('隧道与账号状态', 'Tunnels and accounts'), checkBody,
        '<span class="status"><span class="dot ' + (wgOn && peers.length ? 'is-green' : 'is-amber') + '"></span>' + esc(wgOn && peers.length ? L('正常', 'OK') : L('待配置', 'Incomplete')) + '</span>'),
    ].join('');
  }
  function queueRail() {
    const sq = rows('simpleQueues'), qt = rows('queueTree'), all = sq.concat(qt);
    const limited = all.filter((r) => !!r['max-limit']);
    const cap = queueMaxLimit(all);
    const total = all.length || 1;

    const buckets = {};
    all.forEach((r) => {
      const k = String(r['max-limit'] || L('未限速', 'Unlimited'));
      buckets[k] = (buckets[k] || 0) + 1;
    });
    const keys = Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]);
    const top = keys.slice(0, 4);
    const rest = keys.slice(4).reduce((n, k) => n + buckets[k], 0);
    const palette = ['', 'b2', 'b3', 'b4'];
    const mixBody = top.length
      ? '<div class="mix-bar">' + top.map((k, i) => '<i class="' + palette[i] + '" style="width:' + Math.round(buckets[k] * 100 / total) + '%"></i>').join('') +
        (rest ? '<i class="b5" style="width:' + Math.round(rest * 100 / total) + '%"></i>' : '') + '</div>' +
        '<div class="mix-legend">' + top.map((k, i) => '<span><i class="' + palette[i] + '"></i>' + esc(k) + '<b>' + buckets[k] + '</b></span>').join('') +
        (rest ? '<span><i class="b5"></i>' + esc(L('其他', 'Other')) + '<b>' + rest + '</b></span>' : '') + '</div>' +
        '<div class="notice blue">' + ic('alert') + '<div>' + esc(L('当前 API 不返回队列实时速率与丢弃计数，页面仅展示真实配置值。', 'The current API does not return live queue rates or drop counters; only live configuration values are shown.')) + '</div></div>'
      : emptyBox('speed', L('暂无队列限速', 'No queue limits'));

    const maxCap = cap || 1;
    const hp = all.slice().sort((a, b) => (Number(a.priority) || 8) - (Number(b.priority) || 8) || queueLimitMbps(b['max-limit']) - queueLimitMbps(a['max-limit']));
    const topPrio = hp.length ? (hp[0].priority || '8') : '—';
    const hpBody = hp.length
      ? '<div class="rank">' + hp.slice(0, 4).map((r) => '<div class="rank-row"><span class="lbl" title="' + esc(r.name || '') + '">' + esc(r.name || '—') + '</span>' +
        '<span class="val">' + esc(r['max-limit'] || '—') + '</span><span class="bar"><i style="width:' + Math.round(queueLimitMbps(r['max-limit']) * 100 / maxCap) + '%"></i></span></div>').join('') + '</div>' +
        '<div class="hairline"></div>' + kvRow(L('最高优先级', 'Top priority'), 'priority ' + topPrio) +
        kvRow(L('最高限速', 'Peak limit'), cap ? (cap >= 1000 ? Math.round(cap / 100) / 10 + ' Gbps' : Math.round(cap * 10) / 10 + ' Mbps') : '—')
      : emptyBox('alert', L('暂无队列', 'No queues'));

    const sample = all.slice(0, 5);
    const onCount = all.filter(isOn).length;
    const tlBody = sample.length
      ? '<div class="timeline">' + sample.map((r) => {
        const kind = qt.indexOf(r) >= 0 ? L('队列树', 'Queue tree') : L('简单队列', 'Simple queue');
        return '<div class="tl-item"><span class="tl-dot"' +
          (isOn(r) ? '' : ' style="background:var(--v2-faint);box-shadow:0 0 0 3px var(--v2-surface-3)"') + '></span><div><b>' + esc(r.name || '—') + '</b><small>' +
          esc([kind, isOn(r) ? L('启用', 'Enabled') : L('禁用', 'Disabled'), r.priority ? 'priority ' + r.priority : ''].filter(Boolean).join(' · ')) +
          '</small></div></div>';
      }).join('') + '</div>' +
        '<div class="hairline"></div>' + kvRow(L('启用 / 禁用', 'Enabled / disabled'), onCount + ' / ' + (all.length - onCount)) +
        kvRow(L('最近刷新', 'Last refresh'), relTime(W.loadedAt))
      : emptyBox('layers', L('暂无队列', 'No queues'));

    return [
      miniCard(L('限速分布', 'Limit breakdown'), L('按 max-limit 配置 · 队列数', 'Queues per max-limit value'), mixBody,
        '<span class="badge ' + (limited.length ? 'info' : 'neutral') + '">' + esc(limited.length + ' ' + L('条限速', 'limited')) + '</span>'),
      miniCard(L('高优先级', 'High priority'), L('按 priority 升序 · 数值越小越优先', 'Sorted by priority · lower is higher'), hpBody,
        '<span class="badge neutral">priority ' + esc(topPrio) + '</span>'),
      miniCard(L('队列状态', 'Queue status'), L('当前快照 · 非变更日志', 'Current snapshot · not a change log'), tlBody,
        '<span class="badge neutral">' + esc(all.length + ' ' + L('条队列', 'queues')) + '</span>'),
    ].join('');
  }

  /* ---------- 底部补充卡片 ---------- */
  function extraCards(secs, title, sub) {
    const perCard = Math.ceil(secs.length / 4) || 1;
    const out = [];
    for (let i = 0; i < secs.length; i += perCard) {
      const part = secs.slice(i, i + perCard);
      out.push(miniCard(part.length === 1 ? secTitle(part[0]) : title, sub,
        part.map((s) => kvRow(secTitle(s), String(rows(s).length) + ' ' + L('条', 'rows'))).join('')));
    }
    return out.join('');
  }
  function wirelessExtra() {
    const bySsid = {};
    rows('wifiReg').forEach((r) => { const k = String(r.ssid || L('未关联', 'unassociated')); bySsid[k] = (bySsid[k] || 0) + 1; });
    const keys = Object.keys(bySsid).sort((a, b) => bySsid[b] - bySsid[a]).slice(0, 6);
    return extraCards(WIRELESS_SECS, L('无线概览', 'Wireless overview'), L('各分类真实行数', 'Live row counts')) +
      miniCard(L('客户端 SSID 分布', 'Clients by SSID'), L('来自无线注册表', 'From registration table'),
        keys.length ? keys.map((k) => kvRow(k, String(bySsid[k]))).join('') : emptyBox('wifi', L('暂无客户端', 'No clients')));
  }
  function vpnExtra() {
    return extraCards(VPN_SECS, L('VPN 概览', 'VPN overview'), L('各分类真实行数', 'Live row counts')) +
      miniCard(L('数据状态', 'Data status'), L('真实 API 快照', 'Live API snapshot'),
        kvRow(L('WireGuard', 'WireGuard'), String(rows('wireguard').length)) +
        kvRow(L('WG 对端', 'WG peers'), String(rows('wgPeers').length)) +
        kvRow(L('更新时间', 'Updated'), relTime(W.loadedAt)));
  }
  function queueExtra() {
    return extraCards(QUEUE_SECS, L('队列概览', 'Queue overview'), L('各分类真实行数', 'Live row counts')) +
      miniCard(L('数据状态', 'Data status'), L('真实 API 快照', 'Live API snapshot'),
        kvRow(L('简单队列', 'Simple queues'), String(rows('simpleQueues').length)) +
        kvRow(L('队列树', 'Queue tree'), String(rows('queueTree').length)) +
        kvRow(L('更新时间', 'Updated'), relTime(W.loadedAt)));
  }

  /* ---------- 页面骨架 ---------- */
  function tabsHtml(secs) {
    return '<div class="panel-tabs" data-tabs>' + secs.map((s) =>
      '<button class="panel-tab ' + (s === W.section ? 'on' : '') + '" type="button" data-act="wv-tab" data-tab="' + s + '">' +
      esc(tabLabel(s)) + '<span class="pt-count">' + (s === 'queueRules' ? queueRuleRows().length : rows(s).length) + '</span></button>').join('') + '</div>';
  }
  function pageHead(title, meta, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1><div class="meta">' + meta + '</div></div>' +
      '<div class="actions">' + actions + '</div></div>';
  }
  function headActions(withScan) {
    return '<span class="live"><span class="dot"></span>' + esc(relTime(W.loadedAt)) + '</span>' +
      (withScan
        ? '<button class="btn primary" type="button" data-act="wv-scan">' + ic('search') + esc(L('扫描信道', 'Scan channels')) + '</button>'
        : (canWrite(W.section) ? '<button class="btn primary" type="button" data-act="wv-add">' + ic('plus') + esc(L('新增', 'Add')) + '</button>' : ''));
  }
  /* ---------- 扫描信道（/interface/wifi/scan 实时结果） ---------- */
  function openScanDialog() {
    const u = window.UI; if (!u || !u.openForm) return;
    const radios = rows('wifi').map((r) => r.name).filter(Boolean);
    if (!radios.length) return say(L('暂无 WiFi 射频接口，无法扫描', 'No WiFi radio to scan'), 'warn');
    u.openForm({
      title: L('扫描信道', 'Scan channels'),
      sub: '/interface/wifi/scan',
      note: L('扫描会短暂占用所选射频（数秒），下方结果为路由器实时上报的周边 SSID、信道与信号强度。', 'The scan briefly occupies the selected radio; results below come live from the router.'),
      fields: [
        { key: 'interface', label: L('射频接口', 'Radio'), type: 'select', value: radios[0], options: radios },
        { key: 'duration', label: L('扫描时长', 'Duration'), type: 'select', value: '5',
          options: [{ value: '5', label: '5s' }, { value: '10', label: '10s' }] },
      ],
      onSubmit: async (v) => {
        try {
          const d = await api('/api/wifi/scan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: state.deviceId, interface: v.interface, duration: Number(v.duration) }),
          });
          u.closeModal();
          showScanResult(v.interface, d);
        } catch (e) { say((e && e.message) || L('扫描失败', 'Scan failed'), 'err'); }
      },
    });
  }
  function showScanResult(iface, d) {
    const u = window.UI; if (!u || !u.openModal) return;
    const list = (d && d.rows) || [];
    const close = [{ label: L('关闭', 'Close') }];
    if (!list.length) {
      const msg = (d && (d.note || d.error)) || L('路由器未返回扫描结果', 'The router returned no scan results');
      return u.openModal({ title: L('扫描信道', 'Scan channels'), sub: iface + ' · /interface/wifi/scan',
        body: '<div class="notice">' + esc(msg) + '</div>', actions: close });
    }
    const rowsHtml = list.map((r) => {
      const meta = [r.channel, r.frequency ? r.frequency + ' MHz' : '', r.security].filter(Boolean).join(' · ');
      return '<div class="scan-row"><span class="scan-ssid"><b>' + esc(r.ssid || L('隐藏 SSID', 'Hidden SSID')) + '</b>' +
        '<small class="mono">' + esc(meta || '—') + '</small></span>' +
        '<span class="num">' + esc(r.signal != null && r.signal !== '' ? r.signal + ' dBm' : '—') + '</span></div>';
    }).join('');
    u.openModal({ title: L('扫描信道', 'Scan channels'), sub: iface + ' · /interface/wifi/scan · ' + list.length + ' ' + L('个 SSID', 'SSIDs'),
      body: '<div class="scan-list">' + rowsHtml + '</div>', actions: close });
  }
  function wirelessHtml() {
    const aps = rows('wifi'), clients = rows('wifiReg'), remotes = rows('wifiRemote');
    const bands = uniq(aps.map((r) => bandLabel(r.band)).filter((b) => b && b !== '—'));
    const sigs = clients.map((r) => signalNum(r.signal)).filter((n) => n != null);
    const avg = sigs.length ? Math.round(sigs.reduce((a, b) => a + b, 0) / sigs.length) : null;
    const healthy = avg != null && avg >= -70;
    const sub = [authSummary(), bands.join(' · '), (remotes.length || aps.length) + ' ' + L('个接入点', 'access points')].filter(Boolean).join(' · ');
    const status = clients.length
      ? '<span class="status"><span class="dot ' + (healthy ? 'is-green' : 'is-amber') + '"></span>' + esc(healthy ? L('信号良好', 'Healthy signal') : L('信号偏弱', 'Weak signal')) + '</span>'
      : '<span class="status"><span class="dot is-muted"></span>' + esc(L('等待客户端', 'Waiting for clients')) + '</span>';
    return pageHead(L('无线', 'Wireless'),
      esc(L('主路由', 'Main router')) + '<span class="sep"></span>' + aps.length + ' ' + esc(L('个无线接口', 'WiFi interfaces')) +
      '<span class="sep"></span>' + clients.length + ' ' + esc(L('台客户端', 'clients')) +
      (bands.length ? '<span class="sep"></span>' + esc(bands.join(' · ')) : ''),
      headActions(true)) +
      '<div class="grid align-start">' +
      '<div class="kpis">' + wirelessKpis() + '</div>' +
      '<section class="card span8"><div class="card-head"><div><h2 class="card-title">' + esc(L('无线网络', 'Wireless network')) + '</h2>' +
      '<div class="card-sub">' + esc(sub || L('WiFi 接口 / 安全 / AC / 客户端', 'WiFi / security / AC / clients')) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' + status + wvMenuBtn() + '</div></div>' +
      tabsHtml(WIRELESS_SECS) +
      '<div class="tab-panel on" data-panel="' + W.section + '">' + panelBody(W.section) + '</div>' +
      '</section>' +
      '<div class="span4 rail">' + wirelessRail() + '</div></div>';
  }
  function vpnHtml() {
    const wg = rows('wireguard'), peers = rows('wgPeers'), secrets = rows('pppSecrets'), active = rows('pppActive');
    const wgOn = wg.filter(isOn).length;
    const ports = uniq(wg.map((r) => r['listen-port']).filter(Boolean));
    return pageHead(L('VPN', 'VPN'),
      esc(L('主路由', 'Main router')) + '<span class="sep"></span>WireGuard · PPP' +
      '<span class="sep"></span>' + wg.length + ' ' + esc(L('条隧道', 'tunnels')) +
      '<span class="sep"></span>' + peers.length + ' ' + esc(L('个对端', 'peers')),
      headActions(false)) +
      '<div class="grid align-start">' +
      '<div class="kpis">' + vpnKpis() + '</div>' +
      '<div class="span8 wv-main-stack">' +
      '<section class="card"><div class="card-head"><div><h2 class="card-title">' + esc(L('VPN 隧道', 'VPN tunnels')) + '</h2>' +
      '<div class="card-sub">' + esc('WireGuard · PPP · ' + wg.length + L(' 条隧道', ' tunnels') + ' · ' + peers.length + L(' 个对端', ' peers')) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px"><span class="status"><span class="dot ' + (wgOn ? 'is-green' : 'is-muted') + '"></span>' + esc(wgOn + ' ' + L('条已启用', 'enabled')) + '</span>' + wvMenuBtn() + '</div></div>' +
      '<div class="tunnel-strip">' +
      '<div class="tunnel-k"><small>' + esc(L('监听端口', 'Listen port')) + '</small><b>' + esc(ports.join(' · ') || '—') + '</b></div>' +
      '<div class="tunnel-k"><small>' + esc(L('隧道接口', 'Tunnels')) + '</small><b>' + wg.length + '</b></div>' +
      '<div class="tunnel-k"><small>' + esc(L('对端', 'Peers')) + '</small><b>' + peers.length + '</b></div>' +
      '<div class="tunnel-k"><small>' + esc(L('PPP 账号', 'PPP secrets')) + '</small><b>' + secrets.length + '</b></div>' +
      '<span class="badge ' + (wgOn ? 'allow' : 'neutral') + '">' + esc(wgOn ? L('隧道已启用', 'Tunnels enabled') : L('未启用', 'Disabled')) + '</span></div>' +
      tabsHtml(VPN_SECS) +
      '<div class="tab-panel on" data-panel="' + W.section + '">' + panelBody(W.section) + '</div>' +
      '</section>' +
      vpnChart() +
      '</div>' +
      '<div class="span4 rail">' + vpnRail() + '</div></div>';
  }
  function queueHtml() {
    const sq = rows('simpleQueues'), qt = rows('queueTree'), all = sq.concat(qt);
    const on = all.filter(isOn).length;
    const limited = all.filter((r) => !!r['max-limit']).length;
    const cap = queueMaxLimit(all);
    const capLabel = cap ? (cap >= 1000 ? Math.round(cap / 100) / 10 + ' Gbps' : Math.round(cap * 10) / 10 + ' Mbps') : '—';
    /* 用量摘要（设计稿样式）：实时 WAN 速率 / 队列最高限速；API 不返回队列级速率时只展示真实 WAN 值 */
    const live = queueLiveMbps();
    const useG = cap >= 1000;
    const liveVal = live == null ? null : (useG ? live / 1000 : live);
    const liveBig = liveVal == null ? '—' : liveVal.toFixed(useG ? 2 : 1);
    const liveUnit = useG ? 'Gbps' : 'Mbps';
    const livePct = (live != null && cap > 0) ? Math.min(100, Math.round(live / cap * 100)) : 0;
    const remainVal = (live != null && cap > 0) ? Math.max(0, (useG ? cap / 1000 : cap) - liveVal) : null;
    const remainTxt = remainVal == null ? '—' : remainVal.toFixed(useG ? 2 : 1) + ' ' + liveUnit;
    const liveTxt = liveVal == null ? '—' : liveVal.toFixed(useG ? 2 : 1) + ' ' + liveUnit;
    return pageHead(L('带宽控制', 'Bandwidth control'),
      esc(L('主路由', 'Main router')) + '<span class="sep"></span>HTB<span class="sep"></span>' + all.length + ' ' + esc(L('个队列', 'queues')) +
      '<span class="sep"></span>' + limited + ' ' + esc(L('条已限速', 'limited')),
      headActions(false)) +
      '<div class="grid align-start">' +
      '<div class="kpis">' + queueKpis() + '</div>' +
      '<section class="card span8"><div class="card-head"><div><h2 class="card-title">' + esc(L('带宽整形', 'Bandwidth shaping')) + '</h2>' +
      '<div class="card-sub">' + esc(L('HTB 分层令牌桶 · 简单队列 + 队列树', 'HTB · simple queues + queue tree')) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px"><span class="status"><span class="dot ' + (on ? 'is-green' : 'is-muted') + '"></span>' + esc(on ? L('策略生效', 'Active') : L('未启用', 'Inactive')) + '</span>' + wvMenuBtn() + '</div></div>' +
      '<div class="bw-summary"><div class="usage-summary"><b>' + liveBig + '</b><span>' + esc(liveUnit + ' / ' + capLabel) + '</span>' +
      '<span class="badge info" style="margin-left:auto">' + livePct + '%</span></div>' +
      '<div class="usage-bar" style="height:7px;margin:10px 0 8px"><i style="width:' + livePct + '%;background:var(--v2-accent)"></i></div>' +
      '<div class="bw-legend"><span><i style="background:var(--v2-accent)"></i>' + esc(L('当前流量 ', 'Current ') + liveTxt) + '</span>' +
      '<span><i style="background:var(--v2-line)"></i>' + esc(L('剩余 ', 'Remaining ') + remainTxt) + '</span>' +
      '<span style="margin-left:auto">' + esc(all.length + L(' 条队列 · ', ' queues · ') + limited + L(' 条已限速', ' limited')) + '</span></div></div>' +
      tabsHtml(QUEUE_SECS) +
      '<div class="tab-panel on" data-panel="' + W.section + '">' + panelBody(W.section) + '</div>' +
      '</section>' +
      '<div class="span4 rail">' + queueRail() + '</div></div>';
  }
  function html() {
    return W.group === 'wireless' ? wirelessHtml() : W.group === 'vpn' ? vpnHtml() : queueHtml();
  }

  /* ---------- 绘制与事件 ---------- */
  function bindSearch() {
    const s = $('wvSearch');
    if (!s) return;
    s.value = W.q;
    s.oninput = () => {
      W.q = s.value;
      repaintPanel();
      const n = $('wvSearch');
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    };
  }
  function repaintPanel() {
    const host = document.querySelector('.ui-v2 .content.pg-wvn .tab-panel');
    if (!host) return;
    host.innerHTML = panelBody(W.section);
    bindSearch();
  }
  function scrollActiveTab() {
    const bar = document.querySelector('.ui-v2 .content.pg-wvn .panel-tabs');
    const on = bar && bar.querySelector('.panel-tab.on');
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth || W.scrolledTab === W.section) return;
    /* 分类较多：切换时把当前 tab 居中，后面的分类随之进入可视区；定时刷新不重复滚动 */
    W.scrolledTab = W.section;
    const br = bar.getBoundingClientRect(), or = on.getBoundingClientRect();
    bar.scrollLeft = Math.max(0, bar.scrollLeft + (or.left - br.left) - (br.width - or.width) / 2);
  }
  function paint() {
    const c = $('content');
    if (!c || !groupOf(state.section)) return;
    c.className = 'content dash pg-wvn';
    c.innerHTML = html();
    bindSearch();
    scrollActiveTab();
  }

  /* 导出真实数据 CSV */
  function wvMenuBtn() {
    return '<button class="btn icon-only" type="button" data-act="wv-menu" title="' + esc(L('表格选项', 'Table options')) + '" aria-label="' + esc(L('表格选项', 'Table options')) + '">' + ic('more') + '</button>';
  }
  function openCardMenu(anchor) {
    const u = window.UI; if (!u || !u.openMenu) return;
    const compact = document.body.classList.contains('ui-compact');
    u.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前分类真实数据', 'CSV · current section data'), icon: 'i-download', action: () => exportCsv() },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        say(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: '<div class="ui-menu-head"><b>' + esc(L('表格选项', 'Table options')) + '</b><small>' + esc(tabLabel(W.section)) + '</small></div>' });
  }
  function exportCsv() {
    const secs = secsOf(W.group), lines = [];
    secs.forEach((s) => {
      const fs = fieldsOf(s).filter((f) => f.key !== '.id');
      lines.push('# ' + secTitle(s) + ' (' + secPath(s) + ')');
      lines.push(fs.map((f) => L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key)).join(','));
      rows(s).forEach((r) => lines.push(fs.map((f) => '"' + String(r[f.key] == null ? '' : r[f.key]).replace(/"/g, '""') + '"').join(',')));
      lines.push('');
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ros-' + W.group + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(L('已导出当前分类真实数据', 'Exported live section data'), 'ok');
  }

  function openSingleton(sec) {
    const r = rows(sec)[0];
    if (!canWrite(sec)) return say(L('此分类为只读', 'Read-only section'), 'warn');
    if (r) return openEdit(sec, r['.id']);
    const u = window.UI;
    if (!u || !u.openForm) return;
    u.openForm({ title: L('初始化配置', 'Initialize') + ' · ' + secTitle(sec), sub: secPath(sec), fields: formFields(sec, null, true),
      onSubmit: async (v) => {
        try { await write(sec, 'add', [], submitValues(sec, v)); say(L('已保存', 'Saved'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
      } });
  }
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !groupOf(state.section)) return;
    const a = el.dataset.act;
    if (a === 'wv-tab') {
      const t = el.dataset.tab;
      if (secsOf(W.group).indexOf(t) < 0) return;
      W.q = ''; W.chip = 'all';
      if (t !== state.section && typeof navigate === 'function') navigate(t);
      else { W.section = t; paint(); }
      return;
    }
    if (a === 'wv-scan') { openScanDialog(); return; }
    if (a === 'wv-chip') { W.chip = el.dataset.chip || 'all'; repaintPanel(); return; }
    if (a === 'wv-refresh') { loadAll(true); return; }
    if (a === 'wv-menu') { openCardMenu(el); return; }
    if (a === 'wv-add') { openAdd(W.section); return; }
    if (a === 'wv-rule-edit') { if (el.dataset.sec && el.dataset.id) openEdit(el.dataset.sec, el.dataset.id); return; }
    if (a === 'wv-more') { rowMenu(el.dataset.sec || W.section, el.dataset.id, el); return; }
    if (a === 'wv-singleton-edit') { openSingleton(el.dataset.sec || W.section); return; }
  }

  function install() {
    if (window.__wirelessVpnV3Installed) return;
    window.__wirelessVpnV3Installed = true;
    const content = $('content');
    if (content) content.addEventListener('click', onClick);
    if (typeof window.renderPage === 'function') {
      const orig = window.renderPage;
      window.renderPage = function () {
        const r = orig.apply(this, arguments);
        if (ALL_SECS.indexOf(state.section) >= 0) {
          const g = groupOf(state.section);
          if (W.group !== g) { W.group = g; W.section = state.section; W.q = ''; W.chip = 'all'; }
          else {
            if (W.section !== state.section) { W.q = ''; W.chip = 'all'; }
            W.section = state.section;
          }
          paint();
          loadAll(false);
        }
        return r;
      };
    }
    if (ALL_SECS.indexOf(state.section) >= 0 && $('content')) {
      W.group = groupOf(state.section); W.section = state.section;
      paint(); loadAll(false);
    }
    setInterval(() => { if (ALL_SECS.indexOf(state.section) >= 0 && !document.hidden) loadAll(true); }, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
