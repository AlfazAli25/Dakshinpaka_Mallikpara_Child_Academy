import { post } from '@/lib/api';
import { firebaseApp } from '@/lib/firebase';

const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';

const supportsNotifications = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator;

const getMessagingDependencies = async () => {
  const messagingModule = await import('firebase/messaging');
  const isMessagingSupported = await messagingModule.isSupported();

  if (!isMessagingSupported) {
    return null;
  }

  return {
    messagingModule,
    messaging: messagingModule.getMessaging(firebaseApp)
  };
};

const registerMessagingServiceWorker = async () => {
  if (!supportsNotifications()) {
    return null;
  }

  return navigator.serviceWorker.register('/firebase-messaging-sw.js');
};

export const requestNotificationPermission = async () => {
  if (!supportsNotifications()) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
};

export const getFcmToken = async () => {
  if (!supportsNotifications()) {
    return '';
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
  if (!vapidKey || vapidKey.startsWith('REPLACE_WITH_')) {
    return '';
  }

  const dependencies = await getMessagingDependencies();
  if (!dependencies?.messaging || !dependencies?.messagingModule) {
    return '';
  }

  const registration = await registerMessagingServiceWorker();
  if (!registration) {
    return '';
  }

  const token = await dependencies.messagingModule.getToken(dependencies.messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  return token || '';
};

export const saveFcmToken = async ({ userId, token, authToken }) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedToken = String(token || '').trim();

  if (!normalizedUserId || !normalizedToken) {
    return;
  }

  await post(
    '/save-token',
    {
      userId: normalizedUserId,
      token: normalizedToken
    },
    authToken
  );
};

export const registerPushNotificationsOnLogin = async ({ user, authToken }) => {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return;
    }

    const token = await getFcmToken();
    if (!token) {
      return;
    }

    await saveFcmToken({
      userId: user?.id || user?._id,
      token,
      authToken
    });
  } catch (_error) {
    // Push setup should never block login navigation.
  }
};

let activeForegroundUnsubscribe = null;

export const startForegroundNotificationListener = async () => {
  if (!supportsNotifications()) {
    return () => {};
  }

  if (activeForegroundUnsubscribe) {
    return activeForegroundUnsubscribe;
  }

  try {
    const dependencies = await getMessagingDependencies();
    if (!dependencies?.messaging || !dependencies?.messagingModule) {
      return () => {};
    }

    const unsubscribe = dependencies.messagingModule.onMessage(dependencies.messaging, (payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'School Notification';
      const body = payload?.notification?.body || payload?.data?.body || 'You have a new update.';
      const icon = payload?.notification?.icon || payload?.data?.icon || DEFAULT_NOTIFICATION_ICON;

      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon
        });
      }
    });

    activeForegroundUnsubscribe = () => {
      unsubscribe();
      activeForegroundUnsubscribe = null;
    };

    return activeForegroundUnsubscribe;
  } catch (_error) {
    return () => {};
  }
};
