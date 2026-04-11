'use client';

export default function ParticlesBackground3D({ className = '' }) {
  return (
    <div className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`.trim()} aria-hidden="true">
      <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-red-300/28 blur-3xl" />
      <div className="absolute top-1/3 right-[-110px] h-96 w-96 rounded-full bg-red-500/16 blur-3xl" />
      <div className="absolute bottom-[-160px] left-1/3 h-[28rem] w-[28rem] rounded-full bg-red-200/20 blur-3xl" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(220,38,38,0.12)_0,transparent_35%),radial-gradient(circle_at_80%_70%,rgba(153,27,27,0.12)_0,transparent_40%)]" />
    </div>
  );
}
