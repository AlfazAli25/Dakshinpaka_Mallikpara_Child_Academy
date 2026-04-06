'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 5000;

const toneClassByType = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-slate-200 bg-white text-slate-900'
};

const iconByType = {
  success: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 7L10 17l-5-5" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.4L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3l-8.5-14.6a2 2 0 00-3.4 0z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
};

const createToastId = () => {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomPart}`;
};

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 shadow-lg animate-fade-up ${toneClassByType[toast.type] || toneClassByType.info}`}
        >
          <span className="mt-0.5">{iconByType[toast.type] || iconByType.info}</span>
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="rounded-md p-1 text-current/80 hover:bg-black/5"
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutMapRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }

    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((type, message, durationMs = DEFAULT_DURATION_MS) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
      return;
    }

    const id = createToastId();
    setToasts((prev) => [...prev, { id, type, message: normalizedMessage }]);

    const timeoutId = setTimeout(() => {
      dismiss(id);
    }, Math.max(1200, Number(durationMs) || DEFAULT_DURATION_MS));

    timeoutMapRef.current.set(id, timeoutId);
  }, [dismiss]);

  useEffect(() => {
    return () => {
      timeoutMapRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutMapRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (message, durationMs) => push('success', message, durationMs),
      error: (message, durationMs) => push('error', message, durationMs),
      info: (message, durationMs) => push('info', message, durationMs),
      dismiss
    }),
    [dismiss, push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
