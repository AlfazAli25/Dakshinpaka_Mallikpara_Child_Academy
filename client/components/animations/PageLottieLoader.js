'use client';

import Lottie from 'lottie-react';
import pageLoaderData from './page-loader-data';

export default function PageLottieLoader({ label = 'Loading', size = 82, className = '' }) {
  return (
    <div className={`inline-flex flex-col items-center justify-center gap-2 ${className}`.trim()} role="status" aria-live="polite">
      <Lottie animationData={pageLoaderData} loop autoplay style={{ width: size, height: size }} />
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">{label}</span>
    </div>
  );
}
