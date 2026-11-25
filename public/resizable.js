'use strict';
/* 全局可调整尺寸：所有页面的块支持拖拽右下角改宽高，所有表头支持拖拽右缘改列宽。
   尺寸按「页面 + 块标识 / 表格标识 + 列名」持久化，双击手柄恢复默认。 */
(function () {
  const SZ_KEY = 'rosCenter.blockSize.v1';
  const COL_KEY = 'rosCenter.colWidth.v1';
  let sizeStore = read(SZ_KEY);
  let colStore = read(COL_KEY);
  let scanning = false;

  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function page() { return (typeof state !== 'undefined' && state.section) || 'page'; }
  function blockName(el) {
    if (el.dataset.block) return el.dataset.block;
    const h = el.querySelector('.panel-head h2, h2, .card-label');
    const txt = h ? String(h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) : '';
    return txt || ('block-' + (el.className || '').toString().split(/\s+/).join('-'));
  }
  function tableName(table) {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()).join('|');
    return page() + '::' + (heads.slice(0, 120) || 'table');
  }
  function colName(th) { return th.dataset.sort || th.textContent.trim() || String([...th.parentElement.children].indexOf(th)); }

  function contentWidth() { const c = document.getElementById('content'); return c ? c.clientWidth : 0; }
  function scaledWidth(s) {
    const cw = contentWidth();
    return Math.max(160, Math.round(Number(s.w) * (s.cw && cw ? cw / s.cw : 1)));
  }
  function applyBlockSize(el, key) {
    const s = sizeStore[key];
    if (s && Number(s.w) > 0) el.style.width = scaledWidth(s) + 'px'; else el.style.width = '';
    if (s && Number(s.h) > 0) el.style.height = Math.round(s.h) + 'px'; else el.style.height = '';
    if (s && (Number(s.w) > 0 || Number(s.h) > 0)) el.style.overflow = 'auto';
  }

  function dragBlock(e, el, key, handle) {
    e.preventDefault(); e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无活动指针时忽略 */ }
    const r = el.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, w0 = r.width, h0 = r.height;
    const move = (ev) => {
      const w = Math.max(160, Math.round(w0 + ev.clientX - x0));
      const h = Math.max(64, Math.round(h0 + ev.clientY - y0));
      el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.overflow = 'auto';
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      sizeStore[key] = { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), cw: contentWidth() };
      write(SZ_KEY, sizeStore);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function decorateBlock(el) {
    if (el.dataset.rz === '1') return;
    el.dataset.rz = '1';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const key = page() + '::' + blockName(el);
    applyBlockSize(el, key);
    const h = document.createElement('span');
    h.className = 'rz-handle';
    h.title = (typeof L === 'function' ? L('拖动调整大小 · 双击复位', 'Drag to resize · double-click to reset') : 'Drag to resize');
    h.addEventListener('pointerdown', (e) => dragBlock(e, el, key, h));
    h.addEventListener('dblclick', (e) => {
      e.stopPropagation(); delete sizeStore[key]; write(SZ_KEY, sizeStore); applyBlockSize(el, key);
    });
    el.appendChild(h);
    /* 底部 / 右侧整条边缘：比右下角小手柄更容易抓到，尤其用于改高度 */
    for (const cls of ['rz-edge-b', 'rz-edge-r']) {
      const edge = document.createElement('span');
      edge.className = cls;
      edge.title = h.title;
      edge.addEventListener('pointerdown', (e) => dragBlock(e, el, key, edge));
      edge.addEventListener('dblclick', (e) => {
        e.stopPropagation(); delete sizeStore[key]; write(SZ_KEY, sizeStore); applyBlockSize(el, key);
      });
      el.appendChild(edge);
    }
  }

  function applyColWidth(table, idx, px) {
    for (const row of table.tBodies) {
      const cell = row.rows[0] && row.rows[0].cells[idx];
      if (cell) cell.style.width = px + 'px';
    }
    const th = table.tHead.rows[0].cells[idx];
    if (th) { th.style.width = px + 'px'; th.style.minWidth = px + 'px'; }
  }

  function dragCol(e, th, table, idx, key, handle) {
    e.preventDefault(); e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无活动指针时忽略 */ }
    const w0 = th.getBoundingClientRect().width, x0 = e.clientX;
    const move = (ev) => {
      const w = Math.max(44, Math.round(w0 + ev.clientX - x0));
      th.style.width = w + 'px'; th.style.minWidth = w + 'px';
      for (const row of table.tBodies) {
        const cell = row.rows[0] && row.rows[0].cells[idx];
        if (cell) cell.style.width = w + 'px';
      }
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      colStore[key] = Math.round(th.getBoundingClientRect().width);
      write(COL_KEY, colStore);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function decorateTh(th, table) {
    if (th.dataset.rzc === '1' || !table.tHead || !table.tHead.rows[0]) return;
    th.dataset.rzc = '1';
    const idx = [...th.parentElement.children].indexOf(th);
    const key = tableName(table) + '::' + colName(th) + '#' + idx;
    const saved = colStore[key];
    if (Number(saved) > 0) applyColWidth(table, idx, Number(saved));
    const h = document.createElement('span');
    h.className = 'rz-col';
    h.title = (typeof L === 'function' ? L('拖动调整列宽 · 双击复位', 'Drag to resize column · double-click to reset') : 'Drag to resize column');
    h.addEventListener('pointerdown', (e) => dragCol(e, th, table, idx, key, h));
    h.addEventListener('click', (e) => e.stopPropagation());
    h.addEventListener('dblclick', (e) => {
      e.stopPropagation(); delete colStore[key]; write(COL_KEY, colStore);
      th.style.width = ''; th.style.minWidth = '';
      for (const row of table.tBodies) {
        const cell = row.rows[0] && row.rows[0].cells[idx];
        if (cell) cell.style.width = '';
      }
    });
    th.appendChild(h);
  }

  function scan() {
    const content = document.getElementById('content');
    if (!content) return;
    content.querySelectorAll('.panel, .card').forEach(decorateBlock);
    content.querySelectorAll('table thead th').forEach((th) => decorateTh(th, th.closest('table')));
  }

  function observe() {
    const content = document.getElementById('content');
    if (!content) { setTimeout(observe, 60); return; }
    const mo = new MutationObserver(() => {
      if (scanning) return;
      scanning = true;
      Promise.resolve().then(() => { scan(); scanning = false; });
    });
    mo.observe(content, { childList: true, subtree: true });
    scan();
    /* 侧栏折叠/展开或窗口缩放改变内容区宽度时，按比例重算已保存的块宽度 */
    const reflow = () => {
      content.querySelectorAll('[data-rz="1"]').forEach((el) => {
        const s = sizeStore[page() + '::' + blockName(el)];
        if (s && Number(s.w) > 0 && s.cw) el.style.width = scaledWidth(s) + 'px';
      });
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(reflow).observe(content);
    else window.addEventListener('resize', reflow);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
})();
