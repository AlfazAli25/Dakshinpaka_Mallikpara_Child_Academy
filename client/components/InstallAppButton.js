'use client';

import { useEffect, useState } from 'react';

const isStandaloneMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches || Boolean(window.navigator.standalone);
};

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (_error) {
      // Ignore prompt interruption and keep normal flow.
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  };

  if (isInstalled || !deferredPrompt) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onInstallClick}
      className="fixed bottom-4 right-4 z-[70] rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isInstalling}
      aria-label="Install SchoolApp"
    >
      {isInstalling ? 'Preparing install...' : 'Install App'}
    </button>
  );
}
