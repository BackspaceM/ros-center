'use strict';
/* ============================================================
   Shell v2 · 主路由切换 / 通知 / 账户 / 外观 / 侧栏收起
   与设计稿一致：所有操作都在顶栏就地完成，不再跳设置页
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const icon = (name, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#${name}"/></svg>`;
  const modeLabel = (m) => m === 'light' ? L('浅色', 'Light') : m === 'dark' ? L('深色', 'Dark') : L('跟随系统', 'System');
  const statusOf = (d) => (d && d.status) || {};
  const isLive = (s) => !!(s.connected || s.mode === 'live');
  const isDemo = (s) => s.mode === 'demo' || !!s.forceDemo;

  /* ---------- 外观设置（调色板按钮 + 锚定面板 / 移动端底部抽屉） ---------- */
  let themePanel = null, themeScrim = null;

  window.__paintModeBtn = function () {
    const mb = $('modeBtn');
    if (!mb) return;
    mb.innerHTML = icon('i-palette');
    mb.dataset.mode = mode;
    mb.title = L('外观设置', 'Appearance');
  };

  function setMode(m) {
    mode = m;
    applyTheme();
    if (typeof window.__paintModeBtn === 'function') window.__paintModeBtn();
    syncThemePanel();
    toast(L('外观', 'Appearance') + ': ' + modeLabel(m), 'ok');
    if (state.section === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  }
  function setPalette(id) {
    if (!THEMES.includes(id)) return;
    theme = id;
    applyTheme();
    syncThemePanel();
    toast(L('配色', 'Palette') + ': ' + (t('theme_' + id) || id), 'ok');
    if (state.section === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
    if (state.section === 'topology' && typeof renderTopology === 'function') { try { renderTopology(); } catch (e) { /* ignore */ } }
  }
  function resetTheme() {
    theme = 'default'; mode = 'system';
    applyTheme();
    if (typeof window.__paintModeBtn === 'function') window.__paintModeBtn();
    syncThemePanel();
    toast(L('已恢复默认外观', 'Appearance reset'), 'ok');
    if (state.section === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  }

  /* 配色微缩预览色板（取现有 styles.css 的主题色） */
  const PREVIEW_COLORS = {
    default: ['#2563eb', '#eef2ff', '#2563eb'],
    ocean: ['#1f8fbf', '#e6f6fb', '#1f8fbf'], aurora: ['#9b7cff', '#2ab8e0', '#8b5cf6'],
    sakura: ['#d9668f', '#ffe6ee', '#d9668f'], forest: ['#2f8f5b', '#e8f6ee', '#2f8f5b'],
    amber: ['#d9851c', '#fff3e0', '#d9851c'], violet: ['#6d5ce0', '#efeaff', '#6d5ce0'],
    coffee: ['#a9773f', '#f5ece2', '#a9773f'], mint: ['#1f9e8f', '#e3f8f4', '#1f9e8f'],
    mono: ['#4a4a4a', '#ececec', '#4a4a4a'], glass: ['#2f6ae8', '#dfe8ff', '#7c5cff'],
    porcelain: ['#1a4f9c', '#f4f7fc', '#1a4f9c'], liquid: ['#2f6ae8', '#8b5cf6', '#2f6ae8'],
  };

  function renderThemePanel() {
    if (themePanel) return themePanel;
    const modes = [['system', L('跟随系统', 'Auto')], ['light', L('浅色', 'Light')], ['dark', L('深色', 'Dark')]];
    const cards = THEMES.map((id) => {
      const c = PREVIEW_COLORS[id] || ['#2563eb', '#eef2ff', '#2563eb'];
      return `<button type="button" class="theme-card" data-theme="${id}" aria-pressed="false" title="${esc(t('theme_' + id) || id)}">
        <span class="theme-preview" aria-hidden="true" style="--pv-p:${c[0]};--pv-bg:${c[1]};--pv-a:${c[2]}">
          <i class="pv-side"></i><i class="pv-main"><i class="pv-bar"></i><i class="pv-row"><i class="pv-tile"></i><i class="pv-chart"></i></i></i>
        </span>
        <span class="theme-name">${esc(t('theme_' + id) || id)}</span>
        ${icon('i-check', 'theme-check')}
      </button>`;
    }).join('');
    themeScrim = document.createElement('div');
    themeScrim.className = 'theme-scrim';
    themePanel = document.createElement('div');
    themePanel.className = 'theme-panel';
    themePanel.setAttribute('role', 'dialog');
    themePanel.setAttribute('aria-label', L('外观设置', 'Appearance'));
    themePanel.innerHTML = `
      <div class="tp-head">
        <div><b>${L('外观设置', 'Appearance')}</b><span>${L('配色主题与明暗模式', 'Palette and color mode')}</span></div>
        <button type="button" class="icon-btn tp-close" data-theme-close aria-label="${L('关闭面板', 'Close panel')}">${icon('i-x')}</button>
      </div>
      <div class="tp-section">
        <div class="tp-label">${L('明暗模式', 'Color mode')}</div>
        <div class="theme-mode-seg" role="group" aria-label="${L('明暗模式', 'Color mode')}">
          ${modes.map(([v, n]) => `<button type="button" data-mode="${v}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="tp-section">
        <div class="tp-label">${L('配色主题', 'Palette')} <em>${THEMES.length} ${L('套', 'themes')}</em></div>
        <div class="theme-grid">${cards}</div>
      </div>
      <div class="tp-foot">
        <button type="button" class="btn ghost tp-reset" data-theme-reset>${L('恢复默认', 'Reset')}</button>
        <span>${L('设置已自动保存', 'Saved automatically')}</span>
      </div>`;
    document.body.append(themeScrim, themePanel);
    themeScrim.addEventListener('click', () => closeThemePanel());
    themePanel.addEventListener('click', (e) => {
      if (e.target.closest('[data-theme-close]')) { closeThemePanel(); return; }
      const modeBtn = e.target.closest('.theme-mode-seg [data-mode]');
      if (modeBtn) { setMode(modeBtn.dataset.mode); return; }
      const card = e.target.closest('.theme-card');
      if (card) { setPalette(card.dataset.theme); return; }
      if (e.target.closest('[data-theme-reset]')) { resetTheme(); return; }
    });
    return themePanel;
  }

  function syncThemePanel() {
    if (!themePanel) return;
    themePanel.querySelectorAll('.theme-mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    themePanel.querySelectorAll('.theme-card').forEach((c) => {
      const on = c.dataset.theme === theme;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function positionThemePanel() {
    if (!themePanel) return;
    const mb = $('modeBtn');
    if (!mb) return;
    const b = mb.getBoundingClientRect();
    themePanel.style.setProperty('--anchor-top', Math.round(b.bottom + 10) + 'px');
    themePanel.style.setProperty('--anchor-right', Math.round(Math.max(12, window.innerWidth - b.right)) + 'px');
  }

  function openThemePanel() {
    const p = renderThemePanel();
    positionThemePanel(); syncThemePanel();
    p.classList.add('show');
    themeScrim.classList.add('show');
    $('modeBtn').setAttribute('aria-expanded', 'true');
    const first = p.querySelector('.theme-mode-seg button');
    if (first) first.focus();
  }

  function closeThemePanel(restoreFocus) {
    if (!themePanel) return;
    themePanel.classList.remove('show');
    themeScrim.classList.remove('show');
    $('modeBtn').setAttribute('aria-expanded', 'false');
    if (restoreFocus !== false) $('modeBtn').focus();
  }

  function openThemeMenu() { openThemePanel(); }

  /* ---------- 主路由按钮 ---------- */
  const boardKey = (id) => 'ros-board-name:' + (id || 'default');
  function cachedBoard(id) {
    try { return String(localStorage.getItem(boardKey(id)) || '').trim(); } catch (e) { return ''; }
  }
  function paintDevBtn() {
    const cur = state.devices.find((d) => d.id === state.deviceId) || state.devices[0];
    const s = statusOf(cur);
    const nameEl = $('devBtnName'), subEl = $('devBtnSub'), dotEl = $('devBtnDot');
    /* 设计稿：主路由后面的字段取自当前连接路由的 board-name，长度不限、按钮自适应。
       刷新瞬间 state.latest 尚未到达，先用按设备缓存的 board-name 立即显示，避免闪成 RouterOS。 */
    const res = (state.latest && state.latest.resource) || {};
    const liveBoard = String(res['board-name'] || '').trim();
    const cacheId = cur && cur.id ? cur.id : state.deviceId;
    const savedBoard = cachedBoard(cacheId);
    if (liveBoard && liveBoard !== 'RouterOS') {
      try { localStorage.setItem(boardKey(cacheId), liveBoard); } catch (e) { /* ignore */ }
    }
    const board = liveBoard || savedBoard;
    if (nameEl) nameEl.textContent = (cur && cur.name) || L('主路由', 'Primary');
    if (subEl) subEl.textContent = !cur ? 'RouterOS' : board || (isDemo(s) ? 'DEMO' : isLive(s) ? 'RouterOS' : L('连接中', 'Connecting'));
    if (dotEl) dotEl.classList.toggle('live', !!cur && (isLive(s) || isDemo(s)));
  }

  function openDeviceMenu(anchor) {
    if (!window.UI) return;
    const rows = state.devices.map((d) => {
      const s = statusOf(d);
      const dot = isLive(s) || isDemo(s) ? 'on' : s.enabled === false ? 'is-muted' : 'is-amber';
      const sub = isDemo(s) ? L('演示数据 · DEMO', 'Demo data') : isLive(s) ? (s.host || 'RouterOS') : (s.error ? String(s.error).slice(0, 42) : L('正在连接…', 'Connecting…'));
      return {
        dot, label: d.name, sub,
        badge: d.id === state.deviceId ? L('当前', 'Active') : '',
        keepOpen: false,
        action: () => { if (d.id !== state.deviceId) switchDevice(d.id); else paintDevBtn(); }
      };
    });
    const head = `<div class="ui-menu-head"><span>${L('切换设备', 'Switch device')}</span><small>${state.devices.length} ${L('台', 'devices')}</small></div>`;
    UI.openMenu(anchor || $('devBtn'), [
      { sep: false, html: head },
      ...rows,
      { sep: true },
      { label: L('查看所有设备', 'All devices'), icon: 'i-device', action: () => navigate('devices') },
      { label: L('连接设置', 'Connection settings'), icon: 'i-lock', action: () => navigate('connectionSettings') }
    ], { wide: true });
  }

  /* ---------- 通知 ---------- */
  let updateInfo = null, unreadHidden = false;
  /* 真实日志事实：防火墙丢弃规则触发条数（来自 RouterOS 日志，无则不显示） */
  let notifFacts = { firewallDrops: 0, firewallSample: '' };
  async function loadNotifFacts() {
    try {
      const d = await api('/api/config?section=logs');
      const rows = (d && d.rows) || [];
      let n = 0, sample = '';
      for (const r of rows) {
        const topics = String(r.topics || '').toLowerCase();
        const msg = String(r.message || '');
        if (/\bfirewall\b/.test(topics) && /(drop|reject|丢弃)/i.test(msg + ' ' + topics)) {
          n++;
          if (!sample) {
            const ip = msg.match(/(\d{1,3}\.){3}\d{1,3}/);
            sample = ip ? ip[0] : String(r.time || '');
          }
        }
      }
      notifFacts = { firewallDrops: n, firewallSample: sample };
    } catch (e) { /* 保留上次事实 */ }
    return notifFacts;
  }

  function collectNotifications() {
    const out = [];
    state.devices.forEach((d) => {
      const s = statusOf(d);
      if (s.enabled === false) return;
      if (!isLive(s) && !isDemo(s)) {
        out.push({ dot: 'is-red', label: L('设备连接中断', 'Device offline') + ' · ' + d.name,
          sub: s.error ? String(s.error).slice(0, 48) : L('正在自动重连…', 'Reconnecting…'),
          action: () => { if (d.id !== state.deviceId) switchDevice(d.id); navigate('devices'); } });
      }
    });
    const q = (state.quality && state.quality.rows) || [];
    const bad = q.filter((r) => r.status === 'down' || (r.loss != null && Number(r.loss) > 5) || (r.latency != null && Number(r.latency) > 200));
    if (bad.length) {
      const r = bad[0];
      out.push({ dot: 'is-amber', label: L('链路质量异常', 'Link quality alert'),
        sub: `${r.target || r.name || '—'}${r.loss != null ? ' · ' + r.loss + '% ' + L('丢包', 'loss') : ''}${r.latency != null ? ' · ' + Math.round(r.latency) + ' ms' : ''}`,
        action: () => navigate('dashboard') });
    }
    if (updateInfo && updateInfo.ok && updateInfo.hasUpdate) {
      out.push({ dot: 'is-amber', label: L('发现固件更新', 'Firmware update available'),
        sub: L('最新版本', 'Latest') + ' ' + ((updateInfo.latest || {}).version || '—'),
        action: () => navigate('updates') });
    }
    if (notifFacts.firewallDrops > 0) {
      const n = notifFacts.firewallDrops;
      out.push({ dot: 'is-red', label: L('防火墙丢弃规则触发', 'Firewall drop rule triggered') + ' ' + n + L(' 次', ' times'),
        sub: (notifFacts.firewallSample ? L('来源', 'Source') + ' ' + notifFacts.firewallSample + ' · ' : '') + L('打开日志中心查看', 'View in log center'),
        action: () => navigate('logsCenter') });
    }
    return out;
  }
  function paintBell() {
    const dot = $('bellDot');
    if (!dot) return;
    const n = noticeRows().length;
    dot.hidden = unreadHidden || n === 0;
    dot.title = n + ' ' + L('条通知', 'notifications');
  }
  /* 设计稿同款通知：只展示真实事件，未读才有标记已读按钮，底部纵向堆叠 */
  function noticeRows() {
    return collectNotifications().slice(0, 3).map((it) => ({
      dot: it.dot || 'is-blue', label: it.label, sub: it.sub,
      act: () => { unreadHidden = true; paintBell(); it.action(); }
    }));
  }
  function openBell() {
    if (!window.UI) return;
    const rows = noticeRows();
    const hasRows = rows.length > 0;
    const unread = hasRows && !unreadHidden;
    const headSmall = unread ? `${rows.length} ${L('条未读', 'unread')}` : '';
    const head = `<div class="ui-menu-head"><b>${L('通知', 'Notifications')}</b>${
      headSmall ? `<small>${esc(headSmall)}</small>` : ''
    }</div>`;
    const notif = `<div class="ui-notif">${hasRows ? rows.map((it, i) =>
      `<button class="ui-notif-item" type="button" data-ni="${i}"><span class="dot ${esc(it.dot)}"></span><div><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></div></button>`
    ).join('') : `<div class="ui-menu-empty">${L('暂无新通知', 'No new notifications')}</div>`}</div>`;
    /* 无通知：左侧「全部标记已读」位置留空；「打开日志中心」始终靠右 */
    const foot = `<div class="ui-notif-foot">${
      unread ? `<button type="button" class="ui-linkbtn" id="notifReadAll">${L('全部标记已读', 'Mark all read')}</button>` : ''
    }<button type="button" class="ui-linkbtn" id="notifOpenLogs">${L('打开日志中心', 'Open log center')}</button></div>`;
    UI.openMenu($('bellBtn'), [{ html: head + notif + foot }], {
      wide: true,
      alignLeft: true,
      onMount(el) {
        el.querySelectorAll('[data-ni]').forEach((b) => {
          b.onclick = () => { UI.closeMenu(); const it = rows[Number(b.dataset.ni)]; if (it && it.act) it.act(); };
        });
        const read = el.querySelector('#notifReadAll');
        if (read) read.onclick = () => {
          unreadHidden = true; paintBell(); UI.closeMenu();
          toast(L('通知已全部标记已读', 'Notifications marked as read'),
            L('徽标已清除，状态只保留在当前页面会话。', 'Badge cleared for this session.'), 'success');
        };
        const logs = el.querySelector('#notifOpenLogs');
        if (logs) logs.onclick = () => { UI.closeMenu(); navigate('logsCenter'); };
      }
    });
  }

  /* ---------- 账户 ---------- */
  let avatarUrl = '';
  function paintAvatar(url) {
    const av = $('avatarBtn'); if (!av) return;
    if (url) {
      av.innerHTML = '<img src="' + url + '" alt="">';
      av.title = L('账户 / 更换头像', 'Account / change avatar');
    } else {
      av.textContent = ((state.authUser || 'admin')[0] || 'A').toUpperCase();
      av.title = L('账户 / Account', 'Account / Account');
    }
  }
  function loadAvatar() {
    const bust = '?t=' + Date.now();
    const url = '/api/user/avatar' + bust;
    fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) return null;
      return r.blob();
    }).then((blob) => {
      if (!blob || !/^image\//.test(blob.type)) return;
      if (avatarUrl && avatarUrl.indexOf('blob:') === 0) URL.revokeObjectURL(avatarUrl);
      avatarUrl = URL.createObjectURL(blob);
      paintAvatar(avatarUrl);
    }).catch(() => { /* 头像不存在时保留首字母 */ });
  }
  window.addEventListener('ros-avatar-updated', () => loadAvatar());

  function openAvatar() {
    if (!window.UI) return;
    const user = state.authUser || 'admin';
    const authOn = !!state.authEnabled;
    const role = state.authRole || 'admin';
    const roleTxt = role === 'write' ? L('可写', 'Write') : role === 'read' ? L('只读', 'Read-only') : L('管理员', 'Administrator');
    const head = `<div class="ui-menu-head"><span>${esc(user)}</span><small>${authOn ? L('WebUI · 已登录', 'WebUI · signed in') + ' · ' + roleTxt : L('WebUI · 免登录', 'WebUI · open')}</small></div>`;
    const rows = [{ html: head }];
    if (role === 'admin') {
      rows.push({ label: L('用户与权限', 'Users & access'), icon: 'i-users', action: () => navigate('usersCenter') });
    }
    if (role === 'admin' && state.authDefaultPassword) {
      rows.push({ label: L('新增管理员账户', 'Add administrator'), icon: 'i-shield', action: () => {
        window.__rosDefaultPwdShown = false;
        if (typeof window.__rosDefaultPwdPrompt === 'function') window.__rosDefaultPwdPrompt();
      } });
    }
    rows.push(
      { label: L('设备与固件', 'Devices & firmware'), icon: 'i-device', action: () => navigate('devices') });
    if (role !== 'read') {
      rows.push({ label: L('连接设置', 'Connection settings'), icon: 'i-lock', action: () => navigate('connectionSettings') });
    }
    rows.push(
      { label: L('导出配置快照', 'Export snapshot'), icon: 'i-download', action: () => { const b = $('exportBtn'); if (b) b.click(); } },
      { sep: true },
      { label: lang === 'zh' ? 'Switch to English' : '切换到中文', icon: 'i-globe', action: () => { const b = $('langBtn'); if (b) b.click(); } },
      authOn
        ? { label: L('退出登录', 'Sign out'), icon: 'i-lock', danger: true, action: () => { const b = $('authLogoutBtn'); if (b) b.click(); } }
        : { label: L('未启用登录保护', 'Login protection off'), sub: L('在「用户与权限」中设置账户密码', 'Set a password in Users & access'), disabled: true }
    );
    UI.openMenu($('avatarBtn'), rows, { wide: true });
  }

  /* ---------- 侧栏收起 ---------- */
  function syncCollapseChrome() {
    const sb = $('sidebar');
    const shell = $('shell');
    const btn = $('collapseBtn');
    const c = !!(sb && sb.classList.contains('collapsed'));
    if (shell) shell.classList.toggle('side-collapsed', c);
    if (btn) {
      if (!btn.querySelector('svg')) btn.innerHTML = icon('i-panel');
      btn.title = c ? L('展开侧栏', 'Expand sidebar') : L('收起侧栏', 'Collapse sidebar');
      btn.setAttribute('aria-expanded', String(!c));
    }
  }
  window.__openDeviceMenu = openDeviceMenu;
  window.__paintDevBtn = paintDevBtn;
  window.__shellAfterCollapse = function () {
    state.flyoutGroup = '';
    const sb = $('sidebar');
    if (sb) sb.querySelectorAll('.nav-group.flyout-open').forEach((g) => g.classList.remove('flyout-open'));
    if (window.UI) UI.closeMenu();
    syncCollapseChrome();
    paintDevBtn();
  };
  function setCollapsed(on) {
    const sb = $('sidebar');
    if (!sb) return;
    sb.classList.toggle('collapsed', !!on);
    try { localStorage.setItem('ros-traffic-collapsed', on ? '1' : '0'); } catch (e) { /* ignore */ }
    window.__shellAfterCollapse();
    setTimeout(() => {
      if (state.section === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
      if (state.section === 'trafficStats' && typeof renderTrafficStats === 'function') renderTrafficStats();
    }, 200);
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    if (window.__shellV2Bound) return;
    window.__shellV2Bound = true;

    window.__paintModeBtn();
    const mb = $('modeBtn');
    if (mb) mb.onclick = (e) => {
      e.stopPropagation();
      if (themePanel && themePanel.classList.contains('show')) closeThemePanel();
      else openThemePanel();
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeThemePanel(false); });

    const devBtn = $('devBtn');
    if (devBtn) devBtn.onclick = (e) => { e.stopPropagation(); openDeviceMenu(devBtn); };

    const bell = $('bellBtn');
    if (bell) bell.onclick = (e) => { e.stopPropagation(); openBell(); };

    const av = $('avatarBtn');
    if (av) av.onclick = (e) => { e.stopPropagation(); openAvatar(); };

    const sideStatus = document.querySelector('.side-foot .side-status');
    if (sideStatus) sideStatus.addEventListener('click', (e) => {
      if (e.target.closest('select, label')) return;
      const sb = $('sidebar');
      if (sb && sb.classList.contains('collapsed')) { setCollapsed(false); return; }
      openDeviceMenu(sideStatus);
    });

    const cb = $('collapseBtn');
    if (cb) cb.onclick = (e) => {
      e.stopPropagation();
      const sb = $('sidebar');
      setCollapsed(!(sb && sb.classList.contains('collapsed')));
    };

    const logo = document.querySelector('.side-brand .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.title = L('展开侧栏', 'Expand sidebar');
      logo.onclick = () => {
        const sb = $('sidebar');
        if (sb && sb.classList.contains('collapsed')) setCollapsed(false);
      };
    }

    /* 设备切换 / 侧栏刷新后同步顶栏 */
    const origPicker = window.renderDevicePicker;
    if (typeof origPicker === 'function') {
      window.renderDevicePicker = function () {
        const r = origPicker.apply(this, arguments);
        paintDevBtn();
        return r;
      };
    }
  }

  function bootShell() {
    bind();
    syncCollapseChrome();
    paintDevBtn();
    paintBell();
    loadNotifFacts().then(() => paintBell());
    api('/api/update/status').then((d) => { updateInfo = d.status || null; paintBell(); }).catch(() => {});
    api('/api/auth').then((a) => {
      if (!a) return;
      state.authEnabled = !!a.enabled;
      state.authUser = a.user || '';
      paintAvatar('');
      loadAvatar();
    }).catch(() => {});
    setInterval(() => { paintDevBtn(); loadNotifFacts().then(() => paintBell()); }, 5000);
    window.addEventListener('resize', () => { syncCollapseChrome(); if (themePanel && themePanel.classList.contains('show')) positionThemePanel(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootShell);
  else bootShell();
})();