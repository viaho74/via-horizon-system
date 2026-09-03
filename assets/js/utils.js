/* =====================================================================
   أدوات عامة: الأرقام، التواريخ، الفترات، الضريبة، التصدير
   ===================================================================== */
window.VH = window.VH || {};

(function (U) {
  'use strict';

  /* ---------- الأرقام والمال ---------- */
  var nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  U.round2 = function (n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; };
  U.num = function (n) { var v = parseFloat(n); return isNaN(v) ? 0 : v; };
  U.fmt = function (n) { return nf2.format(U.num(n)); };
  U.int = function (n) { return nf0.format(U.num(n)); };
  U.money = function (n) { return '<span class="num">' + U.fmt(n) + '</span> ر.س'; };
  U.moneyTxt = function (n) { return U.fmt(n) + ' ر.س'; };

  /* ---------- التواريخ (نصوص YYYY-MM-DD بالتوقيت المحلي) ---------- */
  U.iso = function (d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0'), y = d.getFullYear(), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };
  U.today = function () { return U.iso(new Date()); };
  U.toDate = function (s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };
  U.addDays = function (s, n) { var d = U.toDate(s); if (!d) return s; d.setDate(d.getDate() + n); return U.iso(d); };
  /** عدد أيام الخدمة شاملاً يومي البداية والنهاية */
  U.daysBetween = function (a, b) {
    var x = U.toDate(a), y = U.toDate(b);
    if (!x || !y) return 0;
    var d = Math.round((y - x) / 86400000) + 1;
    return d > 0 ? d : 0;
  };
  U.MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  U.DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  /** اسم اليوم بالعربي من تاريخ YYYY-MM-DD */
  U.dayName = function (s) { var d = U.toDate(s); return d ? U.DAYS[d.getDay()] : '—'; };
  U.dateAr = function (s) {
    var d = U.toDate(s); if (!d) return '—';
    return d.getDate() + ' ' + U.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  };
  U.dateShort = function (s) { return s ? String(s).slice(0, 10) : '—'; };
  U.stamp = function () { return new Date().toISOString(); };
  U.stampAr = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return U.dateAr(U.iso(d)) + ' · ' + hh + ':' + mm;
  };
  U.quarterOf = function (s) { var d = U.toDate(s); return d ? Math.floor(d.getMonth() / 3) + 1 : 0; };
  U.yearOf = function (s) { var d = U.toDate(s); return d ? d.getFullYear() : 0; };
  U.monthKey = function (s) { return s ? String(s).slice(0, 7) : ''; };
  U.monthLabel = function (key) {
    var p = String(key).split('-');
    return U.MONTHS[(+p[1]) - 1] + ' ' + p[0];
  };

  /* ---------- الفترات ---------- */
  U.PERIODS = [
    { k: 'today', t: 'اليوم' }, { k: 'yesterday', t: 'أمس' }, { k: 'last7', t: 'آخر 7 أيام' },
    { k: 'last30', t: 'آخر 30 يوم' }, { k: 'month', t: 'الشهر الحالي' }, { k: 'prevMonth', t: 'الشهر السابق' },
    { k: 'quarter', t: 'الربع الحالي' }, { k: 'year', t: 'هذا العام' }, { k: 'prevYear', t: 'العام السابق' },
    { k: 'all', t: 'كل الفترات' }
  ];
  U.range = function (key, from, to) {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), t = U.today();
    function mk(a, b, label) { return { from: a, to: b, key: key, label: label }; }
    switch (key) {
      case 'today': return mk(t, t, 'اليوم');
      case 'yesterday': var yd = U.addDays(t, -1); return mk(yd, yd, 'أمس');
      case 'last7': return mk(U.addDays(t, -6), t, 'آخر 7 أيام');
      case 'last30': return mk(U.addDays(t, -29), t, 'آخر 30 يوم');
      case 'month': return mk(U.iso(new Date(y, m, 1)), U.iso(new Date(y, m + 1, 0)), U.MONTHS[m] + ' ' + y);
      case 'prevMonth': return mk(U.iso(new Date(y, m - 1, 1)), U.iso(new Date(y, m, 0)), U.MONTHS[(m + 11) % 12] + ' ' + (m === 0 ? y - 1 : y));
      case 'quarter':
        var q = Math.floor(m / 3);
        return mk(U.iso(new Date(y, q * 3, 1)), U.iso(new Date(y, q * 3 + 3, 0)), 'الربع ' + (q + 1) + ' — ' + y);
      case 'year': return mk(y + '-01-01', y + '-12-31', 'عام ' + y);
      case 'prevYear': return mk((y - 1) + '-01-01', (y - 1) + '-12-31', 'عام ' + (y - 1));
      case 'custom': return mk(from || t, to || t, 'من ' + U.dateShort(from) + ' إلى ' + U.dateShort(to));
      default: return mk('1900-01-01', '2999-12-31', 'كل الفترات');
    }
  };
  /** الفترة السابقة المكافئة بنفس الطول (للمقارنة) */
  U.prevRange = function (r) {
    if (r.key === 'all') return null;
    var len = U.daysBetween(r.from, r.to);
    if (!len) return null;
    return { from: U.addDays(r.from, -len), to: U.addDays(r.from, -1) };
  };
  U.inRange = function (d, r) { if (!d || !r) return false; d = String(d).slice(0, 10); return d >= r.from && d <= r.to; };
  U.delta = function (cur, prev) {
    cur = U.num(cur); prev = U.num(prev);
    if (!prev) return { pct: cur ? 100 : 0, dir: cur ? 'up' : 'flat' };
    var p = ((cur - prev) / Math.abs(prev)) * 100;
    return { pct: Math.abs(p), dir: p > 0.05 ? 'up' : (p < -0.05 ? 'down' : 'flat') };
  };

  /* ---------- الضريبة ---------- */
  /** inclusive=true يعني أن المبلغ المُدخل شامل الضريبة */
  U.vat = function (amount, rate, inclusive) {
    amount = U.num(amount); rate = U.num(rate);
    var before, tax, total;
    if (inclusive) {
      total = U.round2(amount);
      before = U.round2(total / (1 + rate / 100));
      tax = U.round2(total - before);
    } else {
      before = U.round2(amount);
      tax = U.round2(before * rate / 100);
      total = U.round2(before + tax);
    }
    return { before: before, vat: tax, total: total, rate: rate };
  };

  /* ---------- نصوص ---------- */
  U.esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.uid = function (p) {
    return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  U.initials = function (name) { return String(name || '؟').trim().charAt(0); };
  /** 05xxxxxxxx → 9665xxxxxxxx لروابط واتساب */
  U.waPhone = function (p) {
    var d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('966') === 0) return d;
    if (d.charAt(0) === '0') return '966' + d.slice(1);
    if (d.charAt(0) === '5' && d.length === 9) return '966' + d;
    return d;
  };
  U.telOk = function (p) { return /^(?:\+?966|0)?5\d{8}$/.test(String(p || '').replace(/[\s-]/g, '')); };

  /* ---------- التصدير ---------- */
  U.csv = function (rows) {
    var body = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c === undefined || c === null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
    return '﻿' + body; // BOM ليفتح Excel العربية سليمة
  };
  U.download = function (name, content, mime) {
    var blob = new Blob([content], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  };

  /* ---------- رمز QR بصيغة هيئة الزكاة (TLV → Base64) ---------- */
  U.zatcaTlv = function (seller, vatNo, isoTime, total, vatAmount) {
    var enc = new TextEncoder(), out = [];
    function push(tag, val) {
      var b = enc.encode(String(val === undefined || val === null ? '' : val));
      out.push(tag, b.length);
      for (var i = 0; i < b.length; i++) out.push(b[i]);
    }
    push(1, seller); push(2, vatNo); push(3, isoTime);
    push(4, U.fmt(total).replace(/,/g, '')); push(5, U.fmt(vatAmount).replace(/,/g, ''));
    var bin = '';
    for (var i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return btoa(bin);
  };

  /* ---------- الصور: ضغط وتصغير قبل الحفظ ---------- */
  /**
   * يقرأ صورة من حقل ملف ويصغّرها ويضغطها لتُحفظ داخل بيانات الصفقة.
   * الحد الأقصى لمستند Firestore ‏1 ميجابايت، لذا نصغّر إلى 1400px وجودة 0.72.
   */
  U.readImage = function (file, maxDim, quality) {
    maxDim = maxDim || 1400; quality = quality || 0.72;
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('لم يُختر ملف'));
      if (!/^image\//.test(file.type)) return rej(new Error('الملف ليس صورة (اختاري JPG أو PNG)'));
      if (file.size > 12 * 1024 * 1024) return rej(new Error('حجم الصورة أكبر من 12 ميجابايت'));
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('تعذّرت قراءة الصورة')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { rej(new Error('الصورة غير صالحة')); };
        img.onload = function () {
          var w = img.width, h = img.height, sc = Math.min(1, maxDim / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var out = cv.toDataURL('image/jpeg', quality);
          if (out.length > 900000) out = cv.toDataURL('image/jpeg', 0.5);
          if (out.length > 900000) return rej(new Error('الصورة كبيرة جداً — صوّريها بجودة أقل'));
          res({ dataUrl: out, kb: Math.round(out.length / 1365), w: cv.width, h: cv.height });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  U.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 250); };
  };

})(window.VH);
