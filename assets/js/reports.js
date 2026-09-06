/* =====================================================================
   التقارير: الشهري، الضريبي، طباعة الفاتورة، الإعدادات والنسخ الاحتياطي
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var R = {};

  /* =====================================================================
     التقرير الشهري
     ===================================================================== */
  R.monthly = function () {
    var inv = VH.store.list('invoices');
    var months = {};
    inv.forEach(function (i) {
      var k = VH.monthKey(i.status === 'paid' ? (i.paidDate || i.date) : i.date);
      if (!k) return;
      months[k] = months[k] || { k: k, in: 0, out: 0, vin: 0, vout: 0, nIn: 0, nOut: 0 };
      if (i.direction === 'in') { months[k].vin += VH.num(i.vatAmount); months[k].nIn++; if (i.status === 'paid') months[k].in += VH.num(i.total); }
      else { months[k].vout += VH.num(i.vatAmount); months[k].nOut++; if (i.status === 'paid') months[k].out += VH.num(i.total); }
    });
    var list = Object.keys(months).sort().reverse().map(function (k) { return months[k]; });
    var max = Math.max.apply(null, [1].concat(list.map(function (m) { return Math.max(m.in, m.out); })));

    // أعلى العملاء
    var byClient = {};
    inv.filter(function (i) { return i.direction === 'in'; }).forEach(function (i) {
      byClient[i.party] = (byClient[i.party] || 0) + VH.num(i.total);
    });
    var topClients = Object.keys(byClient).map(function (k) { return { k: k, v: byClient[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);

    // أعلى بنود الصرف
    var byCat = {};
    inv.filter(function (i) { return i.direction === 'out'; }).forEach(function (i) {
      byCat[i.category || 'غير مصنّف'] = (byCat[i.category || 'غير مصنّف'] || 0) + VH.num(i.total);
    });
    var topCats = Object.keys(byCat).map(function (k) { return { k: k, v: byCat[k] }; })
      .sort(function (a, b) { return b.v - a.v; });

    // ربحية الصفقات
    var deals = VH.store.list('deals').filter(function (d) { return d.stage !== 'cancelled' && (d.contract || {}).price; })
      .map(function (d) { return { d: d, t: VH.ops.calc(d) }; })
      .sort(function (a, b) { return b.t.profit - a.t.profit; });

    function bar(v, cls) {
      return '<div style="background:var(--vh-surface-2);border-radius:6px;height:8px;overflow:hidden;min-width:70px">' +
        '<div style="height:100%;width:' + (max ? (v / max * 100) : 0) + '%;background:var(--' + cls + ')"></div></div>';
    }

    var html =
      '<div class="card"><div class="card__h"><h2>الحركة الشهرية</h2><span class="sp"></span>' +
      '<span class="small muted">يعتمد على تاريخ السداد الفعلي للمبالغ المحصّلة والمدفوعة</span></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>الوارد</th><th></th><th>المنصرف</th><th></th>' +
        '<th>الصافي</th><th>ضريبة مخرجات</th><th>ضريبة مدخلات</th></tr></thead><tbody>' +
        list.map(function (m) {
          var net = m.in - m.out;
          return '<tr><td><b>' + VH.monthLabel(m.k) + '</b></td>' +
            '<td class="n" style="color:var(--ok)">' + VH.fmt(m.in) + '</td><td style="width:110px">' + bar(m.in, 'ok') + '</td>' +
            '<td class="n" style="color:var(--bad)">' + VH.fmt(m.out) + '</td><td style="width:110px">' + bar(m.out, 'bad') + '</td>' +
            '<td class="n"><b style="color:' + (net >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + VH.fmt(net) + '</b></td>' +
            '<td class="n">' + VH.fmt(m.vin) + '</td><td class="n">' + VH.fmt(m.vout) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : VH.empty('📅', 'لا بيانات بعد')) + '</div>' +

      '<div class="grid grid--2">' +
        '<div class="card"><div class="card__h"><h2>أعلى العملاء</h2></div>' +
        (topClients.length ? topClients.map(function (c) {
          return '<div class="exp-row"><span class="k" style="min-width:auto">' + VH.esc(c.k) + '</span><span class="sp"></span><b class="num">' + VH.fmt(c.v) + '</b><span class="small">ر.س</span></div>';
        }).join('') : '<p class="small muted" style="margin:0">لا بيانات</p>') + '</div>' +

        '<div class="card"><div class="card__h"><h2>أعلى بنود الصرف</h2></div>' +
        (topCats.length ? topCats.map(function (c) {
          return '<div class="exp-row"><span class="k" style="min-width:auto">' + VH.esc(c.k) + '</span><span class="sp"></span><b class="num">' + VH.fmt(c.v) + '</b><span class="small">ر.س</span></div>';
        }).join('') : '<p class="small muted" style="margin:0">لا بيانات</p>') + '</div>' +
      '</div>' +

      '<div class="card"><div class="card__h"><h2>ربحية الصفقات</h2></div>' +
      (deals.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الصفقة</th><th>العميل</th><th>الإيراد قبل الضريبة</th>' +
        '<th>الإيجار</th><th>المصاريف</th><th>الربح</th><th>الهامش</th><th>المسؤول</th></tr></thead><tbody>' +
        deals.map(function (x) {
          return '<tr><td><a class="n" href="#/o/deal/' + x.d.id + '">' + VH.esc(x.d.code) + '</a></td>' +
            '<td>' + VH.esc(x.d.clientName) + '</td><td class="n">' + VH.fmt(x.t.revenueBefore) + '</td>' +
            '<td class="n">' + VH.fmt(x.t.rent) + '</td><td class="n">' + VH.fmt(x.t.expenses) + '</td>' +
            '<td class="n"><b style="color:' + (x.t.profit >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + VH.fmt(x.t.profit) + '</b></td>' +
            '<td class="n">' + VH.fmt(x.t.margin) + '%</td><td>' + VH.esc(VH.store.employeeName(x.d.assignee || x.d.owner)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="small muted" style="margin:0">لا صفقات مسعّرة بعد</p>') + '</div>';

    return { title: 'التقرير الشهري', sub: 'الوارد والمنصرف والصافي شهراً بشهر', actions: '', html: html, mount: function () {} };
  };

  /* =====================================================================
     التقرير الضريبي
     ===================================================================== */
  R.tax = function () {
    var years = {};
    VH.store.list('invoices').forEach(function (i) { var y = VH.yearOf(i.date); if (y) years[y] = 1; });
    var yList = Object.keys(years).sort().reverse();
    var now = new Date();
    if (!yList.length) yList = [String(now.getFullYear())];
    var year = R._year || String(now.getFullYear());
    if (yList.indexOf(year) < 0) year = yList[0];
    var qSel = R._q || (Math.floor(now.getMonth() / 3) + 1);

    var qs = [1, 2, 3, 4].map(function (q) { return VH.finance.quarterVat(+year, q); });
    var cur = qs[qSel - 1];
    var s = VH.store.settings();

    var html =
      '<div class="periods"><div class="periods__row">' +
      '<span class="small muted">السنة:</span>' +
      yList.map(function (y) { return '<button class="pbtn ' + (String(y) === String(year) ? 'is-on' : '') + '" data-year="' + y + '">' + y + '</button>'; }).join('') +
      '<span style="width:16px"></span><span class="small muted">الربع:</span>' +
      [1, 2, 3, 4].map(function (q) { return '<button class="pbtn ' + (q === qSel ? 'is-on' : '') + '" data-q="' + q + '">الربع ' + q + '</button>'; }).join('') +
      '</div></div>' +

      (!s.taxNumber ? '<div class="strip strip--warn"><span class="strip__ico">!</span><div><b>لم يُدخل الرقم الضريبي بعد</b>' +
        '<small>أضيفيه من الإعدادات ليظهر في الفواتير المطبوعة</small></div><span class="sp"></span>' +
        '<a class="btn btn--sm btn--ghost" href="#/f/settings">الإعدادات</a></div>' : '') +

      '<div class="grid grid--4">' +
      qs.map(function (q) {
        return '<div class="stat ' + (q.q === qSel ? 'stat--net' : 'stat--navy') + '"><h3>الربع ' + q.q + ' — ' + q.year + '</h3>' +
          '<div class="v">' + VH.fmt(q.due) + '</div> <span class="small muted">ر.س</span>' +
          '<div class="d">مخرجات ' + VH.fmt(q.output) + ' · مدخلات ' + VH.fmt(q.input) + '</div></div>';
      }).join('') + '</div>' +

      '<div class="card" style="margin-top:16px"><div class="card__h"><h2>تفاصيل الربع ' + qSel + ' — ' + year + '</h2>' +
      '<span class="sp"></span><span class="small muted n">' + cur.from + ' → ' + cur.to + '</span>' +
      '<button class="btn btn--sm btn--ghost" data-export-tax>تصدير CSV</button></div>' +
      '<div class="grid grid--3" style="margin-bottom:14px">' +
      VH.statCard({ title: 'ضريبة المخرجات (على مبيعاتك)', value: cur.output, cls: 'stat--in', desc: 'من فواتير الوارد' }) +
      VH.statCard({ title: 'ضريبة المدخلات (على مشترياتك)', value: cur.input, cls: 'stat--out', desc: 'من فواتير المنصرف' }) +
      VH.statCard({ title: 'الصافي المستحق للهيئة', value: cur.due, cls: 'stat--net', desc: cur.due >= 0 ? 'يُسدَّد في الإقرار' : 'رصيد لصالحك' }) +
      '</div>' +
      (cur.list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>التاريخ</th><th>النوع</th><th>الطرف</th>' +
        '<th>قبل الضريبة</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>' +
        cur.list.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).map(function (i) {
          return '<tr><td class="n">' + VH.esc(i.no) + '</td><td class="n">' + VH.dateShort(i.date) + '</td>' +
            '<td>' + VH.dirBadge(i.direction) + '</td><td>' + VH.esc(i.party) + '</td>' +
            '<td class="n">' + VH.fmt(i.amountBeforeVat) + '</td><td class="n">' + VH.fmt(i.vatAmount) + '</td>' +
            '<td class="n">' + VH.fmt(i.total) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : VH.empty('📄', 'لا فواتير في هذا الربع')) +
      '<p class="small muted" style="margin:14px 0 0">⚠️ هذا تقرير داخلي يساعدك على تعبئة الإقرار الضريبي، وليس بديلاً عن الفوترة الإلكترونية المعتمدة من هيئة الزكاة والضريبة والجمارك.</p>' +
      '</div>';

    return {
      title: 'التقرير الضريبي', sub: 'ضريبة القيمة المضافة ربعاً بربع', actions: '', html: html,
      mount: function (root) {
        root.querySelectorAll('[data-year]').forEach(function (b) {
          b.addEventListener('click', function () { R._year = b.getAttribute('data-year'); VH.app.render(); });
        });
        root.querySelectorAll('[data-q]').forEach(function (b) {
          b.addEventListener('click', function () { R._q = +b.getAttribute('data-q'); VH.app.render(); });
        });
        var ex = root.querySelector('[data-export-tax]');
        if (ex) ex.addEventListener('click', function () {
          var rows = [['رقم الفاتورة', 'التاريخ', 'النوع', 'الطرف', 'قبل الضريبة', 'الضريبة', 'الإجمالي']];
          cur.list.forEach(function (i) {
            rows.push([i.no, i.date, i.direction === 'in' ? 'وارد' : 'منصرف', i.party, i.amountBeforeVat, i.vatAmount, i.total]);
          });
          rows.push([]); rows.push(['ضريبة المخرجات', cur.output]); rows.push(['ضريبة المدخلات', cur.input]); rows.push(['الصافي المستحق', cur.due]);
          VH.download('vat-' + year + '-Q' + qSel + '.csv', VH.csv(rows));
          VH.toast('صُدّر التقرير الضريبي', 'ok');
        });
      }
    };
  };

  /* =====================================================================
     طباعة فاتورة ضريبية مبسّطة
     ===================================================================== */
  R.printInvoice = function (inv) {
    if (!inv) return;
    var s = VH.store.settings(), c = s.company || {};
    var area = document.getElementById('printArea');
    var d = inv.dealId ? VH.store.get('deals', inv.dealId) : null;
    var when = (inv.date || VH.today()) + 'T12:00:00Z';

    area.innerHTML =
      '<div class="inv">' +
        '<div class="inv__top"><img src="assets/img/logo-color.png" alt="">' +
          '<div style="flex:1"><h2>' + VH.esc(c.name || 'شركة فيا هورايزن') + '</h2>' +
          '<div style="font-size:.82rem;color:#666">' + VH.esc(c.slogan || '') + '</div>' +
          (c.taxNumber ? '<div style="font-size:.82rem">الرقم الضريبي: <span class="num">' + VH.esc(c.taxNumber) + '</span></div>' : '') +
          (c.crNumber ? '<div style="font-size:.82rem">السجل التجاري: <span class="num">' + VH.esc(c.crNumber) + '</span></div>' : '') +
          (c.phone ? '<div style="font-size:.82rem">هاتف: <span class="num">' + VH.esc(c.phone) + '</span></div>' : '') +
          '</div>' +
          '<div style="text-align:left"><b style="font-size:1.05rem">' + (inv.direction === 'in' ? 'فاتورة ضريبية مبسّطة' : 'سند صرف') + '</b>' +
          '<div style="font-size:.85rem">رقم: <span class="num">' + VH.esc(inv.no) + '</span></div>' +
          '<div style="font-size:.85rem">التاريخ: <span class="num">' + VH.esc(inv.date) + '</span></div></div>' +
        '</div>' +

        '<h4>بيانات ' + (inv.direction === 'in' ? 'العميل' : 'المورّد') + '</h4>' +
        '<table><tr><th style="width:32%">الاسم</th><td>' + VH.esc(inv.party) + '</td></tr>' +
        (inv.partyPhone ? '<tr><th>الجوال</th><td class="num">' + VH.esc(inv.partyPhone) + '</td></tr>' : '') +
        (d ? '<tr><th>رقم الصفقة</th><td class="num">' + VH.esc(d.code) + '</td></tr>' +
          '<tr><th>تفاصيل الخدمة</th><td>' + VH.esc((d.contract || {}).carType || '') + ' — ' + VH.esc((d.contract || {}).region || '') +
          ' — من ' + VH.esc((d.contract || {}).startDate || '') + ' إلى ' + VH.esc((d.contract || {}).endDate || '') + '</td></tr>' : '') +
        '</table>' +

        '<h4>البنود</h4>' +
        '<table><thead><tr><th>الوصف</th><th style="width:18%">قبل الضريبة</th><th style="width:14%">الضريبة</th><th style="width:18%">الإجمالي</th></tr></thead>' +
        '<tbody><tr><td>' + VH.esc(inv.description || inv.category || 'خدمة') + '</td>' +
        '<td class="num">' + VH.fmt(inv.amountBeforeVat) + '</td><td class="num">' + VH.fmt(inv.vatAmount) + '</td>' +
        '<td class="num">' + VH.fmt(inv.total) + '</td></tr></tbody></table>' +

        '<div class="inv__tot">' +
          '<div><span>الإجمالي قبل الضريبة</span><span class="num">' + VH.fmt(inv.amountBeforeVat) + ' ر.س</span></div>' +
          '<div><span>ضريبة القيمة المضافة (' + VH.fmt(inv.vatRate) + '%)</span><span class="num">' + VH.fmt(inv.vatAmount) + ' ر.س</span></div>' +
          '<div class="g"><span>الإجمالي المستحق</span><span class="num">' + VH.fmt(inv.total) + ' ر.س</span></div>' +
          '<div><span>الحالة</span><span>' + (inv.status === 'paid' ? 'مسدّدة ' + (inv.paidDate || '') : 'غير مسدّدة') + '</span></div>' +
        '</div>' +

        '<div class="inv__qr"><div id="qrBox"></div>' +
        '<div>رمز الاستجابة السريعة يحتوي بيانات الفاتورة بصيغة هيئة الزكاة والضريبة والجمارك (TLV).<br>' +
        'أصدرها: ' + VH.esc(inv.createdBy || '') + ' · طُبعت في ' + VH.esc(VH.today()) + '</div></div>' +
      '</div>';

    var payload = VH.zatcaTlv(c.name || 'شركة فيا هورايزن', c.taxNumber || '', when, inv.total, inv.vatAmount);
    function go() {
      var box = document.getElementById('qrBox');
      if (box && window.QRCode) { box.innerHTML = ''; new window.QRCode(box, { text: payload, width: 110, height: 110, correctLevel: window.QRCode.CorrectLevel.M }); }
      setTimeout(function () { window.print(); }, 350);
    }
    if (window.QRCode) go();
    else {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      sc.onload = go; sc.onerror = function () { go(); };
      document.head.appendChild(sc);
    }
  };

  /* =====================================================================
     طباعة عرض السعر
     ===================================================================== */
  R.printQuote = function (d) {
    var q = d.quote || {};
    if (!q.total) { VH.toast('لا يوجد عرض سعر لطباعته', 'warn'); return; }
    var s = VH.store.settings(), c = s.company || {};
    var rate = VH.num(q.vatRate) || VH.num(s.vatRate) || 15;
    var v = q.items && q.items.length
      ? { before: q.subtotal, vat: q.vat, total: q.grandTotal }
      : VH.vat(q.total, rate, q.priceVatIncluded !== 'no');
    var area = document.getElementById('printArea');
    var itemsTable = q.items && q.items.length
      ? O_items(q)
      : '<table><thead><tr><th>البيان</th><th style="width:14%">العدد</th><th style="width:14%">الأيام</th>' +
        '<th style="width:18%">قيمة اليوم</th><th style="width:20%">الإجمالي</th></tr></thead><tbody>' +
        '<tr><td>' + VH.esc(q.carType) + ' — ' + VH.esc(q.withDriver) + ' — ' + VH.esc(q.city) + '<br>' +
        '<span style="font-size:.8rem;color:#666">من ' + VH.esc(q.startDate) + ' إلى ' + VH.esc(q.endDate) + '</span></td>' +
        '<td class="num">' + q.carsCount + '</td><td class="num">' + q.days + '</td>' +
        '<td class="num">' + VH.fmt(q.pricePerCarPerDay) + '</td><td class="num">' + VH.fmt(q.total) + '</td></tr>' +
        '</tbody></table>';
    function O_items(qq) {
      return '<table><thead><tr><th>نوع السيارة</th><th>العدد</th><th>السائق</th><th>قيمة السيارة/اليوم</th>' +
        '<th>إجمالي السيارة الواحدة</th><th>اليومي للنوع</th><th>إجمالي النوع</th></tr></thead><tbody>' +
        qq.items.map(function (i) {
          return '<tr><td>' + VH.esc(i.carType) + '</td><td class="num">' + i.carsCount + '</td><td>' + VH.esc(i.withDriver) + '</td>' +
            '<td class="num">' + VH.fmt(i.pricePerCarPerDay) + '</td><td class="num">' + VH.fmt(i.perCarTotal) + '</td>' +
            '<td class="num">' + VH.fmt(i.dailyTotal) + '</td><td class="num"><b>' + VH.fmt(i.total) + '</b></td></tr>';
        }).join('') +
        '<tr><th colspan="5" style="text-align:right">القيمة اليومية لمجموع السيارات (' + qq.carsCount + ' سيارة)</th><td class="num" colspan="2">' + VH.fmt(qq.dailyAll) + '</td></tr>' +
        '</tbody></table>' +
        '<p style="font-size:.85rem;color:#555;margin:10px 0 0">مدينة المشروع: ' + VH.esc(qq.city) + ' · الفترة: من ' + VH.esc(qq.startDate) + ' إلى ' + VH.esc(qq.endDate) + ' (' + qq.days + ' يوم)</p>';
    }

    area.innerHTML =
      '<div class="inv">' +
        '<div class="inv__top"><img src="assets/img/logo-color.png" alt="">' +
          '<div style="flex:1"><h2>' + VH.esc(c.name || 'شركة فيا هورايزن') + '</h2>' +
          '<div style="font-size:.82rem;color:#666">' + VH.esc(c.slogan || '') + '</div>' +
          (c.taxNumber ? '<div style="font-size:.82rem">الرقم الضريبي: <span class="num">' + VH.esc(c.taxNumber) + '</span></div>' : '') +
          (c.phone ? '<div style="font-size:.82rem">هاتف: <span class="num">' + VH.esc(c.phone) + '</span></div>' : '') + '</div>' +
          '<div style="text-align:left"><b style="font-size:1.05rem">عرض سعر</b>' +
          '<div style="font-size:.85rem">مرجع: <span class="num">' + VH.esc(d.code) + '</span></div>' +
          '<div style="font-size:.85rem">التاريخ: <span class="num">' + VH.esc(String(q.sentAt || VH.stamp()).slice(0, 10)) + '</span></div></div>' +
        '</div>' +

        '<h4>بيانات الجهة</h4>' +
        '<table><tr><th style="width:32%">اسم الجهة</th><td>' + VH.esc(q.orgName || d.orgName) + '</td></tr>' +
        '<tr><th>الشخص المسؤول</th><td>' + VH.esc(d.clientName || '') + '</td></tr>' +
        (d.clientPhone ? '<tr><th>الجوال</th><td class="num">' + VH.esc(d.clientPhone) + '</td></tr>' : '') +
        (d.clientEmail ? '<tr><th>الإيميل</th><td class="num">' + VH.esc(d.clientEmail) + '</td></tr>' : '') +
        '</table>' +

        '<h4>تفاصيل العرض</h4>' + itemsTable +

        '<div class="inv__tot">' +
          '<div><span>الإجمالي قبل الضريبة (' + q.days + ' يوم)</span><span class="num">' + VH.fmt(v.before) + ' ر.س</span></div>' +
          '<div><span>ضريبة القيمة المضافة (' + VH.fmt(rate) + '%)</span><span class="num">' + VH.fmt(v.vat) + ' ر.س</span></div>' +
          '<div class="g"><span>الإجمالي النهائي شامل الضريبة</span><span class="num">' + VH.fmt(v.total) + ' ر.س</span></div>' +
        '</div>' +

        (q.notes ? '<h4>ملاحظات</h4><p style="font-size:.88rem">' + VH.esc(q.notes) + '</p>' : '') +
        '<p style="font-size:.8rem;color:#666;margin-top:22px">هذا العرض ساري لمدة 14 يوماً من تاريخه. ' +
        'أعدّه: ' + VH.esc(q.sentBy || '') + '</p>' +
      '</div>';
    setTimeout(function () { window.print(); }, 250);
  };

  /* =====================================================================
     الإعدادات والنسخ الاحتياطي
     ===================================================================== */
  R.settings = function () {
    var s = VH.store.settings(), c = s.company || {};
    var isMgr = VH.auth.isManager();
    var cloud = VH.store.mode === 'cloud';

    var html =
      '<div class="strip ' + (cloud ? 'strip--info' : 'strip--warn') + '"><span class="strip__ico">' + (cloud ? '☁' : '💾') + '</span>' +
      '<div><b>' + (cloud ? 'الوضع السحابي — بيانات مشتركة بين كل الموظفين' : 'الوضع المحلي — البيانات على هذا الجهاز فقط') + '</b>' +
      '<small>' + (cloud ? 'مشروع Firebase: ' + VH.esc((window.VH_CONFIG.firebase || {}).projectId || '') : 'لتفعيل المشاركة: أضيفي مفاتيح Firebase في ملف assets/js/config.js — الخطوات في README') + '</small></div>' +
      (cloud ? '<span class="sp"></span><button class="btn btn--sm btn--ghost" data-migrate>نقل بيانات هذا الجهاز إلى السحابة</button>' : '') +
      '</div>' +

      '<div class="card"><div class="card__h"><h2>بيانات الشركة في الفواتير</h2></div>' +
      '<div class="f-grid" id="coBox">' +
      fld('co_name', 'اسم الشركة', c.name) + fld('co_tax', 'الرقم الضريبي', c.taxNumber, 'num') +
      fld('co_cr', 'السجل التجاري', c.crNumber, 'num') + fld('co_phone', 'الهاتف', c.phone, 'num') +
      fld('co_email', 'البريد', c.email) + fld('co_addr', 'العنوان', c.address) +
      '</div>' + (isMgr ? '<div style="margin-top:14px"><button class="btn btn--gold btn--sm" data-save-co>حفظ بيانات الشركة</button></div>' : '<p class="small muted">التعديل للمدير فقط</p>') + '</div>' +

      '<div class="grid grid--2">' +
      '<div class="card"><div class="card__h"><h2>الإعدادات المالية</h2></div>' +
      '<div class="f-grid">' +
      fld('setVat', 'نسبة ضريبة القيمة المضافة %', s.vatRate, 'number') +
      fld('setOpen', 'الرصيد الافتتاحي', s.openingBalance, 'number') +
      '</div>' +
      (isMgr ? '<div style="margin-top:14px"><button class="btn btn--gold btn--sm" data-save-fin>حفظ</button></div>' : '') + '</div>' +

      '<div class="card"><div class="card__h"><h2>صلاحية الموظفين على البوابة المالية</h2></div>' +
      '<div class="f"><label for="perm">ما الذي يراه الموظف (غير المدير)؟</label>' +
      '<select id="perm" ' + (isMgr ? '' : 'disabled') + '>' +
      ['none|لا يرى البوابة المالية إطلاقاً', 'readonly|يرى الأرقام والفواتير للقراءة فقط', 'full|يرى ويضيف ويعدّل الفواتير'].map(function (o) {
        var p = o.split('|');
        return '<option value="' + p[0] + '"' + ((s.employeeFinance || 'readonly') === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select></div>' +
      (isMgr ? '<div style="margin-top:14px"><button class="btn btn--gold btn--sm" data-save-perm>حفظ الصلاحية</button></div>' : '') + '</div>' +
      '</div>' +

      '<div class="card"><div class="card__h"><h2>الموظفون</h2><span class="sp"></span>' +
      (isMgr ? '<button class="btn btn--sm btn--ghost" data-add-emp>+ إضافة موظف</button>' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>المعرّف</th><th>الدور</th><th></th></tr></thead><tbody>' +
      (s.employees || []).map(function (e) {
        return '<tr><td><b>' + VH.esc(e.name) + '</b></td><td class="n">' + VH.esc(e.id) + '</td>' +
          '<td>' + (e.role === 'manager' ? '<span class="badge b-gold">مدير</span>' : '<span class="badge b-blue">موظف</span>') + '</td>' +
          '<td class="actions">' + (isMgr ? '<button class="btn btn--sm btn--ghost" data-ren="' + e.id + '">تعديل الاسم</button>' +
            (VH.store.mode === 'local' ? '<button class="btn btn--sm btn--ghost" data-reset="' + e.id + '">تصفير الرقم السري</button>' : '') +
            (e.role !== 'manager' ? '<button class="btn btn--sm btn--danger" data-rmemp="' + e.id + '">حذف</button>' : '') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="small muted" style="margin:12px 0 0">' + (cloud
        ? 'في الوضع السحابي يجب إنشاء حساب لكل موظف في Firebase Authentication بالبريد <span class="num">' + '&lt;المعرّف&gt;@' + VH.esc((window.VH_CONFIG || {}).authDomainSuffix || 'viahorizon.local') + '</span> وكلمة مرور من 6 خانات على الأقل.'
        : 'الرقم السري الافتراضي لأول دخول هو <span class="num">1234</span> — غيّريه من الزر أدناه.') + '</p></div>' +

      '<div class="card"><div class="card__h"><h2>الرقم السري</h2></div>' +
      '<div class="f-grid">' + fld('pinOld', 'الرقم الحالي', '', 'password') + fld('pinNew', 'الرقم الجديد', '', 'password') + '</div>' +
      '<div style="margin-top:14px"><button class="btn btn--gold btn--sm" data-chpin>تغيير رقمي السري</button></div></div>' +

      '<div class="card"><div class="card__h"><h2>النسخ الاحتياطي</h2></div>' +
      '<p class="small muted">تنزيل كل بيانات النظام (الصفقات والفواتير والإعدادات) في ملف واحد، أو استعادتها من ملف سابق.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn--navy btn--sm" data-backup>تنزيل نسخة احتياطية</button>' +
      '<button class="btn btn--ghost btn--sm" data-restore>استعادة من ملف</button>' +
      '<input type="file" id="restoreFile" accept=".json" hidden>' +
      (isMgr && VH.store.mode === 'local' ? '<button class="btn btn--danger btn--sm" data-wipe>مسح كل البيانات</button>' : '') +
      '<button class="btn btn--ghost btn--sm" data-seed>إدخال بيانات تجريبية</button>' +
      '</div></div>';

    function fld(id, label, val, type) {
      return '<div class="f"><label for="' + id + '">' + label + '</label>' +
        '<input id="' + id + '" type="' + (type === 'number' ? 'number' : type === 'password' ? 'password' : 'text') + '"' +
        (type === 'num' || type === 'number' ? ' dir="ltr"' : '') + ' value="' + VH.esc(val === undefined || val === null ? '' : val) + '"></div>';
    }

    return {
      title: 'الإعدادات والنسخ الاحتياطي', sub: 'بيانات الشركة · الموظفون · الصلاحيات · النسخ', actions: '',
      html: html,
      mount: function (root) {
        function q(id) { var e = root.querySelector(id); return e ? e.value.trim() : ''; }
        function on(sel, fn) { var e = root.querySelector(sel); if (e) e.addEventListener('click', fn); }

        on('[data-save-co]', function () {
          VH.store.saveSettings({
            company: {
              name: q('#co_name'), slogan: c.slogan, taxNumber: q('#co_tax'), crNumber: q('#co_cr'),
              phone: q('#co_phone'), email: q('#co_email'), address: q('#co_addr')
            }
          });
          VH.store.log('إعدادات', 'تحديث بيانات الشركة');
          VH.toast('حُفظت بيانات الشركة', 'ok');
        });
        on('[data-save-fin]', function () {
          VH.store.saveSettings({ vatRate: VH.num(q('#setVat')) || 15, openingBalance: VH.num(q('#setOpen')) });
          VH.store.log('إعدادات', 'تحديث الإعدادات المالية');
          VH.toast('حُفظت الإعدادات المالية', 'ok'); VH.app.render();
        });
        on('[data-save-perm]', function () {
          VH.store.saveSettings({ employeeFinance: root.querySelector('#perm').value });
          VH.toast('حُدّثت الصلاحيات', 'ok'); VH.app.render();
        });
        on('[data-add-emp]', function () {
          var fields = [
            { name: 'name', label: 'اسم الموظف', required: true },
            { name: 'id', label: 'المعرّف بالإنجليزية (يُستخدم في تسجيل الدخول)', required: true, hint: 'حروف إنجليزية صغيرة بدون مسافات' }
          ];
          VH.modal({
            title: 'إضافة موظف', body: VH.form.render(fields), actions: [
              {
                label: 'إضافة', cls: 'btn--gold', onClick: function (close, bd) {
                  var v = VH.form.validate(bd, fields); if (!v) return;
                  var id = v.id.toLowerCase().replace(/[^a-z0-9_]/g, '');
                  if (!id) { VH.form.error(bd, 'المعرّف يجب أن يحتوي حروفاً إنجليزية'); return; }
                  var emps = (VH.store.settings().employees || []).slice();
                  if (emps.some(function (e) { return e.id === id; })) { VH.form.error(bd, 'المعرّف مستخدم'); return; }
                  emps.push({ id: id, name: v.name, role: 'employee' });
                  VH.store.saveSettings({ employees: emps });
                  VH.store.log('إعدادات', 'إضافة موظف: ' + v.name);
                  close(); VH.toast('أُضيف الموظف', 'ok'); VH.app.render();
                }
              }, { label: 'إلغاء', cls: 'btn--ghost' }]
          });
        });
        root.querySelectorAll('[data-ren]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-ren');
            var emps = (VH.store.settings().employees || []).slice();
            var e = emps.filter(function (x) { return x.id === id; })[0];
            var fields = [{ name: 'name', label: 'الاسم', value: e.name, required: true }];
            VH.modal({
              title: 'تعديل اسم الموظف', body: VH.form.render(fields), actions: [
                {
                  label: 'حفظ', cls: 'btn--gold', onClick: function (close, bd) {
                    var v = VH.form.validate(bd, fields); if (!v) return;
                    e.name = v.name; VH.store.saveSettings({ employees: emps });
                    close(); VH.toast('حُفظ', 'ok'); VH.app.render();
                  }
                }, { label: 'إلغاء', cls: 'btn--ghost' }]
            });
          });
        });
        root.querySelectorAll('[data-reset]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-reset');
            VH.confirm('تصفير الرقم السري', 'سيعود رقم الدخول للموظف إلى 1234.', 'تصفير', function () {
              VH.auth.resetPinLocal(id); VH.toast('صُفّر الرقم السري إلى 1234', 'ok');
            });
          });
        });
        root.querySelectorAll('[data-rmemp]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-rmemp');
            VH.confirm('حذف موظف', 'لن تُحذف صفقاته، لكنه لن يستطيع الدخول.', 'حذف', function () {
              var emps = (VH.store.settings().employees || []).filter(function (x) { return x.id !== id; });
              VH.store.saveSettings({ employees: emps });
              VH.store.log('إعدادات', 'حذف موظف: ' + id);
              VH.toast('حُذف الموظف', 'warn'); VH.app.render();
            }, true);
          });
        });
        on('[data-chpin]', function () {
          var o = q('#pinOld'), n = q('#pinNew');
          if (!n || n.length < 4) { VH.toast('الرقم الجديد 4 خانات على الأقل (6 في الوضع السحابي)', 'bad'); return; }
          VH.auth.changePin((VH.auth.user() || {}).id, o, n)
            .then(function () { VH.toast('تغيّر الرقم السري', 'ok'); root.querySelector('#pinOld').value = ''; root.querySelector('#pinNew').value = ''; })
            .catch(function (e) { VH.toast(e.message || 'تعذّر التغيير', 'bad'); });
        });
        on('[data-backup]', function () {
          VH.download('via-horizon-backup-' + VH.today() + '.json', VH.store.exportAll(), 'application/json');
          VH.toast('نُزّلت النسخة الاحتياطية', 'ok');
        });
        on('[data-restore]', function () { root.querySelector('#restoreFile').click(); });
        var rf = root.querySelector('#restoreFile');
        if (rf) rf.addEventListener('change', function () {
          var f = rf.files[0]; if (!f) return;
          var rd = new FileReader();
          rd.onload = function () {
            try {
              VH.store.importAll(rd.result, false);
              VH.store.log('استعادة', 'استعادة نسخة احتياطية: ' + f.name);
              VH.toast('استُعيدت البيانات', 'ok'); VH.app.render();
            } catch (e) { VH.toast('ملف غير صالح: ' + e.message, 'bad'); }
          };
          rd.readAsText(f);
        });
        on('[data-wipe]', function () {
          VH.confirm('مسح كل البيانات', 'ستُحذف كل الصفقات والفواتير من هذا الجهاز. نزّلي نسخة احتياطية أولاً!', 'مسح نهائي', function () {
            VH.store.clearAll(); VH.toast('مُسحت البيانات', 'warn'); VH.app.render();
          }, true);
        });
        on('[data-seed]', function () {
          VH.confirm('بيانات تجريبية', 'ستُضاف صفقات وفواتير تجريبية لتجربة النظام. يمكنك حذفها لاحقاً.', 'إضافة', function () {
            R.seed(); VH.toast('أُضيفت البيانات التجريبية', 'ok'); VH.app.render();
          });
        });
        on('[data-migrate]', function () {
          var raw = localStorage.getItem('vh_sys_v1');
          if (!raw) { VH.toast('لا توجد بيانات محلية', 'warn'); return; }
          VH.confirm('نقل البيانات', 'ستُرفع بيانات هذا الجهاز إلى قاعدة البيانات المشتركة.', 'نقل', function () {
            try { VH.store.importAll(raw, false); VH.toast('نُقلت البيانات إلى السحابة', 'ok'); }
            catch (e) { VH.toast('تعذّر النقل: ' + e.message, 'bad'); }
          });
        });
      }
    };
  };

  /* =====================================================================
     بيانات تجريبية
     ===================================================================== */
  R.seed = function () {
    var t = VH.today(), y = new Date();
    var mk = function (o) { return o; };
    var staff = VH.store.staff();
    var e1 = (staff[0] || {}).id || 'khalil', e2 = (staff[1] || {}).id || 'mohammed', e3 = (staff[2] || {}).id || 'moawiyah';

    var d1 = {
      code: 'C-1001', orgName: 'شركة الوفاء للحج والعمرة', clientName: 'أحمد الزهراني',
      clientPhone: '0551234567', clientEmail: 'ops@alwafa.example',
      contactDate: VH.addDays(t, -20), negotiationDate: VH.addDays(t, -20),
      negotiationStatus: 'تم الاتفاق', owner: e1, assignee: e2,
      stage: 'done', notes: 'نقل معتمرين من المطار للفندق',
      quote: Object.assign(VH.ops.calcQuote([{ carType: 'هيونداي H1', carsCount: 1, withDriver: 'بسائق', pricePerCarPerDay: 1200 }], 5, 15), {
        orgName: 'شركة الوفاء للحج والعمرة', city: 'مكة المكرمة',
        startDate: VH.addDays(t, -12), endDate: VH.addDays(t, -8),
        total: 6900, priceVatIncluded: 'yes', sentAt: VH.stamp(), sentBy: 'خليل'
      }),
      contract: {
        carType: 'هيونداي H1', carsCount: 1, region: 'مكة المكرمة', withDriver: 'بسائق',
        startDate: VH.addDays(t, -12), endDate: VH.addDays(t, -8), days: 5,
        pricePerCarPerDay: 1380, price: 6900, priceVatIncluded: 'yes', fromQuote: true
      },
      rental: { officeName: 'مكتب الصفوة لتأجير السيارات', officePhone: '0567778899', plate: 'ر ط ن 4471', rentPerDay: 550, rentTotal: 2750, status: 'تم التعاقد' },
      vehicles: [{ id: VH.uid('veh'), carType: 'هيونداي H1', plate: 'ر ط ن 4471', driverName: 'عبدالله المطيري' }],
      driver: { nationality: 'سعودي', name: 'عبدالله المطيري', phone: '0509988776', idNo: '1045887711', dailyWage: 250 },
      expenses: [
        { id: VH.uid('exp'), kind: 'بنزين', note: 'تعبئة مرتين', amount: 420, date: VH.addDays(t, -10), by: 'محمد' },
        { id: VH.uid('exp'), kind: 'مناديل', note: '', amount: 45, date: VH.addDays(t, -10), by: 'محمد' },
        { id: VH.uid('exp'), kind: 'موية', note: 'كرتونين', amount: 60, date: VH.addDays(t, -10), by: 'محمد' },
        { id: VH.uid('exp'), kind: 'يومية السواق', note: 'يومية السواق 5 أيام × 250', amount: 1250, date: VH.addDays(t, -8), by: 'محمد' }
      ],
      timeline: [{ stage: 'done', at: VH.stamp(), by: 'النظام', note: 'صفقة تجريبية مكتملة' }]
    };
    var d2 = {
      code: 'C-1002', orgName: 'مؤسسة درب الشرق للسياحة', clientName: 'نورة العتيبي',
      clientPhone: '0533445566', clientEmail: 'info@darb.example',
      contactDate: VH.addDays(t, -6), negotiationDate: VH.addDays(t, -6),
      negotiationStatus: 'تم الاتفاق', owner: e2, assignee: e3,
      stage: 'expenses',
      quote: Object.assign(VH.ops.calcQuote([{ carType: 'جي إم سي', carsCount: 2, withDriver: 'بسائق', pricePerCarPerDay: 800 }], 5, 15), {
        orgName: 'مؤسسة درب الشرق للسياحة', city: 'الرياض',
        startDate: VH.addDays(t, -2), endDate: VH.addDays(t, 2),
        total: 9200, priceVatIncluded: 'yes', sentAt: VH.stamp(), sentBy: 'محمد'
      }),
      contract: {
        carType: 'جي إم سي', carsCount: 2, region: 'الرياض', withDriver: 'بسائق',
        startDate: VH.addDays(t, -2), endDate: VH.addDays(t, 2), days: 5,
        pricePerCarPerDay: 920, price: 9200, priceVatIncluded: 'yes', fromQuote: true
      },
      rental: { officeName: 'مكتب الأفق لتأجير السيارات', plate: 'ب ح د 9032، ج ك ل 5512', rentPerDay: 350, rentTotal: 3500, status: 'تم التعاقد' },
      vehicles: [
        { id: VH.uid('veh'), carType: 'جي إم سي', plate: 'ب ح د 9032', driverName: 'سعد الحربي' },
        { id: VH.uid('veh'), carType: 'جي إم سي', plate: 'ج ك ل 5512', driverName: 'ماجد الشهري' }
      ],
      driver: { nationality: 'سعودي', name: 'سعد الحربي', phone: '0544556677', idNo: '1099887766', dailyWage: 200 },
      expenses: [{ id: VH.uid('exp'), kind: 'بنزين', note: '', amount: 380, date: VH.addDays(t, -1), by: 'معاوية' }],
      timeline: [{ stage: 'expenses', at: VH.stamp(), by: 'النظام', note: 'صفقة تجريبية قيد التنفيذ' }]
    };
    var d3 = {
      code: 'C-1003', orgName: 'مجموعة النخبة للفعاليات', clientName: 'فيصل الدوسري',
      clientPhone: '0500112233', clientEmail: 'events@nokhba.example',
      contactDate: VH.addDays(t, -1), negotiationDate: VH.addDays(t, -1),
      negotiationStatus: 'جاري العمل والمتابعة', owner: e3, assignee: '',
      stage: 'marketing', quote: {}, contract: {}, rental: {}, vehicles: [], driver: {}, expenses: [],
      timeline: [{ stage: 'marketing', at: VH.stamp(), by: 'النظام', note: 'عميل تجريبي في مرحلة التسويق' }]
    };

    [d1, d2, d3].forEach(function (d) { VH.store.save('deals', d); });

    // قائمة السائقين تُبنى تلقائياً
    [{ nationality: 'سعودي', name: 'عبدالله المطيري', phone: '0509988776', idNo: '1045887711', dailyWage: 250 },
     { nationality: 'سعودي', name: 'سعد الحربي', phone: '0544556677', idNo: '1099887766', dailyWage: 200 },
     { nationality: 'غير سعودي', name: 'ماجد الشهري', phone: '0566554433', idNo: '2233445566', dailyWage: 150 }
    ].forEach(function (x) { VH.store.upsertDriver(x); });

    var t1 = VH.ops.calc(d1);
    VH.finance.createInvoice({
      direction: 'in', party: d1.orgName, partyPhone: d1.clientPhone, partyType: 'عميل', dealId: d1.id, dealCode: d1.code,
      description: 'خدمة نقل — هيونداي H1 / مكة المكرمة (5 أيام)', amountBeforeVat: t1.revenueBefore, vatRate: 15,
      vatAmount: t1.vat, total: t1.revenueTotal, category: 'إيراد خدمة', status: 'paid', paidDate: VH.addDays(t, -5), method: 'تحويل بنكي', date: VH.addDays(t, -8)
    });
    var rv = VH.vat(2750, 15, true);
    VH.finance.createInvoice({
      direction: 'out', party: d1.rental.officeName, partyType: 'مكتب تأجير', dealId: d1.id, dealCode: d1.code,
      description: 'إيجار سيارة 5 أيام', amountBeforeVat: rv.before, vatRate: 15, vatAmount: rv.vat, total: rv.total,
      category: 'إيجار سيارة', status: 'paid', paidDate: VH.addDays(t, -7), method: 'تحويل بنكي', date: VH.addDays(t, -8)
    });
    VH.finance.createInvoice({
      direction: 'out', party: 'مصاريف تشغيل — C-1001', partyType: 'مصاريف', dealId: d1.id, dealCode: d1.code,
      description: 'بنزين 420 · مناديل 45 · موية 60 · يومية السواق 1250', amountBeforeVat: 1775, vatRate: 0, vatAmount: 0,
      total: 1775, category: 'مصاريف تنفيذ', status: 'paid', paidDate: VH.addDays(t, -8), method: 'نقد', date: VH.addDays(t, -8)
    });
    var t2 = VH.ops.calc(d2);
    VH.finance.createInvoice({
      direction: 'in', party: d2.orgName, partyPhone: d2.clientPhone, partyType: 'عميل', dealId: d2.id, dealCode: d2.code,
      description: 'خدمة نقل — جي إم سي ×2 / الرياض (5 أيام)', amountBeforeVat: t2.revenueBefore, vatRate: 15,
      vatAmount: t2.vat, total: t2.revenueTotal, category: 'إيراد خدمة', status: 'unpaid', date: t
    });
    if (!VH.num(VH.store.settings().openingBalance)) VH.store.saveSettings({ openingBalance: 25000 });
    VH.store.log('بيانات تجريبية', 'أُضيفت 3 صفقات و4 فواتير');
  };

  VH.reports = R;
})(window.VH);
