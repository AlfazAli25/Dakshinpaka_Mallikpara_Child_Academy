"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useLanguage } from '@/lib/language-context';
import { getUser } from '@/lib/session';

const translations = {
  en: {
    title: 'Student Panel',
    links: [
      { href: '/student/dashboard', label: 'Dashboard' },
      { href: '/student/timetable', label: 'Timetable' },
      { href: '/student/results', label: 'Results' },
      { href: '/student/attendance', label: 'Attendance' },
      { href: '/student/fees', label: 'Fees' },
      { href: '/student/checkout', label: 'Checkout' }
    ]
  },
  bn: {
    title: 'স্টুডেন্ট প্যানেল',
    links: [
      { href: '/student/dashboard', label: 'ড্যাশবোর্ড' },
      { href: '/student/timetable', label: 'রুটিন' },
      { href: '/student/results', label: 'ফলাফল' },
      { href: '/student/attendance', label: 'উপস্থিতি' },
      { href: '/student/fees', label: 'ফি' },
      { href: '/student/checkout', label: 'চেকআউট' }
    ]
  }
};

export default function StudentLayout({ children }) {
  const router = useRouter();
  const { language } = useLanguage();
  const current = translations[language] || translations.en;
  const [studentName, setStudentName] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== 'student') {
      router.replace('/login');
      return;
    }

    setStudentName(String(user.name || '').trim());
  }, [router]);

  const panelTitle = studentName ? `Welcome, ${studentName}` : current.title;

  return (
    <AppShell title={panelTitle} links={current.links}>
      {children}
    </AppShell>
  );
}