/* =====================================================================
   النظام المحاسبي — شجرة الحسابات والقيود المزدوجة وربطها بالضريبة
   ---------------------------------------------------------------------
   • الشجرة خمسة مستويات بحسب طول رقم الحساب:
       1 → رئيسي | 2 → مجموعة | 4 → حساب عام | 6 → حساب فرعي | 10 → حساب ترحيل
     ولا يُرحَّل إلا على الحسابات التي ليس لها أبناء (حسابات الترحيل).
   • كل فاتورة تُولّد قيداً مزدوجاً متوازناً تلقائياً، وكل سداد قيداً آخر.
   • الضريبة تُرحَّل على حسابي «ضريبة المخرجات» و«ضريبة المدخلات»،
     ومنهما يُبنى الإقرار الضريبي.
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var A = {};

  /* ---------------------------------------------------------------
     شجرة الحسابات المعتمدة (من ملف «شجرة الحسابات»)
     الحسابات المعلَّمة sys هي التي يحتاجها النظام للترحيل التلقائي
     --------------------------------------------------------------- */
  var TREE = [
    ['1', 'الأصول'],
    ['11', 'الأصول الثابتة'],
    ['1120', 'أثاث وتجهيزات'],
    ['112010', 'الأثاث'],
    ['1120100001', 'أثاث وديكور'],
    ['1140', 'وسائل النقل'],
    ['114010', 'سيارات'],
    ['1140100001', 'السيارات'],
    ['1150', 'أجهزة ونظم'],
    ['115010', 'أجهزة كهربائية وإلكترونية'],
    ['1150100004', 'نظام حسابي'],
    ['1160', 'مصاريف تأسيس'],
    ['116010', 'مصاريف التأسيس'],
    ['1160100003', 'تحسينات على أماكن مستأجرة'],

    ['12', 'الأصول المتداولة'],
    ['1210', 'النقدي بالصندوق'],
    ['121001', 'الصناديق العامة'],
    ['1210010001', 'الصندوق العام', 'cash'],
    ['1220', 'النقدي بالبنوك'],
    ['122001', 'حسابات البنوك'],
    ['1220010002', 'مصرف الراجحي', 'bank'],
    ['1230', 'العملاء'],
    ['123002', 'عملاء فرع العاصمة'],
    ['1230020001', 'عملاء النقل والتأجير', 'ar'],
    ['1230020002', 'معلقات'],
    ['1250', 'الموظفين'],
    ['125002', 'موظفين فرع العاصمة 2'],
    ['1250020001', 'علي عبدالله صالح محمد'],
    ['1260', 'مدينون متنوعون'],
    ['126010', 'أرصدة مدينة أخرى'],
    ['1260100006', 'الإيجارات المدفوعة مقدماً'],
    ['1260100007', 'عهد السائقين', 'custody'],
    ['1270', 'المخزون السلعي'],
    ['127010', 'المخزون'],
    ['1270100001', 'حساب المخزون'],

    ['2', 'الخصوم'],
    ['21', 'حقوق المساهمين'],
    ['2110', 'حقوق الملكية'],
    ['211010', 'رأس المال'],
    ['2110100002', 'رأس المال الشريك ناصر'],
    ['211020', 'الأرباح والخسائر'],
    ['2110200001', 'حساب الأرباح والخسائر'],
    ['2120', 'المخصصات'],
    ['212010', 'مخصصات'],
    ['2120100002', 'مخصص إهلاك سيارات'],
    ['2130', 'احتياطيات'],
    ['213010', 'الاحتياطيات'],
    ['2130100001', 'احتياطي نظامي'],
    ['2131', 'جاري الشركاء'],
    ['21311', 'جاري الشريك'],
    ['2131100001', 'جاري الشريك ناصر'],
    ['2132', 'المستحقات'],
    ['213201', 'مستحقات'],
    ['2132010001', 'مستحق التأمينات الاجتماعية'],

    ['22', 'الخصوم المتداولة'],
    ['2210', 'الموردين'],
    ['221002', 'حسابات الموردين'],
    ['2210020001', 'شركة المسار الأصلي للتجارة'],
    ['2210020002', 'موردون متنوعون', 'ap'],
    ['2210020003', 'مكاتب تأجير السيارات', 'apRent'],
    ['2220', 'أرصدة دائنة'],
    ['222010', 'حسابات الضريبة'],
    ['2220100001', 'ضريبة المدخلات', 'vatIn'],
    ['2220100002', 'ضريبة المخرجات', 'vatOut'],
    ['2220100003', 'مدفوعات الضريبة', 'vatPaid'],
    ['222020', 'أرصدة دائنة أخرى'],
    ['2220200003', 'أرصدة تحت التسوية'],
    ['2221', 'قروض طويلة المدى'],
    ['22211', 'قروض تمويلية'],
    ['2221100101', 'قروض طويلة الأجل'],

    ['3', 'مصروفات'],
    ['31', 'مصروفات النشاط التجاري'],
    ['3110', 'مصروفات النشاط التجاري — البيع'],
    ['311010', 'مصاريف نشاط المبيعات'],
    ['3110100001', 'تكلفة المبيعات', 'cogs'],
    ['3110100002', 'إيجار سيارات من الغير', 'carRent'],
    ['311020', 'مصاريف ضمان وخدمات'],
    ['3110200002', 'أجور نقل بضاعة'],
    ['3110200003', 'مصاريف تشغيل الرحلات', 'tripExp'],
    ['3110200004', 'أجور السائقين', 'driverWage'],
    ['32', 'مصاريف إدارية وعمومية'],
    ['3210', 'مصاريف إدارية وعامة'],
    ['321010', 'مصاريف عامة للموظفين'],
    ['3210100001', 'مصروف إيجار سكن الخليج'],
    ['3210100003', 'رواتب موظفين', 'salaries'],
    ['321020', 'مصاريف إدارية وعامة'],
    ['3210200002', 'إيجارات المحل'],
    ['321040', 'مصاريف رسوم حكومية'],
    ['3210400002', 'مصاريف خروج وعودة'],
    ['3210400003', 'رسوم حكومية أخرى', 'govFees'],
    ['321050', 'مصاريف فواتير ومستحقات'],
    ['3210500002', 'مصاريف فواتير كهرباء'],
    ['3210500003', 'اشتراكات وخدمات', 'subs'],
    ['321060', 'مصاريف وجبات وضيافة وإكراميات'],
    ['3210600001', 'وجبات موظفين'],
    ['321070', 'مصاريف أجهزة وقرطاسية'],
    ['3210700001', 'مصاريف أثاث مكتبي'],
    ['321080', 'مصاريف تسويق وعمولات'],
    ['3210800001', 'تسويق وإعلان', 'marketing'],
    ['3210800002', 'عمولات', 'commission'],
    ['321090', 'مصاريف أخرى'],
    ['3210900001', 'مصروف آخر', 'otherExp'],

    ['4', 'إيرادات'],
    ['41', 'إيرادات النشاط التجاري'],
    ['4110', 'إيرادات النشاط التجاري — بيع'],
    ['411010', 'المبيعات'],
    ['4110100001', 'حساب المبيعات', 'sales'],
    ['4110100002', 'إيرادات خدمات النقل والتأجير', 'service'],
    ['411020', 'مردود المبيعات'],
    ['4110200001', 'مردود المبيعات'],
    ['4120', 'إيرادات النشاط التجاري — مشتريات'],
    ['412010', 'إيرادات وخصومات'],
    ['4120100001', 'خصم مكتسب'],
    ['4130', 'إيرادات النشاط التجاري — مختلفة'],
    ['413010', 'إيرادات أخرى'],
    ['4130100001', 'إيرادات فرق التحويل المخزني'],
    ['4130100002', 'إيراد آخر', 'otherRev']
  ];

  A.DEFAULT = TREE.map(function (r) { return { no: r[0], name: r[1], sys: r[2] || '' }; });

  /* ---------------- أدوات الشجرة ---------------- */
  A.level = function (no) {
    var n = String(no || '').length;
    return n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : n <= 6 ? 4 : 5;
  };
  A.kind = function (no) {
    var f = String(no || '').charAt(0);
    return f === '1' ? 'asset' : f === '2' ? 'liability' : f === '3' ? 'expense' : f === '4' ? 'revenue' : '';
  };
  A.KIND_AR = { asset: 'أصول', liability: 'خصوم', expense: 'مصروفات', revenue: 'إيرادات' };
  /** الطبيعة: الأصول والمصروفات مدينة، والخصوم والإيرادات دائنة */
  A.natural = function (no) {
    var k = A.kind(no);
    return (k === 'asset' || k === 'expense') ? 'debit' : 'credit';
  };
  A.parentNo = function (no) {
    no = String(no || '');
    var cuts = [1, 2, 4, 6];
    for (var i = cuts.length - 1; i >= 0; i--) if (no.length > cuts[i]) return no.slice(0, cuts[i]);
    return '';
  };

  A.list = function () {
    var l = VH.store.list('accounts');
    return l.sort(function (a, b) { return String(a.no).localeCompare(String(b.no)); });
  };
  A.get = function (no) {
    return A.list().filter(function (x) { return String(x.no) === String(no); })[0] || null;
  };
  A.name = function (no) { var a = A.get(no); return a ? a.name : (no || '—'); };
  A.children = function (no) {
    return A.list().filter(function (x) { return A.parentNo(x.no) === String(no); });
  };
  A.isLeaf = function (no) { return !A.children(no).length; };
  A.leaves = function () { return A.list().filter(function (x) { return A.isLeaf(x.no); }); };

  /** يزرع الشجرة أول مرة (ولا يلمس ما أضافه المستخدم) */
  A.seed = function (force) {
    var have = {};
    A.list().forEach(function (x) { have[String(x.no)] = x; });
    var added = 0;
    A.DEFAULT.forEach(function (d) {
      var cur = have[d.no];
      if (cur) {
        // نحدّث علامة النظام فقط إن غابت، ولا نغيّر اسماً عدّله المستخدم
        if (d.sys && cur.sys !== d.sys) { cur.sys = d.sys; VH.store.save('accounts', cur); }
        return;
      }
      VH.store.save('accounts', { id: 'acc_' + d.no, no: d.no, name: d.name, sys: d.sys, builtin: true });
      added++;
    });
    if (added) VH.store.log('شجرة الحسابات', 'أُضيف ' + added + ' حساباً من الشجرة المعتمدة');
    return added;
  };
  A.ready = function () { return A.list().length > 0; };

  /* ---------------------------------------------------------------
     ربط حسابات النظام — أي حساب يُرحَّل عليه كل نوع حركة
     --------------------------------------------------------------- */
  A.SLOTS = [
    { k: 'ar', t: 'ذمم العملاء (مدينون)', hint: 'يُرحَّل عليه إجمالي فاتورة العميل' },
    { k: 'ap', t: 'ذمم الموردين (دائنون)', hint: 'إجمالي فواتير المنصرف غير المسددة' },
    { k: 'apRent', t: 'مكاتب تأجير السيارات', hint: 'دائنية إيجار السيارات' },
    { k: 'bank', t: 'الحساب البنكي', hint: 'التحصيل والسداد بالتحويل أو الشبكة' },
    { k: 'cash', t: 'الصندوق النقدي', hint: 'التحصيل والسداد نقداً' },
    { k: 'vatOut', t: 'ضريبة المخرجات', hint: 'ضريبة فواتير البيع' },
    { k: 'vatIn', t: 'ضريبة المدخلات', hint: 'ضريبة فواتير الشراء والمصاريف' },
    { k: 'vatPaid', t: 'مدفوعات الضريبة', hint: 'ما سُدّد للهيئة' },
    { k: 'service', t: 'إيراد خدمة', hint: 'إيراد النقل والتأجير' },
    { k: 'sales', t: 'إيراد المبيعات', hint: 'لباقي أنواع الإيراد' },
    { k: 'otherRev', t: 'إيراد آخر' },
    { k: 'carRent', t: 'إيجار سيارة (مصروف)' },
    { k: 'tripExp', t: 'مصاريف تنفيذ الرحلات' },
    { k: 'driverWage', t: 'أجور السائقين' },
    { k: 'custody', t: 'عهد السائقين (مدينة)' },
    { k: 'salaries', t: 'رواتب وأجور' },
    { k: 'commission', t: 'عمولات' },
    { k: 'marketing', t: 'تسويق وإعلان' },
    { k: 'govFees', t: 'رسوم حكومية' },
    { k: 'subs', t: 'اشتراكات' },
    { k: 'cogs', t: 'تكلفة المبيعات' },
    { k: 'otherExp', t: 'مصروف آخر' }
  ];

  /** الربط الفعلي: ما حفظه المستخدم، وإلا الحساب المعلَّم في الشجرة */
  A.map = function () {
    var saved = VH.store.settings().accMap || {};
    var out = {};
    A.list().forEach(function (x) { if (x.sys && !out[x.sys]) out[x.sys] = x.no; });
    Object.keys(saved).forEach(function (k) { if (saved[k]) out[k] = saved[k]; });
    return out;
  };
  A.acc = function (slot) { return A.map()[slot] || ''; };

  /** حساب المصروف المقابل لتصنيف الفاتورة */
  var CAT_SLOT = {
    'إيجار سيارة': 'carRent',
    'مصاريف تنفيذ': 'tripExp',
    'رواتب وأجور': 'salaries',
    'عمولات': 'commission',
    'تسويق وإعلان': 'marketing',
    'رسوم حكومية': 'govFees',
    'اشتراكات': 'subs',
    'مصروف آخر': 'otherExp',
    'إيراد خدمة': 'service',
    'دفعة مقدمة': 'service',
    'إيراد آخر': 'otherRev'
  };
  A.slotForCategory = function (cat, dir) {
    return CAT_SLOT[cat] || (dir === 'in' ? 'sales' : 'otherExp');
  };
  /** حساب النقدية بحسب طريقة السداد */
  A.cashAcc = function (method) {
    return method === 'نقد' ? (A.acc('cash') || A.acc('bank')) : (A.acc('bank') || A.acc('cash'));
  };

  /* ---------------------------------------------------------------
     القيود
     --------------------------------------------------------------- */
  A.sum = function (lines) {
    return lines.reduce(function (a, l) {
      a.d += VH.num(l.debit); a.c += VH.num(l.credit); return a;
    }, { d: 0, c: 0 });
  };
  A.balanced = function (lines) {
    var s = A.sum(lines);
    return Math.abs(VH.round2(s.d) - VH.round2(s.c)) < 0.01;
  };

  A.nextNo = function () {
    var s = VH.store.settings(), seq = VH.num(s.journalSeq) || 1, y = new Date().getFullYear();
    VH.store.saveSettings({ journalSeq: seq + 1 });
    return 'J-' + y + '-' + String(seq).padStart(4, '0');
  };

  /**
   * يحفظ قيداً. يُستبدل القيد السابق لنفس المرجع (refType+refId+part)
   * حتى لا تتكرر القيود عند تعديل الفاتورة.
   */
  A.post = function (o) {
    var lines = (o.lines || []).filter(function (l) { return l.acc && (VH.num(l.debit) || VH.num(l.credit)); });
    var key = o.refType + ':' + o.refId + ':' + (o.part || 'main');
    var old = VH.store.list('journal').filter(function (j) { return j.key === key; });
    if (!lines.length || !A.balanced(lines)) {
      old.forEach(function (j) { VH.store.remove('journal', j.id); });
      if (lines.length) console.error('قيد غير متوازن — لم يُحفظ', o, A.sum(lines));
      return null;
    }
    var entry = Object.assign({}, old[0] || {}, {
      key: key, no: (old[0] || {}).no || A.nextNo(),
      date: o.date || VH.today(), desc: o.desc || '',
      refType: o.refType, refId: o.refId, refNo: o.refNo || '', part: o.part || 'main',
      dealId: o.dealId || '', lines: lines,
      total: VH.round2(A.sum(lines).d),
      by: (VH.auth.user() || {}).name || '', at: VH.stamp()
    });
    old.slice(1).forEach(function (j) { VH.store.remove('journal', j.id); });
    return VH.store.save('journal', entry);
  };
  A.unpost = function (refType, refId) {
    VH.store.list('journal')
      .filter(function (j) { return j.refType === refType && j.refId === refId; })
      .forEach(function (j) { VH.store.remove('journal', j.id); });
  };
  A.entriesOf = function (refType, refId) {
    return VH.store.list('journal').filter(function (j) { return j.refType === refType && j.refId === refId; });
  };

  /**
   * ترحيل فاتورة: قيد للاستحقاق وقيد للسداد (إن وُجد سداد كامل أو جزئي).
   *   بيع   : من ح/ العملاء        إلى ح/ الإيراد + ح/ ضريبة المخرجات
   *   شراء  : من ح/ المصروف + ح/ ضريبة المدخلات   إلى ح/ الموردين
   *   السداد: من ح/ البنك أو الصندوق إلى ح/ العملاء   (والعكس في الشراء)
   */
  A.postInvoice = function (inv) {
    if (!inv || !A.ready()) return;
    var net = VH.num(inv.amountBeforeVat), vat = VH.num(inv.vatAmount), tot = VH.num(inv.total);
    var isIn = inv.direction === 'in';
    var party = inv.party || (isIn ? 'عميل' : 'مورّد');
    var slot = A.slotForCategory(inv.category, inv.direction);
    var incomeAcc = A.acc(slot) || A.acc(isIn ? 'sales' : 'otherExp');
    var arAcc = A.acc('ar'), apAcc = inv.category === 'إيجار سيارة' ? (A.acc('apRent') || A.acc('ap')) : A.acc('ap');
    var desc = (isIn ? 'فاتورة بيع ' : 'فاتورة شراء ') + inv.no + ' — ' + party +
      (inv.dealCode ? ' (' + inv.dealCode + ')' : '');

    var lines = isIn
      ? [
        { acc: arAcc, debit: tot, credit: 0, desc: 'ذمة ' + party },
        { acc: incomeAcc, debit: 0, credit: net, desc: inv.description || inv.category || 'إيراد' },
        { acc: A.acc('vatOut'), debit: 0, credit: vat, desc: 'ضريبة مخرجات ' + VH.fmt(inv.vatRate) + '%' }
      ]
      : [
        { acc: incomeAcc, debit: net, credit: 0, desc: inv.description || inv.category || 'مصروف' },
        { acc: A.acc('vatIn'), debit: vat, credit: 0, desc: 'ضريبة مدخلات ' + VH.fmt(inv.vatRate) + '%' },
        { acc: apAcc, debit: 0, credit: tot, desc: 'ذمة ' + party }
      ];
    A.post({
      refType: 'invoice', refId: inv.id, refNo: inv.no, part: 'main',
      date: inv.date, desc: desc, dealId: inv.dealId, lines: lines
    });

    // قيد السداد بما حُصّل فعلاً (يتحدّث مع السداد الجزئي)
    var paid = VH.finance.paidOf(inv);
    if (paid > 0.009) {
      var cash = A.cashAcc(inv.method);
      var pl = isIn
        ? [{ acc: cash, debit: paid, credit: 0, desc: 'تحصيل من ' + party },
          { acc: arAcc, debit: 0, credit: paid, desc: 'إقفال ذمة ' + party }]
        : [{ acc: apAcc, debit: paid, credit: 0, desc: 'سداد لـ ' + party },
          { acc: cash, debit: 0, credit: paid, desc: 'صرف نقدي/بنكي' }];
      A.post({
        refType: 'invoice', refId: inv.id, refNo: inv.no, part: 'pay',
        date: inv.paidDate || inv.date, dealId: inv.dealId,
        desc: (isIn ? 'تحصيل ' : 'سداد ') + inv.no + ' — ' + party +
          (paid < tot - 0.009 ? ' (سداد جزئي)' : ''),
        lines: pl
      });
    } else {
      VH.store.list('journal').filter(function (j) { return j.key === 'invoice:' + inv.id + ':pay'; })
        .forEach(function (j) { VH.store.remove('journal', j.id); });
    }
  };

  /** عهدة سائق: من ح/ عهد السائقين إلى ح/ النقدية */
  A.postCustody = function (d, c) {
    if (!A.ready()) return;
    A.post({
      refType: 'custody', refId: c.id, refNo: d.code, part: 'main',
      date: c.date, dealId: d.id,
      desc: 'عهدة للسائق ' + (c.driverName || '') + ' — ' + d.code,
      lines: [
        { acc: A.acc('custody'), debit: VH.num(c.amount), credit: 0, desc: 'عهدة ' + (c.driverName || '') },
        { acc: A.cashAcc(c.method), debit: 0, credit: VH.num(c.amount), desc: c.method || 'صرف' }
      ]
    });
  };

  /** إعادة ترحيل كل الفواتير والعهد — لإصلاح الدفاتر بعد تغيير الربط */
  A.rebuild = function () {
    var n = 0;
    VH.store.list('invoices').forEach(function (i) { A.postInvoice(i); n++; });
    VH.store.list('deals').forEach(function (d) {
      (d.custody || []).forEach(function (c) { A.postCustody(d, c); n++; });
    });
    VH.store.log('محاسبة', 'أُعيد ترحيل ' + n + ' حركة');
    return n;
  };

  /* ---------------------------------------------------------------
     الأرصدة والتقارير
     --------------------------------------------------------------- */
  /** حركة كل حساب ترحيل خلال فترة */
  A.movements = function (range) {
    var m = {};
    VH.store.list('journal').forEach(function (j) {
      if (range && !VH.inRange(j.date, range)) return;
      (j.lines || []).forEach(function (l) {
        var a = m[l.acc] = m[l.acc] || { acc: l.acc, debit: 0, credit: 0, n: 0 };
        a.debit += VH.num(l.debit); a.credit += VH.num(l.credit); a.n++;
      });
    });
    Object.keys(m).forEach(function (k) {
      var a = m[k];
      a.debit = VH.round2(a.debit); a.credit = VH.round2(a.credit);
      a.balance = VH.round2(A.natural(k) === 'debit' ? a.debit - a.credit : a.credit - a.debit);
    });
    return m;
  };
  /** رصيد حساب (مع أبنائه) */
  A.balanceOf = function (no, range) {
    var m = A.movements(range), sum = 0;
    Object.keys(m).forEach(function (k) {
      if (k === String(no) || k.indexOf(String(no)) === 0) {
        sum += A.natural(k) === 'debit' ? (m[k].debit - m[k].credit) : (m[k].credit - m[k].debit);
      }
    });
    return VH.round2(sum);
  };
  /** الإقرار الضريبي من حسابات الضريبة مباشرة */
  A.vatReturn = function (range) {
    var m = A.movements(range);
    var o = m[A.acc('vatOut')] || { debit: 0, credit: 0 };
    var i = m[A.acc('vatIn')] || { debit: 0, credit: 0 };
    var p = m[A.acc('vatPaid')] || { debit: 0, credit: 0 };
    var out = VH.round2(o.credit - o.debit);
    var inp = VH.round2(i.debit - i.credit);
    return { output: out, input: inp, paid: VH.round2(p.debit - p.credit), due: VH.round2(out - inp) };
  };

  /* =====================================================================
     العرض — شجرة الحسابات
     ===================================================================== */
  A.treePage = function () {
    if (!A.ready()) A.seed();
    var f = A._tf || {};
    var all = A.list();
    var mv = A.movements(VH.app.period());
    var q = (f.q || '').trim();

    function rowsFor(parent, depth) {
      return A.list().filter(function (x) { return A.parentNo(x.no) === parent; })
        .map(function (x) {
          var kids = rowsFor(x.no, depth + 1);
          var leaf = !A.children(x.no).length;
          var bal = A.balanceOf(x.no, VH.app.period());
          var m = mv[x.no] || { debit: 0, credit: 0 };
          var hit = !q || x.name.indexOf(q) > -1 || String(x.no).indexOf(q) > -1;
          var kidsHtml = kids.join('');
          if (!hit && !kidsHtml) return '';
          return '<tr class="' + (leaf ? '' : 'is-group') + '" style="' + (leaf ? '' : 'background:var(--vh-surface-2);font-weight:600') + '">' +
            '<td class="n" style="padding-inline-start:' + (10 + depth * 18) + 'px">' +
            (leaf ? '<span style="opacity:.5">•</span> ' : '<b>▾</b> ') + VH.esc(x.no) + '</td>' +
            '<td style="padding-inline-start:' + (depth * 18) + 'px">' + VH.esc(x.name) +
            (x.sys ? ' <span class="badge b-mint" style="font-size:.68rem">حساب نظام</span>' : '') + '</td>' +
            '<td>' + (leaf ? '<span class="badge b-gray">ترحيل</span>' : '<span class="badge b-sky">مستوى ' + A.level(x.no) + '</span>') + '</td>' +
            '<td class="n">' + (m.debit ? VH.fmt(m.debit) : '—') + '</td>' +
            '<td class="n">' + (m.credit ? VH.fmt(m.credit) : '—') + '</td>' +
            '<td class="n"><b>' + (bal ? VH.fmt(bal) : '—') + '</b></td>' +
            '<td class="actions">' +
            (leaf ? '<a class="btn btn--sm btn--ghost" href="#/f/ledger/' + VH.esc(x.no) + '">كشف</a>' : '') +
            (VH.auth.isManager() ? '<button class="btn btn--sm btn--ghost" data-edit-acc="' + VH.esc(x.no) + '">تعديل</button>' +
              '<button class="btn btn--sm btn--ghost" data-add-acc="' + VH.esc(x.no) + '">+ فرعي</button>' +
              (leaf && !x.sys && !m.n ? '<button class="btn btn--sm btn--danger" data-del-acc="' + VH.esc(x.no) + '">حذف</button>' : '') : '') +
            '</td></tr>' + kidsHtml;
        });
    }
    var body = ['1', '2', '3', '4'].map(function (r) { return rowsFor(A.parentNo(r), 0); }).join('');
    body = rowsFor('', 0).join('');

    var html = VH.app.periodBar() +
      '<div class="periods"><div class="periods__row">' +
      '<span class="small muted">' + all.length + ' حساباً · ' + A.leaves().length + ' حساب ترحيل</span>' +
      '<span style="flex:1"></span>' +
      '<input type="search" id="accq" placeholder="بحث باسم الحساب أو رقمه…" value="' + VH.esc(f.q || '') + '" style="padding:7px 12px;border:1px solid var(--vh-border);border-radius:999px;min-width:240px">' +
      '</div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:150px">رقم الحساب</th><th>اسم الحساب</th>' +
      '<th style="width:110px">النوع</th><th style="width:110px">مدين</th><th style="width:110px">دائن</th>' +
      '<th style="width:120px">الرصيد</th><th style="width:210px"></th></tr></thead><tbody>' + body + '</tbody></table></div>';

    return {
      title: 'شجرة الحسابات',
      sub: 'الدليل المحاسبي المعتمد — الحركة والأرصدة خلال الفترة المختارة',
      actions: '<button class="btn btn--ghost" data-export-acc>تصدير CSV</button>' +
        (VH.auth.isManager() ? '<button class="btn btn--ghost" data-acc-map>ربط الحسابات</button>' +
          '<button class="btn btn--gold" data-add-acc="">+ حساب جديد</button>' : ''),
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        var s = root.querySelector('#accq');
        if (s) s.addEventListener('input', VH.debounce(function () {
          A._tf = { q: s.value }; VH.app.render();
          var n = document.getElementById('accq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
        }, 300));
        root.querySelectorAll('[data-edit-acc]').forEach(function (b) {
          b.addEventListener('click', function () { A.accModal(b.getAttribute('data-edit-acc'), null, VH.app.render); });
        });
        document.querySelectorAll('[data-add-acc]').forEach(function (b) {
          b.addEventListener('click', function () { A.accModal(null, b.getAttribute('data-add-acc'), VH.app.render); });
        });
        root.querySelectorAll('[data-del-acc]').forEach(function (b) {
          b.addEventListener('click', function () {
            var no = b.getAttribute('data-del-acc'), a = A.get(no);
            VH.confirm('حذف حساب', 'سيُحذف الحساب ' + VH.esc(no) + ' — ' + VH.esc(a.name) + ' (لا توجد عليه حركة).', 'حذف', function () {
              VH.store.remove('accounts', a.id);
              VH.store.log('شجرة الحسابات', 'حذف الحساب ' + no);
              VH.toast('حُذف الحساب', 'warn'); VH.app.render();
            }, true);
          });
        });
        var em = document.querySelector('[data-acc-map]');
        if (em) em.addEventListener('click', function () { A.mapModal(VH.app.render); });
        var ex = document.querySelector('[data-export-acc]');
        if (ex) ex.addEventListener('click', A.exportTree);
      }
    };
  };

  A.exportTree = function () {
    var mv = A.movements(VH.app.period());
    var rows = [['رقم الحساب', 'اسم الحساب', 'المستوى', 'التصنيف', 'الطبيعة', 'حساب ترحيل', 'مدين', 'دائن', 'الرصيد']];
    A.list().forEach(function (x) {
      var m = mv[x.no] || { debit: 0, credit: 0 };
      rows.push([x.no, x.name, A.level(x.no), A.KIND_AR[A.kind(x.no)] || '',
        A.natural(x.no) === 'debit' ? 'مدين' : 'دائن', A.isLeaf(x.no) ? 'نعم' : 'لا',
        m.debit, m.credit, A.balanceOf(x.no, VH.app.period())]);
    });
    VH.download('via-horizon-accounts-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّرت شجرة الحسابات', 'ok');
  };

  A.accModal = function (no, parentNo, after) {
    var cur = no ? A.get(no) : null;
    var parent = cur ? A.parentNo(cur.no) : (parentNo || '');
    var lvl = A.level((cur ? cur.no : parent + '0000').toString());
    var fields = [
      {
        name: 'parent', label: 'يتبع حساب', type: 'select',
        options: [{ v: '', t: '— حساب رئيسي —' }].concat(
          A.list().filter(function (x) { return A.level(x.no) < 5; })
            .map(function (x) { return { v: x.no, t: x.no + ' — ' + x.name }; })),
        value: parent, readonly: !!cur
      },
      { name: 'no', label: 'رقم الحساب', required: true, value: cur ? cur.no : '', attrs: ' dir="ltr" inputmode="numeric"', readonly: !!cur, hint: 'الطول يحدّد المستوى: 1 / 2 / 4 / 6 / 10 أرقام' },
      { name: 'name', label: 'اسم الحساب', required: true, value: cur ? cur.name : '' },
      { name: 'notes', label: 'ملاحظات', value: cur ? cur.notes : '' }
    ];
    VH.modal({
      title: cur ? 'تعديل الحساب ' + VH.esc(cur.no) : 'حساب جديد',
      body: VH.form.render(fields),
      onOpen: function (bd) {
        if (cur) return;
        var ps = bd.querySelector('[data-f=parent]'), ni = bd.querySelector('[data-f=no]');
        function suggest() {
          var p = ps.value;
          var kids = A.children(p).map(function (x) { return x.no; }).sort();
          var len = p.length < 1 ? 1 : p.length < 2 ? 2 : p.length < 4 ? 4 : p.length < 6 ? 6 : 10;
          var next;
          if (kids.length) {
            var last = kids[kids.length - 1];
            next = String(VH.num(last) + 1).padStart(last.length, '0');
          } else {
            next = (p || '1') + '0'.repeat(Math.max(0, len - (p || '1').length));
            if (!p) next = '5';
          }
          ni.value = next;
        }
        ps.addEventListener('change', suggest); suggest();
      },
      actions: [
        {
          label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.validate(bd, fields); if (!v) return;
            if (cur) {
              cur.name = v.name; cur.notes = v.notes;
              VH.store.save('accounts', cur);
              VH.store.log('شجرة الحسابات', 'تعديل الحساب ' + cur.no + ' — ' + cur.name);
            } else {
              var n = String(v.no).replace(/\D/g, '');
              if (!n) { VH.form.error(bd, 'رقم الحساب أرقام فقط'); return; }
              if ([1, 2, 4, 6, 10].indexOf(n.length) < 0) { VH.form.error(bd, 'طول رقم الحساب لا بد أن يكون 1 أو 2 أو 4 أو 6 أو 10 أرقام'); return; }
              if (A.get(n)) { VH.form.error(bd, 'هذا الرقم مستخدم بالفعل'); return; }
              if (v.parent && n.indexOf(v.parent) !== 0) { VH.form.error(bd, 'رقم الحساب لا بد أن يبدأ برقم الحساب الأب ' + v.parent); return; }
              VH.store.save('accounts', { no: n, name: v.name, notes: v.notes, sys: '' });
              VH.store.log('شجرة الحسابات', 'حساب جديد ' + n + ' — ' + v.name);
            }
            close(); VH.toast('حُفظ الحساب', 'ok'); if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  A.mapModal = function (after) {
    var m = A.map();
    var leaves = A.leaves();
    var fields = [{
      name: '_h', type: 'html', full: true,
      html: '<p class="small muted" style="margin:0">اختاري حساب الترحيل لكل نوع حركة. ' +
        'كل فاتورة تُرحَّل تلقائياً على هذه الحسابات، ومنها يُبنى ميزان المراجعة والإقرار الضريبي.</p>'
    }].concat(A.SLOTS.map(function (s) {
      return {
        name: s.k, label: s.t, type: 'select', value: m[s.k] || '', hint: s.hint || '',
        options: [{ v: '', t: '— بدون —' }].concat(leaves.map(function (x) { return { v: x.no, t: x.no + ' — ' + x.name }; }))
      };
    }));
    VH.modal({
      title: 'ربط حسابات النظام',
      wide: true,
      body: VH.form.render(fields),
      actions: [
        {
          label: 'حفظ الربط', cls: 'btn--gold', onClick: function (close, bd) {
            var v = VH.form.read(bd);
            var out = {};
            A.SLOTS.forEach(function (s) { out[s.k] = v[s.k] || ''; });
            VH.store.saveSettings({ accMap: out });
            VH.store.log('محاسبة', 'تعديل ربط حسابات النظام');
            close();
            VH.confirm('إعادة ترحيل الدفاتر',
              'هل تعيدين ترحيل كل الفواتير والعهد على الحسابات الجديدة؟ (يُنصح بذلك بعد تغيير الربط)',
              'إعادة الترحيل', function () {
                var n = A.rebuild();
                VH.toast('أُعيد ترحيل ' + n + ' حركة', 'ok'); if (after) after();
              });
            if (after) after();
          }
        },
        { label: 'إلغاء', cls: 'btn--ghost' }
      ]
    });
  };

  /* =====================================================================
     العرض — دفتر اليومية
     ===================================================================== */
  A.journalPage = function () {
    var r = VH.app.period();
    var list = VH.store.list('journal')
      .filter(function (j) { return VH.inRange(j.date, r); })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.no).localeCompare(String(a.no)); });
    var tot = list.reduce(function (a, j) { return a + VH.num(j.total); }, 0);

    var rows = list.map(function (j) {
      return '<tr><td class="n">' + VH.esc(j.no) + '</td><td class="n">' + VH.dateShort(j.date) + '</td>' +
        '<td>' + VH.esc(j.desc) + (j.dealId ? ' <a class="small n" href="#/o/deal/' + j.dealId + '">↗</a>' : '') + '</td>' +
        '<td colspan="3" style="padding:0">' +
        '<table style="width:100%;border-collapse:collapse">' +
        j.lines.map(function (l) {
          return '<tr><td style="border:0;border-top:1px solid var(--vh-border);padding:6px 10px">' +
            '<span class="num">' + VH.esc(l.acc) + '</span> — ' + VH.esc(A.name(l.acc)) +
            (l.desc ? '<br><span class="small muted">' + VH.esc(l.desc) + '</span>' : '') + '</td>' +
            '<td class="n" style="border:0;border-top:1px solid var(--vh-border);width:110px;padding:6px 10px">' + (VH.num(l.debit) ? VH.fmt(l.debit) : '') + '</td>' +
            '<td class="n" style="border:0;border-top:1px solid var(--vh-border);width:110px;padding:6px 10px">' + (VH.num(l.credit) ? VH.fmt(l.credit) : '') + '</td></tr>';
        }).join('') + '</table></td></tr>';
    }).join('');

    var html = VH.app.periodBar() +
      '<div class="grid grid--3" style="margin-bottom:16px">' +
      VH.statCard({ count: true, title: 'عدد القيود', value: list.length, cls: 'stat--navy', desc: 'خلال الفترة المختارة' }) +
      VH.statCard({ title: 'إجمالي المبالغ المرحَّلة', value: tot, cls: 'stat--net', desc: 'مجموع الطرف المدين' }) +
      VH.statCard({ count: true, title: 'حسابات تحرّكت', value: Object.keys(A.movements(r)).length, cls: 'stat--in', desc: 'حسابات ترحيل' }) +
      '</div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:130px">رقم القيد</th>' +
        '<th style="width:110px">التاريخ</th><th>البيان</th><th>الحساب</th><th style="width:110px">مدين</th>' +
        '<th style="width:110px">دائن</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : VH.empty('📒', 'لا قيود في هذه الفترة', '<p class="small muted">القيود تُنشأ تلقائياً مع كل فاتورة وسداد وعهدة.</p>'));

    return {
      title: 'دفتر اليومية',
      sub: 'كل حركة مالية بقيد مزدوج متوازن',
      actions: '<button class="btn btn--ghost" data-export-jr>تصدير CSV</button>' +
        (VH.auth.isManager() ? '<button class="btn btn--ghost" data-rebuild>إعادة ترحيل الدفاتر</button>' : ''),
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        var ex = document.querySelector('[data-export-jr]');
        if (ex) ex.addEventListener('click', A.exportJournal);
        var rb = document.querySelector('[data-rebuild]');
        if (rb) rb.addEventListener('click', function () {
          VH.confirm('إعادة ترحيل الدفاتر', 'ستُعاد كتابة قيود كل الفواتير والعهد من جديد حسب الربط الحالي.', 'إعادة الترحيل', function () {
            var n = A.rebuild(); VH.toast('أُعيد ترحيل ' + n + ' حركة', 'ok'); VH.app.render();
          });
        });
      }
    };
  };

  A.exportJournal = function () {
    var r = VH.app.period();
    var rows = [['رقم القيد', 'التاريخ', 'البيان', 'رقم الحساب', 'اسم الحساب', 'بيان السطر', 'مدين', 'دائن', 'المرجع']];
    VH.store.list('journal').filter(function (j) { return VH.inRange(j.date, r); })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .forEach(function (j) {
        j.lines.forEach(function (l) {
          rows.push([j.no, j.date, j.desc, l.acc, A.name(l.acc), l.desc, VH.num(l.debit), VH.num(l.credit), j.refNo]);
        });
      });
    VH.download('via-horizon-journal-' + VH.today() + '.csv', VH.csv(rows));
    VH.toast('صُدّر دفتر اليومية', 'ok');
  };

  /* =====================================================================
     العرض — ميزان المراجعة
     ===================================================================== */
  A.trialPage = function () {
    var r = VH.app.period();
    var mv = A.movements(r);
    var leaves = A.leaves().filter(function (x) { return mv[x.no]; });
    var t = { d: 0, c: 0, bd: 0, bc: 0 };
    var rows = leaves.map(function (x) {
      var m = mv[x.no];
      t.d += m.debit; t.c += m.credit;
      var net = m.debit - m.credit;
      if (net >= 0) t.bd += net; else t.bc += -net;
      return '<tr><td class="n">' + VH.esc(x.no) + '</td><td>' + VH.esc(x.name) + '</td>' +
        '<td>' + VH.esc(A.KIND_AR[A.kind(x.no)] || '') + '</td>' +
        '<td class="n">' + VH.fmt(m.debit) + '</td><td class="n">' + VH.fmt(m.credit) + '</td>' +
        '<td class="n"><b>' + VH.fmt(net >= 0 ? net : 0) + '</b></td>' +
        '<td class="n"><b>' + VH.fmt(net < 0 ? -net : 0) + '</b></td>' +
        '<td class="actions"><a class="btn btn--sm btn--ghost" href="#/f/ledger/' + VH.esc(x.no) + '">كشف</a></td></tr>';
    }).join('');

    var ok = Math.abs(VH.round2(t.d) - VH.round2(t.c)) < 0.01;
    // قائمة الدخل من أرصدة المصروفات والإيرادات
    var rev = 0, exp = 0;
    Object.keys(mv).forEach(function (k) {
      var kind = A.kind(k);
      if (kind === 'revenue') rev += mv[k].credit - mv[k].debit;
      if (kind === 'expense') exp += mv[k].debit - mv[k].credit;
    });

    var html = VH.app.periodBar() +
      '<div class="strip ' + (ok ? 'strip--info' : 'strip--warn') + '"><span class="strip__ico">' + (ok ? '✓' : '!') + '</span>' +
      '<div><b>' + (ok ? 'الميزان متوازن' : 'الميزان غير متوازن — راجعي القيود') + '</b>' +
      '<small>مجموع المدين ' + VH.fmt(t.d) + ' ر.س · مجموع الدائن ' + VH.fmt(t.c) + ' ر.س</small></div></div>' +
      '<div class="grid grid--3" style="margin-bottom:16px">' +
      VH.statCard({ title: 'إجمالي الإيرادات', value: VH.round2(rev), cls: 'stat--in', desc: 'قبل الضريبة' }) +
      VH.statCard({ title: 'إجمالي المصروفات', value: VH.round2(exp), cls: 'stat--out', desc: 'قبل الضريبة' }) +
      VH.statCard({ title: 'نتيجة النشاط', value: VH.round2(rev - exp), cls: 'stat--net', desc: 'إيرادات − مصروفات' }) +
      '</div>' +
      (rows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:130px">رقم الحساب</th><th>اسم الحساب</th>' +
        '<th style="width:100px">التصنيف</th><th style="width:110px">حركة مدينة</th><th style="width:110px">حركة دائنة</th>' +
        '<th style="width:110px">رصيد مدين</th><th style="width:110px">رصيد دائن</th><th style="width:80px"></th></tr></thead><tbody>' + rows +
        '</tbody><tfoot><tr style="background:var(--vh-surface-2);font-weight:700">' +
        '<th colspan="3">الإجمالي</th><th class="n">' + VH.fmt(t.d) + '</th><th class="n">' + VH.fmt(t.c) + '</th>' +
        '<th class="n">' + VH.fmt(t.bd) + '</th><th class="n">' + VH.fmt(t.bc) + '</th><th></th></tr></tfoot></table></div>'
        : VH.empty('⚖', 'لا حركة في هذه الفترة'));

    return {
      title: 'ميزان المراجعة',
      sub: 'أرصدة حسابات الترحيل خلال الفترة المختارة',
      actions: '<button class="btn btn--ghost" data-export-tb>تصدير CSV</button>',
      html: html,
      mount: function (root) {
        VH.app.bindPeriod(root);
        var ex = document.querySelector('[data-export-tb]');
        if (ex) ex.addEventListener('click', function () {
          var rows2 = [['رقم الحساب', 'اسم الحساب', 'التصنيف', 'حركة مدينة', 'حركة دائنة', 'رصيد مدين', 'رصيد دائن']];
          leaves.forEach(function (x) {
            var m = mv[x.no], net = m.debit - m.credit;
            rows2.push([x.no, x.name, A.KIND_AR[A.kind(x.no)] || '', m.debit, m.credit, net >= 0 ? net : 0, net < 0 ? -net : 0]);
          });
          VH.download('via-horizon-trial-balance-' + VH.today() + '.csv', VH.csv(rows2));
          VH.toast('صُدّر ميزان المراجعة', 'ok');
        });
      }
    };
  };

  /* =====================================================================
     العرض — كشف حساب (دفتر الأستاذ)
     ===================================================================== */
  A.ledgerPage = function (no) {
    var acct = A.get(no);
    if (!acct) return { title: 'حساب غير موجود', sub: '', actions: '', html: VH.empty('🔍', 'لم نجد هذا الحساب', '<a class="btn btn--ghost" href="#/f/accounts">رجوع للشجرة</a>'), mount: function () {} };
    var r = VH.app.period();
    var all = VH.store.list('journal').sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.no).localeCompare(String(b.no)); });
    var open = 0, rows = [], bal = 0, td = 0, tc = 0;
    all.forEach(function (j) {
      (j.lines || []).forEach(function (l) {
        if (String(l.acc) !== String(no)) return;
        var d = VH.num(l.debit), c = VH.num(l.credit);
        var delta = A.natural(no) === 'debit' ? d - c : c - d;
        if (j.date < r.from) { open += delta; return; }
        if (j.date > r.to) return;
        bal += delta; td += d; tc += c;
        rows.push('<tr><td class="n">' + VH.dateShort(j.date) + '</td><td class="n">' + VH.esc(j.no) + '</td>' +
          '<td>' + VH.esc(j.desc) + (l.desc ? '<br><span class="small muted">' + VH.esc(l.desc) + '</span>' : '') +
          (j.dealId ? ' <a class="small n" href="#/o/deal/' + j.dealId + '">↗</a>' : '') + '</td>' +
          '<td class="n">' + (d ? VH.fmt(d) : '') + '</td><td class="n">' + (c ? VH.fmt(c) : '') + '</td>' +
          '<td class="n"><b>' + VH.fmt(open + bal) + '</b></td></tr>');
      });
    });

    var html = VH.app.periodBar() +
      '<div class="card"><div class="card__h"><h2><span class="num">' + VH.esc(acct.no) + '</span> — ' + VH.esc(acct.name) + '</h2>' +
      '<span class="badge b-sky">' + VH.esc(A.KIND_AR[A.kind(acct.no)] || '') + '</span>' +
      '<span class="badge b-gray">طبيعته ' + (A.natural(acct.no) === 'debit' ? 'مدين' : 'دائن') + '</span>' +
      '<span class="sp"></span><a class="btn btn--sm btn--ghost" href="#/f/accounts">رجوع للشجرة</a></div>' +
      '<div class="grid grid--3">' +
      VH.statCard({ title: 'رصيد ما قبل الفترة', value: VH.round2(open), cls: 'stat--navy', desc: 'مرحّل' }) +
      VH.statCard({ title: 'حركة الفترة', value: VH.round2(bal), cls: 'stat--net', desc: 'مدين ' + VH.fmt(td) + ' · دائن ' + VH.fmt(tc) }) +
      VH.statCard({ title: 'الرصيد الختامي', value: VH.round2(open + bal), cls: 'stat--in', desc: 'بنهاية الفترة' }) +
      '</div></div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:110px">التاريخ</th>' +
        '<th style="width:130px">رقم القيد</th><th>البيان</th><th style="width:110px">مدين</th>' +
        '<th style="width:110px">دائن</th><th style="width:120px">الرصيد</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : VH.empty('📄', 'لا حركة على هذا الحساب في الفترة'));

    return {
      title: 'كشف حساب — ' + VH.esc(acct.name),
      sub: 'رقم الحساب ' + acct.no,
      actions: '',
      html: html,
      mount: function (root) { VH.app.bindPeriod(root); }
    };
  };

  VH.acc = A;
})(window.VH);
