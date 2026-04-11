'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Mail, MapPin, MessageCircle, PhoneCall, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/language-context';
import { get } from '@/lib/api';
import { clearSession, getUser } from '@/lib/session';
import { SCHOOL_NAME } from '@/lib/school-config';
import { SCHOOL_INFO } from '@/lib/policy-info';

const HOMEPAGE_WHATSAPP_NUMBER = '8509658357';

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

const sectionClassName =
  'relative overflow-hidden rounded-3xl border border-red-200/70 bg-white/80 p-6 shadow-[0_30px_76px_-46px_rgba(127,29,29,0.62)] backdrop-blur-xl md:p-8';

const toTelHref = (phoneNumber = '') => {
  const cleaned = String(phoneNumber || '').trim().replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '#';
};

const toMapHref = (address = '') => {
  const trimmedAddress = String(address || '').trim();
  return trimmedAddress ? `https://maps.google.com/?q=${encodeURIComponent(trimmedAddress)}` : '#';
};

const toWhatsAppHref = (phoneNumber = '', message = '') => {
  const digitsOnly = String(phoneNumber || '').replace(/\D/g, '');
  if (!digitsOnly) {
    return '';
  }

  const internationalNumber = digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;
  const messageQuery = String(message || '').trim() ? `?text=${encodeURIComponent(String(message).trim())}` : '';
  return `https://wa.me/${internationalNumber}${messageQuery}`;
};

const text = {
  en: {
    welcome: 'Welcome to',
    register: 'Register',
    login: 'Login',
    logout: 'Logout',
    schoolOverview: 'Kindergarten Overview',
    heroTitle: 'A Kindergarten Where Every Child Is Known by Name',
    heroDescription:
      'We are a neighborhood kindergarten focused on early learning, child care, values, and close parent-teacher communication, with simple digital support for daily school activities.',
    quality: 'Foundational Learning',
    digital: 'Simple Digital Support',
    holistic: 'Care, Play, and Values',
    schoolIdentity: 'Official School Identity',
    contactDetails: 'School Contact Information',
    phone: 'Phone',
    email: 'Email',
    location: 'Location',
    tapToCall: 'Tap to Call',
    tapToChat: 'Tap to Chat',
    openInMaps: 'Open in Maps',
    callNow: 'Call School Office',
    chatOnWhatsApp: 'Chat on WhatsApp',
    whatsapp: 'WhatsApp',
    imageGallery: 'School Image Gallery',
    imageGalleryNote: 'Moments from activities, celebrations, and classroom life.',
    videoGallery: 'School Video Gallery',
    videoGalleryNote: 'A quick look at school events and student participation.',
    years: 'Our Kindergarten Journey',
    join: 'Join Our School Community',
    quickAccess: 'Quick Access',
    quickNote: 'After login, you can quickly return to your panel from here.',
    adminPanel: 'Admin Panel',
    teacherPanel: 'Teacher Panel',
    studentPanel: 'Student Panel',
    myPanel: 'Go to My Panel',
    importantInfo: 'Important Information',
    importantInfoNote:
      'Policy and support pages for static QR fee submission, payment-proof upload, and transparent verification.',
    paymentSupport: 'Static QR Payment Support',
    noVideos:
      'No local videos found in public folder yet. Add .mp4 or .webm files and they will appear here.'
  },
  bn: {
    welcome: '???????',
    register: '?????????',
    login: '????',
    logout: 'Logout',
    schoolOverview: '????? ???????',
    heroTitle: '???? ? ????????? ????????????? ??????? ???????',
    heroDescription:
      'We are a neighborhood kindergarten focused on early learning, child care, values, and close parent-teacher communication, with simple digital support for daily school activities.',
    quality: '???????? ??????',
    digital: '??????? ?????????',
    holistic: '??????? ??????',
    schoolIdentity: 'Official School Identity',
    contactDetails: 'School Contact Information',
    phone: 'Phone',
    email: 'Email',
    location: 'Location',
    tapToCall: 'Tap to Call',
    tapToChat: 'Tap to Chat',
    openInMaps: 'Open in Maps',
    callNow: 'Call School Office',
    chatOnWhatsApp: 'Chat on WhatsApp',
    whatsapp: 'WhatsApp',
    imageGallery: '????? ??? ????????',
    imageGalleryNote: 'Moments from activities, celebrations, and classroom life.',
    videoGallery: '????? ????? ????????',
    videoGalleryNote: 'A quick look at school events and student participation.',
    years: '????? ?? ??? ?????? ??????',
    join: '?????? ????? ??????? ??? ???',
    quickAccess: '????? ??????',
    quickNote: '?????? ?? ???? ???? ????? ????? ???????? ???? ???????',
    adminPanel: '???????? ???????',
    teacherPanel: '?????? ???????',
    studentPanel: '????????? ???????',
    myPanel: '???? ???????? ???',
    importantInfo: 'Important Information',
    importantInfoNote:
      'Policy and support pages for static QR fee submission, payment-proof upload, and transparent verification.',
    paymentSupport: 'Static QR Payment Support',
    noVideos:
      'No local videos found in public folder yet. Add .mp4 or .webm files and they will appear here.'
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

  const phoneNumbers = useMemo(() => {
    if (Array.isArray(SCHOOL_INFO?.phone)) {
      return SCHOOL_INFO.phone.filter((item) => String(item || '').trim());
    }

    if (typeof SCHOOL_INFO?.phone === 'string' && String(SCHOOL_INFO.phone).trim()) {
      return [String(SCHOOL_INFO.phone).trim()];
    }

    return [];
  }, []);

  const primaryPhoneNumber = phoneNumbers[0] || '';

  const schoolAddress = useMemo(() => {
    if (!Array.isArray(SCHOOL_INFO?.addressLines)) {
      return '';
    }

    return SCHOOL_INFO.addressLines.filter(Boolean).join(', ');
  }, []);

  const locationHref = useMemo(() => toMapHref(schoolAddress), [schoolAddress]);
  const whatsappHref = useMemo(
    () =>
      toWhatsAppHref(
        HOMEPAGE_WHATSAPP_NUMBER,
        `Hello ${SCHOOL_NAME}, I want to know more about admission and school activities.`
      ),
    []
  );

  const onLogout = () => {
    clearSession();
    setCurrentUser(null);
    router.push('/');
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_15%_10%,rgba(254,226,226,0.95),rgba(255,255,255,0.86)_44%,rgba(255,241,242,0.98)_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-red-300/35 blur-3xl"
          animate={{ x: [0, 24, 0], y: [0, -14, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-0 top-32 h-80 w-80 rounded-full bg-rose-300/30 blur-3xl"
          animate={{ x: [0, -28, 0], y: [0, 12, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-8 left-1/3 h-64 w-64 rounded-full bg-red-200/30 blur-3xl"
          animate={{ x: [0, 18, 0], y: [0, -16, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <header className="sticky top-0 z-30 border-b border-red-200/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-red-200/70 bg-white shadow-[0_15px_26px_-18px_rgba(127,29,29,0.8)]">
              <img src="/School_Logo.png" alt="School Logo" className="h-full w-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-red-700">{t.welcome}</p>
              <h1 className="truncate text-base font-semibold text-slate-900 md:text-xl">{SCHOOL_NAME}</h1>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <LanguageToggle />
            {currentUser ? (
              <>
                <Link
                  href={panelRoute}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-50 md:px-4"
                >
                  {t.myPanel}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-50 md:px-4"
                >
                  {t.logout}
                </button>
              </>
            ) : (
              <>
                {allowAdminRegistration ? (
                  <Link
                    href="/register"
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-50 md:px-4"
                  >
                    {t.register}
                  </Link>
                ) : null}
                <Link
                  href="/login"
                  className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_16px_26px_-18px_rgba(185,28,28,0.95)] transition hover:bg-red-800 md:px-4"
                >
                  {t.login}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl space-y-8 px-4 pb-12 pt-8 md:px-6 md:pb-16 md:pt-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-red-200/70 bg-gradient-to-br from-red-700 via-red-600 to-red-900 text-red-50 shadow-[0_38px_90px_-44px_rgba(127,29,29,0.96)]">
          <motion.div
            className="absolute -left-20 top-14 h-44 w-44 rounded-3xl bg-red-300/35"
            animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute right-6 top-8 h-28 w-28 rounded-full border-8 border-red-300/35"
            animate={{ y: [0, 10, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-16 right-12 h-56 w-56 rounded-full bg-red-950/25 blur-2xl"
            animate={{ y: [0, -14, 0], x: [0, -8, 0] }}
            transition={{ duration: 9.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative grid gap-6 p-6 md:p-10 lg:grid-cols-[1.2fr,0.8fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t.schoolOverview}
              </p>

              <h2 className="mt-4 text-3xl font-bold leading-tight text-white md:text-5xl">{t.heroTitle}</h2>
              <p className="mt-4 max-w-3xl text-sm text-red-100 md:text-lg">{t.heroDescription}</p>

              <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold md:text-sm">
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-red-50">{t.quality}</span>
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-red-50">{t.digital}</span>
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-red-50">{t.holistic}</span>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                {currentUser ? (
                  <Link
                    href={panelRoute}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-50"
                  >
                    {t.myPanel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-50"
                    >
                      {t.login}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {allowAdminRegistration ? (
                      <Link
                        href="/register"
                        className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                      >
                        {t.register}
                      </Link>
                    ) : null}
                  </>
                )}

                {primaryPhoneNumber ? (
                  <a
                    href={toTelHref(primaryPhoneNumber)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    {t.callNow}
                  </a>
                ) : null}

                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    {t.chatOnWhatsApp}
                  </a>
                ) : null}
              </div>

              <div className="mt-8 rounded-2xl border border-white/30 bg-white/10 p-4 backdrop-blur sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-100">{t.quickAccess}</p>
                <p className="mt-1 text-sm text-red-100/90">{t.quickNote}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Link href="/admin/dashboard" className="rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-center text-sm font-semibold hover:bg-white/20">
                    {t.adminPanel}
                  </Link>
                  <Link href="/teacher/dashboard" className="rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-center text-sm font-semibold hover:bg-white/20">
                    {t.teacherPanel}
                  </Link>
                  <Link href="/student/dashboard" className="rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-center text-sm font-semibold hover:bg-white/20">
                    {t.studentPanel}
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <motion.div
                className="rounded-3xl border border-white/35 bg-white/95 p-5 text-slate-900 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.9)]"
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">{t.schoolIdentity}</p>
                <div className="mt-4 grid place-items-center rounded-2xl border border-red-100 bg-white p-4">
                  <img src="/School_Logo.png" alt={`${SCHOOL_NAME} Emblem`} className="h-32 w-32 object-contain md:h-40 md:w-40" />
                </div>
                <p className="mt-3 text-base font-semibold text-red-900 md:text-lg">{SCHOOL_NAME}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">ESTD 2018</p>
              </motion.div>

              <motion.div
                className="rounded-3xl border border-white/35 bg-white/95 p-5 text-slate-900 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.9)]"
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: 0.05 }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">{t.contactDetails}</p>
                <div className="mt-3 space-y-2.5">
                  {phoneNumbers.map((number) => (
                    <div key={number} className="flex flex-wrap items-center gap-2">
                      <a
                        href={toTelHref(number)}
                        className="flex flex-1 items-center justify-between rounded-xl border border-red-100 bg-red-50/70 px-3 py-2.5 text-sm font-semibold text-red-900 transition hover:border-red-200 hover:bg-red-100/70"
                      >
                        <span className="inline-flex items-center gap-2">
                          <PhoneCall className="h-4 w-4 text-red-700" aria-hidden="true" />
                          {number}
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.08em] text-red-700">{t.tapToCall}</span>
                      </a>

                      {whatsappHref ? (
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          <span className="text-[11px] uppercase tracking-[0.08em]">{t.tapToChat}</span>
                        </a>
                      ) : null}
                    </div>
                  ))}

                  {SCHOOL_INFO?.email ? (
                    <a
                      href={`mailto:${SCHOOL_INFO.email}`}
                      className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2.5 text-sm font-semibold text-red-900 transition hover:border-red-200 hover:bg-red-100/70"
                    >
                      <Mail className="h-4 w-4 text-red-700" aria-hidden="true" />
                      {SCHOOL_INFO.email}
                    </a>
                  ) : null}

                  {schoolAddress ? (
                    <a
                      href={locationHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2.5 text-sm font-semibold text-red-900 transition hover:border-red-200 hover:bg-red-100/70"
                    >
                      <span className="inline-flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                        <span>{schoolAddress}</span>
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.08em] text-red-700">{t.openInMaps}</span>
                    </a>
                  ) : null}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-red-200/70 bg-white/85 p-4 shadow-[0_18px_42px_-30px_rgba(127,29,29,0.7)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-600">{t.phone}</p>
            <div className="mt-2 space-y-2">
              {phoneNumbers.map((number) => (
                <div key={`strip-${number}`} className="flex flex-wrap items-center gap-2">
                  <a
                    href={toTelHref(number)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900 transition hover:bg-red-100"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    {number}
                  </a>

                  {whatsappHref ? (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      {t.whatsapp}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-red-200/70 bg-white/85 p-4 shadow-[0_18px_42px_-30px_rgba(127,29,29,0.7)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-600">{t.email}</p>
            {SCHOOL_INFO?.email ? (
              <a
                href={`mailto:${SCHOOL_INFO.email}`}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900 transition hover:bg-red-100"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {SCHOOL_INFO.email}
              </a>
            ) : (
              <p className="mt-2 text-sm font-medium text-slate-600">Not available</p>
            )}
          </article>

          <article className="rounded-2xl border border-red-200/70 bg-white/85 p-4 shadow-[0_18px_42px_-30px_rgba(127,29,29,0.7)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-600">{t.location}</p>
            {schoolAddress ? (
              <a
                href={locationHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900 transition hover:bg-red-100"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{schoolAddress}</span>
              </a>
            ) : (
              <p className="mt-2 text-sm font-medium text-slate-600">Not available</p>
            )}
          </article>
        </section>

        <section className={sectionClassName}>
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-red-100/60 blur-2xl" />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900">{t.imageGallery}</h3>
                <p className="mt-1 text-sm text-slate-600">{t.imageGalleryNote}</p>
              </div>
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                {schoolImages.length} Photos
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {schoolImages.map((image) => (
                <article
                  key={image.id}
                  className="group overflow-hidden rounded-2xl border border-red-100 bg-white shadow-[0_16px_34px_-24px_rgba(15,23,42,0.78)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_44px_-22px_rgba(127,29,29,0.8)]"
                >
                  <img src={image.src} alt={image.title} className="h-52 w-full object-cover transition duration-300 group-hover:scale-105" />
                  <p className="px-3 py-3 text-sm font-medium text-slate-800">{image.title}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-red-100/60 blur-2xl" />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900">{t.videoGallery}</h3>
                <p className="mt-1 text-sm text-slate-600">{t.videoGalleryNote}</p>
              </div>
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                {schoolVideos.length} Videos
              </span>
            </div>

            {schoolVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-red-300 bg-red-50/60 px-4 py-10 text-center text-sm text-red-800">
                {t.noVideos}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {schoolVideos.map((video) => (
                  <article
                    key={video.id}
                    className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-[0_16px_34px_-24px_rgba(15,23,42,0.78)]"
                  >
                    <video src={video.src} controls className="h-64 w-full object-cover" />
                    <p className="px-3 py-3 text-sm font-medium text-slate-800">{video.title}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={sectionClassName}>
          <h3 className="text-2xl font-semibold text-slate-900">{t.years}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {growthHighlights.map((highlight, index) => (
              <div
                key={index}
                className="rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50 p-4 shadow-[0_14px_30px_-24px_rgba(127,29,29,0.82)]"
              >
                <p className="flex items-start gap-3 text-sm text-slate-700 md:text-base">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-700 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{highlight}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{t.importantInfo}</h3>
              <p className="mt-1 text-sm text-slate-600">{t.importantInfoNote}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">{t.paymentSupport}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/privacy-policy" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-100">
              Privacy Policy
            </Link>
            <Link href="/terms-and-conditions" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-100">
              Terms & Conditions
            </Link>
            <Link href="/refund-and-cancellation" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-100">
              Refund Policy
            </Link>
            <Link href="/contact-us" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-100">
              Contact Us
            </Link>
            <Link href="/about-us" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800 hover:bg-red-100">
              About Us
            </Link>
          </div>

          {Array.isArray(SCHOOL_INFO?.officeHours) && SCHOOL_INFO.officeHours.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-700">Office Hours</p>
              <div className="mt-2 space-y-1">
                {SCHOOL_INFO.officeHours.map((slot) => (
                  <p key={slot} className="text-sm font-medium text-slate-700">
                    {slot}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
