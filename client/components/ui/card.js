import { cn } from '@/lib/utils';

export default function Card({ className = '', children }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-red-100/80 bg-white/80 p-5 shadow-[0_20px_45px_-30px_rgba(153,27,27,0.5)] backdrop-blur-xl dark:border-red-400/20 dark:bg-slate-900/65',
        className
      )}
    >
      {children}
    </section>
  );
}
