'use client';

import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-400 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-br from-red-700 to-red-900 text-white shadow-[0_12px_35px_-14px_rgba(153,27,27,0.9)] hover:from-red-600 hover:to-red-800',
        secondary: 'bg-white/85 text-red-900 ring-1 ring-red-200 shadow-[0_10px_26px_-16px_rgba(153,27,27,0.6)] hover:bg-red-50',
        danger: 'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_12px_28px_-16px_rgba(239,68,68,0.8)] hover:from-red-400 hover:to-red-600',
        outline: 'border border-red-300 bg-transparent text-red-700 hover:bg-red-50',
        ghost: 'bg-transparent text-red-700 hover:bg-red-100/70'
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base'
      },
      fullWidth: {
        true: 'w-full',
        false: ''
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false
    }
  }
);

export default function Button({
  className,
  children,
  variant,
  size,
  fullWidth,
  loading = false,
  iconLeft,
  iconRight,
  onClick,
  ...props
}) {
  const [ripples, setRipples] = useState([]);

  const disabled = Boolean(loading || props.disabled);

  const handleClick = (event) => {
    if (!disabled) {
      const rect = event.currentTarget.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);
      const nextRipple = {
        id: Date.now() + Math.random(),
        x: event.clientX - rect.left - diameter / 2,
        y: event.clientY - rect.top - diameter / 2,
        diameter
      };

      setRipples((previousRipples) => [...previousRipples, nextRipple]);
      setTimeout(() => {
        setRipples((previousRipples) => previousRipples.filter((item) => item.id !== nextRipple.id));
      }, 500);
    }

    if (typeof onClick === 'function') {
      onClick(event);
    }
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Loading...</span>
        </>
      );
    }

    return (
      <>
        {iconLeft ? <span className="inline-flex h-4 w-4 items-center justify-center">{iconLeft}</span> : null}
        <span>{children}</span>
        {iconRight ? <span className="inline-flex h-4 w-4 items-center justify-center">{iconRight}</span> : null}
      </>
    );
  }, [children, iconLeft, iconRight, loading]);

  return (
    <motion.button
      type="button"
      whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      transition={{ duration: 0.16 }}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      onClick={handleClick}
      disabled={disabled}
      {...props}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="pointer-events-none absolute rounded-full bg-white/45 animate-ping"
          style={{
            width: `${ripple.diameter}px`,
            height: `${ripple.diameter}px`,
            left: `${ripple.x}px`,
            top: `${ripple.y}px`
          }}
          aria-hidden="true"
        />
      ))}
      {content}
    </motion.button>
  );
}
