/* =====================================================================
   بوابة متابعة العمل والعقود
   المراحل: تفاوض ← عقد ← مكتب الإيجار ← إسناد لموظف ← سواق ← مصاريف ← مكتملة
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var O = {};
  var ORDER = ['negotiation', 'office', 'assigned', 'driver', 'expenses', 'done'];
  var KINDS = ['بنزين', 'مناديل', 'موية', 'يومية السواق', 'أخرى'];
  var CARS = ['هيونداي H1', 'تويوتا هايس', 'جي إم سي', 'شيفروليه سوبربان', 'تاهو', 'مرسيدس S450', 'مرسيدس سبرينتر', 'كامري', 'سوناتا', 'باص 30 راكب', 'باص 50 راكب', 'أخرى'];
  var REGIONS = ['الرياض', 'مكة المكرمة', 'المدينة المنورة', 'جدة', 'الشرقية', 'القصيم', 'عسير', 'تبوك', 'حائل', 'نجران', 'جازان', 'الباحة', 'الجوف', 'الحدود الشمالية'];

  O.ORDER = ORDER; O.KINDS = KINDS;
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

  O.push = function (d, note) {
    d.timeline = d.timeline || [];
    var u = VH.auth.user() || {};
    d.timeline.push({ stage: d.stage, at: VH.stamp(), by: u.name || '—', note: note || '' });
  };

  O.stageOf = function (d) { return VH.stage(d.stage || 'negotiation'); };

  O.filtered = function (f) {
    f = f || {};
    var list = VH.store.list('deals');
    if (f.stage) list = list.filter(function (d) { return d.stage === f.stage; });
    if (f.owner) list = list.filter(function (d) { return d.owner === f.owner || d.assignee === f.owner; });
    if (f.region) list = list.filter(function (d) { return (d.contract || {}).region === f.region; });
    if (f.q) {
      var q = f.q.toLowerCase();
      list = list.filter(function (d) {
        return [d.code, d.clientName, d.clientPhone, (d.contract || {}).plate, (d.rental || {}).officeName, (d.driver || {}).name]
          .some(function (x) { return String(x || '').toLowerCase().indexOf(q) > -1; });
      });
    }
    return list.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  };

  /* =====================================================================
     نافذة صفقة جديدة
     ===================================================================== */
  O.newDeal = function () {
    var staff = VH.store.staff();
    var me = VH.auth.user() || {};
    var fields = [
      { name: 'code', label: 'رقم العميل', value: VH.store.settings().dealSeq ? 'C-' + (1000 + VH.num(VH.store.settings().dealSeq)) : 'C-1001', required: true, hint: 'يمكنك تغييره' },
      { name: 'clientName', label: 'اسم العميل', required: true },
      { name: 'clientPhone', label: 'جوال العميل', type: 'tel', hint: 'يُستخدم في متابعة السداد وواتساب' },
      { name: 'negotiationDate', label: 'تاريخ بداية التفاوض', type: 'date', value: VH.today(), required: true },
      {
        name: 'negotiationStatus', label: 'الحالة', type: 'select', required: true,
        options: VH.NEG_STATUS.map(function (s) { return { v: s, t: s }; }), value: 'بداية التفاوض'
      },
      {
        name: 'owner', label: 'الموظف المسؤول', type: 'select', required: true,
        options: staff.map(function (s) { return { v: s.id, t: s.name }; }),
        value: me.role === 'employee' ? me.id : (staff[0] || {}).id
      },
      { name: 'notes', label: 'ملاحظات التفاوض', type: 'textarea', full: true, rows: 2 }
    ];
    VH.modal({
      title: 'صفقة جديدة — مرحلة التفاوض',
      body: VH.form.render(fields),
      actions: [
        {
          label: 'حفظ الصفقة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.clientPhone && !VH.telOk(v.clientPhone)) { VH.form.error(bd, 'رقم الجوال غير صحيح (مثال: 0512345678)'); return; }
            var d = {
              code: v.code, clientName: v.clientName, clientPhone: v.clientPhone,
              negotiationDate: v.negotiationDate, negotiationStatus: v.negotiationStatus,
              owner: v.owner, assignee: '', notes: v.notes,
              stage: v.negotiationStatus === 'ملغي' ? 'cancelled' : 'negotiation',
              contract: {}, rental: {}, driver: {}, expenses: [], timeline: []
            };
            O.push(d, 'إنشاء الصفقة — ' + v.negotiationStatus);
            VH.store.save('deals', d);
            VH.store.saveSettings({ dealSeq: (VH.num(VH.store.settings().dealSeq) || 1) + 1 });
            VH.store.log('صفقة جديدة', d.code + ' — ' + d.clientName, d.id);
            close();
            VH.toast('تم إنشاء الصفقة ' + d.code, 'ok');
            location.hash = '#/o/deal/' + d.id;
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     نافذة بيانات العقد
     ===================================================================== */
  O.contractModal = function (d, after) {
    var c = d.contract || {};
    var fields = [
      { name: 'carType', label: 'نوع السيارة', type: 'select', required: true, options: CARS.map(function (x) { return { v: x, t: x }; }), value: c.carType },
      { name: 'carTypeOther', label: 'نوع آخر (إن اخترتِ «أخرى»)', value: c.carTypeOther },
      { name: 'region', label: 'المنطقة', type: 'select', required: true, options: REGIONS.map(function (x) { return { v: x, t: x }; }), value: c.region },
      { name: 'plate', label: 'لوحة السيارة', value: c.plate, hint: 'مثال: أ ب ج 1234' },
      { name: 'startDate', label: 'بداية الخدمة', type: 'date', required: true, value: c.startDate },
      { name: 'endDate', label: 'نهاية الخدمة', type: 'date', required: true, value: c.endDate },
      { name: 'days', label: 'عدد الأيام', type: 'number', step: '1', value: c.days, readonly: true, hint: 'يُحسب تلقائياً شاملاً يومي البداية والنهاية' },
      { name: 'price', label: 'السعر المتفق عليه مع العميل', type: 'number', required: true, value: c.price },
      {
        name: 'priceVatIncluded', label: 'هل السعر شامل ضريبة القيمة المضافة؟', type: 'select',
        options: [{ v: 'yes', t: 'نعم — شامل الضريبة' }, { v: 'no', t: 'لا — يُضاف عليه 15%' }],
        value: c.priceVatIncluded || 'yes'
      }
    ];
    VH.modal({
      title: 'بيانات العقد — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      onOpen: function (bd) {
        function sync() {
          var s = bd.querySelector('[data-f=startDate]').value, e = bd.querySelector('[data-f=endDate]').value;
          bd.querySelector('[data-f=days]').value = (s && e) ? VH.daysBetween(s, e) : '';
        }
        bd.querySelector('[data-f=startDate]').addEventListener('change', sync);
        bd.querySelector('[data-f=endDate]').addEventListener('change', sync);
        sync();
      },
      actions: [
        {
          label: 'حفظ ومتابعة', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (v.endDate < v.startDate) { VH.form.error(bd, 'تاريخ النهاية قبل تاريخ البداية'); return; }
            if (!VH.num(v.price)) { VH.form.error(bd, 'أدخلي سعراً صحيحاً'); return; }
            var days = VH.daysBetween(v.startDate, v.endDate);
            d.contract = {
              carType: v.carType === 'أخرى' && v.carTypeOther ? v.carTypeOther : v.carType,
              carTypeOther: v.carTypeOther, region: v.region, plate: v.plate,
              startDate: v.startDate, endDate: v.endDate, days: days,
              price: VH.num(v.price), priceVatIncluded: v.priceVatIncluded
            };
            var moved = false;
            if (O.idx(d.stage) < 1 && d.stage !== 'cancelled') {
              d.stage = 'office'; d.negotiationStatus = 'تم التفاوض'; moved = true;
            }
            O.push(d, moved ? 'اكتمل التفاوض وحُفظ العقد — انتقلت للتفاوض مع مكتب الإيجار' : 'تعديل بيانات العقد');
            VH.store.save('deals', d);
            VH.store.log('بيانات العقد', d.code + ' — ' + d.contract.carType + ' / ' + d.contract.region, d.id);
            close();
            VH.toast(moved ? 'تم — الصفقة الآن في مرحلة التفاوض مع مكتب الإيجار' : 'حُفظت بيانات العقد', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     نافذة مكتب الإيجار
     ===================================================================== */
  O.officeModal = function (d, after) {
    var r = d.rental || {}, days = VH.num((d.contract || {}).days) || 0;
    var fields = [
      { name: 'officeName', label: 'اسم مكتب الإيجار', required: true, value: r.officeName },
      { name: 'officePhone', label: 'جوال المكتب', type: 'tel', value: r.officePhone },
      { name: 'rentPerDay', label: 'إيجار السيارة باليوم', type: 'number', required: true, value: r.rentPerDay },
      { name: 'days', label: 'الأيام', type: 'number', value: days, readonly: true },
      { name: 'rentTotal', label: 'إجمالي الإيجار', type: 'number', value: r.rentTotal, hint: 'يُحسب تلقائياً — يمكن تعديله يدوياً' },
      {
        name: 'status', label: 'حالة الاتفاق مع المكتب', type: 'select', required: true,
        options: [{ v: 'جارٍ التفاوض', t: 'جارٍ التفاوض' }, { v: 'تم التعاقد', t: 'تم التعاقد' }],
        value: r.status || 'جارٍ التفاوض'
      },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: r.notes }
    ];
    VH.modal({
      title: 'التفاوض مع مكتب الإيجار — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      onOpen: function (bd) {
        var per = bd.querySelector('[data-f=rentPerDay]'), tot = bd.querySelector('[data-f=rentTotal]');
        per.addEventListener('input', function () { tot.value = VH.round2(VH.num(per.value) * days); });
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            d.rental = {
              officeName: v.officeName, officePhone: v.officePhone,
              rentPerDay: VH.num(v.rentPerDay),
              rentTotal: VH.num(v.rentTotal) || VH.round2(VH.num(v.rentPerDay) * days),
              status: v.status, notes: v.notes, by: (VH.auth.user() || {}).name
            };
            var moved = false;
            if (v.status === 'تم التعاقد' && O.idx(d.stage) < 2) { d.stage = 'assigned'; moved = true; }
            O.push(d, moved ? 'تم التعاقد مع مكتب ' + v.officeName + ' — بانتظار إسناد المهمة لموظف' : 'تحديث بيانات مكتب الإيجار');
            VH.store.save('deals', d);
            VH.store.log('مكتب الإيجار', d.code + ' — ' + v.officeName + ' (' + v.status + ')', d.id);
            close(); VH.toast(moved ? 'تم التعاقد — انتقلت المهمة لمرحلة الإسناد' : 'حُفظ', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     إسناد المهمة لموظف
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
            if (O.idx(d.stage) < 3) d.stage = 'driver';
            O.push(d, 'أُسندت المهمة إلى ' + VH.store.employeeName(v.assignee));
            VH.store.save('deals', d);
            VH.store.log('إسناد مهمة', d.code + ' ← ' + VH.store.employeeName(v.assignee), d.id);
            close(); VH.toast('تم تحويل المهمة إلى ' + VH.store.employeeName(v.assignee), 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     التعاقد مع السواق
     ===================================================================== */
  O.driverModal = function (d, after) {
    var dr = d.driver || {};
    var fields = [
      { name: 'name', label: 'اسم السواق', required: true, value: dr.name },
      { name: 'phone', label: 'جوال السواق', type: 'tel', value: dr.phone },
      { name: 'idNo', label: 'رقم الهوية/الإقامة', value: dr.idNo },
      { name: 'dailyWage', label: 'يومية السواق', type: 'number', value: dr.dailyWage, hint: 'تُضاف لاحقاً ضمن فواتير الصرف' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: dr.notes }
    ];
    VH.modal({
      title: 'التعاقد مع السواق — ' + VH.esc(d.code),
      body: VH.form.render(fields),
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            d.driver = {
              name: v.name, phone: v.phone, idNo: v.idNo,
              dailyWage: VH.num(v.dailyWage), notes: v.notes, by: (VH.auth.user() || {}).name
            };
            var moved = false;
            if (O.idx(d.stage) < 4) { d.stage = 'expenses'; moved = true; }
            O.push(d, 'تم التعاقد مع السواق ' + v.name);
            VH.store.save('deals', d);
            VH.store.log('تعاقد سواق', d.code + ' — ' + v.name, d.id);
            close(); VH.toast(moved ? 'تم — ارفعي الآن فواتير الصرف' : 'حُفظت بيانات السواق', 'ok');
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     فواتير الصرف
     ===================================================================== */
  O.expenseModal = function (d, after, presetKind) {
    var days = VH.num((d.contract || {}).days) || 0, wage = VH.num((d.driver || {}).dailyWage) || 0;
    var fields = [
      { name: 'kind', label: 'نوع المصروف', type: 'select', required: true, options: KINDS.map(function (k) { return { v: k, t: k }; }), value: presetKind || 'بنزين' },
      { name: 'note', label: 'الوصف (مطلوب مع «أخرى»)', value: presetKind === 'يومية السواق' ? 'يومية السواق ' + days + ' يوم' : '' },
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
     إقفال الصفقة + إنشاء الفواتير
     ===================================================================== */
  O.closeDeal = function (d, after) {
    var t = O.calc(d);
    var exists = VH.store.list('invoices').filter(function (i) { return i.dealId === d.id; });
    var hasIn = exists.some(function (i) { return i.direction === 'in'; });
    var hasRent = exists.some(function (i) { return i.category === 'إيجار سيارة'; });
    var hasExp = exists.some(function (i) { return i.category === 'مصاريف تنفيذ'; });
    var body =
      '<p class="small muted" style="margin-top:0">بإقفال الصفقة تُنشأ الفواتير المحدّدة أدناه في البوابة المالية، وتظهر الصفقة في «متابعة السداد».</p>' +
      '<div style="display:grid;gap:10px">' +
      chk('mkIn', 'فاتورة عميل (وارد) — ' + VH.moneyTxt(t.revenueTotal) + ' شاملة ضريبة ' + VH.moneyTxt(t.vat), !hasIn, hasIn ? 'أُنشئت من قبل' : '') +
      chk('mkRent', 'فاتورة إيجار السيارة (منصرف) — ' + VH.moneyTxt(t.rent), !hasRent && t.rent > 0, hasRent ? 'أُنشئت من قبل' : (t.rent ? '' : 'لا يوجد إيجار مسجّل')) +
      chk('mkExp', 'فاتورة مصاريف التنفيذ (منصرف) — ' + VH.moneyTxt(t.expenses), !hasExp && t.expenses > 0, hasExp ? 'أُنشئت من قبل' : (t.expenses ? '' : 'لا توجد مصاريف')) +
      '</div>' +
      '<p class="small" style="margin-bottom:0">صافي الربح المتوقع: <b>' + VH.moneyTxt(t.profit) + '</b></p>';

    function chk(id, label, on, dis) {
      return '<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">' +
        '<input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + ' ' + (dis ? 'disabled' : '') + ' style="margin-top:5px">' +
        '<span>' + label + (dis ? ' <span class="badge b-gray">' + dis + '</span>' : '') + '</span></label>';
    }

    VH.modal({
      title: 'إقفال الصفقة ' + VH.esc(d.code),
      body: body,
      actions: [
        {
          label: 'إقفال وإنشاء الفواتير', cls: 'btn--gold', onClick: function (close, bd) {
            var mk = function (id) { var e = bd.querySelector('#' + id); return e && e.checked && !e.disabled; };
            var made = 0;
            if (mk('mkIn')) {
              VH.finance.createInvoice({
                direction: 'in', party: d.clientName, partyPhone: d.clientPhone, partyType: 'عميل',
                dealId: d.id, dealCode: d.code,
                description: 'خدمة نقل — ' + ((d.contract || {}).carType || '') + ' / ' + ((d.contract || {}).region || '') +
                  ' (' + ((d.contract || {}).days || 0) + ' يوم)',
                amountBeforeVat: t.revenueBefore, vatRate: t.rate, vatAmount: t.vat, total: t.revenueTotal,
                category: 'إيراد خدمة', status: 'unpaid', date: (d.contract || {}).endDate || VH.today()
              }); made++;
            }
            if (mk('mkRent')) {
              var rv = VH.vat(t.rent, t.rate, true);
              VH.finance.createInvoice({
                direction: 'out', party: (d.rental || {}).officeName || 'مكتب الإيجار', partyType: 'مكتب تأجير',
                dealId: d.id, dealCode: d.code,
                description: 'إيجار سيارة ' + ((d.contract || {}).carType || '') + ' لمدة ' + ((d.contract || {}).days || 0) + ' يوم',
                amountBeforeVat: rv.before, vatRate: t.rate, vatAmount: rv.vat, total: rv.total,
                category: 'إيجار سيارة', status: 'unpaid', date: (d.contract || {}).endDate || VH.today()
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
            close(); VH.toast('أُلغيت الصفقة', 'warn');
            if (after) after();
          }
        },
        { label: 'تراجع', cls: 'btn--ghost' }
      ]
    });
  };

  O.reopen = function (d, after) {
    VH.confirm('إعادة فتح الصفقة', 'ستعود الصفقة إلى المرحلة المناسبة حسب البيانات المسجّلة.', 'إعادة الفتح', function () {
      d.stage = (d.expenses || []).length ? 'expenses' : (d.driver || {}).name ? 'driver'
        : (d.rental || {}).status === 'تم التعاقد' ? 'assigned' : (d.contract || {}).price ? 'office' : 'negotiation';
      if (d.negotiationStatus === 'ملغي') d.negotiationStatus = 'قيد التنفيذ';
      O.push(d, 'أُعيد فتح الصفقة');
      VH.store.save('deals', d);
      VH.store.log('إعادة فتح', d.code, d.id);
      VH.toast('أُعيد فتح الصفقة', 'ok');
      if (after) after();
    });
  };

  /* =====================================================================
     العرض — لوحة العمليات (كانبان)
     ===================================================================== */
  function dealCard(d) {
    var c = d.contract || {}, t = O.calc(d);
    var who = d.assignee || d.owner;
    return '<button class="deal-card" data-go="' + d.id + '">' +
      '<b>' + VH.esc(d.clientName) + '</b>' +
      '<div class="meta"><span class="num">' + VH.esc(d.code) + '</span>' +
      (c.carType ? '<span>· ' + VH.esc(c.carType) + '</span>' : '') +
      (c.region ? '<span>· ' + VH.esc(c.region) + '</span>' : '') + '</div>' +
      (c.startDate ? '<div class="meta"><span class="num">' + c.startDate + ' → ' + c.endDate + '</span>' +
        '<span>· <span class="num">' + c.days + '</span> يوم</span></div>' : '') +
      (t.revenueTotal ? '<div class="meta"><span>💰 <span class="num">' + VH.fmt(t.revenueTotal) + '</span> ر.س</span></div>' : '') +
      '<span class="who">' + VH.avatar(VH.store.employeeName(who)) + VH.esc(VH.store.employeeName(who)) + '</span>' +
      '</button>';
  }

  O.board = function () {
    var f = O._bf || {};
    var all = O.filtered(f);
    var cols = VH.STAGES.filter(function (s) { return s.k !== 'cancelled'; });
    var cancelled = all.filter(function (d) { return d.stage === 'cancelled'; });
    var staff = VH.store.staff();

    var html =
      '<div class="periods"><div class="periods__row">' +
      '<span class="small muted">تصفية:</span>' +
      '<button class="pbtn ' + (!f.owner ? 'is-on' : '') + '" data-ow="">كل الموظفين</button>' +
      staff.map(function (s) { return '<button class="pbtn ' + (f.owner === s.id ? 'is-on' : '') + '" data-ow="' + s.id + '">' + VH.esc(s.name) + '</button>'; }).join('') +
      '<span class="sp" style="flex:1"></span>' +
      '<input type="search" id="bq" placeholder="بحث باسم العميل أو الرقم…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:220px">' +
      '</div></div>' +
      '<div class="board">' + cols.map(function (s) {
        var items = all.filter(function (d) { return (d.stage || 'negotiation') === s.k; });
        return '<div class="col"><div class="col__h"><span class="dot" style="background:' + s.dot + '"></span>' +
          '<b>' + s.t + '</b><span class="c">' + items.length + '</span></div>' +
          (items.length ? items.map(dealCard).join('') : '<p class="small muted center" style="padding:14px 0">لا توجد صفقات</p>') +
          '</div>';
      }).join('') + '</div>' +
      (cancelled.length ? '<div class="card" style="margin-top:16px"><div class="card__h"><h2>ملغية (' + cancelled.length + ')</h2></div>' +
        '<div class="grid grid--4">' + cancelled.map(dealCard).join('') + '</div></div>' : '');

    return {
      title: 'لوحة العمليات',
      sub: 'كل صفقة ومرحلتها والموظف المسؤول عنها',
      actions: '<button class="btn btn--gold" data-new-deal>+ صفقة جديدة</button>',
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
     العرض — جدول الصفقات
     ===================================================================== */
  O.deals = function () {
    var f = O._df || {};
    var list = O.filtered(f);
    var staff = VH.store.staff();
    var rows = list.map(function (d) {
      var c = d.contract || {}, t = O.calc(d);
      return '<tr>' +
        '<td class="n">' + VH.esc(d.code) + '</td>' +
        '<td><b>' + VH.esc(d.clientName) + '</b><br><span class="small muted n">' + VH.esc(d.clientPhone || '—') + '</span></td>' +
        '<td>' + VH.stageBadge(d.stage) + '</td>' +
        '<td>' + VH.esc(c.carType || '—') + '<br><span class="small muted">' + VH.esc(c.region || '') + '</span></td>' +
        '<td class="n">' + (c.startDate ? c.startDate + '<br>' + c.endDate : '—') + '</td>' +
        '<td class="n">' + (c.days || '—') + '</td>' +
        '<td class="n">' + (t.revenueTotal ? VH.fmt(t.revenueTotal) : '—') + '</td>' +
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
        '<th>رقم العميل</th><th>العميل</th><th>المرحلة</th><th>السيارة/المنطقة</th><th>الخدمة</th><th>الأيام</th>' +
        '<th>الإيراد</th><th>التكلفة</th><th>الربح</th><th>المسؤول</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('📋', 'لا توجد صفقات مطابقة', '<button class="btn btn--gold" data-new-deal>+ صفقة جديدة</button>'));

    return {
      title: 'الصفقات والعقود',
      sub: list.length + ' صفقة',
      actions: '<button class="btn btn--ghost" data-export-deals>تصدير CSV</button><button class="btn btn--gold" data-new-deal>+ صفقة جديدة</button>',
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
    var rows = [['رقم العميل', 'العميل', 'الجوال', 'المرحلة', 'حالة التفاوض', 'السيارة', 'المنطقة', 'اللوحة', 'بداية', 'نهاية', 'أيام',
      'السعر', 'مكتب الإيجار', 'إيجار/يوم', 'إجمالي الإيجار', 'السواق', 'المصاريف', 'التكلفة', 'الربح', 'المسؤول', 'المنفّذ']];
    O.filtered({}).forEach(function (d) {
      var c = d.contract || {}, r = d.rental || {}, t = O.calc(d);
      rows.push([d.code, d.clientName, d.clientPhone, VH.stage(d.stage).t, d.negotiationStatus, c.carType, c.region, c.plate,
        c.startDate, c.endDate, c.days, c.price, r.officeName, r.rentPerDay, r.rentTotal, (d.driver || {}).name,
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

    var c = d.contract || {}, r = d.rental || {}, dr = d.driver || {}, t = O.calc(d);
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

    /* 1 — التفاوض */
    var c1 = card(1, 'مرحلة التفاوض', cancelled ? 'is-locked' : (i >= 1 ? 'is-done' : 'is-active'), VH.negBadge(d.negotiationStatus),
      kv([['رقم العميل', '<span class="num">' + VH.esc(d.code) + '</span>'], ['اسم العميل', VH.esc(d.clientName)],
      ['جوال العميل', '<span class="num">' + VH.esc(d.clientPhone || '') + '</span>'], ['تاريخ بداية التفاوض', VH.dateAr(d.negotiationDate)],
      ['الموظف المسؤول', VH.esc(VH.store.employeeName(d.owner))]]) +
      (d.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(d.notes) + '</p>' : ''),
      '<button class="btn btn--sm btn--ghost" data-edit-neg>تعديل</button>');

    /* 2 — العقد */
    var hasC = !!c.price;
    var c2 = card(2, 'بيانات العقد', cancelled ? 'is-locked' : (hasC ? 'is-done' : (d.negotiationStatus === 'تم التفاوض' ? 'is-active' : 'is-locked')),
      hasC ? '<span class="badge b-green">مكتملة</span>' : '<span class="badge b-gray">بانتظار «تم التفاوض»</span>',
      hasC ? kv([['نوع السيارة', VH.esc(c.carType)], ['المنطقة', VH.esc(c.region)], ['لوحة السيارة', '<span class="num">' + VH.esc(c.plate || '') + '</span>'],
      ['بداية الخدمة', VH.dateAr(c.startDate)], ['نهاية الخدمة', VH.dateAr(c.endDate)], ['عدد الأيام', '<span class="num">' + c.days + '</span> يوم'],
      ['السعر', VH.money(c.price) + (c.priceVatIncluded === 'no' ? ' <span class="small muted">+ ضريبة</span>' : ' <span class="small muted">شامل الضريبة</span>')],
      ['الضريبة المستحقة', VH.money(t.vat)]])
        : '<p class="small muted" style="margin:0">تُدخل بيانات العقد عند اختيار حالة «تم التفاوض».</p>',
      hasC ? '<button class="btn btn--sm btn--ghost" data-edit-contract>تعديل</button>'
        : '<button class="btn btn--sm btn--gold" data-edit-contract>إدخال بيانات العقد</button>');

    /* 3 — مكتب الإيجار */
    var c3 = card(3, 'التفاوض مع مكتب الإيجار', st(1),
      r.status ? '<span class="badge ' + (r.status === 'تم التعاقد' ? 'b-green' : 'b-gold') + '">' + VH.esc(r.status) + '</span>' : '',
      r.officeName ? kv([['اسم المكتب', VH.esc(r.officeName)], ['جوال المكتب', '<span class="num">' + VH.esc(r.officePhone || '') + '</span>'],
      ['إيجار اليوم', VH.money(r.rentPerDay)], ['إجمالي الإيجار', VH.money(r.rentTotal)]]) +
        (r.notes ? '<p class="small muted" style="margin:12px 0 0">📝 ' + VH.esc(r.notes) + '</p>' : '')
        : '<p class="small muted" style="margin:0">لم يُسجَّل مكتب إيجار بعد.</p>',
      i >= 1 ? '<button class="btn btn--sm ' + (r.officeName ? 'btn--ghost' : 'btn--gold') + '" data-edit-office>' + (r.officeName ? 'تعديل' : 'إدخال بيانات المكتب') + '</button>' : '');

    /* 4 — الإسناد */
    var c4 = card(4, 'تحويل المهمة للموظف', st(2),
      d.assignee ? '<span class="badge b-green">' + VH.esc(VH.store.employeeName(d.assignee)) + '</span>' : '',
      d.assignee ? kv([['الموظف المنفّذ', VH.avatar(VH.store.employeeName(d.assignee)) + ' ' + VH.esc(VH.store.employeeName(d.assignee))],
      ['تعليمات', VH.esc(d.assignNote || '')]])
        : '<p class="small muted" style="margin:0">بعد التعاقد مع المكتب تُحوَّل المهمة إلى الموظف المنفّذ.</p>',
      i >= 2 ? '<button class="btn btn--sm ' + (d.assignee ? 'btn--ghost' : 'btn--gold') + '" data-assign>' + (d.assignee ? 'تغيير المنفّذ' : 'تحويل المهمة') + '</button>' : '');

    /* 5 — السواق */
    var c5 = card(5, 'التعاقد مع السواق', st(3),
      dr.name ? '<span class="badge b-green">' + VH.esc(dr.name) + '</span>' : '',
      dr.name ? kv([['اسم السواق', VH.esc(dr.name)], ['الجوال', '<span class="num">' + VH.esc(dr.phone || '') + '</span>'],
      ['الهوية', '<span class="num">' + VH.esc(dr.idNo || '') + '</span>'], ['اليومية', VH.money(dr.dailyWage)]])
        : '<p class="small muted" style="margin:0">لم يُسجَّل سواق بعد.</p>',
      i >= 3 ? '<button class="btn btn--sm ' + (dr.name ? 'btn--ghost' : 'btn--gold') + '" data-driver>' + (dr.name ? 'تعديل' : 'تسجيل السواق') + '</button>' : '');

    /* 6 — المصاريف */
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
    var quick = i >= 4 ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">' +
      KINDS.map(function (k) { return '<button class="btn btn--sm btn--ghost" data-add-exp="' + k + '">+ ' + k + '</button>'; }).join('') + '</div>' : '';
    var c6 = card(6, 'فواتير الصرف', st(4), exp.length ? '<span class="badge b-gold">' + exp.length + ' بند</span>' : '',
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
    if (!cancelled && !done && i >= 4) actions += '<button class="btn btn--gold" data-close-deal>إقفال الصفقة</button>';
    if (!cancelled && !done) actions += '<button class="btn btn--danger" data-cancel-deal>إلغاء الصفقة</button>';
    if (cancelled || done) actions += '<button class="btn btn--ghost" data-reopen>إعادة الفتح</button>';
    actions += '<a class="btn btn--ghost" href="#/o/board">رجوع</a>';

    var banner = cancelled ? '<div class="strip strip--warn"><span class="strip__ico">✕</span><div><b>هذه الصفقة ملغية</b><small>' + VH.esc(d.cancelReason || '') + '</small></div></div>' : '';

    return {
      title: VH.esc(d.clientName) + ' · ' + VH.esc(d.code),
      sub: VH.stage(d.stage).t + ' — المسؤول: ' + VH.store.employeeName(d.owner) + (d.assignee ? ' · المنفّذ: ' + VH.store.employeeName(d.assignee) : ''),
      actions: actions,
      html: banner + money + c1 + c2 + c3 + c4 + c5 + c6 + invCard + tl,
      mount: function (root) {
        var re = function () { VH.app.render(); };
        // بعض الأزرار في شريط الرأس خارج حاوية العرض، لذا نبحث في الصفحة كلها
        function on(sel, fn) { var e = root.querySelector(sel) || document.querySelector(sel); if (e) e.addEventListener('click', fn); }
        on('[data-edit-neg]', function () { O.editNeg(d, re); });
        on('[data-edit-contract]', function () { O.contractModal(d, re); });
        on('[data-edit-office]', function () { O.officeModal(d, re); });
        on('[data-assign]', function () { O.assignModal(d, re); });
        on('[data-driver]', function () { O.driverModal(d, re); });
        on('[data-close-deal]', function () { O.closeDeal(d, re); });
        on('[data-cancel-deal]', function () { O.cancelDeal(d, re); });
        on('[data-reopen]', function () { O.reopen(d, re); });
        on('[data-add-inv]', function () { VH.finance.invoiceModal(null, re, d); });
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

  O.editNeg = function (d, after) {
    var staff = VH.store.staff();
    var fields = [
      { name: 'code', label: 'رقم العميل', value: d.code, required: true },
      { name: 'clientName', label: 'اسم العميل', value: d.clientName, required: true },
      { name: 'clientPhone', label: 'جوال العميل', type: 'tel', value: d.clientPhone },
      { name: 'negotiationDate', label: 'تاريخ بداية التفاوض', type: 'date', value: d.negotiationDate, required: true },
      { name: 'negotiationStatus', label: 'الحالة', type: 'select', required: true, options: VH.NEG_STATUS.map(function (s) { return { v: s, t: s }; }), value: d.negotiationStatus },
      { name: 'owner', label: 'الموظف المسؤول', type: 'select', required: true, options: staff.map(function (s) { return { v: s.id, t: s.name }; }), value: d.owner },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true, rows: 2, value: d.notes }
    ];
    VH.modal({
      title: 'تعديل مرحلة التفاوض', body: VH.form.render(fields),
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            var was = d.negotiationStatus;
            Object.assign(d, {
              code: v.code, clientName: v.clientName, clientPhone: v.clientPhone,
              negotiationDate: v.negotiationDate, negotiationStatus: v.negotiationStatus, owner: v.owner, notes: v.notes
            });
            O.push(d, 'تعديل بيانات التفاوض' + (was !== v.negotiationStatus ? ' — الحالة: ' + v.negotiationStatus : ''));
            if (v.negotiationStatus === 'ملغي') { d.stage = 'cancelled'; d.cancelReason = d.cancelReason || 'أُلغي في مرحلة التفاوض'; }
            VH.store.save('deals', d);
            close();
            if (v.negotiationStatus === 'تم التفاوض' && !(d.contract || {}).price) {
              VH.toast('أكملي بيانات العقد للانتقال للمرحلة التالية', 'warn');
              O.contractModal(d, after);
            } else { VH.toast('حُفظ', 'ok'); if (after) after(); }
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
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
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الصفقة</th><th>العميل</th><th>النوع</th><th>الوصف</th><th>القيمة</th><th>رفعه</th></tr></thead><tbody>' +
        rows.map(function (x) {
          return '<tr><td class="n">' + VH.dateShort(x.e.date) + '</td>' +
            '<td><a href="#/o/deal/' + x.d.id + '" class="n">' + VH.esc(x.d.code) + '</a></td>' +
            '<td>' + VH.esc(x.d.clientName) + '</td><td><span class="badge b-gold">' + VH.esc(x.e.kind) + '</span></td>' +
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
    var rows = [['التاريخ', 'رقم الصفقة', 'العميل', 'النوع', 'الوصف', 'القيمة', 'رفعه']];
    VH.store.list('deals').forEach(function (d) {
      (d.expenses || []).forEach(function (e) {
        if (!VH.inRange(e.date, r)) return;
        rows.push([e.date, d.code, d.clientName, e.kind, e.note, e.amount, e.by]);
      });
    });
    VH.download('via-horizon-expenses-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر ملف المصاريف', 'ok');
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
      var rev = 0, prof = 0, exp = 0;
      mine.forEach(function (d) {
        if (d.stage === 'cancelled') return;
        var t = O.calc(d); rev += t.revenueTotal; prof += t.profit;
        (d.expenses || []).forEach(function (e) { if (e.by === s.name) exp += VH.num(e.amount); });
      });
      return '<div class="card"><div class="card__h">' +
        '<span class="av-xs" style="width:38px;height:38px;font-size:1rem">' + VH.esc(VH.initials(s.name)) + '</span>' +
        '<div><h2 style="margin:0">' + VH.esc(s.name) + '</h2><span class="small muted">موظف</span></div></div>' +
        '<div class="grid grid--2">' +
        VH.statCard({ title: 'مهام مفتوحة', value: open.length, cls: 'stat--navy', desc: 'من أصل ' + mine.length + ' صفقة' }) +
        VH.statCard({ title: 'صفقات مكتملة', value: doneD.length, cls: 'stat--in', desc: 'أُقفلت بنجاح' }) +
        VH.statCard({ title: 'إيرادات صفقاته', value: rev, cls: 'stat--net', desc: 'شاملة الضريبة' }) +
        VH.statCard({ title: 'مصاريف رفعها', value: exp, cls: 'stat--out', desc: 'بنود صرف' }) +
        '</div>' +
        (open.length ? '<div style="margin-top:14px"><b class="small">المهام المفتوحة:</b>' +
          open.map(function (d) {
            return '<div class="exp-row"><a href="#/o/deal/' + d.id + '" class="n">' + VH.esc(d.code) + '</a>' +
              '<span>' + VH.esc(d.clientName) + '</span><span class="sp"></span>' + VH.stageBadge(d.stage) + '</div>';
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
