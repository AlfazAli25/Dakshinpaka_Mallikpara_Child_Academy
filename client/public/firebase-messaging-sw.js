/* global importScripts, firebase */

// This service worker handles Firebase Cloud Messaging background notifications.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBvTipZCqOiwrwAmtwZBt2WJuWRlvr59qQ',
  authDomain: 'school-management-system-aa5f1.firebaseapp.com',
  projectId: 'school-management-system-aa5f1',
  storageBucket: 'school-management-system-aa5f1.firebasestorage.app',
  messagingSenderId: '792042411645',
  appId: '1:792042411645:web:bf59a17a29498607354314',
  measurementId: 'G-6D0SYT72YY'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'School Notification';
  const body = payload?.notification?.body || payload?.data?.body || 'You have a new update.';
  const icon = payload?.notification?.icon || payload?.data?.icon || '/icons/icon-192.png';
  const clickAction = payload?.data?.clickAction || '/';

  self.registration.showNotification(title, {
    body,
    icon,
    data: {
      clickAction
    }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = event.notification?.data?.clickAction || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(destination);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(destination);
        }

        return null;
      })
  );
});
