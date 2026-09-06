/* =====================================================================
   بوابة متابعة العمل والعقود
   المراحل: تسويق المبيعات ← عرض السعر ← مكتب الإيجار ← إسناد لموظف
            ← بيانات السيارات ← السواق ← فواتير الصرف ← مكتملة
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var O = {};
  var ORDER = ['marketing', 'quote', 'office', 'assigned', 'vehicles', 'driver', 'expenses', 'done'];
  var KINDS = ['بنزين', 'مناديل', 'موية', 'يومية السواق', 'أخرى'];
  var CARS = ['هيونداي H1', 'تويوتا هايس', 'جي إم سي', 'شيفروليه سوبربان', 'تاهو', 'مرسيدس S450', 'مرسيدس سبرينتر', 'كامري', 'سوناتا', 'باص 30 راكب', 'باص 50 راكب', 'أخرى'];
  var REGIONS = ['الرياض', 'مكة المكرمة', 'المدينة المنورة', 'جدة', 'الشرقية', 'القصيم', 'عسير', 'تبوك', 'حائل', 'نجران', 'جازان', 'الباحة', 'الجوف', 'الحدود الشمالية'];
  var WAGES = ['150', '200', '250'];
  var NATIONALITY = ['سعودي', 'غير سعودي'];

  O.ORDER = ORDER; O.KINDS = KINDS; O.CARS = CARS; O.REGIONS = REGIONS;
  O.idx = function (stage) { var i = ORDER.indexOf(stage); return i < 0 ? 0 : i; };

  /* ---------------- الحسابات ---------------- */
  O.calc = function (d) {
    var c = d.contract || {}, r = d.rental || {}, s = VH.store.settings();
    var rate = VH.num(s.vatRate) || 15;
    var price = VH.num(c.price);
    var incl = c.priceVatIncluded !== 'no';
    var v = VH.vat(price, rate, incl);
    var exp = (d.expenses || []).reduce(function (a, e) { return a + VH.num(e.amount); }, 0);
    var rent = VH.num(r.rentTotal);
    var cost = rent + exp;
    return {
      rate: rate, priceIn: incl,
      revenueBefore: v.before, vat: v.vat, revenueTotal: v.total,
      rent: rent, expenses: exp, cost: cost,
      profit: VH.round2(v.before - cost),
      margin: v.before ? VH.round2((v.before - cost) / v.before * 100) : 0
    };
  };

  /** إجمالي عرض السعر = قيمة السيارة لليوم × عدد السيارات × الأيام */
  O.quoteTotal = function (q) {
    var days = VH.num(q.days) || VH.daysBetween(q.startDate, q.endDate);
    return VH.round2(VH.num(q.pricePerCarPerDay) * (VH.num(q.carsCount) || 1) * days);
  };

  O.push = function (d, note) {
    d.timeline = d.timeline || [];
    var u = VH.auth.user() || {};
    d.timeline.push({ stage: d.stage, at: VH.stamp(), by: u.name || '—', note: note || '' });
  };

  O.party = function (d) { return d.orgName || d.clientName || ''; };

  O.filtered = function (f) {
    f = f || {};
    var list = VH.store.list('deals');
    if (f.stage) list = list.filter(function (d) { return d.stage === f.stage; });
    if (f.owner) list = list.filter(function (d) { return d.owner === f.owner || d.assignee === f.owner; });
    if (f.q) {
      var q = f.q.toLowerCase();
      list = list.filter(function (d) {
        return [d.code, d.clientName, d.orgName, d.clientPhone, d.clientEmail,
          (d.contract || {}).plate, (d.rental || {}).officeName, (d.driver || {}).name]
          .some(function (x) { return String(x || '').toLowerCase().indexOf(q) > -1; });
      });
    }
    return list.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  };

  /* =====================================================================
     ① تسويق المبيعات — تسجيل عميل تم التواصل معه
     ===================================================================== */
  O.newDeal = function (after) {
    var staff = VH.store.staff();
    var me = VH.auth.user() || {};
    var nextCode = 'C-' + (1000 + (VH.num(VH.store.settings().dealSeq) || 1));
    var fields = [
      { name: 'code', label: 'رقم العميل', value: nextCode, required: true, readonly: true, hint: 'متسلسل تلقائياً' },
      { name: 'contactDate', label: 'تاريخ التواصل', type: 'date', value: VH.today(), required: true },
      { name: 'dayName', label: 'اليوم', type: 'static', value: VH.dayName(VH.today()) },
      { name: 'orgName', label: 'اسم الجهة', required: true },
      { name: 'clientName', label: 'اسم العميل (الشخص)', required: true },
      { name: 'clientPhone', label: 'رقم الجوال', type: 'tel', required: true },
      { name: 'clientEmail', label: 'الإيميل', type: 'email' },
      {
        name: 'negotiationStatus', label: 'الحالة', type: 'select', required: true,
        options: VH.DEAL_STATUS.map(function (s) { return { v: s, t: s }; }), value: 'بداية التواصل'
      },
      {
        name: 'owner', label: 'الموظف المسؤول', type: 'select', required: true,
        options: staff.map(function (s) { return { v: s.id, t: s.name }; }),
        value: me.role === 'employee' ? me.id : (staff[0] || {}).id
      },
      { name: 'notes', label: 'ملاحظات التواصل', type: 'textarea', full: true, rows: 2 }
    ];
    VH.modal({
      title: 'عميل جديد — مرحلة تسويق المبيعات',
      body: VH.form.render(fields),
      onOpen: function (bd) {
        bd.querySelector('[data-f=contactDate]').addEventListener('change', function (e) {
          bd.querySelector('[data-f=dayName]').value = VH.dayName(e.target.value);
        });
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.clientPhone && !VH.telOk(v.clientPhone)) { VH.form.error(bd, 'رقم الجوال غير صحيح (مثال: 0512345678)'); return; }
            if (v.clientEmail && v.clientEmail.indexOf('@') < 0) { VH.form.error(bd, 'الإيميل غير صحيح'); return; }
            var d = {
              code: v.code, orgName: v.orgName, clientName: v.clientName,
              clientPhone: v.clientPhone, clientEmail: v.clientEmail,
              contactDate: v.contactDate, negotiationDate: v.contactDate,
              negotiationStatus: v.negotiationStatus, owner: v.owner, assignee: '', notes: v.notes,
              stage: v.negotiationStatus === 'ملغي' ? 'cancelled' : 'marketing',
              quote: {}, contract: {}, rental: {}, vehicles: [], driver: {}, expenses: [], timeline: []
            };
            O.push(d, 'تسجيل تواصل جديد — ' + v.negotiationStatus);
            VH.store.save('deals', d);
            VH.store.saveSettings({ dealSeq: (VH.num(VH.store.settings().dealSeq) || 1) + 1 });
            VH.store.log('عميل جديد', d.code + ' — ' + d.orgName + ' / ' + d.clientName, d.id);
            close();
            VH.toast('سُجّل العميل ' + d.code, 'ok');
            if (after) after(); else location.hash = '#/o/deal/' + d.id;
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  O.editContact = function (d, after) {
    var staff = VH.store.staff();
    var fields = [
      { name: 'code', label: 'رقم العميل', value: d.code, required: true },
      { name: 'contactDate', label: 'تاريخ التواصل', type: 'date', value: d.contactDate || d.negotiationDate, required: true },
      { name: 'dayName', label: 'اليوم', type: 'static', value: VH.dayName(d.contactDate || d.negotiationDate) },
      { name: 'orgName', label: 'اسم الجهة', value: d.orgName, required: true },
      { name: 'clientName', label: 'اسم العميل (الشخص)', value: d.clientName, required: true },
      { name: 'clientPhone', label: 'رقم الجوال', type: 'tel', value: d.clientPhone, required: true },
      { name: 'clientEmail', label: 'الإيميل', type: 'email', value: d.clientEmail },
      {
        name: 'negotiationStatus', label: 'الحالة', type: 'select', required: true,
        options: VH.DEAL_STATUS.map(function (s) { return { v: s, t: s }; }), value: d.negotiationStatus
      },
      { name: 'owner', label: 'الموظف المسؤول', type: 'select', required: true, options: staff.map(function (s) { return { v: s.id, t: s.name }; }), value: d.owner },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: d.notes }
    ];
    VH.modal({
      title: 'تعديل بيانات التواصل', body: VH.form.render(fields),
      onOpen: function (bd) {
        bd.querySelector('[data-f=contactDate]').addEventListener('change', function (e) {
          bd.querySelector('[data-f=dayName]').value = VH.dayName(e.target.value);
        });
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            var was = d.negotiationStatus;
            Object.assign(d, {
              code: v.code, orgName: v.orgName, clientName: v.clientName, clientPhone: v.clientPhone,
              clientEmail: v.clientEmail, contactDate: v.contactDate, negotiationDate: v.contactDate,
              negotiationStatus: v.negotiationStatus, owner: v.owner, notes: v.notes
            });
            if (v.negotiationStatus === 'ملغي') { d.stage = 'cancelled'; d.cancelReason = d.cancelReason || 'أُلغي في مرحلة التسويق'; }
            O.push(d, 'تعديل بيانات التواصل' + (was !== v.negotiationStatus ? ' — الحالة: ' + v.negotiationStatus : ''));
            VH.store.save('deals', d);
            close(); VH.toast('حُفظ', 'ok'); if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ② عرض السعر — إصداره يحوّل الحالة تلقائياً إلى «تم إرسال طلب السعر»
     ===================================================================== */
  /**
   * يحسب بنود عرض السعر (أنواع متعددة، كل نوع بعدده وسعره وخيار السائق)
   * items: [{carType, carsCount, withDriver, pricePerCarPerDay}]
   * يعيد: البنود مع dailyTotal/total لكل بند + المجاميع + الضريبة 15% + الإجمالي النهائي
   */
  O.calcQuote = function (items, days, rate) {
    days = VH.num(days) || 0; rate = VH.num(rate) || 15;
    var dailyAll = 0, subtotal = 0, cars = 0;
    var out = (items || []).map(function (it) {
      var n = VH.num(it.carsCount) || 0, p = VH.num(it.pricePerCarPerDay) || 0;
      var daily = VH.round2(p * n), total = VH.round2(daily * days);
      dailyAll += daily; subtotal += total; cars += n;
      return Object.assign({}, it, { carsCount: n, pricePerCarPerDay: p, dailyTotal: daily, total: total, perCarTotal: VH.round2(p * days) });
    });
    dailyAll = VH.round2(dailyAll); subtotal = VH.round2(subtotal);
    var vat = VH.round2(subtotal * rate / 100);
    return {
      items: out, days: days, carsCount: cars, dailyAll: dailyAll, subtotal: subtotal,
      vatRate: rate, vat: vat, grandTotal: VH.round2(subtotal + vat),
      carType: out.map(function (i) { return i.carType + (i.carsCount > 1 ? ' ×' + i.carsCount : ''); }).join('، '),
      withDriver: out.every(function (i) { return i.withDriver === 'بسائق'; }) ? 'بسائق'
        : out.every(function (i) { return i.withDriver === 'بدون سائق'; }) ? 'بدون سائق' : 'بعضها بسائق'
    };
  };

  /** جدول بنود عرض السعر للعرض والطباعة */
  O.quoteItemsTable = function (q, forPrint) {
    var items = q.items || [];
    if (!items.length) return '';
    var cls = forPrint ? '' : ' class="tbl"';
    return '<div class="' + (forPrint ? '' : 'tbl-wrap') + '"><table' + cls + ' style="width:100%;min-width:600px"><thead><tr>' +
      '<th>نوع السيارة</th><th>العدد</th><th>السائق</th><th>قيمة السيارة/اليوم</th><th>إجمالي السيارة الواحدة</th>' +
      '<th>اليومي للنوع</th><th>إجمالي النوع</th></tr></thead><tbody>' +
      items.map(function (i) {
        return '<tr><td>' + VH.esc(i.carType) + '</td><td class="num">' + i.carsCount + '</td><td>' + VH.esc(i.withDriver) + '</td>' +
          '<td class="num">' + VH.fmt(i.pricePerCarPerDay) + '</td><td class="num">' + VH.fmt(i.perCarTotal) + '</td>' +
          '<td class="num">' + VH.fmt(i.dailyTotal) + '</td><td class="num"><b>' + VH.fmt(i.total) + '</b></td></tr>';
      }).join('') +
      '</tbody><tfoot style="background:' + (forPrint ? '#F0EDE4' : 'var(--vh-surface-2)') + '">' +
      '<tr><th colspan="5">القيمة اليومية لمجموع السيارات (' + q.carsCount + ' سيارة)</th><th class="num" colspan="2">' + VH.fmt(q.dailyAll) + ' ر.س</th></tr>' +
      '<tr><th colspan="5">الإجمالي لمجموع السيارات × ' + q.days + ' يوم — قبل الضريبة</th><th class="num" colspan="2">' + VH.fmt(q.subtotal) + ' ر.س</th></tr>' +
      '<tr><th colspan="5">ضريبة القيمة المضافة ' + VH.fmt(q.vatRate) + '%</th><th class="num" colspan="2">' + VH.fmt(q.vat) + ' ر.س</th></tr>' +
      '<tr style="font-size:1.05em"><th colspan="5">الإجمالي النهائي شامل الضريبة</th><th class="num" colspan="2"><b>' + VH.fmt(q.grandTotal) + ' ر.س</b></th></tr>' +
      '</tfoot></table></div>';
  };

  O.quoteModal = function (d, after) {
    var q = d.quote || {};
    var rate = VH.num(VH.store.settings().vatRate) || 15;
    var items = (q.items && q.items.length) ? q.items.map(function (i) { return Object.assign({}, i); })
      : [{ carType: q.carType || CARS[0], carsCount: q.carsCount || 1, withDriver: q.withDriver || 'بسائق', pricePerCarPerDay: q.pricePerCarPerDay || '' }];

    var fields = [
      { name: 'orgName', label: 'اسم الجهة', value: q.orgName || d.orgName, required: true },
      { name: 'city', label: 'مدينة المشروع', type: 'select', required: true, options: REGIONS.map(function (x) { return { v: x, t: x }; }), value: q.city },
      { name: 'startDate', label: 'فترة المشروع — من', type: 'date', required: true, value: q.startDate },
      { name: 'endDate', label: 'فترة المشروع — إلى', type: 'date', required: true, value: q.endDate },
      { name: 'days', label: 'عدد الأيام', type: 'number', value: q.days, readonly: true, hint: 'يُحسب تلقائياً' },
      {
        name: '_items', type: 'html', full: true,
        html: '<label style="font-size:.82rem;font-weight:600;color:var(--vh-navy)">أنواع السيارات <span class="req">*</span> ' +
          '<span class="hint" style="font-weight:400">— نوع في كل سطر، ولكل نوع عدده وسعره وخيار السائق</span></label>' +
          '<div id="qItemsBox"></div>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-add-item style="margin-top:10px">+ إضافة نوع سيارة</button>'
      },
      {
        name: '_sum', type: 'html', full: true,
        html: '<div id="qSum" class="strip strip--info" style="margin:0;display:grid;gap:4px"></div>'
      },
      { name: 'notes', label: 'ملاحظات عرض السعر', type: 'textarea', full: true, rows: 2, value: q.notes }
    ];

    function rowHtml(it, i) {
      var opts = CARS.map(function (c) { return '<option' + (c === it.carType ? ' selected' : '') + '>' + VH.esc(c) + '</option>'; }).join('');
      var isOther = CARS.indexOf(it.carType) < 0 && it.carType;
      if (isOther) opts = opts.replace('<option>أخرى</option>', '<option selected>أخرى</option>');
      return '<tr data-i="' + i + '">' +
        '<td><select class="qin" data-k="carType">' + opts + '</select>' +
        '<input class="qin" data-k="carTypeOther" placeholder="اكتبي النوع" value="' + VH.esc(isOther ? it.carType : (it.carTypeOther || '')) + '" style="margin-top:6px"' + (it.carType === 'أخرى' || isOther ? '' : ' hidden') + '></td>' +
        '<td><input class="qin" type="number" min="1" step="1" dir="ltr" data-k="carsCount" value="' + VH.esc(it.carsCount || 1) + '"></td>' +
        '<td><select class="qin" data-k="withDriver"><option' + (it.withDriver !== 'بدون سائق' ? ' selected' : '') + '>بسائق</option><option' + (it.withDriver === 'بدون سائق' ? ' selected' : '') + '>بدون سائق</option></select></td>' +
        '<td><input class="qin" type="number" min="0" step="0.01" dir="ltr" data-k="pricePerCarPerDay" value="' + VH.esc(it.pricePerCarPerDay || '') + '"></td>' +
        '<td class="n" data-percar>—</td><td class="n" data-daily>—</td><td class="n" data-total>—</td>' +
        '<td><button type="button" class="btn btn--sm btn--danger" data-del-item title="حذف">×</button></td></tr>';
    }
    function renderItems(bd) {
      bd.querySelector('#qItemsBox').innerHTML =
        '<div class="tbl-wrap"><table class="tbl" style="min-width:820px"><thead><tr>' +
        '<th>نوع السيارة</th><th style="width:80px">العدد</th><th style="width:130px">السائق</th><th style="width:130px">قيمة السيارة/اليوم</th>' +
        '<th style="width:110px">إجمالي السيارة</th><th style="width:110px">اليومي للنوع</th><th style="width:120px">إجمالي النوع</th><th style="width:44px"></th>' +
        '</tr></thead><tbody>' + items.map(rowHtml).join('') + '</tbody></table></div>';
      recalc(bd);
    }
    function readItems(bd) {
      return [].slice.call(bd.querySelectorAll('#qItemsBox tbody tr')).map(function (tr) {
        var g = function (k) { var e = tr.querySelector('[data-k=' + k + ']'); return e ? e.value : ''; };
        var type = g('carType');
        if (type === 'أخرى' && g('carTypeOther').trim()) type = g('carTypeOther').trim();
        return { carType: type, carTypeOther: g('carTypeOther').trim(), carsCount: VH.num(g('carsCount')), withDriver: g('withDriver'), pricePerCarPerDay: VH.num(g('pricePerCarPerDay')) };
      });
    }
    function recalc(bd) {
      var v = VH.form.read(bd);
      var days = (v.startDate && v.endDate) ? VH.daysBetween(v.startDate, v.endDate) : 0;
      bd.querySelector('[data-f=days]').value = days || '';
      var c = O.calcQuote(readItems(bd), days, rate);
      bd.querySelectorAll('#qItemsBox tbody tr').forEach(function (tr, i) {
        var it = c.items[i] || {};
        tr.querySelector('[data-percar]').textContent = VH.fmt(it.perCarTotal || 0);
        tr.querySelector('[data-daily]').textContent = VH.fmt(it.dailyTotal || 0);
        tr.querySelector('[data-total]').textContent = VH.fmt(it.total || 0);
      });
      bd.querySelector('#qSum').innerHTML =
        '<div><span class="small muted">القيمة اليومية لمجموع السيارات (' + c.carsCount + ' سيارة):</span> <b class="num">' + VH.fmt(c.dailyAll) + '</b> ر.س' +
        ' &nbsp;·&nbsp; <span class="small muted">الإجمالي قبل الضريبة (' + days + ' يوم):</span> <b class="num">' + VH.fmt(c.subtotal) + '</b> ر.س' +
        ' &nbsp;·&nbsp; <span class="small muted">ضريبة ' + rate + '%:</span> <b class="num">' + VH.fmt(c.vat) + '</b> ر.س</div>' +
        '<div style="font-size:1.05rem"><b>الإجمالي النهائي شامل الضريبة: <span class="num">' + VH.fmt(c.grandTotal) + '</span> ر.س</b></div>';
    }

    VH.modal({
      title: 'عرض السعر — ' + VH.esc(d.code),
      wide: true,
      body: VH.form.render(fields),
      onOpen: function (bd) {
        renderItems(bd);
        bd.addEventListener('input', function () { recalc(bd); });
        bd.addEventListener('change', function (e) {
          var sel = e.target.closest('[data-k=carType]');
          if (sel) { var o = sel.closest('tr').querySelector('[data-k=carTypeOther]'); o.hidden = sel.value !== 'أخرى'; }
          recalc(bd);
        });
        bd.addEventListener('click', function (e) {
          if (e.target.closest('[data-add-item]')) {
            items = readItems(bd); items.push({ carType: CARS[0], carsCount: 1, withDriver: 'بسائق', pricePerCarPerDay: '' });
            renderItems(bd);
          }
          var del = e.target.closest('[data-del-item]');
          if (del) {
            items = readItems(bd);
            if (items.length <= 1) { VH.toast('لا بد من نوع سيارة واحد على الأقل', 'warn'); return; }
            items.splice(+del.closest('tr').getAttribute('data-i'), 1);
            renderItems(bd);
          }
        });
      },
      actions: [
        {
          label: q.sentAt ? 'حفظ التعديل' : 'إصدار وإرسال عرض السعر', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.endDate < v.startDate) { VH.form.error(bd, 'تاريخ النهاية قبل تاريخ البداية'); return; }
            var list = readItems(bd);
            var bad = list.filter(function (i) { return !i.carType || i.carsCount < 1 || i.pricePerCarPerDay <= 0; });
            if (bad.length) { VH.form.error(bd, 'أكملي كل سطر: نوع السيارة وعدد ≥ 1 وقيمة اليوم أكبر من صفر'); return; }
            var days = VH.daysBetween(v.startDate, v.endDate);
            var c = O.calcQuote(list, days, rate);
            d.quote = Object.assign(c, {
              orgName: v.orgName, city: v.city, startDate: v.startDate, endDate: v.endDate,
              total: c.grandTotal, priceVatIncluded: 'yes', notes: v.notes,
              sentAt: d.quote && d.quote.sentAt ? d.quote.sentAt : VH.stamp(),
              sentBy: (VH.auth.user() || {}).name
            });
            var first = false;
            if (d.stage === 'marketing' || O.idx(d.stage) < 1) {
              d.stage = 'quote'; d.negotiationStatus = 'تم إرسال طلب السعر'; first = true;
            }
            // عرض السعر ينعكس على العقد تلقائياً ما دام العقد لم يُعدَّل يدوياً
            var synced = false;
            if (d.contract && d.contract.fromQuote && d.contract.price && !d.contract.manualEdit) {
              d.contract = O.contractFromQuote(d.quote, d.contract); synced = true;
            }
            O.push(d, first ? 'أُصدر عرض السعر وأُرسل — ' + VH.moneyTxt(c.grandTotal) + ' شامل الضريبة'
              : 'تعديل عرض السعر' + (synced ? ' — وانعكس على بيانات العقد' : ''));
            VH.store.save('deals', d);
            VH.store.log('عرض سعر', d.code + ' — ' + c.carsCount + ' سيارة (' + c.carType + ') × ' + days + ' يوم = ' + VH.moneyTxt(c.grandTotal), d.id);
            close();
            VH.toast(first ? 'تم إرسال طلب السعر — تغيّرت الحالة تلقائياً' : 'حُفظ عرض السعر', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /** الاتفاق على عرض السعر → تُنسخ مدخلاته في بيانات العقد وتنتقل لمكتب الإيجار */
  /** بيانات العقد مشتقّة من عرض السعر (تبقى متزامنة ما لم تُعدَّل يدوياً) */
  O.contractFromQuote = function (q, base) {
    return Object.assign({}, base || {}, {
      items: (q.items || []).map(function (i) { return Object.assign({}, i); }),
      carType: q.carType, carsCount: q.carsCount, region: q.city, withDriver: q.withDriver,
      startDate: q.startDate, endDate: q.endDate, days: q.days,
      pricePerCarPerDay: q.items && q.items.length === 1 ? q.items[0].pricePerCarPerDay : q.pricePerCarPerDay,
      dailyAll: q.dailyAll, subtotal: q.subtotal, vat: q.vat,
      price: q.grandTotal || q.total, priceVatIncluded: 'yes', fromQuote: true, manualEdit: false
    });
  };

  O.acceptQuote = function (d, after) {
    var q = d.quote || {};
    if (!q.total) { VH.toast('أصدري عرض السعر أولاً', 'warn'); return; }
    VH.confirm('تأكيد الاتفاق على عرض السعر',
      'ستُنقل مدخلات عرض السعر تلقائياً إلى بيانات العقد، وتنتقل الصفقة إلى «التفاوض مع مكتب الإيجار».',
      'تم الاتفاق', function () {
        d.contract = O.contractFromQuote(q, d.contract);
        d.negotiationStatus = 'تم الاتفاق';
        if (O.idx(d.stage) < 2) d.stage = 'office';
        O.push(d, 'تم الاتفاق على عرض السعر — نُقلت المدخلات إلى بيانات العقد');
        VH.store.save('deals', d);
        VH.store.log('اتفاق', d.code + ' — ' + VH.moneyTxt(q.total), d.id);
        VH.toast('تم الاتفاق — بيانات العقد جاهزة', 'ok');
        if (after) after();
      });
  };

  /* =====================================================================
     ③ بيانات العقد (منقولة من عرض السعر وقابلة للتعديل)
     ===================================================================== */
  O.contractModal = function (d, after) {
    var c = d.contract || {};
    var multi = !!(c.items && c.items.length);
    var fields = [
      multi
        ? { name: 'carType', label: 'أنواع السيارات (من عرض السعر)', type: 'static', value: c.carType }
        : { name: 'carType', label: 'نوع السيارة', type: 'select', required: true, options: CARS.map(function (x) { return { v: x, t: x }; }), value: c.carType },
      { name: 'carsCount', label: 'عدد السيارات', type: 'number', step: '1', min: '1', required: true, value: c.carsCount || 1, readonly: multi, hint: multi ? 'لتغيير الأنواع والأعداد عدّلي عرض السعر' : '' },
      { name: 'region', label: 'المنطقة', type: 'select', required: true, options: REGIONS.map(function (x) { return { v: x, t: x }; }), value: c.region },
      {
        name: 'withDriver', label: 'بسائق / بدون سائق', type: 'select',
        options: [{ v: 'بسائق', t: 'بسائق' }, { v: 'بدون سائق', t: 'بدون سائق' }], value: c.withDriver || 'بسائق'
      },
      { name: 'startDate', label: 'بداية الخدمة', type: 'date', required: true, value: c.startDate },
      { name: 'endDate', label: 'نهاية الخدمة', type: 'date', required: true, value: c.endDate },
      { name: 'days', label: 'عدد الأيام', type: 'number', value: c.days, readonly: true, hint: 'يُحسب تلقائياً شاملاً يومي البداية والنهاية' },
      { name: 'pricePerCarPerDay', label: 'قيمة السيارة لليوم', type: 'number', value: c.pricePerCarPerDay },
      { name: 'price', label: 'السعر الإجمالي للعميل', type: 'number', required: true, value: c.price },
      {
        name: 'priceVatIncluded', label: 'هل السعر شامل الضريبة؟', type: 'select',
        options: [{ v: 'yes', t: 'نعم — شامل الضريبة' }, { v: 'no', t: 'لا — يُضاف عليه 15%' }],
        value: c.priceVatIncluded || 'yes'
      }
    ];
    VH.modal({
      title: 'بيانات العقد — ' + VH.esc(d.code),
      wide: true,
      body: (c.fromQuote ? '<div class="strip strip--info" style="margin:0 0 14px"><span class="strip__ico">↺</span>' +
        '<div><b>هذه البيانات منقولة تلقائياً من عرض السعر</b><small>أي تعديل هنا لا يغيّر عرض السعر المُرسل للعميل</small></div></div>' : '') +
        VH.form.render(fields),
      onOpen: function (bd) {
        function sync() {
          var v = VH.form.read(bd);
          var days = (v.startDate && v.endDate) ? VH.daysBetween(v.startDate, v.endDate) : 0;
          bd.querySelector('[data-f=days]').value = days || '';
        }
        bd.querySelector('[data-f=startDate]').addEventListener('change', sync);
        bd.querySelector('[data-f=endDate]').addEventListener('change', sync);
        sync();
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.endDate < v.startDate) { VH.form.error(bd, 'تاريخ النهاية قبل تاريخ البداية'); return; }
            if (!VH.num(v.price)) { VH.form.error(bd, 'أدخلي سعراً صحيحاً'); return; }
            d.contract = Object.assign({}, d.contract || {}, {
              carType: multi ? c.carType : v.carType, carsCount: multi ? c.carsCount : (VH.num(v.carsCount) || 1),
              region: v.region, withDriver: v.withDriver, manualEdit: true,
              startDate: v.startDate, endDate: v.endDate, days: VH.daysBetween(v.startDate, v.endDate),
              pricePerCarPerDay: VH.num(v.pricePerCarPerDay), price: VH.num(v.price),
              priceVatIncluded: v.priceVatIncluded
            });
            var moved = false;
            if (O.idx(d.stage) < 2 && d.stage !== 'cancelled') { d.stage = 'office'; d.negotiationStatus = 'تم الاتفاق'; moved = true; }
            O.push(d, moved ? 'حُفظ العقد — انتقلت للتفاوض مع مكتب الإيجار' : 'تعديل بيانات العقد');
            VH.store.save('deals', d);
            VH.store.log('بيانات العقد', d.code + ' — ' + d.contract.carType + ' / ' + d.contract.region, d.id);
            close(); VH.toast(moved ? 'تم — الصفقة الآن مع مكتب الإيجار' : 'حُفظت بيانات العقد', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ④ مكتب الإيجار — مع لوحة السيارة وصورة العقد الإلزامية
     ===================================================================== */
  /** سيارة لكل سطر من بنود العقد (النوع + بسائق/بدون) */
  O.expandCars = function (d) {
    var c = d.contract || {}, out = [];
    var items = (c.items && c.items.length) ? c.items
      : [{ carType: c.carType || '', carsCount: c.carsCount || 1, withDriver: c.withDriver || 'بسائق' }];
    items.forEach(function (it) {
      for (var i = 0; i < (VH.num(it.carsCount) || 1); i++) out.push({ carType: it.carType, withDriver: it.withDriver || 'بسائق' });
    });
    return out;
  };

  O.officeModal = function (d, after) {
    var r = d.rental || {}, days = VH.num((d.contract || {}).days) || 0;
    var img = r.contractImage || '';
    // سطر مستقل لكل سيارة: من التعاقد المحفوظ أو مولَّد من بنود العقد
    var cars = (r.cars && r.cars.length) ? r.cars.map(function (x) { return Object.assign({}, x); })
      : O.expandCars(d).map(function (x) {
        return { id: VH.uid('car'), carType: x.carType, withDriver: x.withDriver, officeName: r.officeName || '', officePhone: r.officePhone || '', plate: '', rentPerDay: r.rentPerDay || '' };
      });

    var fields = [
      { name: 'days', label: 'مدة الإيجار', type: 'static', value: days + ' يوم (' + VH.esc((d.contract || {}).startDate || '') + ' → ' + VH.esc((d.contract || {}).endDate || '') + ')' },
      {
        name: 'status', label: 'حالة الاتفاق مع المكتب', type: 'select', required: true,
        options: [{ v: 'جارٍ التفاوض', t: 'جارٍ التفاوض' }, { v: 'تم التعاقد', t: 'تم التعاقد' }],
        value: r.status || 'جارٍ التفاوض'
      },
      {
        name: '_cars', type: 'html', full: true,
        html: '<label style="font-size:.82rem;font-weight:600;color:var(--vh-navy)">بيانات كل سيارة على حدة <span class="req">*</span> ' +
          '<span class="hint" style="font-weight:400">— ' + cars.length + ' سيارة حسب العقد، ولكل سيارة مكتبها ولوحتها وإيجارها</span></label>' +
          '<div id="rCarsBox"></div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn--sm btn--ghost" data-copy-first>نسخ المكتب والإيجار من السطر الأول للكل</button>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-add-car>+ إضافة سيارة</button></div>'
      },
      {
        name: '_img', type: 'html', full: true,
        html: '<label>صورة العقد <span class="req">*</span> <span class="hint">(إلزامية عند «تم التعاقد»)</span></label>' +
          '<input type="file" id="cImg" accept="image/*" capture="environment">' +
          '<div id="cImgBox" style="margin-top:10px">' +
          (img ? '<img src="' + img + '" alt="صورة العقد" style="max-height:150px;border-radius:10px;border:1px solid var(--vh-border)">' +
            '<div class="small muted">صورة محفوظة — اختاري ملفاً جديداً لاستبدالها</div>' : '<span class="small muted">لم تُرفق صورة بعد</span>') +
          '</div>'
      },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: r.notes }
    ];
    VH.modal({
      title: 'التفاوض مع مكتب الإيجار — ' + VH.esc(d.code),
      wide: true,
      body: VH.form.render(fields),
      onOpen: function (bd) {
        function opts(sel) {
          var list = CARS.slice(); if (sel && list.indexOf(sel) < 0) list.unshift(sel);
          return list.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + VH.esc(c) + '</option>'; }).join('');
        }
        function rowHtml(x, i) {
          return '<tr data-i="' + i + '" data-id="' + VH.esc(x.id) + '">' +
            '<td><select class="qin" data-k="carType">' + opts(x.carType) + '</select></td>' +
            '<td><select class="qin" data-k="withDriver"><option' + (x.withDriver !== 'بدون سائق' ? ' selected' : '') + '>بسائق</option><option' + (x.withDriver === 'بدون سائق' ? ' selected' : '') + '>بدون سائق</option></select></td>' +
            '<td><input class="qin" data-k="officeName" value="' + VH.esc(x.officeName || '') + '" placeholder="اسم المكتب"></td>' +
            '<td><input class="qin" data-k="officePhone" dir="ltr" inputmode="tel" value="' + VH.esc(x.officePhone || '') + '" placeholder="05…"></td>' +
            '<td><input class="qin" data-k="plate" value="' + VH.esc(x.plate || '') + '" placeholder="أ ب ج 1234"></td>' +
            '<td><input class="qin" type="number" min="0" step="0.01" dir="ltr" data-k="rentPerDay" value="' + VH.esc(x.rentPerDay || '') + '"></td>' +
            '<td class="n" data-rt>—</td>' +
            '<td><button type="button" class="btn btn--sm btn--danger" data-del-car title="حذف">×</button></td></tr>';
        }
        function render() {
          bd.querySelector('#rCarsBox').innerHTML =
            '<div class="tbl-wrap"><table class="tbl" style="min-width:900px"><thead><tr>' +
            '<th>نوع السيارة</th><th style="width:110px">السائق</th><th>مكتب الإيجار</th><th style="width:130px">جوال المكتب</th>' +
            '<th style="width:130px">لوحة السيارة</th><th style="width:120px">إيجار اليوم</th><th style="width:110px">الإجمالي (' + days + ' يوم)</th><th style="width:44px"></th>' +
            '</tr></thead><tbody>' + cars.map(rowHtml).join('') + '</tbody>' +
            '<tfoot><tr><th colspan="6">إجمالي الإيجار لكل السيارات</th><th class="n" id="rSum" colspan="2">—</th></tr></tfoot></table></div>';
          recalc();
        }
        function read() {
          return [].slice.call(bd.querySelectorAll('#rCarsBox tbody tr')).map(function (tr) {
            var g = function (k) { var e = tr.querySelector('[data-k=' + k + ']'); return e ? e.value.trim() : ''; };
            return { id: tr.getAttribute('data-id') || VH.uid('car'), carType: g('carType'), withDriver: g('withDriver'), officeName: g('officeName'), officePhone: g('officePhone'), plate: g('plate'), rentPerDay: VH.num(g('rentPerDay')) };
          });
        }
        function recalc() {
          var sum = 0;
          bd.querySelectorAll('#rCarsBox tbody tr').forEach(function (tr) {
            var t = VH.round2(VH.num(tr.querySelector('[data-k=rentPerDay]').value) * days);
            tr.querySelector('[data-rt]').textContent = VH.fmt(t); sum += t;
          });
          var s = bd.querySelector('#rSum'); if (s) s.textContent = VH.fmt(sum) + ' ر.س';
        }
        bd._readCars = read;
        render();
        bd.addEventListener('input', recalc);
        bd.addEventListener('click', function (e) {
          if (e.target.closest('[data-add-car]')) {
            cars = read(); cars.push({ id: VH.uid('car'), carType: cars[0] ? cars[0].carType : CARS[0], withDriver: 'بسائق', officeName: cars[0] ? cars[0].officeName : '', officePhone: cars[0] ? cars[0].officePhone : '', plate: '', rentPerDay: cars[0] ? cars[0].rentPerDay : '' });
            render();
          }
          if (e.target.closest('[data-copy-first]')) {
            cars = read(); var f = cars[0]; if (!f) return;
            cars.forEach(function (x, i) { if (i) { x.officeName = f.officeName; x.officePhone = f.officePhone; x.rentPerDay = f.rentPerDay; } });
            render(); VH.toast('نُسخت بيانات المكتب والإيجار لكل السيارات', 'ok');
          }
          var del = e.target.closest('[data-del-car]');
          if (del) {
            cars = read();
            if (cars.length <= 1) { VH.toast('لا بد من سيارة واحدة على الأقل', 'warn'); return; }
            cars.splice(+del.closest('tr').getAttribute('data-i'), 1); render();
          }
        });
        bd.querySelector('#cImg').addEventListener('change', function (e) {
          var f = e.target.files[0]; if (!f) return;
          var box = bd.querySelector('#cImgBox');
          box.innerHTML = '<span class="small muted">جارٍ معالجة الصورة…</span>';
          VH.readImage(f).then(function (out) {
            img = out.dataUrl;
            box.innerHTML = '<img src="' + img + '" alt="صورة العقد" style="max-height:150px;border-radius:10px;border:1px solid var(--vh-border)">' +
              '<div class="small muted">تم — ' + out.w + '×' + out.h + ' · ' + out.kb + ' كيلوبايت</div>';
          }).catch(function (ex) { box.innerHTML = '<span class="small" style="color:var(--bad)">' + VH.esc(ex.message) + '</span>'; });
        });
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            var list = bd._readCars();
            var contracted = v.status === 'تم التعاقد';
            if (list.some(function (x) { return !x.officeName || !(x.rentPerDay > 0); })) { VH.form.error(bd, 'أكملي لكل سيارة: اسم المكتب وإيجار اليوم'); return; }
            if (contracted && list.some(function (x) { return !x.plate; })) { VH.form.error(bd, 'أدخلي لوحة كل سيارة قبل اختيار «تم التعاقد»'); return; }
            if (contracted && !img) { VH.form.error(bd, 'إرفاق صورة العقد إلزامي عند اختيار «تم التعاقد»'); return; }
            list.forEach(function (x) { x.rentTotal = VH.round2(x.rentPerDay * days); });
            var offices = list.map(function (x) { return x.officeName; }).filter(function (o, i, a) { return a.indexOf(o) === i; });
            d.rental = {
              cars: list,
              officeName: offices.join('، '), officePhone: list[0].officePhone,
              plate: list.map(function (x) { return x.plate; }).filter(Boolean).join('، '),
              rentPerDay: list[0].rentPerDay,
              rentTotal: VH.round2(list.reduce(function (a, x) { return a + x.rentTotal; }, 0)),
              status: v.status, notes: v.notes, contractImage: img,
              contractImageAt: img && img !== (r.contractImage || '') ? VH.stamp() : r.contractImageAt,
              by: (VH.auth.user() || {}).name
            };
            // بيانات السيارات تنعكس تلقائياً من التعاقد (مع الحفاظ على السائقين المعيّنين سابقاً)
            if (contracted) {
              var existing = d.vehicles || [];
              d.vehicles = list.map(function (x) {
                var old = existing.filter(function (vv) { return vv.id === x.id; })[0] || {};
                return Object.assign({}, old, { id: x.id, carType: x.carType, plate: x.plate, withDriver: x.withDriver, fromRental: true, driverName: old.driverName || '', driverId: old.driverId || '' });
              }).concat(existing.filter(function (vv) { return !vv.fromRental; }));
            }
            var moved = false;
            if (contracted && O.idx(d.stage) < 3) { d.stage = 'assigned'; moved = true; }
            O.push(d, moved ? 'تم التعاقد مع ' + offices.join('، ') + ' على ' + list.length + ' سيارة وأُرفقت صورة العقد' : 'تحديث بيانات مكتب الإيجار');
            VH.store.save('deals', d);
            VH.store.log('مكتب الإيجار', d.code + ' — ' + offices.join('، ') + ' (' + v.status + ') — ' + list.length + ' سيارة', d.id);
            close(); VH.toast(moved ? 'تم التعاقد — انتقلت المهمة لمرحلة الإسناد وانعكست السيارات على قسم بيانات السيارات' : 'حُفظ', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ⑤ إسناد المهمة لموظف
     ===================================================================== */
  O.assignModal = function (d, after) {
    var staff = VH.store.staff();
    var fields = [
      {
        name: 'assignee', label: 'الموظف المنفّذ للمهمة', type: 'select', required: true,
        options: staff.map(function (s) { return { v: s.id, t: s.name }; }), value: d.assignee || d.owner
      },
      { name: 'note', label: 'تعليمات التنفيذ', type: 'textarea', full: true, rows: 2, value: d.assignNote }
    ];
    VH.modal({
      title: 'تحويل المهمة إلى موظف — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      actions: [
        {
          label: 'تحويل المهمة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            d.assignee = v.assignee; d.assignNote = v.note;
            if (O.idx(d.stage) < 4) d.stage = 'vehicles';
            O.push(d, 'أُسندت المهمة إلى ' + VH.store.employeeName(v.assignee));
            VH.store.save('deals', d);
            VH.store.log('إسناد مهمة', d.code + ' ← ' + VH.store.employeeName(v.assignee), d.id);
            close(); VH.toast('تم التحويل إلى ' + VH.store.employeeName(v.assignee) + ' — عبّئي بيانات السيارات', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ⑥ تعبئة بيانات السيارات
     ===================================================================== */
  /** اكتملت بيانات السيارات؟ كل سيارة «بسائق» لها سائق مفوّض */
  O.vehiclesComplete = function (d) {
    var v = d.vehicles || [];
    return v.length > 0 && v.every(function (x) { return x.withDriver === 'بدون سائق' || !!x.driverName; });
  };
  O.nextAfterVehicles = function (d) {
    var needDriver = (d.vehicles || []).some(function (x) { return x.withDriver !== 'بدون سائق'; });
    d.stage = needDriver ? 'driver' : 'expenses';
    O.push(d, needDriver ? 'اكتملت بيانات السيارات — بانتظار التعاقد مع السواق'
      : 'اكتملت بيانات السيارات — كل السيارات بدون سائق، الانتقال إلى فواتير الصرف');
  };
  O.confirmVehicles = function (d, after) {
    if (!(d.vehicles || []).length) { VH.toast('لا توجد سيارات بعد', 'warn'); return; }
    if (!O.vehiclesComplete(d)) { VH.toast('عيّني سائقاً لكل سيارة «بسائق» أولاً', 'warn'); return; }
    O.nextAfterVehicles(d);
    VH.store.save('deals', d);
    VH.store.log('بيانات السيارات', d.code + ' — اكتملت (' + d.vehicles.length + ' سيارة)', d.id);
    VH.toast('اكتملت بيانات السيارات', 'ok');
    if (after) after();
  };

  O.vehicleModal = function (d, after, vid) {
    var v0 = (d.vehicles || []).filter(function (x) { return x.id === vid; })[0] || {};
    var drivers = VH.store.driverList();
    var carOpts = CARS.slice(); if (v0.carType && carOpts.indexOf(v0.carType) < 0) carOpts.unshift(v0.carType);
    var fields = [
      {
        name: 'carType', label: 'نوع السيارة', type: 'select', required: true,
        options: carOpts.map(function (x) { return { v: x, t: x }; }),
        value: v0.carType || (((d.contract || {}).items || [])[0] || {}).carType || (d.contract || {}).carType,
        hint: v0.fromRental ? 'منقول من التعاقد مع مكتب الإيجار' : ''
      },
      { name: 'plate', label: 'رقم اللوحة', required: true, value: v0.plate, hint: v0.fromRental ? 'منقول من التعاقد مع مكتب الإيجار' : 'مثال: أ ب ج 1234' },
      {
        name: 'withDriver', label: 'بسائق / بدون سائق', type: 'select',
        options: [{ v: 'بسائق', t: 'بسائق' }, { v: 'بدون سائق', t: 'بدون سائق' }], value: v0.withDriver || 'بسائق'
      },
      {
        name: 'driverName', label: 'السائق المفوّض', type: 'datalist', value: v0.driverName,
        options: drivers.map(function (x) { return { v: x.name, t: x.name + (x.phone ? ' — ' + x.phone : '') }; }),
        hint: drivers.length ? 'اختاري من السائقين المسجّلين أو اكتبي اسماً جديداً' : 'اكتبي الاسم — وسيُحفظ في قائمة السائقين'
      },
      { name: 'notes', label: 'ملاحظات', value: v0.notes, full: true }
    ];
    VH.modal({
      title: (vid ? 'بيانات السيارة' : 'إضافة سيارة') + ' — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      actions: [
        {
          label: vid ? 'حفظ' : 'إضافة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.withDriver === 'بسائق' && !v.driverName) { VH.form.error(bd, 'اختاري السائق المفوّض لهذه السيارة'); return; }
            d.vehicles = d.vehicles || [];
            var reg = VH.store.driverList().filter(function (x) { return x.name === v.driverName; })[0];
            var row = Object.assign({}, v0, {
              id: vid || VH.uid('veh'), carType: v.carType, plate: v.plate, withDriver: v.withDriver,
              driverName: v.withDriver === 'بسائق' ? v.driverName : '', driverId: reg && v.withDriver === 'بسائق' ? reg.id : '', notes: v.notes,
              by: (VH.auth.user() || {}).name, at: VH.stamp()
            });
            if (vid) d.vehicles = d.vehicles.map(function (x) { return x.id === vid ? row : x; });
            else d.vehicles.push(row);
            if (row.driverName && !reg) VH.store.upsertDriver({ name: row.driverName });
            if (O.idx(d.stage) === 4 && O.vehiclesComplete(d)) O.nextAfterVehicles(d);
            else O.push(d, (vid ? 'تحديث' : 'إضافة') + ' سيارة: ' + v.carType + ' — ' + v.plate + (row.driverName ? ' — السائق ' + row.driverName : ''));
            VH.store.save('deals', d);
            VH.store.log('بيانات السيارات', d.code + ' — ' + v.carType + ' / ' + v.plate, d.id);
            close(); VH.toast('حُفظت بيانات السيارة', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ⑦ التعاقد مع السواق
     ===================================================================== */
  O.driverModal = function (d, after) {
    var dr = d.driver || {};
    var drivers = VH.store.driverList();
    var fields = [
      {
        name: '_pick', label: 'اختيار سائق مسجّل', type: 'select',
        options: [{ v: '', t: '— سائق جديد —' }].concat(drivers.map(function (x) { return { v: x.id, t: x.name + (x.phone ? ' · ' + x.phone : '') }; })),
        value: '', hint: drivers.length ? 'اختياره يعبّئ الحقول تلقائياً' : 'لا يوجد سائقون مسجّلون بعد'
      },
      {
        name: 'nationality', label: 'الجنسية', type: 'select', required: true,
        options: NATIONALITY.map(function (x) { return { v: x, t: x }; }), value: dr.nationality || 'سعودي'
      },
      { name: 'name', label: 'اسم السائق', required: true, value: dr.name },
      { name: 'phone', label: 'رقم الجوال', type: 'tel', required: true, value: dr.phone },
      { name: 'idNo', label: 'رقم الهوية', value: dr.idNo, attrs: ' dir="ltr" inputmode="numeric"' },
      {
        name: 'dailyWage', label: 'يومية السائق', type: 'select', required: true,
        options: WAGES.map(function (w) { return { v: w, t: w + ' ر.س' }; }),
        value: String(dr.dailyWage || '200')
      },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: dr.notes }
    ];
    VH.modal({
      title: 'التعاقد مع السواق — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      onOpen: function (bd) {
        bd.querySelector('[data-f=_pick]').addEventListener('change', function (e) {
          var x = VH.store.get('drivers', e.target.value); if (!x) return;
          bd.querySelector('[data-f=name]').value = x.name || '';
          bd.querySelector('[data-f=phone]').value = x.phone || '';
          bd.querySelector('[data-f=idNo]').value = x.idNo || '';
          if (x.nationality) bd.querySelector('[data-f=nationality]').value = x.nationality;
          if (x.dailyWage && WAGES.indexOf(String(x.dailyWage)) > -1) bd.querySelector('[data-f=dailyWage]').value = String(x.dailyWage);
        });
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.phone && !VH.telOk(v.phone)) { VH.form.error(bd, 'رقم الجوال غير صحيح (مثال: 0512345678)'); return; }
            d.driver = {
              nationality: v.nationality, name: v.name, phone: v.phone, idNo: v.idNo,
              dailyWage: VH.num(v.dailyWage), notes: v.notes, by: (VH.auth.user() || {}).name
            };
            VH.store.upsertDriver(d.driver);   // يدخل تلقائياً في قائمة السائقين
            var moved = false;
            if (O.idx(d.stage) < 6) { d.stage = 'expenses'; moved = true; }
            O.push(d, 'تم التعاقد مع السائق ' + v.name + ' (' + v.nationality + ' · يومية ' + v.dailyWage + ')');
            VH.store.save('deals', d);
            VH.store.log('تعاقد سواق', d.code + ' — ' + v.name, d.id);
            close(); VH.toast(moved ? 'تم — ارفعي الآن فواتير الصرف' : 'حُفظت بيانات السائق', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     ⑧ فواتير الصرف
     ===================================================================== */
  O.expenseModal = function (d, after, presetKind) {
    var days = VH.num((d.contract || {}).days) || 0, wage = VH.num((d.driver || {}).dailyWage) || 0;
    var fields = [
      { name: 'kind', label: 'نوع المصروف', type: 'select', required: true, options: KINDS.map(function (k) { return { v: k, t: k }; }), value: presetKind || 'بنزين' },
      { name: 'note', label: 'الوصف (مطلوب مع «أخرى»)', value: presetKind === 'يومية السواق' ? 'يومية السواق ' + days + ' يوم × ' + wage : '' },
      { name: 'amount', label: 'القيمة', type: 'number', required: true, value: presetKind === 'يومية السواق' ? VH.round2(wage * days) : '' },
      { name: 'date', label: 'التاريخ', type: 'date', value: VH.today(), required: true }
    ];
    VH.modal({
      title: 'إضافة فاتورة صرف — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      actions: [
        {
          label: 'إضافة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.kind === 'أخرى' && !v.note) { VH.form.error(bd, 'اكتبي وصف المصروف'); return; }
            if (!VH.num(v.amount)) { VH.form.error(bd, 'أدخلي قيمة أكبر من صفر'); return; }
            d.expenses = d.expenses || [];
            d.expenses.push({
              id: VH.uid('exp'), kind: v.kind, note: v.note, amount: VH.num(v.amount), date: v.date,
              by: (VH.auth.user() || {}).name, at: VH.stamp()
            });
            O.push(d, 'أُضيف مصروف: ' + v.kind + ' — ' + VH.moneyTxt(v.amount));
            VH.store.save('deals', d);
            VH.store.log('مصروف تنفيذ', d.code + ' — ' + v.kind + ' ' + VH.moneyTxt(v.amount), d.id);
            close(); VH.toast('أُضيف المصروف', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     الإقفال والإلغاء
     ===================================================================== */
  O.closeDeal = function (d, after) {
    var t = O.calc(d);
    var exists = VH.store.list('invoices').filter(function (i) { return i.dealId === d.id; });
    var hasIn = exists.some(function (i) { return i.direction === 'in'; });
    var hasRent = exists.some(function (i) { return i.category === 'إيجار سيارة'; });
    var hasExp = exists.some(function (i) { return i.category === 'مصاريف تنفيذ'; });

    function chk(id, label, on, dis) {
      return '<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">' +
        '<input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + ' ' + (dis ? 'disabled' : '') + ' style="margin-top:5px">' +
        '<span>' + label + (dis ? ' <span class="badge b-gray">' + dis + '</span>' : '') + '</span></label>';
    }
    var body =
      '<p class="small muted" style="margin-top:0">بإقفال الصفقة تُنشأ الفواتير المحدّدة أدناه في البوابة المالية، وتظهر الصفقة في «متابعة السداد».</p>' +
      '<div style="display:grid;gap:10px">' +
      chk('mkIn', 'فاتورة عميل (وارد) — ' + VH.moneyTxt(t.revenueTotal) + ' شاملة ضريبة ' + VH.moneyTxt(t.vat), !hasIn, hasIn ? 'أُنشئت من قبل' : '') +
      chk('mkRent', 'فاتورة إيجار السيارة (منصرف) — ' + VH.moneyTxt(t.rent), !hasRent && t.rent > 0, hasRent ? 'أُنشئت من قبل' : (t.rent ? '' : 'لا يوجد إيجار مسجّل')) +
      chk('mkExp', 'فاتورة مصاريف التنفيذ (منصرف) — ' + VH.moneyTxt(t.expenses), !hasExp && t.expenses > 0, hasExp ? 'أُنشئت من قبل' : (t.expenses ? '' : 'لا توجد مصاريف')) +
      '</div>' +
      '<p class="small" style="margin-bottom:0">صافي الربح المتوقع: <b>' + VH.moneyTxt(t.profit) + '</b></p>';

    VH.modal({
      title: 'إقفال الصفقة ' + VH.esc(d.code),
      body: body,
      actions: [
        {
          label: 'إقفال وإنشاء الفواتير', cls: 'btn--gold', onClick: function (close, bd) {
            var mk = function (id) { var e = bd.querySelector('#' + id); return e && e.checked && !e.disabled; };
            var made = 0, c = d.contract || {};
            if (mk('mkIn')) {
              VH.finance.createInvoice({
                direction: 'in', party: O.party(d), partyPhone: d.clientPhone, partyType: 'عميل',
                dealId: d.id, dealCode: d.code,
                description: 'خدمة نقل — ' + (c.carType || '') + ' × ' + (c.carsCount || 1) + ' / ' + (c.region || '') +
                  ' (' + (c.days || 0) + ' يوم)',
                amountBeforeVat: t.revenueBefore, vatRate: t.rate, vatAmount: t.vat, total: t.revenueTotal,
                category: 'إيراد خدمة', status: 'unpaid', date: c.endDate || VH.today()
              }); made++;
            }
            if (mk('mkRent')) {
              var rv = VH.vat(t.rent, t.rate, true);
              VH.finance.createInvoice({
                direction: 'out', party: (d.rental || {}).officeName || 'مكتب الإيجار', partyType: 'مكتب تأجير',
                dealId: d.id, dealCode: d.code,
                description: 'إيجار ' + (c.carsCount || 1) + ' سيارة ' + (c.carType || '') + ' لمدة ' + (c.days || 0) + ' يوم',
                amountBeforeVat: rv.before, vatRate: t.rate, vatAmount: rv.vat, total: rv.total,
                category: 'إيجار سيارة', status: 'unpaid', date: c.endDate || VH.today()
              }); made++;
            }
            if (mk('mkExp')) {
              VH.finance.createInvoice({
                direction: 'out', party: 'مصاريف تشغيل — ' + d.code, partyType: 'مصاريف',
                dealId: d.id, dealCode: d.code,
                description: (d.expenses || []).map(function (e) { return e.kind + (e.note ? ' (' + e.note + ')' : '') + ' ' + VH.fmt(e.amount); }).join(' · '),
                amountBeforeVat: t.expenses, vatRate: 0, vatAmount: 0, total: t.expenses,
                category: 'مصاريف تنفيذ', status: 'paid', paidDate: VH.today(), date: VH.today()
              }); made++;
            }
            d.stage = 'done'; d.closedAt = VH.stamp();
            var plural = made === 1 ? 'فاتورة واحدة' : made === 2 ? 'فاتورتان' : made + ' فواتير';
            O.push(d, 'أُقفلت الصفقة' + (made ? ' وأُنشئت ' + plural : ''));
            VH.store.save('deals', d);
            VH.store.log('إقفال صفقة', d.code + ' — ربح ' + VH.moneyTxt(t.profit), d.id);
            close(); VH.toast('أُقفلت الصفقة' + (made ? ' وأُنشئت الفواتير' : ''), 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  O.cancelDeal = function (d, after) {
    var fields = [{ name: 'reason', label: 'سبب الإلغاء', type: 'textarea', full: true, rows: 3, required: true }];
    VH.modal({
      title: 'إلغاء الصفقة ' + VH.esc(d.code),
      body: VH.form.render(fields),
      actions: [
        {
          label: 'تأكيد الإلغاء', cls: 'btn--danger', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            d.stage = 'cancelled'; d.negotiationStatus = 'ملغي'; d.cancelReason = v.reason;
            O.push(d, 'أُلغيت الصفقة: ' + v.reason);
            VH.store.save('deals', d);
            VH.store.log('إلغاء صفقة', d.code + ' — ' + v.reason, d.id);
            close(); VH.toast('أُلغيت الصفقة', 'warn'); if (after) after();
          }
        },
        { label: 'تراجع', cls: 'btn--ghost' }
      ]
    });
  };

  O.reopen = function (d, after) {
    VH.confirm('إعادة فتح الصفقة', 'ستعود الصفقة إلى المرحلة المناسبة حسب البيانات المسجّلة.', 'إعادة الفتح', function () {
      d.stage = (d.expenses || []).length ? 'expenses'
        : (d.driver || {}).name ? 'driver'
          : (d.vehicles || []).length ? 'vehicles'
            : (d.rental || {}).status === 'تم التعاقد' ? 'assigned'
              : (d.contract || {}).price ? 'office'
                : (d.quote || {}).total ? 'quote' : 'marketing';
      if (d.negotiationStatus === 'ملغي') d.negotiationStatus = 'جاري العمل والمتابعة';
      O.push(d, 'أُعيد فتح الصفقة');
      VH.store.save('deals', d);
      VH.store.log('إعادة فتح', d.code, d.id);
      VH.toast('أُعيد فتح الصفقة', 'ok');
      if (after) after();
    });
  };

  /* =====================================================================
     العرض — لوحة العمليات (كانبان بألوان ربيعية)
     ===================================================================== */
  function dealCard(d) {
    var c = d.contract || {}, q = d.quote || {}, t = O.calc(d);
    var who = d.assignee || d.owner;
    var car = c.carType || q.carType, city = c.region || q.city;
    var cars = c.carsCount || q.carsCount;
    var s = c.startDate || q.startDate, e = c.endDate || q.endDate;
    var amount = t.revenueTotal || q.total;
    return '<button class="deal-card" data-go="' + d.id + '">' +
      '<b>' + VH.esc(d.orgName || d.clientName) + '</b>' +
      '<div class="meta"><span class="num">' + VH.esc(d.code) + '</span>' +
      (d.orgName && d.clientName ? '<span>· ' + VH.esc(d.clientName) + '</span>' : '') + '</div>' +
      (car ? '<div class="meta"><span>🚐 ' + VH.esc(car) + (cars > 1 ? ' ×' + cars : '') + '</span>' +
        (city ? '<span>· ' + VH.esc(city) + '</span>' : '') + '</div>' : '') +
      (s ? '<div class="meta"><span class="num">' + s + ' → ' + e + '</span></div>' : '') +
      (amount ? '<div class="meta"><span>💰 <span class="num">' + VH.fmt(amount) + '</span> ر.س</span></div>' : '') +
      '<span class="who">' + VH.avatar(VH.store.employeeName(who)) + VH.esc(VH.store.employeeName(who)) + '</span>' +
      '</button>';
  }

  O.board = function () {
    var f = O._bf || {};
    var all = O.filtered(f);
    // مرحلة التسويق مكانها صفحة «تسويق المبيعات» وحدها ولا تظهر في لوحة العمليات
    var cols = VH.STAGES.filter(function (s) { return s.k !== 'cancelled' && s.k !== 'marketing'; });
    var cancelled = all.filter(function (d) { return d.stage === 'cancelled'; });
    var staff = VH.store.staff();

    var html =
      '<div class="periods"><div class="periods__row">' +
      '<span class="small muted">تصفية:</span>' +
      '<button class="pbtn ' + (!f.owner ? 'is-on' : '') + '" data-ow="">كل الموظفين</button>' +
      staff.map(function (s) { return '<button class="pbtn ' + (f.owner === s.id ? 'is-on' : '') + '" data-ow="' + s.id + '">' + VH.esc(s.name) + '</button>'; }).join('') +
      '<span style="flex:1"></span>' +
      '<input type="search" id="bq" placeholder="بحث بالجهة أو العميل أو الرقم…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:220px">' +
      '</div></div>' +
      '<div class="board">' + cols.map(function (s) {
        var items = all.filter(function (d) { return (d.stage || 'marketing') === s.k; });
        return '<div class="col" style="--col-bg:' + s.bg + ';--col-dot:' + s.dot + '">' +
          '<div class="col__h"><span class="dot" style="background:' + s.dot + '"></span>' +
          '<b>' + s.t + '</b><span class="c">' + items.length + '</span></div>' +
          (items.length ? items.map(dealCard).join('') : '<p class="small muted center" style="padding:14px 0">—</p>') +
          '</div>';
      }).join('') + '</div>' +
      (cancelled.length ? '<div class="card" style="margin-top:16px"><div class="card__h"><h2>ملغية (' + cancelled.length + ')</h2></div>' +
        '<div class="grid grid--4">' + cancelled.map(dealCard).join('') + '</div></div>' : '');

    return {
      title: 'لوحة العمليات',
      sub: 'كل صفقة ومرحلتها والموظف المسؤول عنها',
      actions: '<button class="btn btn--gold" data-new-deal>+ عميل جديد</button>',
      html: html,
      mount: function (root) {
        root.querySelectorAll('[data-ow]').forEach(function (b) {
          b.addEventListener('click', function () { O._bf = Object.assign({}, O._bf, { owner: b.getAttribute('data-ow') }); VH.app.render(); });
        });
        var q = root.querySelector('#bq');
        if (q) q.addEventListener('input', VH.debounce(function () {
          O._bf = Object.assign({}, O._bf, { q: q.value }); VH.app.render();
          var n = document.getElementById('bq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        }, 350));
      }
    };
  };

  /* =====================================================================
     الطلبات الواردة من فورم الموقع → تُضاف تلقائياً كعملاء جدد
     ===================================================================== */
  O.pendingLeads = function () {
    return VH.store.list('leads').filter(function (l) { return !l.converted; });
  };
  /** يحوّل كل طلب جديد إلى عميل في مرحلة التسويق ويُدرجه في خطة سير العمل */
  O.convertLeads = function () {
    var pending = O.pendingLeads();
    if (!pending.length) return 0;
    pending.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    pending.forEach(function (l) {
      var seq = VH.num(VH.store.settings().dealSeq) || 1;
      var day = String(l.at || VH.stamp()).slice(0, 10);
      var leadCars = (l.cars && l.cars.length) ? l.cars.map(function (x) { return { carType: x.carType || '', carsCount: VH.num(x.carsCount) || 1 }; })
        : [{ carType: '', carsCount: VH.num(l.carsCount) || 1 }];
      var d = {
        code: 'C-' + (1000 + seq),
        orgName: l.orgName, clientName: l.contactName, jobTitle: l.jobTitle || '',
        clientPhone: l.phone, clientEmail: l.email,
        contactDate: day, negotiationDate: day,
        negotiationStatus: 'بداية التواصل', owner: '', assignee: '',
        stage: 'marketing', source: 'فورم الموقع', leadRef: l.ref || '',
        notes: 'طلب وارد من فورم الموقع — المدينة: ' + (l.city || '') +
          ' · السيارات: ' + leadCars.map(function (x) { return (x.carType || 'غير محدد') + ' ×' + x.carsCount; }).join('، ') +
          ' · ' + (l.withDriver || 'بسائق') +
          ' · المشروع من ' + (l.expectedStart || '؟') + ' إلى ' + (l.expectedEnd || '؟'),
        quote: {
          city: l.city || '', carsCount: leadCars.reduce(function (a, x) { return a + x.carsCount; }, 0),
          startDate: l.expectedStart || '', endDate: l.expectedEnd || '',
          withDriver: l.withDriver || 'بسائق',
          items: leadCars.map(function (x) { return { carType: x.carType || '', carsCount: x.carsCount, withDriver: l.withDriver || 'بسائق', pricePerCarPerDay: '' }; })
        },
        contract: {}, rental: {}, vehicles: [], driver: {}, expenses: [], timeline: []
      };
      d.timeline = [{ stage: 'marketing', at: l.at || VH.stamp(), by: 'فورم الموقع', note: 'وصل طلب عرض سعر من العميل عبر الفورم' }];
      VH.store.save('deals', d);
      VH.store.saveSettings({ dealSeq: seq + 1 });
      l.converted = true; l.dealId = d.id;
      VH.store.save('leads', l);
      VH.store.log('طلب وارد', d.code + ' — ' + d.orgName + ' (فورم الموقع)', d.id);
    });
    return pending.length;
  };
  O.formUrl = function () {
    return location.href.replace(/[^/]*(\?[^#]*)?(#.*)?$/, '') + 'form.html';
  };

  /* =====================================================================
     العرض — تسويق المبيعات
     ===================================================================== */
  O.marketing = function () {
    var r = VH.app.period();
    var all = VH.store.list('deals');
    var inRange = all.filter(function (d) { return VH.inRange(d.contactDate || d.negotiationDate, r); });
    var sent = inRange.filter(function (d) { return d.negotiationStatus === 'تم إرسال طلب السعر' || O.idx(d.stage) >= 1; });
    var agreed = inRange.filter(function (d) { return d.negotiationStatus === 'تم الاتفاق' || O.idx(d.stage) >= 2; });
    var lost = inRange.filter(function (d) { return d.stage === 'cancelled'; });

    var fromForm = inRange.filter(function (d) { return d.source === 'فورم الموقع'; });
    var unassigned = all.filter(function (d) { return !d.owner && d.stage !== 'cancelled'; });

    var rows = inRange.slice().sort(function (a, b) {
      return String(b.contactDate || '').localeCompare(String(a.contactDate || ''));
    }).map(function (d) {
      var wa = VH.waPhone(d.clientPhone);
      return '<tr>' +
        '<td>' + VH.esc(VH.dayName(d.contactDate || d.negotiationDate)) + '</td>' +
        '<td class="n">' + VH.dateShort(d.contactDate || d.negotiationDate) + '</td>' +
        '<td class="n">' + VH.esc(d.code) + '</td>' +
        '<td><b>' + VH.esc(d.orgName || '—') + '</b>' +
        (d.source === 'فورم الموقع' ? ' <span class="badge b-peach">من الفورم</span>' : '') + '</td>' +
        '<td>' + VH.esc(d.clientName || '—') +
        (d.jobTitle ? '<br><span class="small muted">' + VH.esc(d.jobTitle) + '</span>' : '') + '</td>' +
        '<td class="n">' + VH.esc(d.clientPhone || '—') + '</td>' +
        '<td class="n">' + VH.esc(d.clientEmail || '—') + '</td>' +
        '<td>' + VH.statusBadge(d.negotiationStatus) + '</td>' +
        '<td>' + VH.stageBadge(d.stage) + '</td>' +
        '<td>' + (d.owner ? VH.avatar(VH.store.employeeName(d.owner)) + ' ' + VH.esc(VH.store.employeeName(d.owner))
          : '<span class="badge b-red">غير مسند</span>') + '</td>' +
        '<td class="actions">' +
        (wa ? '<a class="btn btn--sm btn--teal" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">واتساب</a>' : '') +
        '<button class="btn btn--sm btn--ghost" data-go="' + d.id + '">فتح</button></td>' +
        '</tr>';
    }).join('');

    var html =
      '<div class="strip strip--info"><span class="strip__ico">🔗</span>' +
      '<div><b>رابط فورم طلب عرض السعر</b>' +
      '<small>انشريه في الموقع أو السوشيال — كل طلب يصل يُضاف تلقائياً كعميل جديد هنا وفي خطة سير العمل</small></div>' +
      '<span class="sp"></span>' +
      '<code class="small n" id="formLink" style="background:#fff;padding:6px 12px;border-radius:8px;max-width:340px;overflow:auto;white-space:nowrap">' +
      VH.esc(O.formUrl()) + '</code>' +
      '<button class="btn btn--sm btn--ghost" data-copy-form>نسخ الرابط</button>' +
      '<a class="btn btn--sm btn--navy" href="form.html" target="_blank" rel="noopener">فتح الفورم</a>' +
      '</div>' +

      (unassigned.length ? '<div class="strip strip--warn"><span class="strip__ico">!</span>' +
        '<div><b>' + unassigned.length + ' عميل بلا موظف مسؤول</b>' +
        '<small>' + unassigned.slice(0, 6).map(function (d) { return VH.esc(d.orgName || d.clientName); }).join(' · ') + '</small></div></div>' : '') +

      VH.app.periodBar() +
      '<div class="grid grid--4" style="margin-bottom:16px">' +
      VH.statCard({ count: true, title: 'عدد العملاء الذين تم التواصل معهم', value: inRange.length, cls: 'stat--navy', desc: 'خلال الفترة المختارة' }) +
      VH.statCard({ count: true, title: 'أُرسل لهم عروض الأسعار', value: sent.length, cls: 'stat--net', desc: inRange.length ? VH.fmt(sent.length / inRange.length * 100) + '% من المتواصَل معهم' : '' }) +
      VH.statCard({ count: true, title: 'تم الاتفاق معهم', value: agreed.length, cls: 'stat--in', desc: inRange.length ? 'نسبة التحويل ' + VH.fmt(agreed.length / inRange.length * 100) + '%' : '' }) +
      VH.statCard({ count: true, title: 'طلبات واردة من الفورم', value: fromForm.length, cls: 'stat--out', desc: lost.length + ' ملغية خلال الفترة' }) +
      '</div>' +
      (inRange.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>اليوم</th><th>التاريخ</th><th>رقم العميل</th><th>اسم الجهة</th><th>اسم العميل</th><th>رقم الجوال</th>' +
        '<th>الإيميل</th><th>الحالة</th><th>المرحلة</th><th>الموظف</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('📞', 'لا عملاء تم التواصل معهم في هذه الفترة', '<button class="btn btn--gold" data-new-deal>+ عميل جديد</button>'));

    return {
      title: 'تسويق المبيعات',
      sub: 'العملاء الذين تم التواصل معهم وبياناتهم',
      actions: '<button class="btn btn--ghost" data-export-mk>تصدير CSV</button>' +
        '<button class="btn btn--gold" data-new-deal>+ عميل جديد</button>',
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        var cp = root.querySelector('[data-copy-form]');
        if (cp) cp.addEventListener('click', function () {
          var url = O.formUrl();
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { VH.toast('نُسخ رابط الفورم', 'ok'); })
            .catch(function () { VH.toast(url, 'warn', 8000); });
          else VH.toast(url, 'warn', 8000);
        });
      }
    };
  };

  O.exportMarketing = function () {
    var r = VH.app.period();
    var rows = [['اليوم', 'التاريخ', 'رقم العميل', 'اسم الجهة', 'اسم العميل', 'رقم الجوال', 'الإيميل', 'الحالة', 'المرحلة', 'الموظف المسؤول']];
    VH.store.list('deals')
      .filter(function (d) { return VH.inRange(d.contactDate || d.negotiationDate, r); })
      .sort(function (a, b) { return String(a.contactDate).localeCompare(String(b.contactDate)); })
      .forEach(function (d) {
        rows.push([VH.dayName(d.contactDate || d.negotiationDate), d.contactDate || d.negotiationDate, d.code,
          d.orgName, d.clientName, d.clientPhone, d.clientEmail, d.negotiationStatus,
          VH.stage(d.stage).t, VH.store.employeeName(d.owner)]);
      });
    VH.download('via-horizon-marketing-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف التسويق', 'ok');
  };

  /* =====================================================================
     العرض — جدول الصفقات
     ===================================================================== */
  O.deals = function () {
    var f = O._df || {};
    var list = O.filtered(f);
    var staff = VH.store.staff();
    var rows = list.map(function (d) {
      var c = d.contract || {}, q = d.quote || {}, t = O.calc(d);
      var car = c.carType || q.carType, city = c.region || q.city;
      return '<tr>' +
        '<td class="n">' + VH.esc(d.code) + '</td>' +
        '<td><b>' + VH.esc(d.orgName || d.clientName) + '</b><br><span class="small muted">' + VH.esc(d.clientName || '') + ' · <span class="n">' + VH.esc(d.clientPhone || '') + '</span></span></td>' +
        '<td>' + VH.stageBadge(d.stage) + '</td>' +
        '<td>' + VH.statusBadge(d.negotiationStatus) + '</td>' +
        '<td>' + VH.esc(car || '—') + (c.carsCount > 1 || q.carsCount > 1 ? ' <span class="badge b-gray">×' + (c.carsCount || q.carsCount) + '</span>' : '') +
        '<br><span class="small muted">' + VH.esc(city || '') + '</span></td>' +
        '<td class="n">' + (c.startDate ? c.startDate + '<br>' + c.endDate : (q.startDate ? q.startDate + '<br>' + q.endDate : '—')) + '</td>' +
        '<td class="n">' + (c.days || q.days || '—') + '</td>' +
        '<td class="n">' + (t.revenueTotal ? VH.fmt(t.revenueTotal) : (q.total ? VH.fmt(q.total) : '—')) + '</td>' +
        '<td class="n">' + (t.cost ? VH.fmt(t.cost) : '—') + '</td>' +
        '<td class="n" style="color:' + (t.profit >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (t.revenueTotal ? VH.fmt(t.profit) : '—') + '</td>' +
        '<td>' + VH.avatar(VH.store.employeeName(d.assignee || d.owner)) + ' ' + VH.esc(VH.store.employeeName(d.assignee || d.owner)) + '</td>' +
        '<td class="actions"><button class="btn btn--sm btn--ghost" data-go="' + d.id + '">فتح</button></td>' +
        '</tr>';
    }).join('');

    var html =
      '<div class="periods"><div class="periods__row">' +
      '<button class="pbtn ' + (!f.stage ? 'is-on' : '') + '" data-st="">الكل</button>' +
      VH.STAGES.map(function (s) { return '<button class="pbtn ' + (f.stage === s.k ? 'is-on' : '') + '" data-st="' + s.k + '">' + s.t + '</button>'; }).join('') +
      '</div><div class="periods__row">' +
      '<button class="pbtn ' + (!f.owner ? 'is-on' : '') + '" data-ow="">كل الموظفين</button>' +
      staff.map(function (s) { return '<button class="pbtn ' + (f.owner === s.id ? 'is-on' : '') + '" data-ow="' + s.id + '">' + VH.esc(s.name) + '</button>'; }).join('') +
      '<span style="flex:1"></span>' +
      '<input type="search" id="dq" placeholder="بحث…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:200px">' +
      '</div></div>' +
      (list.length ?
        '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>رقم العميل</th><th>الجهة / العميل</th><th>المرحلة</th><th>الحالة</th><th>السيارة/المدينة</th><th>الفترة</th><th>الأيام</th>' +
        '<th>الإيراد</th><th>التكلفة</th><th>الربح</th><th>المسؤول</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('📋', 'لا توجد صفقات مطابقة', '<button class="btn btn--gold" data-new-deal>+ عميل جديد</button>'));

    return {
      title: 'الصفقات والعقود',
      sub: list.length + ' صفقة',
      actions: '<button class="btn btn--ghost" data-export-deals>تصدير CSV</button><button class="btn btn--gold" data-new-deal>+ عميل جديد</button>',
      html: html,
      mount: function (root) {
        root.querySelectorAll('[data-st]').forEach(function (b) {
          b.addEventListener('click', function () { O._df = Object.assign({}, O._df, { stage: b.getAttribute('data-st') }); VH.app.render(); });
        });
        root.querySelectorAll('[data-ow]').forEach(function (b) {
          b.addEventListener('click', function () { O._df = Object.assign({}, O._df, { owner: b.getAttribute('data-ow') }); VH.app.render(); });
        });
        var q = root.querySelector('#dq');
        if (q) q.addEventListener('input', VH.debounce(function () {
          O._df = Object.assign({}, O._df, { q: q.value }); VH.app.render();
          var n = document.getElementById('dq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        }, 350));
      }
    };
  };

  O.exportDeals = function () {
    var rows = [['رقم العميل', 'اسم الجهة', 'اسم العميل', 'الجوال', 'الإيميل', 'المرحلة', 'الحالة', 'السيارة', 'عدد السيارات',
      'المدينة', 'بسائق؟', 'بداية', 'نهاية', 'أيام', 'السعر', 'مكتب الإيجار', 'اللوحة', 'إيجار/يوم', 'إجمالي الإيجار',
      'السائق', 'جنسية السائق', 'يومية السائق', 'المصاريف', 'التكلفة', 'الربح', 'المسؤول', 'المنفّذ']];
    O.filtered({}).forEach(function (d) {
      var c = d.contract || {}, r = d.rental || {}, dr = d.driver || {}, t = O.calc(d);
      rows.push([d.code, d.orgName, d.clientName, d.clientPhone, d.clientEmail, VH.stage(d.stage).t, d.negotiationStatus,
        c.carType, c.carsCount, c.region, c.withDriver, c.startDate, c.endDate, c.days, c.price,
        r.officeName, r.plate, r.rentPerDay, r.rentTotal, dr.name, dr.nationality, dr.dailyWage,
        t.expenses, t.cost, t.profit, VH.store.employeeName(d.owner), VH.store.employeeName(d.assignee)]);
    });
    VH.download('via-horizon-deals-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف الصفقات', 'ok');
  };

  /* =====================================================================
     العرض — تفاصيل الصفقة
     ===================================================================== */
  O.deal = function (id) {
    var d = VH.store.get('deals', id);
    if (!d) return { title: 'صفقة غير موجودة', sub: '', actions: '', html: VH.empty('🔍', 'لم نجد هذه الصفقة', '<a class="btn btn--ghost" href="#/o/deals">رجوع للصفقات</a>'), mount: function () {} };

    var c = d.contract || {}, q = d.quote || {}, r = d.rental || {}, dr = d.driver || {}, t = O.calc(d);
    var i = O.idx(d.stage), cancelled = d.stage === 'cancelled', done = d.stage === 'done';
    function st(need) { return cancelled ? 'is-locked' : (i > need ? 'is-done' : i === need ? 'is-active' : 'is-locked'); }

    function card(n, title, state, badge, body, act) {
      return '<div class="stage-card ' + state + '"><div class="stage-card__h"><span class="n">' + n + '</span>' +
        '<h3>' + title + '</h3>' + (badge || '') + '<span class="sp"></span>' + (act || '') + '</div>' +
        '<div class="stage-card__b">' + body + '</div></div>';
    }
    function kv(pairs) {
      return '<div class="kv">' + pairs.map(function (p) {
        return '<div><small>' + p[0] + '</small><b>' + (p[1] === undefined || p[1] === '' || p[1] === null ? '—' : p[1]) + '</b></div>';
      }).join('') + '</div>';
    }

    /* ① تسويق المبيعات */
    var c1 = card(1, 'تسويق المبيعات', cancelled ? 'is-locked' : (i >= 1 ? 'is-done' : 'is-active'), VH.statusBadge(d.negotiationStatus),
      kv([['رقم العميل', '<span class="num">' + VH.esc(d.code) + '</span>'], ['اليوم', VH.dayName(d.contactDate || d.negotiationDate)],
      ['تاريخ التواصل', VH.dateAr(d.contactDate || d.negotiationDate)], ['اسم الجهة', VH.esc(d.orgName || '')],
      ['اسم العميل', VH.esc(d.clientName)], ['رقم الجوال', '<span class="num">' + VH.esc(d.clientPhone || '') + '</span>'],
      ['الإيميل', '<span class="num">' + VH.esc(d.clientEmail || '') + '</span>'],
      ['الموظف المسؤول', VH.esc(VH.store.employeeName(d.owner))]]) +
      (d.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(d.notes) + '</p>' : ''),
      '<button class="btn btn--sm btn--ghost" data-edit-contact>تعديل</button>');

    /* ② عرض السعر */
    var hasQ = !!q.total;
    var c2act = '<button class="btn btn--sm ' + (hasQ ? 'btn--ghost' : 'btn--gold') + '" data-quote>' + (hasQ ? 'تعديل عرض السعر' : 'إصدار عرض السعر') + '</button>' +
      (hasQ ? '<button class="btn btn--sm btn--ghost" data-print-quote>🖨</button>' : '') +
      (hasQ && i < 2 && !cancelled ? '<button class="btn btn--sm btn--gold" data-accept-quote>تم الاتفاق</button>' : '');
    var c2 = card(2, 'عرض السعر', cancelled ? 'is-locked' : (i >= 2 ? 'is-done' : (hasQ ? 'is-active' : (i === 0 ? 'is-locked' : 'is-active'))),
      hasQ ? '<span class="badge b-peach">أُرسل ' + VH.dateShort(String(q.sentAt || '').slice(0, 10)) + '</span>' : '<span class="badge b-gray">لم يُصدر بعد</span>',
      hasQ ? kv([['اسم الجهة', VH.esc(q.orgName)], ['مدينة المشروع', VH.esc(q.city)],
      ['فترة المشروع', '<span class="num">' + VH.esc(q.startDate) + ' → ' + VH.esc(q.endDate) + '</span>'],
      ['عدد الأيام', '<span class="num">' + q.days + '</span> يوم'],
      ['عدد السيارات', '<span class="num">' + q.carsCount + '</span> (' + VH.esc(q.withDriver) + ')'],
      ['الإجمالي النهائي شامل الضريبة', VH.money(q.grandTotal || q.total)]]) +
        (q.items && q.items.length ? '<div style="margin-top:14px">' + O.quoteItemsTable(q) + '</div>'
          : '<p class="small muted" style="margin:12px 0 0">' + VH.esc(q.carType || '') + ' — ' + VH.money(q.pricePerCarPerDay) + ' لليوم</p>') +
        (q.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(q.notes) + '</p>' : '')
        : '<p class="small muted" style="margin:0">عند إصدار عرض السعر تتغيّر حالة العميل تلقائياً إلى «تم إرسال طلب السعر».</p>',
      c2act);

    /* ③ بيانات العقد */
    var hasC = !!c.price;
    var c3 = card(3, 'بيانات العقد', cancelled ? 'is-locked' : (hasC ? 'is-done' : (hasQ ? 'is-active' : 'is-locked')),
      hasC ? (c.fromQuote ? '<span class="badge b-mint">منقولة من عرض السعر</span>' : '<span class="badge b-green">مكتملة</span>') : '<span class="badge b-gray">بانتظار الاتفاق</span>',
      hasC ? kv([['نوع السيارة', VH.esc(c.carType)], ['عدد السيارات', '<span class="num">' + (c.carsCount || 1) + '</span>'],
      ['المنطقة', VH.esc(c.region)], ['بسائق / بدون', VH.esc(c.withDriver || '')],
      ['بداية الخدمة', VH.dateAr(c.startDate)], ['نهاية الخدمة', VH.dateAr(c.endDate)],
      ['عدد الأيام', '<span class="num">' + c.days + '</span> يوم'],
      ['قيمة السيارة لليوم', c.items && c.items.length > 1 ? 'حسب النوع (انظري الجدول)' : VH.money(c.pricePerCarPerDay)],
      ['السعر الإجمالي', VH.money(c.price) + (c.priceVatIncluded === 'no' ? ' <span class="small muted">+ ضريبة</span>' : ' <span class="small muted">شامل الضريبة</span>')],
      ['الضريبة المستحقة', VH.money(t.vat)]]) +
      (c.items && c.items.length ? '<div style="margin-top:14px">' + O.quoteItemsTable(O.calcQuote(c.items, c.days, t.rate)) + '</div>' : '')
        : '<p class="small muted" style="margin:0">تُنقل بيانات عرض السعر هنا تلقائياً عند الضغط على «تم الاتفاق».</p>',
      hasC ? '<button class="btn btn--sm btn--ghost" data-edit-contract>تعديل</button>'
        : (hasQ ? '<button class="btn btn--sm btn--ghost" data-edit-contract>إدخال يدوي</button>' : ''));

    /* ④ مكتب الإيجار */
    var c4 = card(4, 'التفاوض مع مكتب الإيجار', st(2),
      r.status ? '<span class="badge ' + (r.status === 'تم التعاقد' ? 'b-green' : 'b-gold') + '">' + VH.esc(r.status) + '</span>' : '',
      (r.officeName ? (r.cars && r.cars.length
        ? '<div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>#</th><th>نوع السيارة</th><th>السائق</th><th>المكتب</th><th>جوال المكتب</th><th>اللوحة</th><th>إيجار اليوم</th><th>الإجمالي</th></tr></thead><tbody>' +
          r.cars.map(function (x, k) {
            return '<tr><td class="n">' + (k + 1) + '</td><td>' + VH.esc(x.carType) + '</td><td><span class="badge ' + (x.withDriver === 'بدون سائق' ? 'b-gray' : 'b-lime') + '">' + VH.esc(x.withDriver || 'بسائق') + '</span></td>' +
              '<td>' + VH.esc(x.officeName) + '</td><td class="n">' + VH.esc(x.officePhone || '—') + '</td><td class="n">' + VH.esc(x.plate || '—') + '</td>' +
              '<td class="n">' + VH.fmt(x.rentPerDay) + '</td><td class="n"><b>' + VH.fmt(x.rentTotal) + '</b></td></tr>';
          }).join('') +
          '</tbody><tfoot><tr><th colspan="7">إجمالي الإيجار لكل السيارات (' + r.cars.length + ' سيارة × ' + (c.days || 0) + ' يوم)</th><th class="n">' + VH.fmt(r.rentTotal) + ' ر.س</th></tr></tfoot></table></div>'
        : kv([['اسم المكتب', VH.esc(r.officeName)], ['جوال المكتب', '<span class="num">' + VH.esc(r.officePhone || '') + '</span>'],
        ['لوحة السيارة', '<span class="num">' + VH.esc(r.plate || '') + '</span>'],
        ['إيجار اليوم', VH.money(r.rentPerDay)], ['إجمالي الإيجار', VH.money(r.rentTotal)]])) +
        (r.contractImage ? '<div style="margin-top:14px"><small class="muted">صورة العقد</small><br>' +
          '<img src="' + r.contractImage + '" alt="صورة العقد" data-zoom style="max-height:130px;border-radius:10px;border:1px solid var(--vh-border);cursor:zoom-in;margin-top:6px"></div>'
          : (r.status === 'تم التعاقد' ? '<p class="small" style="color:var(--bad);margin:12px 0 0">⚠ لم تُرفق صورة العقد</p>' : '')) +
        (r.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(r.notes) + '</p>' : '')
        : '<p class="small muted" style="margin:0">لم يُسجَّل مكتب إيجار بعد. إرفاق صورة العقد إلزامي عند «تم التعاقد».</p>'),
      i >= 2 ? '<button class="btn btn--sm ' + (r.officeName ? 'btn--ghost' : 'btn--gold') + '" data-edit-office>' + (r.officeName ? 'تعديل' : 'إدخال بيانات المكتب') + '</button>' : '');

    /* ⑤ الإسناد */
    var c5 = card(5, 'تحويل المهمة للموظف', st(3),
      d.assignee ? '<span class="badge b-green">' + VH.esc(VH.store.employeeName(d.assignee)) + '</span>' : '',
      d.assignee ? kv([['الموظف المنفّذ', VH.avatar(VH.store.employeeName(d.assignee)) + ' ' + VH.esc(VH.store.employeeName(d.assignee))],
      ['تعليمات', VH.esc(d.assignNote || '')]])
        : '<p class="small muted" style="margin:0">بعد التعاقد مع المكتب تُحوَّل المهمة إلى الموظف المنفّذ.</p>',
      i >= 3 ? '<button class="btn btn--sm ' + (d.assignee ? 'btn--ghost' : 'btn--gold') + '" data-assign>' + (d.assignee ? 'تغيير المنفّذ' : 'تحويل المهمة') + '</button>' : '');

    /* ⑥ بيانات السيارات */
    var veh = d.vehicles || [];
    var vehComplete = O.vehiclesComplete(d);
    var vehBody = veh.length
      ? (veh.some(function (v) { return v.fromRental; }) ? '<p class="small muted" style="margin:0 0 10px">↺ السيارات منقولة تلقائياً من التعاقد مع مكتب الإيجار — يبقى تعيين السائق المفوّض لكل سيارة بسائق.</p>' : '') +
      '<div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>#</th><th>نوع السيارة</th><th>رقم اللوحة</th><th>السائق</th><th>السائق المفوّض</th><th></th></tr></thead><tbody>' +
      veh.map(function (v, k) {
        var need = v.withDriver !== 'بدون سائق';
        return '<tr><td class="n">' + (k + 1) + '</td><td>' + VH.esc(v.carType) + '</td><td class="n">' + VH.esc(v.plate || '—') + '</td>' +
          '<td><span class="badge ' + (need ? 'b-lime' : 'b-gray') + '">' + VH.esc(v.withDriver || 'بسائق') + '</span></td>' +
          '<td>' + (v.driverName ? VH.avatar(v.driverName) + ' ' + VH.esc(v.driverName)
            : (need ? '<span class="badge b-red">بانتظار التعيين</span>' : '<span class="small muted">لا يحتاج</span>')) + '</td>' +
          '<td class="actions"><button class="btn btn--sm ' + (need && !v.driverName ? 'btn--gold' : 'btn--ghost') + '" data-edit-veh="' + v.id + '">' + (need && !v.driverName ? 'تعيين سائق' : 'تعديل') + '</button>' +
          '<button class="btn btn--sm btn--danger" data-del-veh="' + v.id + '">حذف</button></td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<p class="small muted" style="margin:0">' + (i >= 4 ? 'تنعكس السيارات هنا تلقائياً من «التفاوض مع مكتب الإيجار» عند اختيار «تم التعاقد».' : 'لم تُعبّأ بيانات السيارات بعد') +
        (c.carsCount > 1 ? ' (العقد فيه ' + c.carsCount + ' سيارات)' : '') + '</p>';
    var c6 = card(6, 'تعبئة بيانات السيارات', st(4),
      veh.length ? '<span class="badge ' + (vehComplete ? 'b-green' : 'b-mint') + '">' + veh.length + ' / ' + (c.carsCount || 1) + ' سيارة' + (vehComplete ? ' — مكتملة' : '') + '</span>' : '',
      vehBody, i >= 4 ? (i === 4 && veh.length ? '<button class="btn btn--sm btn--gold" data-confirm-veh>تأكيد بيانات السيارات ←</button>' : '') +
        '<button class="btn btn--sm btn--ghost" data-add-veh>+ إضافة سيارة</button>' : '');

    /* ⑦ السواق */
    var c7 = card(7, 'التعاقد مع السواق', st(5),
      dr.name ? '<span class="badge b-green">' + VH.esc(dr.name) + '</span>' : '',
      dr.name ? kv([['الجنسية', VH.esc(dr.nationality || '')], ['اسم السائق', VH.esc(dr.name)],
      ['رقم الجوال', '<span class="num">' + VH.esc(dr.phone || '') + '</span>'],
      ['رقم الهوية', '<span class="num">' + VH.esc(dr.idNo || '') + '</span>'],
      ['يومية السائق', VH.money(dr.dailyWage)]]) +
        (dr.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(dr.notes) + '</p>' : '')
        : '<p class="small muted" style="margin:0">لم يُسجَّل سواق بعد.</p>',
      i >= 5 ? '<button class="btn btn--sm ' + (dr.name ? 'btn--ghost' : 'btn--gold') + '" data-driver>' + (dr.name ? 'تعديل' : 'تسجيل السواق') + '</button>' : '');

    /* ⑧ المصاريف */
    var exp = d.expenses || [];
    var expBody = exp.length
      ? exp.map(function (e) {
        return '<div class="exp-row"><span class="k">' + VH.esc(e.kind) + '</span>' +
          '<span class="small muted">' + VH.esc(e.note || '') + '</span><span class="sp"></span>' +
          '<span class="small muted n">' + VH.dateShort(e.date) + '</span>' +
          '<b class="num">' + VH.fmt(e.amount) + '</b><span class="small">ر.س</span>' +
          '<button class="btn btn--sm btn--danger" data-del-exp="' + e.id + '">حذف</button></div>';
      }).join('') + '<div class="exp-row" style="border-top:2px solid var(--vh-border)"><span class="k">الإجمالي</span><span class="sp"></span><b class="num">' + VH.fmt(t.expenses) + '</b><span class="small">ر.س</span></div>'
      : '<p class="small muted" style="margin:0">لم تُرفع فواتير صرف بعد.</p>';
    var quick = i >= 6 ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">' +
      KINDS.map(function (k) { return '<button class="btn btn--sm btn--ghost" data-add-exp="' + k + '">+ ' + k + '</button>'; }).join('') + '</div>' : '';
    var c8 = card(8, 'فواتير الصرف', st(6), exp.length ? '<span class="badge b-gold">' + exp.length + ' بند</span>' : '',
      expBody + quick, '');

    /* الملخص المالي */
    var money = '<div class="card"><div class="card__h"><h2>الملخّص المالي للصفقة</h2><span class="sp"></span>' +
      (done ? '<span class="badge b-green">مكتملة</span>' : '') + '</div>' +
      '<div class="grid grid--4">' +
      VH.statCard({ title: 'إيراد العميل (شامل الضريبة)', value: t.revenueTotal, cls: 'stat--in', desc: 'قبل الضريبة ' + VH.moneyTxt(t.revenueBefore) }) +
      VH.statCard({ title: 'الضريبة المستحقة 15%', value: t.vat, cls: 'stat--navy', desc: 'تُورَّد للهيئة' }) +
      VH.statCard({ title: 'تكلفة التنفيذ', value: t.cost, cls: 'stat--out', desc: 'إيجار ' + VH.fmt(t.rent) + ' + مصاريف ' + VH.fmt(t.expenses) }) +
      VH.statCard({ title: 'صافي الربح', value: t.profit, cls: 'stat--net', desc: 'هامش ' + VH.fmt(t.margin) + '%' }) +
      '</div></div>';

    /* الفواتير المرتبطة */
    var inv = VH.store.list('invoices').filter(function (x) { return x.dealId === d.id; });
    var invCard = '<div class="card"><div class="card__h"><h2>الفواتير المرتبطة</h2><span class="sp"></span>' +
      (VH.auth.can('financeEdit') ? '<button class="btn btn--sm btn--ghost" data-add-inv>+ فاتورة لهذه الصفقة</button>' : '') + '</div>' +
      (inv.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>التاريخ</th><th>النوع</th><th>البند</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>' +
        inv.map(function (x) {
          return '<tr><td class="n">' + VH.esc(x.no) + '</td><td class="n">' + VH.dateShort(x.date) + '</td><td>' + VH.dirBadge(x.direction) +
            '</td><td>' + VH.esc(x.category || x.description) + '</td><td class="n">' + VH.fmt(x.total) + '</td><td>' + VH.payBadge(x.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="small muted" style="margin:0">لا فواتير بعد — تُنشأ تلقائياً عند إقفال الصفقة.</p>') + '</div>';

    /* الخط الزمني */
    var tl = '<div class="card"><div class="card__h"><h2>الخط الزمني</h2></div><ul class="timeline" style="padding-inline-start:22px;margin:0">' +
      (d.timeline || []).slice().reverse().map(function (e) {
        return '<li><b>' + VH.esc(e.note || VH.stage(e.stage).t) + '</b><small>' + VH.esc(e.by) + ' · ' + VH.stampAr(e.at) + '</small></li>';
      }).join('') + '</ul></div>';

    var actions = '';
    if (!cancelled && !done && i >= 6) actions += '<button class="btn btn--gold" data-close-deal>إقفال الصفقة</button>';
    if (!cancelled && !done) actions += '<button class="btn btn--danger" data-cancel-deal>إلغاء الصفقة</button>';
    if (cancelled || done) actions += '<button class="btn btn--ghost" data-reopen>إعادة الفتح</button>';
    actions += '<a class="btn btn--ghost" href="#/o/board">رجوع</a>';

    var banner = cancelled ? '<div class="strip strip--warn"><span class="strip__ico">✕</span><div><b>هذه الصفقة ملغية</b><small>' + VH.esc(d.cancelReason || '') + '</small></div></div>' : '';

    return {
      title: VH.esc(d.orgName || d.clientName) + ' · ' + VH.esc(d.code),
      sub: VH.stage(d.stage).t + ' — المسؤول: ' + VH.store.employeeName(d.owner) + (d.assignee ? ' · المنفّذ: ' + VH.store.employeeName(d.assignee) : ''),
      actions: actions,
      html: banner + money + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + invCard + tl,
      mount: function (root) {
        var re = function () { VH.app.render(); };
        // بعض الأزرار في شريط الرأس خارج حاوية العرض، لذا نبحث في الصفحة كلها
        function on(sel, fn) { var e = root.querySelector(sel) || document.querySelector(sel); if (e) e.addEventListener('click', fn); }
        on('[data-edit-contact]', function () { O.editContact(d, re); });
        on('[data-quote]', function () { O.quoteModal(d, re); });
        on('[data-accept-quote]', function () { O.acceptQuote(d, re); });
        on('[data-print-quote]', function () { VH.reports.printQuote(d); });
        on('[data-edit-contract]', function () { O.contractModal(d, re); });
        on('[data-edit-office]', function () { O.officeModal(d, re); });
        on('[data-assign]', function () { O.assignModal(d, re); });
        on('[data-add-veh]', function () { O.vehicleModal(d, re); });
        on('[data-confirm-veh]', function () { O.confirmVehicles(d, re); });
        on('[data-driver]', function () { O.driverModal(d, re); });
        on('[data-close-deal]', function () { O.closeDeal(d, re); });
        on('[data-cancel-deal]', function () { O.cancelDeal(d, re); });
        on('[data-reopen]', function () { O.reopen(d, re); });
        on('[data-add-inv]', function () { VH.finance.invoiceModal(null, re, d); });
        on('[data-zoom]', function () {
          VH.modal({ title: 'صورة عقد مكتب الإيجار — ' + d.code, wide: true, body: '<img src="' + r.contractImage + '" style="width:100%;border-radius:10px">' });
        });
        root.querySelectorAll('[data-edit-veh]').forEach(function (b) {
          b.addEventListener('click', function () { O.vehicleModal(d, re, b.getAttribute('data-edit-veh')); });
        });
        root.querySelectorAll('[data-del-veh]').forEach(function (b) {
          b.addEventListener('click', function () {
            var vid = b.getAttribute('data-del-veh');
            VH.confirm('حذف سيارة', 'سيُحذف سطر السيارة من الصفقة.', 'حذف', function () {
              d.vehicles = (d.vehicles || []).filter(function (x) { return x.id !== vid; });
              O.push(d, 'حُذفت سيارة'); VH.store.save('deals', d); VH.toast('حُذفت', 'ok'); re();
            }, true);
          });
        });
        root.querySelectorAll('[data-add-exp]').forEach(function (b) {
          b.addEventListener('click', function () { O.expenseModal(d, re, b.getAttribute('data-add-exp')); });
        });
        root.querySelectorAll('[data-del-exp]').forEach(function (b) {
          b.addEventListener('click', function () {
            var eid = b.getAttribute('data-del-exp');
            VH.confirm('حذف بند صرف', 'سيُحذف البند نهائياً من الصفقة.', 'حذف', function () {
              d.expenses = (d.expenses || []).filter(function (x) { return x.id !== eid; });
              O.push(d, 'حُذف بند صرف');
              VH.store.save('deals', d); VH.toast('حُذف البند', 'ok'); re();
            }, true);
          });
        });
      }
    };
  };

  /* =====================================================================
     العرض — مصاريف التنفيذ
     ===================================================================== */
  O.expenses = function () {
    var r = VH.app.period();
    var rows = [], totals = {};
    KINDS.forEach(function (k) { totals[k] = 0; });
    var grand = 0;
    VH.store.list('deals').forEach(function (d) {
      (d.expenses || []).forEach(function (e) {
        if (!VH.inRange(e.date, r)) return;
        totals[e.kind] = (totals[e.kind] || 0) + VH.num(e.amount);
        grand += VH.num(e.amount);
        rows.push({ d: d, e: e });
      });
    });
    rows.sort(function (a, b) { return String(b.e.date).localeCompare(String(a.e.date)); });

    var html = VH.app.periodBar() +
      '<div class="grid grid--4" style="margin-bottom:16px">' +
      KINDS.map(function (k) {
        return VH.statCard({ title: k, value: totals[k] || 0, cls: 'stat--out', desc: grand ? VH.fmt((totals[k] || 0) / grand * 100) + '% من الصرف' : '' });
      }).join('') +
      VH.statCard({ title: 'إجمالي الصرف', value: grand, cls: 'stat--net', desc: rows.length + ' بند خلال الفترة' }) +
      '</div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الصفقة</th><th>الجهة</th><th>النوع</th><th>الوصف</th><th>القيمة</th><th>رفعه</th></tr></thead><tbody>' +
        rows.map(function (x) {
          return '<tr><td class="n">' + VH.dateShort(x.e.date) + '</td>' +
            '<td><a href="#/o/deal/' + x.d.id + '" class="n">' + VH.esc(x.d.code) + '</a></td>' +
            '<td>' + VH.esc(x.d.orgName || x.d.clientName) + '</td><td><span class="badge b-gold">' + VH.esc(x.e.kind) + '</span></td>' +
            '<td>' + VH.esc(x.e.note || '—') + '</td><td class="n">' + VH.fmt(x.e.amount) + '</td>' +
            '<td>' + VH.esc(x.e.by || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : VH.empty('🧾', 'لا مصاريف في هذه الفترة'));

    return {
      title: 'مصاريف التنفيذ', sub: 'بنزين · مناديل · موية · يومية السواق · أخرى',
      actions: '<button class="btn btn--ghost" data-export-exp>تصدير CSV</button>',
      html: html, mount: function (root) { VH.app.bindPeriod(root); }
    };
  };

  O.exportExpenses = function () {
    var r = VH.app.period();
    var rows = [['التاريخ', 'رقم الصفقة', 'الجهة', 'النوع', 'الوصف', 'القيمة', 'رفعه']];
    VH.store.list('deals').forEach(function (d) {
      (d.expenses || []).forEach(function (e) {
        if (!VH.inRange(e.date, r)) return;
        rows.push([e.date, d.code, d.orgName || d.clientName, e.kind, e.note, e.amount, e.by]);
      });
    });
    VH.download('via-horizon-expenses-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف المصاريف', 'ok');
  };

  /* =====================================================================
     العرض — السائقون
     ===================================================================== */
  O.drivers = function () {
    var list = VH.store.driverList();
    var deals = VH.store.list('deals');
    var rows = list.map(function (x) {
      var n = deals.filter(function (d) { return (d.driver || {}).name === x.name; }).length;
      var wa = VH.waPhone(x.phone);
      return '<tr><td><b>' + VH.esc(x.name) + '</b></td>' +
        '<td>' + (x.nationality ? '<span class="badge ' + (x.nationality === 'سعودي' ? 'b-green' : 'b-sky') + '">' + VH.esc(x.nationality) + '</span>' : '—') + '</td>' +
        '<td class="n">' + VH.esc(x.phone || '—') + '</td><td class="n">' + VH.esc(x.idNo || '—') + '</td>' +
        '<td class="n">' + (x.dailyWage ? VH.fmt(x.dailyWage) : '—') + '</td>' +
        '<td class="n">' + n + '</td>' +
        '<td class="actions">' + (wa ? '<a class="btn btn--sm btn--teal" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">واتساب</a>' : '') +
        '<button class="btn btn--sm btn--ghost" data-edit-dr="' + x.id + '">تعديل</button>' +
        '<button class="btn btn--sm btn--danger" data-del-dr="' + x.id + '">حذف</button></td></tr>';
    }).join('');

    return {
      title: 'السائقون',
      sub: 'قائمة تُبنى تلقائياً من كل تعاقد — وتظهر كقائمة منسدلة عند الإدخال',
      actions: '<button class="btn btn--gold" data-add-dr>+ إضافة سائق</button>',
      html: list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>الجنسية</th><th>الجوال</th>' +
        '<th>رقم الهوية</th><th>اليومية</th><th>عدد المهام</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('🧑‍✈️', 'لا سائقون بعد — يُضافون تلقائياً عند التعاقد مع سواق في أي صفقة',
          '<button class="btn btn--gold" data-add-dr>+ إضافة سائق</button>'),
      mount: function (root) {
        function form(x, title) {
          x = x || {};
          var fields = [
            { name: 'name', label: 'اسم السائق', required: true, value: x.name },
            { name: 'nationality', label: 'الجنسية', type: 'select', required: true, options: NATIONALITY.map(function (n) { return { v: n, t: n }; }), value: x.nationality || 'سعودي' },
            { name: 'phone', label: 'رقم الجوال', type: 'tel', required: true, value: x.phone },
            { name: 'idNo', label: 'رقم الهوية', value: x.idNo, attrs: ' dir="ltr" inputmode="numeric"' },
            { name: 'dailyWage', label: 'يومية السائق', type: 'select', options: WAGES.map(function (w) { return { v: w, t: w + ' ر.س' }; }), value: String(x.dailyWage || '200') }
          ];
          VH.modal({
            title: title, body: VH.form.render(fields), actions: [
              {
                label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
                  var v = VH.form.validate(bd, fields); if (!v) return;
                  if (!VH.telOk(v.phone)) { VH.form.error(bd, 'رقم الجوال غير صحيح'); return; }
                  VH.store.save('drivers', Object.assign({}, x, {
                    name: v.name, nationality: v.nationality, phone: v.phone, idNo: v.idNo, dailyWage: VH.num(v.dailyWage)
                  }));
                  VH.store.log('سائق', (x.id ? 'تعديل ' : 'إضافة ') + v.name);
                  close(); VH.toast('حُفظ السائق', 'ok'); VH.app.render();
                }
              }, { label: 'إلغاء', cls: 'btn--ghost' }]
          });
        }
        var add = root.querySelector('[data-add-dr]') || document.querySelector('[data-add-dr]');
        if (add) add.addEventListener('click', function () { form(null, 'إضافة سائق'); });
        root.querySelectorAll('[data-edit-dr]').forEach(function (b) {
          b.addEventListener('click', function () { form(VH.store.get('drivers', b.getAttribute('data-edit-dr')), 'تعديل بيانات سائق'); });
        });
        root.querySelectorAll('[data-del-dr]').forEach(function (b) {
          b.addEventListener('click', function () {
            var x = VH.store.get('drivers', b.getAttribute('data-del-dr'));
            VH.confirm('حذف سائق', 'سيُحذف ' + VH.esc(x.name) + ' من القائمة (لن تتأثر الصفقات السابقة).', 'حذف', function () {
              VH.store.remove('drivers', x.id); VH.toast('حُذف', 'warn'); VH.app.render();
            }, true);
          });
        });
      }
    };
  };

  /* =====================================================================
     العرض — الفريق
     ===================================================================== */
  O.team = function () {
    var staff = VH.store.staff(), all = VH.store.list('deals');
    var cards = staff.map(function (s) {
      var mine = all.filter(function (d) { return d.owner === s.id || d.assignee === s.id; });
      var open = mine.filter(function (d) { return d.stage !== 'done' && d.stage !== 'cancelled'; });
      var doneD = mine.filter(function (d) { return d.stage === 'done'; });
      var contacts = mine.filter(function (d) { return d.owner === s.id; });
      var rev = 0, exp = 0;
      mine.forEach(function (d) {
        if (d.stage === 'cancelled') return;
        var t = O.calc(d); rev += t.revenueTotal;
        (d.expenses || []).forEach(function (e) { if (e.by === s.name) exp += VH.num(e.amount); });
      });
      return '<div class="card"><div class="card__h">' +
        '<span class="av-xs" style="width:38px;height:38px;font-size:1rem">' + VH.esc(VH.initials(s.name)) + '</span>' +
        '<div><h2 style="margin:0">' + VH.esc(s.name) + '</h2><span class="small muted">موظف</span></div></div>' +
        '<div class="grid grid--2">' +
        VH.statCard({ count: true, title: 'عملاء تواصل معهم', value: contacts.length, cls: 'stat--navy', desc: 'سجّلهم باسمه' }) +
        VH.statCard({ count: true, title: 'مهام مفتوحة', value: open.length, cls: 'stat--net', desc: 'من أصل ' + mine.length + ' صفقة' }) +
        VH.statCard({ count: true, title: 'صفقات مكتملة', value: doneD.length, cls: 'stat--in', desc: 'أُقفلت بنجاح' }) +
        VH.statCard({ title: 'مصاريف رفعها', value: exp, cls: 'stat--out', desc: 'بنود صرف' }) +
        '</div>' +
        (open.length ? '<div style="margin-top:14px"><b class="small">المهام المفتوحة:</b>' +
          open.map(function (d) {
            return '<div class="exp-row"><a href="#/o/deal/' + d.id + '" class="n">' + VH.esc(d.code) + '</a>' +
              '<span>' + VH.esc(d.orgName || d.clientName) + '</span><span class="sp"></span>' + VH.stageBadge(d.stage) + '</div>';
          }).join('') + '</div>' : '') +
        '</div>';
    }).join('');

    return {
      title: 'الفريق والمهام', sub: 'توزيع الصفقات والمصاريف على الموظفين',
      actions: '', html: '<div class="grid grid--2">' + cards + '</div>', mount: function () {}
    };
  };

  /* =====================================================================
     العرض — سجل الأحداث
     ===================================================================== */
  O.log = function () {
    var list = VH.store.list('audit').sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, 300);
    var html = list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الموظف</th><th>الإجراء</th><th>التفاصيل</th></tr></thead><tbody>' +
      list.map(function (a) {
        return '<tr><td class="n">' + VH.stampAr(a.at) + '</td><td>' + VH.avatar(a.by) + ' ' + VH.esc(a.by) + '</td>' +
          '<td><span class="badge b-blue">' + VH.esc(a.action) + '</span></td><td>' + VH.esc(a.detail) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : VH.empty('🕘', 'لا أحداث بعد');
    return { title: 'سجل الأحداث', sub: 'آخر 300 إجراء — من فعل ماذا ومتى', actions: '', html: html, mount: function () {} };
  };

  VH.ops = O;
})(window.VH);
