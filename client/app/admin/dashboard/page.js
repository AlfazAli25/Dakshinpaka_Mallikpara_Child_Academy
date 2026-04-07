"use client";

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import PageHeader from '@/components/PageHeader';
import SchoolBrandPanel from '@/components/SchoolBrandPanel';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';

const StatCard = dynamic(() => import('@/components/StatCard'));

const DEFAULT_STATS = [
  { title: 'Total Students', value: '0' },
  { title: 'Total Teachers', value: '0' },
  { title: 'Total Classes', value: '0' },
  { title: 'Upcoming Exam', value: 'No Upcoming Exam' }
];

const fetchAdminDashboardStats = async () => {
  const token = getToken();
  if (!token) {
    return DEFAULT_STATS;
  }

  const summaryRes = await get('/dashboard/summary', token);
  const summary = summaryRes.data || {};

  return [
    { title: 'Total Students', value: String(summary.studentsCount || 0) },
    { title: 'Total Teachers', value: String(summary.teachersCount || 0) },
    { title: 'Total Classes', value: String(summary.classesCount || 0) },
    { title: 'Upcoming Exam', value: String(summary.upcomingExam || 'No Upcoming Exam') }
  ];
};

export default function AdminDashboardPage() {
  const { data, isLoading } = useSWR('admin-dashboard-stats', fetchAdminDashboardStats, {
    refreshInterval: 60000
  });

  const stats = useMemo(() => (Array.isArray(data) ? data : DEFAULT_STATS), [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Admin Dashboard"
        description="Track key school metrics and quickly navigate core management operations."
      />

      <SchoolBrandPanel subtitle="Manage academics, communication, and operations from one trusted school platform." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} loading={isLoading} />
        ))}
      </div>
    </div>
  );
}