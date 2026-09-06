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

  var form = document.getElementById('leadForm');
  var errBox = document.getElementById('formErr');
  var btn = document.getElementById('submitBtn');

  /* تعبئة المدن وتاريخ اليوم كحد أدنى */
  var citySel = document.getElementById('city');
  CITIES.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o);
  });
  var d = new Date();
  var today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  document.getElementById('expectedStart').min = today;

  /* ---------------- التحقق ---------------- */
  var RULES = {
    orgName: { req: true, msg: 'اكتب اسم الجهة' },
    contactName: { req: true, msg: 'اكتب اسم المسؤول' },
    email: { req: true, test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'أدخل بريداً إلكترونياً صحيحاً (مثال: name@company.com)' },
    phone: { req: true, test: function (v) { return /^(?:\+?966|0)?5\d{8}$/.test(v.replace(/[\s-]/g, '')); }, msg: 'أدخل رقم جوال سعودي صحيح (مثال: 0512345678)' },
    city: { req: true, msg: 'اختر المدينة' },
    carsCount: { req: true, test: function (v) { return +v >= 1 && +v <= 200; }, msg: 'أدخل عدد سيارات بين 1 و 200' },
    expectedStart: { req: true, msg: 'اختر التاريخ المتوقع لبدء المشروع' }
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
    if (firstBad) { firstBad.focus(); return null; }
    return vals;
  }

  /* مسح رسالة الخطأ أثناء الكتابة */
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
  function refNo() {
    return 'R-' + Date.now().toString(36).toUpperCase().slice(-6);
  }

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
      carsCount: Number(v.carsCount), expectedStart: v.expectedStart,
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
    document.getElementById('done').hidden = true;
    form.hidden = false;
    document.getElementById('card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
