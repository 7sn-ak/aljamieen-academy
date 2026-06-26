/* خدمة إشعارات الخلفية (FCM) — تعرض الإشعار حتى والتطبيق مغلق. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAyHZInQN7dC1q3ttSaJEbIoX0Udvh6m3Y",
  authDomain:        "aljamieen-academy.firebaseapp.com",
  projectId:         "aljamieen-academy",
  storageBucket:     "aljamieen-academy.firebasestorage.app",
  messagingSenderId: "136870597270",
  appId:             "1:136870597270:web:54cde11f153da2cf7fa8b7"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  self.registration.showNotification(
    (p.notification && p.notification.title) || 'أكاديمية الجامعيين',
    { body: (p.notification && p.notification.body) || '', icon: './icon.png', dir: 'rtl', lang: 'ar' }
  );
});
