'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { canRunThreeScene } from '@/lib/three-capability';

function ParticleCloud({ count = 1200 }) {
  const pointsRef = useRef(null);

  const positions = useMemo(() => {
    const data = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const index = i * 3;
      data[index] = (Math.random() - 0.5) * 14;
      data[index + 1] = (Math.random() - 0.5) * 10;
      data[index + 2] = (Math.random() - 0.5) * 12;
    }

    return data;
  }, [count]);

  useFrame((_state, delta) => {
    if (!pointsRef.current) {
      return;
    }

    pointsRef.current.rotation.y += delta * 0.018;
    pointsRef.current.rotation.x += delta * 0.006;
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled>
      <PointMaterial transparent color="#f87171" size={0.03} sizeAttenuation depthWrite={false} opacity={0.4} />
    </Points>
  );
}

export default function ParticlesBackground3D({ className = '' }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(canRunThreeScene());
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className={`pointer-events-none fixed inset-0 -z-10 opacity-80 ${className}`.trim()} aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.15]}>
        <ambientLight intensity={0.25} />
        <directionalLight position={[2, 2, 3]} intensity={0.55} color="#fca5a5" />
        <ParticleCloud />
      </Canvas>
    </div>
  );
}
