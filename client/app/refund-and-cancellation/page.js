import Link from 'next/link';
import { POLICY_LAST_UPDATED, SCHOOL_INFO } from '@/lib/policy-info';

export default function RefundAndCancellationPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Policy</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Refund and Cancellation Policy</h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: {POLICY_LAST_UPDATED}</p>

        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>
            This policy defines refund and cancellation rules for fee payments made through the {SCHOOL_INFO.name} platform.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Cancellation of Payment</h2>
            <p>
              Once a fee payment proof is submitted for verification, cancellation by the payer is generally not permitted. For
              exceptional cases, users must contact the school office.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Eligible Cases for Refund</h2>
            <p>Refund requests may be considered in the following situations:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Duplicate payment for the same fee period.</li>
              <li>Payment debited but not reflected in student account due to technical error.</li>
              <li>Any payment mismatch verified by the school accounts department.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Non-Refundable Cases</h2>
            <p>
              Valid fee payments made toward applicable dues are generally non-refundable, except where required by applicable
              law or specifically approved by school administration.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Refund Processing Timeline</h2>
            <p>
              Approved refunds are initiated to the original payment source and are typically processed within 7 to 10 business
              days, subject to banking timelines and internal verification completion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Refund Request Process</h2>
            <p>
              Users must raise a written request with student details, transaction reference, and reason for refund by contacting
              {SCHOOL_INFO.email} or calling {SCHOOL_INFO.phone}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Payment Safety Note</h2>
            <p>
              The platform does not store sensitive payment credentials such as card numbers, CVV, or UPI PIN. Online fee
              submissions require payment proof and are reviewed by the school accounts/admin team.
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
