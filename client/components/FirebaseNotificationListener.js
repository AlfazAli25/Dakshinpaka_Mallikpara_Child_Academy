'use client';

import { useEffect } from 'react';
import { startForegroundNotificationListener } from '@/lib/push-notifications';

export default function FirebaseNotificationListener() {
  useEffect(() => {
    let unsubscribe = () => {};

    const init = async () => {
      unsubscribe = await startForegroundNotificationListener();
    };

    init();

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
}
