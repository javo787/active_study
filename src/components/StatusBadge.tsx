import React from 'react';

export type AttemptStatus = 'in_progress' | 'completed' | 'flagged';

interface StatusBadgeProps {
  status: AttemptStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let bgColor = 'bg-slate-100';
  let textColor = 'text-slate-800';
  let label = status as string;

  if (status === 'completed') {
    bgColor = 'bg-green-100';
    textColor = 'text-green-800';
    label = 'Completed';
  } else if (status === 'flagged') {
    bgColor = 'bg-red-100';
    textColor = 'text-red-800';
    label = 'Flagged';
  } else if (status === 'in_progress') {
    bgColor = 'bg-amber-100';
    textColor = 'text-amber-800';
    label = 'In Progress';
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
}
