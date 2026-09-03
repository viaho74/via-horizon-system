/* =====================================================================
   البوابة المالية — الرصيد، الفواتير بالضريبة، متابعة السداد
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var F = {};
  var CAT_IN = ['إيراد خدمة', 'دفعة مقدمة', 'إيراد آخر'];
  var CAT_OUT = ['إيجار سيارة', 'مصاريف تنفيذ', 'رواتب وأجور', 'عمولات', 'تسويق وإعلان', 'رسوم حكومية', 'اشتراكات', 'مصروف آخر'];
  var METHODS = ['تحويل بنكي', 'نقد', 'شبكة/مدى', 'شيك', 'محفظة إلكترونية'];
  F.CAT_IN = CAT_IN; F.CAT_OUT = CAT_OUT;

  /* ---------------- الحسابات ---------------- */
  F.totals = function (r) {
    var s = VH.store.settings(), inv = VH.store.list('invoices');
    var t = {
      opening: VH.num(s.openingBalance),
      inPaid: 0, outPaid: 0, unpaidIn: 0, unpaidOut: 0, unpaidInN: 0, unpaidOutN: 0,
      periodIn: 0, periodOut: 0, vatOut: 0, vatIn: 0
    };
    inv.forEach(function (i) {
      var amt = VH.num(i.total);
      if (i.status === 'paid') {
        if (i.direction === 'in') { t.inPaid += amt; if (r && VH.inRange(i.paidDate || i.date, r)) t.periodIn += amt; }
        else { t.outPaid += amt; if (r && VH.inRange(i.paidDate || i.date, r)) t.periodOut += amt; }
      } else {
        if (i.direction === 'in') { t.unpaidIn += amt; t.unpaidInN++; }
        else { t.unpaidOut += amt; t.unpaidOutN++; }
      }
    });
    t.balance = VH.round2(t.opening + t.inPaid - t.outPaid);
    t.expected = VH.round2(t.balance + t.unpaidIn - t.unpaidOut);
    t.periodNet = VH.round2(t.periodIn - t.periodOut);
    return t;
  };

  F.quarterVat = function (year, q) {
    var from = year + '-' + String(q * 3 - 2).padStart(2, '0') + '-01';
    var end = new Date(year, q * 3, 0);
    var to = VH.iso(end);
    var out = 0, inp = 0, list = [];
    VH.store.list('invoices').forEach(function (i) {
      if (!VH.inRange(i.date, { from: from, to: to })) return;
      if (i.direction === 'in') out += VH.num(i.vatAmount); else inp += VH.num(i.vatAmount);
      list.push(i);
    });
    return { year: year, q: q, from: from, to: to, output: VH.round2(out), input: VH.round2(inp), due: VH.round2(out - inp), list: list };
  };

  /* ---------------- إنشاء فاتورة ---------------- */
  F.createInvoice = function (o) {
    var inv = Object.assign({
      no: VH.store.nextInvoiceNo(), date: VH.today(), direction: 'in', party: '', partyType: '',
      description: '', amountBeforeVat: 0, vatRate: 15, vatAmount: 0, total: 0,
      status: 'unpaid', paidDate: '', method: '', category: '', dealId: '', dealCode: '',
      createdBy: (VH.auth.user() || {}).name || ''
    }, o);
    VH.store.save('invoices', inv);
    VH.store.log('فاتورة', (inv.direction === 'in' ? 'وارد ' : 'منصرف ') + inv.no + ' — ' + VH.moneyTxt(inv.total) + ' — ' + inv.party, inv.id);
    return inv;
  };

  /* ---------------- نافذة الفاتورة ---------------- */
  F.invoiceModal = function (existing, after, deal) {
    var s = VH.store.settings();
    var i = existing || {};
    var deals = VH.store.list('deals').sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    var dir = i.direction || (deal ? 'in' : 'in');
    var cats = dir === 'in' ? CAT_IN : CAT_OUT;

    var fields = [
      {
        name: 'direction', label: 'نوع الحركة', type: 'select', required: true,
        options: [{ v: 'in', t: 'وارد — مبلغ داخل لي' }, { v: 'out', t: 'منصرف — مبلغ خارج مني' }], value: dir
      },
      { name: 'date', label: 'تاريخ الفاتورة', type: 'date', required: true, value: i.date || VH.today() },
      { name: 'party', label: 'اسم الطرف (العميل / المورّد)', required: true, value: i.party || (deal ? (deal.orgName || deal.clientName) : '') },
      { name: 'partyPhone', label: 'جوال الطرف', type: 'tel', value: i.partyPhone || (deal ? deal.clientPhone : '') },
      { name: 'category', label: 'التصنيف', type: 'select', required: true, options: cats.map(function (c) { return { v: c, t: c }; }), value: i.category },
      {
        name: 'dealId', label: 'ربط بصفقة (اختياري)', type: 'select',
        options: [{ v: '', t: '— بدون ربط —' }].concat(deals.map(function (d) { return { v: d.id, t: d.code + ' — ' + (d.orgName || d.clientName) }; })),
        value: i.dealId || (deal ? deal.id : '')
      },
      { name: 'description', label: 'وصف البند', full: true, value: i.description },
      { name: 'amount', label: 'المبلغ', type: 'number', required: true, value: i.amountBeforeVat !== undefined && existing ? (i.vatIncluded === false ? i.amountBeforeVat : i.total) : '' },
      {
        name: 'mode', label: 'المبلغ المُدخل', type: 'select',
        options: [{ v: 'inc', t: 'شامل الضريبة' }, { v: 'exc', t: 'قبل الضريبة (تُضاف عليه)' }],
        value: existing ? (i.vatIncluded === false ? 'exc' : 'inc') : 'inc'
      },
      {
        name: 'vatRate', label: 'نسبة الضريبة', type: 'select',
        options: [{ v: '15', t: '15% — الأساسية' }, { v: '0', t: '0% — معفاة/خارج النطاق' }],
        value: String(i.vatRate !== undefined ? i.vatRate : (VH.num(s.vatRate) || 15))
      },
      {
        name: 'status', label: 'حالة السداد', type: 'select', required: true,
        options: [{ v: 'unpaid', t: 'معلّقة — لم تُحصّل/تُدفع بعد' }, { v: 'paid', t: 'مسدّدة' }], value: i.status || 'unpaid'
      },
      { name: 'paidDate', label: 'تاريخ السداد', type: 'date', value: i.paidDate || VH.today() },
      { name: 'method', label: 'طريقة السداد', type: 'select', options: [{ v: '', t: '—' }].concat(METHODS.map(function (m) { return { v: m, t: m }; })), value: i.method },
      {
        name: '_preview', type: 'html', full: true,
        html: '<div class="strip strip--info" style="margin:0"><span class="strip__ico">∑</span><div id="invPrev"><b>—</b></div></div>'
      }
    ];

    VH.modal({
      title: existing ? 'تعديل الفاتورة ' + VH.esc(i.no) : 'فاتورة جديدة',
      wide: true,
      body: VH.form.render(fields),
      onOpen: function (bd) {
        function calc() {
          var v = VH.form.read(bd);
          var r = VH.vat(v.amount, VH.num(v.vatRate), v.mode !== 'exc');
          bd.querySelector('#invPrev').innerHTML =
            '<b>الإجمالي ' + VH.fmt(r.total) + ' ر.س</b>' +
            '<small> = قبل الضريبة ' + VH.fmt(r.before) + ' + ضريبة ' + VH.fmt(r.vat) + ' (' + VH.fmt(r.rate) + '%)</small>';
          // تحديث قائمة التصنيفات حسب النوع
          var sel = bd.querySelector('[data-f=category]');
          var want = v.direction === 'in' ? CAT_IN : CAT_OUT;
          if (sel.options.length !== want.length || sel.options[0].value !== want[0]) {
            var cur = sel.value;
            sel.innerHTML = want.map(function (c) { return '<option value="' + VH.esc(c) + '">' + VH.esc(c) + '</option>'; }).join('');
            if (want.indexOf(cur) > -1) sel.value = cur;
          }
          bd.querySelector('[data-f=paidDate]').closest('.f').style.opacity = v.status === 'paid' ? '1' : '.5';
        }
        bd.addEventListener('input', calc); bd.addEventListener('change', calc); calc();
      },
      actions: [
        {
          label: existing ? 'حفظ التعديل' : 'حفظ الفاتورة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (!VH.num(v.amount)) { VH.form.error(bd, 'أدخلي مبلغاً أكبر من صفر'); return; }
            var r = VH.vat(v.amount, VH.num(v.vatRate), v.mode !== 'exc');
            var d = v.dealId ? VH.store.get('deals', v.dealId) : null;
            var obj = Object.assign({}, existing || {}, {
              direction: v.direction, date: v.date, party: v.party, partyPhone: v.partyPhone,
              category: v.category, dealId: v.dealId, dealCode: d ? d.code : '',
              description: v.description, amountBeforeVat: r.before, vatRate: r.rate, vatAmount: r.vat,
              total: r.total, vatIncluded: v.mode !== 'exc',
              status: v.status, paidDate: v.status === 'paid' ? (v.paidDate || VH.today()) : '',
              method: v.method
            });
            if (!obj.no) obj.no = VH.store.nextInvoiceNo();
            if (!obj.createdBy) obj.createdBy = (VH.auth.user() || {}).name || '';
            VH.store.save('invoices', obj);
            VH.store.log(existing ? 'تعديل فاتورة' : 'فاتورة',
              (obj.direction === 'in' ? 'وارد ' : 'منصرف ') + obj.no + ' — ' + VH.moneyTxt(obj.total) + ' — ' + obj.party, obj.id);
            close(); VH.toast('حُفظت الفاتورة ' + obj.no, 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  F.togglePaid = function (inv, after) {
    if (inv.status === 'paid') {
      inv.status = 'unpaid'; inv.paidDate = '';
      VH.store.save('invoices', inv); VH.store.log('تحديث سداد', inv.no + ' → معلّقة', inv.id);
      VH.toast('أُعيدت الفاتورة إلى المعلّقة', 'warn'); if (after) after();
      return;
    }
    var fields = [
      { name: 'paidDate', label: 'تاريخ السداد', type: 'date', required: true, value: VH.today() },
      { name: 'method', label: 'طريقة السداد', type: 'select', options: METHODS.map(function (m) { return { v: m, t: m }; }), value: inv.method || METHODS[0] }
    ];
    VH.modal({
      title: 'تأكيد سداد الفاتورة ' + VH.esc(inv.no) + ' — ' + VH.moneyTxt(inv.total),
      body: VH.form.render(fields),
      actions: [
        {
          label: 'تأكيد السداد', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            inv.status = 'paid'; inv.paidDate = v.paidDate; inv.method = v.method;
            VH.store.save('invoices', inv);
            VH.store.log('سداد', inv.no + ' — ' + VH.moneyTxt(inv.total) + ' (' + v.method + ')', inv.id);
            close(); VH.toast('سُجّل السداد', 'ok'); if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     لوحة المالية
     ===================================================================== */
  F.dashboard = function () {
    var r = VH.app.period(), t = F.totals(r), s = VH.store.settings();
    var pr = VH.prevRange(r), pt = pr ? F.totals(pr) : null;
    var now = new Date(), y = now.getFullYear(), q = Math.floor(now.getMonth() / 3) + 1;
    var qv = F.quarterVat(y, q);
    var noInvoice = VH.store.list('deals').filter(function (d) {
      return d.stage === 'done' && !VH.store.list('invoices').some(function (i) { return i.dealId === d.id && i.direction === 'in'; });
    });

    var html =
      '<div class="hero">' +
        '<h2>الرصيد الحالي في الحساب البنكي</h2>' +
        '<div class="big">' + VH.fmt(t.balance) + ' ر.س</div>' +
        '<p class="eq">الرصيد الافتتاحي ' + VH.fmt(t.opening) + ' + الوارد ' + VH.fmt(t.inPaid) + ' − المنصرف ' + VH.fmt(t.outPaid) + '</p>' +
        '<div class="hero__split">' +
          '<div><small>إجمالي ما دخل لي</small><b class="in-c">+ ' + VH.fmt(t.inPaid) + ' ر.س</b></div>' +
          '<div><small>إجمالي ما صرفته</small><b class="out-c">– ' + VH.fmt(t.outPaid) + ' ر.س</b></div>' +
          '<div><small>الرصيد الافتتاحي</small><b class="neu-c">' + VH.fmt(t.opening) + ' ر.س</b></div>' +
        '</div>' +
      '</div>' +

      '<div class="strip strip--warn"><span class="strip__ico">⏱</span>' +
        '<div><b>فواتير معلّقة</b><small>' + t.unpaidInN + ' بانتظار التحصيل (' + VH.fmt(t.unpaidIn) + ' ر.س) · ' +
          t.unpaidOutN + ' بانتظار السداد (' + VH.fmt(t.unpaidOut) + ' ر.س)</small></div>' +
        '<span class="sp"></span>' +
        '<div class="center"><small>الرصيد المتوقّع بعد التسوية</small><br><b class="num">' + VH.fmt(t.expected) + ' ر.س</b></div>' +
      '</div>' +

      '<div class="strip strip--info"><span class="strip__ico">📄</span>' +
        '<div><b>الربع الضريبي الحالي (' + y + ' — الربع ' + q + ')</b>' +
        '<small>مخرجات ' + VH.fmt(qv.output) + ' ر.س · مدخلات ' + VH.fmt(qv.input) + ' ر.س</small></div>' +
        '<span class="sp"></span>' +
        '<div class="center"><small>صافي مستحق</small><br><b class="num">' + VH.fmt(qv.due) + ' ر.س</b></div>' +
        '<a class="btn btn--ghost btn--sm" href="#/f/tax">التقرير الضريبي الكامل</a>' +
      '</div>' +

      (noInvoice.length ? '<div class="strip strip--warn"><span class="strip__ico">!</span><div><b>' + noInvoice.length +
        ' صفقة مكتملة بلا فاتورة عميل</b><small>' + noInvoice.map(function (d) { return VH.esc(d.code); }).join(' · ') + '</small></div>' +
        '<span class="sp"></span><a class="btn btn--ghost btn--sm" href="#/o/deals">فتح الصفقات</a></div>' : '') +

      VH.app.periodBar() +

      '<div class="grid grid--3">' +
        VH.statCard({ title: 'وارد الفترة', value: t.periodIn, cls: 'stat--in', desc: 'المحصّل خلال الفترة المختارة', delta: pt ? VH.delta(t.periodIn, pt.periodIn) : null }) +
        VH.statCard({ title: 'منصرف الفترة', value: t.periodOut, cls: 'stat--out', desc: 'المدفوع خلال الفترة المختارة', delta: pt ? VH.delta(t.periodOut, pt.periodOut) : null }) +
        VH.statCard({ title: 'صافي الفترة', value: t.periodNet, cls: 'stat--net', desc: 'الوارد − المنصرف', delta: pt ? VH.delta(t.periodNet, pt.periodNet) : null }) +
      '</div>';

    return {
      title: 'الفواتير والحسابات',
      sub: 'كل مبلغ داخل أو خارج — والرصيد المتبقي في حسابك البنكي',
      actions: (VH.auth.can('financeEdit') ? '<button class="btn btn--ghost" data-opening>الرصيد الافتتاحي</button>' : '') +
        '<button class="btn btn--ghost" data-export-inv>تصدير CSV</button>' +
        (VH.auth.can('financeEdit') ? '<button class="btn btn--gold" data-new-inv>+ فاتورة جديدة</button>' : ''),
      html: html,
      mount: function (root) { VH.app.bindPeriod(root); }
    };
  };

  F.openingModal = function (after) {
    var s = VH.store.settings();
    var fields = [{ name: 'openingBalance', label: 'الرصيد الافتتاحي للحساب البنكي', type: 'number', value: s.openingBalance, required: true, hint: 'الرصيد الموجود فعلياً قبل تسجيل أي فاتورة في النظام' }];
    VH.modal({
      title: 'الرصيد الافتتاحي', body: VH.form.render(fields),
      actions: [{
        label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
          var v = VH.form.validate(bd, fields); if (!v) return;
          VH.store.saveSettings({ openingBalance: VH.num(v.openingBalance) });
          VH.store.log('إعدادات', 'تعديل الرصيد الافتتاحي إلى ' + VH.moneyTxt(v.openingBalance));
          close(); VH.toast('حُدّث الرصيد الافتتاحي', 'ok'); if (after) after();
        }
      }, { label: 'إلغاء', cls: 'btn--ghost' }]
    });
  };

  /* =====================================================================
     جدول الفواتير
     ===================================================================== */
  F.invoices = function () {
    var r = VH.app.period(), f = F._if || {};
    var list = VH.store.list('invoices').filter(function (i) {
      if (!VH.inRange(i.date, r) && !(i.paidDate && VH.inRange(i.paidDate, r))) return false;
      if (f.dir && i.direction !== f.dir) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.q) {
        var q = f.q.toLowerCase();
        if (![i.no, i.party, i.description, i.category, i.dealCode].some(function (x) { return String(x || '').toLowerCase().indexOf(q) > -1; })) return false;
      }
      return true;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)); });

    var sum = list.reduce(function (a, i) {
      if (i.direction === 'in') { a.in += VH.num(i.total); a.vin += VH.num(i.vatAmount); }
      else { a.out += VH.num(i.total); a.vout += VH.num(i.vatAmount); }
      return a;
    }, { in: 0, out: 0, vin: 0, vout: 0 });

    var canEdit = VH.auth.can('financeEdit');
    var rows = list.map(function (i) {
      return '<tr>' +
        '<td class="n">' + VH.esc(i.no) + '</td>' +
        '<td class="n">' + VH.dateShort(i.date) + '</td>' +
        '<td>' + VH.dirBadge(i.direction) + '</td>' +
        '<td><b>' + VH.esc(i.party) + '</b>' + (i.dealCode ? '<br><a class="small n" href="#/o/deal/' + i.dealId + '">' + VH.esc(i.dealCode) + '</a>' : '') + '</td>' +
        '<td>' + VH.esc(i.category || '') + '<br><span class="small muted">' + VH.esc(i.description || '') + '</span></td>' +
        '<td class="n">' + VH.fmt(i.amountBeforeVat) + '</td>' +
        '<td class="n">' + VH.fmt(i.vatAmount) + '</td>' +
        '<td class="n"><b>' + VH.fmt(i.total) + '</b></td>' +
        '<td>' + VH.payBadge(i.status) + (i.paidDate ? '<br><span class="small muted n">' + i.paidDate + '</span>' : '') + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn--sm btn--ghost" data-print="' + i.id + '">🖨</button>' +
          (canEdit ? '<button class="btn btn--sm btn--ghost" data-edit-inv="' + i.id + '">تعديل</button>' +
            '<button class="btn btn--sm ' + (i.status === 'paid' ? 'btn--ghost' : 'btn--teal') + '" data-pay="' + i.id + '">' +
            (i.status === 'paid' ? 'إلغاء السداد' : 'سداد') + '</button>' +
            (VH.auth.can('deleteAny') ? '<button class="btn btn--sm btn--danger" data-del-inv="' + i.id + '">حذف</button>' : '') : '') +
        '</td></tr>';
    }).join('');

    var html = VH.app.periodBar() +
      '<div class="periods"><div class="periods__row">' +
      '<button class="pbtn ' + (!f.dir ? 'is-on' : '') + '" data-dir="">الكل</button>' +
      '<button class="pbtn ' + (f.dir === 'in' ? 'is-on' : '') + '" data-dir="in">وارد</button>' +
      '<button class="pbtn ' + (f.dir === 'out' ? 'is-on' : '') + '" data-dir="out">منصرف</button>' +
      '<span style="width:14px"></span>' +
      '<button class="pbtn ' + (!f.status ? 'is-on' : '') + '" data-status="">كل الحالات</button>' +
      '<button class="pbtn ' + (f.status === 'paid' ? 'is-on' : '') + '" data-status="paid">مسدّدة</button>' +
      '<button class="pbtn ' + (f.status === 'unpaid' ? 'is-on' : '') + '" data-status="unpaid">معلّقة</button>' +
      '<span style="flex:1"></span>' +
      '<input type="search" id="iq" placeholder="بحث برقم الفاتورة أو الطرف…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:230px">' +
      '</div></div>' +
      '<div class="grid grid--4" style="margin-bottom:16px">' +
      VH.statCard({ title: 'وارد الفواتير المعروضة', value: sum.in, cls: 'stat--in', desc: 'ضريبة مخرجات ' + VH.fmt(sum.vin) }) +
      VH.statCard({ title: 'منصرف الفواتير المعروضة', value: sum.out, cls: 'stat--out', desc: 'ضريبة مدخلات ' + VH.fmt(sum.vout) }) +
      VH.statCard({ title: 'الصافي', value: sum.in - sum.out, cls: 'stat--net', desc: list.length + ' فاتورة' }) +
      VH.statCard({ title: 'صافي الضريبة', value: sum.vin - sum.vout, cls: 'stat--navy', desc: 'مخرجات − مدخلات' }) +
      '</div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>الرقم</th><th>التاريخ</th><th>النوع</th><th>الطرف</th><th>البند</th><th>قبل الضريبة</th><th>الضريبة</th><th>الإجمالي</th><th>الحالة</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('🧾', 'لا فواتير في هذه الفترة', canEdit ? '<button class="btn btn--gold" data-new-inv>+ فاتورة جديدة</button>' : ''));

    return {
      title: 'سجل الفواتير',
      sub: list.length + ' فاتورة في الفترة المختارة',
      actions: '<button class="btn btn--ghost" data-export-inv>تصدير CSV</button>' +
        (canEdit ? '<button class="btn btn--gold" data-new-inv>+ فاتورة جديدة</button>' : ''),
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        root.querySelectorAll('[data-dir]').forEach(function (b) {
          b.addEventListener('click', function () { F._if = Object.assign({}, F._if, { dir: b.getAttribute('data-dir') }); VH.app.render(); });
        });
        root.querySelectorAll('[data-status]').forEach(function (b) {
          b.addEventListener('click', function () { F._if = Object.assign({}, F._if, { status: b.getAttribute('data-status') }); VH.app.render(); });
        });
        var q = root.querySelector('#iq');
        if (q) q.addEventListener('input', VH.debounce(function () {
          F._if = Object.assign({}, F._if, { q: q.value }); VH.app.render();
          var n = document.getElementById('iq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        }, 350));
        root.querySelectorAll('[data-edit-inv]').forEach(function (b) {
          b.addEventListener('click', function () { F.invoiceModal(VH.store.get('invoices', b.getAttribute('data-edit-inv')), VH.app.render); });
        });
        root.querySelectorAll('[data-pay]').forEach(function (b) {
          b.addEventListener('click', function () { F.togglePaid(VH.store.get('invoices', b.getAttribute('data-pay')), VH.app.render); });
        });
        root.querySelectorAll('[data-print]').forEach(function (b) {
          b.addEventListener('click', function () { VH.reports.printInvoice(VH.store.get('invoices', b.getAttribute('data-print'))); });
        });
        root.querySelectorAll('[data-del-inv]').forEach(function (b) {
          b.addEventListener('click', function () {
            var inv = VH.store.get('invoices', b.getAttribute('data-del-inv'));
            VH.confirm('حذف الفاتورة', 'ستُحذف الفاتورة ' + VH.esc(inv.no) + ' نهائياً وتتغيّر الأرصدة.', 'حذف', function () {
              VH.store.remove('invoices', inv.id);
              VH.store.log('حذف فاتورة', inv.no + ' — ' + VH.moneyTxt(inv.total));
              VH.toast('حُذفت الفاتورة', 'warn'); VH.app.render();
            }, true);
          });
        });
      }
    };
  };

  F.exportInvoices = function () {
    var r = VH.app.period();
    var rows = [['رقم الفاتورة', 'التاريخ', 'النوع', 'الطرف', 'الجوال', 'التصنيف', 'الصفقة', 'الوصف', 'قبل الضريبة', 'نسبة الضريبة', 'الضريبة', 'الإجمالي', 'الحالة', 'تاريخ السداد', 'طريقة السداد', 'أنشأها']];
    VH.store.list('invoices')
      .filter(function (i) { return VH.inRange(i.date, r) || (i.paidDate && VH.inRange(i.paidDate, r)); })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .forEach(function (i) {
        rows.push([i.no, i.date, i.direction === 'in' ? 'وارد' : 'منصرف', i.party, i.partyPhone, i.category, i.dealCode,
          i.description, i.amountBeforeVat, i.vatRate + '%', i.vatAmount, i.total,
          i.status === 'paid' ? 'مسدّدة' : 'معلّقة', i.paidDate, i.method, i.createdBy]);
      });
    VH.download('via-horizon-invoices-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف الفواتير', 'ok');
  };

  /* =====================================================================
     متابعة السداد
     ===================================================================== */
  F.payments = function () {
    var map = {};
    VH.store.list('invoices').filter(function (i) { return i.direction === 'in'; }).forEach(function (i) {
      var key = (i.party || 'غير محدد').trim();
      if (!map[key]) map[key] = { name: key, phone: '', total: 0, paid: 0, due: 0, n: 0, last: '', deals: {} };
      var c = map[key];
      c.phone = c.phone || i.partyPhone || '';
      c.total += VH.num(i.total); c.n++;
      if (i.status === 'paid') c.paid += VH.num(i.total); else c.due += VH.num(i.total);
      if (String(i.date) > String(c.last)) c.last = i.date;
      if (i.dealCode) c.deals[i.dealCode] = 1;
    });
    // استكمال الجوال من الصفقات
    VH.store.list('deals').forEach(function (d) {
      var c = map[(d.orgName || d.clientName || '').trim()];
      if (c && !c.phone) c.phone = d.clientPhone || '';
    });
    var list = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.due - a.due; });

    var totDue = list.reduce(function (a, c) { return a + c.due; }, 0);
    var totPaid = list.reduce(function (a, c) { return a + c.paid; }, 0);

    var rows = list.map(function (c) {
      var wa = VH.waPhone(c.phone);
      var msg = encodeURIComponent('السلام عليكم ' + c.name + '، تحية طيبة من شركة فيا هورايزن.\nنودّ تذكيركم بالمبلغ المستحق ' + VH.fmt(c.due) + ' ر.س. شاكرين لكم.');
      return '<tr>' +
        '<td><b>' + VH.esc(c.name) + '</b><br><span class="small muted">' + Object.keys(c.deals).join(' · ') + '</span></td>' +
        '<td class="n">' + VH.esc(c.phone || '—') + '</td>' +
        '<td class="n">' + c.n + '</td>' +
        '<td class="n">' + VH.fmt(c.total) + '</td>' +
        '<td class="n" style="color:var(--ok)">' + VH.fmt(c.paid) + '</td>' +
        '<td class="n" style="color:' + (c.due > 0 ? 'var(--bad)' : 'var(--vh-text-soft)') + '"><b>' + VH.fmt(c.due) + '</b></td>' +
        '<td class="n">' + VH.dateShort(c.last) + '</td>' +
        '<td class="actions">' + (wa && c.due > 0 ? '<a class="btn btn--sm btn--teal" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + msg + '">تذكير واتساب</a>' : '') + '</td>' +
        '</tr>';
    }).join('');

    var html =
      '<div class="grid grid--3" style="margin-bottom:16px">' +
      VH.statCard({ title: 'إجمالي المستحق على العملاء', value: totDue, cls: 'stat--out', desc: 'لم يُحصّل بعد' }) +
      VH.statCard({ title: 'إجمالي المحصّل', value: totPaid, cls: 'stat--in', desc: 'دخل الحساب فعلياً' }) +
      VH.statCard({ count: true, title: 'عدد العملاء', value: list.length, cls: 'stat--navy', desc: 'لهم فواتير في النظام' }) +
      '</div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>العميل</th><th>الجوال</th><th>الفواتير</th>' +
        '<th>الإجمالي</th><th>المحصّل</th><th>المتبقي</th><th>آخر فاتورة</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('👥', 'لا يوجد عملاء بعد — تُضاف بياناتهم تلقائياً عند إنشاء فواتير الوارد'));

    return {
      title: 'متابعة العملاء والسداد',
      sub: 'اسم العميل ورقم الجوال والمبلغ المتبقي',
      actions: '<button class="btn btn--ghost" data-export-pay>تصدير CSV</button>',
      html: html, mount: function () {}
    };
  };

  F.exportPayments = function () {
    var rows = [['العميل', 'الجوال', 'عدد الفواتير', 'الإجمالي', 'المحصّل', 'المتبقي', 'آخر فاتورة']];
    var map = {};
    VH.store.list('invoices').filter(function (i) { return i.direction === 'in'; }).forEach(function (i) {
      var k = (i.party || 'غير محدد').trim();
      map[k] = map[k] || { phone: '', total: 0, paid: 0, due: 0, n: 0, last: '' };
      map[k].phone = map[k].phone || i.partyPhone || '';
      map[k].total += VH.num(i.total); map[k].n++;
      if (i.status === 'paid') map[k].paid += VH.num(i.total); else map[k].due += VH.num(i.total);
      if (String(i.date) > String(map[k].last)) map[k].last = i.date;
    });
    Object.keys(map).forEach(function (k) {
      var c = map[k]; rows.push([k, c.phone, c.n, c.total, c.paid, c.due, c.last]);
    });
    VH.download('via-horizon-clients-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف العملاء', 'ok');
  };

  VH.finance = F;
})(window.VH);
