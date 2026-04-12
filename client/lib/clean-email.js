/**
 * Filters out system-generated placeholder/garbage emails.
 *
 * When a student or teacher is created without an email, the system
 * historically stored a fake address like `student.xxxx@student.local`.
 * New records store null, but old records may still have these placeholders.
 *
 * Returns the email if it looks like a real one, otherwise returns fallback.
 */
export const cleanEmail = (email, fallback = '') => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  // Filter out known garbage domain patterns
  if (normalized.endsWith('@student.local') || normalized.endsWith('@teacher.local')) {
    return fallback;
  }

  return normalized;
};
