'use client';

export const canRunThreeScene = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const largeViewport = window.matchMedia?.('(min-width: 1024px)')?.matches;

    if (reducedMotion || !largeViewport) {
      return false;
    }

    const deviceMemory = Number(window.navigator?.deviceMemory || 0);
    if (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 2) {
      return false;
    }

    const hardwareThreads = Number(window.navigator?.hardwareConcurrency || 0);
    if (Number.isFinite(hardwareThreads) && hardwareThreads > 0 && hardwareThreads <= 2) {
      return false;
    }

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    return Boolean(gl);
  } catch (_error) {
    return false;
  }
};
