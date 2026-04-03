'use client';

import { useEffect, useState } from 'react';
import Table from '@/components/Table';
import PageHeader from '@/components/PageHeader';
import Input from '@/components/Input';
import { get, post } from '@/lib/api';
import { getToken } from '@/lib/session';

const columns = [
  { key: 'name', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'shift', label: 'Shift' }
];

const getInitialClassForm = () => ({
  name: '',
  section: '',
  shift: ''
});

export default function AdminClassesPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(getInitialClassForm());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadClasses = async () => {
    setLoading(true);
    try {
      const response = await get('/classes', getToken());
      setRows(
        (response.data || []).map((item) => ({
          id: item._id,
          name: item.name || '-',
          section: item.section || '-',
          shift: item.shift || '-'
        }))
      );
      setError('');
    } catch (apiError) {
      setRows([]);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const onChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCreateClass = async (event) => {
    event.preventDefault();
    const normalizedName = String(form.name || '').trim();
    if (!normalizedName) {
      setError('Class name is required.');
      setMessage('');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setError('');

    try {
      await post(
        '/classes',
        {
          name: normalizedName,
          section: String(form.section || '').trim() || undefined,
          shift: String(form.shift || '').trim() || undefined
        },
        getToken()
      );
      setForm(getInitialClassForm());
      setMessage('Class added successfully.');
      await loadClasses();
    } catch (apiError) {
      if (String(apiError.message || '').toLowerCase().includes('duplicate key')) {
        setError('Class name already exists. Please use a different class name.');
      } else {
        setError(apiError.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Classes"
        description="Configure class sections, shifts, and teacher assignments."
      />

      <form onSubmit={onCreateClass} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Add Class</h3>
        <p className="mb-4 text-sm text-slate-600">Create classes here so they are available while registering students and scheduling timetables.</p>
        {message && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Class Name *" value={form.name} onChange={onChange('name')} required className="h-11" />
          <Input label="Section" value={form.section} onChange={onChange('section')} className="h-11" placeholder="A / B" />
          <Input label="Shift" value={form.shift} onChange={onChange('shift')} className="h-11" placeholder="Morning / Day" />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Adding...' : 'Add Class'}
        </button>
      </form>

      <Table columns={columns} rows={rows} loading={loading} />
    </div>
  );
}