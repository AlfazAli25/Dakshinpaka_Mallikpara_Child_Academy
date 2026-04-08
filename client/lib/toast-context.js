'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);
const DEFAULT_DURATION_MS = 5000;

const toneClassByType = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  confirm: 'border-amber-200 bg-amber-50 text-amber-900',
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
  confirm: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.8-3 4" />
      <path d="M12 17h.01" />
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

const normalizeMessage = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const toFriendlyErrorMessage = (rawMessage) => {
  const message = normalizeMessage(rawMessage);
  if (!message) {
    return 'Something went wrong. Please try again.';
  }

  const lower = message.toLowerCase();

  if (
    lower.includes('session expired')
    || lower.includes('unauthorized')
    || lower.includes('jwt')
    || lower.includes('token')
    || lower.includes('login again')
  ) {
    return 'Your session has expired. Please log in again.';
  }

  if (
    lower.includes('network error')
    || lower.includes('failed to fetch')
    || lower.includes('ecconnrefused')
    || lower.includes('socket hang up')
  ) {
    return 'Cannot connect right now. Please check your internet and try again.';
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'This is taking too long. Please try again.';
  }

  if (lower.includes('forbidden') || lower.includes('not allowed') || lower.includes('permission')) {
    return 'You do not have permission to do this action.';
  }

  if (lower.includes('not found')) {
    return 'The requested item was not found.';
  }

  if (lower.includes('e11000') || lower.includes('duplicate key') || lower.includes('already exists')) {
    return 'This entry already exists.';
  }

  if (lower.includes('validation') || lower.includes('invalid') || lower.includes('cast to objectid')) {
    return 'Some details are invalid. Please check and try again.';
  }

  if (
    lower.includes('mongoservererror')
    || lower.includes('mongoose')
    || lower.includes('stack')
    || lower.includes('exception')
    || lower.includes('syntaxerror')
    || message.length > 220
  ) {
    return 'Something went wrong. Please try again.';
  }

  return message;
};

const toDisplayMessage = (type, message) => {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return '';
  }

  if (type === 'error') {
    return toFriendlyErrorMessage(normalized);
  }

  return normalized;
};

function ToastViewport({ toasts, onDismiss, onConfirm, onCancel }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'confirm' ? 'alertdialog' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 shadow-lg animate-fade-up ${toneClassByType[toast.type] || toneClassByType.info}`}
        >
          <span className="mt-0.5">{iconByType[toast.type] || iconByType.info}</span>
          <div className="flex-1">
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.type === 'confirm' ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onConfirm(toast.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white ${toast.destructive ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-700 hover:bg-slate-800'}`}
                >
                  {toast.confirmLabel || 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => onCancel(toast.id)}
                  className="rounded-md border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-black/5"
                >
                  {toast.cancelLabel || 'Cancel'}
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (toast.type === 'confirm') {
                onCancel(toast.id);
              } else {
                onDismiss(toast.id);
              }
            }}
            className="rounded-md p-1 text-current/80 hover:bg-black/5"
            aria-label={toast.type === 'confirm' ? 'Dismiss confirmation' : 'Dismiss notification'}
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
  const confirmResolveMapRef = useRef(new Map());

  const dismiss = useCallback((id, confirmed = false) => {
    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }

    const resolveConfirm = confirmResolveMapRef.current.get(id);
    if (resolveConfirm) {
      confirmResolveMapRef.current.delete(id);
      resolveConfirm(Boolean(confirmed));
    }

    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const confirm = useCallback((message, options = {}) => {
    const normalizedMessage = toDisplayMessage('confirm', message);
    if (!normalizedMessage) {
      return Promise.resolve(false);
    }

    const id = createToastId();
    const confirmLabel = String(options.confirmLabel || 'Confirm').trim() || 'Confirm';
    const cancelLabel = String(options.cancelLabel || 'Cancel').trim() || 'Cancel';
    const destructive = Boolean(options.destructive);

    setToasts((prev) => [
      ...prev,
      {
        id,
        type: 'confirm',
        message: normalizedMessage,
        confirmLabel,
        cancelLabel,
        destructive
      }
    ]);

    return new Promise((resolve) => {
      confirmResolveMapRef.current.set(id, resolve);
    });
  }, []);

  const push = useCallback((type, message, durationMs = DEFAULT_DURATION_MS) => {
    const normalizedMessage = toDisplayMessage(type, message);
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
      confirmResolveMapRef.current.forEach((resolve) => resolve(false));
      confirmResolveMapRef.current.clear();
    };
  }, []);

  const onConfirmToast = useCallback((id) => {
    dismiss(id, true);
  }, [dismiss]);

  const onCancelToast = useCallback((id) => {
    dismiss(id, false);
  }, [dismiss]);

  const value = useMemo(
    () => ({
      success: (message, durationMs) => push('success', message, durationMs),
      error: (message, durationMs) => push('error', message, durationMs),
      info: (message, durationMs) => push('info', message, durationMs),
      confirm,
      dismiss
    }),
    [confirm, dismiss, push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onConfirm={onConfirmToast} onCancel={onCancelToast} />
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
