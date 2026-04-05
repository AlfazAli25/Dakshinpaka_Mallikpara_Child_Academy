"use client";

import { useMemo } from 'react';
import useSWR from 'swr';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';

const DEFAULT_STATS = [
  { title: 'Total Students', value: '0' },
  { title: 'Total Teachers', value: '0' },
  { title: 'Upcoming Exam', value: 'No upcoming exam' }
];

const getUpcomingExamName = (exams) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcomingExam = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const examDateValue = item?.startDate || item?.date || item?.examDate;
      const examDate = examDateValue ? new Date(examDateValue) : null;
      if (!examDate || Number.isNaN(examDate.getTime())) {
        return null;
      }

      const examName = String(item?.examName || item?.description || 'Exam').trim();
      return {
        name: examName || 'Exam',
        date: examDate
      };
    })
    .filter((item) => item && item.date >= startOfToday)
    .sort((left, right) => left.date.getTime() - right.date.getTime())[0];

  return upcomingExam?.name || 'No upcoming exam';
};

const fetchAdminDashboardStats = async () => {
  const token = getToken();
  if (!token) {
    return DEFAULT_STATS;
  }

  const [studentsRes, teachersRes, examsRes] = await Promise.all([
    get('/students', token),
    get('/teachers', token),
    get('/exams', token)
  ]);

  const upcomingExamName = getUpcomingExamName(examsRes.data || []);

  return [
    { title: 'Total Students', value: String(studentsRes.data?.length || 0) },
    { title: 'Total Teachers', value: String(teachersRes.data?.length || 0) },
    { title: 'Upcoming Exam', value: upcomingExamName }
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
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} loading={isLoading} />
        ))}
      </div>
    </div>
  );
}