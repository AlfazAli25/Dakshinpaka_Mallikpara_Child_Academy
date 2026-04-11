'use client';

import ModernTable from '@/components/tables/ModernTable';

export default function Table(props) {
  return <ModernTable searchable exportable paginate {...props} />;
}