import React from 'react';

type Status = 'in_progress' | 'completed' | 'flagged';

export function StatusBadge({ status }: { status: Status }) {
  const styles = {
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    flagged: 'bg-red-100 text-red-800',
  };

  const labels = {
    in_progress: 'In Progress',
    completed: 'Completed',
    flagged: 'Flagged',
  };

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
