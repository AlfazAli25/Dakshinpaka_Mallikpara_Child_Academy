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
  { title: 'Upcoming Exam', value: 'No Upcoming Exam' }
];

const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getExamWindow = (exam) => {
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  const slotWindows = scheduleRows
    .map((slot) => {
      const startDate = toValidDate(slot?.startDate);
      const endDate = toValidDate(slot?.endDate);

      if (!startDate || !endDate) {
        return null;
      }

      return { startDate, endDate };
    })
    .filter(Boolean);

  if (slotWindows.length > 0) {
    return {
      startDate: new Date(Math.min(...slotWindows.map((item) => item.startDate.getTime()))),
      endDate: new Date(Math.max(...slotWindows.map((item) => item.endDate.getTime())))
    };
  }

  const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
  const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;

  if (!fallbackStartDate || !fallbackEndDate) {
    return null;
  }

  return {
    startDate: fallbackStartDate,
    endDate: fallbackEndDate
  };
};

const getUpcomingExamValue = (exams) => {
  const nowMs = Date.now();

  const examWindows = (Array.isArray(exams) ? exams : [])
    .map((item) => {
      const examWindow = getExamWindow(item);
      if (!examWindow) {
        return null;
      }

      const examName = String(item?.examName || item?.description || 'Exam').trim();
      return {
        name: examName || 'Exam',
        startDate: examWindow.startDate,
        endDate: examWindow.endDate
      };
    })
    .filter(Boolean);

  const ongoingExam = examWindows
    .filter((item) => nowMs >= item.startDate.getTime() && nowMs <= item.endDate.getTime())
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  if (ongoingExam) {
    return 'Ongoing';
  }

  const nextScheduledExam = examWindows
    .filter((item) => item.startDate.getTime() > nowMs)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];

  return nextScheduledExam?.name || 'No Upcoming Exam';
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

  const upcomingExamName = getUpcomingExamValue(examsRes.data || []);

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