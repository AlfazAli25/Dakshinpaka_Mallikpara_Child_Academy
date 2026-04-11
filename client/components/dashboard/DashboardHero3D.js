'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox, Sparkles } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { canRunThreeScene } from '@/lib/three-capability';

function FloatingObjects() {
  const groupRef = useRef(null);

  useFrame((_state, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.y += delta * 0.2;
  });

  return (
    <group ref={groupRef}>
      <Float speed={1.2} rotationIntensity={0.3} floatIntensity={0.4}>
        <RoundedBox args={[1.3, 0.16, 0.9]} radius={0.08} position={[-1.7, 0.1, 0]}>
          <meshStandardMaterial color="#ef4444" roughness={0.35} metalness={0.1} />
        </RoundedBox>
        <RoundedBox args={[1.3, 0.16, 0.9]} radius={0.08} position={[-1.6, 0.34, -0.2]}>
          <meshStandardMaterial color="#fca5a5" roughness={0.32} metalness={0.08} />
        </RoundedBox>
      </Float>

      <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.45}>
        <mesh position={[0.1, 0.3, 0.1]}>
          <coneGeometry args={[0.55, 0.22, 4]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.28} metalness={0.2} />
        </mesh>
        <mesh position={[0.1, 0.2, 0.1]}>
          <cylinderGeometry args={[0.06, 0.06, 0.18, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.2} />
        </mesh>
      </Float>

      <Float speed={0.9} rotationIntensity={0.2} floatIntensity={0.3}>
        <RoundedBox args={[1, 0.85, 0.8]} radius={0.07} position={[1.75, 0.04, 0]}>
          <meshStandardMaterial color="#fecaca" roughness={0.4} metalness={0.05} />
        </RoundedBox>
        <mesh position={[1.75, 0.62, 0.39]}>
          <coneGeometry args={[0.55, 0.35, 4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.3} metalness={0.1} />
        </mesh>
      </Float>

      <Sparkles count={36} size={2.4} speed={0.25} color="#fca5a5" opacity={0.7} scale={[7, 2.6, 2]} />
    </group>
  );
}

export default function DashboardHero3D() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(canRunThreeScene());
  }, []);

  if (!enabled) {
    return (
      <div className="flex h-[240px] w-full items-center justify-center overflow-hidden rounded-3xl border border-red-200/80 bg-gradient-to-br from-white via-red-50/65 to-red-100/80 shadow-[0_30px_70px_-40px_rgba(153,27,27,0.7)] dark:border-red-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/40">
        <div className="rounded-2xl border border-red-200/80 bg-white/85 px-5 py-4 text-center shadow-sm dark:border-red-400/20 dark:bg-slate-900/80">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-200">Live Analytics</p>
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-red-100/85">Performance scene optimized for your device.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-3xl border border-red-200/80 bg-gradient-to-br from-white via-red-50/65 to-red-100/80 shadow-[0_30px_70px_-40px_rgba(153,27,27,0.7)] dark:border-red-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/40">
      <Canvas camera={{ position: [0, 0.6, 4.6], fov: 45 }} dpr={[1, 1.25]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 4, 2]} intensity={1.1} color="#fca5a5" />
        <directionalLight position={[-3, -2, -2]} intensity={0.5} color="#ffffff" />
        <FloatingObjects />
        <mesh position={[0, -0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      </Canvas>
    </div>
  );
}
