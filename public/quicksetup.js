'use strict';
/* 一键配置向导：上网方式 / 内网 DHCP / 防火墙 / 管理员账号 -> 脚本预览、下载、应用 */
(function () {
  let previewTimer = null;
  const val = (id) => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const checked = (id) => { const el = $(id); return !!(el && el.checked); };
  const num = (id, d) => Number(val(id)) || d;
  /* LAN 二选一：新建 bridge-lan 网桥，或直接使用现有接口 */
  const lanMode = () => {
    const r = document.querySelector('input[name="qsLanMode"]:checked');
    return r ? r.value : 'bridge';
  };
  function toggleLanMode() {
    const bridge = lanMode() === 'bridge';
    const bp = $('qsBridgePortsRow'), lr = $('qsLanIfaceRow');
    if (bp) bp.style.display = bridge ? '' : 'none';
    if (lr) lr.style.display = bridge ? 'none' : '';
    /* 与旧字段保持同步，兼容其它读取 qsBridge 的地方 */
    const cb = $('qsBridge'); if (cb) cb.checked = bridge;
  }

  function collect() {
    return {
      device: state.deviceId || '',
      mode: val('qsMode') || 'pppoe',
      wanInterface: val('qsWan') || 'ether1',
      lanInterface: lanMode() === 'bridge' ? 'bridge-lan' : (val('qsLan') || 'bridge-lan'),
      createBridge: lanMode() === 'bridge',
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
      const rw = $('qsReviewWan'), rl = $('qsReviewLan');
      if (rw) rw.textContent = (s.wanIface || '—') + ' · ' + (val('qsMode') || 'pppoe').toUpperCase();
      if (rl) rl.textContent = s.lanCidr || '—';
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
    let names = [], live = false;
    try {
      /* api() 自动带当前 state.deviceId：接口列表只来自当前选中的路由器，不会串到别的设备 */
      const d = await api('/api/config?section=interfaces');
      if (!d.offline) { names = (d.rows || []).map((r) => r.name).filter(Boolean); live = names.length > 0; }
    } catch (e) { /* 离线/未连接：用默认接口列表 */ }
    const cur = (state.devices || []).find((x) => x.id === state.deviceId) || {};
    const devName = cur.name || L('当前设备', 'Current device');
    /* 无真实接口时用常见默认值，菜单始终可用 */
    const all = live ? [...new Set(names)] : [...new Set(['ether1', 'ether2', 'ether3', 'ether4', 'ether5', 'bridge-lan'])];
    const head = `<div class="qs-combo-head">${esc(L('来自', 'From'))} <b>${esc(devName)}</b>${live ? '' : ' · ' + esc(L('未连接，显示常用接口', 'Offline — common ports'))}</div>`;
    document.querySelectorAll('[data-combo-menu]').forEach((menu) => {
      menu.innerHTML = head + (all.map((n) => `<button type="button" class="qs-combo-opt" data-val="${esc(n)}">${esc(n)}</button>`).join('')
        || `<div class="qs-combo-empty">${esc(L('没有扫描到接口，可直接输入', 'No interfaces found — type a name'))}</div>`);
    });
  }

  /* ---------- 向导步骤 ---------- */
  let currentStep = 1;
  const TOTAL_STEPS = 5;
  function goStep(n) {
    currentStep = Math.max(1, Math.min(TOTAL_STEPS, n));
    document.querySelectorAll('.qs-step-pane').forEach((p) => {
      p.classList.toggle('active', Number(p.dataset.qsStep) === currentStep);
    });
    document.querySelectorAll('.qs-step-tab').forEach((tab) => {
      const i = Number(tab.dataset.qsStep);
      tab.classList.toggle('active', i === currentStep);
      tab.classList.toggle('done', i < currentStep);
    });
    const prev = $('qsStepPrev'), next = $('qsStepNext');
    if (prev) prev.disabled = currentStep === 1;
    if (next) { next.hidden = currentStep === TOTAL_STEPS; next.textContent = currentStep === TOTAL_STEPS - 1
      ? L('生成预览', 'Preview') : L('下一步', 'Next'); }
    const bar = $('qsStepBar');
    if (bar) bar.style.width = (currentStep / TOTAL_STEPS * 100) + '%';
    const cnt = $('qsStepCount'); if (cnt) cnt.textContent = currentStep + ' / ' + TOTAL_STEPS;
    if (currentStep === TOTAL_STEPS) refreshPreview();
    const box = $('qsForm'); if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.renderQuickSetupPage = function renderQuickSetupPage() {
    /* 组合控件：输入框可手填 + ▾ 按钮展开接口菜单（菜单由 loadInterfaces 填充，确保点一下就有反应） */
    const ifaceInput = (inputId, def, help) => `<div class="qs-combo" data-combo="${inputId}">
      <input type="text" id="${inputId}" value="${def}" aria-label="${esc(L('接口名', 'Interface'))}"
        placeholder="${esc(L('选择或输入接口名', 'Select or type an interface'))}" autocomplete="off">
      <button type="button" class="qs-combo-btn" data-combo-btn="${inputId}" aria-label="${esc(L('展开接口列表', 'Show interfaces'))}">▾</button>
      <div class="qs-combo-menu" data-combo-menu="${inputId}" hidden></div>
    </div>
    ${help ? `<div class="form-hint">${esc(help)}</div>` : ''}`;
    $('content').innerHTML = `
      <div class="qs-hero">
        <div class="qs-hero-icon">⚙</div>
        <div><h1>${esc(L('一键配置', 'Quick setup'))}</h1>
          <p>${esc(L('跟着向导走 5 步，生成可预览的 RouterOS 配置，确认无误后再应用到路由器。', 'Follow 5 steps to generate a reviewable RouterOS config, then apply it when ready.'))}</p></div>
        <span class="qs-tag">${esc(L('先预览，再应用', 'Preview before apply'))}</span>
      </div>

      <div class="qs-warn-top">${esc(L('建议在未配置或已恢复出厂的路由器上使用；本工具按 comment 幂等更新自己生成的条目，不删除手工规则。生产环境请先备份。', 'Best on a fresh/reset router. Entries are updated idempotently by comment; manual rules are untouched. Back up production configs first.'))}</div>

      <div class="qs-wizard" id="qsForm">
        <div class="qs-stepper">
          <div class="qs-step-bar"><i id="qsStepBar"></i></div>
          ${[
            [1, L('上网方式', 'WAN'), L('WAN 接入', 'WAN uplink')],
            [2, L('内网 DHCP', 'LAN'), L('网段与地址池', 'Subnet & pool')],
            [3, L('防火墙系统', 'Firewall'), L('安全与服务', 'Security & services')],
            [4, L('管理员账号', 'Account'), L('用户名密码', 'Credentials')],
            [5, L('预览应用', 'Review'), L('检查并应用', 'Review & apply')],
          ].map(([n, t1, t2]) => `<button type="button" class="qs-step-tab" data-qs-step="${n}"><span class="qs-step-dot">${n}</span><span class="qs-step-txt"><b>${esc(t1)}</b><small>${esc(t2)}</small></span></button>`).join('')}
        </div>

        <div class="qs-step-pane active" data-qs-step="1">
          <div class="qs-pane-head"><span class="qs-pane-num">1</span><div><h2>${esc(L('上网方式', 'WAN / uplink'))}</h2><p>${esc(L('选择路由器如何接入互联网', 'How the router connects to the internet'))}</p></div></div>
          <div class="qs-field"><label>${esc(L('接入类型', 'Connection type'))}</label>
            <div class="qs-mode-cards">
              <label class="qs-mode-card"><input type="radio" name="qsModeRadio" value="pppoe" checked><span class="qs-mode-ic">PPP</span><span><b>PPPoE</b><small>${esc(L('拨号上网', 'Dial-up'))}</small></span></label>
              <label class="qs-mode-card"><input type="radio" name="qsModeRadio" value="dhcp"><span class="qs-mode-ic">DHCP</span><span><b>DHCP</b><small>${esc(L('自动获取', 'Auto'))}</small></span></label>
              <label class="qs-mode-card"><input type="radio" name="qsModeRadio" value="static"><span class="qs-mode-ic">IP</span><span><b>${esc(L('静态 IP', 'Static'))}</b><small>${esc(L('固定地址', 'Fixed address'))}</small></span></label>
            </div>
            <select id="qsMode" hidden><option value="pppoe">PPPoE</option><option value="dhcp">DHCP</option><option value="static">Static</option></select>
          </div>
          <div class="qs-field"><label>${esc(L('WAN 接口', 'WAN interface'))}</label>
            ${ifaceInput('qsWan', 'ether1', L('点击下拉选择已检测接口，或直接输入接口名。', 'Click to pick a detected interface, or just type a name.'))}</div>
          <div class="qs-sub" id="qsPppoeRow">
            <div class="qs-inline2">
              <div class="qs-field"><label>${esc(L('PPPoE 账号', 'Username'))}</label><input type="text" id="qsPppoeUser" autocomplete="off" placeholder="user@isp"></div>
              <div class="qs-field"><label>${esc(L('PPPoE 密码', 'Password'))}</label><input type="password" id="qsPppoePass" autocomplete="new-password"></div>
            </div>
            <div class="qs-inline3">
              <div><label>${esc(L('接口名', 'Name'))}</label><input type="text" id="qsPppoeName" value="pppoe-out1"></div>
              <div><label>MTU</label><input type="number" id="qsPppoeMtu" value="1480" min="576" max="1500"></div>
              <div><label>MRU</label><input type="number" id="qsPppoeMru" value="1480" min="576" max="1500"></div>
            </div>
            <div class="qs-field"><label>${esc(L('服务名', 'Service name'))}</label><input type="text" id="qsPppoeService" placeholder="${esc(L('可留空', 'optional'))}"></div>
            <label class="qs-check"><input type="checkbox" id="qsPppoePeerDns"><span>${esc(L('使用运营商下发的 DNS', 'Use peer DNS'))}</span></label>
          </div>
          <div class="qs-sub" id="qsDhcpRow" style="display:none">
            <label class="qs-check"><input type="checkbox" id="qsWanPeerDns" checked><span>${esc(L('使用对端 DNS', 'Use peer DNS'))}</span></label>
            <label class="qs-check"><input type="checkbox" id="qsWanDefaultRoute" checked><span>${esc(L('添加默认路由', 'Add default route'))}</span></label>
          </div>
          <div class="qs-sub" id="qsStaticRow" style="display:none">
            <div class="qs-inline2">
              <div class="qs-field"><label>${esc(L('WAN 地址', 'WAN address'))}</label><input type="text" id="qsStaticAddr" placeholder="10.0.1.2/30"></div>
              <div class="qs-field"><label>${esc(L('默认网关', 'Gateway'))}</label><input type="text" id="qsStaticGw" placeholder="10.0.1.1"></div>
            </div>
          </div>
        </div>

        <div class="qs-step-pane" data-qs-step="2">
          <div class="qs-pane-head"><span class="qs-pane-num">2</span><div><h2>${esc(L('内网与 DHCP', 'LAN & DHCP'))}</h2><p>${esc(L('配置内网网段、地址池与 DNS', 'Subnet, address pool and DNS'))}</p></div></div>
          <div class="qs-field"><label>${esc(L('内网网段（网关 IP/前缀）', 'LAN subnet (gateway IP/prefix)'))}</label>
            <input type="text" id="qsLanCidr" value="192.168.88.1/24" placeholder="192.168.88.1/24">
            <div class="form-hint">${esc(L('如 10.10.0.1/16；地址池自动推算，也可手动指定。', 'e.g. 10.10.0.1/16; pool derived automatically unless overridden.'))}</div></div>
          <div class="qs-inline3">
            <div><label>${esc(L('地址池起', 'Pool start'))}</label><input type="text" id="qsPoolStart" placeholder="${esc(L('自动', 'auto'))}"></div>
            <div><label>${esc(L('地址池止', 'Pool end'))}</label><input type="text" id="qsPoolEnd" placeholder="${esc(L('自动', 'auto'))}"></div>
            <div><label>${esc(L('租约', 'Lease'))}</label><input type="text" id="qsLease" value="1d"></div>
          </div>
          <div class="qs-field"><label>${esc(L('LAN 接口方式', 'LAN interface mode'))}</label>
            <div class="qs-mode-cards qs-lan-mode">
              <label class="qs-mode-card"><input type="radio" name="qsLanMode" value="bridge" checked><span class="qs-mode-ic">▦</span><span><b>bridge-lan</b><small>${esc(L('新建网桥，聚合多个端口', 'Create a bridge with ports'))}</small></span></label>
              <label class="qs-mode-card"><input type="radio" name="qsLanMode" value="existing"><span class="qs-mode-ic">▤</span><span><b>${esc(L('现有接口', 'Existing interface'))}</b><small>${esc(L('直接用 ether/bridge 接口', 'Use an existing interface'))}</small></span></label>
            </div>
            <input type="checkbox" id="qsBridge" checked hidden>
          </div>
          <div class="qs-field" id="qsBridgePortsRow"><label>${esc(L('桥接端口（加入 bridge-lan）', 'Bridge ports (joined to bridge-lan)'))}</label>
            <input type="text" id="qsBridgePorts" value="ether2,ether3,ether4,ether5" placeholder="ether2,ether3"></div>
          <div class="qs-field" id="qsLanIfaceRow" style="display:none"><label>${esc(L('LAN 接口', 'LAN interface'))}</label>
            ${ifaceInput('qsLan', 'bridge-lan', L('从下拉选择，或直接输入接口名。', 'Pick from the list or type an interface name.'))}</div>
          <div class="qs-inline2">
            <div class="qs-field"><label>${esc(L('上游 DNS', 'Upstream DNS'))}</label><input type="text" id="qsDns" value="223.5.5.5,119.29.29.29"></div>
            <div class="qs-field"><label>${esc(L('下发给客户端的 DNS', 'DNS for clients'))}</label><select id="qsDnsForClients">
              <option value="gateway">${esc(L('网关自身（DNS 缓存）', 'Router itself (DNS cache)'))}</option>
              <option value="upstream">${esc(L('直接上游 DNS', 'Upstream DNS'))}</option>
              <option value="custom">${esc(L('自定义', 'Custom'))}</option></select></div>
          </div>
          <div class="qs-field" id="qsCustomDnsRow" style="display:none"><label>${esc(L('自定义 DNS', 'Custom DNS'))}</label><input type="text" id="qsCustomDns" placeholder="10.0.0.2,10.0.0.3"></div>
          <div class="qs-inline2">
            <div class="qs-field"><label>${esc(L('域名', 'Domain'))}</label><input type="text" id="qsDomain" value="lan"></div>
            <div class="qs-field"><label>${esc(L('DHCP 选项集（可选）', 'DHCP option set (optional)'))}</label><input type="text" id="qsOptionSet" placeholder="lan-extras"></div>
          </div>
          <div class="form-hint">${esc(L('选项集在「网络设置 → DHCP 选项集」创建，这里填名称关联。', 'Create option sets under Network → DHCP options, then reference by name.'))}</div>
        </div>

        <div class="qs-step-pane" data-qs-step="3">
          <div class="qs-pane-head"><span class="qs-pane-num">3</span><div><h2>${esc(L('防火墙与系统', 'Firewall & system'))}</h2><p>${esc(L('基础防护、设备名与不安全服务', 'Basic protection, identity and insecure services'))}</p></div></div>
          <div class="qs-check-list">
            <label class="qs-check"><input type="checkbox" id="qsFwBasic" checked><span>${esc(L('常用防火墙模板（input/forward + NAT 伪装）', 'Common firewall template (input/forward + NAT masquerade)'))}</span></label>
            <label class="qs-check"><input type="checkbox" id="qsFwFasttrack" checked><span>FastTrack ${esc(L('加速已建立连接', 'for established connections'))}</span></label>
            <label class="qs-check"><input type="checkbox" id="qsFwDropWan" checked><span>${esc(L('丢弃来自 WAN 的入站管理流量', 'Drop inbound WAN management traffic'))}</span></label>
            <label class="qs-check"><input type="checkbox" id="qsFwAllowPing"><span>${esc(L('允许 WAN 侧 Ping', 'Allow WAN ping'))}</span></label>
          </div>
          <div class="qs-field"><label>${esc(L('设备名称', 'Device identity'))}</label><input type="text" id="qsIdentity" placeholder="ROS-Center"></div>
          <div class="qs-field"><label>${esc(L('关闭不安全服务', 'Disable insecure services'))}</label>
            <div class="qs-checks-inline">
              <label class="qs-check"><input type="checkbox" id="qsSvcTelnet"><span>telnet</span></label>
              <label class="qs-check"><input type="checkbox" id="qsSvcFtp" checked><span>ftp</span></label>
              <label class="qs-check"><input type="checkbox" id="qsSvcWww"><span>www</span></label></div>
            <div class="form-hint">${esc(L('API / SSH / WinBox 不会被禁用，避免把 ROS Center 踢下线。', 'API / SSH / WinBox are never disabled, so ROS Center stays connected.'))}</div></div>
        </div>

        <div class="qs-step-pane" data-qs-step="4">
          <div class="qs-pane-head"><span class="qs-pane-num">4</span><div><h2>${esc(L('管理员账号', 'Administrator account'))}</h2><p>${esc(L('可选：修改路由器登录用户名与密码', 'Optionally change the router login'))}</p></div></div>
          <label class="qs-check"><input type="checkbox" id="qsAdminEnabled"><span>${esc(L('修改用户名 / 密码', 'Change username / password'))}</span></label>
          <div class="qs-inline2">
            <div class="qs-field"><label>${esc(L('当前用户名', 'Current username'))}</label><input type="text" id="qsAdminCurrent" value="admin"></div>
            <div class="qs-field"><label>${esc(L('新用户名', 'New username'))}</label><input type="text" id="qsAdminNewUser" placeholder="${esc(L('留空只改密码', 'blank = password only'))}"></div>
          </div>
          <div class="qs-inline2">
            <div class="qs-field"><label>${esc(L('新密码（≥8）', 'New password (≥8)'))}</label><input type="password" id="qsAdminNewPass" autocomplete="new-password"></div>
            <div class="qs-field"><label>${esc(L('确认密码', 'Confirm password'))}</label><input type="password" id="qsAdminConfirm" autocomplete="new-password"></div>
          </div>
          <label class="qs-check"><input type="checkbox" id="qsAdminSync" checked><span>${esc(L('同步更新 ROS Center 连接凭据并自动重连', 'Sync ROS Center credentials and reconnect'))}</span></label>
          <div class="qs-divider"></div>
          <label class="qs-check"><input type="checkbox" id="qsClean"><span>${esc(L('重新应用前清理本工具之前生成的条目', 'Remove entries previously created by this tool'))}</span></label>
          <div class="form-hint">${esc(L('默认按 comment 幂等更新；勾选清理会删除带本工具标记的旧条目（LAN 地址与网桥除外）。', 'Default updates in place by comment; cleaning removes marked entries except LAN address/bridge.'))}</div>
        </div>

        <div class="qs-step-pane" data-qs-step="5">
          <div class="qs-pane-head"><span class="qs-pane-num">5</span><div><h2>${esc(L('预览与应用', 'Review & apply'))}</h2><p>${esc(L('检查生成的脚本，确认后再写入路由器', 'Review the generated script before writing'))}</p></div></div>
          <div class="qs-review-cards">
            <div class="qs-review-card"><small>${esc(L('上网方式', 'WAN'))}</small><b id="qsReviewWan">—</b></div>
            <div class="qs-review-card"><small>${esc(L('内网网段', 'LAN'))}</small><b id="qsReviewLan">—</b></div>
            <div class="qs-review-card"><small>${esc(L('命令数', 'Commands'))}</small><b id="qsSteps">—</b></div>
          </div>
          <div class="qs-preview">
            <div class="qs-preview-head"><span>${esc(L('生成的 RouterOS 脚本', 'Generated RouterOS script'))}</span><span class="topo-hint" id="qsSummary">—</span></div>
            <div id="qsWarn" class="qs-warn" style="display:none"></div>
            <pre class="qs-code" id="qsScript">${esc(L('加载中…', 'Loading…'))}</pre>
            <div class="form-hint">${esc(L('预览密码已遮蔽；下载的 .rsc 与实际应用使用真实值。', 'Passwords masked in preview; real values used on download/apply.'))}</div>
          </div>
          <div class="qs-actions">
            <button class="btn" id="qsPreview" type="button">${esc(L('刷新预览', 'Refresh'))}</button>
            <button class="btn" id="qsDownload" type="button">${esc(L('下载 .rsc', 'Download .rsc'))}</button>
            <button class="btn primary" id="qsApply" type="button">${esc(L('一键应用', 'Apply now'))}</button>
          </div>
          <div id="qsResult"></div>
        </div>

        <div class="qs-wizard-nav">
          <button class="btn" id="qsStepPrev" type="button">← ${esc(L('上一步', 'Back'))}</button>
          <span class="qs-step-count" id="qsStepCount">1 / 5</span>
          <button class="btn primary" id="qsStepNext" type="button">${esc(L('下一步', 'Next'))} →</button>
        </div>
      </div>`;

    /* 接入类型卡片 → 同步隐藏的 select（collect 依赖 qsMode） */
    document.querySelectorAll('input[name="qsModeRadio"]').forEach((r) => {
      r.onchange = () => { const m = $('qsMode'); if (m) { m.value = r.value; m.dispatchEvent(new Event('change')); } };
    });
    /* LAN 二选一切换 */
    document.querySelectorAll('input[name="qsLanMode"]').forEach((r) => {
      r.onchange = () => { toggleLanMode(); schedulePreview(); };
    });
    toggleLanMode();
    /* 接口组合控件：点 ▾ 展开菜单，点选项填入；点外部收起 */
    const closeMenus = () => document.querySelectorAll('[data-combo-menu]').forEach((m) => { m.hidden = true; });
    document.querySelectorAll('[data-combo-btn]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const menu = document.querySelector(`[data-combo-menu="${btn.dataset.comboBtn}"]`);
        if (!menu) return;
        const willOpen = menu.hidden;
        closeMenus();
        menu.hidden = !willOpen;
      };
    });
    document.querySelectorAll('[data-combo-menu]').forEach((menu) => {
      menu.onclick = (e) => {
        const opt = e.target.closest('[data-val]'); if (!opt) return;
        const input = $(menu.dataset.comboMenu);
        if (input) { input.value = opt.dataset.val; input.dispatchEvent(new Event('input')); }
        menu.hidden = true;
      };
    });
    if (!window.__qsComboDocBound) {
      window.__qsComboDocBound = true;
      document.addEventListener('click', (e) => { if (!e.target.closest('.qs-combo')) closeMenus(); });
    }
    /* 步骤导航 */
    document.querySelectorAll('.qs-step-tab').forEach((tab) => { tab.onclick = () => goStep(Number(tab.dataset.qsStep)); });
    $('qsStepPrev').onclick = () => goStep(currentStep - 1);
    $('qsStepNext').onclick = () => goStep(currentStep + 1);

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
    currentStep = 1; goStep(1);
    refreshPreview();
  };
})();
