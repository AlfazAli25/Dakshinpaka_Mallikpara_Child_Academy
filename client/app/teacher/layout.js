 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getUser } from '@/lib/session';

const links = [
  { href: '/teacher/dashboard', label: 'Dashboard' },
  { href: '/teacher/attendance', label: 'Attendance' },
  { href: '/teacher/exams', label: 'Exams' },
  { href: '/teacher/marks', label: 'Marks' },
  { href: '/teacher/timetable', label: 'Timetable' }
];

export default function TeacherLayout({ children }) {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState('');

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== 'teacher') {
      router.replace('/login');
      return;
    }

    setTeacherName(String(user.name || '').trim());
  }, [router]);

  const panelTitle = teacherName ? `Welcome, ${teacherName}` : 'Teacher Panel';

  return (
    <AppShell title={panelTitle} links={links}>
      {children}
    </AppShell>
  );
}