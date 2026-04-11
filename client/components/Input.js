'use client';

import FloatingInput from '@/components/forms/FloatingInput';

export default function Input({ floating = false, ...props }) {
  return <FloatingInput floating={floating} {...props} />;
}