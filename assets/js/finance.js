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

  /* ---------------- السداد: كامل / جزئي / لم يُسدَّد ---------------- */
  /** المبلغ المحصَّل فعلاً من الفاتورة (يتوافق مع الفواتير القديمة بلا مبلغ جزئي) */
  F.paidOf = function (i) {
    if (!i) return 0;
    if (i.paidAmount !== undefined && i.paidAmount !== null && i.paidAmount !== '') {
      return Math.min(VH.num(i.paidAmount), VH.num(i.total));
    }
    return i.status === 'paid' ? VH.num(i.total) : 0;
  };
  F.dueOf = function (i) { return VH.round2(VH.num(i.total) - F.paidOf(i)); };
  /** الحالة الفعلية للفاتورة: paid / partial / unpaid */
  F.statusOf = function (i) {
    var p = F.paidOf(i), tot = VH.num(i.total);
    if (p >= tot - 0.009 && tot > 0) return 'paid';
    return p > 0.009 ? 'partial' : 'unpaid';
  };
  /** يضبط الحالة والمبلغ المحصَّل معاً قبل الحفظ */
  F.applyPaid = function (obj, amount) {
    var tot = VH.num(obj.total);
    var p = Math.max(0, Math.min(VH.num(amount), tot));
    obj.paidAmount = VH.round2(p);
    obj.status = F.statusOf(obj);
    if (obj.status === 'unpaid') obj.paidDate = '';
    return obj;
  };

  /* ---------------- الحسابات ---------------- */
  F.totals = function (r) {
    var s = VH.store.settings(), inv = VH.store.list('invoices');
    var t = {
      opening: VH.num(s.openingBalance),
      inPaid: 0, outPaid: 0, unpaidIn: 0, unpaidOut: 0, unpaidInN: 0, unpaidOutN: 0,
      periodIn: 0, periodOut: 0, vatOut: 0, vatIn: 0
    };
    inv.forEach(function (i) {
      var paid = F.paidOf(i), due = VH.round2(VH.num(i.total) - paid);
      if (i.direction === 'in') {
        t.inPaid += paid;
        if (r && paid && VH.inRange(i.paidDate || i.date, r)) t.periodIn += paid;
        if (due > 0.009) { t.unpaidIn += due; t.unpaidInN++; }
      } else {
        t.outPaid += paid;
        if (r && paid && VH.inRange(i.paidDate || i.date, r)) t.periodOut += paid;
        if (due > 0.009) { t.unpaidOut += due; t.unpaidOutN++; }
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
      {
        name: 'amount', label: 'المبلغ (شامل الضريبة)', type: 'number', required: true,
        value: existing ? i.total : '', hint: 'كل المبالغ في النظام شاملة الضريبة — لا تُضاف عليها ضريبة'
      },
      {
        name: 'vatRate', label: 'نسبة الضريبة', type: 'select',
        options: [{ v: '15', t: '15% — الأساسية' }, { v: '0', t: '0% — معفاة/خارج النطاق' }],
        value: String(i.vatRate !== undefined ? i.vatRate : (VH.num(s.vatRate) || 15))
      },
      {
        name: 'status', label: 'حالة السداد', type: 'select', required: true,
        options: [
          { v: 'unpaid', t: 'لم يتم السداد' },
          { v: 'partial', t: 'سداد جزئي' },
          { v: 'paid', t: 'مسدد بالكامل' }
        ], value: existing ? F.statusOf(i) : 'unpaid'
      },
      {
        name: 'paidAmount', label: 'المبلغ المسدَّد', type: 'number', min: '0', step: '0.01',
        value: existing ? F.paidOf(i) : '', hint: 'يُعبَّأ تلقائياً — عدّليه مع «سداد جزئي»'
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
        var lastStatus = existing ? F.statusOf(i) : 'unpaid';
        function calc() {
          var v = VH.form.read(bd);
          var r = VH.vat(v.amount, VH.num(v.vatRate), true);
          // المبلغ المسدَّد يتبع الحالة: الكامل = الإجمالي، لم يُسدَّد = صفر، الجزئي بيد المستخدمة
          var pa = bd.querySelector('[data-f=paidAmount]');
          if (v.status !== lastStatus) {
            if (v.status === 'paid') pa.value = r.total;
            else if (v.status === 'unpaid') pa.value = 0;
            lastStatus = v.status;
          } else if (v.status === 'paid') pa.value = r.total;
          else if (v.status === 'unpaid') pa.value = 0;
          pa.readOnly = v.status !== 'partial';
          pa.closest('.f').style.opacity = v.status === 'partial' ? '1' : '.6';
          var due = VH.round2(r.total - Math.min(VH.num(pa.value), r.total));
          bd.querySelector('#invPrev').innerHTML =
            '<b>الإجمالي ' + VH.fmt(r.total) + ' ر.س</b>' +
            '<small> = قبل الضريبة ' + VH.fmt(r.before) + ' + ضريبة ' + VH.fmt(r.vat) + ' (' + VH.fmt(r.rate) + '%)' +
            ' · مسدَّد ' + VH.fmt(VH.num(pa.value)) + ' · متبقٍ ' + VH.fmt(due) + '</small>';
          // تحديث قائمة التصنيفات حسب النوع
          var sel = bd.querySelector('[data-f=category]');
          var want = v.direction === 'in' ? CAT_IN : CAT_OUT;
          if (sel.options.length !== want.length || sel.options[0].value !== want[0]) {
            var cur = sel.value;
            sel.innerHTML = want.map(function (c) { return '<option value="' + VH.esc(c) + '">' + VH.esc(c) + '</option>'; }).join('');
            if (want.indexOf(cur) > -1) sel.value = cur;
          }
          bd.querySelector('[data-f=paidDate]').closest('.f').style.opacity = v.status === 'unpaid' ? '.5' : '1';
        }
        bd.addEventListener('input', calc); bd.addEventListener('change', calc); calc();
      },
      actions: [
        {
          label: existing ? 'حفظ التعديل' : 'حفظ الفاتورة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (!VH.num(v.amount)) { VH.form.error(bd, 'أدخلي مبلغاً أكبر من صفر'); return; }
            var r = VH.vat(v.amount, VH.num(v.vatRate), true);
            var d = v.dealId ? VH.store.get('deals', v.dealId) : null;
            if (v.status === 'partial' && !(VH.num(v.paidAmount) > 0 && VH.num(v.paidAmount) < r.total)) {
              VH.form.error(bd, 'مع «سداد جزئي» اكتبي مبلغاً أكبر من صفر وأقل من إجمالي الفاتورة'); return;
            }
            var obj = Object.assign({}, existing || {}, {
              direction: v.direction, date: v.date, party: v.party, partyPhone: v.partyPhone,
              category: v.category, dealId: v.dealId, dealCode: d ? d.code : '',
              description: v.description, amountBeforeVat: r.before, vatRate: r.rate, vatAmount: r.vat,
              total: r.total, vatIncluded: true,
              paidDate: v.status === 'unpaid' ? '' : (v.paidDate || VH.today()),
              method: v.method
            });
            F.applyPaid(obj, v.status === 'paid' ? r.total : (v.status === 'unpaid' ? 0 : v.paidAmount));
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

  /* =====================================================================
     إدخال دفعة فواتير — عدة بنود في إدخال واحد بدل فاتورة فاتورة
     ===================================================================== */
  F.batchModal = function (after, deal) {
    var s = VH.store.settings();
    var rate = String(VH.num(s.vatRate) || 15);
    var deals = VH.store.list('deals').sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    var rows = [{}, {}, {}];

    var fields = [
      {
        name: 'dealId', label: 'ربط كل البنود بصفقة (اختياري)', type: 'select', full: true,
        options: [{ v: '', t: '— بدون ربط —' }].concat(deals.map(function (d) { return { v: d.id, t: d.code + ' — ' + (d.orgName || d.clientName) }; })),
        value: deal ? deal.id : ''
      },
      {
        name: '_rows', type: 'html', full: true,
        html: '<label style="font-size:.82rem;font-weight:600;color:var(--vh-navy)">البنود ' +
          '<span class="hint" style="font-weight:400">— كل سطر يصير فاتورة مستقلة، والمبالغ شاملة الضريبة</span></label>' +
          '<div id="bRows"></div>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-add-row style="margin-top:10px">+ إضافة بند</button>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-fill-down style="margin-top:10px">نسخ بيانات أول سطر للبقية</button>'
      },
      { name: '_sum', type: 'html', full: true, html: '<div id="bSum" class="strip strip--info" style="margin:0"></div>' }
    ];

    function rowHtml(x, i) {
      function opt(list, sel) {
        return list.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + VH.esc(c) + '</option>'; }).join('');
      }
      var dir = x.direction || 'out';
      return '<tr data-i="' + i + '">' +
        '<td><input class="qin" type="date" dir="ltr" data-k="date" value="' + VH.esc(x.date || VH.today()) + '"></td>' +
        '<td><select class="qin" data-k="direction">' +
        '<option value="out"' + (dir === 'out' ? ' selected' : '') + '>منصرف</option>' +
        '<option value="in"' + (dir === 'in' ? ' selected' : '') + '>وارد</option></select></td>' +
        '<td><input class="qin" data-k="party" value="' + VH.esc(x.party || '') + '" placeholder="اسم الطرف"></td>' +
        '<td><select class="qin" data-k="category">' + opt(dir === 'in' ? CAT_IN : CAT_OUT, x.category) + '</select></td>' +
        '<td><input class="qin" data-k="description" value="' + VH.esc(x.description || '') + '" placeholder="وصف البند"></td>' +
        '<td><input class="qin" type="number" min="0" step="0.01" dir="ltr" data-k="amount" value="' + VH.esc(x.amount || '') + '"></td>' +
        '<td><select class="qin" data-k="vatRate"><option value="15"' + (String(x.vatRate || rate) === '15' ? ' selected' : '') + '>15%</option>' +
        '<option value="0"' + (String(x.vatRate) === '0' ? ' selected' : '') + '>0%</option></select></td>' +
        '<td><select class="qin" data-k="status">' +
        '<option value="paid"' + ((x.status || 'paid') === 'paid' ? ' selected' : '') + '>مسدد بالكامل</option>' +
        '<option value="partial"' + (x.status === 'partial' ? ' selected' : '') + '>سداد جزئي</option>' +
        '<option value="unpaid"' + (x.status === 'unpaid' ? ' selected' : '') + '>لم يتم السداد</option></select></td>' +
        '<td><input class="qin" type="number" min="0" step="0.01" dir="ltr" data-k="paidAmount" value="' + VH.esc(x.paidAmount || '') + '" placeholder="مع الجزئي"></td>' +
        '<td><button type="button" class="btn btn--sm btn--danger" data-del-row title="حذف السطر">×</button></td></tr>';
    }
    function render(bd) {
      bd.querySelector('#bRows').innerHTML =
        '<div class="tbl-wrap"><table class="tbl" style="min-width:1240px"><thead><tr>' +
        '<th style="width:140px">التاريخ</th><th style="width:100px">النوع</th><th style="width:170px">الطرف</th>' +
        '<th style="width:150px">التصنيف</th><th>الوصف</th><th style="width:120px">المبلغ</th>' +
        '<th style="width:86px">الضريبة</th><th style="width:140px">حالة السداد</th><th style="width:110px">المسدَّد</th>' +
        '<th style="width:44px"></th></tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
      sum(bd);
    }
    function read(bd) {
      return [].slice.call(bd.querySelectorAll('#bRows tbody tr')).map(function (tr) {
        var g = function (k) { var e = tr.querySelector('[data-k=' + k + ']'); return e ? e.value : ''; };
        return {
          date: g('date'), direction: g('direction'), party: g('party').trim(), category: g('category'),
          description: g('description').trim(), amount: VH.num(g('amount')), vatRate: VH.num(g('vatRate')),
          status: g('status'), paidAmount: VH.num(g('paidAmount'))
        };
      });
    }
    function sum(bd) {
      var list = read(bd).filter(function (x) { return x.amount > 0; });
      var inn = 0, out = 0;
      list.forEach(function (x) { if (x.direction === 'in') inn += x.amount; else out += x.amount; });
      bd.querySelector('#bSum').innerHTML = '<span class="strip__ico">∑</span><div>' +
        '<b>' + (list.length ? list.length + ' بند جاهز للحفظ' : 'لم تُدخل بنود بعد') + '</b>' +
        '<small>وارد ' + VH.fmt(inn) + ' ر.س · منصرف ' + VH.fmt(out) + ' ر.س · الصافي ' + VH.fmt(VH.round2(inn - out)) + ' ر.س</small></div>';
    }

    VH.modal({
      title: 'إدخال دفعة فواتير',
      wide: true,
      body: VH.form.render(fields),
      onOpen: function (bd) {
        render(bd);
        bd.addEventListener('input', function () { sum(bd); });
        bd.addEventListener('change', function (e) {
          // تغيير النوع يغيّر قائمة التصنيفات لذلك السطر
          if (e.target.closest('[data-k=direction]')) { rows = read(bd); render(bd); return; }
          sum(bd);
        });
        bd.addEventListener('click', function (e) {
          if (e.target.closest('[data-add-row]')) { rows = read(bd); rows.push({}); render(bd); }
          if (e.target.closest('[data-fill-down]')) {
            rows = read(bd); var f = rows[0]; if (!f) return;
            rows.forEach(function (x, i) {
              if (i) { x.date = f.date; x.direction = f.direction; x.party = f.party; x.category = f.category; }
            });
            render(bd); VH.toast('نُسخت بيانات أول سطر', 'ok');
          }
          var del = e.target.closest('[data-del-row]');
          if (del) {
            rows = read(bd);
            if (rows.length <= 1) { VH.toast('لا بد من سطر واحد على الأقل', 'warn'); return; }
            rows.splice(+del.closest('tr').getAttribute('data-i'), 1); render(bd);
          }
        });
      },
      actions: [
        {
          label: 'حفظ كل البنود', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.read(bd);
            var list = read(bd).filter(function (x) { return x.amount > 0 || x.party || x.description; });
            if (!list.length) { VH.form.error(bd, 'أدخلي بنداً واحداً على الأقل'); return; }
            var bad = '';
            list.forEach(function (x, i) {
              var n = ' (السطر ' + (i + 1) + ')';
              if (bad) return;
              if (!x.party) bad = 'اكتبي اسم الطرف' + n;
              else if (!(x.amount > 0)) bad = 'أدخلي مبلغاً أكبر من صفر' + n;
              else if (!x.date) bad = 'أدخلي التاريخ' + n;
              else if (x.status === 'partial' && !(x.paidAmount > 0 && x.paidAmount < x.amount)) {
                bad = 'مع «سداد جزئي» اكتبي مبلغاً أكبر من صفر وأقل من قيمة البند' + n;
              }
            });
            if (bad) { VH.form.error(bd, bad); return; }
            var dl = v.dealId ? VH.store.get('deals', v.dealId) : null;
            list.forEach(function (x) {
              var r = VH.vat(x.amount, x.vatRate, true);
              var obj = {
                no: VH.store.nextInvoiceNo(), direction: x.direction, date: x.date,
                party: x.party, partyType: x.direction === 'in' ? 'عميل' : 'مورّد',
                category: x.category, description: x.description,
                dealId: v.dealId || '', dealCode: dl ? dl.code : '',
                amountBeforeVat: r.before, vatRate: r.rate, vatAmount: r.vat, total: r.total, vatIncluded: true,
                paidDate: x.status === 'unpaid' ? '' : x.date, method: '',
                createdBy: (VH.auth.user() || {}).name || ''
              };
              F.applyPaid(obj, x.status === 'paid' ? r.total : (x.status === 'unpaid' ? 0 : x.paidAmount));
              VH.store.save('invoices', obj);
            });
            VH.store.log('دفعة فواتير', 'أُدخلت ' + list.length + ' فاتورة دفعة واحدة' + (dl ? ' — ' + dl.code : ''), dl ? dl.id : '');
            close();
            VH.toast('حُفظت ' + (list.length === 1 ? 'فاتورة واحدة' : list.length === 2 ? 'فاتورتان' : list.length + ' فواتير'), 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /** تسجيل سداد — كامل أو جزئي أو إرجاع الفاتورة إلى «لم يتم السداد» */
  F.payModal = function (inv, after) {
    if (!inv) return;
    var tot = VH.num(inv.total), already = F.paidOf(inv), due = VH.round2(tot - already);
    var fields = [
      {
        name: '_now', type: 'html', full: true,
        html: '<div class="strip strip--info" style="margin:0"><span class="strip__ico">∑</span><div>' +
          '<b>إجمالي الفاتورة ' + VH.fmt(tot) + ' ر.س</b>' +
          '<small>المسدَّد حتى الآن ' + VH.fmt(already) + ' · المتبقي ' + VH.fmt(due) + '</small></div></div>'
      },
      {
        name: 'status', label: 'حالة السداد', type: 'select', required: true,
        options: [
          { v: 'paid', t: 'مسدد بالكامل' },
          { v: 'partial', t: 'سداد جزئي' },
          { v: 'unpaid', t: 'لم يتم السداد' }
        ], value: due > 0.009 ? (already > 0.009 ? 'partial' : 'paid') : 'paid'
      },
      {
        name: 'paidAmount', label: 'إجمالي المبلغ المسدَّد', type: 'number', min: '0', step: '0.01',
        value: tot, hint: 'مع «سداد جزئي» اكتبي إجمالي ما حُصّل فعلاً من الفاتورة'
      },
      { name: 'paidDate', label: 'تاريخ السداد', type: 'date', required: true, value: inv.paidDate || VH.today() },
      { name: 'method', label: 'طريقة السداد', type: 'select', options: METHODS.map(function (m) { return { v: m, t: m }; }), value: inv.method || METHODS[0] }
    ];
    VH.modal({
      title: 'سداد الفاتورة ' + VH.esc(inv.no),
      body: VH.form.render(fields),
      onOpen: function (bd) {
        var pa = bd.querySelector('[data-f=paidAmount]');
        function sync() {
          var v = VH.form.read(bd);
          if (v.status === 'paid') pa.value = tot;
          else if (v.status === 'unpaid') pa.value = 0;
          else if (!VH.num(pa.value) || VH.num(pa.value) >= tot) pa.value = already || '';
          pa.readOnly = v.status !== 'partial';
          pa.closest('.f').style.opacity = v.status === 'partial' ? '1' : '.6';
        }
        bd.addEventListener('change', sync); sync();
      },
      actions: [
        {
          label: 'حفظ السداد', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            var amt = v.status === 'paid' ? tot : (v.status === 'unpaid' ? 0 : VH.num(v.paidAmount));
            if (v.status === 'partial' && !(amt > 0 && amt < tot)) {
              VH.form.error(bd, 'مبلغ السداد الجزئي لا بد أن يكون أكبر من صفر وأقل من ' + VH.fmt(tot)); return;
            }
            inv.paidDate = v.status === 'unpaid' ? '' : v.paidDate;
            inv.method = v.status === 'unpaid' ? inv.method : v.method;
            F.applyPaid(inv, amt);
            VH.store.save('invoices', inv);
            VH.store.log('سداد', inv.no + ' — ' + VH.payText(inv.status) + ' ' + VH.moneyTxt(amt) + ' من ' + VH.moneyTxt(tot), inv.id);
            close();
            VH.toast(inv.status === 'paid' ? 'سُجّل السداد الكامل' : inv.status === 'partial'
              ? 'سُجّل سداد جزئي — المتبقي ' + VH.moneyTxt(VH.round2(tot - amt)) : 'أُعيدت الفاتورة إلى «لم يتم السداد»',
              inv.status === 'unpaid' ? 'warn' : 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };
  F.togglePaid = F.payModal;   // توافق مع الاسم القديم

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
    // فلتر الصفحة: الكل / العائد من العميل / المصروف
    var df = F._df || '';
    var inPeriod = VH.store.list('invoices').filter(function (i) {
      return VH.inRange(i.date, r) || (i.paidDate && VH.inRange(i.paidDate, r));
    });
    var shown = df ? inPeriod.filter(function (i) { return i.direction === df; }) : inPeriod;
    var sh = shown.reduce(function (a, i) {
      a.total += VH.num(i.total); a.paid += F.paidOf(i); a.due += F.dueOf(i); return a;
    }, { total: 0, paid: 0, due: 0 });


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
        '<div><b>فواتير تحتاج سداد</b><small>' + t.unpaidInN + ' بانتظار التحصيل (' + VH.fmt(t.unpaidIn) + ' ر.س) · ' +
          t.unpaidOutN + ' بانتظار السداد (' + VH.fmt(t.unpaidOut) + ' ر.س)</small></div>' +
        '<span class="sp"></span>' +
        '<div class="center"><small>الرصيد المتوقّع بعد التسوية</small><br><b class="num">' + VH.fmt(t.expected) + ' ر.س</b></div>' +
        '<a class="btn btn--ghost btn--sm" href="#/f/payments">متابعة السداد</a>' +
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

      '<div class="periods"><div class="periods__row">' +
      '<button class="pbtn ' + (!df ? 'is-on' : '') + '" data-df="">الجميع</button>' +
      '<button class="pbtn ' + (df === 'in' ? 'is-on' : '') + '" data-df="in">العائد من العميل</button>' +
      '<button class="pbtn ' + (df === 'out' ? 'is-on' : '') + '" data-df="out">المصروف</button>' +
      '<span style="flex:1"></span>' +
      '<span class="small muted">' + shown.length + ' فاتورة في الفترة · إجمالي ' + VH.fmt(sh.total) +
      ' · مسدَّد ' + VH.fmt(sh.paid) + ' · متبقٍ ' + VH.fmt(sh.due) + ' ر.س</span>' +
      '</div></div>' +

      (df
        ? '<div class="grid grid--3">' +
          VH.statCard({ title: df === 'in' ? 'إجمالي العائد في الفترة' : 'إجمالي المصروف في الفترة', value: sh.total, cls: df === 'in' ? 'stat--in' : 'stat--out', desc: shown.length + ' فاتورة' }) +
          VH.statCard({ title: df === 'in' ? 'المحصّل فعلاً' : 'المدفوع فعلاً', value: sh.paid, cls: 'stat--net', desc: 'دخل/خرج من الحساب' }) +
          VH.statCard({ title: df === 'in' ? 'المتبقي على العملاء' : 'المتبقي علينا', value: sh.due, cls: 'stat--navy', desc: 'لم يُسدَّد بعد' }) +
          '</div>'
        : '<div class="grid grid--3">' +
          VH.statCard({ title: 'وارد الفترة', value: t.periodIn, cls: 'stat--in', desc: 'المحصّل خلال الفترة المختارة', delta: pt ? VH.delta(t.periodIn, pt.periodIn) : null }) +
          VH.statCard({ title: 'منصرف الفترة', value: t.periodOut, cls: 'stat--out', desc: 'المدفوع خلال الفترة المختارة', delta: pt ? VH.delta(t.periodOut, pt.periodOut) : null }) +
          VH.statCard({ title: 'صافي الفترة', value: t.periodNet, cls: 'stat--net', desc: 'الوارد − المنصرف', delta: pt ? VH.delta(t.periodNet, pt.periodNet) : null }) +
          '</div>');

    return {
      title: 'الفواتير والحسابات',
      sub: 'كل مبلغ داخل أو خارج — والرصيد المتبقي في حسابك البنكي',
      actions: (VH.auth.can('financeEdit') ? '<button class="btn btn--ghost" data-opening>الرصيد الافتتاحي</button>' : '') +
        '<button class="btn btn--ghost" data-export-inv>تصدير CSV</button>' +
        (VH.auth.can('financeEdit') ? '<button class="btn btn--navy" data-batch-inv>+ دفعة فواتير</button>' +
          '<button class="btn btn--gold" data-new-inv>+ فاتورة جديدة</button>' : ''),
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        root.querySelectorAll('[data-df]').forEach(function (b) {
          b.addEventListener('click', function () { F._df = b.getAttribute('data-df'); VH.app.render(); });
        });
      }
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
      if (f.status && F.statusOf(i) !== f.status) return false;
      if (f.q) {
        var q = f.q.toLowerCase();
        if (![i.no, i.party, i.description, i.category, i.dealCode].some(function (x) { return String(x || '').toLowerCase().indexOf(q) > -1; })) return false;
      }
      return true;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)); });

    var sum = list.reduce(function (a, i) {
      if (i.direction === 'in') { a.in += VH.num(i.total); a.vin += VH.num(i.vatAmount); a.pin += F.paidOf(i); }
      else { a.out += VH.num(i.total); a.vout += VH.num(i.vatAmount); a.pout += F.paidOf(i); }
      return a;
    }, { in: 0, out: 0, vin: 0, vout: 0, pin: 0, pout: 0 });

    var canEdit = VH.auth.can('financeEdit');
    var rows = list.map(function (i) {
      var st = F.statusOf(i), pd = F.paidOf(i), rem = VH.round2(VH.num(i.total) - pd);
      return '<tr>' +
        '<td class="n">' + VH.esc(i.no) + '</td>' +
        '<td class="n">' + VH.dateShort(i.date) + '</td>' +
        '<td>' + VH.dirBadge(i.direction) + '</td>' +
        '<td><b>' + VH.esc(i.party) + '</b>' + (i.dealCode ? '<br><a class="small n" href="#/o/deal/' + i.dealId + '">' + VH.esc(i.dealCode) + '</a>' : '') + '</td>' +
        '<td>' + VH.esc(i.category || '') + '<br><span class="small muted">' + VH.esc(i.description || '') + '</span></td>' +
        '<td class="n">' + VH.fmt(i.amountBeforeVat) + '</td>' +
        '<td class="n">' + VH.fmt(i.vatAmount) + '</td>' +
        '<td class="n"><b>' + VH.fmt(i.total) + '</b>' +
        (st === 'partial' ? '<br><span class="small muted">مسدَّد ' + VH.fmt(pd) + ' · متبقٍ ' + VH.fmt(rem) + '</span>' : '') + '</td>' +
        '<td>' + VH.payBadge(st) + (i.paidDate ? '<br><span class="small muted n">' + i.paidDate + '</span>' : '') + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn--sm btn--ghost" data-print="' + i.id + '">🖨</button>' +
          (canEdit ? '<button class="btn btn--sm btn--ghost" data-edit-inv="' + i.id + '">تعديل</button>' +
            '<button class="btn btn--sm ' + (st === 'paid' ? 'btn--ghost' : 'btn--teal') + '" data-pay="' + i.id + '">' +
            (st === 'paid' ? 'تعديل السداد' : 'سداد') + '</button>' +
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
      '<button class="pbtn ' + (f.status === 'paid' ? 'is-on' : '') + '" data-status="paid">مسدد بالكامل</button>' +
      '<button class="pbtn ' + (f.status === 'partial' ? 'is-on' : '') + '" data-status="partial">سداد جزئي</button>' +
      '<button class="pbtn ' + (f.status === 'unpaid' ? 'is-on' : '') + '" data-status="unpaid">لم يتم السداد</button>' +
      '<span style="flex:1"></span>' +
      '<input type="search" id="iq" placeholder="بحث برقم الفاتورة أو الطرف…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:230px">' +
      '</div></div>' +
      '<div class="grid grid--4" style="margin-bottom:16px">' +
      VH.statCard({ title: 'وارد الفواتير المعروضة', value: sum.in, cls: 'stat--in', desc: 'محصّل ' + VH.fmt(sum.pin) + ' · متبقٍ ' + VH.fmt(sum.in - sum.pin) }) +
      VH.statCard({ title: 'منصرف الفواتير المعروضة', value: sum.out, cls: 'stat--out', desc: 'مدفوع ' + VH.fmt(sum.pout) + ' · متبقٍ ' + VH.fmt(sum.out - sum.pout) }) +
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
        (canEdit ? '<button class="btn btn--navy" data-batch-inv>+ دفعة فواتير</button>' +
          '<button class="btn btn--gold" data-new-inv>+ فاتورة جديدة</button>' : ''),
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
    var rows = [['رقم الفاتورة', 'التاريخ', 'النوع', 'الطرف', 'الجوال', 'التصنيف', 'الصفقة', 'الوصف', 'قبل الضريبة', 'نسبة الضريبة', 'الضريبة', 'الإجمالي', 'المسدَّد', 'المتبقي', 'الحالة', 'تاريخ السداد', 'طريقة السداد', 'أنشأها']];
    VH.store.list('invoices')
      .filter(function (i) { return VH.inRange(i.date, r) || (i.paidDate && VH.inRange(i.paidDate, r)); })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .forEach(function (i) {
        rows.push([i.no, i.date, i.direction === 'in' ? 'وارد' : 'منصرف', i.party, i.partyPhone, i.category, i.dealCode,
          i.description, i.amountBeforeVat, i.vatRate + '%', i.vatAmount, i.total,
          F.paidOf(i), F.dueOf(i), VH.payText(F.statusOf(i)), i.paidDate, i.method, i.createdBy]);
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
      c.paid += F.paidOf(i); c.due += F.dueOf(i);
      if (String(i.date) > String(c.last)) c.last = i.date;
      if (i.dealCode) c.deals[i.dealCode] = i.dealId || '';
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
      var dealLinks = Object.keys(c.deals).map(function (code) {
        return c.deals[code]
          ? '<a class="btn btn--sm btn--navy" href="#/o/deal/' + c.deals[code] + '" title="فتح الصفقة وتسجيل السداد">' + VH.esc(code) + ' ↗</a>'
          : '<span class="badge b-gray">' + VH.esc(code) + '</span>';
      }).join(' ');
      return '<tr>' +
        '<td><b>' + VH.esc(c.name) + '</b><br><span class="small muted">' + Object.keys(c.deals).join(' · ') + '</span></td>' +
        '<td class="n">' + VH.esc(c.phone || '—') + '</td>' +
        '<td class="n">' + c.n + '</td>' +
        '<td class="n">' + VH.fmt(c.total) + '</td>' +
        '<td class="n" style="color:var(--ok)">' + VH.fmt(c.paid) + '</td>' +
        '<td class="n" style="color:' + (c.due > 0 ? 'var(--bad)' : 'var(--vh-text-soft)') + '"><b>' + VH.fmt(c.due) + '</b></td>' +
        '<td class="n">' + VH.dateShort(c.last) + '</td>' +
        '<td class="actions">' + dealLinks +
        '<button class="btn btn--sm btn--teal" data-pay-client="' + VH.esc(c.name) + '">تسجيل سداد</button>' +
        (wa && c.due > 0 ? '<a class="btn btn--sm btn--ghost" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + msg + '">واتساب</a>' : '') + '</td>' +
        '</tr>';
    }).join('');

    var html =
      '<p class="small muted" style="margin-top:0">اضغطي رقم الصفقة لفتحها مباشرة، أو «تسجيل سداد» لتحديد الفاتورة وتسجيل سداد كامل أو جزئي.</p>' +
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
      html: html,
      mount: function (root) {
        root.querySelectorAll('[data-pay-client]').forEach(function (b) {
          b.addEventListener('click', function () { F.clientPayModal(b.getAttribute('data-pay-client')); });
        });
      }
    };
  };

  /** فواتير عميل واحد — لاختيار الفاتورة وتسجيل سدادها من صفحة متابعة السداد */
  F.clientPayModal = function (party) {
    var list = VH.store.list('invoices').filter(function (i) {
      return i.direction === 'in' && (i.party || '').trim() === party;
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!list.length) { VH.toast('لا فواتير لهذا العميل', 'warn'); return; }
    VH.modal({
      title: 'فواتير ' + VH.esc(party),
      wide: true,
      body: '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>التاريخ</th><th>الصفقة</th>' +
        '<th>الإجمالي</th><th>المحصّل</th><th>المتبقي</th><th>الحالة</th><th></th></tr></thead><tbody>' +
        list.map(function (i) {
          return '<tr><td class="n">' + VH.esc(i.no) + '</td><td class="n">' + VH.dateShort(i.date) + '</td>' +
            '<td>' + (i.dealId ? '<a class="n" href="#/o/deal/' + i.dealId + '" data-goto-deal>' + VH.esc(i.dealCode) + ' ↗</a>' : '—') + '</td>' +
            '<td class="n">' + VH.fmt(i.total) + '</td><td class="n">' + VH.fmt(F.paidOf(i)) + '</td>' +
            '<td class="n"><b>' + VH.fmt(F.dueOf(i)) + '</b></td>' +
            '<td>' + VH.payBadge(F.statusOf(i)) + '</td>' +
            '<td class="actions"><button class="btn btn--sm btn--teal" data-pick-pay="' + i.id + '">تسجيل سداد</button></td></tr>';
        }).join('') + '</tbody></table></div>',
      onOpen: function (bd, close) {
        bd.addEventListener('click', function (e) {
          var p = e.target.closest('[data-pick-pay]');
          if (p) { close(); F.payModal(VH.store.get('invoices', p.getAttribute('data-pick-pay')), VH.app.render); return; }
          if (e.target.closest('[data-goto-deal]')) close();
        });
      },
      actions: [{ label: 'إغلاق', cls: 'btn--ghost' }]
    });
  };

  F.exportPayments = function () {
    var rows = [['العميل', 'الجوال', 'عدد الفواتير', 'الإجمالي', 'المحصّل', 'المتبقي', 'آخر فاتورة']];
    var map = {};
    VH.store.list('invoices').filter(function (i) { return i.direction === 'in'; }).forEach(function (i) {
      var k = (i.party || 'غير محدد').trim();
      map[k] = map[k] || { phone: '', total: 0, paid: 0, due: 0, n: 0, last: '' };
      map[k].phone = map[k].phone || i.partyPhone || '';
      map[k].total += VH.num(i.total); map[k].n++;
      map[k].paid += F.paidOf(i); map[k].due += F.dueOf(i);
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
