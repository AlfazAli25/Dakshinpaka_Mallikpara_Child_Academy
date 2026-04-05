 'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getUser } from '@/lib/session';

const links = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/teachers', label: 'Teachers' },
  { href: '/admin/classes', label: 'Classes' },
  { href: '/admin/timetable', label: 'Timetable' },
  { href: '/admin/exams', label: 'Exams' },
  { href: '/admin/marks', label: 'Marks' },
  { href: '/admin/fees', label: 'Fees' }
];

export default function AdminLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== 'admin') {
      router.replace('/login');
    }
  }, [router]);

  return (
    <AppShell title="Admin Panel" links={links}>
      {children}
    </AppShell>
  );
}