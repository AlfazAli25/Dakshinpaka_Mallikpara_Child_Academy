import Link from 'next/link';
import { POLICY_LAST_UPDATED, SCHOOL_INFO } from '@/lib/policy-info';

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Policy</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Terms and Conditions</h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: {POLICY_LAST_UPDATED}</p>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>
            These Terms and Conditions govern access to and use of the {SCHOOL_INFO.name} school management platform,
            including online fee payment services.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By using this platform, you agree to comply with these Terms and all applicable school rules, policies, and
              applicable Indian laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. User Responsibility</h2>
            <p>
              Parents, guardians, and students must ensure that information submitted on the platform is accurate and updated.
              Users are responsible for maintaining confidentiality of account credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Fee Payment Terms</h2>
            <p>
              School fees may be paid through approved payment modes made available on the platform. Online transactions are
              submitted through the school static QR channel and must include payment proof for verification. The school does
              not store full card details or UPI PINs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Transaction Confirmation</h2>
            <p>
              A payment is considered successful only after school accounts/admin verification and status update in the system.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Service Availability</h2>
            <p>
              While we aim to provide uninterrupted services, temporary downtime may occur for maintenance, upgrades, or
              technical issues. The school is not liable for disruptions caused by third-party network or banking systems.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Intellectual Property</h2>
            <p>
              All platform content, school data structures, and system materials are owned by or licensed to {SCHOOL_INFO.name}
              and may not be copied or reused without prior written authorization.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Changes to Terms</h2>
            <p>
              The school may revise these Terms periodically. Updated terms will be published on this page and will take effect
              from the date of publication.
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
