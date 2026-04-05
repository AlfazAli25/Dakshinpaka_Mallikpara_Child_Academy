'use client';

import { useEffect, useMemo, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import LanguageToggle from '@/components/LanguageToggle';
import { get } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { getAuthContext, getCurrentStudentRecord } from '@/lib/user-records';

const toId = (value) => String(value?._id || value || '');

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

const formatDateLabel = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString();
};

const formatTimeLabel = (value) => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getUpcomingExamSlots = (exams = [], classId = '') => {
  const normalizedClassId = String(classId || '').trim();
  const nowMs = Date.now();

  const slots = [];

  (Array.isArray(exams) ? exams : []).forEach((exam) => {
    const examId = toId(exam);
    const examClassId = toId(exam?.classId);
    if (normalizedClassId && examClassId && examClassId !== normalizedClassId) {
      return;
    }

    const examName = String(exam?.examName || exam?.description || 'Exam').trim() || 'Exam';
    const academicYear = String(exam?.academicYear || '').trim() || '-';

    const fallbackSubjects = Array.isArray(exam?.subjects)
      ? exam.subjects
          .map((subject) => ({
            subjectId: toId(subject),
            label: subject?.name || subject?.code || 'Subject'
          }))
          .filter((subject) => subject.subjectId)
      : [];

    const scheduleRows = Array.isArray(exam?.schedule)
      ? exam.schedule
          .map((slot, index) => {
            const slotClassId = toId(slot?.classId) || examClassId;
            if (normalizedClassId && slotClassId && slotClassId !== normalizedClassId) {
              return null;
            }

            const subjectId = toId(slot?.subjectId);
            const linkedFallbackSubject = fallbackSubjects.find((subject) => subject.subjectId === subjectId);
            const subjectLabel =
              slot?.subjectId?.name ||
              slot?.subjectId?.code ||
              linkedFallbackSubject?.label ||
              fallbackSubjects[0]?.label ||
              'Subject';

            const startDate = toValidDate(slot?.startDate);
            const endDate = toValidDate(slot?.endDate);
            if (!startDate || !endDate || endDate.getTime() < nowMs) {
              return null;
            }

            const status = nowMs >= startDate.getTime() && nowMs <= endDate.getTime() ? 'Ongoing' : 'Scheduled';

            return {
              id: `${examId}-${subjectId || index}-${startDate.getTime()}`,
              examName,
              subjectName: subjectLabel,
              academicYear,
              startDate,
              endDate,
              status
            };
          })
          .filter(Boolean)
      : [];

    if (scheduleRows.length > 0) {
      slots.push(...scheduleRows);
      return;
    }

    const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
    const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;

    if (!fallbackStartDate || !fallbackEndDate || fallbackEndDate.getTime() < nowMs) {
      return;
    }

    const status = nowMs >= fallbackStartDate.getTime() && nowMs <= fallbackEndDate.getTime() ? 'Ongoing' : 'Scheduled';

    slots.push({
      id: `${examId || examName}-${fallbackStartDate.getTime()}`,
      examName,
      subjectName: fallbackSubjects[0]?.label || 'Subject',
      academicYear,
      startDate: fallbackStartDate,
      endDate: fallbackEndDate,
      status
    });
  });

  return slots.sort((left, right) => {
    const leftOrder = left.status === 'Ongoing' ? 0 : 1;
    const rightOrder = right.status === 'Ongoing' ? 0 : 1;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.startDate.getTime() - right.startDate.getTime();
  });
};

const text = {
  en: {
    eyebrow: 'Student Portal',
    title: 'Upcoming Exams',
    description: 'See all upcoming exam slots with subject-wise timetable details.',
    totalLabel: 'Total upcoming exam slots',
    statusLabels: {
      Ongoing: 'Ongoing',
      Scheduled: 'Scheduled'
    },
    columns: [
      { key: 'examName', label: 'Exam Name' },
      { key: 'subject', label: 'Subject' },
      { key: 'academicYear', label: 'Academic Year' },
      { key: 'date', label: 'Date' },
      { key: 'startTime', label: 'Start Time' },
      { key: 'endTime', label: 'End Time' },
      { key: 'status', label: 'Status' }
    ]
  },
  bn: {
    eyebrow: 'স্টুডেন্ট পোর্টাল',
    title: 'আসন্ন পরীক্ষা',
    description: 'বিষয়ভিত্তিক সময়সূচিসহ সব আসন্ন পরীক্ষার তথ্য দেখুন।',
    totalLabel: 'মোট আসন্ন পরীক্ষা স্লট',
    statusLabels: {
      Ongoing: 'চলমান',
      Scheduled: 'নির্ধারিত'
    },
    columns: [
      { key: 'examName', label: 'পরীক্ষার নাম' },
      { key: 'subject', label: 'বিষয়' },
      { key: 'academicYear', label: 'শিক্ষাবর্ষ' },
      { key: 'date', label: 'তারিখ' },
      { key: 'startTime', label: 'শুরুর সময়' },
      { key: 'endTime', label: 'শেষের সময়' },
      { key: 'status', label: 'অবস্থা' }
    ]
  }
};

export default function StudentExamsPage() {
  const { language } = useLanguage();
  const t = text[language] || text.en;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);

      try {
        const student = await getCurrentStudentRecord();
        const { token } = getAuthContext();
        const studentClassId = toId(student?.classId);

        if (!token || !studentClassId) {
          if (active) {
            setRows([]);
          }
          return;
        }

        const response = await get(`/exams?classId=${studentClassId}&page=1&limit=300`, token, {
          forceRefresh: true,
          cacheTtlMs: 0
        });

        if (!active) {
          return;
        }

        const upcomingSlots = getUpcomingExamSlots(response.data || [], studentClassId);
        setRows(
          upcomingSlots.map((slot) => ({
            id: slot.id,
            examName: slot.examName,
            subject: slot.subjectName,
            academicYear: slot.academicYear,
            date: formatDateLabel(slot.startDate),
            startTime: formatTimeLabel(slot.startDate),
            endTime: formatTimeLabel(slot.endDate),
            status: t.statusLabels[slot.status] || slot.status
          }))
        );
      } catch (_error) {
        if (active) {
          setRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [language]);

  const totalUpcoming = useMemo(() => rows.length, [rows.length]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        rightSlot={<LanguageToggle />}
      />

      <div className="rounded-xl border border-red-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
        <span className="font-semibold text-red-700">{t.totalLabel}:</span> {totalUpcoming}
      </div>

      <Table columns={t.columns} rows={rows} loading={loading} />
    </div>
  );
}
