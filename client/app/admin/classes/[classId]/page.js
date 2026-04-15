'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import { get, getBlob } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const columns = [
  { key: 'admissionNo', label: 'Admission No' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'guardianContact', label: 'Guardian Contact' },
  { key: 'attendance', label: 'Attendance' }
];

export default function AdminClassStudentsPage() {
  const params = useParams();
  const classId = String(params?.classId || '');
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [classLabel, setClassLabel] = useState('Class');
  const [rows, setRows] = useState([]);
  const [downloadingIdCardsZip, setDownloadingIdCardsZip] = useState(false);

  const downloadBlob = (blob, filename) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const onDownloadIdCardsZip = async () => {
    if (!classId) {
      return;
    }

    const token = getToken();
    if (!token) {
      return;
    }

    setDownloadingIdCardsZip(true);
    try {
      const blob = await getBlob(`/id-cards/class/${classId}/download-zip`, token, {
        timeoutMs: 300000
      });

      const safeClassLabel = String(classLabel || 'Class').replace(/[^A-Za-z0-9_-]/g, '_') || 'Class';
      downloadBlob(blob, `Class_${safeClassLabel}_ID_Cards.zip`);
    } catch (apiError) {
      toast.error(apiError?.message || 'Failed to download class ID cards');
    } finally {
      setDownloadingIdCardsZip(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!classId) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const token = getToken();
        const [classResponse, studentResponse] = await Promise.all([
          get(`/classes/${classId}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          }),
          get(`/students/class/${classId}`, token, {
            forceRefresh: true,
            cacheTtlMs: 0
          })
        ]);

        const classItem = classResponse.data || null;
        setClassLabel(formatClassLabel(classItem, 'Class'));

        setRows(
          (studentResponse.data || []).map((item) => ({
            id: String(item._id),
            admissionNo: item.admissionNo || '-',
            name: item.userId?.name || '-',
            email: item.userId?.email || '-',
            guardianContact: item.guardianContact || '-',
            attendance: `${Number(item.attendance || 0)}%`
          }))
        );
      } catch (apiError) {
        toast.error(apiError.message);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [classId, toast]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={`${classLabel} Students`}
        description="All registered students for this class."
        rightSlot={
          <button
            type="button"
            onClick={onDownloadIdCardsZip}
            disabled={loading || downloadingIdCardsZip || rows.length === 0}
            className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingIdCardsZip ? 'Preparing ZIP...' : 'Download Class ID Cards (ZIP)'}
          </button>
        }
      />

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        getRowHref={(row) => `/admin/students/${row.id}`}
      />
    </div>
  );
}
