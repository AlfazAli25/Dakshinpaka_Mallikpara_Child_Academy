 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getAuthContext } from '@/lib/user-records';

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
    const { token, user } = getAuthContext();
    if (!token || !user || user.role !== 'teacher') {
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