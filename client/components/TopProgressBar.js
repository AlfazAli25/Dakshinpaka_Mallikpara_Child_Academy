"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function TopProgressBar() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const timer = useRef(null);

  // Start progress on route change
  useEffect(() => {
    setVisible(true);
    setProgress(0);
    let value = 0;
    function step() {
      value += Math.random() * 18 + 2; // Fast at first, slows down
      if (value < 90) {
        setProgress(value);
        timer.current = setTimeout(step, 120);
      }
    }
    step();
    return () => timer.current && clearTimeout(timer.current);
  }, [pathname]);

  // Complete progress when page is loaded
  useEffect(() => {
    if (!visible) return;
    const handleComplete = () => {
      setProgress(100);
      setTimeout(() => setVisible(false), 350);
    };
    window.addEventListener("load", handleComplete);
    return () => window.removeEventListener("load", handleComplete);
  }, [visible]);

  // Hide bar when not visible
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
