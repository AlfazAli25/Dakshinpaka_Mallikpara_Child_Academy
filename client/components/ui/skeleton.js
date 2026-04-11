export default function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-red-100 via-white to-red-100 bg-[length:220%_100%] ${className}`.trim()}
      style={{ animationDuration: '1.3s' }}
      aria-hidden="true"
    />
  );
}
