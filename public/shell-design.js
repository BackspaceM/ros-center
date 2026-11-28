'use strict';
/* 设计稿外壳交互：侧栏轨道、顶栏全局搜索、侧栏设备卡/运行信息。
   菜单（设备切换/主题/通知/账户）仍由 shell-v2.js 提供。 */
(function () {
  const $id = (id) => document.getElementById(id);
  const iconTag = (name) => `<svg class="i" aria-hidden="true"><use href="#${name}"/></svg>`;

  /* ---------- 侧栏收起轨道 ---------- */
  function syncRail() {
    const sb = $id('sidebar');
    const shell = $id('shell');
    if (!sb || !shell) return;
    const c = sb.classList.contains('collapsed');
    shell.classList.toggle('side-collapsed', c);
    const btn = $id('collapseBtn');
    if (btn) {
      if (!btn.querySelector('svg')) btn.innerHTML = iconTag('i-panel');
      btn.title = c ? L('展开侧栏', 'Expand sidebar') : L('收起侧栏', 'Collapse sidebar');
      btn.setAttribute('aria-expanded', String(!c));
    }
  }

  function watchCollapse() {
    const sb = $id('sidebar');
    if (sb && !sb.__designRailObserved) {
      sb.__designRailObserved = true;
      new MutationObserver(syncRail).observe(sb, { attributes: true, attributeFilter: ['class'] });
    }
    const btn = $id('collapseBtn');
    if (btn && !btn.__designIconObserved) {
      btn.__designIconObserved = true;
      new MutationObserver(() => { if (!btn.querySelector('svg')) btn.innerHTML = iconTag('i-panel'); })
        .observe(btn, { childList: true });
    }
    syncRail();
  }

  /* ---------- 侧栏设备卡 / 构建号 / 运行时长 ---------- */
  function paintSideMeta() {
    const name = $id('sideDevName'), sub = $id('sideDevSub');
    if (name && typeof v2DevName === 'function') {
      const n = v2DevName();
      if (n && name.textContent !== n) name.textContent = n;
    }
    if (sub) {
      const r = (state.latest && state.latest.resource) || {};
      const board = String(r['board-name'] || '').trim();
      const ver = String((state.latest && state.latest.version) || '').replace(/\s*\(.*$/g, '').trim();
      const txt = [board, ver && ('RouterOS ' + ver)].filter(Boolean).join(' · ') || 'RouterOS';
      if (sub.textContent !== txt) sub.textContent = txt;
    }
    /* 标题栏主路由后的 board 字段与侧栏一样随实时资源刷新 */
    if (typeof window.__paintDevBtn === 'function') window.__paintDevBtn();
    const verEl = $id('sideMetaVer'), brandVer = $id('brandVer');
    if (verEl && brandVer && verEl.textContent !== brandVer.textContent) verEl.textContent = brandVer.textContent;
    const upEl = $id('sideMetaUptime');
    if (upEl) {
      const up = state.latest && state.latest.uptime;
      const txt = up && typeof fmtUptime === 'function' ? L('已运行 ', 'Uptime ') + fmtUptime(up) : L('已运行 —', 'Uptime —');
      if (upEl.textContent !== txt) upEl.textContent = txt;
    }
  }

  function bindSideActions() {
    const logo = document.querySelector('.brand .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.title = L('展开侧栏', 'Expand sidebar');
      logo.onclick = () => {
        const sb = $id('sidebar');
        if (sb && sb.classList.contains('collapsed')) { const b = $id('collapseBtn'); if (b) b.click(); }
      };
    }
    const foot = $id('sideFoot');
    if (foot) {
      foot.onclick = (e) => {
        e.stopPropagation();
        if (typeof window.__openDeviceMenu === 'function') window.__openDeviceMenu(foot);
        else { const b = $id('devBtn'); if (b) b.click(); }
      };
    }
  }

  /* ---------- 顶栏全局搜索 ---------- */
  const input = () => $id('navSearch');
  const pop = () => $id('searchPop');
  let hitIds = [];

  function hideSearch() {
    const p = pop();
    if (p) { p.hidden = true; p.innerHTML = ''; }
    hitIds = [];
  }

  function choose(index) {
    const id = hitIds[index];
    if (!id) return;
    const inp = input();
    if (inp) inp.value = '';
    hideSearch();
    if (id !== state.section) navigate(id);
  }

  function renderSearch() {
    const inp = input(), p = pop();
    if (!inp || !p) return;
    const q = inp.value.trim();
    if (!q) { hideSearch(); return; }
    const hits = typeof window.__designSearch === 'function' ? window.__designSearch(q) : [];
    hitIds = hits.map((h) => h.id);
    if (!hits.length) {
      p.innerHTML = `<div class="sp-empty">${esc(L('没有匹配的页面', 'No matching page'))}</div>`;
      p.hidden = false;
      return;
    }
    p.innerHTML = hits.slice(0, 12).map((h, i) =>
      `<button class="sp-item${i === 0 ? ' on' : ''}" type="button" data-i="${i}">
        ${iconSvg(h.icon)}<b>${esc(h.title)}</b><em>${esc(h.meta || '')}</em>
      </button>`).join('');
    p.hidden = false;
    p.querySelectorAll('.sp-item').forEach((b) => {
      b.onclick = () => choose(Number(b.dataset.i));
      b.onmousemove = () => {
        p.querySelectorAll('.sp-item').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      };
    });
  }

  function moveSel(step) {
    const p = pop();
    if (!p || p.hidden) return;
    const items = [...p.querySelectorAll('.sp-item')];
    if (!items.length) return;
    let i = items.findIndex((x) => x.classList.contains('on'));
    i = (i + step + items.length) % items.length;
    items.forEach((x) => x.classList.remove('on'));
    items[i].classList.add('on');
    items[i].scrollIntoView({ block: 'nearest' });
  }

  function bindSearch() {
    const inp = input();
    if (!inp || inp.__designBound) return;
    inp.__designBound = true;
    inp.oninput = renderSearch;
    inp.onfocus = () => { if (inp.value.trim()) renderSearch(); };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const on = pop() && pop().querySelector('.sp-item.on'); choose(on ? Number(on.dataset.i) : 0); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Escape') { inp.value = ''; hideSearch(); inp.blur(); }
    };
    const kbd = $id('searchKbd');
    if (kbd) kbd.onclick = (e) => { e.preventDefault(); inp.focus(); inp.select(); };
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topsearch-wrap')) hideSearch();
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K')) return;
    const sb = $id('sidebar');
    if (!sb || getComputedStyle(sb).display === 'none') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const inp = input();
    if (inp) { inp.focus(); inp.select(); if (inp.value.trim()) renderSearch(); }
  }, true);

  const origNavigate = window.navigate;
  if (typeof origNavigate === 'function' && !window.__designNavWrapped) {
    window.__designNavWrapped = true;
    window.navigate = function () {
      hideSearch();
      return origNavigate.apply(this, arguments);
    };
  }

  function init() {
    watchCollapse();
    bindSideActions();
    paintSideMeta();
    bindSearch();
    setInterval(paintSideMeta, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();