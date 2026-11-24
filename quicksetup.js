'use strict';
/* 一键配置：把向导表单转换成 RouterOS API 命令与可导入的 .rsc 脚本。
   纯函数、无副作用，便于单测。生成的条目都带 MARK comment；重复执行会「按 key 更新」而非堆叠，
   勾选 clean 时只删除本工具生成的条目（IP 地址与 bridge 除外，避免执行中把自己踢下线）。 */
const MARK = 'ROS Center quick setup';

function ipToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
  if (!m) throw new Error('IP 地址格式不正确 / invalid IPv4 address: ' + ip);
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) throw new Error('IP 地址超出范围 / invalid IPv4 octet: ' + ip);
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}
function intToIp(n) {
  return [((n >>> 24) & 255), ((n >>> 16) & 255), ((n >>> 8) & 255), (n & 255)].join('.');
}
function parseCidr(text) {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(String(text || '').trim());
  if (!m) throw new Error('内网网段需形如 192.168.88.1/24 / LAN CIDR must look like 192.168.88.1/24');
  const prefix = Number(m[2]);
  if (prefix < 8 || prefix > 30) throw new Error('子网前缀需在 /8 ~ /30 之间 / prefix must be /8..30');
  const ip = ipToInt(m[1]);
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | ((~mask) >>> 0)) >>> 0;
  if (ip === network || ip === broadcast) throw new Error('网关地址不能是网络号或广播地址');
  return { gateway: m[1], ip, prefix, mask, network, broadcast };
}
function validInterface(v, label) {
  const s = String(v || '').trim();
  if (!/^[A-Za-z0-9_.\-]{1,32}$/.test(s)) throw new Error(label + ' 接口名不合法 / invalid interface name');
  return s;
}
function boolWord(v) { return v ? 'yes' : 'no'; }
function rscArg(v) {
  const s = String(v);
  /* 取反值（!ether1 / !dstnat）必须保持无引号，否则 RouterOS 会当成普通字符串 */
  if (/^![A-Za-z0-9_.\-]+$/.test(s)) return s;
  return /^[A-Za-z0-9_./:@%+\-]+$/.test(s) ? s : '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildPlan(input, options = {}) {
  const preview = !!options.preview;   /* 预览允许必填项为空，用占位符展示完整脚本 */
  const b = input && typeof input === 'object' ? input : {};
  const mode = ['pppoe', 'dhcp', 'static'].includes(b.mode) ? b.mode : 'pppoe';
  const wanInterface = validInterface(b.wanInterface || 'ether1', 'WAN');
  const lanInterface = validInterface(b.lanInterface || 'bridge-lan', 'LAN');
  const lan = parseCidr(b.lanCidr || '192.168.88.1/24');
  const hostMin = lan.network + 1, hostMax = lan.broadcast - 1;
  if (hostMax - hostMin < 1) throw new Error('该网段可用地址过少 / subnet has too few usable hosts');
  let poolStart = b.poolStart ? ipToInt(String(b.poolStart).trim()) : Math.min(hostMax, lan.network + 10);
  let poolEnd = b.poolEnd ? ipToInt(String(b.poolEnd).trim()) : hostMax;
  if (poolStart < hostMin || poolStart > hostMax || poolEnd < hostMin || poolEnd > hostMax || poolStart > poolEnd) {
    throw new Error('地址池范围必须落在网段内且起始 ≤ 结束 / pool range must be inside the subnet');
  }
  if (lan.ip >= poolStart && lan.ip <= poolEnd) {
    poolStart = lan.ip + 1;
    if (poolStart > poolEnd) throw new Error('地址池与网关冲突，请调整范围 / pool conflicts with gateway');
  }
  const networkCidr = intToIp(lan.network) + '/' + lan.prefix;
  const poolRanges = intToIp(poolStart) + '-' + intToIp(poolEnd);

  const pppoe = b.pppoe && typeof b.pppoe === 'object' ? b.pppoe : {};
  const wan = b.wan && typeof b.wan === 'object' ? b.wan : {};
  const stat = b.static && typeof b.static === 'object' ? b.static : {};
  const fw = b.firewall && typeof b.firewall === 'object' ? b.firewall : {};
  const admin = b.admin && typeof b.admin === 'object' ? b.admin : {};
  const services = b.services && typeof b.services === 'object' ? b.services : {};
  const dnsUpstream = String(b.dns || '223.5.5.5,119.29.29.29').trim();
  const dnsForClients = ['gateway', 'upstream', 'custom'].includes(b.dnsForClients) ? b.dnsForClients : 'gateway';
  const clientDns = dnsForClients === 'gateway' ? lan.gateway
    : dnsForClients === 'upstream' ? dnsUpstream : String(b.customClientDns || lan.gateway).trim();
  const domain = String(b.domain || 'lan').trim().replace(/[^A-Za-z0-9_.\-]/g, '');
  const leaseTime = String(b.leaseTime || '1d').trim().replace(/[^A-Za-z0-9]/g, '');
  const pppoeName = validInterface(pppoe.name || 'pppoe-out1', 'PPPoE');
  const wanIface = mode === 'pppoe' ? pppoeName : wanInterface;
  const secrets = [];
  const warnings = [];
  const steps = [];

  function comment(label) { return MARK + (label ? ' · ' + label : ''); }
  function step(path, action, props, opts = {}) {
    const words = [], rscParts = [];
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === '') continue;
      const s = String(v);
      words.push(`=${k}=${s}`);
      rscParts.push(`${k}=${rscArg(s)}`);
    }
    let fullComment = null;
    if (opts.comment !== false) {
      fullComment = comment(opts.label || '');
      words.push(`=comment=${fullComment}`);
      rscParts.push(`comment=${rscArg(fullComment)}`);
    }
    if (opts.lookup) words.push('=.id=__LOOKUP__');
    const find = opts.lookup ? `[find ${opts.lookup.field}=${rscArg(opts.lookup.value)}]` : '';
    const rsc = `${path} ${action}${find ? ' ' + find : ''}${rscParts.length ? ' ' + rscParts.join(' ') : ''}`;
    steps.push({
      path, cmd: [`${path}/${action}`, ...words], rsc,
      key: opts.key || null, lookup: opts.lookup || null,
      singleton: !!opts.singleton, label: opts.label || '',
    });
  }

  /* --- 1. LAN --- */
  if (b.createBridge) {
    step('/interface/bridge', 'add', { name: lanInterface, 'protocol-mode': 'none' }, { label: 'LAN bridge', key: { field: 'name', value: lanInterface } });
    const ports = String(b.bridgePorts || '').split(/[\s,]+/).filter(Boolean);
    for (const p of ports) {
      const port = validInterface(p, 'LAN 端口');
      step('/interface/bridge/port', 'add', { bridge: lanInterface, interface: port },
        { label: 'bridge port ' + port, key: { field: 'comment', value: comment('bridge port ' + port) } });
    }
    if (!ports.length) warnings.push('未填写 LAN 桥接端口，桥已创建但没有加入任何网口');
  }
  step('/ip/address', 'add', { address: lan.gateway + '/' + lan.prefix, interface: lanInterface },
    { label: 'LAN gateway', key: { field: 'address', value: lan.gateway + '/' + lan.prefix } });
  step('/ip/pool', 'add', { name: 'qs-lan-pool', ranges: poolRanges },
    { label: 'LAN pool', key: { field: 'name', value: 'qs-lan-pool' } });
  step('/ip/dhcp-server', 'add', {
    name: 'qs-dhcp', interface: lanInterface, 'address-pool': 'qs-lan-pool',
    'lease-time': leaseTime || '1d', disabled: 'no',
  }, { label: 'LAN DHCP', key: { field: 'name', value: 'qs-dhcp' } });
  const netProps = { address: networkCidr, gateway: lan.gateway, 'dns-server': clientDns, domain };
  /* 可关联「网络设置 → DHCP 选项集」里已创建的 option set */
  const optSet = String(b.dhcpOptionSet || '').trim().replace(/[^A-Za-z0-9_.\-]/g, '');
  if (optSet) netProps['dhcp-option-set'] = optSet;
  step('/ip/dhcp-server/network', 'add', netProps,
    { label: 'LAN network', key: { field: 'address', value: networkCidr } });
  step('/ip/dns', 'set', {
    servers: dnsUpstream, 'allow-remote-requests': dnsForClients === 'gateway' ? 'yes' : 'no',
  }, { comment: false, singleton: true });

  /* --- 2. WAN --- */
  if (mode === 'pppoe') {
    let user = String(pppoe.user || '').trim();
    let password = String(pppoe.password || '');
    if (!user) {
      if (!preview) throw new Error('PPPoE 账号不能为空 / PPPoE username is required');
      user = 'PPPOE_USER_REQUIRED';
      warnings.push('请填写 PPPoE 账号后再应用 / fill in the PPPoE username before applying');
    }
    if (!password) {
      if (preview) password = 'PPPOE_PASSWORD_REQUIRED';
      warnings.push('PPPoE 密码为空，请确认运营商是否允许空密码');
    }
    if (password && !/REQUIRED$/.test(password)) secrets.push(password);
    step('/interface/pppoe-client', 'add', {
      name: pppoeName, interface: wanInterface, user, password,
      service: String(pppoe.service || '').trim(),
      mtu: String(pppoe.mtu || '1480').replace(/[^0-9]/g, ''),
      mru: String(pppoe.mru || '1480').replace(/[^0-9]/g, ''),
      'use-peer-dns': boolWord(pppoe.usePeerDns), 'add-default-route': 'yes',
      'default-route-distance': '1', disabled: 'no',
    }, { label: 'PPPoE WAN', key: { field: 'name', value: pppoeName } });
  } else if (mode === 'dhcp') {
    step('/ip/dhcp-client', 'add', {
      interface: wanInterface, 'use-peer-dns': boolWord(wan.usePeerDns !== false),
      'add-default-route': boolWord(wan.addDefaultRoute !== false), 'default-route-distance': '1', disabled: 'no',
    }, { label: 'DHCP WAN', key: { field: 'comment', value: comment('DHCP WAN') } });
  } else {
    let addr = String(stat.address || '').trim();
    let gw = String(stat.gateway || '').trim();
    if (!addr || !gw) {
      if (!preview) throw new Error('静态 IP 模式需要填写地址与网关 / static address and gateway are required');
      addr = addr || '0.0.0.0/0';
      gw = gw || '0.0.0.0';
      warnings.push('请填写静态 IP 地址与网关 / fill in the static address and gateway');
    }
    step('/ip/address', 'add', { address: addr, interface: wanInterface },
      { label: 'WAN address', key: { field: 'address', value: addr } });
    step('/ip/route', 'add', { 'dst-address': '0.0.0.0/0', gateway: gw, distance: '1' },
      { label: 'WAN default route', key: { field: 'comment', value: comment('WAN default route') } });
  }

  /* --- 3. 防火墙（参考 MikroTik 默认配置） --- */
  if (fw.basic !== false) {
    step('/ip/firewall/nat', 'add', {
      chain: 'srcnat', action: 'masquerade', 'out-interface': wanIface, 'ipsec-policy': 'out,none',
    }, { label: 'masquerade', key: { field: 'comment', value: comment('masquerade') } });
    step('/ip/firewall/filter', 'add', {
      chain: 'input', action: 'accept', 'connection-state': 'established,related,untracked',
    }, { label: 'input established', key: { field: 'comment', value: comment('input established') } });
    step('/ip/firewall/filter', 'add', { chain: 'input', action: 'drop', 'connection-state': 'invalid' },
      { label: 'input invalid', key: { field: 'comment', value: comment('input invalid') } });
    const icmp = { chain: 'input', action: 'accept', protocol: 'icmp' };
    if (!fw.allowWanPing) {
      icmp['in-interface'] = '!' + wanInterface;
      if (mode === 'pppoe') warnings.push('禁止 WAN Ping 按物理接口取反；PPPoE 虚拟接口请结合 interface list 复核');
    }
    step('/ip/firewall/filter', 'add', icmp,
      { label: 'input icmp', key: { field: 'comment', value: comment('input icmp') } });
    step('/ip/firewall/filter', 'add', { chain: 'input', action: 'accept', 'in-interface': lanInterface },
      { label: 'input LAN', key: { field: 'comment', value: comment('input LAN') } });
    if (fw.dropWanInput !== false) {
      step('/ip/firewall/filter', 'add', { chain: 'input', action: 'drop', 'in-interface': wanIface },
        { label: 'input WAN drop', key: { field: 'comment', value: comment('input WAN drop') } });
    }
    if (fw.fasttrack !== false) {
      step('/ip/firewall/filter', 'add', {
        chain: 'forward', action: 'fasttrack-connection', 'connection-state': 'established,related',
      }, { label: 'forward fasttrack', key: { field: 'comment', value: comment('forward fasttrack') } });
    }
    step('/ip/firewall/filter', 'add', {
      chain: 'forward', action: 'accept', 'connection-state': 'established,related,untracked',
    }, { label: 'forward established', key: { field: 'comment', value: comment('forward established') } });
    step('/ip/firewall/filter', 'add', { chain: 'forward', action: 'drop', 'connection-state': 'invalid' },
      { label: 'forward invalid', key: { field: 'comment', value: comment('forward invalid') } });
    step('/ip/firewall/filter', 'add', {
      chain: 'forward', action: 'accept', 'in-interface': lanInterface, 'out-interface': wanIface,
    }, { label: 'forward LAN to WAN', key: { field: 'comment', value: comment('forward LAN to WAN') } });
    step('/ip/firewall/filter', 'add', {
      chain: 'forward', action: 'drop', 'in-interface': wanIface, 'connection-nat-state': '!dstnat',
    }, { label: 'forward WAN drop', key: { field: 'comment', value: comment('forward WAN drop') } });
  } else {
    warnings.push('未启用防火墙模板，请自行确认已有规则 / firewall template disabled');
  }

  /* --- 4. 系统标识 / 关闭不安全服务 --- */
  if (String(b.identity || '').trim()) {
    const name = String(b.identity).trim().replace(/[^A-Za-z0-9_.\- ]/g, '').slice(0, 32);
    step('/system/identity', 'set', { name }, { comment: false, singleton: true });
  }
  for (const svc of ['telnet', 'ftp', 'www']) {
    if (!services['disable' + svc.charAt(0).toUpperCase() + svc.slice(1)]) continue;
    step('/ip/service', 'set', { disabled: 'yes' }, {
      comment: false, lookup: { path: '/ip/service', field: 'name', value: svc },
    });
    warnings.push('已禁用 ' + svc + ' 服务（API / SSH / WinBox 不会动，避免断开 ROS Center）');
  }

  /* --- 5. 管理员账号（放最后，改密会断开当前 API 会话） --- */
  let adminChange = null;
  if (admin.enabled) {
    const currentUser = String(admin.currentUser || 'admin').trim();
    const newUser = String(admin.newUser || currentUser).trim();
    let newPassword = String(admin.newPassword || '');
    if (!/^[A-Za-z0-9_.\-]{1,32}$/.test(newUser)) throw new Error('新用户名不合法 / invalid new username');
    const mismatch = newPassword !== String(admin.confirmPassword || '');
    if (newPassword.length < 8 || mismatch) {
      if (!preview) throw new Error(mismatch ? '两次输入的密码不一致 / passwords do not match' : '新密码至少 8 位 / new password must be at least 8 characters');
      newPassword = 'ADMIN_PASSWORD_REQUIRED';
      warnings.push('请填写至少 8 位且两次一致的新密码 / set a matching password of 8+ characters');
    }
    if (newPassword !== 'ADMIN_PASSWORD_REQUIRED') secrets.push(newPassword);
    const props = { password: newPassword };
    if (newUser !== currentUser) props.name = newUser;
    step('/user', 'set', props, {
      comment: false, lookup: { path: '/user', field: 'name', value: currentUser },
    });
    adminChange = { currentUser, newUser, newPassword, syncCredentials: admin.syncCredentials !== false };
    warnings.push('修改管理员账号会使当前 API 会话断开；已把该操作放在最后执行。');
  }

  const scriptHeader = [
    '# ROS Center quick setup / 一键配置',
    '# Generated: ' + new Date().toISOString(),
    '# WAN: ' + mode + ' | LAN: ' + networkCidr + ' | gateway: ' + lan.gateway,
    '# 重复导入会新增重复条目；建议通过 WebUI「一键应用」执行（按 comment 幂等更新）。',
    '# 请先在测试环境核对，生产环境操作前做好备份。',
    '',
  ].join('\n');
  const script = scriptHeader + steps.map((s) => s.rsc).join('\n') + '\n';
  const paths = [...new Set(steps.flatMap((s) => [s.path, ...(s.lookup ? [s.lookup.path] : [])]))];
  const NO_REMOVE = new Set(['/ip/address', '/interface/bridge', '/ip/dns', '/system/identity', '/user', '/ip/service']);
  const cleanPaths = paths.filter((p) => !NO_REMOVE.has(p));

  return {
    mode, steps, script, secrets, warnings, adminChange,
    preflightPaths: paths, cleanPaths, mark: MARK,
    summary: {
      lanCidr: networkCidr, gateway: lan.gateway, pool: poolRanges,
      lanInterface, wanInterface, wanIface, pppoeName: mode === 'pppoe' ? pppoeName : '',
      clientDns, domain, steps: steps.length,
      firewall: fw.basic !== false, adminChange: !!adminChange,
    },
    maskScript(sec) {
      let out = script;
      for (const s of (sec || secrets)) {
        if (s) out = out.split(String(s)).join('********');
      }
      return out;
    },
  };
}

/* 幂等执行解析：prints = { '/ip/address': [rows...], ... }
   返回 removals（先删）、commands（后执行）、skipped、warnings。 */
function resolveExecution(plan, prints = {}, opts = {}) {
  const rowsFor = (p) => (Array.isArray(prints[p]) ? prints[p] : []);
  const removals = [], commands = [], skipped = [], warnings = [];
  if (opts.clean) {
    for (const p of plan.cleanPaths || []) {
      for (const r of rowsFor(p)) {
        if (String(r.comment || '').startsWith(plan.mark || MARK) && r['.id']) {
          removals.push([`${p}/remove`, `=.id=${r['.id']}`]);
        }
      }
    }
  }
  for (const s of plan.steps || []) {
    let cmd = s.cmd.slice();
    if (s.lookup) {
      const found = rowsFor(s.lookup.path).find((r) => String(r[s.lookup.field] || '') === s.lookup.value);
      if (!found || !found['.id']) {
        skipped.push(s.rsc);
        warnings.push('未找到 ' + s.lookup.field + '=' + s.lookup.value + '，已跳过：' + s.rsc);
        continue;
      }
      cmd = cmd.map((w) => (w === '=.id=__LOOKUP__' ? `=.id=${found['.id']}` : w));
    }
    if (!opts.clean && s.key && /\/add$/.test(cmd[0]) && !s.singleton) {
      const found = rowsFor(s.path).find((r) => String(r[s.key.field] || '') === s.key.value);
      if (found && found['.id']) {
        cmd = [`${s.path}/set`, `=.id=${found['.id']}`, ...cmd.slice(1)];
        warnings.push('更新已有条目（未重复新增）：' + s.label);
      }
    }
    commands.push({ cmd, rsc: s.rsc });
  }
  return { removals, commands, skipped, warnings };
}

module.exports = { MARK, buildPlan, resolveExecution, ipToInt, intToIp, parseCidr };
