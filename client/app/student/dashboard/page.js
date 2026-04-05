'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import InfoCard from '@/components/InfoCard';
import DetailsGrid from '@/components/DetailsGrid';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Student Dashboard',
    description: 'Track your attendance, exams, and fee status from a single place.',
    detailsTitle: 'Student Details',
    fields: {
      name: 'Name',
      class: 'Class',
      section: 'Section',
      gender: 'Gender',
      dob: 'Date of Birth',
      guardianContact: 'Guardian Contact',
      email: 'Email',
      admissionNo: 'Admission No',
      address: 'Address',
      pendingFees: 'Pending Fees',
      attendance: 'Attendance'
    },
    stats: {
      'Attendance %': 'Attendance %',
      'Upcoming Exam': 'Upcoming Exam',
      'Pending Fees': 'Pending Fees'
    }
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'স্টুডেন্ট ড্যাশবোর্ড',
    description: 'এক জায়গায় উপস্থিতি, পরীক্ষা ও ফি দেখুন।',
    detailsTitle: 'শিক্ষার্থীর তথ্য',
    fields: {
      name: 'নাম',
      class: 'ক্লাস',
      section: 'সেকশন',
      gender: 'লিঙ্গ',
      dob: 'জন্মতারিখ',
      guardianContact: 'অভিভাবকের যোগাযোগ',
      email: 'ইমেইল',
      admissionNo: 'ভর্তি নম্বর',
      address: 'ঠিকানা',
      pendingFees: 'বকেয়া ফি',
      attendance: 'উপস্থিতি'
    },
    stats: {
      'Attendance %': 'উপস্থিতি %',
      'Upcoming Exam': 'আসন্ন পরীক্ষা',
      'Pending Fees': 'বকেয়া ফি'
    }
  }
};

const DEFAULT_STATS = [
  { title: 'Attendance %', value: '0%' },
  { title: 'Upcoming Exam', value: 'No Upcoming Exam' },
  { title: 'Pending Fees', value: 'INR 0' }
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

      const examName = String(item?.examName || item?.description || 'Exam').trim() || 'Exam';
      return {
        name: examName,
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

const fetchStudentDashboardData = async () => {
  const student = await getCurrentStudentRecord();
  const { token } = getAuthContext();
  if (!student || !token) {
    return {
      studentProfile: null,
      stats: DEFAULT_STATS
    };
  }

  const [attendanceRes, examsRes, feesRes] = await Promise.all([
    get('/student/attendance', token),
    get(`/exams?classId=${student.classId?._id || ''}`, token),
    get('/student/fees', token)
  ]);

  const attendanceRows = attendanceRes.data || [];
  const present = attendanceRows.filter((item) => item.status === 'Present').length;
  const attendanceFromRecords = attendanceRows.length ? Math.round((present / attendanceRows.length) * 100) : null;
  const configuredAttendance = Number(student.attendance || 0);
  const attendancePercent = `${
    attendanceFromRecords !== null
      ? attendanceFromRecords
      : Number.isFinite(configuredAttendance)
        ? configuredAttendance
        : 0
  }%`;
  const upcomingExamValue = getUpcomingExamValue(examsRes.data || []);
  const pendingFromFees = (feesRes.data || []).reduce(
    (sum, item) => sum + Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0),
    0
  );

  return {
    studentProfile: student,
    stats: [
      { title: 'Attendance %', value: attendancePercent },
      { title: 'Upcoming Exam', value: upcomingExamValue },
      { title: 'Pending Fees', value: `INR ${pendingFromFees}` }
    ]
  };
};

export default function StudentDashboardPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const { data, isLoading } = useSWR('student-dashboard', fetchStudentDashboardData, {
    refreshInterval: 60000
  });

  const studentProfile = data?.studentProfile || null;
  const stats = useMemo(() => (Array.isArray(data?.stats) ? data.stats : DEFAULT_STATS), [data]);

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }

    return parsed.toLocaleDateString('en-GB');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={<LanguageToggle />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={t.stats[item.title] || item.title} value={item.value} loading={isLoading} />
        ))}
      </div>

      {isLoading ? (
        <InfoCard title={t.detailsTitle}>
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          </div>
        </InfoCard>
      ) : studentProfile ? (
        <InfoCard title={t.detailsTitle}>
          <DetailsGrid
            items={[
              { label: t.fields.name, value: studentProfile.userId?.name || '-' },
              { label: t.fields.class, value: formatClassLabel(studentProfile.classId) },
              { label: t.fields.section, value: studentProfile.classId?.section || '-' },
              { label: t.fields.gender, value: studentProfile.gender || '-' },
              { label: t.fields.dob, value: formatDate(studentProfile.dob) },
              { label: t.fields.guardianContact, value: studentProfile.guardianContact || '-' },
              { label: t.fields.email, value: studentProfile.userId?.email || '-' },
              { label: t.fields.admissionNo, value: studentProfile.admissionNo || '-' },
              { label: t.fields.address, value: studentProfile.address || '-' },
              { label: t.fields.pendingFees, value: `INR ${studentProfile.pendingFees || 0}`, highlight: true },
              { label: t.fields.attendance, value: `${studentProfile.attendance || 0}%` }
            ]}
          />
        </InfoCard>
      ) : null}
    </div>
  );
}