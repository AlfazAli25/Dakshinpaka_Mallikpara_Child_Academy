'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Select from '@/components/Select';
import { get, patch } from '@/lib/api';
import { formatClassLabel } from '@/lib/class-label';
import { getToken } from '@/lib/session';
import { useToast } from '@/lib/toast-context';

const toId = (value) => String(value?._id || value || '').trim();

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-GB');
};

export default function AdmitCardFeesPage() {
  const toast = useToast();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [exams, setExams] = useState([]);
  const [admitCards, setAdmitCards] = useState([]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  // ── Loading state ─────────────────────────────────────────────────────────
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [togglingId, setTogglingId] = useState('');    // admitCard _id currently being toggled

  // ── Derived: classes available from loaded admit cards ────────────────────
  const availableClasses = useMemo(() => {
    const seen = new Map();
    admitCards.forEach((card) => {
      const cid = toId(card.classId);
      if (cid && !seen.has(cid)) {
        seen.set(cid, card.classId);
      }
    });
    return Array.from(seen.values()).sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [admitCards]);

  // ── Derived: cards filtered to selected class ─────────────────────────────
  const filteredCards = useMemo(() => {
    if (!selectedClassId) return admitCards;
    return admitCards.filter((card) => toId(card.classId) === selectedClassId);
  }, [admitCards, selectedClassId]);

  // Fee amount shown in the header banner (from first card of the exam)
  const feeAmount = useMemo(() => {
    const card = admitCards[0];
    const amount = Number(card?.admitCardFeeAmount ?? card?.examId?.admitCardFeeAmount ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }, [admitCards]);

  // Summary counts for the selected class view
  const summary = useMemo(() => {
    const total = filteredCards.length;
    const paid = filteredCards.filter((c) => c.isFeePaid).length;
    return { total, paid, unpaid: total - paid };
  }, [filteredCards]);

  // ── Load exams on mount ───────────────────────────────────────────────────
  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    try {
      const response = await get('/exams', getToken());
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setExams(list);
    } catch (err) {
      toast.error(err.message || 'Failed to load exams');
    } finally {
      setLoadingExams(false);
    }
  }, [toast]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // ── Load admit cards when exam changes ────────────────────────────────────
  const loadAdmitCards = useCallback(async (examId) => {
    if (!examId) {
      setAdmitCards([]);
      setSelectedClassId('');
      return;
    }
    setLoadingCards(true);
    setAdmitCards([]);
    setSelectedClassId('');
    try {
      const response = await get(`/admit-cards/exam/${examId}`, getToken(), { forceRefresh: true, cacheTtlMs: 0 });
      setAdmitCards(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load admit cards');
    } finally {
      setLoadingCards(false);
    }
  }, [toast]);

  const onExamChange = (e) => {
    const id = e.target.value;
    setSelectedExamId(id);
    loadAdmitCards(id);
  };

  const onClassChange = (e) => {
    setSelectedClassId(e.target.value);
  };

  // ── Toggle paid/unpaid ────────────────────────────────────────────────────
  const toggleFeeStatus = useCallback(async (card) => {
    const cardId = toId(card._id);
    if (!cardId || togglingId) return;

    const nextStatus = !card.isFeePaid;
    setTogglingId(cardId);

    try {
      await patch(`/admit-cards/${cardId}/fee-status`, { isFeePaid: nextStatus }, getToken());
      // Optimistically update the local state
      setAdmitCards((prev) =>
        prev.map((c) => toId(c._id) === cardId ? { ...c, isFeePaid: nextStatus } : c)
      );
      toast.success(
        nextStatus
          ? `Marked as Paid for ${card.studentId?.userId?.name || 'student'}`
          : `Marked as Unpaid for ${card.studentId?.userId?.name || 'student'}`
      );
    } catch (err) {
      toast.error(err.message || 'Failed to update fee status');
    } finally {
      setTogglingId('');
    }
  }, [toast, togglingId]);

  // ── Mark all in view paid / unpaid ───────────────────────────────────────
  const markAll = useCallback(async (paid) => {
    const targets = filteredCards.filter((c) => c.isFeePaid !== paid);
    if (targets.length === 0) {
      toast.success(`All students already marked as ${paid ? 'Paid' : 'Unpaid'}`);
      return;
    }
    setTogglingId('__all__');
    let successCount = 0;
    for (const card of targets) {
      const cardId = toId(card._id);
      try {
        await patch(`/admit-cards/${cardId}/fee-status`, { isFeePaid: paid }, getToken());
        setAdmitCards((prev) =>
          prev.map((c) => toId(c._id) === cardId ? { ...c, isFeePaid: paid } : c)
        );
        successCount += 1;
      } catch {
        // continue with others
      }
    }
    setTogglingId('');
    toast.success(`Updated ${successCount} student(s) to ${paid ? 'Paid' : 'Unpaid'}`);
  }, [filteredCards, toast]);

  // ── Exam options ──────────────────────────────────────────────────────────
  const examOptions = useMemo(() => [
    { value: '', label: loadingExams ? 'Loading exams...' : 'Select Exam' },
    ...exams.map((e) => ({
      value: toId(e._id),
      label: `${String(e.examName || 'Exam')}${e.academicYear ? ` (${e.academicYear})` : ''}`
    }))
  ], [exams, loadingExams]);

  const classOptions = useMemo(() => [
    { value: '', label: 'All Classes' },
    ...availableClasses.map((c) => ({
      value: toId(c._id),
      label: formatClassLabel(c)
    }))
  ], [availableClasses]);

  const selectedExamLabel = useMemo(() => {
    const exam = exams.find((e) => toId(e._id) === selectedExamId);
    return exam ? `${exam.examName || 'Exam'}${exam.academicYear ? ` (${exam.academicYear})` : ''}` : '';
  }, [exams, selectedExamId]);

  const isBusy = togglingId !== '';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Admit Card Fee Payments"
        description="Select an exam to view and manage admit card fee payment status for each student."
      />

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Select Exam &amp; Class</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Exam"
            value={selectedExamId}
            onChange={onExamChange}
            options={examOptions}
            className="h-11"
            disabled={loadingExams}
          />
          <Select
            label="Class"
            value={selectedClassId}
            onChange={onClassChange}
            options={classOptions}
            className="h-11"
            disabled={!selectedExamId || loadingCards || availableClasses.length === 0}
          />
        </div>
      </div>

      {/* ── Info Banner when exam selected ───────────────────────────────────── */}
      {selectedExamId && !loadingCards && admitCards.length > 0 && (
        <div className="animate-fade-up rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-4">
              <span>
                <strong>Exam:</strong> {selectedExamLabel}
              </span>
              <span>
                <strong>Fee Per Student:</strong>{' '}
                {feeAmount > 0 ? `INR ${feeAmount}` : <span className="text-green-700 font-semibold">Free (No fee required)</span>}
              </span>
              <span>
                <strong>Showing:</strong> {summary.total} student{summary.total !== 1 ? 's' : ''} &nbsp;·&nbsp;
                <span className="text-green-700 font-semibold">{summary.paid} Paid</span> &nbsp;·&nbsp;
                <span className="text-red-600 font-semibold">{summary.unpaid} Unpaid</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => markAll(true)}
                disabled={isBusy || summary.unpaid === 0}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy && togglingId === '__all__' ? 'Updating...' : 'Mark All Paid'}
              </button>
              <button
                type="button"
                onClick={() => markAll(false)}
                disabled={isBusy || summary.paid === 0}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy && togglingId === '__all__' ? 'Updating...' : 'Mark All Unpaid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────────── */}
      {loadingCards && (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 shadow-sm">
          <p className="text-sm text-slate-500">Loading admit cards...</p>
        </div>
      )}

      {/* ── No exam selected ──────────────────────────────────────────────────── */}
      {!selectedExamId && !loadingCards && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <div className="mb-3 text-4xl">🎫</div>
          <p className="text-sm font-medium text-slate-700">Select an exam to manage admit card fee payments</p>
          <p className="mt-1 text-xs text-slate-500">Once you select an exam, all enrolled students will appear below with their payment status.</p>
        </div>
      )}

      {/* ── Exam selected but no admit cards ──────────────────────────────────── */}
      {selectedExamId && !loadingCards && admitCards.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50 py-16 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <p className="text-sm font-medium text-amber-800">No admit cards found for this exam</p>
          <p className="mt-1 text-xs text-amber-700">Use the Exams page to sync admit cards for this exam first, then return here.</p>
        </div>
      )}

      {/* ── Student Table ─────────────────────────────────────────────────────── */}
      {!loadingCards && filteredCards.length > 0 && (
        <div className="animate-fade-up rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Roll No</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Admission No</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Student Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Class</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Fee Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCards.map((card) => {
                  const cardId = toId(card._id);
                  const student = card.studentId || {};
                  const name = student?.userId?.name || '-';
                  const rollNo = student?.rollNo || '-';
                  const admissionNo = student?.admissionNo || '-';
                  const classInfo = card.classId || student?.classId;
                  const classLabel = formatClassLabel(classInfo);
                  const cardFee = Number(card.admitCardFeeAmount ?? 0);
                  const isToggling = togglingId === cardId;
                  const isFree = cardFee <= 0;

                  return (
                    <tr
                      key={cardId}
                      className={`transition-colors hover:bg-slate-50 ${card.isFeePaid ? '' : 'bg-red-50/40'}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700">{rollNo}</td>
                      <td className="px-4 py-3 text-slate-600">{admissionNo}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
                      <td className="px-4 py-3 text-slate-600">{classLabel || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {isFree ? (
                          <span className="text-xs text-green-700 font-semibold">Free</span>
                        ) : (
                          `INR ${cardFee}`
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isFree ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                            ✓ Free / Paid
                          </span>
                        ) : card.isFeePaid ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                            ✓ Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                            ✕ Unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isFree ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => toggleFeeStatus(card)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              card.isFeePaid
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {isToggling
                              ? 'Updating...'
                              : card.isFeePaid
                                ? 'Mark Unpaid'
                                : 'Mark Paid'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Footer summary ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-600">
              Showing <strong>{filteredCards.length}</strong> student{filteredCards.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-4 text-xs font-semibold">
              <span className="text-green-700">{summary.paid} Paid</span>
              <span className="text-red-600">{summary.unpaid} Unpaid</span>
              {feeAmount > 0 && (
                <span className="text-slate-600">
                  Total collected: INR {summary.paid * feeAmount}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
