'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import InfoCard from '@/components/InfoCard';
import { get } from '@/lib/api';
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
      'Upcoming Exams': 'Upcoming Exams',
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
      'Upcoming Exams': 'আসন্ন পরীক্ষা',
      'Pending Fees': 'বকেয়া ফি'
    }
  }
};

export default function StudentDashboardPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;
  const [stats, setStats] = useState([
    { title: 'Attendance %', value: '0%' },
    { title: 'Upcoming Exams', value: '0' },
    { title: 'Pending Fees', value: '0' }
  ]);
  const [studentProfile, setStudentProfile] = useState(null);

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }

    return parsed.toLocaleDateString();
  };

  useEffect(() => {
    const load = async () => {
      const student = await getCurrentStudentRecord();
      const { token } = getAuthContext();
      if (!student || !token) {
        return;
      }

      setStudentProfile(student);

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
      const upcomingExams = (examsRes.data || []).filter((item) => new Date(item.date).getTime() >= Date.now()).length;
      const pendingFromFees = (feesRes.data || []).reduce(
        (sum, item) => sum + Math.max((item.amountDue || 0) - (item.amountPaid || 0), 0),
        0
      );
      const pendingFees = Math.max(pendingFromFees, Number(student.pendingFees || 0));

      setStats([
        { title: 'Attendance %', value: attendancePercent },
        { title: 'Upcoming Exams', value: String(upcomingExams) },
        { title: 'Pending Fees', value: `INR ${pendingFees}` }
      ]);
    };

    load().catch(() => {
      setStudentProfile(null);
      setStats([
        { title: 'Attendance %', value: '0%' },
        { title: 'Upcoming Exams', value: '0' },
        { title: 'Pending Fees', value: 'INR 0' }
      ]);
    });
  }, []);

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
          <StatCard key={item.title} title={t.stats[item.title] || item.title} value={item.value} />
        ))}
      </div>

      {studentProfile && (
        <InfoCard title={t.detailsTitle}>
          <p className="text-sm text-slate-700">{t.fields.name}: {studentProfile.userId?.name || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.class}: {studentProfile.classId?.name || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.section}: {studentProfile.classId?.section || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.gender}: {studentProfile.gender || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.dob}: {formatDate(studentProfile.dob)}</p>
          <p className="text-sm text-slate-700">{t.fields.guardianContact}: {studentProfile.guardianContact || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.email}: {studentProfile.userId?.email || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.admissionNo}: {studentProfile.admissionNo || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.address}: {studentProfile.address || '-'}</p>
          <p className="text-sm text-slate-700">{t.fields.pendingFees}: INR {studentProfile.pendingFees || 0}</p>
          <p className="text-sm text-slate-700">{t.fields.attendance}: {studentProfile.attendance || 0}%</p>
        </InfoCard>
      )}
    </div>
  );
}