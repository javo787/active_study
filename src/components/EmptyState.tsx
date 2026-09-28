import React from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionText, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
      {Icon && <Icon className="w-12 h-12 text-slate-300 mb-4" />}
      <h3 className="text-lg font-medium text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">{description}</p>

      {actionText && (
        actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]"
          >
            {actionText}
          </Link>
        ) : onAction ? (
          <button
            onClick={onAction}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]"
          >
            {actionText}
          </button>
        ) : null
      )}
    </div>
  );
}
