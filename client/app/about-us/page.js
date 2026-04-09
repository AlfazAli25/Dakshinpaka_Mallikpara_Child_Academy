import Link from 'next/link';
import { SCHOOL_INFO } from '@/lib/policy-info';

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Information</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">About Us</h1>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>
            {SCHOOL_INFO.name} is a school management institution focused on academic quality, student discipline, and
            technology-enabled administration for students and parents.
          </p>

          <p>
            Our school management platform supports day-to-day academic operations including student records, attendance,
            timetable access, examination updates, and fee management.
          </p>

          <p>
            For fee payments, the platform supports static QR payment submission with screenshot upload, followed by school
            accounts/admin verification and transparent status tracking for guardians and students.
          </p>

          <p>
            We are committed to responsible data handling and maintain appropriate controls for student information such as
            names, class details, contact information, and payment records.
          </p>

          <p>
            Our mission is to make school administration reliable, transparent, and parent-friendly while ensuring students and
            families receive a secure digital experience.
          </p>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
          Return to <Link href="/" className="font-semibold text-red-700 hover:text-red-800">Homepage</Link>
        </div>
      </div>
    </div>
  );
}
