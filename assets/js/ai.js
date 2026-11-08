/* =====================================================================
   المساعد الذكي — يقرأ الصور ويعبّئ النموذج
   ---------------------------------------------------------------------
   • الصورة تُصغَّر في المتصفح ثم تُرسل إلى api/ai.php على خادمنا،
     وهو وحده من يعرف مفتاح الـ API (لا يظهر أبداً في المتصفح).
   • القاعدة: الذكاء الاصطناعي يعبّئ، والموظف يراجع ويحفظ.
     لا يُحفظ شيء تلقائياً، والحقول المعبّأة تُعلَّم لتراجَع بالعين.
   ===================================================================== */
window.VH = window.VH || {};

(function (VH) {
  'use strict';

  var A = { _state: null };

  A.url = function () {
    var cfg = (window.VH_CONFIG || {}).aiUrl;
    if (cfg) return cfg;
    var base = location.pathname.replace(/[^/]*$/, '');
    return location.origin + base + 'api/ai.php';
  };

  /** هل الخدمة مفعّلة على الخادم؟ (يُسأل مرة واحدة ويُحفظ في الذاكرة) */
  A.status = function () {
    if (A._state) return Promise.resolve(A._state);
    return fetch(A.url() + '?ping=1', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { A._state = { enabled: !!j.enabled, model: j.model || '' }; return A._state; })
      .catch(function () { A._state = { enabled: false, model: '', offline: true }; return A._state; });
  };

  /** صورة → base64 مصغّرة (الحد 1600 بكسل وجودة تكفي للقراءة) */
  A.prep = function (file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) { rej(new Error('الملف ليس صورة')); return; }
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var MAX = 1600, w = img.width, h = img.height;
        if (Math.max(w, h) > MAX) { var k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = c.toDataURL('image/jpeg', 0.82);
        res({ mime: 'image/jpeg', data: dataUrl.split(',')[1], w: w, h: h, preview: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('تعذّرت قراءة الصورة')); };
      img.src = url;
    });
  };

  /** هوية الموظف الحالية — الخادم لا يقبل الطلب بدونها */
  A.token = function () {
    var fb = VH.store._fb;
    if (!fb || !fb.auth || !fb.auth.currentUser) return Promise.resolve('');
    return fb.auth.currentUser.getIdToken().catch(function () { return ''; });
  };

  /** يرسل الصور ويعيد { fields, confidence, missing } */
  A.read = function (files, task, hint) {
    return Promise.all([].map.call(files, A.prep)).then(function (imgs) {
      return A.token().then(function (tok) {
        if (!tok) throw new Error('الخدمة تحتاج تسجيل دخول سحابي — غير متاحة في الوضع المحلي');
        return fetch(A.url(), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok },
          body: JSON.stringify({
            task: task, hint: hint || '',
            images: imgs.map(function (i) { return { mime: i.mime, data: i.data }; })
          })
        });
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j.ok) throw new Error(j.error || 'تعذّرت قراءة الصورة');
          j.previews = imgs.map(function (i) { return i.preview; });
          return j;
        });
      });
    });
  };

  /* ---------------------------------------------------------------
     زر «اقرأ من صورة» — يُضاف داخل أي نافذة
     opts: { task, hint, label, onFields(fields, result, bd) }
     --------------------------------------------------------------- */
  A.buttonHtml = function (id, label) {
    return '<div class="ai-box" id="' + id + '">' +
      '<button type="button" class="btn btn--sm btn--navy" data-ai-pick>✨ ' + VH.esc(label || 'اقرأ من صورة وعبّئ') + '</button>' +
      '<input type="file" accept="image/*" multiple hidden data-ai-file>' +
      '<span class="ai-msg small muted"></span>' +
      '</div>';
  };

  /** يربط الزر بالنافذة ويملأ الحقول بعد القراءة */
  A.bind = function (bd, opts) {
    var box = bd.querySelector('#' + opts.id);
    if (!box) return;
    var btn = box.querySelector('[data-ai-pick]');
    var file = box.querySelector('[data-ai-file]');
    var msg = box.querySelector('.ai-msg');

    A.status().then(function (s) {
      if (s.enabled) return;
      btn.disabled = true;
      msg.textContent = s.offline
        ? 'المساعد الذكي غير متاح الآن (تعذّر الوصول للخادم)'
        : 'المساعد الذكي غير مفعّل — يلزم إضافة مفتاح الخدمة على الخادم';
    });

    btn.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var fs = file.files;
      if (!fs || !fs.length) return;
      if (fs.length > 4) { msg.textContent = 'أربع صور كحدٍّ أقصى'; return; }
      btn.disabled = true;
      msg.innerHTML = '<span class="ai-wait">جارٍ قراءة ' + (fs.length === 1 ? 'الصورة' : fs.length + ' صور') + '…</span>';
      A.read(fs, opts.task, opts.hint)
        .then(function (res) {
          var n = opts.onFields(res.fields || {}, res, bd) || 0;
          var conf = { high: 'واضحة', medium: 'مقبولة', low: 'ضعيفة' }[res.confidence] || '';
          var cnt = n === 0 ? 'لم يُعبَّأ أي حقل' : n === 1 ? 'عُبّئ حقل واحد'
            : n === 2 ? 'عُبّئ حقلان' : n <= 10 ? 'عُبّئت ' + n + ' حقول' : 'عُبّئ ' + n + ' حقلاً';
          msg.innerHTML = '<span class="' + (n ? 'ai-ok' : 'ai-miss') + '">' + cnt + ' · جودة القراءة ' + conf + '</span>' +
            (res.missing && res.missing.length
              ? '<br><span class="ai-miss">لم تُقرأ: ' + VH.esc(res.missing.join('، ')) + '</span>' : '') +
            '<br><span class="muted">راجعي القيم قبل الحفظ.</span>';
          if (res.confidence === 'low') VH.toast('القراءة ضعيفة — تأكّدي من البيانات أو أعيدي التصوير بإضاءة أفضل', 'warn', 6000);
        })
        .catch(function (e) { msg.innerHTML = '<span class="ai-err">' + VH.esc(e.message) + '</span>'; })
        .then(function () { btn.disabled = false; file.value = ''; });
    });
  };

  /* ---------------- أدوات التعبئة ---------------- */
  /** يضع قيمة في حقل نموذج ويعلّمه كمعبّأ آلياً */
  A.set = function (bd, name, val) {
    if (val === undefined || val === null || val === '') return 0;
    var el = bd.querySelector('[data-f=' + name + ']');
    if (!el) return 0;
    el.value = val;
    el.classList.add('ai-filled');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  };
  /** يضع قيمة في خلية جدول داخل النافذة */
  A.setCell = function (tr, key, val) {
    if (val === undefined || val === null || val === '') return 0;
    var el = tr.querySelector('[data-k=' + key + ']');
    if (!el) return 0;
    el.value = val;
    el.classList.add('ai-filled');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  };
  A.num = function (v) {
    if (v === undefined || v === null || v === '') return '';
    var n = VH.num(String(v).replace(/[^\d.\-]/g, ''));
    return n || '';
  };
  A.phone = function (v) {
    var d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('966') === 0) d = '0' + d.slice(3);
    if (d.length === 9 && d.charAt(0) === '5') d = '0' + d;
    return d;
  };
  A.date = function (v) {
    var s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  /** يقرّب نص نوع السيارة إلى أقرب خيار في القائمة */
  A.matchOption = function (val, options) {
    var s = String(val || '').trim();
    if (!s) return '';
    var exact = options.filter(function (o) { return o === s; })[0];
    if (exact) return exact;
    var low = s.toLowerCase();
    var hit = options.filter(function (o) {
      var ol = String(o).toLowerCase();
      return ol.indexOf(low) > -1 || low.indexOf(ol) > -1;
    })[0];
    return hit || '';
  };

  VH.ai = A;
})(window.VH);
