import Link from 'next/link';
import { SCHOOL_INFO } from '@/lib/policy-info';

export default function ContactUsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Information</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Contact Us</h1>
        <p className="mt-2 text-sm text-slate-600">For admissions, student records, fee support, and payment assistance.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">School Name</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{SCHOOL_INFO.name}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Phone</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{SCHOOL_INFO.phone}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Address</p>
          {SCHOOL_INFO.addressLines.map((line) => (
            <p key={line} className="mt-1 text-base font-medium text-slate-900">{line}</p>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Email</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{SCHOOL_INFO.email}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Office Hours</p>
            {SCHOOL_INFO.officeHours.map((slot) => (
              <p key={slot} className="mt-1 text-sm font-medium text-slate-900">{slot}</p>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Payment Support</p>
          <p className="mt-1">
            If you face any issue during online payment through Razorpay, please share the student name, class, and transaction
            reference with our accounts office for prompt assistance.
          </p>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
          Return to <Link href="/" className="font-semibold text-red-700 hover:text-red-800">Homepage</Link>
        </div>
      </div>
    </div>
  );
}
