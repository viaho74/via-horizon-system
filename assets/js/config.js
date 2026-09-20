/* =====================================================================
   إعدادات الربط بـ Firebase
   ---------------------------------------------------------------------
   • ما دامت القيم فارغة، النظام يعمل في «الوضع المحلي» على هذا الجهاز فقط.
   • لتفعيل المشاركة بين الموظفين: افتحي مشروعك في console.firebase.google.com
     ثم ⚙️ إعدادات المشروع ← «تطبيقاتك» ← تطبيق ويب ← انسخي قيم firebaseConfig
     والصقيها هنا. الخطوات بالتفصيل في README.md.
   • هذه المفاتيح عامة بطبيعتها ولا تُعدّ سرّاً — الحماية الحقيقية في قواعد
     Firestore (ملف firestore.rules) التي تمنع أي وصول بدون تسجيل دخول.
   ===================================================================== */

window.VH_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCgr6NDkEs-az7lZKcPgh0Fa8bULeYgrtg",
    authDomain: "saas-via.firebaseapp.com",
    projectId: "saas-via",
    storageBucket: "saas-via.firebasestorage.app",
    messagingSenderId: "855831269136",
    appId: "1:855831269136:web:170cc340bdfe5675f89f95"
  },

  // نطاق الحسابات الداخلية للموظفين (لا يُرسل عليه بريد فعلي)
  authDomainSuffix: "viahorizon.local",

  // بيانات الشركة التي تظهر في الفواتير المطبوعة (قابلة للتعديل من الإعدادات)
  company: {
    name: "شركة فيا هورايزن",
    slogan: "نسهّل رحلتك، ونوسّع أفقك",
    taxNumber: "",
    crNumber: "",
    phone: "",
    email: "",
    address: ""
  }
};
