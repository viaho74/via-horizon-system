/* =====================================================================
   طبقة التخزين — واجهة واحدة لوضعين:
   • local : localStorage على هذا الجهاز (يعمل بلا إنترنت وبلا تسجيل)
   • cloud : Firebase Firestore مشترك بين كل الموظفين لحظياً
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var LS_KEY = 'vh_sys_v1';
  var COLS = ['deals', 'invoices', 'audit', 'drivers'];
  var CFG = window.VH_CONFIG || {};

  var DEFAULT_SETTINGS = {
    openingBalance: 0,
    vatRate: 15,
    company: Object.assign({
      name: 'شركة فيا هورايزن', slogan: 'نسهّل رحلتك، ونوسّع أفقك',
      taxNumber: '', crNumber: '', phone: '', email: '', address: ''
    }, CFG.company || {}),
    employees: [
      { id: 'khalil', name: 'خليل', role: 'employee' },
      { id: 'mohammed', name: 'محمد', role: 'employee' },
      { id: 'moawiyah', name: 'معاوية', role: 'employee' },
      { id: 'manager', name: 'المدير', role: 'manager' }
    ],
    pins: {},          // للوضع المحلي فقط — قيم مُجزّأة لا نصّية
    invoiceSeq: 1,
    dealSeq: 1,
    seeded: false
  };

  var S = {
    mode: 'local',
    online: false,
    data: { deals: {}, invoices: {}, audit: {}, drivers: {}, settings: null },
    _subs: [],
    _fb: null,        // { app, auth, db }
    _unsub: []
  };

  /* ---------------- أدوات داخلية ---------------- */
  function emit() { S._subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function localRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function localWrite() {
    var out = {
      deals: S.data.deals, invoices: S.data.invoices, audit: S.data.audit,
      drivers: S.data.drivers, settings: S.data.settings
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(out)); }
    catch (e) { console.error('تعذّر الحفظ محلياً', e); }
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('فشل تحميل ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- التهيئة ---------------- */
  S.hasCloudConfig = function () {
    var f = CFG.firebase || {};
    return !!(f.apiKey && f.projectId && f.appId);
  };

  S.init = function () {
    var raw = localRead();
    S.data.deals = raw.deals || {};
    S.data.invoices = raw.invoices || {};
    S.data.audit = raw.audit || {};
    S.data.drivers = raw.drivers || {};
    S.data.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
    S.data.settings.company = Object.assign({}, DEFAULT_SETTINGS.company, (raw.settings || {}).company || {});

    if (!S.hasCloudConfig()) { S.mode = 'local'; return Promise.resolve('local'); }

    S.mode = 'cloud';
    var base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    return loadScript(base + 'firebase-app-compat.js')
      .then(function () { return loadScript(base + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(base + 'firebase-firestore-compat.js'); })
      .then(function () {
        var app = firebase.initializeApp(CFG.firebase);
        S._fb = { app: app, auth: firebase.auth(), db: firebase.firestore() };
        try { S._fb.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
        return 'cloud';
      })
      .catch(function (e) {
        console.error('تعذّر تشغيل الوضع السحابي، سنعمل محلياً:', e);
        S.mode = 'local';
        return 'local';
      });
  };

  /* ---------------- المزامنة السحابية ---------------- */
  S.startSync = function () {
    if (S.mode !== 'cloud' || !S._fb) { S.online = false; return Promise.resolve(); }
    S.stopSync();
    var db = S._fb.db;
    var pending = COLS.length + 1;
    return new Promise(function (resolve) {
      function tick() { if (--pending === 0) { S.online = true; resolve(); } }
      COLS.forEach(function (c) {
        var first = true;
        S._unsub.push(db.collection(c).onSnapshot(function (snap) {
          var map = {};
          snap.forEach(function (d) { map[d.id] = Object.assign({ id: d.id }, d.data()); });
          S.data[c] = map;
          if (first) { first = false; tick(); }
          emit();
        }, function (err) { console.error('خطأ مزامنة ' + c, err); if (first) { first = false; tick(); } }));
      });
      var firstS = true;
      S._unsub.push(db.collection('settings').doc('app').onSnapshot(function (doc) {
        if (doc.exists) {
          S.data.settings = Object.assign({}, DEFAULT_SETTINGS, doc.data());
          S.data.settings.company = Object.assign({}, DEFAULT_SETTINGS.company, doc.data().company || {});
        } else {
          db.collection('settings').doc('app').set(Object.assign({}, DEFAULT_SETTINGS, { pins: {} }));
        }
        if (firstS) { firstS = false; tick(); }
        emit();
      }, function (err) { console.error('خطأ مزامنة الإعدادات', err); if (firstS) { firstS = false; tick(); } }));
    });
  };
  S.stopSync = function () { S._unsub.forEach(function (u) { try { u(); } catch (e) {} }); S._unsub = []; };

  /* ---------------- القراءة ---------------- */
  S.subscribe = function (fn) { S._subs.push(fn); return function () { S._subs = S._subs.filter(function (f) { return f !== fn; }); }; };
  S.settings = function () { return S.data.settings || DEFAULT_SETTINGS; };
  S.list = function (col) {
    var m = S.data[col] || {}, out = [];
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) out.push(m[k]);
    return out;
  };
  S.get = function (col, id) { return (S.data[col] || {})[id] || null; };

  S.employees = function () { return (S.settings().employees || []).slice(); };
  S.staff = function () { return S.employees().filter(function (e) { return e.role === 'employee'; }); };
  S.employeeName = function (id) {
    var e = S.employees().filter(function (x) { return x.id === id; })[0];
    return e ? e.name : (id || '—');
  };

  /* سجل السائقين — يُبنى تلقائياً من كل إدخال جديد ويصير قائمة منسدلة */
  S.upsertDriver = function (dr) {
    if (!dr || !dr.name) return null;
    var key = String(dr.phone || '').replace(/\D/g, '');
    var found = S.list('drivers').filter(function (x) {
      return (key && String(x.phone || '').replace(/\D/g, '') === key) || (!key && x.name === dr.name);
    })[0];
    var obj = Object.assign({}, found || {}, {
      name: dr.name, phone: dr.phone || (found || {}).phone || '', idNo: dr.idNo || (found || {}).idNo || '',
      nationality: dr.nationality || (found || {}).nationality || '', dailyWage: dr.dailyWage || (found || {}).dailyWage || ''
    });
    if (found) obj.id = found.id;
    return S.save('drivers', obj);
  };
  S.driverList = function () {
    return S.list('drivers').sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
  };

  /* ---------------- الكتابة ---------------- */
  S.save = function (col, obj) {
    var isNew = !obj.id;
    obj.id = obj.id || VH.uid(col.slice(0, 3));
    obj.updatedAt = VH.stamp();
    if (isNew) obj.createdAt = obj.createdAt || VH.stamp();
    S.data[col][obj.id] = obj;
    if (S.mode === 'cloud' && S._fb) {
      S._fb.db.collection(col).doc(obj.id).set(JSON.parse(JSON.stringify(obj)))
        .catch(function (e) { console.error('فشل الحفظ السحابي', e); VH.toast && VH.toast('تعذّر الحفظ في السحابة — تحقّقي من الاتصال', 'bad'); });
    } else { localWrite(); }
    emit();
    return obj;
  };

  S.remove = function (col, id) {
    delete S.data[col][id];
    if (S.mode === 'cloud' && S._fb) S._fb.db.collection(col).doc(id).delete().catch(console.error);
    else localWrite();
    emit();
  };

  S.saveSettings = function (patch) {
    S.data.settings = Object.assign({}, S.settings(), patch);
    if (S.mode === 'cloud' && S._fb) {
      S._fb.db.collection('settings').doc('app').set(JSON.parse(JSON.stringify(S.data.settings)))
        .catch(console.error);
    } else { localWrite(); }
    emit();
    return S.data.settings;
  };

  /* سجل الأحداث */
  S.log = function (action, detail, ref) {
    var who = (VH.auth && VH.auth.user()) || {};
    S.save('audit', {
      action: action, detail: detail || '', ref: ref || '',
      by: who.name || 'غير معروف', byId: who.id || '', at: VH.stamp()
    });
  };

  /* ترقيم تسلسلي */
  S.nextInvoiceNo = function () {
    var s = S.settings(), seq = VH.num(s.invoiceSeq) || 1, y = new Date().getFullYear();
    S.saveSettings({ invoiceSeq: seq + 1 });
    return 'VH-' + y + '-' + String(seq).padStart(4, '0');
  };
  S.nextDealCode = function () {
    var s = S.settings(), seq = VH.num(s.dealSeq) || 1;
    S.saveSettings({ dealSeq: seq + 1 });
    return 'C-' + String(1000 + seq);
  };

  /* ---------------- النسخ الاحتياطي ---------------- */
  S.exportAll = function () {
    return JSON.stringify({
      _system: 'via-horizon-system', _version: 2, _at: VH.stamp(),
      deals: S.data.deals, invoices: S.data.invoices, audit: S.data.audit,
      drivers: S.data.drivers, settings: S.data.settings
    }, null, 2);
  };

  /* ---------------- ترحيل البيانات من النسخة الأولى ---------------- */
  var OLD_STATUS = {
    'بداية التفاوض': 'بداية التواصل',
    'قيد التنفيذ': 'جاري العمل والمتابعة',
    'تم التفاوض': 'تم الاتفاق'
  };
  S.migrate = function () {
    var changed = 0;
    S.list('deals').forEach(function (d) {
      var dirty = false;
      if (d.stage === 'negotiation') { d.stage = 'marketing'; dirty = true; }
      if (d.negotiationStatus && OLD_STATUS[d.negotiationStatus]) { d.negotiationStatus = OLD_STATUS[d.negotiationStatus]; dirty = true; }
      if (!d.contactDate) { d.contactDate = d.negotiationDate || VH.today(); dirty = true; }
      if (!d.orgName) { d.orgName = d.clientName || ''; dirty = true; }
      if (!d.vehicles) { d.vehicles = []; dirty = true; }
      if (!d.quote) { d.quote = {}; dirty = true; }
      if (dirty) { changed++; S.data.deals[d.id] = d; }
    });
    if (changed && S.mode === 'local') localWrite();
    return changed;
  };
  S.importAll = function (json, replace) {
    var d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || (!d.deals && !d.invoices)) throw new Error('الملف لا يحتوي بيانات النظام');
    COLS.forEach(function (c) {
      if (!d[c]) return;
      if (replace) S.data[c] = {};
      Object.keys(d[c]).forEach(function (k) { S.data[c][k] = d[c][k]; });
    });
    if (d.settings) {
      var keep = S.settings().pins;
      S.data.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings, { pins: d.settings.pins || keep });
    }
    if (S.mode === 'cloud' && S._fb) {
      var db = S._fb.db, batch = db.batch(), n = 0;
      COLS.forEach(function (c) {
        Object.keys(S.data[c]).forEach(function (k) {
          batch.set(db.collection(c).doc(k), JSON.parse(JSON.stringify(S.data[c][k]))); n++;
        });
      });
      batch.set(db.collection('settings').doc('app'), JSON.parse(JSON.stringify(S.data.settings)));
      if (n < 480) batch.commit().catch(console.error);
      else VH.toast && VH.toast('البيانات كثيرة على دفعة واحدة — استوردي على مراحل', 'warn');
    } else { localWrite(); }
    emit();
  };
  S.clearAll = function () {
    COLS.forEach(function (c) { S.data[c] = {}; });
    if (S.mode === 'cloud') { VH.toast && VH.toast('الحذف الجماعي متاح في الوضع المحلي فقط', 'warn'); }
    else { localWrite(); }
    emit();
  };

  VH.store = S;
  VH.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
})(window.VH);
