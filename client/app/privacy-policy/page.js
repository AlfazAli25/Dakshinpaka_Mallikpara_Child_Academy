import Link from 'next/link';
import { POLICY_LAST_UPDATED, SCHOOL_INFO } from '@/lib/policy-info';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Policy</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: {POLICY_LAST_UPDATED}</p>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>
            {SCHOOL_INFO.legalName} is committed to protecting the privacy and personal information of students,
            parents, guardians, staff, and visitors who use our school management platform.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Information We Collect</h2>
            <p>
              We may collect and process student and parent information including student name, class, admission details,
              parent or guardian contact details, email address, phone number, address, attendance records, academic records,
              and school fee payment records.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Purpose of Data Collection</h2>
            <p>We use collected data for school administration, academic management, communication, and fee processing.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Payment Information</h2>
            <p>
              Online fee submission is supported through the school-approved static QR payment channel. Users submit payment
              proof (screenshot) and reference details for admin verification. We do not store debit or credit card numbers,
              CVV, UPI PIN, or banking passwords on our systems.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Data Sharing</h2>
            <p>
              We do not sell personal data. Information is shared only with authorized school staff and trusted service
              providers where necessary to run the school system, process payments, comply with legal obligations, or protect
              institutional interests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Data Security</h2>
            <p>
              We implement reasonable administrative and technical safeguards to protect personal data against unauthorized
              access, misuse, or disclosure. Users are responsible for maintaining confidentiality of login credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Retention of Information</h2>
            <p>
              We retain student, academic, and payment records as required for school operations, audit, and legal compliance.
              Records are retained only for as long as necessary under applicable policies and regulations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Contact for Privacy Queries</h2>
            <p>
              For privacy-related concerns, please contact us at {SCHOOL_INFO.email} or call {SCHOOL_INFO.phone} during office
              hours.
            </p>
          </section>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
          Return to <Link href="/" className="font-semibold text-red-700 hover:text-red-800">Homepage</Link>
        </div>
      </div>
    </div>
  );
}
