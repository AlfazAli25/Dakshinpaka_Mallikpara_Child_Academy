 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getAuthContext } from '@/lib/user-records';

import { useLanguage } from '@/lib/language-context';

const translations = {
  en: {
    title: 'Admin Panel',
    welcome: 'Welcome',
    links: [
      { href: '/admin/dashboard', label: 'Dashboard' },
      { href: '/admin/students', label: 'Students' },
      { href: '/admin/teachers', label: 'Teachers' },
      { href: '/admin/classes', label: 'Classes' },
      { href: '/admin/notices', label: 'Notices' },
      { href: '/admin/timetable', label: 'Timetable' },
      { href: '/admin/exams', label: 'Exams' },
      { href: '/admin/marks', label: 'Marks' },
      { href: '/admin/fees', label: 'Fees' }
    ]
  },
  bn: {
    title: 'অ্যাডমিন প্যানেল',
    welcome: 'স্বাগতম',
    links: [
      { href: '/admin/dashboard', label: 'ড্যাশবোর্ড' },
      { href: '/admin/students', label: 'ছাত্রছাত্রী' },
      { href: '/admin/teachers', label: 'শিক্ষক' },
      { href: '/admin/classes', label: 'ক্লাস' },
      { href: '/admin/notices', label: 'নোটিশ' },
      { href: '/admin/timetable', label: 'রুটিন' },
      { href: '/admin/exams', label: 'পরীক্ষা' },
      { href: '/admin/marks', label: 'মার্কস' },
      { href: '/admin/fees', label: 'ফি' }
    ]
  }
};

export default function AdminLayout({ children }) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    const { token, user } = getAuthContext();
    if (!token || !user || user.role !== 'admin') {
      router.replace('/login');
      return;
    }
    setAdminName(user.name || '');
  }, [router]);

  const panelTitle = adminName ? `${t.welcome}, ${adminName}` : t.title;

  return (
    <AppShell title={panelTitle} links={t.links}>
      {children}
    </AppShell>
  );
}