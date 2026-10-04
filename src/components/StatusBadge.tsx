import React from 'react';
import { Pill, PillTone } from '@/components/ui/Pill';

export type AttemptStatus = 'in_progress' | 'completed' | 'flagged';

interface StatusBadgeProps {
  status: AttemptStatus;
}

const STATUS: Record<AttemptStatus, { tone: PillTone; label: string }> = {
  completed: { tone: 'good', label: 'Completed' },
  flagged: { tone: 'flag', label: 'Flagged' },
  in_progress: { tone: 'warn', label: 'In progress' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { tone, label } = STATUS[status] ?? { tone: 'neutral' as PillTone, label: String(status) };
  return <Pill tone={tone} dot>{label}</Pill>;
}
