'use client';

import { motion } from 'framer-motion';

export default function ParticlesBackground3D({ className = '' }) {
  return (
    <div className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`.trim()} aria-hidden="true">
      <motion.div
        className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-red-300/35 blur-3xl"
        animate={{ x: [0, 35, -20, 0], y: [0, 20, -15, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 right-[-110px] h-96 w-96 rounded-full bg-red-500/20 blur-3xl"
        animate={{ x: [0, -45, 25, 0], y: [0, -25, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-160px] left-1/3 h-[28rem] w-[28rem] rounded-full bg-red-200/25 blur-3xl"
        animate={{ x: [0, 25, -35, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(220,38,38,0.12)_0,transparent_35%),radial-gradient(circle_at_80%_70%,rgba(153,27,27,0.12)_0,transparent_40%)]" />
    </div>
  );
}
