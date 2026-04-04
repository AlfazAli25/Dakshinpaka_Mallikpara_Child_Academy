'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Input from '@/components/Input';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/language-context';
import { get, post } from '@/lib/api';
import { clearSession, getUser } from '@/lib/session';
import { SCHOOL_NAME } from '@/lib/school-config';
import { useToast } from '@/lib/toast-context';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleRoutes = {
  admin: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
  parent: '/student/dashboard'
};

const text = {
  en: {
    heroTag: 'Admin Setup',
    heroTitle: 'Create Admin Account',
    heroText: 'This page is for admin account setup. Student and teacher accounts are created from admin modules.',
    quickNote: 'Quick Note',
    quickText: 'You can update this form and permissions anytime based on your school policy.',
    newUser: 'Admin User',
    title: 'Register Admin',
    description: 'Fill in the details to create an admin account.',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    register: 'Register',
    registering: 'Registering...',
    already: 'Already have an account?',
    login: 'Login'
  },
  bn: {
    heroTag: 'অ্যাডমিন সেটআপ',
    heroTitle: 'অ্যাডমিন অ্যাকাউন্ট তৈরি',
    heroText: 'এই পেজটি অ্যাডমিন অ্যাকাউন্ট তৈরির জন্য। স্টুডেন্ট ও টিচার অ্যাকাউন্ট অ্যাডমিন মডিউল থেকে তৈরি হবে।',
    quickNote: 'দ্রুত নোট',
    quickText: 'স্কুলের নিয়ম অনুযায়ী এই ফর্ম ও অনুমতি পরে পরিবর্তন করতে পারবেন।',
    newUser: 'অ্যাডমিন ইউজার',
    title: 'অ্যাডমিন রেজিস্টার',
    description: 'অ্যাডমিন অ্যাকাউন্ট তৈরি করতে তথ্য দিন।',
    name: 'নাম',
    email: 'ইমেইল',
    password: 'পাসওয়ার্ড',
    register: 'রেজিস্টার',
    registering: 'রেজিস্টার হচ্ছে...',
    already: 'আগেই অ্যাকাউন্ট আছে?',
    login: 'লগইন'
  }
};

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [currentUser, setCurrentUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationAllowed, setRegistrationAllowed] = useState(true);

  useEffect(() => {
    let active = true;

    const loadRegistrationStatus = async () => {
      try {
        const response = await get('/auth/register-status');
        const allowAdminRegistration = Boolean(response?.data?.allowAdminRegistration);

        if (!active) {
          return;
        }

        setRegistrationAllowed(allowAdminRegistration);
        if (!allowAdminRegistration) {
          router.replace('/login');
          return;
        }

        setCurrentUser(getUser());
        router.prefetch('/login');
      } catch (_error) {
        if (!active) {
          return;
        }
        setRegistrationAllowed(false);
        router.replace('/login');
      }
    };

    loadRegistrationStatus();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (message) {
      toast.success(message);
    }
  }, [message, toast]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error, toast]);

  const panelRoute = useMemo(() => {
    const role = currentUser?.role;
    return roleRoutes[role] || '/student/dashboard';
  }, [currentUser]);

  const onChange = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (!EMAIL_REGEX.test(String(form.email || '').trim())) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      await post('/auth/register', form);
      setMessage('Registration successful. Redirecting to login...');
      setForm({ name: '', email: '', password: '', role: 'admin' });
      router.replace('/login?registered=1');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const onLogout = () => {
    clearSession();
    setCurrentUser(null);
    router.push('/');
  };

  if (!registrationAllowed) {
    return null;
  }

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
            <p className="font-medium text-white">{t.quickNote}</p>
            <p className="mt-2">{t.quickText}</p>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 md:p-10">
          <form onSubmit={onSubmit} className="card-hover animate-fade-up w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-100 md:p-8">
            <div className="mb-4 flex justify-end">
              <LanguageToggle />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <img src="/School_Logo.png" alt="School Logo" className="h-full w-full object-contain p-1" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-700">{t.newUser}</p>
                <p className="text-sm text-slate-500">{SCHOOL_NAME}</p>
              </div>
            </div>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">{t.title}</h2>
            <p className="mt-2 text-sm text-gray-500">{t.description}</p>

            <div className="mt-6 space-y-1">
              <Input label={t.name} value={form.name} onChange={onChange('name')} required className="h-11" />
              <Input label={t.email} type="email" value={form.email} onChange={onChange('email')} required className="h-11" />
              <Input
                label={t.password}
                type="password"
                value={form.password}
                onChange={onChange('password')}
                required
                className="h-11"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t.registering : t.register}
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
              <p className="mt-5 text-center text-sm text-gray-600">
                {t.already}{' '}
                <Link href="/login" className="font-semibold text-red-700 hover:text-red-800">
                  {t.login}
                </Link>
              </p>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}