"use client";

import { useEffect, useState } from 'react';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import Table from '@/components/Table';
import InfoCard from '@/components/InfoCard';
import { get } from '@/lib/api';
import { getAuthContext, getCurrentTeacherRecord } from '@/lib/user-records';

export default function TeacherDashboardPage() {
  const [stats, setStats] = useState([
    { title: 'Total Exams', value: '0' },
    { title: 'Attendance Records', value: '0' },
    { title: 'Assigned Subjects', value: '0' }
  ]);
  const [salaryRows, setSalaryRows] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [teacherProfile, setTeacherProfile] = useState(null);

  const downloadTextFile = (filename, lines) => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  useEffect(() => {
    const load = async () => {
      const teacher = await getCurrentTeacherRecord();
      const { token } = getAuthContext();
      if (!teacher || !token) {
        setTeacherProfile(null);
        setSalaryRows([]);
        setReceipts([]);
        setStats([
          { title: 'Total Exams', value: '0' },
          { title: 'Attendance Records', value: '0' },
          { title: 'Assigned Subjects', value: '0' }
        ]);
        return;
      }

      setTeacherProfile(teacher);
      const [examsRes, attendanceRes, payrollRes, receiptRes] = await Promise.all([
        get('/exams', token),
        get('/attendance', token),
        get('/payroll/my/history', token),
        get('/receipts/teacher', token)
      ]);

      setSalaryRows(
        (payrollRes.data || []).map((item) => ({
          id: item._id,
          month: item.month,
          amount: `INR ${item.amount || 0}`,
          status: item.status,
          paidOn: item.paidOn?.slice(0, 10) || '-',
          paymentMethod: item.paymentMethod || '-',
          receiptNumber: item.receiptId?.receiptNumber || '-'
        }))
      );
      setReceipts(receiptRes.data || []);

      setStats([
        { title: 'Total Exams', value: String(examsRes.data?.length || 0) },
        { title: 'Attendance Records', value: String(attendanceRes.data?.length || 0) },
        { title: 'Assigned Subjects', value: String(teacher.subjects?.length || 0) }
      ]);
    };

    load().catch(() => {
      setTeacherProfile(null);
      setStats([
        { title: 'Total Exams', value: '0' },
        { title: 'Attendance Records', value: '0' },
        { title: 'Assigned Subjects', value: '0' }
      ]);
    });
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teaching Panel"
        title="Teacher Dashboard"
        description="Review today's classes, attendance work, and exam tasks at a glance."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} />
        ))}
      </div>

      {teacherProfile && (
        <InfoCard title="Teacher Details">
          <p className="text-sm text-slate-700">Name: {teacherProfile.userId?.name || '-'}</p>
          <p className="text-sm text-slate-700">Email: {teacherProfile.userId?.email || '-'}</p>
          <p className="text-sm text-slate-700">Teacher ID: {teacherProfile.teacherId || '-'}</p>
          <p className="text-sm text-slate-700">Department: {teacherProfile.department || '-'}</p>
          <p className="text-sm text-slate-700">Qualifications: {teacherProfile.qualifications || '-'}</p>
          <p className="text-sm text-slate-700">
            Joining Date: {teacherProfile.joiningDate ? new Date(teacherProfile.joiningDate).toLocaleDateString() : '-'}
          </p>
          <p className="text-sm text-slate-700">Assigned Subjects: {teacherProfile.subjects?.length || 0}</p>
        </InfoCard>
      )}

      <div>
        <h3 className="mb-2 text-base font-semibold text-slate-900">Salary History</h3>
        <Table
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'paidOn', label: 'Paid On' },
            { key: 'paymentMethod', label: 'Method' },
            { key: 'receiptNumber', label: 'Receipt Number' }
          ]}
          rows={salaryRows}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Salary Receipts</h3>
        {receipts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No salary receipts available yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {receipts.map((receipt) => (
              <div key={receipt._id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {receipt.receiptNumber} - INR {receipt.amount} - {new Date(receipt.paymentDate).toLocaleDateString()}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(`${receipt.receiptNumber}.txt`, [
                      `Receipt Number: ${receipt.receiptNumber}`,
                      `Teacher Name: ${receipt.teacherName || '-'}`,
                      `Salary Amount: INR ${receipt.amount}`,
                      `Payment Date: ${new Date(receipt.paymentDate).toLocaleString()}`,
                      `Payment Method: ${receipt.paymentMethod}`,
                      `Pending Salary Cleared: INR ${receipt.pendingSalaryCleared || 0}`,
                      `Status: ${receipt.status}`
                    ])
                  }
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}