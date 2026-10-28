/* =====================================================================
   فورم طلب عرض السعر (صفحة عامة للعملاء)
   • مع Firebase : يُكتب الطلب مباشرة في مجموعة leads ويظهر فوراً في النظام
   • بدون Firebase: يُحفظ في متصفح الجهاز نفسه (للتجربة المحلية فقط)
   ===================================================================== */
(function () {
  'use strict';

  var CFG = window.VH_CONFIG || {};
  var LS_KEY = 'vh_sys_v1';
  var CITIES = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الظهران',
    'الطائف', 'بريدة', 'عنيزة', 'أبها', 'خميس مشيط', 'تبوك', 'حائل', 'نجران', 'جازان',
    'الباحة', 'سكاكا', 'عرعر', 'ينبع', 'الجبيل', 'الأحساء', 'القطيف', 'أخرى'];
  // نفس قائمة الأنواع المستخدمة في عرض السعر داخل النظام
  var CARS = ['هيونداي H1', 'تويوتا هايس', 'جي إم سي', 'شيفروليه سوبربان', 'تاهو', 'مرسيدس S450',
    'مرسيدس سبرينتر', 'كامري', 'سوناتا', 'باص 30 راكب', 'باص 50 راكب', 'أخرى'];

  var form = document.getElementById('leadForm');
  var errBox = document.getElementById('formErr');
  var btn = document.getElementById('submitBtn');
  var carsBox = document.getElementById('carsBox');

  var d0 = new Date();
  var today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');

  function daysBetween(a, b) {
    if (!a || !b) return 0;
    return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  }
  function opts(list, sel, ph) {
    return '<option value="">' + ph + '</option>' + list.map(function (c) {
      return '<option' + (c === sel ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  }

  /* ---------------- بطاقة سيارة ---------------- */
  function carCard(prev) {
    prev = prev || {};
    var row = document.createElement('div');
    row.className = 'car';
    row.innerHTML =
      '<div class="car__h"><b class="ttl">السيارة</b>' +
        '<button type="button" class="rm" aria-label="حذف هذه السيارة" title="حذف">×</button></div>' +

      '<label class="fld"><span class="lbl">نوع السيارة *</span>' +
        '<select data-k="carType">' + opts(CARS, prev.carType, '— اختر النوع —') + '</select></label>' +

      '<label class="fld"><span class="lbl">العدد المطلوب *</span>' +
        '<input data-k="carsCount" type="number" min="1" max="200" step="1" inputmode="numeric" dir="ltr" value="' + (prev.carsCount || 1) + '"></label>' +

      '<label class="fld"><span class="lbl">مع سائق أو بدون *</span>' +
        '<select data-k="withDriver"><option value="بسائق"' + (prev.withDriver !== 'بدون سائق' ? ' selected' : '') + '>مع سائق</option>' +
        '<option value="بدون سائق"' + (prev.withDriver === 'بدون سائق' ? ' selected' : '') + '>بدون سائق</option></select></label>' +

      '<label class="fld"><span class="lbl">مدينة الانطلاق *</span>' +
        '<select data-k="fromCity">' + opts(CITIES, prev.fromCity, '— اختر المدينة —') + '</select></label>' +

      '<label class="fld"><span class="lbl">مدينة الوصول *</span>' +
        '<select data-k="toCity">' + opts(CITIES, prev.toCity, '— اختر المدينة —') + '</select></label>' +

      '<label class="fld"><span class="lbl">تاريخ البداية *</span>' +
        '<input data-k="startDate" type="date" dir="ltr" min="' + today + '" value="' + (prev.startDate || '') + '"></label>' +

      '<label class="fld"><span class="lbl">تاريخ النهاية *</span>' +
        '<input data-k="endDate" type="date" dir="ltr" min="' + today + '" value="' + (prev.endDate || '') + '"></label>' +

      '<div class="days"></div>';

    row.querySelector('.rm').addEventListener('click', function () {
      if (carsBox.children.length > 1) { row.remove(); refresh(); }
    });
    row.addEventListener('input', function () { showMsg('cars', ''); refresh(); });
    row.addEventListener('change', function () { showMsg('cars', ''); refresh(); });
    return row;
  }

  function refresh() {
    [].forEach.call(carsBox.children, function (row, i) {
      row.querySelector('.ttl').textContent = carsBox.children.length > 1 ? 'السيارة ' + (i + 1) : 'بيانات السيارة';
      row.querySelector('.rm').disabled = carsBox.children.length <= 1;
      var s = row.querySelector('[data-k=startDate]').value;
      var e = row.querySelector('[data-k=endDate]');
      if (s) e.min = s;
      var n = daysBetween(s, e.value);
      row.querySelector('.days').textContent = n > 0 ? 'المدة: ' + n + ' يوم' : '';
    });
  }
  function addCar() {
    var last = carsBox.lastElementChild;
    var prev = last ? readRow(last) : {};
    carsBox.appendChild(carCard({ fromCity: prev.fromCity, toCity: prev.toCity, startDate: prev.startDate, endDate: prev.endDate, withDriver: prev.withDriver }));
    refresh();
  }
  function readRow(row) {
    var g = function (k) { var e = row.querySelector('[data-k=' + k + ']'); return e ? e.value.trim() : ''; };
    return {
      carType: g('carType'), carsCount: +g('carsCount') || 0, withDriver: g('withDriver'),
      fromCity: g('fromCity'), toCity: g('toCity'), startDate: g('startDate'), endDate: g('endDate')
    };
  }
  function readCars() { return [].map.call(carsBox.children, readRow); }

  document.getElementById('addCar').addEventListener('click', function () {
    addCar();
    carsBox.lastElementChild.querySelector('select').focus();
  });
  addCar();

  /* ---------------- التحقق ---------------- */
  var RULES = {
    orgName: { req: true, msg: 'اكتب اسم الجهة' },
    contactName: { req: true, msg: 'اكتب اسم المسؤول' },
    email: { req: false, test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'البريد اختياري — لكن إن كتبته فاكتبه صحيحاً (مثال: name@company.com)' },
    phone: { req: true, test: function (v) { return /^(?:\+?966|0)?5\d{8}$/.test(v.replace(/[\s-]/g, '')); }, msg: 'أدخل رقم جوال سعودي صحيح (مثال: 0512345678)' }
  };

  function showMsg(name, text) {
    var el = document.querySelector('[data-msg="' + name + '"]');
    if (el) el.textContent = text || '';
    var input = document.getElementById(name);
    if (input) {
      if (text) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function validate() {
    var vals = {}, firstBad = null;
    Object.keys(RULES).forEach(function (k) {
      var el = document.getElementById(k);
      var v = (el.value || '').trim();
      vals[k] = v;
      var r = RULES[k], bad = '';
      if (r.req && !v) bad = r.msg;
      else if (v && r.test && !r.test(v)) bad = r.msg;
      showMsg(k, bad);
      if (bad && !firstBad) firstBad = el;
    });
    vals.jobTitle = (document.getElementById('jobTitle').value || '').trim();

    // بطاقات السيارات
    var cars = readCars(), bad = '';
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i], n = cars.length > 1 ? ' (السيارة ' + (i + 1) + ')' : '';
      if (!c.carType) { bad = 'اختر نوع السيارة' + n; break; }
      if (!(c.carsCount >= 1 && c.carsCount <= 200)) { bad = 'أدخل عدداً بين 1 و 200' + n; break; }
      if (!c.fromCity || !c.toCity) { bad = 'اختر مدينة الانطلاق ومدينة الوصول' + n; break; }
      if (!c.startDate || !c.endDate) { bad = 'أدخل تاريخ البداية والنهاية' + n; break; }
      if (c.endDate < c.startDate) { bad = 'تاريخ النهاية قبل تاريخ البداية' + n; break; }
    }
    if (!bad) {
      var tot = cars.reduce(function (a, c2) { return a + c2.carsCount; }, 0);
      if (tot > 200) bad = 'إجمالي عدد السيارات ' + tot + ' — للطلبات الكبيرة تواصل معنا مباشرة';
    }
    showMsg('cars', bad);
    if (bad && !firstBad) firstBad = carsBox.querySelector('select');
    vals.cars = cars;

    if (firstBad) { firstBad.focus(); return null; }
    return vals;
  }

  Object.keys(RULES).forEach(function (k) {
    var el = document.getElementById(k);
    el.addEventListener('input', function () { showMsg(k, ''); });
    el.addEventListener('change', function () { showMsg(k, ''); });
  });

  /* ---------------- الحفظ ---------------- */
  function hasCloud() {
    var f = CFG.firebase || {};
    return !!(f.apiKey && f.projectId && f.appId);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('تعذّر الاتصال بالخادم')); };
      document.head.appendChild(s);
    });
  }
  function refNo() { return 'R-' + Date.now().toString(36).toUpperCase().slice(-6); }

  function saveLocal(lead) {
    var db = {};
    try { db = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { db = {}; }
    db.leads = db.leads || {};
    db.leads[lead.id] = lead;
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    return Promise.resolve();
  }
  function saveCloud(lead) {
    var base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    return loadScript(base + 'firebase-app-compat.js')
      .then(function () { return loadScript(base + 'firebase-firestore-compat.js'); })
      .then(function () {
        if (!window.firebase.apps.length) window.firebase.initializeApp(CFG.firebase);
        return window.firebase.firestore().collection('leads').doc(lead.id).set(lead);
      });
  }

  /* ---------------- الإرسال ---------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.hidden = true;
    var v = validate();
    if (!v) return;

    var starts = v.cars.map(function (c) { return c.startDate; }).sort();
    var ends = v.cars.map(function (c) { return c.endDate; }).sort();
    var allDriver = v.cars.every(function (c) { return c.withDriver === 'بسائق'; });
    var noDriver = v.cars.every(function (c) { return c.withDriver === 'بدون سائق'; });

    var lead = {
      id: 'lead_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ref: refNo(),
      orgName: v.orgName, contactName: v.contactName, jobTitle: v.jobTitle,
      email: v.email, phone: v.phone,
      city: v.cars[0].toCity,
      cars: v.cars,
      carsCount: v.cars.reduce(function (a, c) { return a + c.carsCount; }, 0),
      withDriver: allDriver ? 'بسائق' : (noDriver ? 'بدون سائق' : 'بعضها بسائق'),
      expectedStart: starts[0], expectedEnd: ends[ends.length - 1],
      at: new Date().toISOString(), source: 'form',
      converted: false, dealId: ''
    };

    btn.disabled = true; btn.textContent = 'جارٍ الإرسال…';
    (hasCloud() ? saveCloud(lead) : saveLocal(lead))
      .then(function () {
        document.getElementById('refNo').textContent = 'رقم الطلب: ' + lead.ref;
        form.hidden = true;
        document.getElementById('done').hidden = false;
        document.getElementById('card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (ex) {
        console.error(ex);
        errBox.textContent = 'تعذّر إرسال الطلب حالياً. تأكد من اتصالك بالإنترنت وحاول مرة أخرى، أو تواصل معنا مباشرة.';
        errBox.hidden = false;
      })
      .then(function () { btn.disabled = false; btn.textContent = 'إرسال الطلب'; });
  });

  document.getElementById('againBtn').addEventListener('click', function () {
    form.reset();
    Object.keys(RULES).forEach(function (k) { showMsg(k, ''); });
    showMsg('cars', '');
    carsBox.innerHTML = ''; addCar();
    document.getElementById('done').hidden = true;
    form.hidden = false;
    document.getElementById('card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
