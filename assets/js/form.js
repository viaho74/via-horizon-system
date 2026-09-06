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

  /* ---------------- المدن والتواريخ ---------------- */
  var citySel = document.getElementById('city');
  CITIES.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o);
  });
  var d0 = new Date();
  var today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  var startEl = document.getElementById('expectedStart'), endEl = document.getElementById('expectedEnd');
  startEl.min = today; endEl.min = today;
  function daysBetween(a, b) {
    if (!a || !b) return 0;
    var x = new Date(a), y = new Date(b);
    return Math.round((y - x) / 86400000) + 1;
  }
  function syncDays() {
    if (startEl.value) endEl.min = startEl.value;
    var n = daysBetween(startEl.value, endEl.value);
    document.getElementById('daysHint').textContent = n > 0
      ? 'مدة المشروع: ' + n + ' يوم — التواريخ تقريبية ويمكن تعديلها لاحقاً.'
      : 'التواريخ تقريبية — يمكن تعديلها لاحقاً مع فريقنا.';
  }
  startEl.addEventListener('change', syncDays); endEl.addEventListener('change', syncDays);

  /* ---------------- صفوف أنواع السيارات ---------------- */
  var carsBox = document.getElementById('carsBox');
  function carRow() {
    var row = document.createElement('div'); row.className = 'car';
    row.innerHTML =
      '<select data-k="carType" aria-label="نوع السيارة"><option value="">— نوع السيارة —</option>' +
      CARS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
      '<input data-k="carsCount" type="number" min="1" max="200" step="1" placeholder="العدد" inputmode="numeric" aria-label="العدد" dir="ltr">' +
      '<button type="button" class="rm" aria-label="حذف">×</button>';
    row.querySelector('.rm').addEventListener('click', function () {
      if (carsBox.children.length > 1) { row.remove(); syncRm(); }
    });
    row.addEventListener('input', function () { showMsg('cars', ''); });
    row.addEventListener('change', function () { showMsg('cars', ''); });
    return row;
  }
  function syncRm() { [].forEach.call(carsBox.querySelectorAll('.rm'), function (b) { b.disabled = carsBox.children.length <= 1; }); }
  function addCar() { carsBox.appendChild(carRow()); syncRm(); }
  document.getElementById('addCar').addEventListener('click', function () { addCar(); carsBox.lastElementChild.querySelector('select').focus(); });
  addCar();
  function readCars() {
    return [].map.call(carsBox.children, function (row) {
      return { carType: row.querySelector('[data-k=carType]').value, carsCount: +row.querySelector('[data-k=carsCount]').value || 0 };
    });
  }

  /* ---------------- التحقق ---------------- */
  var RULES = {
    orgName: { req: true, msg: 'اكتب اسم الجهة' },
    contactName: { req: true, msg: 'اكتب اسم المسؤول' },
    email: { req: true, test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'أدخل بريداً إلكترونياً صحيحاً (مثال: name@company.com)' },
    phone: { req: true, test: function (v) { return /^(?:\+?966|0)?5\d{8}$/.test(v.replace(/[\s-]/g, '')); }, msg: 'أدخل رقم جوال سعودي صحيح (مثال: 0512345678)' },
    city: { req: true, msg: 'اختر المدينة' },
    withDriver: { req: true, msg: 'اختر مع سائق أو بدون' },
    expectedStart: { req: true, msg: 'اختر التاريخ المتوقع لبدء المشروع' },
    expectedEnd: { req: true, msg: 'اختر التاريخ المتوقع لنهاية المشروع' }
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

    // أنواع السيارات: كل صف يحتاج نوعاً وعدداً
    var cars = readCars();
    var carsBad = cars.some(function (c) { return !c.carType || c.carsCount < 1 || c.carsCount > 200; });
    var dup = cars.map(function (c) { return c.carType; }).filter(function (t, i, a) { return t && a.indexOf(t) !== i; });
    if (carsBad) { showMsg('cars', 'اختر نوع كل سيارة وأدخل عدداً بين 1 و 200'); if (!firstBad) firstBad = carsBox.querySelector('select'); }
    else if (dup.length) { showMsg('cars', 'النوع «' + dup[0] + '» مكرّر — اجمع عدده في صف واحد'); if (!firstBad) firstBad = carsBox.querySelector('select'); }
    else showMsg('cars', '');
    vals.cars = cars;

    // نهاية المشروع بعد بدايته
    if (vals.expectedStart && vals.expectedEnd && vals.expectedEnd < vals.expectedStart) {
      showMsg('expectedEnd', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية'); if (!firstBad) firstBad = endEl;
    }
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

    var lead = {
      id: 'lead_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ref: refNo(),
      orgName: v.orgName, contactName: v.contactName, jobTitle: v.jobTitle,
      email: v.email, phone: v.phone, city: v.city,
      cars: v.cars,
      carsCount: v.cars.reduce(function (a, c) { return a + c.carsCount; }, 0),
      withDriver: v.withDriver,
      expectedStart: v.expectedStart, expectedEnd: v.expectedEnd,
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
