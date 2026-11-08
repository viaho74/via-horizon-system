<?php
/* =====================================================================
   وسيط الذكاء الاصطناعي — نظام فيا هورايزن
   ---------------------------------------------------------------------
   يستقبل صورة من النظام، يرسلها إلى Claude لقراءتها، ويعيد البيانات
   المستخرجة بصيغة JSON ليعبّئها النظام في النموذج.

   لماذا على الخادم ولا يُستدعى من المتصفح مباشرة؟
   لأن مفتاح الـ API سرّ؛ لو وُضع في ملفات الجافاسكربت لرآه أي شخص
   يفتح الصفحة واستهلك رصيدك. هنا يبقى المفتاح على الخادم وحده.

   الإعداد (مرة واحدة):
   1) احصلي على مفتاح من console.anthropic.com ← API Keys
   2) أنشئي ملفاً باسم ai-key.php بجانب هذا الملف ومحتواه:
        <?php return 'sk-ant-...';
      (ملف منفصل حتى لا يُرفع المفتاح مع تحديثات النظام)
   3) لا شيء آخر — النظام يكتشف التفعيل تلقائياً.
   ===================================================================== */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const MODEL        = 'claude-sonnet-5-5';
const MAX_IMG_MB   = 5;
const DAILY_LIMIT  = 300;          // حد أقصى للطلبات يومياً حمايةً للرصيد
const PROJECT_ID   = 'saas-via';   // مشروع Firebase — للتحقق من هوية الموظف

function fail(int $code, string $msg, array $extra = []) {
    http_response_code($code);
    echo json_encode(array_merge(['ok' => false, 'error' => $msg], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/** جلب عنوان عبر cURL — بعض الاستضافات تعطّل file_get_contents على الروابط */
function httpGet(string $url): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
    $out = curl_exec($ch);
    $ok = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200;
    curl_close($ch);
    return ($out === false || !$ok) ? null : (string) $out;
}

/* ---------------- حالة التفعيل ---------------- */
$keyFile = __DIR__ . '/ai-key.php';
$apiKey  = is_file($keyFile) ? (string) include $keyFile : (string) getenv('ANTHROPIC_API_KEY');
$apiKey  = trim($apiKey);

if (($_GET['ping'] ?? '') !== '') {
    echo json_encode(['ok' => true, 'enabled' => $apiKey !== '', 'model' => MODEL], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'الطريقة غير مسموحة');
if ($apiKey === '') fail(503, 'لم يُفعَّل الذكاء الاصطناعي بعد — ينقص مفتاح الـ API على الخادم');

/* ---------------- التحقق من هوية الموظف (Firebase ID token) ----------------
   لا نفتح الخدمة للعالم: لا بد أن يكون الطلب من موظف مسجّل دخوله في النظام. */
function verifyFirebaseToken(string $jwt): array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return [false, 'صيغة الهوية غير صحيحة'];
    [$h64, $p64, $s64] = $parts;
    $b64 = static fn(string $s): string => base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
    $head = json_decode($b64($h64), true);
    $body = json_decode($b64($p64), true);
    if (!is_array($head) || !is_array($body)) return [false, 'تعذّرت قراءة الهوية'];
    if (($body['aud'] ?? '') !== PROJECT_ID) return [false, 'الهوية لمشروع آخر'];
    if (($body['iss'] ?? '') !== 'https://securetoken.google.com/' . PROJECT_ID) return [false, 'مُصدر الهوية غير معتمد'];
    if ((int) ($body['exp'] ?? 0) < time()) return [false, 'انتهت صلاحية الجلسة — أعيدي تسجيل الدخول'];
    if (empty($body['sub'])) return [false, 'الهوية بلا مستخدم'];

    // شهادات جوجل العامة (تُحفظ ساعةً لتقليل الطلبات)
    $cache = sys_get_temp_dir() . '/vh_fb_certs.json';
    $certs = null;
    if (is_file($cache) && time() - filemtime($cache) < 3600) {
        $certs = json_decode((string) file_get_contents($cache), true);
    }
    if (!is_array($certs)) {
        $raw = httpGet('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
        $certs = $raw ? json_decode($raw, true) : null;
        if (is_array($certs)) @file_put_contents($cache, json_encode($certs));
    }
    if (!is_array($certs)) return [false, 'تعذّر الوصول لشهادات التحقق'];
    $cert = $certs[$head['kid'] ?? ''] ?? null;
    if (!$cert) return [false, 'شهادة التوقيع غير معروفة'];

    $ok = openssl_verify($h64 . '.' . $p64, $b64($s64), $cert, OPENSSL_ALGO_SHA256);
    if ($ok !== 1) return [false, 'توقيع الهوية غير صحيح'];
    return [true, $body];
}

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_VH_TOKEN'] ?? '';
if (stripos($auth, 'Bearer ') === 0) $auth = substr($auth, 7);
if ($auth === '') fail(401, 'سجّلي الدخول أولاً');
[$okTok, $who] = verifyFirebaseToken(trim($auth));
if (!$okTok) fail(401, is_string($who) ? $who : 'تعذّر التحقق من الهوية');

/* ---------------- حد يومي بسيط ---------------- */
$counter = sys_get_temp_dir() . '/vh_ai_' . date('Ymd') . '.txt';
$used = is_file($counter) ? (int) file_get_contents($counter) : 0;
if ($used >= DAILY_LIMIT) fail(429, 'بلغنا الحد اليومي لقراءة الصور — حاولي غداً');

/* ---------------- المدخلات ---------------- */
$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) fail(400, 'طلب غير صالح');
$task   = (string) ($in['task'] ?? '');
$images = $in['images'] ?? [];
$hint   = trim((string) ($in['hint'] ?? ''));
if (!is_array($images) || !$images) fail(400, 'أرفقي صورة واحدة على الأقل');
if (count($images) > 4) fail(400, 'أربع صور كحدٍّ أقصى في المرة الواحدة');

/* ---------------- ما نطلب استخراجه في كل حالة ---------------- */
$TASKS = [
  'rental' => [
    'ar' => 'عقد أو فاتورة من مكتب تأجير سيارات',
    'fields' => '{
      "officeName": "اسم مكتب التأجير كما في الورقة، نص",
      "officePhone": "جوال المكتب، أرقام فقط",
      "cars": [{
        "carType": "نوع السيارة وموديلها",
        "plate": "رقم اللوحة كما هو مكتوب (حروف وأرقام)",
        "rentPerDay": "إيجار اليوم رقماً، شاملاً الضريبة إن ذُكرت كذلك",
        "kmAllowed": "عدد الكيلومترات المسموحة رقماً",
        "kmExtraRate": "سعر الكيلو الزائد رقماً"
      }],
      "startDate": "تاريخ بداية العقد بصيغة YYYY-MM-DD",
      "endDate": "تاريخ نهاية العقد بصيغة YYYY-MM-DD",
      "notes": "أي شرط مهم كالتأمين أو الوقود، سطر واحد"
    }'
  ],
  'driver' => [
    'ar' => 'هوية أو إقامة أو رخصة قيادة لسائق',
    'fields' => '{
      "name": "الاسم الكامل بالعربية",
      "idNo": "رقم الهوية أو الإقامة، أرقام فقط",
      "nationality": "سعودي أو غير سعودي فقط",
      "phone": "رقم الجوال إن ظهر، أرقام فقط",
      "notes": "تاريخ انتهاء الوثيقة إن ظهر"
    }'
  ],
  'expense' => [
    'ar' => 'فاتورة مصروف (بنزين، غسيل، مستلزمات، أو ما شابه)',
    'fields' => '{
      "kind": "واحد من: بنزين، مناديل، موية، يومية السواق، أخرى",
      "note": "وصف مختصر لما في الفاتورة",
      "amount": "المبلغ الإجمالي شاملاً الضريبة رقماً",
      "date": "تاريخ الفاتورة بصيغة YYYY-MM-DD",
      "vendor": "اسم المحطة أو المتجر",
      "taxNo": "الرقم الضريبي للبائع إن ظهر"
    }'
  ],
  'vehicle' => [
    'ar' => 'استمارة سيارة أو رخصة سير',
    'fields' => '{
      "carType": "نوع السيارة وطرازها",
      "plate": "رقم اللوحة كما هو مكتوب",
      "model": "سنة الصنع",
      "notes": "أي بيان مهم آخر"
    }'
  ],
  'request' => [
    'ar' => 'طلب عميل (صورة محادثة أو رسالة أو جدول فيه تفاصيل وفد)',
    'fields' => '{
      "orgName": "اسم الجهة أو الشركة",
      "clientName": "اسم الشخص المسؤول",
      "clientPhone": "جواله، أرقام فقط",
      "clientEmail": "بريده إن ذُكر",
      "items": [{
        "name": "نوع السيارة المطلوبة",
        "qty": "العدد رقماً",
        "withDriver": "بسائق أو بدون سائق",
        "fromCity": "مدينة الانطلاق",
        "toCity": "مدينة الوصول",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD",
        "unit": "السعر المتفق عليه للوحدة رقماً إن ذُكر"
      }],
      "notes": "أي طلب خاص"
    }'
  ],
];
if (!isset($TASKS[$task])) fail(400, 'نوع القراءة غير معروف');

$content = [];
foreach ($images as $img) {
    $data = (string) ($img['data'] ?? '');
    $mime = (string) ($img['mime'] ?? 'image/jpeg');
    if (!preg_match('~^image/(jpeg|png|webp|gif)$~', $mime)) fail(400, 'صيغة الصورة غير مدعومة');
    if (strlen($data) > MAX_IMG_MB * 1024 * 1024 * 4 / 3) fail(400, 'حجم الصورة كبير — صغّريها قبل الإرسال');
    if (base64_decode($data, true) === false) fail(400, 'تعذّرت قراءة الصورة');
    $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $data]];
}

$prompt =
  "أنت مساعد إدخال بيانات في نظام شركة فيا هورايزن للنقل والسياحة في السعودية.\n" .
  "الصورة/الصور المرفقة: {$TASKS[$task]['ar']}.\n\n" .
  "استخرج البيانات وأعدها في JSON فقط، بلا أي نص قبله أو بعده، بهذا الشكل:\n" .
  "{\"fields\": " . $TASKS[$task]['fields'] . ", \"confidence\": \"high|medium|low\", \"missing\": [\"أسماء الحقول التي لم تجدها\"]}\n\n" .
  "قواعد مهمة:\n" .
  "- لا تخترع أي قيمة. ما لا تجده اتركه \"\" وأضف اسمه في missing.\n" .
  "- الأرقام أرقاماً غربية بلا فواصل ولا رمز عملة (مثال: 1250.50).\n" .
  "- التواريخ بصيغة YYYY-MM-DD ميلادية. لو كان التاريخ هجرياً حوّله واذكر ذلك في notes.\n" .
  "- أرقام الجوال بصيغة 05XXXXXXXX.\n" .
  "- إن كانت الصورة غير واضحة أو لا تخص الموضوع، أعد confidence=low واترك الحقول فارغة.\n" .
  ($hint !== '' ? "- ملاحظة من المستخدم: {$hint}\n" : '');

$content[] = ['type' => 'text', 'text' => $prompt];

/* ---------------- النداء ---------------- */
$payload = json_encode([
    'model' => MODEL,
    'max_tokens' => 2000,
    'messages' => [['role' => 'user', 'content' => $content]],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 90,
    CURLOPT_HTTPHEADER => [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
]);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$cerr = curl_error($ch);
curl_close($ch);

if ($res === false) fail(502, 'تعذّر الاتصال بخدمة الذكاء الاصطناعي: ' . $cerr);
$j = json_decode((string) $res, true);
if ($code !== 200) {
    $m = $j['error']['message'] ?? ('رمز ' . $code);
    fail(502, 'ردّت خدمة الذكاء الاصطناعي بخطأ: ' . $m);
}

@file_put_contents($counter, (string) ($used + 1));

$text = '';
foreach (($j['content'] ?? []) as $blk) {
    if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
}
// بعض الردود تأتي داخل ```json
if (preg_match('~\{.*\}~s', $text, $m)) $text = $m[0];
$out = json_decode($text, true);
if (!is_array($out)) fail(502, 'تعذّر فهم ردّ الذكاء الاصطناعي', ['raw' => mb_substr($text, 0, 400)]);

echo json_encode([
    'ok' => true,
    'task' => $task,
    'fields' => $out['fields'] ?? [],
    'confidence' => $out['confidence'] ?? 'medium',
    'missing' => $out['missing'] ?? [],
    'usage' => $j['usage'] ?? null,
], JSON_UNESCAPED_UNICODE);
