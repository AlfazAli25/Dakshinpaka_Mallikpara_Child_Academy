"use client";

import { useEffect, useState } from 'react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { title: 'Total Students', value: '0' },
    { title: 'Total Teachers', value: '0' },
    { title: 'Upcoming Exams', value: '0' }
  ]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = getToken();
        const [studentsRes, teachersRes, examsRes] = await Promise.all([
          get('/students', token),
          get('/teachers', token),
          get('/exams', token)
        ]);

        const upcomingExams = (examsRes.data || []).filter((exam) => new Date(exam.date).getTime() >= Date.now()).length;

        setStats([
          { title: 'Total Students', value: String(studentsRes.data?.length || 0) },
          { title: 'Total Teachers', value: String(teachersRes.data?.length || 0) },
          { title: 'Upcoming Exams', value: String(upcomingExams) }
        ]);
      } catch (_error) {
        setStats([
          { title: 'Total Students', value: '0' },
          { title: 'Total Teachers', value: '0' },
          { title: 'Upcoming Exams', value: '0' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Admin Dashboard"
        description="Track key school metrics and quickly navigate core management operations."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} loading={loading} />
        ))}
      </div>
    </div>
  );
}