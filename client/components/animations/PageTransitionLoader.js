'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import PageLottieLoader from './PageLottieLoader';

export default function PageTransitionLoader() {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const timeoutRef = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    setVisible(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setVisible(false);
    }, 450);
  }, [pathname]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[110] grid place-items-center bg-white/65 backdrop-blur-xl dark:bg-slate-950/65"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="rounded-2xl border border-red-200/80 bg-white/90 px-6 py-5 shadow-xl dark:border-red-400/20 dark:bg-slate-900/80">
            <PageLottieLoader label="Loading page" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
