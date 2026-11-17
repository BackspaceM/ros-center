'use strict';

/* 分类目录：前后端唯一数据源。path 即 RouterOS API 路径，fields 即允许写入的字段白名单。 */

const F = (key, zh, en, type = 'text', extra = {}) => ({ key, label: { zh, en }, type, ...extra });
const S = (id, group, zh, en, path, fields, extra = {}) => ({
  id, group, path, fields,
  title: { zh, en },
  toggle: extra.toggle !== false,
  writable: extra.writable !== false,
  columns: extra.columns || fields.filter((f) => f.type !== 'password').map((f) => f.key),
  ...extra,
});

const GROUPS = [
  { id: 'overview', zh: '系统概览', en: 'Overview', icon: 'grid' },
  { id: 'network', zh: '网络设置', en: 'Network', icon: 'network' },
  { id: 'firewall', zh: '防火墙 IPv4', en: 'Firewall IPv4', icon: 'shield' },
  { id: 'firewall6', zh: '防火墙 IPv6', en: 'Firewall IPv6', icon: 'shield6' },
  { id: 'wireless', zh: '无线管理', en: 'Wireless', icon: 'wifi' },
  { id: 'vpn', zh: 'VPN 管理', en: 'VPN', icon: 'vpn' },
  { id: 'queue', zh: '带宽控制', en: 'Queues', icon: 'queue' },
  { id: 'system', zh: '系统管理', en: 'System', icon: 'gear' },
  { id: 'logs', zh: '日志中心', en: 'Logs', icon: 'log' },
];

const SECTIONS = [
  /* ---------- 概览 ---------- */
  S('dashboard', 'overview', '仪表盘', 'Dashboard', null, [], { virtual: true, toggle: false, writable: false }),
  S('trafficStats', 'overview', '流量统计', 'Traffic stats', null, [], { virtual: true, toggle: false, writable: false }),
  S('systemTools', 'overview', '运维工具', 'Tools', null, [], { virtual: true, toggle: false, writable: false }),
  S('connections', 'overview', '连接状态 IPv4', 'Connections IPv4', '/ip/firewall/connection',
    [F('.id', 'ID', 'ID', 'id'), F('src-address', '源地址', 'Source', 'readonly'), F('dst-address', '目标地址', 'Destination', 'readonly'),
      F('protocol', '协议', 'Protocol', 'readonly'), F('connection-state', '状态', 'State', 'readonly'), F('bytes', '字节', 'Bytes', 'readonly')],
    { toggle: false, writable: false, readonly: true, columns: ['src-address', 'dst-address', 'protocol', 'connection-state', 'bytes'] }),
  S('connections6', 'overview', '连接状态 IPv6', 'Connections IPv6', '/ipv6/firewall/connection',
    [F('.id', 'ID', 'ID', 'id'), F('src-address', '源地址', 'Source', 'readonly'), F('dst-address', '目标地址', 'Destination', 'readonly'),
      F('protocol', '协议', 'Protocol', 'readonly'), F('connection-state', '状态', 'State', 'readonly'), F('bytes', '字节', 'Bytes', 'readonly')],
    { toggle: false, writable: false, readonly: true, columns: ['src-address', 'dst-address', 'protocol', 'connection-state', 'bytes'] }),

  /* ---------- 网络 ---------- */
  S('interfaces', 'network', '接口管理', 'Interfaces', '/interface',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('type', '类型', 'Type', 'readonly'),
      F('mtu', 'MTU', 'MTU', 'number'), F('mac-address', 'MAC', 'MAC', 'readonly'), F('comment', '备注', 'Comment', 'text'),
      F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['name', 'type', 'mtu', 'mac-address', 'running', 'comment', 'disabled'] }),
  S('ipAddresses', 'network', 'IP 地址', 'IP addresses', '/ip/address',
    [F('.id', 'ID', 'ID', 'id'), F('address', '地址', 'Address', 'text', { required: true, placeholder: '10.0.0.1/24' }),
      F('interface', '接口', 'Interface', 'interface'), F('network', '网络', 'Network', 'readonly'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('dhcpClients', 'network', 'DHCP 客户端', 'DHCP clients', '/ip/dhcp-client',
    [F('.id', 'ID', 'ID', 'id'), F('interface', '接口', 'Interface', 'interface'), F('dhcp-options', '选项', 'Options', 'text'),
      F('use-peer-dns', '使用对端 DNS', 'Use peer DNS', 'bool'), F('add-default-route', '添加默认路由', 'Add default route', 'bool'),
      F('status', '状态', 'Status', 'readonly'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('dhcpServers', 'network', 'DHCP 服务端', 'DHCP servers', '/ip/dhcp-server',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('interface', '接口', 'Interface', 'interface'),
      F('address-pool', '地址池', 'Address pool', 'text'), F('lease-time', '租约时间', 'Lease time', 'text'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('dhcpNetworks', 'network', 'DHCP 网络', 'DHCP networks', '/ip/dhcp-server/network',
    [F('.id', 'ID', 'ID', 'id'), F('address', '网段', 'Network', 'text', { required: true, placeholder: '10.0.0.0/24' }),
      F('gateway', '网关', 'Gateway', 'text'), F('dns-server', 'DNS', 'DNS server', 'text'), F('domain', '域名', 'Domain', 'text'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('dhcpLeases', 'network', 'DHCP 租约', 'DHCP leases', '/ip/dhcp-server/lease',
    [F('.id', 'ID', 'ID', 'id'), F('address', '地址', 'Address', 'readonly'), F('mac-address', 'MAC', 'MAC', 'readonly'),
      F('host-name', '主机名', 'Host name', 'readonly'), F('server', '服务端', 'Server', 'readonly'), F('status', '状态', 'Status', 'readonly'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['address', 'mac-address', 'host-name', 'server', 'status', 'comment'] }),
  S('dns', 'network', 'DNS 设置', 'DNS settings', '/ip/dns',
    [F('.id', 'ID', 'ID', 'id'), F('servers', '上游 DNS', 'Upstream servers', 'text', { placeholder: '223.5.5.5,119.29.29.29' }),
      F('dynamic-servers', '动态下发 DNS', 'Dynamic servers', 'readonly'),
      F('allow-remote-requests', '允许远程查询', 'Allow remote requests', 'bool'), F('cache-size', '缓存大小', 'Cache size', 'text'),
      F('cache-max-ttl', '缓存最大 TTL', 'Cache max TTL', 'text'),
      F('query-server-timeout', '查询超时', 'Query timeout', 'text'),
      F('query-total-timeout', '总查询超时', 'Total query timeout', 'text'),
      F('max-concurrent-queries', '最大并发查询', 'Max concurrent queries', 'number'),
      F('max-cache-entry-count', '最大缓存条目', 'Max cache entries', 'number'),
      F('address-preferred', '地址首选', 'Address preferred', 'select', { options: ['ipv4', 'ipv6'] }),
      F('use-dns-server-fqdn', '使用 FQDN', 'Use FQDN', 'bool')],
    { singleton: true, toggle: false, columns: ['servers', 'dynamic-servers', 'allow-remote-requests', 'cache-size', 'cache-max-ttl', 'use-dns-server-fqdn'] }),
  S('dnsStatic', 'network', '静态 DNS', 'Static DNS', '/ip/dns/static',
    [F('.id', 'ID', 'ID', 'id'), F('name', '域名', 'Name', 'text', { required: true }), F('address', '指向 IP', 'Address', 'text', { required: true }),
      F('ttl', 'TTL', 'TTL', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('routes', 'network', '路由表', 'Routes', '/ip/route',
    [F('.id', 'ID', 'ID', 'id'), F('dst-address', '目标网段', 'Destination', 'text', { required: true, placeholder: '0.0.0.0/0' }),
      F('gateway', '网关', 'Gateway', 'text', { required: true }), F('distance', '距离', 'Distance', 'number'),
      F('routing-table', '路由表', 'Routing table', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('pools', 'network', '地址池', 'IP pools', '/ip/pool',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('ranges', '范围', 'Ranges', 'text', { required: true, placeholder: '10.0.0.100-10.0.0.200' }),
      F('comment', '备注', 'Comment', 'text')]),
  S('neighbors', 'network', '邻居发现', 'Neighbors', '/ip/neighbor',
    [F('.id', 'ID', 'ID', 'id'), F('identity', '设备名', 'Identity', 'readonly'), F('address', '地址', 'Address', 'readonly'),
      F('mac-address', 'MAC', 'MAC', 'readonly'), F('interface', '接口', 'Interface', 'readonly'), F('platform', '平台', 'Platform', 'readonly')],
    { writable: false, toggle: false, readonly: true }),

  /* ---------- 防火墙 ---------- */
  S('firewallFilter', 'firewall', 'IPv4 过滤规则', 'Filter rules IPv4', '/ip/firewall/filter',
    [F('.id', 'ID', 'ID', 'id'), F('chain', '链', 'Chain', 'select', { options: ['input', 'forward', 'output', 'custom'] }),
      F('action', '动作', 'Action', 'select', { options: ['accept', 'drop', 'reject', 'jump', 'return', 'log', 'add-src-to-address-list'] }),
      F('src-address', '源地址', 'Source', 'text'), F('dst-address', '目标地址', 'Destination', 'text'),
      F('protocol', '协议', 'Protocol', 'select', { options: ['', 'tcp', 'udp', 'icmp', 'gre'] }), F('dst-port', '目标端口', 'Dst port', 'text'),
      F('in-interface', '入接口', 'In interface', 'interface'), F('out-interface', '出接口', 'Out interface', 'interface'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('firewallNat', 'firewall', 'IPv4 NAT 规则', 'NAT rules IPv4', '/ip/firewall/nat',
    [F('.id', 'ID', 'ID', 'id'), F('chain', '链', 'Chain', 'select', { options: ['srcnat', 'dstnat', 'custom'] }),
      F('action', '动作', 'Action', 'select', { options: ['masquerade', 'src-nat', 'dst-nat', 'redirect', 'accept', 'netmap'] }),
      F('src-address', '源地址', 'Source', 'text'), F('dst-address', '目标地址', 'Destination', 'text'),
      F('protocol', '协议', 'Protocol', 'select', { options: ['', 'tcp', 'udp', 'icmp'] }), F('dst-port', '目标端口', 'Dst port', 'text'),
      F('to-addresses', '转换到', 'To addresses', 'text'), F('to-ports', '转换端口', 'To ports', 'text'),
      F('out-interface', '出接口', 'Out interface', 'interface'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('firewallMangle', 'firewall', 'IPv4 Mangle 规则', 'Mangle rules IPv4', '/ip/firewall/mangle',
    [F('.id', 'ID', 'ID', 'id'), F('chain', '链', 'Chain', 'select', { options: ['prerouting', 'postrouting', 'input', 'output', 'forward'] }),
      F('action', '动作', 'Action', 'select', { options: ['mark-connection', 'mark-packet', 'set-priority', 'log', 'accept'] }),
      F('src-address', '源地址', 'Source', 'text'), F('dst-address', '目标地址', 'Destination', 'text'),
      F('new-connection-mark', '连接标记', 'Connection mark', 'text'), F('new-packet-mark', '包标记', 'Packet mark', 'text'),
      F('passthrough', '继续匹配', 'Passthrough', 'bool'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('addressLists', 'firewall', 'IPv4 地址列表', 'Address lists IPv4', '/ip/firewall/address-list',
    [F('.id', 'ID', 'ID', 'id'), F('list', '列表名', 'List', 'text', { required: true }), F('address', '地址', 'Address', 'text', { required: true }),
      F('timeout', '超时', 'Timeout', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('servicePorts', 'firewall', 'IPv4 服务端口', 'Service ports IPv4', '/ip/firewall/service-port',
    [F('.id', 'ID', 'ID', 'id'), F('name', '服务', 'Service', 'readonly'), F('port', '端口', 'Port', 'number'),
      F('protocol', '协议', 'Protocol', 'readonly'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),

  /* ---------- 防火墙 IPv6 ---------- */
  S('firewall6Filter', 'firewall6', 'IPv6 过滤规则', 'Filter rules IPv6', '/ipv6/firewall/filter',
    [F('.id', 'ID', 'ID', 'id'), F('chain', '链', 'Chain', 'select', { options: ['input', 'forward', 'output', 'custom'] }),
      F('action', '动作', 'Action', 'select', { options: ['accept', 'drop', 'reject', 'log', 'jump', 'return', 'passthrough'] }),
      F('src-address', '源地址', 'Source', 'text'), F('dst-address', '目标地址', 'Destination', 'text'),
      F('protocol', '协议', 'Protocol', 'select', { options: ['', 'tcp', 'udp', 'icmpv6', 'gre'] }), F('dst-port', '目标端口', 'Dst port', 'text'),
      F('in-interface', '入接口', 'In interface', 'interface'), F('out-interface', '出接口', 'Out interface', 'interface'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('firewall6Mangle', 'firewall6', 'IPv6 Mangle 规则', 'Mangle rules IPv6', '/ipv6/firewall/mangle',
    [F('.id', 'ID', 'ID', 'id'), F('chain', '链', 'Chain', 'select', { options: ['prerouting', 'postrouting', 'input', 'output', 'forward'] }),
      F('action', '动作', 'Action', 'select', { options: ['accept', 'mark-connection', 'mark-packet', 'mark-routing', 'set-priority', 'log', 'passthrough'] }),
      F('src-address', '源地址', 'Source', 'text'), F('dst-address', '目标地址', 'Destination', 'text'),
      F('new-connection-mark', '连接标记', 'Connection mark', 'text'), F('new-packet-mark', '包标记', 'Packet mark', 'text'),
      F('passthrough', '继续匹配', 'Passthrough', 'bool'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('addressLists6', 'firewall6', 'IPv6 地址列表', 'Address lists IPv6', '/ipv6/firewall/address-list',
    [F('.id', 'ID', 'ID', 'id'), F('list', '列表名', 'List', 'text', { required: true }), F('address', '地址', 'Address', 'text', { required: true, placeholder: '2001:db8::/32' }),
      F('timeout', '超时', 'Timeout', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('servicePorts6', 'firewall6', 'IPv6 服务端口', 'Service ports IPv6', '/ipv6/firewall/service-port',
    [F('.id', 'ID', 'ID', 'id'), F('name', '服务', 'Service', 'readonly'), F('port', '端口', 'Port', 'number'),
      F('protocol', '协议', 'Protocol', 'readonly'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),

  /* ---------- 无线 ---------- */
  S('wifi', 'wireless', 'WiFi 接口', 'WiFi interfaces', '/interface/wifi',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('ssid', 'SSID', 'SSID', 'text'),
      F('band', '频段', 'Band', 'select', { options: ['2ghz', '5ghz', '2ghz-ax', '5ghz-ax'] }), F('mode', '模式', 'Mode', 'select', { options: ['ap', 'station', 'monitor'] }),
      F('channel', '信道', 'Channel', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('wirelessSec', 'wireless', '无线安全', 'Wireless security', '/interface/wifi/security',
    [F('.id', 'ID', 'ID', 'id'), F('name', '配置名', 'Name', 'text', { required: true }), F('authentication-types', '认证方式', 'Auth types', 'text'),
      F('wpa2-pre-shared-key', 'WPA2 密码', 'WPA2 password', 'password'), F('wpa3-pre-shared-key', 'WPA3 密码', 'WPA3 password', 'password')],
    { columns: ['name', 'authentication-types'] }),

  /* ---------- VPN ---------- */
  S('pppSecrets', 'vpn', 'PPP 账号', 'PPP secrets', '/ppp/secret',
    [F('.id', 'ID', 'ID', 'id'), F('name', '用户名', 'User', 'text', { required: true }), F('password', '密码', 'Password', 'password'),
      F('service', '服务', 'Service', 'select', { options: ['pppoe', 'l2tp', 'pptp', 'sstp', 'any'] }), F('profile', '配置文件', 'Profile', 'text'),
      F('local-address', '本地地址', 'Local address', 'text'), F('remote-address', '远端地址', 'Remote address', 'text'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['name', 'service', 'profile', 'remote-address', 'comment', 'disabled'] }),
  S('pppProfiles', 'vpn', 'PPP 配置', 'PPP profiles', '/ppp/profile',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('local-address', '本地地址', 'Local address', 'text'),
      F('remote-address', '远端地址', 'Remote address', 'text'), F('dns-server', 'DNS', 'DNS server', 'text'),
      F('comment', '备注', 'Comment', 'text')]),
  S('pppActive', 'vpn', '在线 VPN 用户', 'Active VPN users', '/ppp/active',
    [F('.id', 'ID', 'ID', 'id'), F('name', '用户名', 'User', 'readonly'), F('service', '服务', 'Service', 'readonly'),
      F('address', '地址', 'Address', 'readonly'), F('caller-id', '呼叫方', 'Caller ID', 'readonly'), F('uptime', '在线时长', 'Uptime', 'readonly')],
    { writable: false, toggle: false, readonly: true }),
  S('wireguard', 'vpn', 'WireGuard', 'WireGuard', '/interface/wireguard',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('listen-port', '监听端口', 'Listen port', 'number'),
      F('private-key', '私钥', 'Private key', 'text', { placeholder: 'auto / 留空自动生成' }),
      F('public-key', '公钥', 'Public key', 'readonly'), F('mtu', 'MTU', 'MTU', 'number'), F('comment', '备注', 'Comment', 'text'),
      F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['name', 'listen-port', 'public-key', 'mtu', 'comment', 'disabled'] }),
  S('wgPeers', 'vpn', 'WG 对端', 'WG peers', '/interface/wireguard/peers',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text'), F('interface', '接口', 'Interface', 'interface'),
      F('private-key', '私钥', 'Private key', 'text', { placeholder: 'auto' }),
      F('public-key', '公钥', 'Public key', 'text'),
      F('endpoint', '对端地址', 'Endpoint', 'text'), F('endpoint-port', '对端端口', 'Endpoint port', 'number'),
      F('allowed-address', '允许地址', 'Allowed address', 'text', { required: true }),
      F('preshared-key', '预共享密钥', 'Preshared key', 'text', { placeholder: 'auto' }),
      F('persistent-keepalive', '持久保活', 'Persistent keepalive', 'text', { placeholder: '25s' }),
      F('responder', '仅响应', 'Responder', 'bool'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['name', 'interface', 'allowed-address', 'endpoint', 'endpoint-port', 'persistent-keepalive', 'responder', 'comment', 'disabled'] }),

  /* ---------- 队列 ---------- */
  S('simpleQueues', 'queue', '简单队列', 'Simple queues', '/queue/simple',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text'), F('target', '目标', 'Target', 'text', { required: true }),
      F('max-limit', '最大速率', 'Max limit', 'text', { placeholder: '10M/50M' }), F('limit-at', '保障速率', 'Limit at', 'text'),
      F('priority', '优先级', 'Priority', 'number'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('queueTree', 'queue', '队列树', 'Queue tree', '/queue/tree',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('parent', '父级', 'Parent', 'text'),
      F('packet-mark', '包标记', 'Packet mark', 'text'), F('max-limit', '最大速率', 'Max limit', 'text'),
      F('priority', '优先级', 'Priority', 'number'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),

  /* ---------- 系统 ---------- */
  S('connectionSettings', 'system', '设备管理', 'Devices', null, [], { virtual: true, toggle: false, writable: false }),
  S('identity', 'system', '设备标识', 'Identity', '/system/identity',
    [F('.id', 'ID', 'ID', 'id'), F('name', '设备名称', 'Device name', 'text', { required: true })],
    { singleton: true, toggle: false, columns: ['name'] }),
  S('clock', 'system', '系统时钟', 'Clock', '/system/clock',
    [F('.id', 'ID', 'ID', 'id'), F('time', '时间', 'Time', 'readonly'), F('date', '日期', 'Date', 'readonly'),
      F('time-zone-name', '时区', 'Time zone', 'text')],
    { singleton: true, toggle: false }),
  S('ntp', 'system', 'NTP 客户端', 'NTP client', '/system/ntp/client',
    [F('.id', 'ID', 'ID', 'id'), F('enabled', '启用', 'Enabled', 'bool'), F('server', '主服务器', 'Primary server', 'text'),
      F('server2', '备用服务器', 'Secondary server', 'text'), F('frequency', '同步频率', 'Frequency', 'text')],
    { singleton: true, toggle: false }),
  S('users', 'system', '用户管理', 'Users', '/user',
    [F('.id', 'ID', 'ID', 'id'), F('name', '用户名', 'User', 'text', { required: true }), F('password', '密码', 'Password', 'password'),
      F('group', '用户组', 'Group', 'select', { options: ['full', 'read', 'write', 'api', 'monitor'] }), F('comment', '备注', 'Comment', 'text')],
    { columns: ['name', 'group', 'comment'] }),
  S('userGroups', 'system', '用户组', 'User groups', '/user/group',
    [F('.id', 'ID', 'ID', 'id'), F('name', '组名', 'Name', 'text', { required: true }), F('policy', '权限', 'Policy', 'text'),
      F('comment', '备注', 'Comment', 'text')]),
  S('services', 'system', '系统服务', 'Services', '/ip/service',
    [F('.id', 'ID', 'ID', 'id'), F('name', '服务', 'Service', 'readonly'), F('port', '端口', 'Port', 'number'),
      F('protocol', '协议', 'Protocol', 'readonly'), F('available-from', '允许来源', 'Available from', 'text'),
      F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')]),
  S('schedulers', 'system', '计划任务', 'Scheduled tasks', '/system/scheduler',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('on-event', '执行脚本', 'On event', 'textarea'),
      F('start-date', '开始日期', 'Start date', 'text'), F('start-time', '开始时间', 'Start time', 'text'),
      F('interval', '间隔', 'Interval', 'text'), F('comment', '备注', 'Comment', 'text'), F('disabled', '禁用', 'Disabled', 'bool')],
    { columns: ['name', 'start-date', 'start-time', 'interval', 'comment', 'disabled'] }),
  S('scripts', 'system', '脚本', 'Scripts', '/system/script',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'text', { required: true }), F('source', '内容', 'Source', 'textarea'),
      F('owner', '所有者', 'Owner', 'readonly'), F('comment', '备注', 'Comment', 'text')],
    { columns: ['name', 'owner', 'comment'] }),
  S('systemPackage', 'system', '软件包', 'Packages', '/system/package',
    [F('.id', 'ID', 'ID', 'id'), F('name', '名称', 'Name', 'readonly'), F('version', '版本', 'Version', 'readonly'),
      F('enabled', '启用', 'Enabled', 'readonly'), F('scheduled', '计划', 'Scheduled', 'readonly')],
    { writable: false, toggle: false, readonly: true }),

  /* ---------- 日志 ---------- */
  S('logs', 'logs', '系统日志', 'System log', '/log',
    [F('.id', 'ID', 'ID', 'id'), F('time', '时间', 'Time', 'readonly'), F('topics', '主题', 'Topics', 'readonly'),
      F('message', '内容', 'Message', 'readonly')],
    { writable: false, toggle: false, readonly: true, columns: ['time', 'topics', 'message'] }),
];

const SECTION_MAP = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const PATH_MAP = Object.fromEntries(SECTIONS.filter((s) => s.path).map((s) => [s.path, s]));

/* ---------- 演示数据 ---------- */
const seed = {
  dashboard: [], traffic: [],
  connections: [
    { '.id': '*C1', 'src-address': '10.0.0.23:51244', 'dst-address': '223.5.5.5:53', protocol: 'udp', 'connection-state': 'established', bytes: '184320' },
    { '.id': '*C2', 'src-address': '10.0.0.31:44318', 'dst-address': '142.250.78.14:443', protocol: 'tcp', 'connection-state': 'established', bytes: '9421824' },
    { '.id': '*C3', 'src-address': '10.0.0.45:33891', 'dst-address': '10.0.0.1:53', protocol: 'udp', 'connection-state': 'new', bytes: '2048' },
    { '.id': '*C4', 'src-address': '10.0.0.18:60122', 'dst-address': '1.12.0.36:443', protocol: 'tcp', 'connection-state': 'established', bytes: '2048812' },
    { '.id': '*C5', 'src-address': '10.0.0.52:52301', 'dst-address': '151.101.1.69:443', protocol: 'tcp', 'connection-state': 'time-wait', bytes: '632144' },
  ],
  connections6: [
    { '.id': '*D1', 'src-address': '[2408:xxxx:1:2::23]:51244', 'dst-address': '[2400:3200::1]:53', protocol: 'udp', 'connection-state': 'established', bytes: '98304' },
    { '.id': '*D2', 'src-address': '[2408:xxxx:1:2::31]:44320', 'dst-address': '[2606:4700::6810:1234]:443', protocol: 'tcp', 'connection-state': 'established', bytes: '5242880' },
    { '.id': '*D3', 'src-address': '[fe80::1]:546', 'dst-address': '[ff02::1:2]:547', protocol: 'udp', 'connection-state': 'new', bytes: '1024' },
  ],
  interfaces: [
    { '.id': '*1', name: 'ether1', type: 'ether', mtu: '1500', 'mac-address': '48:A9:8A:11:20:01', comment: 'WAN 外网', disabled: 'false', running: 'true' },
    { '.id': '*2', name: 'ether2', type: 'ether', mtu: '1500', 'mac-address': '48:A9:8A:11:20:02', comment: 'LAN 主网', disabled: 'false', running: 'true' },
    { '.id': '*3', name: 'ether3', type: 'ether', mtu: '1500', 'mac-address': '48:A9:8A:11:20:03', comment: 'NAS', disabled: 'false', running: 'true' },
    { '.id': '*4', name: 'ether4', type: 'ether', mtu: '1500', 'mac-address': '48:A9:8A:11:20:04', comment: 'AP 回程', disabled: 'false', running: 'true' },
    { '.id': '*5', name: 'ether5', type: 'ether', mtu: '1500', 'mac-address': '48:A9:8A:11:20:05', comment: '', disabled: 'true', running: 'false' },
    { '.id': '*6', name: 'bridge-lan', type: 'bridge', mtu: '1500', 'mac-address': '48:A9:8A:11:20:02', comment: 'LAN 桥', disabled: 'false', running: 'true' },
    { '.id': '*7', name: 'docker-br', type: 'bridge', mtu: '1500', 'mac-address': '02:3E:1A:9C:44:10', comment: '容器网络', disabled: 'false', running: 'true' },
    { '.id': '*8', name: 'wg1', type: 'wireguard', mtu: '1420', 'mac-address': '', comment: 'WireGuard', disabled: 'false', running: 'true' },
  ],
  ipAddresses: [
    { '.id': '*1', address: '10.0.0.1/24', interface: 'bridge-lan', network: '10.0.0.0', comment: 'LAN 网关', disabled: 'false' },
    { '.id': '*2', address: '192.168.100.1/24', interface: 'docker-br', network: '192.168.100.0', comment: '容器网段', disabled: 'false' },
    { '.id': '*3', address: '10.0.1.2/30', interface: 'ether1', network: '10.0.1.0', comment: 'WAN 上行', disabled: 'false' },
  ],
  dhcpClients: [
    { '.id': '*1', interface: 'ether1', 'dhcp-options': '', 'use-peer-dns': 'false', 'add-default-route': 'true', status: 'bound', comment: 'WAN', disabled: 'false' },
  ],
  dhcpServers: [
    { '.id': '*1', name: 'dhcp-lan', interface: 'bridge-lan', 'address-pool': 'lan-pool', 'lease-time': '1d', comment: 'LAN DHCP', disabled: 'false' },
  ],
  dhcpNetworks: [
    { '.id': '*1', address: '10.0.0.0/24', gateway: '10.0.0.1', 'dns-server': '10.0.0.1', domain: 'lan', comment: '', disabled: 'false' },
  ],
  dhcpLeases: [
    { '.id': '*1', address: '10.0.0.23', 'mac-address': 'A4:83:E7:2C:91:0A', 'host-name': 'MacBook-Pro', server: 'dhcp-lan', status: 'bound', comment: '' },
    { '.id': '*2', address: '10.0.0.31', 'mac-address': '3C:22:FB:71:0D:92', 'host-name': 'NAS', server: 'dhcp-lan', status: 'bound', comment: '' },
    { '.id': '*3', address: '10.0.0.45', 'mac-address': 'DC:A6:32:88:14:EF', 'host-name': 'RaspberryPi', server: 'dhcp-lan', status: 'bound', comment: '' },
    { '.id': '*4', address: '10.0.0.52', 'mac-address': 'B8:27:EB:41:9C:03', 'host-name': 'AP-Living', server: 'dhcp-lan', status: 'waiting', comment: '' },
  ],
  dns: [
    { '.id': '*1', servers: '223.5.5.5,119.29.29.29', 'dynamic-servers': '10.0.1.1', 'allow-remote-requests': 'true',
      'cache-size': '4096KiB', 'cache-max-ttl': '1w', 'query-server-timeout': '2s', 'query-total-timeout': '10s',
      'max-concurrent-queries': '1024', 'max-cache-entry-count': '4096', 'address-preferred': 'ipv4', 'use-dns-server-fqdn': 'false' },
  ],
  dnsStatic: [
    { '.id': '*1', name: 'router.lan', address: '10.0.0.1', ttl: '1d', comment: '路由器', disabled: 'false' },
    { '.id': '*2', name: 'nas.lan', address: '10.0.0.31', ttl: '1d', comment: 'NAS', disabled: 'false' },
  ],
  routes: [
    { '.id': '*1', 'dst-address': '0.0.0.0/0', gateway: '10.0.1.1', distance: '1', 'routing-table': 'main', comment: '默认路由', disabled: 'false' },
    { '.id': '*2', 'dst-address': '192.168.100.0/24', gateway: 'docker-br', distance: '0', 'routing-table': 'main', comment: '容器', disabled: 'false' },
  ],
  pools: [
    { '.id': '*1', name: 'lan-pool', ranges: '10.0.0.100-10.0.0.200', comment: 'LAN 地址池' },
  ],
  neighbors: [
    { '.id': '*1', identity: 'NAS', address: '10.0.0.31', 'mac-address': '3C:22:FB:71:0D:92', interface: 'ether3', platform: 'Linux' },
    { '.id': '*2', identity: 'AP-Living', address: '10.0.0.52', 'mac-address': 'B8:27:EB:41:9C:03', interface: 'ether4', platform: 'RouterOS' },
  ],
  firewallFilter: [
    { '.id': '*1', chain: 'input', action: 'accept', 'src-address': '', 'dst-address': '', protocol: 'icmp', 'dst-port': '', 'in-interface': 'bridge-lan', 'out-interface': '', comment: '允许 LAN Ping', disabled: 'false' },
    { '.id': '*2', chain: 'input', action: 'drop', 'src-address': '', 'dst-address': '', protocol: 'tcp', 'dst-port': '22', 'in-interface': 'ether1', 'out-interface': '', comment: '拒绝外网 SSH', disabled: 'false' },
    { '.id': '*3', chain: 'forward', action: 'accept', 'src-address': '10.0.0.0/24', 'dst-address': '', protocol: '', 'dst-port': '', 'in-interface': 'bridge-lan', 'out-interface': '', comment: '允许 LAN 转发', disabled: 'false' },
    { '.id': '*4', chain: 'input', action: 'accept', 'src-address': '10.0.0.0/24', 'dst-address': '', protocol: 'tcp', 'dst-port': '8291', 'in-interface': '', 'out-interface': '', comment: '允许 LAN WinBox', disabled: 'false' },
  ],
  firewallNat: [
    { '.id': '*1', chain: 'srcnat', action: 'masquerade', 'src-address': '10.0.0.0/24', 'dst-address': '', protocol: '', 'dst-port': '', 'to-addresses': '', 'to-ports': '', 'out-interface': 'ether1', comment: 'WAN 伪装', disabled: 'false' },
    { '.id': '*2', chain: 'dstnat', action: 'dst-nat', 'src-address': '', 'dst-address': '', protocol: 'tcp', 'dst-port': '8080', 'to-addresses': '10.0.0.31:5000', 'to-ports': '', 'out-interface': '', comment: 'NAS 端口映射', disabled: 'false' },
  ],
  firewallMangle: [
    { '.id': '*1', chain: 'prerouting', action: 'mark-connection', 'src-address': '10.0.0.0/24', 'dst-address': '', 'new-connection-mark': 'lan-conn', 'new-packet-mark': '', passthrough: 'true', comment: 'LAN 标记', disabled: 'false' },
  ],
  addressLists: [
    { '.id': '*1', list: 'allowed-admin', address: '10.0.0.23', timeout: '', comment: '管理机', disabled: 'false' },
    { '.id': '*2', list: 'blocked', address: '45.133.1.22', timeout: '', comment: '扫描器', disabled: 'false' },
  ],
  servicePorts: [
    { '.id': '*1', name: 'ssh', port: '22', protocol: 'tcp', comment: '', disabled: 'false' },
    { '.id': '*2', name: 'www', port: '80', protocol: 'tcp', comment: '', disabled: 'false' },
    { '.id': '*3', name: 'api', port: '8728', protocol: 'tcp', comment: '', disabled: 'false' },
    { '.id': '*4', name: 'winbox', port: '8291', protocol: 'tcp', comment: '', disabled: 'false' },
  ],
  firewall6Filter: [
    { '.id': '*1', chain: 'input', action: 'accept', 'src-address': '', 'dst-address': '', protocol: 'icmpv6', 'dst-port': '', 'in-interface': '', 'out-interface': '', comment: '允许 ICMPv6', disabled: 'false' },
    { '.id': '*2', chain: 'input', action: 'accept', 'src-address': 'fe80::/10', 'dst-address': '', protocol: 'udp', 'dst-port': '546', 'in-interface': 'ether1', 'out-interface': '', comment: '允许 DHCPv6-PD', disabled: 'false' },
    { '.id': '*3', chain: 'input', action: 'drop', 'src-address': '', 'dst-address': '', protocol: '', 'dst-port': '', 'in-interface': 'ether1', 'out-interface': '', comment: '拒绝外网入站', disabled: 'false' },
    { '.id': '*4', chain: 'forward', action: 'accept', 'src-address': '', 'dst-address': '', protocol: 'icmpv6', 'dst-port': '', 'in-interface': 'bridge-lan', 'out-interface': '', comment: '允许 LAN 转发', disabled: 'false' },
  ],
  firewall6Mangle: [
    { '.id': '*1', chain: 'prerouting', action: 'mark-connection', 'src-address': '2001:db8::/32', 'dst-address': '', 'new-connection-mark': 'v6-conn', 'new-packet-mark': '', passthrough: 'true', comment: 'IPv6 标记', disabled: 'false' },
  ],
  addressLists6: [
    { '.id': '*1', list: 'v6-local', address: '2001:db8::/32', timeout: '', comment: '本地前缀', disabled: 'false' },
  ],
  servicePorts6: [
    { '.id': '*1', name: 'ssh', port: '22', protocol: 'tcp', comment: '', disabled: 'false' },
    { '.id': '*2', name: 'www', port: '80', protocol: 'tcp', comment: '', disabled: 'false' },
  ],
  wifi: [
    { '.id': '*1', name: 'wifi1', ssid: 'HomeNet-5G', band: '5ghz-ax', mode: 'ap', channel: '36', comment: '主 SSID', disabled: 'false' },
    { '.id': '*2', name: 'wifi2', ssid: 'HomeNet-2G', band: '2ghz', mode: 'ap', channel: 'auto', comment: '兼容 SSID', disabled: 'false' },
  ],
  wirelessSec: [
    { '.id': '*1', name: 'sec-home', 'authentication-types': 'wpa2-psk,wpa3-psk', 'wpa2-pre-shared-key': '••••••••', 'wpa3-pre-shared-key': '' },
  ],
  pppSecrets: [
    { '.id': '*1', name: 'vpn-user', password: '••••••••', service: 'l2tp', profile: 'default-encryption', 'local-address': '10.0.9.1', 'remote-address': '10.0.9.10', comment: '远程拨号', disabled: 'false' },
  ],
  pppProfiles: [
    { '.id': '*1', name: 'default-encryption', 'local-address': '10.0.9.1', 'remote-address': '10.0.9.2-10.0.9.20', 'dns-server': '10.0.0.1', comment: '' },
  ],
  pppActive: [
    { '.id': '*1', name: 'vpn-user', service: 'l2tp', address: '10.0.9.10', 'caller-id': '203.0.113.44', uptime: '2h14m' },
  ],
  wireguard: [
    { '.id': '*1', name: 'wg1', 'listen-port': '13231', 'private-key': 'oE7tM2QwX9vK4pL6nR8sY1aB3cD5eF7gH0jKlMnOpQ=',
      'public-key': 'u7gYAg5tkioJDcm3hyS7pm79eADKPs/ZUGON6/fF3iI=', mtu: '1420', comment: '站点互联', disabled: 'false' },
  ],
  wgPeers: [
    { '.id': '*1', name: 'branch-1', interface: 'wg1', 'private-key': 'auto',
      'public-key': '8sT9kL2mN4pQ6rV8wX0yZ2aB4cD6eF8gH0jK2lM4nP6=', endpoint: '203.0.113.9', 'endpoint-port': '13231',
      'allowed-address': '10.0.9.2/32', 'preshared-key': '', 'persistent-keepalive': '25s', responder: 'false', comment: '分支', disabled: 'false' },
  ],
  simpleQueues: [
    { '.id': '*1', name: 'limit-nas', target: '10.0.0.31/32', 'max-limit': '20M/50M', 'limit-at': '5M/10M', priority: '8', comment: 'NAS 限速', disabled: 'false' },
    { '.id': '*2', name: 'guest', target: '10.0.0.150-10.0.0.200', 'max-limit': '5M/10M', 'limit-at': '1M/2M', priority: '8', comment: '访客', disabled: 'false' },
  ],
  queueTree: [
    { '.id': '*1', name: 'wan-down', parent: 'global', 'packet-mark': 'lan-conn', 'max-limit': '200M', priority: '8', comment: '', disabled: 'false' },
  ],
  identity: [{ '.id': '*1', name: 'RouterOS-10.0.0.1' }],
  clock: [{ '.id': '*1', time: '17:05:32', date: '2026-11-17', 'time-zone-name': 'Asia/Shanghai' }],
  ntp: [{ '.id': '*1', enabled: 'true', server: '0.pool.ntp.org', server2: '1.pool.ntp.org', frequency: 'weekly' }],
  users: [
    { '.id': '*1', name: 'admin', group: 'full', comment: '管理员' },
    { '.id': '*2', name: 'Backspace', group: 'full', comment: '' },
    { '.id': '*3', name: 'monitor', group: 'read', comment: '监控只读' },
  ],
  userGroups: [
    { '.id': '*1', name: 'full', policy: 'ftp,reboot,read,write,policy,test,winbox,password,sniff,sensitive,api', comment: '' },
    { '.id': '*2', name: 'read', policy: 'read,winbox,api', comment: '' },
  ],
  services: [
    { '.id': '*1', name: 'ssh', port: '22', protocol: 'tcp', 'available-from': '10.0.0.0/24', comment: '', disabled: 'false' },
    { '.id': '*2', name: 'www', port: '80', protocol: 'tcp', 'available-from': '', comment: '', disabled: 'false' },
    { '.id': '*3', name: 'api', port: '8728', protocol: 'tcp', 'available-from': '10.0.0.0/24', comment: '', disabled: 'false' },
    { '.id': '*4', name: 'winbox', port: '8291', protocol: 'tcp', 'available-from': '', comment: '', disabled: 'false' },
    { '.id': '*5', name: 'ftp', port: '21', protocol: 'tcp', 'available-from': '', comment: '', disabled: 'true' },
  ],
  schedulers: [
    { '.id': '*1', name: 'daily-backup', 'on-event': '/system/backup/save name=daily', 'start-date': '2026-01-01', 'start-time': '03:00:00', interval: '1d', comment: '每日备份', disabled: 'false' },
  ],
  scripts: [
    { '.id': '*1', name: 'backup', source: '/system/backup/save name=auto-backup', owner: 'admin', comment: '备份脚本' },
  ],
  systemPackage: [
    { '.id': '*1', name: 'routeros', version: '7.15.2', enabled: 'true', scheduled: 'false' },
    { '.id': '*2', name: 'wifi', version: '7.15.2', enabled: 'true', scheduled: 'false' },
    { '.id': '*3', name: 'container', version: '7.15.2', enabled: 'false', scheduled: 'false' },
  ],
  logs: [],
};

let logSeq = 1;
const logTopics = ['interface', 'ip', 'dhcp', 'firewall', 'system', 'wifi', 'ntp', 'user'];
const logMessages = [
  'ether1 link up, speed 1G, full duplex',
  'DHCP lease assigned to 10.0.0.23',
  'accepted input: TCP 10.0.0.23 -> 10.0.0.1:8291',
  'user Backspace logged in from 10.0.0.23 via api',
  'NTP synchronized with 0.pool.ntp.org',
  'wifi1: station connected, signal -54dBm',
  'dropped input from 45.133.1.22, port 22',
  'route 0.0.0.0/0 reachable via 10.0.1.1',
  'system backup saved: daily.backup',
  'DNS cache flushed',
];
function makeLog(ts) {
  const d = new Date(ts);
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
  return {
    '.id': '*L' + logSeq,
    time,
    topics: logTopics[logSeq % logTopics.length],
    message: logMessages[logSeq % logMessages.length],
  };
}
for (let i = 0; i < 40; i++) { const l = makeLog(Date.now() - i * 37000); logSeq++; seed.logs.push(l); }

module.exports = { GROUPS, SECTIONS, SECTION_MAP, PATH_MAP, seed, makeLog };
