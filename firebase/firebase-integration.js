/* ============================================================
   أكاديمية الجامعيين — وحدة ربط Firebase (جاهزة للتفعيل)
   ------------------------------------------------------------
   تعمل بالتزامن مع app.js: تحمّل البيانات من Firestore إلى window.DB
   ثم تعيد رسم الواجهة، وتستبدل دوال الحفظ (window.*) بنسخ تكتب في
   Firestore. إن لم تُعبَّأ المفاتيح في firebase-config.js يبقى
   التطبيق في «وضع العرض المحلي» دون أي تعطّل.

   التفعيل:
   1) عبّئ firebase/firebase-config.js بمفاتيحك.
   2) في index.html أزل التعليق عن سطري تحميل config وهذه الوحدة.
   3) انشر على استضافة https وجرّب (يحتاج اختباراً عند أول تشغيل).
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, isSignInWithEmailLink, signInWithEmailLink, sendSignInLinkToEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  setPersistence, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, onSnapshot, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const CFG = window.FIREBASE_CONFIG;
const configured = CFG && CFG.apiKey && !String(CFG.apiKey).includes('ضع');

let app, auth, db, msg, uid = null;
const render = () => window.render && window.render();

if (!configured) {
  console.info('[الجامعيين] Firebase غير مُعدّ — التطبيق يعمل في وضع العرض المحلي.');
} else {
  start().catch(e => console.error('[الجامعيين] خطأ في الربط:', e));
}

async function start() {
  app = initializeApp(CFG);
  auth = getAuth(app);
  db = getFirestore(app);

  // حفظ الجلسة بشكل دائم: يبقى الطالب مسجَّلاً حتى يسجّل الخروج بنفسه (لا تنتهي تلقائياً)
  try { await setPersistence(auth, indexedDBLocalPersistence); }
  catch (e) { try { await setPersistence(auth, browserLocalPersistence); } catch (_) {} }

  await completeGoogleRedirect();            // إكمال دخول Google إن عاد عبر إعادة توجيه
  await completeEmailLinkSignIn();           // إكمال الدخول إن كان عبر رابط
  wireAuthScreen();                          // ربط أزرار شاشة الدخول (Google + الرابط)
  setSwitcher(false);                        // إخفاء زر التبديل (يظهر للمشرف فقط)
  onAuthStateChanged(auth, onAuth);          // متابعة حالة الدخول
}

/* زر التبديل بين عرض المشرف وعرض الطالب — للمشرف فقط (معاينة بدون تغيير الحساب) */
function setSwitcher(show){ const rs = document.getElementById('roleSwitch'); if (rs) rs.style.display = show ? '' : 'none'; }

/* شاشة تسجيل الاسم الثلاثي للطالب الجديد */
function askName(){
  return new Promise(res => {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="auth" style="justify-content:center;text-align:center">
      <div style="font-size:2.8rem">👋</div>
      <h1>مرحباً بك</h1>
      <p class="auth-sub">أكمل تسجيلك — اكتب اسمك الثلاثي</p>
      <div class="auth-card">
        <div class="field"><label>الاسم الثلاثي</label><input id="regName" placeholder="مثال: محمد أحمد العتيبي" autocomplete="name"></div>
        <button class="btn btn-primary btn-block" id="regBtn">متابعة</button>
        <p class="auth-note">سيظهر هذا الاسم للمشرف في قائمة الطلاب.</p>
      </div></div>`;
    const submit = () => { const v = (document.getElementById('regName').value || '').trim(); if (v.length < 3) { document.getElementById('regName').focus(); return; } res(v); };
    document.getElementById('regBtn').onclick = submit;
    document.getElementById('regName').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => { const el = document.getElementById('regName'); if (el) el.focus(); }, 60);
  });
}

/* ---------- الدخول بحساب Google (الطريقة الأساسية — بلا حدود يومية) ---------- */
async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    authMsg('جارٍ فتح نافذة Google...');
    await signInWithPopup(auth, provider);     // onAuthStateChanged يكمل الباقي
  } catch (e) {
    const c = e && e.code || '';
    // على الجوال/داخل التطبيق قد تُحجب النافذة المنبثقة → نحوّل لإعادة التوجيه
    if (c.includes('popup-blocked') || c.includes('operation-not-supported') || c.includes('cancelled-popup-request')) {
      try { await signInWithRedirect(auth, provider); } catch (e2) { authMsg('تعذّر الدخول بـ Google: ' + (e2.code || e2.message)); }
    } else if (c.includes('popup-closed-by-user')) {
      authMsg('أُغلقت نافذة Google قبل إكمال الدخول. حاول مرة أخرى.');
    } else {
      authMsg('تعذّر الدخول بـ Google: ' + (c || e.message));
    }
  }
}
async function completeGoogleRedirect() {
  try { await getRedirectResult(auth); } catch (e) { if (e && e.code) console.warn('[الجامعيين] redirect:', e.code); }
}

/* ---------- المصادقة برابط الإيميل (طريقة احتياطية) ---------- */
const actionCodeSettings = () => ({ url: location.origin + location.pathname, handleCodeInApp: true });

function authMsg(t, ok) {
  const c = document.querySelector('.auth-card'); if (!c) return;
  let m = document.getElementById('authMsg');
  if (!m) { m = document.createElement('p'); m.id = 'authMsg'; m.className = 'auth-note'; c.appendChild(m); }
  m.style.color = ok ? 'var(--green-600)' : 'var(--gold-600)';
  m.textContent = t;
}
async function sendLink(email) {
  try {
    authMsg('جارٍ إرسال الرابط...');
    await sendSignInLinkToEmail(auth, email, actionCodeSettings());
    localStorage.setItem('aljamieen_email', email);
    authMsg('✅ أرسلنا رابط الدخول إلى ' + email + ' — افتح الرابط من نفس هذا المتصفّح (لا تفتحه داخل تطبيق آخر).', true);
  } catch (e) { authMsg('تعذّر الإرسال: ' + (e.code || e.message)); }
}
async function completeEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  // على الجوال يُفتح الرابط غالباً في متصفّح مختلف عن الذي طُلب منه،
  // فقد لا يوجد البريد محفوظاً — نطلبه عبر شاشة داخل الصفحة (أوثق من prompt على الجوال).
  let email = localStorage.getItem('aljamieen_email');
  if (!email) email = await confirmEmailScreen();
  if (!email) return;
  try {
    await signInWithEmailLink(auth, email, location.href);
    localStorage.removeItem('aljamieen_email');
    history.replaceState(null, '', location.pathname);   // ينظّف الرابط من العنوان
  } catch (e) {
    showLinkError(e);                                     // إظهار الخطأ بوضوح بدل الفشل الصامت
  }
}

/* شاشة تأكيد البريد لإكمال الدخول (بديل prompt — تعمل على كل متصفّحات الجوال) */
function confirmEmailScreen(){
  return new Promise(res => {
    const el = document.getElementById('app');
    el.innerHTML = `<div class="auth" style="justify-content:center;text-align:center">
      <div style="font-size:2.6rem">📩</div>
      <h1>إكمال الدخول</h1>
      <p class="auth-sub">للتأكيد، اكتب البريد نفسه الذي طلبت منه الرابط</p>
      <div class="auth-card">
        <div class="field"><label>البريد الإلكتروني</label>
          <input id="cEmail" type="email" inputmode="email" autocomplete="email" placeholder="example@email.com"></div>
        <button class="btn btn-primary btn-block" id="cBtn">دخول</button>
        <p class="auth-note">افتح الرابط من نفس الجهاز الذي طلبت منه الرابط.</p>
      </div></div>`;
    const submit = () => { const v = (document.getElementById('cEmail').value || '').trim();
      if (!v || v.indexOf('@') < 0) { document.getElementById('cEmail').focus(); return; } res(v); };
    document.getElementById('cBtn').onclick = submit;
    document.getElementById('cEmail').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => { const i = document.getElementById('cEmail'); if (i) i.focus(); }, 60);
  });
}

/* رسالة خطأ واضحة عند فشل الرابط (منتهٍ/مستخدَم/بريد غير مطابق) + زر طلب رابط جديد */
function showLinkError(e){
  const code = (e && (e.code || e.message)) || '';
  const ar = code.includes('invalid-action-code') || code.includes('expired')
      ? 'انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطاً جديداً.'
    : code.includes('invalid-email')
      ? 'البريد الذي أدخلته لا يطابق الرابط. حاول مجدداً بالبريد الصحيح.'
      : 'تعذّر إكمال الدخول: ' + code;
  const el = document.getElementById('app');
  el.innerHTML = `<div class="auth" style="justify-content:center;text-align:center">
    <div style="font-size:2.6rem">⚠️</div>
    <h1>تعذّر الدخول</h1>
    <div class="auth-card"><p class="muted">${ar}</p>
      <button class="btn btn-primary btn-block mt" id="reLogin">طلب رابط جديد</button></div></div>`;
  const b = document.getElementById('reLogin');
  if (b) b.onclick = () => { history.replaceState(null, '', location.pathname); location.hash = '#/login'; location.reload(); };
}
function wireAuthScreen() {
  // تفويض الحدث (الشاشة تُعاد رسمها) — نلتقط ضغط زر Google أو زر رابط البريد
  document.addEventListener('click', (e) => {
    const g = e.target.closest('#googleBtn');
    if (g) { e.preventDefault(); e.stopPropagation(); signInWithGoogle(); return; }
    const b = e.target.closest('#emailLinkBtn');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const inp = document.getElementById('loginEmail') || document.querySelector('.auth input[type=email]');
      const email = (inp && inp.value || '').trim();
      if (!email) { authMsg('اكتب بريدك الإلكتروني'); return; }
      sendLink(email);
    }
  }, true);
}

/* ---------- بعد الدخول: تجهيز الملف + الصلاحيات ---------- */
async function onAuth(user) {
  if (!user) { uid = null; setSwitcher(false); return; }
  uid = user.uid;
  const ref = doc(db, 'students', uid);
  let snap = await getDoc(ref);

  if (!snap.exists()) {
    // أول دخول → إنشاء طلب انضمام (أو مشرف إن كان البريد هو بريد المشرف الأول)
    const isFirstAdmin = user.email && window.FIRST_ADMIN_EMAIL &&
      user.email.toLowerCase() === String(window.FIRST_ADMIN_EMAIL).toLowerCase();
    const fullName = isFirstAdmin
      ? (user.displayName || (user.email || '').split('@')[0])
      : await askName();                       // الطالب الجديد يكتب اسمه الثلاثي
    await setDoc(ref, {
      name: fullName,
      email: user.email || '',
      role: isFirstAdmin ? 'admin' : 'student',
      status: isFirstAdmin ? 'active' : 'pending',
      points: 0, progress: 0, lessonsDone: 0,
      done: {}, quiz: {}, joined: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp()
    });
    snap = await getDoc(ref);
  }

  const me = snap.data();
  window.DB.me = { id: uid, sid: uid, name: me.name, joined: me.joined || '', quiz: me.quiz || {} };
  // أدرج سجلّ الطالب نفسه في القائمة حتى لا تحسبه الواجهة «محظوراً» (القائمة الكاملة للمشرف فقط)
  if (me.role !== 'admin') window.DB.students = [ mapStudent({ id: uid, ...me }) ];
  setSwitcher(me.role === 'admin');           // زر التبديل للمشرف فقط (معاينة)

  if (me.role === 'admin') { initMessaging(); subscribeAll(true); location.hash = '#/admin'; }
  else if (me.status === 'pending') { showGate('بانتظار موافقة المشرف', 'تم استلام طلب انضمامك. سيصلك إشعار عند الموافقة.'); }
  else if (me.status === 'disabled' || me.status === 'معطّل') { showGate('حسابك معطّل مؤقتاً', 'يُرجى مراجعة المشرف.'); }
  else { initMessaging(); subscribeAll(false); if (location.hash.startsWith('#/login') || location.hash === '' ) location.hash = '#/home'; }
}

function showGate(title, body) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="auth" style="text-align:center;justify-content:center">
    <div style="font-size:3rem">⏳</div><h1>${title}</h1>
    <div class="auth-card"><p class="muted">${body}</p>
      <button class="btn btn-outline btn-block mt" onclick="firebaseSignOut()">تسجيل الخروج</button></div></div>`;
}
window.firebaseSignOut = () => signOut(auth).then(() => location.hash = '#/login');

/* ---------- المزامنة اللحظية: Firestore → window.DB ---------- */
function subscribeAll(isAdmin) {
  const onColl = (name, cb) => onSnapshot(collection(db, name), s => { cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); render(); });
  const byTime = (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  window.DB.notifications = [];   // امسح إشعارات النموذج التجريبي قبل تحميل الحقيقية

  onColl('subjects', rows => { window.DB.courses = rows; });
  onColl('lessons',  rows => {
    const myDone = (window.DB._myDone) || {};
    window.DB.lessons = rows.map(l => ({ ...l, done: !!myDone[l.id] }));
  });
  onColl('exercises', rows => { const ex = {}; rows.forEach(r => ex[r.id] = r.items || []); window.DB.exercises = ex; });

  if (isAdmin) {
    // المشرف يرى كل الإشعارات
    onColl('notifications', rows => { window.DB.notifications = rows.sort(byTime); });
    onColl('students', rows => {
      window.DB.students = rows.filter(r => r.role !== 'admin').map(mapStudent);
      window.DB.admins  = rows.filter(r => r.role === 'admin').map(a => ({ id: a.id, name: a.name, email: a.email || '' }));
    });
  } else {
    // الطالب يقرأ فقط ما يُسمح له: العامة (all) + الموجّهة له — باستعلامين منفصلين
    // (قراءة المجموعة كاملة تفشل بسبب قواعد الأمان فتبقى بيانات النموذج ظاهرة)
    let pub = [], mine = [];
    const merge = () => { window.DB.notifications = [...pub, ...mine].sort(byTime); render(); };
    onSnapshot(query(collection(db, 'notifications'), where('audience', '==', 'all')),
      s => { pub = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
      e => console.warn('[الجامعيين] إشعارات عامة:', e.code));
    onSnapshot(query(collection(db, 'notifications'), where('target', '==', uid)),
      s => { mine = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
      e => console.warn('[الجامعيين] إشعاراتي:', e.code));
  }

  // ملف الطالب نفسه (تقدّمه ونقاطه)
  onSnapshot(doc(db, 'students', uid), d => {
    if (!d.exists()) return showGate('تم إنهاء حسابك', 'يُرجى مراجعة المشرف.');
    const me = d.data();
    if (me.status === 'disabled' || me.status === 'معطّل') return showGate('حسابك معطّل مؤقتاً', 'يُرجى مراجعة المشرف.');
    window.DB._myDone = me.done || {};
    window.DB.me.quiz = me.quiz || {};
    if (!isAdmin) window.DB.students = [ mapStudent({ id: uid, ...me }) ];   // إبقاء سجلّ الطالب نفسه محدّثاً
    window.DB.lessons = (window.DB.lessons || []).map(l => ({ ...l, done: !!(me.done || {})[l.id] }));
    render();
  });
}
function mapStudent(s) {
  const statusAr = { active: 'نشط', pending: 'بانتظار الموافقة', disabled: 'معطّل', struggling: 'متعثّر' };
  return { id: s.id, name: s.name, points: s.points || 0, progress: s.progress || 0,
           lessonsDone: s.lessonsDone || 0, last: s.last || '—', status: statusAr[s.status] || s.status };
}

/* ---------- استبدال دوال الكتابة بنسخ Firestore ---------- */
function override() {
  const L = () => collection(db, 'lessons');

  window.saveLesson = async function () {
    const t = val('fTitle'); if (!t) return window.toast('اكتب عنوان الدرس');
    const type = window.state.addType;
    const data = { title: t, course: val('fCourse'), date: val('fDate'), type, desc: val('fDesc'), updatedAt: serverTimestamp() };
    if (type === 'video') { data.youtube = ytId(val('fYoutube')); data.minutes = 20; }
    else { data.book = val('fBook') || 'كتاب'; data.pages = val('fPages') || '—'; }
    if (window.state.editId) await updateDoc(doc(db, 'lessons', window.state.editId), data);
    else { const ref = await addDoc(L(), { ...data, createdAt: serverTimestamp() });
           // لا نرسل إشعار «درس جديد» إن كان مجدولاً في المستقبل (يظهر للطلاب في موعده)
           if (!window.isFuture || !window.isFuture(data.date)) await notify('all', 'درس جديد متاح', 'تم نشر «' + t + '».'); }
    window.toast('تم الحفظ'); location.hash = '#/admin/lessons';
  };
  window.deleteLesson = async function (id) {
    if (!confirm('حذف الدرس؟')) return;
    await deleteDoc(doc(db, 'lessons', id)); await deleteDoc(doc(db, 'exercises', id)).catch(() => {});
    window.toast('تم حذف الدرس');
  };
  window.toggleSubject = async function (id) {
    const c = window.DB.courses.find(x => x.id === id);
    await updateDoc(doc(db, 'subjects', id), { active: !c.active });
  };
  window.addSubject = async function () {
    const v = val('newSubj'); if (!v) return window.toast('اكتب اسم المادة');
    await addDoc(collection(db, 'subjects'), { name: v, active: true, cert: { enabled: false, title: '', signer: 'إدارة أكاديمية الجامعيين' } });
    window.toast('أُضيفت المادة');
  };
  window.saveCert = async function (id) {
    const c = window.DB.courses.find(x => x.id === id);
    await updateDoc(doc(db, 'subjects', id), { cert: {
      enabled: document.getElementById('cEnabled').checked,
      title: val('cTitle') || ('شهادة إتمام مادة ' + c.name),
      signer: val('cSigner') || 'إدارة أكاديمية الجامعيين'
    }});
    window.toast('تم حفظ الشهادة'); location.hash = '#/admin/subjects';
  };
  window.addQuestion = async function (id) {
    const q = val('qText'); if (!q) return window.toast('اكتب نص السؤال');
    const raw = [0,1,2,3].map(i => ({ v: val('qOpt'+i), checked: document.querySelector('input[name=qCorrect][value="'+i+'"]').checked }));
    const filled = raw.filter(o => o.v); if (filled.length < 2) return window.toast('أضف خيارين على الأقل');
    const cr = raw.find(o => o.checked); if (!cr || !cr.v) return window.toast('حدّد الإجابة الصحيحة');
    const items = (window.DB.exercises[id] || []).slice();
    items.push({ q, opts: filled.map(o => o.v), answer: filled.indexOf(cr) });
    await setDoc(doc(db, 'exercises', id), { items }, { merge: true });
    window.toast('أُضيف السؤال');
  };
  window.deleteQuestion = async function (id, idx) {
    const items = (window.DB.exercises[id] || []).slice(); items.splice(idx, 1);
    await setDoc(doc(db, 'exercises', id), { items }, { merge: true });
    window.toast('حُذف السؤال');
  };
  window.approve = async function (id) { await updateDoc(doc(db, 'students', id), { status: 'active', last: 'اليوم' }); await notify('private', 'تمت الموافقة', 'تم قبول انضمامك — أهلاً بك.', id); window.toast('تمت الموافقة وأُرسل إشعار'); };
  window.rejectStudent = async function (id) { if (!confirm('رفض الطلب؟')) return; await deleteDoc(doc(db, 'students', id)); window.toast('تم الرفض'); };
  window.makeAdmin = async function (id) {
    if (!confirm('ترقية هذا الطالب إلى مشرف؟ سيحصل على كامل صلاحيات الإدارة.')) return;
    await updateDoc(doc(db, 'students', id), { role: 'admin', status: 'active' });
    await notify('private', 'تمت ترقيتك', 'أصبحت مشرفاً في أكاديمية الجامعيين — أعد فتح الموقع لتظهر لك لوحة المشرف.', id);
    window.toast('تمت الترقية إلى مشرف');
  };
  window.makeStudent = async function (id) {
    if (id === uid) return window.toast('لا يمكنك إنزال نفسك');
    if (!confirm('إرجاع هذا المشرف إلى طالب عادي؟')) return;
    await updateDoc(doc(db, 'students', id), { role: 'student' });
    window.toast('تم الإرجاع إلى طالب');
  };
  window.disableStudent = async function (id) { await updateDoc(doc(db, 'students', id), { status: 'disabled' }); window.toast('تم تعطيل الحساب'); };
  window.enableStudent  = async function (id) { await updateDoc(doc(db, 'students', id), { status: 'active' }); window.toast('تم تفعيل الحساب'); };
  window.removeStudent  = async function (id) { if (!confirm('طرد الطالب نهائياً؟')) return; await deleteDoc(doc(db, 'students', id)); window.toast('تم الطرد'); };
  window.sendNotif = async function () {
    const t = val('nTitle'), b = val('nBody'); if (!t || !b) return window.toast('اكمل العنوان والنص');
    if (window.state.notifAud === 'all') await notify('all', t, b);
    else { const name = document.getElementById('nTarget').value; const s = window.DB.students.find(x => x.name === name); await notify('private', t, b, s && s.id); }
    window.toast('تم إرسال الإشعار'); location.hash = '#/admin';
  };

  // الطالب
  window.toggleDone = async function (id) {
    const cur = !!(window.DB._myDone || {})[id];
    await updateDoc(doc(db, 'students', uid), { ['done.' + id]: !cur });
    window.toast(!cur ? 'أحسنت! تم إكمال الدرس' : 'أُلغيت العلامة');
  };
  window.submitQuiz = async function (lid) {
    const exs = window.DB.exercises[lid] || []; if (!exs.length) return;
    for (let i = 0; i < exs.length; i++) if (window.state.answers[lid + '_' + i] === undefined) return window.toast('أجب على جميع الأسئلة');
    let correct = 0; const answers = {};
    exs.forEach((e, i) => { const a = window.state.answers[lid + '_' + i]; answers[i] = a; if (a === e.answer) correct++; });
    // النقاط النهائية تُحسب خادمياً (دالة gradeQuiz) لمنع التلاعب — لا نكتب النقاط من العميل
    await updateDoc(doc(db, 'students', uid), { ['quiz.' + lid]: { answers, correct, total: exs.length, submittedAt: new Date().toISOString() } });
    await addDoc(collection(db, 'quizResults'), { uid, lessonId: lid, answers, total: exs.length, at: serverTimestamp() });
    window.toast(`نتيجتك ${correct}/${exs.length} · تُحتسب نقاطك خلال لحظات`);
  };

  // إيقاف الحفظ المحلي (صار في السحابة)
  window.saveDB = function () {};
}
override();

async function myPoints() { const d = await getDoc(doc(db, 'students', uid)); return (d.data() || {}).points || 0; }
async function notify(audience, title, body, target) {
  await addDoc(collection(db, 'notifications'), { audience, title, body, target: target || null, time: 'الآن', ts: Date.now(), createdAt: serverTimestamp() });
}
function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function ytId(u) { if (!u) return ''; const m = u.match(/(?:v=|be\/|embed\/)([\w-]{11})/); return m ? m[1] : u.slice(0, 11); }

/* ---------- إشعارات FCM ---------- */
let swReg = null;
async function initMessaging() {
  try {
    if (!('serviceWorker' in navigator) || !window.VAPID_KEY || String(window.VAPID_KEY).includes('ضع')) return;
    swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    msg = getMessaging(app);
    onMessage(msg, p => window.toast && window.toast((p.notification && p.notification.title) || 'إشعار جديد'));
    // إن سبق منح الإذن، خزّن رمز الجهاز بصمت (دون طلب إذن تلقائي — المتصفّحات تمنعه)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') await storeToken();
  } catch (e) { console.warn('[الجامعيين] الإشعارات:', e); }
}
async function storeToken() {
  const token = await getToken(msg, { vapidKey: window.VAPID_KEY, serviceWorkerRegistration: swReg || undefined });
  if (token && uid) await setDoc(doc(db, 'deviceTokens', uid), { token, updatedAt: serverTimestamp() });
  return token;
}
// يُستدعى من زر «تفعيل الإشعارات» (طلب الإذن يجب أن يكون من نقرة المستخدم)
window.enablePush = async function () {
  try {
    if (!('serviceWorker' in navigator) || !window.VAPID_KEY || String(window.VAPID_KEY).includes('ضع')) {
      return window.toast && window.toast('الإشعارات غير مدعومة على هذا الجهاز');
    }
    if (!swReg) swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    if (!msg) msg = getMessaging(app);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return window.toast && window.toast('لم يُمنح إذن الإشعارات. فعّله من إعدادات المتصفّح.');
    const token = await storeToken();
    onMessage(msg, p => window.toast && window.toast((p.notification && p.notification.title) || 'إشعار جديد'));
    window.toast && window.toast(token ? '✅ تم تفعيل إشعارات الهاتف' : 'تعذّر الحصول على رمز الجهاز');
    window.render && window.render();
  } catch (e) {
    console.warn('[الجامعيين] تفعيل الإشعارات:', e);
    window.toast && window.toast('تعذّر التفعيل: ' + (e.code || e.message));
  }
};
