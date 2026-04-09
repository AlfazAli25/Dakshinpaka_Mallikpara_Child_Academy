'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/language-context';
import { get } from '@/lib/api';
import { clearSession, getUser } from '@/lib/session';
import { SCHOOL_NAME } from '@/lib/school-config';

const schoolImages = [
  {
    id: 1,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.50.jpeg',
    title: 'Independence Day Group Celebration'
  },
  {
    id: 2,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.56.jpeg',
    title: 'Students Activity Gathering'
  },
  {
    id: 3,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.58.jpeg',
    title: 'Classroom Cultural Program'
  },
  {
    id: 4,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.00.jpeg',
    title: 'Teacher and Students Showcase'
  },
  {
    id: 5,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.02.jpeg',
    title: 'Morning Exercise Session'
  },
  {
    id: 6,
    src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.19.jpeg',
    title: 'Primary Section Group Photo'
  }
];

const schoolVideos = [
  {
    id: 1,
    src: '/WhatsApp%20Video%202026-03-23%20at%2009.53.09.mp4',
    title: 'School Activities Highlights'
  }
];

const growthHighlights = [
  'We are a kindergarten school with a close-knit learning environment.',
  'Our focus is early childhood learning through play, stories, and basic skills.',
  'Class groups help teachers give personal attention to every child.',
  'Parents and teachers stay connected regularly to support each student.'
];

const text = {
  en: {
    welcome: 'Welcome to',
    register: 'Register',
    login: 'Login',
    schoolOverview: 'Kindergarten Overview',
    heroTitle: 'A Kindergarten Where Every Child Is Known by Name',
    quality: 'Foundational Learning',
    digital: 'Simple Digital Support',
    holistic: 'Care, Play, and Values',
    imageGallery: 'School Image Gallery',
    videoGallery: 'School Video Gallery',
    years: 'Our Kindergarten Journey',
    join: 'Join Our School Community',
    quickAccess: 'Quick Access',
    quickNote: 'After login, you can quickly return to your panel from here.',
    adminPanel: 'Admin Panel',
    teacherPanel: 'Teacher Panel',
    studentPanel: 'Student Panel',
    myPanel: 'Go to My Panel'
  },
  bn: {
    welcome: '???????',
    register: '?????????',
    login: '????',
    schoolOverview: '????? ???????',
    heroTitle: '???? ? ????????? ????????????? ??????? ???????',
    quality: '???????? ??????',
    digital: '??????? ?????????',
    holistic: '??????? ??????',
    imageGallery: '????? ??? ????????',
    videoGallery: '????? ????? ????????',
    years: '????? ?? ??? ?????? ??????',
    join: '?????? ????? ??????? ??? ???',
    quickAccess: '????? ??????',
    quickNote: '?????? ?? ???? ???? ????? ????? ???????? ???? ???????',
    adminPanel: '???????? ???????',
    teacherPanel: '?????? ???????',
    studentPanel: '????????? ???????',
    myPanel: '???? ???????? ???'
  }
};

export default function HomePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [currentUser, setCurrentUser] = useState(null);
  const [allowAdminRegistration, setAllowAdminRegistration] = useState(false);

  useEffect(() => {
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
  }, []);

  const panelRoute = useMemo(() => {
    const role = currentUser?.role;
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'teacher') return '/teacher/dashboard';
    return '/student/dashboard';
  }, [currentUser]);

  const onLogout = () => {
    clearSession();
    setCurrentUser(null);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-950 via-red-800 to-red-700 text-red-50">
      <header className="sticky top-0 z-20 border-b border-red-950/70 bg-red-900/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-red-200/40 bg-white shadow-sm">
              <img src="/School_Logo.png" alt="School Logo" className="h-full w-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-red-100/80">{t.welcome}</p>
              <h1 className="truncate text-base font-semibold text-white md:text-xl">{SCHOOL_NAME}</h1>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <LanguageToggle />
            {currentUser && (
              <>
                <Link
                  href={panelRoute}
                  className="rounded-lg border border-white/50 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-50 md:px-4"
                >
                  {t.myPanel}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-white/50 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-50 md:px-4"
                >
                  Logout
                </button>
              </>
            )}
            {!currentUser && (
              <>
                {allowAdminRegistration && (
                  <Link
                    href="/register"
                    className="rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 md:px-4"
                  >
                    {t.register}
                  </Link>
                )}
                <Link
                  href="/login"
                  className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-50 md:px-4"
                >
                  {t.login}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-3xl border border-red-300/40 bg-gradient-to-br from-red-800 via-red-700 to-red-900 text-red-50 shadow-2xl">
          <div className="grid gap-6 p-6 md:grid-cols-2 md:p-10">
            <div>
              <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-50">
                {t.schoolOverview}
              </p>
              <h2 className="mt-4 text-3xl font-bold leading-tight text-white md:text-4xl">{t.heroTitle}</h2>
              <p className="mt-4 max-w-2xl text-sm text-red-100 md:text-base">
                We are a neighborhood kindergarten focused on early learning, child care, values, and close
                parent-teacher communication, with simple digital support for daily school activities.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-red-50">{t.quality}</span>
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-red-50">{t.digital}</span>
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-red-50">{t.holistic}</span>
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/20 bg-white/10 p-5 text-sm text-red-50 md:p-6">
              <div className="rounded-xl border border-white/40 bg-white/95 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wider text-red-500">Official School Emblem</p>
                <div className="mt-3 grid place-items-center rounded-xl border border-red-100 bg-white p-4">
                  <img
                    src="/School_Logo.png"
                    alt={`${SCHOOL_NAME} Emblem`}
                    className="h-36 w-36 object-contain md:h-52 md:w-52"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wider text-red-500">School Name</p>
                <p className="mt-1 text-base font-semibold text-red-900">{SCHOOL_NAME}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wider text-red-500">ESTD</p>
                  <p className="mt-1 font-semibold text-red-900">2018</p>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wider text-red-500">Location</p>
                  <p className="mt-1 font-semibold text-red-900">Dakshinpaka, Mallikpara</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-red-300/40 bg-red-800/85 p-6 text-red-50 shadow-lg md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-semibold">{t.imageGallery}</h3>
            <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-red-50">{schoolImages.length} Photos</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {schoolImages.map((image) => (
              <article key={image.id} className="group overflow-hidden rounded-2xl border border-white/20 bg-red-900/35">
                <img src={image.src} alt={image.title} className="h-52 w-full object-cover transition duration-300 group-hover:scale-105" />
                <p className="px-3 py-3 text-sm font-medium text-red-50">{image.title}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-red-300/40 bg-red-800/85 p-6 text-red-50 shadow-lg md:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-semibold">{t.videoGallery}</h3>
            <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-red-50">{schoolVideos.length} Videos</span>
          </div>
          {schoolVideos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/35 bg-red-900/25 px-4 py-10 text-center text-sm text-red-100">
              No local videos found in public folder yet. Add .mp4 or .webm files and they will appear here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {schoolVideos.map((video) => (
                <article key={video.id} className="overflow-hidden rounded-2xl border border-white/20 bg-red-900/35">
                  <video src={video.src} controls className="h-64 w-full object-cover" />
                  <p className="px-3 py-3 text-sm font-medium text-red-50">{video.title}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-red-300/40 bg-red-800/85 p-6 text-red-50 shadow-lg md:p-8">
          <h3 className="text-2xl font-semibold">{t.years}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {growthHighlights.map((highlight, index) => (
              <div key={index} className="rounded-xl border border-white/20 bg-red-900/30 p-4 text-sm text-red-50 md:text-base">
                <p className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-200" />
                  <span>{highlight}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-red-300/40 bg-red-800/85 p-6 text-red-50 shadow-lg md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Important Information</h3>
              <p className="mt-1 text-sm text-red-100">
                Policy and support pages for static QR fee submission, payment-proof upload, and transparent verification.
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-red-200">Static QR Payment Support</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/privacy-policy" className="rounded-xl border border-white/60 bg-white px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-50">
              Privacy Policy
            </Link>
            <Link href="/terms-and-conditions" className="rounded-xl border border-white/60 bg-white px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-50">
              Terms & Conditions
            </Link>
            <Link href="/refund-and-cancellation" className="rounded-xl border border-white/60 bg-white px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-50">
              Refund Policy
            </Link>
            <Link href="/contact-us" className="rounded-xl border border-white/60 bg-white px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-50">
              Contact Us
            </Link>
            <Link href="/about-us" className="rounded-xl border border-white/60 bg-white px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-50">
              About Us
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
