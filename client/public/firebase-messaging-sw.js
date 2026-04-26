/* global importScripts, firebase */

// This service worker handles Firebase Cloud Messaging background notifications.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain: 'REPLACE_WITH_FIREBASE_AUTH_DOMAIN',
  projectId: 'REPLACE_WITH_FIREBASE_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_FIREBASE_SENDER_ID',
  appId: 'REPLACE_WITH_FIREBASE_APP_ID',
  measurementId: 'REPLACE_WITH_FIREBASE_MEASUREMENT_ID'
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
