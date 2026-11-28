'use strict';
/* ============================================================
   UI v2 · 共享弹窗 / 菜单 / Toast（设计稿交互）
   ============================================================ */
(function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let backdrop = null, menuEl = null, menuFor = null, toastWrap = null;

  function closeModal() {
    if (!backdrop) return;
    backdrop.remove();
    backdrop = null;
    document.body.classList.remove('ui-modal-open');
  }

  function openModal(opts) {
    closeMenu();
    closeModal();
    const o = opts || {};
    /* 兼容设计稿 actions:[{label,cls,primary,onClick}] 与现有 buttons:[{label,kind,...}] */
    const actionList = Array.isArray(o.actions)
      ? o.actions.map((a) => a && ({
          label: a.label,
          kind: a.cls || (a.danger ? 'danger' : a.primary ? 'primary' : ''),
          onClick: a.onClick,
          keepOpen: a.keepOpen,
        }))
      : Array.isArray(o.buttons) ? o.buttons : [];
    backdrop = document.createElement('div');
    backdrop.className = 'ui-backdrop';
    const buttons = actionList.map((b, i) => b
      ? `<button class="ui-btn ${esc(b.kind || '')}" type="button" data-btn="${i}">${esc(b.label || '')}</button>`
      : '').join('');
    backdrop.innerHTML = `<div class="ui-modal${o.wide ? ' wide' : ''}" role="dialog" aria-modal="true">
      <div class="ui-modal-head">
        <div><h3>${esc(o.title || '')}</h3>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>
        <button class="ui-x" type="button" data-ui-close data-close aria-label="Close">×</button>
      </div>
      <div class="ui-modal-body">${o.body || ''}</div>
      <div class="ui-modal-foot">${o.footLeft ? `<span class="ui-foot-left">${esc(o.footLeft)}</span>` : ''}${o.foot || ''}${buttons}</div>
    </div>`;
    document.body.appendChild(backdrop);
    document.body.classList.add('ui-modal-open');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-ui-close]') || e.target.closest('[data-close]')) closeModal();
    });
    const modal = backdrop.querySelector('.ui-modal');
    const bodyEl = modal.querySelector('.ui-modal-body');
    if (actionList.length) {
      backdrop.querySelectorAll('[data-btn]').forEach((btn) => {
        btn.onclick = async () => {
          const def = actionList[Number(btn.dataset.btn)];
          if (!def) return;
          if (!def.keepOpen) closeModal();
          if (typeof def.onClick === 'function') await def.onClick(modal);
        };
      });
    }
    /* 返回值既是 DOM（兼容现有 onMount/querySelector），又带设计稿 api 形态 */
    modal.overlay = backdrop;
    modal.body = bodyEl;
    modal.close = closeModal;
    modal.api = { overlay: backdrop, body: bodyEl, close: closeModal };
    if (typeof o.onMount === 'function') o.onMount(modal);
    return modal;
  }

  /* ---------- 表单字段与校验（设计稿 actions.js 行为） ---------- */
  function fieldHtml(field) {
    const f = field || {};
    const key = esc(f.key || '');
    const attrs = `name="${key}" autocomplete="off"${f.required ? ' required' : ''}`;
    let input = '';
    if (f.type === 'switch') {
      return `<label class="ui-field ui-switch-row">
        <span class="sw-txt"><b>${esc(f.label || '')}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</span>
        <input type="checkbox" name="${key}"${f.value === false ? '' : ' checked'}>
        <i class="sw-rail"></i></label>`;
    }
    if (f.type === 'static') {
      return `<label class="ui-field ui-static"><span>${esc(f.label || '')}</span><b>${esc(f.value == null || f.value === '' ? '—' : f.value)}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
    }
    if (f.type === 'select') {
      const options = (f.options || []).map((op) => {
        const value = typeof op === 'object' ? op.value : op;
        const label = typeof op === 'object' ? op.label : op;
        return `<option value="${esc(value)}"${String(value) === String(f.value) ? ' selected' : ''}>${esc(label)}</option>`;
      }).join('');
      input = `<select ${attrs}>${options}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(f.value == null ? '' : f.value)}</textarea>`;
    } else {
      input = `<input type="${esc(f.type || 'text')}" ${attrs} value="${esc(f.value == null ? '' : f.value)}" placeholder="${esc(f.placeholder || '')}">`;
    }
    return `<label class="ui-field${f.full ? ' full' : ''}"><span>${esc(f.label || '')}${f.required ? '<em>*</em>' : ''}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  }

  function submitFields(host, fields, callback) {
    const root = (host && (host.overlay || host.querySelector)) ? (host.overlay || host) : document;
    const values = {};
    let firstInvalid = null;
    (fields || []).forEach((field) => {
      if (!field || !field.key) return;
      const input = root.querySelector(`[name="${field.key}"]`);
      const wrap = input ? input.closest('.ui-field') : null;
      if (wrap) wrap.classList.remove('is-invalid');
      if (!input) return;
      if (field.type === 'switch') { values[field.key] = input.checked; return; }
      const value = String(input.value == null ? '' : input.value).trim();
      values[field.key] = value;
      if (field.required && !value) {
        if (wrap) wrap.classList.add('is-invalid');
        if (!firstInvalid) firstInvalid = input;
      }
    });
    if (firstInvalid) {
      firstInvalid.focus();
      toast('请补全必填项', '标有 * 的字段不能为空。', 'warn');
      return false;
    }
    if (typeof callback === 'function') callback(values, host);
    return true;
  }

  function openForm(opts) {
    const o = opts || {};
    const fields = o.fields || [];
    const body = (o.note ? `<div class="ui-form-note">${esc(o.note)}</div>` : '') +
      `<div class="ui-fields">${fields.map(fieldHtml).join('')}</div>`;
    const modal = openModal({
      title: o.title, sub: o.sub, body,
      actions: [
        { label: o.cancelLabel || '取消' },
        { label: o.submitLabel || '保存', cls: 'primary', primary: true, keepOpen: true, onClick: (m) => {
          submitFields(m, fields, (values) => {
            if (typeof o.onSubmit === 'function') o.onSubmit(values, m);
          });
        } },
      ],
      onMount: o.onMount,
    });
    modal.querySelectorAll('.ui-field input,.ui-field select,.ui-field textarea').forEach((input) => {
      const clear = () => { const w = input.closest('.ui-field'); if (w) w.classList.remove('is-invalid'); };
      input.addEventListener('input', clear);
      input.addEventListener('change', clear);
    });
    return modal;
  }

  function openConfirm(opts) {
    const o = opts || {};
    return openModal({
      title: o.title, sub: o.sub || '本地演示确认',
      body: `<div class="ui-warning"><b>${esc(o.warningTitle || '请确认')}</b>${esc(o.message || '')}</div>`,
      actions: [
        { label: o.cancelLabel || '取消' },
        { label: o.confirmLabel || '确认', cls: o.danger ? 'danger' : 'primary', onClick: () => {
          if (typeof o.onConfirm === 'function') o.onConfirm();
        } },
      ],
    });
  }

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; menuFor = null; }
  }

  function openMenu(anchor, items, opts) {
    closeMenu();
    if (!anchor) return;
    const o = opts || {};
    menuFor = anchor;
    menuEl = document.createElement('div');
    menuEl.className = 'ui-menu' + (o.wide ? ' ui-menu-wide' : '');
    const rows = (items || []).map((it) => {
      if (!it) return '';
      if (it.sep) return '<div class="ui-menu-sep"></div>';
      if (it.label && it.head) return it.label;
      if (it.html) return it.html;
      const main = it.sub
        ? `<span class="ui-mi-main"><b>${esc(it.label || '')}</b><small>${esc(it.sub)}</small></span>`
        : `<span>${esc(it.label || '')}</span>`;
      return `<button class="ui-menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}${it.current ? ' is-current' : ''}" type="button"${it.disabled ? ' disabled' : ''}>
        ${it.checkSlot ? `<span class="ui-check">${it.checked ? '✓' : ''}</span>` : it.dot ? `<span class="ui-mi-dot ${esc(it.dot)}"></span>` : it.icon ? `<svg class="i" style="width:14px;height:14px"><use href="#${esc(it.icon)}"/></svg>` : ''}
        ${main}${it.badge ? `<span class="ui-k">${esc(it.badge)}</span>` : it.key ? `<span class="ui-k">${esc(it.key)}</span>` : ''}${it.checked && !it.checkSlot ? '<svg class="i ui-mi-check" style="width:14px;height:14px"><use href="#i-check"/></svg>' : ''}</button>`;
    }).join('');
    menuEl.innerHTML = (o.head || '') + rows;
    if (o.wide) menuEl.classList.add('ui-menu-wide');
    document.body.appendChild(menuEl);
    const box = anchor.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    /* alignLeft：菜单左缘对齐按钮左缘（设计稿通知弹窗稍靠右）；默认右缘对齐 */
    let left = o.alignLeft ? box.left : box.right - mw;
    let top = box.bottom + 5;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, box.top - mh - 5);
    left = Math.max(8, Math.min(window.innerWidth - mw - 8, left));
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    if (typeof o.onMount === 'function') { try { o.onMount(menuEl); } catch (e) { /* ignore */ } }
    menuEl.querySelectorAll('.ui-menu-item').forEach((el, idx) => {
      const real = (items || []).filter((x) => x && !x.sep && !x.html && !x.head);
      const item = real[idx];
      if (!item) return;
      el.onclick = () => {
        if (item.keepOpen !== true) closeMenu();
        if (typeof item.action === 'function') item.action();
      };
    });
    const outside = (e) => {
      if (menuEl && !menuEl.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        closeMenu();
        document.removeEventListener('pointerdown', outside, true);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  /* 兼容 toast(msg, kind) 与 toast(title, desc, kind) 两种签名 */
  function toast(msg, descOrKind, maybeKind) {
    const KINDS = ['success', 'warn', 'danger', 'error', 'info', 'ok'];
    let title = msg, desc = '', kind = '';
    if (KINDS.indexOf(String(descOrKind || '')) >= 0) kind = String(descOrKind);
    else if (descOrKind != null && descOrKind !== '') { desc = String(descOrKind); kind = String(maybeKind || ''); }
    if (kind === 'ok') kind = 'success';
    if (kind === 'error') kind = 'danger';
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'ui-toast-wrap';
      document.body.appendChild(toastWrap);
    }
    const mark = { success: '✓', warn: '!', danger: '×', info: 'i' }[kind] || 'i';
    const el = document.createElement('div');
    el.className = 'ui-toast ' + kind;
    el.innerHTML = `<span class="ui-toast-mark">${mark}</span><div><b>${esc(title)}</b>${desc ? `<p>${esc(desc)}</p>` : ''}</div>`;
    toastWrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 180);
    }, 2600);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuEl) closeMenu();
      else if (backdrop) closeModal();
    }
  });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  window.closeMenu = closeMenu;

  window.UI = { openModal, closeModal, openMenu, closeMenu, toast, esc, fieldHtml, submitFields, openForm, openConfirm };
})();