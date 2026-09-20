/* =====================================================================
   الهيكل والتوجيه — نظام فيا هورايزن
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var A = { _period: { key: 'month' }, _booted: false };

  var NAV = {
    f: [
      { r: 'f/dashboard', t: 'لوحة المالية', i: '▣' },
      { r: 'f/invoices', t: 'الفواتير والحسابات', i: '🧾' },
      { r: 'f/payments', t: 'متابعة العملاء والسداد', i: '👥' },
      { r: 'f/monthly', t: 'التقرير الشهري', i: '📈' },
      { r: 'f/tax', t: 'التقرير الضريبي', i: '📄' },
      { r: 'f/settings', t: 'الإعدادات والنسخ', i: '⚙' }
    ],
    o: [
      { r: 'o/board', t: 'لوحة العمليات', i: '▤' },
      { r: 'o/marketing', t: 'تسويق المبيعات', i: '📞' },
      { r: 'o/deals', t: 'الصفقات والعقود', i: '📋' },
      { r: 'o/expenses', t: 'مصاريف التنفيذ', i: '🧾' },
      { r: 'o/drivers', t: 'السائقون', i: '🧑‍✈️' },
      { r: 'o/team', t: 'الفريق والمهام', i: '👤' },
      { r: 'o/log', t: 'سجل الأحداث', i: '🕘' }
    ]
  };

  /* ---------------- الفترة ---------------- */
  A.period = function () { var p = A._period; return VH.range(p.key, p.from, p.to); };
  A.periodBar = function () {
    var p = A._period, r = A.period();
    return '<div class="periods"><div class="periods__row">' +
      VH.PERIODS.map(function (x) {
        return '<button class="pbtn ' + (p.key === x.k ? 'is-on' : '') + '" data-p="' + x.k + '">' + x.t + '</button>';
      }).join('') +
      '</div><div class="periods__row">' +
      '<span class="range-lbl">' + r.from + ' — ' + r.to + '</span>' +
      '<span class="small muted">من</span><input type="date" id="pFrom" value="' + (p.from || r.from) + '">' +
      '<span class="small muted">إلى</span><input type="date" id="pTo" value="' + (p.to || r.to) + '">' +
      '<button class="btn btn--sm btn--navy" data-papply>تطبيق</button>' +
      '<span style="flex:1"></span><span class="small muted">' + r.label + '</span>' +
      '</div></div>';
  };
  A.bindPeriod = function (root) {
    root.querySelectorAll('[data-p]').forEach(function (b) {
      b.addEventListener('click', function () { A._period = { key: b.getAttribute('data-p') }; A.render(); });
    });
    var ap = root.querySelector('[data-papply]');
    if (ap) ap.addEventListener('click', function () {
      var f = root.querySelector('#pFrom').value, t = root.querySelector('#pTo').value;
      if (!f || !t) { VH.toast('اختاري التاريخين', 'warn'); return; }
      if (f > t) { VH.toast('تاريخ البداية بعد النهاية', 'bad'); return; }
      A._period = { key: 'custom', from: f, to: t }; A.render();
    });
  };

  /* ---------------- التوجيه ---------------- */
  A.route = function () {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) h = VH.auth.can('finance') && VH.auth.isManager() ? 'f/dashboard' : 'o/board';
    return h;
  };

  A.view = function (route) {
    var p = route.split('/');
    if (p[0] === 'f' && !VH.auth.can('finance')) { VH.toast('البوابة المالية غير متاحة لصلاحيتك', 'warn'); location.hash = '#/o/board'; return null; }
    if (p[0] === 'f') {
      if (p[1] === 'invoices') return VH.finance.invoices();
      if (p[1] === 'payments') return VH.finance.payments();
      if (p[1] === 'monthly') return VH.reports.monthly();
      if (p[1] === 'tax') return VH.reports.tax();
      if (p[1] === 'settings') return VH.reports.settings();
      return VH.finance.dashboard();
    }
    if (p[1] === 'deal' && p[2]) return VH.ops.deal(p[2]);
    if (p[1] === 'deals') return VH.ops.deals();
    if (p[1] === 'marketing') return VH.ops.marketing();
    if (p[1] === 'expenses') return VH.ops.expenses();
    if (p[1] === 'drivers') return VH.ops.drivers();
    if (p[1] === 'team') return VH.ops.team();
    if (p[1] === 'log') return VH.ops.log();
    return VH.ops.board();
  };

  A.render = function () {
    // أي طلب جديد وصل من فورم الموقع يُضاف فوراً كعميل في خطة سير العمل
    try {
      var added = VH.ops.convertLeads();
      if (added) VH.toast('وصل ' + (added === 1 ? 'طلب جديد' : added + ' طلبات جديدة') + ' من فورم الموقع', 'ok', 5000);
    } catch (e) { console.error('تعذّر تحويل الطلبات الواردة', e); }

    var route = A.route(), portal = route.charAt(0) === 'f' ? 'f' : 'o';
    var v = A.view(route);
    if (!v) return;

    // الشريط الجانبي
    document.querySelectorAll('#portalSwitch .portal__btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-portal') === portal);
      b.hidden = b.getAttribute('data-portal') === 'f' && !VH.auth.can('finance');
    });
    var openDeals = VH.store.list('deals').filter(function (d) {
      return d.stage !== 'done' && d.stage !== 'cancelled' && d.stage !== 'marketing';
    }).length;
    var unpaid = VH.store.list('invoices').filter(function (i) { return i.status !== 'paid' && i.direction === 'in'; }).length;
    var newLeads = VH.store.list('deals').filter(function (d) { return !d.owner && d.stage !== 'cancelled'; }).length;
    document.getElementById('nav').innerHTML = NAV[portal].map(function (n) {
      var c = n.r === 'o/board' && openDeals ? openDeals
        : (n.r === 'o/marketing' && newLeads ? newLeads
          : (n.r === 'f/payments' && unpaid ? unpaid : 0));
      var on = route === n.r || (n.r === 'o/deals' && route.indexOf('o/deal/') === 0);
      return '<a href="#/' + n.r + '" class="' + (on ? 'is-on' : '') + '"><span class="ico">' + n.i + '</span>' +
        '<span>' + n.t + '</span>' + (c ? '<span class="count">' + c + '</span>' : '') + '</a>';
    }).join('');

    var u = VH.auth.user() || {};
    document.getElementById('sideUser').innerHTML =
      '<span class="av">' + VH.esc(VH.initials(u.name)) + '</span>' +
      '<div><b>' + VH.esc(u.name || '') + '</b><small>' + (u.role === 'manager' ? 'مدير النظام' : 'موظف') +
      ' · ' + (VH.store.mode === 'cloud' ? 'متصل ☁' : 'محلي 💾') + '</small></div>' +
      '<button class="out" title="خروج" data-logout>⏻</button>';

    // المحتوى
    document.getElementById('pageTitle').innerHTML = v.title;
    document.getElementById('pageSub').innerHTML = v.sub || '';
    document.getElementById('pageActions').innerHTML = v.actions || '';
    var root = document.getElementById('view');
    root.innerHTML = v.html;
    if (v.mount) v.mount(root);
    A.bindGlobal();
    window.scrollTo(0, 0);
  };

  A.bindGlobal = function () {
    function all(sel, fn) { document.querySelectorAll(sel).forEach(function (e) { e.addEventListener('click', fn.bind(null, e)); }); }
    all('[data-go]', function (e) { location.hash = '#/o/deal/' + e.getAttribute('data-go'); });
    all('[data-new-deal]', function () { VH.ops.newDeal(); });
    all('[data-export-deals]', function () { VH.ops.exportDeals(); });
    all('[data-export-exp]', function () { VH.ops.exportExpenses(); });
    all('[data-export-mk]', function () { VH.ops.exportMarketing(); });
    all('[data-new-inv]', function () { VH.finance.invoiceModal(null, A.render); });
    all('[data-export-inv]', function () { VH.finance.exportInvoices(); });
    all('[data-export-pay]', function () { VH.finance.exportPayments(); });
    all('[data-opening]', function () { VH.finance.openingModal(A.render); });
    all('[data-logout]', function () {
      VH.confirm('تسجيل الخروج', 'هل تريدين الخروج من النظام؟', 'خروج', function () { VH.auth.signOut(); });
    });
  };

  /* ---------------- الإقلاع ---------------- */
  A.start = function () {
    if (A._booted) { A.render(); return; }
    A._booted = true;

    // ترحيل البيانات المسجّلة قبل إضافة مرحلتَي التسويق وعرض السعر
    try {
      var n = VH.store.migrate();
      if (n) console.info('رُحّلت ' + n + ' صفقة إلى المراحل الجديدة');
    } catch (e) { console.error('تعذّر الترحيل', e); }

    document.querySelectorAll('#portalSwitch .portal__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-portal');
        location.hash = p === 'f' ? '#/f/dashboard' : '#/o/board';
      });
    });
    var side = document.getElementById('side'), bd = document.getElementById('sideBackdrop');
    document.getElementById('menuBtn').addEventListener('click', function () {
      side.classList.add('is-open'); bd.classList.add('is-on');
    });
    bd.addEventListener('click', function () { side.classList.remove('is-open'); bd.classList.remove('is-on'); });
    document.getElementById('nav').addEventListener('click', function () {
      side.classList.remove('is-open'); bd.classList.remove('is-on');
    });

    window.addEventListener('hashchange', A.render);

    var pending = null;
    VH.store.subscribe(function () {
      if (document.getElementById('modalRoot').children.length) return; // لا نعيد الرسم ونافذة مفتوحة
      clearTimeout(pending);
      pending = setTimeout(A.render, 180);
    });

    A.render();
  };

  A.boot = function () {
    VH.store.init().then(function (mode) {
      if (mode === 'cloud') {
        var handled = false;
        VH.store._fb.auth.onAuthStateChanged(function (user) {
          if (handled) return;
          if (user && user.email) {
            var p = VH.auth.employeeByEmail(user.email);
            if (p) {
              handled = true;
              VH.auth._set(p);
              VH.store.startSync().then(function () {
                document.getElementById('loginScreen').hidden = true;
                document.getElementById('app').hidden = false;
                A.start();
              });
              return;
            }
          }
          handled = true;
          VH.auth.showLogin(A.start);
        });
      } else {
        if (VH.auth.restore()) {
          document.getElementById('loginScreen').hidden = true;
          document.getElementById('app').hidden = false;
          A.start();
        } else {
          VH.auth.showLogin(A.start);
        }
      }
    }).catch(function (e) {
      console.error(e);
      document.body.innerHTML = '<p style="padding:40px;text-align:center">تعذّر تشغيل النظام: ' + VH.esc(e.message) + '</p>';
    });
  };

  VH.app = A;
  document.addEventListener('DOMContentLoaded', A.boot);
})(window.VH);
