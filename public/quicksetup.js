'use strict';
/* 一键配置向导：上网方式 / 内网 DHCP / 防火墙 / 管理员账号 -> 脚本预览、下载、应用 */
(function () {
  let previewTimer = null;
  const val = (id) => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const checked = (id) => { const el = $(id); return !!(el && el.checked); };
  const num = (id, d) => Number(val(id)) || d;

  function collect() {
    return {
      device: state.deviceId || '',
      mode: val('qsMode') || 'pppoe',
      wanInterface: val('qsWan') || 'ether1',
      lanInterface: val('qsLan') || 'bridge-lan',
      createBridge: checked('qsBridge'),
      bridgePorts: val('qsBridgePorts'),
      lanCidr: val('qsLanCidr') || '192.168.88.1/24',
      poolStart: val('qsPoolStart'), poolEnd: val('qsPoolEnd'),
      dns: val('qsDns') || '223.5.5.5,119.29.29.29',
      dnsForClients: val('qsDnsForClients') || 'gateway',
      customClientDns: val('qsCustomDns'),
      domain: val('qsDomain') || 'lan',
      leaseTime: val('qsLease') || '1d',
      dhcpOptionSet: val('qsOptionSet'),
      pppoe: {
        name: val('qsPppoeName') || 'pppoe-out1', user: val('qsPppoeUser'), password: val('qsPppoePass'),
        service: val('qsPppoeService'), mtu: val('qsPppoeMtu') || '1480', mru: val('qsPppoeMru') || '1480',
        usePeerDns: checked('qsPppoePeerDns'),
      },
      wan: { usePeerDns: checked('qsWanPeerDns'), addDefaultRoute: checked('qsWanDefaultRoute') },
      static: { address: val('qsStaticAddr'), gateway: val('qsStaticGw') },
      firewall: {
        basic: checked('qsFwBasic'), fasttrack: checked('qsFwFasttrack'),
        dropWanInput: checked('qsFwDropWan'), allowWanPing: checked('qsFwAllowPing'),
      },
      services: { disableTelnet: checked('qsSvcTelnet'), disableFtp: checked('qsSvcFtp'), disableWww: checked('qsSvcWww') },
      identity: val('qsIdentity'),
      admin: {
        enabled: checked('qsAdminEnabled'), currentUser: val('qsAdminCurrent') || 'admin',
        newUser: val('qsAdminNewUser'), newPassword: val('qsAdminNewPass'),
        confirmPassword: val('qsAdminConfirm'), syncCredentials: checked('qsAdminSync'),
      },
      clean: checked('qsClean'),
    };
  }

  function toggleMode() {
    const m = val('qsMode');
    for (const [id, mode] of [['qsPppoeRow', 'pppoe'], ['qsDhcpRow', 'dhcp'], ['qsStaticRow', 'static']]) {
      const el = $(id);
      if (el) el.style.display = m === mode ? '' : 'none';
    }
    const custom = $('qsCustomDnsRow');
    if (custom) custom.style.display = val('qsDnsForClients') === 'custom' ? '' : 'none';
  }

  async function refreshPreview() {
    const box = $('qsScript');
    if (!box) return;
    try {
      const d = await api('/api/quicksetup/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
      box.textContent = d.script || '';
      $('qsSteps').textContent = L('共 ', 'Total ') + d.steps + L(' 条命令', ' commands');
      const s = d.summary || {};
      $('qsSummary').textContent = `LAN ${s.lanCidr || '—'} · ${L('网关', 'gateway')} ${s.gateway || '—'} · ${L('地址池', 'pool')} ${s.pool || '—'} · WAN ${s.wanIface || '—'}`;
      const warns = d.warnings || [];
      $('qsWarn').innerHTML = warns.length
        ? `<b>${esc(L('注意事项', 'Notes'))}</b><ul>${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
        : '';
      $('qsWarn').style.display = warns.length ? '' : 'none';
      $('qsResult').innerHTML = '';
    } catch (e) {
      box.textContent = '// ' + (e.message || L('预览失败', 'preview failed'));
      $('qsSteps').textContent = '';
      $('qsSummary').textContent = '';
    }
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 350);
  }

  async function downloadScript() {
    try {
      const d = await api('/api/quicksetup/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
      const blob = new Blob([d.script || ''], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = 'ros-center-quicksetup.rsc';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
      toast(L('脚本含明文密码，请妥善保管', 'The script contains plaintext passwords — keep it safe'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  function renderResult(r) {
    const box = $('qsResult');
    if (!box) return;
    const kind = r.demo ? 'demo' : (r.ok ? 'ok' : 'bad');
    const lines = [
      r.demo ? L('演示模式：仅生成脚本，没有写入路由器。', 'DEMO: script generated, nothing was written.')
        : L(`已执行 ${r.executed || 0} 条命令`, `${r.executed || 0} commands applied`) + (r.removed ? ` · ${L('清理旧配置', 'removed old entries')} ${r.removed}` : ''),
      r.credentialsSynced ? L('已同步更新 ROS Center 的连接凭据并重连。', 'ROS Center credentials updated and reconnected.') : '',
      ...(r.errors || []).map((e) => '⚠ ' + e),
      ...(r.warnings || []).slice(0, 8).map((w) => '· ' + w),
    ].filter(Boolean);
    box.className = 'qs-result ' + kind;
    box.innerHTML = `<b>${esc(r.ok ? L('执行完成', 'Done') : L('执行结果', 'Result'))}</b><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }

  function apply() {
    const c = collect();
    const danger = L('此操作会修改路由器的网络、防火墙与管理员配置，可能导致当前连接中断。',
      'This changes network, firewall and admin settings on the router and may drop the current connection.');
    confirmModal(L('确认一键应用', 'Confirm one-click apply'),
      `<b>${esc(danger)}</b><br><span class="form-hint">${esc(L('建议先在「运维工具」导出配置备份；确认后才会写入。', 'Export a config backup in Tools first; nothing is written until you confirm.'))}</span>`,
      true, async () => {
        const btn = $('qsApply');
        if (btn) { btn.disabled = true; btn.textContent = L('执行中…', 'Applying…'); }
        try {
          const r = await api('/api/quicksetup/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
          renderResult(r);
          toast(r.ok ? (r.demo ? L('演示模式：未写入', 'DEMO: nothing written') : L('配置已应用', 'Configuration applied')) : L('部分命令执行失败', 'Some commands failed'), r.ok ? 'ok' : 'err');
        } catch (e) { toast(e.message, 'err'); renderResult({ ok: false, errors: [e.message] }); }
        if (btn) { btn.disabled = false; btn.textContent = L('一键应用', 'Apply now'); }
      });
  }

  async function loadInterfaces() {
    try {
      const d = await api('/api/config?section=interfaces');
      const names = (d.rows || []).map((r) => r.name).filter(Boolean);
      const dl = $('qsIfaceList');
      if (dl) dl.innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
    } catch (e) { /* 离线时用手工输入 */ }
  }

  window.renderQuickSetupPage = function renderQuickSetupPage() {
    $('content').innerHTML = `
      <div class="page-head"><div>
        <h1>${esc(L('一键配置', 'Quick setup'))}</h1>
        <p>${esc(L('按向导生成 RouterOS 配置：PPPoE 拨号 / DHCP 自动获取 / 静态 IP，自定义内网网段，并附带常用防火墙与管理员账号设置。', 'Generate RouterOS config: PPPoE / DHCP / static WAN, custom LAN subnet, common firewall rules and admin account changes.'))}</p>
      </div><span class="qs-tag">${esc(L('先预览，再应用', 'Preview before apply'))}</span></div>

      <div class="qs-warn-top">${esc(L('建议在未配置或已恢复出厂的路由器上使用；本工具会按 comment 幂等更新自己生成的条目，不会删除手工添加的规则。生产环境请先备份配置。', 'Best used on a fresh/reset router. Entries created here are updated idempotently by comment; manually added rules are never deleted. Back up production configs first.'))}</div>

      <div id="qsForm">
        <datalist id="qsIfaceList"><option value="ether1"><option value="bridge-lan"></datalist>
        <div class="grid-2">
          <div class="panel"><div class="panel-head"><div><h2>1 · ${esc(L('上网方式', 'WAN / uplink'))}</h2></div></div>
            <div class="panel-body">
              <div class="form-row"><label>${esc(L('接入类型', 'Connection type'))}</label><div><select id="qsMode">
                <option value="pppoe">PPPoE ${esc(L('拨号', 'dial-up'))}</option>
                <option value="dhcp">DHCP ${esc(L('自动获取', 'auto'))}</option>
                <option value="static">${esc(L('静态 IP', 'Static IP'))}</option></select></div></div>
              <div class="form-row"><label>${esc(L('WAN 接口', 'WAN interface'))}</label><div><input type="text" id="qsWan" list="qsIfaceList" value="ether1"></div></div>
              <div class="qs-sub" id="qsPppoeRow">
                <div class="form-row"><label>${esc(L('PPPoE 账号', 'PPPoE username'))}</label><div><input type="text" id="qsPppoeUser" autocomplete="off" placeholder="user@isp"></div></div>
                <div class="form-row"><label>${esc(L('PPPoE 密码', 'PPPoE password'))}</label><div><input type="password" id="qsPppoePass" autocomplete="new-password"></div></div>
                <div class="qs-inline3">
                  <div><label>${esc(L('接口名', 'Name'))}</label><input type="text" id="qsPppoeName" value="pppoe-out1"></div>
                  <div><label>MTU</label><input type="number" id="qsPppoeMtu" value="1480" min="576" max="1500"></div>
                  <div><label>MRU</label><input type="number" id="qsPppoeMru" value="1480" min="576" max="1500"></div>
                </div>
                <div class="form-row"><label>${esc(L('服务名', 'Service name'))}</label><div><input type="text" id="qsPppoeService" placeholder="${esc(L('可留空', 'optional'))}"></div></div>
                <label class="qs-check"><input type="checkbox" id="qsPppoePeerDns"><span>${esc(L('使用运营商下发的 DNS', 'Use peer DNS'))}</span></label>
              </div>
              <div class="qs-sub" id="qsDhcpRow" style="display:none">
                <label class="qs-check"><input type="checkbox" id="qsWanPeerDns" checked><span>${esc(L('使用对端 DNS', 'Use peer DNS'))}</span></label>
                <label class="qs-check"><input type="checkbox" id="qsWanDefaultRoute" checked><span>${esc(L('添加默认路由', 'Add default route'))}</span></label>
              </div>
              <div class="qs-sub" id="qsStaticRow" style="display:none">
                <div class="form-row"><label>${esc(L('WAN 地址', 'WAN address'))}</label><div><input type="text" id="qsStaticAddr" placeholder="10.0.1.2/30"></div></div>
                <div class="form-row"><label>${esc(L('默认网关', 'Default gateway'))}</label><div><input type="text" id="qsStaticGw" placeholder="10.0.1.1"></div></div>
              </div>
            </div></div>

          <div class="panel"><div class="panel-head"><div><h2>2 · ${esc(L('内网与 DHCP', 'LAN & DHCP'))}</h2></div></div>
            <div class="panel-body">
              <div class="form-row"><label>${esc(L('内网网段（可自定义）', 'LAN subnet (customizable)'))}</label><div>
                <input type="text" id="qsLanCidr" value="192.168.88.1/24" placeholder="192.168.88.1/24">
                <div class="form-hint">${esc(L('填写网关 IP/前缀，如 10.10.0.1/16；地址池默认自动推算，也可手动指定。', 'Enter gateway IP/prefix; the pool is derived automatically unless overridden.'))}</div></div></div>
              <div class="qs-inline3">
                <div><label>${esc(L('地址池起', 'Pool start'))}</label><input type="text" id="qsPoolStart" placeholder="${esc(L('自动', 'auto'))}"></div>
                <div><label>${esc(L('地址池止', 'Pool end'))}</label><input type="text" id="qsPoolEnd" placeholder="${esc(L('自动', 'auto'))}"></div>
                <div><label>${esc(L('租约', 'Lease'))}</label><input type="text" id="qsLease" value="1d"></div>
              </div>
              <div class="form-row"><label>${esc(L('LAN 接口', 'LAN interface'))}</label><div><input type="text" id="qsLan" list="qsIfaceList" value="bridge-lan"></div></div>
              <label class="qs-check"><input type="checkbox" id="qsBridge" checked><span>${esc(L('创建 LAN 网桥并加入端口', 'Create LAN bridge and add ports'))}</span></label>
              <div class="form-row"><label>${esc(L('桥接端口', 'Bridge ports'))}</label><div><input type="text" id="qsBridgePorts" value="ether2,ether3,ether4,ether5" placeholder="ether2,ether3"></div></div>
              <div class="form-row"><label>${esc(L('上游 DNS', 'Upstream DNS'))}</label><div><input type="text" id="qsDns" value="223.5.5.5,119.29.29.29"></div></div>
              <div class="form-row"><label>${esc(L('下发给客户端的 DNS', 'DNS handed to clients'))}</label><div><select id="qsDnsForClients">
                <option value="gateway">${esc(L('网关自身（启用 DNS 缓存）', 'Router itself (DNS cache)'))}</option>
                <option value="upstream">${esc(L('直接使用上游 DNS', 'Upstream DNS'))}</option>
                <option value="custom">${esc(L('自定义', 'Custom'))}</option></select></div></div>
              <div class="form-row" id="qsCustomDnsRow" style="display:none"><label>${esc(L('自定义 DNS', 'Custom DNS'))}</label><div><input type="text" id="qsCustomDns" placeholder="10.0.0.2,10.0.0.3"></div></div>
              <div class="qs-inline3">
                <div><label>${esc(L('域名', 'Domain'))}</label><input type="text" id="qsDomain" value="lan"></div>
                <div style="flex:2"><label>${esc(L('DHCP 选项集（可选）', 'DHCP option set (optional)'))}</label><input type="text" id="qsOptionSet" placeholder="lan-extras"></div>
              </div>
              <div class="form-hint">${esc(L('选项与选项集在「网络设置 → DHCP 选项 / DHCP 选项集」里创建，这里填名称即可关联。', 'Create options/sets under Network → DHCP options, then reference a set name here.'))}</div>
            </div></div>
        </div>

        <div class="grid-2" style="margin-top:14px">
          <div class="panel"><div class="panel-head"><div><h2>3 · ${esc(L('防火墙与系统', 'Firewall & system'))}</h2></div></div>
            <div class="panel-body">
              <label class="qs-check"><input type="checkbox" id="qsFwBasic" checked><span>${esc(L('常用防火墙模板（input/forward + NAT 伪装）', 'Common firewall template (input/forward + NAT masquerade)'))}</span></label>
              <label class="qs-check"><input type="checkbox" id="qsFwFasttrack" checked><span>FastTrack ${esc(L('加速已建立连接', 'for established connections'))}</span></label>
              <label class="qs-check"><input type="checkbox" id="qsFwDropWan" checked><span>${esc(L('丢弃来自 WAN 的入站管理流量', 'Drop inbound WAN management traffic'))}</span></label>
              <label class="qs-check"><input type="checkbox" id="qsFwAllowPing"><span>${esc(L('允许 WAN 侧 Ping', 'Allow WAN ping'))}</span></label>
              <div class="qs-divider"></div>
              <div class="form-row"><label>${esc(L('设备名称', 'Device identity'))}</label><div><input type="text" id="qsIdentity" placeholder="ROS-Center"></div></div>
              <div class="form-row"><label>${esc(L('关闭不安全服务', 'Disable insecure services'))}</label><div class="qs-checks-inline">
                <label class="qs-check"><input type="checkbox" id="qsSvcTelnet"><span>telnet</span></label>
                <label class="qs-check"><input type="checkbox" id="qsSvcFtp" checked><span>ftp</span></label>
                <label class="qs-check"><input type="checkbox" id="qsSvcWww"><span>www</span></label></div></div>
              <div class="form-hint">${esc(L('API / SSH / WinBox 不会被禁用，避免把 ROS Center 自己踢下线。', 'API / SSH / WinBox are never disabled, so ROS Center stays connected.'))}</div>
            </div></div>

          <div class="panel"><div class="panel-head"><div><h2>4 · ${esc(L('管理员账号', 'Administrator account'))}</h2></div></div>
            <div class="panel-body">
              <label class="qs-check"><input type="checkbox" id="qsAdminEnabled"><span>${esc(L('修改用户名 / 密码', 'Change username / password'))}</span></label>
              <div class="form-row"><label>${esc(L('当前用户名', 'Current username'))}</label><div><input type="text" id="qsAdminCurrent" value="admin"></div></div>
              <div class="form-row"><label>${esc(L('新用户名', 'New username'))}</label><div><input type="text" id="qsAdminNewUser" placeholder="${esc(L('留空则只改密码', 'blank = password only'))}"></div></div>
              <div class="qs-inline3">
                <div><label>${esc(L('新密码（≥8）', 'New password (≥8)'))}</label><input type="password" id="qsAdminNewPass" autocomplete="new-password"></div>
                <div><label>${esc(L('确认密码', 'Confirm password'))}</label><input type="password" id="qsAdminConfirm" autocomplete="new-password"></div>
              </div>
              <label class="qs-check"><input type="checkbox" id="qsAdminSync" checked><span>${esc(L('同步更新 ROS Center 的连接凭据并自动重连', 'Sync ROS Center credentials and reconnect'))}</span></label>
              <div class="qs-divider"></div>
              <label class="qs-check"><input type="checkbox" id="qsClean"><span>${esc(L('重新应用前先清理本工具之前生成的条目', 'Remove previous entries created by this tool before re-applying'))}</span></label>
              <div class="form-hint">${esc(L('默认按名称/comment 更新已有条目，不会堆叠；勾选清理会删除带本工具标记的旧条目（LAN 地址与网桥除外）。', 'By default existing entries are updated in place. Cleaning removes marked entries, except LAN address/bridge.'))}</div>
            </div></div>
        </div>
      </div>

      <div class="panel qs-preview" style="margin-top:14px">
        <div class="panel-head"><div><h2>${esc(L('生成的 RouterOS 脚本', 'Generated RouterOS script'))}</h2>
          <p class="sub" id="qsSummary">—</p></div><span class="topo-hint" id="qsSteps"></span></div>
        <div class="panel-body">
          <div id="qsWarn" class="qs-warn" style="display:none"></div>
          <pre class="qs-code" id="qsScript">${esc(L('加载中…', 'Loading…'))}</pre>
          <div class="form-hint">${esc(L('预览中的密码已遮蔽；下载的 .rsc 与实际应用使用真实值。', 'Passwords are masked in the preview; downloaded .rsc and the actual apply use real values.'))}</div>
          <div class="qs-actions">
            <button class="btn" id="qsPreview" type="button">${esc(L('刷新预览', 'Refresh preview'))}</button>
            <button class="btn" id="qsDownload" type="button">${esc(L('下载 .rsc', 'Download .rsc'))}</button>
            <button class="btn primary" id="qsApply" type="button">${esc(L('一键应用', 'Apply now'))}</button>
          </div>
          <div id="qsResult"></div>
        </div></div>`;

    toggleMode();
    $('qsMode').onchange = () => { toggleMode(); schedulePreview(); };
    $('qsDnsForClients').onchange = () => { toggleMode(); schedulePreview(); };
    $('qsForm').querySelectorAll('input,select').forEach((el) => {
      el.addEventListener('input', schedulePreview);
      el.addEventListener('change', schedulePreview);
    });
    $('qsPreview').onclick = refreshPreview;
    $('qsDownload').onclick = downloadScript;
    $('qsApply').onclick = apply;
    loadInterfaces();
    refreshPreview();
  };
})();
