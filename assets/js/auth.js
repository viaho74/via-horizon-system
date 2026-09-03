/* =====================================================================
   الدخول والصلاحيات
   • الوضع المحلي : رقم سري مخزّن مُجزّأ على الجهاز (حماية بسيطة)
   • الوضع السحابي: حساب Firebase حقيقي — الرقم السري هو كلمة المرور
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var CFG = window.VH_CONFIG || {};
  var SES_KEY = 'vh_session';
  var A = { _user: null, _pick: null };

  function hash(s) {
    var h = 5381, str = 'vh·' + String(s);
    for (var i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function email(id) { return id + '@' + (CFG.authDomainSuffix || 'viahorizon.local'); }

  A.user = function () { return A._user; };
  A.isManager = function () { return !!A._user && A._user.role === 'manager'; };
  /** what: finance | financeEdit | settings | deleteAny */
  A.can = function (what) {
    if (!A._user) return false;
    if (A.isManager()) return true;
    var lvl = VH.store.settings().employeeFinance || 'readonly';
    if (what === 'finance') return lvl !== 'none';
    if (what === 'financeEdit') return lvl === 'full';
    if (what === 'settings' || what === 'deleteAny') return false;
    return true;
  };

  /* ---------------- شاشة الدخول ---------------- */
  A.showLogin = function (onDone) {
    var scr = document.getElementById('loginScreen');
    var app = document.getElementById('app');
    app.hidden = true; scr.hidden = false;

    var people = VH.store.employees();
    var box = document.getElementById('loginPeople');
    box.innerHTML = people.map(function (p) {
      return '<button type="button" class="person" data-id="' + p.id + '">' +
        '<b>' + VH.esc(p.name) + '</b><small>' + (p.role === 'manager' ? 'مدير النظام' : 'موظف') + '</small></button>';
    }).join('');

    var last = localStorage.getItem('vh_last_user');
    A._pick = null;
    box.querySelectorAll('.person').forEach(function (b) {
      if (last && b.getAttribute('data-id') === last) { b.classList.add('is-on'); A._pick = last; }
      b.addEventListener('click', function () {
        box.querySelectorAll('.person').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        A._pick = b.getAttribute('data-id');
        document.getElementById('loginPin').focus();
      });
    });

    document.getElementById('loginMode').textContent = VH.store.mode === 'cloud'
      ? '☁ متصل بقاعدة البيانات المشتركة — البيانات تظهر عند كل الموظفين'
      : '💾 وضع محلي — البيانات محفوظة على هذا الجهاز فقط';

    var err = document.getElementById('loginErr');
    var form = document.getElementById('loginForm');
    // ضمان عمل زر Enter من حقل الرقم السري في كل المتصفحات
    var pinEl = document.getElementById('loginPin');
    pinEl.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); form.onsubmit(e); }
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      var pin = document.getElementById('loginPin').value.trim();
      if (!A._pick) { err.textContent = 'اختاري اسمك أولاً'; return; }
      if (!pin) { err.textContent = 'أدخلي الرقم السري'; return; }
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
      A.signIn(A._pick, pin).then(function () {
        btn.disabled = false; btn.textContent = 'دخول';
        document.getElementById('loginPin').value = '';
        scr.hidden = true; app.hidden = false;
        onDone();
      }).catch(function (ex) {
        btn.disabled = false; btn.textContent = 'دخول';
        err.textContent = ex && ex.message ? ex.message : 'تعذّر الدخول';
      });
    };
  };

  A.signIn = function (id, pin) {
    var person = VH.store.employees().filter(function (p) { return p.id === id; })[0];
    if (!person) return Promise.reject(new Error('المستخدم غير موجود'));

    if (VH.store.mode === 'cloud') {
      return VH.store._fb.auth.signInWithEmailAndPassword(email(id), pin)
        .then(function () { return VH.store.startSync(); })
        .then(function () { A._set(person); })
        .catch(function (e) {
          var m = 'تعذّر الدخول';
          if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') m = 'الرقم السري غير صحيح';
          else if (e.code === 'auth/user-not-found') m = 'لم يُنشأ حساب لهذا الموظف في Firebase بعد';
          else if (e.code === 'auth/too-many-requests') m = 'محاولات كثيرة — انتظري دقيقة ثم أعيدي المحاولة';
          else if (e.code === 'auth/network-request-failed') m = 'لا يوجد اتصال بالإنترنت';
          throw new Error(m);
        });
    }

    var pins = VH.store.settings().pins || {};
    var stored = pins[id];
    if (!stored) {                       // أول تشغيل: الرقم الافتراضي 1234
      if (pin !== '1234') return Promise.reject(new Error('الرقم الافتراضي لأول دخول هو 1234'));
      pins[id] = hash('1234'); VH.store.saveSettings({ pins: pins });
    } else if (stored !== hash(pin)) {
      return Promise.reject(new Error('الرقم السري غير صحيح'));
    }
    A._set(person);
    return Promise.resolve();
  };

  A._set = function (person) {
    A._user = { id: person.id, name: person.name, role: person.role };
    localStorage.setItem('vh_last_user', person.id);
    sessionStorage.setItem(SES_KEY, JSON.stringify(A._user));
  };

  A.restore = function () {
    try {
      var s = JSON.parse(sessionStorage.getItem(SES_KEY) || 'null');
      if (!s) return null;
      var p = VH.store.employees().filter(function (x) { return x.id === s.id; })[0];
      if (!p) return null;
      A._user = { id: p.id, name: p.name, role: p.role };
      return A._user;
    } catch (e) { return null; }
  };

  A.signOut = function () {
    A._user = null;
    sessionStorage.removeItem(SES_KEY);
    if (VH.store.mode === 'cloud' && VH.store._fb) {
      VH.store.stopSync();
      VH.store._fb.auth.signOut().catch(function () {});
    }
    location.hash = '';
    location.reload();
  };

  A.changePin = function (id, oldPin, newPin) {
    if (VH.store.mode === 'cloud') {
      var u = VH.store._fb.auth.currentUser;
      if (!u) return Promise.reject(new Error('سجّلي الدخول أولاً'));
      return VH.store._fb.auth.signInWithEmailAndPassword(u.email, oldPin)
        .then(function () { return u.updatePassword(newPin); });
    }
    var pins = VH.store.settings().pins || {};
    if (pins[id] && pins[id] !== hash(oldPin)) return Promise.reject(new Error('الرقم السري الحالي غير صحيح'));
    pins[id] = hash(newPin);
    VH.store.saveSettings({ pins: pins });
    return Promise.resolve();
  };

  A.resetPinLocal = function (id) {
    if (VH.store.mode === 'cloud') return false;
    var pins = VH.store.settings().pins || {};
    delete pins[id];
    VH.store.saveSettings({ pins: pins });
    return true;
  };

  VH.auth = A;
})(window.VH);
