'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Mail, MapPin, MessageCircle, PhoneCall, Sparkles } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';

const FadeInSection = ({ children, className = '', delay = 0 }) => (
  <motion.section
    initial={{ opacity: 0, y: 40 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.7, delay, ease: 'easeOut' }}
    className={className}
  >
    {children}
  </motion.section>
);
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

const growthHighlightsEn = [
  'We are a kindergarten school with a close-knit learning environment.',
  'Our focus is early childhood learning through play, stories, and basic skills.',
  'Class groups help teachers give personal attention to every child.',
  'Parents and teachers stay connected regularly to support each student.'
];

const growthHighlightsBn = [
  'আমরা একটি নিবিড় শিক্ষার পরিবেশ সহ একটি কিন্ডারগার্টেন স্কুল।',
  'আমাদের লক্ষ্য খেলাধুলা, গল্প এবং মৌলিক দক্ষতার মাধ্যমে প্রারম্ভিক শিক্ষা।',
  'ছোট ক্লাস গ্রুপ শিক্ষকদের প্রতিটি শিশুর প্রতি ব্যক্তিগত মনোযোগ দিতে সাহায্য করে।',
  'প্রতিটি শিক্ষার্থীকে সহায়তা করার জন্য অভিভাবক এবং শিক্ষকরা নিয়মিত যোগাযোগ রাখেন।'
];

const sectionClassName =
  'relative overflow-hidden rounded-3xl border border-red-500/30 bg-slate-900/72 p-6 shadow-[0_34px_82px_-46px_rgba(127,29,29,0.78)] backdrop-blur-xl md:p-8';

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
      'No local videos found in public folder yet. Add .mp4 or .webm files and they will appear here.',
    aboutDeveloper: 'About the Developer',
    developedBy: 'Developed with ❤️ by Alfaz Ali',
    systemCreator: 'System Creator',
    developerBio: 'Full Stack Developer passionate about building modern web applications.',
    developerCta: 'Need a custom website or web app? Contact me 24/7 to discuss your project!',
    viewPortfolio: 'View Portfolio',
    contactDeveloper: 'Contact Developer',
    instagram: 'Instagram',
    estd: 'ESTD',
    photos: 'Photos',
    videos: 'Videos',
    officeHours: 'Office Hours',
    whatsappMessage: 'Hello {SCHOOL_NAME}, I want to know more about admission and school activities.',
    policyLinks: {
      privacy: 'Privacy Policy',
      terms: 'Terms & Conditions',
      refund: 'Refund Policy',
      contact: 'Contact Us',
      about: 'About Us'
    },
    images: {
      img1: 'Independence Day Group Celebration',
      img2: 'Students Activity Gathering',
      img3: 'Classroom Cultural Program',
      img4: 'Teacher and Students Showcase',
      img5: 'Morning Exercise Session',
      img6: 'Primary Section Group Photo'
    },
    videosMeta: {
      vid1: 'School Activities Highlights'
    }
  },
  bn: {
    welcome: 'স্বাগতম',
    register: 'রেজিস্টার',
    login: 'লগইন',
    logout: 'লগআউট',
    schoolOverview: 'কিন্ডারগার্টেনের ওভারভিউ',
    heroTitle: 'একটি কিন্ডারগার্টেন যেখানে প্রতিটি শিশুর বিশেষ যত্ন নেওয়া হয়',
    heroDescription:
      'আমরা একটি স্থানীয় কিন্ডারগার্টেন যারা শিশুদের প্রারম্ভিক শিক্ষা, যত্ন, মূল্যবোধ এবং অভিভাবক-শিক্ষকের ঘনিষ্ঠ যোগাযোগের উপর জোর দিই। পাশাপাশি প্রাত্যহিক কার্যকলাপে সহজ ডিজিটাল সহায়তার ব্যবস্থা রয়েছে।',
    quality: 'মৌলিক শিক্ষা',
    digital: 'সহজ ডিজিটাল পরিষেবা',
    holistic: 'যত্ন, খেলাধুলা এবং মূল্যবোধ',
    schoolIdentity: 'প্রাতিষ্ঠানিক পরিচিতি',
    contactDetails: 'যোগাযোগের তথ্য',
    phone: 'ফোন',
    email: 'ইমেইল',
    location: 'ঠিকানা',
    tapToCall: 'কল করতে ট্যাপ করুন',
    tapToChat: 'চ্যাট করতে ট্যাপ করুন',
    openInMaps: 'ম্যাপে খুলুন',
    callNow: 'অফিসে কল করুন',
    chatOnWhatsApp: 'হোয়াটসঅ্যাপে জানান',
    whatsapp: 'হোয়াটসঅ্যাপ',
    imageGallery: 'ছবির গ্যালারি',
    imageGalleryNote: 'আমাদের বিভিন্ন অনুষ্ঠান ও ক্লাসরুমের মুহূর্ত।',
    videoGallery: 'ভিডিও গ্যালারি',
    videoGalleryNote: 'আমাদের বিভিন্ন অনুষ্ঠান ও শিশুদের প্রতিভা।',
    years: 'আমাদের কিন্ডারগার্টেন যাত্রা',
    join: 'আমাদের সাথে যুক্ত হোন',
    quickAccess: 'সহজ অ্যাক্সেস',
    quickNote: 'লগইন করার পর এখান থেকে দ্রুত প্যানেলে যেতে পারবেন।',
    adminPanel: 'অ্যাডমিন প্যানেল',
    teacherPanel: 'শিক্ষক প্যানেল',
    studentPanel: 'শিক্ষার্থী প্যানেল',
    myPanel: 'আমার প্যানেল',
    importantInfo: 'গুরুত্বপূর্ণ তথ্যাবলী',
    importantInfoNote:
      'স্ট্যাটিক কিউআর এর মাধ্যমে ফি দেওয়া, পেমেন্ট এর প্রমাণ দেওয়া এবং স্বচ্ছতা যাচাই করার সাপোর্ট পেজ।',
    paymentSupport: 'কিউআর পেমেন্ট সুবিধা',
    noVideos:
      'পাবলিক ফোল্ডারে এখনো কোনো ভিডিও নেই। .mp4 বা .webm ফাইল যোগ করলে এখানে দেখা যাবে।',
    aboutDeveloper: 'ডেভেলপার সম্পর্কে',
    developedBy: 'Alfaz Ali দ্বারা ❤️ দিয়ে তৈরি',
    systemCreator: 'সিস্টেম নির্মাতা',
    developerBio: 'আধুনিক ওয়েব অ্যাপ্লিকেশন তৈরিতে আগ্রহী একজন ফুল-স্ট্যাক ডেভেলপার।',
    developerCta: 'আপনার কি কোনো কাস্টম ওয়েবসাইট প্রয়োজন? আপনার প্রজেক্ট নিয়ে আলোচনা করতে 24/7 আমার সাথে যোগাযোগ করুন!',
    viewPortfolio: 'পোর্টফোলিও দেখুন',
    contactDeveloper: 'যোগাযোগ করুন',
    instagram: 'ইন্সটাগ্রাম',
    estd: 'স্থাপিত',
    photos: 'ছবি',
    videos: 'ভিডিও',
    officeHours: 'অফিস সময়',
    whatsappMessage: 'হ্যালো {SCHOOL_NAME}, আমি ভর্তি এবং স্কুলের কার্যক্রম সম্পর্কে আরও জানতে চাই।',
    policyLinks: {
      privacy: 'প্রাইভেসি পলিসি',
      terms: 'শর্তাবলী',
      refund: 'রিফান্ড পলিসি',
      contact: 'যোগাযোগ',
      about: 'আমাদের সম্পর্কে'
    },
    images: {
      img1: 'স্বাধীনতা দিবস উদযাপন',
      img2: 'শিক্ষার্থীদের কার্যক্রম',
      img3: 'ক্লাসরুম সাংস্কৃতিক অনুষ্ঠান',
      img4: 'শিক্ষক ও শিক্ষার্থীদের প্রদর্শন',
      img5: 'সকাল বেলার ব্যায়াম',
      img6: 'প্রাথমিক শাখার গ্রুপ ফটো'
    },
    videosMeta: {
      vid1: 'স্কুলের কার্যক্রমের হাইলাইট'
    }
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
        t.whatsappMessage.replace('{SCHOOL_NAME}', SCHOOL_NAME)
      ),
    [t.whatsappMessage]
  );

  const localizedImages = useMemo(() => [
    {
      id: 1,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.50.jpeg',
      title: t.images.img1
    },
    {
      id: 2,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.56.jpeg',
      title: t.images.img2
    },
    {
      id: 3,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.47.58.jpeg',
      title: t.images.img3
    },
    {
      id: 4,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.00.jpeg',
      title: t.images.img4
    },
    {
      id: 5,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.02.jpeg',
      title: t.images.img5
    },
    {
      id: 6,
      src: '/WhatsApp%20Image%202026-03-23%20at%2009.48.19.jpeg',
      title: t.images.img6
    }
  ], [t.images]);

  const localizedVideos = useMemo(() => [
    {
      id: 1,
      src: '/WhatsApp%20Video%202026-03-23%20at%2009.53.09.mp4',
      title: t.videosMeta.vid1
    }
  ], [t.videosMeta]);

  const growthHighlights = language === 'bn' ? growthHighlightsBn : growthHighlightsEn;

  const onLogout = () => {
    clearSession();
    setCurrentUser(null);
    router.push('/');
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_18%_8%,rgba(127,29,29,0.42),rgba(15,23,42,0.98)_46%,rgba(2,6,23,1)_100%)] text-red-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-red-700/28 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-rose-700/24 blur-3xl" />
        <div className="absolute bottom-8 left-1/3 h-64 w-64 rounded-full bg-red-500/22 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-red-500/25 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-red-500/35 bg-slate-900 shadow-[0_15px_26px_-18px_rgba(127,29,29,0.9)]">
              <img src="/School_Logo.png" alt="School Logo" className="h-full w-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-red-200">{t.welcome}</p>
              <h1 className="truncate text-base font-semibold text-red-50 md:text-xl">{SCHOOL_NAME}</h1>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <LanguageToggle />
            {currentUser ? (
              <>
                <Link
                  href={panelRoute}
                  className="rounded-xl border border-red-500/35 bg-slate-900/85 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-400/45 hover:bg-slate-800/90 md:px-4"
                >
                  {t.myPanel}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-xl border border-red-500/35 bg-slate-900/85 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-400/45 hover:bg-slate-800/90 md:px-4"
                >
                  {t.logout}
                </button>
              </>
            ) : (
              <>
                {allowAdminRegistration ? (
                  <Link
                    href="/register"
                    className="rounded-xl border border-red-500/35 bg-slate-900/85 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-400/45 hover:bg-slate-800/90 md:px-4"
                  >
                    {t.register}
                  </Link>
                ) : null}
                <Link
                  href="/login"
                  className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-[0_16px_26px_-18px_rgba(185,28,28,0.95)] transition hover:bg-red-600 md:px-4"
                >
                  {t.login}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl space-y-8 px-4 pb-12 pt-8 md:px-6 md:pb-16 md:pt-10">
        <FadeInSection delay={0.1} className="relative overflow-hidden rounded-[2rem] border border-red-200/70 bg-gradient-to-br from-red-700 via-red-600 to-red-900 text-red-50 shadow-[0_38px_90px_-44px_rgba(127,29,29,0.96)]">
          <div className="absolute -left-20 top-14 h-44 w-44 rounded-3xl bg-red-300/35" />
          <div className="absolute right-6 top-8 h-28 w-28 rounded-full border-8 border-red-300/35" />
          <div className="absolute -bottom-16 right-12 h-56 w-56 rounded-full bg-red-950/25 blur-2xl" />

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


            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl border border-red-400/30 bg-slate-900/88 p-5 text-red-50 shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">{t.schoolIdentity}</p>
                <div className="mt-4 grid place-items-center rounded-2xl border border-red-500/30 bg-slate-950/70 p-4">
                  <img src="/School_Logo.png" alt={`${SCHOOL_NAME} Emblem`} className="h-32 w-32 object-contain md:h-40 md:w-40" />
                </div>
                <p className="mt-3 text-base font-semibold text-red-50 md:text-lg">{SCHOOL_NAME}</p>
                <p className="mt-1 text-sm font-medium text-red-100/80">{t.estd} 2018</p>
              </div>

              <div className="rounded-3xl border border-red-400/30 bg-slate-900/88 p-5 text-red-50 shadow-[0_24px_48px_-28px_rgba(2,6,23,0.95)]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">{t.contactDetails}</p>
                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {primaryPhoneNumber ? (
                      <a
                        href={toTelHref(primaryPhoneNumber)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-400/45 hover:bg-red-800/40"
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
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200/50 bg-emerald-600/90 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500/90 hover:border-emerald-200/70"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        {t.chatOnWhatsApp}
                      </a>
                    ) : null}
                  </div>

                  {SCHOOL_INFO?.email ? (
                    <a
                      href={`mailto:${SCHOOL_INFO.email}`}
                      className="flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-900/35 px-3 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-400/45 hover:bg-red-800/40"
                    >
                      <Mail className="h-4 w-4 text-red-300" aria-hidden="true" />
                      {SCHOOL_INFO.email}
                    </a>
                  ) : null}

                  {schoolAddress ? (
                    <a
                      href={locationHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 rounded-xl border border-red-500/35 bg-red-900/35 px-3 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-400/45 hover:bg-red-800/40"
                    >
                      <span className="inline-flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                        <span>{schoolAddress}</span>
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.08em] text-red-200">{t.openInMaps}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </FadeInSection>



        <FadeInSection className={sectionClassName}>
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-red-500/20 blur-2xl" />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-red-50">{t.imageGallery}</h3>
                <p className="mt-1 text-sm text-red-100/80">{t.imageGalleryNote}</p>
              </div>
              <span className="rounded-full border border-red-500/35 bg-red-900/35 px-3 py-1 text-xs font-semibold text-red-100">
                {localizedImages.length} {t.photos}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {localizedImages.map((image) => (
                <article
                  key={image.id}
                  className="group overflow-hidden rounded-2xl border border-red-500/28 bg-slate-900/82 shadow-[0_16px_34px_-24px_rgba(2,6,23,0.9)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_44px_-22px_rgba(127,29,29,0.88)]"
                >
                  <img src={image.src} alt={image.title} className="h-52 w-full object-cover transition duration-300 group-hover:scale-105" />
                  <p className="px-3 py-3 text-sm font-medium text-red-50">{image.title}</p>
                </article>
              ))}
            </div>
          </div>
        </FadeInSection>

        <FadeInSection className={sectionClassName}>
          <div className="absolute left-0 top-0 h-36 w-36 rounded-full bg-red-500/20 blur-2xl" />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-red-50">{t.videoGallery}</h3>
                <p className="mt-1 text-sm text-red-100/80">{t.videoGalleryNote}</p>
              </div>
              <span className="rounded-full border border-red-500/35 bg-red-900/35 px-3 py-1 text-xs font-semibold text-red-100">
                {localizedVideos.length} {t.videos}
              </span>
            </div>

            {localizedVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-red-500/35 bg-red-900/25 px-4 py-10 text-center text-sm text-red-100">
                {t.noVideos}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {localizedVideos.map((video) => (
                  <article
                    key={video.id}
                    className="overflow-hidden rounded-2xl border border-red-500/28 bg-slate-900/82 shadow-[0_16px_34px_-24px_rgba(2,6,23,0.9)]"
                  >
                    <video src={video.src} controls className="h-64 w-full object-cover" />
                    <p className="px-3 py-3 text-sm font-medium text-red-50">{video.title}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </FadeInSection>

        <FadeInSection className={sectionClassName}>
          <h3 className="text-2xl font-semibold text-red-50">{t.years}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {growthHighlights.map((highlight, index) => (
              <div
                key={index}
                className="rounded-2xl border border-red-500/28 bg-gradient-to-br from-slate-900/88 to-red-950/38 p-4 shadow-[0_14px_30px_-24px_rgba(127,29,29,0.9)]"
              >
                <p className="flex items-start gap-3 text-sm text-red-100 md:text-base">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-700 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{highlight}</span>
                </p>
              </div>
            ))}
          </div>
        </FadeInSection>

        <FadeInSection className={sectionClassName}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-red-50">{t.importantInfo}</h3>
              <p className="mt-1 text-sm text-red-100/80">{t.importantInfoNote}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">{t.paymentSupport}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/privacy-policy" className="rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-3 text-center text-sm font-semibold text-red-100 hover:bg-red-800/45">
              {t.policyLinks.privacy}
            </Link>
            <Link href="/terms-and-conditions" className="rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-3 text-center text-sm font-semibold text-red-100 hover:bg-red-800/45">
              {t.policyLinks.terms}
            </Link>
            <Link href="/refund-and-cancellation" className="rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-3 text-center text-sm font-semibold text-red-100 hover:bg-red-800/45">
              {t.policyLinks.refund}
            </Link>
            <Link href="/contact-us" className="rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-3 text-center text-sm font-semibold text-red-100 hover:bg-red-800/45">
              {t.policyLinks.contact}
            </Link>
            <Link href="/about-us" className="rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-3 text-center text-sm font-semibold text-red-100 hover:bg-red-800/45">
              {t.policyLinks.about}
            </Link>
          </div>

          {Array.isArray(SCHOOL_INFO?.officeHours) && SCHOOL_INFO.officeHours.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-red-500/28 bg-red-900/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.11em] text-red-200">{t.officeHours}</p>
              <div className="mt-2 space-y-1">
                {SCHOOL_INFO.officeHours.map((slot) => (
                  <p key={slot} className="text-sm font-medium text-red-100">
                    {slot}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </FadeInSection>

        <FadeInSection className={sectionClassName}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-red-50">{t.aboutDeveloper}</h3>
              <p className="mt-1 text-sm text-red-100/80">{t.developedBy}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">{t.systemCreator}</p>
          </div>
          
          <div className="mt-4 rounded-2xl border border-red-500/28 bg-slate-900/40 p-5">
            <p className="text-sm text-red-50 sm:text-base">
              {t.developerBio}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-500/20 px-3 py-2 text-xs sm:text-sm text-red-200">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
              <span>{t.developerCta}</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href="https://portfolio-iota-henna-28.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 shadow-[0_12px_22px_-12px_rgba(185,28,28,0.9)]"
              >
                {t.viewPortfolio}
              </a>
              <a
                href="https://www.instagram.com/_alfazali_/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-400/45 hover:bg-red-800/40"
              >
                {t.instagram}
              </a>
              <a
                href="tel:8509658357"
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-900/35 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-400/45 hover:bg-red-800/40"
              >
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
                {t.contactDeveloper}
              </a>
            </div>
          </div>
        </FadeInSection>
      </main>
    </div>
  );
}
