
"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

export default function TopProgressBar() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const timer = useRef(null);

  // Show progress bar on route change start
  useEffect(() => {
    const handleStart = () => {
      setVisible(true);
      setProgress(0);
      let value = 0;
      function step() {
        value += Math.random() * 18 + 2;
        if (value < 90) {
          setProgress(value);
          timer.current = setTimeout(step, 120);
        }
      }
      step();
    };
    const handleDone = () => {
      setProgress(100);
      setTimeout(() => setVisible(false), 350);
      if (timer.current) clearTimeout(timer.current);
    };

    // Listen to Next.js router events
    router.events?.on?.("routeChangeStart", handleStart);
    router.events?.on?.("routeChangeComplete", handleDone);
    router.events?.on?.("routeChangeError", handleDone);

    // Also handle initial load
    handleStart();
    window.addEventListener("load", handleDone);

    return () => {
      router.events?.off?.("routeChangeStart", handleStart);
      router.events?.off?.("routeChangeComplete", handleDone);
      router.events?.off?.("routeChangeError", handleDone);
      window.removeEventListener("load", handleDone);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 z-[120] h-[3px] w-full bg-transparent"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 transition-all duration-200"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

