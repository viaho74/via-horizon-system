/* =====================================================================
   مكوّنات الواجهة: النوافذ، التنبيهات، النماذج، الشارات، الجداول
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  /* ---------------- التنبيهات ---------------- */
  VH.toast = function (msg, kind, ms) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 320); }, ms || 3200);
  };

  /* ---------------- النوافذ ---------------- */
  VH.modal = function (opt) {
    var root = document.getElementById('modalRoot');
    var bd = document.createElement('div');
    bd.className = 'modal-bd';
    var acts = (opt.actions || []).map(function (a, i) {
      return '<button class="btn ' + (a.cls || 'btn--ghost') + '" data-act="' + i + '">' + VH.esc(a.label) + '</button>';
    }).join('');
    bd.innerHTML =
      '<div class="modal ' + (opt.wide ? 'modal--wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal__h"><h3>' + VH.esc(opt.title || '') + '</h3><span class="sp"></span>' +
          '<button class="x" data-close aria-label="إغلاق">×</button></div>' +
        '<div class="modal__b">' + (opt.body || '') + '</div>' +
        (acts ? '<div class="modal__f">' + acts + '</div>' : '') +
      '</div>';
    root.appendChild(bd);

    function close() { bd.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bd.addEventListener('click', function (e) {
      if (e.target === bd || e.target.hasAttribute('data-close')) { close(); return; }
      var b = e.target.closest('[data-act]');
      if (b) {
        var a = opt.actions[+b.getAttribute('data-act')];
        if (a && a.onClick) a.onClick(close, bd); else close();
      }
    });
    var first = bd.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 60);
    if (opt.onOpen) opt.onOpen(bd, close);
    return close;
  };

  VH.confirm = function (title, msg, okLabel, onOk, danger) {
    VH.modal({
      title: title,
      body: '<p style="margin:0;line-height:1.9">' + msg + '</p>',
      actions: [
        { label: okLabel || 'تأكيد', cls: danger ? 'btn--danger' : 'btn--navy', onClick: function (c) { c(); onOk(); } },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* ---------------- النماذج ---------------- */
  var F = {};
  /**
   * fields: [{ name, label, type, value, options:[{v,t}], required, hint, full, attrs, min, step, readonly }]
   * type: text | number | date | select | textarea | tel | static
   */
  F.render = function (fields) {
    return '<div class="f-grid">' + fields.map(function (f) {
      if (f.type === 'html') return '<div class="f ' + (f.full ? 'f--full' : '') + '">' + f.html + '</div>';
      var lbl = '<label for="fld_' + f.name + '">' + VH.esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
      var attrs = ' id="fld_' + f.name + '" name="' + f.name + '" data-f="' + f.name + '"' +
        (f.readonly ? ' readonly' : '') + (f.attrs || '');
      var input;
      if (f.type === 'select') {
        input = '<select' + attrs + '>' + (f.options || []).map(function (o) {
          var v = (o.v !== undefined ? o.v : o), t = (o.t !== undefined ? o.t : o);
          return '<option value="' + VH.esc(v) + '"' + (String(v) === String(f.value === undefined ? '' : f.value) ? ' selected' : '') + '>' + VH.esc(t) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'textarea') {
        input = '<textarea' + attrs + ' rows="' + (f.rows || 3) + '">' + VH.esc(f.value || '') + '</textarea>';
      } else if (f.type === 'static') {
        input = '<input' + attrs + ' type="text" value="' + VH.esc(f.value || '') + '" readonly>';
      } else {
        var extra = '';
        if (f.type === 'number') extra = ' step="' + (f.step || '0.01') + '" min="' + (f.min !== undefined ? f.min : '0') + '" dir="ltr"';
        if (f.type === 'tel') extra = ' dir="ltr" inputmode="tel" placeholder="05XXXXXXXX"';
        if (f.type === 'date') extra = ' dir="ltr"';
        input = '<input' + attrs + ' type="' + (f.type || 'text') + '" value="' + VH.esc(f.value === undefined || f.value === null ? '' : f.value) + '"' + extra + '>';
      }
      return '<div class="f ' + (f.full ? 'f--full' : '') + '">' + lbl + input +
        (f.hint ? '<span class="hint">' + f.hint + '</span>' : '') + '</div>';
    }).join('') + '</div><p class="f-err" data-err></p>';
  };

  F.read = function (scope) {
    var out = {};
    scope.querySelectorAll('[data-f]').forEach(function (el) {
      var v = el.value;
      if (el.type === 'number') v = v === '' ? '' : VH.num(v);
      out[el.getAttribute('data-f')] = typeof v === 'string' ? v.trim() : v;
    });
    return out;
  };

  /** يتحقّق من الحقول المطلوبة ويعرض الخطأ. يعيد القيم أو null */
  F.validate = function (scope, fields) {
    var vals = F.read(scope), miss = [];
    fields.forEach(function (f) {
      if (!f.required) return;
      var v = vals[f.name];
      if (v === '' || v === undefined || v === null) miss.push(f.label);
    });
    var err = scope.querySelector('[data-err]');
    if (miss.length) {
      if (err) err.textContent = 'أكملي الحقول المطلوبة: ' + miss.join('، ');
      return null;
    }
    if (err) err.textContent = '';
    return vals;
  };
  F.error = function (scope, msg) {
    var err = scope.querySelector('[data-err]');
    if (err) err.textContent = msg;
  };
  VH.form = F;

  /* ---------------- الشارات ---------------- */
  VH.STAGES = [
    { k: 'negotiation', t: 'مرحلة التفاوض', c: 'b-gray', dot: '#9AA5AF' },
    { k: 'office', t: 'التفاوض مع مكتب الإيجار', c: 'b-purple', dot: '#5B4B9E' },
    { k: 'assigned', t: 'تحويل المهمة للموظف', c: 'b-blue', dot: '#0C3A61' },
    { k: 'driver', t: 'التعاقد مع السواق', c: 'b-teal', dot: '#00A6B4' },
    { k: 'expenses', t: 'فواتير الصرف', c: 'b-gold', dot: '#D6AD55' },
    { k: 'done', t: 'مكتملة', c: 'b-green', dot: '#1F9D6B' },
    { k: 'cancelled', t: 'ملغية', c: 'b-red', dot: '#C0392B' }
  ];
  VH.stage = function (k) {
    return VH.STAGES.filter(function (s) { return s.k === k; })[0] || VH.STAGES[0];
  };
  VH.stageBadge = function (k) {
    var s = VH.stage(k);
    return '<span class="badge ' + s.c + '">' + s.t + '</span>';
  };
  VH.NEG_STATUS = ['بداية التفاوض', 'قيد التنفيذ', 'تم التفاوض', 'ملغي'];
  VH.negBadge = function (st) {
    var c = st === 'تم التفاوض' ? 'b-green' : st === 'ملغي' ? 'b-red' : st === 'قيد التنفيذ' ? 'b-gold' : 'b-gray';
    return '<span class="badge ' + c + '">' + VH.esc(st || 'بداية التفاوض') + '</span>';
  };
  VH.payBadge = function (st) {
    return st === 'paid'
      ? '<span class="badge b-green">مدفوعة</span>'
      : '<span class="badge b-gold">معلّقة</span>';
  };
  VH.dirBadge = function (d) {
    return d === 'in'
      ? '<span class="badge b-green">وارد</span>'
      : '<span class="badge b-red">منصرف</span>';
  };
  VH.avatar = function (name, cls) {
    return '<span class="' + (cls || 'av-xs') + '">' + VH.esc(VH.initials(name)) + '</span>';
  };

  /* ---------------- عناصر مساعدة ---------------- */
  VH.empty = function (icon, msg, btn) {
    return '<div class="empty"><div class="big">' + icon + '</div><p>' + msg + '</p>' + (btn || '') + '</div>';
  };
  VH.statCard = function (o) {
    return '<div class="stat ' + (o.cls || '') + '"><h3>' + o.title + '</h3>' +
      '<div class="v">' + VH.fmt(o.value) + '</div> <span class="small muted">ر.س</span>' +
      (o.delta ? ' <span class="chip-delta ' + o.delta.dir + '">' +
        (o.delta.dir === 'up' ? '▲ ' : o.delta.dir === 'down' ? '▼ ' : '– ') + VH.fmt(o.delta.pct) + '%</span>' : '') +
      '<div class="d">' + (o.desc || '') + '</div></div>';
  };

})(window.VH);
