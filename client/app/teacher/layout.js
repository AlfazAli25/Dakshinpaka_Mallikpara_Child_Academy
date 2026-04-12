 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getAuthContext } from '@/lib/user-records';

import { useLanguage } from '@/lib/language-context';

const translations = {
  en: {
    title: 'Teacher Panel',
    welcome: 'Welcome',
    links: [
      { href: '/teacher/dashboard', label: 'Dashboard' },
      { href: '/teacher/attendance', label: 'Attendance' },
      { href: '/teacher/exams', label: 'Exams' },
      { href: '/teacher/marks', label: 'Marks' },
      { href: '/teacher/timetable', label: 'Timetable' }
    ]
  },
  bn: {
    title: 'শিক্ষক প্যানেল',
    welcome: 'স্বাগতম',
    links: [
      { href: '/teacher/dashboard', label: 'ড্যাশবোর্ড' },
      { href: '/teacher/attendance', label: 'উপস্থিতি' },
      { href: '/teacher/exams', label: 'পরীক্ষা' },
      { href: '/teacher/marks', label: 'মার্কস' },
      { href: '/teacher/timetable', label: 'রুটিন' }
    ]
  }
};

export default function TeacherLayout({ children }) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const [teacherName, setTeacherName] = useState('');

  useEffect(() => {
    const { token, user } = getAuthContext();
    if (!token || !user || user.role !== 'teacher') {
      router.replace('/login');
      return;
    }

    setTeacherName(String(user.name || '').trim());
  }, [router]);

  const panelTitle = teacherName ? `${t.welcome}, ${teacherName}` : t.title;

  return (
    <AppShell title={panelTitle} links={t.links}>
      {children}
    </AppShell>
  );
}