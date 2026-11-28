'use strict';
/* 设计稿导航：左侧按设计稿的 总览 / 网络 / 系统 分组平铺，
   每个主入口对应一个功能中心，其余 RouterOS 配置页收进顶部标签条。
   页面 id / 渲染函数 / 持久化完全沿用原逻辑。 */
(function () {
  const NAV_GROUPS = [
    { id: 'overview', zh: '总览', en: 'Overview' },
    { id: 'network', zh: '网络', en: 'Network' },
    { id: 'system', zh: '系统', en: 'System' },
  ];

  /* 设计稿入口 → 功能中心（标签页） */
  const HUBS = [
    { id: 'trafficHub', group: 'overview', zh: '流量统计', en: 'Traffic stats', icon: 'i-chart',
      hintZh: '速率趋势 · 流量分布', hintEn: 'Rates · distribution',
      sections: ['trafficStats'], def: 'trafficStats' },
    { id: 'ifHub', group: 'network', zh: '接口与地址', en: 'Interfaces & addresses', icon: 'i-layers',
      hintZh: '接口 · 地址 · ARP · 邻居', hintEn: 'Interfaces, addresses, ARP, neighbors',
      sections: ['interfacesCenter'], def: 'interfacesCenter' },
    { id: 'dhcpHub', group: 'network', zh: 'DHCP 与 DNS', en: 'DHCP & DNS', icon: 'i-dhcp',
      hintZh: '租约 · 静态租约 · DNS 服务', hintEn: 'Leases, static leases, DNS service',
      sections: ['dhcpLeases', 'dhcpNetworks', 'dhcpServers', 'dhcpClients', 'dhcpOptions', 'dhcpOptionSets', 'dnsStatic', 'dns'], def: 'dhcpLeases' },
    { id: 'routeHub', group: 'network', zh: '路由', en: 'Routing', icon: 'i-route',
      hintZh: 'IPv4 / IPv6 路由表', hintEn: 'IPv4 / IPv6 routes',
      sections: ['routes', 'ipv6Routes'], def: 'routes' },
    { id: 'securityHub', group: 'network', zh: '防火墙', en: 'Firewall', icon: 'i-shield',
      hintZh: 'IPv4 防火墙 · IPv6 防火墙', hintEn: 'IPv4 firewall · IPv6 firewall',
      sections: ['firewallFilter', 'firewallNat', 'firewallMangle', 'addressLists', 'servicePorts',
        'firewall6Filter', 'firewall6Mangle', 'addressLists6', 'servicePorts6'], def: 'firewallFilter' },
    { id: 'wifiHub', group: 'network', zh: '无线', en: 'Wireless', icon: 'i-wifi',
      hintZh: 'WiFi · CAPsMAN · 注册终端', hintEn: 'WiFi, CAPsMAN, clients',
      sections: ['wifi', 'wirelessSec', 'capsmanCtl', 'wifiConfig', 'wifiProv', 'wifiCap', 'wifiRemote', 'wifiReg'], def: 'wifiReg' },
    { id: 'vpnHub', group: 'network', zh: 'VPN', en: 'VPN', icon: 'i-lock',
      hintZh: 'WireGuard · PPP', hintEn: 'WireGuard, PPP',
      sections: ['wireguard', 'wgPeers', 'pppSecrets', 'pppProfiles', 'pppActive'], def: 'wireguard' },
    { id: 'queueHub', group: 'network', zh: '带宽控制', en: 'Queues', icon: 'i-speed',
      hintZh: '简单队列 · 队列树', hintEn: 'Simple queues, queue tree',
      sections: ['simpleQueues', 'queueTree'], def: 'simpleQueues' },
    { id: 'webuiHub', group: 'system', zh: 'webUI 设置', en: 'WebUI settings', icon: 'i-gear',
      hintZh: '账户 · 2FA · 数据持久化 · 备份', hintEn: 'Accounts, 2FA, data retention, backup',
      sections: ['webuiSettings', 'dataPolicy', 'webuiBackup', 'quickSetup', 'updates'], def: 'webuiSettings' },
    { id: 'deviceHub', group: 'system', zh: '设备与固件', en: 'Devices & firmware', icon: 'i-device',
      hintZh: '设备连接 · 固件更新 · 备份', hintEn: 'Devices, firmware, backup',
      sections: ['devices'], def: 'devices' },
    { id: 'sysHub', group: 'system', zh: '系统管理', en: 'System', icon: 'i-sliders',
      hintZh: '标识 · 时钟 · 任务 · 软件包', hintEn: 'Identity, clock, tasks, packages',
      sections: ['identity', 'clock', 'ntp', 'cloud', 'schedulers', 'scripts', 'services', 'systemPackage'], def: 'identity' },
    { id: 'userHub', group: 'system', zh: '用户与权限', en: 'Users & access', icon: 'i-users',
      hintZh: '账户 · 活动会话 · 用户组', hintEn: 'Accounts, sessions, groups',
      sections: ['usersCenter', 'users', 'activeUsers', 'userGroups'], def: 'usersCenter' },
  ];

  const DIRECT = [
    { id: 'dashboard', group: 'overview', icon: 'i-gauge' },
    { id: 'topology', group: 'overview', icon: 'i-nodes' },
    { id: 'ipMonitor', group: 'overview', icon: 'i-pulse' },
    { id: 'connectionStats', group: 'overview', icon: 'i-conn' },
    { id: 'logsCenter', group: 'system', icon: 'i-log' },
  ];

  const entries = [
    { group: NAV_GROUPS[0], items: [
      { kind: 'section', id: 'dashboard' },
      { kind: 'hub', id: 'trafficHub' },
      { kind: 'section', id: 'topology' },
      { kind: 'section', id: 'ipMonitor' },
      { kind: 'section', id: 'connectionStats' },
    ] },
    { group: NAV_GROUPS[1], items: [
      { kind: 'hub', id: 'ifHub' },
      { kind: 'hub', id: 'dhcpHub' },
      { kind: 'hub', id: 'routeHub' },
      { kind: 'hub', id: 'securityHub' },
      { kind: 'hub', id: 'wifiHub' },
      { kind: 'hub', id: 'vpnHub' },
      { kind: 'hub', id: 'queueHub' },
    ] },
    { group: NAV_GROUPS[2], items: [
      { kind: 'hub', id: 'deviceHub' },
      { kind: 'hub', id: 'sysHub' },
      { kind: 'hub', id: 'userHub' },
      { kind: 'section', id: 'logsCenter' },
      { kind: 'hub', id: 'webuiHub' },
    ] },
  ].map((e) => ({ group: e.group, items: e.items.map((item) => ({ ...item, group: e.group.id })) }));

  const HUB_BY_ID = new Map(HUBS.map((h) => [h.id, h]));
  const GROUP_BY_ID = new Map(NAV_GROUPS.map((g) => [g.id, g]));
  const DIRECT_BY_ID = new Map(DIRECT.map((d) => [d.id, d]));
  const HUB_OF_SECTION = new Map();
  HUBS.forEach((h) => h.sections.forEach((id) => HUB_OF_SECTION.set(id, h.id)));

  const LAST_KEY = 'ros-hub-last-v1';
  let lastHub = {};
  try { const raw = JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); if (raw && typeof raw === 'object') lastHub = raw; } catch (e) { /* ignore */ }
  const saveLast = () => { try { localStorage.setItem(LAST_KEY, JSON.stringify(lastHub)); } catch (e) { /* ignore */ } };

  const sectionById = (id) => ((state.schema && state.schema.sections) || []).find((s) => s.id === id) || null;
  const groupLabel = (id) => { const g = GROUP_BY_ID.get(id); return g ? L(g.zh, g.en) : ''; };
  const hubLabel = (hub) => L(hub.zh, hub.en);
  const hubSections = (hub) => hub.sections.map(sectionById).filter(Boolean);
  const hubOf = (id) => HUB_BY_ID.get(HUB_OF_SECTION.get(id));
  const groupOfSection = (id) => {
    const hub = hubOf(id); if (hub) return hub.group;
    const direct = DIRECT_BY_ID.get(id); if (direct) return direct.group;
    return '';
  };
  const activeGroup = () => groupOfSection(state.section);

  function hubTarget(hub) {
    if (!hub) return '';
    const ids = hubSections(hub).map((s) => s.id);
    if (ids.includes(state.section)) return state.section;
    const last = lastHub[hub.id];
    if (last && ids.includes(last)) return last;
    return ids.includes(hub.def) ? hub.def : (ids[0] || '');
  }

  function rememberSection(id) {
    const hub = hubOf(id);
    if (!hub) return;
    lastHub[hub.id] = id;
    saveLast();
  }

  function iconTag(name) {
    return `<svg class="i" aria-hidden="true"><use href="#${esc(name)}"/></svg>`;
  }

  function navItemHtml(item) {
    if (item.kind === 'hub') {
      const hub = HUB_BY_ID.get(item.id);
      if (!hub) return '';
      const target = hubTarget(hub);
      if (!target) return '';
      const active = !!hubOf(state.section) && HUB_OF_SECTION.get(state.section) === hub.id;
      return `<button class="nav-item${active ? ' active' : ''}" type="button" data-section="${esc(target)}" data-hub="${esc(hub.id)}" title="${esc(hubLabel(hub))}">
        ${iconTag(hub.icon)}<span>${esc(hubLabel(hub))}</span></button>`;
    }
    const sec = sectionById(item.id); if (!sec) return '';
    const direct = DIRECT_BY_ID.get(sec.id);
    const icon = (direct && direct.icon) || 'i-panel';
    const active = state.section === sec.id;
    return `<button class="nav-item${active ? ' active' : ''}" type="button" data-section="${esc(sec.id)}" title="${esc(tx(sec.title))}">
      ${iconTag(icon)}<span>${esc(tx(sec.title))}</span></button>`;
  }

  function searchMatches(f) {
    if (!f) return [];
    const out = [];
    for (const g of entries) {
      for (const item of g.items) {
        if (item.kind === 'hub') {
          const hub = HUB_BY_ID.get(item.id);
          if (!hub) continue;
          const hubText = `${hub.zh} ${hub.en}`.toLowerCase();
          for (const sec of hubSections(hub)) {
            const secText = `${sec.id} ${(sec.title && (sec.title.zh + ' ' + sec.title.en)) || ''}`.toLowerCase();
            if (secText.includes(f) || hubText.includes(f) || groupLabel(g.group.id).toLowerCase().includes(f)) out.push({ sec, hub, group: g.group.id });
          }
        } else {
          const sec = sectionById(item.id); if (!sec) continue;
          const secText = `${sec.id} ${(sec.title && (sec.title.zh + ' ' + sec.title.en)) || ''}`.toLowerCase();
          if (secText.includes(f) || groupLabel(g.group.id).toLowerCase().includes(f)) out.push({ sec, hub: null, group: g.group.id });
        }
      }
    }
    const seen = new Set();
    return out.filter(({ sec }) => (seen.has(sec.id) ? false : (seen.add(sec.id), true))).slice(0, 40);
  }

  function hitHtml({ sec, hub, group }) {
    return `<button class="nav-item nav-search-hit${sec.id === state.section ? ' active' : ''}" type="button" data-section="${esc(sec.id)}" title="${esc(tx(sec.title))}">
      ${iconSvg(sectionIconName(sec))}<span>${esc(tx(sec.title))}</span><span class="nav-hint">${esc(hub ? hubLabel(hub) : groupLabel(group || groupOfSection(sec.id)))}</span></button>`;
  }

  function buildNav(filter = '') {
    if (!state.schema) return;
    const nav = $('sideNav'); if (!nav) return;
    const f = String(filter || '').trim().toLowerCase();
    if (f) {
      const hits = searchMatches(f);
      nav.innerHTML = hits.length
        ? `<div class="nav-search-results">${hits.map(hitHtml).join('')}</div>`
        : `<div class="nav-empty">${esc(L('没有匹配的页面', 'No matching page'))}</div>`;
    } else {
      nav.innerHTML = entries.map(({ group, items }) => {
        const html = items.map(navItemHtml).filter(Boolean).join('');
        if (!html) return '';
        return `<div class="nav-label">${esc(groupLabel(group.id))}</div>${html}`;
      }).join('');
    }
    nav.querySelectorAll('.nav-item').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.section !== state.section) navigate(b.dataset.section);
        else { buildNav(); closeMobileNav(); }
      };
    });
    renderMobileNav();
  }

  function renderMobileNav(filter = '') {
    const list = $('mnmList'); if (!list || !state.schema) return;
    const f = String(filter || '').trim().toLowerCase();
    if (f) {
      const hits = searchMatches(f);
      list.innerHTML = hits.length ? hits.map(({ sec, hub, group }) =>
        `<button class="mnm-item nav-search-hit${sec.id === state.section ? ' active' : ''}" type="button" data-section="${esc(sec.id)}" title="${esc(tx(sec.title))}">
          ${iconSvg(sectionIconName(sec))}<span>${esc(tx(sec.title))}</span><em class="mnm-hint">${esc(hub ? hubLabel(hub) : groupLabel(group))}</em></button>`).join('')
        : `<div class="mnm-group">${esc(L('没有匹配的页面', 'No matching page'))}</div>`;
      list.querySelectorAll('.mnm-item').forEach((b) => { b.onclick = () => { closeMobileNav(); navigate(b.dataset.section); }; });
      return;
    }
    list.innerHTML = entries.map(({ group, items }) => {
      const html = items.map((item) => {
        if (item.kind === 'hub') {
          const hub = HUB_BY_ID.get(item.id);
          const target = hubTarget(hub); if (!target) return '';
          const active = !!hubOf(state.section) && HUB_OF_SECTION.get(state.section) === hub.id;
          return `<button class="mnm-item mnm-hub${active ? ' active' : ''}" type="button" data-section="${esc(target)}" title="${esc(hubLabel(hub))}">
            ${iconSvg(sectionIconName(sectionById(target) || { id: hub.id, title: hub.zh }))}<span>${esc(hubLabel(hub))}</span><em class="mnm-hub-count">${hubSections(hub).length}</em></button>`;
        }
        const sec = sectionById(item.id); if (!sec) return '';
        return `<button class="mnm-item${sec.id === state.section ? ' active' : ''}" type="button" data-section="${esc(sec.id)}">
          ${iconSvg(sectionIconName(sec))}<span>${esc(tx(sec.title))}</span></button>`;
      }).filter(Boolean).join('');
      return html ? `<div class="mnm-group">${esc(groupLabel(group.id))}</div>${html}` : '';
    }).join('');
    list.querySelectorAll('.mnm-item').forEach((b) => {
      b.onclick = () => {
        closeMobileNav();
        if (b.dataset.section !== state.section) navigate(b.dataset.section);
      };
    });
  }

  function ensureTabBar() {
    let bar = document.getElementById('hubTabsBar');
    if (bar) return bar;
    const content = document.getElementById('content');
    if (!content || !content.parentNode) return null;
    bar = document.createElement('div');
    bar.id = 'hubTabsBar';
    bar.className = 'hub-tabs';
    bar.hidden = true;
    content.parentNode.insertBefore(bar, content);
    return bar;
  }

  /* 这几个功能中心已在自己的 v3 页面内提供完整的卡片内 tab 切换，
     顶部 hub tab 栏重复且占空间，按设计稿隐藏（标题顶上去）。 */
  const HUBS_WITHOUT_TOP_TABS = new Set(['dhcpHub', 'routeHub', 'securityHub', 'wifiHub', 'vpnHub', 'queueHub', 'sysHub']);
  function renderHubTabs() {
    const bar = ensureTabBar(); if (!bar) return;
    const hub = hubOf(state.section);
    if (!hub) { bar.hidden = true; bar.innerHTML = ''; return; }
    if (HUBS_WITHOUT_TOP_TABS.has(hub.id)) { bar.hidden = true; bar.innerHTML = ''; return; }
    const secs = hubSections(hub);
    if (secs.length <= 1) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `<div class="hub-tabs-inner" role="tablist" aria-label="${esc(hubLabel(hub))}">
      ${secs.map((s) => `<button class="hub-tab${s.id === state.section ? ' active' : ''}" type="button" role="tab" aria-selected="${s.id === state.section}" data-section="${esc(s.id)}" title="${esc(tx(s.title))}">
        ${iconSvg(sectionIconName(s))}<span>${esc(tx(s.title))}</span></button>`).join('')}
      <span class="hub-tabs-hint">${esc(L(hub.hintZh, hub.hintEn))}</span>
    </div>`;
    bar.querySelectorAll('.hub-tab').forEach((b) => {
      b.onclick = () => { if (b.dataset.section !== state.section) navigate(b.dataset.section); };
    });
    const active = bar.querySelector('.hub-tab.active');
    const inner = bar.querySelector('.hub-tabs-inner');
    if (active && inner) {
      requestAnimationFrame(() => {
        if (inner.scrollWidth <= inner.clientWidth) return;
        const ar = active.getBoundingClientRect(), ir = inner.getBoundingClientRect();
        const left = inner.scrollLeft + (ar.left - ir.left) - (inner.clientWidth - ar.width) / 2;
        inner.scrollLeft = Math.max(0, Math.min(left, inner.scrollWidth - inner.clientWidth));
      });
    }
  }

  function renderBreadcrumb() {
    const sec = sectionById(state.section); if (!sec) return;
    const gid = groupOfSection(sec.id);
    const hub = hubOf(sec.id);
    if (!gid) return;
    const groupEl = $('crumbGroup'), secEl = $('crumbSection');
    if (groupEl) groupEl.textContent = groupLabel(gid);
    if (secEl) secEl.textContent = hub ? hubLabel(hub) : tx(sec.title);
  }

  function renderHubChrome() {
    renderBreadcrumb();
    renderHubTabs();
  }

  window.buildNav = buildNav;
  window.renderMobileNav = renderMobileNav;
  window.renderHubChrome = renderHubChrome;
  window.__designSearch = function (f) {
    return searchMatches(String(f || '').trim().toLowerCase()).map(({ sec, hub, group }) => ({
      id: sec.id,
      title: tx(sec.title),
      meta: hub ? hubLabel(hub) : groupLabel(group || groupOfSection(sec.id)),
      icon: sectionIconName(sec),
    }));
  };

  const origNavigate = window.navigate;
  if (typeof origNavigate === 'function' && !window.__hubNavigateWrapped) {
    window.__hubNavigateWrapped = true;
    window.navigate = function (id) {
      rememberSection(String(id));
      return origNavigate.apply(this, arguments);
    };
  }

  if (typeof window.renderPage === 'function' && !window.__hubPageWrapped) {
    window.__hubPageWrapped = true;
    const origPage = window.renderPage;
    window.renderPage = function () {
      const r = origPage.apply(this, arguments);
      renderHubChrome();
      return r;
    };
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K')) return;
    const sb = $('sidebar');
    if (!sb || getComputedStyle(sb).display !== 'none') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const menu = $('mobileNavMenu');
    if (menu && menu.hidden) openMobileNav();
    else { const inp = $('mnmSearch'); if (inp) { inp.focus(); inp.select(); } }
  }, true);

  ensureTabBar();
  if (state.schema) { buildNav(); renderHubChrome(); }
  setTimeout(() => { if (state.schema) { buildNav(); renderHubChrome(); } }, 0);
})();