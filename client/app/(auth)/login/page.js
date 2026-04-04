'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Input from '@/components/Input';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/language-context';
import { get, post } from '@/lib/api';
import { clearSession, getUser, saveSession } from '@/lib/session';
import { SCHOOL_NAME } from '@/lib/school-config';

const roleRoutes = {
  admin: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
  parent: '/student/dashboard'
};

const text = {
  en: {
    heroTag: 'School Management Platform',
    heroTitle: 'Welcome Back',
    heroText: 'Access your dashboard to manage classes, attendance, fees, examinations, and student progress from one place.',
    panelText: 'Secure portal for Admins, Teachers, Students, and Parent access via Student ID or Teacher ID.',
    accountAccess: 'Account Access',
    loginTitle: 'Login',
    loginDesc: 'Enter Student ID, Teacher ID, or Email with your password.',
    regSuccess: 'Registration successful. Please login.',
    identifier: 'Student ID / Teacher ID / Email',
    password: 'Password',
    loginBtn: 'Login',
    loggingIn: 'Logging in...',
    forgot: 'Forgot password?',
    backToLogin: 'Back to login',
    forgotTitle: 'Reset Password',
    forgotDesc: 'Request OTP to admin email, then verify and set a new password.',
    requestOtp: 'Send OTP',
    sendingOtp: 'Sending OTP...',
    otp: 'OTP',
    newPassword: 'New Password',
    verifyReset: 'Verify OTP & Reset',
    verifyingReset: 'Resetting...',
    otpSent: 'OTP sent to admin email. Enter OTP and your new password.',
    needAccount: 'Need an account?',
    register: 'Register'
  },
  bn: {
    heroTag: 'স্কুল ম্যানেজমেন্ট প্ল্যাটফর্ম',
    heroTitle: 'আবার স্বাগতম',
    heroText: 'এক জায়গা থেকে ক্লাস, উপস্থিতি, ফি ও পরীক্ষার তথ্য দেখুন।',
    panelText: 'অ্যাডমিন, শিক্ষক, ছাত্র এবং অভিভাবকের জন্য নিরাপদ পোর্টাল (স্টুডেন্ট আইডি বা টিচার আইডি দিয়ে)।',
    accountAccess: 'অ্যাকাউন্ট অ্যাক্সেস',
    loginTitle: 'লগইন',
    loginDesc: 'স্টুডেন্ট আইডি, টিচার আইডি বা ইমেইল এবং পাসওয়ার্ড দিন।',
    regSuccess: 'রেজিস্ট্রেশন সফল হয়েছে। লগইন করুন।',
    identifier: 'স্টুডেন্ট আইডি / টিচার আইডি / ইমেইল',
    password: 'পাসওয়ার্ড',
    loginBtn: 'লগইন',
    loggingIn: 'লগইন হচ্ছে...',
    forgot: 'পাসওয়ার্ড ভুলে গেছেন?',
    backToLogin: 'লগইনে ফিরে যান',
    forgotTitle: 'পাসওয়ার্ড রিসেট',
    forgotDesc: 'প্রথমে অ্যাডমিন ইমেইলে OTP পাঠান, তারপর OTP যাচাই করে নতুন পাসওয়ার্ড সেট করুন।',
    requestOtp: 'OTP পাঠান',
    sendingOtp: 'OTP পাঠানো হচ্ছে...',
    otp: 'OTP',
    newPassword: 'নতুন পাসওয়ার্ড',
    verifyReset: 'OTP যাচাই করে রিসেট',
    verifyingReset: 'রিসেট হচ্ছে...',
    otpSent: 'OTP অ্যাডমিন ইমেইলে পাঠানো হয়েছে। OTP ও নতুন পাসওয়ার্ড দিন।',
    needAccount: 'নতুন অ্যাকাউন্ট লাগবে?',
    register: 'রেজিস্টার'
  }
};

export default function LoginPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [currentUser, setCurrentUser] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState('request');
  const [forgotForm, setForgotForm] = useState({ identifier: '', otp: '', newPassword: '' });
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowAdminRegistration, setAllowAdminRegistration] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setRegistered(params.get('registered') === '1');
    setCurrentUser(getUser());

    const loadRegistrationStatus = async () => {
      try {
        const response = await get('/auth/register-status');
        setAllowAdminRegistration(Boolean(response?.data?.allowAdminRegistration));
      } catch (_error) {
        setAllowAdminRegistration(false);
      }
    };

    loadRegistrationStatus();

    router.prefetch('/admin/dashboard');
    router.prefetch('/teacher/dashboard');
    router.prefetch('/student/dashboard');
  }, [router]);

  const panelRoute = useMemo(() => {
    const role = currentUser?.role;
    return roleRoutes[role] || '/student/dashboard';
  }, [currentUser]);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onForgotChange = (field) => (event) => {
    setForgotForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await post('/auth/login', form);
      saveSession(response.data.token, response.data.user);
      router.replace(roleRoutes[response.data.user.role] || '/login');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const onRequestOtp = async (event) => {
    event.preventDefault();
    setForgotError('');
    setForgotMessage('');
    setForgotLoading(true);

    try {
      const response = await post('/auth/forgot-password/request-otp', { identifier: forgotForm.identifier });
      setForgotMessage(response?.data?.message || t.otpSent);
      setForgotStep('verify');
    } catch (apiError) {
      setForgotError(apiError.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const onVerifyReset = async (event) => {
    event.preventDefault();
    setForgotError('');
    setForgotMessage('');
    setForgotLoading(true);

    try {
      const response = await post('/auth/forgot-password/verify-otp', {
        identifier: forgotForm.identifier,
        otp: forgotForm.otp,
        newPassword: forgotForm.newPassword
      });
      setForgotMessage(response?.data?.message || 'Password reset successful');
      setForgotMode(false);
      setForgotStep('request');
      setForgotForm({ identifier: '', otp: '', newPassword: '' });
    } catch (apiError) {
      setForgotError(apiError.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const onLogout = () => {
    clearSession();
    setCurrentUser(null);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-red-100 px-4 py-8 md:px-8 md:py-12">
      <div className="smooth-enter mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-3xl border border-red-100/80 bg-white/80 shadow-2xl backdrop-blur lg:grid-cols-2">
        <section className="hidden bg-gradient-to-br from-red-700 to-red-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wider text-red-100">{t.heroTag}</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight">{t.heroTitle}</h1>
            <p className="mt-4 max-w-md text-red-100">
              {t.heroText}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 text-sm text-red-100">
            <p className="font-medium text-white">{SCHOOL_NAME}</p>
            <p className="mt-2">{t.panelText}</p>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 md:p-10">
          <form
            onSubmit={forgotMode ? (forgotStep === 'request' ? onRequestOtp : onVerifyReset) : onSubmit}
            className="card-hover animate-fade-up w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-100 md:p-8"
          >
            <div className="mb-4 flex justify-end">
              <LanguageToggle />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <img src="/School_Logo.png" alt="School Logo" className="h-full w-full object-contain p-1" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-700">{t.accountAccess}</p>
                <p className="text-sm text-slate-500">{SCHOOL_NAME}</p>
              </div>
            </div>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">{forgotMode ? t.forgotTitle : t.loginTitle}</h2>
            <p className="mt-2 text-sm text-gray-500">{forgotMode ? t.forgotDesc : t.loginDesc}</p>

            {registered && (
              <p className="mb-3 mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {t.regSuccess}
              </p>
            )}

            {!forgotMode ? (
              <>
                <div className="mt-6 space-y-1">
                  <Input label={t.identifier} value={form.identifier} onChange={onChange('identifier')} required className="h-11" />
                  <Input
                    label={t.password}
                    type="password"
                    value={form.password}
                    onChange={onChange('password')}
                    required
                    className="h-11"
                  />
                </div>

                {error && <p className="mb-3 mt-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 h-11 w-full rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t.loggingIn : t.loginBtn}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setForgotError('');
                    setForgotMessage('');
                    setForgotForm((prev) => ({ ...prev, identifier: form.identifier || prev.identifier }));
                  }}
                  className="mt-3 w-full text-center text-sm font-medium text-red-700 hover:text-red-800"
                >
                  {t.forgot}
                </button>

                {currentUser ? (
                  <div className="mt-5 flex items-center justify-center gap-2">
                    <Link href={panelRoute} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                      Go to My Panel
                    </Link>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  allowAdminRegistration && (
                    <p className="mt-5 text-center text-sm text-gray-600">
                      {t.needAccount}{' '}
                      <Link href="/register" className="font-semibold text-red-700 hover:text-red-800">
                        {t.register}
                      </Link>
                    </p>
                  )
                )}
              </>
            ) : (
              <>
                <div className="mt-6 space-y-1">
                  <Input
                    label={t.identifier}
                    value={forgotForm.identifier}
                    onChange={onForgotChange('identifier')}
                    required
                    className="h-11"
                  />
                  {forgotStep === 'verify' && (
                    <>
                      <Input label={t.otp} value={forgotForm.otp} onChange={onForgotChange('otp')} required className="h-11" />
                      <Input
                        label={t.newPassword}
                        type="password"
                        value={forgotForm.newPassword}
                        onChange={onForgotChange('newPassword')}
                        required
                        className="h-11"
                      />
                    </>
                  )}
                </div>

                {forgotMessage && <p className="mb-3 mt-1 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{forgotMessage}</p>}
                {forgotError && <p className="mb-3 mt-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{forgotError}</p>}

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="mt-2 h-11 w-full rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {forgotLoading
                    ? forgotStep === 'request'
                      ? t.sendingOtp
                      : t.verifyingReset
                    : forgotStep === 'request'
                      ? t.requestOtp
                      : t.verifyReset}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setForgotStep('request');
                    setForgotError('');
                    setForgotMessage('');
                  }}
                  className="mt-3 w-full text-center text-sm font-medium text-red-700 hover:text-red-800"
                >
                  {t.backToLogin}
                </button>
              </>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}