'use strict';

/* ================= 国际化 ================= */
const I18N = {
  zh: {
    page_title: 'ROS Center', brand: 'ROS', brand_sub: 'Center', search_menu: '搜索菜单…',
    cpu: 'CPU', mem: '内存', disk: '存储', uptime: '运行', export_hint: '导出配置快照',
    overview_title: '系统概览', if_title: '接口详情',
    total_rx: '下行速率', total_tx: '上行速率', active_if: '活跃接口', peak_rx: '峰值下行速率', peak_tx: '峰值上行速率',
    rx_hint: '所有接口接收速率之和', tx_hint: '所有接口发送速率之和', if_hint: '已启用并运行的接口',
    rx_hint_one: '所选接口的接收速率', tx_hint_one: '所选接口的发送速率',
    trend_title: '实时流量趋势', trend_sub: '最近 6 分钟 · 每秒采样', conn_title: '连接状态',
    conn_sub: '活跃连接数 · 来自路由器连接表', conn_total: '连接总数', health_title: '设备健康', health_sub: 'CPU 与内存占用',
    ifdist_title: '接口类型分布', ifdist_sub: '按实际接口类型统计，非估算', wlan_title: '终端概览', wlan_sub: '在线终端与接口分布', top_if: '接口流量排行 (TOP 10)',
    top_if_sub: '按累计流量排序', top_conn: '连接流量排行 (TOP 10)', top_conn_sub: '按连接字节数排序',
    all: '全部接口', legend_rx: '下载 RX', legend_tx: '上传 TX',
    live: '在线', demo: '演示 DEMO', connecting: '连接中', reconnect: '重连中', offline: '离线',
    stream_on: '实时流', stream_off: '轮询',
    add: '新增', refresh: '刷新', save: '保存', cancel: '取消', edit: '编辑', delete: '删除',
    auto_refresh: '自动刷新', auto_on: '自动刷新已开启', auto_off: '自动刷新已关闭',
    conn_total_hint: '当前活跃连接', conn_group_all: '全部', conn_tcp: 'TCP', conn_udp: 'UDP', conn_other: '其他', conn_v4: 'IPv4', conn_v6: 'IPv6',
    device_online: '在线', device_offline: '离线', demo_only: '演示 DEMO',
    stats_iface_all_short: '全部网口', stats_chart_prefix: '范围', search_hint: '快捷键搜索菜单',
    dash_iface: '速率接口', dash_iface_title: '仪表盘速率接口',
    dash_iface_sub: '上下行速率、趋势与峰值均按所选接口统计',
    dash_iface_all: '全部接口', dash_iface_all_sub: '所有网口速率之和',
    dash_iface_search: '搜索接口…', dash_iface_empty: '没有匹配的接口',
    dash_iface_foot: '选择立即生效，并按设备记住', dash_iface_only: '仅统计 {name}',
    dash_iface_up: '运行中', dash_iface_down: '未运行',
    enable: '启用', disable: '禁用', enabled: '已启用', disabled: '已禁用', yes: '是', no: '否',
    run_script: '运行', run_script_row: '运行此脚本', run_script_none: '请先选择要运行的脚本',
    run_script_ok: '脚本已提交运行', run_script_confirm: '确定立即运行选中的 {n} 个脚本？',
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
    devices: '设备管理', devices_sub: '集中管控多台 RouterOS 设备',
    device_name: '设备名称', device_primary: '设为主设备', device_active: '当前设备', device_add: '新增设备',
    device_edit: '编辑设备', device_del: '删除设备', device_del_msg: '确定删除该设备？其历史数据和演示配置将一并清除。',
    device_status: '状态', device_test: '测试连接', device_saved: '设备已保存', device_switch: '已切换到',
    device_current: '当前为主设备', device_count: '设备数量', device_hint: '点顶栏设备下拉即可切换；主设备决定默认显示哪台。',
    device_reconnect: '重新连接', device_no_password: '留空表示不修改', device_required: '请填写名称、地址、端口和账号',
    theme_unifi: 'UniFi 风格', theme_default: '经典蓝', theme_glass: '毛玻璃', theme_porcelain: '青花瓷', theme_liquid: '液态玻璃',
    theme_aurora: '极光', theme_ocean: '深海', theme_sakura: '樱粉', theme_mono: '黑白极简',
    theme_forest: '森林绿', theme_amber: '琥珀金', theme_violet: '紫罗兰', theme_coffee: '咖啡棕', theme_mint: '薄荷绿',
    mode_light: '浅色', mode_dark: '深色', mode_system: '跟随系统',
    theme_title: '配色风格', mode_title: '深浅模式', conn_settings: '连接设置', conn_settings_sub: '直接在网页里填写 RouterOS 地址与账号，无需编辑 .env 文件',
    conn_host: 'RouterOS 地址', conn_port: 'API 端口', conn_user: '账号', conn_password: '密码',
    conn_tls: '使用 API-SSL (TLS)', conn_demo: '演示模式（不连接真实路由器）', conn_test: '测试连接',
    conn_save: '保存并连接', conn_saved: '连接设置已保存，正在重新连接', conn_test_ok: '连接成功', conn_test_fail: '连接失败',
    conn_tip: '填写后点"测试连接"验证，再点"保存并连接"。设置保存在容器的 /app/data/settings.json，重启不会丢失。首次使用演示模式可先熟悉界面。',
    conn_masked: '已保存密码（留空表示不修改）', conn_current: '当前状态', conn_security: '安全建议',
    conn_security_tip: '请在 RouterOS 上为 WebUI 单独建只读账号，并用防火墙限制 API 端口来源，切勿把服务暴露到公网。',
    sidebar_hint: '点击箭头折叠 · 拖动边缘调宽',
    conn_web_port: 'WebUI 监听端口', conn_web_port_hint: '容器内监听端口；修改后需重启容器，并把 compose 的端口映射同步为「外部端口:此端口」',
    conn_host_port: '外部访问端口', conn_restart: '监听端口已保存，请重启容器后生效',
    wg_qr: '扫码添加', wg_qr_title: 'WireGuard 客户端配置', wg_qr_sub: '修改参数后扫描二维码，或在手机客户端导入 .conf 文件',
    wg_addr: '客户端地址', wg_priv: '客户端私钥', wg_dns: 'DNS', wg_pub: '服务端公钥', wg_endpoint: '服务端地址',
    wg_allowed: '允许 IP', wg_keepalive: '持久保活(秒)', wg_copy: '复制配置', wg_download: '下载 .conf',
    wg_qr_tip: '二维码等同于配置文件，客户端私钥请勿泄露。真实模式下请填写客户端生成的私钥，并把对应公钥加到 RouterOS 对端。',
    login: '登录', logout: '退出登录', export_snapshot: '导出配置快照',
    login_title: 'WebUI 登录保护', login_user: '用户名', login_pass: '新密码',
    login_hint: '启用后访问 WebUI 需要先登录。账号密码保存在容器 /app/data/auth.json（仅哈希），会话 Cookie 有效期 7 天。',
    login_user_hint: '1-32 位字母、数字或 _ . -', login_pass_hint: '至少 6 位；修改后当前会话自动续期',
    login_enable: '保存并启用', login_disable: '关闭登录保护',
    login_saved: '登录密码已保存', login_disabled: '登录保护已关闭', login_current: '当前登录账号',
    wg_name: '名称', wg_iface: 'WireGuard 接口', wg_priv_auto: '自动生成密钥对', wg_client_pub: '客户端公钥（写入对端）',
    wg_server_pub: '服务端公钥', wg_endpoint_port: '服务端端口', wg_addr_label: '客户端隧道地址',
    wg_route: '客户端 AllowedIPs', wg_psk: '预共享密钥', wg_responder: '仅响应 (responder)',
    wg_save_peer: '保存到 RouterOS', wg_peer_saved: '对端已保存', wg_auto: '自动', wg_required_wg: '请填写接口、允许地址和私钥',
    sort_hint: '点击排序（升序 / 降序）', singleton_hint: '该页面只有一组配置，点「编辑」直接修改',
    stats_title: '流量统计', stats_sub: '按网口真实计数器差分 · 重拨清零自动续计',
    stats_chart: '流量趋势', stats_detail: '每日明细', stats_from_router: '真实计数器差分',
    stats_scope: '统计网口', stats_scope_all: '全部网口', stats_scope_custom: '指定网口', stats_scope_wait: '读取网口…',
    stats_iface_tip: '可多选；只选 WAN 口避免内外网重复计入。历史按网口分别保存。',
    stats_iface_all: '全部网口', stats_iface_custom: '仅统计勾选的网口',
    stats_iface_manual: '自定义网口名 / 通配符', stats_iface_manual_hint: '支持 * 和 ?，如 pppoe-*、vlan??；多个用逗号或换行分隔',
    stats_iface_no_list: '暂未读取到网口', stats_iface_saved: '统计网口已保存，历史按网口即时重算',
    stats_iface_need_one: '请至少选择一个网口', stats_custom_btn: '自定义',
    stats_iface_matched: '已选', stats_iface_unit: '个网口', stats_iface_none: '当前没有匹配到任何网口，请检查名称',
    stats_range_today: '今日', stats_range_week: '本周', stats_range_month: '本月', stats_range_total: '累计',
    stats_card_rx: '下载', stats_card_tx: '上传', stats_card_sum: '合计', stats_card_rate: '当前速率',
    stats_series_today: '今日 · 按小时', stats_series_week: '本周 · 按天', stats_series_month: '本月 · 按天', stats_series_total: '累计 · 按月',
    stats_source_real: '真实数据 · rx-byte / tx-byte 按网口差分，每秒采样',
    stats_source_fake: '演示 / 离线：统计不累计，数字不是真实流量',
    stats_updated: '更新于', stats_sample: '最近采样', stats_no_sample: '尚无真实采样',
    stats_reset_notice: '旧版混合统计已清空（无法按网口拆分），从现在起按网口精确记录',
    stats_reset_info: '检测到 {n} 次计数器清零（PPPoE 重拨 / 接口重建），已按清零后的真实计数继续累计',
    stats_gap_info: '服务停机 {n} 次，停机期间的真实差分已计入当日合计（不摊到具体小时）',
    stats_migrated: '历史已从旧版迁移并补出每日每网口数据',
    stats_col_time: '时间', stats_col_iface: '网口', stats_col_sum: '合计', stats_detail_all: '全部网口（小计）',
    stats_detail_hint: '今日按小时、本周/本月按天、累计按月，逐网口列出真实用量',
    stats_detail_empty: '该范围暂无真实采样数据', stats_page: '第', stats_of: '/', stats_page_unit: '页',
    stats_prev: '上一页', stats_next: '下一页',
  },
  en: {
    page_title: 'ROS Center', brand: 'ROS', brand_sub: 'Center', search_menu: 'Search menu…',
    cpu: 'CPU', mem: 'Memory', disk: 'Disk', uptime: 'Uptime', export_hint: 'Export config snapshot',
    overview_title: 'Dashboard', if_title: 'Interface details',
    total_rx: 'Download rate', total_tx: 'Upload rate', active_if: 'Active ports', peak_rx: 'Peak download rate', peak_tx: 'Peak upload rate',
    rx_hint: 'Sum of receive rates', tx_hint: 'Sum of transmit rates', if_hint: 'Enabled and running interfaces',
    rx_hint_one: 'Receive rate on the selected interface', tx_hint_one: 'Transmit rate on the selected interface',
    trend_title: 'Live traffic trend', trend_sub: 'Last 6 minutes · 1s sampling', conn_title: 'Connection status',
    conn_sub: 'Active connections · from the router connection table', conn_total: 'Total connections', health_title: 'Device health', health_sub: 'CPU and memory usage',
    ifdist_title: 'Interface types', ifdist_sub: 'Counted by real interface type, not estimated', wlan_title: 'Client overview', wlan_sub: 'Online clients and interface distribution', top_if: 'Interface traffic (TOP 10)',
    top_if_sub: 'Sorted by total traffic', top_conn: 'Connection traffic (TOP 10)', top_conn_sub: 'Sorted by bytes',
    all: 'All interfaces', legend_rx: 'Download RX', legend_tx: 'Upload TX',
    live: 'Online', demo: 'DEMO', connecting: 'Connecting', reconnect: 'Reconnecting', offline: 'Offline',
    stream_on: 'STREAM', stream_off: 'POLL',
    add: 'Add', refresh: 'Refresh', save: 'Save', cancel: 'Cancel', edit: 'Edit', delete: 'Delete',
    auto_refresh: 'Auto refresh', auto_on: 'Auto refresh on', auto_off: 'Auto refresh off',
    conn_total_hint: 'Active connections', conn_group_all: 'All', conn_tcp: 'TCP', conn_udp: 'UDP', conn_other: 'Other', conn_v4: 'IPv4', conn_v6: 'IPv6',
    device_online: 'Online', device_offline: 'Offline', demo_only: 'DEMO',
    stats_iface_all_short: 'All interfaces', stats_chart_prefix: 'Range', search_hint: 'Search menu shortcut',
    dash_iface: 'Rate source', dash_iface_title: 'Dashboard rate source',
    dash_iface_sub: 'Uplink, downlink, trend and peak all follow the selected interface',
    dash_iface_all: 'All interfaces', dash_iface_all_sub: 'Sum of all interfaces',
    dash_iface_search: 'Search interfaces…', dash_iface_empty: 'No matching interfaces',
    dash_iface_foot: 'Applies instantly and is remembered per device', dash_iface_only: '{name} only',
    dash_iface_up: 'Up', dash_iface_down: 'Down',
    enable: 'Enable', disable: 'Disable', enabled: 'Enabled', disabled: 'Disabled', yes: 'Yes', no: 'No',
    run_script: 'Run', run_script_row: 'Run this script', run_script_none: 'Select the scripts to run first',
    run_script_ok: 'Script run submitted', run_script_confirm: 'Run the {n} selected script(s) now?',
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
    devices: 'Devices', devices_sub: 'Manage multiple RouterOS routers in one place',
    device_name: 'Device name', device_primary: 'Set primary', device_active: 'Current device', device_add: 'Add device',
    device_edit: 'Edit device', device_del: 'Delete device', device_del_msg: 'Delete this device? Its history and demo config will be removed.',
    device_status: 'Status', device_test: 'Test connection', device_saved: 'Device saved', device_switch: 'Switched to',
    device_current: 'Primary device', device_count: 'Devices', device_hint: 'Use the device dropdown in the top bar to switch; the primary device is shown by default.',
    device_reconnect: 'Reconnect', device_no_password: 'Leave blank to keep', device_required: 'Name, host, port and user are required',
    theme_unifi: 'UniFi', theme_default: 'Classic blue', theme_glass: 'Glass', theme_porcelain: 'Porcelain', theme_liquid: 'Liquid glass',
    theme_aurora: 'Aurora', theme_ocean: 'Deep sea', theme_sakura: 'Sakura', theme_mono: 'Mono',
    theme_forest: 'Forest', theme_amber: 'Amber', theme_violet: 'Violet', theme_coffee: 'Coffee', theme_mint: 'Mint',
    mode_light: 'Light', mode_dark: 'Dark', mode_system: 'System',
    theme_title: 'Color theme', mode_title: 'Light / dark mode', conn_settings: 'Connection settings', conn_settings_sub: 'Set RouterOS address and credentials right in the web UI - no .env editing needed',
    conn_host: 'RouterOS address', conn_port: 'API port', conn_user: 'Username', conn_password: 'Password',
    conn_tls: 'Use API-SSL (TLS)', conn_demo: 'Demo mode (do not connect to a real router)', conn_test: 'Test connection',
    conn_save: 'Save & connect', conn_saved: 'Settings saved, reconnecting', conn_test_ok: 'Connection successful', conn_test_fail: 'Connection failed',
    conn_tip: 'Click "Test connection" to verify, then "Save & connect". Settings persist in /app/data/settings.json. Demo mode is handy for a first look.',
    conn_masked: 'Password saved (leave blank to keep)', conn_current: 'Current status', conn_security: 'Security tip',
    conn_security_tip: 'Create a dedicated read-only user on RouterOS and restrict the API port with firewall rules. Never expose this service to the internet.',
    sidebar_hint: 'Collapse · drag edge to resize',
    conn_web_port: 'WebUI listen port', conn_web_port_hint: 'Container listen port. Restart the container after changing it and update the compose mapping to "external:this port"',
    conn_host_port: 'External port', conn_restart: 'Port saved. Restart the container to apply',
    wg_qr: 'Scan to add', wg_qr_title: 'WireGuard client config', wg_qr_sub: 'Edit the fields, then scan the QR or import the .conf on your device',
    wg_addr: 'Client address', wg_priv: 'Client private key', wg_dns: 'DNS', wg_pub: 'Server public key', wg_endpoint: 'Server endpoint',
    wg_allowed: 'Allowed IPs', wg_keepalive: 'Persistent keepalive (s)', wg_copy: 'Copy config', wg_download: 'Download .conf',
    wg_qr_tip: 'The QR equals the config file - keep the client private key secret. In live mode, paste the private key generated on the client and add its public key to RouterOS.',
    login: 'Sign in', logout: 'Sign out', export_snapshot: 'Export snapshot',
    login_title: 'WebUI login', login_user: 'Username', login_pass: 'New password',
    login_hint: 'When enabled, signing in is required. Stored as a hash in /app/data/auth.json; the session cookie lasts 7 days.',
    login_user_hint: '1-32 letters, digits, _ . -', login_pass_hint: 'At least 6 characters; the current session is renewed on change',
    login_enable: 'Save & enable', login_disable: 'Disable login',
    login_saved: 'Login password saved', login_disabled: 'Login protection disabled', login_current: 'Signed in as',
    wg_name: 'Name', wg_iface: 'WireGuard interface', wg_priv_auto: 'Generate keypair', wg_client_pub: 'Client public key (saved to peer)',
    wg_server_pub: 'Server public key', wg_endpoint_port: 'Server port', wg_addr_label: 'Client tunnel address',
    wg_route: 'Client AllowedIPs', wg_psk: 'Preshared key', wg_responder: 'Responder only',
    wg_save_peer: 'Save to RouterOS', wg_peer_saved: 'Peer saved', wg_auto: 'Auto', wg_required_wg: 'Interface, allowed address and private key are required',
    sort_hint: 'Click to sort (ascending / descending)', singleton_hint: 'A single settings block - use Edit to change values',
    stats_title: 'Traffic statistics', stats_sub: 'Real per-interface counter deltas · redial resets carried forward',
    stats_chart: 'Traffic trend', stats_detail: 'Daily details', stats_from_router: 'Real counter deltas',
    stats_scope: 'Interfaces', stats_scope_all: 'All interfaces', stats_scope_custom: 'Selected interfaces', stats_scope_wait: 'Loading interfaces…',
    stats_iface_tip: 'Multi-select; pick only the WAN uplink to avoid double counting. History is stored per interface.',
    stats_iface_all: 'All interfaces', stats_iface_custom: 'Only checked interfaces',
    stats_iface_manual: 'Custom names / wildcards', stats_iface_manual_hint: 'Wildcards * and ? are supported, e.g. pppoe-*, vlan??; separate with commas or new lines',
    stats_iface_no_list: 'No interfaces available yet', stats_iface_saved: 'Interfaces saved. History is recomputed per interface immediately',
    stats_iface_need_one: 'Select at least one interface', stats_custom_btn: 'Custom',
    stats_iface_matched: 'Selected', stats_iface_unit: 'interfaces', stats_iface_none: 'No interface matches the current selection - check the names',
    stats_range_today: 'Today', stats_range_week: 'This week', stats_range_month: 'This month', stats_range_total: 'All time',
    stats_card_rx: 'Download', stats_card_tx: 'Upload', stats_card_sum: 'Total', stats_card_rate: 'Current rate',
    stats_series_today: 'Today · hourly', stats_series_week: 'This week · daily', stats_series_month: 'This month · daily', stats_series_total: 'All time · monthly',
    stats_source_real: 'Real data · per-interface rx-byte / tx-byte deltas, 1s sampling',
    stats_source_fake: 'Demo / offline: not accumulating, numbers are not real traffic',
    stats_updated: 'Updated', stats_sample: 'Last sample', stats_no_sample: 'No real sample yet',
    stats_reset_notice: 'Legacy mixed-interface history was cleared (cannot be split per interface); new history is exact',
    stats_reset_info: '{n} counter resets detected (PPPoE redial / interface re-created); post-reset real bytes keep accumulating',
    stats_gap_info: '{n} service gaps: real deltas during downtime were added to the day total (never spread across hours)',
    stats_migrated: 'Legacy history migrated into per-day, per-interface buckets',
    stats_col_time: 'Time', stats_col_iface: 'Interface', stats_col_sum: 'Total', stats_detail_all: 'All interfaces (subtotal)',
    stats_detail_hint: 'Hourly today, daily for week/month, monthly for all time - listed per interface',
    stats_detail_empty: 'No real samples in this range yet', stats_page: 'Page', stats_of: '/', stats_page_unit: '',
    stats_prev: 'Previous', stats_next: 'Next',
  },
};
const urlLang = new URLSearchParams(location.search).get('lang');
let lang = urlLang === 'en' || urlLang === 'zh' ? urlLang : (localStorage.getItem('ros-traffic-lang') === 'en' ? 'en' : 'zh');
const t = (k) => I18N[lang][k] || k;
const tx = (obj) => (obj && (obj[lang] || obj.zh)) || '';
const L = (zh, en) => (lang === 'zh' ? zh : en);

/* ================= 状态 ================= */
let autoRefreshPref = true;
try { autoRefreshPref = localStorage.getItem('ros-auto-refresh') !== '0'; } catch (e) { /* ignore */ }
const state = {
  schema: null, section: 'dashboard', latest: null, points: [], ifHistory: new Map(),
  resourceHistory: [], connHistory: [], rows: [], rowFilter: '', page: 1, pageSize: 15, selectedIds: new Set(),
  hoverIndex: -1, selectedIface: '__all__', mode: 'connecting', configDemo: false, configOffline: false,
  usageRange: 'today', usageData: null, usageTimer: null, usageLoading: false, usageSeq: 0,
  usageDetailPage: 1, usageIfaceSig: '',
  autoRefresh: autoRefreshPref, autoTimer: null,
  collapsedGroups: new Set(), devices: [], deviceId: '', devicePrimary: '', webPort: 10086, hostPort: 0,
  authEnabled: false, authUser: '', sort: { key: '#', dir: 'asc' },
};
try { JSON.parse(localStorage.getItem('ros-traffic-groups') || '[]').forEach((id) => state.collapsedGroups.add(id)); } catch (e) { /* ignore */ }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= 主题：配色风格 × 深浅模式 两套独立维度 =================
   theme = 配色风格；mode = light / dark / system，可任意组合，例如「深色 + 樱粉」。 */
const THEMES = ['unifi', 'default', 'ocean', 'aurora', 'sakura', 'forest', 'amber', 'violet', 'coffee', 'mint', 'mono', 'glass', 'porcelain', 'liquid'];
const MODES = ['light', 'dark', 'system'];
const MODE_ICON = { light: '☀', dark: '☾', system: '◐' };
const qs = new URLSearchParams(location.search);
const urlTheme = qs.get('theme'), urlMode = qs.get('mode');
const legacyTheme = localStorage.getItem('ros-traffic-theme'); // 旧版本单一主题键
/* v2 起默认主题改为 UniFi：老用户首次升级时忽略旧偏好，之后仍尊重其手动选择 */
let themeMigrated = false;
try { themeMigrated = localStorage.getItem('ros-theme-v2') === '1'; } catch (e) { /* ignore */ }
let theme;
if (THEMES.includes(urlTheme)) theme = urlTheme;
else if (!themeMigrated) theme = 'unifi';
else theme = localStorage.getItem('ros-theme') || (legacyTheme && THEMES.includes(legacyTheme) ? legacyTheme : 'unifi');
let mode = MODES.includes(urlMode) ? urlMode : (MODES.includes(localStorage.getItem('ros-mode')) ? localStorage.getItem('ros-mode')
  : (legacyTheme === 'dark' || legacyTheme === 'light' ? legacyTheme : 'system'));
if (!THEMES.includes(theme)) theme = 'unifi';
const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
function effectiveMode() { return mode === 'system' ? (systemDark && systemDark.matches ? 'dark' : 'light') : mode; }
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function themeFill(name, fallback, alpha) {
  /* 深色主题的强调色是 color-mix()：自定义属性读出来仍是原始表达式，
     画布无法直接给它加透明度。用隐藏探针取计算后的具体颜色，再统一转 rgba。 */
  let c = cssVar(name, fallback);
  if (/color-mix\(|^color\(|var\(/.test(c)) {
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none';
      probe.style.color = `var(${name}, ${fallback})`;
      document.body.appendChild(probe);
      c = getComputedStyle(probe).color || c;
      probe.remove();
    } catch (e) { /* 老浏览器退回原色 */ }
  }
  let r, g, b;
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length === 4) h = h.slice(0, 3);
    const n = parseInt(h, 16);
    if (Number.isFinite(n)) { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      [r, g, b] = p;
    } else {
      const cm = c.match(/color\(\s*srgb\s+([^)\s]+)\s+([^)\s]+)\s+([^)\s]+)/i);
      if (cm) [r, g, b] = cm.slice(1).map((x) => x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x) * 255);
    }
  }
  if ([r, g, b].every((x) => Number.isFinite(x))) return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
  return c;
}
function applyTheme(persist) {
  const root = document.documentElement;
  /* 切换瞬间开启过渡，420ms 后撤掉，避免影响日常 hover / 拖拽性能 */
  root.classList.add('theme-switching');
  clearTimeout(applyTheme._timer);
  applyTheme._timer = setTimeout(() => root.classList.remove('theme-switching'), 420);
  root.dataset.theme = theme;
  root.dataset.mode = mode;
  root.dataset.scheme = effectiveMode(); // 实际生效的深浅，供 CSS 复用
  const sel = $('themeSelect');
  if (sel) {
    const labels = THEMES.map((x) => esc(t('theme_' + x) || x)).join('|');
    if (sel.dataset.labels !== labels) { sel.innerHTML = THEMES.map((x) => `<option value="${x}">${esc(t('theme_' + x) || x)}</option>`).join(''); sel.dataset.labels = labels; }
    sel.value = theme;
  }
  const mb = $('modeBtn');
  if (mb) {
    mb.textContent = MODE_ICON[mode];
    mb.title = MODE_ICON[mode] + ' ' + (t('mode_' + mode) || mode);
    mb.dataset.mode = mode;
  }
  if (persist === false) return;
  try { localStorage.setItem('ros-theme', theme); localStorage.setItem('ros-mode', mode); localStorage.setItem('ros-theme-v2', '1'); } catch (e) { /* ignore */ }
}
if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', () => { if (mode === 'system') { applyTheme(false); if (state.section === 'dashboard') renderDashboard(); } });

/* 动画效果总开关（记忆偏好，关闭后所有 CSS 动画/过渡立即停用） */
let motionOn = (() => { try { return localStorage.getItem('ros-motion') !== 'off'; } catch (e) { return true; } })();
function applyMotion() {
  const root = document.documentElement;
  root.dataset.motion = motionOn ? 'on' : 'off';
  const btn = $('motionBtn');
  if (btn) {
    btn.textContent = motionOn ? '✦' : '✧';
    btn.classList.toggle('off', !motionOn);
    btn.title = (motionOn ? L('关闭动画', 'Turn motion off') : L('开启动画', 'Turn motion on')) + ' / Motion';
  }
  try { localStorage.setItem('ros-motion', motionOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
}
applyMotion();

/* ================= 工具 ================= */
function fmtRate(bps) {
  let v = Number(bps) || 0, i = 0; const u = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  while (v >= 1000 && i < 3) { v /= 1000; i++; }
  return { v: v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2), u: u[i] };
}
const fmtRateStr = (b) => { const r = fmtRate(b); return r.v + ' ' + r.u; };
function splitBytes(b) {
  b = Number(b) || 0; let i = 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return { v: b.toFixed(b >= 100 ? 0 : b >= 10 ? 1 : 2), u: u[i] };
}
function fmtBytes(b) { const p = splitBytes(b); return p.v + ' ' + p.u; }
/* 精确字节（带千分位）：连接表/TOP10 用，每秒递增肉眼可见；悬浮 title 仍显示易读单位 */
function fmtBytesExact(b) { return (Number(b) || 0).toLocaleString('en-US'); }
function fmtUptime(s) {
  if (s == null || !Number.isFinite(Number(s))) return '—';
  s = Math.max(0, Math.floor(Number(s)));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  if (lang === 'zh') {
    if (d) return `${d}天${h}时${m}分`;
    if (h) return `${h}时${m}分`;
    if (m) return `${m}分${sec}秒`;
    return `${sec}秒`;
  }
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtTime(ts) { const d = new Date(ts); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); }
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}
async function api(path, opts) {
  /* 所有配置类接口自动带上当前设备；设备管理/目录接口除外 */
  if (state.deviceId && /^\/api\/(config|action|snapshot|history|status|usage|topology)(\?|$)/.test(path)) {
    path += (path.includes('?') ? '&' : '?') + 'device=' + encodeURIComponent(state.deviceId);
  }
  const r = await fetch(path, opts);
  let d; try { d = await r.json(); } catch (e) { throw new Error('HTTP ' + r.status); }
  if (r.status === 401 && d.loginRequired) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    throw new Error('Unauthorized');
  }
  if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}
async function doLogout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  location.href = '/login.html';
}

/* ================= 弹窗 ================= */
function openModal(title, bodyHtml, footHtml, onMount) {
  $('modal').innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button type="button" data-close>×</button></div>
    <div class="modal-body">${bodyHtml}</div><div class="modal-foot">${footHtml}</div>`;
  $('modalMask').hidden = false;
  $('modal').querySelectorAll('[data-close]').forEach((b) => b.onclick = closeModal);
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
    const items = state.schema.sections.filter((s) => s.group === g.id && (!f || tx(s.title).toLowerCase().includes(f) || s.id.includes(f) || tx(g).toLowerCase().includes(f)));
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
/* Command+K / Ctrl+K：聚焦侧栏搜索，折叠时自动展开 */
function focusNavSearch() {
  const sb = $('sidebar'), inp = $('navSearch'), box = $('sideSearch');
  if (!sb || !inp) return;
  if (sb.classList.contains('collapsed')) {
    sb.classList.remove('collapsed');
    try { localStorage.setItem('ros-traffic-collapsed', '0'); } catch (e) { /* ignore */ }
    setTimeout(() => { if (state.section === 'dashboard') renderDashboard(); if (state.section === 'trafficStats') renderTrafficStats(); }, 200);
  }
  sb.classList.add('mobile-open');
  inp.focus(); inp.select();
  if (box) { box.classList.remove('shortcut-focus'); void box.offsetWidth; box.classList.add('shortcut-focus'); setTimeout(() => box.classList.remove('shortcut-focus'), 1000); }
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); focusNavSearch(); }
});
/* 按分类 id 匹配图标，未命中时按名称关键字兜底 */
const SECTION_ICONS = {
  dashboard: 'gauge', trafficStats: 'chart', systemTools: 'tools', connections: 'link',
  quickSetup: 'sliders', updates: 'package',
  interfaces: 'ethernet', ipAddresses: 'ip', dhcpClients: 'monitor', dhcpServers: 'server',
  dhcpNetworks: 'subnet', dhcpLeases: 'clipboard', dhcpOptions: 'tag', dhcpOptionSets: 'clipboard', dns: 'globe', dnsStatic: 'pin',
  routes: 'route', pools: 'database', neighbors: 'radar',
  firewallFilter: 'filter', firewallNat: 'nat', firewallMangle: 'tag', addressLists: 'addressBook', servicePorts: 'ports',
  firewall6Filter: 'filter', firewall6Mangle: 'tag', addressLists6: 'addressBook', servicePorts6: 'ports',
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
    shield6: '<path d="M8 1.5 14 4v4c0 3.5-2.5 5.5-6 6.5C4.5 13.5 2 11.5 2 8V4z"/><path d="M2.5 7h11M5 4.5h6"/>',
    wifi: '<path d="M1.5 5.5a10 10 0 0 1 13 0M4 8a6.5 6.5 0 0 1 8 0M6.5 10.5a3 3 0 0 1 3 0"/><circle cx="8" cy="13" r="1" fill="currentColor"/>',
    vpn: '<rect x="2" y="7" width="12" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
    queue: '<path d="M2 3h12M2 8h8M2 13h5"/>',
    gear: '<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M13 3l-1.5 1.5M4.5 11.5 3 13"/>',
    log: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 5h6M5 8h6M5 11h4"/>',
    gauge: '<path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 11.5 11 7"/><circle cx="8" cy="11.5" r="1" fill="currentColor"/>',
    activity: '<path d="M1 8h3l2-5 3 10 2-5h4"/>',
    chart: '<path d="M2 14V8M6 14V4M10 14v-4M14 14V6" stroke="currentColor" stroke-width="2" fill="none"/>',
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
  state.points = []; state.resourceHistory = []; state.connHistory = []; state.ifHistory.clear(); restoreDashIface();
  state.latest = null; state.connRows = []; state.usageData = null; state.usageDetailPage = 1; state.usageIfaceSig = '';
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
  state.sort = { key: '#', dir: 'asc' };
  const sec = state.schema.sections.find((s) => s.id === id);
  if (sec) { state.collapsedGroups.delete(sec.group); saveCollapsedGroups(); }
  buildNav(); renderPage();
  try { localStorage.setItem('ros-traffic-section', id); } catch (e) { /* ignore */ }
}

/* ================= 仪表盘速率接口 =================
   选择结果按设备持久化；历史点带 per（每接口速率），刷新后也能重建单接口趋势。 */
function dashIfaceKey() { return 'ros-dash-iface:' + (state.deviceId || 'default'); }
function dashIfaceLabel() { return state.selectedIface === '__all__' ? t('dash_iface_all') : state.selectedIface; }
function pointForIface(p) {
  const base = { ts: p.ts, per: p.per || null };
  if (state.selectedIface === '__all__') return { ...base, rx: p.rx || 0, tx: p.tx || 0 };
  const v = p.per && p.per[state.selectedIface];
  return { ...base, rx: v ? v.rx || 0 : 0, tx: v ? v.tx || 0 : 0 };
}
function restoreDashIface() {
  let saved = '__all__';
  try { saved = localStorage.getItem(dashIfaceKey()) || '__all__'; } catch (e) { /* ignore */ }
  state.selectedIface = saved;
}
function setDashIface(name) {
  state.selectedIface = name === '__all__' ? '__all__' : String(name || '');
  try { localStorage.setItem(dashIfaceKey(), state.selectedIface); } catch (e) { /* ignore */ }
  state.points = state.points.map(pointForIface);
  closeDashIfacePop();
  if (state.section === 'dashboard') renderDashboard();
  paintDashIfacePop();
}
let dashIfacePop = null;
function ensureDashIfacePop() {
  if (dashIfacePop) return dashIfacePop;
  const el = document.createElement('div');
  el.className = 'iface-pop';
  el.id = 'dashIfacePop';
  el.hidden = true;
  el.innerHTML = `<div class="iface-pop-head">
      <div><b>${esc(t('dash_iface_title'))}</b><small>${esc(t('dash_iface_sub'))}</small></div>
      <button class="iface-pop-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="iface-pop-search"><input type="search" id="dashIfaceSearch" placeholder="${esc(t('dash_iface_search'))}" autocomplete="off"></div>
    <div class="iface-pop-list" id="dashIfaceList"></div>
    <div class="iface-pop-foot">${esc(t('dash_iface_foot'))}</div>`;
  document.body.appendChild(el);
  dashIfacePop = el;
  el.querySelector('.iface-pop-close').onclick = () => closeDashIfacePop();
  el.querySelector('#dashIfaceSearch').oninput = () => renderDashIfaceList();
  el.addEventListener('click', (e) => {
    const opt = e.target.closest('.iface-opt');
    if (opt) setDashIface(opt.dataset.name);
  });
  return el;
}
function openDashIfacePop(btn) {
  const el = ensureDashIfacePop();
  el.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = Math.min(340, Math.max(280, window.innerWidth - 24));
  el.style.width = w + 'px';
  el.style.left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) + 'px';
  el.style.top = Math.min(r.bottom + 8, Math.max(12, window.innerHeight - 400)) + 'px';
  el.dataset.sig = '';
  paintDashIfacePop();
  const s = el.querySelector('#dashIfaceSearch'); s.value = ''; s.focus();
}
function closeDashIfacePop() { if (dashIfacePop) dashIfacePop.hidden = true; }
function renderDashIfaceList() {
  const el = dashIfacePop; if (!el) return;
  const d = state.latest || {};
  const q = (el.querySelector('#dashIfaceSearch').value || '').trim().toLowerCase();
  const ifaces = (d.ifaces || []).slice().sort((a, b) => ((b.rxBps || 0) + (b.txBps || 0)) - ((a.rxBps || 0) + (a.txBps || 0)));
  const allOn = state.selectedIface === '__all__';
  let html = `<button class="iface-opt${allOn ? ' active' : ''}" data-name="__all__" type="button">
      <span class="iface-opt-ic all">≡</span>
      <span class="iface-opt-main"><b>${esc(t('dash_iface_all'))}</b><small>${esc(t('dash_iface_all_sub'))}</small></span>
      <span class="iface-opt-rate"></span><span class="iface-opt-check">✓</span></button>`;
  const list = ifaces.filter((i) => !q || String(i.name).toLowerCase().includes(q));
  for (const i of list) {
    const down = i.running !== 'true' || i.disabled === 'true';
    html += `<button class="iface-opt${state.selectedIface === i.name ? ' active' : ''}${down ? ' down' : ''}" data-name="${esc(i.name)}" type="button">
      <span class="iface-opt-ic${down ? ' off' : ''}">${esc(String(i.type || 'eth').slice(0, 1).toUpperCase())}</span>
      <span class="iface-opt-main"><b>${esc(i.name)}</b><small>${esc([i.comment || i.type || '', down ? t('dash_iface_down') : ''].filter(Boolean).join(' · '))}</small></span>
      <span class="iface-opt-rate"></span><span class="iface-opt-check">✓</span></button>`;
  }
  if (!list.length && q) html += `<div class="iface-pop-empty">${esc(t('dash_iface_empty'))}</div>`;
  el.querySelector('#dashIfaceList').innerHTML = html;
}
function paintDashIfacePop() {
  const d = state.latest || {}, ifaces = d.ifaces || [];
  /* 设备换了 / 接口消失时自动回到「全部接口」（浮层关闭时也要检查） */
  if (state.selectedIface !== '__all__' && ifaces.length && !ifaces.some((i) => i.name === state.selectedIface)) {
    state.selectedIface = '__all__';
    try { localStorage.setItem(dashIfaceKey(), '__all__'); } catch (e) { /* ignore */ }
    state.points = state.points.map(pointForIface);
  }
  const el = dashIfacePop; if (!el || el.hidden) return;
  const q = (el.querySelector('#dashIfaceSearch').value || '').trim().toLowerCase();
  const sig = ifaces.map((i) => i.name).join('|') + '##' + state.selectedIface + '##' + lang + '##' + q;
  if (el.dataset.sig !== sig) { el.dataset.sig = sig; renderDashIfaceList(); }
  const rate = (rx, tx) => '↓ ' + fmtRateStr(rx) + ' · ↑ ' + fmtRateStr(tx);
  const byName = new Map(ifaces.map((i) => [String(i.name), i]));
  el.querySelectorAll('.iface-opt[data-name]').forEach((o) => {
    o.classList.toggle('active', o.dataset.name === state.selectedIface);
    const box = o.querySelector('.iface-opt-rate'); if (!box) return;
    if (o.dataset.name === '__all__') { box.textContent = rate(d.totalRx || 0, d.totalTx || 0); return; }
    const i = byName.get(o.dataset.name);
    if (i) box.textContent = rate(i.rxBps || 0, i.txBps || 0);
  });
}
window.paintDashIfacePop = paintDashIfacePop;
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('#dashIfaceBtn');
  if (btn) {
    e.preventDefault();
    if (dashIfacePop && !dashIfacePop.hidden) closeDashIfacePop();
    else openDashIfacePop(btn);
    return;
  }
  if (dashIfacePop && !dashIfacePop.hidden && !(e.target.closest && e.target.closest('#dashIfacePop'))) closeDashIfacePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDashIfacePop(); });

/* ================= 实时数据 ================= */
let socket = null, reconnectDelay = 1000;
async function loadSnapshot() {
  try {
    const d = await api('/api/snapshot');
    if (Array.isArray(d.history)) state.points = d.history.map(pointForIface);
    if (Array.isArray(d.resourceHistory)) state.resourceHistory = d.resourceHistory.slice();
    for (const p of d.history || []) if (p.per) for (const [n, v] of Object.entries(p.per)) pushIfHist(n, p.ts, v);
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
  state.latest = d;
  state.mode = ['live', 'demo', 'connecting', 'offline', 'reconnect'].includes(d.mode) ? d.mode : 'offline';
  if (Array.isArray(d.resourceHistory) && d.resourceHistory.length) state.resourceHistory = d.resourceHistory.slice();
  if (d.connections) {
    const last = state.connHistory[state.connHistory.length - 1];
    if (!last || last.ts !== d.ts) {
      state.connHistory.push({ ts: d.ts, total: d.connections.total || 0, v4: d.connections.v4 || 0, v6: d.connections.v6 || 0,
        tcp4: d.connections.tcp4 || 0, tcp6: d.connections.tcp6 || 0, udp4: d.connections.udp4 || 0, udp6: d.connections.udp6 || 0 });
      if (state.connHistory.length > 180) state.connHistory.shift();
    }
  }
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
  /* 实时帧携带的连接行（DEMO 动态生成）：直接更新数据源，让表格与仪表盘 TOP10 每秒变化 */
  if (d.connRows) {
    if (d.connRows.connections) state.connRows = d.connRows.connections;
    if (state.section === 'connections' && d.connRows.connections) { state.rows = d.connRows.connections; renderRowsById('connections'); }
    if (state.section === 'connections6' && d.connRows.connections6) { state.rows = d.connRows.connections6; renderRowsById('connections6'); }
  }
  updateTopbar(d);
  if (state.section === 'dashboard') renderDashboard();
  else if (state.section === 'connections' || state.section === 'connections6') {
    /* 真实设备：实时帧不带行数据，仍走 HTTP 拉取；但 demo 刚已更新，跳过重复请求 */
    if (!d.connRows) refreshRowsIfLoaded();
  }
  /* 统计页不随每秒实时帧整页重绘，但 DEMO 徽标必须即时更新 */
  if (state.section === 'trafficStats') updateStatsBadge(d);
  /* 设备管理页：WS 帧里的真实连接状态即时反映到列表（内部做了签名去重） */
  if (state.section === 'connectionSettings' && typeof window.paintDeviceRows === 'function') window.paintDeviceRows();
}
/* 流量统计：独立轮询后端真实统计（后端每秒采样），局部刷新，不重建 DOM
   seq 保证「切换范围 / 切换网口」后，只采用最后一次请求的结果，不会串到别的时间类型或别的网口 */
async function refreshUsageData() {
  const seq = ++state.usageSeq;
  state.usageLoading = true;
  try {
    const q = '?range=' + encodeURIComponent(state.usageRange);
    const d = await api('/api/usage' + q);
    if (seq !== state.usageSeq) return;
    state.usageData = d;
    if (state.section === 'trafficStats') paintTrafficStats(d);
  } catch (e) {
    if (seq !== state.usageSeq) return;
    const cards = $('statCards');
    if (cards && !cards.querySelector('.card')) cards.innerHTML = `<div class="empty" style="grid-column:1/-1">${t('load_fail')}: ${esc(e.message)}</div>`;
  } finally { state.usageLoading = false; }
}
/* ================= 自动刷新：一个全局开关，驱动所有需要轮询的页面 =================
   WS 实时帧属于推送流，不受开关影响；开关只控制「表格 / 设备状态 / 统计」的轮询刷新。 */
function paintAutoRefresh() {
  const chk = $('autoRefreshChk'), wrap = $('autoRefresh');
  if (!chk || !wrap) return;
  chk.checked = state.autoRefresh;
  wrap.classList.toggle('on', state.autoRefresh);
  wrap.title = t('auto_refresh') + ' · ' + (state.autoRefresh ? t('auto_on') : t('auto_off'));
}
function refreshCurrentPageNow() {
  if (state.section === 'trafficStats') refreshUsageData();
  else if (typeof window.autoRefreshPage === 'function') window.autoRefreshPage();
}
function setAutoRefresh(on, quiet) {
  state.autoRefresh = !!on;
  try { localStorage.setItem('ros-auto-refresh', state.autoRefresh ? '1' : '0'); } catch (e) { /* ignore */ }
  paintAutoRefresh();
  ensureAutoTimer();
  ensureUsageTimer(state.section === 'trafficStats');
  if (state.autoRefresh) refreshCurrentPageNow();
  if (!quiet) toast(state.autoRefresh ? t('auto_on') : t('auto_off'), state.autoRefresh ? 'ok' : '');
}
function ensureAutoTimer() {
  if (state.autoRefresh && !state.autoTimer) {
    state.autoTimer = setInterval(() => {
      if (!state.autoRefresh || document.hidden) return;
      if (typeof window.autoRefreshPage === 'function') window.autoRefreshPage();
    }, 5000);
  } else if (!state.autoRefresh && state.autoTimer) {
    clearInterval(state.autoTimer); state.autoTimer = null;
  }
}
function ensureUsageTimer(on) {
  if (on && state.autoRefresh && !state.usageTimer) {
    state.usageTimer = setInterval(() => {
      if (state.section === 'trafficStats' && !document.hidden) refreshUsageData();
    }, 2000);
  } else if ((!on || !state.autoRefresh) && state.usageTimer) { clearInterval(state.usageTimer); state.usageTimer = null; }
}
/* 仅 demo 模式提示 DEMO；实时 LIVE / OFFLINE 徽标全部移除 */
function updateStatsBadge(d) {
  const el = $('statsBadge'); if (!el) return;
  const mode = (d && d.mode) || state.mode;
  const demo = mode === 'demo' || !!(d && d.demo);
  el.hidden = !demo;
  el.innerHTML = '<span class="d"></span>' + esc(t('demo_only'));
}
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function updateTopbar(d) {
  const devDot = $('deviceDot'); if (devDot) devDot.classList.toggle('live', d.mode === 'live');
  const pill = $('sideMode');
  if (pill) {
    const demo = state.mode === 'demo';
    pill.hidden = !demo;
    pill.textContent = demo ? t('demo_only') : '';
  }
  const streamEl = $('sideStream');
  if (streamEl) {
    streamEl.hidden = d.mode !== 'live' || !d.streaming;
    streamEl.textContent = t('stream_on');
    streamEl.classList.toggle('on', !!d.streaming);
  }
  $('sideDot').parentElement.classList.toggle('live', state.mode === 'live');
  if (typeof syncConfigTag === 'function') syncConfigTag();
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
  if (sec.id !== 'trafficStats') ensureUsageTimer(false);
  const g = state.schema.groups.find((x) => x.id === sec.group);
  $('crumbGroup').textContent = g ? tx(g) : ''; $('crumbSection').textContent = tx(sec.title);
  if (sec.id === 'dashboard') return renderDashboard();
  if (sec.id === 'trafficStats') return renderTrafficStats();
  if (sec.id === 'systemTools') return renderTools();
  if (sec.id === 'topology') return window.renderTopologyPage ? window.renderTopologyPage() : undefined;
  if (sec.id === 'quickSetup') return window.renderQuickSetupPage ? window.renderQuickSetupPage() : undefined;
  if (sec.id === 'updates') return window.renderUpdatesPage ? window.renderUpdatesPage() : undefined;
  if (sec.id === 'connectionSettings') return renderConnectionSettings();
  if (sec.path) return sec.singleton ? renderSingletonPage(sec) : renderConfigPage(sec);
}
async function refreshRowsIfLoaded() {
  const sec = state.schema.sections.find((s) => s.id === state.section);
  if (!sec || !sec.path || !$('tbody')) return;
  try {
    /* 实时帧每秒拉新数据后必须重绘 tbody，否则连接表的 bytes 变了界面也不动。
       只读表格（连接状态 / 其它 readonly 分类）没有输入框，重绘不会丢焦点。 */
    const sig = liveRowsSignature(sec);
    await loadRows(sec);
    if (liveRowsSignature(sec) !== sig) renderRows(sec);
  } catch (e) { /* ignore */ }
}
/* 连接表实时刷新用的轻量签名：id + 字节 + 状态，避免无变化时空转重绘 */
function liveRowsSignature(sec) {
  const key = sec.id === 'connections' || sec.id === 'connections6' ? 'bytes' : null;
  const rows = state.rows || [];
  if (!key) return rows.length + ':' + rows.map((r) => r && r['.id']).join(',');
  return rows.length + ':' + rows.map((r) => [r && r['.id'], r && r[key], r && r['connection-state']].join('|')).join(',');
}
/* 按 section id 重绘表格（实时帧更新数据源后用，避免再发 HTTP） */
function renderRowsById(id) {
  const sec = state.schema && state.schema.sections.find((s) => s.id === id);
  if (sec && typeof renderRows === 'function' && $('tbody')) renderRows(sec);
}

function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $('langLabel').textContent = lang === 'zh' ? 'EN' : '中文';
  applyTheme(false); // 刷新主题下拉的语言标签
  paintAutoRefresh();
  buildNav(); renderPage();
}

/* ================= 启动 ================= */
async function boot() {
  $('langBtn').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('ros-traffic-lang', lang);
    applyLang();
  };
  applyTheme(!(urlTheme || urlMode));
  $('themeSelect').onchange = (e) => { theme = e.target.value; applyTheme(); toast(t('theme_title') + ': ' + e.target.selectedOptions[0].textContent, 'ok'); };
  $('modeBtn').onclick = () => {
    mode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    applyTheme();
    toast(t('mode_title') + ': ' + (t('mode_' + mode) || mode), 'ok');
    if (state.section === 'dashboard') renderDashboard();
  };
  $('motionBtn').onclick = () => {
    motionOn = !motionOn;
    applyMotion();
    toast(L('动画效果', 'Motion') + ': ' + (motionOn ? L('已开启', 'On') : L('已关闭', 'Off')), 'ok');
  };
  const urlCollapse = new URLSearchParams(location.search).get('collapse');
  const collapsed = urlCollapse === '1' || (urlCollapse !== '0' && localStorage.getItem('ros-traffic-collapsed') === '1');
  $('sidebar').classList.toggle('collapsed', collapsed);
  const urlWidth = Number(new URLSearchParams(location.search).get('sidebar'));
  const savedWidth = urlWidth >= 160 && urlWidth <= 360 ? urlWidth : Number(localStorage.getItem('ros-traffic-sidebar-w'));
  if (savedWidth >= 160 && savedWidth <= 360) document.documentElement.style.setProperty('--sidebar-w', savedWidth + 'px');
  $('collapseBtn').onclick = () => {
    const c = $('sidebar').classList.toggle('collapsed');
    try { localStorage.setItem('ros-traffic-collapsed', c ? '1' : '0'); } catch (e) { /* ignore */ }
    setTimeout(() => { if (state.section === 'dashboard') renderDashboard(); if (state.section === 'trafficStats') renderTrafficStats(); }, 200);
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
      if (state.section === 'dashboard') renderDashboard(); if (state.section === 'trafficStats') renderTrafficStats();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  $('navSearch').oninput = (e) => buildNav(e.target.value);
  $('navSearch').onkeydown = (e) => {
    if (e.key === 'Enter') {
      const first = $('sideNav').querySelector('.nav-item');
      if (first) { const id = first.dataset.section; e.target.value = ''; buildNav(''); navigate(id); }
    } else if (e.key === 'Escape') { e.target.value = ''; buildNav(''); e.target.blur(); }
  };
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  const kbdMod = $('kbdMod');
  if (kbdMod) { kbdMod.textContent = isMac ? '⌘' : 'Ctrl'; kbdMod.classList.toggle('wide', !isMac); }
  const kbdHint = $('searchKbd');
  if (kbdHint) { kbdHint.title = (isMac ? '⌘' : 'Ctrl') + ' + K · ' + t('search_hint'); kbdHint.onclick = focusNavSearch; }
  const arChk = $('autoRefreshChk');
  if (arChk) arChk.onchange = (e) => setAutoRefresh(e.target.checked);
  paintAutoRefresh();
  ensureAutoTimer();
  $('foldAllBtn').onclick = () => {
    const allCollapsed = state.schema.groups.every((g) => state.collapsedGroups.has(g.id));
    state.collapsedGroups = allCollapsed ? new Set() : new Set(state.schema.groups.map((g) => g.id));
    saveCollapsedGroups(); buildNav($('navSearch').value);
  };
  $('settingsShortcut').onclick = () => navigate('connectionSettings');
  $('deviceSelect').onchange = (e) => switchDevice(e.target.value);
  $('exportBtn').onclick = async () => {
    try {
      const d = await api('/api/status');
      const statusText = d.mode === 'demo' ? t('demo_only') : (d.mode === 'live' ? t('device_online') : t('device_offline'));
      openModal(t('export_hint'), `<div class="modal-note"><b>RouterOS:</b> ${esc(d.host)}:${esc(d.port)}<br><b>${L('状态', 'Status')}:</b> ${esc(statusText)}<br><b>${t('system')}:</b> ${esc(d.user)}</div>
        <pre class="code">${esc(JSON.stringify({ host: d.host, port: d.port, mode: d.mode, interval: d.interval, uptime: d.uptime }, null, 2))}</pre>`,
        `<button class="btn" data-close>${t('close')}</button>`, (m) => { m.querySelector('[data-close]').onclick = closeModal; });
    } catch (e) { toast(e.message, 'err'); }
  };
  const authLogout = $('authLogoutBtn');
  if (authLogout) authLogout.onclick = doLogout;
  try {
    const au = await fetch('/api/auth').then((r) => r.json());
    state.authEnabled = !!au.enabled; state.authUser = au.user || '';
    if (au.enabled) {
      if (!au.authenticated) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return; }
      if (authLogout) authLogout.hidden = false;
    }
  } catch (e) { /* ignore */ }
  $('adminBtn').onclick = () => navigate('connectionSettings');
  await loadDevices();
  restoreDashIface();
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
  await loadSnapshot();   // 首屏先拿到真实运行模式，避免一上来误标 DEMO
  connect();
  // 预加载连接数据供仪表盘 TOP 表格使用
  api('/api/config?section=connections').then((d) => { state.connRows = d.rows || []; if (state.section === 'dashboard') renderDashboard(); }).catch(() => {});
  /* 侧栏更新徽标：仅在服务端检查到新版本时出现 */
  const badge = $('updateBadge');
  if (badge) {
    badge.onclick = () => navigate('updates');
    api('/api/update/status').then((d) => {
      const on = !!(d.status && d.status.ok && d.status.hasUpdate);
      badge.hidden = !on;
      if (on) badge.title = L('发现新版本 ', 'Update available ') + (d.status.latest || {}).version;
    }).catch(() => {});
  }
}

/* boot 由最后加载的 config.js 调用，确保所有函数已定义 */

