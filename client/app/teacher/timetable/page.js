"use client";

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import { get } from '@/lib/api';
import { getToken } from '@/lib/session';
import { getCurrentTeacherRecord } from '@/lib/user-records';

const columns = [
  { key: 'className', label: 'Class' },
  { key: 'day', label: 'Day' },
  { key: 'time', label: 'Time' },
  { key: 'subject', label: 'Subject' }
];

export default function TeacherTimetablePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = getToken();
        const teacher = await getCurrentTeacherRecord();
        if (!token || !teacher?._id) {
          setRows([]);
          return;
        }

        const classesRes = await get('/classes', token);
        const classRows = classesRes.data || [];

        const timetableResponses = await Promise.all(
          classRows.map(async (classItem) => {
            try {
              const timetableRes = await get(`/timetables/${classItem._id}`, token);
              return {
                className: classItem.name,
                schedule: timetableRes.data?.schedule || []
              };
            } catch (_error) {
              return { className: classItem.name, schedule: [] };
            }
          })
        );

        const mapped = timetableResponses.flatMap((item) =>
          item.schedule
            .filter((entry) => entry.teacherId?._id === teacher._id)
            .map((entry, index) => ({
              id: `${item.className}-${entry.day}-${entry.time}-${index}`,
              className: item.className,
              day: entry.day,
              time: entry.time,
              subject: entry.subjectId?.name || '-'
            }))
        );

        setRows(mapped);
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
        title="Timetable"
        description="Review your weekly class schedule and subject periods."
      />
      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}