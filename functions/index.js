/* ============================================================
   أكاديمية الجامعيين — دوال سحابية (إشعارات FCM + تصحيح التمارين)
   ============================================================ */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const SITE = 'https://aljamieen-academy.web.app/';

/* تصحيح نقاط التمارين خادمياً (يمنع تلاعب الطالب بنقاطه) */
exports.gradeQuiz = onDocumentCreated('quizResults/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const d = snap.data() || {};
  const uid = d.uid, lessonId = d.lessonId, answers = d.answers || {};
  if (!uid || !lessonId) return;
  const db = getFirestore();
  const exSnap = await db.collection('exercises').doc(lessonId).get();
  const items = (exSnap.exists && exSnap.data().items) || [];
  let correct = 0;
  items.forEach((it, i) => { if (Number(answers[i]) === Number(it.answer)) correct++; });
  const points = correct * 10;
  await snap.ref.update({ correct, total: items.length, points, graded: true });
  const all = await db.collection('quizResults').where('uid', '==', uid).get();
  const best = {};
  all.forEach(qd => {
    const q = qd.data();
    const p = qd.id === snap.id ? points : (q.graded ? (q.points || 0) : 0);
    if (best[q.lessonId] === undefined || p > best[q.lessonId]) best[q.lessonId] = p;
  });
  const total = Object.values(best).reduce((a, b) => a + Number(b || 0), 0);
  await db.collection('students').doc(uid).update({ points: total });
});

exports.sendNotificationPush = onDocumentCreated('notifications/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  const db = getFirestore();

  let uids = [];
  if (data.audience === 'all') {
    const studs = await db.collection('students').where('status', '==', 'active').get();
    uids = studs.docs.filter(doc => doc.data().role !== 'admin').map(doc => doc.id);
  } else if (data.target) {
    uids = [data.target];
  }
  if (!uids.length) return;

  const tokens = [];
  for (const uid of uids) {
    const t = await db.collection('deviceTokens').doc(uid).get();
    if (t.exists && t.data().token) tokens.push(t.data().token);
  }
  if (!tokens.length) return;

  const message = {
    notification: { title: data.title || 'أكاديمية الجامعيين', body: data.body || '' },
    webpush: {
      notification: { icon: '/icon.png', dir: 'rtl', lang: 'ar' },
      fcmOptions: { link: SITE },
    },
    tokens,
  };
  const res = await getMessaging().sendEachForMulticast(message);

  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') dead.push(uids[i]);
    }
  });
  await Promise.all(dead.map(uid => db.collection('deviceTokens').doc(uid).delete().catch(() => {})));
});
