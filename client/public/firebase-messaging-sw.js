/* global importScripts, firebase */

// This service worker handles Firebase Cloud Messaging background notifications.
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;

const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
  measurementId: params.get('measurementId') || ''
};

const hasMessagingConfig =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.projectId) &&
  Boolean(firebaseConfig.messagingSenderId) &&
  Boolean(firebaseConfig.appId);

if (hasMessagingConfig) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = hasMessagingConfig ? firebase.messaging() : null;

if (messaging) {
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
}

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
