'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { get, getBlob, patch, post } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const Table = dynamic(() => import('@/components/Table'), { ssr: false });

const columns = [
  { key: 'studentName', label: 'Student' },
  { key: 'admissionNo', label: 'Admission No' },
  { key: 'rollNo', label: 'Roll No' },
  { key: 'classLabel', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'isFeePaid', label: 'Admit Fee Paid' },
  { key: 'isStudentEligible', label: 'Class Eligible' },
  { key: 'status', label: 'Download Status' },
  { key: 'actions', label: 'Actions' }
];

const toId = (value) => String(value?._id || value || '').trim();

const toBooleanBadge = (value) =>
  value ? (
    <span className="status-badge status-success">Yes</span>
  ) : (
    <span className="status-badge status-danger">No</span>
  );

const downloadBlob = (blob, filename) => {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
};

export default function AdminExamAdmitCardsPage() {
  const toast = useToast();
  const routeParams = useParams();
  const examIdRaw = Array.isArray(routeParams?.examId) ? routeParams.examId[0] : routeParams?.examId;
  const examId = String(examIdRaw || '').trim();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [examTitle, setExamTitle] = useState('Admit Card Management');
  const [processingCardId, setProcessingCardId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [downloadingClassZip, setDownloadingClassZip] = useState(false);

  const loadCards = async () => {
    if (!examId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const token = getToken();
      const response = await get(`/admit-cards/exam/${examId}`, token, {
        forceRefresh: true,
        cacheTtlMs: 0
      });

      const data = Array.isArray(response?.data) ? response.data : [];
      setRows(data);

      const firstExam = data[0]?.examId;
      const title = String(firstExam?.examName || '').trim();
      setExamTitle(title ? `${title} - Admit Cards` : 'Admit Card Management');
    } catch (error) {
      toast.error(error?.message || 'Failed to load admit cards');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards().catch(() => {});
  }, [examId]);

  const updateCardState = async (admitCardId, path, payload, successMessage) => {
    setProcessingCardId(admitCardId);
    try {
      const token = getToken();
      await patch(path, payload, token);
      toast.success(successMessage);
      await loadCards();
    } catch (error) {
      toast.error(error?.message || 'Failed to update admit card');
    } finally {
      setProcessingCardId('');
    }
  };

  const syncExamCards = async () => {
    if (!examId) {
      return;
    }

    setSyncing(true);
    try {
      const token = getToken();
      await post(`/admit-cards/exam/${examId}/sync`, {}, token);
      toast.success('Admit cards synchronized successfully');
      await loadCards();
    } catch (error) {
      toast.error(error?.message || 'Failed to synchronize admit cards');
    } finally {
      setSyncing(false);
    }
  };

  const classIdForZip = useMemo(() => {
    const firstRow = rows[0];
    return toId(firstRow?.classId || firstRow?.studentId?.classId);
  }, [rows]);

  const downloadClassZip = async () => {
    if (!examId || !classIdForZip) {
      return;
    }

    setDownloadingClassZip(true);
    try {
      const token = getToken();
      const blob = await getBlob(`/admit-cards/exam/${examId}/class/${classIdForZip}/download-zip`, token, {
        timeoutMs: 300000
      });

      const classInfo = rows[0]?.classId || rows[0]?.studentId?.classId || null;
      const classLabel = formatClassLabel(classInfo).replace(/[^A-Za-z0-9_-]/g, '_');
      const sectionLabel = String(classInfo?.section || '').replace(/[^A-Za-z0-9_-]/g, '_');
      const examLabel = String(examTitle || 'Exam').replace(/[^A-Za-z0-9_-]/g, '_');
      const classToken = sectionLabel ? `${classLabel || 'Class'}_${sectionLabel}` : classLabel || 'Class';
      downloadBlob(blob, `Admit_Cards_${classToken}_${examLabel || 'Exam'}.zip`);
    } catch (error) {
      toast.error(error?.message || 'Failed to download class admit cards');
    } finally {
      setDownloadingClassZip(false);
    }
  };

  const downloadAdmitCard = async (admitCard) => {
    const admitCardId = toId(admitCard);
    if (!admitCardId) {
      return;
    }

    setProcessingCardId(admitCardId);
    try {
      const token = getToken();
      const blob = await getBlob(`/admit-cards/${admitCardId}/download`, token, { timeoutMs: 120000 });

      const studentName = String(admitCard?.studentId?.userId?.name || 'Student').replace(/[^A-Za-z0-9_-]/g, '_');
      const examName = String(admitCard?.examName || admitCard?.examId?.examName || 'Exam').replace(/[^A-Za-z0-9_-]/g, '_');
      downloadBlob(blob, `Admit_Card_${studentName}_${examName}.pdf`);
    } catch (error) {
      toast.error(error?.message || 'Failed to download admit card');
    } finally {
      setProcessingCardId('');
    }
  };

  const tableRows = useMemo(
    () =>
      rows.map((item) => {
        const admitCardId = toId(item);
        const classInfo = item?.classId || item?.studentId?.classId || null;
        const classLabel = formatClassLabel(classInfo);
        const isBusy = processingCardId === admitCardId;

        return {
          id: admitCardId,
          studentName: item?.studentId?.userId?.name || '-',
          admissionNo: item?.studentId?.admissionNo || '-',
          rollNo: item?.studentId?.rollNo || '-',
          classLabel,
          section: classInfo?.section || '-',
          isFeePaid: toBooleanBadge(Boolean(item?.isFeePaid)),
          isStudentEligible: toBooleanBadge(Boolean(item?.isStudentEligible)),
          status: item?.isDownloadEnabled ? 'AVAILABLE' : 'WAITING_ELIGIBILITY',
          actions: (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  updateCardState(
                    admitCardId,
                    `/admit-cards/${admitCardId}/fee-status`,
                    { isFeePaid: !item?.isFeePaid },
                    'Admit card fee status updated'
                  )
                }
                disabled={isBusy}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {item?.isFeePaid ? 'Mark Fee Unpaid' : 'Mark Fee Paid'}
              </button>

              <button
                type="button"
                onClick={() => downloadAdmitCard(item)}
                disabled={isBusy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? 'Processing...' : 'Download'}
              </button>
            </div>
          )
        };
      }),
    [rows, processingCardId]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title={examTitle}
        description="Student download unlocks automatically when admit fee is paid for the exam class."
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadClassZip}
              disabled={downloadingClassZip || !classIdForZip}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadingClassZip ? 'Preparing ZIP...' : 'Download Class ZIP'}
            </button>

            <button
              type="button"
              onClick={syncExamCards}
              disabled={syncing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing ? 'Syncing...' : 'Sync Admit Cards'}
            </button>
          </div>
        }
      />

      <Table columns={columns} rows={tableRows} loading={loading} />
    </div>
  );
}
