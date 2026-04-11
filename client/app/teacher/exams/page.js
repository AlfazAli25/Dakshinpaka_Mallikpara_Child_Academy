"use client";

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';

const columns = [
  { key: 'examName', label: 'Exam Name' },
  { key: 'className', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'academicYear', label: 'Academic Year' },
  { key: 'date', label: 'Date' },
  { key: 'startTime', label: 'Start Time' },
  { key: 'endTime', label: 'End Time' },
  { key: 'status', label: 'Status' }
];

const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const toDateLabel = (date) => {
  if (!date) {
    return '-';
  }

  return date.toLocaleDateString('en-GB');
};

const toTimeLabel = (date) => {
  if (!date) {
    return '-';
  }

  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getExamWindow = (exam) => {
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  const slots = scheduleRows
    .map((slot) => ({
      start: toValidDate(slot?.startDate),
      end: toValidDate(slot?.endDate)
    }))
    .filter((slot) => slot.start && slot.end);

  if (slots.length > 0) {
    const earliestStart = new Date(Math.min(...slots.map((slot) => slot.start.getTime())));
    const latestEnd = new Date(Math.max(...slots.map((slot) => slot.end.getTime())));
    return {
      startDate: earliestStart,
      endDate: latestEnd
    };
  }

  const fallbackStartDate = toValidDate(exam?.startDate || exam?.date || exam?.examDate);
  const fallbackEndDate = toValidDate(exam?.endDate) || fallbackStartDate;

  return {
    startDate: fallbackStartDate,
    endDate: fallbackEndDate
  };
};

const getDerivedStatus = ({ startDate, endDate }) => {
  const now = Date.now();

  if (!startDate || !endDate) {
    return 'Scheduled';
  }

  if (now < startDate.getTime()) {
    return 'Scheduled';
  }

  if (now > endDate.getTime()) {
    return 'Completed';
  }

  return 'Ongoing';
};

export default function TeacherExamsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const teacher = await getCurrentTeacherRecord();
        const { token } = getAuthContext();
        if (!teacher || !token) {
          setRows([]);
          return;
        }

        const response = await get('/exams', token);
        setRows(
          (response.data || []).map((item) => {
            const examWindow = getExamWindow(item);

            return {
              id: item._id,
              examName: item.examName || item.description || '-',
              className: formatClassLabel(item.classId),
              section: item?.classId?.section || '-',
              subjects:
                (item.subjects || [])
                  .map((subject) => subject?.name || subject?.code)
                  .filter(Boolean)
                  .join(', ') || '-',
              academicYear: item.academicYear || '-',
              date: toDateLabel(examWindow.startDate),
              startTime: toTimeLabel(examWindow.startDate),
              endTime: toTimeLabel(examWindow.endDate),
              status: getDerivedStatus(examWindow)
            };
          })
        );
      } catch (_error) {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Exams"
        description="View your upcoming and completed exams for assigned classes and subjects."
      />
      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}