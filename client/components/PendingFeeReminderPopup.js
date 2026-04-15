'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Volume2 } from 'lucide-react';
import { getLoginSessionId, getToken } from '@/lib/session';

const DISMISS_KEY_PREFIX = 'student-pending-fee-reminder-dismissed';
const DEFAULT_MONTHLY_FEE = 200;
const BEEP_INTERVAL_MS = 360;
const BEEP_DURATION_SECONDS = 0.24;
const BEEP_FREQUENCY_HZ = 1800;
const BEEP_VOLUME = 0.95;

const toPositiveAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
};

const getDismissStorageKey = () => {
  const loginSessionId = String(getLoginSessionId() || '').trim();
  if (loginSessionId) {
    return `${DISMISS_KEY_PREFIX}:${loginSessionId}`;
  }

  const token = String(getToken() || '').trim();
  if (!token) {
    return '';
  }

  return `${DISMISS_KEY_PREFIX}:token-${token.slice(-24)}`;
};

export default function PendingFeeReminderPopup({ pendingAmount = 0, monthlyFeeAmount = DEFAULT_MONTHLY_FEE }) {
  const audioContextRef = useRef(null);
  const alarmTimerRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const normalizedPendingAmount = toPositiveAmount(pendingAmount);
  const normalizedMonthlyFee = Math.max(1, toPositiveAmount(monthlyFeeAmount) || DEFAULT_MONTHLY_FEE);
  const shouldTriggerReminder = normalizedPendingAmount > normalizedMonthlyFee;

  const dismissStorageKey = useMemo(() => getDismissStorageKey(), []);

  const stopAlarm = useCallback(() => {
    if (alarmTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore close errors.
      });
      audioContextRef.current = null;
    }
  }, []);

  const playSingleBeep = useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Resume can fail when browser blocks autoplay.
      });
    }

    if (audioContext.state === 'suspended') {
      return false;
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY_HZ, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(BEEP_VOLUME, audioContext.currentTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + BEEP_DURATION_SECONDS);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + BEEP_DURATION_SECONDS + 0.01);

    return true;
  }, []);

  const startAlarm = useCallback(() => {
    stopAlarm();

    const played = playSingleBeep();
    setAudioBlocked(!played);

    if (typeof window === 'undefined') {
      return;
    }

    alarmTimerRef.current = window.setInterval(() => {
      const playedOnTick = playSingleBeep();
      if (playedOnTick) {
        setAudioBlocked(false);
      }
    }, BEEP_INTERVAL_MS);
  }, [playSingleBeep, stopAlarm]);

  useEffect(() => {
    if (!shouldTriggerReminder || !dismissStorageKey) {
      setIsOpen(false);
      return;
    }

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(dismissStorageKey) === '1';
    } catch (_error) {
      dismissed = false;
    }

    setIsOpen(!dismissed);
  }, [dismissStorageKey, shouldTriggerReminder]);

  useEffect(() => {
    if (!isOpen) {
      stopAlarm();
      return;
    }

    startAlarm();

    return () => {
      stopAlarm();
    };
  }, [isOpen, startAlarm, stopAlarm]);

  useEffect(() => {
    return () => {
      stopAlarm();
    };
  }, [stopAlarm]);

  const onEnableSound = () => {
    const played = playSingleBeep();
    setAudioBlocked(!played);
  };

  const onCloseReminder = () => {
    if (dismissStorageKey) {
      try {
        window.localStorage.setItem(dismissStorageKey, '1');
      } catch (_error) {
        // Ignore write errors.
      }
    }

    setIsOpen(false);
    stopAlarm();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pending fee reminder"
        className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 shadow-[0_20px_50px_-20px_rgba(127,29,29,0.55)]"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="flex-1">
            <p className="text-base font-bold text-slate-900">High Pending Fee Reminder</p>
            <p className="mt-2 text-sm text-slate-700">
              Your pending fee is <span className="font-bold text-red-700">INR {normalizedPendingAmount}</span>, which is above one monthly fee
              (<span className="font-bold">INR {normalizedMonthlyFee}</span>).
            </p>
            <p className="mt-1 text-sm text-slate-700">Please complete payment as soon as possible.</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            {audioBlocked ? 'Tap Enable Sound if alarm is blocked by browser.' : 'Alarm is active and will keep beeping until you close this popup.'}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {audioBlocked ? (
            <button
              type="button"
              onClick={onEnableSound}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Enable Sound
            </button>
          ) : null}

          <button
            type="button"
            onClick={onCloseReminder}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
          >
            Close Reminder
          </button>
        </div>
      </div>
    </div>
  );
}
