'use strict';
/* ============================================================
   Routing & Firewall v3 · 路由 / 防火墙（设计稿 routing.html + firewall.html）
   - 仅处理 section：routes / ipv6Routes 与
     firewallFilter / firewallNat / firewallMangle / servicePorts /
     firewall6Filter / firewall6Mangle / servicePorts6
     （addressLists / addressLists6 仅保留数据读取，不再出现在 tab）
   - 数据全部来自 /api/config?section=<id>，写入 /api/config（POST）
   - 表单字段由 state.schema.sections[*].fields 动态生成
   - 路由表每页 8 行、按设计稿展示 类型(WAN/LAN/WG/LO) 与 路由类型(直连/静态/动态)；
     策略页由真实 routing-table / comment 派生，所有分类均来自真实数据，不编造
   - 下一跳探测：优先 /api/config?section=routeNextHop，缺失时基于 routes
     gateway 状态 + netwatch + /api/link-quality
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ex = esc;
  const ic = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const boolOn = (v) => v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
  const uniq = (arr) => arr.filter((x, i) => x && arr.indexOf(x) === i);

  const ROUTE_SECS = ['routes', 'ipv6Routes'];
  const FIREWALL_SECS = [
    'firewallFilter', 'firewallNat', 'firewallMangle', 'servicePorts',
    'firewall6Filter', 'firewall6Mangle', 'servicePorts6',
  ];
  const FW4 = ['firewallFilter', 'firewallNat', 'firewallMangle'];
  const FW6 = ['firewall6Filter', 'firewall6Mangle'];
  const POLICY_SEC = '__policy';     /* 虚拟 tab：由真实路由派生，不写库 */
  const PORTS_SEC = '__ports';       /* 虚拟 tab：IPv4 + IPv6 服务端口 */
  const ALL_SECS = ROUTE_SECS.concat(FIREWALL_SECS);
  const PAGE_SIZE = 12; /* 策略规则卡片每页 12 行，与设计稿一致 */
  const ROUTE_PAGE_SIZE = 20;
  const pageSize = (sec) => (sec === 'routes' || sec === 'ipv6Routes' || sec === POLICY_SEC ? ROUTE_PAGE_SIZE : PAGE_SIZE);
  const ROUTE_KIND = {
    connected: [L('直连', 'Connected'), 'info'],
    static: [L('静态', 'Static'), 'neutral'],
    dynamic: [L('动态', 'Dynamic'), 'policy'],
    policy: [L('策略', 'Policy'), 'policy'],
  };
  const FALLBACK = {
    routes: ['路由表', 'Routes'], ipv6Routes: ['IPv6 路由', 'IPv6 routes'],
    firewallFilter: ['过滤规则', 'Filter rules'], firewallNat: ['NAT 规则', 'NAT rules'],
    firewallMangle: ['Mangle 规则', 'Mangle rules'],
    servicePorts: ['服务端口', 'Service ports'], firewall6Filter: ['IPv6 过滤规则', 'IPv6 filter rules'],
    firewall6Mangle: ['IPv6 Mangle 规则', 'IPv6 mangle rules'],
    servicePorts6: ['IPv6 服务端口', 'IPv6 service ports'],
  };
  const NH_KEY = () => 'rosCenter.routeNextHop.' + (state.deviceId || '');

  const R = {
    group: '', section: '', q: '', chip: 'all', data: {}, err: {}, loadedAt: 0,
    loadedGroup: '', loading: false, interfaces: [], interfaceRows: [],
    ipAddresses: [], ipv6Addresses: [],
    page: 1, fwTab: 'v4', lastNavSection: '',
    cache: null, nextHop: null, netwatch: [], qualityRows: [], logs: [],
  };

  /* ---------- 基础工具 ---------- */
  function groupOf(sec) {
    if (ROUTE_SECS.indexOf(sec) >= 0 || sec === POLICY_SEC) return 'routes';
    if (FIREWALL_SECS.indexOf(sec) >= 0 || sec === PORTS_SEC) return 'firewall';
    return '';
  }
  function secsOf(group) { return group === 'routes' ? ROUTE_SECS : FIREWALL_SECS; }
  function sectionDef(sec) {
    return (state.schema && state.schema.sections || []).find((s) => s.id === sec) || null;
  }
  function fieldsOf(sec) {
    const d = sectionDef(sec);
    return (d && Array.isArray(d.fields)) ? d.fields : [];
  }
  function secTitle(sec) {
    const d = sectionDef(sec), f = FALLBACK[sec] || [sec, sec];
    if (d && d.title) {
      let zh = String(d.title.zh || ''), en = String(d.title.en || '');
      /* schema 标题带「IPv4」，本页 tab 按需求去掉 IPv4 前缀 */
      if (sec === 'firewallFilter' || sec === 'firewallNat' || sec === 'firewallMangle' || sec === 'servicePorts') {
        zh = zh.replace(/^IPv4\s*/i, '');
        en = en.replace(/^IPv4\s*/i, '');
      }
      return L(zh, en);
    }
    return L(f[0], f[1]);
  }
  function secPath(sec) { const d = sectionDef(sec); return d && d.path || ''; }
  function canWrite(sec) { const d = sectionDef(sec); return !!d && d.writable !== false && !d.readonly; }
  function canToggle(sec) { const d = sectionDef(sec); return canWrite(sec) && !!d && d.toggle !== false; }
  function rows(sec) { return R.data[sec] || []; }
  function realSec(sec, r) { return (r && r._sec) || (sec === PORTS_SEC ? 'servicePorts' : sec); }
  /* 策略 tab 与端口 tab 的派生行带 _sec，写回时指向真实 section */
  function rowsFor(sec) {
    if (sec === POLICY_SEC) {
      return ROUTE_SECS.reduce((a, s) => a.concat(rows(s).map((r) => Object.assign({ _sec: s }, r))), [])
        .filter((r) => {
          const t = String(r['routing-table'] || r.table || '');
          const c = String(r.comment || '');
          return (t && t.toLowerCase() !== 'main') || /策略|policy/i.test(c);
        });
    }
    if (sec === PORTS_SEC) {
      return rows('servicePorts').map((r) => Object.assign({ _sec: 'servicePorts', _ip: 4 }, r))
        .concat(rows('servicePorts6').map((r) => Object.assign({ _sec: 'servicePorts6', _ip: 6 }, r)));
    }
    return rows(sec);
  }
  function findRow(sec, id) { return rowsFor(sec).find((r) => String(r['.id']) === String(id)) || null; }
  function isOn(r) { return !boolOn(r && r.disabled); }
  function isDefault(r) { const d = String((r && r['dst-address']) || ''); return d === '0.0.0.0/0' || d === '::/0'; }
  function routeActive(r) { return isOn(r) && !boolOn(r && r.inactive) && !boolOn(r && r.unusable); }

  /* ---------- 路由语义：类型 / 路由类型，全部从真实字段派生 ---------- */
  function isIfaceName(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || s === '-' || s === '—' || /\s/.test(s) || s.indexOf('%') >= 0) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}(\/\d+)?$/.test(s)) return false;      /* IPv4 */
    if (/^[0-9a-fA-F:]+(\/\d+)?$/.test(s) && s.indexOf(':') >= 0) return false; /* IPv6 */
    return true;
  }
  function ip6ToBig(v) {
    const raw = String(v || '').split('%')[0].trim();
    if (raw.indexOf(':') < 0) return null;
    const halves = raw.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = 8 - head.length - tail.length;
    if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
    const parts = head.concat(new Array(halves.length === 2 ? fill : 0).fill('0'), tail);
    let n = 0n;
    for (const p of parts) {
      if (!/^[0-9a-f]{0,4}$/i.test(p)) return null;
      n = (n << 16n) | BigInt(parseInt(p || '0', 16));
    }
    return n;
  }
  function ipv6InCidr(ip, cidr) {
    const raw = String(cidr || '');
    const slash = raw.lastIndexOf('/');
    const base = slash >= 0 ? raw.slice(0, slash) : raw;
    const len = slash >= 0 ? Number(raw.slice(slash + 1)) : 128;
    const a = ip6ToBig(ip), b = ip6ToBig(base);
    if (a == null || b == null || !Number.isFinite(len) || len < 0 || len > 128) return false;
    const shift = BigInt(128 - len);
    return (a >> shift) === (b >> shift);
  }
  function ipv4InCidr(ip, cidr) {
    const net = cidr4Network(cidr);
    if (!net) return false;
    const p = Number(String(net).split('/')[1]);
    return cidr4Network(String(ip).split('%')[0] + '/' + p) === net;
  }
  function cidr4Network(addr) {
    const parts = String(addr || '').split('/');
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(parts[0] || '')) return '';
    const p = Number(parts[1] == null || parts[1] === '' ? 32 : parts[1]);
    if (!Number.isFinite(p) || p < 0 || p > 32) return '';
    const b = parts[0].split('.').map(Number);
    const ip = (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
    const mask = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
    const n = (ip & mask) >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.') + '/' + p;
  }
  /* 连接路由经常只有 dst-address，没有 interface / gateway；用真实 IP 地址表反查接口 */
  function routeIface(r) {
    let name = String((r && (r.interface || r['gateway-interface'])) || '');
    const gwRaw = String((r && r.gateway) || '');
    const gwParts = gwRaw.split('%');
    const gwSuffix = gwParts.length > 1 ? gwParts.slice(1).join('%') : '';
    if (!name && gwSuffix && isIfaceName(gwSuffix)) name = gwSuffix;
    if (!name) {
      const im = String((r && r['immediate-gw']) || '');
      const imParts = im.split('%');
      const imSuffix = imParts.length > 1 ? imParts.slice(1).join('%') : '';
      if (imSuffix && isIfaceName(imSuffix)) name = imSuffix;
      else if (isIfaceName(im)) name = im;
    }
    if (!name) {
      /* RouterOS 常带 gateway-status="10.0.1.1 reachable via ether1" */
      const m = String((r && r['gateway-status']) || '').match(/\bvia\s+(\S+)/i);
      if (m && isIfaceName(m[1])) name = m[1];
    }
    if (!name && isIfaceName(gwRaw)) name = gwRaw;
    if (!name) {
      /* 网关 IP 落在本机某个网段 → 该网段接口（设计稿 IP 在上、网口在下） */
      const gw = gwParts[0].trim();
      if (gw) {
        const is6 = gw.indexOf(':') >= 0;
        const hit = (is6 ? R.ipv6Addresses : R.ipAddresses).find((a) => {
          const cidr = String(a.address || '');
          return is6 ? ipv6InCidr(gw, cidr) : ipv4InCidr(gw, cidr);
        });
        if (hit && hit.interface) name = hit.interface;
      }
    }
    if (!name) {
      const dst = String((r && r['dst-address']) || '');
      const is6 = dst.indexOf(':') >= 0;
      const list = is6 ? R.ipv6Addresses : R.ipAddresses;
      const net = dst.split('/')[0];
      let hit = list.find((a) => {
        const n = String(a.network || '');
        return n === dst || (net && n === net);
      });
      if (!hit) hit = list.find((a) => cidr4Network(a.address) === dst);
      if (!hit) hit = list.find((a) => String(a.address || '').split('/')[0] === net);
      name = hit && hit.interface ? hit.interface : '';
    }
    return String(name || '');
  }
  function ifaceKind(name) {
    const s = String(name || '').trim();
    if (!s) return '—';
    const meta = R.interfaceRows.find((x) => String(x.name || '') === s);
    const hint = meta ? String(meta.comment || meta.type || '') : '';
    const text = (s + ' ' + hint).toLowerCase();
    if (/^lo\b|^loopback\b|\bloopback\b/.test(text)) return 'LO';
    if (/\b(wg\d*|wireguard|tailscale|zerotier|ovpn|openvpn|l2tp|pptp|ipsec|vpn|tun\d*|tap\d*)\b/.test(text)) return 'WG';
    if (/\b(pppoe\S*|pppo|wan\d*|uplink|ether1|sfp1|eth0|vlan\S*wan)\b/.test(text)) return 'WAN';
    if (/\b(bridge\S*|br\d*|lan\d*|ether\d*|eth\d*|vlan\d*|docker\S*|veth\S*|bond\S*|wlan\d*|wifi\S*)\b/.test(text)) return 'LAN';
    return '—';
  }
  function routeKindKey(r) {
    if (!r) return 'static';
    const flags = String(r.flags || '').toUpperCase();
    const table = String(r['routing-table'] || 'main');
    const comment = String(r.comment || '');
    const gw = String(r.gateway || '');
    const dist = Number(r.distance == null ? 0 : r.distance);
    const isStatic = boolOn(r.static);
    const isDynamic = boolOn(r.dynamic);
    if ((table && table.toLowerCase() !== 'main') || /策略|policy/i.test(comment)) return 'policy';
    if (isStatic || /S/.test(flags)) return 'static';            /* RouterOS static=true 或 flags S */
    if (isDynamic) {
      /* dynamic=true 且网关是接口、distance=0：直连；否则（如 PPPoE 默认路由）动态 */
      return (!isDefault(r) && (dist === 0 || isIfaceName(gw))) ? 'connected' : 'dynamic';
    }
    if (/O|B|R|M|A/.test(flags)) return 'dynamic';              /* 动态路由协议 */
    if (/D/.test(flags)) return isIfaceName(gw) || dist === 0 ? 'connected' : 'dynamic';
    if (isIfaceName(gw)) return 'connected';                   /* 纯接口网关：直连 */
    if (gw && dist > 0) return 'static';                       /* IP 网关 + distance：静态 */
    return isDefault(r) ? 'static' : 'connected';
  }
  /* RouterOS 内置/动态规则不允许 set，编辑必须置灰只读，绝不提交 POST */
  function isBuiltinRow(sec, r) {
    if (!r) return false;
    const s = realSec(sec, r);
    if (boolOn(r.builtin) || boolOn(r.dynamic) || boolOn(r.invalid)) return true;
    /* RouterOS 常用 flags 表达内置/动态：B=builtin、D=dynamic，set 会报 cannot change builtin */
    if (/[BD]/.test(String(r.flags || '').toUpperCase())) return true;
    if (/^servicePorts/.test(s)) return true;
    return /内置|builtin/i.test(String(r.comment || ''));
  }
  function rowLabel(sec, r) {
    if (!r) return secTitle(sec);
    return String(r.comment || r.name || r['dst-address'] || r.list || r.address || r.chain || r.action || r['.id'] || secTitle(sec));
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
  function statusDot(on, zh, en, offZh, offEn) {
    return `<span class="dot ${on ? 'is-green' : 'is-muted'}"></span>${esc(on ? L(zh, en) : L(offZh || '未启用', offEn || 'Inactive'))}`;
  }
  function kvRow(k, v, cls) {
    return `<div class="kv"><span>${esc(k)}</span><b class="${cls || ''}">${esc(v == null || v === '' ? '—' : v)}</b></div>`;
  }
  function miniCard(title, sub, body, badge) {
    return `<section class="card"><div class="card-head"><div><h2 class="card-title">${esc(title)}</h2><div class="card-sub">${esc(sub)}</div></div>${badge || ''}</div><div class="rail-body">${body}</div></section>`;
  }

  /* ---------- 真实数据读取 ---------- */
  async function loadRouteExtras() {
    /* 优先读取专用节；不存在时忽略，下面按 routes gateway + netwatch 派生 */
    try {
      const d = await api('/api/config?section=routeNextHop');
      const list = (d && d.rows) || [];
      if (list.length) {
        const r0 = list[0] || {};
        const raw = r0.hit != null ? r0.hit : (r0['cache-hit'] != null ? r0['cache-hit'] : r0['hit-rate']);
        R.cache = raw == null ? null : { hit: parseFloat(String(raw)) };
        R.nextHop = { rows: list };
      }
    } catch (e) { /* 该 section 未部署：使用回退数据 */ }
    try {
      const d = await api('/api/config?section=netwatch');
      R.netwatch = (d && d.rows) || [];
    } catch (e) { R.netwatch = []; }
    try {
      const d = await api('/api/link-quality?mode=netwatch');
      R.qualityRows = (d && d.rows) || [];
      if (!R.nextHop && R.qualityRows.length) R.nextHop = { rows: R.qualityRows };
    } catch (e) { R.qualityRows = []; }
    /* 连接路由反查接口 + 接口备注识别 WAN/LAN/WG：全部读取真实配置 */
    try {
      const d4 = await api('/api/config?section=ipAddresses');
      R.ipAddresses = (d4 && d4.rows) || [];
    } catch (e) { R.ipAddresses = []; }
    try {
      const d6 = await api('/api/config?section=ipv6Addresses');
      R.ipv6Addresses = (d6 && d6.rows) || [];
    } catch (e) { R.ipv6Addresses = []; }
  }
  async function loadAll(force) {
    const g = groupOf(state.section);
    if (!g || R.loading) return;
    if (!force && R.loadedGroup === g && R.loadedAt && Date.now() - R.loadedAt < 8000) { safePaint(); return; }
    R.loading = true;
    const secs = secsOf(g);
    const results = await Promise.all(secs.map((s) => api('/api/config?section=' + encodeURIComponent(s)).then((d) => {
      const list = (d && d.rows) || [];
      const err = (d && d.offline && !list.length) ? L('路由器未连接，未读取到真实配置', 'Router offline - no live configuration') : '';
      return { rows: list, err };
    }).catch((e) => ({ rows: null, err: (e && e.message) || L('加载失败', 'Load failed') }))));
    secs.forEach((s, i) => {
      const res = results[i];
      if (res && res.rows) R.data[s] = res.rows;
      if (res && res.err) R.err[s] = res.err;
      else delete R.err[s];
    });
    R.loadedAt = Date.now();
    R.loadedGroup = g;
    R.loading = false;
    if (g === 'routes') await loadRouteExtras();
    if (g === 'firewall') {
      try {
        const d = await api('/api/config?section=logs');
        R.logs = (d && d.rows) || [];
      } catch (e) { R.logs = []; }
    }
    try {
      const d = await api('/api/config?section=interfaces');
      R.interfaceRows = (d && d.rows) || [];
      R.interfaces = uniq(R.interfaceRows.map((r) => r.name));
    } catch (e) { /* ignore */ }
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

  /* 链与接口匹配约束（与 server 端 sanitizeChainIfaces 一致）：切换链时实时禁用并清空不兼容的接口字段 */
  const CHAIN_NO_OUT = ['input', 'prerouting', 'dstnat'];
  const CHAIN_NO_IN = ['output', 'postrouting', 'srcnat'];
  function chainIfaceCompat(sec) {
    const keys = fieldsOf(sec).map((f) => f.key);
    if (!keys.includes('chain') || (!keys.includes('in-interface') && !keys.includes('out-interface'))) return null;
    return (m) => {
      const chain = m.querySelector('[name="chain"]');
      const inIf = m.querySelector('[name="in-interface"]');
      const outIf = m.querySelector('[name="out-interface"]');
      const apply = () => {
        const c = chain ? String(chain.value || '') : '';
        const gate = (el, dis, hint) => {
          if (!el) return;
          el.disabled = dis;
          if (dis) el.value = '';
          const wrap = el.closest('.ui-field');
          if (!wrap) return;
          wrap.classList.toggle('is-disabled', dis);
          let note = wrap.querySelector('small.compat-hint');
          if (dis) {
            if (!note) { note = document.createElement('small'); note.className = 'compat-hint'; wrap.appendChild(note); }
            note.textContent = hint;
          } else if (note) note.remove();
        };
        gate(outIf, CHAIN_NO_OUT.includes(c), L('当前链不支持出接口匹配', 'Out-interface not valid in this chain'));
        gate(inIf, CHAIN_NO_IN.includes(c), L('当前链不支持入接口匹配', 'In-interface not valid in this chain'));
      };
      if (chain) chain.addEventListener('change', apply);
      apply();
    };
  }

  /* ---------- 弹窗操作（内置规则只读） ---------- */
  function detailRows(sec, r) {
    return fieldsOf(sec).map((f) => [L(f.label && f.label.zh || f.key, f.label && f.label.en || f.key), displayValue(f, r[f.key])]);
  }
  function openView(sec, id) {
    const r = findRow(sec, id);
    if (!r) return say(L('记录不存在', 'Record not found'), 'warn');
    const u = window.UI; if (!u || !u.openModal) return;
    const rs = realSec(sec, r);
    const builtin = isBuiltinRow(sec, r);
    const actions = [];
    if (canWrite(rs) && !builtin) {
      actions.push({ label: L('编辑', 'Edit'), cls: 'primary', onClick: () => openEdit(sec, id) });
      if (canToggle(rs)) actions.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), onClick: () => toggleRow(sec, id, !isOn(r)) });
      actions.push({ label: L('删除', 'Delete'), cls: 'danger', onClick: () => openDelete(sec, id) });
    }
    actions.push({ label: L('关闭', 'Close') });
    u.openModal({
      title: rowLabel(rs, r), sub: secTitle(rs) + ' · ' + (builtin ? L('内置规则 · 只读', 'Built-in · read-only') : L('真实配置', 'live configuration')),
      body: `<div class="ui-detail">${detailRows(rs, r).map(([k, v]) => `<div class="ui-detail-row"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>`,
      actions,
    });
  }
  function openEdit(sec, id) {
    const r = findRow(sec, id);
    if (!r) return;
    const rs = realSec(sec, r);
    if (!canWrite(rs)) return;
    if (isBuiltinRow(sec, r)) return say(L('内置规则不允许编辑', 'Built-in rules cannot be edited'), 'warn');
    const u = window.UI; if (!u || !u.openForm) return;
    u.openForm({
      title: L('编辑', 'Edit') + ' · ' + rowLabel(rs, r), sub: secTitle(rs) + ' · ' + secPath(rs),
      fields: formFields(rs, r, false),
      onMount: chainIfaceCompat(rs),
      onSubmit: async (v) => {
        try { await write(rs, 'set', [id], submitValues(rs, v)); say(L('已保存', 'Saved'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
      },
    });
  }
  function openAdd(sec) {
    const rs = sec === PORTS_SEC ? 'servicePorts' : (sec === POLICY_SEC ? 'routes' : sec);
    if (!canWrite(rs)) return say(L('此分类为只读', 'Read-only section'), 'warn');
    const u = window.UI; if (!u || !u.openForm) return;
    u.openForm({
      title: L('新增', 'Add') + ' · ' + secTitle(rs), sub: secPath(rs),
      fields: formFields(rs, null, true),
      onMount: chainIfaceCompat(rs),
      onSubmit: async (v) => {
        try { await write(rs, 'add', [], submitValues(rs, v)); say(L('已添加', 'Added'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('添加失败', 'Add failed'), 'err'); }
      },
    });
  }
  function openDelete(sec, id) {
    const r = findRow(sec, id);
    if (!r) return;
    const rs = realSec(sec, r);
    if (!canWrite(rs)) return;
    if (isBuiltinRow(sec, r)) return say(L('内置规则不允许删除', 'Built-in rules cannot be deleted'), 'warn');
    const u = window.UI;
    if (!u || !u.openConfirm) {
      if (!window.confirm(L('确认删除此记录？', 'Delete this record?'))) return;
      return write(rs, 'remove', [id]).then(() => { say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }).catch((e) => say(e.message, 'err'));
    }
    u.openConfirm({
      title: L('删除记录', 'Delete record'), warningTitle: L('确认删除？', 'Delete this record?'),
      message: `<b>${esc(rowLabel(rs, r))}</b> ${L('将从 RouterOS 删除，此操作不可恢复。', 'will be removed from RouterOS. This cannot be undone.')}`,
      danger: true, confirmLabel: L('删除', 'Delete'),
      onConfirm: async () => {
        try { await write(rs, 'remove', [id]); say(L('已删除', 'Deleted'), 'ok'); loadAll(true); }
        catch (e) { say((e && e.message) || L('删除失败', 'Delete failed'), 'err'); }
      },
    });
  }
  function toggleRow(sec, id, enable) {
    const r = findRow(sec, id);
    if (!r || isBuiltinRow(sec, r)) return;
    const rs = realSec(sec, r);
    write(rs, enable ? 'enable' : 'disable', [id]).then(() => {
      say(enable ? L('已启用', 'Enabled') : L('已禁用', 'Disabled'), 'ok');
      loadAll(true);
    }).catch((e) => say((e && e.message) || L('操作失败', 'Action failed'), 'err'));
  }
  function rowMenu(sec, id, anchor) {
    const r = findRow(sec, id);
    if (!r) return;
    const rs = realSec(sec, r);
    const builtin = isBuiltinRow(sec, r);
    const items = [{ label: L('查看', 'View'), action: () => openView(sec, id) }];
    if (canWrite(rs) && !builtin) {
      items.push({ label: L('编辑', 'Edit'), action: () => openEdit(sec, id) });
      if (canToggle(rs)) items.push({ label: isOn(r) ? L('禁用', 'Disable') : L('启用', 'Enable'), action: () => toggleRow(sec, id, !isOn(r)) });
      items.push({ sep: true }, { label: L('删除', 'Delete'), danger: true, action: () => openDelete(sec, id) });
    } else if (builtin) {
      items.push({ sep: true }, { label: L('编辑（内置规则只读）', 'Edit (built-in, read-only)'), disabled: true });
    }
    const u = window.UI;
    if (!u || !u.openMenu) return;
    u.openMenu(anchor, items, { head: `<div class="ui-menu-head"><b>${esc(rowLabel(rs, r))}</b><small>${esc(secTitle(rs))}${builtin ? ' · ' + esc(L('内置', 'Built-in')) : ''}</small></div>` });
  }

  /* ---------- 表格列与单元格 ---------- */
  function colLabel(sec, key, fallbackZh, fallbackEn) {
    const f = fieldsOf(sec).find((x) => x.key === key);
    return f && f.label ? L(f.label.zh, f.label.en) : L(fallbackZh, fallbackEn);
  }
  function columnsFor(sec) {
    if (sec === 'routes' || sec === 'ipv6Routes' || sec === POLICY_SEC) {
      return [
        { k: 'dst-address', l: L('目标网络', 'Destination'), cls: 'addr' },
        { k: 'gateway', l: L('网关 / 接口', 'Gateway / Interface'), cls: 'gw-cell' },
        { k: '__kind', l: L('类型', 'Type'), cls: 'pill-cell' },
        { k: 'distance', l: L('距离', 'Distance'), cls: 'r num' },
        { k: '__routetype', l: L('路由类型', 'Route type'), cls: 'rt-cell' },
      ];
    }
    if (/^addressLists/.test(sec)) {
      return [
        { k: 'list', l: colLabel(sec, 'list', '列表名', 'List'), cls: 'pill-cell' },
        { k: 'address', l: colLabel(sec, 'address', '地址', 'Address'), cls: 'addr' },
        { k: 'timeout', l: colLabel(sec, 'timeout', '超时', 'Timeout'), cls: 'mono' },
        { k: 'comment', l: colLabel(sec, 'comment', '备注', 'Comment'), cls: 'note' },
      ];
    }
    if (sec === PORTS_SEC || /^servicePorts/.test(sec)) {
      return [
        { k: 'name', l: colLabel(sec, 'name', '服务', 'Service'), cls: 'pill-cell' },
        { k: 'port', l: colLabel(sec, 'port', '端口', 'Port'), cls: 'mono' },
        { k: 'protocol', l: colLabel(sec, 'protocol', '协议', 'Protocol'), cls: 'mono' },
        { k: 'comment', l: colLabel(sec, 'comment', '备注', 'Comment'), cls: 'note' },
      ];
    }
    return [
      { k: '__rule', l: L('规则', 'Rule'), cls: 'rule-cell' },
      { k: 'chain', l: colLabel(sec, 'chain', '链', 'Chain'), cls: 'pill-cell' },
      { k: '__match', l: L('匹配条件', 'Match'), cls: 'mono match' },
      { k: 'action', l: colLabel(sec, 'action', '动作', 'Action'), cls: 'action-cell' },
    ];
  }
  function matchSummary(r) {
    const p = [];
    if (r['src-address']) p.push('src=' + r['src-address']);
    if (r['dst-address']) p.push('dst=' + r['dst-address']);
    if (r.protocol) p.push(String(r.protocol));
    if (r['dst-port']) p.push('dport=' + r['dst-port']);
    if (r['in-interface']) p.push('in=' + r['in-interface']);
    if (r['out-interface']) p.push('out=' + r['out-interface']);
    if (r['to-addresses']) p.push('to=' + r['to-addresses']);
    return p.join(' · ') || L('未设置匹配条件', 'no match set');
  }
  /* 设计稿的规则副行是 “in bridge1 · out pppoe-out1” 这类易读摘要，与匹配条件列不重复 */
  function ruleHint(r) {
    const inIf = String(r['in-interface'] || '').trim();
    const outIf = String(r['out-interface'] || '').trim();
    const src = String(r['src-address'] || '').trim();
    const dst = String(r['dst-address'] || '').trim();
    const list = String(r['src-address-list'] || r['dst-address-list'] || '').trim();
    if (inIf && outIf) return inIf + ' → ' + outIf;
    if (inIf) return L('入 ', 'in ') + inIf;
    if (outIf) return L('出 ', 'out ') + outIf;
    if (src && dst) return src + ' → ' + dst;
    if (src) return src + ' → ' + L('任意', 'any');
    if (dst) return L('任意', 'any') + ' → ' + dst;
    if (list) return L('地址列表 ', 'list ') + list;
    return '';
  }
  function actionBadge(v) {
    const s = String(v || '');
    const cls = /drop|reject|deny/i.test(s) ? 'drop' : /mark|jump|return|log|passthrough|redirect/i.test(s) ? 'policy' : 'allow';
    return `<span class="badge ${cls}">${ex(s || '—')}</span>`;
  }
  function cellHtml(sec, c, r) {
    const v = r[c.k];
    const isRoute = sec === 'routes' || sec === 'ipv6Routes' || sec === POLICY_SEC;
    if (isRoute && c.k === 'gateway') {
      /* 设计稿：IP 网关在上、接口灰色在下；只有接口时直接显示接口，不再出现 “–” */
      const raw = String(v == null ? '' : v).trim();
      const iface = routeIface(r);
      const gwDisp = raw.indexOf('%') > 0 ? raw.split('%')[0] : raw;
      const gw = gwDisp && !isIfaceName(gwDisp) ? gwDisp : '';
      const main = gw || iface || (raw && raw !== '-' ? raw : '—');
      const sub = gw && iface && iface !== gw ? iface : '';
      return `<span class="cell"><b class="mono">${ex(main)}</b><small>${ex(sub)}</small></span>`;
    }
    if (isRoute && c.k === '__kind') {
      const kind = ifaceKind(routeIface(r));
      return `<span class="chain net-kind" title="${esc(L('接口类型', 'Interface type'))}">${esc(kind)}</span>`;
    }
    if (isRoute && c.k === '__routetype') {
      const key = routeKindKey(r);
      return `<span class="badge ${key}">${esc(ROUTE_KIND[key][0])}</span>`;
    }
    if (c.k === '__rule') {
      const title = r.comment || r.action || r.chain || r['.id'] || '—';
      const off = /^firewall/.test(sec) && !isOn(r);
      const hint = ruleHint(r);
      return `<div class="cell"><b>${ex(title)}</b><small>${off ? `<span class="badge neutral">${esc(L('禁用', 'Disabled'))}</span> ` : ''}${ex(hint)}</small></div>`;
    }
    if (c.k === '__match') return `<span class="match">${ex(matchSummary(r))}</span>`;
    if (c.k === 'action') return actionBadge(v);
    if (c.k === 'chain' || c.k === 'list' || c.k === 'name' || (isRoute && c.k === 'routing-table'))
      return `<span class="chain">${ex(v == null || v === '' ? '—' : v)}</span>`;
    if (c.k === 'dst-address' || c.k === 'address') return `<span class="addr">${ex(v || '—')}</span>`;
    if (c.k === 'distance' || c.k === 'port') return `<span class="num">${ex(v == null || v === '' ? '—' : v)}</span>`;
    return `<span>${ex(v == null || v === '' ? '—' : v)}</span>`;
  }
  function chipsFor(sec) {
    const rs = rowsFor(sec), out = [['all', L('全部', 'All'), rs.length]];
    if (R.group === 'routes') {
      /* 设计稿路由页：按真实路由类型筛选，而不是按启用状态 */
      ['connected', 'static', 'dynamic'].forEach((k) => {
        out.push([k, ROUTE_KIND[k][0], rs.filter((r) => routeKindKey(r) === k).length]);
      });
    } else if (sec === PORTS_SEC) {
      out.push(['on', L('已启用', 'Enabled'), rs.filter(isOn).length]);
      out.push(['off', L('已禁用', 'Disabled'), rs.filter((r) => !isOn(r)).length]);
    }
    return out;
  }
  function fwKindOf(sec) {
    if (/Nat$/.test(sec)) return 'nat';
    if (/Mangle$/.test(sec)) return 'mangle';
    return 'filter';
  }
  function fwKindSecs() {
    return R.fwTab === 'v6' ? FW6 : FW4;
  }
  function fwKindChipsHtml() {
    return `<div class="chips">${fwKindSecs().map((s) =>
      `<button class="chip ${R.section === s ? 'on' : ''}" type="button" data-act="rf-fw-kind" data-section="${ex(s)}">${esc(fwKindLabel(s))} <b>${rows(s).length}</b></button>`).join('')}</div>`;
  }
  function filteredRows(sec) {
    let rs = rowsFor(sec).slice();
    if (R.chip === 'on') rs = rs.filter(isOn);
    else if (R.chip === 'off') rs = rs.filter((r) => !isOn(r));
    else if (ROUTE_KIND[R.chip]) rs = rs.filter((r) => routeKindKey(r) === R.chip);
    const q = R.q.trim().toLowerCase();
    if (q) rs = rs.filter((r) => Object.keys(r).some((k) => String(r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0));
    return rs;
  }
  function noteFor(sec) {
    if (sec === 'routes') return L('默认路由', 'Default routes') + ' ' + rows('routes').filter(isDefault).length + ' ' + L('条', '');
    if (sec === 'ipv6Routes') return L('默认路由', 'Default routes') + ' ' + rows('ipv6Routes').filter(isDefault).length + ' ' + L('条', '');
    if (sec === POLICY_SEC) return L('按源地址 / 自定义路由表匹配', 'By source / custom table');
    if (sec === PORTS_SEC) return L('协议 / 端口', 'Protocol / port');
    if (/Filter$/.test(sec)) return L('按链顺序执行', 'Evaluated by chain');
    if (/Nat$/.test(sec)) return L('源地址 / 目标地址转换', 'Source / destination NAT');
    if (/Mangle$/.test(sec)) return L('标记与路由调整', 'Marking and route adjustment');
    return L('共', 'Total') + ' ' + rowsFor(sec).length + ' ' + L('条', 'entries');
  }
  function toolbarHtml(sec) {
    /* 路由页 chip = 全部 / 直连 / 静态 / 动态；
       防火墙规则 chip = 过滤 / NAT / Mangle（当前 IPv4 或 IPv6），服务端口为 全部 / 已启用 / 已禁用 */
    const chips = R.group === 'firewall' && sec !== PORTS_SEC
      ? fwKindChipsHtml()
      : `<div class="chips">${chipsFor(sec).map(([v, label, count]) => `<button class="chip ${v === R.chip ? 'on' : ''}" type="button" data-act="rf-chip" data-chip="${ex(v)}">${esc(label)} <b>${count}</b></button>`).join('')}</div>`;
    return `<div class="toolbar">
      <label class="field">${ic('search')}<input id="rfSearch" placeholder="${esc(L('搜索目标网络、规则或地址…', 'Search destination, rule or address…'))}" aria-label="${esc(L('搜索', 'Search'))}"></label>
      ${chips}
      <span class="spacer"></span>
      <span class="toolbar-note">${esc(noteFor(sec))}</span>
      ${canWrite(sec) ? `<button class="btn" type="button" data-act="rf-add" title="${esc(L('新增当前分类', 'Add in current section'))}">${ic('plus')}${esc(L('新增', 'Add'))}</button>` : ''}
    </div>`;
  }
  function tableHtml(sec) {
    const all = filteredRows(sec), cols = columnsFor(sec), isFw = R.group === 'firewall';
    const isRoute = sec === 'routes' || sec === 'ipv6Routes' || sec === POLICY_SEC;
    const size = pageSize(sec);
    const pages = Math.max(1, Math.ceil(all.length / size));
    if (R.page > pages) R.page = pages;
    if (R.page < 1) R.page = 1;
    const rs = all.slice((R.page - 1) * size, R.page * size);
    const statusLabel = L('状态', 'Status');
    const showStatus = !isFw || sec === PORTS_SEC;
    const head = `${isFw ? '<th>#</th>' : ''}${cols.map((c) => `<th class="${c.cls === 'r num' ? 'r' : ''}">${esc(c.l)}</th>`).join('')}${showStatus ? `<th>${esc(statusLabel)}</th>` : ''}<th></th>`;
    const body = rs.map((r, i) => {
      const builtin = isBuiltinRow(sec, r);
      const active = isRoute ? routeActive(r) : isOn(r);
      const state = isRoute
        ? (active ? L('活跃', 'Active') : L('非活跃', 'Inactive'))
        : (active ? L('启用', 'Enabled') : L('禁用', 'Disabled'));
      return `<tr class="${builtin ? 'is-builtin' : ''}">
        ${isFw ? `<td class="mono idx">${String((R.page - 1) * size + i + 1).padStart(2, '0')}</td>` : ''}
        ${cols.map((c) => `<td class="${ex(c.cls)}" data-label="${esc(c.l)}">${cellHtml(sec, c, r)}</td>`).join('')}
        ${showStatus ? `<td data-label="${esc(statusLabel)}"><span class="status"><span class="dot ${active ? 'is-green' : 'is-muted'}"></span>${esc(state)}</span></td>` : ''}
        <td><button class="row-more" type="button" data-act="rf-more" data-sec="${ex(sec)}" data-id="${ex(r['.id'] || '')}" data-label="${ex(rowLabel(realSec(sec, r), r))}" title="${builtin ? esc(L('内置规则只读', 'Built-in, read-only')) : esc(L('更多', 'More'))}">${ic('more')}</button></td>
      </tr>`;
    }).join('');
    const emptyRow = `<tr><td colspan="${cols.length + (isFw ? 1 : 0) + (showStatus ? 1 : 0) + 1}" style="text-align:center;color:var(--v2-faint);padding:28px">${esc(L('暂无数据', 'No data'))}</td></tr>`;
    const widths = isRoute
      ? ['22%', '24%', '13%', '10%', '13%', '12%', '']
      : (isFw && /^firewall/.test(sec) ? ['5%', '26%', '10%', '38%', '11%', ''] : null);
    const colgroup = widths ? `<colgroup>${widths.map((w) => `<col${w ? ` style="width:${w}"` : ''}>`).join('')}</colgroup>` : '';
    const pager = pages > 1
      ? `<span class="dh-pager"><button class="btn icon-only dh-prev" type="button" data-act="rf-page" data-page="${R.page - 1}" ${R.page <= 1 ? 'disabled' : ''} title="${esc(L('上一页', 'Previous'))}">${ic('chevron')}</button><span class="mono">${R.page} / ${pages}</span><button class="btn icon-only" type="button" data-act="rf-page" data-page="${R.page + 1}" ${R.page >= pages ? 'disabled' : ''} title="${esc(L('下一页', 'Next'))}">${ic('chevron')}</button></span>`
      : '';
    return `<div class="table-scroll"><table class="dt">${colgroup}<thead><tr>${head}</tr></thead><tbody>${body || emptyRow}</tbody></table></div>
      <div class="table-foot"><span>${esc(L('显示', 'Showing'))} ${all.length ? (R.page - 1) * size + 1 : 0}–${Math.min(R.page * size, all.length)} / ${esc(L('共', 'Total'))} ${all.length} ${esc(L('条', 'entries'))} · ${esc(L('更新于', 'Updated'))} ${esc(relTime(R.loadedAt))}</span>${pager}</div>`;
  }
  function panelBody(sec) {
    const notice = R.err[sec]
      ? `<div class="notice rf-notice">${ex(R.err[sec])} <button class="btn" type="button" data-act="rf-refresh">${esc(L('重试', 'Retry'))}</button></div>`
      : '';
    if (R.err[sec] && !rowsFor(sec).length) return notice;
    return notice + toolbarHtml(sec) + tableHtml(sec);
  }

  /* ---------- KPI ---------- */
  const LOG_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  /* RouterOS 日志时间：今天只有 HH:MM:SS，更早的带 mmm/dd 前缀 */
  function logTime(t) {
    const s = String(t || '').trim();
    let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) { const d = new Date(); d.setHours(+m[1], +m[2], +m[3], 0); return d; }
    m = s.match(/^([a-z]{3})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/i);
    if (m) {
      const mo = LOG_MONTHS[m[1].toLowerCase()];
      if (mo == null) return null;
      const d = new Date(); d.setFullYear(d.getFullYear(), mo, +m[2]); d.setHours(+m[3], +m[4], +m[5], 0);
      return d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function isTodayLog(d) {
    if (!d) return false;
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function blockedToday() {
    return (R.logs || []).filter((l) => {
      const tp = String(l.topics || '').toLowerCase();
      const msg = String(l.message || '');
      return /firewall/.test(tp) && /drop|reject|deny|block|invalid/i.test(msg) && isTodayLog(logTime(l.time));
    });
  }
  function blockedSpark(list) {
    if (!list || list.length < 2) return '';
    const now = new Date(), buckets = [];
    for (let i = 11; i >= 0; i--) {
      const h = new Date(now.getTime() - i * 3600e3);
      buckets.push(list.filter((l) => {
        const d = logTime(l.time);
        return d && d.getHours() === h.getHours() && d.getDate() === h.getDate();
      }).length);
    }
    const max = Math.max.apply(null, buckets.concat(1));
    const pts = buckets.map((n, i) => (3 + i * (90 / 11)).toFixed(1) + ',' + (31 - Math.round(n * 27 / max))).join(' L');
    return `<svg class="spark red" viewBox="0 0 96 34" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function fmtHits(n) { return Number(n || 0).toLocaleString('en-US'); }
  function ruleHits(r) {
    const raw = r.packets != null && r.packets !== '' ? r.packets : r.bytes;
    if (raw == null || raw === '') return null;
    const n = Number(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  function kpiCard(iconName, color, title, value, statusHtml, footLeft, footRight, sparkHtml) {
    return `<article class="card kpi"><div class="kpi-top"><span class="kpi-ico ${color}">${ic(iconName)}</span>${esc(title)}</div>
      <div class="kpi-main"><div class="kpi-num">${value}</div>${sparkHtml || `<span class="status">${statusHtml || ''}</span>`}</div>
      <div class="kpi-foot"><span>${esc(footLeft)}</span><span>${esc(footRight)}</span></div></article>`;
  }
  function routeKpis() {
    const v4 = rows('routes'), v6 = rows('ipv6Routes'), all = v4.concat(v6);
    const on = all.filter(isOn).length, defs = all.filter(isDefault);
    const gws = uniq(all.map((r) => r.gateway).filter(Boolean));
    const raw = R.cache && R.cache.hit;
    const hasCache = raw != null && Number.isFinite(Number(raw));
    return [
      kpiCard('route', 'blue', L('路由表', 'Routes'), String(all.length),
        statusDot(on > 0, '已启用', 'Enabled'),
        'IPv4 ' + v4.length + ' · IPv6 ' + v6.length,
        on + ' ' + L('启用', 'on') + ' / ' + (all.length - on) + ' ' + L('禁用', 'off')),
      kpiCard('globe', 'green', L('默认路由', 'Default routes'), String(defs.length),
        statusDot(defs.length > 0, '活跃', 'Active'),
        'IPv4 ' + v4.filter(isDefault).length + ' · IPv6 ' + v6.filter(isDefault).length,
        'distance ' + (defs.length && defs[0].distance ? defs[0].distance : '—')),
      kpiCard('conn', 'teal', L('下一跳', 'Next hops'), String(gws.length),
        statusDot(gws.length > 0, '可达', 'Reachable'),
        gws.slice(0, 2).join(' · ') || '—',
        L('个网关', 'gateways')),
      kpiCard('pulse', 'violet', L('缓存命中', 'Cache hit'),
        hasCache ? Math.round(Number(raw)) + '<span class="u pct">%</span>' : '—',
        hasCache ? statusDot(Number(raw) > 0, '正常', 'OK') : statusDot(false, '无数据', 'N/A'),
        'RouterOS',
        hasCache ? L('未命中', 'Miss') + ' ' + Math.round(100 - Number(raw)) + '%' : L('无缓存计数器', 'no cache counters')),
    ].join('');
  }
  function firewallKpis() {
    const f4 = rows('firewallFilter'), f6 = rows('firewall6Filter');
    const filters = f4.concat(f6);
    const blocked = blockedToday();
    const blockedReject = blocked.filter((l) => /reject/i.test(String(l.message || ''))).length;
    const blockedDrop = blocked.length - blockedReject;
    const nat = rows('firewallNat');
    const srcnat = nat.filter((r) => r.chain === 'srcnat').length;
    const dstnat = nat.filter((r) => r.chain === 'dstnat').length;
    const hist = (state.connHistory || []).slice(-1)[0] || null;
    const tcp = hist ? Number(hist.tcp4 || 0) + Number(hist.tcp6 || 0) : 0;
    const udp = hist ? Number(hist.udp4 || 0) + Number(hist.udp6 || 0) : 0;
    return [
      kpiCard('shield', 'blue', L('过滤规则', 'Filter rules'), String(filters.length),
        statusDot(filters.some(isOn), '已启用', 'Enabled'),
        'IPv4 ' + f4.length + ' · IPv6 ' + f6.length,
        L('共', 'Total') + ' ' + filters.length + ' ' + L('条', 'entries')),
      kpiCard('alert', 'violet', L('今日阻断', 'Blocked today'), String(blocked.length),
        statusDot(blocked.length > 0, '来自日志', 'From logs', '暂无记录', 'No records'),
        'drop ' + blockedDrop + ' · reject ' + blockedReject,
        L('来自 RouterOS 日志', 'RouterOS /log'),
        blockedSpark(blocked)),
      kpiCard('conn', 'blue', L('连接跟踪', 'Connection tracking'), hist ? String(hist.total || 0) : '—',
        statusDot(!!hist, '实时', 'Live', '无数据', 'N/A'),
        hist ? 'IPv4 ' + hist.v4 + ' · IPv6 ' + hist.v6 : L('来自实时快照', 'From live snapshot'),
        hist ? 'TCP ' + tcp + ' · UDP ' + udp : L('无实时数据', 'no live data')),
      kpiCard('ifaces', 'green', L('NAT 规则', 'NAT rules'), String(nat.length),
        statusDot(nat.some(isOn), '全部启用', 'All enabled'),
        'srcnat ' + srcnat + ' · dstnat ' + dstnat,
        L('共', 'Total') + ' ' + nat.length + ' ' + L('条', 'entries')),
    ].join('');
  }

  /* ---------- 下一跳探测（设计稿卡片） ---------- */
  function nhLabel(x) {
    const s = String(x || '—');
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
  }
  function nhRow(x) {
    /* 左侧显示 RouterOS comment（label），没有备注时才退回地址 */
    const label = x.label || x.host || x.gateway || x.address || '—';
    let state = x.state;
    if (!state) {
      const st = String(x.status || '');
      state = /up|ok|reachable|online|true/i.test(st) ? 'ok' : /down|bad|offline|false/i.test(st) ? 'bad' : 'unknown';
    }
    let ms = x.avg != null ? Number(x.avg) : (x.latency != null ? Number(String(x.latency).replace(/[^0-9.]/g, '')) : NaN);
    return { label, host: x.host || x.gateway || x.address || '', state, ms };
  }
  function nhPrefs() {
    try { return JSON.parse(localStorage.getItem(NH_KEY()) || '{}') || {}; } catch (e) { return {}; }
  }
  function nhTargets() {
    const p = nhPrefs();
    return Array.isArray(p.targets)
      ? p.targets.filter((t) => t && String(t.host || '').trim()).slice(0, 3)
      : [];
  }
  function probeState(host) {
    const q = R.qualityRows.find((x) => String(x.host || '') === host);
    if (q && q.state) return { state: q.state, ms: q.avg != null ? Number(q.avg) : NaN };
    const nw = R.netwatch.find((x) => String(x.host || '') === host);
    if (nw) {
      const st = String(nw.status || '');
      return { state: /up|ok|reachable|online/i.test(st) ? 'ok' : /down|bad|offline/i.test(st) ? 'bad' : 'unknown', ms: NaN };
    }
    return { state: 'unknown', ms: NaN };
  }
  function nextHopList() {
    const prefs = nhPrefs();
    const targets = prefs.enabled === false ? [] : nhTargets();
    if (targets.length) {
      return targets.map((t) => {
        const p = probeState(t.host);
        return { label: t.label || t.host, host: t.host, state: p.state, ms: p.ms };
      });
    }
    if (R.nextHop && R.nextHop.rows && R.nextHop.rows.length) return R.nextHop.rows.slice(0, 4).map(nhRow);
    const all = rows('routes').concat(rows('ipv6Routes'));
    const gwList = uniq(all.map((r) => r.gateway).filter((g) => g && /[.:]/.test(String(g)) && !/\s/.test(String(g))));
    return gwList.slice(0, 4).map((g) => {
      const r = all.find((x) => x.gateway === g);
      const p = probeState(g);
      return nhRow({ host: g, state: r && boolOn(r.inactive) ? 'bad' : p.state, avg: p.ms });
    });
  }
  function nextHopBadge(list) {
    if (!list.length) return '';
    const bad = list.some((x) => x.state === 'bad');
    const ok = list.every((x) => x.state === 'ok');
    if (bad) return `<span class="badge drop">${esc(L('部分不可达', 'Partly unreachable'))}</span>`;
    if (ok) return `<span class="badge allow">${esc(L('全部可达', 'All reachable'))}</span>`;
    return `<span class="badge neutral">${esc(L('状态未知', 'Unknown'))}</span>`;
  }
  function nextHopBody() {
    const list = nextHopList();
    const dots = { ok: 'is-green', warn: 'is-amber', bad: 'is-red', unknown: 'is-muted' };
    const health = list.length
      ? `<div class="health">${list.map((x) => {
        const pct = Number.isFinite(x.ms) ? Math.max(6, Math.min(100, Math.round(100 - Math.min(x.ms, 300) / 3)))
          : (x.state === 'ok' ? 80 : x.state === 'bad' ? 8 : 30);
        const ms = Number.isFinite(x.ms) ? (x.ms > 0 && x.ms < 1 ? Math.round(x.ms * 1000) + ' µs' : x.ms.toFixed(x.ms < 10 ? 1 : 0) + ' ms') : '—';
        return `<div class="health-row"><span class="nh-host" title="${esc(x.host || x.label)}"><span class="dot ${dots[x.state] || 'is-muted'}"></span>${ex(nhLabel(x.label))}</span><span class="bar"><i style="width:${pct}%"></i></span><b>${ms}</b></div>`;
      }).join('')}</div>`
      : `<div class="pg-empty">${ic('conn')}<div>${esc(L('暂无网关数据', 'No gateway data'))}</div></div>`;
    const cacheHit = R.cache && R.cache.hit != null && Number.isFinite(Number(R.cache.hit))
      ? Math.round(Number(R.cache.hit)) + '%' : '—';
    return health + '<div class="hairline"></div>'
      + kvRow(L('路由缓存', 'Route cache'), cacheHit)
      + kvRow(L('最近收敛', 'Last convergence'), relTime(R.loadedAt))
      + `<div class="rf-next-foot"><button class="rf-next-cfg" type="button" data-act="rf-next-config">${ic('gear')}${esc(L('配置', 'Configure'))}</button></div>`;
  }
  function openNextHopConfig() {
    const u = window.UI; if (!u || !u.openModal) return;
    const prefs = nhPrefs();
    const saved = Array.isArray(prefs.targets) ? prefs.targets.slice(0, 3) : [];
    const slots = [0, 1, 2].map((i) => saved[i] || {});
    const rowHtml = (i) => `<div class="nh-cfg-row">
        <input class="nh-cfg-host" name="nhHost${i + 1}" value="${esc(slots[i].host || '')}" placeholder="${i === 0 ? '10.0.1.1' : i === 1 ? '10.10.0.2' : '2606:4700::1111'}" autocomplete="off" spellcheck="false">
        <input name="nhNote${i + 1}" value="${esc(slots[i].label || '')}" placeholder="${esc(L('备注（写入 RouterOS comment）', 'Comment (saved to RouterOS)'))}" maxlength="100" autocomplete="off">
      </div>`;
    const body = `<div class="ui-form-note">${esc(L('最多填写三个目标地址；备注会写入 RouterOS Netwatch 的 comment，并显示在探测条左侧。', 'Up to three targets. The comment is written to the RouterOS Netwatch entry and shown left of each bar.'))}</div>
      <div class="nh-cfg">
        <div class="nh-cfg-head"><span>${esc(L('目标地址', 'Target'))}</span><span>${esc(L('备注', 'Comment'))}</span></div>
        ${slots.map((x, i) => rowHtml(i)).join('')}
        <div class="nh-cfg-extra">
          <label class="nh-cfg-iv"><span>${esc(L('检测间隔', 'Interval'))}</span><select name="nhInterval">
            ${['5s', '10s', '30s', '1m'].map((v) => `<option value="${v}"${(prefs.interval || '10s') === v ? ' selected' : ''}>${v}</option>`).join('')}
          </select></label>
          <label class="nh-cfg-sw"><span>${esc(L('启用主动探测', 'Enable probe'))}</span><input type="checkbox" name="nhEnabled"${prefs.enabled === false ? '' : ' checked'}></label>
        </div>
      </div>`;
    u.openModal({
      title: L('下一跳探测配置', 'Next-hop probe settings'),
      sub: L('下一跳探测', 'Next-hop probe') + ' · ' + secPath('routes'),
      body,
      actions: [
        { label: L('取消', 'Cancel') },
        { label: L('保存', 'Save'), cls: 'primary', keepOpen: true, onClick: async (modal) => {
          const val = (name) => { const el = modal.querySelector('[name="' + name + '"]'); return el ? String(el.value || '').trim() : ''; };
          const targets = [];
          for (let i = 1; i <= 3; i++) {
            const host = val('nhHost' + i);
            if (!host) continue;
            if (!/^[A-Za-z0-9_.:\-]+$/.test(host)) {
              const el = modal.querySelector('[name="nhHost' + i + '"]');
              if (el) { el.focus(); el.classList.add('is-invalid'); }
              return say(L('地址格式不正确：', 'Invalid address: ') + host, 'err');
            }
            targets.push({ host, label: val('nhNote' + i).slice(0, 100) });
          }
          const dup = targets.find((t, i) => targets.findIndex((x) => x.host === t.host) !== i);
          if (dup) return say(L('目标地址重复：', 'Duplicate target: ') + dup.host, 'warn');
          const next = {
            interval: val('nhInterval') || '10s',
            enabled: !!(modal.querySelector('[name="nhEnabled"]') || {}).checked,
            targets,
          };
          try {
            localStorage.setItem(NH_KEY(), JSON.stringify(next));
            if (next.enabled && targets.length) {
              await api('/api/link-quality/netwatch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets, interval: next.interval }),
              });
            }
            u.closeModal();
            say(L('配置已保存', 'Settings saved'), 'ok');
            await loadRouteExtras();
            safePaint();
          } catch (e) { say((e && e.message) || L('保存失败', 'Save failed'), 'err'); }
        } },
      ],
    });
  }

  /* ---------- rail / 底部补充卡片 ---------- */
  function routeRail() {
    const all = rows('routes').concat(rows('ipv6Routes'));
    const def = all.find((r) => r['dst-address'] === '0.0.0.0/0') || all.find(isDefault) || null;
    const v6def = rows('ipv6Routes').find(isDefault) || null;
    const defBody = def
      ? `<div class="route-spot"><span class="route-ico">${ic('route')}</span><div class="route-main"><b>${ex(def['dst-address'] || '—')}</b><small>via ${ex(def.gateway || '—')}${def.interface ? ' · ' + ex(def.interface) : ''}</small></div></div>
         ${kvRow(L('距离', 'Distance'), def.distance || '—')}
         ${kvRow('Scope / Target', (def.scope || '—') + ' / ' + (def['target-scope'] || '—'))}
         ${kvRow(L('首选源地址', 'Preferred source'), def['pref-src'] || '—', 'mono')}
         ${kvRow(L('IPv6 默认路由', 'IPv6 default'), v6def ? String(v6def['dst-address'] || '::/0') + ' · ' + String(v6def.gateway || '—') : '—', 'mono')}`
      : `<div class="pg-empty">${ic('route')}<div>${esc(L('暂无默认路由', 'No default route'))}</div></div>`;
    const defBadge = def
      ? `<span class="badge ${routeActive(def) ? 'allow' : 'neutral'}">${esc(routeActive(def) ? L('活跃', 'Active') : L('非活跃', 'Inactive'))}</span>`
      : '';
    const defSub = def
      ? L('优先出口', 'Preferred gateway') + ' ' + (routeIface(def) || def.gateway || '—')
      : L('优先出口', 'Preferred gateway');
    const prefs = nhPrefs();
    const ivRaw = String(prefs.interval || '10s');
    const ivSec = ivRaw.match(/^(\d+)s$/), ivMin = ivRaw.match(/^(\d+)m$/);
    const ivTxt = ivSec ? L('每 ' + ivSec[1] + ' 秒', 'Every ' + ivSec[1] + 's')
      : ivMin ? L('每 ' + ivMin[1] + ' 分钟', 'Every ' + ivMin[1] + 'm') : ivRaw;
    const probeSub = prefs.enabled === false
      ? L('仅显示网关状态', 'Status only')
      : ivTxt + ' ICMP';
    const nhList = nextHopList();
    return [
      miniCard(L('默认路由', 'Default route'), defSub, defBody, defBadge),
      miniCard(L('下一跳探测', 'Next-hop probe'), probeSub, nextHopBody(), nextHopBadge(nhList)),
    ].join('');
  }
  function firewallRail() {
    const filters = rows('firewallFilter').concat(rows('firewall6Filter'));
    const groups = {
      accept: { label: L('接受', 'Accept'), color: 'var(--v2-green)', rules: [] },
      drop: { label: L('阻断', 'Drop'), color: 'var(--v2-red)', rules: [] },
      reject: { label: L('拒绝', 'Reject'), color: 'var(--v2-amber)', rules: [] },
      other: { label: L('其它', 'Other'), color: 'var(--v2-violet)', rules: [] },
    };
    filters.forEach((r) => {
      const a = String(r.action || '').toLowerCase();
      groups[/^accept/.test(a) ? 'accept' : /^drop/.test(a) ? 'drop' : /^reject/.test(a) ? 'reject' : 'other'].rules.push(r);
    });
    /* 规则计数器是累计值，不是“今日”命中；有计数时按计数加权，否则退化为规则条数 */
    const counted = filters.filter((r) => ruleHits(r) != null);
    const useHits = counted.length > 0;
    const weight = (rs) => useHits ? rs.reduce((n, r) => n + (ruleHits(r) || 0), 0) : rs.length;
    const buckets = ['accept', 'drop', 'reject', 'other']
      .map((k) => Object.assign({ key: k }, groups[k], { w: weight(groups[k].rules) }))
      .filter((b) => b.rules.length > 0);
    const totalW = buckets.reduce((n, b) => n + b.w, 0);
    let barHtml = '', legendHtml = '';
    if (buckets.length && totalW > 0) {
      barHtml = `<div class="usage-bar">${buckets.map((b) => `<i style="width:${(b.w * 100 / totalW).toFixed(1)}%;background:${b.color}"></i>`).join('')}</div>`;
      legendHtml = `<div class="usage-legend">${buckets.map((b) => `<div class="row"><i style="background:${b.color}"></i>${esc(b.label)}<b>${useHits ? fmtHits(b.w) : b.rules.length}</b><small>${(b.w * 100 / totalW).toFixed(1)}%</small></div>`).join('')}</div>`;
    }
    const actSub = useHits
      ? L('按累计计数 · ' + fmtHits(totalW) + ' 次命中', 'Cumulative counters · ' + fmtHits(totalW) + ' hits')
      : L('按规则动作统计 · ' + filters.length + ' 条规则', 'Counted from ' + filters.length + ' rules');

    const top = filters.map((r) => ({ r, hit: ruleHits(r) }))
      .filter((x) => x.hit != null).sort((a, b) => b.hit - a.hit).slice(0, 5);
    const maxHit = top.length ? top[0].hit : 0;
    const rankBody = top.length
      ? `<div class="rank">${top.map(({ r, hit }) => {
        const lbl = r.comment || r.action || r.chain || '—';
        const bad = /drop|reject/i.test(String(r.action || ''));
        return `<div class="rank-row"><span class="lbl" title="${esc(lbl)}">${esc(lbl)}</span><span class="val">${fmtHits(hit)}</span><span class="bar"><i style="width:${Math.max(4, Math.round(hit * 100 / (maxHit || 1)))}%${bad ? ';background:var(--v2-red)' : ''}"></i></span></div>`;
      }).join('')}</div>`
      : `<div class="pg-empty">${ic('pulse')}<div>${esc(L('路由器未返回规则计数', 'Router returned no rule counters'))}</div></div>`;

    const changes = (R.logs || []).map((l) => ({ l, d: logTime(l.time) }))
      .filter(({ l }) => {
        const tp = String(l.topics || '').toLowerCase(), m = String(l.message || '');
        return /firewall|system/.test(tp) || /chang|add|remov|enabl|disabl|backup|login|logged|reboot|upgrad|updat|sync|config/i.test(m);
      })
      .sort((a, b) => (b.d ? b.d.getTime() : 0) - (a.d ? a.d.getTime() : 0))
      .slice(0, 4);
    const changeBody = changes.length
      ? `<div class="timeline">${changes.map(({ l }) => {
        const msg = String(l.message || '—');
        const bad = /drop|error|fail|deny/i.test(msg);
        const amber = /system/i.test(String(l.topics || ''));
        const dotStyle = bad ? ' style="background:var(--v2-red)"' : amber ? ' style="background:var(--v2-amber)"' : '';
        return `<div class="tl-item"><span class="tl-dot"${dotStyle}></span><div><b title="${esc(msg)}">${esc(msg)}</b><small>${esc([l.time, l.topics].filter(Boolean).join(' · '))}</small></div></div>`;
      }).join('')}</div>`
      : `<div class="pg-empty">${ic('pulse')}<div>${esc(L('日志中暂无变更记录', 'No change records in logs'))}</div></div>`;

    return [
      miniCard(L('动作分布', 'Action breakdown'), actSub,
        (barHtml || `<div class="pg-empty">${esc(L('暂无数据', 'No data'))}</div>`) + legendHtml,
        filters.length ? `<span class="status"><span class="dot is-green"></span>${esc(L('正常', 'OK'))}</span>` : ''),
      miniCard(L('命中 TOP 5', 'Top 5 hits'),
        useHits ? L('按累计计数排序', 'Sorted by cumulative counters') : L('来自 RouterOS 规则计数器', 'RouterOS rule counters'),
        rankBody),
      miniCard(L('最近变更', 'Recent changes'), L('来自 RouterOS 日志', 'From RouterOS logs'), changeBody),
    ].join('');
  }

  /* ---------- 页面骨架 ---------- */
  function tabsHtml(items, active, act) {
    return `<div class="panel-tabs" data-tabs>${items.map(([key, label, count]) =>
      `<button class="panel-tab ${key === active ? 'on' : ''}" type="button" data-act="${act}" data-tab="${ex(key)}">${esc(label)}<span class="pt-count">${count}</span></button>`).join('')}</div>`;
  }
  function routeTabsHtml() {
    return tabsHtml([
      ['routes', L('IPv4', 'IPv4'), rows('routes').length],
      ['ipv6Routes', L('IPv6', 'IPv6'), rows('ipv6Routes').length],
      [POLICY_SEC, L('策略', 'Policy'), rowsFor(POLICY_SEC).length],
    ], R.section, 'rf-tab');
  }
  function fwKindLabel(sec) {
    if (/Nat$/.test(sec)) return L('NAT', 'NAT');
    if (/Mangle$/.test(sec)) return L('Mangle', 'Mangle');
    return L('过滤', 'Filter');
  }
  function fwTabsHtml() {
    const counts = {
      v4: FW4.reduce((n, s) => n + rows(s).length, 0),
      v6: FW6.reduce((n, s) => n + rows(s).length, 0),
    };
    return tabsHtml([
      ['v4', L('IPv4 策略规则', 'IPv4 policy rules'), counts.v4],
      ['v6', L('IPv6 策略规则', 'IPv6 policy rules'), counts.v6],
    ], R.fwTab, 'rf-fw-tab');
  }

  function routeHtml() {
    const all = rows('routes').concat(rows('ipv6Routes'));
    return `<div class="page-head"><div><h1>${esc(L('路由', 'Routing'))}</h1>
      <div class="meta">${esc(L('主路由', 'Main router'))}<span class="sep"></span>RouterOS<span class="sep"></span>${all.length} ${esc(L('条路由', 'routes'))}</div></div>
      <div class="actions"><span class="live"><span class="dot"></span>${esc(relTime(R.loadedAt))}</span>
        ${canWrite('routes') ? `<button class="btn primary" type="button" data-act="rf-add">${ic('plus')}${esc(L('添加路由', 'Add route'))}</button>` : ''}
      </div></div>
      <div class="grid align-start">
        <div class="kpis">${routeKpis()}</div>
        <section class="card span8"><div class="card-head"><div><h2 class="card-title">${esc(L('路由表', 'Routing table'))}</h2>
          <div class="card-sub">${esc(L('按前缀长度排序 · 默认策略 main', 'Sorted by prefix · default table main'))}</div></div>
          <div style="display:flex;align-items:center;gap:10px"><span class="status"><span class="dot is-green"></span>${esc(L('已收敛', 'Converged'))}</span><button class="btn icon-only" type="button" data-act="rf-menu" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}">${ic('more')}</button></div></div>
          ${routeTabsHtml()}
          <div class="tab-panel on" data-panel="${ex(R.section)}">${panelBody(R.section)}</div>
        </section>
        <div class="span4 rail">${routeRail()}</div>
      </div>`;
  }
  function firewallHtml() {
    const all = FIREWALL_SECS.reduce((n, s) => n + rows(s).length, 0);
    const v4 = FW4.reduce((n, s) => n + rows(s).length, 0);
    const v6 = FW6.reduce((n, s) => n + rows(s).length, 0);
    const on = FIREWALL_SECS.reduce((n, s) => n + rows(s).filter(isOn).length, 0);
    return `<div class="page-head"><div><h1>${esc(L('防火墙', 'Firewall'))}</h1>
      <div class="meta">${esc(L('主路由', 'Main router'))}<span class="sep"></span>${all} ${esc(L('条规则 / 条目', 'rules / entries'))}<span class="sep"></span>IPv4 ${v4}<span class="sep"></span>IPv6 ${v6}</div></div>
      <div class="actions"><span class="live"><span class="dot"></span>${esc(relTime(R.loadedAt))}</span>
        ${canWrite('firewallFilter') ? `<button class="btn primary" type="button" data-act="rf-add">${ic('plus')}${esc(L('新增规则', 'Add rule'))}</button>` : ''}
      </div></div>
      <div class="grid align-start">
        <div class="kpis">${firewallKpis()}</div>
        <section class="card span8"><div class="card-head"><div><h2 class="card-title">${esc(L('策略规则', 'Policy rules'))}</h2>
          <div class="card-sub">${esc(L('按链顺序执行 · IPv4 / IPv6 分类', 'Evaluated by chain · IPv4 / IPv6 sections'))}</div></div>
          <div style="display:flex;align-items:center;gap:10px"><span class="status"><span class="dot ${on ? 'is-green' : 'is-muted'}"></span>${esc(on + ' ' + L('已启用', 'enabled'))}</span><button class="btn icon-only" type="button" data-act="rf-menu" title="${esc(L('表格选项', 'Table options'))}" aria-label="${esc(L('表格选项', 'Table options'))}">${ic('more')}</button></div></div>
          ${fwTabsHtml()}
          <div class="tab-panel on" data-panel="${ex(R.section)}">${panelBody(R.section)}</div>
        </section>
        <div class="span4 rail">${firewallRail()}</div>
      </div>`;
  }
  function html() { return R.group === 'routes' ? routeHtml() : firewallHtml(); }

  function bindSearch() {
    const s = $('rfSearch');
    if (!s) return;
    s.value = R.q;
    s.oninput = () => {
      R.q = s.value;
      R.page = 1;
      repaintPanel();
      const n = $('rfSearch');
      if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    };
  }
  function repaintPanel() {
    const host = document.querySelector('.ui-v2 .content.pg-rf .tab-panel');
    if (!host) return;
    host.innerHTML = panelBody(R.section);
    bindSearch();
  }
  function paint() {
    const c = $('content');
    if (!c || !groupOf(state.section)) return;
    c.className = 'content dash pg-rf';
    c.innerHTML = html();
    bindSearch();
  }

  /* ---------- 导出（真实数据） ---------- */
  function openCardMenu(anchor) {
    if (!UI || !UI.openMenu) return;
    const compact = document.body.classList.contains('ui-compact');
    UI.openMenu(anchor, [
      { label: L('导出当前表格', 'Export current table'), sub: L('CSV · 当前分类全部数据', 'CSV · all rows in current section'), icon: 'i-download', action: () => exportCsv() },
      { label: L('切换为紧凑布局', 'Switch to compact layout'), sub: compact ? L('当前：紧凑', 'Current: compact') : L('当前：舒适', 'Current: comfortable'), icon: 'i-layout', checkSlot: true, checked: compact, action: () => {
        const on = !document.body.classList.contains('ui-compact');
        document.body.classList.toggle('ui-compact', on);
        try { localStorage.setItem('ros-density', on ? 'compact' : 'comfort'); } catch (e) { /* ignore */ }
        say(on ? L('已切换为紧凑布局', 'Compact layout enabled') : L('已恢复舒适布局', 'Comfortable layout restored'), 'ok');
      } },
      { sep: true },
      { label: L('回到顶部', 'Back to top'), icon: 'i-up', action: () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } } },
    ], { head: `<div class="ui-menu-head"><b>${esc(L('表格选项', 'Table options'))}</b><small>${esc(secTitle(realSec(R.section, {})))}</small></div>` });
  }
  function exportCsv() {
    const secs = secsOf(R.group);
    const lines = [];
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
    a.href = url; a.download = 'ros-' + R.group + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(L('已导出当前分类数据', 'Exported current section data'), 'ok');
  }

  /* ---------- 事件委托 ---------- */
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !groupOf(state.section)) return;
    const a = el.dataset.act;
    if (a === 'rf-tab') {
      const t = el.dataset.tab;
      if (R.group === 'routes' && ['routes', 'ipv6Routes', POLICY_SEC].indexOf(t) >= 0) {
        R.section = t; R.q = ''; R.chip = 'all'; R.page = 1; paint();
      }
      return;
    }
    if (a === 'rf-fw-tab') {
      const t = el.dataset.tab;
      if (R.group === 'firewall' && ['v4', 'v6'].indexOf(t) >= 0) {
        R.fwTab = t;
        R.section = t === 'v6' ? FW6[0] : FW4[0];
        R.q = ''; R.chip = 'all'; R.page = 1; paint();
      }
      return;
    }
    if (a === 'rf-fw-kind') {
      const t = el.dataset.section;
      if (FW4.concat(FW6).indexOf(t) >= 0) { R.section = t; R.q = ''; R.chip = 'all'; R.page = 1; paint(); }
      return;
    }
    if (a === 'rf-chip') { R.chip = el.dataset.chip || 'all'; R.page = 1; repaintPanel(); return; }
    if (a === 'rf-page') { R.page = Math.max(1, Number(el.dataset.page) || 1); repaintPanel(); return; }
    if (a === 'rf-next-config') { openNextHopConfig(); return; }
    if (a === 'rf-refresh') { loadAll(true); return; }
    if (a === 'rf-add') { openAdd(R.section); return; }
    if (a === 'rf-menu') { openCardMenu(el); return; }
    if (a === 'rf-more') { rowMenu(el.dataset.sec || R.section, el.dataset.id, el); return; }
  }

  function syncFwTab(sec) {
    /* 服务端口分页已移除（系统管理中已有服务配置），旧入口统一落到 IPv4 规则 */
    if (/^servicePorts/.test(sec)) { R.fwTab = 'v4'; R.section = FW4[0]; }
    else if (/^firewall6/.test(sec)) { R.fwTab = 'v6'; R.section = sec; }
    else { R.fwTab = 'v4'; R.section = FW4.indexOf(sec) >= 0 ? sec : FW4[0]; }
  }
  function install() {
    if (window.__routingFirewallV3Installed) return;
    window.__routingFirewallV3Installed = true;
    const content = $('content');
    if (content) content.addEventListener('click', onClick);
    if (typeof window.renderPage === 'function') {
      const orig = window.renderPage;
      window.renderPage = function () {
        const r = orig.apply(this, arguments);
        if (ALL_SECS.indexOf(state.section) >= 0) {
          const g = groupOf(state.section);
          if (R.group !== g) {
            R.group = g; R.q = ''; R.chip = 'all'; R.page = 1; R.lastNavSection = state.section;
            if (g === 'routes') R.section = state.section; else syncFwTab(state.section);
          } else if (R.lastNavSection !== state.section) {
            R.lastNavSection = state.section; R.q = ''; R.chip = 'all'; R.page = 1;
            if (g === 'routes') R.section = state.section; else syncFwTab(state.section);
          }
          paint();
          loadAll(false);
        }
        return r;
      };
    }
    if (ALL_SECS.indexOf(state.section) >= 0 && $('content')) {
      R.group = groupOf(state.section); R.lastNavSection = state.section;
      if (R.group === 'routes') R.section = state.section; else syncFwTab(state.section);
      paint(); loadAll(false);
    }
    setInterval(() => { if (ALL_SECS.indexOf(state.section) >= 0 && !document.hidden) loadAll(true); }, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
