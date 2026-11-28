'use strict';
/* 表头列宽调整：拖拽表头右缘改列宽，双击复位，按表格与列名持久化。
   卡片的右缘 / 底部 / 右下角缩放手柄已取消。 */
(function () {
  const COL_KEY = 'rosCenter.colWidth.v1';
  let colStore = read(COL_KEY);
  let scanning = false;

  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function page() { return (typeof state !== 'undefined' && state.section) || 'page'; }
  function tableName(table) {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()).join('|');
    return page() + '::' + (heads.slice(0, 120) || 'table');
  }
  function colName(th) { return th.dataset.sort || th.textContent.trim() || String([...th.parentElement.children].indexOf(th)); }

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

  function cleanupBlockHandles(root) {
    root.querySelectorAll('.rz-handle, .rz-edge-b, .rz-edge-r').forEach((el) => el.remove());
    root.querySelectorAll('[data-rz="1"]').forEach((el) => {
      el.removeAttribute('data-rz');
      el.style.width = '';
      el.style.height = '';
      el.style.overflow = '';
    });
  }

  function scan() {
    const content = document.getElementById('content');
    if (!content) return;
    cleanupBlockHandles(content);
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
  }

  try { localStorage.removeItem('rosCenter.blockSize.v1'); } catch (e) { /* ignore */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
})();